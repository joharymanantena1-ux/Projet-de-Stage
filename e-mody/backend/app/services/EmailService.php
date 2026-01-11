<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . '/../config/Environment.php';

class EmailService
{
    private $mailer;
    
    public function __construct()
    {
        $this->mailer = new PHPMailer(true);
        $this->configureMailer();
    }

    private function configureMailer()
    {
        try {
            // Configuration du serveur SMTP Gmail
            $this->mailer->isSMTP();
            $this->mailer->Host = getenv('SMTP_HOST') ?: 'smtp.gmail.com';
            $this->mailer->SMTPAuth = true;
            $this->mailer->Username = getenv('SMTP_USERNAME');
            $this->mailer->Password = getenv('SMTP_PASSWORD');
            $this->mailer->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $this->mailer->Port = getenv('SMTP_PORT') ?: 587;
            
            // Désactiver la vérification SSL (important pour WAMP/XAMPP)
            $this->mailer->SMTPOptions = array(
                'ssl' => array(
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                    'allow_self_signed' => true
                )
            );
            
            // Configuration de l'expéditeur
            $this->mailer->setFrom(
                getenv('MAIL_FROM_ADDRESS') ?: 'no-reply@konecta.com',
                getenv('MAIL_FROM_NAME') ?: 'E-Mody System'
            );
            
            $this->mailer->addReplyTo('no-reply@konecta.com', 'E-Mody System');
            $this->mailer->CharSet = 'UTF-8';
            
            // DÉSACTIVER TOUS LES LOGS
            $this->mailer->SMTPDebug = 0;
            $this->mailer->Debugoutput = function($str, $level) {
                // Ignorer tous les messages de debug
            };
            
        } catch (Exception $e) {
            error_log("PHPMailer configuration error: " . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Envoie un code de vérification par email
     */
    public function sendVerificationCode(string $email, string $code): array
    {
        try {
            $subject = "Votre code de vérification E-Mody";
            $htmlContent = $this->buildEmailTemplate($code);
            
            // Configurer le destinataire
            $this->mailer->clearAddresses();
            $this->mailer->addAddress($email);
            
            // Contenu de l'email
            $this->mailer->isHTML(true);
            $this->mailer->Subject = $subject;
            $this->mailer->Body = $htmlContent;
            $this->mailer->AltBody = $this->buildTextVersion($code);
            
            // Envoyer l'email
            $sent = $this->mailer->send();
            
            if ($sent) {
                return [
                    'success' => true,
                    'message' => 'Email envoyé avec succès'
                ];
            } else {
                throw new Exception("Échec de l'envoi de l'email");
            }
            
        } catch (Exception $e) {
            error_log("Email sending failed: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Erreur lors de l\'envoi de l\'email',
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Construit le template HTML de l'email avec design classique
     */
    private function buildEmailTemplate(string $code): string
    {
        $appUrl = getenv('APP_URL') ?: 'http://localhost';
        $expiryMinutes = 10;
        
        return "
            <!DOCTYPE html>
            <html lang='fr'>
            <head>
                <meta charset='UTF-8'>
                <meta name='viewport' content='width=device-width, initial-scale=1.0'>
                <title>Code de vérification - E-Mody</title>
                <style>
                    body { 
                        font-family: 'Arial', 'Helvetica', sans-serif; 
                        background-color: #f9f9f9;
                        margin: 0;
                        padding: 0;
                        color: #333333;
                        line-height: 1.6;
                    }
                    
                    .container { 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background: #ffffff; 
                        padding: 30px;
                        border: 1px solid #dddddd;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 1px solid #eeeeee;
                    }
                    
                    .logo {
                        font-size: 28px;
                        font-weight: bold;
                        color: #2c5aa0;
                        margin-bottom: 10px;
                    }
                    
                    .title {
                        color: #2c5aa0;
                        font-size: 24px;
                        font-weight: normal;
                        margin: 0;
                    }
                    
                    .code-section {
                        text-align: center;
                        margin: 30px 0;
                        padding: 25px;
                        background-color: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 4px;
                    }
                    
                    .code-label {
                        color: #495057;
                        font-size: 16px;
                        margin-bottom: 15px;
                        font-weight: 500;
                    }
                    
                    .code { 
                        font-size: 36px; 
                        font-weight: bold; 
                        color: #2c5aa0; 
                        letter-spacing: 6px;
                        padding: 15px;
                        background: white;
                        border: 2px solid #2c5aa0;
                        border-radius: 4px;
                        display: inline-block;
                        min-width: 200px;
                    }
                    
                    .instructions {
                        background-color: #e7f3ff;
                        border-left: 4px solid #2c5aa0;
                        padding: 20px;
                        margin: 25px 0;
                        border-radius: 0 4px 4px 0;
                    }
                    
                    .instructions-title {
                        color: #2c5aa0;
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 16px;
                    }
                    
                    .warning {
                        background-color: #fff3cd;
                        border: 1px solid #ffeaa7;
                        padding: 20px;
                        margin: 25px 0;
                        border-radius: 4px;
                    }
                    
                    .warning-title {
                        color: #856404;
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 16px;
                    }
                    
                    .footer { 
                        margin-top: 40px; 
                        padding-top: 20px; 
                        border-top: 1px solid #eeeeee; 
                        color: #6c757d; 
                        font-size: 14px;
                        text-align: center;
                    }
                    
                    .footer a {
                        color: #2c5aa0;
                        text-decoration: none;
                    }
                    
                    @media (max-width: 600px) {
                        .container { 
                            padding: 20px; 
                            margin: 10px;
                        }
                        .code { 
                            font-size: 28px; 
                            letter-spacing: 4px;
                            min-width: 180px;
                        }
                        .title { 
                            font-size: 20px; 
                        }
                    }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <div class='logo'>E-MODY</div>
                        <h1 class='title'>Vérification de votre adresse email</h1>
                    </div>
                    
                    <p>Bonjour,</p>
                    <p>Vous avez demandé à créer un compte sur E-Mody. Pour compléter votre inscription, veuillez utiliser le code de vérification ci-dessous :</p>
                    
                    <div class='code-section'>
                        <div class='code-label'>Votre code de vérification</div>
                        <div class='code'>{$code}</div>
                    </div>
                    
                    <div class='instructions'>
                        <div class='instructions-title'>Instructions :</div>
                        <p>Copiez ce code de vérification et retournez sur la page d'inscription pour finaliser la création de votre compte.</p>
                    </div>
                    
                    <div class='warning'>
                        <div class='warning-title'>Important :</div>
                        <p>Ce code de vérification est valable pendant <strong>{$expiryMinutes} minutes</strong>. Pour des raisons de sécurité, ne le partagez avec personne.</p>
                    </div>
                    
                    <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.</p>
                    
                    <div class='footer'>
                        <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                        <p>&copy; 2025 E-Mody System. Tous droits réservés.</p>
                        <p><a href='{$appUrl}'>Accéder à E-Mody</a></p>
                    </div>
                </div>
            </body>
            </html>
        ";
    }

    /**
     * Version texte pour les clients email qui ne supportent pas HTML
     */
    private function buildTextVersion(string $code): string
    {
        $appUrl = getenv('APP_URL') ?: 'http://localhost';
        $expiryMinutes = 10;
        
        return "
            VERIFICATION D'EMAIL - E-MODY
            
            Bonjour,
            
            Vous avez demandé à créer un compte sur E-Mody. Pour compléter votre inscription, veuillez utiliser le code de vérification ci-dessous :
            
            CODE DE VÉRIFICATION : {$code}
            
            Instructions :
            Copiez ce code de vérification et retournez sur la page d'inscription pour finaliser la création de votre compte.
            
            Important :
            Ce code de vérification est valable pendant {$expiryMinutes} minutes. Pour des raisons de sécurité, ne le partagez avec personne.
            
            Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.
            
            ---
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.
            © 2025 E-Mody System. Tous droits réservés.
            {$appUrl}
        ";
    }



    public function sendPasswordResetCode(string $email, string $code): array
    {
        try {
            $subject = "Réinitialisation de votre mot de passe E-Mody";
            $htmlContent = $this->buildPasswordResetEmailTemplate($code);
            
            // Configurer le destinataire
            $this->mailer->clearAddresses();
            $this->mailer->addAddress($email);
            
            // Contenu de l'email
            $this->mailer->isHTML(true);
            $this->mailer->Subject = $subject;
            $this->mailer->Body = $htmlContent;
            $this->mailer->AltBody = $this->buildPasswordResetTextVersion($code);
            
            // Envoyer l'email
            $sent = $this->mailer->send();
            
            if ($sent) {
                return [
                    'success' => true,
                    'message' => 'Email envoyé avec succès'
                ];
            } else {
                throw new Exception("Échec de l'envoi de l'email");
            }
            
        } catch (Exception $e) {
            error_log("Password reset email sending failed: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Erreur lors de l\'envoi de l\'email',
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Construit le template HTML pour la réinitialisation de mot de passe
     */
    private function buildPasswordResetEmailTemplate(string $code): string
    {
        $appUrl = getenv('APP_URL') ?: 'http://localhost';
        $expiryMinutes = 10;
        
        return "
            <!DOCTYPE html>
            <html lang='fr'>
            <head>
                <meta charset='UTF-8'>
                <meta name='viewport' content='width=device-width, initial-scale=1.0'>
                <title>Réinitialisation de mot de passe - E-Mody</title>
                <style>
                    body { 
                        font-family: 'Arial', 'Helvetica', sans-serif; 
                        background-color: #f9f9f9;
                        margin: 0;
                        padding: 0;
                        color: #333333;
                        line-height: 1.6;
                    }
                    
                    .container { 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background: #ffffff; 
                        padding: 30px;
                        border: 1px solid #dddddd;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 1px solid #eeeeee;
                    }
                    
                    .logo {
                        font-size: 28px;
                        font-weight: bold;
                        color: #2c5aa0;
                        margin-bottom: 10px;
                    }
                    
                    .title {
                        color: #2c5aa0;
                        font-size: 24px;
                        font-weight: normal;
                        margin: 0;
                    }
                    
                    .code-section {
                        text-align: center;
                        margin: 30px 0;
                        padding: 25px;
                        background-color: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 4px;
                    }
                    
                    .code-label {
                        color: #495057;
                        font-size: 16px;
                        margin-bottom: 15px;
                        font-weight: 500;
                    }
                    
                    .code { 
                        font-size: 36px; 
                        font-weight: bold; 
                        color: #2c5aa0; 
                        letter-spacing: 6px;
                        padding: 15px;
                        background: white;
                        border: 2px solid #2c5aa0;
                        border-radius: 4px;
                        display: inline-block;
                        min-width: 200px;
                    }
                    
                    .instructions {
                        background-color: #e7f3ff;
                        border-left: 4px solid #2c5aa0;
                        padding: 20px;
                        margin: 25px 0;
                        border-radius: 0 4px 4px 0;
                    }
                    
                    .instructions-title {
                        color: #2c5aa0;
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 16px;
                    }
                    
                    .warning {
                        background-color: #fff3cd;
                        border: 1px solid #ffeaa7;
                        padding: 20px;
                        margin: 25px 0;
                        border-radius: 4px;
                    }
                    
                    .warning-title {
                        color: #856404;
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 16px;
                    }
                    
                    .footer { 
                        margin-top: 40px; 
                        padding-top: 20px; 
                        border-top: 1px solid #eeeeee; 
                        color: #6c757d; 
                        font-size: 14px;
                        text-align: center;
                    }
                    
                    .footer a {
                        color: #2c5aa0;
                        text-decoration: none;
                    }
                    
                    .btn {
                        display: inline-block;
                        padding: 12px 24px;
                        background-color: #2c5aa0;
                        color: white;
                        text-decoration: none;
                        border-radius: 4px;
                        font-weight: 600;
                        margin: 10px 0;
                    }
                    
                    @media (max-width: 600px) {
                        .container { 
                            padding: 20px; 
                            margin: 10px;
                        }
                        .code { 
                            font-size: 28px; 
                            letter-spacing: 4px;
                            min-width: 180px;
                        }
                        .title { 
                            font-size: 20px; 
                        }
                    }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <div class='logo'>E-MODY</div>
                        <h1 class='title'>Réinitialisation de votre mot de passe</h1>
                    </div>
                    
                    <p>Bonjour,</p>
                    <p>Vous avez demandé à réinitialiser votre mot de passe pour votre compte E-Mody. Pour continuer, veuillez utiliser le code de vérification ci-dessous :</p>
                    
                    <div class='code-section'>
                        <div class='code-label'>Votre code de vérification</div>
                        <div class='code'>{$code}</div>
                    </div>
                    
                    <div class='instructions'>
                        <div class='instructions-title'>Instructions :</div>
                        <p>Copiez ce code de vérification et retournez sur la page de réinitialisation de mot de passe pour continuer le processus.</p>
                    </div>
                    
                    <div class='warning'>
                        <div class='warning-title'>Important :</div>
                        <p>Ce code de vérification est valable pendant <strong>{$expiryMinutes} minutes</strong>. Pour des raisons de sécurité, ne le partagez avec personne.</p>
                        <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email. Votre mot de passe restera inchangé.</p>
                    </div>
                    
                    <div class='footer'>
                        <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                        <p>&copy; 2025 E-Mody System. Tous droits réservés.</p>
                        <p><a href='{$appUrl}'>Accéder à E-Mody</a></p>
                    </div>
                </div>
            </body>
            </html>
        ";
    }

    /**
     * Version texte pour la réinitialisation de mot de passe
     */
    private function buildPasswordResetTextVersion(string $code): string
    {
        $appUrl = getenv('APP_URL') ?: 'http://localhost';
        $expiryMinutes = 10;
        
        return "
            RÉINITIALISATION DE MOT DE PASSE - E-MODY
            
            Bonjour,
            
            Vous avez demandé à réinitialiser votre mot de passe pour votre compte E-Mody. Pour continuer, veuillez utiliser le code de vérification ci-dessous :
            
            CODE DE VÉRIFICATION : {$code}
            
            Instructions :
            Copiez ce code de vérification et retournez sur la page de réinitialisation de mot de passe pour continuer le processus.
            
            Important :
            Ce code de vérification est valable pendant {$expiryMinutes} minutes. Pour des raisons de sécurité, ne le partagez avec personne.
            
            Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email. Votre mot de passe restera inchangé.
            
            ---
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.
            © 2025 E-Mody System. Tous droits réservés.
            {$appUrl}
        ";
    }
}