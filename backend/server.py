from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ServerSelectionTimeoutError, PyMongoError
import os
import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, date, timedelta, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection with 1.5s timeout for fast fallback
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'sip_stock_tracker')
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1500)
db = client[db_name]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ---------------------- Models ----------------------

class Settings(BaseModel):
    monthly_budget: float = 30000.0
    trading_days: int = 22
    currency: str = "INR"

class SettingsUpdate(BaseModel):
    monthly_budget: Optional[float] = None
    trading_days: Optional[int] = None


class Stock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol: str
    name: str
    allocation_pct: float
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class StockCreate(BaseModel):
    symbol: str
    name: str
    allocation_pct: float = 0.0

class StockUpdate(BaseModel):
    symbol: Optional[str] = None
    name: Optional[str] = None
    allocation_pct: Optional[float] = None


class Entry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_id: str
    symbol: str
    name: str
    date: str  # YYYY-MM-DD (local trading date)
    price: float
    units: int
    cost: float
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EntryCreate(BaseModel):
    stock_id: str
    price: float
    units: Optional[int] = None  # if None, auto-computed as floor(remaining / price)
    date: Optional[str] = None  # defaults to today


class AllocationsUpdate(BaseModel):
    allocations: List[dict]  # [{ "id": stock_id, "allocation_pct": 25.0 }]


# ---------------------- Hybrid DB Abstraction with Persistence ----------------------

SETTINGS_KEY = "singleton"
STORE_FILE = ROOT_DIR / "memory_store.json"

