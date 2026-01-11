// File: src/components/ArretMap.tsx
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

// Configuration des icônes Leaflet par défaut
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Arret {
  id: number;
  nom_arret: string;
  latitude: number;
  longitude: number;
  axe_nom?: string;
  id_axe?: number;
  ordre?: number;
}

interface Personnel {
  id: number;
  nom: string;
  prenom: string;
  poste: string;
  fonction?: string;
}

interface Assignment {
  id: number;
  id_arret: number;
  id_personnel: number;
}

interface ArretMapProps {
  arrets: Arret[];
  selectedArret?: Arret | null;
  onArretSelect?: React.Dispatch<React.SetStateAction<Arret | null>>;
  axes?: Array<{ id: number; nom_axe: string }>;
  onArretCreate?: (arret: Omit<Arret, 'id'> & { nom_employe: string }) => void;
  onPersonnelAssign?: (arretId: number, personnelId: number) => void;
  personnelList?: Personnel[];
  assignments?: Assignment[];
}

const injectStyles = () => {
  const id = 'arret-map-ui-styles';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.innerHTML = `
    .leaflet-container { background: #f8fafc; border-radius: 1rem; }

    .leaflet-popup-content-wrapper {
      border-radius: 0.75rem;
      box-shadow: 0 12px 30px rgba(2,6,23,0.14);
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      font-size: 14px;
      color: #0f172a;
    }

    .arret-info-box {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 1200;
      background: rgba(255,255,255,0.98);
      padding: 12px 16px;
      border-radius: 0.75rem;
      box-shadow: 0 10px 28px rgba(2,6,23,0.12);
      border: 1px solid rgba(2,6,23,0.06);
      min-width: 240px;
      display: none;
      font-size: 13px;
    }

    .arret-info-box h4 { margin:0 0 6px 0; font-weight:700; font-size:15px; }
    .arret-info-box p { margin:0; color:#475569; font-size:13px; }

    .map-click-indicator {
      position: absolute;
      width: 20px;
      height: 20px;
      background: #3b82f6;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
      z-index: 1000;
      pointer-events: none;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.7; }
      100% { transform: scale(1); opacity: 1; }
    }

    .assignment-popup {
      min-width: 220px;
    }
    .assignment-popup button {
      width: 100%;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(s);
};

const ArretMap: React.FC<ArretMapProps> = ({ 
  arrets, 
  selectedArret, 
  onArretSelect, 
  axes = [],
  onArretCreate,
  onPersonnelAssign,
  personnelList = [],
  assignments = []
}) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Array<{ marker: L.Marker; id: number }>>([]);
  const infoBoxRef = useRef<HTMLDivElement | null>(null);
  const clickIndicatorRef = useRef<HTMLDivElement | null>(null);

  // États pour les modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [clickedPosition, setClickedPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedArretForAssign, setSelectedArretForAssign] = useState<Arret | null>(null);
  const [formData, setFormData] = useState({
    nom_arret: '',
    id_axe: '',
    ordre: '',
    nom_employe: ''
  });
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => injectStyles(), []);

  // Fonction utilitaire pour récupérer le personnel assigné à un arrêt
  const getAssignedPersonnel = (arretId: number): Personnel | null => {
    const assignment = assignments.find(a => a.id_arret === arretId);
    if (assignment) {
      return personnelList.find(p => p.id === assignment.id_personnel) || null;
    }
    return null;
  };

  useEffect(() => {
    if (!mapRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([-18.8792, 47.5079], 12);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

    const infoBox = document.createElement('div');
    infoBox.className = 'arret-info-box';
    map.getContainer().appendChild(infoBox);
    infoBoxRef.current = infoBox;

    // Créer l'indicateur de clic
    const clickIndicator = document.createElement('div');
    clickIndicator.className = 'map-click-indicator';
    clickIndicator.style.display = 'none';
    map.getContainer().appendChild(clickIndicator);
    clickIndicatorRef.current = clickIndicator;

    // Gestionnaire de clic sur la carte
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      
      // Afficher l'indicateur de clic
      if (clickIndicatorRef.current) {
        const point = map.latLngToContainerPoint(e.latlng);
        clickIndicatorRef.current.style.left = (point.x - 10) + 'px';
        clickIndicatorRef.current.style.top = (point.y - 10) + 'px';
        clickIndicatorRef.current.style.display = 'block';
        
        // Masquer après l'animation
        setTimeout(() => {
          if (clickIndicatorRef.current) {
            clickIndicatorRef.current.style.display = 'none';
          }
        }, 1500);
      }

      // Vérifier si on a cliqué sur un marqueur existant
      const clickedOnMarker = markersRef.current.some(({ marker }) => {
        const markerPos = marker.getLatLng();
        return markerPos.distanceTo(e.latlng) < 20; // Tolérance de 20m
      });

      if (!clickedOnMarker) {
        // Clic sur carte vide - proposer création
        setClickedPosition({ lat, lng });
        setFormData({
          nom_arret: '',
          id_axe: axes.length > 0 ? String(axes[0].id) : '',
          ordre: '1',
          nom_employe: personnelList.length > 0 ? String(personnelList[0].id) : ''
        });
        setShowCreateModal(true);
      }
    });

    return () => {
      if (infoBoxRef.current && map) {
        try { map.getContainer().removeChild(infoBoxRef.current); } catch {}
        infoBoxRef.current = null;
      }
      if (clickIndicatorRef.current && map) {
        try { map.getContainer().removeChild(clickIndicatorRef.current); } catch {}
        clickIndicatorRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [axes, personnelList]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    arrets.forEach(arret => {
      if (arret.latitude == null || arret.longitude == null) return;
      
      const marker = L.marker([arret.latitude, arret.longitude]).addTo(map);
      
      const assignedPersonnel = getAssignedPersonnel(arret.id);
      
      // Popup avec informations et bouton d'assignation
      const popupContent = `
        <div class="assignment-popup" style="min-width: 220px; padding: 8px;">
          <h4 style="margin: 0 0 8px 0; font-weight: 600;">${arret.nom_arret}</h4>
          <p style="margin: 0 0 8px 0; color: #666;">${arret.axe_nom || 'Aucun axe'}</p>
          ${assignedPersonnel ? `
            <div style="background: #f0fdf4; padding: 6px; border-radius: 4px; margin-bottom: 8px;">
              <strong>Personnel assigné:</strong><br>
              ${assignedPersonnel.prenom} ${assignedPersonnel.nom}<br>
              <small>${assignedPersonnel.fonction || assignedPersonnel.poste}</small>
            </div>
          ` : ''}
          <button 
            onclick="window.dispatchEvent(new CustomEvent('assignPersonnel', { detail: ${arret.id} }))"
            style="width: 100%; padding: 8px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;"
          >
            ${assignedPersonnel ? '🔁 Changer personnel' : '📋 Assigner personnel'}
          </button>
        </div>
      `;
      
      marker.bindPopup(popupContent);
      
      marker.on('click', () => {
        onArretSelect?.(arret);
      });

      markersRef.current.push({ marker, id: arret.id });
    });

    // Écouter l'événement d'assignation depuis les popups
    const handleAssignPersonnel = (event: CustomEvent) => {
      const arretId = event.detail;
      const arret = arrets.find(a => a.id === arretId);
      if (arret) {
        setSelectedArretForAssign(arret);
        setFormData(prev => ({
          ...prev,
          nom_employe: personnelList.length > 0 ? String(personnelList[0].id) : ''
        }));
        setShowAssignModal(true);
      }
    };

    // @ts-ignore
    window.addEventListener('assignPersonnel', handleAssignPersonnel);

    if (markersRef.current.length > 0) {
      const group = new L.FeatureGroup(markersRef.current.map(m => m.marker));
      try { map.fitBounds(group.getBounds().pad(0.12)); } catch {}
    }

    return () => {
      // @ts-ignore
      window.removeEventListener('assignPersonnel', handleAssignPersonnel);
    };
  }, [arrets, onArretSelect, personnelList, assignments]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedArret) {
      const selectedMarker = markersRef.current.find(m => m.id === selectedArret.id);
      if (selectedMarker) {
        map.setView(selectedMarker.marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
        selectedMarker.marker.openPopup();
      }
    }

    const infoBox = infoBoxRef.current;
    if (!infoBox) return;
    if (!selectedArret) {
      infoBox.style.display = 'none';
      infoBox.innerHTML = '';
    } else {
      const assignedPersonnel = getAssignedPersonnel(selectedArret.id);
      infoBox.style.display = 'block';
      infoBox.innerHTML = `
        <h4>${selectedArret.nom_arret}</h4>
        <p>${selectedArret.axe_nom ?? 'Aucun axe'}</p>
        ${assignedPersonnel ? `
          <div style="margin-top:6px;padding:4px;background:#f0fdf4;border-radius:4px;">
            <strong>${assignedPersonnel.prenom} ${assignedPersonnel.nom}</strong><br>
            <small>${assignedPersonnel.fonction || assignedPersonnel.poste}</small>
          </div>
        ` : ''}
        <p style="margin-top:6px;font-size:12px;color:#64748b;">
          Lat: ${selectedArret.latitude.toFixed(5)} · Lng: ${selectedArret.longitude.toFixed(5)}
        </p>
      `;
    }
  }, [selectedArret, arrets, assignments, personnelList]);

  const handleCreateArret = async () => {
    if (!clickedPosition || !formData.nom_arret || !formData.id_axe) return;

    try {
      setCreating(true);
      const newArret = {
        nom_arret: formData.nom_arret,
        latitude: clickedPosition.lat,
        longitude: clickedPosition.lng,
        id_axe: parseInt(formData.id_axe),
        ordre: parseInt(formData.ordre || '1'),
        nom_employe: formData.nom_employe
      };

      await onArretCreate?.(newArret);
      setShowCreateModal(false);
      setClickedPosition(null);
    } catch (error) {
      console.error('Erreur lors de la création:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleAssignPersonnel = async () => {
    if (!selectedArretForAssign || !formData.nom_employe) return;

    try {
      setAssigning(true);
      await onPersonnelAssign?.(selectedArretForAssign.id, parseInt(formData.nom_employe));
      setShowAssignModal(false);
      setSelectedArretForAssign(null);
    } catch (error) {
      console.error('Erreur lors de l\'assignation:', error);
    } finally {
      setAssigning(false);
    }
  };

  const getNextOrdre = (axeId: string) => {
    const id = parseInt(axeId);
    if (!id || Number.isNaN(id)) return 1;
    const max = Math.max(...arrets.filter(a => a.id_axe === id).map(a => a.ordre || 0), 0);
    return max + 1;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Carte des arrêts</h3>
        <div className="text-sm text-muted-foreground">
          {arrets.length} arrêt(s) • Cliquez sur la carte pour créer un arrêt
        </div>
      </div>
      <div
        ref={mapRef}
        className="w-full h-[550px] rounded-xl border border-border shadow-sm relative"
        style={{ minHeight: 520 }}
      />

      {/* Modal de création d'arrêt */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer un nouvel arrêt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="create_nom_arret">Nom de l'arrêt *</Label>
              <Input
                id="create_nom_arret"
                value={formData.nom_arret}
                onChange={(e) => setFormData(prev => ({ ...prev, nom_arret: e.target.value }))}
                placeholder="Ex: Arrêt Centre Ville"
              />
            </div>

            <div>
              <Label htmlFor="create_id_axe">Axe *</Label>
              <select
                id="create_id_axe"
                value={formData.id_axe}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData(prev => ({ 
                    ...prev, 
                    id_axe: val, 
                    ordre: String(getNextOrdre(val))
                  }));
                }}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Sélectionner un axe</option>
                {axes.map(ax => (
                  <option key={ax.id} value={String(ax.id)}>{ax.nom_axe}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="create_ordre">Ordre sur l'axe *</Label>
              <Input
                id="create_ordre"
                type="number"
                min={1}
                value={formData.ordre}
                onChange={(e) => setFormData(prev => ({ ...prev, ordre: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="create_employe">Assigner un employé (optionnel)</Label>
              <select
                id="create_employe"
                value={formData.nom_employe}
                onChange={(e) => setFormData(prev => ({ ...prev, nom_employe: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Sélectionner un employé</option>
                {personnelList.map(emp => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.prenom} {emp.nom} - {emp.fonction || emp.poste}
                  </option>
                ))}
              </select>
            </div>

            {clickedPosition && (
              <div className="text-sm text-muted-foreground p-2 bg-muted rounded">
                Position: {clickedPosition.lat.toFixed(5)}, {clickedPosition.lng.toFixed(5)}
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreateArret} disabled={!formData.nom_arret || !formData.id_axe || creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer l\'arrêt'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal d'assignation de personnel */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assigner du personnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedArretForAssign && (
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-semibold">{selectedArretForAssign.nom_arret}</h4>
                <p className="text-sm text-muted-foreground">
                  {selectedArretForAssign.axe_nom} • Ordre {selectedArretForAssign.ordre}
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="assign_employe">Sélectionner un employé *</Label>
              <select
                id="assign_employe"
                value={formData.nom_employe}
                onChange={(e) => setFormData(prev => ({ ...prev, nom_employe: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Sélectionner un employé</option>
                {personnelList.map(emp => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.prenom} {emp.nom} - {emp.fonction || emp.poste}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowAssignModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleAssignPersonnel} disabled={!formData.nom_employe || assigning}>
                {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assigner'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArretMap;
