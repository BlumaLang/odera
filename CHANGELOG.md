# Changelog

All notable changes to the Staytup web and mobile experience are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.8.6] - 2026-09-12

### Fixed
- **React Error #130 Resolution**: Fixed undefined dependency index in Module 693 (`PlaylistModal`) that prevented proper module resolution and caused `<PlaylistModal>` to throw React Error #130 during library mounting.
- **Service Worker Bulletproofing**: Upgraded Service Worker cache to `staytup-pwa-v37` with guaranteed fallback `Response` objects across all navigation routes, preventing `TypeError: Failed to convert value to 'Response'` promise rejections.
- **AlbumModal Container**: Corrected React Native `Modal` dependency binding in Module 712 (`AlbumModal`) for seamless overlay presentations.

### Added
- **Public Playlists (Listen-Only Mode)**:
  - Added public playlists discovery in the Library Playlists tab with dedicated subfilters: `"All"`, `"My Playlists"`, `"Public"`, and `"Collab"`.
  - Non-owner listeners browsing public playlists receive a dedicated `"PUBLIC PLAYLIST • LISTEN ONLY"` badge.
  - Listen-only protection prevents uninvited users from joining collaborative groups or mutating playlists (editing details, importing tracks, removing songs, and deleting playlists are disabled).
  - Listeners enjoy full audio playback (Play All, Shuffle, song tap playback, like/favorite, and "Save Copy to Library").
  - Backend `/api/playlists/public` endpoint and Firebase `subscribePublicPlaylists` real-time synchronization.
- **Synchronized Frontend Distribution**:
  - Populated and synchronized `frontend/dist/` with full compiled web app bundle, service workers, assets, and metadata matching `dist/` and `public/`.

## [2.8.5] - 2026-09-12

### Added
- **📚 Complete Library Overhaul (12 Major Features)**:
  - **Liked Songs**: Full dedicated tracklist with one-click "Play All", "Shuffle All", and batch "Download All" actions.
  - **Albums Library**: Saved albums collection with real-time search & sorting, cover art grid, and interactive `AlbumModal` (hero header, track list, play, shuffle, save/bookmark toggle, and offline download).
  - **Followed Artists**: Dedicated followed artists list with artist avatars and direct 1-tap navigation into full artist profile discographies.
  - **Recently Played**: Chronological listening history with track play counts and quick "Play All" / "Shuffle".
  - **Recently Added**: Real-time list of freshly added songs and playlists.
  - **Downloaded / Offline Songs**: Full offline storage manager powered by the Cache API (`staytup-offline-audio-v1`). Shows total MB formatted storage used, single-tap "Clear All Downloads", offline green checkmark badges, and playback that works completely offline without network connectivity.
  - **Custom Playlists**: Clean playlist management with custom cover artwork, tracks count, and duration summaries.
  - **Playlist Folders**: Create, rename, delete custom folders to organize playlists. Folder cards show playlist counts, and tapping opens folder breadcrumb navigation (`Library > Folder Name`).
  - **Playlist Sorting & Filtering**: Real-time in-library search input filtering playlists, albums, songs, and folders instantly. Interactive sort pill cycling between Recent, A - Z, Z - A, and Track Count.
  - **Duplicate-Track Detection**: Automatic scanning for duplicate tracks in playlists. Displays an orange alert banner with 1-tap "Clean Up" button to deduplicate without losing playlist order.
  - **Playlist Backup & Export**: 1-click "Export Playlist Backup (.json)" downloading a structured JSON file with all tracks and metadata.
  - **Bulk Playlist Editing**: Multi-select track editing mode with checkboxes on each track row, Select All / Deselect All, and a sticky bottom action bar for bulk Delete and bulk Download.
  - **Restore Playlist Backup**: "Restore Backup" pill allowing instant import and recreation of playlists from JSON backup files.

---

## [2.8.4] - 2026-09-12

