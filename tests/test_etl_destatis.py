from etl import destatis

HEADER = (
    "time;1_variable_code;1_variable_attribute_code;1_variable_attribute_label;"
    "2_variable_code;2_variable_attribute_code;2_variable_attribute_label;value"
)


def _csv(*lines):
    return "\n".join([HEADER, *lines])


def test_filters_series_period_and_missing_values():
    text = _csv(
        "2026;QUARTG;QUART2;Quarter 2;WERT;SA;Seasonally adjusted;106,5",
        "2026;QUARTG;QUART1;Quarter 1;WERT;ORG;Unadjusted;99.0",   # wrong adjustment
        "2025;QUARTG;QUART4;Quarter 4;WERT;SA;Seasonally adjusted;...",  # missing marker
    )
    rows, labels = destatis.parse_flat_csv(text, {"WERT": "SA"}, "WERT", "QUARTG")
    assert rows == [{"country": "DEU", "period": "2026-Q2", "value": 106.5, "series": "SA"}]
    assert labels == {"SA": "Seasonally adjusted"}


def test_monthly_period_and_total_series():
    text = _csv("2026;MONAT;MONAT07;July;WERT;;Total;91.0")
    rows, labels = destatis.parse_flat_csv(text, {}, "WERT", "MONAT")
    assert (rows[0]["period"], rows[0]["series"]) == ("2026-07", "TOTAL")
    assert labels == {"TOTAL": "Total"}


def test_annual_table_without_time_variable():
    text = _csv("2025;DINSG;DG;Germany;WZ;WZ08-A;Agriculture;51,2")
    rows, _ = destatis.parse_flat_csv(text, {}, "WZ", None)
    assert rows[0]["period"] == "2025" and rows[0]["series"] == "WZ08-A"
