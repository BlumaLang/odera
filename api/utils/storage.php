<?php
/**
 * Local JSON File Storage
 * Simple file-based storage for user data.
 * For production, replace with Firebase Admin SDK or MySQL.
 */

class Storage {
    
    private static $dataDir = null;
    
    private static function getDataDir() {
        if (self::$dataDir === null) {
            self::$dataDir = __DIR__ . '/../../data';
            if (!is_dir(self::$dataDir)) {
                mkdir(self::$dataDir, 0755, true);
            }
        }
        return self::$dataDir;
    }
    
    private static function getUserDir($userId) {
        $dir = self::getDataDir() . '/users/' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $userId);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }
    
    private static function readJson($path) {
        if (!file_exists($path)) return null;
        $content = file_get_contents($path);
        return json_decode($content, true);
    }
    
    private static function writeJson($path, $data) {
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    
    // ==================== USER PROFILE ====================
    
    public static function saveUserProfile($userId, $profile) {
        $dir = self::getUserDir($userId);
        self::writeJson($dir . '/profile.json', $profile);
    }
    
    public static function getUserProfile($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/profile.json');
    }
    
    // ==================== RECENTLY PLAYED ====================
    
    public static function addRecentlyPlayed($userId, $track) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/recently_played.json';
        $recent = self::readJson($path) ?? [];
        
        // Remove duplicate if exists
        $recent = array_filter($recent, fn($t) => $t['videoId'] ?? $t['id'] ?? '' !== $track['videoId'] ?? '');
        
        // Add to front
        array_unshift($recent, $track);
        
        // Keep only 50 items
        $recent = array_slice($recent, 0, 50);
        
        self::writeJson($path, array_values($recent));
    }
    
    public static function getRecentlyPlayed($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/recently_played.json') ?? [];
    }
    
    // ==================== STREAM COUNT ====================
    
    public static function incrementStreamCount($userId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/stats.json';
        $stats = self::readJson($path) ?? ['streamCount' => 0];
        $stats['streamCount'] = ($stats['streamCount'] ?? 0) + 1;
        self::writeJson($path, $stats);
    }
    
    public static function getUserStats($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/stats.json') ?? ['streamCount' => 0];
    }
    
    // ==================== FAVORITES ====================
    
    public static function toggleFavorite($userId, $videoId, $track) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/favorites.json';
        $favorites = self::readJson($path) ?? [];
        
        if (isset($favorites[$videoId])) {
            unset($favorites[$videoId]);
            self::writeJson($path, $favorites);
            return false; // Removed
        } else {
            $favorites[$videoId] = $track;
            self::writeJson($path, $favorites);
            return true; // Added
        }
    }
    
    public static function getFavorites($userId) {
        $dir = self::getUserDir($userId);
        $favorites = self::readJson($dir . '/favorites.json') ?? [];
        return array_values($favorites);
    }
    
    // ==================== PLAYLISTS ====================
    
    public static function getPlaylists($userId) {
        $dir = self::getUserDir($userId);
        return self::readJson($dir . '/playlists.json') ?? [];
    }
    
    public static function createPlaylist($userId, $playlist) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        $playlists[] = $playlist;
        self::writeJson($path, $playlists);
    }
    
    public static function getPlaylist($userId, $playlistId) {
        $playlists = self::getPlaylists($userId);
        foreach ($playlists as $pl) {
            if ($pl['id'] === $playlistId) return $pl;
        }
        return null;
    }
    
    public static function updatePlaylist($userId, $playlistId, $updates) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        foreach ($playlists as &$pl) {
            if ($pl['id'] === $playlistId) {
                $pl = array_merge($pl, $updates);
                break;
            }
        }
        
        self::writeJson($path, $playlists);
    }
    
    public static function deletePlaylist($userId, $playlistId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        $playlists = array_filter($playlists, fn($pl) => $pl['id'] !== $playlistId);
        self::writeJson($path, array_values($playlists));
    }
    
    public static function addTrackToPlaylist($userId, $playlistId, $track) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        foreach ($playlists as &$pl) {
            if ($pl['id'] === $playlistId) {
                $pl['tracks'][] = $track;
                $pl['track_count'] = count($pl['tracks']);
                break;
            }
        }
        
        self::writeJson($path, $playlists);
    }
    
    public static function removeTrackFromPlaylist($userId, $playlistId, $videoId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        
        foreach ($playlists as &$pl) {
            if ($pl['id'] === $playlistId) {
                $pl['tracks'] = array_filter($pl['tracks'], fn($t) => ($t['videoId'] ?? '') !== $videoId);
                $pl['tracks'] = array_values($pl['tracks']);
                $pl['track_count'] = count($pl['tracks']);
                break;
            }
        }
        
        self::writeJson($path, $playlists);
    }
    
    public static function bulkRemoveTracksFromPlaylist($userId, $playlistId, $videoIds) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/playlists.json';
        $playlists = self::readJson($path) ?? [];
        $idSet = array_flip($videoIds);
        
        foreach ($playlists as &$pl) {
            if ($pl['id'] === $playlistId) {
                $pl['tracks'] = array_values(array_filter($pl['tracks'], function($t) use ($idSet) {
                    $vid = $t['videoId'] ?? $t['video_id'] ?? $t['id'] ?? '';
                    return !isset($idSet[$vid]);
                }));
                $pl['track_count'] = count($pl['tracks']);
                break;
            }
        }
        
        self::writeJson($path, $playlists);
    }

    // ==================== ALBUMS ====================

    public static function getSavedAlbums($userId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/albums.json';
        $albums = self::readJson($path) ?? [];
        return array_values($albums);
    }

    public static function toggleSavedAlbum($userId, $albumId, $albumData) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/albums.json';
        $albums = self::readJson($path) ?? [];

        if (isset($albums[$albumId])) {
            unset($albums[$albumId]);
            self::writeJson($path, $albums);
            return false;
        } else {
            $albums[$albumId] = $albumData;
            self::writeJson($path, $albums);
            return true;
        }
    }

    // ==================== PLAYLIST FOLDERS ====================

    public static function getPlaylistFolders($userId) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/folders.json';
        return self::readJson($path) ?? [];
    }

    public static function savePlaylistFolders($userId, $folders) {
        $dir = self::getUserDir($userId);
        $path = $dir . '/folders.json';
        self::writeJson($path, $folders);
    }

    // ==================== PREMIUM ====================
    
    public static function saveUserPremium($userId, $premium) {
        $dir = self::getUserDir($userId);
        self::writeJson($dir . '/premium.json', $premium);
    }
    
    // ==================== PUBLIC PLAYLISTS ====================

    public static function getPublicPlaylists() {
        $publicDir = self::getDataDir() . '/public';
        if (!is_dir($publicDir)) {
            @mkdir($publicDir, 0777, true);
        }
        $publicPath = $publicDir . '/playlists.json';

        // 1. Gather all user-created public playlists from data/users/*/playlists.json
        $userPublicPlaylists = [];
        $usersDir = self::getDataDir() . '/users';
        if (is_dir($usersDir)) {
            $userFolders = scandir($usersDir);
            foreach ($userFolders as $u) {
                if ($u === '.' || $u === '..') continue;
                $uPlaylistsFile = $usersDir . '/' . $u . '/playlists.json';
                $uPlaylists = self::readJson($uPlaylistsFile);
                if (is_array($uPlaylists)) {
                    foreach ($uPlaylists as $pl) {
                        if (!empty($pl['is_public']) || !empty($pl['isPublic'])) {
                            $userPublicPlaylists[] = array_merge($pl, [
                                'is_public' => true,
                                'isPublic' => true,
                                'type' => 'public',
                            ]);
                        }
                    }
                }
            }
        }

        // 2. Aggregate user listening history from data/users/*/recently_played.json
        $historyTracksMap = [];
        if (is_dir($usersDir)) {
            $userFolders = scandir($usersDir);
            foreach ($userFolders as $u) {
                if ($u === '.' || $u === '..') continue;
                $historyFile = $usersDir . '/' . $u . '/recently_played.json';
                $history = self::readJson($historyFile);
                if (is_array($history)) {
                    foreach ($history as $track) {
                        $vid = $track['videoId'] ?? $track['video_id'] ?? $track['id'] ?? null;
                        if (!$vid) continue;
                        if (!isset($historyTracksMap[$vid])) {
                            $historyTracksMap[$vid] = [
                                'track' => $track,
                                'playCount' => 0,
                                'lastPlayed' => $track['playedAt'] ?? $track['played_at'] ?? 0,
                            ];
                        }
                        $historyTracksMap[$vid]['playCount']++;
                    }
                }
            }
        }

        // Sort aggregated history tracks by play count
        $historyBasedPlaylists = [];
        if (!empty($historyTracksMap)) {
            usort($historyTracksMap, function($a, $b) {
                return $b['playCount'] - $a['playCount'];
            });
            $topTracks = array_map(function($item) {
                return $item['track'];
            }, array_slice($historyTracksMap, 0, 30));

            $firstCover = $topTracks[0]['artwork_url'] ?? $topTracks[0]['thumbnail'] ?? 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80';
            $historyBasedPlaylists[] = [
                'id' => 'public_pl_community_top',
                'name' => 'Staytup Community Top Tracks',
                'description' => 'Real-time trending hits based on all Staytup user listening histories.',
                'cover_url' => $firstCover,
                'is_public' => true,
                'isPublic' => true,
                'type' => 'public',
                'creator_name' => 'Staytup Community',
                'track_count' => count($topTracks),
                'tracks' => $topTracks
            ];
        }

        // 3. High quality curated public playlists with verified working covers & rich track lists
        $curatedPublic = [
            [
                'id' => 'public_pl_top_hits',
                'name' => 'Staytup Global Top Hits',
                'description' => 'The hottest trending tracks around the world right now based on all Staytup user activity.',
                'cover_url' => 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
                'is_public' => true,
                'isPublic' => true,
                'type' => 'public',
                'creator_name' => 'Staytup Community',
                'track_count' => 6,
                'tracks' => [
                    [
                        'id' => 'trk_pub_1',
                        'videoId' => '4NRXx6U8ABQ',
                        'video_id' => '4NRXx6U8ABQ',
                        'title' => 'Blinding Lights',
                        'artist' => 'The Weeknd',
                        'album' => 'After Hours',
                        'duration' => 200,
                        'duration_seconds' => 200,
                        'artwork_url' => 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg'
                    ],
                    [
                        'id' => 'trk_pub_2',
                        'videoId' => 'TUVcZfQe-Kw',
                        'video_id' => 'TUVcZfQe-Kw',
                        'title' => 'Levitating',
                        'artist' => 'Dua Lipa',
                        'album' => 'Future Nostalgia',
                        'duration' => 203,
                        'duration_seconds' => 203,
                        'artwork_url' => 'https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg'
                    ],
                    [
                        'id' => 'trk_pub_3',
                        'videoId' => 'kTJczUoc26U',
                        'video_id' => 'kTJczUoc26U',
                        'title' => 'Stay',
                        'artist' => 'The Kid LAROI, Justin Bieber',
                        'album' => 'F*CK LOVE 3',
                        'duration' => 141,
                        'duration_seconds' => 141,
                        'artwork_url' => 'https://i.ytimg.com/vi/kTJczUoc26U/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/kTJczUoc26U/hqdefault.jpg'
                    ],
                    [
                        'id' => 'trk_pub_4',
                        'videoId' => 'H5v3kku4y6Q',
                        'video_id' => 'H5v3kku4y6Q',
                        'title' => 'As It Was',
                        'artist' => 'Harry Styles',
                        'album' => "Harry's House",
                        'duration' => 167,
                        'duration_seconds' => 167,
                        'artwork_url' => 'https://i.ytimg.com/vi/H5v3kku4y6Q/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/H5v3kku4y6Q/hqdefault.jpg'
                    ],
                    [
                        'id' => 'trk_pub_5',
                        'videoId' => 'JGwWNGJdvx8',
                        'video_id' => 'JGwWNGJdvx8',
                        'title' => 'Shape of You',
                        'artist' => 'Ed Sheeran',
                        'album' => '÷ (Divide)',
                        'duration' => 233,
                        'duration_seconds' => 233,
                        'artwork_url' => 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg'
                    ],
                    [
                        'id' => 'trk_pub_6',
                        'videoId' => 'm7Bc3pLyij0',
                        'video_id' => 'm7Bc3pLyij0',
                        'title' => 'Heat Waves',
                        'artist' => 'Glass Animals',
                        'album' => 'Dreamland',
                        'duration' => 238,
                        'duration_seconds' => 238,
                        'artwork_url' => 'https://i.ytimg.com/vi/m7Bc3pLyij0/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/m7Bc3pLyij0/hqdefault.jpg'
                    ]
                ]
            ],
            [
                'id' => 'public_pl_viral_vibes',
                'name' => 'Viral Hits 2026',
                'description' => 'Most shared soundscapes and viral sensation tracks on Staytup.',
                'cover_url' => 'https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg',
                'is_public' => true,
                'isPublic' => true,
                'type' => 'public',
                'creator_name' => 'Staytup Viral',
                'track_count' => 3,
                'tracks' => [
                    [
                        'id' => 'trk_pub_v1',
                        'videoId' => 'k2qgadSvNyU',
                        'video_id' => 'k2qgadSvNyU',
                        'title' => 'Physical',
                        'artist' => 'Dua Lipa',
                        'album' => 'Future Nostalgia',
                        'duration' => 193,
                        'duration_seconds' => 193,
                        'artwork_url' => 'https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg'
                    ],
                    [
                        'id' => 'trk_pub_v2',
                        'videoId' => 'gNi_6U5Pm_o',
                        'video_id' => 'gNi_6U5Pm_o',
                        'title' => 'Higher Power',
                        'artist' => 'Coldplay',
                        'album' => 'Music of the Spheres',
                        'duration' => 211,
                        'duration_seconds' => 211,
                        'artwork_url' => 'https://i.ytimg.com/vi/gNi_6U5Pm_o/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/gNi_6U5Pm_o/hqdefault.jpg'
                    ],
                    [
                        'id' => 'trk_pub_v3',
                        'videoId' => 'Il0S8BoucSA',
                        'video_id' => 'Il0S8BoucSA',
                        'title' => 'Shivers',
                        'artist' => 'Ed Sheeran',
                        'album' => '=',
                        'duration' => 207,
                        'duration_seconds' => 207,
                        'artwork_url' => 'https://i.ytimg.com/vi/Il0S8BoucSA/hqdefault.jpg',
                        'thumbnail' => 'https://i.ytimg.com/vi/Il0S8BoucSA/hqdefault.jpg'
                    ]
                ]
            ]
        ];

        // Combine: community top history + user public playlists + curated playlists
        $allPublic = array_merge($historyBasedPlaylists, $userPublicPlaylists, $curatedPublic);

        // Deduplicate by ID and ensure first track artwork is used as playlist cover
        $seen = [];
        $result = [];
        foreach ($allPublic as $p) {
            $pid = $p['id'] ?? null;
            if ($pid && !isset($seen[$pid])) {
                $seen[$pid] = true;

                // Ensure all tracks have real music thumbnails and playlist cover is first track's image
                $plTracks = $p['tracks'] ?? [];
                if (!empty($plTracks) && is_array($plTracks)) {
                    foreach ($plTracks as &$t) {
                        $tVid = $t['videoId'] ?? $t['video_id'] ?? $t['id'] ?? null;
                        $tArt = $t['artwork_url'] ?? $t['thumbnail'] ?? $t['image'] ?? null;
                        if (empty($tArt) || strpos($tArt, 'unsplash.com') !== false) {
                            if ($tVid && strlen($tVid) === 11) {
                                $tArt = "https://i.ytimg.com/vi/{$tVid}/hqdefault.jpg";
                            }
                        }
                        $t['artwork_url'] = $tArt;
                        $t['thumbnail'] = $tArt;
                        $t['image'] = $tArt;
                    }
                    unset($t);
                    $p['tracks'] = $plTracks;

                    $firstCover = $plTracks[0]['artwork_url'] ?? $plTracks[0]['thumbnail'] ?? null;
                    if (empty($firstCover) || strpos($firstCover, 'unsplash.com') !== false) {
                        $firstVid = $plTracks[0]['videoId'] ?? $plTracks[0]['video_id'] ?? $plTracks[0]['id'] ?? null;
                        if ($firstVid && strlen($firstVid) === 11) {
                            $firstCover = "https://i.ytimg.com/vi/{$firstVid}/hqdefault.jpg";
                        }
                    }
                    if (!empty($firstCover)) {
                        $p['cover_url'] = $firstCover;
                        $p['preview_artwork'] = $firstCover;
                        $p['image'] = $firstCover;
                        $p['artwork_url'] = $firstCover;
                        $p['thumbnail'] = $firstCover;
                    }
                }

                $result[] = $p;
            }
        }

        self::writeJson($publicPath, $result);
        return $result;
    }
}
