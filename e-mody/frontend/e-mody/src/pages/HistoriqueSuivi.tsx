import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { FileSpreadsheet, Calendar as CalendarIcon, Filter, BarChart3, Clock, Download, RefreshCw, Edit, Save, X, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isValid, startOfWeek, endOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { motion } from 'framer-motion';
import ApiConfig from '@/lib/ApiConfig';

const API_BASE: string = ApiConfig.getBaseUrl();

// ---------- types ----------
interface HistoricalData {
  date: string;
  shift: string;
  commander: number;
  comptageFiche: number;
  ecart: number;
  weekNumber?: number;
}

interface WeeklySummary {
  week: string;
  totalCommander: number;
  totalComptageFiche: number;
  totalEcart: number;
}

interface AvailableMonth {
  month: string;
  month_display: string;
}

// ---------- small AnimatedNumber utility ----------
const AnimatedNumber: React.FC<{ value: number; durationMs?: number; className?: string }> = ({ 
  value, 
  durationMs = 600, 
  className 
}) => {
  const [display, setDisplay] = useState<number>(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = display;
    const to = value;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display}</span>;
};

// ---------- Editable Cell Component ----------
interface EditableCellProps {
  value: number;
  onSave: (newValue: number) => void;
  className?: string;
  type?: 'comptage' | 'ecart';
}

const EditableCell: React.FC<EditableCellProps> = ({ value, onSave, className, type = 'comptage' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());
  const [originalValue, setOriginalValue] = useState(value);

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(value.toString());
    setOriginalValue(value);
  };

  const handleSave = () => {
    const numValue = parseInt(editValue) || 0;
    onSave(numValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(originalValue.toString());
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center justify-center gap-1"
      >
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyPress}
          className="w-20 h-8 text-center border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSave}
          className="h-6 w-6 p-0 hover:bg-green-100"
        >
          <Save className="h-3 w-3 text-green-600" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          className="h-6 w-6 p-0 hover:bg-red-100"
        >
          <X className="h-3 w-3 text-red-600" />
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={cn(
        "flex items-center justify-center gap-2 cursor-pointer group",
        className
      )}
      onClick={handleEdit}
    >
      <span className={type === 'ecart' ? getEcartColor(value) : ''}>
        {value}
      </span>
      <Edit className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
    </motion.div>
  );
};

// Fonction pour obtenir la couleur de l'écart
const getEcartColor = (ecart: number) => {
  if (ecart > 0) return 'text-destructive font-bold';
  if (ecart < 0) return 'text-warning font-bold';
  return 'text-success font-bold';
};

// Fonction sécurisée pour formater une date
const safeFormatDate = (dateString: string, formatString: string): string => {
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) {
      console.warn('Date invalide:', dateString);
      return dateString;
    }
    return format(date, formatString);
  } catch (error) {
    console.error('Erreur de formatage de date:', error);
    return dateString;
  }
};

// ---------- API service ----------
class SuiviApiService {
  async getSuiviData(params: { mode: string; date?: string; month?: string }): Promise<{
    success: boolean;
    data: {
      historicalData: HistoricalData[];
      weeklySummary: WeeklySummary[];
    };
  }> {
    const queryParams = new URLSearchParams();
    queryParams.append('mode', params.mode);
    if (params.date) queryParams.append('date', params.date);
    if (params.month) queryParams.append('month', params.month);

    const response = await fetch(`${API_BASE}/suivit?${queryParams}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getAvailableMonths(): Promise<{
    success: boolean;
    data: AvailableMonth[];
  }> {
    const response = await fetch(`${API_BASE}/suivit/months`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async updateSuiviData(updates: Array<{
    date: string;
    shift: string;
    comptageFiche: number;
    ecart: number;
  }>): Promise<{ 
    success: boolean; 
    message: string; 
    data?: any;
    errors?: Array<{data: any; error: string}>;
  }> {
    try {
      const response = await fetch(`${API_BASE}/suivit/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour:', error);
      throw new Error(error.message || 'Erreur lors de la mise à jour des données');
    }
  }

  async getSavedSuiviData(params?: { date?: string; month?: string }): Promise<{
    success: boolean;
    data: Array<{
      date: string;
      shift: string;
      comptageFiche: number;
      ecart: number;
    }>;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.date) queryParams.append('date', params.date);
    if (params?.month) queryParams.append('month', params.month);

