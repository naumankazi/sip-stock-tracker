"""SIP Tracker backend API tests"""
import os
import pytest
import requests

BASE_URL = "https://sip-stock-tracker.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module", autouse=True)
def clean_slate(s):
    # Reset before tests
    s.post(f"{API}/reset/logs")
    # Delete all stocks
    r = s.get(f"{API}/stocks")
    for st in r.json():
        s.delete(f"{API}/stocks/{st['id']}")
    s.post(f"{API}/reset/budget")
    yield
    # cleanup after
    s.post(f"{API}/reset/logs")
    r = s.get(f"{API}/stocks")
    for st in r.json():
        s.delete(f"{API}/stocks/{st['id']}")


# ---------- Settings ----------
def test_get_settings_defaults(s):
    r = s.get(f"{API}/settings")
    assert r.status_code == 200
    d = r.json()
    assert d["monthly_budget"] == 30000.0
    assert d["trading_days"] == 22
    assert d["currency"] == "INR"
    assert "_id" not in d


def test_put_settings_persists(s):
    r = s.put(f"{API}/settings", json={"monthly_budget": 40000, "trading_days": 20})
    assert r.status_code == 200
    d = s.get(f"{API}/settings").json()
    assert d["monthly_budget"] == 40000.0
    assert d["trading_days"] == 20


def test_put_settings_validation(s):
    assert s.put(f"{API}/settings", json={"trading_days": 0}).status_code == 400
    assert s.put(f"{API}/settings", json={"monthly_budget": -1}).status_code == 400


# ---------- Stocks ----------
STOCK_IDS = {}

def test_create_stocks(s):
    for sym, name, pct in [("RELI", "Reliance", 40), ("TCS", "TCS", 30), ("INFY", "Infosys", 30)]:
        r = s.post(f"{API}/stocks", json={"symbol": sym, "name": name, "allocation_pct": pct})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["symbol"] == sym
        assert d["allocation_pct"] == pct
        assert "_id" not in d
        STOCK_IDS[sym] = d["id"]


def test_list_stocks(s):
    r = s.get(f"{API}/stocks")
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) == 3
    for st in lst:
        assert "_id" not in st


def test_update_stock(s):
    sid = STOCK_IDS["RELI"]
    r = s.put(f"{API}/stocks/{sid}", json={"allocation_pct": 50})
    assert r.status_code == 200
    assert r.json()["allocation_pct"] == 50
    # revert
    s.put(f"{API}/stocks/{sid}", json={"allocation_pct": 40})


def test_create_stock_validation(s):
    assert s.post(f"{API}/stocks", json={"symbol": "", "name": "x"}).status_code == 400
    assert s.post(f"{API}/stocks", json={"symbol": "X", "name": "Y", "allocation_pct": 150}).status_code == 400


# ---------- Allocations ----------
def test_bulk_allocations(s):
    payload = {"allocations": [
        {"id": STOCK_IDS["RELI"], "allocation_pct": 40},
        {"id": STOCK_IDS["TCS"], "allocation_pct": 30},
        {"id": STOCK_IDS["INFY"], "allocation_pct": 30},
    ]}
    r = s.put(f"{API}/allocations", json=payload)
    assert r.status_code == 200
    total = sum(x["allocation_pct"] for x in r.json())
    assert total == 100


# ---------- Dashboard ----------
def test_dashboard_math(s):
    r = s.get(f"{API}/dashboard")
    assert r.status_code == 200
    d = r.json()
    assert d["currency"] == "INR"
    assert d["monthly_budget"] == 40000.0
    assert d["trading_days"] == 20
    assert d["total_alloc_pct"] == 100
    assert len(d["stocks"]) == 3
    # For each stock: daily_budget = monthly_budget * pct/100 / trading_days
    for stk in d["stocks"]:
        expected_daily = round(40000 * stk["allocation_pct"] / 100 / 20, 2)
        assert stk["daily_budget"] == expected_daily
        expected_accrued = round(expected_daily * d["days_elapsed"], 2)
        assert abs(stk["accrued"] - expected_accrued) < 0.02
        assert stk["spent"] == 0
        assert stk["remaining_today"] == round(stk["accrued"], 2)
    # totals sum
    total_daily = sum(stk["daily_budget"] for stk in d["stocks"])
    assert abs(d["totals"]["daily_budget"] - round(total_daily, 2)) < 0.02


