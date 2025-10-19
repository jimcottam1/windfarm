# Ireland Wind Farm News Aggregator 🌬️

A real-time news aggregator tracking wind farm developments across Ireland, including offshore and onshore projects, planning approvals, and construction updates.

---

## 🎯 Features

✅ **Live News Feed** - Up-to-date wind farm news from Ireland
✅ **Smart Categorization** - Automatically categorizes as offshore/onshore/planning/construction
✅ **Advanced Filtering** - Filter by project type and development stage
✅ **Search Functionality** - Find specific news by keyword
✅ **Statistics Dashboard** - Real-time stats on Irish wind projects
✅ **Responsive Design** - Works on desktop, tablet, and mobile
✅ **Auto-Refresh** - Automatically updates every 15 minutes
✅ **Multiple Views** - List or grid view options

---

## 🚀 Quick Start

### View Demo with Sample Data

1. **Open the app:**
   - Navigate to: `C:\Users\jim_c\lorraine\ireland-windfarm-news`
   - Double-click `index.html`
   - The app opens with sample Irish wind farm news

2. **Explore features:**
   - Filter by offshore/onshore/planning/construction
   - Search for specific terms
   - Switch between list and grid views
   - View statistics dashboard

**That's it!** The app works immediately with sample data.

---

## 🔌 Connect to Live News Sources

To get real-time news instead of sample data:

### Option 1: NewsAPI (Recommended - Free Tier Available)

