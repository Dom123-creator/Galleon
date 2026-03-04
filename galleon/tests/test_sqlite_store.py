"""Tests for galleon/api/sqlite_store.py — all SQLite persistence operations."""

import json
from api import sqlite_store


class TestAlerts:
    def test_save_and_load(self, tmp_db):
        alert = {
            "id": "a-1",
            "alert_type": "test",
            "source_bdc": "ARCC",
            "company_name": "Test Corp",
            "message": "Test alert",
            "severity": "info",
            "details": {"key": "value"},
            "read": False,
            "created_at": "2026-01-01T00:00:00Z",
        }
        sqlite_store.save_alert(alert)
        loaded = sqlite_store.load_alerts()
        assert len(loaded) == 1
        assert loaded[0]["id"] == "a-1"
        assert loaded[0]["details"] == {"key": "value"}
        assert loaded[0]["read"] is False

    def test_update_read(self, tmp_db):
        sqlite_store.save_alert({
            "id": "a-2", "alert_type": "t", "source_bdc": None,
            "company_name": None, "message": "m", "severity": "info",
            "details": {}, "read": False, "created_at": "2026-01-01T00:00:00Z",
        })
        sqlite_store.update_alert_read("a-2", True)
        loaded = sqlite_store.load_alerts()
        assert loaded[0]["read"] is True

    def test_mark_all_read(self, tmp_db):
        for i in range(3):
            sqlite_store.save_alert({
                "id": f"a-{i}", "alert_type": "t", "source_bdc": None,
                "company_name": None, "message": "m", "severity": "info",
                "details": {}, "read": False, "created_at": "2026-01-01T00:00:00Z",
            })
        sqlite_store.mark_all_alerts_read()
        loaded = sqlite_store.load_alerts()
        assert all(a["read"] for a in loaded)


class TestDealReviews:
    def test_round_trip(self, tmp_db):
        review = {
            "id": "r-1",
            "company_name": "Acme",
            "company_id": "c-1",
            "status": "pending",
            "assignee": "Alice",
            "notes": "check this",
            "priority": "high",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
        sqlite_store.save_deal_review(review)
        loaded = sqlite_store.load_deal_reviews()
        assert "r-1" in loaded
        assert loaded["r-1"]["company_name"] == "Acme"

    def test_update_overwrites(self, tmp_db):
        review = {
            "id": "r-2", "company_name": "X", "company_id": "c", "status": "pending",
            "assignee": None, "notes": "", "priority": "low",
            "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
        }
        sqlite_store.save_deal_review(review)
        review["status"] = "approved"
        sqlite_store.save_deal_review(review)
        loaded = sqlite_store.load_deal_reviews()
        assert loaded["r-2"]["status"] == "approved"


class TestConversations:
    def test_append_and_load(self, tmp_db):
        sqlite_store.append_message("conv-1", "user", "hello")
        sqlite_store.append_message("conv-1", "assistant", "hi there")
        sqlite_store.append_message("conv-2", "user", "other chat")

        convos = sqlite_store.load_conversations()
        assert len(convos) == 2
        assert len(convos["conv-1"]) == 2
        assert convos["conv-1"][0]["role"] == "user"
        assert convos["conv-1"][1]["content"] == "hi there"

    def test_sequence_ordering(self, tmp_db):
        for i in range(5):
            sqlite_store.append_message("conv-seq", "user", f"msg-{i}")
        convos = sqlite_store.load_conversations()
        contents = [m["content"] for m in convos["conv-seq"]]
        assert contents == [f"msg-{i}" for i in range(5)]


class TestBdcIndex:
    def test_save_and_load(self, tmp_db):
        idx = [
            {"company_name": "Foo Inc", "source_bdc": "ARCC", "sector": "Tech",
             "facility_type": "First Lien", "pricing_spread": "SOFR+500",
             "maturity_date": "2029-01-01", "fair_value_usd": 100.0,
             "cost_basis_usd": 105.0, "non_accrual": False, "filing_date": "2026-01-01"},
        ]
        sqlite_store.save_bdc_index(idx, "2026-01-01T00:00:00")
        loaded = sqlite_store.load_bdc_index()
        assert len(loaded) == 1
        assert loaded[0]["company_name"] == "Foo Inc"
        assert loaded[0]["non_accrual"] is False

        ts = sqlite_store.load_bdc_last_indexed()
        assert ts == "2026-01-01T00:00:00"

    def test_extra_fields_preserved(self, tmp_db):
        idx = [
            {"company_name": "Bar", "source_bdc": "MAIN", "non_accrual": True,
             "custom_field": "custom_value"},
        ]
        sqlite_store.save_bdc_index(idx)
        loaded = sqlite_store.load_bdc_index()
        assert loaded[0]["custom_field"] == "custom_value"
        assert loaded[0]["non_accrual"] is True


class TestTemporalSnapshots:
    def test_bulk_save_and_load(self, tmp_db):
        snapshots = {
            "acme": [
                {"period": "2025-03-31", "source_bdc": "ARCC", "company_name": "Acme LLC",
                 "fair_value_usd": 50.0, "cost_basis_usd": 55.0, "pricing_spread": None,
                 "non_accrual": False, "facility_type": "First Lien", "sector": "Tech"},
                {"period": "2025-06-30", "source_bdc": "ARCC", "company_name": "Acme LLC",
                 "fair_value_usd": 48.0, "cost_basis_usd": 55.0, "pricing_spread": None,
                 "non_accrual": False, "facility_type": "First Lien", "sector": "Tech"},
            ],
        }
        sqlite_store.save_snapshots_bulk(snapshots)
        loaded = sqlite_store.load_snapshots()
        assert "acme" in loaded
        assert len(loaded["acme"]) == 2
        assert loaded["acme"][0]["non_accrual"] is False


class TestPipelines:
    def test_save_and_load(self, tmp_db):
        pipeline = {
            "pipeline_id": "p-1",
            "status": "running",
            "result": None,
            "company_id": "c-1",
            "started_at": "2026-01-01T00:00:00Z",
        }
        sqlite_store.save_pipeline(pipeline)
        loaded = sqlite_store.load_pipelines()
        assert "p-1" in loaded
        assert loaded["p-1"]["status"] == "running"

    def test_update_status(self, tmp_db):
        sqlite_store.save_pipeline({
            "pipeline_id": "p-2", "status": "running", "result": None,
            "company_id": None, "started_at": "2026-01-01T00:00:00Z",
        })
        sqlite_store.save_pipeline({
            "pipeline_id": "p-2", "status": "complete",
            "result": {"summary": {"fields": 10}},
            "company_id": None, "started_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T01:00:00Z",
        })
        loaded = sqlite_store.load_pipelines()
        assert loaded["p-2"]["status"] == "complete"
        assert loaded["p-2"]["result"]["summary"]["fields"] == 10


class TestKnownFilings:
    def test_save_and_load(self, tmp_db):
        sqlite_store.save_known_filing("0001287750", "0001287750-24-012345")
        loaded = sqlite_store.load_known_filings()
        assert loaded["0001287750"] == "0001287750-24-012345"

    def test_update_overwrites(self, tmp_db):
        sqlite_store.save_known_filing("CIK1", "acc-old")
        sqlite_store.save_known_filing("CIK1", "acc-new")
        loaded = sqlite_store.load_known_filings()
        assert loaded["CIK1"] == "acc-new"