    const response = await fetch(`${API_BASE}/suivit/saved?${queryParams}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}

const suiviApiService = new SuiviApiService();

// ---------- component ----------
export const HistoriqueSuivi: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [monthMode, setMonthMode] = useState<'all' | 'single'>('single');
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'weekly'>('daily');
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);

  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [editedData, setEditedData] = useState<{[key: string]: HistoricalData}>({});
  const [saving, setSaving] = useState<boolean>(false);

  // Fonction pour trier les shifts dans l'ordre chronologique correct
  const sortShifts = (a: HistoricalData, b: HistoricalData) => {
    const timeToMinutes = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const aMinutes = timeToMinutes(a.shift);
    const bMinutes = timeToMinutes(b.shift);
    
    return aMinutes - bMinutes;
  };

  // Fonction pour trier par date puis par shift (SÉCURISÉE)
  const sortByDateAndShift = (a: HistoricalData, b: HistoricalData) => {
    try {
      // Vérifier que les objets existent et ont les propriétés nécessaires
      if (!a || !b) return 0;
      if (!a.date || !b.date) return 0;
      if (!a.shift || !b.shift) return 0;
      
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      
      return sortShifts(a, b);
    } catch (error) {
      console.warn('Erreur lors du tri:', error);
      return 0;
    }
  };

  const combinedData = useMemo(() => {
    const toNumber = (v: any) => {
      if (typeof v === 'number') return v;
      if (v == null) return 0;
      const cleaned = String(v).replace(/[^\d\.-]/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    };

    return historicalData.map(item => {
      const key = `${item.date}_${item.shift}`;
      const src = editedData[key] || item;

      // Calcul sécurisé du numéro de semaine
      let weekNumber = 0;
      try {
        const dateObj = new Date(src.date);
        if (isValid(dateObj)) {
          weekNumber = parseInt(format(dateObj, 'I')); // ISO week number
        }
      } catch (error) {
        console.warn('Erreur calcul semaine:', error);
      }

      return {
        ...src,
        commander: toNumber((src as any).commander),
        comptageFiche: toNumber((src as any).comptageFiche),
        ecart: toNumber((src as any).ecart),
        weekNumber,
      } as HistoricalData;
    });
  }, [historicalData, editedData]);

  // Regrouper les données hebdomadaires pour éviter les doublons
  const groupedWeeklySummary = useMemo(() => {
    if (viewMode !== 'weekly') return [];
    
    // Créer un objet pour regrouper par semaine
    const grouped: { [weekKey: string]: WeeklySummary } = {};
    
    weeklySummary.forEach(item => {
      // Extraire le numéro de semaine de la chaîne (ex: "S49 (01/12 - 07/12)" -> "S49")
      const weekMatch = item.week.match(/^(S\d+)/);
      const weekKey = weekMatch ? weekMatch[1] : item.week;
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = {
          week: item.week, // Conserver le format complet pour l'affichage
          totalCommander: 0,
          totalComptageFiche: 0,
          totalEcart: 0
        };
      }
      
      // Additionner les valeurs (en s'assurant qu'elles sont des nombres)
      grouped[weekKey].totalCommander += Number(item.totalCommander) || 0;
      grouped[weekKey].totalComptageFiche += Number(item.totalComptageFiche) || 0;
      grouped[weekKey].totalEcart += Number(item.totalEcart) || 0;
    });
    
    // Convertir en tableau et s'assurer que toutes les valeurs sont des nombres valides
    return Object.values(grouped).map(item => ({
      ...item,
      totalCommander: Number.isFinite(item.totalCommander) ? item.totalCommander : 0,
      totalComptageFiche: Number.isFinite(item.totalComptageFiche) ? item.totalComptageFiche : 0,
      totalEcart: Number.isFinite(item.totalEcart) ? item.totalEcart : 0
    }));
  }, [weeklySummary, viewMode]);

  // Calcul des totaux pour les tableaux
  const tableTotals = useMemo(() => {
    if (viewMode === 'daily') {
      return {
        commander: combinedData.reduce((sum, item) => sum + item.commander, 0),
        comptageFiche: combinedData.reduce((sum, item) => sum + item.comptageFiche, 0),
        ecart: combinedData.reduce((sum, item) => sum + item.ecart, 0),
        shifts: combinedData.length
      };
    } else if (viewMode === 'monthly') {
      return {
        commander: combinedData.reduce((sum, item) => sum + item.commander, 0),
        comptageFiche: combinedData.reduce((sum, item) => sum + item.comptageFiche, 0),
        ecart: combinedData.reduce((sum, item) => sum + item.ecart, 0),
        shifts: combinedData.length,
        days: new Set(combinedData.map(item => item.date)).size
      };
    }
    return null;
  }, [combinedData, viewMode]);

  // Données groupées par date pour l'affichage mensuel avec totaux par date
  const groupedData = useMemo(() => {
    if (viewMode !== 'monthly') return null;
    
    const grouped: { [date: string]: HistoricalData[] } = {};
    combinedData.forEach(item => {
      if (!grouped[item.date]) {
        grouped[item.date] = [];
      }
      grouped[item.date].push(item);
    });

    // Trier les dates et les shifts dans chaque groupe
    Object.keys(grouped).forEach(date => {
      grouped[date].sort(sortShifts);
    });

    // Calculer les totaux par date
    const dateTotals: { [date: string]: { commander: number; comptageFiche: number; ecart: number; shifts: number } } = {};
    Object.keys(grouped).forEach(date => {
      const dayData = grouped[date];
      dateTotals[date] = {
        commander: dayData.reduce((sum, item) => sum + item.commander, 0),
        comptageFiche: dayData.reduce((sum, item) => sum + item.comptageFiche, 0),
        ecart: dayData.reduce((sum, item) => sum + item.ecart, 0),
        shifts: dayData.length
      };
    });

    // Trier les dates en ordre décroissant (du plus récent au plus ancien)
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    return { grouped, sortedDates, dateTotals };
  }, [combinedData, viewMode]);

  // Gestion de la modification des données
  const handleComptageFicheChange = (date: string, shift: string, newValue: number) => {
    const key = `${date}_${shift}`;
    const currentItem = historicalData.find(item => item.date === date && item.shift === shift);
    if (!currentItem) return;

    setEditedData(prev => ({
      ...prev,
      [key]: {
        ...currentItem,
        comptageFiche: newValue,
        ecart: currentItem.commander - newValue
      }
    }));
    toast.success('Comptage Fiche mis à jour');
  };

  const handleEcartChange = (date: string, shift: string, newValue: number) => {
    const key = `${date}_${shift}`;
    const currentItem = historicalData.find(item => item.date === date && item.shift === shift);
    if (!currentItem) return;

    setEditedData(prev => ({
      ...prev,
      [key]: {
        ...currentItem,
        ecart: newValue
      }
    }));
    toast.success('Écart mis à jour');
  };

  // Réinitialiser les modifications
  const handleResetEdits = () => {
    setEditedData({});
    toast.info('Modifications annulées');
  };      

  // Sauvegarder les modifications vers l'API
  const handleSaveEdits = async () => {
    if (Object.keys(editedData).length === 0) {
      toast.info('Aucune modification à sauvegarder');
      return;
    }

    setSaving(true);
    try {
      const updates = Object.values(editedData).map(item => ({
        date: item.date,
        shift: item.shift,
        comptageFiche: item.comptageFiche,
        ecart: item.ecart
      }));

      const response = await suiviApiService.updateSuiviData(updates);
      
      if (response.success) {
        toast.success(response.message || `${updates.length} modification(s) sauvegardée(s) avec succès`);
        setEditedData({});
        // Recharger les données pour refléter les changements
        handleRefresh();
      } else {
        // Gérer les erreurs partielles
        if (response.errors && response.errors.length > 0) {
          toast.error(`${response.errors.length} erreur(s) lors de la sauvegarde`);
          console.error('Erreurs de sauvegarde:', response.errors);
        } else {
          toast.error(response.message || 'Erreur lors de la sauvegarde');
        }
      }
    } catch (error: any) {
      console.error('Erreur sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde des modifications: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Charger les mois disponibles au premier rendu
  useEffect(() => {
    const loadAvailableMonths = async () => {
      try {
        const response = await suiviApiService.getAvailableMonths();
        if (response.success && response.data.length > 0) {
          setAvailableMonths(response.data);
          const latestMonth = response.data[0]?.month;
          if (latestMonth) {
            setSelectedMonth(latestMonth);
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement des mois:', error);
        setFetchError('Erreur lors du chargement des mois disponibles');
      }
    };

    loadAvailableMonths();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const params: any = { mode: viewMode };
      
      if (viewMode === 'daily') {
        params.date = format(selectedDate, 'yyyy-MM-dd');
      } else if (viewMode === 'monthly' || viewMode === 'weekly') {
        if (monthMode === 'single' && selectedMonth) {
          params.month = selectedMonth;
        }
      }

      const response = await suiviApiService.getSuiviData(params);
      
      if (response.success) {
        let sortedHistoricalData: HistoricalData[] = [];
        
        // NE TRIER QUE les données qui ont la structure date/shift (daily et monthly)
        if (viewMode === 'daily' || viewMode === 'monthly') {
          sortedHistoricalData = (response.data.historicalData || [])
            .sort(sortByDateAndShift);
        } else {
          // Pour le mode weekly, ne pas trier car les données n'ont pas la même structure
          sortedHistoricalData = response.data.historicalData || [];
        }
        
        setHistoricalData(sortedHistoricalData);
        setWeeklySummary(response.data.weeklySummary || []);
        // Réinitialiser les modifications quand on change de données
        setEditedData({});
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement des données:', error);
      setFetchError(error?.message || 'Erreur lors du chargement des données');
      setHistoricalData([]);
      setWeeklySummary([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    
    if (availableMonths.length > 0 || viewMode === 'daily') {
      loadData();
    }

    return () => {
      mounted = false;
    };
  }, [selectedDate, selectedMonth, monthMode, viewMode, availableMonths.length]);

  const handleRefresh = () => {
    setRefreshing(true);
    setEditedData({});
    loadData();
  };

  const selectedMonthDisplay = useMemo(() => {
    if (!selectedMonth) return '—';
    const [yStr, mStr] = selectedMonth.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return selectedMonth;
    try {
      return format(new Date(y, m - 1, 1), 'MMMM yyyy');
    } catch (e) {
      return selectedMonth;
    }
  }, [selectedMonth]);

  // Calcul des totaux adapté selon le mode de vue
  const totals = useMemo(() => {
    if (viewMode === 'weekly') {
      // Pour le mode weekly, utiliser les données groupées pour éviter les doublons
      const totalCommander = groupedWeeklySummary.reduce((sum, item) => sum + item.totalCommander, 0);
      const totalComptageFiche = groupedWeeklySummary.reduce((sum, item) => sum + item.totalComptageFiche, 0);
      const totalEcart = groupedWeeklySummary.reduce((sum, item) => sum + item.totalEcart, 0);
      
      return {
        totalCommander,
        totalShifts: groupedWeeklySummary.length,
        averageCommander: groupedWeeklySummary.length > 0 ? Math.round(totalCommander / groupedWeeklySummary.length) : 0,
        totalEcart,
        totalComptageFiche,
        hasEdits: Object.keys(editedData).length > 0
      };
    } else {
      // Pour les modes daily et monthly, utiliser les données combinées
      return {
        totalCommander: combinedData.reduce((s, it) => s + it.commander, 0),
        totalShifts: combinedData.length,
        averageCommander: combinedData.length > 0 ? Math.round(combinedData.reduce((s, it) => s + it.commander, 0) / combinedData.length) : 0,
        totalEcart: combinedData.reduce((s, it) => s + it.ecart, 0),
        totalComptageFiche: combinedData.reduce((s, it) => s + it.comptageFiche, 0),
        hasEdits: Object.keys(editedData).length > 0
      };
    }
  }, [combinedData, editedData, viewMode, groupedWeeklySummary]);

  const handleExportExcel = async () => {
    try {
      setRefreshing(true);
      
      const params: any = { mode: viewMode };
      
      if (viewMode === 'daily') {
        params.date = format(selectedDate, 'yyyy-MM-dd');
      } else if (viewMode === 'monthly' || viewMode === 'weekly') {
        if (monthMode === 'single' && selectedMonth) {
          params.month = selectedMonth;
        }
      }

      // Récupérer toutes les données via l'API
      const response = await suiviApiService.getSuiviData(params);
      
      if (response.success) {
        const wb = XLSX.utils.book_new();
        
        if (viewMode === 'weekly') {
          // Export spécifique pour le mode weekly avec regroupement pour éviter les doublons
          const allWeeklySummary = response.data.weeklySummary || [];
          
          // Regrouper pour éviter les doublons (même logique que groupedWeeklySummary)
          const groupedForExport: { [weekKey: string]: WeeklySummary } = {};
          
          allWeeklySummary.forEach(item => {
            const weekMatch = item.week.match(/^(S\d+)/);
            const weekKey = weekMatch ? weekMatch[1] : item.week;
            
            if (!groupedForExport[weekKey]) {
              groupedForExport[weekKey] = {
                week: item.week,
                totalCommander: 0,
                totalComptageFiche: 0,
                totalEcart: 0
              };
            }
            
            groupedForExport[weekKey].totalCommander += Number(item.totalCommander) || 0;
            groupedForExport[weekKey].totalComptageFiche += Number(item.totalComptageFiche) || 0;
            groupedForExport[weekKey].totalEcart += Number(item.totalEcart) || 0;
          });
          
          const weeklyData = Object.values(groupedForExport).map(item => [
            item.week,
            item.totalCommander,
            item.totalComptageFiche,
            item.totalEcart
          ]);
          
          // Ajouter les totaux pour le récapitulatif
          const weeklyTotals = Object.values(groupedForExport).reduce((acc, item) => ({
            commander: acc.commander + item.totalCommander,
            comptageFiche: acc.comptageFiche + item.totalComptageFiche,
            ecart: acc.ecart + item.totalEcart
          }), { commander: 0, comptageFiche: 0, ecart: 0 });

          weeklyData.push([
            'TOTAL',
            weeklyTotals.commander,
            weeklyTotals.comptageFiche,
            weeklyTotals.ecart
          ]);

          const ws = XLSX.utils.aoa_to_sheet([
            ['Semaine', 'Total Commander', 'Total Comptage Fiche', 'Total Ecart'],
            ...weeklyData
          ]);
          XLSX.utils.book_append_sheet(wb, ws, 'Récap Semaines');
        } else {
          // Export pour les modes daily et monthly
          const allHistoricalData = combinedData;

          // Feuille pour les données détaillées
          if (allHistoricalData.length > 0) {
            const data = allHistoricalData.map((item) => [
              item.date,
              item.shift,
              item.commander,
              item.comptageFiche,
              item.ecart
            ]);
            
            // Ajouter les totaux
            data.push([
              'TOTAL',
              '',
              tableTotals?.commander || 0,
              tableTotals?.comptageFiche || 0,
              tableTotals?.ecart || 0
            ]);

            const ws = XLSX.utils.aoa_to_sheet([
              ['Date', 'SHIFT', 'Commander', 'Comptage Fiche', 'Ecart'],
              ...data
            ]);
            XLSX.utils.book_append_sheet(wb, ws, 'Historique Suivi');
          }
        }

        // Feuille pour les statistiques globales
        const statsData = [
          ['Période', getCurrentFilterDisplay()],
          ['Mode', viewMode],
          ['Total Shifts', totals.totalShifts],
          ['Total Commander', totals.totalCommander],
          ['Total Comptage Fiche', totals.totalComptageFiche],
          ['Total Ecart', totals.totalEcart],
          ['Moyenne Commander', totals.averageCommander],
          ['Modifications', totals.hasEdits ? 'Oui' : 'Non']
        ];
        const statsWs = XLSX.utils.aoa_to_sheet([['Statistiques Générales'], ...statsData]);
        XLSX.utils.book_append_sheet(wb, statsWs, 'Statistiques');

        const fileName = `Historique_Suivi_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success('Export Excel réussi');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'export');
    } finally {
      setRefreshing(false);
    }
  };

  const cardVariant = { 
    hidden: { opacity: 0, y: 8 }, 
    visible: { opacity: 1, y: 0 } 
  };

  const getCurrentFilterDisplay = () => {
    if (viewMode === 'daily') {
      return `Date: ${format(selectedDate, 'dd/MM/yyyy')}`;
    } else if (viewMode === 'monthly') {
      return monthMode === 'all' ? 'Tous les mois' : `Mois: ${selectedMonthDisplay}`;
    } else {
      return `Récap hebdomadaire - ${selectedMonthDisplay}`;
    }
  };

  if (loading && historicalData.length === 0 && weeklySummary.length === 0) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Chargement des données historiques...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header avec filtres */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.36 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Historique Suivi de Transport</h1>
            <p className="text-muted-foreground">
              Suivi historique des assignations et comptages
              {totals.hasEdits && (
                <span className="ml-2 text-orange-600 font-medium">
                  • Modifications en attente
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Sélecteur d'année/mois */}
            <div className="flex items-center gap-2">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'daily' | 'monthly' | 'weekly')}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Détails par Jour</SelectItem>
                  <SelectItem value="monthly">Résumé par Mois</SelectItem>
                  <SelectItem value="weekly">Récap par Semaine</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sélecteur de mois pour les vues monthly et weekly */}
            {(viewMode === 'monthly' || viewMode === 'weekly') && (
              <div className="flex items-center gap-2">
                <Select value={monthMode} onValueChange={(v) => setMonthMode(v as 'all' | 'single')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les mois</SelectItem>
                    <SelectItem value="single">Mois spécifique</SelectItem>
                  </SelectContent>
                </Select>

                {monthMode === 'single' && (
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMonths.map((month) => (
                        <SelectItem key={month.month} value={month.month}>
                          {month.month_display}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Sélecteur de date pour la vue quotidienne */}
            {viewMode === 'daily' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-48 justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing || saving}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>

            <Button 
              onClick={handleExportExcel} 
              className="gap-2 bg-success hover:bg-success/90"
              disabled={refreshing || (viewMode === 'weekly' ? groupedWeeklySummary.length === 0 : combinedData.length === 0) || saving}
            >
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Affichage de l'erreur */}
      {fetchError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive/20 rounded-lg p-4"
        >
          <p className="text-destructive text-sm">{fetchError}</p>
        </motion.div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div variants={cardVariant} initial="hidden" animate="visible" transition={{ duration: 0.38 }}>
          <Card className="bg-gradient-to-br from-primary/8 to-primary/3 border-primary/20 hover:scale-[1.01] transition-transform">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CalendarIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {viewMode === 'daily' ? format(selectedDate, 'dd/MM/yyyy') : selectedMonthDisplay}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {viewMode === 'daily' ? 'Date sélectionnée' : 'Période'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariant} initial="hidden" animate="visible" transition={{ duration: 0.4, delay: 0.02 }}>
          <Card className="bg-gradient-to-br from-warning/8 to-warning/3 border-warning/20 hover:scale-[1.01] transition-transform">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    <AnimatedNumber value={totals.totalShifts} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {viewMode === 'weekly' ? 'Semaines' : 'Shifts total'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariant} initial="hidden" animate="visible" transition={{ duration: 0.42, delay: 0.04 }}>
          <Card className="bg-gradient-to-br from-success/8 to-success/3 border-success/20 hover:scale-[1.01] transition-transform">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-success" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    <AnimatedNumber value={totals.totalCommander} />
                  </div>
                  <div className="text-sm text-muted-foreground">Total Véhicules</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariant} initial="hidden" animate="visible" transition={{ duration: 0.44, delay: 0.06 }}>
          <Card className={cn(
            "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:scale-[1.01] transition-transform",
            totals.hasEdits && "ring-2 ring-orange-400"
          )}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    <AnimatedNumber value={totals.averageCommander} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {viewMode === 'weekly' ? 'Moyenne/Semaine' : 'Moyenne/Shift'}
                    {totals.hasEdits && (
                      <div className="text-orange-600 font-medium">Modifiées</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filtre actuel et actions d'édition */}
      <motion.div 
        initial={{ opacity: 0, y: 8 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.1 }}
      >
        <Card className="border-2 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                Filtres Actuels
                {totals.hasEdits && (
                  <span className="text-sm font-normal text-orange-600 ml-2">
                    ({Object.keys(editedData).length} modification(s))
                  </span>
                )}
              </CardTitle>
              
              <div className="flex gap-2">
                <div className="h-10 flex items-center px-4 border rounded-lg bg-background">
                  <span className="text-sm font-medium">
                    {getCurrentFilterDisplay()}
                  </span>
                </div>

                {totals.hasEdits && (
                  <>
                    <Button 
                      onClick={handleSaveEdits}
                      className="gap-2 bg-green-600 hover:bg-green-700"
                      disabled={saving}
                    >
                      <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
                      {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                    </Button>
                    <Button 
                      onClick={handleResetEdits}
                      variant="outline"
                      className="gap-2"
                      disabled={saving}
                    >
                      <X className="h-4 w-4" />
                      Annuler
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Indicateur de chargement pendant le rafraîchissement */}
      {(refreshing || saving) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center p-4"
        >
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>{saving ? 'Sauvegarde en cours...' : 'Mise à jour des données...'}</span>
        </motion.div>
      )}

      {/* Tableaux de données pour la vue quotidienne */}
      {!refreshing && !saving && viewMode === 'daily' && combinedData.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.12 }}
        >
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Détails du Jour {format(selectedDate, 'dd/MM/yyyy')}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({combinedData.length} shift{combinedData.length > 1 ? 's' : ''})
                  {totals.hasEdits && (
                    <span className="text-orange-600 ml-2">• Modifications</span>
                  )}
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-bold">Date</TableHead>
                      <TableHead className="font-bold">SHIFT</TableHead>
                      <TableHead className="font-bold text-center">Remisage Commandé</TableHead>
                      <TableHead className="font-bold text-center">Remisage Comptage Fiche</TableHead>
                      <TableHead className="font-bold text-center">Remisage Ecart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedData.map((item, index) => {
                      const isEdited = editedData[`${item.date}_${item.shift}`];
                      return (
                        <motion.tr 
                          key={`${item.date}_${item.shift}_${index}`} 
                          initial={{ opacity: 0, y: 8 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          transition={{ delay: index * 0.03 }}
                          className={cn(
                            index % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                            isEdited && 'bg-orange-50 border-l-4 border-l-orange-400'
                          )}
                        >
                          <TableCell className="font-medium">{item.date}</TableCell>
                          <TableCell className="font-bold">{item.shift}</TableCell>
                          <TableCell className="font-bold text-center text-blue-600">
                            <AnimatedNumber value={item.commander} />
                          </TableCell>
                          <TableCell className="text-center">
                            <EditableCell
                              value={item.comptageFiche}
                              onSave={(newValue) => handleComptageFicheChange(item.date, item.shift, newValue)}
                              type="comptage"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <EditableCell
                              value={item.ecart}
                              onSave={(newValue) => handleEcartChange(item.date, item.shift, newValue)}
                              type="ecart"
                            />
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                    
                    {/* Ligne de total pour la vue quotidienne */}
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
                      <TableCell colSpan={2} className="font-bold text-primary text-right">
                        TOTAL JOUR
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        <AnimatedNumber value={tableTotals?.commander || 0} />
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        <AnimatedNumber value={tableTotals?.comptageFiche || 0} />
                      </TableCell>
                      <TableCell className={cn("text-center font-bold", getEcartColor(tableTotals?.ecart || 0))}>
                        <AnimatedNumber value={tableTotals?.ecart || 0} />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Tableaux de données pour la vue mensuelle */}
      {!refreshing && !saving && viewMode === 'monthly' && groupedData && groupedData.sortedDates.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.12 }}
        >
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Résumé du Mois {selectedMonthDisplay}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({combinedData.length} shift{combinedData.length > 1 ? 's' : ''} sur {groupedData.sortedDates.length} jour{groupedData.sortedDates.length > 1 ? 's' : ''})
                  {totals.hasEdits && (
                    <span className="text-orange-600 ml-2">• Modifications</span>
                  )}
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-bold">Date</TableHead>
                      <TableHead className="font-bold">SHIFT</TableHead>
                      <TableHead className="font-bold text-center">Remisage Commandé</TableHead>
                      <TableHead className="font-bold text-center">Remisage Comptage Fiche</TableHead>
                      <TableHead className="font-bold text-center">Remisage Ecart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedData.sortedDates.map((date) => (
                      <React.Fragment key={date}>
                        {groupedData.grouped[date].map((item, index) => {
                          const isEdited = editedData[`${item.date}_${item.shift}`];
                          return (
                            <motion.tr 
                              key={`${item.date}_${item.shift}_${index}`} 
                              initial={{ opacity: 0, y: 8 }} 
                              animate={{ opacity: 1, y: 0 }} 
                              transition={{ delay: index * 0.02 }}
                              className={cn(
                                index % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                                isEdited && 'bg-orange-50 border-l-4 border-l-orange-400'
                              )}
                            >
                              <TableCell className="font-medium">
                                {index === 0 ? (
                                  <div className="flex items-center gap-2">
                                    {safeFormatDate(date, 'dd/MM/yyyy')}
                                    <span className="text-xs text-muted-foreground">
                                      ({groupedData.dateTotals[date].shifts} shift{groupedData.dateTotals[date].shifts > 1 ? 's' : ''})
                                    </span>
                                  </div>
                                ) : ''}
                              </TableCell>
                              <TableCell className="font-bold">{item.shift}</TableCell>
                              <TableCell className="font-bold text-center text-blue-600">
                                <AnimatedNumber value={item.commander} />
                              </TableCell>
                              <TableCell className="text-center">
                                <EditableCell
                                  value={item.comptageFiche}
                                  onSave={(newValue) => handleComptageFicheChange(item.date, item.shift, newValue)}
                                  type="comptage"
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <EditableCell
                                  value={item.ecart}
                                  onSave={(newValue) => handleEcartChange(item.date, item.shift, newValue)}
                                  type="ecart"
                                />
                              </TableCell>
                            </motion.tr>
                          );
                        })}
                        
                        {/* Ligne de total par date */}
                        <TableRow className="bg-blue-50 font-medium border-t border-blue-200">
                          <TableCell colSpan={2} className="font-bold text-blue-700 text-right">
                            Total {safeFormatDate(date, 'dd/MM')}
                          </TableCell>
                          <TableCell className="text-center font-bold text-blue-700">
                            {groupedData.dateTotals[date].commander}
                          </TableCell>
                          <TableCell className="text-center font-bold text-blue-700">
                            {groupedData.dateTotals[date].comptageFiche}
                          </TableCell>
                          <TableCell className={cn("text-center font-bold", getEcartColor(groupedData.dateTotals[date].ecart))}>
                            {groupedData.dateTotals[date].ecart}
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                    
                    {/* Ligne de total général pour le mois */}
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
                      <TableCell colSpan={2} className="font-bold text-primary text-right">
                        TOTAL MOIS
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        <AnimatedNumber value={tableTotals?.commander || 0} />
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        <AnimatedNumber value={tableTotals?.comptageFiche || 0} />
                      </TableCell>
                      <TableCell className={cn("text-center font-bold", getEcartColor(tableTotals?.ecart || 0))}>
                        <AnimatedNumber value={tableTotals?.ecart || 0} />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Récapitulatif hebdomadaire SANS DOUBLONS */}
      {!refreshing && !saving && viewMode === 'weekly' && groupedWeeklySummary.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.14 }}
        >
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Récapitulatif par Semaine - {selectedMonthDisplay}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({groupedWeeklySummary.length} semaine{groupedWeeklySummary.length > 1 ? 's' : ''})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-bold">Semaine</TableHead>
                      <TableHead className="font-bold text-center">Total Commander</TableHead>
                      <TableHead className="font-bold text-center">Total Comptage Fiche</TableHead>
                      <TableHead className="font-bold text-center">Total Ecart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedWeeklySummary.map((item, index) => (
                      <motion.tr 
                        key={`${item.week}_${index}`} 
                        initial={{ opacity: 0, y: 8 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: index * 0.04 }} 
                        className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                      >
                        <TableCell className="font-bold">{item.week}</TableCell>
                        <TableCell className="font-bold text-center text-blue-600">
                          <AnimatedNumber value={item.totalCommander} />
                        </TableCell>
                        <TableCell className="text-center text-orange-600 font-bold">
                          <AnimatedNumber value={item.totalComptageFiche} />
                        </TableCell>
                        <TableCell className={`text-center font-bold ${
                          item.totalEcart > 0 ? 'text-destructive' : 
                          item.totalEcart < 0 ? 'text-warning' : 
                          'text-success'
                        }`}>
                          <AnimatedNumber value={item.totalEcart} />
                        </TableCell>
                      </motion.tr>
                    ))}
                    
                    {/* Ligne de total pour le récapitulatif hebdomadaire */}
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
                      <TableCell className="font-bold text-primary">
                        TOTAL MOIS
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        <AnimatedNumber value={groupedWeeklySummary.reduce((sum, item) => sum + item.totalCommander, 0)} />
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        <AnimatedNumber value={groupedWeeklySummary.reduce((sum, item) => sum + item.totalComptageFiche, 0)} />
                      </TableCell>
                      <TableCell className={cn(
                        "text-center font-bold",
                        getEcartColor(groupedWeeklySummary.reduce((sum, item) => sum + item.totalEcart, 0))
                      )}>
                        <AnimatedNumber value={groupedWeeklySummary.reduce((sum, item) => sum + item.totalEcart, 0)} />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* État vide */}
      {!refreshing && !saving && 
        ((viewMode === 'weekly' && groupedWeeklySummary.length === 0) || 
         (viewMode !== 'weekly' && combinedData.length === 0)) && 
        !fetchError && (
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.16 }}
        >
          <Card>
            <CardContent className="p-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Aucune donnée historique disponible</p>
              <p className="text-sm text-muted-foreground mt-2">
                {viewMode === 'daily'
                  ? `Aucune donnée pour le ${format(selectedDate, 'dd/MM/yyyy')}`
                  : `Aucune donnée pour la période sélectionnée`}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default HistoriqueSuivi;