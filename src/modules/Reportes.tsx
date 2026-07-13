import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Eye,
  X,
  Coins,
  Lock,
  User,
  ShieldAlert,
  Loader2,
  Calendar,
  Percent,
  CheckCircle,
  Clock,
  Navigation,
  Award,
  Store,
  CreditCard
} from 'lucide-react';

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  created_at: string;
}

interface SaleRow {
  id: string;
  invoice_number: number;
  total_amount: number;
  payment_method: string;
  payment_currency: string;
  exchange_rate: number;
  paid_nio: number;
  paid_usd: number;
  status: string;
  created_at: string;
  bv_clients?: { name: string } | null;
  sale_type?: string;
  route_id?: string;
  user_id?: string;
}

interface PurchaseRow {
  id: string;
  invoice_number: string;
  supplier_name: string;
  total_amount: number;
  created_at: string;
}

interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  initial_cash_nio: number;
  expected_sales_nio: number;
  real_cash_nio: number | null;
  status: string;
  difference_notes: string | null;
  opened_by: string;
  closed_by: string | null;
}

interface SaleDetailItem {
  id: string;
  quantity: number;
  unit_price: number;
  total: number;
  bv_products?: { name: string } | null;
}

interface PurchaseDetailItem {
  id: string;
  quantity: number;
  cost: number;
  total: number;
  bv_products?: { name: string } | null;
}

interface Route {
  id: string;
  name: string;
  collaborator_id: string;
}

interface CommissionPayment {
  id: string;
  route_id: string;
  amount: number;
  payment_date: string;
  status: string;
  created_at: string;
}

