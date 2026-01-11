import React, { createContext, useContext, useState, useEffect } from 'react';
import { createApiClient } from '@/lib/apiClient';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'employee' | 'manager' | 'superadmin' | 'user' | 'operator' | 'viewer';
  avatar?: string;
}

interface BackendUser {
  id: number;
  email: string;
  role: string;
  name?: string;
  avatar?: string;
  picture?: string;
  is_active?: boolean;
  last_login?: string;
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
  csrfToken?: string | null;
  checkSession: () => Promise<boolean>;
  sessionLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

function mapRole(backendRole?: string | null): User['role'] {
  if (!backendRole) return 'user';
  const r = backendRole.toLowerCase();
  if (r === 'superadmin') return 'superadmin';
  if (r === 'admin') return 'admin';
  if (r === 'manager') return 'manager';
  if (r === 'operator') return 'operator';
  if (r === 'viewer') return 'viewer';
  return 'user';
}

function mapBackendUserToUser(u: BackendUser): User {
  const email: string = u.email ?? '';
  const nameFromBackend = u.name ?? (email.includes('@') ? email.split('@')[0] : email);
  return {
    id: String(u.id ?? ''),
    name: nameFromBackend,
    email,
    role: mapRole(u.role),
    avatar: u.avatar ?? u.picture ?? undefined,
  };
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Composant ProtectedRoute intégré
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[];
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole = [],
  fallback
}) => {
  const { isAuthenticated, user, loading, checkSession, sessionLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      if (!isAuthenticated) {
        const hasValidSession = await checkSession();
        if (!hasValidSession) {
          setIsChecking(false);
        } else {
          setIsChecking(false);
        }
      } else {
        setIsChecking(false);
      }
    };

    verifySession();
  }, [isAuthenticated, checkSession]);

  // Vérification des rôles
  const hasRequiredRole = requiredRole.length === 0 || 
    (user && requiredRole.includes(user.role));

  if (loading || sessionLoading || isChecking) {
    return fallback ? <>{fallback}</> : (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <span className="text-sm text-muted-foreground">Vérification de la session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirection vers la page d'authentification
    window.location.href = '/auth';
    return null;
  }

  if (!hasRequiredRole) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-lg">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-600 mb-2">Accès refusé</h1>
          <p className="text-gray-600 mb-4">
            Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            <br />
            <span className="text-sm">Rôle requis: {requiredRole.join(', ')}</span>
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Hook pour la redirection automatique
export const useAuthRedirect = () => {
  const { isAuthenticated, loading, checkSession } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (!isAuthenticated) {
        const hasSession = await checkSession();
        if (!hasSession && window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        } else {
          setChecking(false);
        }
      } else {
        setChecking(false);
      }
    };

    // Ne vérifier que si on n'est pas déjà sur /auth
    if (window.location.pathname !== '/auth') {
      checkAuth();
    } else {
      setChecking(false);
    }
  }, [isAuthenticated, checkSession]);

  return { checking: checking || loading };
};

