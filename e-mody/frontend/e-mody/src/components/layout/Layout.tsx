import React from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';

export const Layout: React.FC = () => {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="h-12 w-12 mx-auto rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Chargement en cours</h3>
            <p className="text-sm text-muted-foreground">Initialisation de l'application...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "250px",
          "--sidebar-width-mobile": "250px",
          "--sidebar-width-icon": "73px",
        } as React.CSSProperties
      }
    >
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <SidebarInset className="flex flex-col flex-1">
          {/* Header with Sidebar Trigger */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="flex-1">
              <Header />
            </div>
          </header>
          
          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="container mx-auto p-6 space-y-6">
              <div className="animate-fade-in">
                <Outlet />
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};