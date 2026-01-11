import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Search, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ApiConfig from '@/lib/ApiConfig';

interface Axe {
  id: number;
  nom_axe: string;
  point_depart: string;
  point_arrivee: string;
  created_at?: string | null;
}

const API_BASE = ApiConfig.getBaseUrl(); 

type PageItem = number | 'DOTS';
const DOTS: 'DOTS' = 'DOTS';

export const AxesPage: React.FC = () => {
  const [axes, setAxes] = useState<Axe[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAxe, setEditingAxe] = useState<Axe | null>(null);
  const [formData, setFormData] = useState({
    nom_axe: '',
    point_depart: '',
    point_arrivee: ''
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const ITEMS_PER_PAGE = 6;
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Delete modal
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingAxe, setDeletingAxe] = useState<Axe | null>(null);

  // Fetch axes
  const fetchAxes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/axes`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`API Error ${res.status}: ${txt}`);
      }

      const json = await res.json();
      // Supporte { data: [...] } ou [] ou {data:...}
      const rows: Axe[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : (json.data ?? []);
      setAxes(rows);
    } catch (err: any) {
      console.error('fetchAxes error', err);
      setError(err?.message ?? 'Erreur lors de la récupération des axes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search / filter
  const filteredAxes = axes.filter(a =>
    (a.nom_axe ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.point_depart ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.point_arrivee ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Reset page when search or axes change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, axes.length]);

  const totalPages = Math.max(1, Math.ceil(filteredAxes.length / ITEMS_PER_PAGE));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedAxes = filteredAxes.slice(startIndex, endIndex);

  const resetForm = () => {
    setFormData({ nom_axe: '', point_depart: '', point_arrivee: '' });
    setEditingAxe(null);
    setIsDialogOpen(false);
    setError(null);
  };

  const handleEdit = (axe: Axe) => {
    setEditingAxe(axe);
    setFormData({
      nom_axe: axe.nom_axe ?? '',
      point_depart: axe.point_depart ?? '',
      point_arrivee: axe.point_arrivee ?? ''
    });
    setIsDialogOpen(true);
  };

  const openDeleteModal = (axe: Axe) => {
    setDeletingAxe(axe);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingAxe) {
      setIsDeleteDialogOpen(false);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/axes/${deletingAxe.id}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`API Error ${res.status}: ${txt}`);
      }

      // Option 1 : re-fetch (garantit cohérence)
      await fetchAxes();

      // close modal
      setDeletingAxe(null);
      setIsDeleteDialogOpen(false);
    } catch (err: any) {
      console.error('delete error', err);
      setError(err?.message ?? 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Simple validation
    if (!formData.nom_axe.trim() || !formData.point_depart.trim() || !formData.point_arrivee.trim()) {
      setError('Tous les champs sont requis.');
      setSaving(false);
      return;
    }

    const payload = {
      nom_axe: formData.nom_axe,
      point_depart: formData.point_depart,
      point_arrivee: formData.point_arrivee
    };

    try {
      if (editingAxe) {
        // Update via PUT (route: /axes/{id})
        const res = await fetch(`${API_BASE}/axes/${editingAxe.id}`, {
          method: 'PUT',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`API Error ${res.status}: ${txt}`);
        }

        // Option: read response and update local state
        try {
          const json = await res.json();
          // si serveur renvoie l'objet mis à jour dans json.data ou json, on peut l'utiliser
          const updated = (json && json.data) ? json.data as Axe : null;
          if (updated && typeof updated.id === 'number') {
            setAxes(prev => prev.map(a => a.id === updated.id ? updated : a));
          } else {
            // fallback : mise à jour locale à partir du payload
            setAxes(prev => prev.map(a => a.id === editingAxe.id ? { ...a, ...payload } : a));
          }
        } catch {
          // si pas de JSON, on fait update localement
          setAxes(prev => prev.map(a => a.id === editingAxe.id ? { ...a, ...payload } : a));
        }

        resetForm();
      } else {
        // Create via POST (/axes)
        const res = await fetch(`${API_BASE}/axes`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`API Error ${res.status}: ${txt}`);
        }

        const json = await res.json();
        // Format attendu possible: { success: true, id: <id> } or { data: { ... } }
        let createdItem: Axe | null = null;
        if (json) {
          if (json.data && typeof json.data === 'object') {
            createdItem = json.data as Axe;
          } else if (json.id && typeof json.id === 'number') {
            createdItem = {
              id: json.id,
              nom_axe: payload.nom_axe,
              point_depart: payload.point_depart,
              point_arrivee: payload.point_arrivee,
              created_at: new Date().toISOString().split('T')[0]
            };
          }
        }

        if (createdItem) {
          setAxes(prev => [createdItem!, ...prev]);
        } else {
          // fallback: refetch list to get server-generated fields
          await fetchAxes();
        }

        resetForm();
      }
    } catch (err: any) {
      console.error('handleSubmit error', err);
      setError(err?.message ?? 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  // Pagination helper
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

  const paginationRange = getPaginationRange(currentPage, totalPages);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Axes</h1>
          <p className="text-muted-foreground">Gérez les lignes / axes de transport</p>
        </div>

        <div>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvel Axe
          </Button>
        </div>

        {/* Modal create / edit */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAxe ? 'Modifier l\'Axe' : 'Nouvel Axe'}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="nom_axe">Nom de l'axe *</Label>
                  <Input
                    id="nom_axe"
                    value={formData.nom_axe}
                    onChange={(e) => setFormData(prev => ({ ...prev, nom_axe: e.target.value }))}
                    required
                    placeholder="Ex: Ligne A - Centre Ville"
                  />
                </div>

                <div>
                  <Label htmlFor="point_depart">Point de départ *</Label>
                  <Input
                    id="point_depart"
                    value={formData.point_depart}
                    onChange={(e) => setFormData(prev => ({ ...prev, point_depart: e.target.value }))}
                    required
                    placeholder="Ex: Gare Centrale"
                  />
                </div>

                <div>
                  <Label htmlFor="point_arrivee">Point d'arrivée *</Label>
                  <Input
                    id="point_arrivee"
                    value={formData.point_arrivee}
                    onChange={(e) => setFormData(prev => ({ ...prev, point_arrivee: e.target.value }))}
                    required
                    placeholder="Ex: Université"
                  />
                </div>

                <div>
                  <Label>Notes / description (optionnel)</Label>
                  <Textarea placeholder="Description courte (facultatif)" rows={3} />
                </div>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (editingAxe ? 'Enregistrement...' : 'Création...') : (editingAxe ? 'Modifier' : 'Créer')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Route className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{axes.length}</p>
              <p className="text-sm text-muted-foreground">Axes configurés</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Liste des Axes ({axes.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Chargement...</div>
          ) : error ? (
            <div className="py-8 text-center text-red-600">Erreur : {error}</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom de l'axe</TableHead>
                    <TableHead>Point de départ</TableHead>
                    <TableHead>Point d'arrivée</TableHead>
                    <TableHead>Date création</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedAxes.map((axe) => (
                    <TableRow key={axe.id}>
                      <TableCell className="font-medium">{axe.nom_axe}</TableCell>
                      <TableCell>{axe.point_depart}</TableCell>
                      <TableCell>{axe.point_arrivee}</TableCell>
                      <TableCell>{axe.created_at ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(axe)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openDeleteModal(axe)} disabled={deleting}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredAxes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        Aucun axe trouvé.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Delete confirmation modal */}
              <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
                if (!open) setDeletingAxe(null);
                setIsDeleteDialogOpen(open);
              }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Confirmer la suppression</DialogTitle>
                  </DialogHeader>

                  <div className="py-4">
                    <p>Êtes-vous sûr de vouloir supprimer cet axe ? Cette action est irréversible.</p>

                    {deletingAxe && (
                      <div className="mt-4 space-y-1">
                        <div><strong>Nom :</strong> {deletingAxe.nom_axe}</div>
                        <div><strong>De :</strong> {deletingAxe.point_depart} → <strong>À :</strong> {deletingAxe.point_arrivee}</div>
                      </div>
                    )}

                    {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button variant="outline" onClick={() => { setIsDeleteDialogOpen(false); setDeletingAxe(null); }} disabled={deleting}>
                      Annuler
                    </Button>
                    <Button onClick={confirmDelete} disabled={deleting}>
                      {deleting ? 'Suppression...' : 'Supprimer'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Pagination controls */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Affichage {filteredAxes.length === 0 ? 0 : startIndex + 1} - {Math.min(endIndex, filteredAxes.length)} sur {filteredAxes.length}
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </Button>

                  <div className="hidden sm:flex items-center space-x-1">
                    {paginationRange.map((p, idx) =>
                      p === DOTS ? (
                        <span key={`dots-${idx}`} className="px-3 py-1 text-sm">...</span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === currentPage ? undefined : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(p as number)}
                        >
                          {p}
                        </Button>
                      )
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AxesPage;
