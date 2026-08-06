# Daily SIP Stock Tracker — PRD

## Overview
Single-user mobile app (Expo + FastAPI + MongoDB) to track a daily SIP strategy for 3–4 Indian stocks in INR. Manual price entry, whole units only.

## Core Features

### Settings
- **Monthly Budget** (INR): total to invest per month.
- **Trading Days**: number of business days in the month (default 22).
- **Stocks**: user-configurable list (add/edit symbol, name, remove). 3–4 recommended.
- **Allocations**: percentage per stock, must total 100% on save.

### Dashboard
- Hero card: monthly budget, month-to-date spent, total available today (with day X/Y indicator).
- Per-stock card: symbol, name, allocation %, available today, daily budget, units owned, spent progress bar.
- Tap stock → Bottom sheet to enter current price → computes whole units + cost → confirm to log buy.
- Automatic **rollover**: unspent daily budget compounds each business day (accrued = daily × business_days_elapsed − spent).

### History
- Chronological ledger of every buy entry: date, symbol, price, units, cost.
- Horizontal filter chips by stock; delete individual entries.
- Aggregate: total entries + total invested.

### Independent Resets (Danger Zone in Settings)
- Reset Budget & Trading Days (to defaults 30000 / 22)
- Reset Allocations (all → 0%)
- Clear All History Logs
Each is independent — none wipes everything at once.

## Backend Endpoints (`/api`)
- `GET/PUT /settings` · `GET/POST /stocks` · `PUT/DELETE /stocks/{id}` · `PUT /allocations`
- `GET /dashboard` (aggregated calculations)
- `POST /entries` (validates price, computes whole units from remaining) · `GET /entries` · `DELETE /entries/{id}`
- `POST /reset/budget` · `POST /reset/allocations` · `POST /reset/logs`

## Calculation Logic
- `daily_budget[stock] = monthly_budget × allocation_pct/100 ÷ trading_days`
- `business_days_elapsed` = Mon–Fri days from 1st of month up to today (capped at trading_days)
- `accrued[stock] = daily_budget × business_days_elapsed`
- `remaining_today[stock] = max(accrued − spent_this_month, 0)` → this is the rollover-aware budget
- `units_to_buy = floor(remaining_today ÷ price)`, `cost = units × price`

## Design
- Sage green / stone palette per `design_guidelines.json`. iOS-clean personality.
- Bottom-tab navigation (Dashboard / History / Settings).
- Hero card uses stone-texture background image with dark gradient scrim.

## Not in scope
- Auth / multi-user
- Live price fetch
- Fractional units
