<?php
/**
 * Staytup PHP Backend API - Main Router
 * 
 * API Endpoints:
 * 
 * Health:      GET  /api/health
 * 
 * Music:       GET  /api/search?q=&offset=&limit=
 *              GET  /api/suggestions?q=
 *              GET  /api/home?user_id=&force=
 *              GET  /api/feed/personalized?user_id=
 *              GET  /api/lyrics?title=&artist=&video_id=
 *              GET  /api/stream/:videoId
 *              GET  /api/track/:id
 *              GET  /api/track/:id/image
 * 
 * Artists:     GET  /api/artists/search?q=&limit=
 *              GET  /api/artists/popular?lang=&limit=
 *              POST /api/artists/batch-images
 *              GET  /api/artist/:id/songs?page=&limit=
 *              GET  /api/artist/:id/image
 *              GET  /api/artist/:id/related?limit=
 *              GET  /api/artist/:id/info
 * 
 * Auth:        POST /api/auth/pin         { username, pin }
 *              POST /api/auth/phone       { phone, code }
 *              POST /api/qr/create        {}
 *              GET  /api/qr/poll/:sessionId
 *              POST /api/qr/claim         { session_id }
 *              POST /api/qr/claim-pin     { session_id, pin }
 * 
 * User:        POST /api/user/onboard     { user_id, username, languages, favoriteArtists }
 *              GET  /api/user/profile     ?user_id=
 *              POST /api/play/record      { user_id, videoId, ... }
 *              GET  /api/history          ?user_id=
 * 
 * Favorites:   POST /api/favorites/toggle { user_id, videoId, ... }
 *              GET  /api/favorites        ?user_id=
 * 
 * Playlists:   GET  /api/playlists        ?user_id=
 *              POST /api/playlists/create { user_id, name, ... }
 *              GET  /api/playlists/:id    ?user_id=
 *              PUT  /api/playlists/:id    ?user_id= { name, ... }
 *              POST /api/playlists/:id/tracks    ?user_id= { track }
 *              DEL  /api/playlists/:id/tracks/:videoId  ?user_id=
 *              DEL  /api/playlists/:id    ?user_id=
 * 
 * Premium:     POST /api/premium/save     { user_id, plan, is_premium, payment_details }
 * 
 * Referrals:   POST /api/referral/create  { user_id }
 *              POST /api/referral/claim    { user_id, code }
 *              GET  /api/referral/stats   ?user_id=
 * 
 * Recognition: POST /api/recognize        { audio_data }
 * YouTube:     POST /api/youtube/import   { url }
 */

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, Accept, Origin, User-Agent');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load dependencies
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/utils/response.php';
require_once __DIR__ . '/utils/http.php';

// Parse the request
$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rtrim($uri, '/');

// Remove everything up to and including /api prefix
// Handles both /api/health and /odera/api/health
if (preg_match('#(.*/api)#i', $uri, $m)) {
    $uri = substr($uri, strlen($m[1]));
}
$uri = '/' . ltrim($uri, '/');

// Handle when mod_rewrite is not enabled (index.php is in the path)
// e.g., /index.php/health → skip index.php
if (preg_match('#^/index\.php(/|$)#i', $uri)) {
    $uri = preg_replace('#^/index\.php#i', '', $uri);
}
$uri = '/' . ltrim($uri, '/');

// Route matching
$parts = array_values(array_filter(explode('/', $uri)));
$resource = $parts[0] ?? '';
$subresource = $parts[1] ?? '';
$id = $parts[2] ?? '';
$subaction = $parts[3] ?? '';

