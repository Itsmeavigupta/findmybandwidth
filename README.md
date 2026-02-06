# 📊 Google Sheets Sprint Tracker (Real-Time Collaboration)

A **real-time** sprint roadmap tracker powered by **Google Sheets**. Your team collaborates in Google Sheets, tracker auto-syncs - **no login required!**

## 🎯 Key Features

- ☁️ **Real-Time Updates** - Fetches directly from Google Sheets
- 👥 **Team Collaboration** - Multiple teammates edit simultaneously
- 🚀 **No Login/OAuth** - Just share your sheet publicly (view-only)
- 🔄 **One-Click Refresh** - Click refresh, see instant updates
- 📈 **Visual Gantt** - Timeline with weekends highlighted
- 🔍 **Advanced Filters** - Search, filter by owner, priority, status
- 🖨️ **Print-Ready** - Professional sprint reports

---

## 🚀 Quick Setup (5 Minutes)

### Setup Steps

**1. Create Google Sheet**

1. Go to https://sheets.google.com
2. Create new spreadsheet: "Sprint Tracker"
3. Create 4 tabs (bottom of page):
   - `SPRINT_CONFIG`
   - `MEMBERS`
   - `TASKS`
   - `MILESTONES`

**2. Add Your Data**

Copy data from your Excel file or use the structures below.

**3. Share Sheet Publicly**

1. Click **Share** button (top-right)
2. Change "Restricted" to **"Anyone with the link"**
3. Set role to **"Viewer"** (read-only)
4. Click **Copy link**

**4. Get Sheet ID**

From your Google Sheet URL:
```
https://docs.google.com/spreadsheets/d/1AbC123XYZ_SHEET_ID_HERE/edit
                                          ^^^^^^^^^^^^^^^^^^^
                                          This is your Sheet ID
```

**5. Configure Tracker**

Edit `/home/moglix/Desktop/TaskTracker/dataLoader.js` line 13:

```javascript
sheetId: 'PASTE_YOUR_SHEET_ID_HERE',
```

Save the file!

**6. Open Tracker**

```bash
cd /home/moglix/Desktop/TaskTracker
python3 -m http.server 8000
```

Open: http://localhost:8000

**Done!** Your tracker loads from Google Sheets in real-time! 🎉

---

## 🔄 Daily Workflow (Real-Time Collaboration!)

```
1. Team edits Google Sheet
   └─ Multiple people edit simultaneously
   └─ Changes save automatically

2. You open tracker
   └─ http://localhost:8000
   └─ No login required!

3. Click "🔄 Refresh"
   └─ Fetches latest data from Google Sheets instantly
   └─ Takes 1-2 seconds

4. See all updates! ✅
   └─ All task changes appear immediately
```

**Real collaboration: Edit Sheet → Click Refresh → See Changes!** 🚀


---

## 📊 Excel Sheet Structures

### SPRINT_CONFIG (Key-Value Pairs)
| key | value |
|-----|-------|
| sprint_name | Feb 2026 Sprint |
| start_date | 2026-02-06 |
| end_date | 2026-02-20 |
| prepared_by | Avi Gupta |

### MEMBERS (Team Info)
| id | name | role | color_class | capacity | focus | bandwidth_desc | effective_bandwidth |
|----|------|------|-------------|----------|-------|----------------|---------------------|
| avi | Avi Gupta | Engineer | primary | 100% | Sprint work | Full sprint | 100% sprint |

**color_class options:** primary, success, warning, info, danger

### TASKS (Sprint Tasks)
| id | title | owner | bu | start_date | end_date | status | priority | jira | jira_url | blocker | type | notes | completed |
|----|-------|-------|-------|-----------|---------|--------|----------|------|----------|---------|------|-------|-----------|
| T-1 | Setup API | avi | Team | 2026-02-06 | 2026-02-10 | In Progress | urgent | VED-123 | https://... | None | Dev | | FALSE |

**priority options:** urgent, normal, pending  
**completed:** TRUE or FALSE  
**owner:** must match member `id`

