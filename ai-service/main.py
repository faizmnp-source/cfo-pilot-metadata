"""
CFO Pilot — AI Validation Microservice
FastAPI service that validates metadata imports before they reach the database.

Endpoints:
  POST /validate   — Full validation with AI-enhanced checks
  GET  /health     — Health check
  GET  /rules      — List validation rules for a dimension type
"""

import time
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

from models import (
    ValidationRequest,
    ValidationResponse,
    DimensionType,
    ErrorSeverity,
)
from validators import (
    validate_accounts,
    validate_hierarchy_dimension,
)

# ─── Setup ───────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CFO Pilot AI Validation Service",
    description="AI-powered metadata validation for the CFO Pilot Finance OS",
    version="1.0.0",
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


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "cfo-pilot-ai-validator", "version": "1.0.0"}


@app.get("/rules/{dimension_type}")
def get_rules(dimension_type: str):
    """Returns the validation rules applied for a dimension type."""
    base_rules = [
        {"id": "code_required", "description": "Code is required", "severity": "error"},
        {"id": "code_format", "description": "Code must be alphanumeric (A-Z, 0-9, -, _, .)", "severity": "error"},
        {"id": "code_length", "description": "Code must be 20 characters or less", "severity": "error"},
        {"id": "name_required", "description": "Name is required", "severity": "error"},
        {"id": "duplicate_code_file", "description": "Codes must be unique within the import file", "severity": "error"},
        {"id": "duplicate_code_db", "description": "Existing records will be updated (upsert)", "severity": "warning"},
        {"id": "circular_hierarchy", "description": "Parent-child references must not form cycles", "severity": "error"},
        {"id": "missing_parent", "description": "Parent codes must exist in file or database", "severity": "warning"},
        {"id": "similar_names", "description": "Names that are very similar to others are flagged", "severity": "warning"},
    ]

    account_rules = [
        {"id": "account_type_required", "description": "Account type is required (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE)", "severity": "error"},
        {"id": "account_type_valid", "description": "Account type must be one of the 5 valid types", "severity": "error"},
    ]

    if dimension_type.upper() == "ACCOUNT":
        return {"dimensionType": dimension_type, "rules": base_rules + account_rules}
    return {"dimensionType": dimension_type, "rules": base_rules}


@app.post("/validate", response_model=ValidationResponse)
def validate(
    request: ValidationRequest,
    x_tenant_id: Optional[str] = Header(default=None),
):
    """
    Main validation endpoint.

    Performs:
    1. Required field checks
    2. Format validation
    3. Duplicate detection (within file and vs existing DB codes)
    4. Circular hierarchy detection
    5. Missing parent reference checks
    6. AI-enhanced similarity detection for fuzzy duplicates
    7. Auto-fix suggestions
    """
    start = time.time()
    logger.info(
        f"Validating {len(request.rows)} rows of type {request.dimensionType} "
        f"(tenant={x_tenant_id})"
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
            processingTimeMs=0,
        )

    existing_codes = set(c.upper() for c in request.existingCodes)
    rows = [r.dict() for r in request.rows]

    # Dispatch to dimension-specific validator
    dim = request.dimensionType
    if dim == DimensionType.ACCOUNT:
        issues, row_results = validate_accounts(rows, existing_codes)
    elif dim in (DimensionType.ENTITY, DimensionType.DEPARTMENT, DimensionType.COST_CENTER):
        dim_label = dim.value.replace("_", " ").title()
        issues, row_results = validate_hierarchy_dimension(rows, existing_codes, dim_label)
    else:
        # Generic validation for other dimension types
        issues, row_results = validate_hierarchy_dimension(rows, existing_codes, dim.value)

    # Aggregate counts
    valid_rows = sum(1 for r in row_results if r.status == "valid")
    warning_rows = sum(1 for r in row_results if r.status == "warning")
    error_rows = sum(1 for r in row_results if r.status == "error")
    duplicate_rows = sum(1 for r in row_results if r.status == "duplicate")
    total_rows = len(row_results)

    error_count = sum(1 for i in issues if i.severity == ErrorSeverity.error)
    warning_count = sum(1 for i in issues if i.severity == ErrorSeverity.warning)

    # Summary
    if error_count == 0 and warning_count == 0:
        summary = f"✅ All {total_rows} rows passed validation."
    elif error_count == 0:
        summary = f"⚠️ {total_rows} rows validated with {warning_count} warning(s). Import can proceed."
    else:
        summary = (
            f"❌ Found {error_count} error(s) and {warning_count} warning(s) in "
            f"{total_rows} rows. Fix errors before importing."
        )

    elapsed = round((time.time() - start) * 1000, 1)
    logger.info(f"Validation complete in {elapsed}ms — {error_count} errors, {warning_count} warnings")

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


# ─── Entrypoint ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
