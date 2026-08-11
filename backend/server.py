from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ServerSelectionTimeoutError, PyMongoError
import os
import json
import hashlib
import secrets
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


# ---------------------- Password Hashing Helpers ----------------------

def hash_password(password: str, salt: Optional[str] = None) -> str:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return f"{salt}${hashed}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, _ = stored_hash.split('$')
        return hash_password(password, salt) == stored_hash
    except Exception:
        return False


# ---------------------- Models ----------------------

class UserRegister(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    created_at: str

class AuthResponse(BaseModel):
    token: str
    user: UserResponse


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
    date: str  # YYYY-MM-DD
    price: float
    units: int
    cost: float
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EntryCreate(BaseModel):
    stock_id: str
    price: float
    units: Optional[int] = None
    date: Optional[str] = None


class AllocationsUpdate(BaseModel):
    allocations: List[dict]


# ---------------------- Hybrid DB Abstraction with User Isolation & Persistence ----------------------

STORE_FILE = ROOT_DIR / "memory_store.json"

def load_memory_store() -> dict:
    if STORE_FILE.exists():
        try:
            with open(STORE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "users" not in data:
                    data["users"] = []
                if "user_settings" not in data:
                    data["user_settings"] = {}
                if "user_stocks" not in data:
                    data["user_stocks"] = {}
                if "user_entries" not in data:
                    data["user_entries"] = {}
                return data
        except Exception as e:
            logging.error(f"Error loading memory_store.json: {e}")
    return {
        "users": [],
        "tokens": {},
        "user_settings": {},
        "user_stocks": {},
        "user_entries": {},
        # Legacy fallback
        "settings": Settings().model_dump(),
        "stocks": [
            {"id": "sample-1", "symbol": "RELIANCE", "name": "Reliance Industries", "allocation_pct": 40.0, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "sample-2", "symbol": "TCS", "name": "Tata Consultancy Services", "allocation_pct": 60.0, "created_at": datetime.now(timezone.utc).isoformat()}
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


async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    global use_memory_fallback
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")
    token = authorization.split(" ")[1].strip()

    # Check token in memory store or db
    if token in MEMORY_STORE.get("tokens", {}):
        return MEMORY_STORE["tokens"][token]

    if not use_memory_fallback:
        try:
            tok_doc = await db.tokens.find_one({"token": token}, {"_id": 0})
            if tok_doc:
                MEMORY_STORE.setdefault("tokens", {})[token] = tok_doc["user_id"]
                return tok_doc["user_id"]
        except Exception:
            use_memory_fallback = True

    raise HTTPException(status_code=401, detail="Invalid session or token. Please log in again.")


# Migrate legacy data to first user
async def migrate_legacy_data_if_needed(user_id: str):
    global use_memory_fallback
    # Check if user already has data
    if user_id in MEMORY_STORE.get("user_settings", {}):
        return

    # Check if this is the first user
    is_first = len(MEMORY_STORE.get("users", [])) <= 1

    if is_first and MEMORY_STORE.get("stocks"):
        # Adopt legacy stocks, settings, entries
        MEMORY_STORE.setdefault("user_settings", {})[user_id] = MEMORY_STORE.get("settings", Settings().model_dump())
        MEMORY_STORE.setdefault("user_stocks", {})[user_id] = MEMORY_STORE.get("stocks", [])
        MEMORY_STORE.setdefault("user_entries", {})[user_id] = MEMORY_STORE.get("entries", [])
    else:
        # Give fresh default template
        MEMORY_STORE.setdefault("user_settings", {})[user_id] = Settings().model_dump()
        MEMORY_STORE.setdefault("user_stocks", {})[user_id] = [
            {"id": str(uuid.uuid4()), "symbol": "RELIANCE", "name": "Reliance Industries", "allocation_pct": 40.0, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "symbol": "TCS", "name": "Tata Consultancy Services", "allocation_pct": 60.0, "created_at": datetime.now(timezone.utc).isoformat()}
        ]
        MEMORY_STORE.setdefault("user_entries", {})[user_id] = []

    save_memory_store()


# ---------------------- User Isolated Data Helpers ----------------------

async def get_user_settings_doc(user_id: str) -> dict:
    global use_memory_fallback
    await migrate_legacy_data_if_needed(user_id)
    if not use_memory_fallback:
        try:
            doc = await db.user_settings.find_one({"user_id": user_id}, {"_id": 0})
            if not doc:
                s = MEMORY_STORE["user_settings"].get(user_id, Settings().model_dump())
                doc_to_save = {**s, "user_id": user_id}
                await db.user_settings.insert_one(doc_to_save.copy())
                return s
            return {k: v for k, v in doc.items() if k != "user_id"}
        except Exception:
            use_memory_fallback = True
    return MEMORY_STORE.setdefault("user_settings", {}).setdefault(user_id, Settings().model_dump()).copy()


async def save_user_settings_doc(user_id: str, data: dict):
    global use_memory_fallback
    MEMORY_STORE.setdefault("user_settings", {})[user_id] = data.copy()
    save_memory_store()
    if not use_memory_fallback:
        try:
            to_save = {**data, "user_id": user_id}
            await db.user_settings.update_one({"user_id": user_id}, {"$set": to_save}, upsert=True)
        except Exception:
            use_memory_fallback = True


async def get_user_stocks(user_id: str) -> List[dict]:
    global use_memory_fallback
    await migrate_legacy_data_if_needed(user_id)
    if not use_memory_fallback:
        try:
            rows = await db.user_stocks.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
            return [{k: v for k, v in r.items() if k != "user_id"} for r in rows]
        except Exception:
            use_memory_fallback = True
    return sorted(MEMORY_STORE.setdefault("user_stocks", {}).setdefault(user_id, []), key=lambda x: x.get("created_at", ""))


async def add_user_stock_doc(user_id: str, stock_doc: dict):
    global use_memory_fallback
    MEMORY_STORE.setdefault("user_stocks", {}).setdefault(user_id, []).append(stock_doc.copy())
    save_memory_store()
    if not use_memory_fallback:
        try:
            to_save = {**stock_doc, "user_id": user_id}
            await db.user_stocks.insert_one(to_save.copy())
        except Exception:
            use_memory_fallback = True


async def update_user_stock_doc(user_id: str, stock_id: str, update_fields: dict) -> Optional[dict]:
    global use_memory_fallback
    updated = None
    user_stocks = MEMORY_STORE.setdefault("user_stocks", {}).setdefault(user_id, [])
    for s in user_stocks:
        if s["id"] == stock_id:
            s.update(update_fields)
            updated = s.copy()
            break
    save_memory_store()
    if not use_memory_fallback:
        try:
            await db.user_stocks.update_one({"user_id": user_id, "id": stock_id}, {"$set": update_fields})
            doc = await db.user_stocks.find_one({"user_id": user_id, "id": stock_id}, {"_id": 0})
            if doc:
                return {k: v for k, v in doc.items() if k != "user_id"}
        except Exception:
            use_memory_fallback = True
    return updated


async def delete_user_stock_doc(user_id: str, stock_id: str) -> bool:
    global use_memory_fallback
    user_stocks = MEMORY_STORE.setdefault("user_stocks", {}).setdefault(user_id, [])
    initial_len = len(user_stocks)
    MEMORY_STORE["user_stocks"][user_id] = [s for s in user_stocks if s["id"] != stock_id]
    deleted = len(MEMORY_STORE["user_stocks"][user_id]) < initial_len
    save_memory_store()
    if not use_memory_fallback:
        try:
            res = await db.user_stocks.delete_one({"user_id": user_id, "id": stock_id})
            return res.deleted_count > 0
        except Exception:
            use_memory_fallback = True
    return deleted


async def get_user_month_entries(user_id: str, stock_id: str, month_prefix: str) -> List[dict]:
    global use_memory_fallback
    await migrate_legacy_data_if_needed(user_id)
    if not use_memory_fallback:
        try:
            entries = await db.user_entries.find(
                {"user_id": user_id, "stock_id": stock_id, "date": {"$regex": f"^{month_prefix}-"}},
                {"_id": 0},
            ).to_list(10000)
            return [{k: v for k, v in e.items() if k != "user_id"} for e in entries]
        except Exception:
            use_memory_fallback = True
    user_entries = MEMORY_STORE.setdefault("user_entries", {}).setdefault(user_id, [])
    return [e for e in user_entries if e.get("stock_id") == stock_id and str(e.get("date", "")).startswith(month_prefix)]


async def add_user_entry_doc(user_id: str, entry_doc: dict):
    global use_memory_fallback
    MEMORY_STORE.setdefault("user_entries", {}).setdefault(user_id, []).append(entry_doc.copy())
    save_memory_store()
    if not use_memory_fallback:
        try:
            to_save = {**entry_doc, "user_id": user_id}
            await db.user_entries.insert_one(to_save.copy())
        except Exception:
            use_memory_fallback = True


async def get_user_all_entries(user_id: str, stock_id: Optional[str] = None, limit: int = 500) -> List[dict]:
    global use_memory_fallback
    await migrate_legacy_data_if_needed(user_id)
    if not use_memory_fallback:
        try:
            query = {"user_id": user_id}
            if stock_id:
                query["stock_id"] = stock_id
            rows = await db.user_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
            return [{k: v for k, v in r.items() if k != "user_id"} for r in rows]
        except Exception:
            use_memory_fallback = True
    user_entries = MEMORY_STORE.setdefault("user_entries", {}).setdefault(user_id, [])
    res = [e for e in user_entries if not stock_id or e.get("stock_id") == stock_id]
    return sorted(res, key=lambda x: x.get("created_at", ""), reverse=True)[:limit]


async def delete_user_entry_doc(user_id: str, entry_id: str) -> bool:
    global use_memory_fallback
    user_entries = MEMORY_STORE.setdefault("user_entries", {}).setdefault(user_id, [])
    initial_len = len(user_entries)
    MEMORY_STORE["user_entries"][user_id] = [e for e in user_entries if e["id"] != entry_id]
    deleted = len(MEMORY_STORE["user_entries"][user_id]) < initial_len
    save_memory_store()
    if not use_memory_fallback:
        try:
            res = await db.user_entries.delete_one({"user_id": user_id, "id": entry_id})
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


# ---------------------- Auth Endpoints ----------------------

@api_router.post("/auth/register", response_model=AuthResponse)
async def register_user(payload: UserRegister):
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Valid email address required")
    if not payload.password or len(payload.password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters")

    # Check existing user
    users = MEMORY_STORE.setdefault("users", [])
    if any(u["email"] == email for u in users):
        raise HTTPException(400, "An account with this email already exists")

    user_id = str(uuid.uuid4())
    hashed = hash_password(payload.password)
    created_at = datetime.now(timezone.utc).isoformat()

    user_doc = {"id": user_id, "email": email, "password": hashed, "created_at": created_at}
    users.append(user_doc)

    token = f"token_{secrets.token_hex(24)}"
    MEMORY_STORE.setdefault("tokens", {})[token] = user_id
    save_memory_store()

    # Migrate legacy data if first user
    await migrate_legacy_data_if_needed(user_id)

    if not use_memory_fallback:
        try:
            await db.users.insert_one(user_doc.copy())
            await db.tokens.insert_one({"token": token, "user_id": user_id, "created_at": created_at})
        except Exception:
            pass

    return AuthResponse(token=token, user=UserResponse(id=user_id, email=email, created_at=created_at))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login_user(payload: UserLogin):
    email = payload.email.strip().lower()
    users = MEMORY_STORE.setdefault("users", [])

    user_doc = next((u for u in users if u["email"] == email), None)

    if not user_doc and not use_memory_fallback:
        try:
            db_u = await db.users.find_one({"email": email}, {"_id": 0})
            if db_u:
                user_doc = db_u
                users.append(db_u)
        except Exception:
            pass

    if not user_doc or not verify_password(payload.password, user_doc["password"]):
        raise HTTPException(400, "Invalid email or password")

    user_id = user_doc["id"]
    token = f"token_{secrets.token_hex(24)}"
    MEMORY_STORE.setdefault("tokens", {})[token] = user_id
    save_memory_store()

    if not use_memory_fallback:
        try:
            await db.tokens.insert_one({"token": token, "user_id": user_id, "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception:
            pass

    return AuthResponse(token=token, user=UserResponse(id=user_id, email=user_doc["email"], created_at=user_doc["created_at"]))


@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user_id: str = Depends(get_current_user_id)):
    users = MEMORY_STORE.setdefault("users", [])
    user_doc = next((u for u in users if u["id"] == user_id), None)
    if not user_doc:
        raise HTTPException(404, "User not found")
    return UserResponse(id=user_doc["id"], email=user_doc["email"], created_at=user_doc["created_at"])


# ---------------------- Settings ----------------------

@api_router.get("/settings")
async def get_settings(user_id: str = Depends(get_current_user_id)):
    return await get_user_settings_doc(user_id)


@api_router.put("/settings")
async def update_settings(update: SettingsUpdate, user_id: str = Depends(get_current_user_id)):
    current = await get_user_settings_doc(user_id)
    if update.monthly_budget is not None:
        if update.monthly_budget < 0:
            raise HTTPException(400, "monthly_budget must be >= 0")
        current["monthly_budget"] = float(update.monthly_budget)
    if update.trading_days is not None:
        if update.trading_days <= 0:
            raise HTTPException(400, "trading_days must be > 0")
        current["trading_days"] = int(update.trading_days)
    await save_user_settings_doc(user_id, current)
    return current


# ---------------------- Stocks ----------------------

@api_router.get("/stocks", response_model=List[Stock])
async def list_stocks(user_id: str = Depends(get_current_user_id)):
    rows = await get_user_stocks(user_id)
    return [Stock(**r) for r in rows]


@api_router.post("/stocks", response_model=Stock)
async def create_stock(payload: StockCreate, user_id: str = Depends(get_current_user_id)):
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
    await add_user_stock_doc(user_id, doc)
    return stock


@api_router.put("/stocks/{stock_id}", response_model=Stock)
async def update_stock(stock_id: str, payload: StockUpdate, user_id: str = Depends(get_current_user_id)):
    update = {}
    if payload.symbol is not None:
        update["symbol"] = payload.symbol.strip().upper()
    if payload.name is not None:
        update["name"] = payload.name.strip()
    if payload.allocation_pct is not None:
        if payload.allocation_pct < 0 or payload.allocation_pct > 100:
            raise HTTPException(400, "allocation_pct must be between 0 and 100")
        update["allocation_pct"] = float(payload.allocation_pct)
    doc = await update_user_stock_doc(user_id, stock_id, update)
    if not doc:
        raise HTTPException(404, "stock not found")
    return Stock(**doc)


@api_router.delete("/stocks/{stock_id}")
async def delete_stock(stock_id: str, user_id: str = Depends(get_current_user_id)):
    ok = await delete_user_stock_doc(user_id, stock_id)
    if not ok:
        raise HTTPException(404, "stock not found")
    return {"ok": True, "deleted_id": stock_id}


@api_router.put("/allocations")
async def update_allocations(payload: AllocationsUpdate, user_id: str = Depends(get_current_user_id)):
    for item in payload.allocations:
        sid = item.get("id")
        pct = item.get("allocation_pct")
        if sid is None or pct is None:
            continue
        pct = float(pct)
        if pct < 0 or pct > 100:
            raise HTTPException(400, f"invalid allocation_pct for {sid}")
        await update_user_stock_doc(user_id, sid, {"allocation_pct": pct})
    rows = await get_user_stocks(user_id)
    return [Stock(**r) for r in rows]


# ---------------------- Dashboard ----------------------

@api_router.get("/dashboard")
async def get_dashboard(user_id: str = Depends(get_current_user_id)):
    settings = await get_user_settings_doc(user_id)
    stocks = await get_user_stocks(user_id)

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

        entries = await get_user_month_entries(user_id, s["id"], mk)
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
async def create_entry(payload: EntryCreate, user_id: str = Depends(get_current_user_id)):
    if payload.price <= 0:
        raise HTTPException(400, "price must be > 0")
    stocks = await get_user_stocks(user_id)
    stock = next((s for s in stocks if s["id"] == payload.stock_id), None)
    if not stock:
        raise HTTPException(404, "stock not found")

    settings = await get_user_settings_doc(user_id)
    entry_date_str = payload.date or datetime.now().date().strftime("%Y-%m-%d")
    entry_date = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
    today = datetime.now().date()

    days_elapsed = min(business_days_elapsed(entry_date if entry_date <= today else today), settings["trading_days"])
    pct = float(stock.get("allocation_pct", 0))
    monthly_alloc = settings["monthly_budget"] * pct / 100.0
    daily_budget = monthly_alloc / settings["trading_days"] if settings["trading_days"] else 0
    accrued = daily_budget * days_elapsed

    mk = month_key(entry_date)
    existing = await get_user_month_entries(user_id, payload.stock_id, mk)
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
    await add_user_entry_doc(user_id, doc)
    return entry


@api_router.get("/entries", response_model=List[Entry])
async def list_entries(stock_id: Optional[str] = None, limit: int = 500, user_id: str = Depends(get_current_user_id)):
    rows = await get_user_all_entries(user_id, stock_id=stock_id, limit=limit)
    return [Entry(**r) for r in rows]


@api_router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, user_id: str = Depends(get_current_user_id)):
    ok = await delete_user_entry_doc(user_id, entry_id)
    if not ok:
        raise HTTPException(404, "entry not found")
    return {"ok": True, "deleted_id": entry_id}


# ---------------------- Reset ----------------------

@api_router.post("/reset/budget")
async def reset_budget(user_id: str = Depends(get_current_user_id)):
    defaults = Settings().model_dump()
    await save_user_settings_doc(user_id, defaults)
    return defaults


@api_router.post("/reset/allocations")
async def reset_allocations(user_id: str = Depends(get_current_user_id)):
    stocks = await get_user_stocks(user_id)
    for s in stocks:
        await update_user_stock_doc(user_id, s["id"], {"allocation_pct": 0.0})
    rows = await get_user_stocks(user_id)
    return [Stock(**r) for r in rows]


@api_router.post("/reset/logs")
async def reset_logs(user_id: str = Depends(get_current_user_id)):
    global use_memory_fallback
    MEMORY_STORE.setdefault("user_entries", {})[user_id] = []
    save_memory_store()
    if not use_memory_fallback:
        try:
            res = await db.user_entries.delete_many({"user_id": user_id})
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
