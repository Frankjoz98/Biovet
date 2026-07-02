import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ClipboardList,
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
  Loader2
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
  initial_cash_usd: number;
  expected_sales_nio: number;
  expected_sales_usd: number;
  real_cash_nio: number | null;
  real_cash_usd: number | null;
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

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'financial' | 'sessions'>('financial');

  // Financial Summary State
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalExpenses: 0,
    totalCogs: 0, // Cost of goods sold
    netProfit: 0
  });

  // Lists state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRow[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<PurchaseRow[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [collaborators, setCollaborators] = useState<Record<string, string>>({});

  // Add Expense form
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    category: 'Alquiler'
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

  useEffect(() => {
    fetchFinancialData();
  }, []);

  async function fetchFinancialData() {
    setLoading(true);
    try {
      // 1. Fetch sales
      const { data: salesData } = await supabase
        .from('bv_sales')
        .select('*, bv_clients(name)')
        .order('created_at', { ascending: false });

      // 2. Fetch sale items to calculate COGS (only for active, non-voided sales)
      const activeSaleIds = (salesData || [])
        .filter(s => s.status !== 'anulada')
        .map(s => s.id);

      let saleItemsData: any[] = [];
      if (activeSaleIds.length > 0) {
        const { data } = await supabase
          .from('bv_sale_items')
          .select('quantity, unit_cost')
          .in('sale_id', activeSaleIds);
        saleItemsData = data || [];
      }

      // 3. Fetch expenses
      const { data: expensesData } = await supabase
        .from('bv_expenses')
        .select('*')
        .order('created_at', { ascending: false });

      // 4. Fetch purchases
      const { data: purchasesData } = await supabase
        .from('bv_purchases')
        .select('*')
        .order('created_at', { ascending: false });

      // 5. Fetch cash sessions
      const { data: sessionsData } = await supabase
        .from('bv_cash_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      // 6. Fetch collaborators lookup list
      const { data: collabData } = await supabase
        .from('bv_collaborators')
        .select('id, name');
      const collabMap: Record<string, string> = {};
      (collabData || []).forEach(c => {
        collabMap[c.id] = c.name;
      });
      setCollaborators(collabMap);

      // Calculations (only calculate sales totals for active, non-voided sales)
      const totalSales = (salesData || [])
        .filter(s => s.status !== 'anulada')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);

      const totalExpenses = (expensesData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const totalCogs = saleItemsData.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unit_cost)), 0);
      const netProfit = totalSales - totalCogs - totalExpenses;

      setSummary({
        totalSales,
        totalExpenses,
        totalCogs,
        netProfit
      });

      setExpenses(expensesData || []);
      setRecentSales((salesData as any) || []);
      setRecentPurchases(purchasesData || []);
      setCashSessions(sessionsData || []);
    } catch (err: any) {
      console.error('Error fetching financial reports:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) {
      alert('Por favor complete los campos requeridos.');
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
      alert('Gasto registrado con éxito.');
    } catch (err: any) {
      alert('Error registrando gasto: ' + err.message);
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
    } catch (err: any) {
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
    } catch (err: any) {
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

      const ownerEmail = (ownerList || []).find((c: any) => c.bv_roles?.name === 'owner')?.email;
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

      // 3. Authenticated! Void sale using the pgsql function we created
      const { error: voidError } = await supabase
        .rpc('bv_void_sale', { sale_uuid: selectedSale.id });

      if (voidError) throw voidError;

      alert('La factura ha sido anulada con éxito. El inventario y deudas han sido recalculados.');
      setShowAnularModal(false);
      setSelectedSale(null);
      setOwnerPassword('');
      fetchFinancialData();
    } catch (err: any) {
      setAnularError(err.message || 'Error al autorizar anulación.');
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
            Reportes y Auditoría
          </h1>
          <p className="text-gray-400 text-sm mt-1">Monitorea ingresos, egresos de caja, cierres, detalle de facturas y anulación.</p>
        </div>
        <div className="flex items-center gap-3">
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
                  ? 'bg-purple-500/20 text-purple-400 rounded-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Historial de Caja
            </button>
          </div>

          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-black font-bold rounded-lg transition text-sm"
          >
            <Plus size={18} />
            Registrar Gasto
          </button>
          <button
            onClick={fetchFinancialData}
            className="p-2 border border-white/10 rounded-lg bg-[#0d0d18] hover:bg-white/5 transition text-gray-400"
            title="Actualizar datos"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
        </div>
      ) : activeTab === 'financial' ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Ventas */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Ventas Activas</span>
                <span className="text-2xl font-black font-mono text-white">C$ {summary.totalSales.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-neon-blue/10 rounded-lg text-neon-blue">
                <TrendingUp size={20} />
              </div>
            </div>

            {/* Costo Mercancía */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Inversión Ventas (Costo)</span>
                <span className="text-2xl font-black font-mono text-gray-400">C$ {summary.totalCogs.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-white/5 rounded-lg text-gray-400">
                <ClipboardList size={20} />
              </div>
            </div>

            {/* Gastos */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Gastos Operativos</span>
                <span className="text-2xl font-black font-mono text-rose-500">C$ {summary.totalExpenses.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-rose-500/10 rounded-lg text-rose-500">
                <TrendingDown size={20} />
              </div>
            </div>

            {/* Ganancias */}
            <div className="glass-panel p-5 rounded-xl border flex items-center justify-between shadow-card-glow border-neon-emerald/20 bg-neon-emerald/5">
              <div className="space-y-1">
                <span className="text-neon-emerald text-xs font-semibold uppercase block">Utilidad Neta</span>
                <span className="text-2xl font-black font-mono text-neon-emerald">C$ {summary.netProfit.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-neon-emerald/10 rounded-lg text-neon-emerald">
                <DollarSign size={20} />
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
      ) : (
        /* ── Cash Sessions Tab (Historial de Caja) ─────────────────── */
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="text-purple-400" size={18} />
            Historial de Aperturas y Cierres de Caja
          </h2>
          <div className="glass-panel rounded-xl overflow-hidden shadow-card-glow">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-5">Apertura / Fecha</th>
                    <th className="py-3.5 px-5">Cierre / Fecha</th>
                    <th className="py-3.5 px-5 text-right">Inicial (NIO/USD)</th>
                    <th className="py-3.5 px-5 text-right">Esperado (NIO/USD)</th>
                    <th className="py-3.5 px-5 text-right">Reportado (NIO/USD)</th>
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
                          <td className="py-3.5 px-5 text-right font-mono text-gray-400">
                            <div className="text-white">C$ {cs.initial_cash_nio.toFixed(2)}</div>
                            <div className="text-[10px] text-gray-500">$ {cs.initial_cash_usd.toFixed(2)}</div>
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-gray-400">
                            <div className="text-white">C$ {cs.expected_sales_nio.toFixed(2)}</div>
                            <div className="text-[10px] text-gray-500">$ {cs.expected_sales_usd.toFixed(2)}</div>
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-gray-400">
                            {isClosed ? (
                              <>
                                <div className="text-white">C$ {(cs.real_cash_nio || 0).toFixed(2)}</div>
                                <div className="text-[10px] text-gray-500">$ {(cs.real_cash_usd || 0).toFixed(2)}</div>
                              </>
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
                          <td className="py-3.5 px-5 max-w-[200px] truncate text-gray-400">
                            {isClosed ? (
                              <div>
                                <span className="font-semibold block text-amber-500">Cerrado</span>
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
