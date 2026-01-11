<?php
require __DIR__ . '/../../vendor/autoload.php';

use Dotenv\Dotenv;

$dotenv = Dotenv::createImmutable(__DIR__ . '/../../');
$dotenv->load();

if (isset($_ENV) && is_array($_ENV)) {
    foreach ($_ENV as $k => $v) {
        if (getenv($k) === false && $v !== null && $v !== '') {
            putenv("$k=$v");
        }
        if (!isset($_SERVER[$k]) || $_SERVER[$k] === '') {
            $_SERVER[$k] = $v;
        }
    }
}


header('Content-Type: application/json; charset=utf-8');
