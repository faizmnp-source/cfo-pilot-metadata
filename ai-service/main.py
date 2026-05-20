"""
CFO Pilot — AI Validation Microservice
FastAPI service that validates metadata imports before they reach the database.

Endpoints:
  POST /validate          — Full validation with AI-enhanced checks
  POST /fix               — Apply a one-click fix action to a row
  GET  /health            — Health check
  GET  /rules/{dim_type}  — List validation rules for a dimension type
"""

import re
import time
import logging
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

from models import (
    DimensionType,
    ErrorSeverity,
    FixRequest,
    FixResponse,
    ValidationRequest,
    ValidationResponse,
)
from validators import (
    validate_accounts,
    validate_hierarchy_dimension,
    validate_dimension,
    VALID_ACCOUNT_TYPES,
    VALID_SCENARIO_TYPES,
    VALID_PERIOD_TYPES,
    VALID_EMPLOYEE_CATEGORY_TYPES,
)

# ─── Setup ───────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CFO Pilot AI Validation Service",
    description="AI-powered metadata validation for the CFO Pilot Finance OS",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: restrict to your app domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Rules registry ──────────────────────────────────────────────────────────

_BASE_RULES = [
    {"id": "code_required",       "description": "Code is required",                                                       "severity": "error"},
    {"id": "code_format",         "description": "Code must be alphanumeric (A-Z, 0-9, -, _, .) max 50 chars",            "severity": "error"},
    {"id": "name_required",       "description": "Name is required",                                                       "severity": "error"},
    {"id": "duplicate_code_file", "description": "Codes must be unique within the import file",                            "severity": "error"},
    {"id": "duplicate_code_db",   "description": "Existing records will be updated (upsert)",                              "severity": "warning"},
    {"id": "similar_names",       "description": "Names with >90% similarity to others are flagged",                       "severity": "warning"},
    {"id": "circular_hierarchy",  "description": "Parent-child references must not form cycles",                           "severity": "error"},
    {"id": "missing_parent",      "description": "Parent codes must exist in file or database",                            "severity": "warning"},
]

_DIMENSION_EXTRA_RULES: Dict[str, List[Dict[str, str]]] = {
    "ACCOUNT": [
        {"id": "account_type_required", "description": "accountType is required (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE)", "severity": "error"},
        {"id": "account_type_valid",    "description": "accountType must be one of the 5 valid types",                     "severity": "error"},
    ],
    "SCENARIO": [
        {"id": "scenario_type_valid",   "description": f"scenarioType must be one of: {', '.join(sorted(VALID_SCENARIO_TYPES))}", "severity": "error"},
        {"id": "fiscal_year_range",     "description": "fiscalYear must be between 2000 and 2099",                         "severity": "error"},
    ],
    "CURRENCY": [
        {"id": "currency_code_iso",     "description": "Currency code must be exactly 3 uppercase letters (ISO 4217)",     "severity": "error"},
        {"id": "exchange_rate_positive","description": "exchangeRate must be a positive number",                            "severity": "error"},
    ],
    "TIME": [
        {"id": "period_type_valid",     "description": f"periodType must be one of: {', '.join(sorted(VALID_PERIOD_TYPES))}", "severity": "error"},
        {"id": "date_order",            "description": "startDate must be before endDate",                                  "severity": "error"},
        {"id": "date_format",           "description": "startDate and endDate must be in YYYY-MM-DD format",                "severity": "error"},
        {"id": "fiscal_year_range",     "description": "fiscalYear must be between 2000 and 2099",                         "severity": "error"},
    ],
    "PRODUCT_SERVICE": [
        {"id": "unit_price_non_negative","description": "unitPrice if provided must be >= 0",                              "severity": "error"},
    ],
    "EMPLOYEE_CATEGORY": [
        {"id": "employee_category_type_valid", "description": f"categoryType if provided must be: {', '.join(sorted(VALID_EMPLOYEE_CATEGORY_TYPES))}", "severity": "error"},
    ],
    "DOCTOR_CATEGORY": [
        {"id": "billable_rate_non_negative", "description": "billableRate if provided must be >= 0",                       "severity": "error"},
    ],
}


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> Dict[str, str]:
    """Service liveness probe."""
    return {"status": "ok", "service": "cfo-pilot-ai-validator", "version": "2.0.0"}


