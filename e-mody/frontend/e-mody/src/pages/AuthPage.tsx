import React, { useState, useRef, useEffect } from 'react'; 
import { Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, ArrowLeft, Mail, Lock, User } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createApiClient } from '@/lib/apiClient';
import { motion, AnimatePresence, Variants } from 'framer-motion';

import '@/base.css';

/* --- types & logic --- */
type AuthHook = {
  login: (email: string, password: string) => Promise<boolean>;
  isAuthenticated: boolean;
  loading: boolean;
};

interface SendVerificationResponse { ok: boolean; message?: string; debug?: { code: string }; }
interface VerifyCodeResponse { ok: boolean; message?: string; verification_token?: string; }
interface RegisterResponse { ok: boolean; message?: string; }
interface ApiError { message: string; }

/* --- Composant amélioré avec OTP corrigé --- */
export const AuthPage: React.FC = () => {
  const [panel, setPanel] = useState<'login' | 'register' | 'verify'>('login');

  // login
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // register
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regConfirm, setRegConfirm] = useState<string>('');
  const [regShowPassword, setRegShowPassword] = useState<boolean>(false);
  const [regRole, setRegRole] = useState<string>('user');

  // verify
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpLoading, setOtpLoading] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [registerLoading, setRegisterLoading] = useState<boolean>(false);

  const { login, isAuthenticated, loading } = useAuth() as AuthHook;
  const { toast } = useToast() as any;

  // Référence pour l'input OTP
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Focus automatique sur l'input OTP quand le panneau verify est actif
  useEffect(() => {
    if (panel === 'verify' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [panel, otpSent]);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    
    try {
      const success = await login(email, password);
      if (success) toast({ title: 'Connexion réussie', description: 'Bienvenue' });
      else toast({ title: 'Erreur de connexion', description: 'Email ou mot de passe incorrect', variant: 'destructive' });
    } catch (err) {
      toast({ title: 'Erreur', description: 'Impossible de se connecter', variant: 'destructive' });
    }
  };

  const handleSendVerificationCode = async (): Promise<boolean> => {
    if (!regEmail) { toast({ title: 'Erreur', description: 'Veuillez saisir votre email', variant: 'destructive' }); return false; }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) { toast({ title: 'Erreur', description: "Format d'email invalide", variant: 'destructive' }); return false; }

    setOtpLoading(true);
    try {
      const api = createApiClient();
      const response = await api.post('/users/send-verification', { email: regEmail });
      const data = response.data as SendVerificationResponse;
      if (data && data.ok) { 
        setOtpSent(true); 
        toast({ title: 'Code envoyé', description: `Un code de vérification a été envoyé à ${regEmail}` }); 
        return true; 
      }
      else { toast({ title: 'Erreur', description: data?.message || "Erreur lors de l'envoi du code", variant: 'destructive' }); return false; }
    } catch (err: any) {
      const errorData = err.response?.data as ApiError;
      toast({ title: 'Erreur', description: errorData?.message || "Impossible d'envoyer le code de vérification", variant: 'destructive' });
      return false;
    } finally { setOtpLoading(false); }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) { 
      toast({ title: 'Code invalide', description: 'Veuillez saisir le code à 6 chiffres reçu par email', variant: 'destructive' }); 
      return; 
    }
    setVerifying(true);
    try {
      const api = createApiClient();
      const response = await api.post('/users/verify-code', { email: regEmail, code: otpCode });
      const data = response.data as VerifyCodeResponse;
      if (data && data.ok) {
        toast({ title: 'Email vérifié', description: 'Votre email a été vérifié avec succès' });
        if (data.verification_token) await handleFinalRegistration(data.verification_token);
        else toast({ title: 'Erreur', description: 'Token de vérification manquant', variant: 'destructive' });
      } else { toast({ title: 'Erreur', description: data?.message || 'Code incorrect', variant: 'destructive' }); }
    } catch (err: any) {
      const errorData = err.response?.data as ApiError;
      toast({ title: 'Erreur', description: errorData?.message || 'Erreur lors de la vérification du code', variant: 'destructive' });
    } finally { setVerifying(false); }
  };


  const handleFinalRegistration = async (verificationToken: string): Promise<boolean> => {
    if (!verificationToken) { toast({ title: 'Erreur', description: 'Token de vérification manquant', variant: 'destructive' }); return false; }
    if (regPassword.length < 8) { toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères', variant: 'destructive' }); return false; }
    if (regPassword !== regConfirm) { toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' }); return false; }

    setRegisterLoading(true);
    try {
      const api = createApiClient();
      const response = await api.post('/users/register', {
        email: regEmail,
        password: regPassword,
        verification_token: verificationToken,
        role: regRole
      });
      const data = response.data as RegisterResponse;
      if (data && data.ok) {
        toast({ title: 'Inscription réussie', description: 'Votre compte a été créé avec succès' });
        setRegEmail(''); setRegPassword(''); setRegConfirm(''); setOtpCode(''); setOtpSent(false);
        setPanel('login');
        return true;
      } else {
        toast({ title: 'Erreur', description: data?.message || "Erreur lors de l'inscription", variant: 'destructive' });
        return false;
      }
    } catch (err: any) {
      const errorData = err.response?.data as ApiError;
      toast({ title: 'Erreur', description: errorData?.message || 'Impossible de créer le compte', variant: 'destructive' });
      return false;
    } finally { setRegisterLoading(false); }
  };

  const handleRegisterStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail || !regPassword || !regConfirm) { toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) { toast({ title: 'Erreur', description: "Format d'email invalide", variant: 'destructive' }); return; }
    if (regPassword.length < 8) { toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères', variant: 'destructive' }); return; }
    if (regPassword !== regConfirm) { toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' }); return; }

    const success = await handleSendVerificationCode();
    if (success) setPanel('verify');
  };

  // Gestion améliorée de la saisie OTP
  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(value);
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Permettre seulement les chiffres, backspace, delete, tab, flèches
    if (!/[\d]|Backspace|Delete|Tab|ArrowLeft|ArrowRight|ArrowUp|ArrowDown/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const numbers = pastedData.replace(/\D/g, '').slice(0, 6);
    setOtpCode(numbers);
  };

  /* Animation variants améliorées */
  const panelVariants: Variants = {
    enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0, scale: 0.95 }),
    center: { x: 0, opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
    exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0, scale: 0.95, transition: { duration: 0.3 } })
  };

  const blobVariants: Variants = {
    float: {
      y: [0, -20, 0],
      x: [0, 15, 0],
      rotate: [0, 5, 0],
      transition: { duration: 8, repeat: Infinity, repeatType: 'reverse', ease: "easeInOut" }
    }
  };

  const logoVariants: Variants = {
    hover: {
      scale: 1.05,
      rotate: 2,
      transition: { duration: 0.3, ease: "easeInOut" }
    }
  };

  return (
    <>
      
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-900/80 to-sky-900 relative overflow-hidden font-['Inter']">

        <div className="absolute inset-0 z-0">
          <img
            src="https://careers.recruiteecdn.com/image/upload/q_auto,f_auto,w_1920,c_limit/production/images/Bnoj/_1RJZlP3yBA0.png"   
            alt="Background"
            className="w-full h-full object-cover filter blur-sm brightness-75 scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        </div>

        {/* Background animated elements */}
        <motion.div
          variants={blobVariants}
          animate="float"
          className="absolute -left-20 -top-20 w-72 h-72 rounded-full opacity-20 bg-blue-500/30 blur-xl"
        />
        <motion.div
          variants={blobVariants}
          animate="float"
          className="absolute -right-24 -bottom-24 w-80 h-80 rounded-full opacity-15 bg-cyan-500/30 blur-xl"
          style={{ animationDelay: '2s' }}
        />

        <div className="w-full max-w-6xl px-4 z-10">
          {/* Outer glass container */}
          <div className="relative rounded-3xl overflow-hidden border border-white/20 bg-white/15 backdrop-blur-xl shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 items-stretch min-h-[600px]">
              {/* LEFT: Hero panel */}
              <div className="flex items-center justify-center p-8 lg:p-12 order-2 lg:order-1">
                <div className="relative w-full max-w-md">
                  <motion.div
                    variants={logoVariants}
                    whileHover="hover"
                    className="flex flex-col items-center justify-center text-center"
                  >
                    {/* Logo container */}
                    <div className="w-48 h-48 lg:w-52 lg:h-52 rounded-full flex items-center justify-center overflow-hidden mb-8 bg-transparent">
                      <img
                        src="/uploads/293b7155-d554-46f9-9fd1-e9829d9f511f.png"
                        alt="e-Mody Illustration"
                        className="object-contain w-4/5 h-4/5 filter brightness-110"
                      />
                    </div>

                    <motion.h3
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-xl lg:text-2xl font-['Poppins'] font-bold text-white mb-4 tracking-tight"
                    >
                      Logistique & Transport
                    </motion.h3>

                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-sm text-white/90 max-w-md mb-3 leading-relaxed"
                    >
                      Boostez vos compétences avec <span className="font-semibold text-white">e-Mody</span>
                    </motion.p>

                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-xs text-white/70 leading-relaxed"
                    >
                      Gestion du transport du personnel — plateforme de gestion intelligente
                    </motion.p>
                  </motion.div>
                </div>
              </div>

              {/* RIGHT: Authentication panel */}
              <div className="flex items-center justify-center p-8 lg:p-12 bg-gradient-to-br from-white/15 to-white/10 backdrop-blur-md order-1 lg:order-2">
                <div className="w-full max-w-md">
                  {/* Tabs */}
                  <div className="flex items-center justify-center lg:justify-end gap-3 mb-8">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      aria-pressed={panel === 'login'}
                      onClick={() => setPanel('login')}
                      className={`px-6 py-3 rounded-full text-sm font-['Poppins'] font-semibold focus:outline-none transition-all ${
                        panel === 'login' 
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25' 
                          : 'bg-white/15 text-white/90 hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      Sign In
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      aria-pressed={panel === 'register'}
                      onClick={() => setPanel('register')}
                      className={`px-6 py-3 rounded-full text-sm font-['Poppins'] font-semibold focus:outline-none transition-all ${
                        panel === 'register' 
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25' 
                          : 'bg-white/15 text-white/90 hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      Sign Up
                    </motion.button>
                  </div>

                  <AnimatePresence custom={panel === 'login' ? 1 : -1} initial={false} mode="wait">
                    {panel === 'login' ? (
                      <motion.div key="login" custom={1} variants={panelVariants} initial="enter" animate="center" exit="exit" className="w-full">
                        <Card className="rounded-2xl shadow-2xl border border-white/20 bg-white/15 backdrop-blur-md">
                          <CardHeader className="pt-8 pb-6 px-8 text-center">
                            <CardTitle className="text-2xl font-['Poppins'] font-bold bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent">
                              Sign In
                            </CardTitle>
                            <CardDescription className="text-white/80 mt-3 text-sm">Accédez à votre plateforme</CardDescription>
                          </CardHeader>

                          <CardContent className="px-8 pb-8 pt-2">
                            <form onSubmit={handleSubmit} className="space-y-6">
                              {/* Email Input avec icône */}
                              <div className="relative">
                                <div className="relative">
                                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                                  <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email"
                                    className="h-12 pl-12 pr-4 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 transition-all duration-200 font-['Inter']"
                                    required
                                  />
                                </div>
                              </div>

                              {/* Password Input avec icône */}
                              <div className="relative">
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                                  <Input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mot de passe"
                                    className="h-12 pl-12 pr-12 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 transition-all duration-200 font-['Inter']"
                                    required
                                  />
                                  <button
                                    type="button"
                                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 transition-colors z-20"
                                  >
                                    {showPassword ? <EyeOff className="h-4 w-4 text-white/80" /> : <Eye className="h-4 w-4 text-white/80" />}
                                  </button>
                                </div>

                                <div className="flex justify-end mt-3">
                                  <Link to="/forgot-password" className="text-xs text-white/80 hover:text-white hover:underline transition-colors font-['Inter']">
                                    Mot de passe oublié ?
                                  </Link>
                                </div>
                              </div>

                              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button
                                  type="submit"
                                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-['Poppins'] font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200"
                                  disabled={loading}
                                >
                                  {loading ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Connexion...
                                    </>
                                  ) : (
                                    'Se connecter'
                                  )}
                                </Button>
                              </motion.div>
                            </form>

                            <div className="mt-6 text-center">
                              <button 
                                type="button" 
                                onClick={() => setPanel('register')} 
                                className="text-xs text-white/80 hover:text-white hover:underline transition-colors font-['Inter']"
                              >
                                Pas encore de compte ? S'inscrire
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ) : panel === 'register' ? (
                      <motion.div key="register" custom={-1} variants={panelVariants} initial="enter" animate="center" exit="exit" className="w-full">
                        <Card className="rounded-2xl shadow-2xl border border-white/20 bg-white/15 backdrop-blur-md">
                          <CardHeader className="pt-8 pb-6 px-8 text-center">
                            <CardTitle className="text-2xl font-['Poppins'] font-bold bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent">
                              S'inscrire
                            </CardTitle>
                            <CardDescription className="text-white/80 mt-3 text-sm">Créez votre compte</CardDescription>
                          </CardHeader>

                          <CardContent className="px-8 pb-8 pt-2">
                            <form onSubmit={handleRegisterStart} className="space-y-6">
                              {/* Email Input avec icône */}
                              <div className="relative">
                                <div className="relative">
                                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                                  <Input
                                    type="email"
                                    value={regEmail}
                                    onChange={(e) => setRegEmail(e.target.value)}
                                    placeholder="Email"
                                    className="h-12 pl-12 pr-4 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 transition-all duration-200 font-['Inter']"
                                    required
                                  />
                                </div>
                              </div>

                              {/* Role Select avec icône */}
                              <div className="relative">
                                <div className="relative">
                                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                                  <Select value={regRole} onValueChange={setRegRole}>
                                    <SelectTrigger className="h-12 pl-12 pr-4 border border-white/25 rounded-xl bg-white/10 text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 font-['Inter']">
                                      <SelectValue placeholder="Sélectionner un rôle" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-white/20 text-white font-['Inter']">
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="superadmin">Super Admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Password Input avec icône */}
                              <div className="relative">
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                                  <Input
                                    type={regShowPassword ? 'text' : 'password'}
                                    value={regPassword}
                                    onChange={(e) => setRegPassword(e.target.value)}
                                    placeholder="Mot de passe"
                                    className="h-12 pl-12 pr-12 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 transition-all duration-200 font-['Inter']"
                                    minLength={8}
                                    required
                                  />
                                  <button 
                                    type="button" 
                                    aria-label={regShowPassword ? 'Masquer' : 'Afficher'} 
                                    onClick={() => setRegShowPassword(!regShowPassword)} 
                                    className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 transition-colors z-20"
                                  >
                                    {regShowPassword ? <EyeOff className="h-4 w-4 text-white/80" /> : <Eye className="h-4 w-4 text-white/80" />}
                                  </button>
                                </div>
                              </div>

                              {/* Confirm Password Input avec icône */}
                              <div className="relative">
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/70 z-10" />
                                  <Input 
                                    type="password" 
                                    value={regConfirm} 
                                    onChange={(e) => setRegConfirm(e.target.value)} 
                                    placeholder="Confirmer le mot de passe"
                                    className="h-12 pl-12 pr-4 border border-white/25 rounded-xl bg-white/10 text-white placeholder-white/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 transition-all duration-200 font-['Inter']" 
                                    required 
                                  />
                                </div>
                              </div>

                              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button 
                                  type="submit" 
                                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-['Poppins'] font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200" 
                                  disabled={otpLoading}
                                >
                                  {otpLoading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Envoi du code...</>
                                  ) : (
                                    'Envoyer le code de vérification'
                                  )}
                                </Button>
                              </motion.div>

                              <div className="text-xs text-white/70 text-center font-['Inter']">
                                En vous inscrivant, vous acceptez nos{' '}
                                <a className="text-white underline hover:no-underline">conditions</a>.
                              </div>
                            </form>

                            <div className="mt-6 text-center">
                              <button 
                                type="button" 
                                onClick={() => setPanel('login')} 
                                className="text-xs text-white/80 hover:text-white hover:underline transition-colors font-['Inter']"
                              >
                                Déjà inscrit ? Se connecter
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ) : (
                      <motion.div key="verify" custom={-1} variants={panelVariants} initial="enter" animate="center" exit="exit" className="w-full">
                        <Card className="rounded-2xl shadow-2xl border border-white/20 bg-white/15 backdrop-blur-md">
                          <CardHeader className="pt-8 pb-6 px-8 text-center">
                            <div className="flex items-center gap-3 mb-2">
                              <motion.button 
                                whileHover={{ scale: 1.1 }} 
                                whileTap={{ scale: 0.9 }}
                                onClick={() => { setPanel('register'); setOtpSent(false); setOtpCode(''); }} 
                                className="p-2 rounded-full hover:bg-white/15 transition-colors"
                              >
                                <ArrowLeft className="h-5 w-5 text-white/80" />
                              </motion.button>
                              <CardTitle className="text-xl font-['Poppins'] font-bold bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent">
                                Vérification
                              </CardTitle>
                            </div>
                            <CardDescription className="text-white/80 text-sm">
                              {otpSent ? "Entrez le code envoyé à votre adresse" : "Envoyez d'abord le code de vérification"}
                            </CardDescription>
                          </CardHeader>

                          <CardContent className="px-8 pb-8 pt-2">
                            <form onSubmit={handleVerifyCode} className="space-y-6">
                              <div>
                                <Label className="text-sm font-medium text-white/80 mb-2 block font-['Inter']">Email</Label>
                                <Input 
                                  value={regEmail} 
                                  readOnly 
                                  className="h-12 px-4 border border-white/25 rounded-xl bg-white/10 text-white font-['Inter']" 
                                />
                              </div>

                              {otpSent && (
                                <div>
                                  <Label htmlFor="otp" className="text-sm font-medium text-white/80 mb-3 block text-center font-['Inter']">
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
                                          <motion.div 
                                            key={index} 
                                            whileHover={{ scale: 1.1 }}
                                            className={`w-12 h-14 flex items-center justify-center border-2 rounded-xl text-xl font-bold transition-all duration-200 ${
                                              index < otpCode.length 
                                                ? 'border-blue-400 text-white bg-blue-400/20 shadow-lg shadow-blue-400/20' 
                                                : 'border-white/30 text-white/40 bg-white/10'
                                            } ${index === otpCode.length ? 'ring-2 ring-blue-400/30' : ''}`}
                                          >
                                            {otpCode[index] || ''}
                                          </motion.div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-xs text-white/60 mt-3 text-center font-['Inter']">
                                    Code à 6 chiffres envoyé par email
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-3">
                                {otpSent ? (
                                  <>
                                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                                      <Button 
                                        type="submit" 
                                        className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-['Poppins'] font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200" 
                                        disabled={verifying || registerLoading}
                                      >
                                        {verifying || registerLoading ? (
                                          <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>{registerLoading ? 'Inscription...' : 'Vérification...'}</>
                                        ) : (
                                          'Vérifier et finaliser'
                                        )}
                                      </Button>
                                    </motion.div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-12 px-4 text-sm rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-50 disabled:pointer-events-none transition font-['Inter']"
                                      onClick={handleSendVerificationCode}
                                      disabled={otpLoading}
                                      aria-busy={otpLoading}
                                    >
                                      {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Renvoyer'}
                                    </Button>
                                  </>
                                ) : (
                                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full">
                                      <Button 
                                        type="button" 
                                        className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-['Poppins'] font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200" 
                                        onClick={handleSendVerificationCode} 
                                        disabled={otpLoading}
                                      >
                                        {otpLoading ? (
                                          <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Envoi en cours...</>
                                        ) : (
                                          'Envoyer le code de vérification'
                                        )}
                                      </Button>
                                    </motion.div>
                                )}
                              </div>

                              {otpSent && (
                                <div className="text-xs text-white/70 text-center font-['Inter']">
                                  Si vous n'avez pas reçu le code, vérifiez vos spams ou cliquez sur{' '}
                                  <button 
                                    type="button" 
                                    onClick={handleSendVerificationCode} 
                                    className="text-white underline hover:no-underline"
                                  >
                                    Renvoyer
                                  </button>.
                                </div>
                              )}
                            </form>

                            <div className="mt-6 text-center">
                              <button 
                                type="button" 
                                onClick={() => { setPanel('register'); setOtpSent(false); setOtpCode(''); }} 
                                className="text-xs text-white/80 hover:text-white hover:underline transition-colors flex items-center justify-center gap-2 mx-auto font-['Inter']"
                              >
                                <ArrowLeft className="h-3 w-3" />
                                Modifier l'email
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </>
  );
};