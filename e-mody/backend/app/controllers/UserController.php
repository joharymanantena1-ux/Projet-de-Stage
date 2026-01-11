<?php
require_once __DIR__ . '/../model/User.php';
require_once __DIR__ . '/../services/EmailService.php';

class UserController
{
    protected User $model;
    protected EmailService $emailService;
    protected int $sessionTimeout = 2700; // Augmenté de 1800 à 2700 secondes (45 minutes)

    public function __construct()
    {
        $this->setupCors();

        // Cookie params : extraire host sans port et gérer proxy HTTPS
        $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost';
        $host = preg_replace('/:\d+$/', '', $host);

        $isSecure = (
            (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        );

        $cookieParams = [
            'lifetime' => 0,
            'path' => '/',
            'domain' => $host,
            'secure' => $isSecure,
            'httponly' => true,
            'samesite' => 'Lax'
        ];
        if (PHP_VERSION_ID >= 70300) {
            session_set_cookie_params($cookieParams);
        } else {
            session_set_cookie_params($cookieParams['lifetime'], $cookieParams['path'] . '; samesite=' . $cookieParams['samesite'], $cookieParams['domain'], $cookieParams['secure'], $cookieParams['httponly']);
        }

        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        $this->model = new User();
        $this->emailService = new EmailService();
        header('Content-Type: application/json; charset=utf-8');

        $this->enforceSessionActivity();
    }

    protected function setupCors()
    {
        $allowed = getenv('CORS_ALLOWED_ORIGIN') ?: 'http://localhost:8080';
        $allowedList = array_map('trim', explode(',', $allowed));

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($origin && in_array($origin, $allowedList, true)) {
            header("Access-Control-Allow-Origin: {$origin}");
        } else {
            header("Access-Control-Allow-Origin: " . $allowedList[0]);
        }

        header("Access-Control-Allow-Credentials: true");
        header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
        header("Access-Control-Allow-Headers: Origin, Content-Type, Accept, Authorization, X-Requested-With, x-csrf-token");

        if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
            http_response_code(200);
            exit();
        }
    }

    /**
     * Applique timeout et supprime session si inactif
     */
    protected function enforceSessionActivity()
    {
        if (!isset($_SESSION['user'])) return;

        $now = time();
        $last = $_SESSION['user']['last_activity'] ?? $_SESSION['user']['created'] ?? $now;
        if (($now - $last) > $this->sessionTimeout) {
            $this->forceLogout();
            return;
        }

        $_SESSION['user']['last_activity'] = $now;
    }

    /**
     * Force logout et répond (utilisé si session invalide)
     */
    protected function forceLogout()
    {
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
    }

