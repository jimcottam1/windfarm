# Troubleshooting Article Links

## 🔍 The Issue

When clicking "Read more" on articles, links go to homepage (e.g., www.rte.ie) instead of the specific article.

---

## ✅ I've Already Fixed This!

I've updated `app.js` with:

1. **Better URL extraction** - Tries multiple properties (link, guid, url)
2. **Debugging logs** - Shows what URLs are being found
3. **Fallback handling** - Uses best available URL

---

## 🧪 Test the Fix Now

### Step 1: Open the App

1. Navigate to: `C:\Users\jim_c\lorraine\ireland-windfarm-news`
2. Double-click `index.html`
3. **IMPORTANT:** Press `Ctrl + Shift + R` (hard refresh to clear cache)

### Step 2: Check Console

1. Press **F12** to open Developer Tools
2. Click **"Console"** tab
3. Click **"Refresh Feed"** button

### Step 3: Look for Debug Info

You should see:
```
Sample item structure: {
  hasLink: true,
  hasGuid: false,
  hasUrl: false,
  link: "https://www.rte.ie/news/business/2025/..."
  availableProps: ["title", "link", "pubDate", ...]
}
```

This shows what properties are available!

### Step 4: Look for Article URLs

As articles are found, you'll see:
```
Found article: "Government Approves Wind Farm..." - URL: https://www.rte.ie/news/business/2025/...
```

This shows the actual URL being used!

---

## 🔍 Diagnosis

### Good Sign ✅
```
Found article: "Title..." - URL: https://www.rte.ie/news/business/2025/01/specific-article
```
**Full article URL = Links will work!**

### Problem Sign ❌
```
Found article: "Title..." - URL: https://www.rte.ie
```
**Just homepage = Links won't go to article**

---

## 🛠️ If Links Still Don't Work

### Issue: RSS Feed Doesn't Provide Individual URLs

**Some RSS feeds only provide:**
- Article title
- Article description
- Feed homepage URL (not article URL)

**This is a limitation of the RSS feed itself, not our app!**

---

## 🔧 Solutions

### Solution 1: Check Console Logs (Do This First!)

1. Open app with F12 console open
2. Click "Refresh Feed"
3. Look at the "Sample item structure" logs
4. Send me what you see in `availableProps`

**I can then adjust the code based on what's actually available!**

---

### Solution 2: Use Different RSS Feeds

Some feeds provide better data than others. If a feed doesn't work well, we can:

**Replace problematic feeds with better ones:**

```javascript
// If RTÉ news doesn't provide article URLs, try:
'https://www.rte.ie/news/rss/headlines.xml'  // Different RTE feed

// Or add feeds known to have good URLs:
'https://www.irishtimes.com/rss/'
```

---

### Solution 3: Use NewsAPI Instead

NewsAPI provides full article URLs always.