# ---------- Entries ----------
ENTRY_IDS = []

def test_create_entry_and_rollover(s):
    # Get dashboard, pick reliance
    d = s.get(f"{API}/dashboard").json()
    reli = next(x for x in d["stocks"] if x["symbol"] == "RELI")
    remaining_before = reli["remaining_today"]
    price = 100.0
    expected_units = int(remaining_before // price)
    assert expected_units > 0, f"remaining {remaining_before} too small"

    r = s.post(f"{API}/entries", json={"stock_id": STOCK_IDS["RELI"], "price": price})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["units"] == expected_units
    assert e["cost"] == round(expected_units * price, 2)
    assert "_id" not in e
    ENTRY_IDS.append(e["id"])

    # Verify dashboard reflects reduced remaining
    d2 = s.get(f"{API}/dashboard").json()
    reli2 = next(x for x in d2["stocks"] if x["symbol"] == "RELI")
    assert reli2["spent"] == e["cost"]
    assert reli2["units"] == expected_units
    assert reli2["remaining_today"] < remaining_before


def test_entry_price_validation(s):
    r = s.post(f"{API}/entries", json={"stock_id": STOCK_IDS["TCS"], "price": 0})
    assert r.status_code == 400
    r = s.post(f"{API}/entries", json={"stock_id": STOCK_IDS["TCS"], "price": -5})
    assert r.status_code == 400


def test_entry_insufficient_budget(s):
    # Price way too high -> should reject
    r = s.post(f"{API}/entries", json={"stock_id": STOCK_IDS["TCS"], "price": 999999999})
    assert r.status_code == 400


def test_list_entries_newest_first(s):
    # Add another
    r = s.post(f"{API}/entries", json={"stock_id": STOCK_IDS["TCS"], "price": 50.0})
    assert r.status_code == 200
    ENTRY_IDS.append(r.json()["id"])

    r = s.get(f"{API}/entries")
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) >= 2
    # Sorted desc by created_at
    for i in range(len(lst) - 1):
        assert lst[i]["created_at"] >= lst[i + 1]["created_at"]

    # Filter
    r = s.get(f"{API}/entries", params={"stock_id": STOCK_IDS["TCS"]})
    assert r.status_code == 200
    for e in r.json():
        assert e["stock_id"] == STOCK_IDS["TCS"]


def test_delete_entry(s):
    eid = ENTRY_IDS[-1]
    r = s.delete(f"{API}/entries/{eid}")
    assert r.status_code == 200
    # verify gone
    r = s.get(f"{API}/entries")
    ids = [e["id"] for e in r.json()]
    assert eid not in ids


# ---------- Resets ----------
def test_reset_budget_only(s):
    # entries exist from before test (RELI entry still exists)
    entries_before = len(s.get(f"{API}/entries").json())
    stocks_before = len(s.get(f"{API}/stocks").json())

    r = s.post(f"{API}/reset/budget")
    assert r.status_code == 200
    settings = s.get(f"{API}/settings").json()
    assert settings["monthly_budget"] == 30000.0
    assert settings["trading_days"] == 22
    # entries & stocks unchanged
    assert len(s.get(f"{API}/entries").json()) == entries_before
    assert len(s.get(f"{API}/stocks").json()) == stocks_before


def test_reset_allocations_only(s):
    entries_before = len(s.get(f"{API}/entries").json())
    stocks_before = s.get(f"{API}/stocks").json()

    r = s.post(f"{API}/reset/allocations")
    assert r.status_code == 200
    stocks_after = s.get(f"{API}/stocks").json()
    assert len(stocks_after) == len(stocks_before)
    for st in stocks_after:
        assert st["allocation_pct"] == 0.0
    # entries preserved
    assert len(s.get(f"{API}/entries").json()) == entries_before


def test_reset_logs_only(s):
    stocks_before = len(s.get(f"{API}/stocks").json())
    r = s.post(f"{API}/reset/logs")
    assert r.status_code == 200
    # entries gone
    assert len(s.get(f"{API}/entries").json()) == 0
    # stocks preserved
    assert len(s.get(f"{API}/stocks").json()) == stocks_before


def test_delete_stock(s):
    sid = STOCK_IDS["INFY"]
    r = s.delete(f"{API}/stocks/{sid}")
    assert r.status_code == 200
    r = s.delete(f"{API}/stocks/{sid}")
    assert r.status_code == 404
