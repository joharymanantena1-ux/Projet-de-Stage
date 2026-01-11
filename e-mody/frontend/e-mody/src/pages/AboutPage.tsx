import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Info, Globe, Save, Code, Database, Users } from 'lucide-react';

export const AboutPage: React.FC = () => {

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">À propos</h1>
          <p className="text-muted-foreground mt-1">
            Informations sur le système Konecta
          </p>
        </div>
      </div>

      {/* Project Information Card - Movie Credits Style */}
      <Card className="bg-gradient-to-br from-card to-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Informations du projet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Title */}
          <div className="text-center space-y-2 py-4">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              e-Mody
            </h2>
            <p className="text-xl text-muted-foreground italic">
              Système de Gestion de Transport
            </p>
          </div>

          <Separator />

          {/* Credits */}
          <div className="space-y-6">
            {/* Creator */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground uppercase tracking-wider">
                Créé par
              </p>
              <p className="text-2xl font-semibold">
                Johary Manantena - Developpeur Web Fullstack Junior
              </p>
            </div>

            <Separator className="my-4" />

            {/* Organization */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground uppercase tracking-wider">
                Projet de stage
              </p>
              <div className="flex items-center gap-2">
                <img 
                  src="uploads/293b7155-d554-46f9-9fd1-e9829d9f511f.png" 
                  alt="Konecta Logo" 
                  className="h-8 w-8 object-cover rounded"
                />
                <p className="text-2xl font-semibold">
                  KONECTA Madagascar
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Technical Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Code className="w-4 h-4" />
                  <p className="text-sm uppercase tracking-wider">Version du système</p>
                </div>
                <p className="text-xl font-semibold">v1.0.0</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="w-4 h-4" />
                  <p className="text-sm uppercase tracking-wider">Base de données</p>
                </div>
                <p className="text-xl font-semibold">Mysql 9.1.0</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <p className="text-sm uppercase tracking-wider">Utilisateurs actifs</p>
                </div>
                <p className="text-xl font-semibold">4</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="w-4 h-4" />
                  <p className="text-sm uppercase tracking-wider">Date de mise à jour</p>
                </div>
                <p className="text-xl font-semibold">15/01/2025</p>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Footer */}
            <div className="text-center pt-4">
              <p className="text-sm text-muted-foreground italic">
                © 2025 Konecta - Tous droits réservés
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Développé avec React, TypeScript et Tailwind CSS
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
