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
    status: str  # "valid" | "warning" | "error" | "duplicate"
    issues: List[ValidationIssue] = Field(default_factory=list)
    data: Dict[str, Any] = Field(default_factory=dict)
    # Enhanced summary fields
    errorCount: int = 0
    warningCount: int = 0
    issueIds: List[str] = Field(default_factory=list)


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


# ─── Fix endpoint models ──────────────────────────────────────────────────────

class FixRequest(BaseModel):
    """Request body for the /fix endpoint."""
    issueId: Optional[str] = Field(
        default=None,
        description="Identifier of the issue being fixed (informational)",
    )
    fixAction: str = Field(
        description=(
            "Action to apply: "
            "remove_parent | rename_code | rename_name | "
            "set_default_type | swap_dates | manual"
        ),
    )
    rowData: Dict[str, Any] = Field(
        description="The current row data dict to be fixed",
    )
    dimensionType: Optional[str] = Field(
        default=None,
        description="Dimension type context, used by set_default_type",
    )
    field: Optional[str] = Field(
        default=None,
        description="The field name that triggered this fix (for targeted actions)",
    )


class FixResponse(BaseModel):
    """Response body for the /fix endpoint."""
    fixAction: str
    applied: bool
    correctedData: Dict[str, Any]
    description: str
