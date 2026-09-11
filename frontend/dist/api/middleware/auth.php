<?php
/**
 * Authentication Middleware
 */

function requireAuth() {
    $userId = getHeader('X-User-Id');
    if (empty($userId)) {
        sendError('Authentication required', 401);
    }
    return $userId;
}

function optionalAuth() {
    return getHeader('X-User-Id') ?? null;
}

function getHeader($name) {
    $name = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return $_SERVER[$name] ?? null;
}
