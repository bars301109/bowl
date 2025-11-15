# ⚡ Quick Render Setup for Persistent Storage

## Problem
Data (teams, tests, results) gets lost after every redeploy.
```
❌ Failed to create directory: /var/data EACCES
```

## Solution
You need to create a **persistent disk** on Render.

## 4 Steps

### 1️⃣ Go to Render Dashboard
https://dashboard.render.com → Select **akylman-quiz** service

### 2️⃣ Go to Settings → Disks
Scroll down on the Settings page until you see **"Disks"** section

### 3️⃣ Create Disk
- Click **"Create Disk"**
- **Name**: `data`
- **Mount Path**: `/var/data`  
- **Size**: 1 GB
- Click **"Save"**

### 4️⃣ Redeploy
- Click **"Manual Deploy"** on service page
- OR: `git push origin main`
- Wait for build to complete

## ✅ Verify Success

After redeploy, check Logs tab. You should see:
```
📁 Data Directory: /var/data
🗄️  Database: /var/data/db.sqlite ✓ exists
📝 Tests: /var/data/tests ✓ exists
⚠️  PRODUCTION MODE - Data persistence required!
```

## 📖 Detailed Guide
For more detailed instructions with screenshots, see: [RENDER_DISK_SETUP.md](RENDER_DISK_SETUP.md)

## ❌ Still not working?
1. Delete old disk in Settings → Disks → Delete
2. Create new disk as shown above
3. Manual Deploy
4. Check the detailed guide
