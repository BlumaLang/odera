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
    
    public static function getArtistSongs($artistId, $page = 1, $limit = 20) {
        $page = max(1, (int)$page);
        $limit = max(1, min(50, (int)$limit));
        
        // Step 1: Get artist page details for top songs and artist info
        $data = self::callApi('artist.getArtistPageDetails', [
            'artistId' => $artistId,
            'p'        => $page,
            'n'        => $limit,
        ]);
        
        $artist = null;
        if (isset($data['artist'])) {
            $artist = self::normalizeArtist($data['artist']);
        }
        
        // Step 2: Get top songs from artist page
        $topSongs = [];
        foreach ($data['topSongs'] ?? [] as $song) {
            $topSongs[] = self::normalizeTrack($song);
        }
        
        $topSongsCount = (int)($data['topSongsCount'] ?? count($topSongs));
        
        // Step 3: If we have fewer top songs than requested, or need more pages,
        // use search as fallback to get additional songs
        $allTracks = $topSongs;
        $artistName = $artist['name'] ?? $artistId;
        
        // Calculate how many songs we already have from top songs
        $topSongsTotal = $topSongsCount > 0 ? $topSongsCount : count($topSongs);
        
        // If the API returned all top songs in one go (common case), 
        // use search to get more songs for pagination
        if ($topSongsTotal > 0 && count($topSongs) >= $topSongsTotal && $page > 1) {
            // For pages beyond the first, use search to find more songs
            $searchOffset = ($page - 1) * $limit;
            $searchData = self::callApi('search.getResults', [
                'q' => $artistName . ' songs',
                'p' => 1,
                'n' => $searchOffset + $limit,
            ]);
            
            if (!empty($searchData['results'])) {
                $searchTracks = [];
                foreach ($searchData['results'] as $song) {
                    if (($song['type'] ?? '') === 'song') {
                        $normalized = self::normalizeTrack($song);
                        // Only include songs that match this artist
                        $songArtist = strtolower($normalized['artist'] ?? '');
                        $targetArtist = strtolower($artistName);
                        if (strpos($songArtist, $targetArtist) !== false || 
                            strpos($targetArtist, $songArtist) !== false) {
                            $searchTracks[] = $normalized;
                        }
                    }
                }
                
                // Deduplicate against top songs
                $topIds = array_column($topSongs, 'videoId');
                $newTracks = array_filter($searchTracks, function($t) use ($topIds) {
                    return !in_array($t['videoId'], $topIds);
                });
                
                // Slice for the requested page
                $pageTracks = array_slice($newTracks, $searchOffset, $limit);
                $allTracks = $pageTracks;
            }
        } elseif ($page === 1 && count($topSongs) < $limit) {
            // First page has fewer songs than limit, try search for more
            $searchData = self::callApi('search.getResults', [
                'q' => $artistName . ' songs',
                'p' => 1,
                'n' => $limit * 2,
            ]);
            
            if (!empty($searchData['results'])) {
                $searchTracks = [];
                foreach ($searchData['results'] as $song) {
                    if (($song['type'] ?? '') === 'song') {
                        $normalized = self::normalizeTrack($song);
                        $songArtist = strtolower($normalized['artist'] ?? '');
                        $targetArtist = strtolower($artistName);
                        if (strpos($songArtist, $targetArtist) !== false || 
                            strpos($targetArtist, $songArtist) !== false) {
                            $searchTracks[] = $normalized;
                        }
                    }
                }
                
                // Deduplicate and merge
                $topIds = array_column($topSongs, 'videoId');
                $newTracks = array_filter($searchTracks, function($t) use ($topIds) {
                    return !in_array($t['videoId'], $topIds);
                });
                
                // Combine top songs + additional search results
                $allTracks = array_merge($topSongs, array_slice($newTracks, 0, $limit - count($topSongs)));
            }
        }
        
        // Ensure we don't exceed limit
        if (count($allTracks) > $limit) {
            $allTracks = array_slice($allTracks, 0, $limit);
        }
        
        // Determine has_more: if we got a full page, there might be more
        // If we got fewer than limit, we've reached the end
        $hasMore = count($allTracks) >= $limit;
        
        // Additional check: if topSongsCount is available and we haven't fetched all
        if ($topSongsTotal > 0 && $page * $limit < $topSongsTotal) {
            $hasMore = true;
        }
        
        return [
            'tracks'   => $allTracks,
            'results'  => $allTracks,
            'has_more' => $hasMore,
            'artist'   => $artist,
            'total'    => max($topSongsTotal, count($allTracks)),
        ];
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
        if (isset($data['artist'])) {
            $artist = self::normalizeArtist($data['artist']);
            // Add extra fields
            $artist['follower_count'] = $data['artist']['followerCount'] ?? 0;
            $artist['monthly_listeners'] = $data['artist']['monthlyListeners'] ?? 0;
            $artist['bio'] = $data['artist']['bio'] ?? '';
            $artist['fan_count'] = $data['artist']['fanCount'] ?? 0;
        }
        
        $topSongs = [];
        foreach ($data['topSongs'] ?? [] as $song) {
            $topSongs[] = self::normalizeTrack($song);
        }
        
        $similarArtists = [];
        foreach ($data['similarArtists'] ?? [] as $similar) {
            $similarArtists[] = self::normalizeArtist($similar);
        }
        
        return [
            'artist' => $artist,
            'top_songs' => $topSongs,
            'similar_artists' => $similarArtists,
            'top_songs_count' => (int)($data['topSongsCount'] ?? count($topSongs)),
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
        $image = $artist['image'] ?? '';
        
        // Get best quality image
        $image = self::getBestImage($image);
        
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
