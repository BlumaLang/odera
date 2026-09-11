<?php
/**
 * Staytup PHP Backend Configuration
 */

// JioSaavn API
define('JIOSAAVN_API', 'https://www.jiosaavn.com/api.php');
define('JIOSAAVN_API_VERSION', 4);
define('JIOSAAVN_CTX', 'web6dot0');

// DES Decryption Key for Stream URLs
define('STREAM_DECRYPT_KEY', '38346591');

// LRCLIB API
define('LRCLIB_API', 'https://lrclib.net/api');

// Firebase Configuration (use Firebase Admin SDK in production)
define('FIREBASE_DB_URL', 'https://staytupnow-default-rtdb.firebaseio.com');

// Razorpay
define('RAZORPAY_KEY_ID', 'rzp_test_TYGML4eKY8GLxv');

// App Info
define('APP_NAME', 'Staytup Music');
define('APP_VERSION', '2.8.1');

// Pagination defaults
define('DEFAULT_SEARCH_LIMIT', 40);
define('DEFAULT_ARTIST_LIMIT', 10);
define('DEFAULT_PAGE', 1);

// CORS Configuration
define('ALLOWED_ORIGINS', '*');
