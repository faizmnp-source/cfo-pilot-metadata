"""Core validation logic for each dimension type."""

from typing import List, Dict, Any, Set, Optional, Tuple
from models import ValidationIssue, RowResult, ErrorSeverity
import re


# ─── Helpers ────────────────────────────────────────────────────────────────

def _issue(
    row: int,
    field: str,
    message: str,
    severity: ErrorSeverity = ErrorSeverity.error,
    fixable: bool = False,
    suggested_fix: Optional[str] = None,
    category: str = "General",
) -> ValidationIssue:
    return ValidationIssue(
        rowNumber=row,
        field=field,
        message=message,
        severity=severity,
        fixable=fixable,
        suggestedFix=suggested_fix,
        category=category,
    )


def _normalize(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _check_code_format(code: str, row: int, field: str = "code") -> Optional[ValidationIssue]:
    """Code must be alphanumeric + hyphens/underscores, max 20 chars."""
    if not code:
        return _issue(row, field, "Code is required", ErrorSeverity.error, category="Missing Required")
    if len(code) > 20:
        return _issue(
            row, field, f"Code '{code}' exceeds 20 characters ({len(code)} chars)",
            ErrorSeverity.error, True,
            f"Truncate to: '{code[:20]}'",
            "Format Error"
        )
    if not re.match(r'^[A-Z0-9\-_\.]+$', code.upper()):
        return _issue(
            row, field,
            f"Code '{code}' contains invalid characters (only A-Z, 0-9, -, _, . allowed)",
            ErrorSeverity.error, True,
            f"Suggested: '{re.sub(r'[^A-Z0-9\\-_\\.]', '-', code.upper())}'",
            "Format Error"
        )
    return None


def _detect_duplicates_within_file(
    rows: List[Dict[str, Any]], code_field: str = "code"
) -> Dict[str, List[int]]:
    """Returns a map of code → list of row numbers that use it."""
    seen: Dict[str, List[int]] = {}
    for row in rows:
        code = _normalize(row["data"].get(code_field, "")).upper()
        if code:
            seen.setdefault(code, []).append(row["rowNumber"])
    return {k: v for k, v in seen.items() if len(v) > 1}


def _detect_circular_hierarchy(
    rows: List[Dict[str, Any]]
) -> List[Tuple[str, str]]:
    """Detect circular parent-child references within the import batch."""
    parent_map: Dict[str, str] = {}
    for row in rows:
        code = _normalize(row["data"].get("code", "")).upper()
        parent = _normalize(row["data"].get("parentCode", "")).upper()
        if code and parent:
            parent_map[code] = parent

    circular: List[Tuple[str, str]] = []
    for start in parent_map:
        visited = set()
        current = start
        while current in parent_map:
            if current in visited:
                circular.append((start, current))
                break
            visited.add(current)
            current = parent_map[current]

    return circular


# ─── Account validation ──────────────────────────────────────────────────────

VALID_ACCOUNT_TYPES = {"ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"}

def validate_accounts(
    rows: List[Dict[str, Any]],
    existing_codes: Set[str],
) -> Tuple[List[ValidationIssue], List[RowResult]]:
    issues: List[ValidationIssue] = []
    row_results: List[RowResult] = []

    # File-level checks
    dup_map = _detect_duplicates_within_file(rows)
    circular = _detect_circular_hierarchy(rows)
    circular_codes = {c for pair in circular for c in pair}

    for item in rows:
        row_num = item["rowNumber"]
        data = item["data"]
        row_issues: List[ValidationIssue] = []
        status = "valid"

        code = _normalize(data.get("code", "")).upper()
        name = _normalize(data.get("name", ""))
        acc_type = _normalize(data.get("type", "")).upper()
        parent_code = _normalize(data.get("parentCode", "")).upper()

        # Code checks
        fmt_issue = _check_code_format(code, row_num)
        if fmt_issue:
            row_issues.append(fmt_issue)
            status = "error"

        if code in existing_codes:
            row_issues.append(_issue(
                row_num, "code",
                f"Account '{code}' already exists in the database. This row will update the existing record.",
                ErrorSeverity.warning, False, None, "Duplicate"
            ))
            status = "duplicate"

        if code in dup_map and dup_map[code][0] != row_num:
            row_issues.append(_issue(
                row_num, "code",
                f"Code '{code}' appears {len(dup_map[code])} times in this file (rows {dup_map[code]})",
                ErrorSeverity.error, True,
                f"Use unique codes. Suggested: '{code}-{row_num}'",
                "Duplicate Detection"
            ))
            status = "error"

        # Name required
        if not name:
            row_issues.append(_issue(row_num, "name", "Account name is required", ErrorSeverity.error, category="Missing Required"))
            status = "error"
        elif len(name) > 200:
            row_issues.append(_issue(row_num, "name", f"Name too long ({len(name)} chars, max 200)", ErrorSeverity.warning, True, name[:200], "Format Error"))

        # Type validation
        if not acc_type:
            row_issues.append(_issue(
                row_num, "type", "Account type is required",
                ErrorSeverity.error, True,
                "Add one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
                "Missing Required"
            ))
            status = "error"
        elif acc_type not in VALID_ACCOUNT_TYPES:
            closest = min(VALID_ACCOUNT_TYPES, key=lambda t: abs(len(t) - len(acc_type)))
            row_issues.append(_issue(
                row_num, "type", f"Invalid account type '{acc_type}'",
                ErrorSeverity.error, True,
                f"Did you mean '{closest}'? Valid values: {', '.join(sorted(VALID_ACCOUNT_TYPES))}",
                "Invalid Value"
            ))
            status = "error"

        # Circular hierarchy
        if code and code in circular_codes:
            row_issues.append(_issue(
                row_num, "parentCode",
                f"Circular hierarchy detected involving account '{code}'",
                ErrorSeverity.error, False, None,
                "Circular Hierarchy"
            ))
            status = "error"

        # Parent code exists in file?
        if parent_code:
            all_codes_in_file = {_normalize(r["data"].get("code", "")).upper() for r in rows}
            if parent_code not in all_codes_in_file and parent_code not in existing_codes:
                row_issues.append(_issue(
                    row_num, "parentCode",
                    f"Parent account '{parent_code}' not found in file or database",
                    ErrorSeverity.warning, True,
                    f"Create '{parent_code}' first, or leave parentCode blank for root-level account",
                    "Missing Reference"
                ))
                if status == "valid":
                    status = "warning"

        if status == "valid" and any(i.severity == ErrorSeverity.warning for i in row_issues):
            status = "warning"

        issues.extend(row_issues)
        row_results.append(RowResult(rowNumber=row_num, status=status, issues=row_issues, data=data))

    return issues, row_results


# ─── Generic hierarchy dimension validation ──────────────────────────────────

def validate_hierarchy_dimension(
    rows: List[Dict[str, Any]],
    existing_codes: Set[str],
    dimension_name: str,
) -> Tuple[List[ValidationIssue], List[RowResult]]:
    """Generic validation for departments, cost centers, entities."""
    issues: List[ValidationIssue] = []
    row_results: List[RowResult] = []

    dup_map = _detect_duplicates_within_file(rows)
    circular = _detect_circular_hierarchy(rows)
    circular_codes = {c for pair in circular for c in pair}

    for item in rows:
        row_num = item["rowNumber"]
        data = item["data"]
        row_issues: List[ValidationIssue] = []
        status = "valid"

        code = _normalize(data.get("code", "")).upper()
        name = _normalize(data.get("name", ""))
        parent_code = _normalize(data.get("parentCode", "")).upper()

        fmt_issue = _check_code_format(code, row_num)
        if fmt_issue:
            row_issues.append(fmt_issue)
            status = "error"

        if code in existing_codes:
            row_issues.append(_issue(
                row_num, "code",
                f"{dimension_name} '{code}' already exists. Will update existing record.",
                ErrorSeverity.warning, False, None, "Duplicate"
            ))
            status = "duplicate"

        if code in dup_map and dup_map[code][0] != row_num:
            row_issues.append(_issue(
                row_num, "code",
                f"Code '{code}' appears {len(dup_map[code])} times in this file",
                ErrorSeverity.error, True,
                f"Use unique codes. Suggested: '{code}-{row_num}'",
                "Duplicate Detection"
            ))
            status = "error"

        if not name:
            row_issues.append(_issue(row_num, "name", f"{dimension_name} name is required", ErrorSeverity.error, category="Missing Required"))
            status = "error"

        # Fuzzy duplicate name detection
        all_names = [_normalize(r["data"].get("name", "")).lower() for r in rows]
        name_lower = name.lower()
        similar = [n for n in all_names if n != name_lower and (
            name_lower in n or n in name_lower or
            sum(c1 == c2 for c1, c2 in zip(name_lower, n)) / max(len(name_lower), len(n)) > 0.85
        )]
        if similar:
            row_issues.append(_issue(
                row_num, "name",
                f"Name '{name}' is very similar to other entries: {similar[:2]}",
                ErrorSeverity.warning, False, None,
                "Potential Duplicate"
            ))
            if status == "valid":
                status = "warning"

        if code and code in circular_codes:
            row_issues.append(_issue(
                row_num, "parentCode",
                f"Circular hierarchy detected involving '{code}'",
                ErrorSeverity.error, False, None,
                "Circular Hierarchy"
            ))
            status = "error"

        if parent_code:
            all_codes_in_file = {_normalize(r["data"].get("code", "")).upper() for r in rows}
            if parent_code not in all_codes_in_file and parent_code not in existing_codes:
                row_issues.append(_issue(
                    row_num, "parentCode",
                    f"Parent '{parent_code}' not found",
                    ErrorSeverity.warning, True,
                    f"Create '{parent_code}' first or leave blank",
                    "Missing Reference"
                ))
                if status == "valid":
                    status = "warning"

        if status == "valid" and any(i.severity == ErrorSeverity.warning for i in row_issues):
            status = "warning"

        issues.extend(row_issues)
        row_results.append(RowResult(rowNumber=row_num, status=status, issues=row_issues, data=data))

    return issues, row_results