    protected function ensureAuthenticated(): bool
    {
        if (!isset($_SESSION['user']) || !isset($_SESSION['user']['id'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Not authenticated']);
            return false;
        }

        $sess = $_SESSION['user'];

        // Empreinte
        $currentFingerprint = $this->computeFingerprint();
        if (!isset($sess['fingerprint']) || $sess['fingerprint'] !== $currentFingerprint) {
            // possible session hijack
            $this->forceLogout();
            http_response_code(401);
            echo json_encode(['error' => 'Session invalide (fingerprint mismatch)']);
            return false;
        }

        // Vérifier que l'utilisateur existe en base et est actif
        $userId = (int)$sess['id'];
        $user = $this->model->find($userId);
        if (!$user) {
            $this->forceLogout();
            http_response_code(401);
            echo json_encode(['error' => 'Utilisateur introuvable. Session fermée.']);
            return false;
        }

        if (isset($user['is_active']) && !$user['is_active']) {
            $this->forceLogout();
            http_response_code(401);
            echo json_encode(['error' => 'Compte désactivé.']);
            return false;
        }

        // tout est ok
        return true;
    }

    protected function computeFingerprint(): string
    {
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        return hash('sha256', $ua . '|' . $ip);
    }

    protected function validateCsrf(): bool
    {
        if (!isset($_SESSION['user'])) {
            // pas de session : pas d'exigence CSRF
            return true;
        }

        $headers = null;
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            $token = $headers['x-csrf-token'] ?? $headers['X-CSRF-Token'] ?? null;
        } else {
            $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
        }

        $sessionToken = $_SESSION['user']['csrf_token'] ?? null;
        if (!$token || !$sessionToken || !hash_equals($sessionToken, $token)) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'message' => 'CSRF token manquant ou invalide.']);
            return false;
        }
        return true;
    }

    public function index()
    {
        if (!$this->ensureAuthenticated()) return;

        // Seuls les admins peuvent voir la liste des utilisateurs
        $userRole = $_SESSION['user']['role'] ?? '';
        if (!in_array($userRole, ['admin', 'superadmin'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Accès non autorisé']);
            return;
        }

        $users = $this->model->all();
        // Nettoyer les données sensibles
        foreach ($users as &$user) {
            if (isset($user['password_hash'])) unset($user['password_hash']);
        }
        echo json_encode($users);
    }

    public function show($id)
    {
        if (!$this->ensureAuthenticated()) return;

        $userId = (int)$id;
        $currentUserRole = $_SESSION['user']['role'] ?? '';
        $currentUserId = (int)$_SESSION['user']['id'];

        // Un utilisateur ne peut voir que son propre profil, sauf s'il est admin
        if ($userId !== $currentUserId && !in_array($currentUserRole, ['admin', 'superadmin'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Accès non autorisé']);
            return;
        }

        $user = $this->model->getPublicById($userId);
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'Utilisateur non trouvé']);
            return;
        }

        echo json_encode($user);
    }

    public function checkEmail()
    {
        $data = $this->getJsonPayload();
        $email = trim($data['email'] ?? '');
        
        if (!$email) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Email requis.']);
            return;
        }
        
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'message' => 'Email invalide.']);
            return;
        }
        
        $exists = $this->model->emailExists($email);
        
        if ($exists) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'message' => 'Email déjà utilisé.']);
            return;
        }
        
        echo json_encode(['ok' => true, 'message' => 'Email disponible.']);
    }

    public function sendVerificationCode()
    {
        $data = $this->getJsonPayload();
        $email = trim($data['email'] ?? '');
        
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Email invalide.']);
            return;
        }
        
        // Vérifier si l'email existe déjà
        if ($this->model->emailExists($email)) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'message' => 'Email déjà utilisé.']);
            return;
        }

        // if (!$this->isAllowedEmailDomain($email)) {
        //     http_response_code(403);
        //     echo json_encode(['ok' => false, 'message' => 'Seuls les emails professionnels venant de Konecta sont autorisés.']);
        //     return;
        // }
        
        // Rate limiting : vérifier les tentatives récentes
        $recentAttempts = $this->model->countRecentVerificationAttempts($email);
        error_log("Recent attempts for $email: $recentAttempts");

        
        if ($recentAttempts >= 5) {
            http_response_code(429);
            echo json_encode(['ok' => false, 'message' => 'Trop de tentatives. Réessayez plus tard.']);
            return;
        }
        
        // Générer un code OTP à 6 chiffres
        $code = sprintf("%06d", mt_rand(0, 999999));
        $codeHash = password_hash($code, PASSWORD_DEFAULT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutes

        error_log("Generated code: $code, Hash: " . substr($codeHash, 0, 20) . "...");
        
        // Stocker le code hashé
        $created = $this->model->createEmailVerification($email, $codeHash, $expiresAt);
        
        if (!$created) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'message' => 'Erreur lors de la création de la vérification.']);
            return;
        }
        
        // Envoyer l'email
        $emailResult = $this->emailService->sendVerificationCode($email, $code);
        
        if ($emailResult['success']) {
            // Nettoyer les anciennes vérifications
            $this->model->cleanupExpiredVerifications();
            
            $response = [
                'ok' => true, 
                'message' => 'Code de vérification envoyé par email.',
                'expires_in' => 600
            ];
            
            // En développement, ajouter des infos de debug
            if (getenv('APP_ENV') === 'development') {
                $response['debug'] = [
                    'code' => $code
                ];
            }
            
            echo json_encode($response);
        } else {
            // Supprimer la vérification si l'email a échoué
            $this->model->deleteVerificationsForEmail($email);
            
            http_response_code(500);
            $response = [
                'ok' => false, 
                'message' => 'Erreur lors de l\'envoi de l\'email.'
            ];
            
            // En développement, ajouter les détails d'erreur
            if (getenv('APP_ENV') === 'development') {
                $response['error'] = $emailResult['error'] ?? $emailResult['message'] ?? 'Unknown error';
            }
            
            echo json_encode($response);
        }
    }

    public function verifyCode()
    {
        $data = $this->getJsonPayload();
        $email = trim($data['email'] ?? '');
        $code = trim($data['code'] ?? '');
        
        error_log("=== VERIFY CODE START ===");
        error_log("Email: $email, Code: $code");
        
        if (!$email || !$code) {
            error_log("Missing email or code");
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Email et code requis.']);
            return;
        }
        
        // CORRECTION : Récupérer la vérification active (même si déjà vérifiée)
        $verification = $this->model->getActiveVerification($email);
        
        error_log("Active verification found: " . json_encode($verification));
        
        if (!$verification) {
            error_log("No active verification found for: $email");
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Code expiré ou non trouvé.']);
            return;
        }
        
        // CORRECTION : Vérifier si le code est déjà vérifié
        if ($verification['verified'] == 1) {
            error_log("Code already verified for: $email");
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Ce code a déjà été utilisé.']);
            return;
        }
        
        // Vérifier le code
        error_log("Stored hash: " . ($verification['code'] ?? 'NULL'));
        error_log("Code to verify: $code");
        
        // CORRECTION : Debug détaillé de la vérification
        $verificationResult = password_verify($code, $verification['code']);
        error_log("Password verification result: " . ($verificationResult ? 'SUCCESS' : 'FAILED'));
        
        if ($verificationResult) {
            error_log("Password verification SUCCESS");
            
            // Générer un token de vérification
            $verificationToken = bin2hex(random_bytes(32));
            
            // Marquer comme vérifié et stocker le token
            $updated = $this->model->markVerificationAsVerified(
                (int)$verification['id'], 
                $verificationToken
            );
            
            error_log("Mark as verified result: " . ($updated ? 'SUCCESS' : 'FAILED'));
            
            if ($updated) {
                error_log("Verification successful for email: $email");
                echo json_encode([
                    'ok' => true, 
                    'message' => 'Email vérifié avec succès.',
                    'verification_token' => $verificationToken,
                    'email' => $email
                ]);
            } else {
                error_log("Failed to mark verification as verified");
                http_response_code(500);
                echo json_encode(['ok' => false, 'message' => 'Erreur lors de la validation.']);
            }
        } else {
            error_log("Password verification FAILED");
            error_log("Input code: '$code'");
            error_log("Stored hash: '" . $verification['code'] . "'");
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Code incorrect.']);
        }
        
        error_log("=== VERIFY CODE END ===");
    }

    /**
     * Inscription avec vérification email - VERSION CORRIGÉE
     */
    public function register()
    {
        $data = $this->getJsonPayload();
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? null;
        $requestedRole = isset($data['role']) ? trim($data['role']) : null;
        $verificationToken = $data['verification_token'] ?? null;

        // Vérifier le token de vérification
        if (!$verificationToken) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Token de vérification manquant.']);
            return;
        }

        // Valider le token de vérification via le modèle
        $isTokenValid = $this->model->verifyEmailToken($email, $verificationToken);
        if (!$isTokenValid) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Token de vérification invalide ou expiré.']);
            return;
        }

        // if (!$this->isAllowedEmailDomain($email)) {
        //     http_response_code(403);
        //     echo json_encode(['ok' => false, 'message' => 'Seuls les emails professionnels venant de Konecta sont autorisés.']);
        //     return;
        // }

        // If session exists, enforce CSRF for this mutating action
        if (!$this->validateCsrf()) return;

        // Vérification des champs requis
        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Email et mot de passe requis.']);
            return;
        }

        // Validation email
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'message' => 'Email invalide.']);
            return;
        }

        // Validation mot de passe
        if (strlen($password) < 8) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'message' => 'Le mot de passe doit contenir au moins 8 caractères.']);
            return;
        }

        // Vérifier existence (double vérification)
        $existing = $this->model->findByEmail($email);
        if ($existing) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'message' => 'Email déjà utilisé.']);
            return;
        }

        // Rôles autorisés
        $allowedRoles = ['superadmin','admin','user','operator','viewer'];

        // Validation du rôle (si fourni) -- sinon laisser createUser appliquer le défaut
        if ($requestedRole && !in_array($requestedRole, $allowedRoles, true)) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'message' => 'Rôle invalide.']);
            return;
        }

        // Création du payload
        $payload = [
            'email' => $email,
            'password' => $password,
            'role' => $requestedRole ?? 'user',
            'is_active' => isset($data['is_active']) ? (int)$data['is_active'] : 1,
            'email_verified' => 1 // Marquer comme vérifié puisque nous avons validé le token
        ];

        try {
            $id = $this->model->createUser($payload);
            
            // Supprimer les vérifications utilisées
            $this->model->deleteVerificationsForEmail($email);
            
            $user = $this->model->find($id);
            if (isset($user['password_hash'])) unset($user['password_hash']);

            http_response_code(201);
            echo json_encode(['ok' => true, 'message' => 'Inscription réussie.', 'user' => $user]);
        } catch (\Exception $e) {
            http_response_code(500);
            $isProd = (getenv('APP_ENV') === 'production');
            echo json_encode(['ok' => false, 'message' => 'Erreur serveur.', 'error' => $isProd ? 'Internal error' : $e->getMessage()]);
        }
    }

    // --- Login sécurisé ---
    public function login()
    {
        $data = $this->getJsonPayload();
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;

        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Email et mot de passe requis.']);
            return;
        }

        // if (!$this->isAllowedEmailDomain($email)) {
        //     http_response_code(403);
        //     echo json_encode(['ok' => false, 'message' => 'Accès réservé aux membres Konecta.']);
        //     return;
        // }

        try {
            $res = $this->model->attemptLogin($email, $password, $ip);

            if ($res['ok']) {
                
                if (session_status() !== PHP_SESSION_ACTIVE) {
                    // tenter de démarrer la session si elle n'est pas active
                    session_start();
                }
                if (function_exists('session_regenerate_id')) {
                    session_regenerate_id(true);
                }

                $user = $res['user'];
                $userId = (int)$user['id'];

                // crée une session légère (id + role + email + fingerprint)
                $fingerprint = $this->computeFingerprint();
                $_SESSION['user'] = [
                    'id' => $userId,
                    'email' => $user['email'] ?? null,
                    'role' => $user['role'] ?? null,
                    'created' => time(),
                    'last_activity' => time(),
                    'fingerprint' => $fingerprint,
                    // csrf token (côté client doit l'envoyer pour reqs POST/PUT/DELETE)
                    'csrf_token' => bin2hex(random_bytes(16))
                ];

                // Optionnel: renvoyer un user à jour depuis la BDD (sans password_hash)
                $fresh = $this->model->getPublicById($userId);
                echo json_encode([
                    'ok' => true,
                    'message' => $res['message'],
                    'user' => $fresh,
                    'csrf_token' => $_SESSION['user']['csrf_token']
                ]);
                return;
            } else {
                if (!empty($res['locked'])) {
                    http_response_code(423); // locked
                } else {
                    http_response_code(401);
                }
                echo json_encode($res);
                return;
            }
        } catch (\Exception $e) {
            http_response_code(500);
            $isProd = (getenv('APP_ENV') === 'production');
            echo json_encode(['ok' => false, 'message' => 'Erreur serveur.', 'error' => $isProd ? 'Internal error' : $e->getMessage()]);
            return;
        }
    }

    public function logout()
    {
        // Exiger CSRF si session active
        if (!$this->validateCsrf()) return;

        // Détruire la session proprement
        $this->forceLogout();
        echo json_encode(['ok' => true, 'message' => 'Déconnecté.']);
    }

    public function me()
    {
        try {
            if (!$this->ensureAuthenticated()) return;

            $id = (int)$_SESSION['user']['id'];
            $user = $this->model->getPublicById($id);
            if (!$user) {
                $this->forceLogout();
                http_response_code(401);
                echo json_encode(['error' => 'Not authenticated']);
                return;
            }

            echo json_encode($user);
        } catch (\Throwable $e) {
            http_response_code(500);
            $isProd = (getenv('APP_ENV') === 'production');
            echo json_encode(['ok' => false, 'message' => 'Server error', 'error' => $isProd ? 'Internal error' : $e->getMessage()]);
        }
    }

    protected function getJsonPayload(): ?array
    {
        $raw = file_get_contents('php://input');
        if (empty($raw)) return null;

        $data = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) return null;
        return $data;
    }

    // private function isAllowedEmailDomain(string $email): bool
    // {
    //     $allowedDomains = ['konecta.com', 'comdata.com'];
    //     $domain = strtolower(substr(strrchr($email, "@"), 1));
    //     return in_array($domain, $allowedDomains, true);
    // }


    /** * Demande de réinitialisation du mot de passe
     */

    public function forgotPassword()
    {
        $data = $this->getJsonPayload();
        $email = trim($data['email'] ?? '');
        
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Email invalide.']);
            return;
        }
        
        // if (!$this->isAllowedEmailDomain($email)) {
        //     http_response_code(403);
        //     echo json_encode(['ok' => false, 'message' => 'Seuls les emails professionnels venant de Konecta sont autorisés.']);
        //     return;
        // }
        
        // Appeler la méthode du modèle
        $result = $this->model->forgotPasswordRequest($email);
        
        if ($result['ok']) {
            // Envoyer l'email avec le code (utiliser le même service que pour l'inscription)
            $code = $result['code'] ?? ''; // Dans le vrai code, générer un nouveau code ici
            $emailResult = $this->emailService->sendPasswordResetCode($email, $code);
            
            if ($emailResult['success']) {
                // Nettoyer les anciennes vérifications
                $this->model->cleanupExpiredPasswordResets();
                
                // Ne pas renvoyer le code en production
                $response = [
                    'ok' => true, 
                    'message' => 'Code de réinitialisation envoyé par email.',
                    'expires_in' => $result['expires_in'] ?? 600
                ];
                
                // En développement seulement
                if (getenv('APP_ENV') === 'development' && isset($result['code'])) {
                    $response['debug'] = ['code' => $result['code']];
                }
                
                echo json_encode($response);
            } else {
                http_response_code(500);
                $response = [
                    'ok' => false, 
                    'message' => 'Erreur lors de l\'envoi de l\'email.'
                ];
                
                if (getenv('APP_ENV') === 'development') {
                    $response['error'] = $emailResult['error'] ?? $emailResult['message'] ?? 'Unknown error';
                }
                
                echo json_encode($response);
            }
        } else {
            // Pour des raisons de sécurité, on renvoie toujours le même message
            http_response_code(200); // Ne pas révéler si l'email existe ou non
            echo json_encode([
                'ok' => false,
                'message' => 'Si votre email est valide, vous recevrez un code de réinitialisation.'
            ]);
        }
    }

    /**
     * Vérification du code de réinitialisation
     */
    public function verifyResetCode()
    {
        $data = $this->getJsonPayload();
        $email = trim($data['email'] ?? '');
        $code = trim($data['code'] ?? '');
        
        if (!$email || !$code) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Email et code requis.']);
            return;
        }
        
        // Appeler la méthode du modèle
        $result = $this->model->verifyPasswordResetCode($email, $code);
        
        if ($result['ok']) {
            echo json_encode($result);
        } else {
            http_response_code(400);
            echo json_encode($result);
        }
    }

    /**
     * Réinitialisation du mot de passe avec token
     */
    public function resetPassword()
    {
        $data = $this->getJsonPayload();
        $email = trim($data['email'] ?? '');
        $token = $data['reset_token'] ?? '';
        $newPassword = $data['new_password'] ?? '';
        $confirmPassword = $data['confirm_password'] ?? '';
        
        if (!$email || !$token || !$newPassword || !$confirmPassword) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Tous les champs sont requis.']);
            return;
        }
        
        // Vérifier que les mots de passe correspondent
        if ($newPassword !== $confirmPassword) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Les mots de passe ne correspondent pas.']);
            return;
        }
        
        // Validation du mot de passe
        if (strlen($newPassword) < 8) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'message' => 'Le mot de passe doit contenir au moins 8 caractères.']);
            return;
        }
        
        // Appeler la méthode du modèle
        $result = $this->model->resetPassword($email, $token, $newPassword);
        
        if ($result['ok']) {
            echo json_encode($result);
        } else {
            http_response_code(400);
            echo json_encode($result);
        }
    }
}