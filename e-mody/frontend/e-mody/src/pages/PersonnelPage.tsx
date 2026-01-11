import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ApiConfig from '@/lib/ApiConfig';

interface Personnel {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  id_arret?: number | null;
  planifier?: boolean | number;
  sexe?: 'H' | 'F' | string;
  date_naissance?: string;
  statut?: string;
  fonction?: string;
  campagne?: string;
}

const API_BASE = ApiConfig.getBaseUrl(); 

type PageItem = number | 'DOTS';

export const PersonnelPage: React.FC = () => {
  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
  const [formData, setFormData] = useState({
    matricule: '',
    nom: '',
    prenom: '',
    adresse: '',
    sexe: '',
    date_naissance: '',
    statut: 'Actif',
    fonction: '',
    campagne: '',
    planifier: true // boolean
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // --- Pagination states ---
  const ITEMS_PER_PAGE = 6;
  const [currentPage, setCurrentPage] = useState<number>(1);

  // --- Suppression en modal states ---
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingPersonnel, setDeletingPersonnel] = useState<Personnel | null>(null);

  // Fetch la liste des personnels au montage
  useEffect(() => {
    const fetchPersonnels = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/personnels`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`API Error ${res.status}: ${txt}`);
        }

        const json = await res.json();
        const rows: Personnel[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : (json.data ?? []);
        setPersonnels(rows);
      } catch (err: any) {
        setError(err?.message ?? 'Erreur lors de la récupération des personnels');
      } finally {
        setLoading(false);
      }
    };

    fetchPersonnels();
  }, []);

  const filteredPersonnels = personnels.filter(personnel =>
    (personnel.nom ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (personnel.prenom ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (personnel.matricule ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // recalculer pages si la recherche change ou la liste change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, personnels.length]);

  const totalPages = Math.max(1, Math.ceil(filteredPersonnels.length / ITEMS_PER_PAGE));
  // si currentPage devient > totalPages (après suppression/filtre), on corrige
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedPersonnels = filteredPersonnels.slice(startIndex, endIndex);

  const resetForm = () => {
    setFormData({
      matricule: '',
      nom: '',
      prenom: '',
      adresse: '',
      sexe: '',
      date_naissance: '',
      statut: 'Actif',
      fonction: '',
      campagne: '',
      planifier: true
    });
    setEditingPersonnel(null);
    setIsDialogOpen(false);
    setError(null);
  };

  const handleEdit = (personnel: Personnel) => {
    setEditingPersonnel(personnel);
    setFormData({
      matricule: personnel.matricule ?? '',
      nom: personnel.nom ?? '',
      prenom: personnel.prenom ?? '',
      adresse: personnel.adresse ?? '',
      sexe: (personnel.sexe as string) ?? '',
      date_naissance: personnel.date_naissance ?? '',
      statut: personnel.statut ?? 'Actif',
      fonction: personnel.fonction ?? '',
      campagne: personnel.campagne ?? '',
      planifier: !!personnel.planifier // convert 0/1/boolean to boolean
    });
    setIsDialogOpen(true);
  };

  // Ouvre la modal de suppression pour un personnel donné
  const openDeleteModal = (personnel: Personnel) => {
    setDeletingPersonnel(personnel);
    setIsDeleteDialogOpen(true);
  };

  // Exécute la suppression via API puis supprime localement si succès
  const confirmDelete = async () => {
    if (!deletingPersonnel) {
      setIsDeleteDialogOpen(false);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/personnels/${deletingPersonnel.id}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`API Error ${res.status}: ${txt}`);
      }

      // Mise à jour locale
      setPersonnels(prev => prev.filter(p => p.id !== deletingPersonnel.id));
      setDeletingPersonnel(null);
      setIsDeleteDialogOpen(false);
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  // Soumet le formulaire : create (POST) ou update (PUT)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Préparer les données à envoyer (ne pas envoyer id pour create)
    const payload: any = {
      matricule: formData.matricule,
      nom: formData.nom,
      prenom: formData.prenom,
      adresse: formData.adresse,
      sexe: formData.sexe,
      date_naissance: formData.date_naissance,
      statut: formData.statut,
      fonction: formData.fonction,
      campagne: formData.campagne,
      planifier: formData.planifier // boolean
    };

    try {
      if (editingPersonnel) {
        // Update
        const res = await fetch(`${API_BASE}/personnels/${editingPersonnel.id}`, {
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

        // Mise à jour locale : remplacer l'élément
        setPersonnels(prev => prev.map(p =>
          p.id === editingPersonnel.id
            ? {
                ...p,
                ...payload,
                id: p.id
              }
            : p
        ));

      } else {
        // Create
        const res = await fetch(`${API_BASE}/personnels`, {
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

        let newId: number | null = null;
        let createdItem: Personnel | null = null;

        if (json && typeof json === 'object') {
          if ('id' in json && typeof json.id === 'number') {
            newId = json.id;
          } else if (json.data && typeof json.data === 'object' && 'id' in json.data) {
            newId = json.data.id;
            createdItem = json.data as Personnel;
          } else if (json.success && 'id' in json) {
            newId = (json as any).id;
          }
        }

        if (createdItem) {
          setPersonnels(prev => [createdItem, ...prev]);
        } else {
          const generatedId = newId ?? Date.now();
          const newPersonnel: Personnel = {
            id: generatedId as number,
            matricule: payload.matricule,
            nom: payload.nom,
            prenom: payload.prenom,
            adresse: payload.adresse,
            sexe: payload.sexe,
            date_naissance: payload.date_naissance,
            statut: payload.statut,
            fonction: payload.fonction,
            campagne: payload.campagne,
            planifier: payload.planifier
          };
          setPersonnels(prev => [newPersonnel, ...prev]);
        }
      }

      resetForm();
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  // --------------------------
  // Pagination helper (dots)
  // --------------------------
  const DOTS: 'DOTS' = 'DOTS';

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
          <h1 className="text-3xl font-bold">Gestion du Personnel</h1>
          <p className="text-muted-foreground">Gérez les employés et leurs informations</p>
        </div>

        <div>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Personnel
          </Button>
        </div>

        {/* Modal de création / modification */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingPersonnel(null);
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingPersonnel ? 'Modifier le Personnel' : 'Nouveau Personnel'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="matricule">Matricule *</Label>
                  <Input
                    id="matricule"
                    value={formData.matricule}
                    onChange={(e) => setFormData(prev => ({ ...prev, matricule: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="fonction">Fonction</Label>
                  <Input
                    id="fonction"
                    value={formData.fonction}
                    onChange={(e) => setFormData(prev => ({ ...prev, fonction: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nom">Nom *</Label>
                  <Input
                    id="nom"
                    value={formData.nom}
                    onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="prenom">Prénom *</Label>
                  <Input
                    id="prenom"
                    value={formData.prenom}
                    onChange={(e) => setFormData(prev => ({ ...prev, prenom: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="sexe">Sexe</Label>
                  <select
                    id="sexe"
                    value={formData.sexe}
                    onChange={(e) => setFormData(prev => ({ ...prev, sexe: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="H">Homme</option>
                    <option value="F">Femme</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="date_naissance">Date de naissance</Label>
                  <Input
                    id="date_naissance"
                    type="date"
                    value={formData.date_naissance}
                    onChange={(e) => setFormData(prev => ({ ...prev, date_naissance: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="campagne">Campagne</Label>
                  <Input
                    id="campagne"
                    value={formData.campagne}
                    onChange={(e) => setFormData(prev => ({ ...prev, campagne: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="adresse">Adresse</Label>
                <Textarea
                  id="adresse"
                  value={formData.adresse}
                  onChange={(e) => setFormData(prev => ({ ...prev, adresse: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="statut">Statut</Label>
                  <select
                    id="statut"
                    value={formData.statut}
                    onChange={(e) => setFormData(prev => ({ ...prev, statut: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="Actif">Actif</option>
                    <option value="Inactif">Inactif</option>
                    <option value="En congé">En congé</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="planifier">Planifier</Label>
                  <select
                    id="planifier"
                    value={formData.planifier ? 'true' : 'false'}
                    onChange={(e) => setFormData(prev => ({ ...prev, planifier: e.target.value === 'true' }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="true">Oui</option>
                    <option value="false">Non</option>
                  </select>
                </div>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (editingPersonnel ? 'Enregistrement...' : 'Création...') : (editingPersonnel ? 'Modifier' : 'Créer')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* --- Card liste --- */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Liste du Personnel ({personnels.length})</CardTitle>
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
                    <TableHead>Matricule</TableHead>
                    <TableHead>Nom Complet</TableHead>
                    <TableHead>Fonction</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Campagne</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedPersonnels.map((personnel) => (
                    <TableRow key={personnel.id}>
                      <TableCell className="font-mono">{personnel.matricule}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{personnel.nom} {personnel.prenom}</div>
                          {personnel.adresse && (
                            <div className="text-sm text-muted-foreground">{personnel.adresse}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{personnel.fonction}</TableCell>
                      <TableCell>
                        <Badge variant={personnel.statut === 'actif' ? 'default' : 'secondary'}>
                          {personnel.statut ?? '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{personnel.campagne}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(personnel)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>

                          {/* Bouton ouvre la modal de suppression */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDeleteModal(personnel)}
                            disabled={deleting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredPersonnels.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        Aucun personnel trouvé.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Modal de confirmation de suppression */}
              <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
                // Si on ferme la modal par clic en dehors, on réinitialise deletingPersonnel
                if (!open) {
                  setDeletingPersonnel(null);
                }
                setIsDeleteDialogOpen(open);
              }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Confirmer la suppression</DialogTitle>
                  </DialogHeader>

                  <div className="py-4">
                    <p>
                      Êtes-vous sûr de vouloir supprimer le personnel suivant ?
                    </p>

                    {deletingPersonnel && (
                      <div className="mt-4 space-y-1">
                        <div><strong>Nom :</strong> {deletingPersonnel.nom} {deletingPersonnel.prenom}</div>
                        <div><strong>Matricule :</strong> {deletingPersonnel.matricule}</div>
                      </div>
                    )}

                    {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button variant="outline" onClick={() => { setIsDeleteDialogOpen(false); setDeletingPersonnel(null); }} disabled={deleting}>
                      Annuler
                    </Button>
                    <Button onClick={confirmDelete} disabled={deleting}>
                      {deleting ? 'Suppression...' : 'Supprimer'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* --- Pagination controls --- */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Affichage {filteredPersonnels.length === 0 ? 0 : startIndex + 1} - {Math.min(endIndex, filteredPersonnels.length)} sur {filteredPersonnels.length}
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

export default PersonnelPage;
