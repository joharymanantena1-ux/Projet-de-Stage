// File: src/pages/ArretsPage.tsx
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Search, MapPin, UserCheck, Loader2 } from 'lucide-react';
import ArretMap from '@/components/Map/ArretMap';
import ApiConfig from '@/lib/ApiConfig';
import { toast } from 'sonner';

interface Arret {
  id: number;
  nom_arret: string;
  longitude: number;
  latitude: number;
  id_axe: number;
  ordre: number;
  axe_nom?: string;
}

interface Axe {
  id: number;
  nom_axe: string;
}

interface Personnel {
  id: number;
  nom: string;
  prenom: string;
  poste: string;
  fonction?: string;
  id_arret?: number;
  matricule?: string;
}

interface Assignment {
  id: number;
  id_arret: number;
  id_personnel: number;
  date_assignment: string;
  personnel_nom?: string;
  personnel_prenom?: string;
  personnel_fonction?: string;
}

const API_BASE = ApiConfig.getBaseUrl();
const ITEMS_PER_PAGE = 4;

const EMPTY_FORM = {
  nom_arret: '',
  longitude: '',
  latitude: '',
  id_axe: '',
  ordre: ''
};

type PageItem = number | 'DOTS';
const DOTS: 'DOTS' = 'DOTS';

