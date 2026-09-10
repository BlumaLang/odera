<?php
/**
 * LRCLIB Lyrics Service
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../utils/http.php';

class LyricsService {
    
    public static function getLyrics($title, $artist = '', $videoId = '') {
        $params = ['track_name' => $title];
        if (!empty($artist)) $params['artist_name'] = $artist;
        if (!empty($videoId)) $params['duration'] = ''; // optional filter
        
        $url = LRCLIB_API . '/get?' . http_build_query($params);
        $result = httpGet($url);
        
        if ($result['code'] !== 200) {
            // Try search endpoint as fallback
            return self::searchLyrics($title, $artist);
        }
        
        $data = json_decode($result['data'], true);
        if (!$data) return self::emptyLyrics();
        
        return self::parseLyrics($data);
    }
    
    private static function searchLyrics($title, $artist = '') {
        $params = ['q' => $title];
        if (!empty($artist)) $params['q'] .= ' ' . $artist;
        
        $url = LRCLIB_API . '/search?' . http_build_query($params);
        $result = httpGet($url);
        
        if ($result['code'] !== 200) return self::emptyLyrics();
        
        $data = json_decode($result['data'], true);
        if (!is_array($data) || empty($data)) return self::emptyLyrics();
        
        // Get best match
        $best = $data[0];
        return self::parseLyrics($best);
    }
    
    private static function parseLyrics($data) {
        $synced = $data['syncedLyrics'] ?? '';
        $plain = $data['plainLyrics'] ?? $data['plainLyrics'] ?? '';
        $instrumental = $data['instrumental'] ?? false;
        
        $syncedLines = [];
        if (!empty($synced)) {
            $lines = explode("\n", $synced);
            foreach ($lines as $line) {
                if (preg_match('/\[(\d+:\d+\.\d+)\]\s*(.*)/', $line, $matches)) {
                    $time = self::parseTime($matches[1]);
                    $syncedLines[] = [
                        'time' => $time,
                        'text' => $matches[2],
                    ];
                }
            }
        }
        
        return [
            'has_lyrics'    => !empty($plain) || !empty($synced),
            'is_synced'     => !empty($synced),
            'synced_lyrics' => $syncedLines,
            'plain_lyrics'  => $plain,
            'plainLyrics'   => $plain,
            'syncedLyrics'  => $synced ?: null,
            'instrumental'  => $instrumental,
        ];
    }
    
    private static function parseTime($timeStr) {
        if (preg_match('/(\d+):(\d+)\.(\d+)/', $timeStr, $m)) {
            return (int)$m[1] * 60 + (int)$m[2] + (int)$m[3] / 100;
        }
        return 0;
    }
    
    private static function emptyLyrics() {
        return [
            'has_lyrics'    => false,
            'is_synced'     => false,
            'synced_lyrics' => [],
            'plain_lyrics'  => '',
            'plainLyrics'   => '',
            'syncedLyrics'  => null,
            'instrumental'  => false,
        ];
    }
}
