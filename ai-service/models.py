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
        description="Codes already in the database (for duplicate detection)"
    )
    tenantId: Optional[str] = None


class ValidationIssue(BaseModel):
    """A single validation issue."""
    rowNumber: int
    field: str
    message: str
    severity: ErrorSeverity
    fixable: bool = False
    suggestedFix: Optional[str] = None
    category: str = "General"


class RowResult(BaseModel):
    """Validation result for a single row."""
    rowNumber: int
    status: str  # "valid" | "warning" | "error" | "duplicate"
    issues: List[ValidationIssue] = Field(default_factory=list)
    data: Dict[str, Any] = Field(default_factory=dict)


class ValidationResponse(BaseModel):
    """Full validation response."""
    dimensionType: str
    totalRows: int
    validRows: int
    warningRows: int
    errorRows: int
    duplicateRows: int
    issues: List[ValidationIssue]
    rowResults: List[RowResult]
    summary: str
    processingTimeMs: float
