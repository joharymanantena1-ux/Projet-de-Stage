<?php
require_once __DIR__ . '/BaseModel.php';

class User extends BaseModel
{
    protected string $table = 'users';
    protected bool $timestamps = true;
    protected bool $softDelete = false;

    protected int $maxFailedAttempts = 5;
    protected int $lockWindowMinutes = 15;

    public function findByEmail(string $email): ?array
    {
        return $this->firstWhere(['email' => $email]);
    }

    protected function logRoleEvent(string $action, array $meta = [], ?string $ip = null)
    {
        try {
            $route = $meta['route'] ?? '/users/register';
            $stmt = $this->db->prepare("INSERT INTO logs (id_personnel, level, action, route, payload, ip, created_at) VALUES (NULL, :level, :action, :route, :payload, :ip, :created_at)");
            $stmt->execute([
                ':level'   => 'security',
                ':action'  => $action,
                ':route'   => $route,
                ':payload' => json_encode($meta),
                ':ip'      => $ip ?? ($_SERVER['REMOTE_ADDR'] ?? null),
                ':created_at' => date('Y-m-d H:i:s')
            ]);
        } catch (\Exception $e) {
            // ne pas faire échouer la logique si le log échoue — log interne si besoin
            error_log("Log error: " . $e->getMessage());
        }
    }

    public function createUser(array $data)
    {
        if (empty($data['email'])) {
            throw new InvalidArgumentException("Le champ 'email' est requis.");
        }

        // $email = $data['email'];
        // $allowedDomains = ['konecta.com', 'comdata.com'];
        // $domain = strtolower(substr(strrchr($email, "@"), 1));
        // if (!in_array($domain, $allowedDomains, true)) {
        //     throw new InvalidArgumentException("Seuls les emails @konecta.com et @comdata.com sont autorisés.");
        // }

        if (!isset($data['password'])) {
            throw new InvalidArgumentException("Le champ 'password' est requis.");
        }

        $allowedRoles = ['superadmin','admin','user','operator','viewer'];
        if (!isset($data['role']) || empty($data['role'])) {
            $data['role'] = 'user';
        } elseif (!in_array($data['role'], $allowedRoles, true)) {
            throw new InvalidArgumentException("Role invalide.");
        }

        if (isset($data['password'])) {
            $data['password_hash'] = password_hash($data['password'], PASSWORD_DEFAULT);
            unset($data['password']);
        }

        if (!isset($data['is_active'])) $data['is_active'] = 1;

        $createdId = parent::create($data);

        // Journaliser si rôle sensible
        if ($createdId && in_array($data['role'], ['admin', 'superadmin'], true)) {
            $this->logRoleEvent('register', [
                'email' => $data['email'] ?? 'unknown',
                'role'  => $data['role'],
                'method' => 'email'
            ]);
        }

        return $createdId;
    }

    public function verifyPassword(string $email, string $plainPassword): bool
    {
        $user = $this->findByEmail($email);
        if (!$user) return false;

        return password_verify($plainPassword, $user['password_hash']);
    }

    public function setLastLogin(int $userId): bool
    {
        $now = date('Y-m-d H:i:s');
        return (bool)$this->update($userId, ['last_login' => $now]);
    }

