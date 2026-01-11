<?php

    class AuthMiddleware
    {
        public function handle()
        {
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }

            if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
                http_response_code(401);
                echo json_encode(['error' => 'Authentication required']);
                exit;
            }

            if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > 1800)) {
                session_unset();
                session_destroy();
                http_response_code(401);
                echo json_encode(['error' => 'Session expired']);
                exit;
            }

            $_SESSION['last_activity'] = time();
        }
    }