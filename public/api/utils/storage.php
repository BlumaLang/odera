<?php
/**
 * Local JSON File Storage
 * Simple file-based storage for user data.
 * For production, replace with Firebase Admin SDK or MySQL.
 */

class Storage {
    
    private static $dataDir = null;
    
    private static function getDataDir() {
        if (self::$dataDir === null) {
            self::$dataDir = __DIR__ . '/../../data';
            if (!is_dir(self::$dataDir)) {
                mkdir(self::$dataDir, 0755, true);
            }
        }
        return self::$dataDir;
    }
    
    private static function getUserDir($userId) {
        $dir = self::getDataDir() . '/users/' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $userId);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }
    
    private static function readJson($path) {
        if (!file_exists($path)) return null;
        $content = file_get_contents($path);
        return json_decode($content, true);
    }
    
    private static function writeJson($path, $data) {
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    
    // ==================== USER PROFILE ====================
    
    public static function saveUserProfile($userId, $profile) {
        $dir = self::getUserDir($userId);
        self::writeJson($dir . '/profile.json', $profile);
    }
    
    public static function getUserProfile($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/profile.json');
    }
    
    // ==================== RECENTLY PLAYED ====================
    
    public static function addRecentlyPlayed($userId, $track) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/recently_played.json';
        $recent = self::readJson($path) ?? [];
        
        // Remove duplicate if exists
        $recent = array_filter($recent, fn($t) => $t['videoId'] ?? $t['id'] ?? '' !== $track['videoId'] ?? '');
        
        // Add to front
        array_unshift($recent, $track);
        
        // Keep only 50 items
        $recent = array_slice($recent, 0, 50);
        
        self::writeJson($path, array_values($recent));
    }
    
    public static function getRecentlyPlayed($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/recently_played.json') ?? [];
    }
    
    // ==================== STREAM COUNT ====================
    
    public static function incrementStreamCount($userId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/stats.json';
        $stats = self::readJson($path) ?? ['streamCount' => 0];
        $stats['streamCount'] = ($stats['streamCount'] ?? 0) + 1;
        self::writeJson($path, $stats);
    }
    
    public static function getUserStats($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/stats.json') ?? ['streamCount' => 0];
    }
    
    // ==================== FAVORITES ====================
    
    public static function toggleFavorite($userId, $videoId, $track) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/favorites.json';
        $favorites = self::readJson($path) ?? [];
        
        if (isset($favorites[$videoId])) {
            unset($favorites[$videoId]);
            self::writeJson($path, $favorites);
            return false; // Removed
        } else {
            $favorites[$videoId] = $track;
            self::writeJson($path, $favorites);
            return true; // Added
        }
    }
    
    public static function getFavorites($userId) {
        $dir = self::getUserDir($userId);
        $favorites = self::readJson($dir . '/favorites.json') ?? [];
        return array_values($favorites);
    }
    
    // ==================== PLAYLISTS ====================
    
    public static function getPlaylists($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/playlists.json') ?? [];
    }
    
    public static function createPlaylist($userId, $playlist) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        $playlists[] = $playlist;
        self::writeJson($path, $playlists);
    }
    
    public static function getPlaylist($userId, $playlistId) {
        $playlists = self::getPlaylists($userId);
        foreach ($playlists as $pl) {
            if ($pl['id'] === $playlistId) return $pl;
        }
        return null;
    }
    
    public static function updatePlaylist($userId, $playlistId, $updates) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        foreach ($playlists as &$pl) {
            if ($pl['id'] === $playlistId) {
                $pl = array_merge($pl, $updates);
                break;
            }
        }
        
        self::writeJson($path, $playlists);
    }
    
    public static function deletePlaylist($userId, $playlistId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        $playlists = array_filter($playlists, fn($pl) => $pl['id'] !== $playlistId);
        self::writeJson($path, array_values($playlists));
    }
    
    public static function addTrackToPlaylist($userId, $playlistId, $track) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        foreach ($playlists as &$pl) {
            if ($pl['id'] === $playlistId) {
                $pl['tracks'][] = $track;
                $pl['track_count'] = count($pl['tracks']);
                break;
            }
        }
        
        self::writeJson($path, $playlists);
    }
    
    public static function removeTrackFromPlaylist($userId, $playlistId, $videoId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        foreach ($playlists as &$pl) {
            if ($pl['id'] === $playlistId) {
                $pl['tracks'] = array_filter($pl['tracks'], fn($t) => ($t['videoId'] ?? '') !== $videoId);
                $pl['tracks'] = array_values($pl['tracks']);
                $pl['track_count'] = count($pl['tracks']);
                break;
            }
        }
        
        self::writeJson($path, $playlists);
    }
    
    // ==================== PREMIUM ====================
    
    public static function saveUserPremium($userId, $premium) {
        $dir = self::getUserDir($userId);
        self::writeJson($dir . '/premium.json', $premium);
    }
    
    public static function getUserPremium($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/premium.json') ?? ['isPremium' => false, 'premiumPlan' => 'Free'];
    }
}
