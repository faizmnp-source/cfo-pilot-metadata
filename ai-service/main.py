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
      4. Duplicate detection against existing DB codes (warning/