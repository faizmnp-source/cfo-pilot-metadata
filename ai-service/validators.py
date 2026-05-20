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
   