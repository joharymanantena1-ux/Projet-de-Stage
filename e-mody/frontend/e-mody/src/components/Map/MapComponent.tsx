import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface MapComponentProps {
  trajet: {
    id: number;
    employee: string;
    startLocation: string;
    endLocation: string;
    startTime: string;
    endTime?: string;
    distance: number;
    status: string;
    purpose: string;
    coordinates: {
      start: [number, number];
      end: [number, number];
      path?: [number, number][];
    };
  } | null;
}

export const MapComponent: React.FC<MapComponentProps> = ({ trajet }) => {
  const [mapError, setMapError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetMap = () => {
    setMapError(null);
    setIsLoading(true);
    // Simulate loading
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  // Simulate map component - replace with actual map implementation later
  if (mapError) {
    return (
      <Card className="h-96">
        <CardContent className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-warning mx-auto" />
            <div>
              <h3 className="font-medium">Erreur de chargement de la carte</h3>
              <p className="text-sm text-muted-foreground mt-1">{mapError}</p>
            </div>
            <Button onClick={resetMap} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="h-96">
        <CardContent className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Chargement de la carte...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-96">
      <CardContent className="h-full p-4">
        <div className="h-full bg-secondary/30 rounded-lg flex items-center justify-center relative overflow-hidden">
          {/* Simulated map background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-success/10" />
          
          {trajet ? (
            <div className="text-center space-y-3 relative z-10">
              <div className="bg-background/90 backdrop-blur-sm rounded-lg p-4 shadow-lg">
                <h4 className="font-medium text-lg mb-2">Trajet simulé</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">De:</span>
                    <span className="font-medium">{trajet.startLocation}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">À:</span>
                    <span className="font-medium">{trajet.endLocation}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Distance:</span>
                    <span className="font-medium">{trajet.distance} km</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Statut:</span>
                    <span className={`font-medium ${
                      trajet.status === 'terminé' ? 'text-success' :
                      trajet.status === 'en-cours' ? 'text-primary' : 'text-warning'
                    }`}>
                      {trajet.status === 'terminé' ? 'Terminé' :
                       trajet.status === 'en-cours' ? 'En cours' : 'Planifié'}
                    </span>
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground bg-background/80 backdrop-blur-sm rounded px-2 py-1">
                Carte interactive disponible avec Mapbox
              </p>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <p>Sélectionnez un trajet pour voir la carte</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};