# SIP Stock Tracker

This project has:
- Backend: FastAPI service in backend
- Frontend: Expo React Native app in frontend

Use this guide to run everything locally and test on a real phone with Expo Go.

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+ (validated here with Python 3.13)
- Expo Go app on your phone (Android or iOS)
- Phone and development machine on the same Wi-Fi network

## 1) Start the Backend API

Open Terminal 1 from the repository root and run:

```powershell
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 8000
```

Expected output includes:
- Uvicorn running on http://0.0.0.0:8000

Quick health check in a browser:
- http://localhost:8000/api/

## 2) Configure Frontend API URL for Expo Go

Expo Go on a physical phone cannot use localhost from your computer.
Set your computer LAN IP in frontend/.env.

1. Copy the example env file if needed:

```powershell
cd frontend
copy .env.example .env
```

2. Edit frontend/.env and set:

```env
EXPO_PUBLIC_BACKEND_URL=http://YOUR_COMPUTER_LAN_IP:8000
```

Example:

```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.100:8000
```

Tip (Windows): find your IP with:

```powershell
ipconfig
```

Use the IPv4 address of your active Wi-Fi adapter.

## 3) Install Frontend Dependencies

Open Terminal 2:

```powershell
cd frontend
npm install
```

## 4) Start Expo Dev Server

From frontend:

```powershell
npx expo start --lan --clear
```

If LAN mode does not connect on your network, try:

```powershell
npx expo start --tunnel --clear
```

## 5) Open in Expo Go

1. Launch Expo Go on your phone.
2. Scan the QR code shown in the Expo terminal.
3. The app should load and call your local backend using EXPO_PUBLIC_BACKEND_URL.

## 6) Verify App-to-Backend Connection

- In the app, perform actions that trigger API calls (stocks, entries, settings).
- Confirm backend terminal logs requests.
- If needed, verify URL manually in mobile browser:
	- http://YOUR_COMPUTER_LAN_IP:8000/api/

## Troubleshooting

- App cannot reach backend:
	- Make sure frontend/.env uses LAN IP, not localhost.
	- Confirm backend is running on port 8000.
	- Ensure phone and computer are on the same network.
	- Check Windows Firewall rules for Python/port 8000.

- Expo starts but phone cannot connect:
	- Retry with tunnel mode: npx expo start --tunnel --clear.
	- Restart Expo with cache clear (already included via --clear).

- Metro or dependency issues:
	- Delete frontend/node_modules and reinstall.
	- Re-run npm install in frontend.

## Tested Local Commands

The following commands were validated in this workspace:

- Backend:
	- python -m uvicorn server:app --host 0.0.0.0 --port 8000
- Frontend:
	- npm install
	- npx expo start --lan --clear