    protected function recordLoginAttempt(string $identifier, ?string $ip, bool $success, ?int $userId = null): void
    {
        try {
            $sql = "INSERT INTO login_attempts (identifier, ip, success, id_user, created_at) VALUES (:identifier, :ip, :success, :id_user, :created_at)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                ':identifier' => $identifier,
                ':ip' => $ip,
                ':success' => $success ? 1 : 0,
                ':id_user' => $userId,
                ':created_at' => date('Y-m-d H:i:s')
            ]);
        } catch (\Exception $e) {
            // ignore mais log côté serveur recommandé
            error_log("Login attempt error: " . $e->getMessage());
        }
    }

    protected function countRecentFailedAttempts(string $identifier): int
    {
        try {
            $minutes = (int)$this->lockWindowMinutes;
            // Pour compatibilité, calculer la cutoff côté PHP
            $cutoff = date('Y-m-d H:i:s', time() - ($minutes * 60));
            $sql = "SELECT COUNT(*) AS c FROM login_attempts WHERE identifier = :identifier AND success = 0 AND created_at >= :cutoff";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                ':identifier' => $identifier,
                ':cutoff' => $cutoff
            ]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return (int)($row['c'] ?? 0);
        } catch (\Exception $e) {
            error_log("Count failed attempts error: " . $e->getMessage());
            return 0;
        }
    }

    protected function roleInfo(array $user): array
    {
        $role = $user['role'] ?? null;
        $info = [
            'role' => $role,
            'role_message' => ''
        ];

        if ($role === 'superadmin') {
            $info['role_message'] = 'Bienvenue Superadmin — accès complet.';
        } elseif ($role === 'admin') {
            $info['role_message'] = 'Bienvenue Admin — accès administrateur.';
        } elseif ($role) {
            $info['role_message'] = "Connecté en tant que {$role}.";
        } else {
            $info['role_message'] = 'Connecté.';
        }

        return $info;
    }

    public function attemptLogin(string $email, string $password, ?string $ip = null): array
    {
        $identifier = $email;
        $failed = $this->countRecentFailedAttempts($identifier);
        if ($failed >= $this->maxFailedAttempts) {
            return [
                'ok' => false,
                'locked' => true,
                'message' => "Trop de tentatives échouées. Réessaye dans {$this->lockWindowMinutes} minutes."
            ];
        }

        $user = $this->findByEmail($email);
        if (!$user) {
            $this->recordLoginAttempt($identifier, $ip, false, null);
            return ['ok' => false, 'locked' => false, 'message' => 'Identifiants invalides.'];
        }

        if (isset($user['is_active']) && !$user['is_active']) {
            $this->recordLoginAttempt($identifier, $ip, false, (int)$user['id']);
            return ['ok' => false, 'locked' => false, 'message' => 'Compte désactivé. Contacte un administrateur.'];
        }

        // Vérifier mot de passe
        $passwordOk = password_verify($password, $user['password_hash']);

        if ($passwordOk) {
            if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
                $newHash = password_hash($password, PASSWORD_DEFAULT);
                $this->update($user['id'], ['password_hash' => $newHash]);
            }

            $this->recordLoginAttempt($identifier, $ip, true, (int)$user['id']);
            $this->setLastLogin((int)$user['id']);

            $roleInfo = $this->roleInfo($user);

            if (in_array($user['role'] ?? '', ['admin', 'superadmin'], true)) {
                $this->logRoleEvent('login', ['email' => $user['email'], 'role' => $user['role']], $ip);
            }

            // Ne pas renvoyer le password_hash
            if (isset($user['password_hash'])) unset($user['password_hash']);

            $userReturn = $user;
            $userReturn['role'] = $roleInfo['role'];
            $userReturn['role_message'] = $roleInfo['role_message'];

            return [
                'ok' => true,
                'locked' => false,
                'message' => 'Connexion réussie.',
                'user' => $userReturn
            ];
        } else {
            $this->recordLoginAttempt($identifier, $ip, false, (int)$user['id']);
            $remaining = max(0, $this->maxFailedAttempts - ($failed + 1));
            return [
                'ok' => false,
                'locked' => false,
                'message' => 'Identifiants invalides.',
                'remaining_attempts' => $remaining
            ];
        }
    }

    public function existsById(int $id): bool
    {
        $u = $this->find($id);
        return !empty($u);
    }

    public function getPublicById(int $id): ?array
    {
        $u = $this->find($id);
        if (!$u) return null;
        if (isset($u['password_hash'])) unset($u['password_hash']);
        return $u;
    }

    public function emailExists(string $email): bool
    {
        return $this->findByEmail($email) !== null;
    }

    public function createEmailVerification(string $email, string $codeHash, string $expiresAt): bool
    {
        try {
            error_log("Attempting to create email verification for: $email");
            error_log("Code hash: " . substr($codeHash, 0, 20) . "...");
            error_log("Expires at: $expiresAt");
            
            // Supprimer d'abord les anciennes vérifications pour cet email
            $this->deleteVerificationsForEmail($email);
            
            $sql = "INSERT INTO email_verifications (email, code, expires_at, verified) VALUES (?, ?, ?, 0)";
            $stmt = $this->db->prepare($sql);
            $result = $stmt->execute([$email, $codeHash, $expiresAt]);
            
            error_log("Insertion result: " . ($result ? 'SUCCESS' : 'FAILED'));
            
            if (!$result) {
                $errorInfo = $stmt->errorInfo();
                error_log("PDO Error: " . json_encode($errorInfo));
            }
            
            return $result;
        } catch (\Exception $e) {
            error_log("Create email verification exception: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return false;
        }
    }

    public function getActiveVerification(string $email): ?array
    {
        try {
            $currentTime = date('Y-m-d H:i:s');
            error_log("Looking for active verification for: $email, current time: $currentTime");
            
            // CORRECTION : Supprimer la condition 'verified = 0' pour permettre la vérification
            $sql = "SELECT * FROM email_verifications WHERE email = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$email, $currentTime]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if ($result) {
                error_log("Active verification found: ID " . $result['id']);
                error_log("Verification status: " . ($result['verified'] ? 'VERIFIED' : 'NOT VERIFIED'));
                return $result;
            }
            
            error_log("No active verification found for $email");
            return null;
        } catch (\Exception $e) {
            error_log("Get active verification error: " . $e->getMessage());
            return null;
        }
    }

    public function markVerificationAsVerified(int $verificationId, string $token): bool
    {
        try {
            $tokenExpiresAt = date('Y-m-d H:i:s', time() + 1800); // 30 minutes pour utiliser le token
            $sql = "UPDATE email_verifications SET verified = 1, verification_token = ?, token_expires_at = ? WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            return $stmt->execute([$token, $tokenExpiresAt, $verificationId]);
        } catch (\Exception $e) {
            error_log("Mark verification as verified error: " . $e->getMessage());
            return false;
        }
    }

    public function verifyEmailToken(string $email, string $token): bool
    {
        try {
            $currentTime = date('Y-m-d H:i:s');
            $sql = "SELECT * FROM email_verifications 
                    WHERE email = ? AND verification_token = ? AND token_expires_at > ? AND verified = 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$email, $token, $currentTime]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            error_log("Token verification result for $email: " . ($result ? 'VALID' : 'INVALID'));
            
            return (bool)$result;
        } catch (\Exception $e) {
            error_log("Verify email token error: " . $e->getMessage());
            return false;
        }
    }

    public function deleteVerificationsForEmail(string $email): bool
    {
        try {
            $stmt = $this->db->prepare("DELETE FROM email_verifications WHERE email = ?");
            $result = $stmt->execute([$email]);
            error_log("Deleted verifications for $email: " . ($result ? 'SUCCESS' : 'FAILED'));
            return $result;
        } catch (\Exception $e) {
            error_log("Delete verifications error: " . $e->getMessage());
            return false;
        }
    }

    public function countRecentVerificationAttempts(string $email): int
    {
        try {
            $oneHourAgo = date('Y-m-d H:i:s', time() - 3600);
            $sql = "SELECT COUNT(*) as count FROM email_verifications WHERE email = ? AND created_at > ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$email, $oneHourAgo]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            return (int)($result['count'] ?? 0);
        } catch (\Exception $e) {
            error_log("Count verification attempts error: " . $e->getMessage());
            return 0;
        }
    }

    public function cleanupExpiredVerifications(): bool
    {
        try {
            $currentTime = date('Y-m-d H:i:s');
            $sql = "DELETE FROM email_verifications WHERE expires_at < ? OR (token_expires_at IS NOT NULL AND token_expires_at < ?)";
            $stmt = $this->db->prepare($sql);
            $result = $stmt->execute([$currentTime, $currentTime]);
            
            $deletedCount = $stmt->rowCount();
            error_log("Cleanup expired verifications: $deletedCount records deleted");
            
            return $result;
        } catch (\Exception $e) {
            error_log("Cleanup expired verifications error: " . $e->getMessage());
            return false;
        }
    }


    // ... additional methods ...
    // Méthodes pour la réinitialisation du mot de passe
    // 

    public function forgotPasswordRequest(string $email): array
    {
        try {
            $user = $this->findByEmail($email);
            if (!$user) {
                return ['ok' => false, 'message' => 'Aucun compte associé à cet email.'];
            }

            // Vérifier que l'utilisateur est actif
            if (isset($user['is_active']) && !$user['is_active']) {
                return ['ok' => false, 'message' => 'Ce compte est désactivé.'];
            }

            // Rate limiting : vérifier les tentatives récentes
            $recentAttempts = $this->countRecentPasswordResetAttempts($email);
            if ($recentAttempts >= 3) {
                return ['ok' => false, 'message' => 'Trop de tentatives. Réessayez plus tard.'];
            }

            // Générer un code OTP à 6 chiffres
            $code = sprintf("%06d", mt_rand(0, 999999));
            $codeHash = password_hash($code, PASSWORD_DEFAULT);
            $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutes

            // Stocker le code dans une table dédiée
            $created = $this->createPasswordResetVerification($email, $codeHash, $expiresAt);
            
            if (!$created) {
                return ['ok' => false, 'message' => 'Erreur lors de la création de la demande.'];
            }

            return [
                'ok' => true,
                'message' => 'Code de réinitialisation envoyé par email.',
                'code' => $code, // À supprimer en production
                'expires_in' => 600
            ];
        } catch (\Exception $e) {
            error_log("Forgot password request error: " . $e->getMessage());
            return ['ok' => false, 'message' => 'Erreur serveur.'];
        }
    }

    public function verifyPasswordResetCode(string $email, string $code): array
    {
        try {
            $verification = $this->getActivePasswordResetVerification($email);
            
            if (!$verification) {
                return ['ok' => false, 'message' => 'Code expiré ou non trouvé.'];
            }

            // Vérifier si le code a déjà été utilisé
            if ($verification['used'] == 1) {
                return ['ok' => false, 'message' => 'Ce code a déjà été utilisé.'];
            }

            // Vérifier le code
            if (!password_verify($code, $verification['code'])) {
                return ['ok' => false, 'message' => 'Code incorrect.'];
            }

            // Générer un token pour la réinitialisation
            $resetToken = bin2hex(random_bytes(32));
            
            // Marquer comme vérifié et stocker le token
            $updated = $this->markPasswordResetAsVerified(
                (int)$verification['id'], 
                $resetToken
            );
            
            if ($updated) {
                return [
                    'ok' => true,
                    'message' => 'Code vérifié avec succès.',
                    'reset_token' => $resetToken,
                    'email' => $email
                ];
            } else {
                return ['ok' => false, 'message' => 'Erreur lors de la validation.'];
            }
        } catch (\Exception $e) {
            error_log("Verify reset code error: " . $e->getMessage());
            return ['ok' => false, 'message' => 'Erreur serveur.'];
        }
    }

    public function resetPassword(string $email, string $token, string $newPassword): array
    {
        try {
            // Vérifier le token
            $isValid = $this->verifyPasswordResetToken($email, $token);
            if (!$isValid) {
                return ['ok' => false, 'message' => 'Token invalide ou expiré.'];
            }

            // Récupérer l'utilisateur
            $user = $this->findByEmail($email);
            if (!$user) {
                return ['ok' => false, 'message' => 'Utilisateur non trouvé.'];
            }

            // Validation du mot de passe
            if (strlen($newPassword) < 8) {
                return ['ok' => false, 'message' => 'Le mot de passe doit contenir au moins 8 caractères.'];
            }

            // Hacher le nouveau mot de passe
            $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
            
            // Mettre à jour le mot de passe
            $updated = $this->update((int)$user['id'], ['password_hash' => $passwordHash]);
            
            if ($updated) {
                // Marquer le token comme utilisé
                $this->markPasswordResetAsUsed($email, $token);
                
                // Journaliser la réinitialisation
                $this->logRoleEvent('password_reset', [
                    'email' => $email,
                    'method' => 'email'
                ]);
                
                return [
                    'ok' => true,
                    'message' => 'Mot de passe réinitialisé avec succès.'
                ];
            } else {
                return ['ok' => false, 'message' => 'Erreur lors de la mise à jour du mot de passe.'];
            }
        } catch (\Exception $e) {
            error_log("Reset password error: " . $e->getMessage());
            return ['ok' => false, 'message' => 'Erreur serveur.'];
        }
    }

    public function createPasswordResetVerification(string $email, string $codeHash, string $expiresAt): bool
    {
        try {
            error_log("Creating password reset verification for: $email");
            
            // Supprimer les anciennes vérifications
            $this->deletePasswordResetVerifications($email);
            
            $sql = "INSERT INTO password_reset_verifications (email, code, expires_at, used) VALUES (?, ?, ?, 0)";
            $stmt = $this->db->prepare($sql);
            $result = $stmt->execute([$email, $codeHash, $expiresAt]);
            
            error_log("Insertion result: " . ($result ? 'SUCCESS' : 'FAILED'));
            return $result;
        } catch (\Exception $e) {
            error_log("Create password reset verification error: " . $e->getMessage());
            return false;
        }
    }

    public function getActivePasswordResetVerification(string $email): ?array
    {
        try {
            $currentTime = date('Y-m-d H:i:s');
            $sql = "SELECT * FROM password_reset_verifications WHERE email = ? AND expires_at > ? AND used = 0 ORDER BY created_at DESC LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$email, $currentTime]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return $result ?: null;
        } catch (\Exception $e) {
            error_log("Get active password reset verification error: " . $e->getMessage());
            return null;
        }
    }

    public function markPasswordResetAsVerified(int $verificationId, string $token): bool
    {
        try {
            $tokenExpiresAt = date('Y-m-d H:i:s', time() + 1800); // 30 minutes
            $sql = "UPDATE password_reset_verifications SET verified = 1, reset_token = ?, token_expires_at = ? WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            return $stmt->execute([$token, $tokenExpiresAt, $verificationId]);
        } catch (\Exception $e) {
            error_log("Mark password reset as verified error: " . $e->getMessage());
            return false;
        }
    }

    public function verifyPasswordResetToken(string $email, string $token): bool
    {
        try {
            $currentTime = date('Y-m-d H:i:s');
            $sql = "SELECT * FROM password_reset_verifications 
                    WHERE email = ? AND reset_token = ? AND token_expires_at > ? AND verified = 1 AND used = 0";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$email, $token, $currentTime]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return (bool)$result;
        } catch (\Exception $e) {
            error_log("Verify password reset token error: " . $e->getMessage());
            return false;
        }
    }

    public function markPasswordResetAsUsed(string $email, string $token): bool
    {
        try {
            $sql = "UPDATE password_reset_verifications SET used = 1 WHERE email = ? AND reset_token = ?";
            $stmt = $this->db->prepare($sql);
            return $stmt->execute([$email, $token]);
        } catch (\Exception $e) {
            error_log("Mark password reset as used error: " . $e->getMessage());
            return false;
        }
    }

    public function deletePasswordResetVerifications(string $email): bool
    {
        try {
            $stmt = $this->db->prepare("DELETE FROM password_reset_verifications WHERE email = ?");
            $result = $stmt->execute([$email]);
            return $result;
        } catch (\Exception $e) {
            error_log("Delete password reset verifications error: " . $e->getMessage());
            return false;
        }
    }

    public function countRecentPasswordResetAttempts(string $email): int
    {
        try {
            $oneHourAgo = date('Y-m-d H:i:s', time() - 3600);
            $sql = "SELECT COUNT(*) as count FROM password_reset_verifications WHERE email = ? AND created_at > ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$email, $oneHourAgo]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            return (int)($result['count'] ?? 0);
        } catch (\Exception $e) {
            error_log("Count password reset attempts error: " . $e->getMessage());
            return 0;
        }
    }

    public function cleanupExpiredPasswordResets(): bool
    {
        try {
            $currentTime = date('Y-m-d H:i:s');
            $sql = "DELETE FROM password_reset_verifications WHERE expires_at < ? OR (token_expires_at IS NOT NULL AND token_expires_at < ?)";
            $stmt = $this->db->prepare($sql);
            $result = $stmt->execute([$currentTime, $currentTime]);
            
            $deletedCount = $stmt->rowCount();
            error_log("Cleanup expired password resets: $deletedCount records deleted");
            
            return $result;
        } catch (\Exception $e) {
            error_log("Cleanup expired password resets error: " . $e->getMessage());
            return false;
        }
    }

    
}