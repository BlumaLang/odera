<?php
/**
 * Authentication Routes
 */

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/storage.php';

class AuthRoutes {
    
    public static function handle($action, $method) {
        switch ($action) {
            case 'pin':
                return self::pinLogin($method);
            case 'phone':
                return self::phoneLogin($method);
            case 'qr_create':
                return self::qrCreate($method);
            case 'qr_poll':
                return self::qrPoll();
            case 'qr_claim':
                return self::qrClaim($method);
            case 'qr_claim_pin':
                return self::qrClaimPin($method);
            default:
                sendError('Unknown auth action', 404);
        }
    }
    
    private static function pinLogin($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $username = $body['username'] ?? '';
        $pin = $body['pin'] ?? '';
        
        if (empty($username) || empty($pin)) {
            sendError('Username and PIN are required');
        }
        
        if (strlen($pin) !== 4 || !ctype_digit($pin)) {
            sendError('PIN must be 4 digits');
        }
        
        $cleanUsername = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $username));
        $dataDir = Storage::getDataDir();
        $pinUsersDir = $dataDir . '/pin_users';
        
        if (!is_dir($pinUsersDir)) mkdir($pinUsersDir, 0755, true);
        
        $userFile = $pinUsersDir . "/{$cleanUsername}.json";
        
        if (file_exists($userFile)) {
            // Existing user - verify PIN
            $user = json_decode(file_get_contents($userFile), true);
            if ($user['pin'] !== $pin) {
                sendError('Invalid PIN');
            }
            sendJson([
                'success'   => true,
                'user'      => ['uid' => $user['uid'], 'displayName' => $user['displayName']],
                'isNewUser' => false,
            ]);
        } else {
            // New user - create
            $uid = 'pin_' . $cleanUsername . '_' . base_convert(time(), 10, 36);
            $user = [
                'uid'         => $uid,
                'displayName' => ucwords($username),
                'username'    => $username,
                'cleanUser'   => $cleanUsername,
                'pin'         => $pin,
                'createdAt'   => time(),
            ];
            file_put_contents($userFile, json_encode($user, JSON_PRETTY_PRINT));
            
            sendJson([
                'success'   => true,
                'user'      => ['uid' => $uid, 'displayName' => $user['displayName']],
                'isNewUser' => true,
            ]);
        }
    }
    
    private static function phoneLogin($method) {
        // Phone auth requires SMS provider integration
        sendError('Phone authentication requires SMS provider setup', 501);
    }
    
    private static function qrCreate($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $sessionId = 'qr_' . bin2hex(random_bytes(16));
        
        // Store pending session
        $dataDir = Storage::getDataDir();
        $qrDir = $dataDir . '/qr_sessions';
        if (!is_dir($qrDir)) mkdir($qrDir, 0755, true);
        
        $session = [
            'sessionId' => $sessionId,
            'status'    => 'pending',
            'createdAt' => time(),
        ];
        file_put_contents($qrDir . "/{$sessionId}.json", json_encode($session));
        
        sendJson([
            'sessionId' => $sessionId,
            'status'    => 'pending',
        ]);
    }
    
    private static function qrPoll() {
        $sessionId = getQueryParam('session_id');
        if (!$sessionId) sendError('session_id is required');
        
        $dataDir = Storage::getDataDir();
        $file = $dataDir . "/qr_sessions/{$sessionId}.json";
        
        if (!file_exists($file)) {
            sendError('Session not found', 404);
        }
        
        $session = json_decode(file_get_contents($file), true);
        sendJson($session);
    }
    
    private static function qrClaim($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $sessionId = $body['session_id'] ?? '';
        
        if (!$sessionId) sendError('session_id is required');
        
        $dataDir = Storage::getDataDir();
        $file = $dataDir . "/qr_sessions/{$sessionId}.json";
        
        if (!file_exists($file)) {
            sendError('Session not found', 404);
        }
        
        $session = json_decode(file_get_contents($file), true);
        $session['status'] = 'claimed';
        $session['claimedAt'] = time();
        file_put_contents($file, json_encode($session));
        
        sendJson(['success' => true]);
    }
    
    private static function qrClaimPin($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $sessionId = $body['session_id'] ?? '';
        $pin = $body['pin'] ?? '';
        
        if (!$sessionId || !$pin) sendError('session_id and pin are required');
        
        // Delegate to PIN login
        self::pinLogin('POST');
    }
}
