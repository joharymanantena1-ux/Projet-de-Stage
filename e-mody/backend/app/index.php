<?php
require __DIR__ . '/config/bootstrap.php';
require __DIR__ . '/core/Router.php';

$allowedOrigins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost",      
    "http://127.0.0.1"
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
}

header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Origin, Accept, Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Expose-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

header("Content-Type: application/json; charset=utf-8");

$router = new Router();
require __DIR__ . '/routes/api.php';
$router->dispatch($_SERVER['REQUEST_URI']);