**Step 1: Get API Key**
1. Go to [newsapi.org](https://newsapi.org)
2. Sign up for free account
3. Get your API key (free tier: 100 requests/day)

**Step 2: Configure App**
1. Open `app.js` in a text editor
2. Find line 12:
   ```javascript
   NEWS_API_KEY: 'YOUR_NEWS_API_KEY_HERE',
   ```
3. Replace with your key:
   ```javascript
   NEWS_API_KEY: 'abc123your-actual-key-here',
   ```
4. Save the file

**Step 3: Test**
1. Open `index.html` in browser
2. Click "Refresh Feed"
3. See live news from NewsAPI!

**Free Tier Limits:**
- 100 requests per day
- Good for personal use
- Upgrade to paid for more requests

---

### Option 2: RSS Feeds (Requires Backend)

Irish news sources provide RSS feeds, but browsers block direct access (CORS). You need a simple backend proxy.

**Backend Options:**

#### **A) Use RSS2JSON (Free Service)**

1. Go to [rss2json.com](https://rss2json.com)
2. Get free API key
3. Modify `app.js` to use their API:
   ```javascript
   const rssUrl = 'https://www.rte.ie/news/rss/news-headlines.xml';
   const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&api_key=YOUR_KEY`;
   ```

#### **B) Create Simple Node.js Proxy**

See `BACKEND-SETUP.md` for instructions.

---

## 📊 News Sources

The app monitors **14 RSS feeds** from these Irish sources:

| Source | Feeds | Coverage |
|--------|-------|----------|
| **RTÉ News** | 2 feeds | News headlines + Business |
| **The Journal** | 1 feed | Breaking news |
| **Breaking News Ireland** | 2 feeds | Top stories + Business |
| **Independent.ie** | 2 feeds | Irish news + Business |
| **Irish Examiner** | 2 feeds | Ireland news + Business |
| **Irish Times** | 2 feeds | News + Business |
| **Silicon Republic** | 1 feed | Tech & renewable innovation |
| **Business Post** | 1 feed | Business & energy |
| **Plus** | - | More can be added easily! |

**Total:** 14 RSS feeds checked every 15 minutes

---

## 🎨 Customization

### Change Colors

Open `styles.css` and modify the color variables:

```css
:root {
    --primary-color: #2563eb;      /* Main blue */
    --secondary-color: #10b981;    /* Green */
    --accent-color: #f59e0b;       /* Orange */
}
```

### Change Auto-Refresh Interval

Open `app.js` and find:

```javascript
// Auto-refresh interval (minutes)
REFRESH_INTERVAL: 15
```

Change to your preferred minutes.

### Add More Keywords

Open `app.js` and add keywords:

```javascript
KEYWORDS: [
    'wind farm',
    'wind energy',
    'offshore wind',
    // Add more keywords here
    'renewable energy',
    'turbine construction'
]
```

---

## 📱 Deployment Options

### Option 1: Netlify (Easiest - Free)

1. Go to [netlify.com](https://netlify.com)
2. Sign up
3. Drag & drop the `ireland-windfarm-news` folder
4. Your site is live!
5. URL: `yourname-windfarm-news.netlify.app`

### Option 2: GitHub Pages (Free)

1. Create GitHub account
2. Create repository: `ireland-windfarm-news`
3. Upload all files
4. Settings → Pages → Enable
5. URL: `yourusername.github.io/ireland-windfarm-news`

### Option 3: Vercel (Free)

1. Go to [vercel.com](https://vercel.com)
2. Import from GitHub
3. Deploy
4. URL: `ireland-windfarm-news.vercel.app`

**All three are completely free!**

---

## 🔧 Technical Details

### Built With

- **HTML5** - Structure
- **CSS3** - Modern styling with Grid & Flexbox
- **JavaScript (ES6+)** - Vanilla JS, no frameworks
- **NewsAPI** - News aggregation (optional)

### Browser Compatibility

✅ Chrome/Edge (latest)
✅ Firefox (latest)
✅ Safari (latest)
✅ Mobile browsers (iOS/Android)

### Performance

- **Fast loading** - Minimal dependencies
- **Responsive** - Works on all screen sizes
- **Efficient** - Smart caching and filtering
- **Accessible** - Keyboard navigation support

---

## 📂 File Structure

```
ireland-windfarm-news/
│
├── index.html              Main HTML file
├── styles.css              All styling
├── app.js                  JavaScript logic
├── README.md              This file
└── BACKEND-SETUP.md       Backend proxy guide (optional)
```

---

## 🛠️ How It Works

### 1. Data Collection

```javascript
// Fetches from NewsAPI
fetchFromNewsAPI()
  → Searches multiple keywords
  → Filters for Ireland-related news
  → Removes duplicates
  → Sorts by date
```

### 2. Categorization

```javascript
// Auto-categorizes articles
categorizeTags(article)
  → Detects "offshore" vs "onshore"
  → Identifies "planning" vs "construction"
  → Assigns relevant tags
```

### 3. Filtering

```javascript
// Real-time filtering
applyFilters()
  → Checks active filter checkboxes
  → Applies search text
  → Updates display
  → Updates statistics
```

### 4. Display

```javascript
// Renders news cards
createNewsCard(article)
  → Formats date as "X hours ago"
  → Adds category tags
  → Creates responsive card
  → Handles click events
```

---

## 🔍 Search & Filter Guide

### Search Tips

**Search by location:**
- "Dublin" - Find Dublin-related projects
- "Cork" - Find Cork developments
- "Galway Bay" - Find specific locations

**Search by type:**
- "offshore" - Offshore projects only
- "planning" - Planning applications
- "construction" - Projects being built

**Search by company:**
- "ESB" - ESB projects
- "SSE" - SSE Renewables projects

**Search by capacity:**
- "800MW" - Large projects
- "50MW" - Smaller developments

### Filter Combinations

**Active Offshore Projects:**
- ✅ Offshore
- ✅ Construction
- ❌ Onshore
- ❌ Planning

**Future Developments:**
- ✅ Planning
- ✅ Offshore
- ✅ Onshore
- ❌ Construction

---

## 📈 Statistics Explained

### Offshore Projects
Number of offshore wind farm articles (projects at sea)

### Onshore Projects
Number of onshore wind farm articles (land-based turbines)

### In Planning
Number of projects seeking or receiving planning permission

### Total Articles
Total number of articles in current filtered view

---

## 🚨 Troubleshooting

### "No articles found"

**Solution:**
- Check internet connection
- Verify NewsAPI key is correct (if using live data)
- Try clicking "Refresh Feed"
- Check browser console for errors (F12)

### News not updating

**Solution:**
- Click "Refresh Feed" button
- Check NewsAPI daily limit (100 requests/day free)
- Wait a few minutes and try again
- Clear browser cache (Ctrl + Shift + Delete)

### Filters not working

**Solution:**
- Make sure at least one filter is checked
- Try unchecking all and rechecking
- Refresh the page

### Sample data instead of live news

**Solution:**
- Add your NewsAPI key to `app.js`
- Make sure key is correct
- Check NewsAPI dashboard for usage limits

---

## 🔐 Privacy & Data

### What data is collected?

**None!** This is a client-side application that:
- ❌ Does NOT store user data
- ❌ Does NOT use cookies
- ❌ Does NOT track users
- ✅ Runs entirely in your browser
- ✅ News is fetched directly from sources

### API Keys

- NewsAPI key is stored in your local `app.js` file
- Not transmitted to any server except NewsAPI
- You control your own API key

---

## 🌍 Ireland Wind Energy Context

### Current Status (2025)

- **Installed Capacity:** ~5,000 MW
- **Target 2030:** 9,000 MW onshore + 7,000 MW offshore
- **Electricity from Wind:** ~36% of Ireland's needs
- **Jobs:** ~5,000 direct jobs in wind sector

### Major Projects

**Offshore:**
- Dublin Array - 800MW
- Arklow Bank - 520MW
- Codling Wind Park - 1,200MW
- Inch Cape - 1,000MW

**Onshore:**
- Multiple 50-100MW projects across counties
- Community wind farms
- Repowering of older farms

---

## 💡 Future Enhancements

Potential features to add:

- [ ] Map view of wind farm locations
- [ ] Project timeline tracker
- [ ] Capacity calculator
- [ ] Email notifications for new projects
- [ ] Export to PDF/CSV
- [ ] Social media sharing
- [ ] Sentiment analysis
- [ ] Company/developer tracking
- [ ] Economic impact calculator

---

## 🤝 Contributing

Want to improve this app?

1. Add more news sources
2. Improve categorization algorithms
3. Add new features
4. Report bugs
5. Share feedback

---

## 📞 Support

### Resources

- **NewsAPI Docs:** [newsapi.org/docs](https://newsapi.org/docs)
- **RSS Feeds:** Check Irish news websites
- **Wind Energy Ireland:** [windenergyireland.com](https://windenergyireland.com)

### Issues

Found a bug? Have suggestions?
- Check browser console (F12) for errors
- Try refreshing the page
- Clear cache and try again

---

## 📄 License

Free to use for personal and educational purposes.

**Note:** This is an independent news aggregator not affiliated with any wind farm operators, government bodies, or news organizations.

---

## 🎉 You're All Set!

Your Ireland Wind Farm News aggregator is ready to use!

**Next Steps:**

1. ✅ **Try it now** - Open `index.html`
2. 📰 **Add NewsAPI key** - Get live news (optional)
3. 🌐 **Deploy online** - Share with others (optional)

**Enjoy tracking Ireland's renewable energy future!** 🌬️💚

---

*Built to support Ireland's journey to renewable energy independence*
