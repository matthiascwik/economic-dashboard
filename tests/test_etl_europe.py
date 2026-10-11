from etl import ecb, eurostat


def _cube(values):
    return {
        "id": ["geo", "nace_r2", "time"],
        "size": [2, 2, 2],
        "value": values,
        "dimension": {
            "geo": {"category": {"index": {"DE": 0, "EA20": 1}, "label": {"DE": "Germany", "EA20": "Euro area"}}},
            "nace_r2": {"category": {"index": {"A": 0, "C": 1}, "label": {}}},
            "time": {"category": {"index": {"2023": 0, "2024": 1}, "label": {}}},
        },
    }


def test_jsonstat_decodes_dimensions_and_maps_countries():
    # flat index = geo*4 + nace*2 + time
    rows = eurostat.parse_jsonstat(_cube({"0": 1.0, "3": 2.0, "4": 3.0}), "nace_r2")
    assert rows[0] | {"country_name": None} == {
        "country": "DEU", "country_name": None, "is_aggregate": False,
        "period": "2023", "value": 1.0, "series": "A",
    }
    assert (rows[1]["series"], rows[1]["period"]) == ("C", "2024")
    assert (rows[2]["country"], rows[2]["is_aggregate"]) == ("EA20", True)


def test_jsonstat_skips_null_values():
    assert eurostat.parse_jsonstat(_cube({"0": None, "1": 5.0}), "nace_r2")[0]["value"] == 5.0


def test_sdmx_maps_observation_index_to_period():
    data = {
        "structure": {"dimensions": {"observation": [{"values": [{"id": "2024-06-12"}, {"id": "2024-09-18"}]}]}},
        "dataSets": [{"series": {"0:0": {"observations": {"0": [4.25, 0], "1": [3.65, 0]}}}}],
    }
    assert ecb.parse_sdmx(data) == [
        {"country": "EA", "period": "2024-06-12", "value": 4.25},
        {"country": "EA", "period": "2024-09-18", "value": 3.65},
    ]
