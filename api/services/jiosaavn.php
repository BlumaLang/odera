<?php
/**
 * JioSaavn API Service
 * Proxies all JioSaavn API calls server-side
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../utils/http.php';

class JioSaavnService {
    
    private static function callApi($endpoint, $params = []) {
        $defaultParams = [
            '_format'     => 'json',
            '_marker'     => 0,
            'api_version' => JIOSAAVN_API_VERSION,
            'ctx'         => JIOSAAVN_CTX,
        ];
        $params = array_merge($defaultParams, $params);
        $params['__call'] = $endpoint;
        
        $url = JIOSAAVN_API . '?' . http_build_query($params);
        $result = httpGet($url);
        
        if ($result['code'] !== 200) {
            return null;
        }
        return json_decode($result['data'], true);
    }
    
    // ==================== SEARCH ====================
    
    public static function searchSongs($query, $page = 1, $limit = 40) {
        $data = self::callApi('search.getResults', [
            'q' => $query,
            'p' => $page,
            'n' => $limit,
        ]);
        
        if (!$data) return ['query' => $query, 'count' => 0, 'results' => [], 'tracks' => [], 'has_more' => false];
        
        $results = [];
        foreach ($data['results'] ?? [] as $song) {
            if (($song['type'] ?? '') === 'song') {
                $results[] = self::normalizeTrack($song);
            }
        }
        
        $total = $data['total'] ?? 0;
        $hasMore = ($page * $limit) < $total;
        
        return [
            'query'    => $query,
            'count'    => $total,
            'results'  => $results,
            'tracks'   => $results,
            'has_more' => $hasMore,
        ];
    }
    
    public static function getSuggestions($query) {
        $data = self::callApi('search.getSuggestions', [
            'q' => $query,
            'n' => 10,
        ]);
        
        return ['suggestions' => $data['results'] ?? []];
    }
    
    public static function searchArtists($query, $limit = 10) {
        $data = self::callApi('search.getArtistResults', [
            'q' => $query,
            'p' => 1,
            'n' => $limit,
        ]);
        
        $artists = [];
        foreach ($data['results'] ?? [] as $artist) {
            $artists[] = self::normalizeArtist($artist);
        }
        
        return ['artists' => $artists, 'results' => $artists];
    }
    
    // ==================== HOME FEED ====================
    
    public static function getHomeFeed($userId = null, $forceRefresh = false) {
        $data = self::callApi('content.getHomepageData', [
            'includeMetaTags' => 1,
        ]);
        
        if (!$data) return ['sections' => []];
        
        $sections = [];
        
        // New albums / songs
        if (!empty($data['new_albums'])) {
            $items = [];
            foreach ($data['new_albums'] as $item) {
                $items[] = self::normalizeTrack($item);
            }
            if (!empty($items)) {
                $sections[] = [
                    'title' => 'New Releases',
                    'type'  => 'songs',
                    'items' => $items,
                ];
            }
        }
        
        // Charts
        if (!empty($data['charts'])) {
            $items = [];
            foreach ($data['charts'] as $item) {
                $items[] = self::normalizeTrack($item);
            }
            if (!empty($items)) {
                $sections[] = [
                    'title' => 'Charts',
                    'type'  => 'songs',
                    'items' => $items,
                ];
            }
        }
        
        // Top playlists
        if (!empty($data['top_playlists'])) {
            $items = [];
            foreach ($data['top_playlists'] as $item) {
                $img = $item['image'] ?? '';
                if (is_array($img) && !empty($img)) {
                    $img = end($img)['link'] ?? $img[0]['link'] ?? '';
                }
                $items[] = [
                    'id'        => $item['id'] ?? '',
                    'title'     => $item['title'] ?? $item['name'] ?? '',
                    'image'     => $img,
                    'type'      => 'playlist',
                    'songCount' => $item['song_count'] ?? $item['count'] ?? 0,
                ];
            }
            if (!empty($items)) {
                $sections[] = [
                    'title' => 'Top Playlists',
                    'type'  => 'playlists',
                    'items' => $items,
                ];
            }
        }
        
        // Trending artists
        if (!empty($data['trending'])) {
            $items = [];
            foreach ($data['trending'] as $item) {
                if (($item['type'] ?? '') === 'artist') {
                    $items[] = self::normalizeArtist($item);
                }
            }
            if (!empty($items)) {
                $sections[] = [
                    'title' => 'Trending Artists',
                    'type'  => 'artists',
                    'items' => $items,
                ];
            }
        }
        
        return ['sections' => $sections];
    }
    
    // ==================== TRACK DETAILS ====================
    
    public static function getTrackDetails($videoId) {
        $data = self::callApi('song.getDetails', [
            'pids' => $videoId,
        ]);
        
        if (!$data || empty($data['songs'])) return null;
        
        return self::normalizeTrack($data['songs'][0]);
    }
    
    public static function getTrackImage($videoId) {
        $track = self::getTrackDetails($videoId);
        if (!$track) return null;
        return ['image' => $track['image'] ?? $track['thumbnail'] ?? null, 'id' => $videoId];
    }
    
    // ==================== STREAM URL ====================
    
    public static function getStreamUrl($videoId) {
        $data = self::callApi('song.getDetails', [
            'pids' => $videoId,
        ]);
        
        if (!$data || empty($data['songs'])) return null;
        
        $song = $data['songs'][0];
        $encryptedUrl = $song['more_info']['encrypted_media_url'] ?? '';
        
        if (empty($encryptedUrl)) return null;
        
        $decryptedUrl = self::decryptUrl($encryptedUrl);
        
        return [
            'stream_url' => $decryptedUrl,
            'videoId'    => $videoId,
            'id'         => $videoId,
            'duration'   => (int)($song['more_info']['duration'] ?? 0),
        ];
    }
    
    private static function decryptUrl($encrypted) {
        $key = STREAM_DECRYPT_KEY;
        $iv = '';
        
        $ciphertext = base64_decode($encrypted);
        if ($ciphertext === false) return null;
        
        $decrypted = openssl_decrypt($ciphertext, 'DES-ECB', $key, OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING);
        if ($decrypted === false) return null;
        
        // Remove PKCS7 padding
        $pad = ord($decrypted[strlen($decrypted) - 1]);
        if ($pad >= 1 && $pad <= 8) {
            $decrypted = substr($decrypted, 0, -$pad);
        }
        
        $url = $decrypted;
        // Prefer highest quality
        $url = str_replace(['_96.mp4', '_160.mp4'], '_320.mp4', $url);
        $url = str_replace('http://', 'https://', $url);
        
        return $url;
    }
    
    // ==================== ARTISTS ====================
    
    public static function getArtistSongs($artistId, $page = 1, $limit = 20, $artistName = null) {
        $page = max(1, (int)$page);
        $limit = max(1, min(50, (int)$limit));
        
        // First, try to get artist info to get the actual artist name
        $data = self::callApi('artist.getArtistPageDetails', [
            'artistId' => $artistId,
            'p'        => 1,
            'n'        => 1,
        ]);
        
        $artist = null;
        if (isset($data['artist'])) {
            $artist = self::normalizeArtist($data['artist']);
        }
        
        $artistName = $artistName ?? $artist['name'] ?? $artistId;
        
        // Try to get artist songs directly from JioSaavn API if available
        $artistSongsData = self::callApi('artist.getArtistSongs', [
            'artistId' => $artistId,
            'p'        => $page,
            'n'        => $limit,
        ]);
        
        $tracks = [];
        if (!empty($artistSongsData['songs'])) {
            // We have direct artist songs from API
            foreach ($artistSongsData['songs'] as $song) {
                $tracks[] = self::normalizeTrack($song);
            }
            
            $total = $artistSongsData['total'] ?? count($tracks);
            $hasMore = ($page * $limit) < $total;
            
            return [
                'tracks'   => $tracks,
                'results'  => $tracks,
                'has_more' => $hasMore,
                'artist'   => $artist,
                'total'    => $total,
            ];
        }
        
        // Fallback: Search for songs by this artist
        // Use "artistName songs" query for better results
        $searchQuery = "{$artistName} songs";
        $searchData = self::searchSongs($searchQuery, $page, $limit);
        $allSearchResults = $searchData['results'] ?? [];
        
        // Filter to only this artist's songs with more flexible matching
        $filtered = self::filterSearchByArtist($allSearchResults, $artistName);
        
        // If we didn't get enough filtered results, try a broader search
        if (count($filtered) < $limit && $page === 1) {
            $broaderSearch = self::searchSongs($artistName, $page, $limit * 2);
            $broaderResults = $broaderSearch['results'] ?? [];
            $additionalFiltered = self::filterSearchByArtist($broaderResults, $artistName, $filtered);
            $filtered = array_merge($filtered, $additionalFiltered);
        }
        
        // Paginate through filtered results
        $offset = ($page - 1) * $limit;
        $pageTracks = array_slice($filtered, $offset, $limit);
        
        $hasMore = ($offset + $limit) < count($filtered);
        
        return [
            'tracks'   => $pageTracks,
            'results'  => $pageTracks,
            'has_more' => $hasMore,
            'artist'   => $artist,
            'total'    => count($filtered),
        ];
    }
    
    /**
     * Filter search results to only include songs by the target artist
     */
    private static function filterSearchByArtist($results, $artistName, $excludeTracks = []) {
        $filtered = [];
        $excludeIds = array_column($excludeTracks, 'videoId');
        $targetArtist = strtolower(trim($artistName));
        
        // Split artist name into words for better matching
        $targetWords = array_filter(preg_split('/\s+/', $targetArtist));
        
        foreach ($results as $song) {
            // Handle both raw and already-normalized results
            $tid = $song['videoId'] ?? $song['video_id'] ?? $song['id'] ?? '';
            if (!$tid) continue;
            
            // Skip if already in exclude list
            if (in_array($tid, $excludeIds)) continue;
            
            // Use already-normalized artist field if available
            $songArtist = strtolower($song['artist'] ?? '');
            $songTitle = strtolower($song['title'] ?? '');
            
            // Skip if no artist or title
            if (empty($songArtist) && empty($songTitle)) continue;
            
            // Check if artist name matches (more flexible matching)
            $matchFound = false;
            
            // 1. Direct match
            if (strpos($songArtist, $targetArtist) !== false || 
                strpos($targetArtist, $songArtist) !== false) {
                $matchFound = true;
            }
            
            // 2. Word-based matching: check if key words from artist name appear in song artist
            if (!$matchFound && !empty($targetWords)) {
                $wordMatchCount = 0;
                foreach ($targetWords as $word) {
                    if (strlen($word) > 2 && strpos($songArtist, $word) !== false) {
                        $wordMatchCount++;
                    }
                }
                // If at least half the words match, consider it a match
                if ($wordMatchCount >= ceil(count($targetWords) / 2)) {
                    $matchFound = true;
                }
            }
            
            // 3. Check if artist name appears in title (for featured artists)
            if (!$matchFound && strpos($songTitle, $targetArtist) !== false) {
                $matchFound = true;
            }
            
            if ($matchFound) {
                $filtered[] = $song;
            }
        }
        
        return $filtered;
    }
    
    public static function getArtistImage($artistId) {
        $data = self::callApi('artist.getArtistPageDetails', [
            'artistId' => $artistId,
            'n'        => 1,
        ]);
        
        if (!$data) return null;
        
        // Image is at top level in the response
        $image = $data['image'] ?? null;
        if (!$image) return null;
        
        // Get best quality image
        $bestImage = self::getBestImage($image);
        
        return [
            'image' => $bestImage,
            'id'    => $artistId,
        ];
    }
    
    public static function getRelatedArtists($artistId, $limit = 10) {
        $data = self::callApi('artist.getArtistPageDetails', [
            'artistId' => $artistId,
            'n'        => 1,
        ]);
        
        $artists = [];
        if (!empty($data['similarArtists'])) {
            foreach ($data['similarArtists'] as $artist) {
                $artists[] = self::normalizeArtist($artist);
                if (count($artists) >= $limit) break;
            }
        }
        
        return ['artists' => $artists, 'related' => $artists];
    }
    
    public static function getArtistInfo($artistId) {
        $data = self::callApi('artist.getArtistPageDetails', [
            'artistId' => $artistId,
            'n'        => 1,
        ]);
        
        if (!$data) return ['artist' => null, 'top_songs' => [], 'similar_artists' => []];
        
        $artist = null;
        // Try different possible response structures
        if (isset($data['artist'])) {
            $artist = self::normalizeArtist($data['artist']);
        } elseif (isset($data['name'])) {
            // If the data itself is the artist object
            $artist = self::normalizeArtist($data);
        }
        
        // Add extra fields if we have artist data
        if ($artist) {
            $artist['follower_count'] = $data['followerCount'] ?? $data['artist']['followerCount'] ?? 0;
            $artist['monthly_listeners'] = $data['monthlyListeners'] ?? $data['artist']['monthlyListeners'] ?? 0;
            $artist['bio'] = $data['bio'] ?? $data['artist']['bio'] ?? '';
            $artist['fan_count'] = $data['fanCount'] ?? $data['artist']['fanCount'] ?? 0;
            
            // Ensure image is properly set
            if (empty($artist['image']) && isset($data['image'])) {
                $artist['image'] = self::getBestImage($data['image']);
                $artist['thumbnail'] = $artist['image'];
            }
        }
        
        $topSongs = [];
        // Try different possible locations for top songs
        $songsData = $data['topSongs'] ?? $data['top_songs'] ?? $data['topSongsData'] ?? [];
        foreach ($songsData as $song) {
            $topSongs[] = self::normalizeTrack($song);
        }
        
        $similarArtists = [];
        // Try different possible locations for similar artists
        $similarData = $data['similarArtists'] ?? $data['similar_artists'] ?? $data['relatedArtists'] ?? [];
        foreach ($similarData as $similar) {
            $normalizedSimilar = self::normalizeArtist($similar);
            // Ensure similar artists have images
            if (empty($normalizedSimilar['image']) && isset($similar['image'])) {
                $normalizedSimilar['image'] = self::getBestImage($similar['image']);
                $normalizedSimilar['thumbnail'] = $normalizedSimilar['image'];
            }
            $similarArtists[] = $normalizedSimilar;
        }
        
        // If we still don't have an artist but have a name from artistId, create basic artist info
        if (!$artist && !empty($artistId) && !is_numeric($artistId)) {
            $artist = [
                'id' => $artistId,
                'name' => $artistId,
                'image' => '',
                'thumbnail' => '',
                'type' => 'artist'
            ];
        }
        
        return [
            'artist' => $artist,
            'top_songs' => $topSongs,
            'similar_artists' => $similarArtists,
            'top_songs_count' => (int)($data['topSongsCount'] ?? $data['top_songs_count'] ?? count($topSongs)),
        ];
    }
    
    public static function getPopularArtists($language = 'hindi', $limit = 20) {
        $data = self::callApi('search.getArtistResults', [
            'q'   => '',
            'p'   => 1,
            'n'   => $limit,
            'lang' => $language,
        ]);
        
        $artists = [];
        foreach ($data['results'] ?? [] as $artist) {
            $artists[] = self::normalizeArtist($artist);
        }
        
        return ['artists' => $artists, 'results' => $artists];
    }
    
    public static function batchGetArtistImages($artists) {
        $images = [];
        foreach ($artists as $artist) {
            $name = $artist['name'] ?? $artist['id'] ?? '';
            $id = $artist['id'] ?? $name;
            
            $result = self::getArtistImage($id);
            if ($result && !empty($result['image'])) {
                $images[$name] = $result['image'];
            }
        }
        return ['images' => $images];
    }
    
    // ==================== NORMALIZATION ====================
    
    /**
     * Get the highest quality image from JioSaavn image array
     * JioSaavn returns images as array of {link, size} objects
     * We want the largest size (typically 500x500)
     */
    private static function getBestImage($image) {
        if (!is_array($image) || empty($image)) {
            return (string)$image;
        }
        
        // If it's an associative array with 'link' key, return it directly
        if (isset($image['link'])) {
            return $image['link'];
        }
        
        // If it's a numeric array of {link, size} objects
        $bestLink = '';
        $bestSize = 0;
        
        foreach ($image as $img) {
            if (!is_array($img)) continue;
            
            $link = $img['link'] ?? $img['url'] ?? '';
            $size = $img['size'] ?? $img['quality'] ?? 0;
            
            // Parse size from string like "500x500" or use numeric value
            if (is_string($size)) {
                preg_match('/(\d+)/', $size, $matches);
                $size = (int)($matches[1] ?? 0);
            }
            
            // If no size info, prefer later items (usually higher quality)
            if ($size === 0 && !empty($link)) {
                $size = $bestSize + 1;
            }
            
            if ($size >= $bestSize && !empty($link)) {
                $bestSize = $size;
                $bestLink = $link;
            }
        }
        
        return $bestLink ?: '';
    }
    
    private static function normalizeTrack($song) {
        $videoId = $song['id'] ?? $song['videoId'] ?? '';
        $title = $song['title'] ?? 'Unknown';
        $subtitle = $song['subtitle'] ?? '';
        $image = $song['image'] ?? '';
        
        // Get best quality image
        $image = self::getBestImage($image);
        
        // Get artists
        $artists = [];
        if (!empty($song['more_info']['artistMap']['primary_artists'])) {
            foreach ($song['more_info']['artistMap']['primary_artists'] as $pa) {
                $artists[] = $pa['name'] ?? '';
            }
        }
        $artistStr = $artists ? implode(', ', $artists) : $subtitle;
        
        return [
            'id'                   => "saavn_{$videoId}",
            'videoId'              => $videoId,
            'video_id'             => $videoId,
            'title'                => $title,
            'artist'               => $artistStr,
            'image'                => $image,
            'thumbnail'            => $image,
            'artwork_url'          => $image,
            'duration'             => (int)($song['more_info']['duration'] ?? 0),
            'duration_seconds'     => (int)($song['more_info']['duration'] ?? 0),
            'album'                => $song['more_info']['album'] ?? '',
            'encrypted_media_url'  => $song['more_info']['encrypted_media_url'] ?? '',
            'perma_url'            => $song['perma_url'] ?? '',
            'source'               => 'saavn',
            'type'                 => 'song',
        ];
    }
    
    private static function normalizeArtist($artist) {
        $id = $artist['artistId'] ?? $artist['id'] ?? '';
        $name = $artist['name'] ?? 'Unknown';
        $image = $artist['image'] ?? $artist['thumbnail'] ?? $artist['image_url'] ?? '';
        
        // Get best quality image
        $image = self::getBestImage($image);
        
        // If we have an ID but no image, try to construct a default Saavn image URL
        if (empty($image) && !empty($id) && !empty($name)) {
            // Try to construct a default Saavn artist image URL
            $cleanName = preg_replace('/[^a-zA-Z0-9]/', '_', $name);
            $image = "https://c.saavncdn.com/artists/{$cleanName}_50x50.jpg";
        }
        
        return [
            'id'        => $id,
            'name'      => $name,
            'image'     => $image,
            'thumbnail' => $image,
            'type'      => 'artist',
        ];
    }
    
    private static function detectSectionType($section) {
        if (isset($section['songs'])) return 'songs';
        if (isset($section['albums'])) return 'albums';
        if (isset($section['playlists'])) return 'playlists';
        if (isset($section['artists'])) return 'artists';
        return 'songs';
    }
    
    private static function normalizeSectionItems($section) {
        $items = [];
        $type = self::detectSectionType($section);
        
        $rawItems = $section[$type] ?? $section['songs'] ?? $section['albums'] ?? $section['playlists'] ?? $section['artists'] ?? [];
        
        foreach ($rawItems as $item) {
            if ($type === 'artists') {
                $items[] = self::normalizeArtist($item);
            } else {
                $items[] = self::normalizeTrack($item);
            }
        }
        
        return $items;
    }
}
