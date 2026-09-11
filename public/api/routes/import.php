<?php
/**
 * Playlist Import Routes - YouTube & Spotify
 */

require_once __DIR__ . '/../utils/http.php';
require_once __DIR__ . '/../utils/response.php';

class ImportRoutes {

    public static function handle($action, $method) {
        if ($method !== 'POST') {
            sendError('Method not allowed', 405);
        }

        $body = getRequestBody();
        $url = trim($body['url'] ?? '');

        if (empty($url)) {
            sendError('URL is required');
        }

        $isSpotify = strpos($url, 'spotify.com/playlist/') !== false || strpos($url, 'spotify:playlist:') !== false;
        $isYouTube = strpos($url, 'list=') !== false || strpos($url, 'youtube.com/playlist') !== false;

        if (!$isSpotify && !$isYouTube) {
            sendError('Please provide a valid YouTube or Spotify playlist link.');
        }

        if ($isSpotify) {
            return self::importSpotify($url);
        }

        return self::importYouTube($url);
    }

    // ─── YouTube Playlist Import ──────────────────────────────────────────
    private static function importYouTube($url) {
        // Extract playlist ID
        $playlistId = self::extractYouTubePlaylistId($url);
        if (!$playlistId) {
            sendError('Could not extract YouTube playlist ID from URL.');
        }

        // Fetch the YouTube playlist page
        $pageUrl = "https://www.youtube.com/playlist?list=" . $playlistId;
        $result = httpGet($pageUrl, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language: en-US,en;q=0.9',
        ]);

        if ($result['code'] !== 200) {
            sendError('Failed to fetch YouTube playlist. It may be private or unavailable.', 502);
        }

        $html = $result['data'];
        $tracks = [];

        // Method 0: Extract ytInitialData safely without PCRE backtracking limits
        $ytData = self::extractYtInitialDataSafe($html);
        if ($ytData) {
            $tracks = self::parseYtInitialData($ytData);
        }

        // Method 1: Try to extract from ytInitialData JSON via regex
        if (empty($tracks) && preg_match('/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s', $html, $m)) {
            $data = json_decode($m[1], true);
            if ($data) {
                $tracks = self::parseYtInitialData($data);
            }
        }

        // Method 2: Try window["ytInitialData"]
        if (empty($tracks) && preg_match('/window\["ytInitialData"\]\s*=\s*({.*?});\s*<\/script>/s', $html, $m)) {
            $data = json_decode($m[1], true);
            if ($data) {
                $tracks = self::parseYtInitialData($data);
            }
        }

        // Method 3: Extract from microformat or structured data
        if (empty($tracks) && preg_match('/"playlistVideoRenderer":\s*{[^}]*"title":\s*{"runs":\[{"text":"([^"]+)"/', $html, $m)) {
            // Fallback: regex extract titles
            preg_match_all('/"playlistVideoRenderer".*?"title":\s*\{"runs":\[\{"text":"([^"]+)"\}/', $html, $matches);
            foreach ($matches[1] as $i => $title) {
                $tracks[] = [
                    'title' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'),
                    'artist' => '',
                    'videoId' => '',
                ];
            }
        }

        // Method 4: Try extracting video IDs and titles from the page
        if (empty($tracks)) {
            preg_match_all('/"videoId":"([a-zA-Z0-9_-]{11})"/', $html, $vidMatches);
            preg_match_all('/"title":\{"runs":\[\{"text":"([^"]+)"/', $html, $titleMatches);
            $vids = $vidMatches[1] ?? [];
            $titles = $titleMatches[1] ?? [];
            $count = min(count($vids), count($titles));
            for ($i = 0; $i < $count; $i++) {
                $title = html_entity_decode($titles[$i], ENT_QUOTES, 'UTF-8');
                $videoId = $vids[$i];
                
                // Skip common non-song titles
                $lowerTitle = strtolower($title);
                $skipKeywords = ['description', 'keyboard shortcuts', 'playback', 'general', 
                                'subtitles and closed captions', 'spherical videos', 'shortcuts'];
                
                $shouldSkip = false;
                foreach ($skipKeywords as $keyword) {
                    if (strpos($lowerTitle, $keyword) !== false) {
                        $shouldSkip = true;
                        break;
                    }
                }
                
                if (!$shouldSkip && !empty($title) && !empty($videoId)) {
                    $tracks[] = [
                        'title' => $title,
                        'artist' => '',
                        'videoId' => $videoId,
                    ];
                }
            }
        }