// Hook pour vérifier l'accès admin
export const useAdminAccess = () => {
  const { user, isAuthenticated } = useAuth();
  
  const isAdmin = isAuthenticated && user && ['admin', 'superadmin'].includes(user.role);
  const isSuperAdmin = isAuthenticated && user && user.role === 'superadmin';
  
  return {
    isAdmin,
    isSuperAdmin,
    hasAccess: (requiredRole: string) => {
      if (!isAuthenticated || !user) return false;
      const roleHierarchy = ['viewer', 'user', 'operator', 'manager', 'admin', 'superadmin'];
      const userLevel = roleHierarchy.indexOf(user.role);
      const requiredLevel = roleHierarchy.indexOf(requiredRole);
      return userLevel >= requiredLevel;
    }
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [sessionLoading, setSessionLoading] = useState<boolean>(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('csrf_token');
    } catch {
      return null;
    }
  });

  /**
   * Helper: create client and attach CSRF token from localStorage if present
   */
  function makeApiWithCsrf() {
    const api = createApiClient();
    const token = localStorage.getItem('csrf_token');
    if (token) {
      // set header on this instance
      (api.defaults as any).headers = (api.defaults as any).headers || {};
      (api.defaults as any).headers['X-CSRF-Token'] = token;
    }
    return api;
  }

  // Configuration de l'intercepteur Axios global pour les erreurs 401
  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Session expirée - déconnecter l'utilisateur
          await clearAuthData();
          if (window.location.pathname !== '/auth') {
            window.location.href = '/auth';
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  // Vérification de session au chargement
  useEffect(() => {
    checkSessionOnLoad();
  }, []);

  // Timeout de session automatique (45 minutes comme backend)
  useEffect(() => {
    if (!user) return;

    const timeout = setTimeout(() => {
      console.log('Session expirée - déconnexion automatique');
      logout();
    }, 45 * 60 * 1000); // 45 minutes

    return () => clearTimeout(timeout);
  }, [user]);

  const checkSessionOnLoad = async () => {
    const token = localStorage.getItem('csrf_token');
    const storedUser = localStorage.getItem('user');
    
    if (!token || !storedUser) {
      setLoading(false);
      return;
    }

    try {
      setSessionLoading(true);
      const api = makeApiWithCsrf();
      const response = await api.get<BackendUser>('/users/me', { withCredentials: true });
      
      if (response.data && response.data.id) {
        // Session valide
        const mappedUser = mapBackendUserToUser(response.data);
        setUser(mappedUser);
        try { 
          localStorage.setItem('user', JSON.stringify(mappedUser)); 
        } catch {}
      } else {
        // Session invalide
        await clearAuthData();
      }
    } catch (error: any) {
      // Session expirée ou invalide
      if (error.response?.status === 401) {
        await clearAuthData();
      }
    } finally {
      setLoading(false);
      setSessionLoading(false);
    }
  };

  const checkSession = async (): Promise<boolean> => {
    const token = localStorage.getItem('csrf_token');
    const storedUser = localStorage.getItem('user');
    
    if (!token || !storedUser) {
      return false;
    }

    try {
      setSessionLoading(true);
      const api = makeApiWithCsrf();
      const response = await api.get<BackendUser>('/users/me', { withCredentials: true });
      return !!(response.data && response.data.id);
    } catch (error: any) {
      if (error.response?.status === 401) {
        await clearAuthData();
      }
      return false;
    } finally {
      setSessionLoading(false);
    }
  };

  const clearAuthData = async () => {
    setUser(null);
    setCsrfToken(null);
    try { 
      localStorage.removeItem('user'); 
      localStorage.removeItem('csrf_token'); 
    } catch {}
  };

  interface LoginResponse {
    ok: boolean;
    csrf_token?: string;
    user?: BackendUser;
    message?: string;
  }

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    const api = createApiClient(); // fresh instance
    try {
      const resp = await api.post<LoginResponse>(
        '/users/login',
        { email, password },
        { withCredentials: true }
      );
      if (resp && resp.data && resp.data.ok) {
        // backend returns csrf_token and user
        const token: string | undefined = resp.data.csrf_token;
        const backendUser = resp.data.user;
        if (token) {
          try {
            localStorage.setItem('csrf_token', token);
          } catch {}
          setCsrfToken(token);
          (api.defaults as any).headers = (api.defaults as any).headers || {};
          (api.defaults as any).headers['X-CSRF-Token'] = token;
        }

        if (backendUser) {
          const mapped = mapBackendUserToUser(backendUser);
          setUser(mapped);
          try { localStorage.setItem('user', JSON.stringify(mapped)); } catch {}
        } else {
          setUser(null);
          try { localStorage.removeItem('user'); } catch {}
        }

        setLoading(false);
        return true;
      } else {
        setLoading(false);
        return false;
      }
    } catch (err) {
      setLoading(false);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    const api = makeApiWithCsrf();
    try {
      await api.post('/users/logout', {}, { withCredentials: true });
    } catch {
      // ignore network errors, clear local anyway
    } finally {
      await clearAuthData();
      setLoading(false);
      window.location.href = '/auth';
    }
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    loading,
    csrfToken,
    checkSession,
    sessionLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};