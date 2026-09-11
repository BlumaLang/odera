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
            case 'trending':
                return self::trending();
            default:
                sendError('Unknown search action', 404);
        }
    }
    
    private static function search() {
        $query = getQueryParam('q', '');
        $type = strtolower(getQueryParam('type', 'songs'));
        $offset = (int)(getQueryParam('offset', 0));
        $limit = (int)(getQueryParam('limit', DEFAULT_SEARCH_LIMIT));
        $page = max(1, floor($offset / $limit) + 1);
        
        if (empty($query)) {
            sendError('Search query is required');
        }

        // Parse search operators (artist:, genre:, mood:, year:, lyrics:, lang:)
        $parsed = JioSaavnService::parseSearchOperators($query);
        $resolvedQuery = $parsed['resolved'];

        switch ($type) {
            case 'artists':
                $results = JioSaavnService::searchArtists($resolvedQuery, $limit);
                break;
            case 'albums':
                $results = JioSaavnService::searchAlbums($resolvedQuery, $page, $limit);
                break;
            case 'playlists':
                $results = JioSaavnService::searchPlaylists($resolvedQuery, $page, $limit);
                break;
            case 'all':
                $results = JioSaavnService::searchAll($query, $limit);
                break;
            case 'songs':
            default:
                $results = JioSaavnService::searchSongs($resolvedQuery, $page, $limit);
                break;
        }

        $results['operators'] = $parsed['operators'];
        $results['parsed_query'] = $resolvedQuery;
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

    private static function trending() {
        sendJson([
            'trending' => [
                ['label' => 'Romantic Melodies', 'type' => 'genre', 'query' => 'genre:romantic'],
                ['label' => 'Arijit Singh', 'type' => 'artist', 'query' => 'artist:"Arijit Singh"'],
                ['label' => 'Punjabi Bangers', 'type' => 'genre', 'query' => 'genre:punjabi'],
                ['label' => 'Diljit Dosanjh', 'type' => 'artist', 'query' => 'artist:"Diljit Dosanjh"'],
                ['label' => 'Chill Lo-Fi', 'type' => 'mood', 'query' => 'mood:chill lofi'],
                ['label' => 'Party Hits 2024', 'type' => 'mood', 'query' => 'mood:party 2024'],
                ['label' => 'Karan Aujla', 'type' => 'artist', 'query' => 'artist:"Karan Aujla"'],
                ['label' => 'Shreya Ghoshal', 'type' => 'artist', 'query' => 'artist:"Shreya Ghoshal"'],
                ['label' => 'Global Pop Hits', 'type' => 'genre', 'query' => 'genre:pop'],
                ['label' => 'Bollywood Hits', 'type' => 'genre', 'query' => 'bollywood hits'],
            ]
        ]);
    }
}
