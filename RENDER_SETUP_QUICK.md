# ⚡ Quick Render Setup for Persistent Storage

## Problem
Data (teams, tests, results) gets lost after every redeploy.

## Solution
You need to activate a **persistent disk** on Render.

## Steps

### 1. Go to Render Dashboard
https://dashboard.render.com → Select your service → Settings

### 2. Scroll to "Disks"

### 3. Create Persistent Disk
- **Name**: `data`
- **Mount Path**: `/var/data`  
- **Size**: 1 GB or more
- Click **Add**

### 4. Redeploy Service
- Click **Manual Deploy** or push to GitHub
- Wait for deployment to complete

### 5. Verify in Logs
After redeploy, logs should show:
```
📁 Data Directory: /var/data
🗄️  Database: /var/data/db.sqlite ✓ exists
📝 Tests: /var/data/tests ✓ exists
⚠️  PRODUCTION MODE - Data persistence required!
```

## ✅ Done!
Data will now persist across redeploys.

## Troubleshooting
If you still see data loss:
1. Dashboard → Service → Disks
2. Verify disk named `data` exists at `/var/data`
3. If missing, create it again
4. Click **Redeploy**
5. Check logs to confirm `/var/data` is being used
