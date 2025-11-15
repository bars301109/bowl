# 💰 Render: Free vs Paid Plan - Data Storage Options

## ❌ Problem with Free Render Plan

Free Render plan **does NOT support persistent disks**. This means:
- All data is lost when service restarts or redeploys
- Teams, tests, results, settings - **everything disappears** ❌

```
⚠️  TEMPORARY STORAGE MODE
⚠️  Data will be LOST when service restarts!
```

## ✅ Three Solutions

### Option 1: Accept Temporary Storage (Free, but data lost)
**Cost**: $0/month ✅
**Data persistence**: ❌ (lost on redeploy)

Current behavior:
- App works on free Render plan
- All data stored in `/tmp` (temporary)
- Data lost when service restarts/redeploys

**Good for**: Testing, demo, development

---

### Option 2: Upgrade Render to PAID Plan (Persistent Disks)
**Cost**: ~$7-15/month
**Data persistence**: ✅ (persists across redeploys)

Steps:
1. Go to Render Dashboard → akylman-quiz → Settings
2. Click "Change Plan" → Select **Starter** or higher
3. Settings → Disks → Create Disk:
   - Name: `data`
   - Mount Path: `/var/data`
   - Size: 1 GB
4. Manual Deploy

After this, see: [RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md)

**Good for**: Production with persistent data

---

### Option 3: Use PostgreSQL Database (Free, Recommended! ✅)
**Cost**: $0/month ✅
**Data persistence**: ✅ (persists in managed database)

This is the **BEST** option for free Render plan.

**How it works**:
- Instead of local SQLite, use PostgreSQL database
- Render provides free PostgreSQL with limits
- Data persists automatically
- No data loss on redeploy

**Setup steps**:
1. See detailed guide: [RENDER_POSTGRES.md](RENDER_POSTGRES.md)
2. Takes ~10 minutes to set up

**Advantages**:
- ✅ Data persists across redeploys
- ✅ Completely FREE
- ✅ More scalable than local SQLite
- ✅ Better for production

**Limitations**:
- Database limited to 256 MB (enough for thousands of teams)
- CPU/RAM limited

---

## 🎯 Recommendation

**For most users on free plan → Use PostgreSQL (Option 3)**
- Free
- Persistent data
- Production-ready
- Easy setup

See: [RENDER_POSTGRES.md](RENDER_POSTGRES.md)

---

## Current Status

Your app is currently running in **TEMPORARY STORAGE MODE** (Option 1).

You can:
- **Keep it as is** (data resets on redeploy) - testing/demo
- **Upgrade to paid** (Option 2) - persistent data on free plan
- **Switch to PostgreSQL** (Option 3) - persistent data FREE ✅

---

## Comparison Table

| Feature | Option 1<br/>(Free, Temp) | Option 2<br/>(Paid Plan) | Option 3<br/>(PostgreSQL Free) |
|---------|---------|----------|----------|
| **Cost** | $0/month | $7-15/mo | $0/month |
| **Data Persists** | ❌ | ✅ | ✅ |
| **Setup Time** | 0 min | 5 min | 10 min |
| **Scalability** | Poor | Good | Excellent |
| **Production Ready** | ❌ | ✅ | ✅ |
| **Recommended** | Testing only | Yes | ⭐ BEST |

---

## Next Steps

1. **Testing/Demo**: Keep as is, do nothing
2. **Need persistent data on free plan**: Follow [RENDER_POSTGRES.md](RENDER_POSTGRES.md)
3. **Want to pay for persistent disks**: Follow [RENDER_SETUP_QUICK.md](RENDER_SETUP_QUICK.md)
