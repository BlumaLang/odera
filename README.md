# Staytup - Real-Time Music Streaming & Social Listening Platform

**Staytup** is a modern, high-performance, full-stack music streaming and collaborative listening application built with **React Native (Expo)**, **PHP Backend**, and **Firebase Realtime Database**. It combines fluid audio streaming with real-time social presence, collaborative playlists, and music taste matching.

---

## Key Features

### 1. Seamless Audio Streaming & Player Engine
- **Direct Audio Streaming**: High-quality streaming with server-side DES decryption for JioSaavn stream URLs.
- **Lock Screen & Background Playback**: Full iOS & Android background audio integration.
- **Synchronized Lyrics**: Live synchronized (karaoke-style) and plain lyrics powered by LRCLIB.
- **Player Controls**: Persistent bottom Mini Player with gesture controls.

### 2. Social Listening & Friends Hub
- **Live Activity & Waveform Presence**: Real-time visibility of what friends are listening to.
- **Listen Along**: Jump directly into any friend's currently playing track.
- **Music Match & Shared Blend**: Calculates taste compatibility percentage.

### 3. Playlists & Real-Time Collaboration
- **Personal Playlists**: Create, rename, customize, and manage playlists.
- **Collaborative Playlists**: Invite friends to collaborate in real-time.

### 4. Fast Search & Discovery
- **Instant Search**: Fast autocomplete query suggestions across tracks, artists, and albums.
- **Explore & Browse**: Daily personalized home feed with trending tracks.

### 5. User Profiles & Personalization
- **Avatars & Themes**: Customizable character avatars with vibrant color selector.
- **Onboarding & Taste Tuning**: Interactive onboarding to select preferred genres and languages.

---

## Tech Stack & Architecture

### Frontend
- **Framework**: React Native with Expo SDK (Web, iOS, Android).
- **State Management**: React Context API (`UserContext`, `AudioContext`, `ResponsiveContext`).
- **Audio Engine**: `expo-av` + Web Audio API + HTML5 Audio.

### Backend (PHP)
- **Server**: PHP 8.x with custom router.
- **API Proxy**: JioSaavn API proxy with server-side stream URL decryption.
- **Lyrics Service**: LRCLIB API integration.
- **Storage**: Local JSON file storage (easily replaceable with MySQL/Firebase).

---

## Directory Structure

```
odera/
├── api/                    # PHP Backend API
│   ├── config/             # Configuration
│   │   └── config.php      # App configuration
│   ├── middleware/          # Request middleware
│   │   ├── auth.php        # Authentication middleware
│   │   └── cors.php        # CORS headers
│   ├── routes/             # Route handlers
│   │   ├── artist.php      # Artist endpoints
│   │   ├── auth.php        # Authentication endpoints
│   │   ├── music.php       # Music/track endpoints
│   │   ├── referral.php    # Referral endpoints
│   │   ├── search.php      # Search endpoints
│   │   └── user.php        # User/profile endpoints
│   ├── services/           # External API integrations
│   │   ├── jiosaavn.php    # JioSaavn API service
│   │   └── lyrics.php      # LRCLIB lyrics service
│   ├── utils/              # Utility functions
│   │   ├── http.php        # HTTP client
│   │   ├── response.php    # Response helpers
│   │   └── storage.php     # Local file storage
│   └── index.php           # Main API router
│
├── data/                   # Local data storage (auto-created)
│   ├── users/              # User data
│   ├── pin_users/          # PIN-based auth users
│   ├── qr_sessions/        # QR login sessions
│   └── referrals/          # Referral codes
│
├── frontend/               # Expo / React Native App
│   ├── src/
│   │   ├── components/     # UI Components
│   │   ├── context/        # State Providers
│   │   ├── screens/        # Main Screens
│   │   ├── services/       # Firebase & API clients
│   │   └── theme/          # Color palettes
│   ├── app.json            # Expo configuration
│   └── package.json        # Frontend dependencies
│
├── .htaccess               # Apache URL rewriting
├── index.php               # Main entry point
└── README.md               # Project Documentation
```

---

## Getting Started

### Prerequisites
- **PHP 8.x** with `curl` extension enabled
- **Apache/Nginx** with mod_rewrite (for `.htaccess` support)

### Backend Setup

1. Place the project in your web server's document root (e.g., `/var/www/html/odera/`)

2. Ensure PHP has write permissions to the `data/` directory:
   ```bash
   chmod -R 755 data/
   ```

3. The API is accessible at:
   ```
   http://localhost/odera/api/
   ```

### Frontend Setup

```bash
cd frontend
npm install
npx expo start --web
```

The application opens in your browser at `http://localhost:8081`.

---

## API Endpoints

### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

### Music & Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=&offset=&limit=` | Search songs |
| GET | `/api/suggestions?q=` | Get search suggestions |
| GET | `/api/home?user_id=&force=` | Get home feed |
| GET | `/api/feed/personalized?user_id=` | Get personalized feed |
| GET | `/api/lyrics?title=&artist=&video_id=` | Get lyrics |
| GET | `/api/stream/:videoId` | Get stream URL |
| GET | `/api/track/:id` | Get track details |
| GET | `/api/track/:id/image` | Get track image |

### Artists
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/artists/search?q=&limit=` | Search artists |
| GET | `/api/artists/popular?lang=&limit=` | Get popular artists |
| POST | `/api/artists/batch-images` | Batch fetch artist images |
| GET | `/api/artist/:id/songs?page=&limit=` | Get artist songs |
| GET | `/api/artist/:id/image` | Get artist image |
| GET | `/api/artist/:id/related?limit=` | Get related artists |

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/pin` | PIN-based login |
| POST | `/api/qr/create` | Create QR session |
| GET | `/api/qr/poll/:sessionId` | Poll QR session |
| POST | `/api/qr/claim` | Claim QR session |

### User Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/user/onboard` | Save user profile |
| GET | `/api/user/profile?user_id=` | Get user profile |
| POST | `/api/play/record` | Record play event |
| GET | `/api/history?user_id=` | Get play history |

### Favorites
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/favorites/toggle` | Toggle favorite |
| GET | `/api/favorites?user_id=` | Get favorites |

### Playlists
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/playlists?user_id=` | List playlists |
| POST | `/api/playlists/create` | Create playlist |
| GET | `/api/playlists/:id?user_id=` | Get playlist |
| PUT | `/api/playlists/:id?user_id=` | Update playlist |
| POST | `/api/playlists/:id/tracks` | Add track |
| DELETE | `/api/playlists/:id/tracks/:videoId` | Remove track |
| DELETE | `/api/playlists/:id` | Delete playlist |

### Premium
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/premium/save` | Save premium subscription |

### Referrals
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/referral/create` | Create referral code |
| POST | `/api/referral/claim` | Claim referral code |
| GET | `/api/referral/stats?user_id=` | Get referral stats |

---

## Frontend Integration

The frontend API client (`frontend/src/api/client.js`) automatically communicates with the PHP backend. Ensure the API base URL is configured correctly:

```javascript
const API_BASE = 'http://localhost/odera/api';
```

For production, update the API base URL to your deployed domain.

---

## Data Storage

User data is stored locally in the `data/` directory using JSON files:

```
data/
└── users/
    └── {userId}/
        ├── profile.json
        ├── favorites.json
        ├── playlists.json
        ├── recently_played.json
        ├── stats.json
        └── premium.json
```

For production, replace `api/utils/storage.php` with Firebase Admin SDK or MySQL integration.

---

## License
Private & Proprietary Staytup. All rights reserved.
