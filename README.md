# Akylman Quiz Bowl

Международное соревнование по знаниям для студентов.

## 🚀 Deployment on Render

If deploying to Render and data keeps getting lost after redeploy:

**👉 See: [RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md)**

Quick fix:
1. Render Dashboard → Service → Settings → Disks
2. Create Disk: Name=`data`, Mount Path=`/var/data`, Size=1GB
3. Manual Deploy

## 📚 Documentation

- **[RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md)** - Quick setup for Render persistent storage
- **[RENDER_DISK_SETUP.md](RENDER_DISK_SETUP.md)** - Detailed Render setup guide with troubleshooting
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide

## 🛠️ Local Development

```bash
cd backend
npm install
npm start
```

Server starts at http://localhost:5000

Frontend: http://localhost:5000

## 📝 Features

- Team registration and authentication
- Quiz tests with real-time scoring
- Admin panel for test management
- Bilingual support (Russian/Kyrgyz)
- Persistent storage for production deployments