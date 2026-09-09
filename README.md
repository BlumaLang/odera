# 🎵 Staytup - Real-Time Music Streaming & Social Listening Platform

**Staytup** is a modern, high-performance, full-stack music streaming and collaborative listening application built with **React Native (Expo)**, **Node.js (Express)**, and **Firebase Realtime Database**. It combines fluid audio streaming with real-time social presence, collaborative playlists, and music taste matching.

---

## 🌟 Key Features

### 🎧 1. Seamless Audio Streaming & Player Engine
- **Direct Audio Streaming**: High-quality streaming with HTTP Range (`206 Partial Content`) proxying for low-latency playback and accurate seeking.
- **Lock Screen & Background Playback**:
  - Full iOS & Android background audio integration.
  - Native lock screen controls, Dynamic Island, and Media Notification support via custom native modules and standard Media Session APIs.
  - Real-time playback status sync (play/pause/seek/skip).
- **Synchronized Lyrics**:
  - Live synchronized (karaoke-style) and plain lyrics powered by LRCLIB.
  - Smooth autoscroll and line-by-line active highlighting.
- **Player Controls**:
  - Persistent bottom Mini Player with gesture controls.
  - Full-screen modal player with interactive waveform progress bar, volume controls, queue reordering, sleep timer, shuffle, and repeat modes.

---

### 👥 2. Social Listening & Friends Hub
- **Live Activity & Waveform Presence**:
  - Real-time visibility of what friends are listening to via Firebase Realtime Database.
  - Live animated waveform indicators for currently active playback.
  - Shows last played track and timestamp when offline.
- **Listen Along (Group Listening)**:
  - Jump directly into any friend's currently playing track with a single tap.
- **Music Match & Shared Blend**:
  - Calculates taste compatibility percentage based on listening history and favorite genres/artists.
  - Generates a shared "Blend" radar and playlist.
- **User Profiles & Metrics**:
  - View listening statistics: total hours listened, stream count, and liked songs.
  - Add, accept, remove, or manage friend requests with instant status feedback.

---

### 📂 3. Playlists & Real-Time Collaboration
- **Personal Playlists**:
  - Create, rename, customize, and manage playlists.
  - Curated preset cover library with high-resolution aesthetic artwork or custom image URLs.
  - Box-styled modern thumbnails.
- **Collaborative Playlists**:
  - Invite friends to collaborate in real-time.
  - Multi-user track additions, live collaborator avatars, and member role management.
  - Instant link sharing and 3-dot management menu.
- **Quick Actions**:
  - "Play All" and "Shuffle" buttons for playlists, favorites, and listening history.
  - One-tap add/remove tracks directly from song cards, search results, or queues.

---

### 🔍 4. Fast Search & Discovery
- **Instant Search**:
  - Streamlined, lightweight search bar toggle matching the clean Friends page interface.
  - Fast autocomplete query suggestions.
  - Real-time search across tracks, artists, and albums.
- **Explore & Browse**:
  - Daily personalized home feed with trending tracks.
  - Dedicated Artist Modal showing artist biography, top tracks, and discography.
  - Quick genre filtering chips.

---

### 👤 5. User Profiles & Personalization
- **Avatars & Themes**:
  - Customizable DiceBear Toon Head v10.x character avatars.
  - Vibrant avatar background color selector (Amethyst, Cyan, Amber, Rose, Electric Blue, Coral, White).
- **Name & Username Standards**:
  - Usernames enforced in clean lowercase format (up to 15 characters).
  - Profile display names automatically formatted with proper title casing (capital first letter).
- **Onboarding & Taste Tuning**:
  - Interactive onboarding to select preferred genres and languages.
  - Retuning flow accessible anytime from the Profile settings.

---

## 🛠️ Tech Stack & Architecture

### **Frontend**
- **Framework**: React Native with Expo SDK (Web, iOS, Android).
- **State Management**: React Context API (`UserContext`, `AudioContext`, `ResponsiveContext`).
- **Audio Engine**: `expo-av` + Web Audio API + HTML5 Audio + Custom iOS Lock Screen Module (`LockScreenControlsModule`).
- **Icons & Styling**: `@expo/vector-icons` (Ionicons, MaterialCommunityIcons), custom dark theme design system.

### **Backend**
- **Server**: Node.js with Express (pure ES Modules).
- **Stream Resolver**: YouTube Music stream resolution with persistent caching and HTTP Range support.
- **Lyrics Service**: LRCLIB API integration.
- **Database**: Firebase Realtime Database (`staytupnow-default-rtdb.firebaseio.com`) for real-time user activity, playlists, favorites, and profile storage.

---

## 📁 Directory Structure

```
staytup/
├── backend/                  # Express API Server
│   ├── server.js             # Main server script (endpoints, streaming, proxy)
│   ├── firebase-admin.js     # Firebase Admin SDK configuration
│   └── package.json          # Backend dependencies
│
├── frontend/                 # Expo / React Native App
│   ├── src/
│   │   ├── components/       # UI Components (MiniPlayer, PlayerModal, SongCard, PlaylistModal, etc.)
│   │   ├── context/          # State Providers (AudioContext, UserContext, ResponsiveContext)
│   │   ├── screens/          # Main Screens (HomeScreen, SearchScreen, LibraryScreen, FriendsScreen, ProfileScreen)
│   │   ├── services/         # Firebase service layer and API clients
│   │   └── theme/            # Color palettes and typography definitions
│   ├── app.json              # Expo configuration
│   └── package.json          # Frontend dependencies
│
└── README.md                 # Project Documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **Expo CLI** (`npm install -g expo-cli`)

### 2. Backend Setup
```bash
cd backend
npm install
npm start
```
*The backend server runs on `http://localhost:3000`.*

### 3. Frontend Setup
```bash
cd frontend
npm install
npx expo start --web
```
*The application opens in your browser at `http://localhost:8081`.*

---

## 📄 License
Private & Proprietary © Staytup. All rights reserved.
