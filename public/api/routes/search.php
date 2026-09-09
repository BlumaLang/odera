<?php
/**
 * Search Routes
 */

require_once __DIR__ . '/../services/jiosaavn.php';

class SearchRoutes {
    
    public static function handle($action, $method) {
        switch ($action) {
            case 'search':
                return self::search();
            case 'suggestions':
                return self::suggestions();
            default:
                sendError('Unknown search action', 404);
        }
    }
    
    private static function search() {
        $query = getQueryParam('q', '');
        $offset = (int)(getQueryParam('offset', 0));
        $limit = (int)(getQueryParam('limit', DEFAULT_SEARCH_LIMIT));
        $page = max(1, floor($offset / $limit) + 1);
        
        if (empty($query)) {
            sendError('Search query is required');
        }
        
        $results = JioSaavnService::searchSongs($query, $page, $limit);
        sendJson($results);
    }
    
    private static function suggestions() {
        $query = getQueryParam('q', '');
        
        if (empty($query)) {
            sendError('Search query is required');
        }
        
        $results = JioSaavnService::getSuggestions($query);
        sendJson($results);
    }
}
