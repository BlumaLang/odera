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

    public static function searchAlbums($query, $page = 1, $limit = 20) {
        $data = self::callApi('search.getAlbumResults', [
            'q' => $query,
            'p' => $page,
            'n' => $limit,
        ]);
        
        $albums = [];
        foreach ($data['results'] ?? [] as $album) {
            $albums[] = self::normalizeAlbum($album);
        }
        $total = $data['total'] ?? count($albums);
        
        return [
            'query'    => $query,
            'count'    => $total,
            'albums'   => $albums,
            'results'  => $albums,
            'has_more' => ($page * $limit) < $total,
        ];
    }

    public static function getAlbumDetails($albumId) {
        $data = self::callApi('content.getAlbumDetails', [
            'albumid' => $albumId,
        ]);
        if (empty($data) || empty($data['id'])) {
            return null;
        }
        $album = self::normalizeAlbum($data);
        $songs = [];
        $rawSongs = $data['list'] ?? $data['songs'] ?? [];
        foreach ($rawSongs as $song) {
            $songs[] = self::normalizeTrack($song);
        }
        $album['tracks'] = $songs;
        $album['track_count'] = count($songs);
        return $album;
    }

    public static function getPlaylistDetails($playlistId) {
        $data = self::callApi('playlist.getDetails', [
            'listid' => $playlistId,
        ]);
        if (empty($data) || (empty($data['id']) && empty($data['listid']))) {
            return null;
        }
        $playlist = self::normalizePlaylist($data);
        $songs = [];
        $rawSongs = $data['list'] ?? $data['songs'] ?? [];
        foreach ($rawSongs as $song) {
            $songs[] = self::normalizeTrack($song);
        }
        $playlist['tracks'] = $songs;
        $playlist['track_count'] = count($songs);
        return $playlist;
    }

    public static function searchPlaylists($query, $page = 1, $limit = 20) {
        $data = self::callApi('search.getPlaylistResults', [
            'q' => $query,
            'p' => $page,
            'n' => $limit,
        ]);
        
        $playlists = [];
        foreach ($data['results'] ?? [] as $playlist) {
            $playlists[] = self::normalizePlaylist($playlist);
        }
        $total = $data['total'] ?? count($playlists);
        
        return [
            'query'     => $query,
            'count'     => $total,
            'playlists' => $playlists,
            'results'   => $playlists,
            'has_more'  => ($page * $limit) < $total,
        ];
    }

    public static function parseSearchOperators($rawQuery) {
        $operators = [];
        $cleanQuery = $rawQuery;
        
        // Match patterns like artist:foo, genre:bar, year:2024, mood:sad, lyrics:text, lang:hindi
        if (preg_match_all('/(artist|singer|genre|mood|year|lyrics|lang|language):(?:"([^"]+)"|([^\s]+))/i', $rawQuery, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $key = strtolower($m[1]);
                $val = !empty($m[2]) ? $m[2] : $m[3];
                $operators[$key] = trim($val);
                $cleanQuery = str_replace($m[0], '', $cleanQuery);
            }
        }
        
        $cleanQuery = trim(preg_replace('/\s+/', ' ', $cleanQuery));
        
        $parts = [];
        if (!empty($cleanQuery)) $parts[] = $cleanQuery;
        if (!empty($operators['artist'])) $parts[] = $operators['artist'];
        if (!empty($operators['singer'])) $parts[] = $operators['singer'];
        if (!empty($operators['genre'])) $parts[] = $operators['genre'];
        if (!empty($operators['mood'])) $parts[] = $operators['mood'];
        if (!empty($operators['lyrics'])) $parts[] = $operators['lyrics'];
        if (!empty($operators['year'])) $parts[] = $operators['year'];
        if (!empty($operators['lang'])) $parts[] = $operators['lang'];
        if (!empty($operators['language'])) $parts[] = $operators['language'];
        
        $resolvedQuery = !empty($parts) ? implode(' ', $parts) : $rawQuery;
        
        return [
            'raw'       => $rawQuery,
            'resolved'  => $resolvedQuery,
            'clean'     => $cleanQuery,
            'operators' => $operators,
        ];
    }

    public static function searchAll($query, $limit = 20) {
        $parsed = self::parseSearchOperators($query);
        $resolved = $parsed['resolved'];

        $songs = self::searchSongs($resolved, 1, min($limit, 25));
        $artists = self::searchArtists($resolved, 6);
        $albums = self::searchAlbums($resolved, 1, 8);
        $playlists = self::searchPlaylists($resolved, 1, 8);

        return [
            'query'     => $query,
            'resolved'  => $resolved,
            'operators' => $parsed['operators'],
            'tracks'    => $songs['tracks'] ?? [],
            'artists'   => $artists['artists'] ?? [],
            'albums'    => $albums['albums'] ?? [],
            'playlists' => $playlists['playlists'] ?? [],
        ];
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
                    'id'    => 'new_releases',
                    'title' => 'New Releases',
                    'type'  => 'songs',
                    'items' => $items,
                ];
            }
        }

        // Trending Now (Real playable trending hits cached for high performance)
        $cacheFile = sys_get_temp_dir() . '/staytup_trending_hits.json';
        $trendingItems = null;
        if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 1800)) {
            $cached = @json_decode(file_get_contents($cacheFile), true);
            if (!empty($cached) && is_array($cached)) {
                $trendingItems = $cached;
            }
        }
        if (!$trendingItems) {
            $trendData = self::searchSongs('Hindi Hits', 1, 30);
            if (!empty($trendData['results'])) {
                $trendingItems = $trendData['results'];
                @file_put_contents($cacheFile, json_encode($trendingItems));
            }
        }
        if (!empty($trendingItems)) {
            $sections[] = [
                'id'    => 'trending_now',
                'title' => 'Trending Now',
                'type'  => 'songs',
                'items' => $trendingItems,
            ];
        }

        // Note: Top Charts and Top Playlists from JioSaavn are removed per user request.
        // App now uses user-uploaded playlists & software auto-curated mixes directly.

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
                    'id'    => 'trending_artists',
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
        
        $ciphertext = base64_decode($encrypted);
        if ($ciphertext === false) return null;
        
        // In OpenSSL 3.0+ (PHP 8.1+), legacy single DES-ECB is disabled by default.
        // des-ede3 (Triple DES ECB) works out of the box with the 8-byte key and automatic PKCS7 padding.
        $decrypted = openssl_decrypt($ciphertext, 'des-ede3', $key, OPENSSL_RAW_DATA);
        if ($decrypted === false) {
            $decrypted = openssl_decrypt($ciphertext, 'DES-ECB', $key, OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING);
            if ($decrypted !== false && strlen($decrypted) > 0) {
                // Remove PKCS7 padding manually if zero-padded
                $pad = ord($decrypted[strlen($decrypted) - 1]);
                if ($pad >= 1 && $pad <= 8) {
                    $decrypted = substr($decrypted, 0, -$pad);
                }
            }
        }
        if ($decrypted === false || empty($decrypted)) return null;
        
        $url = trim($decrypted);
        // Prefer highest quality
        $url = str_replace(['_96.mp4', '_160.mp4'], '_320.mp4', $url);
        $url = str_replace('http://', 'https://', $url);
        
        return $url;
    }
    
    // ==================== ARTISTS ====================
    
    public static function getArtistSongs($artistId, $page = 1, $limit = 20, $artistName = null) {
        $page = max(1, (int)$page);
        $limit = max(1, min(50, (int)$limit));
        $originalInput = $artistId;
        
        $artist = null;
        // 1. If artistId is not numeric, search first to find the real JioSaavn artist ID and metadata
        if (!ctype_digit((string)$artistId)) {
            $searchRes = self::searchArtists((string)$artistId, 1);
            if (!empty($searchRes['artists'][0])) {
                $artist = $searchRes['artists'][0];
                $artistId = $artist['id'];
                $artistName = $artistName ?? $artist['name'];
            }
        }
        
        // 2. Fetch curated top songs from JioSaavn artist page details
        $curatedTracks = [];
        if (ctype_digit((string)$artistId)) {
            $pageDetails = self::callApi('artist.getArtistPageDetails', [
                'artistId' => $artistId,
                'n_song'   => 50,
                'n_album'  => 20,
            ]);
            if (!empty($pageDetails['topSongs'])) {
                foreach ($pageDetails['topSongs'] as $s) {
                    $curatedTracks[] = self::normalizeTrack($s);
                }
            }
            if (!$artist && isset($pageDetails['name'])) {
                $artist = [
                    'id'        => $artistId,
                    'name'      => html_entity_decode($pageDetails['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                    'image'     => self::getBestImage($pageDetails['image'] ?? ''),
                    'thumbnail' => self::getBestImage($pageDetails['image'] ?? ''),
                    'type'      => 'artist',
                ];
            }
        }
        
        $artistName = $artistName ?? $artist['name'] ?? $originalInput;
        
        // Helper to normalize title for server-side deduplication
        $normTitle = function($t) {
            $c = html_entity_decode($t ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $c = strtolower(preg_replace('/\s*[\(\[].*?[\)\]]/', '', $c));
            $c = preg_replace('/[^a-z0-9]/', '', $c);
            return trim($c);
        };
        
        // Deduplicate curated tracks by clean title and ID
        $dedupedCurated = [];
        $seenCuratedIds = [];
        $seenCuratedTitles = [];
        foreach ($curatedTracks as $t) {
            $vid = $t['videoId'] ?? $t['id'] ?? '';
            $cleanT = $normTitle($t['title'] ?? '');
            if ($vid && in_array($vid, $seenCuratedIds)) continue;
            if (!empty($cleanT) && in_array($cleanT, $seenCuratedTitles)) continue;
            
            if ($vid) $seenCuratedIds[] = $vid;
            if (!empty($cleanT)) $seenCuratedTitles[] = $cleanT;
            $dedupedCurated[] = $t;
        }
        
        // 3. Partitioning: Curated tracks provide the first batch (e.g. 30-40 hit songs)
        $curatedCount = count($dedupedCurated);
        $offset = ($page - 1) * $limit;
        
        $pageTracks = [];
        $seenPageIds = [];
        $seenPageTitles = [];
        
        if ($offset < $curatedCount) {
            $fromCurated = array_slice($dedupedCurated, $offset, $limit);
            foreach ($fromCurated as $ct) {
                $vid = $ct['videoId'] ?? $ct['id'] ?? '';
                $cleanT = $normTitle($ct['title'] ?? '');
                if ($vid) $seenPageIds[] = $vid;
                if (!empty($cleanT)) $seenPageTitles[] = $cleanT;
                $pageTracks[] = $ct;
            }
        }
        
        // 4. Supplement with search results if needed or for subsequent pages
        if (count($pageTracks) < $limit || $page >= 2) {
            $searchPageStart = ($page === 1) ? 1 : max(1, $page * 2 - 2);
            $searchPagesCount = ($page === 1) ? 2 : 3;
            
            $candidateSearch = [];
            for ($sp = $searchPageStart; $sp < $searchPageStart + $searchPagesCount; $sp++) {
                $searchData = self::searchSongs("{$artistName} songs", $sp, 30);
                $filtered = self::filterSearchByArtist($searchData['results'] ?? [], $artistName);
                $candidateSearch = array_merge($candidateSearch, $filtered);
                
                if ($page <= 2 && $sp === $searchPageStart) {
                    $hitsData = self::searchSongs("{$artistName} hits", 1, 30);
                    $hitsFiltered = self::filterSearchByArtist($hitsData['results'] ?? [], $artistName);
                    $candidateSearch = array_merge($candidateSearch, $hitsFiltered);
                }
            }
            
            // Deduplicate search candidates against already-seen titles/IDs in curated & current page
            $allSeenIds = array_merge($seenCuratedIds, $seenPageIds);
            $allSeenTitles = array_merge($seenCuratedTitles, $seenPageTitles);
            
            foreach ($candidateSearch as $st) {
                if (count($pageTracks) >= $limit) break;
                
                $vid = $st['videoId'] ?? $st['id'] ?? '';
                $cleanT = $normTitle($st['title'] ?? '');
                
                // Allow search items if they aren't on this page and weren't in curated
                if ($vid && in_array($vid, $allSeenIds)) continue;
                if (!empty($cleanT) && in_array($cleanT, $allSeenTitles)) continue;
                
                if ($vid) $allSeenIds[] = $vid;
                if (!empty($cleanT)) $allSeenTitles[] = $cleanT;
                $pageTracks[] = $st;
            }
        }
        
        // Ensure all HTML entities are decoded
        foreach ($pageTracks as &$t) {
            $t['title'] = html_entity_decode($t['title'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $t['artist'] = html_entity_decode($t['artist'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $t['album'] = html_entity_decode($t['album'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $t['subtitle'] = html_entity_decode($t['subtitle'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        unset($t);
        
        $hasMore = count($pageTracks) >= $limit;
        
        return [
            'tracks'   => $pageTracks,
            'results'  => $pageTracks,
            'has_more' => $hasMore,
            'artist'   => $artist,
            'page'     => $page,
            'total'    => count($pageTracks),
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
        // If not numeric, search first to get real ID and 500x500 image
        if (!ctype_digit((string)$artistId)) {
            $search = self::searchArtists((string)$artistId, 1);
            if (!empty($search['artists'][0])) {
                $found = $search['artists'][0];
                $img = $found['image'] ?? '';
                if (!empty($img) && !str_contains($img, 'default') && !str_contains($img, 'share-image')) {
                    return [
                        'image' => self::getBestImage($img),
                        'id'    => $found['id'],
                    ];
                }
                $artistId = $found['id'];
            }
        }
        
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
        if (!ctype_digit((string)$artistId)) {
            $search = self::searchArtists((string)$artistId, 1);
            if (!empty($search['artists'][0]['id'])) {
                $artistId = $search['artists'][0]['id'];
            }
        }
        
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
        if (!ctype_digit((string)$artistId)) {
            $search = self::searchArtists((string)$artistId, 1);
            if (!empty($search['artists'][0]['id'])) {
                $artistId = $search['artists'][0]['id'];
            }
        }
        
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
            $artist['name'] = html_entity_decode($artist['name'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $artist['follower_count'] = $data['followerCount'] ?? $data['artist']['followerCount'] ?? 0;
            $artist['monthly_listeners'] = $data['monthlyListeners'] ?? $data['artist']['monthlyListeners'] ?? 0;
            $artist['bio'] = html_entity_decode($data['bio'] ?? $data['artist']['bio'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
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
                'name' => html_entity_decode($artistId, ENT_QUOTES | ENT_HTML5, 'UTF-8'),
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
            $name = is_array($artist) ? ($artist['name'] ?? $artist['id'] ?? '') : (string)$artist;
            $id = is_array($artist) ? ($artist['id'] ?? $name) : (string)$artist;
            if (empty($name)) continue;
            
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
            $url = (string)$image;
            // Upgrade low-res JioSaavn CDN URLs to 500x500
            if (!empty($url)) {
                $url = str_replace(
                    ['/50x50/', '/150x150/', '/250x250/', '_50x50.', '_150x150.', '_250x250.', '-50x50.', '-150x150.', '-250x250.'],
                    ['/500x500/', '/500x500/', '/500x500/', '_500x500.', '_500x500.', '_500x500.', '-500x500.', '-500x500.', '-500x500.'],
                    $url
                );
                $url = preg_replace('/^http:\/\//i', 'https://', $url);
            }
            return $url;
        }
        
        // If it's an associative array with 'link' key, return it directly
        if (isset($image['link'])) {
            $url = $image['link'];
            $url = str_replace(
                ['/50x50/', '/150x150/', '/250x250/', '_50x50.', '_150x150.', '_250x250.', '-50x50.', '-150x150.', '-250x250.'],
                ['/500x500/', '/500x500/', '/500x500/', '_500x500.', '_500x500.', '_500x500.', '-500x500.', '-500x500.', '-500x500.'],
                $url
            );
            $url = preg_replace('/^http:\/\//i', 'https://', $url);
            return $url;
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
        
        // Upgrade the best link to 500x500 if it's a low-res URL
        if (!empty($bestLink)) {
            $bestLink = str_replace(
                ['/50x50/', '/150x150/', '/250x250/', '_50x50.', '_150x150.', '_250x250.', '-50x50.', '-150x150.', '-250x250.'],
                ['/500x500/', '/500x500/', '/500x500/', '_500x500.', '_500x500.', '_500x500.', '-500x500.', '-500x500.', '-500x500.'],
                $bestLink
            );
            $bestLink = preg_replace('/^http:\/\//i', 'https://', $bestLink);
        }
        
        return $bestLink ?: '';
    }
    
    private static function normalizeTrack($song) {
        $videoId = $song['id'] ?? $song['videoId'] ?? '';
        $title = html_entity_decode($song['title'] ?? 'Unknown', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $subtitle = html_entity_decode($song['subtitle'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $image = $song['image'] ?? '';
        
        // Get best quality image
        $image = self::getBestImage($image);
        
        // Get artists
        $artists = [];
        if (!empty($song['more_info']['artistMap']['primary_artists'])) {
            foreach ($song['more_info']['artistMap']['primary_artists'] as $pa) {
                $artists[] = html_entity_decode($pa['name'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }
        $artistStr = $artists ? implode(', ', $artists) : $subtitle;
        $album = html_entity_decode($song['more_info']['album'] ?? $song['album'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        
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
            'album'                => $album,
            'encrypted_media_url'  => $song['more_info']['encrypted_media_url'] ?? '',
            'perma_url'            => $song['perma_url'] ?? '',
            'source'               => 'saavn',
            'type'                 => 'song',
        ];
    }
    
    private static function normalizeArtist($artist) {
        $id = $artist['artistId'] ?? $artist['id'] ?? '';
        $name = html_entity_decode($artist['name'] ?? 'Unknown', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $image = $artist['image'] ?? $artist['thumbnail'] ?? $artist['image_url'] ?? '';
        
        // Get best quality image
        $image = self::getBestImage($image);
        
        // If we have an ID but no image, try to construct a default Saavn image URL
        if (empty($image) && !empty($id) && !empty($name)) {
            // Try to construct a default Saavn artist image URL
            $cleanName = preg_replace('/[^a-zA-Z0-9]/', '_', $name);
            $image = "https://c.saavncdn.com/artists/{$cleanName}_500x500.jpg";
        }
        
        return [
            'id'        => $id,
            'name'      => $name,
            'image'     => $image,
            'thumbnail' => $image,
            'type'      => 'artist',
        ];
    }

    public static function normalizeAlbum($album) {
        $id = $album['id'] ?? $album['albumId'] ?? '';
        $title = html_entity_decode($album['title'] ?? $album['name'] ?? 'Unknown Album', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $artist = html_entity_decode($album['primary_artists'] ?? $album['music'] ?? $album['artist'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $image = self::getBestImage($album['image'] ?? $album['thumbnail'] ?? '');
        $year = $album['year'] ?? '';
        $songCount = $album['song_count'] ?? $album['numsongs'] ?? 0;
        
        return [
            'id'          => $id,
            'title'       => $title,
            'name'        => $title,
            'artist'      => $artist,
            'image'       => $image,
            'thumbnail'   => $image,
            'artwork_url' => $image,
            'year'        => $year,
            'song_count'  => (int)$songCount,
            'type'        => 'album',
        ];
    }

    public static function normalizePlaylist($playlist) {
        $id = $playlist['id'] ?? $playlist['listid'] ?? '';
        $title = html_entity_decode($playlist['title'] ?? $playlist['listname'] ?? 'Playlist', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $image = self::getBestImage($playlist['image'] ?? $playlist['thumbnail'] ?? '');
        $songCount = $playlist['song_count'] ?? $playlist['numsongs'] ?? 0;
        $subtitle = html_entity_decode($playlist['subtitle'] ?? $playlist['description'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return [
            'id'          => $id,
            'title'       => $title,
            'name'        => $title,
            'description' => $subtitle,
            'image'       => $image,
            'thumbnail'   => $image,
            'artwork_url' => $image,
            'song_count'  => (int)$songCount,
            'type'        => 'playlist',
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
            } elseif ($type === 'albums') {
                $items[] = self::normalizeAlbum($item);
            } elseif ($type === 'playlists') {
                $items[] = self::normalizePlaylist($item);
            } else {
                $items[] = self::normalizeTrack($item);
            }
        }
        
        return $items;
    }
}
