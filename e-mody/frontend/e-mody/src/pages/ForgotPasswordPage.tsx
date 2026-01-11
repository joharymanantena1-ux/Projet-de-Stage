import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, ArrowLeft, Mail, Lock, CheckCircle } from 'lucide-react';
import { createApiClient } from '@/lib/apiClient';
import { motion, AnimatePresence } from 'framer-motion';

interface ForgotPasswordResponse {
  ok: boolean;
  message?: string;
  expires_in?: number;
  debug?: { code: string };
}

interface VerifyCodeResponse {
  ok: boolean;
  message?: string;
  reset_token?: string;
  email?: string;
}

interface ResetPasswordResponse {
  ok: boolean;
  message?: string;
}

export const ForgotPasswordPage: React.FC = () => {
  const [step, setStep] = useState<'email' | 'verify' | 'reset' | 'success'>('email');
  const [email, setEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [resetToken, setResetToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [otpLoading, setOtpLoading] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Gestion du compte à rebours
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Focus sur l'input OTP
  useEffect(() => {
    if (step === 'verify' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'Erreur', description: 'Veuillez saisir un email valide.', variant: 'destructive' });
      return;
    }

    setOtpLoading(true);
    try {
      const api = createApiClient();
      const response = await api.post<ForgotPasswordResponse>('/users/forgot-password', { email });
      
      if (response.data.ok) {
        toast({ title: 'Succès', description: 'Code de réinitialisation envoyé par email.' });
        setStep('verify');
        setCountdown(60); // 60 secondes avant de pouvoir renvoyer
      } else {
        toast({ title: 'Erreur', description: response.data.message || 'Erreur lors de l\'envoi du code.', variant: 'destructive' });
      }
    } catch (err: any) {
      const errorData = err.response?.data as { message?: string };
      toast({ 
        title: 'Erreur', 
        description: errorData?.message || 'Impossible d\'envoyer le code de réinitialisation.', 
        variant: 'destructive' 
      });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      toast({ title: 'Erreur', description: 'Veuillez saisir le code à 6 chiffres.', variant: 'destructive' });
      return;
    }

    setVerifying(true);
    try {
      const api = createApiClient();
      const response = await api.post<VerifyCodeResponse>('/users/verify-reset-code', { 
        email, 
        code: otpCode 
      });
      
      if (response.data.ok && response.data.reset_token) {
        setResetToken(response.data.reset_token);
        setStep('reset');
        toast({ title: 'Succès', description: 'Code vérifié avec succès.' });
      } else {
        toast({ title: 'Erreur', description: response.data.message || 'Code incorrect.', variant: 'destructive' });
      }
    } catch (err: any) {
      const errorData = err.response?.data as { message?: string };
      toast({ 
        title: 'Erreur', 
        description: errorData?.message || 'Erreur lors de la vérification du code.', 
        variant: 'destructive' 
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword || !confirmPassword) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs.', variant: 'destructive' });
      return;
    }

    if (newPassword.length < 8) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères.', variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas.', variant: 'destructive' });
      return;
    }

    setResetLoading(true);
    try {
      const api = createApiClient();
      const response = await api.post<ResetPasswordResponse>('/users/reset-password', {
        email,
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword
      });
      
      if (response.data.ok) {
        setStep('success');
        toast({ title: 'Succès', description: 'Mot de passe réinitialisé avec succès.' });
      } else {
        toast({ title: 'Erreur', description: response.data.message || 'Erreur lors de la réinitialisation.', variant: 'destructive' });
      }
    } catch (err: any) {
      const errorData = err.response?.data as { message?: string };
      toast({ 
        title: 'Erreur', 
        description: errorData?.message || 'Erreur lors de la réinitialisation du mot de passe.', 
        variant: 'destructive' 
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(value);
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!/[\d]|Backspace|Delete|Tab|ArrowLeft|ArrowRight/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const numbers = pastedData.replace(/\D/g, '').slice(0, 6);
    setOtpCode(numbers);
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    
    setOtpLoading(true);
    try {
      const api = createApiClient();
      const response = await api.post<ForgotPasswordResponse>('/users/forgot-password', { email });
      
      if (response.data.ok) {
        toast({ title: 'Succès', description: 'Nouveau code envoyé par email.' });
        setCountdown(60);
      }
    } catch (err) {
      toast({ title: 'Erreur', description: 'Erreur lors de l\'envoi du code.', variant: 'destructive' });
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-900/80 to-sky-900 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src="https://careers.recruiteecdn.com/image/upload/q_auto,f_auto,w_1920,c_limit/production/images/Bnoj/_1RJZlP3yBA0.png"
          alt="Background"
          className="w-full h-full object-cover filter blur-sm brightness-75 scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      </div>

      <div className="w-full max-w-md z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="rounded-2xl shadow-2xl border border-white/20 bg-white/15 backdrop-blur-md">
            <CardHeader className="pt-8 pb-6 px-8 text-center">
              <div className="flex items-center gap-3 mb-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => step === 'email' ? navigate('/auth') : setStep('email')}
                  className="p-2 rounded-full hover:bg-white/15 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-white/80" />
                </Button>
                <CardTitle className="text-xl font-bold bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent">
                  {step === 'email' && 'Mot de passe oublié'}
                  {step === 'verify' && 'Vérification'}
                  {step === 'reset' && 'Nouveau mot de passe'}
                  {step === 'success' && 'Réinitialisation réussie'}
                </CardTitle>
              </div>
              <CardDescription className="text-white/80 text-sm">
                {step === 'email' && 'Entrez votre email pour réinitialiser votre mot de passe'}
                {step === 'verify' && 'Entrez le code reçu par email'}
                {step === 'reset' && 'Créez votre nouveau mot de passe'}
                {step === 'success' && 'Votre mot de passe a été réinitialisé avec succès'}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-8 pb-8 pt-2">
              <AnimatePresence mode="wait">
                {step === 'email' && (
                  <motion.form
                    key="email"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onSubmit={handleSendResetCode}
                    className="space-y-6"
                  >
                    <div className="relative">
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Votre email"
                          className="h-12 pl-12 pr-4 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                          required
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
                      disabled={otpLoading}
                    >
                      {otpLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Envoi en cours...
                        </>
                      ) : (
                        'Envoyer le code de réinitialisation'
                      )}
                    </Button>

                    <div className="text-center">
                      <Link
                        to="/auth"
                        className="text-sm text-white/80 hover:text-white hover:underline transition-colors"
                      >
                        Retour à la connexion
                      </Link>
                    </div>
                  </motion.form>
                )}

                {step === 'verify' && (
                  <motion.form
                    key="verify"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onSubmit={handleVerifyCode}
                    className="space-y-6"
                  >
                    <div>
                      <Label className="text-sm font-medium text-white/80 mb-2 block">Email</Label>
                      <Input
                        value={email}
                        readOnly
                        className="h-12 px-4 border border-white/25 rounded-xl bg-white/10 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="otp" className="text-sm font-medium text-white/80 mb-3 block text-center">
                        Code de vérification
                      </Label>
                      <div className="mt-2 flex justify-center">
                        <div className="relative">
                          <Input
                            ref={otpInputRef}
                            id="otp"
                            type="text"
                            inputMode="numeric"
                            value={otpCode}
                            onChange={handleOtpChange}
                            onKeyDown={handleOtpKeyDown}
                            onPaste={handleOtpPaste}
                            className="absolute inset-0 opacity-0 z-10 cursor-default"
                            maxLength={6}
                            pattern="\d{6}"
                            required
                            autoComplete="one-time-code"
                            autoFocus
                          />
                          <div className="flex items-center justify-center gap-2 pointer-events-none">
                            {Array.from({ length: 6 }).map((_, index) => (
                              <div
                                key={index}
                                className={`w-12 h-14 flex items-center justify-center border-2 rounded-xl text-xl font-bold transition-all ${
                                  index < otpCode.length
                                    ? 'border-blue-400 text-white bg-blue-400/20 shadow-lg shadow-blue-400/20'
                                    : 'border-white/30 text-white/40 bg-white/10'
                                }`}
                              >
                                {otpCode[index] || ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-white/60 mt-3 text-center">
                        Code à 6 chiffres envoyé par email
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        type="submit"
                        className="flex-1 h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl"
                        disabled={verifying}
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Vérification...
                          </>
                        ) : (
                          'Vérifier le code'
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 px-4 text-sm rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20"
                        onClick={handleResendCode}
                        disabled={otpLoading || countdown > 0}
                      >
                        {otpLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : countdown > 0 ? (
                          `${countdown}s`
                        ) : (
                          'Renvoyer'
                        )}
                      </Button>
                    </div>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setStep('email')}
                        className="text-sm text-white/80 hover:text-white hover:underline transition-colors flex items-center justify-center gap-2 mx-auto"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Modifier l'email
                      </button>
                    </div>
                  </motion.form>
                )}

                {step === 'reset' && (
                  <motion.form
                    key="reset"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onSubmit={handleResetPassword}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="relative">
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Nouveau mot de passe"
                            className="h-12 pl-12 pr-12 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                            minLength={8}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 transition-colors z-20"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4 text-white/80" /> : <Eye className="h-4 w-4 text-white/80" />}
                          </button>
                        </div>
                        <div className="text-xs text-white/60 mt-2">
                          Minimum 8 caractères
                        </div>
                      </div>

                      <div className="relative">
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                          <Input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirmer le mot de passe"
                            className="h-12 pl-12 pr-12 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 transition-colors z-20"
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4 text-white/80" /> : <Eye className="h-4 w-4 text-white/80" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Réinitialisation...
                        </>
                      ) : (
                        'Réinitialiser le mot de passe'
                      )}
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setStep('verify')}
                        className="text-sm text-white/80 hover:text-white hover:underline transition-colors flex items-center justify-center gap-2 mx-auto"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Retour à la vérification
                      </button>
                    </div>
                  </motion.form>
                )}

                {step === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="text-center space-y-6"
                  >
                    <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle className="h-10 w-10 text-green-400" />
                    </div>
                    
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">
                        Mot de passe réinitialisé !
                      </h3>
                      <p className="text-white/80">
                        Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Button
                        onClick={() => navigate('/auth')}
                        className="w-full h-12 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-xl shadow-lg shadow-green-600/25 hover:shadow-green-600/40"
                      >
                        Se connecter
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => {
                          setStep('email');
                          setEmail('');
                          setOtpCode('');
                          setNewPassword('');
                          setConfirmPassword('');
                        }}
                        className="w-full h-12 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20"
                      >
                        Réinitialiser un autre compte
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>

            <CardFooter className="px-8 pb-6 pt-0 border-t border-white/10">
              <div className="text-xs text-white/60 text-center w-full">
                Besoin d'aide ? <Link to="/contact" className="text-white underline hover:no-underline">Contactez le support</Link>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};