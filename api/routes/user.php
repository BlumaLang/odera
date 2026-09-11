<?php
/**
 * User Routes - Profile, Playlists, Favorites, History
 * These routes use local JSON file storage.
 * For production, integrate Firebase Admin SDK or MySQL.
 */

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/storage.php';

class UserRoutes {
    
    public static function handle($action, $method, $params = []) {
        switch ($action) {
            // Profile
            case 'onboard':
                return self::onboard($method);
            case 'profile':
                return self::profile();
            
            // Play / History
            case 'play_record':
                return self::recordPlay($method);
            case 'history':
                return self::history();
            
            // Favorites
            case 'favorites_toggle':
                return self::toggleFavorite($method);
            case 'favorites':
                return self::favorites();
            
            // Playlists
            case 'playlists_list':
                return self::listPlaylists();
            case 'playlists_create':
                return self::createPlaylist($method);
            case 'playlists_detail':
                return self::playlistDetail($params['id'] ?? null);
            case 'playlists_update':
                return self::updatePlaylist($params['id'] ?? null, $method);
            case 'playlists_delete':
                return self::deletePlaylist($params['id'] ?? null);
            case 'playlists_add_track':
                return self::addTrackToPlaylist($params['id'] ?? null, $method);
            case 'playlists_remove_track':
                return self::removeTrackFromPlaylist($params['id'] ?? null, $params['videoId'] ?? null);
            case 'playlists_bulk_delete_tracks':
                return self::bulkDeleteTracks($params['id'] ?? null, $method);
            case 'playlists_import_json':
                return self::importPlaylistJson($method);

            // Albums
            case 'albums':
                return self::handleAlbums($method);

            // Folders
            case 'folders':
                return self::handleFolders($method);
            
            // Premium
            case 'premium_save':
                return self::savePremium($method);
            
            default:
                sendError('Unknown user action', 404);
        }
    }
    
    // ==================== PROFILE ====================
    
    private static function onboard($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $userId = $body['user_id'] ?? null;
        
        if (!$userId) sendError('user_id is required');
        
        $profile = [
            'username'         => $body['username'] ?? '',
            'displayName'      => $body['username'] ?? '',
            'name'             => $body['username'] ?? '',
            'languages'        => $body['languages'] ?? [],
            'favoriteArtists'  => $body['favoriteArtists'] ?? [],
            'favorite_artists' => $body['favoriteArtists'] ?? [],
            'updatedAt'        => date('c'),
        ];
        
        Storage::saveUserProfile($userId, $profile);
        sendSuccess();
    }
    
    private static function profile() {
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $profile = Storage::getUserProfile($userId);
        sendJson($profile ?? []);
    }
    
    // ==================== PLAY / HISTORY ====================
    
    private static function recordPlay($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $userId = $body['user_id'] ?? null;
        
        if (!$userId) sendError('user_id is required');
        
        // Record recently played
        $track = [
            'id'               => $body['videoId'] ?? '',
            'videoId'          => $body['videoId'] ?? '',
            'video_id'         => $body['videoId'] ?? '',
            'title'            => $body['title'] ?? '',
            'artist'           => $body['artist'] ?? '',
            'album'            => $body['album'] ?? '',
            'thumbnail'        => $body['thumbnail'] ?? $body['image'] ?? '',
            'artwork_url'      => $body['artwork_url'] ?? $body['image'] ?? '',
            'duration'         => $body['duration'] ?? 0,
            'duration_seconds' => $body['duration_seconds'] ?? $body['duration'] ?? 0,
            'playedAt'         => date('c'),
        ];
        
        Storage::addRecentlyPlayed($userId, $track);
        
        // Increment stream count
        Storage::incrementStreamCount($userId);
        
        sendSuccess();
    }
    
    private static function history() {
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $recent = Storage::getRecentlyPlayed($userId);
        $stats = Storage::getUserStats($userId);
        
        sendJson([
            'recent' => $recent,
            'stats'  => $stats,
        ]);
    }
    
    // ==================== FAVORITES ====================
    
    private static function toggleFavorite($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $userId = $body['user_id'] ?? null;
        
        if (!$userId) sendError('user_id is required');
        
        $videoId = $body['videoId'] ?? '';
        $track = [
            'videoId'          => $videoId,
            'video_id'         => $videoId,
            'title'            => $body['title'] ?? '',
            'artist'           => $body['artist'] ?? '',
            'album'            => $body['album'] ?? '',
            'thumbnail'        => $body['thumbnail'] ?? $body['image'] ?? '',
            'artwork_url'      => $body['artwork_url'] ?? $body['image'] ?? '',
            'duration'         => $body['duration'] ?? 0,
            'duration_seconds' => $body['duration_seconds'] ?? $body['duration'] ?? 0,
            'likedAt'          => date('c'),
        ];
        
        $isFavorited = Storage::toggleFavorite($userId, $videoId, $track);
        
        sendJson(['favorited' => $isFavorited]);
    }
    
    private static function favorites() {
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $favorites = Storage::getFavorites($userId);
        sendJson(['favorites' => $favorites]);
    }
    
    // ==================== PLAYLISTS ====================
    
    private static function listPlaylists() {
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $playlists = Storage::getPlaylists($userId);
        sendJson($playlists);
    }
    
    private static function createPlaylist($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $userId = $body['user_id'] ?? null;
        
        if (!$userId) sendError('user_id is required');
        
        $playlist = [
            'id'          => 'pl_' . time() . '_' . bin2hex(random_bytes(4)),
            'name'        => $body['name'] ?? 'Untitled Playlist',
            'description' => $body['description'] ?? '',
            'cover_url'   => $body['cover_url'] ?? '',
            'tracks'      => $body['tracks'] ?? [],
            'track_count' => count($body['tracks'] ?? []),
            'created_at'  => date('c'),
        ];
        
        Storage::createPlaylist($userId, $playlist);
        
        sendJson(['playlist' => $playlist]);
    }
    