### MILESTONES (Key Dates)
| date | title | owner |
|------|-------|-------|
| 2026-02-10 | Mid-Sprint Review | Team |
| 2026-02-20 | Sprint Demo | All |

---

## 💡 Pro Tips

### 1. Auto-Convert Script
Create a bash script for quick updates:

```bash
#!/bin/bash
# save as: update-tracker.sh
cd ~/Desktop/TaskTracker
python3 excel-to-json.py Book2.xlsx
echo "✅ Tracker updated! Refresh browser (F5)"
```

Make executable: `chmod +x update-tracker.sh`  
Run: `./update-tracker.sh`

### 2. Watch for Changes (Auto-Convert)
Install watchdog: `pip install watchdog`

```bash
# Auto-convert when Excel file changes
watchmedo shell-command \
    --patterns="Book2.xlsx" \
    --command='python3 excel-to-json.py Book2.xlsx' \
    .
```

### 3. Share with Team
Host the tracker:
```bash
python3 -m http.server 8000
```

Share URL: `http://YOUR_IP:8000`  
Team can view tracker without Excel access!

### 4. Backup Your Data
Export JSON regularly:
- Click "💾 Export JSON" button in tracker
- Or copy `sprint-data.json` to backup folder

---

## 🐛 Troubleshooting

### "sprint-data.json not found"
**Fix:** Run the converter:
```bash
python3 excel-to-json.py Book2.xlsx
```

### "No module named 'pandas'"
**Fix:** Install dependencies:
```bash
pip install pandas openpyxl
```

### "File 'Book2.xlsx' not found"
**Fix:** Download Excel file to TaskTracker folder:
```bash
cd ~/Desktop/TaskTracker
# Then download Book2.xlsx here
```

### Changes not showing
**Fix:** 
1. Re-run converter: `python3 excel-to-json.py Book2.xlsx`
2. Hard refresh browser: `Ctrl+Shift+R` or `Cmd+Shift+R`

### Excel file corrupted/won't open
**Fix:**
1. Download fresh copy from SharePoint
2. Verify sheet names match exactly: SPRINT_CONFIG, MEMBERS, TASKS, MILESTONES
3. Check column headers match (case-sensitive)

---

## 🎯 Why This Approach?

**vs. SharePoint Publishing (Blocked):**
- ✅ Works around corporate restrictions
- ✅ No need to enable publishing features

**vs. Microsoft Graph API (Complex):**
- ✅ No Azure app registration needed
- ✅ No OAuth/login flows
- ✅ No API permissions required

**vs. Google Sheets:**
- ✅ Native Excel experience
- ✅ Works with existing SharePoint files
- ✅ Better for Microsoft 365 orgs

---

## 📂 File Structure

```
TaskTracker/
├── index.html           (4.2KB) - Main tracker page
├── dataLoader.js        (14KB)  - Data loading logic
├── renderer.js          (17KB)  - UI rendering
├── styles.css          (8.4KB)  - Styling
├── excel-to-json.py    (7.6KB)  - Converter script
├── README.md           (6.1KB)  - This file
├── Book2.xlsx                   - Your Excel file (download here)
└── sprint-data.json             - Generated JSON (auto-created)
```

---

## ✅ Summary

**This tracker gives you:**
- ✅ Simple Excel-to-JSON workflow (no login!)
- ✅ Team collaboration in Excel Online
- ✅ Beautiful visual sprint tracker
- ✅ One-command updates
- ✅ Professional reports

**Perfect for:**
- Teams using SharePoint with restricted publishing
- No-hassle setup without Azure/OAuth
- Quick sprint visualization
- Agile project management

---

## 🚀 Get Started Now

```bash
# 1. Install dependencies
pip install pandas openpyxl

# 2. Download your Excel file to this folder

# 3. Convert to JSON
python3 excel-to-json.py Book2.xlsx

# 4. Open tracker
python3 -m http.server 8000
# Visit: http://localhost:8000
```

**That's it!** Update Excel → Re-run converter → Refresh browser 🎉

---

**Simple, powerful sprint tracking with Excel Online!** 📊✨
