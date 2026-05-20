"""Pydantic models for the AI validation service."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class ErrorSeverity(str, Enum):
    error = "error"
    warning = "warning"
    info = "info"


class DimensionType(str, Enum):
    ACCOUNT = "ACCOUNT"
    ENTITY = "ENTITY"
    DEPARTMENT = "DEPARTMENT"
    COST_CENTER = "COST_CENTER"
    CURRENCY = "CURRENCY"
    SCENARIO = "SCENARIO"
    TIME = "TIME"
    PRODUCT_SERVICE = "PRODUCT_SERVICE"
    EMPLOYEE_CATEGORY = "EMPLOYEE_CATEGORY"
    DOCTOR_CATEGORY = "DOCTOR_CATEGORY"


class ImportRow(BaseModel):
    """A single row from the import file."""
    rowNumber: int
    data: Dict[str, Any]


class ValidationRequest(BaseModel):
    """Request payload for validation."""
    dimensionType: DimensionType
    rows: List[ImportRow]
    existingCodes: List[str] = Field(
        default_factory=list,
        description="Codes already in the database (for duplicate detection)",
    )
    tenantId: Optional[str] = None


class ValidationIssue(BaseModel):
    """A single validation issue with AI fix guidance."""
    rowNumber: int
    field: str
    message: str
    severity: ErrorSeverity
    fixable: bool = False
    suggestedFix: Optional[str] = None
    category: str = "General"
    # Enhanced fields
    fixSuggestion: Optional[str] = Field(
        default=None,
        description="Human-readable AI suggestion for resolving this issue",
    )
    fixAction: Optional[str] = Field(
        default=None,
        description=(
            "Machine-readable action key: "
            "remove_parent | rename_code | rename_name | "
            "set_default_type | swap_dates | manual"
        ),
    )


class RowResult(BaseModel):
    """Validation result for a single row."""
    rowNumber: int
    status: str  # "valid" |