"""Tests for Galleon API endpoints."""


class TestHealth:
    def test_health_returns_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["version"] == "1.0.0"
        assert data["sqlite_ok"] is True
        assert "timestamp" in data

    def test_health_has_index_count(self, client):
        data = client.get("/health").json()
        assert "bdc_index_companies" in data
        assert isinstance(data["bdc_index_companies"], int)


class TestBdcEndpoints:
    def test_universe_returns_list(self, client):
        r = client.get("/bdc/universe")
        assert r.status_code == 200

    def test_search_empty_query(self, client):
        r = client.get("/companies/search?q=")
        assert r.status_code == 200
        assert r.json() == []


class TestWorkflow:
    def test_create_and_list_reviews(self, client):
        r = client.post("/workflow/reviews", json={
            "company_name": "Test Corp",
            "company_id": "tc-1",
            "assignee": "Alice",
            "notes": "Initial review",
            "priority": "high",
        })
        assert r.status_code == 201
        review = r.json()
        assert review["company_name"] == "Test Corp"
        assert review["status"] == "pending"
        review_id = review["id"]

        # Update
        r2 = client.patch(f"/workflow/reviews/{review_id}", json={
            "status": "approved",
        })
        assert r2.status_code == 200
        assert r2.json()["status"] == "approved"

        # List
        r3 = client.get("/workflow/reviews")
        assert r3.status_code == 200
        names = [rv["company_name"] for rv in r3.json()]
        assert "Test Corp" in names

    def test_update_nonexistent_review_404(self, client):
        r = client.patch("/workflow/reviews/doesnt-exist", json={"status": "approved"})
        assert r.status_code == 404


class TestMonitor:
    def test_monitor_status(self, client):
        r = client.get("/monitor/status")
        assert r.status_code == 200
        data = r.json()
        assert "running" in data
        assert "alerts_count" in data

    def test_alerts_list(self, client):
        r = client.get("/monitor/alerts")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestExposure:
    def test_exposure_endpoint(self, client):
        r = client.get("/workflow/exposure")
        assert r.status_code == 200
        data = r.json()
        assert "total_portfolio_usd" in data

    def test_concentration_endpoint(self, client):
        r = client.get("/workflow/concentration")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestAssistant:
    def test_chat_greeting(self, client):
        r = client.post("/assistant/chat", json={
            "message": "hi",
            "conversation_id": None,
        })
        assert r.status_code == 200
        data = r.json()
        assert "response" in data
        assert data["conversation_id"] is not None
        assert "Galleon" in data["response"]

    def test_chat_returns_conversation_id(self, client):
        r = client.post("/assistant/chat", json={
            "message": "hello",
            "conversation_id": None,
        })
        cid = r.json()["conversation_id"]
        # Second message in same conversation
        r2 = client.post("/assistant/chat", json={
            "message": "tell me about Maurice Sporting Goods",
            "conversation_id": cid,
        })
        assert r2.json()["conversation_id"] == cid
