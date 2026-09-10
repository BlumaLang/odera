<?php
/**
 * Playlist Import Routes - YouTube & Spotify
 */

require_once __DIR__ . '/../utils/http.php';

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

        // Method 1: Try to extract from ytInitialData JSON
        if (preg_match('/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s', $html, $m)) {
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
                $tracks[] = [
                    'title' => html_entity_decode($titles[$i], ENT_QUOTES, 'UTF-8'),
                    'artist' => '',
                    'videoId' => $vids[$i],
                ];
            }
        }

        if (empty($tracks)) {
            sendError('Could not parse YouTube playlist. It may be private or the format is unsupported.', 502);
        }

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

    private static function parseYtInitialData($data) {
        $tracks = [];

        // Navigate: contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents
        $tabs = $data['contents']['twoColumnBrowseResultsRenderer']['tabs'] ?? [];
        if (empty($tabs)) return [];

        $tabContent = $tabs[0]['tabRenderer']['content'] ?? null;
        if (!$tabContent) return [];

        $sections = $tabContent['sectionListRenderer']['contents'] ?? [];
        if (empty($sections)) return [];

        // Try itemSectionRenderer first
        $items = $sections[0]['itemSectionRenderer']['contents'] ?? [];
        if (!empty($items)) {
            $playlistRenderer = $items[0]['playlistVideoListRenderer']['contents'] ?? [];
        }

        // Try playlistVideoListRenderer directly
        if (empty($playlistRenderer)) {
            $playlistRenderer = $sections[0]['playlistVideoListRenderer']['contents'] ?? [];
        }

        foreach ($playlistRenderer as $item) {
            $video = $item['playlistVideoRenderer'] ?? null;
            if (!$video) continue;

            $title = $video['title']['runs'][0]['text'] ?? '';
            $videoId = $video['videoId'] ?? '';
            $shortBylineText = $video['shortBylineText']['runs'][0]['text'] ?? '';

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
        if (preg_match('/"title":\s*\{"runs":\[\{"text":"([^"]+)"/', $html, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
        }
        if (preg_match('/<title>([^<]+)<\/title>/', $html, $m)) {
            $title = trim($m[1]);
            $title = preg_replace('/\s*-\s*YouTube$/', '', $title);
            return html_entity_decode($title, ENT_QUOTES, 'UTF-8');
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
            // Try alternate paths
            $state = $data['props']['initialState'] ?? null;
        }

        if (!$state) return [];

        // Find tracks in the data structure
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
