# Staytup - Real-Time Music Streaming & Social Listening Platform

[![Staytup](https://img.shields.io/badge/Staytup-PWA%20v2.5.0-1DB954?style=for-the-badge&logo=music)](https://staytup.odireca.com)
[![React Native](https://img.shields.io/badge/React_Native-Expo%20SDK%2052-61DAFB?style=for-the-badge&logo=react)](https://reactnative.dev)
[![PHP](https://img.shields.io/badge/PHP-8.x%20Backend-777BB4?style=for-the-badge&logo=php)](https://php.net)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20Database-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com)

**Staytup** is a modern, high-performance, full-stack music streaming and collaborative listening application built with **React Native (Expo)**, a lightweight **PHP 8.x backend**, and **Firebase Realtime Database**. It pairs studio-grade audio streaming with real-time social presence, collaborative playlists, friend listening sync, and live synchronized lyrics.

---

## Key Features & Capabilities

### 1. High-Fidelity Audio Engine & Smart Playback
- **Direct Audio Decryption**: Instant server-side DES-ECB decryption for high-bitrate JioSaavn media streams.
- **Smart Stream Pre-Caching**: Background pre-caching of upcoming tracks in queue for instantaneous, gapless track transitions.
- **MediaSession API & Background Audio**: Native lock screen controls, playback notifications, artwork metadata, and media key support across iOS, Android, macOS, and Windows.
- **Adaptive Queue System**: Full queue drawer with drag-and-drop reordering, remove-from-queue, and subtle "Up Next" notice banners.
- **Repeat & Shuffle**: Authentic playback loop (Repeat All, Repeat One, Shuffle mode).
- **Sleep Timer**: Built-in countdown sleep timer (15m, 30m, 45m, 1h, End of Track) with gentle audio fade-out.

### 2. Synchronized Karaoke Lyrics
- **Live Synchronized Lyrics**: Real-time karaoke-style lyrics synced to timestamps via LRCLIB integration.
- **Smooth Auto-Scroll**: Highlights active lines with smooth auto-scroll to keep the current vocal front and center.
- **3D Album Flip Player**: Tap artwork to flip 180 degrees directly into full-card synchronized lyrics.
- **Plain Text Fallback**: Graceful fallback to static plain lyrics when timestamp synchronization is unavailable.

### 3. Social Listening & Friends Hub
- **Live Friend Presence**: See what friends are listening to in real-time with animated waveform indicators.
- **Listen Along (Sync Listening)**: One-tap synchronization to listen in real-time with a friend's active playback.
- **Music Taste Match & Blend**: Algorithmic taste compatibility score calculated between friends based on genre and artist listening history.
- **Custom 3D Memoji Avatars**: 10+ custom 3D pastel avatars and customizable profile headers.

### 4. Playlist Import Engine (Spotify & YouTube)
- **Instant Playlist Link Importer**: Paste any public Spotify playlist URL or YouTube Music link to automatically match and import all tracks into Staytup.
- **Real-Time Import Progress**: Live track matching feedback with fallback search algorithms.
- **Collaborative Playlists**: Real-time multi-user collaborative playlist editing powered by Firebase.

### 5. Multi-Artist Exploration & Discography
- **Smart Multi-Artist Parsing**: Intelligently parses collaborated tracks (e.g. `Vishal Mishra, Raj Shekhar`) and displays individual artist pills.
- **Artist Bottom Sheet & Discography**: Tap any artist name to view popular songs, related artists, and full discography.
- **Automated High-Res Artist Imagery**: Dynamic artist photo resolution with caching and CDN fallbacks.

### 6. Progressive Web App (PWA) & Responsive Design
- **Full PWA Ready**: Installable on iOS (Safari Add to Home Screen), Android (Chrome PWA), and Desktop (Chrome/Edge/Brave).
- **Dual Manifest Architecture**: Native support for both `manifest.webmanifest` and `manifest.json` with strict MIME headers and explicit permission overrides.
- **Service Worker Caching**: Versioned cache invalidation (`sw.js`) ensuring lightning-fast offline startup and instant app updates.
- **Fluid Desktop & Mobile UI**:
  - **Desktop**: 3-column Spotify-inspired layout with collapsible navigation sidebar, persistent deck player, and expandable queue/lyrics sidebar.
  - **Mobile**: Single-hand optimized navigation bar, swipeable bottom MiniPlayer, and full-screen gestures.

---

## Tech Stack & Architecture

| Layer | Technology |
|---|---|
| **Frontend** | React Native (Expo Web / Mobile SDK 52), React Context, Animated API |
| **Styling & Fonts** | Clean Modern System Sans-Serif (`-apple-system`, `Segoe UI`, `Roboto`), Dark Mode Obsidian Palette |
| **Audio** | Web Audio API, HTML5 Audio, `expo-av` |
| **Realtime Social** | Firebase Realtime Database & Auth |
| **Backend API** | PHP 8.x, cURL, OpenSSL (DES-ECB decryption) |
| **Data Sources** | JioSaavn API Proxy, LRCLIB Synced Lyrics, YouTube Search |
| **PWA & Deployment**| Service Worker v22, Dual WebManifest, Apache `.htaccess` with SPA rewriting |

---

## Project Structure

```
staytup/
├── api/                        # PHP Micro-Backend Router & Services
│   ├── config/                 # App configuration & versioning
│   ├── routes/
│   │   ├── artist.php          # Artist discography & images
│   │   ├── import.php          # Spotify & YouTube playlist scraper
│   │   ├── music.php           # Stream, lyrics, and home feed endpoints
│   │   ├── search.php          # Fast autocomplete and track search
│   │   └── user.php            # User profiles, favorites, and history
│   ├── services/
│   │   ├── jiosaavn.php        # JioSaavn API integration with DES decryption
│   │   └── lyrics.php          # LRCLIB synchronized lyrics client
│   └── index.php               # Unified API gateway & CORS dispatcher
│
├── frontend/                   # Expo React Native Application
│   ├── public/                 # PWA Static Template (index.html, manifest, sw.js)
│   ├── src/
│   │   ├── api/                # API client with automatic retry & proxy fallbacks
│   │   ├── components/         # Modular UI (FullPlayerModal, MiniPlayer, SongCard, etc.)
│   │   ├── context/            # AudioContext, UserContext, ResponsiveContext
│   │   ├── screens/            # HomeScreen, SearchScreen, LibraryScreen, FriendsScreen
│   │   ├── services/           # Firebase Realtime presence & Navigation handlers
│   │   └── theme/              # Obsidian color tokens & typography
│   ├── app.json                # Expo configuration
│   └── package.json            # Frontend dependencies
│
├── public/                     # Production Web Root (Apache DocumentRoot)
│   ├── api/                    # Synced PHP API gateway
│   ├── _expo/                  # Compiled React Native Web JS bundles & assets
│   ├── index.html              # Entry HTML with PWA tags & font preloads
│   ├── manifest.json           # Web App Manifest (JSON)
│   ├── manifest.webmanifest    # Modern Web App Manifest (RFC standard)
│   ├── sw.js                   # Service Worker cache controller (v22)
│   └── .htaccess               # Apache SPA rewrite engine & CORS headers
│
├── .htaccess                   # Root Apache rewriting rules & security overrides
├── manifest.json               # Root manifest fallback
├── manifest.webmanifest        # Root webmanifest fallback
└── README.md                   # Project Documentation
```

---

## Getting Started

### 1. Backend Setup
1. Clone the repository into your web server document root:
   ```bash
   git clone https://github.com/BlumaLang/odera.git staytup
   ```
2. Verify Apache is running and rewrite rules are active. The API responds at:
   ```
   http://localhost/staytup/api/index.php/health
   ```

### 2. Frontend Setup
1. Navigate into the frontend workspace:
   ```bash
   cd frontend
   npm install
   ```
2. Start the development server:
   ```bash
   npx expo start --web
   ```
3. To produce a production build for deployment:
   ```bash
   npm run build
   ```
   Build artifacts will compile to `frontend/dist/` and automatically deploy to `public/`.

---

## Core API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/index.php/health` | Server status and version check |
| `GET` | `/api/index.php/home` | Personalized home feed (trending, fresh drops, curated charts) |
| `GET` | `/api/index.php/search?q={query}` | Search songs, albums, and artists |
| `GET` | `/api/index.php/suggestions?q={query}` | Real-time autocomplete suggestions |
| `GET` | `/api/index.php/stream/{id}` | Resolve and decrypt high-speed audio stream URL |
| `GET` | `/api/index.php/lyrics?title={title}&artist={artist}` | Fetch synchronized and plain lyrics |
| `GET` | `/api/index.php/track/{id}` | Get full track metadata |
| `GET` | `/api/index.php/artist/{id}/songs` | Get top tracks for an artist |
| `POST` | `/api/index.php/import` | Parse and import public Spotify / YouTube playlist |
| `GET` | `/api/index.php/proxy-image?url={url}` | High-speed CORS-safe image proxy |

---

## Security & PWA Best Practices
- **Privacy-First**: No external telemetry or trackers injected.
- **MIME Compliance**: `.webmanifest` and `.json` explicitly served with `application/manifest+json; charset=utf-8`.
- **CORS Configured**: Wildcard and method headers enabled for smooth media streaming.
- **Cache Management**: Instant PWA updates via service worker cache invalidation.

---

## License
Staytup is developed for personal and educational music streaming purposes. All audio copyrights belong to their respective artists and record labels.
