import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Search, ShoppingCart, Trash2, User, CreditCard, DollarSign, ArrowRight, RefreshCw, Printer, X, ShieldAlert, Coins, Navigation, TrendingUp, Award, CheckCircle } from 'lucide-react';
import type { Product } from './Inventario';
import type { Client } from './Clientes';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CashSession {
  id: string;
  opened_at: string;
  initial_cash_nio: number;
  initial_cash_usd: number;
  status: string;
}

interface CategoryCommission {
  id: string;
  category_name: string;
  percentage: number;
}

interface RouteClosing {
  id: string;
  route_id: string;
  collaborator_id: string;
  closing_date: string;
  status: 'open' | 'closed';
  opened_at: string;
}

interface RouteClosingSummary {
  total_sales: number;
  total_commission: number;
  net_profit: number;
  cash_collected: number;
  credit_sales: number;
  transfer_sales: number;
  breakdown: { category: string; sales: number; commission_amount: number }[];
}

interface CajaProps {
  currentUserId?: string;
}

export default function Caja({ currentUserId }: CajaProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State for search and selections
  const [prodSearch, setProdSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientSelect, setShowClientSelect] = useState(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'credit'>('cash');
  const [cashReceivedNio, setCashReceivedNio] = useState('');

  // Cash Session State
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [showOpenSessionModal, setShowOpenSessionModal] = useState(false);
  const [showCloseSessionModal, setShowCloseSessionModal] = useState(false);

  const [openSessionForm, setOpenSessionForm] = useState({
    initial_nio: '0'
  });

  // Closing session inputs
  const [closeSessionForm, setCloseSessionForm] = useState({
    real_nio: '',
    notes: ''
  });

  // Commission categories — typed properly
  const [commissionsConfig, setCommissionsConfig] = useState<CategoryCommission[]>([]);

  // POS tab: 'store' | 'route'
  const [posTab, setPosTab] = useState<'store' | 'route'>('store');

  // Routes for route billing
  const [routes, setRoutes] = useState<{id: string; name: string; collaborator_id: string}[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');

  // Route Closure (Jornada de Ruta) State
  const [activeRouteClosure, setActiveRouteClosure] = useState<RouteClosing | null>(null);
  const [showOpenRouteModal, setShowOpenRouteModal] = useState(false);
  const [showRouteClosureModal, setShowRouteClosureModal] = useState(false);
  const [routeClosureSummary, setRouteClosureSummary] = useState<RouteClosingSummary | null>(null);
  const [closingRoute, setClosingRoute] = useState(false);

  // Top products
  const [topProducts, setTopProducts] = useState<{product_id: string; name: string; total_qty: number}[]>([]);

  // Business settings state
  const [businessSettings, setBusinessSettings] = useState({
    name: 'BIOVET',
    phone: '2222-0000',
    website: 'a-biovet.com',
    address: ''
  });

  // Expense quick-add
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'Alquiler' });
  const [savingExpense, setSavingExpense] = useState(false);
  const EXPENSE_CATEGORIES = ['Alquiler','Servicios','Compras','Salarios','Transporte','Otros'];

  const [receiptData, setReceiptData] = useState<{
    id: string;
    invoice_number: string;
    items: CartItem[];
    total: number;
    paymentMethod: string;
    paidNio: number;
    changeNio: number;
    clientName?: string;
    date: string;
  } | null>(null);

  useEffect(() => {
    checkActiveSession();
    fetchInitialData();
    fetchCommissionsConfig();
    fetchRoutes();
    fetchTopProducts();
  }, []);

  // When route changes, check for active route closure
  useEffect(() => {
    if (selectedRouteId) {
      checkActiveRouteClosure(selectedRouteId);
    } else {
      setActiveRouteClosure(null);
    }
  }, [selectedRouteId]);

  // Barcode Scanner Listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Barcode scanners type very fast (typically <50ms between key presses)
      const now = Date.now();
      if (now - lastKeyTime > 100) {
        barcodeBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length >= 3) {
          const matchedProd = products.find(p => p.code === barcodeBuffer || (p as any).barcode === barcodeBuffer);
          if (matchedProd) {
            addToCart(matchedProd);
            setProdSearch('');
            barcodeBuffer = '';
            e.preventDefault();
          }
        }
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, cart]);

  async function checkActiveSession() {
    try {
      const { data, error } = await supabase
        .from('bv_cash_sessions')
        .select('*')
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveSession(data || null);
    } catch (err: any) {
      console.error('Error checking active cash session:', err.message);
    }
  }

  async function checkActiveRouteClosure(routeId: string) {
    try {
      const { data, error } = await supabase
        .from('bv_route_closings')
        .select('*')
        .eq('route_id', routeId)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveRouteClosure(data || null);
    } catch (err: any) {
      console.error('Error checking active route closure:', err.message);
    }
  }

  async function handleOpenRouteClosure() {
    if (!selectedRouteId || !currentUserId) {
      toast.warning('Debes seleccionar una ruta y estar autenticado para iniciar la jornada.');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('bv_route_closings')
        .insert({
          route_id: selectedRouteId,
          collaborator_id: currentUserId,
          closing_date: new Date().toISOString().substring(0, 10),
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;
      setActiveRouteClosure(data);
      setShowOpenRouteModal(false);
      toast.success('Jornada de ruta iniciada con éxito.');
    } catch (err: any) {
      toast.error('Error abriendo jornada de ruta: ' + err.message);
    }
  }

  async function handleCloseRouteClosure() {
    if (!activeRouteClosure) return;
    setClosingRoute(true);
    try {
      const { data, error } = await supabase
        .rpc('bv_close_route', { p_route_closing_id: activeRouteClosure.id });

      if (error) throw error;

      setRouteClosureSummary(data as RouteClosingSummary);
      setActiveRouteClosure(null);
      setShowRouteClosureModal(true);
      // Refresh inventory after route close
      fetchInitialData();
      toast.success('Jornada de ruta finalizada.');
    } catch (err: any) {
      toast.error('Error cerrando jornada de ruta: ' + err.message);
    } finally {
      setClosingRoute(false);
    }
  }

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: prodData } = await supabase
        .from('bv_products')
        .select('*')
        .order('name', { ascending: true });

      const { data: clientData } = await supabase
        .from('bv_clients')
        .select('*')
        .order('name', { ascending: true });

      // Fetch business settings dynamically
      const { data: settingsData } = await supabase
        .from('bv_settings')
        .select('*');

      if (settingsData) {
        const settingsMap: Record<string, string> = {};
        settingsData.forEach(item => {
          settingsMap[item.key] = item.value;
        });

        setBusinessSettings({
          name: settingsMap['business_name'] || 'BIOVET',
          phone: settingsMap['business_phone'] || '2222-0000',
          website: settingsMap['business_website'] || 'a-biovet.com',
          address: settingsMap['business_address'] || ''
        });
      }

      setProducts(prodData || []);
      setClients(clientData || []);
    } catch (err: any) {
      console.error('Error fetching checkout data:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCommissionsConfig() {
    try {
      const { data } = await supabase.from('bv_category_commissions').select('*');
      setCommissionsConfig(data || []);
    } catch (e) {
      console.error('Error loading commissions config:', e);
    }
  }

  async function fetchRoutes() {
    try {
      const { data } = await supabase.from('bv_routes').select('id, name, collaborator_id').eq('status', 'active');
      setRoutes(data || []);
    } catch (e) {
      console.error('Error loading routes:', e);
    }
  }

  async function fetchTopProducts() {
    try {
      const { data } = await supabase
        .from('bv_sale_items')
        .select('product_id, quantity, bv_products(name)')
        .limit(200);
      if (!data) return;
      const totals: Record<string, { name: string; total_qty: number }> = {};
      data.forEach((item: any) => {
        const pid = item.product_id;
        const name = item.bv_products?.name || 'Desconocido';
        if (!totals[pid]) totals[pid] = { name, total_qty: 0 };
        totals[pid].total_qty += item.quantity;
      });
      const sorted = Object.entries(totals)
        .map(([product_id, v]) => ({ product_id, ...v }))
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 5);
      setTopProducts(sorted);
    } catch (e) {
      console.error('Error fetching top products:', e);
    }
  }

  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expenseForm.description || !expenseForm.amount) {
      toast.warning('Ingrese descripción y monto del gasto.');
      return;
    }
    setSavingExpense(true);
    try {
      const { error } = await supabase.from('bv_expenses').insert({
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        category: expenseForm.category,
      });
      if (error) throw error;
      setShowExpenseModal(false);
      setExpenseForm({ description: '', amount: '', category: 'Alquiler' });
      toast.success('Gasto registrado correctamente.');
    } catch (err: any) {
      toast.error('Error al registrar gasto: ' + err.message);
    } finally {
      setSavingExpense(false);
    }
  }

  // Handle Session Opening
  async function handleOpenSession(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('bv_cash_sessions')
        .insert({
          initial_cash_nio: parseFloat(openSessionForm.initial_nio) || 0,
          initial_cash_usd: 0,
          status: 'open',
          exchange_rate: 1
        })
        .select()
        .single();

      if (error) throw error;
      setActiveSession(data);
      setShowOpenSessionModal(false);
      toast.success('Caja chica abierta con éxito');
    } catch (err: any) {
      toast.error('Error abriendo caja: ' + err.message);
    }
  }

  // Handle Session Closing
  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession) return;

    try {
      // Calculate expected sales from active (non-voided) sales in this session
      const { data: salesData } = await supabase
        .from('bv_sales')
        .select('total_amount')
        .eq('cash_session_id', activeSession.id)
        .eq('status', 'active');

      const totalSalesNio = (salesData || []).reduce((sum, s) => sum + Number(s.total_amount), 0);
      const realNio = parseFloat(closeSessionForm.real_nio) || 0;

      const { error } = await supabase
        .from('bv_cash_sessions')
        .update({
          closed_at: new Date().toISOString(),
          expected_sales_nio: totalSalesNio,
          expected_sales_usd: 0,
          real_cash_nio: realNio,
          real_cash_usd: 0,
          difference_notes: closeSessionForm.notes,
          status: 'closed'
        })
        .eq('id', activeSession.id);

      if (error) throw error;

      setActiveSession(null);
      setShowCloseSessionModal(false);
      setCloseSessionForm({ real_nio: '', notes: '' });
      toast.success('Caja cerrada correctamente. Registro archivado.');
      checkActiveSession();
    } catch (err: any) {
      toast.error('Error cerrando caja: ' + err.message);
    }
  }

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.warning('¡Producto sin stock disponible!');
      return;
    }

    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    if (existingIndex > -1) {
      const newQty = cart[existingIndex].quantity + 1;
      if (newQty > product.stock) {
        toast.warning(`No hay suficiente stock. Disponible: ${product.stock}`);
        return;
      }
      const newCart = [...cart];
      newCart[existingIndex].quantity = newQty;
      setCart(newCart);
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const item = cart.find(item => item.product.id === productId);
    if (!item) return;

    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    if (quantity > item.product.stock) {
      toast.warning(`No hay suficiente stock. Disponible: ${item.product.stock}`);
      return;
    }

    setCart(cart.map(item => 
      item.product.id === productId ? { ...item, quantity } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  // Totals calculations
  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast.warning('El carrito está vacío.');
      return;
    }

    if (posTab === 'store' && !activeSession) {
      toast.warning('Debe abrir la caja primero para facturar en tienda.');
      return;
    }

    if (paymentMethod === 'credit' && !selectedClient) {
      toast.warning('Debe seleccionar un cliente para realizar una venta al crédito.');
      return;
    }

    if (posTab === 'route' && !selectedRouteId) {
      toast.warning('Debe seleccionar una ruta para la facturación de ruta.');
      return;
    }

    const convertedTotal = cartTotal;
    const paidNio = parseFloat(cashReceivedNio) || 0;

    if (paymentMethod === 'cash' && paidNio < convertedTotal) {
      toast.warning(`El dinero recibido es menor que el total de la venta.`);
      return;
    }

    if (paymentMethod === 'credit' && selectedClient) {
      // Validate credit limit
      const projectedDebt = selectedClient.current_debt + cartTotal;
      if (projectedDebt > selectedClient.credit_limit) {
        const confirmOver = window.confirm(
          `¡Límite de crédito excedido!\n\n` +
          `Límite: C$ ${selectedClient.credit_limit.toFixed(2)}\n` +
          `Deuda Actual: C$ ${selectedClient.current_debt.toFixed(2)}\n` +
          `Venta Nueva: C$ ${cartTotal.toFixed(2)}\n` +
          `Deuda Proyectada: C$ ${projectedDebt.toFixed(2)}\n\n` +
          `¿Desea autorizar esta venta de todas formas?`
        );
        if (!confirmOver) return;
      }
    }

    try {
      // 1. Insert into bv_sales
      // Route sales link to active route closure; store sales link to active cash session
      const { data: saleData, error: saleError } = await supabase
        .from('bv_sales')
        .insert({
          client_id: selectedClient?.id || null,
          payment_method: paymentMethod,
          total_amount: convertedTotal,
          cash_received: paymentMethod === 'cash' ? paidNio : 0,
          payment_currency: 'NIO',
          exchange_rate: 1,
          paid_nio: paidNio,
          paid_usd: 0,
          cash_session_id: posTab === 'store' ? (activeSession?.id || null) : null,
          sale_type: posTab,
          route_id: posTab === 'route' ? (selectedRouteId || null) : null,
          route_closing_id: posTab === 'route' ? (activeRouteClosure?.id || null) : null,
          user_id: currentUserId || null,
          status: 'active',
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // 2. Insert items into bv_sale_items & calculate commissions
      for (const item of cart) {
        // Find commission percentage
        const pCategory = item.product.category || 'Otros';
        const commissionRule = commissionsConfig.find(c => c.category_name.toLowerCase() === pCategory.toLowerCase());
        const commPercentage = commissionRule ? commissionRule.percentage : 0;
        const totalItemPrice = item.product.price * item.quantity;
        const commissionAmount = (totalItemPrice * commPercentage) / 100;

        const { error: itemError } = await supabase
          .from('bv_sale_items')
          .insert({
            sale_id: saleData.id,
            product_id: item.product.id,
            quantity: item.quantity,
            unit_cost: item.product.cost,
            unit_price: item.product.price,
            total: totalItemPrice,
            commission_amount: commissionAmount
          });

        if (itemError) throw itemError;

        // Decrement stock atomically via RPC (fixes race condition)
        const { error: stockError } = await supabase
          .rpc('bv_decrement_stock', {
            p_product_id: item.product.id,
            p_quantity: item.quantity
          });

        if (stockError) throw stockError;
      }

      // Calculate change
      let changeNio = 0;
      if (paymentMethod === 'cash') {
        changeNio = paidNio - convertedTotal;
      }

      // 3. Show Receipt Modal
      setReceiptData({
        id: saleData.id.substring(0, 8),
        invoice_number: saleData.invoice_number ? `FAC-${String(saleData.invoice_number).padStart(6, '0')}` : 'S/N',
        items: [...cart],
        total: convertedTotal,
        paymentMethod: paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'transfer' ? 'Transferencia' : 'Crédito',
        paidNio: paidNio,
        changeNio: Math.max(0, changeNio),
        clientName: selectedClient?.name,
        date: new Date().toLocaleString()
      });

      // Reset cart and states
      setCart([]);
      setCashReceivedNio('');
      setSelectedClient(null);
      setPaymentMethod('cash');
      
      // Refresh inventory
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error procesando la venta: ' + err.message);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(prodSearch.toLowerCase()) || 
    p.code.toLowerCase().includes(prodSearch.toLowerCase())
  );

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">

      {/* ── Session Status Banner ─────────────────────────────────── */}
      {posTab === 'store' && !activeSession && (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <Coins size={14} />
            <span>Sin turno de caja activo — Las ventas se registrarán sin asociar a un turno.</span>
          </div>
          <button
            onClick={() => setShowOpenSessionModal(true)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg text-xs transition"
          >
            Abrir Caja
          </button>
        </div>
      )}

      {/* ── Route Journey Banner ──────────────────────────────────── */}
      {posTab === 'route' && selectedRouteId && !activeRouteClosure && (
        <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/30 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold">
            <Navigation size={14} />
            <span>Sin jornada de ruta activa — Inicia la jornada para vincular las ventas al cierre del día.</span>
          </div>
          <button
            onClick={() => setShowOpenRouteModal(true)}
            className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg text-xs transition"
          >
            Iniciar Jornada
          </button>
        </div>
      )}

      {posTab === 'route' && activeRouteClosure && (
        <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/30 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-purple-300 text-xs font-semibold">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-ping" />
            <span>Jornada activa desde {new Date(activeRouteClosure.opened_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} — Las ventas de ruta se están registrando en este cierre.</span>
          </div>
          <button
            onClick={handleCloseRouteClosure}
            disabled={closingRoute}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition disabled:opacity-60"
          >
            {closingRoute ? 'Cerrando...' : 'Cerrar Jornada'}
          </button>
        </div>
      )}

      {/* ── POS Tabs: Tienda / Ruta ────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => setPosTab('store')}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider transition ${
              posTab === 'store' ? 'bg-neon-blue/20 text-neon-blue' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            🏪 Tienda
          </button>
          <button
            onClick={() => setPosTab('route')}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider transition border-l border-white/10 ${
              posTab === 'route' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            🚗 Ruta
          </button>
        </div>

        {/* Route selector — only visible in route tab */}
        {posTab === 'route' && (
          <select
            value={selectedRouteId}
            onChange={(e) => setSelectedRouteId(e.target.value)}
            className="bg-[#0d0d18] border border-purple-500/30 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-purple-400"
          >
            <option value="">Seleccionar Ruta...</option>
            {routes.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {/* Expense Quick-Add Button */}
        <button
          onClick={() => setShowExpenseModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-lg text-xs transition"
        >
          <ArrowRight size={13} className="rotate-90" />
          Registrar Gasto
        </button>
      </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-[calc(100vh-200px)]">

      {/* Product Selection */}
      <div className="flex flex-col lg:h-full space-y-4">
        {/* Search */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Escanea el código de barras o escribe el nombre del producto..."
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
              className="w-full bg-[#0d0d18] border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-neon-blue/50 transition text-sm font-sans"
              autoFocus
            />
          </div>
          <button
            onClick={fetchInitialData}
            className="p-2.5 border border-white/10 rounded-lg bg-[#0d0d18] hover:bg-white/5 transition text-gray-400"
            title="Refrescar catálogo"
          >
            <RefreshCw size={18} />
          </button>
          
          {posTab === 'store' && (
            activeSession ? (
              <button
                onClick={() => setShowCloseSessionModal(true)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5"
              >
                <Coins size={14} />
                Cierre Caja
              </button>
            ) : (
              <button
                onClick={() => setShowOpenSessionModal(true)}
                className="px-4 py-2 bg-neon-emerald text-black font-bold rounded-lg text-xs transition flex items-center gap-1.5"
              >
                <Coins size={14} />
                Apertura Caja
              </button>
            )
          )}
        </div>

        {/* Top Products Strip (Compact) */}
        {topProducts.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[9px]">
            <span className="font-bold uppercase text-gray-500 shrink-0">Top:</span>
            {topProducts.map((tp, i) => (
              <button
                key={tp.product_id}
                onClick={() => {
                  const prod = products.find(p => p.id === tp.product_id);
                  if (prod) addToCart(prod);
                }}
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-white/5 hover:bg-neon-blue/10 border border-white/10 hover:border-neon-blue/30 rounded-md text-gray-300 hover:text-white transition"
              >
                <span className="font-bold text-neon-blue">#{i+1}</span>
                <span className="max-w-[80px] truncate">{tp.name}</span>
                <span className="text-gray-500 font-mono">({tp.total_qty})</span>
              </button>
            ))}
          </div>
        )}

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-1 max-h-[55vh] lg:max-h-none">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="w-10 h-10 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <p>No se encontraron productos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {filteredProducts.map((p) => {
                const outOfStock = p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    disabled={outOfStock}
                    onClick={() => addToCart(p)}
                    className="glass-panel glass-panel-hover p-4 rounded-xl text-left flex flex-col justify-between h-36 border border-white/5 relative disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div>
                      <div className="flex justify-between items-start w-full">
                        <span className="text-[9px] font-mono text-neon-blue group-hover:text-white transition">{p.code}</span>
                        <span className="text-[9px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">{p.category || 'Otros'}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mt-1 line-clamp-2">{p.name}</h3>
                    </div>
                    <div className="flex justify-between items-end w-full mt-2">
                      <span className="text-xs text-gray-400 font-mono">Stock: <b className={p.stock <= p.min_stock ? 'text-rose-500' : 'text-neon-emerald'}>{p.stock}</b></span>
                      <span className="text-base font-bold font-mono text-white">C$ {p.price.toFixed(2)}</span>
                    </div>
                    {outOfStock && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                        <span className="bg-rose-600 text-black text-xs font-bold uppercase py-1 px-2.5 rounded">Agotado</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cart & Checkout Panel (Right Column) */}
      <div className="glass-panel rounded-xl border border-white/10 flex flex-col lg:h-full shadow-card-glow bg-glass-card overflow-visible lg:overflow-hidden">
        {/* Cart Header */}
        <div className="p-4 border-b border-white/5 bg-white/2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-neon-blue" />
            <h2 className="font-bold text-white">Detalle de Venta</h2>
          </div>
          <span className="text-xs font-mono font-bold bg-neon-blue/20 text-neon-blue px-2 py-0.5 rounded-full">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} Items
          </span>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-52 lg:max-h-none">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm space-y-2 py-10">
              <ShoppingCart size={32} className="text-gray-600" />
              <p>El carrito de compra está vacío.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product.id} className="bg-white/2 border border-white/5 p-3 rounded-lg flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-white truncate">{item.product.name}</h4>
                  <span className="text-[10px] text-gray-400 font-mono">C$ {item.product.price.toFixed(2)} x {item.quantity}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={item.product.stock}
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                    className="w-12 bg-[#0d0d18] border border-white/10 rounded py-1 text-center font-mono text-xs text-white"
                  />
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="p-1 hover:bg-rose-500/10 rounded text-rose-500 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Client Selector (Within Cart) */}
        <div className="p-4 border-t border-white/5 bg-white/2 space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cliente de la Venta</span>
            {selectedClient && (
              <button 
                onClick={() => setSelectedClient(null)} 
                className="text-[10px] text-rose-400 hover:underline flex items-center gap-0.5"
              >
                Quitar
              </button>
            )}
          </div>

          {selectedClient ? (
            <div className="bg-neon-blue/5 border border-neon-blue/20 p-2.5 rounded-lg flex justify-between items-center">
              <div>
                <span className="font-semibold text-xs text-white block">{selectedClient.name}</span>
                <span className="text-[10px] text-gray-400 font-mono">Deuda: C$ {selectedClient.current_debt.toFixed(2)} / Límite: C$ {selectedClient.credit_limit.toFixed(2)}</span>
              </div>
              <User size={14} className="text-neon-blue" />
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowClientSelect(!showClientSelect)}
                className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2 text-left text-xs text-gray-400 flex justify-between items-center hover:bg-white/2 transition"
              >
                <span>Seleccionar Cliente (Opcional)...</span>
                <User size={14} />
              </button>
              
              {showClientSelect && (
                <div className="absolute bottom-full mb-1 left-0 right-0 glass-panel max-h-48 overflow-y-auto rounded-lg z-20 shadow-2xl p-2 space-y-2">
                  <input
                    type="text"
                    placeholder="Filtrar cliente..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-md p-1.5 text-xs text-white focus:outline-none focus:border-neon-blue"
                  />
                  <div className="divide-y divide-white/5">
                    {filteredClients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedClient(c);
                          setShowClientSelect(false);
                          setClientSearch('');
                        }}
                        className="w-full text-left py-1.5 px-2 hover:bg-white/5 text-xs text-white block font-medium truncate"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Checkout Controls */}
        <div className="p-5 border-t border-white/5 bg-[#07070f] space-y-4">
          
          {/* Total Price (Enlarged) */}
          <div className="flex justify-between items-end py-1">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total a Cobrar</span>
            <span className="text-3xl font-black font-mono text-white text-shadow-neon">
              C$ {cartTotal.toFixed(2)}
            </span>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'transfer', 'credit'] as const).map((method) => {
              const isActive = paymentMethod === method;
              return (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 px-1 border rounded-lg text-xs font-bold uppercase transition flex flex-col items-center gap-1.5 ${
                    isActive 
                      ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' 
                      : 'bg-white/2 border-white/10 text-gray-400 hover:bg-white/5'
                  }`}
                >
                  {method === 'cash' ? <DollarSign size={15} /> : method === 'transfer' ? <RefreshCw size={15} /> : <CreditCard size={15} />}
                  <span>{method === 'cash' ? 'Efectivo' : method === 'transfer' ? 'Transf.' : 'Crédito'}</span>
                </button>
              );
            })}
          </div>

          {/* Cash input for change calculation */}
          {paymentMethod === 'cash' && (
            <div className="space-y-2">
              <div className="flex gap-2 items-center bg-[#0d0d18] border border-white/10 p-3 rounded-lg">
                <span className="text-xs text-gray-400 font-bold uppercase pl-1">Efectivo C$:</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={cashReceivedNio}
                  onChange={(e) => setCashReceivedNio(e.target.value)}
                  className="flex-1 bg-transparent text-right font-mono text-base text-white focus:outline-none font-bold"
                />
              </div>
            </div>
          )}

          {/* Action Button (Enlarged) */}
          <button
            onClick={handleCompleteSale}
            disabled={cart.length === 0}
            className="w-full flex items-center justify-center gap-2 py-4 bg-neon-blue hover:bg-neon-blue/80 text-black font-black uppercase tracking-widest rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-neon-blue"
          >
            Completar Transacción
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>

    {/* Opening Session Modal */}
      {showOpenSessionModal && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 border border-neon-blue/20 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Coins className="text-neon-emerald" size={20} />
              Apertura de Caja Chica
            </h2>
            <p className="text-xs text-gray-400 mb-4">Ingrese el monto inicial en caja para esta sesión de venta (C$).</p>
            <form onSubmit={handleOpenSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Monto Inicial Córdobas (C$)</label>
                <input
                  type="number"
                  required
                  value={openSessionForm.initial_nio}
                  onChange={(e) => setOpenSessionForm(prev => ({ ...prev, initial_nio: e.target.value }))}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white font-mono text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-neon-emerald text-black font-bold uppercase rounded-lg text-xs hover:bg-neon-emerald/80 transition"
              >
                Abrir Turno de Caja
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Closing Session Modal */}
      {showCloseSessionModal && (
        <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 border border-rose-500/20 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="text-rose-500" size={20} />
                Cierre y Conciliación de Caja
              </h2>
              <button onClick={() => setShowCloseSessionModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCloseSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Efectivo Real en Caja (C$)</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={closeSessionForm.real_nio}
                  onChange={(e) => setCloseSessionForm(prev => ({ ...prev, real_nio: e.target.value }))}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Observaciones / Notas del Cierre</label>
                <textarea
                  value={closeSessionForm.notes}
                  onChange={(e) => setCloseSessionForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ej: Faltante de C$ 10 por cambio dado de más..."
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-xs h-20"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-rose-600 text-white font-bold uppercase rounded-lg text-xs hover:bg-rose-700 transition"
              >
                Cerrar Caja & Conciliar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Quick-Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 shadow-2xl relative border border-rose-500/20">
            <h2 className="text-lg font-bold text-white mb-1">Registrar Gasto</h2>
            <p className="text-gray-400 text-xs mb-4">Ingrese un egreso de caja para mantener el balance neto.</p>
            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Descripción del Gasto *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
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
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Categoría</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
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
                  disabled={savingExpense}
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-black font-bold rounded-lg transition text-sm disabled:opacity-50"
                >
                  {savingExpense ? 'Guardando...' : 'Guardar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal — Thermal 80mm Format */}
      {receiptData && (
        <>
          {/* Screen overlay / preview */}
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-xs">
              {/* Close button (screen only) */}
              <button
                onClick={() => setReceiptData(null)}
                className="receipt-no-print absolute -top-3 -right-3 z-10 p-1.5 bg-gray-800 border border-white/10 rounded-full text-gray-400 hover:text-white transition"
              >
                <X size={14} />
              </button>

              {/* Receipt preview card */}
              <div className="bg-white text-black rounded-lg shadow-2xl overflow-hidden">
                {/* Ticket area */}
                <div
                  id="thermal-receipt-print"
                  style={{
                    width: '100%',
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: '11px',
                    lineHeight: '1.5',
                    color: '#000',
                    background: '#fff',
                    padding: '8px 10px 0 10px',
                  }}
                >
                  {/* Header */}
                  <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' }}>
                      {businessSettings.name}
                    </div>
                    {businessSettings.address && (
                      <div style={{ fontSize: '10px' }}>{businessSettings.address}</div>
                    )}
                    <div style={{ fontSize: '10px' }}>
                      Tel: {businessSettings.phone} | {businessSettings.website}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '2px' }}>{receiptData.date}</div>
                  </div>

                  <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

                  {/* Invoice info */}
                  <div style={{ fontSize: '10px', marginBottom: '4px' }}>
                    <div><b>Factura Nro:</b> {receiptData.invoice_number}</div>
                    {receiptData.clientName && <div><b>Cliente:</b> {receiptData.clientName}</div>}
                    <div><b>Pago:</b> {receiptData.paymentMethod}</div>
                  </div>

                  <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

                  {/* Column headers */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>
                    <span style={{ flex: 2 }}>DESCRIPCION</span>
                    <span style={{ textAlign: 'right', flex: 1 }}>CANT</span>
                    <span style={{ textAlign: 'right', flex: 1 }}>TOTAL</span>
                  </div>

                  {/* Items */}
                  {receiptData.items.map((item) => {
                    const lineTotal = item.product.price * item.quantity;
                    return (
                      <div
                        key={item.product.id}
                        style={{ marginBottom: '3px', fontSize: '10px' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ flex: 2, paddingRight: '4px', wordBreak: 'break-word' }}>
                            {item.product.name}
                          </span>
                          <span style={{ textAlign: 'right', flex: 1 }}>{item.quantity}</span>
                          <span style={{ textAlign: 'right', flex: 1 }}>
                            C$ {lineTotal.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ color: '#555', fontSize: '9px' }}>
                          P.U.: C$ {item.product.price.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

                  {/* Totals */}
                  <div style={{ fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', marginBottom: '3px' }}>
                      <span>TOTAL:</span>
                      <span>C$ {receiptData.total.toFixed(2)}</span>
                    </div>

                    {receiptData.paymentMethod === 'Efectivo' && (
                      <>
                        {receiptData.paidNio > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                            <span>Recibido C$:</span>
                            <span>C$ {receiptData.paidNio.toFixed(2)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px', marginTop: '2px' }}>
                          <span>Cambio C$:</span>
                          <span>C$ {receiptData.changeNio.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

                  {/* Footer */}
                  <div style={{ textAlign: 'center', fontSize: '10px', paddingBottom: '12px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>¡Gracias por su preferencia!</div>
                    <div>Conserve su comprobante.</div>
                    <div style={{ marginTop: '4px', fontSize: '9px', color: '#555' }}>
                      *** ORIGINAL ***
                    </div>
                  </div>
                </div>

                {/* Print button (screen only) */}
                <div className="receipt-no-print p-3 bg-gray-50 border-t border-gray-200 flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-black text-white hover:bg-gray-800 rounded font-sans font-bold text-xs transition"
                  >
                    <Printer size={12} />
                    Imprimir
                  </button>
                  <button
                    onClick={() => setReceiptData(null)}
                    className="flex-1 py-2 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded font-sans font-bold text-xs transition"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Open Route Journey Modal ────────────────────────────────── */}
      {showOpenRouteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 border border-purple-500/20 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Navigation className="text-purple-400" size={20} />
              Iniciar Jornada de Ruta
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              Al iniciar la jornada, todas las ventas de esta ruta quedarán vinculadas a este cierre. Al terminar el día presiona "Cerrar Jornada" para obtener el resumen de comisiones y ganancia neta.
            </p>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mb-5 text-xs text-purple-300">
              <span className="font-bold block">Ruta seleccionada:</span>
              <span className="text-white font-semibold">{routes.find(r => r.id === selectedRouteId)?.name || selectedRouteId}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowOpenRouteModal(false)}
                className="flex-1 px-4 py-2.5 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleOpenRouteClosure}
                className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-bold uppercase rounded-lg text-xs transition"
              >
                Iniciar Jornada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Route Closure Summary Modal ─────────────────────────────── */}
      {showRouteClosureModal && routeClosureSummary && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl border border-purple-500/20 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Award className="text-amber-400" size={20} />
                  Cierre de Jornada de Ruta
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {routes.find(r => r.id === selectedRouteId)?.name} — {new Date().toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => { setShowRouteClosureModal(false); setRouteClosureSummary(null); }}
                className="text-gray-500 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Totals */}
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0d0d18] border border-white/5 p-3 rounded-lg text-center">
                  <span className="text-gray-400 text-[10px] font-bold uppercase block">Efectivo</span>
                  <span className="text-white font-mono font-bold text-sm block mt-1">C$ {routeClosureSummary.cash_collected.toFixed(2)}</span>
                </div>
                <div className="bg-[#0d0d18] border border-white/5 p-3 rounded-lg text-center">
                  <span className="text-gray-400 text-[10px] font-bold uppercase block">Crédito</span>
                  <span className="text-amber-400 font-mono font-bold text-sm block mt-1">C$ {routeClosureSummary.credit_sales.toFixed(2)}</span>
                </div>
                <div className="bg-[#0d0d18] border border-white/5 p-3 rounded-lg text-center">
                  <span className="text-gray-400 text-[10px] font-bold uppercase block">Transfer.</span>
                  <span className="text-neon-blue font-mono font-bold text-sm block mt-1">C$ {routeClosureSummary.transfer_sales.toFixed(2)}</span>
                </div>
              </div>

              {/* Commission breakdown by category */}
              <div className="bg-[#0d0d18] border border-white/5 rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-white/5 bg-white/2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Comisiones por Categoría de Producto</span>
                </div>
                <div className="divide-y divide-white/5">
                  {routeClosureSummary.breakdown.length === 0 ? (
                    <p className="text-gray-500 text-xs py-4 text-center">Sin ventas registradas en esta jornada.</p>
                  ) : (
                    routeClosureSummary.breakdown.map((row) => (
                      <div key={row.category} className="flex justify-between items-center px-4 py-2.5 text-xs">
                        <div>
                          <span className="text-white font-semibold block">{row.category}</span>
                          <span className="text-gray-500 font-mono">Ventas: C$ {row.sales.toFixed(2)}</span>
                        </div>
                        <span className="font-bold font-mono text-amber-400">C$ {row.commission_amount.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Summary footer */}
              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Total Vendido:</span>
                  <span className="font-mono font-bold text-white">C$ {routeClosureSummary.total_sales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-400 font-semibold">Total Comisiones Vendedor:</span>
                  <span className="font-mono font-bold text-amber-400">− C$ {routeClosureSummary.total_commission.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2.5 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <span className="text-neon-emerald font-bold text-sm flex items-center gap-1.5">
                    <TrendingUp size={14} />
                    Ganancia Neta Veterinaria:
                  </span>
                  <span className="font-mono font-black text-neon-emerald text-lg">C$ {routeClosureSummary.net_profit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
              >
                <Printer size={14} />
                Imprimir Resumen
              </button>
              <button
                onClick={() => { setShowRouteClosureModal(false); setRouteClosureSummary(null); }}
                className="flex-1 py-2.5 bg-neon-emerald text-black font-bold rounded-lg transition text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle size={14} />
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
