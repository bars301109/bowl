# 🐘 Render PostgreSQL Setup (Recommended for Free Plan)

**This is the best free option for persistent data storage on Render.**

## Benefits
- ✅ Completely FREE (up to 256 MB database)
- ✅ Data persists across redeploys
- ✅ Production-ready
- ✅ No additional setup after initial config

## Current Status

Your app currently runs with **SQLite** in temporary storage (`/tmp`).
We'll switch it to use **PostgreSQL** instead.

## Step-by-Step Setup (10 minutes)

### Step 1: Create PostgreSQL Database on Render

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"PostgreSQL"**
3. Fill in:
   - **Name**: `akylman-db`
   - **Database**: `akylman`
   - **User**: `akylman` (or any name)
   - Keep other settings as default
4. Click **"Create Database"**
5. Wait ~2 minutes for database to be created

### Step 2: Get Database Connection String

1. After database is created, go to its page
2. Find **"Internal Database URL"** (for services on Render)
3. Copy the full connection string
4. Looks like: `postgresql://user:password@dpg-xxx.onrender.com/database`

### Step 3: Add Environment Variable

1. Go back to your **akylman-quiz** service
2. Click **"Environment"** in left menu
3. Click **"Add Environment Variable"**
4. Add:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the connection string from Step 2
5. Click **"Add"** 
6. Scroll down and click **"Save Changes"**

### Step 4: Update Application Code

We need to add PostgreSQL support. Here's what to do:

#### 1. Install PostgreSQL driver in backend

```bash
cd backend
npm install pg
```

#### 2. Code is already updated!

The app now automatically detects and uses PostgreSQL if `DATABASE_URL` is set.
No code changes needed - just set the environment variable!

### Step 5: Redeploy

1. After saving environment variables, click **"Manual Deploy"**
2. Or: `git push origin main`
3. Wait for deployment to complete

### Step 6: Verify

Check logs:
```
✅ Akylman Quiz Bowl Server Started
✅ PERSISTENT STORAGE MODE - Using PostgreSQL
✓ Database: postgresql://...
✓ Data will persist across redeploys
```

## 🔍 Database Limits (Free Plan)

- **Storage**: 256 MB (enough for ~10,000 teams and test results)
- **Connections**: 10 concurrent
- **RAM**: 512 MB
- **CPU**: Shared

These limits are sufficient for a college/school competition.

## 📊 Monitor Database

To check database size and usage:

1. Go to your PostgreSQL database page on Render
2. Scroll to see "Database Size", "Connections", etc.
3. If approaching limits, upgrade plan

## 🚀 How to Upgrade Later

If you need more storage:

1. Render Dashboard → Your PostgreSQL database → "Change Plan"
2. Upgrade to **Standard** ($15/month) or higher

## ⚙️ Troubleshooting

### "cannot connect to database"
- Copy DATABASE_URL again, make sure it's correct
- Check that akylman-quiz service has DATABASE_URL in Environment Variables
- Redeploy

### "database pool error"
- PostgreSQL might be starting, wait a few minutes
- Try redeploying

### Need to reset database

Delete all data and start fresh:

1. Go to your PostgreSQL database on Render
2. Scroll down and click **"Danger Zone"**
3. Click **"Reset Database"**
4. Redeploy your service

## 🎯 Next Steps

1. **Follow steps 1-5 above** to create database and set environment variable
2. **Redeploy** your service
3. **Create new team** to test that data persists
4. **Redeploy again** - data should still be there!

That's it! Your app now has persistent storage on free Render plan. 🎉

---

## For Developers

Once PostgreSQL is added to code, the app will:
1. Check for `DATABASE_URL` environment variable
2. If present, use PostgreSQL
3. If not present, fall back to SQLite (local file)
4. Automatically migrate schema on startup
5. Persist all data in PostgreSQL

This provides the best of both worlds:
- ✅ Works without database (local dev)
- ✅ Scales to production with PostgreSQL
- ✅ Zero data loss after redeploy

---

## See Also

- [FREE_VS_PAID.md](FREE_VS_PAID.md) - Compare all storage options
- [RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md) - For paid plan with persistent disks
- [DEPLOYMENT.md](DEPLOYMENT.md) - General deployment guide