    private static function playlistDetail($id) {
        if (!$id) sendError('Playlist ID is required');
        
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $playlist = Storage::getPlaylist($userId, $id);
        if (!$playlist) sendError('Playlist not found', 404);
        
        sendJson($playlist);
    }
    
    private static function updatePlaylist($id, $method) {
        if ($method !== 'PUT') sendError('Method not allowed', 405);
        if (!$id) sendError('Playlist ID is required');
        
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $body = getRequestBody();
        $updates = [];
        if (isset($body['name'])) $updates['name'] = $body['name'];
        if (isset($body['description'])) $updates['description'] = $body['description'];
        if (isset($body['cover_url'])) $updates['cover_url'] = $body['cover_url'];
        
        Storage::updatePlaylist($userId, $id, $updates);
        sendSuccess();
    }
    
    private static function deletePlaylist($id) {
        if (!$id) sendError('Playlist ID is required');
        
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        Storage::deletePlaylist($userId, $id);
        sendSuccess();
    }
    
    private static function addTrackToPlaylist($id, $method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        if (!$id) sendError('Playlist ID is required');
        
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $body = getRequestBody();
        $track = $body['track'] ?? null;
        
        if (!$track) sendError('Track data is required');
        
        Storage::addTrackToPlaylist($userId, $id, $track);
        sendSuccess();
    }
    
    private static function removeTrackFromPlaylist($id, $videoId) {
        if (!$id) sendError('Playlist ID is required');
        if (!$videoId) sendError('Video ID is required');
        
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        Storage::removeTrackFromPlaylist($userId, $id, $videoId);
        sendSuccess();
    }
    
    private static function bulkDeleteTracks($id, $method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        if (!$id) sendError('Playlist ID is required');

        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');

        $body = getRequestBody();
        $videoIds = $body['video_ids'] ?? $body['videoIds'] ?? [];
        if (!is_array($videoIds) || empty($videoIds)) {
            sendError('video_ids array is required');
        }

        Storage::bulkRemoveTracksFromPlaylist($userId, $id, $videoIds);
        sendSuccess();
    }

    private static function importPlaylistJson($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);

        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');

        $body = getRequestBody();
        $name = $body['name'] ?? 'Imported Playlist';
        $tracks = $body['tracks'] ?? [];
        $description = $body['description'] ?? 'Imported from backup';
        $coverUrl = $body['cover_url'] ?? '';

        $playlist = [
            'id'          => 'pl_' . time() . '_' . bin2hex(random_bytes(4)),
            'name'        => $name,
            'description' => $description,
            'cover_url'   => $coverUrl,
            'tracks'      => $tracks,
            'track_count' => count($tracks),
            'created_at'  => date('c'),
            'imported_at' => date('c'),
        ];

        Storage::createPlaylist($userId, $playlist);
        sendJson(['playlist' => $playlist]);
    }

    // ==================== ALBUMS ====================

    private static function handleAlbums($method) {
        $userId = getQueryParam('user_id');
        if (!$userId) {
            $body = getRequestBody();
            $userId = $body['user_id'] ?? null;
        }
        if (!$userId) sendError('user_id is required');

        if ($method === 'GET') {
            $albums = Storage::getSavedAlbums($userId);
            sendJson(['albums' => $albums]);
        } else if ($method === 'POST') {
            $body = getRequestBody();
            $albumId = $body['album_id'] ?? $body['id'] ?? null;
            if (!$albumId) sendError('album_id is required');

            $albumData = [
                'id'          => $albumId,
                'album_id'    => $albumId,
                'title'       => $body['title'] ?? $body['name'] ?? '',
                'name'        => $body['title'] ?? $body['name'] ?? '',
                'artist'      => $body['artist'] ?? '',
                'image'       => $body['image'] ?? $body['artwork_url'] ?? '',
                'artwork_url' => $body['image'] ?? $body['artwork_url'] ?? '',
                'year'        => $body['year'] ?? '',
                'track_count' => $body['track_count'] ?? count($body['tracks'] ?? []),
                'tracks'      => $body['tracks'] ?? [],
                'saved_at'    => date('c'),
            ];

            $isSaved = Storage::toggleSavedAlbum($userId, $albumId, $albumData);
            sendJson(['saved' => $isSaved]);
        } else {
            sendError('Method not allowed', 405);
        }
    }

    // ==================== FOLDERS ====================

    private static function handleFolders($method) {
        $userId = getQueryParam('user_id');
        if (!$userId) {
            $body = getRequestBody();
            $userId = $body['user_id'] ?? null;
        }
        if (!$userId) sendError('user_id is required');

        if ($method === 'GET') {
            $folders = Storage::getPlaylistFolders($userId);
            sendJson(['folders' => $folders]);
        } else if ($method === 'POST' || $method === 'PUT') {
            $body = getRequestBody();
            $folders = $body['folders'] ?? [];
            Storage::savePlaylistFolders($userId, $folders);
            sendSuccess();
        } else {
            sendError('Method not allowed', 405);
        }
    }

    // ==================== PREMIUM ====================
    
    private static function savePremium($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $userId = $body['user_id'] ?? null;
        
        if (!$userId) sendError('user_id is required');
        
        $premium = [
            'isPremium'       => $body['is_premium'] ?? false,
            'premiumPlan'     => $body['plan'] ?? 'Free',
            'premiumPayment'  => $body['payment_details'] ?? [],
            'updatedAt'       => date('c'),
        ];
        
        Storage::saveUserPremium($userId, $premium);
        sendSuccess();
    }
}
