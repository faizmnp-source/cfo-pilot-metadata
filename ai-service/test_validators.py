"""
Tests for the AI validation service.
Run with: python -m pytest test_validators.py -v
"""

import pytest
from validators import (
    validate_accounts,
    validate_hierarchy_dimension,
    _check_code_format,
    _detect_duplicates_within_file,
    _detect_circular_hierarchy,
)
from models import ErrorSeverity


# ─── Helpers ─────────────────────────────────────────────────────────────────

def make_row(row_num: int, **data):
    return {"rowNumber": row_num, "data": data}


# ─── Code format tests ────────────────────────────────────────────────────────

def test_code_format_valid():
    assert _check_code_format("1100", 1) is None
    assert _check_code_format("ASSET-01", 1) is None
    assert _check_code_format("CC_001.A", 1) is None
    assert _check_code_format("A" * 20, 1) is None  # exactly 20


def test_code_format_empty():
    result = _check_code_format("", 1)
    assert result is not None
    assert result.severity == ErrorSeverity.error


def test_code_format_too_long():
    result = _check_code_format("A" * 21, 1)
    assert result is not None
    assert result.fixable is True
    assert "20" in result.message


def test_code_format_invalid_chars():
    result = _check_code_format("1100 A", 1)  # space not allowed
    assert result is not None
    assert result.suggestedFix is not None


# ─── Duplicate detection ──────────────────────────────────────────────────────

def test_no_duplicates():
    rows = [
        make_row(1, code="1100"),
        make_row(2, code="1200"),
        make_row(3, code="1300"),
    ]
    dups = _detect_duplicates_within_file(rows)
    assert len(dups) == 0


def test_detects_duplicates():
    rows = [
        make_row(1, code="1100"),
        make_row(2, code="1100"),
        make_row(3, code="1200"),
    ]
    dups = _detect_duplicates_within_file(rows)
    assert "1100" in dups
    assert len(dups["1100"]) == 2


def test_detects_multiple_duplicate_groups():
    rows = [
        make_row(1, code="A"),
        make_row(2, code="A"),
        make_row(3, code="B"),
        make_row(4, code="B"),
        make_row(5, code="C"),
    ]
    dups = _detect_duplicates_within_file(rows)
    assert "A" in dups
    assert "B" in dups
    assert "C" not in dups


# ─── Circular hierarchy detection ─────────────────────────────────────────────

def test_no_circular():
    rows = [
        make_row(1, code="A", parentCode=""),
        make_row(2, code="B", parentCode="A"),
        make_row(3, code="C", parentCode="B"),
    ]
    circular = _detect_circular_hierarchy(rows)
    assert len(circular) == 0


def test_detects_circular():
    rows = [
        make_row(1, code="A", parentCode="C"),  # A → C
        make_row(2, code="B", parentCode="A"),  # B → A
        make_row(3, code="C", parentCode="B"),  # C → B → A → C (cycle!)
    ]
    circular = _detect_circular_hierarchy(rows)
    assert len(circular) > 0


# ─── Account validation ───────────────────────────────────────────────────────

def test_valid_accounts():
    rows = [
        make_row(1, code="1000", name="Assets", type="ASSET", parentCode=""),
        make_row(2, code="1100", name="Current Assets", type="ASSET", parentCode="1000"),
        make_row(3, code="2000", name="Liabilities", type="LIABILITY", parentCode=""),
    ]
    issues, row_results = validate_accounts(rows, set())
    errors = [i for i in issues if i.severity == ErrorSeverity.error]
    assert len(errors) == 0


def test_missing_code():
    rows = [make_row(1, code="", name="Assets", type="ASSET")]
    issues, _ = validate_accounts(rows, set())
    assert any(i.field == "code" for i in issues)


def test_missing_name():
    rows = [make_row(1, code="1000", name="", type="ASSET")]
    issues, _ = validate_accounts(rows, set())
    assert any(i.field == "name" for i in issues)


def test_invalid_account_type():
    rows = [make_row(1, code="1000", name="Assets", type="INCOME")]
    issues, _ = validate_accounts(rows, set())
    type_errors = [i for i in issues if i.field == "type"]
    assert len(type_errors) > 0
    assert type_errors[0].suggestedFix is not None  # should suggest fix


def test_existing_code_marked_as_duplicate():
    rows = [make_row(1, code="1000", name="Assets", type="ASSET")]
    issues, row_results = validate_accounts(rows, {"1000"})
    assert row_results[0].status == "duplicate"


def test_circular_hierarchy_detected():
    rows = [
        make_row(1, code="A", name="Root", type="ASSET", parentCode="C"),
        make_row(2, code="B", name="Child", type="ASSET", parentCode="A"),
        make_row(3, code="C", name="Grandchild", type="ASSET", parentCode="B"),
    ]
    issues, _ = validate_accounts(rows, set())
    circular_issues = [i for i in issues if "circular" in i.message.lower()]
    assert len(circular_issues) > 0


def test_missing_parent_gives_warning():
    rows = [make_row(1, code="1100", name="Current Assets", type="ASSET", parentCode="9999")]
    issues, row_results = validate_accounts(rows, set())  # 9999 not in existing
    warnings = [i for i in issues if i.severity == ErrorSeverity.warning]
    assert len(warnings) > 0
    assert row_results[0].status in ("warning",)


# ─── Generic hierarchy dimension ──────────────────────────────────────────────

def test_valid_departments():
    rows = [
        make_row(1, code="CORP", name="Corporate", parentCode=""),
        make_row(2, code="FIN", name="Finance", parentCode="CORP"),
        make_row(3, code="HR", name="Human Resources", parentCode="CORP"),
    ]
    issues, row_results = validate_hierarchy_dimension(rows, set(), "Department")
    errors = [i for i in issues if i.severity == ErrorSeverity.error]
    assert len(errors) == 0
    assert all(r.status in ("valid", "warning") for r in row_results)


def test_similar_names_flagged():
    rows = [
        make_row(1, code="FIN1", name="Finance Department", parentCode=""),
        make_row(2, code="FIN2", name="Finance Departments", parentCode=""),  # very similar
    ]
    issues, _ = validate_hierarchy_dimension(rows, set(), "Department")
    similarity_issues = [i for i in issues if "similar" in i.message.lower()]
    assert len(similarity_issues) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
