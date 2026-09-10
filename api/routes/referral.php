<?php
/**
 * Referral Routes
 */

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/storage.php';

class ReferralRoutes {
    
    public static function handle($action, $method) {
        switch ($action) {
            case 'create':
                return self::create($method);
            case 'claim':
                return self::claim($method);
            case 'stats':
                return self::stats();
            default:
                sendError('Unknown referral action', 404);
        }
    }
    
    private static function generateCode() {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $code;
    }
    
    private static function create($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $userId = $body['user_id'] ?? null;
        
        if (!$userId) sendError('user_id is required');
        
        $dataDir = Storage::getDataDir();
        $refDir = $dataDir . '/referrals';
        if (!is_dir($refDir)) mkdir($refDir, 0755, true);
        
        // Check if user already has a code
        $userCodeFile = $refDir . "/user_{$userId}.json";
        if (file_exists($userCodeFile)) {
            $existing = json_decode(file_get_contents($userCodeFile), true);
            sendJson(['code' => $existing['code']]);
            return;
        }
        
        $code = self::generateCode();
        $codeData = [
            'code'      => $code,
            'uid'       => $userId,
            'createdAt' => time(),
            'usedCount' => 0,
            'usedBy'    => [],
        ];
        
        file_put_contents($userCodeFile, json_encode($codeData));
        file_put_contents($refDir . "/code_{$code}.json", json_encode($codeData));
        
        sendJson(['code' => $code]);
    }
    
    private static function claim($method) {
        if ($method !== 'POST') sendError('Method not allowed', 405);
        
        $body = getRequestBody();
        $userId = $body['user_id'] ?? null;
        $code = strtoupper($body['code'] ?? '');
        
        if (!$userId || !$code) sendError('user_id and code are required');
        
        $dataDir = Storage::getDataDir();
        $refDir = $dataDir . '/referrals';
        $codeFile = $refDir . "/code_{$code}.json";
        
        if (!file_exists($codeFile)) {
            sendError('Invalid referral code');
        }
        
        $codeData = json_decode(file_get_contents($codeFile), true);
        
        if ($codeData['uid'] === $userId) {
            sendError('Cannot use your own referral code');
        }
        
        if (isset($codeData['usedBy'][$userId])) {
            sendError('You have already used this code');
        }
        
        $codeData['usedCount']++;
        $codeData['usedBy'][$userId] = time();
        file_put_contents($codeFile, json_encode($codeData));
        
        // Update user file too
        $userCodeFile = $refDir . "/user_{$codeData['uid']}.json";
        if (file_exists($userCodeFile)) {
            file_put_contents($userCodeFile, json_encode($codeData));
        }
        
        sendJson(['success' => true]);
    }
    
    private static function stats() {
        $userId = getQueryParam('user_id');
        if (!$userId) sendError('user_id is required');
        
        $dataDir = Storage::getDataDir();
        $refDir = $dataDir . '/referrals';
        $userCodeFile = $refDir . "/user_{$userId}.json";
        
        if (!file_exists($userCodeFile)) {
            sendJson(['count' => 0, 'code' => null]);
            return;
        }
        
        $codeData = json_decode(file_get_contents($userCodeFile), true);
        sendJson([
            'count' => $codeData['usedCount'] ?? 0,
            'code'  => $codeData['code'] ?? null,
        ]);
    }
}
