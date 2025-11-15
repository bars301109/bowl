# Render Deployment Setup Guide for Akylman Quiz Bowl

## Problem Solved
The previous error `EACCES: permission denied, mkdir '/var/data'` is now fixed with automatic fallback handling.

## What's Changed

### 1. **render.yaml** - Proper Build & Start Configuration
```yaml
buildCommand: cd backend && npm install
startCommand: cd backend && npm start
envVars:
  - key: NODE_ENV
    value: production
  - key: DATA_DIR
    value: /var/data
```

**Key improvements:**
- ✅ Separated `buildCommand` (runs once during build)
- ✅ Separate `startCommand` (runs each time service starts)
- ✅ Set explicit environment variables
- ✅ Persistent disk mounted at `/var/data` (1GB default)

### 2. **server.js** - Resilient Directory Handling
- ✅ Detects permission errors on `/var/data`
- ✅ Automatically falls back to `/tmp/akylman-data` if permissions denied
- ✅ Better error messages to diagnose issues
- ✅ Enhanced startup logging showing data directory used

## Deployment Steps

### Step 1: Update render.yaml
The file has been updated. Commit and push:
```bash
git add render.yaml
git commit -m "fix: update Render configuration with proper build/start commands"
git push
```

### Step 2: Trigger Deployment on Render
Go to your Render dashboard:
1. Click on your service (`akylman-quiz`)
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Watch the logs for the deployment to complete

### Step 3: Verify Persistent Disk (CRITICAL)
1. In Render dashboard, go to your service settings
2. Look for **"Disks"** section
3. You should see a disk named `data` with:
   - **Mount path**: `/var/data`
   - **Size**: 1GB (or larger if needed)

**If you don't see a disk:**
- Click **"Add Disk"**
- Name: `data`
- Mount path: `/var/data`
- Size: 1 GB (minimum)
- Click **"Create"**
- Trigger a new deployment

### Step 4: Check Deployment Logs
After deployment, you should see:
```
✅ Akylman Quiz Bowl Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Port: 10000
📁 Data Directory: /var/data
🗄️  Database: /var/data/db.sqlite
📝 Tests: /var/data/tests
🌍 URL: https://your-app.render.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Fallback Behavior

If the persistent disk is **not mounted** or **permissions are denied**:
```
⚠ Cannot write to /var/data. Ensure persistent disk is mounted in Render dashboard.
⚠ Falling back to temporary storage (data will be lost on redeploy).
```

In this case:
- ✅ Server will still start and work
- ⚠️ Data will be in `/tmp/akylman-data` (temporary)
- ⚠️ **All data will be lost on next deployment/restart**

**Action:** Add the persistent disk in Render dashboard (see Step 3)

## Data Persistence

### With Persistent Disk (Recommended)
- ✅ Database persists across deployments
- ✅ Test configurations saved permanently
- ✅ Team registration data preserved
- ✅ All scores and results kept

### Without Persistent Disk (Fallback)
- ⚠️ Data lost on every deployment
- ⚠️ Suitable for development/testing only

## Troubleshooting

### Issue: Still getting permission errors after update
**Solution:**
1. Check Render dashboard - is the disk mounted?
2. Trigger manual deployment
3. Check logs for the startup message

### Issue: Data disappeared after deployment
**Likely causes:**
1. Persistent disk not properly mounted
2. Running without the disk configured
3. Database in `/tmp` instead of `/var/data`

**Solution:**
1. Add persistent disk (see Step 3)
2. Deploy again
3. Verify logs show `/var/data` as data directory

### Issue: "Cannot open database because the directory does not exist"
**Solution:**
1. Wait 30 seconds after deployment starts
2. Check if logs show fallback message
3. If persistent disk exists in Render dashboard, restart the service

## Environment Variables

If needed, you can override settings in Render dashboard:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATA_DIR` | `/var/data` (prod) or `./data` (local) | Storage location |
| `NODE_ENV` | `production` | Runtime mode |
| `PORT` | `5000` | Server port |
| `JWT_SECRET` | `change-this-secret` | JWT signing key (⚠️ should be set in Render) |
| `ADMIN_TOKEN` | `super-secret-token` | Admin API key (⚠️ should be set in Render) |

## Next Steps

1. ✅ Update render.yaml (done)
2. ✅ Deploy to Render
3. ✅ Add persistent disk in Render dashboard
4. ✅ Verify logs show correct data directory
5. ✅ Test data persistence by:
   - Register a team
   - Create a test
   - Trigger a deployment
   - Verify data still exists

## Support

If issues persist:
- Check Render logs for error messages
- Ensure persistent disk is mounted in Render dashboard
- Verify `DATA_DIR` environment variable is set to `/var/data`
- Contact Render support if permissions issues continue
