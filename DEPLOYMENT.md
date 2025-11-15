# Deployment Guide - Persistent Storage

## Overview

This application uses persistent storage on Render to ensure that teams, test results, and test configurations survive deployments.

## Storage Structure

### Local Development
- Database: `./data/db.sqlite`
- Test files: `./data/tests/*.json`

### Render Production
- Database: `/var/data/db.sqlite`
- Test files: `/var/data/tests/*.json`

## How It Works

### Configuration (`render.yaml`)
The `render.yaml` file specifies a persistent disk volume for the web service:
```yaml
disk:
  name: data
  mountPath: /var/data
  sizeGB: 1
```

This ensures that data written to `/var/data` persists across deployments and service restarts.

### Data Migration
When the application starts, it automatically:
1. Creates the data directory if it doesn't exist
2. Checks for legacy database files (`backend/db.better-sqlite3.sqlite`)
3. Migrates them to persistent storage if needed
4. Migrates old test files to the new location

### Environment Variables
- `DATA_DIR`: Override the data directory location (defaults to `/var/data` in production)
- `NODE_ENV`: Set to `production` to use persistent storage

## Database Schema

The database includes tables for:
- `teams` - Registered teams and captains
- `tests` - Quiz tests and configurations
- `questions` - Test questions (JSON files, not DB)
- `results` - Team test results and scores
- `categories` - Question categories
- `settings` - Application settings (badges, timeline)

## Test Files

Questions for each test are stored in JSON files at `/var/data/tests/test_{id}.json`. This allows:
- Easy backup and version control
- Editing without database access
- Import/export functionality

## Deployment Steps

1. Push to GitHub
2. Render automatically pulls and deploys
3. `render.yaml` mounts the persistent volume
4. Application starts and:
   - Creates `/var/data` if needed
   - Migrates any legacy data
   - Initializes database schema
   - Starts the web service

## Data Backup

To backup persistent data from Render:
1. Access the service logs/shell
2. Download files from `/var/data/`:
   - `db.sqlite` - Full database backup
   - `tests/` - All test configurations

## Render Deployment Options

### ⚠️ Problem: Free Plan Can't Store Data

Free Render plan **does NOT support persistent disks**.
Data is lost on every redeploy.

### ✅ Solutions

| Option | Cost | Setup | Data Persists | Link |
|--------|------|-------|--------------|------|
| **PostgreSQL** | FREE | 10 min | ✅ | [RENDER_POSTGRES.md](RENDER_POSTGRES.md) ⭐ |
| **Paid Plan** | $7-15/mo | 5 min | ✅ | [RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md) |
| **Free (temp)** | FREE | 0 min | ❌ | (current) |

### **Recommended: Use PostgreSQL (Free + Persistent)**

See: [RENDER_POSTGRES.md](RENDER_POSTGRES.md)

- ✅ Completely FREE
- ✅ Data persists across redeploys
- ✅ Production-ready
- Takes 10 minutes to set up

### Alternative: Upgrade to Paid Plan

See: [RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md)

Steps:
1. Upgrade Render to paid plan ($7-15/month)
2. Create persistent disk
3. Redeploy

### Current Status (Free Plan, No Setup)

App works but data is temporary:
```
⚠️  TEMPORARY STORAGE MODE
⚠️  Data will be LOST when service restarts!
```

See: [FREE_VS_PAID.md](FREE_VS_PAID.md) for all options.

## Troubleshooting

### Data Lost After Redeploy

**Cause**: Using free Render plan without PostgreSQL setup

**Solutions**:
1. **Add PostgreSQL** (recommended): [RENDER_POSTGRES.md](RENDER_POSTGRES.md)
2. **Upgrade to paid plan**: [RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md)
3. **Accept temporary storage**: Data will reset on redeploy

### "TEMPORARY STORAGE MODE" in logs

**Meaning**: Running on free plan without persistent storage

**Fix**:
- See: [FREE_VS_PAID.md](FREE_VS_PAID.md)
- Choose PostgreSQL or upgrade plan

### "No such table: teams" error

**If using free plan (no setup)**:
- This is expected - data is temporary
- See [FREE_VS_PAID.md](FREE_VS_PAID.md) for solutions

**If using paid plan with persistent disk**:
1. Check: Render Dashboard → Service → Settings → Disks
2. Is disk named `data` at `/var/data` showing?
3. If missing: Create new disk and redeploy
4. If present but error persists: Redeploy again

### "Cannot write to /var/data" error

**On free plan**: Normal - no persistent storage available. See [FREE_VS_PAID.md](FREE_VS_PAID.md)

**On paid plan**: 
- Persistent disk not properly mounted
- Go to Settings → Disks
- Verify disk exists at `/var/data`
- Redeploy

### "Database pool error" (PostgreSQL)

- PostgreSQL might still be starting
- Wait 2-3 minutes and try again
- Check DATABASE_URL environment variable is correct

## Local Development

To test locally with persistent storage:
```bash
mkdir -p data/tests
NODE_ENV=production npm start
```

Or use the default local storage:
```bash
npm start  # Uses ./data directory
```