interface RouteClosingRow {
  id: string;
  route_id: string;
  collaborator_id: string;
  closing_date: string;
  status: 'open' | 'closed';
  total_sales_nio: number;
  total_commission_nio: number;
  net_store_profit_nio: number;
  cash_collected_nio: number;
  credit_sales_nio: number;
  transfer_sales_nio: number;
  category_breakdown: { category: string; sales: number; commission_amount: number }[];
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  bv_routes?: { name: string } | null;
  bv_collaborators?: { name: string } | null;
}

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'financial' | 'sessions' | 'route_closings' | 'commissions'>('financial');

  // Financial Summary State (global + per channel)
  const [summary, setSummary] = useState({
    totalSales: 0,
    storeSales: 0,
    routeSales: 0,
    totalExpenses: 0,
    totalCogs: 0,
    storeCogs: 0,
    routeCogs: 0,
    totalCommissions: 0,
    netProfit: 0,
    storeProfit: 0,
    routeNetProfit: 0,
  });

  // Route Closings State
  const [routeClosings, setRouteClosings] = useState<RouteClosingRow[]>([]);
  const [selectedRouteClosure, setSelectedRouteClosure] = useState<RouteClosingRow | null>(null);

  // Lists state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRow[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<PurchaseRow[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [collaborators, setCollaborators] = useState<Record<string, string>>({});

  // Route Commissions State
  const [routes, setRoutes] = useState<Route[]>([]);
  const [commissionPayments, setCommissionPayments] = useState<CommissionPayment[]>([]);
  const [routeEarnedMap, setRouteEarnedMap] = useState<Record<string, number>>({});
  const [routePaidMap, setRoutePaidMap] = useState<Record<string, number>>({});

  // Add Expense form
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    category: 'Alquiler'
  });

  // Commission Payment Modal
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    route_id: '',
    amount: '',
    payment_date: new Date().toISOString().substring(0, 10),
    status: 'Pagado'
  });

  // Sale Detail Modal
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);
  const [saleItems, setSaleItems] = useState<SaleDetailItem[]>([]);
  const [loadingSaleItems, setLoadingSaleItems] = useState(false);

  // Purchase Detail Modal
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseDetailItem[]>([]);
  const [loadingPurchaseItems, setLoadingPurchaseItems] = useState(false);

  // Anular modal / authentication state
  const [showAnularModal, setShowAnularModal] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [anularError, setAnularError] = useState('');

  // Date filters (defaults to first day of current month to today)
  const getInitialDates = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const firstDay = new Date(y, m, 1).toISOString().substring(0, 10);
    const lastDay = today.toISOString().substring(0, 10);
    return { from: firstDay, to: lastDay };
  };

  const [dateFrom, setDateFrom] = useState(getInitialDates().from);
  const [dateTo, setDateTo] = useState(getInitialDates().to);

  useEffect(() => {
    fetchFinancialData();
  }, [dateFrom, dateTo]);

  async function fetchFinancialData() {
    setLoading(true);
    try {
      const fromTimestamp = `${dateFrom}T00:00:00.000Z`;
      const toTimestamp = `${dateTo}T23:59:59.999Z`;

      // 1. Fetch sales within date range
      const { data: salesData } = await supabase
        .from('bv_sales')
        .select('*, bv_clients(name)')
        .gte('created_at', fromTimestamp)
        .lte('created_at', toTimestamp)
        .order('created_at', { ascending: false });

      const activeSales = (salesData || []).filter(s => s.status !== 'anulada');
      const activeSaleIds = activeSales.map(s => s.id);

      // 2. Fetch sale items (COGS + commissions)
      let saleItemsData: { sale_id: string; quantity: number; unit_cost: number; commission_amount: number }[] = [];
      if (activeSaleIds.length > 0) {
        const { data } = await supabase
          .from('bv_sale_items')
          .select('sale_id, quantity, unit_cost, commission_amount')
          .in('sale_id', activeSaleIds);
        saleItemsData = data || [];
      }

      // Build a quick sale_id → sale_type map and payment-method map
      const saleTypeMap: Record<string, string> = {};
      const routeSaleIdMap: Record<string, string> = {};
      const saleCreditMap: Record<string, boolean> = {}; // true = venta a crédito (ingreso NO contabilizado aún)
      activeSales.forEach(s => {
        saleTypeMap[s.id] = s.sale_type || 'store';
        saleCreditMap[s.id] = s.payment_method === 'credit';
        if (s.sale_type === 'route' && s.route_id) routeSaleIdMap[s.id] = s.route_id;
      });

      // 3. Fetch expenses within date range
      const { data: expensesData } = await supabase
        .from('bv_expenses')
        .select('*')
        .gte('created_at', fromTimestamp)
        .lte('created_at', toTimestamp)
        .order('created_at', { ascending: false });

      // 4. Fetch purchases within date range
      const { data: purchasesData } = await supabase
        .from('bv_purchases')
        .select('*')
        .gte('created_at', fromTimestamp)
        .lte('created_at', toTimestamp)
        .order('created_at', { ascending: false });

      // 5. Fetch cash sessions (store only) within date range
      const { data: sessionsData } = await supabase
        .from('bv_cash_sessions')
        .select('*')
        .gte('opened_at', fromTimestamp)
        .lte('opened_at', toTimestamp)
        .order('created_at', { ascending: false });

      // 6. Fetch collaborators lookup
      const { data: collabData } = await supabase
        .from('bv_collaborators')
        .select('id, name');
      const collabMap: Record<string, string> = {};
      (collabData || []).forEach(c => { collabMap[c.id] = c.name; });
      setCollaborators(collabMap);

      // 7. Fetch Routes
      const { data: routesData } = await supabase
        .from('bv_routes')
        .select('*')
        .order('name', { ascending: true });
      setRoutes(routesData || []);

      // 8. Fetch Route Commission Payments (within range or simple list, we will filter by payment_date)
      const { data: paymentsData } = await supabase
        .from('bv_route_commission_payments')
        .select('*')
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo)
        .order('payment_date', { ascending: false });
      setCommissionPayments(paymentsData || []);

      // 9. Fetch Route Closings (new) within range
      const { data: routeClosingsData } = await supabase
        .from('bv_route_closings')
        .select('*, bv_routes(name), bv_collaborators(name)')
        .gte('closing_date', dateFrom)
        .lte('closing_date', dateTo)
        .order('closing_date', { ascending: false });
      setRouteClosings((routeClosingsData as RouteClosingRow[]) || []);

      // ── Per-channel calculations ──────────────────────────────────

      let storeCogs = 0;
      let routeCogs = 0;
      let totalCommissions = 0;

      saleItemsData.forEach(item => {
        // Opción A (base caja): si la venta es a crédito, su ingreso NO se contabiliza
        // en la utilidad del período, por lo tanto su costo tampoco debe restarse.
        if (saleCreditMap[item.sale_id]) return;

        const itemCogs = Number(item.quantity) * Number(item.unit_cost);
        const sType = saleTypeMap[item.sale_id];
        if (sType === 'route') {
          routeCogs += itemCogs;
          totalCommissions += Number(item.commission_amount || 0);
        } else {
          storeCogs += itemCogs;
        }
      });

      // Commission balances per route
      const routeEarned: Record<string, number> = {};
      saleItemsData.forEach(item => {
        const routeId = routeSaleIdMap[item.sale_id];
        if (routeId) {
          routeEarned[routeId] = (routeEarned[routeId] || 0) + Number(item.commission_amount || 0);
        }
      });
      setRouteEarnedMap(routeEarned);

      const routePaid: Record<string, number> = {};
      (paymentsData || []).forEach(p => {
        if (p.status === 'Pagado') {
          routePaid[p.route_id] = (routePaid[p.route_id] || 0) + Number(p.amount);
        }
      });
      setRoutePaidMap(routePaid);

      // ── Ventas netas: solo cobradas (efectivo + transferencia) ──
      // Los créditos no se suman hasta que el cliente realice un pago/abono
      const storeSalesCollected = activeSales
        .filter(s => s.sale_type !== 'route' && s.payment_method !== 'credit')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);

      const routeSalesCollected = activeSales
        .filter(s => s.sale_type === 'route' && s.payment_method !== 'credit')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);

      // Créditos pendientes (informativos, NO se suman a ganancias)
      const totalCreditPending = activeSales
        .filter(s => s.payment_method === 'credit')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);

      const totalSales = storeSalesCollected + routeSalesCollected;
      const totalCogs = storeCogs + routeCogs;
      const totalExpenses = (expensesData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const netProfit = totalSales - totalCogs - totalExpenses;
      const storeProfit = storeSalesCollected - storeCogs - totalExpenses;
      const routeNetProfit = routeSalesCollected - routeCogs - totalCommissions;

      setSummary({
        totalSales,
        storeSales: storeSalesCollected,
        routeSales: routeSalesCollected,
        totalExpenses,
        totalCogs,
        storeCogs,
        routeCogs,
        totalCommissions,
        netProfit,
        storeProfit,
        routeNetProfit,
        creditPending: totalCreditPending,
      } as any);

      setExpenses(expensesData || []);
      setRecentSales((salesData as SaleRow[]) || []);
      setRecentPurchases(purchasesData || []);
      setCashSessions(sessionsData || []);
    } catch (error) {
      const err = error as Error;
      console.error('Error fetching financial reports:', err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) {
      toast.warning('Por favor complete los campos requeridos.');
      return;
    }

    try {
      const { error } = await supabase
        .from('bv_expenses')
        .insert({
          description: newExpense.description,
          amount: parseFloat(newExpense.amount),
          category: newExpense.category
        });

      if (error) throw error;

      setShowExpenseModal(false);
      setNewExpense({ description: '', amount: '', category: 'Alquiler' });
      fetchFinancialData();
      toast.success('Gasto registrado con éxito.');
    } catch (error) {
      const err = error as Error;
      toast.error('Error registrando gasto: ' + err.message);
    }
  }

  // Handle register commission payment
  async function handleRegisterCommissionPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!newPayment.route_id || !newPayment.amount || !newPayment.payment_date) {
      toast.warning('Por favor complete todos los campos.');
      return;
    }

    setSavingPayment(true);
    try {
      const { error } = await supabase
        .from('bv_route_commission_payments')
        .insert({
          route_id: newPayment.route_id,
          amount: parseFloat(newPayment.amount),
          payment_date: new Date(newPayment.payment_date).toISOString(),
          status: newPayment.status
        });

      if (error) throw error;

      setShowCommissionModal(false);
      setNewPayment({
        route_id: '',
        amount: '',
        payment_date: new Date().toISOString().substring(0, 10),
        status: 'Pagado'
      });
      fetchFinancialData();
      toast.success('Pago de comisión registrado con éxito.');
    } catch (error) {
      const err = error as Error;
      toast.error('Error registrando pago: ' + err.message);
    } finally {
      setSavingPayment(false);
    }
  }

  // Load sale detail
  async function handleViewSaleDetails(sale: SaleRow) {
    setSelectedSale(sale);
    setSaleItems([]);
    setLoadingSaleItems(true);
    try {
      const { data, error } = await supabase
        .from('bv_sale_items')
        .select('*, bv_products(name)')
        .eq('sale_id', sale.id);
      if (error) throw error;
      setSaleItems(data || []);
    } catch (error) {
      const err = error as Error;
      console.error('Error fetching sale details:', err.message);
    } finally {
      setLoadingSaleItems(false);
    }
  }

  // Load purchase detail
  async function handleViewPurchaseDetails(purchase: PurchaseRow) {
    setSelectedPurchase(purchase);
    setPurchaseItems([]);
    setLoadingPurchaseItems(true);
    try {
      const { data, error } = await supabase
        .from('bv_purchase_items')
        .select('*, bv_products(name)')
        .eq('purchase_id', purchase.id);
      if (error) throw error;
      setPurchaseItems(data || []);
    } catch (error) {
      const err = error as Error;
      console.error('Error fetching purchase details:', err.message);
    } finally {
      setLoadingPurchaseItems(false);
    }
  }

  // Handle Void (Anulación)
  async function handleVoidSale() {
    if (!selectedSale) return;
    setAnulando(true);
    setAnularError('');
    try {
      // 1. Fetch owner email
      const { data: ownerList, error: ownerFetchError } = await supabase
        .from('bv_collaborators')
        .select('email, bv_roles(name)');

      if (ownerFetchError) throw ownerFetchError;

      const ownerEmail = (ownerList || []).find((c: Record<string, unknown>) => (c.bv_roles as Record<string, string>)?.name === 'owner')?.email;
      if (!ownerEmail) {
        throw new Error('No se encontró una cuenta de Propietario configurada en el sistema.');
      }

      // 2. Validate password via Supabase Auth API
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey
        },
        body: JSON.stringify({
          email: ownerEmail,
          password: ownerPassword
        })
      });

      if (!res.ok) {
        throw new Error('Clave del propietario incorrecta. No autorizado.');
      }

      // 3. Authenticated! Void sale using pgsql function
      const { error: voidError } = await supabase
        .rpc('bv_void_sale', { sale_uuid: selectedSale.id });

      if (voidError) throw voidError;

      toast.success('La factura ha sido anulada con éxito. El inventario y deudas han sido recalculados.');
      setShowAnularModal(false);
      setSelectedSale(null);
      setOwnerPassword('');
      fetchFinancialData();
    } catch (error) {
      const err = error as Error;
      setAnularError(err.message || 'Error al autorizar anulación.');
      toast.error('Error: ' + (err.message || 'No autorizado.'));
    } finally {
      setAnulando(false);
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Reportes y Finanzas
          </h1>
          <p className="text-gray-400 text-sm mt-1 flex items-center gap-1.5">
            Monitorea ingresos, egresos de caja, cierres, comisiones por rutas y anulación.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Tab switcher */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 p-0.5 bg-[#0d0d18]">
            <button
              onClick={() => setActiveTab('financial')}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'financial'
                  ? 'bg-neon-blue/20 text-neon-blue rounded-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Finanzas
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'sessions'
                  ? 'bg-[#8b5cf6]/20 text-[#c084fc] rounded-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Historial Caja
            </button>
            <button
              onClick={() => setActiveTab('route_closings')}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'route_closings'
                  ? 'bg-purple-500/20 text-purple-400 rounded-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Cierres de Ruta
            </button>
            <button
              onClick={() => setActiveTab('commissions')}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'commissions'
                  ? 'bg-amber-500/20 text-amber-400 rounded-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Comisiones Rutas
            </button>
          </div>

          {activeTab === 'commissions' ? (
            <button
              onClick={() => setShowCommissionModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg transition text-sm shadow-amber-500/10"
            >
              <Plus size={18} />
              Pagar Comisión
            </button>
          ) : (
            <button
              onClick={() => setShowExpenseModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-black font-bold rounded-lg transition text-sm"
            >
              <Plus size={18} />
              Registrar Gasto
            </button>
          )}

          <button
            onClick={fetchFinancialData}
            className="p-2 border border-white/10 rounded-lg bg-[#0d0d18] hover:bg-white/5 transition text-gray-400"
            title="Actualizar datos"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Date Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-[#0d0d18]/50 border border-white/5 p-3 rounded-xl">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Período de Reportes:</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-[#030308] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-neon-blue"
          />
          <span className="text-gray-500 text-xs">al</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-[#030308] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-neon-blue"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
        </div>
      ) : activeTab === 'financial' ? (
        <>
          {/* Global Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Ventas Cobradas</span>
                <span className="text-2xl font-black font-mono text-white">C$ {summary.totalSales.toFixed(2)}</span>
                <div className="flex gap-2 text-[10px] font-mono">
                  <span className="text-neon-blue">🏪 C$ {summary.storeSales.toFixed(2)}</span>
                  <span className="text-purple-400">🚗 C$ {summary.routeSales.toFixed(2)}</span>
                </div>
              </div>
              <div className="p-3 bg-neon-blue/10 rounded-lg text-neon-blue"><TrendingUp size={20} /></div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-amber-400 text-xs font-semibold uppercase block">Créditos Pendientes</span>
                <span className="text-2xl font-black font-mono text-amber-400">C$ {((summary as any).creditPending || 0).toFixed(2)}</span>
                <div className="text-[10px] font-mono text-amber-500/70">No incluidos en utilidad</div>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-lg text-amber-400"><CreditCard size={20} /></div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Gastos + Comisiones</span>
                <span className="text-2xl font-black font-mono text-rose-500">C$ {(summary.totalExpenses + summary.totalCommissions).toFixed(2)}</span>
                <div className="flex gap-2 text-[10px] font-mono">
                  <span className="text-rose-400">Gastos: C$ {summary.totalExpenses.toFixed(2)}</span>
                  <span className="text-amber-400">Comis.: C$ {summary.totalCommissions.toFixed(2)}</span>
                </div>
              </div>
              <div className="p-3 bg-rose-500/10 rounded-lg text-rose-500"><TrendingDown size={20} /></div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-neon-emerald/20 bg-neon-emerald/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-neon-emerald text-xs font-semibold uppercase block">Utilidad Neta</span>
                <span className="text-2xl font-black font-mono text-neon-emerald">C$ {summary.netProfit.toFixed(2)}</span>
                <div className="flex gap-2 text-[10px] font-mono">
                  <span className="text-neon-blue">🏪 C$ {summary.storeProfit.toFixed(2)}</span>
                  <span className="text-purple-400">🚗 C$ {summary.routeNetProfit.toFixed(2)}</span>
                </div>
              </div>
              <div className="p-3 bg-neon-emerald/10 rounded-lg text-neon-emerald"><DollarSign size={20} /></div>
            </div>
          </div>

          {/* Per-channel breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Store channel */}
            <div className="glass-panel p-4 rounded-xl border border-neon-blue/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <Store size={14} className="text-neon-blue" />
                Tienda Local
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Ventas:</span><span className="font-mono text-white">C$ {summary.storeSales.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Costo merch.:</span><span className="font-mono text-gray-400">− C$ {summary.storeCogs.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Gastos oper.:</span><span className="font-mono text-rose-400">− C$ {summary.totalExpenses.toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-white/5 pt-2">
                  <span className="text-neon-blue font-bold">Utilidad Tienda:</span>
                  <span className={`font-mono font-bold ${summary.storeProfit >= 0 ? 'text-neon-emerald' : 'text-rose-500'}`}>C$ {summary.storeProfit.toFixed(2)}</span>
                </div>
              </div>
            </div>
            {/* Route channel */}
            <div className="glass-panel p-4 rounded-xl border border-purple-500/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <Navigation size={14} className="text-purple-400" />
                Rutas de Venta
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Ventas brutas:</span><span className="font-mono text-white">C$ {summary.routeSales.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Costo merch.:</span><span className="font-mono text-gray-400">− C$ {summary.routeCogs.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-amber-400">Comis. vendedores:</span><span className="font-mono text-amber-400">− C$ {summary.totalCommissions.toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-white/5 pt-2">
                  <span className="text-purple-400 font-bold">Ganancia Neta Ruta:</span>
                  <span className={`font-mono font-bold ${summary.routeNetProfit >= 0 ? 'text-neon-emerald' : 'text-rose-500'}`}>C$ {summary.routeNetProfit.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Sales (Left) */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="text-neon-blue" size={18} />
                Registro de Ventas y Facturas
              </h2>
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[450px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                        <th className="py-3 px-4">Factura / Fecha</th>
                        <th className="py-3 px-4">Cliente</th>
                        <th className="py-3 px-4">Método</th>
                        <th className="py-3 px-4">Origen</th>
                        <th className="py-3 px-4">Vendedor</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4 text-center">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs font-sans">
                      {recentSales.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-gray-500">No hay ventas registradas.</td>
                        </tr>
                      ) : (
                        recentSales.map((s) => (
                          <tr key={s.id} className={`hover:bg-white/2 transition ${s.status === 'anulada' ? 'opacity-40' : ''}`}>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-white block">
                                {s.invoice_number ? `FAC-${String(s.invoice_number).padStart(6, '0')}` : 'S/N'}
                              </span>
                              <span className="text-gray-500 text-[10px]">
                                {new Date(s.created_at).toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-white font-medium">{s.bv_clients?.name || 'Público General'}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                s.payment_method === 'cash' ? 'bg-neon-emerald/20 text-neon-emerald' : s.payment_method === 'transfer' ? 'bg-neon-blue/20 text-neon-blue' : 'bg-amber-500/20 text-amber-500'
                              }`}>
                                {s.payment_method === 'cash' ? 'Efectivo' : s.payment_method === 'transfer' ? 'Transf.' : 'Crédito'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {s.sale_type === 'route' ? (
                                <span className="text-purple-400 font-semibold text-xs">🚗 Ruta</span>
                              ) : (
                                <span className="text-emerald-400 font-semibold text-xs">🏪 Tienda</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold text-gray-300">
                              {s.user_id && collaborators[s.user_id] ? collaborators[s.user_id] : (s.user_id ? 'Usuario ' + s.user_id.substring(0,4) : 'Admin/Caja')}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                s.status === 'anulada' ? 'bg-rose-500/20 text-rose-400' : 'bg-neon-emerald/20 text-neon-emerald'
                              }`}>
                                {s.status === 'anulada' ? 'Anulada' : 'Válida'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-white font-mono">
                              C$ {s.total_amount.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => handleViewSaleDetails(s)}
                                className="p-1.5 hover:bg-neon-blue/10 rounded-lg text-neon-blue transition"
                                title="Ver Detalle de Ítems"
                              >
                                <Eye size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Expenses & Purchases (Right) */}
            <div className="space-y-6">
              
              {/* Expenses Area */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingDown className="text-rose-500" size={18} />
                  Gastos Operativos
                </h2>
                <div className="glass-panel rounded-xl p-4 max-h-[220px] overflow-y-auto space-y-2">
                  {expenses.length === 0 ? (
                    <p className="text-gray-500 text-xs py-4 text-center">No se han registrado gastos.</p>
                  ) : (
                    expenses.map((e) => (
                      <div key={e.id} className="bg-white/2 border border-white/5 p-2.5 rounded-lg flex justify-between items-center text-xs">
                        <div>
                          <span className="font-semibold text-white block">{e.description}</span>
                          <span className="text-[10px] text-gray-500 uppercase font-bold">{e.category}</span>
                        </div>
                        <span className="font-bold text-rose-500 font-mono">C$ {e.amount.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Supplier Purchases Area */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="text-emerald-500" size={18} />
                  Facturas y Compras (Proveedores)
                </h2>
                <div className="glass-panel rounded-xl p-4 max-h-[220px] overflow-y-auto space-y-2">
                  {recentPurchases.length === 0 ? (
                    <p className="text-gray-500 text-xs py-4 text-center">No hay compras ingresadas.</p>
                  ) : (
                    recentPurchases.map((p) => (
                      <div key={p.id} className="bg-white/2 border border-white/5 p-2.5 rounded-lg flex justify-between items-center text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-white block truncate">{p.supplier_name}</span>
                          <span className="text-[10px] text-gray-500 font-mono">Factura: {p.invoice_number}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-emerald-500 font-mono shrink-0">C$ {p.total_amount.toFixed(2)}</span>
                          <button
                            onClick={() => handleViewPurchaseDetails(p)}
                            className="p-1 hover:bg-emerald-500/10 rounded text-emerald-400 transition"
                            title="Ver detalle"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        </>
      ) : activeTab === 'sessions' ? (
        /* ── Cash Sessions Tab (Historial de Caja) (NIO Only) ────────── */
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="text-purple-400" size={18} />
            Historial de Aperturas y Cierres de Caja (Local Físico)
          </h2>
          <div className="glass-panel rounded-xl overflow-hidden shadow-card-glow">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-5">Apertura / Fecha</th>
                    <th className="py-3.5 px-5">Cierre / Fecha</th>
                    <th className="py-3.5 px-5 text-right">Inicial (C$)</th>
                    <th className="py-3.5 px-5 text-right">Esperado (C$)</th>
                    <th className="py-3.5 px-5 text-right">Reportado (C$)</th>
                    <th className="py-3.5 px-5">Responsable</th>
                    <th className="py-3.5 px-5">Diferencia / Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-sans text-gray-300">
                  {cashSessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">No se han registrado sesiones de caja.</td>
                    </tr>
                  ) : (
                    cashSessions.map((cs) => {
                      const isClosed = cs.status === 'closed';
                      const expected = cs.initial_cash_nio + cs.expected_sales_nio;
                      const real = cs.real_cash_nio || 0;
                      const diff = real - expected;
                      const conciliation = !isClosed ? null :
                        Math.abs(diff) < 0.01 ? 'conciliado' :
                        diff < 0 ? 'faltante' : 'sobrante';
                      return (
                        <tr key={cs.id} className="hover:bg-white/2 transition">
                          <td className="py-3.5 px-5">
                            <span className="font-semibold text-white block">Sesión ID: {cs.id.substring(0, 8)}</span>
                            <span className="text-gray-500 text-[10px]">{new Date(cs.opened_at).toLocaleString()}</span>
                          </td>
                          <td className="py-3.5 px-5 text-gray-400">
                            {cs.closed_at ? (
                              <>
                                <span className="text-white block font-medium">Cerrada</span>
                                <span className="text-gray-500 text-[10px]">{new Date(cs.closed_at).toLocaleString()}</span>
                              </>
                            ) : (
                              <span className="text-emerald-400 font-bold uppercase tracking-wider">Abierta / Activa</span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-white">
                            C$ {cs.initial_cash_nio.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-white">
                            C$ {cs.expected_sales_nio.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-white">
                            {isClosed ? (
                              <span>C$ {real.toFixed(2)}</span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="flex flex-col">
                              <span className="text-white flex items-center gap-1">
                                <User size={10} className="text-gray-500" />
                                {collaborators[cs.opened_by] || 'Cajero'}
                              </span>
                              {cs.closed_by && (
                                <span className="text-gray-500 text-[10px] mt-0.5">
                                  Cierre: {collaborators[cs.closed_by] || 'Cajero'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-5">
                            {isClosed ? (
                              <div className="space-y-1">
                                {/* Badge de Conciliación */}
                                {conciliation === 'conciliado' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-neon-emerald/20 text-neon-emerald">
                                    <CheckCircle size={10} /> Conciliado
                                  </span>
                                )}
                                {conciliation === 'faltante' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400">
                                    <TrendingDown size={10} /> Faltante C$ {Math.abs(diff).toFixed(2)}
                                  </span>
                                )}
                                {conciliation === 'sobrante' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                                    <TrendingUp size={10} /> Sobrante C$ {diff.toFixed(2)}
                                  </span>
                                )}
                                <span className="text-gray-500 text-[10px] block truncate">{cs.difference_notes || 'Sin observaciones'}</span>
                              </div>
                            ) : (
                              <span className="text-gray-500 font-medium">En curso...</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'route_closings' ? (
        /* ── Route Closings Tab (Cierres de Ruta) ────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Route Closings List */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Navigation className="text-purple-400" size={18} />
              Historial de Cierres de Ruta
            </h2>
            <div className="glass-panel rounded-xl overflow-hidden shadow-card-glow">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                      <th className="py-3.5 px-5">Fecha</th>
                      <th className="py-3.5 px-5">Ruta / Vendedor</th>
                      <th className="py-3.5 px-5 text-right">Ventas (C$)</th>
                      <th className="py-3.5 px-5 text-right">Comisión (C$)</th>
                      <th className="py-3.5 px-5 text-right">Neto Vet. (C$)</th>
                      <th className="py-3.5 px-5">Estado</th>
                      <th className="py-3.5 px-5 text-center">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs font-sans text-gray-300">
                    {routeClosings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-500">
                          No hay cierres de ruta registrados. Inicia una jornada de ruta en el módulo de Caja.
                        </td>
                      </tr>
                    ) : (
                      routeClosings.map((rc) => (
                        <tr
                          key={rc.id}
                          className={`hover:bg-white/2 transition cursor-pointer ${selectedRouteClosure?.id === rc.id ? 'bg-purple-500/5' : ''}`}
                          onClick={() => setSelectedRouteClosure(selectedRouteClosure?.id === rc.id ? null : rc)}
                        >
                          <td className="py-3.5 px-5 font-mono text-gray-400">{new Date(rc.closing_date).toLocaleDateString()}</td>
                          <td className="py-3.5 px-5">
                            <span className="font-semibold text-white block">{rc.bv_routes?.name || 'Ruta'}</span>
                            <span className="text-gray-500 text-[10px]">{rc.bv_collaborators?.name || 'Vendedor'}</span>
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-white font-bold">
                            C$ {rc.total_sales_nio.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-amber-400 font-bold">
                            C$ {rc.total_commission_nio.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono font-bold text-neon-emerald">
                            C$ {rc.net_store_profit_nio.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                              rc.status === 'closed'
                                ? 'bg-neon-emerald/20 text-neon-emerald'
                                : 'bg-purple-500/20 text-purple-400'
                            }`}>
                              {rc.status === 'closed' ? 'Cerrado' : 'Abierto'}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <button className="p-1.5 hover:bg-purple-500/10 rounded-lg text-purple-400 transition">
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Route Closing Detail Panel */}
          <div className="space-y-4">
            {selectedRouteClosure ? (
              <div className="glass-panel rounded-xl overflow-hidden border border-purple-500/20">
                <div className="p-4 border-b border-white/5 bg-purple-500/5">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Award size={14} className="text-amber-400" />
                    Detalle del Cierre
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedRouteClosure.bv_routes?.name} — {new Date(selectedRouteClosure.closing_date).toLocaleDateString()}</p>
                </div>
                <div className="p-4 space-y-3">
                  {/* Payment method split */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#0d0d18] border border-white/5 p-2 rounded-lg text-center">
                      <span className="text-gray-400 text-[9px] uppercase block">Efectivo</span>
                      <span className="font-mono text-white text-xs font-bold">C$ {selectedRouteClosure.cash_collected_nio.toFixed(2)}</span>
                    </div>
                    <div className="bg-[#0d0d18] border border-white/5 p-2 rounded-lg text-center">
                      <span className="text-gray-400 text-[9px] uppercase block">Crédito</span>
                      <span className="font-mono text-amber-400 text-xs font-bold">C$ {selectedRouteClosure.credit_sales_nio.toFixed(2)}</span>
                    </div>
                    <div className="bg-[#0d0d18] border border-white/5 p-2 rounded-lg text-center">
                      <span className="text-gray-400 text-[9px] uppercase block">Transfer.</span>
                      <span className="font-mono text-neon-blue text-xs font-bold">C$ {selectedRouteClosure.transfer_sales_nio.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Category breakdown */}
                  <div className="bg-[#0d0d18] rounded-lg overflow-hidden border border-white/5">
                    <div className="px-3 py-2 bg-white/2 border-b border-white/5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Comisiones por Categoría</span>
                    </div>
                    {(selectedRouteClosure.category_breakdown || []).length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-3">Sin desglose disponible.</p>
                    ) : (
                      (selectedRouteClosure.category_breakdown || []).map((row) => (
                        <div key={row.category} className="flex justify-between items-center px-3 py-2 border-b border-white/5 last:border-0 text-xs">
                          <div>
                            <span className="text-white font-semibold block">{row.category}</span>
                            <span className="text-gray-500 font-mono">C$ {row.sales.toFixed(2)}</span>
                          </div>
                          <span className="text-amber-400 font-bold font-mono">C$ {row.commission_amount.toFixed(2)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Summary */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">Total Ventas:</span><span className="font-mono text-white">C$ {selectedRouteClosure.total_sales_nio.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-amber-400">Total Comisión:</span><span className="font-mono text-amber-400">− C$ {selectedRouteClosure.total_commission_nio.toFixed(2)}</span></div>
                    <div className="flex justify-between pt-1.5 border-t border-white/5">
                      <span className="text-neon-emerald font-bold">Ganancia Neta:</span>
                      <span className="font-mono font-bold text-neon-emerald">C$ {selectedRouteClosure.net_store_profit_nio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-6 border border-white/5 text-center">
                <Navigation size={28} className="text-purple-400 mx-auto mb-2 opacity-50" />
                <p className="text-gray-500 text-xs">Selecciona un cierre de la lista para ver el desglose de comisiones por categoría.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Commission Payments Tab (Comisiones por Ruta) ────────── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Commissions Table (Left 2 columns) */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Percent className="text-amber-400" size={18} />
              Balance de Comisiones por Ruta
            </h2>
            <div className="glass-panel rounded-xl overflow-hidden shadow-card-glow">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                      <th className="py-3.5 px-5">Ruta</th>
                      <th className="py-3.5 px-5">Colaborador</th>
                      <th className="py-3.5 px-5 text-right">Comisión Acumulada</th>
                      <th className="py-3.5 px-5 text-right">Monto Pagado</th>
                      <th className="py-3.5 px-5 text-right">Balance Pendiente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs font-sans text-gray-300">
                    {routes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-500">No se encontraron rutas registradas.</td>
                      </tr>
                    ) : (
                      routes.map((route) => {
                        const earned = routeEarnedMap[route.id] || 0;
                        const paid = routePaidMap[route.id] || 0;
                        const pending = earned - paid;
                        return (
                          <tr key={route.id} className="hover:bg-white/2 transition">
                            <td className="py-3.5 px-5 font-semibold text-white">{route.name}</td>
                            <td className="py-3.5 px-5 text-gray-400 flex items-center gap-1.5 mt-1 border-0">
                              <User size={12} className="text-gray-500" />
                              {collaborators[route.collaborator_id] || 'Sin asignar'}
                            </td>
                            <td className="py-3.5 px-5 text-right font-mono text-white">
                              C$ {earned.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-5 text-right font-mono text-neon-emerald">
                              C$ {paid.toFixed(2)}
                            </td>
                            <td className={`py-3.5 px-5 text-right font-mono font-bold ${pending > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                              C$ {pending.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Commissions Payment History */}
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar size={16} className="text-neon-blue" />
                Historial de Transacciones de Pago
              </h3>
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[250px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/3 text-gray-400 font-semibold text-[10px] uppercase tracking-wider">
                        <th className="py-2.5 px-4">Fecha Pago</th>
                        <th className="py-2.5 px-4">Ruta</th>
                        <th className="py-2.5 px-4">Estado</th>
                        <th className="py-2.5 px-4 text-right">Monto Pagado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                      {commissionPayments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-gray-500">No hay pagos registrados.</td>
                        </tr>
                      ) : (
                        commissionPayments.map((p) => {
                          const routeName = routes.find(r => r.id === p.route_id)?.name || 'Ruta Desconocida';
                          return (
                            <tr key={p.id} className="hover:bg-white/2 transition">
                              <td className="py-2.5 px-4 font-mono text-gray-400">
                                {new Date(p.payment_date).toLocaleDateString()}
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-white">{routeName}</td>
                              <td className="py-2.5 px-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center gap-1 w-fit ${
                                  p.status === 'Pagado' ? 'bg-neon-emerald/20 text-neon-emerald' : 'bg-amber-500/20 text-amber-500'
                                }`}>
                                  {p.status === 'Pagado' ? <CheckCircle size={10} /> : <Clock size={10} />}
                                  {p.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-white">
                                C$ {p.amount.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Explanation info block */}
          <div className="lg:col-span-1 space-y-4">
            <div className="glass-panel p-5 rounded-xl border border-white/5 space-y-4">
              <h3 className="font-bold text-white text-sm">Resumen de Comisiones</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Las comisiones son calculadas de forma automática al momento de registrar ventas asignadas a una ruta.
              </p>
              <div className="p-3 bg-[#0d0d18] border border-white/5 rounded-lg text-xs space-y-2">
                <div className="flex justify-between text-gray-400">
                  <span>Comisión Total Acumulada:</span>
                  <span className="font-mono text-white">
                    C$ {Object.values(routeEarnedMap).reduce((a, b) => a + b, 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-neon-emerald">
                  <span>Monto Pagado:</span>
                  <span className="font-mono">
                    C$ {Object.values(routePaidMap).reduce((a, b) => a + b, 0).toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-white/5 my-1" />
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>Balance Pendiente:</span>
                  <span className="font-mono">
                    C$ {Math.max(0, Object.values(routeEarnedMap).reduce((a, b) => a + b, 0) - Object.values(routePaidMap).reduce((a, b) => a + b, 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Expense Modal ─────────────────────────────────────────── */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 shadow-2xl relative border border-rose-500/20">
            <h2 className="text-lg font-bold text-white mb-1">Registrar Gasto</h2>
            <p className="text-gray-400 text-xs mb-4">Ingrese un egreso de caja para mantener el balance neto.</p>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Descripción del Gasto *</label>
                <input
                  type="text"
                  required
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  placeholder="Ej: Pago de Luz local"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Monto (C$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Categoría</label>
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                >
                  <option value="Alquiler">Alquiler / Renta</option>
                  <option value="Servicios">Servicios Básicos (Agua/Luz/Net)</option>
                  <option value="Salarios">Salarios / Planilla</option>
                  <option value="Suministros">Suministros Oficina / Limpieza</option>
                  <option value="Otros">Otros egresos</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-black font-bold rounded-lg transition text-sm"
                >
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Registrar Pago de Comisión Modal ────────────────────────── */}
      {showCommissionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 shadow-2xl relative border border-amber-500/20">
            <h2 className="text-lg font-bold text-white mb-1">Registrar Pago de Comisión</h2>
            <p className="text-gray-400 text-xs mb-4">Ingrese un desembolso para liquidar comisiones de una ruta.</p>
            <form onSubmit={handleRegisterCommissionPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Seleccionar Ruta *</label>
                <select
                  required
                  value={newPayment.route_id}
                  onChange={(e) => setNewPayment({ ...newPayment, route_id: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                >
                  <option value="">Seleccione una ruta...</option>
                  {routes.map(r => {
                    const earned = routeEarnedMap[r.id] || 0;
                    const paid = routePaidMap[r.id] || 0;
                    const pending = earned - paid;
                    const collabName = collaborators[r.collaborator_id] || 'Sin asignar';
                    return (
                      <option key={r.id} value={r.id}>
                        {r.name} — {collabName} (Pendiente: C$ {pending.toFixed(2)})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Monto del Pago (C$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={newPayment.amount}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Fecha de Transacción *</label>
                <input
                  type="date"
                  required
                  value={newPayment.payment_date}
                  onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Estado de Pago</label>
                <select
                  value={newPayment.status}
                  onChange={(e) => setNewPayment({ ...newPayment, status: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                >
                  <option value="Pagado">Pagado</option>
                  <option value="Pendiente de pago">Pendiente de pago</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCommissionModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg transition text-sm disabled:opacity-50"
                >
                  {savingPayment ? 'Guardando...' : 'Guardar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Sale Detail Modal (Drill-Down & Anulación) ───────────────── */}
      {selectedSale && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-xl rounded-xl p-6 shadow-2xl relative border border-white/10 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="text-neon-blue" size={20} />
                  Detalle de Venta {selectedSale.invoice_number ? `FAC-${String(selectedSale.invoice_number).padStart(6, '0')}` : 'S/N'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(selectedSale.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-gray-500 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sale Summary Strip */}
            <div className="grid grid-cols-3 gap-3 bg-[#0d0d18] border border-white/5 p-3 rounded-lg text-xs mb-4">
              <div>
                <span className="text-gray-500 block">Cliente:</span>
                <span className="font-semibold text-white">{selectedSale.bv_clients?.name || 'Público General'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Método de Pago:</span>
                <span className="font-semibold text-white capitalize">{selectedSale.payment_method === 'cash' ? 'Efectivo' : selectedSale.payment_method === 'transfer' ? 'Transferencia' : 'Crédito'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Estado:</span>
                <span className={`font-semibold ${selectedSale.status === 'anulada' ? 'text-rose-400' : 'text-neon-emerald'}`}>
                  {selectedSale.status === 'anulada' ? 'Anulada' : 'Válida'}
                </span>
              </div>
            </div>

            {/* Sale Items Table */}
            <div className="flex-1 overflow-y-auto mb-4 border border-white/5 rounded-lg">
              {loadingSaleItems ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="animate-spin text-neon-blue" size={24} />
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-4">Producto</th>
                      <th className="py-2.5 px-4 text-center">Cantidad</th>
                      <th className="py-2.5 px-4 text-right">Precio Unit.</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {saleItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">No se encontraron productos en esta venta.</td>
                      </tr>
                    ) : (
                      saleItems.map((item) => (
                        <tr key={item.id} className="text-gray-300">
                          <td className="py-2.5 px-4 font-semibold text-white">{item.bv_products?.name || 'Desconocido'}</td>
                          <td className="py-2.5 px-4 text-center font-mono">{item.quantity}</td>
                          <td className="py-2.5 px-4 text-right font-mono">C$ {item.unit_price.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-white">C$ {item.total.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Total Area */}
            <div className="flex justify-between items-center border-t border-white/5 pt-4">
              <div>
                {selectedSale.status !== 'anulada' && (
                  <button
                    onClick={() => setShowAnularModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 rounded-lg text-xs font-bold transition"
                  >
                    <Trash2 size={13} />
                    Anular Factura
                  </button>
                )}
              </div>
              <div className="text-right">
                <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider block">Total Facturado</span>
                <span className="text-xl font-black font-mono text-white">C$ {selectedSale.total_amount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Purchase Detail Modal (Proveedores) ─────────────────────── */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg rounded-xl p-6 shadow-2xl relative border border-white/10 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="text-emerald-500" size={20} />
                  Detalle de Compra {selectedPurchase.invoice_number}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(selectedPurchase.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="text-gray-500 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-[#0d0d18] border border-white/5 p-3 rounded-lg text-xs mb-4">
              <span className="text-gray-500 block">Proveedor:</span>
              <span className="font-semibold text-white">{selectedPurchase.supplier_name}</span>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 border border-white/5 rounded-lg">
              {loadingPurchaseItems ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="animate-spin text-neon-blue" size={24} />
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-4">Producto</th>
                      <th className="py-2.5 px-4 text-center">Cantidad</th>
                      <th className="py-2.5 px-4 text-right">Costo Unit.</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {purchaseItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">No se encontraron ítems en esta compra.</td>
                      </tr>
                    ) : (
                      purchaseItems.map((item) => (
                        <tr key={item.id} className="text-gray-300">
                          <td className="py-2.5 px-4 font-semibold text-white">{item.bv_products?.name || 'Desconocido'}</td>
                          <td className="py-2.5 px-4 text-center font-mono">{item.quantity}</td>
                          <td className="py-2.5 px-4 text-right font-mono">C$ {item.cost.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-white">C$ {item.total.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="text-right pt-2 border-t border-white/5">
              <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider block">Total Invertido</span>
              <span className="text-xl font-black font-mono text-emerald-400">C$ {selectedPurchase.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Owner Password Authentication Modal ────────────────────── */}
      {showAnularModal && selectedSale && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 shadow-2xl relative border border-rose-500/30 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-500">
              <ShieldAlert size={24} />
              <h3 className="text-lg font-bold text-white">Autorización del Propietario</h3>
            </div>
            
            <p className="text-xs text-gray-400">
              Estás intentando anular la factura <b className="text-white">FAC-{String(selectedSale.invoice_number).padStart(6, '0')}</b> por un monto de <b className="text-white">C$ {selectedSale.total_amount.toFixed(2)}</b>.
              Esta acción requiere la clave del propietario administrador (owner) para continuar.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVoidSale();
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 flex items-center gap-1">
                  <Lock size={10} /> Contraseña del Propietario
                </label>
                <input
                  type="password"
                  required
                  placeholder="Ingrese clave..."
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-rose-500 text-sm"
                  autoFocus
                />
              </div>

              {anularError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs">
                  {anularError}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAnularModal(false);
                    setOwnerPassword('');
                    setAnularError('');
                  }}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-xs font-bold"
                  disabled={anulando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition text-xs flex items-center gap-1.5"
                  disabled={anulando}
                >
                  {anulando ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Autorizando...
                    </>
                  ) : (
                    'Confirmar Anulación'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
