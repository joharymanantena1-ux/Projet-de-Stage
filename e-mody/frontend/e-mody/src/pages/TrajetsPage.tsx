
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import TrajetMap from '@/components/Map/TrajetMap';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Route, Clock, Fuel, Car, Play, Square, Navigation, Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import ApiConfig from '@/lib/ApiConfig';
import { RefreshCw } from 'lucide-react';

const API_BASE = ApiConfig.getBaseUrl();
const ITEMS_PER_PAGE = 3;

interface Trajet {
  id: number;
  employee: string;
  startLocation: string;
  endLocation: string;
  startTime: string;
  endTime?: string;
  distance?: number | null;
  status: string;
  purpose?: string;
  coordinates: {
    start: (number | null)[];
    end: (number | null)[];
    path?: (number | null)[][];
  };
}

interface Personnel {
  id: number;
  nom: string;
  prenom: string;
}

interface Arret {
  id: number;
  nom_arret?: string;
  latitude?: number;
  longitude?: number;
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Format datetime-local (YYYY-MM-DDTHH:MM) -> "YYYY-MM-DD HH:MM:SS" */
const fmtDatetimeLocalToMysql = (dtLocal: string | null) => {
  if (!dtLocal) return null;
  // dtLocal like "2025-09-24T09:00"
  const parts = dtLocal.split('T');
  if (parts.length !== 2) return null;
  return `${parts[0]} ${parts[1].length === 5 ? parts[1] + ':00' : parts[1]}`;
};

export const TrajetsPage: React.FC = () => {
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [selectedTrajet, setSelectedTrajet] = useState<Trajet | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewTrajetOpen, setIsNewTrajetOpen] = useState(false);
  const [realDistances, setRealDistances] = useState<Record<number, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    message: string;
    results?: any;
  } | null>(null);

  // For dropdown data
  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // Form state
  const [form, setForm] = useState({
    employee_id: '' as string | number,
    start_arret_id: '' as string | number,
    end_arret_id: '' as string | number,
    start_time: '' as string, // datetime-local string "YYYY-MM-DDTHH:MM"
    end_time: '' as string,
    purpose: '',
    status: 'planned'
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Utils for distance map (kept minimal)
  function haversineKm(a: [number, number], b: [number, number]): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const lat1 = a[0], lon1 = a[1], lat2 = b[0], lon2 = b[1];
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const sLat1 = toRad(lat1);
    const sLat2 = toRad(lat2);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const aVal = sinDLat * sinDLat + Math.cos(sLat1) * Math.cos(sLat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    return R * c;
  }

  // Fetch trajets and dropdown lists
  const fetchTrajets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/trajets?limit=10&offset=0`, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`API /trajets ${res.status}: ${txt || res.statusText}`);
      }
      const json = await res.json();
      const data: Trajet[] = (json.data || []).map((d: any) => ({
        id: Number(d.id),
        employee: d.employee || `${d.employee_nom ?? ''} ${d.employee_prenom ?? ''}`.trim(),
        startLocation: d.startLocation || d.start_arret_name || d.start_address || '',
        endLocation: d.endLocation || d.end_arret_name || d.end_address || '',
        startTime: d.startTime || d.start_time || '',
        endTime: d.endTime || d.end_time || '',
        distance: typeof d.distance === 'number' ? d.distance : (d.distance_km ?? null),
        status: d.status || '',
        purpose: d.purpose || '',
        coordinates: d.coordinates || { start: [0,0], end: [0,0], path: [] }
      }));
      setTrajets(data);
      setSelectedTrajet(data[0] || null);
      // precompute distances locally (for dashboard)
      data.forEach((t, i) => {
        setTimeout(() => {
          // if path exists use it, else haversine start->end, else fallback to provided distance
          const path = (t.coordinates?.path ?? []) as any[];
          let computed: number | null = null;
          if (Array.isArray(path) && path.length > 1) {
            // compute polyline distance
            let s = 0;
            for (let k = 1; k < path.length; k++) {
              const aLat = Number(path[k-1][0]), aLng = Number(path[k-1][1]);
              const bLat = Number(path[k][0]), bLng = Number(path[k][1]);
              if (!isNaN(aLat) && !isNaN(aLng) && !isNaN(bLat) && !isNaN(bLng)) {
                s += haversineKm([aLat, aLng], [bLat, bLng]);
              }
            }
            computed = s;
          } else {
            const s = t.coordinates?.start ?? [];
            const e = t.coordinates?.end ?? [];
            if (s && e && s.length >= 2 && e.length >= 2 && s[0] !== null && e[0] !== null) {
              const aLat = Number(s[0]), aLng = Number(s[1]), bLat = Number(e[0]), bLng = Number(e[1]);
              if (!isNaN(aLat) && !isNaN(aLng) && !isNaN(bLat) && !isNaN(bLng)) computed = haversineKm([aLat, aLng], [bLat, bLng]);
            }
          }
          if (computed !== null) setRealDistances(prev => ({ ...prev, [t.id]: computed }));
          else if (typeof t.distance === 'number') setRealDistances(prev => ({ ...prev, [t.id]: t.distance! }));
        }, i * 80);
      });
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };


  // Ajoutez cette fonction avec les autres fonctions
  const migrateOsrmData = async () => {
    setMigrating(true);
    setMigrationResult(null);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/trajets/migrate-osrm`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json' 
        },
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || `Erreur migration: ${res.status}`);
      }
      
      setMigrationResult({
        success: true,
        message: data.message || 'Migration OSRM réussie!',
        results: data.results
      });
      
      // Recharger les trajets après migration
      await fetchTrajets();
      
    } catch (err: any) {
      setMigrationResult({
        success: false,
        message: err.message || 'Erreur lors de la migration OSRM'
      });
    } finally {
      setMigrating(false);
    }
  };

  const fetchLists = async () => {
    setLoadingLists(true);
    try {
      const [pRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/personnels`, { headers: { Accept: 'application/json' } }),
        fetch(`${API_BASE}/arrets`, { headers: { Accept: 'application/json' } })
      ]);
      if (!pRes.ok) throw new Error('Impossible de charger la liste des employés');
      if (!aRes.ok) throw new Error('Impossible de charger la liste des arrêts');
      const pJson = await pRes.json();
      const aJson = await aRes.json();
      // Adapt selon ton format API - j'assume { data: [...] } ou bien un tableau direct
      const pData = Array.isArray(pJson.data) ? pJson.data : (Array.isArray(pJson) ? pJson : []);
      const aData = Array.isArray(aJson.data) ? aJson.data : (Array.isArray(aJson) ? aJson : []);
      setPersonnels(pData.map((r: any) => ({ id: Number(r.id), nom: r.nom ?? '', prenom: r.prenom ?? '' })));
      setArrets(aData.map((r: any) => ({ id: Number(r.id), nom_arret: r.nom_arret ?? r.nom ?? r.name, latitude: r.latitude ?? r.lat, longitude: r.longitude ?? r.lng })));
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    fetchTrajets();
    fetchLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pagination + filtering
  const filteredTrajets = trajets.filter(trajet =>
    trajet.employee.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trajet.startLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trajet.endLocation.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = filteredTrajets.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.max(1, Math.ceil(filteredTrajets.length / ITEMS_PER_PAGE));

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  useEffect(() => {
    if (!currentItems.some(t => t.id === selectedTrajet?.id)) {
      setSelectedTrajet(currentItems[0] || null);
    }
  }, [currentPage, searchTerm, trajets]);

  const handleDistanceCalculate = (trajetId: number, distance: number) => {
    setRealDistances(prev => ({ ...prev, [trajetId]: distance }));
  };

  // Form handlers
  const onFormChange = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFormErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validateForm = () => {
    const errs: Record<string,string> = {};
    if (!form.employee_id) errs.employee_id = 'Employé requis';
    if (!form.start_arret_id) errs.start_arret_id = 'Arrêt de départ requis';
    if (!form.end_arret_id) errs.end_arret_id = 'Arrêt d\'arrivée requis';
    if (!form.start_time) errs.start_time = 'Heure de départ requise';
    // optional end_time
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    setSuccessMsg(null);
    try {
      const payload: any = {
        employee_id: Number(form.employee_id),
        start_arret_id: Number(form.start_arret_id),
        end_arret_id: Number(form.end_arret_id),
        start_time: fmtDatetimeLocalToMysql(form.start_time),
        end_time: fmtDatetimeLocalToMysql(form.end_time) || null,
        purpose: form.purpose || null,
        status: form.status || 'planned'
      };
      const res = await fetch(`${API_BASE}/trajets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      const txt = await res.text();
      let json;
      try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
      if (!res.ok) {
        const err = (json && (json.error || json.message)) || res.statusText || txt || 'Erreur création trajet';
        throw new Error(String(err));
      }
      // success
      setSuccessMsg('Trajet créé avec succès');
      setIsNewTrajetOpen(false);
      // reset form
      setForm({
        employee_id: '',
        start_arret_id: '',
        end_arret_id: '',
        start_time: '',
        end_time: '',
        purpose: '',
        status: 'planned'
      });
      // refresh list
      await fetchTrajets();
    } catch (err: any) {
      console.error('Create error', err);
      setFormErrors(prev => ({ ...prev, submit: err.message || 'Erreur' }));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'terminé': return 'default';
      case 'en-cours': return 'default';
      case 'planned':
      case 'planifié': return 'secondary';
      default: return 'secondary';
    }
  };
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Terminé';
      case 'terminé': return 'Terminé';
      case 'en-cours': return 'En cours';
      case 'planned': return 'Planifié';
      case 'planifié': return 'Planifié';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Suivi des Trajets</h1>
        <p className="text-muted-foreground">Gérez et suivez les déplacements de votre équipe</p>
        {successMsg && <div className="text-sm text-green-600 mt-1">{successMsg}</div>}
        {migrationResult && (
          <div className={`text-sm mt-1 flex items-center gap-1 ${
            migrationResult.success ? 'text-green-600' : 'text-red-600'
          }`}>
            {migrationResult.success ? '' : ''} {migrationResult.message}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Bouton Migration OSRM */}
        <Button 
          onClick={migrateOsrmData}
          disabled={migrating}
          variant="outline"
          className="flex items-center gap-2 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800"
        >
          <RefreshCw className={`h-4 w-4 ${migrating ? 'animate-spin' : ''}`} />
          {migrating ? 'Migration...' : 'Actualiser'}
        </Button>

        <Dialog open={isNewTrajetOpen} onOpenChange={(open) => { setIsNewTrajetOpen(open); setFormErrors({}); }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg">
              <Plus className="h-4 w-4" />
              Nouveau trajet
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-lg w-[95vw] md:w-full z-[2000] rounded-xl shadow-xl border-0 bg-white">
            <DialogHeader className="pb-4 border-b border-gray-100">
              <DialogTitle className="text-xl font-semibold text-gray-800">Nouveau trajet</DialogTitle>
              <DialogDescription className="text-gray-600">Créer un nouveau trajet pour un employé</DialogDescription>
            </DialogHeader>

            <form onSubmit={submitCreate} className="space-y-6 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Employé *</Label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    value={String(form.employee_id)}
                    onChange={(e) => onFormChange('employee_id', e.target.value)}
                  >
                    <option value=""></option>
                    {personnels.map(p => <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>)}
                  </select>
                  {formErrors.employee_id && <div className="text-xs text-red-600 mt-1 flex items-center gap-1">⚠️ {formErrors.employee_id}</div>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Statut</Label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    value={form.status} 
                    onChange={(e) => onFormChange('status', e.target.value)}
                  >
                    <option value="planned">Planifié</option>
                    <option value="en-cours">En cours</option>
                    <option value="completed">Terminé</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Arrêt de départ *</Label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    value={String(form.start_arret_id)} 
                    onChange={(e) => onFormChange('start_arret_id', e.target.value)}
                  >
                    <option value=""></option>
                    {arrets.map(a => <option key={a.id} value={a.id}>{a.nom_arret ?? `Arret ${a.id}`}</option>)}
                  </select>
                  {formErrors.start_arret_id && <div className="text-xs text-red-600 mt-1 flex items-center gap-1">⚠️ {formErrors.start_arret_id}</div>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Arrêt d'arrivée *</Label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    value={String(form.end_arret_id)} 
                    onChange={(e) => onFormChange('end_arret_id', e.target.value)}
                  >
                    <option value=""></option>
                    {arrets.map(a => <option key={a.id} value={a.id}>{a.nom_arret ?? `Arret ${a.id}`}</option>)}
                  </select>
                  {formErrors.end_arret_id && <div className="text-xs text-red-600 mt-1 flex items-center gap-1">⚠️ {formErrors.end_arret_id}</div>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Heure de départ *</Label>
                  <Input 
                    type="datetime-local" 
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    value={form.start_time} 
                    onChange={(e) => onFormChange('start_time', e.target.value)} 
                  />
                  {formErrors.start_time && <div className="text-xs text-red-600 mt-1 flex items-center gap-1">⚠️ {formErrors.start_time}</div>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Heure de fin (optionnel)</Label>
                  <Input 
                    type="datetime-local" 
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    value={form.end_time} 
                    onChange={(e) => onFormChange('end_time', e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Motif</Label>
                <Textarea 
                  value={form.purpose} 
                  onChange={(e) => onFormChange('purpose', e.target.value)} 
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-vertical"
                  placeholder="Décrivez le motif du trajet..."
                />
              </div>

              {formErrors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-sm text-red-600 flex items-center gap-2">🚨 {formErrors.submit}</div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4 justify-end">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsNewTrajetOpen(false)} 
                  disabled={submitting}
                  className="px-6 py-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Création...
                    </span>
                  ) : (
                    'Créer le trajet'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>

      {/* dashboard + list + map — (garde le reste de ton UI inchangé) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Car className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-bold">{trajets.filter(t => t.status === 'en-cours').length}</div>
                <div className="text-sm text-muted-foreground">En cours</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Route className="h-8 w-8 text-success" />
              <div>
                <div className="text-2xl font-bold">{trajets.filter(t => t.status === 'completed' || t.status === 'terminé').length}</div>
                <div className="text-sm text-muted-foreground">Terminés</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-warning" />
              <div>
                <div className="text-2xl font-bold">{trajets.filter(t => t.status === 'planned' || t.status === 'planifié').length}</div>
                <div className="text-sm text-muted-foreground">Planifiés</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Fuel className="h-8 w-8 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{Object.values(realDistances).reduce((sum, v) => sum + v, 0).toFixed(0)}</div>
                <div className="text-sm text-muted-foreground">km total</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Trajets du jour</CardTitle>
            <CardDescription>Sélectionnez un trajet pour voir le détail</CardDescription>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {loading && <div className="text-center py-4">Chargement...</div>}
            {error && <div className="text-center py-4 text-red-500">{error}</div>}

            {currentItems.map((trajet) => {
              const realDistance = realDistances[trajet.id];
              return (
                <div key={trajet.id} className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${selectedTrajet?.id === trajet.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`} onClick={() => setSelectedTrajet(trajet)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-sm">{trajet.employee}</div>
                    <Badge variant={getStatusColor(trajet.status)} className="text-xs">{getStatusLabel(trajet.status)}</Badge>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{trajet.startLocation} → {trajet.endLocation}</div>
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{trajet.startTime} {trajet.endTime && `- ${trajet.endTime}`}</div>
                    <div className="flex items-center gap-1"><Route className="h-3 w-3" />{realDistance ? `${realDistance.toFixed(0)} km (réel) • ${trajet.purpose}` : `${(trajet.distance ?? '?')} km (estimé) • ${trajet.purpose}`}</div>
                  </div>
                </div>
              );
            })}

            {filteredTrajets.length === 0 && !loading && (<div className="text-center py-4 text-muted-foreground text-sm">Aucun trajet trouvé</div>)}

            {filteredTrajets.length > 0 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">{filteredTrajets.length === 0 ? 0 : indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredTrajets.length)} sur {filteredTrajets.length}</div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <div className="hidden sm:flex items-center space-x-1">{Array.from({ length: totalPages }).map((_, i) => (<Button key={i} variant={currentPage === i + 1 ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(i + 1)}>{i + 1}</Button>))}</div>
                  <span className="text-sm">Page {currentPage} sur {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Navigation className="h-5 w-5" />Carte des trajets{selectedTrajet && (<Badge variant="outline">{selectedTrajet.employee}</Badge>)}</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <TrajetMap trajet={selectedTrajet} onDistanceCalculate={(distance) => { if (selectedTrajet) handleDistanceCalculate(selectedTrajet.id, distance); }} />

            {selectedTrajet && (
              <div className="p-4 bg-secondary/30">
                <h4 className="font-medium mb-2">Détails du trajet</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Employé:</span><div className="font-medium">{selectedTrajet.employee}</div></div>
                  <div><span className="text-muted-foreground">Distance:</span><div className="font-medium">{realDistances[selectedTrajet.id] ? `${realDistances[selectedTrajet.id].toFixed(1)} km (réel)` : `${selectedTrajet.distance ?? '?'} km (estimé)`}</div></div>
                  <div><span className="text-muted-foreground">Motif:</span><div className="font-medium">{selectedTrajet.purpose}</div></div>
                  <div><span className="text-muted-foreground">Statut:</span><Badge variant={getStatusColor(selectedTrajet.status)} className="ml-1">{getStatusLabel(selectedTrajet.status)}</Badge></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TrajetsPage;