def load_memory_store() -> dict:
    if STORE_FILE.exists():
        try:
            with open(STORE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data
        except Exception as e:
            logging.error(f"Error loading memory_store.json: {e}")
    return {
        "settings": Settings().model_dump(),
        "stocks": [
            {
                "id": "sample-1",
                "symbol": "RELIANCE",
                "name": "Reliance Industries",
                "allocation_pct": 40.0,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": "sample-2",
                "symbol": "TCS",
                "name": "Tata Consultancy Services",
                "allocation_pct": 60.0,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ],
        "entries": []
    }

def save_memory_store():
    try:
        with open(STORE_FILE, "w", encoding="utf-8") as f:
            json.dump(MEMORY_STORE, f, indent=2)
    except Exception as e:
        logging.error(f"Error saving memory_store.json: {e}")

MEMORY_STORE = load_memory_store()
use_memory_fallback = False

async def get_settings_doc() -> dict:
    global use_memory_fallback
    if not use_memory_fallback:
        try:
            doc = await db.settings.find_one({"_key": SETTINGS_KEY}, {"_id": 0})
            if not doc:
                s = MEMORY_STORE["settings"].copy()
                s["_key"] = SETTINGS_KEY
                await db.settings.insert_one(s.copy())
                doc = {k: v for k, v in s.items() if k != "_key"}
            else:
                doc = {k: v for k, v in doc.items() if k != "_key"}
            return doc
        except (ServerSelectionTimeoutError, PyMongoError, Exception) as e:
            logging.warning(f"MongoDB not available, switching to persistent in-memory store: {e}")
            use_memory_fallback = True
    return MEMORY_STORE["settings"].copy()


async def save_settings_doc(data: dict):
    global use_memory_fallback
    MEMORY_STORE["settings"] = data.copy()
    save_memory_store()
    if not use_memory_fallback:
        try:
            to_save = {**data, "_key": SETTINGS_KEY}
            await db.settings.update_one({"_key": SETTINGS_KEY}, {"$set": to_save}, upsert=True)
        except Exception as e:
            use_memory_fallback = True


async def get_all_stocks() -> List[dict]:
    global use_memory_fallback
    if not use_memory_fallback:
        try:
            rows = await db.stocks.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
            return rows
        except Exception:
            use_memory_fallback = True
    return sorted(MEMORY_STORE["stocks"], key=lambda x: x.get("created_at", ""))


async def add_stock_doc(stock_doc: dict):
    global use_memory_fallback
    MEMORY_STORE["stocks"].append(stock_doc.copy())
    save_memory_store()
    if not use_memory_fallback:
        try:
            await db.stocks.insert_one(stock_doc.copy())
        except Exception:
            use_memory_fallback = True


async def update_stock_doc(stock_id: str, update_fields: dict) -> Optional[dict]:
    global use_memory_fallback
    updated = None
    for s in MEMORY_STORE["stocks"]:
        if s["id"] == stock_id:
            s.update(update_fields)
            updated = s.copy()
            break
    save_memory_store()
    if not use_memory_fallback:
        try:
            await db.stocks.update_one({"id": stock_id}, {"$set": update_fields})
            doc = await db.stocks.find_one({"id": stock_id}, {"_id": 0})
            if doc:
                return doc
        except Exception:
            use_memory_fallback = True
    return updated


async def delete_stock_doc(stock_id: str) -> bool:
    global use_memory_fallback
    initial_len = len(MEMORY_STORE["stocks"])
    MEMORY_STORE["stocks"] = [s for s in MEMORY_STORE["stocks"] if s["id"] != stock_id]
    deleted = len(MEMORY_STORE["stocks"]) < initial_len
    save_memory_store()
    if not use_memory_fallback:
        try:
            res = await db.stocks.delete_one({"id": stock_id})
            return res.deleted_count > 0
        except Exception:
            use_memory_fallback = True
    return deleted


async def get_month_entries(stock_id: str, month_prefix: str) -> List[dict]:
    global use_memory_fallback
    if not use_memory_fallback:
        try:
            entries = await db.entries.find(
                {"stock_id": stock_id, "date": {"$regex": f"^{month_prefix}-"}},
                {"_id": 0},
            ).to_list(10000)
            return entries
        except Exception:
            use_memory_fallback = True
    return [e for e in MEMORY_STORE["entries"] if e.get("stock_id") == stock_id and str(e.get("date", "")).startswith(month_prefix)]


async def add_entry_doc(entry_doc: dict):
    global use_memory_fallback
    MEMORY_STORE["entries"].append(entry_doc.copy())
    save_memory_store()
    if not use_memory_fallback:
        try:
            await db.entries.insert_one(entry_doc.copy())
        except Exception:
            use_memory_fallback = True


async def get_all_entries(stock_id: Optional[str] = None, limit: int = 500) -> List[dict]:
    global use_memory_fallback
    if not use_memory_fallback:
        try:
            query = {}
            if stock_id:
                query["stock_id"] = stock_id
            rows = await db.entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
            return rows
        except Exception:
            use_memory_fallback = True
    res = [e for e in MEMORY_STORE["entries"] if not stock_id or e.get("stock_id") == stock_id]
    return sorted(res, key=lambda x: x.get("created_at", ""), reverse=True)[:limit]


async def delete_entry_doc(entry_id: str) -> bool:
    global use_memory_fallback
    initial_len = len(MEMORY_STORE["entries"])
    MEMORY_STORE["entries"] = [e for e in MEMORY_STORE["entries"] if e["id"] != entry_id]
    deleted = len(MEMORY_STORE["entries"]) < initial_len
    save_memory_store()
    if not use_memory_fallback:
        try:
            res = await db.entries.delete_one({"id": entry_id})
            return res.deleted_count > 0
        except Exception:
            use_memory_fallback = True
    return deleted


def business_days_elapsed(today: date) -> int:
    first = today.replace(day=1)
    d = first
    count = 0
    while d <= today:
        if d.weekday() < 5:
            count += 1
        d += timedelta(days=1)
    return count


def month_key(d: date) -> str:
    return d.strftime("%Y-%m")


# ---------------------- Settings ----------------------

@api_router.get("/settings")
async def get_settings():
    return await get_settings_doc()


@api_router.put("/settings")
async def update_settings(update: SettingsUpdate):
    current = await get_settings_doc()
    if update.monthly_budget is not None:
        if update.monthly_budget < 0:
            raise HTTPException(400, "monthly_budget must be >= 0")
        current["monthly_budget"] = float(update.monthly_budget)
    if update.trading_days is not None:
        if update.trading_days <= 0:
            raise HTTPException(400, "trading_days must be > 0")
        current["trading_days"] = int(update.trading_days)
    await save_settings_doc(current)
    return current


# ---------------------- Stocks ----------------------

@api_router.get("/stocks", response_model=List[Stock])
async def list_stocks():
    rows = await get_all_stocks()
    return [Stock(**r) for r in rows]


@api_router.post("/stocks", response_model=Stock)
async def create_stock(payload: StockCreate):
    if not payload.symbol.strip() or not payload.name.strip():
        raise HTTPException(400, "symbol and name are required")
    if payload.allocation_pct < 0 or payload.allocation_pct > 100:
        raise HTTPException(400, "allocation_pct must be between 0 and 100")
    stock = Stock(
        symbol=payload.symbol.strip().upper(),
        name=payload.name.strip(),
        allocation_pct=float(payload.allocation_pct),
    )
    doc = stock.model_dump()
    await add_stock_doc(doc)
    return stock


@api_router.put("/stocks/{stock_id}", response_model=Stock)
async def update_stock(stock_id: str, payload: StockUpdate):
    update = {}
    if payload.symbol is not None:
        update["symbol"] = payload.symbol.strip().upper()
    if payload.name is not None:
        update["name"] = payload.name.strip()
    if payload.allocation_pct is not None:
        if payload.allocation_pct < 0 or payload.allocation_pct > 100:
            raise HTTPException(400, "allocation_pct must be between 0 and 100")
        update["allocation_pct"] = float(payload.allocation_pct)
    doc = await update_stock_doc(stock_id, update)
    if not doc:
        raise HTTPException(404, "stock not found")
    return Stock(**doc)


@api_router.delete("/stocks/{stock_id}")
async def delete_stock(stock_id: str):
    ok = await delete_stock_doc(stock_id)
    if not ok:
        raise HTTPException(404, "stock not found")
    return {"ok": True, "deleted_id": stock_id}


@api_router.put("/allocations")
async def update_allocations(payload: AllocationsUpdate):
    for item in payload.allocations:
        sid = item.get("id")
        pct = item.get("allocation_pct")
        if sid is None or pct is None:
            continue
        pct = float(pct)
        if pct < 0 or pct > 100:
            raise HTTPException(400, f"invalid allocation_pct for {sid}")
        await update_stock_doc(sid, {"allocation_pct": pct})
    rows = await get_all_stocks()
    return [Stock(**r) for r in rows]


# ---------------------- Dashboard ----------------------

@api_router.get("/dashboard")
async def get_dashboard():
    settings = await get_settings_doc()
    stocks = await get_all_stocks()

    today = datetime.now().date()
    days_elapsed_raw = business_days_elapsed(today)
    days_elapsed = min(days_elapsed_raw, settings["trading_days"])
    mk = month_key(today)

    total_alloc_pct = sum(s.get("allocation_pct", 0) for s in stocks)

    per_stock = []
    total_daily_budget = 0.0
    total_accrued = 0.0
    total_spent = 0.0
    total_units = 0

    for s in stocks:
        pct = float(s.get("allocation_pct", 0))
        monthly_alloc = settings["monthly_budget"] * pct / 100.0
        daily_budget = monthly_alloc / settings["trading_days"] if settings["trading_days"] else 0
        accrued = daily_budget * days_elapsed

        entries = await get_month_entries(s["id"], mk)
        spent = sum(e.get("cost", 0) for e in entries)
        units = sum(int(e.get("units", 0)) for e in entries)

        today_str = today.strftime("%Y-%m-%d")
        today_entries = [e for e in entries if e.get("date") == today_str]
        today_spent = sum(e.get("cost", 0) for e in today_entries)

        remaining = max(accrued - spent, 0.0)

        per_stock.append({
            "id": s["id"],
            "symbol": s["symbol"],
            "name": s["name"],
            "allocation_pct": pct,
            "monthly_alloc": round(monthly_alloc, 2),
            "daily_budget": round(daily_budget, 2),
            "accrued": round(accrued, 2),
            "spent": round(spent, 2),
            "units": units,
            "today_spent": round(today_spent, 2),
            "remaining_today": round(remaining, 2),
        })
        total_daily_budget += daily_budget
        total_accrued += accrued
        total_spent += spent
        total_units += units

    return {
        "currency": settings.get("currency", "INR"),
        "monthly_budget": settings["monthly_budget"],
        "trading_days": settings["trading_days"],
        "days_elapsed": days_elapsed,
        "days_elapsed_raw": days_elapsed_raw,
        "today": today.strftime("%Y-%m-%d"),
        "month": mk,
        "total_alloc_pct": round(total_alloc_pct, 2),
        "totals": {
            "daily_budget": round(total_daily_budget, 2),
            "accrued": round(total_accrued, 2),
            "spent": round(total_spent, 2),
            "remaining_today": round(max(total_accrued - total_spent, 0.0), 2),
            "units": total_units,
        },
        "stocks": per_stock,
    }


# ---------------------- Entries ----------------------

@api_router.post("/entries", response_model=Entry)
async def create_entry(payload: EntryCreate):
    if payload.price <= 0:
        raise HTTPException(400, "price must be > 0")
    stocks = await get_all_stocks()
    stock = next((s for s in stocks if s["id"] == payload.stock_id), None)
    if not stock:
        raise HTTPException(404, "stock not found")

    settings = await get_settings_doc()
    entry_date_str = payload.date or datetime.now().date().strftime("%Y-%m-%d")
    entry_date = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
    today = datetime.now().date()

    days_elapsed = min(business_days_elapsed(entry_date if entry_date <= today else today), settings["trading_days"])
    pct = float(stock.get("allocation_pct", 0))
    monthly_alloc = settings["monthly_budget"] * pct / 100.0
    daily_budget = monthly_alloc / settings["trading_days"] if settings["trading_days"] else 0
    accrued = daily_budget * days_elapsed

    mk = month_key(entry_date)
    existing = await get_month_entries(payload.stock_id, mk)
    spent = sum(e.get("cost", 0) for e in existing)
    remaining = max(accrued - spent, 0.0)

    if payload.units is not None:
        if payload.units <= 0:
            raise HTTPException(400, "units must be > 0")
        units = int(payload.units)
    else:
        units = int(remaining // payload.price)
        if units <= 0:
            raise HTTPException(400, "insufficient remaining budget to buy 1 whole unit at this price")
    cost = round(units * payload.price, 2)

    entry = Entry(
        stock_id=payload.stock_id,
        symbol=stock["symbol"],
        name=stock["name"],
        date=entry_date_str,
        price=float(payload.price),
        units=units,
        cost=cost,
    )
    doc = entry.model_dump()
    await add_entry_doc(doc)
    return entry


@api_router.get("/entries", response_model=List[Entry])
async def list_entries(stock_id: Optional[str] = None, limit: int = 500):
    rows = await get_all_entries(stock_id=stock_id, limit=limit)
    return [Entry(**r) for r in rows]


@api_router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str):
    ok = await delete_entry_doc(entry_id)
    if not ok:
        raise HTTPException(404, "entry not found")
    return {"ok": True, "deleted_id": entry_id}


# ---------------------- Reset ----------------------

@api_router.post("/reset/budget")
async def reset_budget():
    defaults = Settings().model_dump()
    await save_settings_doc(defaults)
    return defaults


@api_router.post("/reset/allocations")
async def reset_allocations():
    stocks = await get_all_stocks()
    for s in stocks:
        await update_stock_doc(s["id"], {"allocation_pct": 0.0})
    rows = await get_all_stocks()
    return [Stock(**r) for r in rows]


@api_router.post("/reset/logs")
async def reset_logs():
    global use_memory_fallback
    MEMORY_STORE["entries"].clear()
    save_memory_store()
    if not use_memory_fallback:
        try:
            res = await db.entries.delete_many({})
            return {"ok": True, "deleted_count": res.deleted_count}
        except Exception:
            use_memory_fallback = True
    return {"ok": True, "deleted_count": 0}


@api_router.get("/")
async def root():
    return {"message": "SIP Tracker API"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