        if (empty($tracks)) {
            sendError('Could not parse YouTube playlist. It may be private or the format is unsupported.', 502);
        }

        // Fetch all remaining tracks via YouTube continuation batches (bypasses 100 songs limit)
        self::fetchAllYouTubeContinuationTracks($html, $tracks);

        sendJson([
            'success' => true,
            'source' => 'youtube',
            'playlist' => [
                'name' => self::extractYouTubePlaylistTitle($html) ?: 'YouTube Playlist',
                'tracks' => $tracks,
                'track_count' => count($tracks),
            ],
        ]);
    }

    private static function fetchAllYouTubeContinuationTracks($html, &$tracks, $maxTracks = 5000) {
        $apiKey = '';
        if (preg_match('/"INNERTUBE_API_KEY":\s*"([^"]+)"/', $html, $mKey)) {
            $apiKey = $mKey[1];
        }
        if (empty($apiKey)) return;

        $clientVer = '2.20260910.01.00';
        if (preg_match('/"INNERTUBE_CLIENT_VERSION":\s*"([^"]+)"/', $html, $mVer)) {
            $clientVer = $mVer[1];
        }

        $token = '';
        if (preg_match('/"continuationCommand":\s*\{\s*"token":\s*"([^"]+)"/', $html, $mTok)) {
            $token = $mTok[1];
        }

        $existingIds = [];
        foreach ($tracks as $t) {
            if (!empty($t['videoId'])) {
                $existingIds[$t['videoId']] = true;
            }
        }

        $iterations = 0;
        $prevToken = '';
        $browseUrl = "https://www.youtube.com/youtubei/v1/browse?key=" . $apiKey;

        // Persistent cURL handle for zero-latency HTTP keep-alive and gzip transfer
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $browseUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TCP_KEEPALIVE => 1,
            CURLOPT_TCP_NODELAY => 1,
            CURLOPT_ENCODING => 'gzip, deflate',
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin: https://www.youtube.com',
            ],
        ]);

        while (!empty($token) && $token !== $prevToken && count($tracks) < $maxTracks && $iterations < 55) {
            $iterations++;
            $prevToken = $token;
            $postArray = [
                'context' => [
                    'client' => [
                        'clientName' => 'WEB',
                        'clientVersion' => $clientVer,
                        'hl' => 'en',
                        'gl' => 'US',
                    ],
                ],
                'continuation' => $token,
            ];

            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postArray));
            $rawResponse = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

            if ($httpCode !== 200 || !$rawResponse) {
                break;
            }

            $json = json_decode($rawResponse, true);
            if (!$json) break;

            $actions = $json['onResponseReceivedActions'] ?? [];
            if (empty($actions)) break;

            $items = $actions[0]['appendContinuationItemsAction']['continuationItems'] ?? [];
            if (empty($items)) break;

            $nextToken = null;
            foreach ($items as $item) {
                if (isset($item['continuationItemViewModel'])) {
                    $nextToken = $item['continuationItemViewModel']['continuationCommand']['innertubeCommand']['continuationCommand']['token'] ?? null;
                    continue;
                }
                if (isset($item['continuationItemRenderer'])) {
                    $nextToken = $item['continuationItemRenderer']['continuationEndpoint']['continuationCommand']['token'] ?? null;
                    continue;
                }

                $videoId = '';
                $title = '';
                $shortBylineText = '';

                if (isset($item['lockupViewModel'])) {
                    $lockup = $item['lockupViewModel'];
                    $videoId = $lockup['contentId'] ?? '';
                    $title = $lockup['metadata']['lockupMetadataViewModel']['title']['content'] ?? '';
                    $metadataRows = $lockup['metadata']['lockupMetadataViewModel']['metadata']['contentMetadataViewModel']['metadataRows'] ?? [];
                    if (!empty($metadataRows[0]['metadataParts'])) {
                        foreach ($metadataRows[0]['metadataParts'] as $part) {
                            if (!empty($part['text']['content'])) {
                                $shortBylineText = $part['text']['content'];
                                break;
                            }
                        }
                    }
                } elseif (isset($item['playlistVideoRenderer'])) {
                    $video = $item['playlistVideoRenderer'];
                    $videoId = $video['videoId'] ?? '';
                    $title = $video['title']['runs'][0]['text'] ?? $video['title']['simpleText'] ?? '';
                    $shortBylineText = $video['shortBylineText']['runs'][0]['text'] ?? $video['shortBylineText']['simpleText'] ?? '';
                }

                $lowerTitle = strtolower($title);
                if (empty($title) || empty($videoId) || in_array($lowerTitle, ['description', 'keyboard shortcuts', 'playback', 'general'])) {
                    continue;
                }

                if (!isset($existingIds[$videoId])) {
                    $existingIds[$videoId] = true;
                    $tracks[] = [
                        'title' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'),
                        'artist' => html_entity_decode($shortBylineText, ENT_QUOTES, 'UTF-8'),
                        'videoId' => $videoId,
                    ];
                }
            }

            // Fallback: search raw JSON response for next continuation token if not found above
            if (empty($nextToken) && preg_match('/"continuationCommand":\s*\{\s*"token":\s*"([^"]+)"/', $rawResponse, $mNext)) {
                if ($mNext[1] !== $token) {
                    $nextToken = $mNext[1];
                }
            }

            $token = $nextToken;
        }
        curl_close($ch);
    }

    private static function extractYtInitialDataSafe($html) {
        $marker = 'var ytInitialData = ';
        $pos = strpos($html, $marker);
        if ($pos === false) {
            $marker = 'window["ytInitialData"] = ';
            $pos = strpos($html, $marker);
        }
        if ($pos === false) return null;
        
        $start = $pos + strlen($marker);
        $end = strpos($html, '</script>', $start);
        if ($end === false) return null;
        
        $jsonStr = trim(substr($html, $start, $end - $start));
        if (substr($jsonStr, -1) === ';') {
            $jsonStr = substr($jsonStr, 0, -1);
        }
        return json_decode($jsonStr, true);
    }

    private static function parseYtInitialData($data) {
        $tracks = [];

        // Method 1: Check for modern YouTube lockupViewModel (2024-2026 format)
        $lockups = [];
        self::collectLockupViewModels($data, $lockups);
        if (!empty($lockups)) {
            foreach ($lockups as $lockup) {
                $videoId = $lockup['contentId'] ?? '';
                $title = $lockup['metadata']['lockupMetadataViewModel']['title']['content'] ?? '';
                $artist = '';
                $metadataRows = $lockup['metadata']['lockupMetadataViewModel']['metadata']['contentMetadataViewModel']['metadataRows'] ?? [];
                if (!empty($metadataRows[0]['metadataParts'])) {
                    foreach ($metadataRows[0]['metadataParts'] as $part) {
                        if (!empty($part['text']['content'])) {
                            $artist = $part['text']['content'];
                            break;
                        }
                    }
                }
                if ($title && $videoId && !in_array(strtolower($title), ['description', 'keyboard shortcuts', 'playback', 'general'])) {
                    $tracks[] = [
                        'title' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'),
                        'artist' => html_entity_decode($artist, ENT_QUOTES, 'UTF-8'),
                        'videoId' => $videoId,
                    ];
                }
            }
            if (!empty($tracks)) return $tracks;
        }

        // Method 2: Try the classic twoColumnBrowseResultsRenderer structure
        $tabs = $data['contents']['twoColumnBrowseResultsRenderer']['tabs'] ?? [];
        if (!empty($tabs)) {
            $tabContent = $tabs[0]['tabRenderer']['content'] ?? null;
            if ($tabContent) {
                $sections = $tabContent['sectionListRenderer']['contents'] ?? [];
                if (!empty($sections)) {
                    $items = $sections[0]['itemSectionRenderer']['contents'] ?? [];
                    if (!empty($items)) {
                        $playlistRenderer = $items[0]['playlistVideoListRenderer']['contents'] ?? [];
                    }

                    if (empty($playlistRenderer)) {
                        $playlistRenderer = $sections[0]['playlistVideoListRenderer']['contents'] ?? [];
                    }

                    $tracks = self::extractVideosFromPlaylistRenderer($playlistRenderer);
                }
            }
        }

        // Method 3: Try to find playlistVideoListRenderer anywhere in the data
        if (empty($tracks)) {
            $playlistRenderer = self::findPlaylistVideoListRenderer($data);
            if (!empty($playlistRenderer)) {
                $tracks = self::extractVideosFromPlaylistRenderer($playlistRenderer);
            }
        }

        // Method 4: Try to extract from videoRenderer objects
        if (empty($tracks)) {
            $tracks = self::findVideoRenderers($data);
        }

        return $tracks;
    }

    private static function collectLockupViewModels($arr, &$found, $depth = 0) {
        if ($depth > 12 || !is_array($arr)) return;
        if (isset($arr['lockupViewModel'])) {
            $found[] = $arr['lockupViewModel'];
        }
        foreach ($arr as $v) {
            if (is_array($v)) {
                self::collectLockupViewModels($v, $found, $depth + 1);
            }
        }
    }

    private static function findPlaylistVideoListRenderer($data, $maxDepth = 5) {
        return self::searchForKey($data, 'playlistVideoListRenderer', $maxDepth);
    }

    private static function findVideoRenderers($data, $maxDepth = 5) {
        $videoRenderers = self::searchForKey($data, 'videoRenderer', $maxDepth);
        $tracks = [];
        
        foreach ($videoRenderers as $video) {
            if (!is_array($video)) continue;
            
            $title = $video['title']['runs'][0]['text'] ?? $video['title']['simpleText'] ?? '';
            $videoId = $video['videoId'] ?? '';
            $shortBylineText = $video['shortBylineText']['runs'][0]['text'] ?? $video['shortBylineText']['simpleText'] ?? '';
            
            if ($title && $videoId && !in_array(strtolower($title), ['description', 'keyboard shortcuts', 'playback', 'general'])) {
                $tracks[] = [
                    'title' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'),
                    'artist' => html_entity_decode($shortBylineText, ENT_QUOTES, 'UTF-8'),
                    'videoId' => $videoId,
                ];
            }
        }
        
        return $tracks;
    }

    private static function searchForKey($data, $key, $maxDepth, $currentDepth = 0) {
        if ($currentDepth >= $maxDepth) return [];
        
        $results = [];
        
        if (is_array($data)) {
            foreach ($data as $k => $value) {
                if ($k === $key) {
                    if (is_array($value) && isset($value['contents'])) {
                        $results = array_merge($results, $value['contents']);
                    } else {
                        $results[] = $value;
                    }
                } else {
                    $results = array_merge($results, self::searchForKey($value, $key, $maxDepth, $currentDepth + 1));
                }
            }
        }
        
        return $results;
    }

    private static function extractVideosFromPlaylistRenderer($playlistRenderer) {
        $tracks = [];
        
        if (!is_array($playlistRenderer)) return $tracks;
        
        foreach ($playlistRenderer as $item) {
            $video = $item['playlistVideoRenderer'] ?? null;
            if (!$video) continue;

            $title = $video['title']['runs'][0]['text'] ?? $video['title']['simpleText'] ?? '';
            $videoId = $video['videoId'] ?? '';
            $shortBylineText = $video['shortBylineText']['runs'][0]['text'] ?? $video['shortBylineText']['simpleText'] ?? '';
            
            // Skip common non-song titles
            $lowerTitle = strtolower($title);
            if (empty($title) || empty($videoId) || 
                in_array($lowerTitle, ['description', 'keyboard shortcuts', 'playback', 'general', 
                                       'subtitles and closed captions', 'spherical videos'])) {
                continue;
            }

            if ($title && $videoId) {
                $tracks[] = [
                    'title' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'),
                    'artist' => html_entity_decode($shortBylineText, ENT_QUOTES, 'UTF-8'),
                    'videoId' => $videoId,
                ];
            }
        }
        
        return $tracks;
    }

    private static function extractYouTubePlaylistId($url) {
        if (preg_match('/[?&]list=([a-zA-Z0-9_-]+)/', $url, $m)) {
            return $m[1];
        }
        return null;
    }

    private static function extractYouTubePlaylistTitle($html) {
        // Method 1: Check metadata playlistMetadataRenderer
        if (preg_match('/"metadata":\s*\{\s*"playlistMetadataRenderer":\s*\{\s*"title":\s*"([^"]+)"/', $html, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
        }
        // Method 2: Check microformat title
        if (preg_match('/"microformat":\s*\{.*?"title":\s*"([^"]+)"/s', $html, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
        }
        // Method 3: Check HTML <title>
        if (preg_match('/<title>([^<]+)<\/title>/', $html, $m)) {
            $title = trim($m[1]);
            $title = preg_replace('/\s*-\s*YouTube$/', '', $title);
            if (!empty($title)) {
                return html_entity_decode($title, ENT_QUOTES, 'UTF-8');
            }
        }
        if (preg_match('/"title":\s*\{"runs":\[\{"text":"([^"]+)"/', $html, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
        }
        return '';
    }

    // ─── Spotify Playlist Import ──────────────────────────────────────────
    private static function importSpotify($url) {
        // Extract playlist ID from URL
        $playlistId = self::extractSpotifyPlaylistId($url);
        if (!$playlistId) {
            sendError('Could not extract Spotify playlist ID from URL.');
        }

        // Try Spotify oEmbed API (public, no auth needed)
        $oembedUrl = "https://open.spotify.com/oembed?url=" . urlencode("https://open.spotify.com/playlist/" . $playlistId);
        $oembedResult = httpGet($oembedUrl);

        $playlistName = 'Spotify Playlist';
        if ($oembedResult['code'] === 200) {
            $oembed = json_decode($oembedResult['data'], true);
            $playlistName = $oembed['title'] ?? 'Spotify Playlist';
        }

        // Fetch the Spotify embed page to get track listing
        $embedUrl = "https://open.spotify.com/embed/playlist/" . $playlistId;
        $result = httpGet($embedUrl, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept: text/html',
        ]);

        $tracks = [];

        if ($result['code'] === 200) {
            $html = $result['data'];

            // Method 1: Extract from embedded JSON data
            if (preg_match('/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s', $html, $m)) {
                $data = json_decode($m[1], true);
                if ($data) {
                    $tracks = self::parseSpotifyNextData($data);
                }
            }

            // Method 2: Extract from data-initial-page-data attribute
            if (empty($tracks) && preg_match('/data-initial-page-data="([^"]+)"/', $html, $m)) {
                $decoded = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
                $data = json_decode($decoded, true);
                if ($data) {
                    $tracks = self::parseSpotifyNextData($data);
                }
            }

            // Method 3: Extract track info from meta tags and structured data
            if (empty($tracks)) {
                preg_match_all('/<meta[^>]*content="([^"]*)"[^>]*>/i', $html, $metaMatches);
                // Look for track names in the page content
                preg_match_all('/"name"\s*:\s*"([^"]+)"/', $html, $nameMatches);
                preg_match_all('/"artists?"?\s*:\s*\[?\{[^}]*"name"\s*:\s*"([^"]+)"/', $html, $artistMatches);

                $names = $nameMatches[1] ?? [];
                $artists = $artistMatches[1] ?? [];

                for ($i = 0; $i < count($names); $i++) {
                    $tracks[] = [
                        'title' => html_entity_decode($names[$i], ENT_QUOTES, 'UTF-8'),
                        'artist' => isset($artists[$i]) ? html_entity_decode($artists[$i], ENT_QUOTES, 'UTF-8') : '',
                    ];
                }
            }
        }

        // Fallback: Use Spotify Web API (no auth needed for public playlists via embed)
        if (empty($tracks)) {
            // Try the public Spotify API endpoint for playlist preview
            $apiUrl = "https://api.spotify.com/v1/playlists/{$playlistId}/tracks?limit=100&market=US";
            $apiResult = httpGet($apiUrl, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept: application/json',
            ]);

            if ($apiResult['code'] === 200) {
                $apiData = json_decode($apiResult['data'], true);
                foreach ($apiData['items'] ?? [] as $item) {
                    $track = $item['track'] ?? null;
                    if (!$track) continue;
                    $tracks[] = [
                        'title' => $track['name'] ?? '',
                        'artist' => implode(', ', array_map(fn($a) => $a['name'] ?? '', $track['artists'] ?? [])),
                    ];
                }
            }
        }

        if (empty($tracks)) {
            sendError('Could not parse Spotify playlist. It may be private or the format is unsupported.', 502);
        }

        sendJson([
            'success' => true,
            'source' => 'spotify',
            'playlist' => [
                'name' => $playlistName,
                'tracks' => $tracks,
                'track_count' => count($tracks),
            ],
        ]);
    }

    private static function parseSpotifyNextData($data) {
        $tracks = [];

        // Navigate through the Next.js data structure
        $pageProps = $data['props']['pageProps'] ?? $data;
        $state = $pageProps['state']['data'] ?? $pageProps['data'] ?? null;

        if (!$state) {
            $state = $data['props']['initialState'] ?? null;
        }

        if (!$state) return [];

        // Modern Spotify Embed format (2024-2026): entity.trackList
        $entity = $state['entity'] ?? null;
        if ($entity && !empty($entity['trackList'])) {
            foreach ($entity['trackList'] as $item) {
                $title = $item['title'] ?? $item['name'] ?? '';
                $artist = $item['subtitle'] ?? '';
                if (!empty($title)) {
                    $tracks[] = [
                        'title' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'),
                        'artist' => html_entity_decode($artist, ENT_QUOTES, 'UTF-8'),
                    ];
                }
            }
            if (!empty($tracks)) return $tracks;
        }

        // Classic format: playlist.tracks.items
        $playlist = $state['playlist'] ?? $state['playlistData'] ?? null;
        if ($playlist) {
            $items = $playlist['tracks']['items'] ?? $playlist['items'] ?? [];
            foreach ($items as $item) {
                $track = $item['track'] ?? $item;
                if (!$track) continue;
                $tracks[] = [
                    'title' => $track['name'] ?? '',
                    'artist' => implode(', ', array_map(fn($a) => $a['name'] ?? '', $track['artists'] ?? [])),
                ];
            }
        }

        return $tracks;
    }

    private static function extractSpotifyPlaylistId($url) {
        // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
        if (preg_match('/playlist\/([a-zA-Z0-9]+)/', $url, $m)) {
            return $m[1];
        }
        // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
        if (preg_match('/spotify:playlist:([a-zA-Z0-9]+)/', $url, $m)) {
            return $m[1];
        }
        return null;
    }
}
