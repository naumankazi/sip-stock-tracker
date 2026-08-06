from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, date, timedelta, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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


# ---------------------- Helpers ----------------------

SETTINGS_KEY = "singleton"

async def get_settings_doc() -> dict:
    doc = await db.settings.find_one({"_key": SETTINGS_KEY}, {"_id": 0})
    if not doc:
        s = Settings().model_dump()
        s["_key"] = SETTINGS_KEY
        await db.settings.insert_one(s.copy())
        doc = {k: v for k, v in s.items() if k != "_key"}
    else:
        doc = {k: v for k, v in doc.items() if k != "_key"}
    return doc


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
    to_save = {**current, "_key": SETTINGS_KEY}
    await db.settings.update_one({"_key": SETTINGS_KEY}, {"$set": to_save}, upsert=True)
    return current


# ---------------------- Stocks ----------------------

@api_router.get("/stocks", response_model=List[Stock])
async def list_stocks():
    rows = await db.stocks.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
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
    await db.stocks.insert_one(doc.copy())
    return stock


@api_router.put("/stocks/{stock_id}", response_model=Stock)
async def update_stock(stock_id: str, payload: StockUpdate):
    existing = await db.stocks.find_one({"id": stock_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "stock not found")
    update = {}
    if payload.symbol is not None:
        update["symbol"] = payload.symbol.strip().upper()
    if payload.name is not None:
        update["name"] = payload.name.strip()
    if payload.allocation_pct is not None:
        if payload.allocation_pct < 0 or payload.allocation_pct > 100:
            raise HTTPException(400, "allocation_pct must be between 0 and 100")
        update["allocation_pct"] = float(payload.allocation_pct)
    if update:
        await db.stocks.update_one({"id": stock_id}, {"$set": update})
    doc = await db.stocks.find_one({"id": stock_id}, {"_id": 0})
    return Stock(**doc)


@api_router.delete("/stocks/{stock_id}")
async def delete_stock(stock_id: str):
    res = await db.stocks.delete_one({"id": stock_id})
    if res.deleted_count == 0:
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
        await db.stocks.update_one({"id": sid}, {"$set": {"allocation_pct": pct}})
    rows = await db.stocks.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return [Stock(**r) for r in rows]


# ---------------------- Dashboard ----------------------

@api_router.get("/dashboard")
async def get_dashboard():
    settings = await get_settings_doc()
    stocks = await db.stocks.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)

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

        # Sum entries for this stock this month
        entries = await db.entries.find(
            {"stock_id": s["id"], "date": {"$regex": f"^{mk}-"}},
            {"_id": 0},
        ).to_list(10000)
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
    stock = await db.stocks.find_one({"id": payload.stock_id}, {"_id": 0})
    if not stock:
        raise HTTPException(404, "stock not found")

    settings = await get_settings_doc()
    entry_date_str = payload.date or datetime.now().date().strftime("%Y-%m-%d")
    entry_date = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
    today = datetime.now().date()

    # Compute remaining budget available for this stock as of entry_date
    days_elapsed = min(business_days_elapsed(entry_date if entry_date <= today else today), settings["trading_days"])
    pct = float(stock.get("allocation_pct", 0))
    monthly_alloc = settings["monthly_budget"] * pct / 100.0
    daily_budget = monthly_alloc / settings["trading_days"] if settings["trading_days"] else 0
    accrued = daily_budget * days_elapsed

    mk = month_key(entry_date)
    existing = await db.entries.find(
        {"stock_id": payload.stock_id, "date": {"$regex": f"^{mk}-"}},
        {"_id": 0},
    ).to_list(10000)
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
    await db.entries.insert_one(doc.copy())
    return entry


@api_router.get("/entries", response_model=List[Entry])
async def list_entries(stock_id: Optional[str] = None, limit: int = 500):
    query = {}
    if stock_id:
        query["stock_id"] = stock_id
    rows = await db.entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [Entry(**r) for r in rows]


@api_router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str):
    res = await db.entries.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "entry not found")
    return {"ok": True, "deleted_id": entry_id}


# ---------------------- Reset ----------------------

@api_router.post("/reset/budget")
async def reset_budget():
    defaults = Settings().model_dump()
    to_save = {**defaults, "_key": SETTINGS_KEY}
    await db.settings.update_one({"_key": SETTINGS_KEY}, {"$set": to_save}, upsert=True)
    return {k: v for k, v in defaults.items()}


@api_router.post("/reset/allocations")
async def reset_allocations():
    await db.stocks.update_many({}, {"$set": {"allocation_pct": 0.0}})
    rows = await db.stocks.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return [Stock(**r) for r in rows]


@api_router.post("/reset/logs")
async def reset_logs():
    res = await db.entries.delete_many({})
    return {"ok": True, "deleted_count": res.deleted_count}


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
