// File: src/pages/Dashboard.tsx
import React, { FC, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  MapPin, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  Car, 
  Route, 
  Fuel, 
  BarChart3,
  Calendar as CalendarIcon,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
} from 'recharts';
import ApiConfig from '@/lib/ApiConfig';
import { motion } from 'framer-motion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

const API_BASE: string = ApiConfig.getBaseUrl();

// ---------- Types ----------
interface MonthlyDistance { 
  year: number; 
  name: string; 
  km: number; 
}

interface TrajetStats {
  total: number;
  completed: number;
  planned: number;
  inProgress: number;
  totalDistance: number;
  averageDistance: number;
}

interface PersonnelStats {
  total: number;
  active: number;
  presenceRate: number;
  byDepartment: Array<{ name: string; value: number }>;
}

interface SuiviData {
  date: string;
  totalCommander: number;
  totalComptageFiche: number;
  totalEcart: number;
}

// ---------- Animated Number Component ----------
const AnimatedNumber: FC<{ 
  value: number | string; 
  duration?: number; 
  className?: string;
  prefix?: string;
  suffix?: string;
}> = ({
  value,
  duration = 700,
  className,
  prefix = '',
  suffix = ''
}) => {
  const target = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
  const [display, setDisplay] = useState<number>(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = display;
    const to = target;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return <span className={className}>{prefix}{display.toLocaleString()}{suffix}</span>;
};

// ---------- Dashboard Component ----------
export const Dashboard: FC = () => {
  const { user, loading: authLoading } = useAuth();

  // UI / calculation state
  const [fuelPrice, setFuelPrice] = useState<number>(1500);
  const [overrideTotalKm, setOverrideTotalKm] = useState<string>('');

  // filters
  const years = useMemo(() => [2023, 2024, 2025], []);
  const months = ['All', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(years.includes(currentYear) ? currentYear : years[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });

  // data states
  const [personnels, setPersonnels] = useState<any[]>([]);
  const [trajets, setTrajets] = useState<any[]>([]);
  const [suiviData, setSuiviData] = useState<SuiviData[]>([]);
  const [trajetStats, setTrajetStats] = useState<TrajetStats>({
    total: 0,
    completed: 0,
    planned: 0,
    inProgress: 0,
    totalDistance: 0,
    averageDistance: 0
  });
  const [personnelStats, setPersonnelStats] = useState<PersonnelStats>({
    total: 0,
    active: 0,
    presenceRate: 0,
    byDepartment: []
  });
  
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Format currency
  const formatAriary = (value: number, withDecimals = false) => {
    const opts: Intl.NumberFormatOptions = {
      minimumFractionDigits: withDecimals ? 2 : 0,
      maximumFractionDigits: withDecimals ? 2 : 0,
    };
    return `${value.toLocaleString('fr-FR', opts)} Ar`;
  };

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    setRefreshing(true);
    setFetchError(null);

    try {
      // Fetch personnels
      const pRes = await fetch(`${API_BASE}/personnels`, { 
        method: 'GET', 
        headers: { Accept: 'application/json' } 
      });
      
      if (pRes.ok) {
        const pJson = await pRes.json();
        const pRows = Array.isArray(pJson?.data) ? pJson.data : Array.isArray(pJson) ? pJson : pJson?.data ?? [];
        setPersonnels(pRows);
        
        // Calculate personnel stats
        const activeCount = pRows.filter((p: any) => {
          const s = String(p?.statut ?? p?.status ?? '').toLowerCase();
          return s === 'actif' || s === 'active' || s === 'true' || s === '1';
        }).length;
        
        const total = pJson?.meta && typeof pJson.meta.total === 'number' ? pJson.meta.total : pRows.length;
        
        setPersonnelStats({
          total: Number(total),
          active: activeCount,
          presenceRate: total > 0 ? Math.round((activeCount / total) * 1000) / 10 : 0,
          byDepartment: calculateDepartmentStats(pRows)
        });
      }

      // Fetch trajets
      const tRes = await fetch(`${API_BASE}/trajets?limit=100`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (tRes.ok) {
        const tJson = await tRes.json();
        const tRows = Array.isArray(tJson?.data) ? tJson.data : Array.isArray(tJson) ? tJson : tJson?.data ?? [];
        setTrajets(tRows);
        
        // Calculate trajet stats
        const completed = tRows.filter((t: any) => 
          t.status === 'completed' || t.status === 'terminé'
        ).length;
        
        const planned = tRows.filter((t: any) => 
          t.status === 'planned' || t.status === 'planifié'
        ).length;
        
        const inProgress = tRows.filter((t: any) => 
          t.status === 'en-cours'
        ).length;
        
        const totalDistance = tRows.reduce((sum: number, t: any) => 
          sum + (t.distance || 0), 0
        );
        
        setTrajetStats({
          total: tRows.length,
          completed,
          planned,
          inProgress,
          totalDistance,
          averageDistance: tRows.length > 0 ? totalDistance / tRows.length : 0
        });
      }

      // Fetch suivi data
      const sRes = await fetch(`${API_BASE}/suivit?mode=monthly&month=${format(new Date(), 'yyyy-MM')}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (sRes.ok) {
        const sJson = await sRes.json();
        if (sJson.success && sJson.data.historicalData) {
          // Aggregate by date
          const aggregated: { [key: string]: SuiviData } = {};
          sJson.data.historicalData.forEach((item: any) => {
            if (!aggregated[item.date]) {
              aggregated[item.date] = {
                date: item.date,
                totalCommander: 0,
                totalComptageFiche: 0,
                totalEcart: 0
              };
            }
            aggregated[item.date].totalCommander += item.commander;
            aggregated[item.date].totalComptageFiche += item.comptageFiche;
            aggregated[item.date].totalEcart += item.ecart;
          });
          
          setSuiviData(Object.values(aggregated).slice(-15)); // Last 15 days
        }
      }

    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setFetchError(err?.message ?? 'Erreur lors de la récupération des données');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Calculate department statistics
  const calculateDepartmentStats = (personnels: any[]) => {
    const deptMap: { [key: string]: number } = {};
    
    personnels.forEach((p: any) => {
      const dept = p.departement || p.department || 'Non spécifié';
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });
    
    return Object.entries(deptMap).map(([name, value]) => ({ name, value }));
  };

  // Initial data load
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      if (mounted) {
        await fetchDashboardData();
      }
    };

    loadData();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Derived metrics
  const monthlyDistances: MonthlyDistance[] = [
    { year: 2024, name: 'Jan', km: 1200 },
    { year: 2024, name: 'Fév', km: 900 },
    { year: 2024, name: 'Mar', km: 1100 },
    { year: 2024, name: 'Avr', km: 1500 },
    { year: 2024, name: 'Mai', km: 1300 },
    { year: 2024, name: 'Jun', km: 1000 },
    { year: 2025, name: 'Jan', km: 1400 },
    { year: 2025, name: 'Fév', km: 1250 },
    { year: 2025, name: 'Mar', km: 1050 },
    { year: 2025, name: 'Avr', km: 1600 },
    { year: 2025, name: 'Mai', km: 1150 },
    { year: 2025, name: 'Jun', km: 1700 },
  ];

  const filteredData = useMemo(
    () =>
      monthlyDistances.filter((d) => {
        if (d.year !== selectedYear) return false;
        if (selectedMonth === 'All') return true;
        return d.name === selectedMonth;
      }),
    [selectedYear, selectedMonth]
  );

  const defaultTotalKm = useMemo(() => filteredData.reduce((s, m) => s + m.km, 0), [filteredData]);

  const totalKilometers = useMemo(() => {
    const parsed = parseFloat(overrideTotalKm.replace(',', '.'));
    return isNaN(parsed) || parsed <= 0 ? defaultTotalKm : parsed;
  }, [overrideTotalKm, defaultTotalKm]);

  const forecastTotal = useMemo(() => +(fuelPrice * totalKilometers), [fuelPrice, totalKilometers]);

  const monthlyCostData = useMemo(() => 
    filteredData.map((m) => ({ 
      name: m.name, 
      km: m.km, 
      cost: +(m.km * fuelPrice) 
    })), 
    [filteredData, fuelPrice]
  );

  // Suivi chart data
  const suiviChartData = useMemo(() => {
    return suiviData.map(item => ({
      date: format(parseISO(item.date), 'dd/MM'),
      commander: item.totalCommander,
      comptage: item.totalComptageFiche,
      ecart: Math.abs(item.totalEcart)
    }));
  }, [suiviData]);

  // Performance metrics
  const performanceMetrics = useMemo(() => {
    const totalShifts = suiviData.reduce((sum, item) => sum + (item.totalCommander > 0 ? 1 : 0), 0);
    const avgCommander = suiviData.length > 0 ? 
      suiviData.reduce((sum, item) => sum + item.totalCommander, 0) / suiviData.length : 0;
    const avgEcart = suiviData.length > 0 ? 
      Math.abs(suiviData.reduce((sum, item) => sum + item.totalEcart, 0)) / suiviData.length : 0;
    
    return {
      totalShifts,
      avgCommander: Math.round(avgCommander),
      avgEcart: Math.round(avgEcart),
      efficiency: suiviData.length > 0 ? 
        Math.round((suiviData.reduce((sum, item) => sum + item.totalComptageFiche, 0) / 
                   suiviData.reduce((sum, item) => sum + item.totalCommander, 0)) * 100) : 0
    };
  }, [suiviData]);

  // Colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  const cardFade = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } };

  // Auth checks
  if (authLoading) return <div className="p-4">Chargement...</div>;
  if (!user) return <div className="p-4">Vous devez être connecté pour accéder au dashboard.</div>;

  const role = (user as any)?.role as string | undefined;
  const isSuperadmin = role === 'superadmin';
  const isAdmin = role === 'admin';
  
  if (!isAdmin && !isSuperadmin) {
    return <div className="p-4">Accès refusé — votre rôle ne permet pas d'accéder à ce dashboard.</div>;
  }

  const canSeeMoney = isSuperadmin;

  return (
    <div className="space-y-6 p-4 bg-gray-50 min-h-screen">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.36 }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Tableau de Bord</h1>
            <p className="text-gray-600 mt-1">
              Vue d'ensemble et indicateurs de performance
              {refreshing && <span className="ml-2 text-blue-600">• Actualisation...</span>}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Date Range Selector */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal bg-white",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/yyyy")} - {format(dateRange.to, "dd/MM/yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    <span>Sélectionner une période</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={(range: any) => setDateRange(range)}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            <div className="flex gap-2">
              <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(parseInt(value, 10))}>
                <SelectTrigger className="w-28 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-32 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchDashboardData}
                disabled={refreshing}
                className="bg-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>

              <Button variant="default" size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Download className="h-4 w-4" />
                Exporter
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Personnel Stats */}
        <motion.div variants={cardFade} initial="hidden" animate="visible">
          <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-800">
                    <AnimatedNumber value={personnelStats.total} />
                  </div>
                  <div className="text-sm text-gray-600">
                    Personnel • {personnelStats.active} actifs
                  </div>
                  <div className="text-xs text-green-600 font-medium">
                    Taux présence: {personnelStats.presenceRate}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Trajet Stats */}
        <motion.div variants={cardFade} initial="hidden" animate="visible" transition={{ delay: 0.02 }}>
          <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <Route className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-800">
                    <AnimatedNumber value={trajetStats.total} />
                  </div>
                  <div className="text-sm text-gray-600">
                    Trajets total
                  </div>
                  <div className="text-xs text-blue-600 font-medium">
                    {trajetStats.completed} terminés • {trajetStats.inProgress} en cours
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Suivi Performance */}
        <motion.div variants={cardFade} initial="hidden" animate="visible" transition={{ delay: 0.04 }}>
          <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-800">
                    <AnimatedNumber value={performanceMetrics.efficiency} suffix="%" />
                  </div>
                  <div className="text-sm text-gray-600">
                    Efficacité
                  </div>
                  <div className="text-xs text-purple-600 font-medium">
                    {performanceMetrics.avgCommander} moy. commandé
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Financial Forecast */}
        <motion.div variants={cardFade} initial="hidden" animate="visible" transition={{ delay: 0.06 }}>
          <Card className="border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-800">
                    {canSeeMoney ? (
                      <AnimatedNumber value={forecastTotal / 1000} suffix="k Ar" />
                    ) : (
                      <AnimatedNumber value={totalKilometers} suffix=" km" />
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {canSeeMoney ? 'Coût prévisionnel' : 'Distance totale'}
                  </div>
                  <div className="text-xs text-orange-600 font-medium">
                    {canSeeMoney ? 'Estimation transport' : 'Kilométrage total'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Suivi Performance Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
        >
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Performance Suivi
              </CardTitle>
              <CardDescription className="text-gray-600">
                Commandé vs Comptage Fiche (15 derniers jours)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={suiviChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar 
                      yAxisId="left"
                      dataKey="commander" 
                      name="Commandé" 
                      fill="#3b82f6" 
                      opacity={0.8}
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar 
                      yAxisId="left"
                      dataKey="comptage" 
                      name="Comptage Fiche" 
                      fill="#10b981" 
                      opacity={0.8}
                      radius={[2, 2, 0, 0]}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="ecart" 
                      name="Écart" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Cost/Distance Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.12 }}
        >
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                <TrendingUp className="h-5 w-5 text-green-600" />
                {canSeeMoney ? 'Coût Mensuel Estimé' : 'Distance Mensuelle'}
              </CardTitle>
              <CardDescription className="text-gray-600">
                Données filtrées par période sélectionnée
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyCostData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => 
                        canSeeMoney 
                          ? [formatAriary(value, true), 'Coût'] 
                          : [`${Math.round(value)} km`, 'Distance']
                      } 
                    />
                    <Bar 
                      dataKey={canSeeMoney ? 'cost' : 'km'} 
                      name={canSeeMoney ? 'Coût (Ar)' : 'Distance (km)'} 
                      fill={canSeeMoney ? "#f59e0b" : "#3b82f6"}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Department Distribution */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.14 }}
        >
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg text-gray-800">Répartition par Département</CardTitle>
              <CardDescription className="text-gray-600">Distribution du personnel</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={personnelStats.byDepartment}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => 
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {personnelStats.byDepartment.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[index % COLORS.length]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.16 }}
          className="space-y-4"
        >
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                <Car className="h-5 w-5 text-blue-600" />
                Statistiques Trajets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                <span className="text-sm text-gray-600">Distance moyenne</span>
                <span className="font-semibold text-blue-700">{trajetStats.averageDistance.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                <span className="text-sm text-gray-600">Taux de complétion</span>
                <span className="font-semibold text-green-700">
                  {trajetStats.total > 0 
                    ? Math.round((trajetStats.completed / trajetStats.total) * 100) 
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between items-center p-2 bg-purple-50 rounded">
                <span className="text-sm text-gray-600">Distance totale</span>
                <span className="font-semibold text-purple-700">{trajetStats.totalDistance.toFixed(0)} km</span>
              </div>
            </CardContent>
          </Card>

          {canSeeMoney && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                  <Fuel className="h-5 w-5 text-orange-600" />
                  Paramètres Coût
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm text-gray-700">Prix carburant (Ar)</Label>
                  <Input 
                    type="number" 
                    value={fuelPrice} 
                    onChange={(e) => setFuelPrice(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-gray-700">Kilométrage personnalisé</Label>
                  <Input 
                    placeholder={String(defaultTotalKm)}
                    value={overrideTotalKm}
                    onChange={(e) => setOverrideTotalKm(e.target.value)}
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Performance Metrics */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.18 }}
        >
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg text-gray-800">Indicateurs Performance</CardTitle>
              <CardDescription className="text-gray-600">Métriques de suivi clés</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-2xl font-bold text-blue-700">
                    <AnimatedNumber value={performanceMetrics.avgCommander} />
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Moyenne Commandé</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="text-2xl font-bold text-green-700">
                    <AnimatedNumber value={performanceMetrics.efficiency} suffix="%" />
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Efficacité</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                  <div className="text-2xl font-bold text-yellow-700">
                    <AnimatedNumber value={performanceMetrics.avgEcart} />
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Écart moyen</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="text-2xl font-bold text-purple-700">
                    <AnimatedNumber value={performanceMetrics.totalShifts} />
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Shifts suivis</div>
                </div>
              </div>
              
              {fetchError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{fetchError}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

// Label component for forms
const Label: FC<{ children: ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
    {children}
  </label>
);

export default Dashboard;