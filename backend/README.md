# YouTube Music & Audio Streaming Server with Firebase

A lightweight, high-performance Express pure JavaScript (ESM) backend for YouTube Music streaming, lyrics lookup, search autocomplete, and Firebase Realtime Database synchronization.

---

## 🎯 Features

1. **YouTube Music Direct Search & Autocomplete**:
   - `GET /api/search?q=:query` & `/search?q=:query`
   - `GET /api/suggest?q=:query` (YouTube search suggestions)
   - `GET /api/track-info?v=:videoId` (YouTube oEmbed metadata)
2. **Audio Stream Extraction & HTTP Range Proxy**:
   - `GET /stream/:id` & `/api/stream/:id`: Direct audio stream URL resolution with in-memory & Firebase persistent caching.
   - `GET /stream/:id/audio`: Seekable HTTP Range proxy (`206 Partial Content`), allowing Web and mobile clients (`expo-av`) to stream and seek without CORS or CDN issues.
3. **Synchronized & Plain Lyrics**:
   - `GET /api/lyrics?title=:title&artist=:artist&duration=:duration`: Lyrics lookup via LRCLIB.
4. **Firebase Realtime Database Integration**:
   - Connected to `https://staytupnow-default-rtdb.firebaseio.com`.
   - Real-time sync for playback events, trending charts, favorites, playlists, and stream caching.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

The server starts on `http://localhost:3000`.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health`, `/health` | Server status, uptime, cache size, and Firebase health |
| `GET` | `/api/search?q=...`, `/search` | YouTube music search |
| `GET` | `/api/suggest?q=...`, `/suggest` | Search autocomplete suggestions |
| `GET` | `/api/track-info?v=...` | YouTube track metadata lookup |
| `GET` | `/stream/:id`, `/api/stream/:id` | Resolve playable audio stream |
| `GET` | `/stream/:id/audio` | Seekable HTTP Range audio proxy |
| `GET` | `/api/lyrics`, `/lyrics` | Synced and plain lyrics via LRCLIB |
| `GET` | `/home`, `/home/:userId` | Daily home feed with trending tracks |
| `POST` | `/play-event` | Record playback event to Firebase |
| `GET/POST`| `/favorites/:userId`, `/favorite` | Sync favorites with Firebase RTDB |
| `GET/POST`| `/playlists` | Sync playlists with Firebase RTDB |