@app.get("/rules/{dimension_type}")
def get_rules(dimension_type: str) -> Dict[str, Any]:
    """
    Return the full set of validation rules applied to a given dimension type.

    Combines base rules (shared by all dimensions) with any dimension-specific
    rules. Returns HTTP 400 for unrecognised dimension types.
    """
    dim = dimension_type.upper()
    try:
        DimensionType(dim)
    except ValueError:
        valid = [d.value for d in DimensionType]
        raise HTTPException(
            status_code=400,
            detail=f"Unknown dimension type '{dimension_type}'. Valid types: {valid}",
        )

    extra = _DIMENSION_EXTRA_RULES.get(dim, [])
    return {
        "dimensionType": dim,
        "rules": _BASE_RULES + extra,
        "totalRules": len(_BASE_RULES) + len(extra),
    }


@app.post("/validate", response_model=ValidationResponse)
def validate(
    request: ValidationRequest,
    x_tenant_id: Optional[str] = Header(default=None),
) -> ValidationResponse:
    """
    Main validation endpoint.

    Performs for all 10 dimension types:
      1. Required field checks (code + name)
      2. Code format validation (alphanumeric + [-_.], max 50 chars)
      3. Duplicate detection within file (error)
      4. Duplicate detection against existing DB codes (warning/duplicate)
      5. Fuzzy name similarity detection (SequenceMatcher ratio > 0.9)
      6. Circular hierarchy detection
      7. Missing parent reference checks
      8. Dimension-specific field validations
      9. AI fix suggestions and fix action codes per issue

    Supported dimension types:
      ACCOUNT, ENTITY, DEPARTMENT, COST_CENTER, SCENARIO, CURRENCY,
      TIME, PRODUCT_SERVICE, EMPLOYEE_CATEGORY, DOCTOR_CATEGORY
    """
    start = time.time()
    logger.info(
        "Validating %d rows of type %s (tenant=%s)",
        len(request.rows),
        request.dimensionType,
        x_tenant_id,
    )

    if not request.rows:
        return ValidationResponse(
            dimensionType=request.dimensionType,
            totalRows=0,
            validRows=0,
            warningRows=0,
            errorRows=0,
            duplicateRows=0,
            issues=[],
            rowResults=[],
            summary="No rows to validate.",
            processingTimeMs=0.0,
        )

    existing_codes = {c.upper() for c in request.existingCodes}
    rows = [r.dict() for r in request.rows]

    # Dispatch through unified validator
    issues, row_results = validate_dimension(rows, existing_codes, request.dimensionType.value)

    # Aggregate counts
    valid_rows     = sum(1 for r in row_results if r.status == "valid")
    warning_rows   = sum(1 for r in row_results if r.status == "warning")
    error_rows     = sum(1 for r in row_results if r.status == "error")
    duplicate_rows = sum(1 for r in row_results if r.status == "duplicate")
    total_rows     = len(row_results)

    error_count   = sum(1 for i in issues if i.severity == ErrorSeverity.error)
    warning_count = sum(1 for i in issues if i.severity == ErrorSeverity.warning)

    if error_count == 0 and warning_count == 0:
        summary = f"All {total_rows} rows passed validation."
    elif error_count == 0:
        summary = (
            f"{total_rows} rows validated with {warning_count} warning(s). "
            "Import can proceed."
        )
    else:
        summary = (
            f"Found {error_count} error(s) and {warning_count} warning(s) in "
            f"{total_rows} rows. Fix errors before importing."
        )

    elapsed = round((time.time() - start) * 1000, 1)
    logger.info("Validation complete in %sms — %d errors, %d warnings", elapsed, error_count, warning_count)

    return ValidationResponse(
        dimensionType=request.dimensionType,
        totalRows=total_rows,
        validRows=valid_rows,
        warningRows=warning_rows,
        errorRows=error_rows,
        duplicateRows=duplicate_rows,
        issues=issues,
        rowResults=row_results,
        summary=summary,
        processingTimeMs=elapsed,
    )


