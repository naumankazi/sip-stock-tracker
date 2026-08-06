"""Tests for the manual 'units' override on POST /api/entries (iteration_2 delta)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "https://sip-stock-tracker.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module", autouse=True)
def clean_slate(s):
    # Clean environment
    s.post(f"{API}/reset/logs")
    r = s.get(f"{API}/stocks")
    for st in r.json():
        s.delete(f"{API}/stocks/{st['id']}")
    s.post(f"{API}/reset/budget")
    # Seed defaults: 30000 monthly, 22 trading days
    s.put(f"{API}/settings", json={"monthly_budget": 30000, "trading_days": 22})
    yield
    s.post(f"{API}/reset/logs")
    r = s.get(f"{API}/stocks")
    for st in r.json():
        s.delete(f"{API}/stocks/{st['id']}")


@pytest.fixture(scope="module")
def stock(s):
    r = s.post(f"{API}/stocks", json={"symbol": "MUTS", "name": "ManualUnits Test", "allocation_pct": 50})
    assert r.status_code == 200, r.text
    d = r.json()
    return d


# ---------- 1. Backward compat: no units => auto floor(remaining/price) ----------
def test_create_entry_no_units_auto_calc(s, stock):
    s.post(f"{API}/reset/logs")
    d = s.get(f"{API}/dashboard").json()
    target = next(x for x in d["stocks"] if x["id"] == stock["id"])
    remaining = target["remaining_today"]
    price = 100.0
    expected_units = int(remaining // price)
    assert expected_units > 0

    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": price})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["units"] == expected_units
    assert e["cost"] == round(expected_units * price, 2)
    # cleanup
    s.delete(f"{API}/entries/{e['id']}")


# ---------- 2. Manual units used verbatim; ignores remaining check ----------
def test_create_entry_with_manual_units(s, stock):
    s.post(f"{API}/reset/logs")
    price = 50.0
    units = 3
    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": price, "units": units})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["units"] == units
    assert e["cost"] == round(units * price, 2)
    s.delete(f"{API}/entries/{e['id']}")


def test_manual_units_overrides_budget_check(s, stock):
    """User can override with units that would exceed remaining; server accepts it."""
    s.post(f"{API}/reset/logs")
    d = s.get(f"{API}/dashboard").json()
    target = next(x for x in d["stocks"] if x["id"] == stock["id"])
    remaining = target["remaining_today"]
    # Pick a price so high that auto would fail; but manual units of 10 should be OK.
    price = float(max(remaining, 1000.0))  # extremely high
    units = 10
    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": price, "units": units})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["units"] == units
    assert e["cost"] == round(units * price, 2)
    # Dashboard should reflect overspend but remaining_today clamps >= 0
    d2 = s.get(f"{API}/dashboard").json()
    t2 = next(x for x in d2["stocks"] if x["id"] == stock["id"])
    assert t2["spent"] >= e["cost"] - 0.01
    assert t2["units"] >= units
    assert t2["remaining_today"] >= 0.0
    s.delete(f"{API}/entries/{e['id']}")


# ---------- 3. Invalid units ----------
def test_units_zero_rejected(s, stock):
    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": 100.0, "units": 0})
    assert r.status_code == 400
    assert "units" in r.json().get("detail", "").lower()


def test_units_negative_rejected(s, stock):
    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": 100.0, "units": -3})
    assert r.status_code == 400
    assert "units" in r.json().get("detail", "").lower()


# ---------- 4. Price validation still enforced ----------
def test_price_zero_rejected_even_with_units(s, stock):
    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": 0, "units": 5})
    assert r.status_code == 400


def test_price_negative_rejected_even_with_units(s, stock):
    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": -10, "units": 5})
    assert r.status_code == 400


# ---------- 5. Dashboard reflects manual units correctly ----------
def test_dashboard_after_manual_units(s, stock):
    s.post(f"{API}/reset/logs")
    price = 25.5
    units = 7
    r = s.post(f"{API}/entries", json={"stock_id": stock["id"], "price": price, "units": units})
    assert r.status_code == 200
    e = r.json()

    d = s.get(f"{API}/dashboard").json()
    t = next(x for x in d["stocks"] if x["id"] == stock["id"])
    assert t["units"] == units
    assert abs(t["spent"] - round(units * price, 2)) < 0.01
    # remaining_today never negative (clamp)
    assert t["remaining_today"] >= 0.0
    s.delete(f"{API}/entries/{e['id']}")
