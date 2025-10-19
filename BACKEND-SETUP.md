# Backend Setup Instructions

## Overview

The application now uses a Node.js backend server that fetches Google News RSS feeds **once for all users** every 15 minutes, instead of each browser fetching independently.

## Benefits

- **Single-threaded fetching**: Only the server fetches from Google News (not every user)
- **Shared caching**: All users get the same cached data
- **Faster loading**: Users get instant results from the server cache
- **Reduced load**: Much fewer requests to Google News
- **Auto-refresh**: Server automatically refreshes articles every 15 minutes

## Prerequisites

- **Node.js** installed (v14 or higher)
  - Download from: https://nodejs.org/

## Installation

1. **Open Command Prompt or PowerShell**

2. **Navigate to the project directory:**
   ```bash
   cd C:\Users\jim_c\lorraine\ireland-windfarm-news
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

## Running the Server

### Start the server:
```bash
npm start
```

You should see:
```
🚀 Server running on http://localhost:3000
📰 API endpoint: http://localhost:3000/api/articles
💚 Health check: http://localhost:3000/api/health
```

### Development mode (auto-restart on changes):
```bash
npm run dev
```

## Accessing the Application

1. **Open your browser**
2. **Go to:** `http://localhost:3000`
3. The app will now fetch news from the backend server instead of directly from Google News

## How It Works

```
┌─────────────┐
│   Browser   │ ──┐
└─────────────┘   │
                  │
┌─────────────┐   │      ┌──────────────────┐
│   Browser   │ ──┼────► │  Node.js Server  │
└─────────────┘   │      │  (Port 3000)     │
                  │      │                  │
┌─────────────┐   │      │  • Caches news   │
│   Browser   │ ──┘      │  • Refreshes     │
└─────────────┘           │    every 15 min  │
                          └──────────────────┘
                                   │
                                   │ Fetches once
                                   │ every 15 min
                                   ▼
                          ┌──────────────────┐
                          │  Google News RSS │
                          └──────────────────┘
```

## API Endpoints

### GET /api/articles
Returns all cached articles

**Response:**
```json
{
  "articles": [...],
  "lastUpdate": "2025-10-19T10:30:00.000Z",
  "count": 45
}
```

### GET /api/health
Server health check

**Response:**
```json
{
  "status": "ok",
  "lastFetch": "2025-10-19T10:30:00.000Z",
  "articleCount": 45,
  "isFetching": false
}
```

## Configuration

Edit `server.js` to change settings:

```javascript
const CONFIG = {
    GOOGLE_NEWS_FEEDS: [...],  // RSS feed URLs
    REFRESH_INTERVAL: 15        // Refresh interval in minutes
};
```

## Troubleshooting

### Port 3000 already in use?
Change the port in `server.js`:
```javascript
const PORT = process.env.PORT || 3001;
```

### Backend not connecting?
Check the browser console - it should show:
```
Fetching news from backend API...
Successfully loaded X articles from backend
```

### Still fetching from Google News directly?
Make sure `app.js` has:
```javascript
API_ENDPOINT: window.location.origin + '/api/articles'
```

## Production Deployment

For production, consider:
- Using **PM2** to keep the server running: `npm install -g pm2 && pm2 start server.js`
- Setting up a **reverse proxy** with Nginx or Apache
- Using **environment variables** for configuration
- Adding **Redis** or **database** for persistent caching
- Deploying to **Heroku**, **DigitalOcean**, **AWS**, or similar

## Support

If you encounter issues, check:
1. Node.js is installed: `node --version`
2. Dependencies are installed: `npm install`
3. Server is running: `npm start`
4. Browser console for errors (F12)
