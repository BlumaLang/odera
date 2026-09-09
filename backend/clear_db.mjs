import { rtdb } from './firebase.js';
import { ref, get, set, remove } from 'firebase/database';

async function main() {
  console.log('Connecting to Firebase Realtime Database...');
  
  // Try clearing root or individual child nodes
  const nodes = [
    'users',
    'publicUsers',
    'friends',
    'friend_requests',
    'collab_playlists',
    'track_images',
    'activity',
    'playback_events',
    'app_trending',
    'user_favorites',
    'user_playlists',
    'user_recently_played',
    'user_profiles',
    'artists_cache',
    'trending_feed',
    'server_health'
  ];

  try {
    console.log('Attempting to clear root node / ...');
    await remove(ref(rtdb, '/'));
    console.log('Successfully cleared entire RTDB root!');
  } catch (err) {
    console.warn('Root clear failed (permission or rule limit):', err.message);
    console.log('Clearing individual collections...');
    for (const node of nodes) {
      try {
        await remove(ref(rtdb, node));
        console.log(`Cleared collection: ${node}`);
      } catch (nodeErr) {
        console.warn(`Failed to clear ${node}:`, nodeErr.message);
      }
    }
  }

  console.log('RTDB database clearing complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
