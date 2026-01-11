import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, MapPin, Users, Settings, LogOut, Car, Route, Navigation, Upload, ClipboardList, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Sidebar as SidebarComponent, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar } from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

const PROJECT_NAME = 'e‑Mody';
const PROJECT_SUB = 'Gestion de flotte';

const navItems = [
  { title: 'Tableau de bord', href: '/', icon: LayoutDashboard },
  { title: 'Personnel', href: '/personnel', icon: Users },
  { title: 'Axes', href: '/axes', icon: Route },
  { title: 'Arrêts', href: '/arrets', icon: Navigation },
  { title: 'Trajets', href: '/trajets', icon: MapPin },
  { title: 'Import CSV', href: '/import', icon: Upload },
  { title: 'Assignations', href: '/assignations', icon: ClipboardList },
  { title: 'À propos', href: '/about', icon: Info }
];

export const AppSidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { open } = useSidebar();

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <SidebarComponent
      className="border-sidebar-border bg-sidebar-background text-sidebar-foreground"
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-sidebar-border bg-gradient-to-r from-sidebar-background to-sidebar-accent/20">
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden transform-gpu transition-transform duration-200 hover:scale-105">
            <img
              src="/uploads/293b7155-d554-46f9-9fd1-e9829d9f511f.png"
              alt={`${PROJECT_NAME} Logo`}
              className="h-full w-full object-cover"
            />
          </div>

          {open && (
            <div className="flex flex-col">
              <h1 className="text-base font-bold text-sidebar-primary leading-tight transition-opacity duration-200 opacity-100">
                {PROJECT_NAME}
              </h1>
              <p className="text-[10px] text-sidebar-foreground/70 transition-opacity duration-200 opacity-90 tracking-wide">
                {PROJECT_SUB}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "h-10 rounded-lg transition-all duration-200 hover:bg-sidebar-accent/80",
                        active && "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                      )}
                      tooltip={item.title}
                    >
                      <NavLink
                        to={item.href}
                        aria-label={item.title}
                        className={({ isActive: routeActive }) => cn(
                          "flex items-center gap-3 px-3 py-2 text-sm font-medium transform-gpu transition-transform duration-150",
                          routeActive && "text-primary",
                          open ? 'opacity-100 translate-x-0' : 'opacity-100'
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {open && <span className="truncate">{item.title}</span>}
                        {active && open && (
                          <div className="ml-auto h-2 w-2 bg-primary rounded-full animate-pulse" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border bg-sidebar-accent/20 p-2">
        {user && (
          <div className="space-y-2">
            {/* User Profile */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-sidebar-background border border-sidebar-border hover:scale-[1.01] transition-transform duration-150">
              <Avatar className="h-7 w-7 border-2 border-primary/20">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {getUserInitials(user.name || 'U')}
                </AvatarFallback>
              </Avatar>
              {open && (
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="text-xs font-medium text-sidebar-foreground truncate">
                    {user.name}
                  </div>
                </div>
              )}
            </div>

            {/* Logout Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className={cn(
                "w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive h-8 text-xs transition-colors duration-150",
                !open && "justify-center px-0"
              )}
            >
              <LogOut className="h-3 w-3 flex-shrink-0" />
              {open && <span className="ml-2">Déconnexion</span>}
            </Button>
          </div>
        )}
      </SidebarFooter>
    </SidebarComponent>
  );
};

export const Sidebar: React.FC<{ collapsed: boolean; onToggle: () => void }> = () => {
  return <AppSidebar />;
};
