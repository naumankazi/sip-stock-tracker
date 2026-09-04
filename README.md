# 📈 SIP Stock Tracker

A modern, mobile-first Daily SIP Stock Tracking application built with **React Native (Expo Router)** and **FastAPI (Python)**. It helps you manage daily rupee-cost-averaging investment plans, isolate budget allocations per stock, track unit purchases, and maintain portfolio discipline.

---

## ✨ Features

- **Multi-User Authentication**: Register and log in securely with salted PBKDF2-SHA256 password hashing. Every user gets an isolated, 100% private portfolio workspace.
- **Dynamic Daily SIP Allocation**: Calculates exact daily target budgets based on custom monthly budget and business trading days in the month (e.g. 22 trading days).
- **Dashboard Metrics**:
  - **Hero Header**: Total monthly budget, total spent, and available funds today.
  - **Per-Stock Cards**: Displays **Units Bought** this month, **Can Buy** (estimated units based on available budget and last price), available daily funds, and spent vs. accrued progress bar.
- **Strict Budget Isolation**: Over-spending on Stock A stays strictly isolated to Stock A and **never hampers or reduces** Stock B or Stock C's daily budget.
- **Auto-Saving Settings**: Custom monthly budget and trading days in Settings are automatically saved to persistent storage (`memory_store.json` + MongoDB) on every save or stock operation.
- **Buy History Logs**: Log buy entries with price and units, view historical logs per stock, and delete entries anytime.

---

## 🏗️ Project Architecture

```text
sip-stock-tracker/
├── backend/
│   ├── server.py              # FastAPI application with Auth, Settings, Stocks, Entries & Dashboard endpoints
│   ├── requirements.txt       # Python dependencies (uvicorn, fastapi, pydantic, motor, passlib)
│   ├── Procfile               # Production web process definition for Render / Railway
│   └── memory_store.json      # Persistent local disk backup store (<10ms instant startup)
└── frontend/
    ├── app/
    │   ├── _layout.tsx        # Root layout with Theme, Toast, and AuthProvider wrappers
    │   └── (tabs)/
    │       ├── index.tsx      # Main Dashboard with stock cards and buy modal
    │       ├── settings.tsx   # Account info, budget configuration, stock allocations & reset tools
    │       └── history.tsx    # Purchase logs history & deletion
    ├── src/
    │   ├── api.ts             # API client with automatic Bearer token header
    │   └── auth.tsx           # Authentication Context & Sign Up / Log In screen
    ├── app.json               # Expo configuration (slug: "sip-stock-tracker")
    └── package.json           # Node.js dependencies
```

---

## 🚀 Quick Start Guide

### 1) Start the Backend API

Open Terminal 1:

```powershell
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

- API Base URL: `http://localhost:8000/api`
- Health check: `http://localhost:8000/api/`

---

### 2) Configure Frontend Environment

Open Terminal 2:

```powershell
cd frontend
copy .env.example .env
```

Edit `frontend/.env` and set your local computer LAN IP address (or live Render URL):

```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.137.182:8000 //https://sip-stock-tracker.onrender.com
```

> **Tip (Windows)**: Find your Wi-Fi IPv4 address using `ipconfig`.

---

### 3) Install Frontend & Run Expo Go

In Terminal 2:

```powershell
npm install
npx expo start --clear
```

---

### 4) Open on Mobile Phone

1. Install **Expo Go** from Google Play Store or iOS App Store.
2. Scan the QR code displayed in terminal using:
   - **Android**: Scan QR code inside Expo Go app.
   - **iOS**: Scan QR code with native Camera app.
3. Sign up with your email and password to start tracking!

---

## ☁️ Deploying to Production & Expo Cloud

- **Backend Deployment**: Hosted on [Render](https://render.com) connected to MongoDB Atlas.
- **Expo Cloud Updates**: Publish over-the-air updates to Expo Cloud using:
  ```powershell
  npx eas-cli project:init
  npx eas-cli update --branch preview --message "Latest updates"
  ```

For detailed step-by-step production deployment instructions, custom domains, and native app store builds, view [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md).

---

## 🛠️ Tech Stack

- **Frontend**: React Native, Expo SDK 52, Expo Router, TypeScript, Vector Icons, Linear Gradient.
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Pydantic, Motor (MongoDB async driver), Passlib (PBKDF2 password hashing).
- **Deployment**: Render, MongoDB Atlas, Expo Application Services (EAS).