@app.post("/fix", response_model=FixResponse)
def apply_fix(request: FixRequest) -> FixResponse:
    """
    Apply a one-click fix action to a row's data dict.

    Supported fix actions
    ---------------------
    remove_parent
        Clears parentId and parentCode fields from rowData.

    rename_code
        Appends '-2' to the code field (or increments the numeric suffix
        if the code already ends with a dash-number pattern).

    rename_name
        Appends ' - Copy' qualifier to the name field to make it distinct.

    set_default_type
        Sets the appropriate *Type field to the most common valid value
        for the given dimension:
          ACCOUNT          → accountType  = ASSET
          SCENARIO         → scenarioType = BUDGET
          TIME             → periodType   = MONTH
          EMPLOYEE_CATEGORY→ categoryType = FULL_TIME

    swap_dates
        Swaps the values of startDate and endDate.

    manual
        Returns rowData unchanged; requires human review.

    Returns the corrected data dict along with a description of what changed.
    """
    action = request.fixAction.lower()
    data: Dict[str, Any] = dict(request.rowData)
    dim = (request.dimensionType or "").upper()
    applied = True
    description = ""

    if action == "remove_parent":
        data.pop("parentId", None)
        data.pop("parentCode", None)
        description = "Removed parentId and parentCode fields from the row."

    elif action == "rename_code":
        current_code: str = str(data.get("code", ""))
        # If code ends with -<number>, increment; otherwise append -2
        suffix_match = re.match(r"^(.*)-(\d+)$", current_code)
        if suffix_match:
            base, num = suffix_match.group(1), int(suffix_match.group(2))
            data["code"] = f"{base}-{num + 1}"
        else:
            data["code"] = f"{current_code}-2"
        description = f"Renamed code from '{current_code}' to '{data['code']}'."

    elif action == "rename_name":
        current_name: str = str(data.get("name", ""))
        # If already has a qualifier suffix, increment it
        suffix_match = re.match(r"^(.*) - Copy(?: (\d+))?$", current_name)
        if suffix_match:
            base = suffix_match.group(1)
            num = int(suffix_match.group(2) or 1)
            data["name"] = f"{base} - Copy {num + 1}"
        else:
            data["name"] = f"{current_name} - Copy"
        description = f"Renamed name from '{current_name}' to '{data['name']}'."

    elif action == "set_default_type":
        field_name = request.field or ""

        _defaults: Dict[str, Dict[str, Any]] = {
            "ACCOUNT":           {"accountType":  "ASSET"},
            "SCENARIO":          {"scenarioType": "BUDGET"},
            "TIME":              {"periodType":   "MONTH"},
            "EMPLOYEE_CATEGORY": {"categoryType": "FULL_TIME"},
        }

        if dim in _defaults:
            for f, v in _defaults[dim].items():
                if not data.get(f) or field_name in ("", f):
                    data[f] = v
                    description = f"Set '{f}' to default value '{v}'."
                    break
            else:
                description = "No type field to set for this dimension."
                applied = False
        else:
            description = f"No default type configured for dimension '{dim}'. Manual review required."
            applied = False

    elif action == "swap_dates":
        start = data.get("startDate")
        end = data.get("endDate")
        if start is not None and end is not None:
            data["startDate"], data["endDate"] = end, start
            description = f"Swapped startDate ('{end}') and endDate ('{start}')."
        else:
            description = "Could not swap dates: one or both date fields are missing."
            applied = False

    elif action == "manual":
        description = "This issue requires manual review. No automatic fix was applied."
        applied = False

    else:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown fix action '{request.fixAction}'. "
                "Valid actions: remove_parent, rename_code, rename_name, "
                "set_default_type, swap_dates, manual"
            ),
        )

    logger.info("Fix applied: action=%s dim=%s applied=%s", action, dim, applied)

    return FixResponse(
        fixAction=action,
        applied=applied,
        correctedData=data,
        description=description,
    )


# ─── Entrypoint ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
