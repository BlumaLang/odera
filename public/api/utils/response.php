<?php
/**
 * Response Helper Functions
 */

function sendJson($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function sendError($message, $statusCode = 400) {
    sendJson(['error' => $message], $statusCode);
}

function sendSuccess($data = []) {
    sendJson(array_merge(['success' => true], $data));
}

function getRequestBody() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return $data ?? [];
}

function getQueryParam($key, $default = null) {
    return $_GET[$key] ?? $default;
}

function getUrlParam($key) {
    return $_GET[$key] ?? null;
}
