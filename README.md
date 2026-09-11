# Staytup - Real-Time Music Streaming & Social Listening Platform

[![Staytup](https://img.shields.io/badge/Staytup-PWA%20v2.8.5-1DB954?style=for-the-badge&logo=music)](https://staytup.odireca.com)
[![React Native](https://img.shields.io/badge/React_Native-Expo%20SDK%2057-61DAFB?style=for-the-badge&logo=react)](https://reactnative.dev)
[![PHP](https://img.shields.io/badge/PHP-8.x%20Backend-777BB4?style=for-the-badge&logo=php)](https://php.net)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20Database-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com)
[![Service Worker](https://img.shields.io/badge/Service_Worker-staytup--pwa--v37-blue?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

**Staytup** is a modern, high-performance music streaming and collaborative listening Progressive Web App (PWA) built with **React Native for Web (Expo SDK 57)**, a lightweight **PHP 8.x backend**, and **Firebase Realtime Database**. It pairs studio-grade audio streaming with synchronized listening parties (without chat), full offline playback caching, comprehensive music library management (albums, followed artists, folders, duplicate clean-up, bulk editing, backup export & restore), real-time social presence, collaborative and blend playlists, friend listening sync, live synchronized karaoke lyrics, multi-device hardware management, advanced typo-tolerant search, and universal deep links.

---

## Key Features & Capabilities

### 1. 📚 Comprehensive Library & Offline Music Manager
- **Liked Songs**: Dedicated tracklist for user favorites with single-tap "Play All", "Shuffle All", and batch "Download All" offline actions.
- **Albums Library**: Full saved albums library with cover art grid, metadata, real-time filtering, and interactive `AlbumModal` featuring album hero artwork, tracklist, and offline download.
- **Followed Artists**: Dedicated followed artists hub with direct 1-tap navigation into full artist profile discographies.
- **Recently Played**: Chronological listening history tracking play counts with instant "Play All" and "Shuffle".
- **Recently Added**: Fast access to freshly added songs and playlists.
- **Downloaded / Offline Songs**: Full offline storage manager powered by the Cache API (`staytup-offline-audio-v1`). Shows total MB storage used, 1-tap "Clear All Downloads", offline green checkmark badges, and works completely offline without network connectivity.
- **Custom Playlists & Folders**: Organize playlists into custom folders with breadcrumb navigation (`Library > Folder Name`).
- **In-Library Real-Time Search & Sorting**: Search input filtering playlists, albums, songs, and folders instantly. Interactive sort pill cycling between Recent, A - Z, Z - A, and Track Count.
- **Duplicate-Track Detection**: Automatic scanning for duplicate tracks in playlists with an orange alert banner and 1-tap "Clean Up" button to deduplicate without losing playlist order.
- **Playlist Backup, Export & Restore**: 1-click "Export Playlist Backup (.json)" downloading a structured JSON file with all tracks and metadata, plus "Restore Backup" for instant JSON import.
- **Bulk Playlist Editing**: Multi-select track editing mode with checkboxes on each track row, Select All / Deselect All, and a sticky bottom action bar for bulk Delete and bulk Download.

### 2. 🎧 Listening Party — Without Chat
- **Synchronized Group Listening**: Create public discovery rooms or private rooms with 4-digit passcodes. Host playback controls are broadcasted live to all listeners with millisecond-level drift correction (~200ms) and automatic seek syncing.
- **Collaborative Room Queue**: Anyone in the room can search and suggest songs to the party queue.
- **Democratic Queue Upvoting**: Listeners can upvote queued tracks (`▲ count`); higher-voted tracks bubble up to play next automatically.
- **Democratic Vote-to-Skip**: If a track isn't vibing, listeners can vote to skip (`⏭ Vote Skip (x/threshold)`). When votes exceed 50% of active participants, the track advances automatically.
- **Zero-Chat Emoji Reaction Bursts**: Float real-time reaction bursts (❤️ 🔥 😂 😮 👏) across all listeners' screens without conversational text chatter, keeping the experience 100% focused on music.
- **Room Deep Links**: Instant sharing via `staytup.app/room/{id}` for one-tap entrance directly into the party.
- **Discovery Hub**: Dedicated "Parties" tab and live party discovery banner in the Friends screen.

### 2. Much Smarter Search & Voice Search
- **Search Operators**: Direct support for query operators (`artist:Arijit`, `genre:romantic`, `mood:chill`, `lyrics:phrase`, `year:2024`, `lang:hindi`) with one-tap quick operator chips.
- **Natural Language Discovery**: Search by lyrics, mood, genre, language, year, or artist + genre combinations.
- **Category Filter Tabs**: Switch instantly between `All`, `Songs`, `Artists`, `Albums`, and `Playlists`.
- **Integrated Voice Search**: Direct microphone transcription in the search bar powered by the Web Speech API.
- **Curated Trending Searches**: Real-time trending query pills for quick music discovery.
- **Embedded Album & Playlist Carousels**: Rich horizontal scroll shelves for albums and playlists with one-tap track exploration.

### 2. Universal Sharing & Deep Links
- **Spotify-Style Deep Link URLs**: Full routing support for `staytup.app/song/{id}`, `/album/{id}`, `/artist/{id}`, `/playlist/{id}`, `/room/{id}`, and `/user/{username}`.
- **Universal Web Preview Card**: Opens a preview modal featuring high-res artwork, metadata, and quick actions: `[▶ Play in Staytup]` and `[Open App]`.
- **Comprehensive Share Sheet**: Share songs, albums, artists, playlists, user profiles, and listening rooms with native system share sheets, clipboard copying, WhatsApp, and Messages.

### 3. High-Fidelity Audio Engine & Smart Playback
- **Direct Audio Decryption**: Instant server-side DES-ECB decryption for high-bitrate media streams.
- **Smart Stream Pre-Caching**: Background pre-caching of upcoming tracks in queue for instantaneous, gapless track transitions.
- **MediaSession API & Background Audio**: Native lock screen controls, playback notifications, high-resolution artwork metadata, and media key support across iOS, Android, macOS, and Windows.
- **Adaptive Queue System**: Full queue drawer with drag-and-drop reordering, remove-from-queue, and subtle "Up Next" notice banners.
- **Refined Full Player Modal**:
  - Direct, reliable scrubber slider without gesture interference.
  - Smooth fade animations and clean modal dismissal via the top-left chevron down button.
  - Flippable 3D album art that transitions directly into synchronized karaoke lyrics.
  - Sleep timer with built-in countdown presets (15m, 30m, 45m, 1h, End of Track) and gentle audio fade-out.

### 4. Live Airbuds-Style Reaction Bursts
- **Cross-Page Reactions**: React to friends' active listening across any page (Home feed, Friends hub, profile cards, and full player).
- **GPU-Accelerated Animations**: Powered by Web Animations API (WAAPI) for smooth 60fps floating emoji bursts with zero dropped frames.
- **Real-Time Delivery**: Realtime sync via Firebase RTDB delivering reactions instantly with sender details, track attribution, and animated burst particles.

### 5. Active Devices Management & Session Control
- **Genuine Hardware & Platform Detection**: Automatically detects client OS (`macOS`, `iOS`, `iPadOS`, `Windows`, `Android`, `Linux`, `ChromeOS`) and browser (`Chrome`, `Safari`, `Edge`, `Firefox`, `Brave`, `Opera`, or standalone PWA). Zero fabricated data.
- **Real-Time Presence & Heartbeat**: Synchronized with Firebase Realtime Database with 45-second liveness heartbeats and `.onDisconnect()` cleanup.
- **Device Switching & Remote Revocation**: View active listening devices in real-time, inspect playback hardware, and revoke unauthorized sessions with a single tap.

### 6. Spotify-Inspired Desktop Experience
- **Left-Oriented Hero Layout**: Covers art anchored on the left (220×220px with drop shadows) with playlist title, description, participant avatars, and song metadata immediately adjacent.
- **Left-Aligned Action Controls**: `Play All`, `Shuffle`, `Collaborate / Blend`, `Import from Link`, and `More Options` aligned directly with the tracks table.
- **Unified 3-Dot Options Popover**: Clean options menu for editing metadata, managing collaborators, importing songs, or deleting playlists without cluttered duplicate badges.

### 7. Social Listening, Friends Hub & Blend
- **Live Friend Presence**: Track what friends are listening to in real-time with pulsing live status indicators and waveform animations.
- **Listen Along (Sync Listening)**: One-tap synchronization to listen in real-time with a friend's active playback.
- **Blend & Collab Playlists**: Real-time collaborative playlist editing powered by Firebase with blend compatibility scores.
- **Standardized Confirmation Modals**: Consistent confirmation dialogs with clear button hierarchy (`#E53935` primary confirm on top, subtle secondary cancel on bottom).

### 8. Synchronized Karaoke Lyrics
- **Live Synchronized Lyrics**: Real-time karaoke-style lyrics synced to timestamps via LRCLIB integration.
- **Smooth Auto-Scroll**: Highlights active lines with smooth auto-scroll to keep the current vocal front and center.
- **Plain Text Fallback**: Graceful fallback to static plain lyrics when timestamp synchronization is unavailable.

### 9. Playlist Import Engine (Spotify & YouTube)
- **Instant Playlist Link Importer**: Paste any public Spotify playlist URL or YouTube Music link to automatically match and import all tracks into Staytup.
- **Real-Time Import Progress**: Live track matching feedback with fallback search algorithms.

### 10. Progressive Web App (PWA) & Offline Resilience
- **Full PWA Ready**: Installable on iOS (Safari Add to Home Screen), Android (Chrome PWA), and Desktop (Chrome/Edge/Brave).
- **Dual Manifest Architecture**: Native support for both `manifest.webmanifest` and `manifest.json` with strict MIME headers and explicit permission overrides.
- **Service Worker Caching**: Versioned cache invalidation (`sw.js`, `staytup-pwa-v34`) ensuring lightning-fast offline startup and instant app updates.

---

## Tech Stack & Architecture

| Layer | Technology |
|---|---|
| **Frontend** | React Native (Expo Web / Mobile SDK 57), React Context, Animated API |
| **Styling & Fonts** | Poppins Google Font, Dark Mode Obsidian Palette (`#000000`, `#121212`, `#1DB954`) |
| **Audio** | Web Audio API, HTML5 Audio, `expo-av` |
| **Realtime Social & Presence** | Firebase Realtime Database & Auth |
| **Backend API** | PHP 8.x, cURL, OpenSSL (DES-ECB decryption) |
| **Data Sources** | JioSaavn API Proxy, LRCLIB Synced Lyrics, YouTube Search |
| **PWA & Deployment** | Service Worker v33, Dual WebManifest, Apache `.htaccess` with SPA rewriting |

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
│   │   ├── components/         # ActiveDevicesModal, FullPlayerModal, LiveReactionOverlay, PlaylistModal, etc.
│   │   ├── context/            # AudioContext, UserContext, ResponsiveContext
│   │   ├── screens/            # HomeScreen, SearchScreen, LibraryScreen, FriendsScreen, ProfileScreen
│   │   ├── services/           # Firebase Realtime presence & Navigation handlers
│   │   └── theme/              # Obsidian color tokens & typography
│   ├── app.json                # Expo configuration
│   └── package.json            # Frontend dependencies (v2.8.2)
│
├── public/                     # Production Web Root (Apache DocumentRoot)
│   ├── api/                    # Synced PHP API gateway
│   ├── _expo/                  # Compiled React Native Web JS bundles & assets
│   ├── index.html              # Entry HTML with PWA tags & font preloads
│   ├── manifest.json           # Web App Manifest (JSON)
│   ├── manifest.webmanifest    # Modern Web App Manifest (RFC standard)
│   ├── sw.js                   # Service Worker cache controller (v33)
│   └── .htaccess               # Apache SPA rewrite engine & CORS headers
│
├── dist/                       # Production Distribution Directory
├── CHANGELOG.md                # Release notes and history
├── .htaccess                   # Root Apache rewriting rules & security overrides
├── manifest.json               # Root manifest fallback
├── manifest.webmanifest        # Root webmanifest fallback
├── sw.js                       # Root service worker controller
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

### 2. Frontend Development
1. Navigate into the frontend workspace:
   ```bash
   cd frontend
   npm install
   ```
2. Start the development server:
   ```bash
   npx expo start --web
   ```
3. To bump versions and stamp builds:
   ```bash
   node scripts/bump-version.js
   ```

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

## License
Staytup is developed for personal and educational music streaming purposes. All audio copyrights belong to their respective artists and record labels.
