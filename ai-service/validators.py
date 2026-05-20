"""
Core validation logic for all 10 dimension types.

Supports: ACCOUNT, ENTITY, DEPARTMENT, COST_CENTER, SCENARIO, CURRENCY,
          TIME, PRODUCT_SERVICE, EMPLOYEE_CATEGORY, DOCTOR_CATEGORY

Each validator runs:
  - Required field checks (code + name always required)
  - Code format validation (alphanumeric + [-_.], max 50 chars)
  - Duplicate detection within file
  - Duplicate detection against existing DB codes (warning)
  - Fuzzy duplicate name detection (SequenceMatcher ratio > 0.9)
  - Missing parent reference checks
  - Circular hierarchy detection
  - Dimension-specific field validations

Each issue carries a fixSuggestion (human-readable) and a fixAction
(machine-readable action identifier for the /fix endpoint).
"""

from __future__ import annotations

import re
import uuid
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Set, Tuple

from models import ErrorSeverity, RowResult, ValidationIssue

# ─── Constants ───────────────────────────────────────────────────────────────

VALID_ACCOUNT_TYPES = {"ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"}
VALID_SCENARIO_TYPES = {"BUDGET", "FORECAST", "ACTUALS", "ROLLING_FORECAST", "STRESS_TEST"}
VALID_PERIOD_TYPES = {"YEAR", "QUARTER", "MONTH", "WEEK", "DAY"}
VALID_EMPLOYEE_CATEGORY_TYPES = {"FULL_TIME", "PART_TIME", "CONTRACT", "CONSULTANT", "INTERN"}

FISCAL_YEAR_MIN = 2000
FISCAL_YEAR_MAX = 2099

