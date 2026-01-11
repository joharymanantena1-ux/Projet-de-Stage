import React, { lazy, Suspense, LazyExoticComponent } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute, useAuthRedirect } from "@/contexts/AuthContext";
import HistoriqueSuivi from "@/pages/HistoriqueSuivi";

function lazyNamed<T extends React.ComponentType<any>>(
  importFn: () => Promise<any>,
  exportName: string
): LazyExoticComponent<T> {
  return lazy(() =>
    importFn().then((mod) => {
      const component = exportName === "default" ? mod.default : mod[exportName];
      if (!component) {
        throw new Error(
          `Le module n'exporte pas "${exportName}". Vérifie si c'est un export nommé ou default.`
        );
      }
      return { default: component };
    })
  ) as LazyExoticComponent<T>;
}

const Layout = lazyNamed(() => import("@/components/layout/Layout"), "Layout");
const AuthPage = lazyNamed(() => import("@/pages/AuthPage"), "AuthPage");
const Dashboard = lazyNamed(() => import("@/pages/Dashboard"), "Dashboard");
const AboutPage = lazyNamed(() => import("@/pages/AboutPage"), "AboutPage");
const TrajetsPage = lazyNamed(() => import("@/pages/TrajetsPage"), "TrajetsPage");
const PersonnelPage = lazyNamed(() => import("@/pages/PersonnelPage"), "PersonnelPage");
const AxesPage = lazyNamed(() => import("@/pages/AxesPage"), "AxesPage");
const ArretsPage = lazyNamed(() => import("@/pages/ArretsPage"), "ArretsPage");
const ImportPage = lazy(() => import("@/pages/ImportPage")) as LazyExoticComponent<React.ComponentType<any>>;
const AssignationPage = lazyNamed(() => import("@/pages/AssignationPage"), "AssignationPage");
const ForgotPasswordPage = lazyNamed(() => import("@/pages/ForgotPasswordPage"), "ForgotPasswordPage");
const NotFound = lazyNamed(() => import("@/pages/NotFound"), "NotFound");

const queryClient = new QueryClient();

const AppContent: React.FC = () => {
  useAuthRedirect();
  
  return (
    <Routes>
      {/* Routes publiques */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      
      {/* Routes protégées */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="assignations" element={<AssignationPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="trajets" element={<TrajetsPage />} />
        
        {/* Routes réservées aux admins et superadmins */}
        <Route 
          path="personnel" 
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <PersonnelPage />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="axes" 
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <AxesPage />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="arrets" 
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <ArretsPage />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="import" 
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <ImportPage />
            </ProtectedRoute>
          } 
        />
        
        <Route
          path="settings"
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <div className="p-8 text-center text-muted-foreground">Page Paramètres - En développement</div>
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const Fallback = () => (
  <div className="w-full h-screen flex items-center justify-center">
    <div className="flex flex-col items-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
      <span className="text-lg">Chargement de l'application...</span>
    </div>
  </div>
);

// Composant de chargement pour les routes protégées
const AuthFallback = () => (
  <div className="w-full h-screen flex items-center justify-center">
    <div className="flex flex-col items-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
      <span className="text-sm text-muted-foreground">Vérification de la session...</span>
    </div>
  </div>
);

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<Fallback />}>
            <AppContent />
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;