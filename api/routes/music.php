<?php
/**
 * Music Routes - Tracks, Streams, Home Feed
 */

require_once __DIR__ . '/../services/jiosaavn.php';
require_once __DIR__ . '/../services/lyrics.php';

class MusicRoutes {
    
    public static function handle($action, $method, $params = []) {
        switch ($action) {
            case 'health':
                return self::health();
            case 'home':
                return self::homeFeed();
            case 'feed':
                return self::personalizedFeed();
            case 'lyrics':
                return self::lyrics();
            case 'proxy-image':
                return self::proxyImage();
            case 'stream':
                return self::stream($params['id'] ?? null);
            case 'track':
                if (isset($params['subaction']) && $params['subaction'] === 'image') {
                    return self::trackImage($params['id'] ?? null);
                }
                return self::track($params['id'] ?? null);
            case 'album':
                return self::album($params['id'] ?? null);
            default:
                sendError('Unknown music action', 404);
        }
    }
    
    private static function health() {
        sendJson([
            'status' => 'ok',
            'source' => 'php_backend',
            'version' => APP_VERSION,
        ]);
    }
    
    private static function homeFeed() {
        $userId = getQueryParam('user_id');
        $force = getQueryParam('force', 'false') === 'true';
        
        $feed = JioSaavnService::getHomeFeed($userId, $force);
        sendJson($feed);
    }
    
    private static function personalizedFeed() {
        // For now, return home feed. In production, personalize based on user history
        $userId = getQueryParam('user_id');
        $feed = JioSaavnService::getHomeFeed($userId);
        $feed['personalized'] = false;
        sendJson($feed);
    }
    
    private static function lyrics() {
        $title = getQueryParam('title', '');
        $artist = getQueryParam('artist', '');
        $videoId = getQueryParam('video_id', '');
        
        if (empty($title)) {
            sendError('Track title is required');
        }
        
        $lyrics = LyricsService::getLyrics($title, $artist, $videoId);
        sendJson($lyrics);
    }
    
    private static function stream($videoId) {
        if (empty($videoId)) {
            sendError('Video ID is required');
        }
        
        $stream = JioSaavnService::getStreamUrl($videoId);
        if (!$stream) {
            sendError('Stream not found or unavailable', 404);
        }
        
        sendJson($stream);
    }
    
    private static function track($videoId) {
        if (empty($videoId)) {
            sendError('Video ID is required');
        }
        
        $track = JioSaavnService::getTrackDetails($videoId);
        if (!$track) {
            sendError('Track not found', 404);
        }
        
        sendJson($track);
    }
    
    private static function trackImage($videoId) {
        if (empty($videoId)) {
            sendError('Video ID is required');
        }
        
        $image = JioSaavnService::getTrackImage($videoId);
        if (!$image) {
            sendError('Track image not found', 404);
        }
        
        sendJson($image);
    }
    
    private static function proxyImage() {
        $url = getQueryParam('url');
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            sendError('Valid image URL is required', 400);
        }
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ]);
        
        $imageData = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);
        
        if ($httpCode >= 200 && $httpCode < 300 && !empty($imageData)) {
            header('Access-Control-Allow-Origin: *');
            header('Content-Type: ' . ($contentType ?: 'image/jpeg'));
            header('Cache-Control: public, max-age=86400');
            echo $imageData;
            exit;
        }
        
        sendError('Failed to fetch image', 502);
    }

    private static function album($id) {
        if (!$id) {
            $id = getQueryParam('id');
        }
        if (!$id) sendError('Album ID is required');

        $album = JioSaavnService::getAlbumDetails($id);
        if (!$album) sendError('Album not found', 404);
        sendJson($album);
    }
}
