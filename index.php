<?php
/**
 * Staytup - API Entry Point
 * All API requests are routed through this file
 */

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, Accept, Origin, User-Agent');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');
header('Content-Type: application/json; charset=utf-8');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load API router
require_once __DIR__ . '/api/index.php';