export const ArretsPage: React.FC = () => {
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [axes, setAxes] = useState<Axe[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAxe, setSelectedAxe] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArret, setEditingArret] = useState<Arret | null>(null);
  const [selectedArretOnMap, setSelectedArretOnMap] = useState<Arret | null>(null);

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [arretToDelete, setArretToDelete] = useState<Arret | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);

  // États pour les données dynamiques
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingPersonnel, setLoadingPersonnel] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const dedupeAxes = (rows: Axe[]) : Axe[] => {
    const map: Record<string, Axe> = {};
    for (const r of rows) {
      const key = String(r.nom_axe ?? '').trim().toLowerCase();
      if (!map[key]) map[key] = r;
    }
    return Object.values(map);
  };

  const normalizeArretRow = (row: any, axesMap: Record<number, string>): Arret => {
    const nom = row.nom ?? row.nom_arret ?? '';
    const id_axe = Number(row.id_axe ?? row.axe_id ?? 0);
    return {
      id: Number(row.id),
      nom_arret: String(nom),
      longitude: Number(row.longitude ?? row.lon ?? 0),
      latitude: Number(row.latitude ?? row.lat ?? 0),
      id_axe,
      ordre: Number(row.ordre ?? 0),
      axe_nom: axesMap[id_axe] ?? row.axe_nom ?? ''
    };
  };

  // Récupérer les personnels depuis l'API
  const fetchPersonnel = async (): Promise<Personnel[]> => {
    try {
      setLoadingPersonnel(true);
      const res = await fetch(`${API_BASE}/personnels`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`API personnels ${res.status}: ${txt || res.statusText}`);
      }
      const json = await res.json();
      const rows: Personnel[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : (json.data ?? []);
      setPersonnelList(rows);
      return rows;
    } catch (err: any) {
      console.error('fetchPersonnel error', err);
      toast.error('Impossible de charger la liste du personnel');
      return [];
    } finally {
      setLoadingPersonnel(false);
    }
  };

  // Récupérer les assignations depuis l'API
  const fetchAssignments = async (): Promise<Assignment[]> => {
    try {
      const res = await fetch(`${API_BASE}/assignments`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`API assignments ${res.status}: ${txt || res.statusText}`);
      }
      const json = await res.json();
      const rows: Assignment[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : (json.data ?? []);
      setAssignments(rows);
      return rows;
    } catch (err: any) {
      console.error('fetchAssignments error', err);
      toast.error('Impossible de charger les assignations');
      return [];
    }
  };

  const fetchAxes = async (): Promise<Axe[]> => {
    try {
      const res = await fetch(`${API_BASE}/axes`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`API axes ${res.status}: ${txt || res.statusText}`);
      }
      const json = await res.json();
      const rows: Axe[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : (json.data ?? []);
      const unique = dedupeAxes(rows);
      setAxes(unique);
      return unique;
    } catch (err: any) {
      console.error('fetchAxes error', err);
      setError('Impossible de charger les axes.');
      return [];
    }
  };

  const fetchArrets = async (axesRows?: Axe[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/arrets`, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`API arrets ${res.status}: ${txt || res.statusText}`);
      }
      const json = await res.json();
      const rows = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : (json.data ?? []);
      const axesMap: Record<number, string> = {};
      const usedAxes = axesRows ?? axes;
      usedAxes.forEach(a => { axesMap[a.id] = a.nom_axe; });
      const normalized = rows.map((r: any) => normalizeArretRow(r, axesMap));
      setArrets(normalized);
    } catch (err: any) {
      console.error('fetchArrets error', err);
      setError(err?.message ?? 'Impossible de charger les arrêts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const axesRows = await fetchAxes();
      await Promise.all([
        fetchArrets(axesRows),
        fetchPersonnel(),
        fetchAssignments()
      ]);
      setLoading(false);
    };
    init();
  }, []);

  // Fonction utilitaire pour récupérer le personnel assigné à un arrêt
  const getAssignedPersonnel = (arretId: number): Personnel | null => {
    // Vérifier d'abord dans les assignments
    const assignment = assignments.find(a => a.id_arret === arretId);
    if (assignment) {
      return personnelList.find(p => p.id === assignment.id_personnel) || null;
    }
    
    // Vérifier aussi dans les personnels qui ont un id_arret
    const personnelWithArret = personnelList.find(p => p.id_arret === arretId);
    return personnelWithArret || null;
  };

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditingArret(null);
    setIsDialogOpen(false);
    setError(null);
  };

  const getNextOrdre = (axeId: string | number) => {
    const id = typeof axeId === 'number' ? axeId : parseInt(String(axeId));
    if (!id || Number.isNaN(id)) return 1;
    const max = Math.max(...arrets.filter(a => a.id_axe === id).map(a => a.ordre), 0);
    return max + 1;
  };

  const openCreate = async () => {
    setEditingArret(null);
    setFormData({ ...EMPTY_FORM });
    if (axes.length === 0) {
      await fetchAxes();
    }
    if (personnelList.length === 0) {
      await fetchPersonnel();
    }
    setIsDialogOpen(true);
  };

  const handleEdit = async (arret: Arret) => {
    setEditingArret(arret);
    setFormData({
      nom_arret: arret.nom_arret,
      longitude: String(arret.longitude),
      latitude: String(arret.latitude),
      id_axe: String(arret.id_axe),
      ordre: String(arret.ordre)
    });
    if (!axes.some(a => a.id === arret.id_axe)) {
      await fetchAxes();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!formData.nom_arret.trim() || !formData.id_axe || !formData.latitude || !formData.longitude) {
      setError('Veuillez remplir au moins : nom, axe, latitude, longitude.');
      setSaving(false);
      return;
    }

    const payload = {
      nom: formData.nom_arret,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      id_axe: parseInt(formData.id_axe),
      ordre: parseInt(formData.ordre || String(getNextOrdre(formData.id_axe)))
    };

    try {
      if (editingArret) {
        const res = await fetch(`${API_BASE}/arrets/${editingArret.id}`, {
          method: 'PUT',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`API Error ${res.status}: ${txt || res.statusText}`);
        }
        let json: any = null;
        try { json = await res.json(); } catch (_) { json = null; }

        if (json && json.data && typeof json.data === 'object') {
          const axesMap: Record<number,string> = {};
          (await fetchAxes())?.forEach(a => { axesMap[a.id] = a.nom_axe; });
          const updated = normalizeArretRow(json.data, axesMap);
          setArrets(prev => prev.map(a => a.id === updated.id ? updated : a));
        } else {
          setArrets(prev => prev.map(a => a.id === editingArret.id ? {
            ...a,
            nom_arret: payload.nom,
            latitude: payload.latitude,
            longitude: payload.longitude,
            id_axe: payload.id_axe,
            ordre: payload.ordre,
            axe_nom: axes.find(x => x.id === payload.id_axe)?.nom_axe
          } : a));
        }
        resetForm();
        toast.success('Arrêt modifié avec succès');
      } else {
        const res = await fetch(`${API_BASE}/arrets`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`API Error ${res.status}: ${txt || res.statusText}`);
        }

        const json = await res.json().catch(() => null);
        let created: Arret | null = null;
        if (json) {
          if (json.data && typeof json.data === 'object') {
            const axesMap: Record<number,string> = {};
            (await fetchAxes())?.forEach(a => { axesMap[a.id] = a.nom_axe; });
            created = normalizeArretRow(json.data, axesMap);
          } else if (json.id) {
            created = {
              id: Number(json.id),
              nom_arret: payload.nom,
              latitude: payload.latitude,
              longitude: payload.longitude,
              id_axe: payload.id_axe,
              ordre: payload.ordre,
              axe_nom: axes.find(ax => ax.id === payload.id_axe)?.nom_axe
            };
          }
        }

        if (created) {
          setArrets(prev => [created!, ...prev]);
          toast.success('Arrêt créé avec succès');
        } else {
          await fetchArrets(axes);
        }
        resetForm();
      }
    } catch (err: any) {
      console.error('handleSubmit error', err);
      setError(err?.message ?? 'Erreur lors de l\'enregistrement');
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (arret: Arret) => {
    setArretToDelete(arret);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!arretToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/arrets/${arretToDelete.id}`, { method: 'DELETE', headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`API Error ${res.status}: ${txt || res.statusText}`);
      }
      setArrets(prev => prev.filter(a => a.id !== arretToDelete.id));
      if (selectedArretOnMap?.id === arretToDelete.id) setSelectedArretOnMap(null);
      setDeleteDialogOpen(false);
      setArretToDelete(null);
      toast.success('Arrêt supprimé avec succès');
    } catch (err: any) {
      console.error('delete error', err);
      setError(err?.message ?? 'Erreur lors de la suppression');
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setArretToDelete(null);
  };

  // Gestion de la création d'arrêt depuis la carte
  const handleArretCreate = async (newArret: Omit<Arret, 'id'> & { nom_employe: string }) => {
    try {
      setSaving(true);
      
      // Créer l'arrêt d'abord
      const payload = {
        nom: newArret.nom_arret,
        latitude: newArret.latitude,
        longitude: newArret.longitude,
        id_axe: newArret.id_axe,
        ordre: newArret.ordre || 1
      };

      const res = await fetch(`${API_BASE}/arrets`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Erreur lors de la création de l\'arrêt');
      }

      const json = await res.json();
      const createdArretId = json.id || json.data?.id;

      if (!createdArretId) {
        throw new Error('ID de l\'arrêt non reçu');
      }

      // Si un employé est sélectionné, l'assigner
      if (newArret.nom_employe) {
        await handlePersonnelAssign(createdArretId, parseInt(newArret.nom_employe));
      }

      // Recharger les données
      await Promise.all([
        fetchArrets(),
        fetchAssignments()
      ]);

      toast.success('Arrêt créé avec succès depuis la carte');
    } catch (err: any) {
      console.error('handleArretCreate error', err);
      toast.error(err?.message ?? 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  // Gestion de l'assignation de personnel via API
  const handlePersonnelAssign = async (arretId: number, personnelId: number) => {
    try {
      setAssigning(true);
      
      const payload = {
        id_personnel: personnelId,
        id_arret: arretId
      };

      const res = await fetch(`${API_BASE}/assign-personnel`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Erreur d'assignation: ${txt || res.statusText}`);
      }

      // Recharger les assignations et personnels
      await Promise.all([
        fetchAssignments(),
        fetchPersonnel()
      ]);

      const personnel = personnelList.find(p => p.id === personnelId);
      toast.success(`Personnel assigné: ${personnel?.prenom} ${personnel?.nom}`);
    } catch (err: any) {
      console.error('handlePersonnelAssign error', err);
      toast.error(err?.message ?? 'Erreur lors de l\'assignation');
    } finally {
      setAssigning(false);
    }
  };

  const filteredArrets = arrets.filter(arret => {
    const assignedPersonnel = getAssignedPersonnel(arret.id);
    const personnelName = assignedPersonnel ? `${assignedPersonnel.prenom} ${assignedPersonnel.nom}` : '';
    
    const matchesSearch = (arret.nom_arret ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      || (arret.axe_nom ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      || personnelName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAxe = selectedAxe === 'all' || arret.id_axe === parseInt(selectedAxe);
    return matchesSearch && matchesAxe;
  });

  const totalPages = Math.max(1, Math.ceil(filteredArrets.length / ITEMS_PER_PAGE));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [filteredArrets.length, totalPages]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedArrets = filteredArrets.slice(startIndex, endIndex);

  const getPaginationRange = (current: number, total: number): PageItem[] => {
    const range: PageItem[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) range.push(i);
      return range;
    }
    if (current <= 4) {
      for (let i = 1; i <= 4; i++) range.push(i);
      range.push(DOTS);
      range.push(total - 1);
      range.push(total);
      return range;
    }
    if (current >= total - 3) {
      range.push(1);
      range.push(2);
      range.push(DOTS);
      for (let i = total - 3; i <= total; i++) range.push(i);
      return range;
    }
    range.push(1);
    range.push(2);
    range.push(DOTS);
    range.push(current - 1);
    range.push(current);
    range.push(current + 1);
    range.push(DOTS);
    range.push(total - 1);
    range.push(total);
    return range;
  };

  const selectedAxisMissing = formData.id_axe && !axes.some(a => String(a.id) === String(formData.id_axe));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Arrêts</h1>
          <p className="text-muted-foreground">Gérez les arrêts et assignez du personnel</p>
        </div>

        <div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvel Arrêt
          </Button>
        </div>
      </div>

      {/* Dialog create/edit */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
        <DialogContent className="max-w-md z-[2000]">
          <DialogHeader>
            <DialogTitle>{editingArret ? 'Modifier l\'Arrêt' : 'Nouvel Arrêt'}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {editingArret ? "Formulaire pour modifier l'arrêt." : "Formulaire pour créer un nouvel arrêt."}
          </DialogDescription>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="nom_arret">Nom de l'arrêt *</Label>
              <Input id="nom_arret" value={formData.nom_arret} onChange={(e) => setFormData(prev => ({ ...prev, nom_arret: e.target.value }))} required placeholder="Ex: Place de l'Indépendance" />
            </div>

            <div>
              <Label htmlFor="id_axe">Axe *</Label>
              <select
                id="id_axe"
                value={formData.id_axe}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData(prev => ({ ...prev, id_axe: val, ordre: prev.ordre || String(getNextOrdre(val)) }));
                }}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Sélectionner un axe</option>
                {selectedAxisMissing && (
                  <option value={formData.id_axe}>
                    {editingArret?.axe_nom ?? `Axe #${formData.id_axe} (inconnu)`}
                  </option>
                )}
                {axes.map(ax => (
                  <option key={ax.id} value={String(ax.id)}>{ax.nom_axe}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="ordre">Ordre sur l'axe *</Label>
              <Input id="ordre" type="number" min={1} value={formData.ordre} onChange={(e) => setFormData(prev => ({ ...prev, ordre: e.target.value }))} required />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="latitude">Latitude *</Label>
                <Input id="latitude" type="number" step="any" value={formData.latitude} onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))} required placeholder="-18.8792" />
              </div>
              <div>
                <Label htmlFor="longitude">Longitude *</Label>
                <Input id="longitude" type="number" step="any" value={formData.longitude} onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))} required placeholder="47.5079" />
              </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>Annuler</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingArret ? 'Modifier' : 'Créer')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) cancelDelete(); setDeleteDialogOpen(open); }}>
        <DialogContent className="max-w-md z-[2000]">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {arretToDelete
              ? `Voulez-vous vraiment supprimer l'arrêt "${arretToDelete.nom_arret}" (ordre ${arretToDelete.ordre}) ? Cette action est irréversible.`
              : 'Voulez-vous supprimer cet arrêt ?'}
          </DialogDescription>

          {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={cancelDelete} disabled={deleting}>Annuler</Button>
            <Button type="button" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MapPin className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{arrets.length}</p>
                  <p className="text-sm text-muted-foreground">Arrêts configurés</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserCheck className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{assignments.length}</p>
                  <p className="text-sm text-muted-foreground">Assignations actives</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Liste des Arrêts</CardTitle>
            <div className="flex gap-4 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher un arrêt, axe ou personnel..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
              </div>

              <div>
                <select value={selectedAxe} onChange={(e) => { setSelectedAxe(e.target.value); setCurrentPage(1); }} className="w-48 border rounded px-3 py-2">
                  <option value="all">Tous les axes</option>
                  {axes.map(ax => <option key={ax.id} value={String(ax.id)}>{ax.nom_axe}</option>)}
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom de l'arrêt</TableHead>
                    <TableHead>Axe</TableHead>
                    <TableHead>Ordre</TableHead>
                    <TableHead>Personnel</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedArrets.map(arret => {
                    const assignedPersonnel = getAssignedPersonnel(arret.id);
                    return (
                      <TableRow key={arret.id} className={`cursor-pointer ${selectedArretOnMap?.id === arret.id ? 'bg-muted' : ''}`} onClick={() => setSelectedArretOnMap(arret)}>
                        <TableCell className="font-medium">{arret.nom_arret}</TableCell>
                        <TableCell>{arret.axe_nom ?? '-'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium bg-primary/10 text-primary rounded-full">{arret.ordre}</span>
                        </TableCell>
                        <TableCell>
                          {assignedPersonnel ? (
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4 text-green-600" />
                              <div>
                                <span className="text-sm font-medium">
                                  {assignedPersonnel.prenom} {assignedPersonnel.nom}
                                </span>
                                <div className="text-xs text-muted-foreground">
                                  {assignedPersonnel.fonction || assignedPersonnel.poste}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Non assigné</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(arret); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openDeleteDialog(arret); }} disabled={deleting}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredArrets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        {loading ? 'Chargement...' : 'Aucun arrêt trouvé.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Affichage {filteredArrets.length === 0 ? 0 : startIndex + 1} – {Math.min(endIndex, filteredArrets.length)} sur {filteredArrets.length}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Page précédente"
                  className="rounded-full px-2"
                >
                  ‹
                </Button>

                <div className="flex items-center gap-1">
                  <div className="sm:hidden text-sm px-3 py-1 bg-muted/30 rounded-md">
                    {currentPage} / {totalPages || 1}
                  </div>

                  <div className="hidden sm:flex items-center gap-1 bg-transparent p-1 rounded-md">
                    {getPaginationRange(currentPage, totalPages).map((p, idx) =>
                      p === DOTS ? (
                        <span key={`dots-${idx}`} className="px-3 py-1 text-sm text-muted-foreground select-none">…</span>
                      ) : (
                        <Button
                          key={p}
                          size="sm"
                          onClick={() => setCurrentPage(p)}
                          variant={p === currentPage ? undefined : 'outline'}
                          aria-current={p === currentPage ? 'page' : undefined}
                          className={`rounded-full px-3 py-1 text-sm ${p === currentPage ? 'shadow-md' : ''}`}
                        >
                          {p}
                        </Button>
                      )
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Page suivante"
                  className="rounded-full px-2"
                >
                  ›
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold">{arrets.length}</div>
                <div className="text-xs text-muted-foreground">Total arrêts</div>
              </div>
              <div>
                <div className="text-lg font-bold">{axes.length}</div>
                <div className="text-xs text-muted-foreground">Axes actifs</div>
              </div>
              <div>
                <div className="text-lg font-bold">{assignments.length}</div>
                <div className="text-xs text-muted-foreground">Assignations</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="p-2 md:p-4 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">Localisation des arrêts</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="relative rounded-xl overflow-hidden border bg-white/70 shadow-md">
              {/* Hauteur augmentée ici */}
              <div className="h-[550px] w-full">
                <ArretMap
                  arrets={filteredArrets}
                  selectedArret={selectedArretOnMap}
                  onArretSelect={setSelectedArretOnMap}
                  axes={axes}
                  onArretCreate={handleArretCreate}
                  onPersonnelAssign={handlePersonnelAssign}
                  personnelList={personnelList}
                  assignments={assignments}
                />
              </div>

              {selectedArretOnMap && (
                <div className="pointer-events-none absolute left-4 bottom-4 sm:left-6 sm:bottom-6 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border">
                  <div className="text-sm font-semibold">{selectedArretOnMap.nom_arret}</div>
                  <div className="text-xs text-muted-foreground">
                    Axe : {selectedArretOnMap.axe_nom ?? '-'} • Ordre : {selectedArretOnMap.ordre}
                    {(() => {
                      const assignedPersonnel = getAssignedPersonnel(selectedArretOnMap.id);
                      return assignedPersonnel && (
                        <div className="mt-1 flex items-center gap-1">
                          <UserCheck className="h-3 w-3 text-green-600" />
                          Personnel: {assignedPersonnel.prenom} {assignedPersonnel.nom}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <div>Cliquez sur la carte pour créer un arrêt • Cliquez sur un marqueur pour assigner</div>
              <div className="hidden sm:inline">Arrêts visibles : {filteredArrets.length}</div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default ArretsPage;