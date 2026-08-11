# Permanent Deployment & Expo Go Testing Guide

This guide details the complete roadmap to deploy the backends permanently using a real public domain (HTTPS) and MongoDB Atlas cloud database, allowing you to test both applications on **Expo Go** from any mobile device, anywhere.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────┐               ┌───────────────────────────────┐               ┌─────────────────────────┐
│     Expo Go App         │               │     Backend Web Service       │               │      Cloud Database     │
│   (iOS / Android)       │ ── HTTPS ───> │   https://api.yourdomain.com  │ ── MongoDB ──>│  MongoDB Atlas (Free)   │
│ EXPO_PUBLIC_BACKEND_URL │               │     (Render / Railway)        │               │  M0 cluster in cloud    │
└─────────────────────────┘               └───────────────────────────────┘               └─────────────────────────┘
```

---

## 🛠️ Summary of App Configuration Fixes Made

The configuration in `app.json` for both frontend apps has been updated with unique slugs and names to prevent conflicts in Expo Go and your Expo account:

- **Contact Exporter**:
  - Path: [`contact-exporter/frontend/app.json`](file:///c:/local/NK-dev/contact-exporter/frontend/app.json)
  - `name`: `"Contact Exporter"`
  - `slug`: `"contact-exporter"`
  - `scheme`: `"contact-exporter"`
  - Bundle ID: `com.emergent.exportcontactsapp.k180op`

- **SIP Stock Tracker**:
  - Path: [`sip-stock-tracker/frontend/app.json`](file:///c:/local/NK-dev/sip-stock-tracker/frontend/app.json)
  - `name`: `"SIP Stock Tracker"`
  - `slug`: `"sip-stock-tracker"`
  - `scheme`: `"sip-stock-tracker"`
  - Bundle ID: `com.emergent.sipstocktracker.g2arl4`

Production deployment files (`Procfile` and cleaned `requirements.txt`) have also been created in both backend directories.

---

## 🗄️ Step 1: Set Up MongoDB Atlas (Free Cloud Database)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign up / log in.
2. Create a free **M0 Cluster**.
3. **Database Access**: Create a database user (e.g., `dbuser`) with a secure password.
4. **Network Access**: Add IP Address `0.0.0.0/0` (**Allow Access from Anywhere**) so your cloud server can connect.
5. **Connection String**: Under Clusters -> **Connect** -> **Drivers**, copy your URI string:
   ```text
   mongodb+srv://dbuser:<password>@cluster0.xxxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

---

## 🚀 Step 2: Deploy Backend with Real Domain (Render / Railway)

### Option A: Deploy on Render (Free Tier)

1. Push this code repository to **GitHub** or **GitLab**.
2. Sign up / log in at [Render.com](https://render.com).
3. Click **New +** -> **Web Service** and connect your repository.
4. Set the build parameters:
   - **Root Directory**: `sip-stock-tracker/backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Set Environment Variables:
   - `MONGO_URL` = `mongodb+srv://dbuser:<password>@cluster0.xxxxxx.mongodb.net/`
   - `DB_NAME` = `sip_stock_tracker`
6. Click **Create Web Service**. Render will deploy your service and generate a free HTTPS URL:
   `https://sip-stock-tracker.onrender.com`

---

### 🌐 Attaching Your Custom Real Domain (e.g., `api.yourdomain.com`)

1. In Render, go to your Web Service -> **Settings** -> **Custom Domains**.
2. Click **Add Custom Domain** and enter `api.yourdomain.com`.
3. In your DNS Provider (Cloudflare, GoDaddy, Namecheap, etc.), add a **CNAME** record:
   - **Type**: `CNAME`
   - **Host / Name**: `api`
   - **Target / Value**: `sip-stock-tracker.onrender.com`
4. Render will automatically issue a free SSL/TLS certificate for `https://api.yourdomain.com`.

---

## 📱 Step 3: Configure Expo Frontend for Live Backend

In `sip-stock-tracker/frontend`, create or edit `.env`:

```env
# Set to your live custom domain or Render URL
EXPO_PUBLIC_BACKEND_URL=https://api.yourdomain.com
```

---

## 🧪 Step 4: Test in Expo Go

1. Install **Expo Go** from the iOS App Store or Google Play Store.
2. Start the Expo development server:
   ```powershell
   cd c:\local\NK-dev\sip-stock-tracker\frontend
   npx expo start
   ```
3. Scan the QR code displayed in your terminal using:
   - **iOS**: Native Camera App -> Tap link -> Opens Expo Go.
   - **Android**: Open Expo Go app -> Tap **Scan QR Code**.

Because the backend is hosted on a live domain, Expo Go will connect to your cloud API regardless of what Wi-Fi or cellular network your phone is on.

---

## ☁️ Step 5: Publish Over-The-Air (EAS Update)

To test on Expo Go without keeping your local computer running:

1. Configure EAS Update:
   ```powershell
   cd c:\local\NK-dev\sip-stock-tracker\frontend
   npx eas-cli update:configure
   ```
2. Publish an update to the cloud:
   ```powershell
   eas update --branch preview --message "Connected to live API domain"
   ```
3. Open **Expo Go** on your device -> Go to **Projects** to launch the cloud bundle anytime.

---

## 🏪 Step 6: Final App Store & Play Store Release Roadmap

When ready for full production publishing:

1. **Install & Authenticate EAS**:
   ```powershell
   npm install -g eas-cli
   eas login
   ```
2. **Build Native Binaries**:
   - **Android (`.aab` for Google Play)**:
     ```powershell
     eas build --platform android --profile production
     ```
   - **iOS (`.ipa` for App Store / TestFlight)**:
     ```powershell
     eas build --platform ios --profile production
     ```
3. **Developer Accounts Required**:
   - Apple Developer Program ($99/year)
   - Google Play Console Account ($25 one-time)
4. **Submit Binaries**:
   ```powershell
   eas submit --platform all
   ```
