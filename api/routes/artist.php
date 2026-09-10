<?php
/**
 * Artist Routes
 */

require_once __DIR__ . '/../services/jiosaavn.php';

class ArtistRoutes {
    
    public static function handle($action, $method, $params = []) {
        switch ($action) {
            case 'search':
                return self::search();
            case 'popular':
                return self::popular();
            case 'batch_images':
                return self::batchImages($method);
            case 'songs':
                return self::songs($params['id'] ?? null);
            case 'image':
                return self::image($params['id'] ?? null);
            case 'related':
                return self::related($params['id'] ?? null);
            case 'info':
                return self::info($params['id'] ?? null);
            default:
                sendError('Unknown artist action', 404);
        }
    }
    
    private static function search() {
        $query = getQueryParam('q', '');
        $limit = (int)(getQueryParam('limit', DEFAULT_ARTIST_LIMIT));
        
        if (empty($query)) {
            sendError('Search query is required');
        }
        
        $results = JioSaavnService::searchArtists($query, $limit);
        sendJson($results);
    }
    
    private static function popular() {
        $language = getQueryParam('lang', 'hindi');
        $limit = (int)(getQueryParam('limit', 20));
        
        $results = JioSaavnService::getPopularArtists($language, $limit);
        sendJson($results);
    }
    
    private static function batchImages($method) {
        if ($method !== 'POST') {
            sendError('Method not allowed', 405);
        }
        
        $body = getRequestBody();
        $artists = $body['artists'] ?? [];
        
        if (empty($artists)) {
            sendError('Artists array is required');
        }
        
        $results = JioSaavnService::batchGetArtistImages($artists);
        sendJson($results);
    }
    
    private static function songs($artistId) {
        if (empty($artistId)) {
            sendError('Artist ID is required');
        }
        
        $page = (int)(getQueryParam('page', 1));
        $limit = (int)(getQueryParam('limit', 20));
        
        // If not a numeric ID, search for the artist first to get the ID
        if (!ctype_digit($artistId)) {
            $searchResult = JioSaavnService::searchArtists($artistId, 1);
            if (!empty($searchResult['artists'][0])) {
                $artistId = $searchResult['artists'][0]['id'];
            }
        }
        
        $results = JioSaavnService::getArtistSongs($artistId, $page, $limit);
        sendJson($results);
    }
    
    private static function image($artistId) {
        if (empty($artistId)) {
            sendError('Artist ID is required');
        }
        
        // If not a numeric ID, search for the artist first
        if (!ctype_digit($artistId)) {
            $searchResult = JioSaavnService::searchArtists($artistId, 1);
            if (!empty($searchResult['artists'][0])) {
                $artistId = $searchResult['artists'][0]['id'];
            }
        }
        
        $image = JioSaavnService::getArtistImage($artistId);
        if (!$image) {
            sendError('Artist image not found', 404);
        }
        
        sendJson($image);
    }
    
    private static function related($artistId) {
        if (empty($artistId)) {
            sendError('Artist ID is required');
        }
        
        $limit = (int)(getQueryParam('limit', 10));
        
        // If not a numeric ID, search for the artist first
        if (!ctype_digit($artistId)) {
            $searchResult = JioSaavnService::searchArtists($artistId, 1);
            if (!empty($searchResult['artists'][0])) {
                $artistId = $searchResult['artists'][0]['id'];
            }
        }
        
        $results = JioSaavnService::getRelatedArtists($artistId, $limit);
        sendJson($results);
    }
    
    private static function info($artistId) {
        if (empty($artistId)) {
            sendError('Artist ID is required');
        }
        
        // If not a numeric ID, search for the artist first
        if (!ctype_digit($artistId)) {
            $searchResult = JioSaavnService::searchArtists($artistId, 1);
            if (!empty($searchResult['artists'][0])) {
                $artistId = $searchResult['artists'][0]['id'];
            }
        }
        
        $results = JioSaavnService::getArtistInfo($artistId);
        sendJson($results);
    }
}
