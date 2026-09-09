# Staytup Music & Audio Streaming Server

A lightweight, high-performance Express (ESM) backend for JioSaavn 320kbps music streaming, search, artist discovery, synchronized lyrics lookup via LRCLIB, and Firebase Realtime Database synchronization.

---

## 🎯 Architecture & Features

1. **Pure JioSaavn Music Streaming & Search**:
   - **Zero YouTube fallbacks**: Directly searches and resolves tracks via JioSaavn direct web API and Staytup Saavn API.
   - **320kbps High-Quality Audio**: Resolves 320kbps MP4 audio stream URLs directly from JioSaavn CDNs.
   - **Comprehensive Artist Search & Catalog**: Fetches artist discographies and multi-query search results (including international & indie artists like *The Kid LAROI*, *PROS BANDIDO*, etc.).
   - In-memory caching with configurable TTLs to ensure sub-second response times and prevent rate limits.

2. **Synchronized & Plain Lyrics**:
   - `GET /api/lyrics?title=:title&artist=:artist&duration=:duration`: Dual-mode lyrics lookup powered by LRCLIB with LRU memory caching. Supports synced timestamped LRC format and plain lyrics.

3. **Artist Discovery & Discography**:
   - `GET /api/artists/:idOrName/songs`: Fetch full deduplicated track releases and top songs for any artist without compilation duplicates.
   - `GET /artists/search`: Search artists across JioSaavn.
   - `GET /artists/similar`: Discover related and similar artists.

4. **Trending & Home Feed**:
   - `GET /api/home/saavn`: Dynamic curated homepage sections including *Trending Now*, *Top Charts*, *New Releases*, and *Top Playlists*.

5. **Firebase Realtime Database Integration**:
   - Synced with Firebase RTDB (`https://staytupnow-default-rtdb.firebaseio.com`).
   - Caches track artwork, artist portraits, user favorites, playlists, and collaborative blend sessions.

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

The server starts on `http://localhost:3000` (or `process.env.PORT`).

---

## 📡 API Endpoints Reference

### Health & System
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health`, `/health` | Server status, uptime, cache statistics, and memory usage |

### Search & Suggestions
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search/saavn?q=...` | Direct JioSaavn search (multi-query resolution, 320kbps ready) |
| `GET` | `/api/suggest?q=...` | Fast autocomplete suggestions for search terms |

### Streaming & Artwork
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stream/saavn/:id` | Resolve 320kbps direct audio stream URL with caching |
| `GET` | `/api/track-image/:id` | Get 500x500 high-resolution album artwork (cached in RTDB) |

### Artists & Discography
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/artists/:idOrName/songs` | Official artist songs and discography (deduplicated) |
| `GET` | `/artists/search?q=...` | Search artists by name |
| `GET` | `/artists/similar?q=...` | Related/similar artists lookup |

### Curated Content & Lyrics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/home/saavn` | Curated JioSaavn home sections (Trending, Charts, Playlists) |
| `GET` | `/api/lyrics?title=...&artist=...` | Synchronized LRC and plain lyrics via LRCLIB |

### Firebase RTDB Sync
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/play-event` | Record playback events and update trending counters |
| `GET/POST` | `/favorites/:userId`, `/favorite` | User favorites synchronization |
| `GET/POST` | `/playlists` | User playlists and collaborative blend management |

---

## 🌐 Production Deployment

- **Hosting Platform**: Render (`https://staytup.onrender.com`)
- **Node.js**: >= 18 (ESM modules)
- **Environment Variables**:
  - `PORT`: Server port (defaults to 3000)
  - `FIREBASE_DATABASE_URL`: Firebase Realtime Database URL

