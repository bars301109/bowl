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

## Troubleshooting

### "No such table: teams" error
- Volume might not be mounted or writable
- Check Render volume configuration in dashboard
- Verify database initialization ran successfully

### Missing test results after redeploy
- Likely using ephemeral storage
- Verify `render.yaml` is in root directory
- Trigger a redeploy to apply volume configuration

### Data appearing after redeploy
- Migration worked! Old data was transferred to persistent storage
- Legacy files in `backend/` are no longer used

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