try {
    switch ($resource) {
        // ==================== HEALTH ====================
        case 'health':
            require_once __DIR__ . '/routes/music.php';
            MusicRoutes::handle('health', $method);
            break;
        
        // ==================== SEARCH ====================
        case 'search':
            require_once __DIR__ . '/routes/search.php';
            if ($subresource === 'trending') {
                SearchRoutes::handle('trending', $method);
            } elseif ($subresource === 'suggestions') {
                SearchRoutes::handle('suggestions', $method);
            } else {
                SearchRoutes::handle('search', $method);
            }
            break;
        
        case 'trending':
            require_once __DIR__ . '/routes/search.php';
            SearchRoutes::handle('trending', $method);
            break;
        
        case 'suggestions':
            require_once __DIR__ . '/routes/search.php';
            SearchRoutes::handle('suggestions', $method);
            break;
        
        // ==================== HOME / FEED ====================
        case 'home':
            require_once __DIR__ . '/routes/music.php';
            MusicRoutes::handle('home', $method);
            break;
        
        case 'feed':
            require_once __DIR__ . '/routes/music.php';
            MusicRoutes::handle('feed', $method);
            break;
        
        // ==================== LYRICS ====================
        case 'lyrics':
            require_once __DIR__ . '/routes/music.php';
            MusicRoutes::handle('lyrics', $method);
            break;

        // ==================== STREAM ====================
        case 'stream':
            require_once __DIR__ . '/routes/music.php';
            MusicRoutes::handle('stream', $method, ['id' => $subresource]);
            break;
        
        // ==================== IMAGE PROXY ====================
        case 'proxy-image':
        case 'image-proxy':
            require_once __DIR__ . '/routes/music.php';
            MusicRoutes::handle('proxy-image', $method);
            break;
        
        // ==================== TRACK ====================
        case 'track':
            require_once __DIR__ . '/routes/music.php';
            if ($subresource === 'image') {
                MusicRoutes::handle('track', $method, ['id' => $id, 'subaction' => 'image']);
            } elseif ($id === 'image') {
                MusicRoutes::handle('track', $method, ['id' => $subresource, 'subaction' => 'image']);
            } else {
                MusicRoutes::handle('track', $method, ['id' => $subresource]);
            }
            break;
        
        // ==================== ARTISTS ====================
        case 'artists':
            require_once __DIR__ . '/routes/artist.php';
            if ($subresource === 'batch-images') {
                ArtistRoutes::handle('batch_images', $method);
            } elseif ($subresource === 'search') {
                ArtistRoutes::handle('search', $method);
            } elseif ($subresource === 'popular') {
                ArtistRoutes::handle('popular', $method);
            } else {
                sendError('Unknown artists endpoint', 404);
            }
            break;
        
        case 'artist':
            require_once __DIR__ . '/routes/artist.php';
            if ($id === 'songs') {
                ArtistRoutes::handle('songs', $method, ['id' => $subresource]);
            } elseif ($id === 'image') {
                ArtistRoutes::handle('image', $method, ['id' => $subresource]);
            } elseif ($id === 'related') {
                ArtistRoutes::handle('related', $method, ['id' => $subresource]);
            } elseif ($id === 'info') {
                ArtistRoutes::handle('info', $method, ['id' => $subresource]);
            } else {
                sendError('Unknown artist endpoint', 404);
            }
            break;
        
        // ==================== AUTH ====================
        case 'auth':
            require_once __DIR__ . '/routes/auth.php';
            if ($subresource === 'pin') {
                AuthRoutes::handle('pin', $method);
            } elseif ($subresource === 'phone') {
                AuthRoutes::handle('phone', $method);
            } else {
                sendError('Unknown auth endpoint', 404);
            }
            break;
        
        case 'qr':
            require_once __DIR__ . '/routes/auth.php';
            if ($subresource === 'create') {
                AuthRoutes::handle('qr_create', $method);
            } elseif ($subresource === 'poll') {
                AuthRoutes::handle('qr_poll', $method);
            } elseif ($subresource === 'claim') {
                AuthRoutes::handle('qr_claim', $method);
            } elseif ($subresource === 'claim-pin') {
                AuthRoutes::handle('qr_claim_pin', $method);
            } else {
                sendError('Unknown QR endpoint', 404);
            }
            break;
        
        // ==================== USER ====================
        case 'user':
            require_once __DIR__ . '/routes/user.php';
            if ($subresource === 'onboard') {
                UserRoutes::handle('onboard', $method);
            } elseif ($subresource === 'profile') {
                UserRoutes::handle('profile', $method);
            } else {
                sendError('Unknown user endpoint', 404);
            }
            break;
        
        case 'play':
            require_once __DIR__ . '/routes/user.php';
            if ($subresource === 'record') {
                UserRoutes::handle('play_record', $method);
            } else {
                sendError('Unknown play endpoint', 404);
            }
            break;
        
        case 'history':
            require_once __DIR__ . '/routes/user.php';
            UserRoutes::handle('history', $method);
            break;
        
        // ==================== FAVORITES ====================
        case 'favorites':
            require_once __DIR__ . '/routes/user.php';
            if ($subresource === 'toggle') {
                UserRoutes::handle('favorites_toggle', $method);
            } else {
                UserRoutes::handle('favorites', $method);
            }
            break;
        
        // ==================== PLAYLISTS ====================
        case 'playlists':
            require_once __DIR__ . '/routes/user.php';
            if ($subresource === 'public') {
                UserRoutes::handle('playlists_public', $method);
            } elseif ($method === 'POST' && $subresource === 'create') {
                UserRoutes::handle('playlists_create', $method);
            } elseif ($subresource && $subaction === 'tracks' && $id) {
                // /playlists/:playlistId/tracks or /playlists/:playlistId/tracks/:videoId
                $trackVideoId = $parts[4] ?? null;
                if ($trackVideoId && $method === 'DELETE') {
                    UserRoutes::handle('playlists_remove_track', $method, ['id' => $subresource, 'videoId' => $trackVideoId]);
                } elseif ($method === 'POST') {
                    UserRoutes::handle('playlists_add_track', $method, ['id' => $subresource]);
                } else {
                    sendError('Unknown playlist tracks endpoint', 404);
                }
            } elseif ($subresource && $method === 'GET') {
                UserRoutes::handle('playlists_detail', $method, ['id' => $subresource]);
            } elseif ($subresource && $method === 'PUT') {
                UserRoutes::handle('playlists_update', $method, ['id' => $subresource]);
            } elseif ($subresource && $method === 'DELETE') {
                UserRoutes::handle('playlists_delete', $method, ['id' => $subresource]);
            } elseif (!$subresource && $method === 'GET') {
                UserRoutes::handle('playlists_list', $method);
            } else {
                sendError('Unknown playlists endpoint', 404);
            }
            break;
        
        // ==================== PREMIUM ====================
        case 'premium':
            require_once __DIR__ . '/routes/user.php';
            if ($subresource === 'save') {
                UserRoutes::handle('premium_save', $method);
            } else {
                sendError('Unknown premium endpoint', 404);
            }
            break;
        
        // ==================== REFERRAL ====================
        case 'referral':
            require_once __DIR__ . '/routes/referral.php';
            if ($subresource === 'create') {
                ReferralRoutes::handle('create', $method);
            } elseif ($subresource === 'claim') {
                ReferralRoutes::handle('claim', $method);
            } elseif ($subresource === 'stats') {
                ReferralRoutes::handle('stats', $method);
            } else {
                sendError('Unknown referral endpoint', 404);
            }
            break;
        
        // ==================== RECOGNIZE ====================
        case 'recognize':
            sendError('Song recognition requires additional integration', 501);
            break;
        
        // ==================== YOUTUBE / SPOTIFY IMPORT ====================
        case 'youtube':
        case 'spotify':
        case 'import':
            require_once __DIR__ . '/routes/import.php';
            ImportRoutes::handle($resource, $method);
            break;
        
        // ==================== DEFAULT ====================
        case '':
            sendJson([
                'name'    => APP_NAME,
                'version' => APP_VERSION,
                'status'  => 'running',
                'docs'    => 'See README.md for API documentation',
            ]);
            break;
        
        default:
            sendError('Endpoint not found', 404);
    }
} catch (Exception $e) {
    error_log('API Error: ' . $e->getMessage());
    sendError('Internal server error', 500);
}