CODE_FORMAT_RE = re.compile(r"^[A-Z0-9\-_\.]+$")
CURRENCY_CODE_RE = re.compile(r"^[A-Z]{3}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

NAME_SIMILARITY_THRESHOLD = 0.9
CODE_MAX_LENGTH = 50


# ─── Issue factory ───────────────────────────────────────────────────────────

def _issue(
    row: int,
    field: str,
    message: str,
    severity: ErrorSeverity = ErrorSeverity.error,
    fixable: bool = False,
    suggested_fix: Optional[str] = None,
    category: str = "General",
    fix_suggestion: Optional[str] = None,
    fix_action: Optional[str] = None,
) -> ValidationIssue:
    """Create a ValidationIssue with optional AI fix suggestion and fix action."""
    return ValidationIssue(
        rowNumber=row,
        field=field,
        message=message,
        severity=severity,
        fixable=fixable,
        suggestedFix=suggested_fix,
        category=category,
        fixSuggestion=fix_suggestion,
        fixAction=fix_action,
    )


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _normalize(value: Any) -> str:
    """Strip and stringify a value; return empty string for None."""
    return str(value).strip() if value is not None else ""


def _normalize_upper(value: Any) -> str:
    return _normalize(value).upper()


def _check_code_format(code: str, row: int, field: str = "code") -> Optional[ValidationIssue]:
    """
    Validate code field: must be non-empty, alphanumeric + [-_.], max 50 chars.
    Returns a ValidationIssue on failure, None on success.
    """
    if not code:
        return _issue(
            row, field,
            "Code is required",
            ErrorSeverity.error,
            fixable=False,
            category="Missing Required",
            fix_suggestion="Fill in the required 'code' field before importing",
            fix_action="manual",
        )
    if len(code) > CODE_MAX_LENGTH:
        return _issue(
            row, field,
            f"Code '{code}' exceeds {CODE_MAX_LENGTH} characters ({len(code)} chars)",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Truncate to: '{code[:CODE_MAX_LENGTH]}'",
            category="Format Error",
            fix_suggestion=f"Truncate code to first {CODE_MAX_LENGTH} characters",
            fix_action="rename_code",
        )
    if not CODE_FORMAT_RE.match(code.upper()):
        cleaned = re.sub(r"[^A-Z0-9\-_\.]", "-", code.upper())
        return _issue(
            row, field,
            f"Code '{code}' contains invalid characters (only A-Z, 0-9, -, _, . allowed)",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Suggested: '{cleaned}'",
            category="Format Error",
            fix_suggestion="Replace invalid characters with hyphens",
            fix_action="rename_code",
        )
    return None


def _detect_duplicates_within_file(
    rows: List[Dict[str, Any]],
    code_field: str = "code",
) -> Dict[str, List[int]]:
    """
    Scan the import batch for repeated codes.
    Returns {code: [rowNumber, ...]} for codes that appear more than once.
    """
    seen: Dict[str, List[int]] = {}
    for row in rows:
        code = _normalize_upper(row["data"].get(code_field, ""))
        if code:
            seen.setdefault(code, []).append(row["rowNumber"])
    return {k: v for k, v in seen.items() if len(v) > 1}


def _detect_circular_hierarchy(rows: List[Dict[str, Any]]) -> List[Tuple[str, str]]:
    """
    Detect circular parent-child relationships within the import batch.
    Returns a list of (start_code, repeat_code) tuples for each cycle found.
    """
    parent_map: Dict[str, str] = {}
    for row in rows:
        code = _normalize_upper(row["data"].get("code", ""))
        parent = _normalize_upper(row["data"].get("parentCode", ""))
        if code and parent:
            parent_map[code] = parent

    circular: List[Tuple[str, str]] = []
    for start in parent_map:
        visited: Set[str] = set()
        current = start
        while current in parent_map:
            if current in visited:
                circular.append((start, current))
                break
            visited.add(current)
            current = parent_map[current]
    return circular


def _fuzzy_duplicate_names(
    name: str,
    all_names: List[str],
    threshold: float = NAME_SIMILARITY_THRESHOLD,
) -> List[str]:
    """
    Return names from all_names that are very similar to name
    (SequenceMatcher ratio > threshold), excluding exact self-matches.
    """
    name_lower = name.lower()
    similar: List[str] = []
    for n in all_names:
        nl = n.lower()
        if nl == name_lower:
            continue
        ratio = SequenceMatcher(None, name_lower, nl).ratio()
        if ratio > threshold:
            similar.append(n)
    return similar


def _collect_file_codes(rows: List[Dict[str, Any]]) -> Set[str]:
    return {_normalize_upper(r["data"].get("code", "")) for r in rows}


def _parse_date(value: Any) -> Optional[str]:
    """Return a YYYY-MM-DD string if value matches, else None."""
    s = _normalize(value)
    if DATE_RE.match(s):
        return s
    return None


def _fiscal_year_valid(value: Any) -> Optional[int]:
    """Return the fiscal year as int if valid (2000-2099), else None."""
    try:
        yr = int(_normalize(value))
        if FISCAL_YEAR_MIN <= yr <= FISCAL_YEAR_MAX:
            return yr
    except (ValueError, TypeError):
        pass
    return None


# ─── Shared base validation ───────────────────────────────────────────────────

def _run_base_checks(
    item: Dict[str, Any],
    existing_codes: Set[str],
    file_codes: Set[str],
    dup_map: Dict[str, List[int]],
    circular_codes: Set[str],
    dim_label: str,
    all_names: List[str],
) -> Tuple[List[ValidationIssue], str]:
    """
    Run checks common to ALL dimension types:
      - code format
      - duplicate within file
      - duplicate in DB (warning)
      - name required + length
      - fuzzy duplicate name
      - missing parent
      - circular hierarchy

    Returns (issues, status).
    """
    row_num: int = item["rowNumber"]
    data: Dict[str, Any] = item["data"]
    row_issues: List[ValidationIssue] = []
    status = "valid"

    code = _normalize_upper(data.get("code", ""))
    name = _normalize(data.get("name", ""))
    parent_code = _normalize_upper(data.get("parentCode", ""))

    # ── Code format ──
    fmt_issue = _check_code_format(code, row_num)
    if fmt_issue:
        row_issues.append(fmt_issue)
        status = "error"

    # ── Duplicate in DB ──
    if code and code in existing_codes:
        row_issues.append(_issue(
            row_num, "code",
            f"{dim_label} '{code}' already exists in the database. This row will update the existing record.",
            ErrorSeverity.warning,
            fixable=False,
            category="Duplicate",
            fix_suggestion=f"Rename code to '{code}-2' or review if this is an update",
            fix_action="rename_code",
        ))
        status = "duplicate"

    # ── Duplicate within file ──
    if code and code in dup_map and dup_map[code][0] != row_num:
        row_issues.append(_issue(
            row_num, "code",
            f"Code '{code}' appears {len(dup_map[code])} times in this file (rows {dup_map[code]})",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Use unique codes. Suggested: '{code}-{row_num}'",
            category="Duplicate Detection",
            fix_suggestion=f"Rename code to '{code}-2' or review if this is an update",
            fix_action="rename_code",
        ))
        status = "error"

    # ── Name required ──
    if not name:
        row_issues.append(_issue(
            row_num, "name",
            f"{dim_label} name is required",
            ErrorSeverity.error,
            fixable=False,
            category="Missing Required",
            fix_suggestion="Fill in the required 'name' field before importing",
            fix_action="manual",
        ))
        status = "error"
    elif len(name) > 200:
        row_issues.append(_issue(
            row_num, "name",
            f"Name too long ({len(name)} chars, max 200)",
            ErrorSeverity.warning,
            fixable=True,
            suggested_fix=name[:200],
            category="Format Error",
            fix_suggestion="Truncate the name to 200 characters",
            fix_action="rename_name",
        ))
        if status == "valid":
            status = "warning"

    # ── Fuzzy duplicate name ──
    if name:
        similar = _fuzzy_duplicate_names(name, all_names)
        if similar:
            row_issues.append(_issue(
                row_num, "name",
                f"Name '{name}' is very similar to: {similar[:3]}",
                ErrorSeverity.warning,
                fixable=True,
                category="Potential Duplicate",
                fix_suggestion=f"Rename to include qualifier e.g. '{name} - Region' to distinguish",
                fix_action="rename_name",
            ))
            if status == "valid":
                status = "warning"

    # ── Circular hierarchy ──
    if code and code in circular_codes:
        row_issues.append(_issue(
            row_num, "parentCode",
            f"Circular hierarchy detected involving '{code}'",
            ErrorSeverity.error,
            fixable=True,
            category="Circular Hierarchy",
            fix_suggestion=f"Break cycle by removing parent from {code} or restructuring hierarchy",
            fix_action="remove_parent",
        ))
        status = "error"

    # ── Missing parent ──
    if parent_code:
        if parent_code not in file_codes and parent_code not in existing_codes:
            row_issues.append(_issue(
                row_num, "parentCode",
                f"Parent '{parent_code}' not found in file or database",
                ErrorSeverity.warning,
                fixable=True,
                suggested_fix=f"Create '{parent_code}' first or leave blank",
                category="Missing Reference",
                fix_suggestion="Remove parent reference or create the parent record first",
                fix_action="remove_parent",
            ))
            if status == "valid":
                status = "warning"

    # Promote to warning if any warning issues and still "valid"
    if status == "valid" and any(i.severity == ErrorSeverity.warning for i in row_issues):
        status = "warning"

    return row_issues, status


# ─── Dimension-specific validators ───────────────────────────────────────────

def _validate_account_specific(
    row_num: int,
    data: Dict[str, Any],
) -> Tuple[List[ValidationIssue], bool]:
    """
    ACCOUNT-specific checks:
      - accountType must be ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE
    Returns (issues, has_error).
    """
    issues: List[ValidationIssue] = []
    has_error = False

    acc_type = _normalize_upper(data.get("accountType", data.get("type", "")))
    if not acc_type:
        issues.append(_issue(
            row_num, "accountType",
            "Account type is required",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix="Add one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
            category="Missing Required",
            fix_suggestion="Change accountType to one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
            fix_action="set_default_type",
        ))
        has_error = True
    elif acc_type not in VALID_ACCOUNT_TYPES:
        closest = min(VALID_ACCOUNT_TYPES, key=lambda t: -SequenceMatcher(None, acc_type, t).ratio())
        issues.append(_issue(
            row_num, "accountType",
            f"Invalid account type '{acc_type}'. Did you mean '{closest}'?",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Use: {', '.join(sorted(VALID_ACCOUNT_TYPES))}",
            category="Invalid Value",
            fix_suggestion="Change accountType to one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
            fix_action="set_default_type",
        ))
        has_error = True

    return issues, has_error


def _validate_scenario_specific(
    row_num: int,
    data: Dict[str, Any],
) -> Tuple[List[ValidationIssue], bool]:
    """
    SCENARIO-specific checks:
      - scenarioType must be BUDGET/FORECAST/ACTUALS/ROLLING_FORECAST/STRESS_TEST
      - fiscalYear must be 2000-2099
    """
    issues: List[ValidationIssue] = []
    has_error = False

    scenario_type = _normalize_upper(data.get("scenarioType", ""))
    if scenario_type and scenario_type not in VALID_SCENARIO_TYPES:
        issues.append(_issue(
            row_num, "scenarioType",
            f"Invalid scenario type '{scenario_type}'",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Use one of: {', '.join(sorted(VALID_SCENARIO_TYPES))}",
            category="Invalid Value",
            fix_suggestion=f"Change scenarioType to one of: {', '.join(sorted(VALID_SCENARIO_TYPES))}",
            fix_action="set_default_type",
        ))
        has_error = True

    fiscal_year_raw = data.get("fiscalYear")
    if fiscal_year_raw is not None and _normalize(fiscal_year_raw):
        if _fiscal_year_valid(fiscal_year_raw) is None:
            issues.append(_issue(
                row_num, "fiscalYear",
                f"Invalid fiscal year '{fiscal_year_raw}'",
                ErrorSeverity.error,
                fixable=False,
                category="Invalid Value",
                fix_suggestion="Use 4-digit year between 2000 and 2099",
                fix_action="manual",
            ))
            has_error = True

    return issues, has_error


def _validate_currency_specific(
    row_num: int,
    data: Dict[str, Any],
    code: str,
) -> Tuple[List[ValidationIssue], bool]:
    """
    CURRENCY-specific checks:
      - code must be exactly 3 uppercase letters (ISO 4217)
      - exchangeRate must be positive if provided
    """
    issues: List[ValidationIssue] = []
    has_error = False

    if code and not CURRENCY_CODE_RE.match(code):
        issues.append(_issue(
            row_num, "code",
            f"Currency code '{code}' must be exactly 3 uppercase letters (ISO 4217)",
            ErrorSeverity.error,
            fixable=False,
            category="Invalid Value",
            fix_suggestion="Use ISO 4217 3-letter currency code e.g. USD, EUR, GBP, THB",
            fix_action="manual",
        ))
        has_error = True

    exchange_rate_raw = data.get("exchangeRate")
    if exchange_rate_raw is not None and _normalize(exchange_rate_raw):
        try:
            rate = float(exchange_rate_raw)
            if rate <= 0:
                issues.append(_issue(
                    row_num, "exchangeRate",
                    f"Exchange rate must be positive, got '{exchange_rate_raw}'",
                    ErrorSeverity.error,
                    fixable=False,
                    category="Invalid Value",
                    fix_suggestion="Set exchangeRate to a positive number (e.g. 1.0 for base currency)",
                    fix_action="manual",
                ))
                has_error = True
        except (ValueError, TypeError):
            issues.append(_issue(
                row_num, "exchangeRate",
                f"Exchange rate '{exchange_rate_raw}' is not a valid number",
                ErrorSeverity.error,
                fixable=False,
                category="Invalid Value",
                fix_suggestion="Provide a numeric exchange rate greater than 0",
                fix_action="manual",
            ))
            has_error = True

    return issues, has_error


def _validate_time_specific(
    row_num: int,
    data: Dict[str, Any],
    code: str,
) -> Tuple[List[ValidationIssue], bool]:
    """
    TIME-specific checks:
      - periodType must be YEAR/QUARTER/MONTH/WEEK/DAY
      - startDate must be before endDate (YYYY-MM-DD)
      - fiscalYear must be 2000-2099 if provided
    """
    issues: List[ValidationIssue] = []
    has_error = False

    period_type = _normalize_upper(data.get("periodType", ""))
    if period_type and period_type not in VALID_PERIOD_TYPES:
        issues.append(_issue(
            row_num, "periodType",
            f"Invalid period type '{period_type}'",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Use one of: {', '.join(sorted(VALID_PERIOD_TYPES))}",
            category="Invalid Value",
            fix_suggestion=f"Change periodType to one of: {', '.join(sorted(VALID_PERIOD_TYPES))}",
            fix_action="set_default_type",
        ))
        has_error = True

    start_raw = data.get("startDate")
    end_raw = data.get("endDate")
    start_date = _parse_date(start_raw) if start_raw is not None else None
    end_date = _parse_date(end_raw) if end_raw is not None else None

    if start_raw and not start_date:
        issues.append(_issue(
            row_num, "startDate",
            f"Invalid startDate format '{start_raw}' — expected YYYY-MM-DD",
            ErrorSeverity.error,
            fixable=False,
            category="Format Error",
            fix_suggestion="Use ISO date format YYYY-MM-DD for startDate",
            fix_action="manual",
        ))
        has_error = True

    if end_raw and not end_date:
        issues.append(_issue(
            row_num, "endDate",
            f"Invalid endDate format '{end_raw}' — expected YYYY-MM-DD",
            ErrorSeverity.error,
            fixable=False,
            category="Format Error",
            fix_suggestion="Use ISO date format YYYY-MM-DD for endDate",
            fix_action="manual",
        ))
        has_error = True

    if start_date and end_date and start_date > end_date:
        issues.append(_issue(
            row_num, "startDate",
            f"startDate '{start_date}' is after endDate '{end_date}'",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Swap dates: startDate='{end_date}', endDate='{start_date}'",
            category="Invalid Value",
            fix_suggestion=f"Ensure startDate is before endDate for period {code}",
            fix_action="swap_dates",
        ))
        has_error = True

    fiscal_year_raw = data.get("fiscalYear")
    if fiscal_year_raw is not None and _normalize(fiscal_year_raw):
        if _fiscal_year_valid(fiscal_year_raw) is None:
            issues.append(_issue(
                row_num, "fiscalYear",
                f"Invalid fiscal year '{fiscal_year_raw}'",
                ErrorSeverity.error,
                fixable=False,
                category="Invalid Value",
                fix_suggestion="Use 4-digit year between 2000 and 2099",
                fix_action="manual",
            ))
            has_error = True

    return issues, has_error


def _validate_product_service_specific(
    row_num: int,
    data: Dict[str, Any],
) -> Tuple[List[ValidationIssue], bool]:
    """
    PRODUCT_SERVICE-specific checks:
      - unitPrice if provided must be >= 0
    """
    issues: List[ValidationIssue] = []
    has_error = False

    unit_price_raw = data.get("unitPrice")
    if unit_price_raw is not None and _normalize(unit_price_raw):
        try:
            price = float(unit_price_raw)
            if price < 0:
                issues.append(_issue(
                    row_num, "unitPrice",
                    f"Unit price must be 0 or greater, got '{unit_price_raw}'",
                    ErrorSeverity.error,
                    fixable=False,
                    category="Invalid Value",
                    fix_suggestion="Set unitPrice to 0 or a positive value",
                    fix_action="manual",
                ))
                has_error = True
        except (ValueError, TypeError):
            issues.append(_issue(
                row_num, "unitPrice",
                f"Unit price '{unit_price_raw}' is not a valid number",
                ErrorSeverity.error,
                fixable=False,
                category="Invalid Value",
                fix_suggestion="Provide a numeric value >= 0 for unitPrice",
                fix_action="manual",
            ))
            has_error = True

    return issues, has_error


def _validate_employee_category_specific(
    row_num: int,
    data: Dict[str, Any],
) -> Tuple[List[ValidationIssue], bool]:
    """
    EMPLOYEE_CATEGORY-specific checks:
      - categoryType if provided must be FULL_TIME/PART_TIME/CONTRACT/CONSULTANT/INTERN
    """
    issues: List[ValidationIssue] = []
    has_error = False

    cat_type = _normalize_upper(data.get("categoryType", ""))
    if cat_type and cat_type not in VALID_EMPLOYEE_CATEGORY_TYPES:
        issues.append(_issue(
            row_num, "categoryType",
            f"Invalid employee category type '{cat_type}'",
            ErrorSeverity.error,
            fixable=True,
            suggested_fix=f"Use one of: {', '.join(sorted(VALID_EMPLOYEE_CATEGORY_TYPES))}",
            category="Invalid Value",
            fix_suggestion=f"Change categoryType to one of: {', '.join(sorted(VALID_EMPLOYEE_CATEGORY_TYPES))}",
            fix_action="set_default_type",
        ))
        has_error = True

    return issues, has_error


def _validate_doctor_category_specific(
    row_num: int,
    data: Dict[str, Any],
) -> Tuple[List[ValidationIssue], bool]:
    """
    DOCTOR_CATEGORY-specific checks:
      - billableRate if provided must be >= 0
    """
    issues: List[ValidationIssue] = []
    has_error = False

    billable_rate_raw = data.get("billableRate")
    if billable_rate_raw is not None and _normalize(billable_rate_raw):
        try:
            rate = float(billable_rate_raw)
            if rate < 0:
                issues.append(_issue(
                    row_num, "billableRate",
                    f"Billable rate must be 0 or greater, got '{billable_rate_raw}'",
                    ErrorSeverity.error,
                    fixable=False,
                    category="Invalid Value",
                    fix_suggestion="Set billableRate to 0 or a positive value",
                    fix_action="manual",
                ))
                has_error = True
        except (ValueError, TypeError):
            issues.append(_issue(
                row_num, "billableRate",
                f"Billable rate '{billable_rate_raw}' is not a valid number",
                ErrorSeverity.error,
                fixable=False,
                category="Invalid Value",
                fix_suggestion="Provide a numeric value >= 0 for billableRate",
                fix_action="manual",
            ))
            has_error = True

    return issues, has_error


# ─── Core dispatcher ──────────────────────────────────────────────────────────

def validate_dimension(
    rows: List[Dict[str, Any]],
    existing_codes: Set[str],
    dimension_type: str,
) -> Tuple[List[ValidationIssue], List[RowResult]]:
    """
    Unified validation dispatcher for all 10 dimension types.

    Parameters
    ----------
    rows : list of {rowNumber: int, data: dict}
    existing_codes : set of codes already in the database (uppercased)
    dimension_type : one of the DimensionType enum values

    Returns
    -------
    (issues, row_results)
    """
    dim = dimension_type.upper()
    dim_label = dim.replace("_", " ").title()

    # Pre-compute file-level data once
    dup_map = _detect_duplicates_within_file(rows)
    circular = _detect_circular_hierarchy(rows)
    circular_codes: Set[str] = {c for pair in circular for c in pair}
    file_codes = _collect_file_codes(rows)
    all_names = [_normalize(r["data"].get("name", "")) for r in rows if _normalize(r["data"].get("name", ""))]

    all_issues: List[ValidationIssue] = []
    row_results: List[RowResult] = []

    for item in rows:
        row_num = item["rowNumber"]
        data = item["data"]

        # ── Base checks (shared by all dimensions) ──
        row_issues, status = _run_base_checks(
            item, existing_codes, file_codes, dup_map, circular_codes, dim_label, all_names
        )

        code = _normalize_upper(data.get("code", ""))

        # ── Dimension-specific checks ──
        specific_issues: List[ValidationIssue] = []
        specific_error = False

        if dim == "ACCOUNT":
            specific_issues, specific_error = _validate_account_specific(row_num, data)
        elif dim == "SCENARIO":
            specific_issues, specific_error = _validate_scenario_specific(row_num, data)
        elif dim == "CURRENCY":
            specific_issues, specific_error = _validate_currency_specific(row_num, data, code)
        elif dim == "TIME":
            specific_issues, specific_error = _validate_time_specific(row_num, data, code)
        elif dim == "PRODUCT_SERVICE":
            specific_issues, specific_error = _validate_product_service_specific(row_num, data)
        elif dim == "EMPLOYEE_CATEGORY":
            specific_issues, specific_error = _validate_employee_category_specific(row_num, data)
        elif dim == "DOCTOR_CATEGORY":
            specific_issues, specific_error = _validate_doctor_category_specific(row_num, data)
        # ENTITY, DEPARTMENT, COST_CENTER — base checks only

        row_issues.extend(specific_issues)
        if specific_error and status not in ("error",):
            status = "error"

        # Final status coercion
        if status == "valid" and any(i.severity == ErrorSeverity.warning for i in row_issues):
            status = "warning"

        error_count = sum(1 for i in row_issues if i.severity == ErrorSeverity.error)
        warning_count = sum(1 for i in row_issues if i.severity == ErrorSeverity.warning)

        all_issues.extend(row_issues)
        row_results.append(RowResult(
            rowNumber=row_num,
            status=status,
            issues=row_issues,
            data=data,
            errorCount=error_count,
            warningCount=warning_count,
            issueIds=[str(uuid.uuid4()) for _ in row_issues],
        ))

    return all_issues, row_results


# ─── Legacy-compatible entry points ──────────────────────────────────────────

def validate_accounts(
    rows: List[Dict[str, Any]],
    existing_codes: Set[str],
) -> Tuple[List[ValidationIssue], List[RowResult]]:
    """
    Validate ACCOUNT dimension rows.
    Legacy entry point — delegates to validate_dimension.
    """
    return validate_dimension(rows, existing_codes, "ACCOUNT")


def validate_hierarchy_dimension(
    rows: List[Dict[str, Any]],
    existing_codes: Set[str],
    dimension_name: str,
) -> Tuple[List[ValidationIssue], List[RowResult]]:
    """
    Generic validation for hierarchy-based dimensions
    (ENTITY, DEPARTMENT, COST_CENTER, and fallback).
    Legacy entry point — delegates to validate_dimension.
    """
    return validate_dimension(rows, existing_codes, dimension_name)
