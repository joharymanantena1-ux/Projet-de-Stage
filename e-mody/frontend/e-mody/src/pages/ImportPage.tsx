import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  File as FileIcon,
  Check,
  X,
  AlertCircle,
  Loader2,
  Trash2,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ApiConfig from '@/lib/ApiConfig';

// Small helper: human readable bytes
const readableBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const BASE_URL = ApiConfig.getBaseUrl();

type ServerResult = {
  inserted?: number;
  errors?: string[];
  error?: string;
};

const tables = [
  { value: 'personnels', label: 'Personnel' },
  { value: 'axes', label: 'Axes' },
  { value: 'arrets', label: 'Arrêts' },
  { value: 'cars', label: 'Véhicules' },
  { value: 'assignments', label: 'Affectations' }
];

const endpointForTable = (table: string) => {
  switch (table) {
    case 'personnels':
      return `${BASE_URL}/import/personnels`;
    case 'axes':
      return `${BASE_URL}/import/axes`;
    case 'arrets':
      return `${BASE_URL}/import/arrets`;
    case 'cars':
      return `${BASE_URL}/import/cars`;
    case 'assignments':
      return `${BASE_URL}/import/assignments`;
    default:
      return null;
  }
};

// Same CSV split but kept here
const csvSplit = (line: string) => {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
};

const parseCsvPreview = async (file: File, maxRows = 10) => {
  const text = await file.text();
  const lines = text.split(/\r\n|\n/);
  const filtered = lines.filter((l) => l.trim().length > 0);
  if (filtered.length === 0) return [];

  const header = csvSplit(filtered[0]);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < Math.min(filtered.length, maxRows + 1); i++) {
    const cols = csvSplit(filtered[i]);
    const obj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j] ?? `col_${j}`] = cols[j] ?? '';
    }
    rows.push(obj);
  }
  return rows;
};

const ImportPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [serverResult, setServerResult] = useState<ServerResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectedFile) {
      parseCsvPreview(selectedFile, 10)
        .then((rows) => {
          setPreviewRows(rows);
          setShowPreview(true);
        })
        .catch(() => {
          setPreviewRows([]);
          setShowPreview(false);
        });
    } else {
      setPreviewRows([]);
      setShowPreview(false);
    }
  }, [selectedFile]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
      alert('Seuls les fichiers CSV sont acceptés.');
      return;
    }
    // optional size limit (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Fichier trop volumineux (max 5MB).');
      return;
    }
    setSelectedFile(file);
    setImportStatus('idle');
    setServerResult(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) {
      // reuse same validation
      const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const uploadWithFetch = async (url: string, file: File): Promise<ServerResult> => {
    const fd = new FormData();
    fd.append('file', file, file.name);

    // show fake progress for UX (since fetch doesn't provide progress easily)
    setProgress(10);
    await new Promise((r) => setTimeout(r, 200));
    setProgress(30);

    const resp = await fetch(url, {
      method: 'POST',
      body: fd
    });

    setProgress(80);
    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      setProgress(100);
      return json as ServerResult;
    } catch {
      setProgress(100);
      if (!resp.ok) {
        return { error: `Erreur serveur: ${resp.status} ${resp.statusText} - ${text}` };
      }
      return { error: `Réponse inattendue: ${text}` };
    }
  };

  const handleImport = () => {
    if (!selectedFile) {
      alert('Veuillez sélectionner un fichier CSV.');
      return;
    }
    if (!selectedTable) {
      alert('Veuillez sélectionner une table.');
      return;
    }
    setShowConfirmModal(true);
  };

  const confirmImport = async () => {
    setShowConfirmModal(false);
    const url = endpointForTable(selectedTable);
    if (!url || !selectedFile) return;

    setImportStatus('loading');
    setIsUploading(true);
    setServerResult(null);
    setProgress(5);

    try {
      const result = await uploadWithFetch(url, selectedFile);
      setServerResult(result);
      if (result.error || (result.errors && result.errors.length > 0)) {
        setImportStatus('error');
      } else {
        setImportStatus('success');
      }
    } catch (e: any) {
      setServerResult({ error: e?.message ?? 'Erreur inconnue' });
      setImportStatus('error');
    } finally {
      setIsUploading(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Importation de données</h1>
        <p className="text-muted-foreground mt-1">Importez facilement vos CSV — aperçu, validation et import sécurisé.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5" /> Sélection
              </CardTitle>
              <CardDescription>Choisissez la table et le fichier CSV</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Table de destination</Label>
                <Select value={selectedTable} onValueChange={setSelectedTable}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez une table" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Fichier CSV</Label>
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-dashed border-2 border-muted p-4 rounded-md text-center cursor-pointer hover:border-border transition"
                  onClick={() => inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv,application/vnd.ms-excel"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {!selectedFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8" />
                      <div className="text-sm">Déposez votre fichier ici ou cliquez pour sélectionner</div>
                      <div className="text-xs text-muted-foreground">Max 5MB — séparateur `,` — champs entre guillemets acceptés</div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <FileIcon className="h-5 w-5" />
                        <div className="truncate">
                          <div className="text-sm font-medium">{selectedFile.name}</div>
                          <div className="text-xs text-muted-foreground">{readableBytes(selectedFile.size)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">CSV</Badge>
                        <Button variant="ghost" size="sm" onClick={removeFile}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Button onClick={handleImport} disabled={!selectedFile || !selectedTable || isUploading} className="w-full">
                  {isUploading ? <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Import en cours...</> : 'Prévisualiser et Importer'}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => { setSelectedFile(null); setSelectedTable(''); }}>
                  Réinitialiser
                </Button>
              </div>

              {progress > 0 && (
                <div className="w-full bg-muted h-2 rounded overflow-hidden">
                  <div style={{ width: `${progress}%` }} className="h-2 bg-gradient-to-r from-green-400 to-emerald-600 transition-all" />
                </div>
              )}

            </CardContent>
          </Card>

          {/* Status Alerts compact */}
          <div className="mt-4 space-y-2">
            {importStatus === 'success' && serverResult && (
              <Alert className="border-green-200 bg-green-50">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Importation réussie — {serverResult.inserted ?? 0} lignes insérées.
                </AlertDescription>
              </Alert>
            )}

            {importStatus === 'error' && serverResult && (
              <Alert className="border-red-200 bg-red-50">
                <X className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  Erreur lors de l'importation.
                  {serverResult.error && <div className="mt-2 text-xs">{serverResult.error}</div>}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Aperçu & Validation</CardTitle>
              <CardDescription>Vérifiez les colonnes, prévisualisez les lignes et détectez les erreurs simples.</CardDescription>
            </CardHeader>
            <CardContent>
              {!showPreview || previewRows.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-4">
                  <FileText className="h-10 w-10" />
                  <div>Aucun fichier sélectionné — sélectionnez un CSV pour afficher un aperçu.</div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">Aperçu — {previewRows.length} lignes</div>
                    <div className="flex items-center gap-2">
                      <Badge>Prévisualisation</Badge>
                      <Badge variant="secondary">Colonnes: {Object.keys(previewRows[0]).length}</Badge>
                    </div>
                  </div>

                  <div className="overflow-auto border rounded-md">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          {Object.keys(previewRows[0]).map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium truncate">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-muted/50">
                            {Object.keys(row).map((k) => (
                              <td key={k} className="px-3 py-2 align-top truncate max-w-xs">{row[k]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => setShowConfirmModal(true)} disabled={!selectedFile || !selectedTable || isUploading}>
                      <UploadCloud className="h-4 w-4 mr-2" /> Lancer l'import
                    </Button>
                    <Button variant="outline" onClick={() => { setSelectedFile(null); setPreviewRows([]); setShowPreview(false); }}>
                      <X className="h-4 w-4 mr-2" /> Annuler
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" /> Confirmer l'importation
            </DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir importer ce fichier dans la table "{tables.find((t) => t.value === selectedTable)?.label}" ?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted p-3 rounded-md">
              <div className="text-sm font-medium">Résumé</div>
              <ul className="text-sm text-muted-foreground mt-1 list-disc pl-5">
                <li>Table: {tables.find((t) => t.value === selectedTable)?.label}</li>
                <li>Fichier: {selectedFile?.name}</li>
                <li>Taille: {selectedFile ? readableBytes(selectedFile.size) : '-'}</li>
                <li>Colonnes détectées: {previewRows?.[0] ? Object.keys(previewRows[0]).length : 0}</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowConfirmModal(false)} className="flex-1">Annuler</Button>
              <Button onClick={confirmImport} className="flex-1" disabled={isUploading}>{isUploading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Confirmer'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ImportPage;