### Added
- **🎧 Listening Party — Without Chat**:
  - Real-time listening rooms powered by Firebase Realtime Database with live synchronized playback.
  - Public discovery rooms and private rooms with 4-digit passcode protection.
  - Host master playback controls with listener drift correction (~200ms threshold) and synchronized seeks.
  - Collaborative room queue with real-time song searching and instant add-to-queue sheet.
  - Democratic track upvoting (`▲ count`) dynamically ordering upcoming queue playback.
  - Vote-to-skip functionality (`⏭ Vote Skip (x/threshold)`) requiring >50% consensus to advance tracks.
  - GPU-accelerated floating reaction bursts (❤️ 🔥 😂 😮 👏) with zero-chat design for pure music listening.
  - Universal deep link support for `staytup.app/room/{id}` for 1-click room joining and listening sync.
  - Dedicated "Parties" discovery tab & live party banner in `FriendsScreen`, plus quick action in FullPlayerModal 3-dot options menu.

### Fixed
- Fixed `TypeError: (0 , w.useResponsive) is not a function` in `DevModal` by decoupling from external responsive hooks and utilizing direct viewport and device info checks.
- Fixed `GET /api/index.php/search/trending` 400 Bad Request error by adding dedicated trending routing and parameter bypass.
- Configured Service Worker network-first caching strategy on application bundles to eliminate stale bundle issues.

---

## [2.8.3] - 2026-09-12

### Added
- **Much Smarter Search**:
  - Search operators support (`artist:`, `genre:`, `mood:`, `lyrics:`, `year:`, `lang:`) with quick operator chips.
  - Search by lyrics, mood, genre, language, year, and artist + genre combinations.
  - Category filter tabs: `All`, `Songs`, `Artists`, `Albums`, and `Playlists`.
  - Voice Search integrated directly into the search bar with microphone button powered by the Web Speech API.
  - Curated Trending Searches pill tags displayed in the search hub.
  - Album and Playlist carousel results cards embedded directly in search results.
- **Sharing & Deep Links**:
  - Support for direct deep links: `staytup.app/song/{id}`, `/album/{id}`, `/artist/{id}`, `/playlist/{id}`, `/room/{id}`, and `/user/{username}`.
  - Spotify-style web preview card with `[▶ Play in Staytup]` and `[Open App]` actions.
  - Universal share sheet modal supporting songs, albums, artists, playlists, user profiles, and listening party rooms with native share, clipboard copy, WhatsApp, and Messages.

### Changed
- Updated Service Worker cache name to `staytup-pwa-v34`.

---

## [2.8.2] - 2026-09-11

### Added
- **Unified Confirmation Modal Design**: Redesigned the Delete Playlist confirmation modal and Collab Delete modal to match the exact visual style, layout, and button hierarchy of the Delete Friend confirmation modal (stacked `#E53935` primary action button on top, subtle secondary cancel button on bottom, 480px max-width sheet, rounded corners, and clear confirmation messaging).
- **Desktop Popover Optimization**: Centered popover layout for track options on desktop and tablet viewports.

### Changed
- **Track Options Modal (3-Dot Menu)**:
  - Changed transition animation from sliding bottom sheet (`slide`) to a clean, smooth fade (`fade`).
  - Removed sliding-to-close pan gesture responder to eliminate gesture conflicts and accidental dismissals during scrolling.
  - Removed the redundant "Close" button from the bottom of the modal; dismissals now operate cleanly via backdrop tap or action selection.
- **Reaction Bar Polish**:
  - Removed `🫶` (heart hands) emoji from all quick-reaction bars and modal reaction trays.
- **Service Worker & Cache**:
  - Updated Service Worker cache name to `staytup-pwa-v33`.

---

## [2.8.1] - 2026-09-11

### Added
- **Real-Time Active Devices Management**:
  - Spotify-style active devices modal syncing live with Firebase Realtime Database.
  - Accurate client OS, browser, and hardware type detection with zero fabricated data.
  - Session heartbeat and remote session revocation capabilities.
- **Left-Oriented Desktop Playlist Layout**:
  - Redesigned the desktop playlist hero section with cover art anchored on the left (220×220px) and playlist details immediately adjacent to the right.
  - Aligned action controls (`Play All`, `Shuffle`, `Collaborate`, `Import`, `More Options`) with the tracks list.
  - Removed duplicate `[PLAYLIST]` badge from Blend playlists.

### Changed
- Complete removal of dance icon (`🕺`) across all feeds, cards, and modal reaction trays.
- Stamped build version `#1789153823`.

---

## [2.8.0] - 2026-09-11

### Added
- Live reaction bursts with Web Animations API across full player and feed screens.
- Circular active friend story tray for live playback monitoring.
- Collab playlist sharing and real-time listening sync.
