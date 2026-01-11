import React, { useState } from 'react';
import { Bell, Check, X, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'warning',
    title: 'Trajet retardé',
    message: 'Le trajet TJ001 vers Casablanca a un retard de 15 minutes',
    time: 'Il y a 5 min',
    read: false
  },
  {
    id: '2',
    type: 'info',
    title: 'Nouveau véhicule ajouté',
    message: 'Le véhicule VH-2024-005 a été ajouté à la flotte',
    time: 'Il y a 1h',
    read: false
  },
  {
    id: '3',
    type: 'success',
    title: 'Trajet terminé',
    message: 'Le trajet TJ002 vers Rabat s\'est terminé avec succès',
    time: 'Il y a 2h',
    read: false
  },
  {
    id: '4',
    type: 'error',
    title: 'Problème technique',
    message: 'Panne signalée sur le véhicule VH-2024-002',
    time: 'Il y a 3h',
    read: true
  },
  {
    id: '5',
    type: 'info',
    title: 'Rapport mensuel disponible',
    message: 'Le rapport mensuel des trajets est maintenant disponible',
    time: 'Il y a 1 jour',
    read: true
  }
];

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-warning" />;
    case 'error':
      return <X className="h-4 w-4 text-destructive" />;
    case 'success':
      return <CheckCircle className="h-4 w-4 text-success" />;
    default:
      return <Info className="h-4 w-4 text-info" />;
  }
};

export const NotificationsModal: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(notif => ({ ...notif, read: true }))
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="relative h-9 w-9 p-0 hover:bg-secondary/80"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center animate-pulse"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[500px] p-0 z-[2000]" align="end" sideOffset={5}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4" />
              Notifications
            </h3>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={markAllAsRead}
                className="text-xs h-auto p-1 hover:bg-secondary/80"
              >
                Tout marquer comme lu
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="h-[350px]">
          <div className="p-2 space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "p-3 rounded-lg border transition-colors cursor-pointer hover:bg-secondary/50",
                  notification.read 
                    ? "bg-muted/20 border-border/30" 
                    : "bg-card border-primary/20 shadow-sm"
                )}
                onClick={() => markAsRead(notification.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-sm font-medium",
                        notification.read ? "text-muted-foreground" : "text-foreground"
                      )}>
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <div className="h-2 w-2 rounded-full bg-primary"></div>
                      )}
                    </div>
                    <p className={cn(
                      "text-xs leading-relaxed",
                      notification.read ? "text-muted-foreground/70" : "text-muted-foreground"
                    )}>
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      {notification.time}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {notifications.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Aucune notification</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};