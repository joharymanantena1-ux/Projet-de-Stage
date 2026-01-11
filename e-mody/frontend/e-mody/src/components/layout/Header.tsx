import React from 'react';
import { Search, Moon, Sun, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { NotificationsModal } from '@/components/notifications/NotificationsModal';

const getPageTitle = (pathname: string) => {
  switch (pathname) {
    case '/':
      return 'Tableau de bord';
    case '/personnel':
      return 'Gestion du personnel';
    case '/vehicles':
      return 'Gestion des véhicules';
    case '/axes':
      return 'Gestion des axes';
    case '/arrets':
      return 'Gestion des arrêts';
    case '/trajets':
      return 'Trajets & Missions';
    case '/import':
      return 'Importation de données';
    case '/assignations':
      return 'Gestion des assignations';
    case '/about':
      return 'À propos';
    default:
      return 'EntrepriseApp';
  }
};

export const Header: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [darkMode, setDarkMode] = React.useState(false);

  React.useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleTheme = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    document.documentElement.classList.toggle('dark', newDarkMode);
    localStorage.setItem('theme', newDarkMode ? 'dark' : 'light');
  };

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="flex items-center justify-between flex-1 gap-4">
      {/* Page Title and Breadcrumb */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            Bienvenue {user?.name ? user.name.split(' ')[0] : ''}
          </p>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="flex items-center gap-2 flex-1 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher dans l'application..."
            className="pl-10 h-9 bg-secondary/30 border-secondary/50 focus:bg-background focus:border-primary/50 transition-colors"
          />
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 px-3 border-secondary/50 hover:bg-secondary/80"
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1">
        {/* Theme Toggle */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={toggleTheme}
          className="h-9 w-9 p-0 hover:bg-secondary/80"
        >
          {darkMode ? (
            <Sun className="h-4 w-4 text-warning" />
          ) : (
            <Moon className="h-4 w-4 text-primary" />
          )}
        </Button>

        {/* Notifications */}
        <NotificationsModal />
      </div>
    </div>
  );
};