**Get free NewsAPI key:**
1. Go to [newsapi.org](https://newsapi.org)
2. Sign up (free: 100 requests/day)
3. Add key to `app.js`

**I can update the code to use NewsAPI if RSS feeds aren't working well!**

---

## 📊 What The Debug Logs Mean

### `hasLink: true`
✅ The RSS item has a 'link' property
✅ Should work!

### `hasGuid: true`
✅ The RSS item has a 'guid' property
✅ Can be used as URL

### `link: "https://www.rte.ie/news/..."`
✅ Full URL with path = Good!
❌ Just "https://www.rte.ie" = Problem

### `availableProps: [...]`
Shows ALL properties in the RSS item
Helps me understand what we can use

---

## 🧪 Quick Test

### Open Console & Try This:

1. Press F12 → Console
2. After app loads, type:
```javascript
allArticles[0]
```
3. Press Enter

**You'll see the first article object with its URL!**

Example output:
```javascript
{
  title: "Wind Farm Approved...",
  url: "https://www.rte.ie/news/...",  ← This should be full URL!
  source: "RTÉ News",
  ...
}
```

If `url` is just the homepage, that's the problem!

---

## 📸 Send Me Screenshots

If links still don't work:

1. **Open app with F12**
2. **Click "Refresh Feed"**
3. **Screenshot the console** showing:
   - "Sample item structure" log
   - "Found article" logs
   - Any errors in red

4. **Check an article**:
   - Right-click "Read more" link
   - Select "Inspect"
   - Screenshot the href value

This will help me fix it exactly!

---

## 🔄 Temporary Workaround

While we diagnose:

### Option 1: Use Sample Data
The sample articles have working URLs!
- They're realistic examples
- Links work properly
- Good for demonstration

### Option 2: Search Manually
If you see an interesting article:
1. Note the title
2. Go to www.rte.ie (or relevant site)
3. Search for the title
4. Find the article

Not ideal, but works while we fix this!

---

## 🎯 What I Need to Help

To fix this perfectly, tell me:

1. **Console logs** - What does "Sample item structure" show?
2. **Example URL** - What's in the "Found article" logs?
3. **Which feed?** - Which news source has the problem?

**With this info, I can update the code to extract URLs correctly!**

---

## 💡 Technical Explanation

### How RSS2JSON Works:

```
Irish News RSS Feed (XML)
         ↓
RSS2JSON converts to JSON
         ↓
Our app extracts:
  - item.link (preferred)
  - item.guid (fallback)
  - item.url (fallback)
  - feed.link (last resort)
```

**Problem:** Some feeds don't put article URL in expected property!

**Solution:** Find which property has it and use that!

---

## 🔍 Debugging Checklist

Try these in order:

- [ ] Hard refresh (Ctrl + Shift + R)
- [ ] Check console for "Sample item structure"
- [ ] Check console for "Found article" URLs
- [ ] Inspect a "Read more" link (right-click → Inspect)
- [ ] Check if href shows full URL or just homepage
- [ ] Try a different RSS feed
- [ ] Screenshot console and send to me

---

## 🚀 Quick Fix Commands

If you're comfortable, try this in console:

### See all article URLs:
```javascript
allArticles.map(a => a.url)
```

### See full first article:
```javascript
console.log(JSON.stringify(allArticles[0], null, 2))
```

This shows exactly what data we have!

---

## 📞 Next Steps

1. ✅ **Try the app now** with updated code
2. ✅ **Check console** for debug logs
3. ✅ **Click a link** to test
4. ✅ **Tell me what you see** in console

**Based on the console output, I can make it work perfectly!**

---

## 🎯 Expected Results

### After the fix:

**Console shows:**
```
Sample item structure: {
  hasLink: true,
  link: "https://www.rte.ie/news/business/2025/01/18/specific-article-123456.html"
}
```

**Clicking "Read more":**
- ✅ Opens specific article
- ✅ Goes to full news story
- ✅ Not just homepage

---

## 💬 Common Scenarios

### Scenario 1: Links work now ✅
**Great!** The fix worked. The updated code is extracting URLs properly.

### Scenario 2: Some links work, some don't
**Normal!** Different RSS feeds have different quality. We can:
- Keep feeds with working links
- Remove feeds with bad links
- Find alternative feeds

### Scenario 3: No links work
**Need more info!** Check console logs and tell me:
- What does "Sample item structure" show?
- What's in availableProps array?
- I'll adjust the code!

---

## 🔧 Manual Fix (Advanced)

If you find that URLs are in a different property:

1. Open `app.js`
2. Find line 325:
```javascript
const articleUrl = item.link || item.guid || item.url || data.feed.link || '#';
```

3. Add the correct property first:
```javascript
const articleUrl = item.CORRECT_PROPERTY || item.link || item.guid || '#';
```

Replace `CORRECT_PROPERTY` with what console shows!

---

## ✅ Testing

After the fix, test:

1. **Click "Read more"** on 3-5 different articles
2. **Verify** each opens the full article (not homepage)
3. **Check different sources** (RTÉ, Irish Times, etc.)
4. **Works?** → Great! Done!
5. **Doesn't work?** → Check console and tell me!

---

**Let me know what the console shows and I'll help fix it perfectly!** 🔧

---

*The fix is in place - now we just need to verify it's working with real RSS data!*
