# Changelog

All notable changes to the Staytup web and mobile experience are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
