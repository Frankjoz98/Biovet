import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Search, ShoppingCart, Trash2, User, CreditCard, DollarSign, ArrowRight, RefreshCw, Printer, X, ShieldAlert, Coins, Navigation, CheckCircle, TrendingUp, Award, Percent } from 'lucide-react';
import type { Product } from './Inventario';
import type { Client } from './Clientes';

interface CartItem {
  product: Product;
  quantity: number;
  discountPct: number; // Porcentaje de descuento por ítem (0-100)
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

  // Descuento global (sobre el total)
  const [globalDiscountPct, setGlobalDiscountPct] = useState<string>('0');
  const [globalDiscountFixed, setGlobalDiscountFixed] = useState<string>('0'); // descuento monetario fijo

  // Panel de facturación (slide-over)
  const [showCartPanel, setShowCartPanel] = useState(false);

  // Modal de autorización de owner para crédito excedido
  const [showCreditAuthModal, setShowCreditAuthModal] = useState(false);
  const [creditAuthPassword, setCreditAuthPassword] = useState('');
  const [creditAuthError, setCreditAuthError] = useState('');
  const [creditAuthLoading, setCreditAuthLoading] = useState(false);
  const [pendingSaleCallback, setPendingSaleCallback] = useState<(() => void) | null>(null);

  // Pre-cierre informativo
  const [showPreCloseModal, setShowPreCloseModal] = useState(false);
  const [preCloseData, setPreCloseData] = useState<{
    cashSales: number;
    transferSales: number;
    creditSales: number;
    expectedCash: number;
  } | null>(null);

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
    } catch (error) {
      const err = error as Error;
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
    } catch (error) {
      const err = error as Error;
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
    } catch (error) {
      const err = error as Error;
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
    } catch (error) {
      const err = error as Error;
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
    } catch (error) {
      const err = error as Error;
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
    } catch (error) {
      const err = error as Error;
      toast.error('Error abriendo caja: ' + err.message);
    }
  }

  // Handle Session Closing
  async function handleOpenPreClose() {
    if (!activeSession) return;
    try {
      const { data: salesData } = await supabase
        .from('bv_sales')
        .select('total_amount, payment_method')
        .eq('cash_session_id', activeSession.id)
        .eq('status', 'active');

      const cashSales = (salesData || [])
        .filter(s => s.payment_method === 'cash')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);
      const transferSales = (salesData || [])
        .filter(s => s.payment_method === 'transfer')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);
      const creditSales = (salesData || [])
        .filter(s => s.payment_method === 'credit')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);
      const expectedCash = Number(activeSession.initial_cash_nio) + cashSales + transferSales;

      setPreCloseData({ cashSales, transferSales, creditSales, expectedCash });
      setShowPreCloseModal(true);
    } catch (error) {
      const err = error as Error;
      toast.error('Error al cargar pre-cierre: ' + err.message);
    }
  }

  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession) return;

    try {
      const { data: salesData } = await supabase
        .from('bv_sales')
        .select('total_amount, payment_method')
        .eq('cash_session_id', activeSession.id)
        .eq('status', 'active');

      // Solo efectivo y transferencia cuentan como esperado en caja física
      const totalSalesNio = (salesData || [])
        .filter(s => s.payment_method !== 'credit')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);

      // Los créditos se guardan separados (no son efectivo, no generan faltante)
      const totalCreditNio = (salesData || [])
        .filter(s => s.payment_method === 'credit')
        .reduce((sum, s) => sum + Number(s.total_amount), 0);

      const realNio = parseFloat(closeSessionForm.real_nio) || 0;

      const { error } = await supabase
        .from('bv_cash_sessions')
        .update({
          closed_at: new Date().toISOString(),
          expected_sales_nio: totalSalesNio,
          expected_sales_usd: 0,
          real_cash_nio: realNio,
          real_cash_usd: 0,
          credit_amount_nio: totalCreditNio,
          difference_notes: closeSessionForm.notes,
          status: 'closed'
        })
        .eq('id', activeSession.id);

      if (error) throw error;

      setActiveSession(null);
      setShowCloseSessionModal(false);
      setPreCloseData(null);
      setCloseSessionForm({ real_nio: '', notes: '' });
      toast.success('Caja cerrada correctamente. Registro archivado.');
      checkActiveSession();
    } catch (error) {
      const err = error as Error;
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
      setCart([...cart, { product, quantity: 1, discountPct: 0 }]);
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

  // Descuento individual por ítem
  const updateItemDiscount = (productId: string, pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setCart(cart.map(item =>
      item.product.id === productId ? { ...item, discountPct: clamped } : item
    ));
  };

  // Totals calculations (con descuentos por ítem)
  const cartSubtotal = cart.reduce((sum, item) => {
    const itemTotal = item.product.price * item.quantity;
    const itemDiscount = itemTotal * (item.discountPct / 100);
    return sum + (itemTotal - itemDiscount);
  }, 0);

  // El descuento global puede ser por % o monto fijo (se usa el mayor)
  const globalPctAmt = cartSubtotal * ((parseFloat(globalDiscountPct) || 0) / 100);
  const globalFixedAmt = Math.min(parseFloat(globalDiscountFixed) || 0, cartSubtotal);
  const globalDiscountAmt = Math.max(globalPctAmt, globalFixedAmt);

  const cartTotal = Math.max(0, cartSubtotal - globalDiscountAmt);
  const totalDiscountAmt = cart.reduce((sum, item) => sum + (item.product.price * item.quantity * (item.discountPct / 100)), 0) + globalDiscountAmt;

  // Handler: al cambiar %, calcular monto equivalente
  function handleGlobalPctChange(val: string) {
    setGlobalDiscountPct(val);
    const pct = parseFloat(val) || 0;
    setGlobalDiscountFixed((cartSubtotal * pct / 100).toFixed(2));
  }

  // Handler: al cambiar monto fijo, calcular % equivalente
  function handleGlobalFixedChange(val: string) {
    setGlobalDiscountFixed(val);
    const fixed = parseFloat(val) || 0;
    if (cartSubtotal > 0) {
      setGlobalDiscountPct(((fixed / cartSubtotal) * 100).toFixed(2));
    }
  }

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
      const projectedDebt = selectedClient.current_debt + cartTotal;
      if (projectedDebt > selectedClient.credit_limit) {
        // Guardar el callback y abrir modal de autorización de owner
        setPendingSaleCallback(() => () => executeSale(cartTotal, paidNio));
        setShowCreditAuthModal(true);
        return;
      }
    }

    await executeSale(cartTotal, paidNio);
  };

  async function handleAuthorizeCreditSale() {
    if (!creditAuthPassword) {
      setCreditAuthError('Ingresa la contraseña del propietario.');
      return;
    }
    setCreditAuthLoading(true);
    setCreditAuthError('');
    try {
      // Verificar contraseña del usuario actual (debe ser owner)
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData?.session?.user?.email;
      if (!email) throw new Error('No hay sesión activa.');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: creditAuthPassword
      });
      if (signInError) throw new Error('Contraseña incorrecta. Autorización denegada.');

      setShowCreditAuthModal(false);
      setCreditAuthPassword('');
      if (pendingSaleCallback) pendingSaleCallback();
      setPendingSaleCallback(null);
    } catch (error) {
      const err = error as Error;
      setCreditAuthError(err.message);
    } finally {
      setCreditAuthLoading(false);
    }
  }

  const executeSale = async (convertedTotal: number, paidNio: number) => {
    try {
      // 1. Insert into bv_sales
      // Route sales link to active route closure; store sales link to active cash session
      const { data: saleData, error: saleError } = await supabase
        .from('bv_sales')
        .insert({
          client_id: selectedClient?.id || null,
          payment_method: paymentMethod,
          total_amount: convertedTotal,
          discount_amount: totalDiscountAmt,
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
        const pCategory = item.product.category || 'Otros';
        const commissionRule = commissionsConfig.find(c => c.category_name.toLowerCase() === pCategory.toLowerCase());
        const commPercentage = commissionRule ? commissionRule.percentage : 0;
        const baseItemPrice = item.product.price * item.quantity;
        const itemDiscountAmt = baseItemPrice * (item.discountPct / 100);
        const totalItemPrice = baseItemPrice - itemDiscountAmt;
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
      setGlobalDiscountPct('0');
      setGlobalDiscountFixed('0');
      setShowCartPanel(false);
      
      // Refresh inventory
      fetchInitialData();
    } catch (error) {
      const err = error as Error;
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

    {/* Full-width product area + slide-over cart */}
    <div className="relative">

      {/* Product Selection — Full Width */}
      <div className="flex flex-col space-y-4">
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
                onClick={() => handleOpenPreClose()}
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



        {/* Product Grid — full width */}
        <div className="overflow-y-auto pr-1" style={{maxHeight: 'calc(100vh - 200px)'}}>
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="w-10 h-10 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <p>No se encontraron productos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
    </div>

      {/* ─── Floating Cart Button ─────────────────────────────────── */}
      {cart.length === 0 ? null : (
        <button
          onClick={() => setShowCartPanel(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 px-5 py-3.5 bg-neon-blue hover:bg-neon-blue/90 text-black font-black rounded-2xl shadow-neon-blue transition-all animate-pulse-slow"
        >
          <ShoppingCart size={20} />
          <span className="text-sm uppercase tracking-wider">Ver Factura</span>
          <span className="bg-black/20 text-white font-mono text-xs px-2 py-0.5 rounded-full">
            {cart.reduce((s, i) => s + i.quantity, 0)} items &bull; C$ {cartTotal.toFixed(2)}
          </span>
        </button>
      )}

      {/* ─── Full-Screen Checkout Panel ────────────────────────────── */}
      {showCartPanel && (
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#08080f] w-full h-full overflow-hidden animate-in fade-in duration-200">
          
          {/* Left Column — Cart Items */}
          <div className="flex-1 flex flex-col h-full border-r border-white/10 relative">
            {/* Header */}
            <div className="flex items-center gap-3 px-8 py-5 border-b border-white/10 bg-white/2 shrink-0">
              <ShoppingCart size={24} className="text-neon-blue" />
              <h2 className="font-bold text-white text-xl">Factura en Curso</h2>
              <span className="text-sm font-mono font-bold bg-neon-blue/20 text-neon-blue px-3 py-1 rounded-full ml-2">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto px-8 py-6 bg-[#030308]">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <ShoppingCart size={64} className="mb-4 opacity-10" />
                  <p className="text-lg">La factura está vacía</p>
                </div>
              ) : (
                <table className="w-full text-left border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-4 pb-2 font-semibold">Producto</th>
                      <th className="px-4 pb-2 font-semibold text-center">Precio Unit.</th>
                      <th className="px-4 pb-2 font-semibold text-center w-36">Cantidad</th>
                      <th className="px-4 pb-2 font-semibold text-center w-28">Dto.%</th>
                      <th className="px-4 pb-2 font-semibold text-right">Subtotal</th>
                      <th className="px-4 pb-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => {
                      const itemBase = item.product.price * item.quantity;
                      const itemDiscounted = itemBase * (1 - item.discountPct / 100);
                      return (
                        <tr key={item.product.id} className="bg-white/5 hover:bg-white/10 transition-colors shadow-sm group">
                          <td className="px-4 py-4 rounded-l-xl">
                            <h4 className="text-base font-bold text-white truncate max-w-[300px] xl:max-w-md">{item.product.name}</h4>
                            <span className="text-xs text-gray-400 font-mono">{item.product.code}</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-sm text-gray-300 font-mono">C$ {item.product.price.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-8 h-8 bg-black/40 hover:bg-white/10 border border-white/5 rounded-lg text-white font-bold text-sm flex items-center justify-center transition">-</button>
                              <input
                                type="number" min="1" max={item.product.stock}
                                value={item.quantity}
                                onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                                className="w-14 bg-black/50 border border-white/10 rounded-lg py-1.5 text-center font-mono text-sm text-white"
                              />
                              <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="w-8 h-8 bg-black/40 hover:bg-white/10 border border-white/5 rounded-lg text-white font-bold text-sm flex items-center justify-center transition">+</button>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5 justify-center">
                              <input
                                type="number" min="0" max="100"
                                value={item.discountPct}
                                onChange={(e) => updateItemDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                                className="w-10 bg-transparent text-center font-mono text-sm text-amber-400 focus:outline-none font-bold"
                              />
                              <span className="text-[10px] text-amber-400/50 font-bold">%</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="text-lg font-black font-mono text-white">C$ {itemDiscounted.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-4 rounded-r-xl text-center">
                            <button
                              onClick={() => removeFromCart(item.product.id)}
                              className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-500/60 hover:text-rose-500 transition opacity-20 group-hover:opacity-100"
                              title="Eliminar producto"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Column — Checkout Summary */}
          <div className="w-full md:w-[400px] lg:w-[480px] flex flex-col bg-[#05050d] shrink-0 h-full">
            {/* Header Right */}
            <div className="flex justify-end p-4 shrink-0 border-b border-white/5 bg-white/2">
              <button
                onClick={() => setShowCartPanel(false)}
                className="px-4 py-2 text-gray-300 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 rounded-xl transition bg-white/5 flex items-center gap-2 border border-white/5"
              >
                <span className="text-xs font-bold uppercase tracking-wider">Cerrar y volver</span>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
              
              {/* Cliente */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><User size={14} className="text-neon-blue"/> Cliente asignado a la venta</span>
                  {selectedClient && (
                    <button onClick={() => setSelectedClient(null)} className="text-[10px] text-rose-400 font-semibold hover:underline">Remover</button>
                  )}
                </div>
                {selectedClient ? (
                  <div className="bg-neon-blue/5 border border-neon-blue/20 p-4 rounded-xl flex justify-between items-center shadow-inner">
                    <div>
                      <span className="font-bold text-lg text-white block mb-1">{selectedClient.name}</span>
                      <span className="text-xs text-gray-400 font-mono block">Deuda Act: C$ {selectedClient.current_debt.toFixed(2)}</span>
                      <span className="text-xs text-gray-400 font-mono block">Límite Cr: C$ {selectedClient.credit_limit.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setShowClientSelect(!showClientSelect)}
                      className="w-full bg-[#0d0d18] border border-white/10 rounded-xl p-4 text-left text-sm text-gray-400 flex justify-between items-center hover:bg-white/5 transition"
                    >
                      <span className="italic">Seleccionar Cliente (Opcional)...</span>
                      <Search size={18} className="text-gray-600" />
                    </button>
                    {showClientSelect && (
                      <div className="absolute top-full mt-2 left-0 right-0 bg-[#0d0d18] border border-white/10 max-h-64 overflow-y-auto rounded-xl z-20 shadow-2xl p-2 space-y-1">
                        <input
                          type="text" placeholder="Filtrar por nombre..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-neon-blue mb-2"
                        />
                        <div className="divide-y divide-white/5">
                          {filteredClients.map(c => (
                            <button key={c.id} onClick={() => { setSelectedClient(c); setShowClientSelect(false); setClientSearch(''); }}
                              className="w-full text-left py-2.5 px-3 hover:bg-white/5 rounded-lg text-sm text-white block font-medium truncate transition">
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Descuentos Globales */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 shadow-inner">
                <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block mb-3 flex items-center gap-1.5"><Percent size={14}/> Descuento Global</span>
                <div className="flex gap-4">
                  <div className="flex-1 flex items-center gap-2 bg-black/40 border border-white/5 rounded-lg px-3 py-2.5">
                    <span className="text-xs text-gray-500 font-bold shrink-0">Porcentaje %</span>
                    <input type="number" min="0" max="100" value={globalDiscountPct}
                      onChange={(e) => handleGlobalPctChange(e.target.value)}
                      className="flex-1 w-full bg-transparent text-right font-mono text-lg text-amber-400 focus:outline-none font-bold" placeholder="0" />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-black/40 border border-white/5 rounded-lg px-3 py-2.5">
                    <span className="text-xs text-gray-500 font-bold shrink-0">Monto Fijo C$</span>
                    <input type="number" min="0" value={globalDiscountFixed}
                      onChange={(e) => handleGlobalFixedChange(e.target.value)}
                      className="flex-1 w-full bg-transparent text-right font-mono text-lg text-amber-400 focus:outline-none font-bold" placeholder="0.00" />
                  </div>
                </div>
              </div>

              {/* Totals Box */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 shadow-lg">
                {totalDiscountAmt > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm font-medium">Subtotal sin dto:</span>
                      <span className="text-base font-mono text-gray-300">C$ {cartSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 text-sm font-bold">Descuento aplicado:</span>
                      <span className="text-base font-mono text-amber-400 font-bold">- C$ {totalDiscountAmt.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/10 w-full my-3"></div>
                  </>
                )}
                <div className="flex justify-between items-end">
                  <span className="text-gray-200 text-xl font-bold uppercase tracking-widest mb-1">Total a Cobrar</span>
                  <div className="text-right">
                    <span className="text-2xl text-neon-blue/60 font-bold mr-1 block -mb-2">C$</span>
                    <span className="text-[3.5rem] leading-none font-black font-mono text-neon-blue drop-shadow-[0_0_15px_rgba(0,240,255,0.4)] tracking-tighter">
                      {cartTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">Método de Pago</span>
                <div className="grid grid-cols-3 gap-3">
                  {(['cash', 'transfer', 'credit'] as const).map((method) => (
                    <button key={method} onClick={() => setPaymentMethod(method)}
                      className={`py-4 border rounded-xl text-xs font-bold uppercase transition flex flex-col items-center gap-2 ${
                        paymentMethod === method
                          ? 'bg-neon-blue border-neon-blue text-black shadow-[0_0_15px_rgba(0,240,255,0.3)] scale-[1.03]'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                      }`}>
                      {method === 'cash' ? <DollarSign size={22}/> : method === 'transfer' ? <RefreshCw size={22}/> : <CreditCard size={22}/>}
                      {method === 'cash' ? 'Efectivo' : method === 'transfer' ? 'Transferencia' : 'Crédito'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash input */}
              {paymentMethod === 'cash' && (
                <div className="flex gap-4 items-center bg-[#0d0d18] border border-neon-blue/50 p-5 rounded-2xl shadow-[0_0_20px_rgba(0,240,255,0.1)] mt-4">
                  <span className="text-sm text-neon-blue font-bold uppercase shrink-0">Efectivo Recibido:</span>
                  <div className="flex-1 flex items-center gap-2 border-b-2 border-neon-blue/50 pb-1">
                    <span className="text-xl text-white font-bold">C$</span>
                    <input type="number" placeholder="0.00" value={cashReceivedNio}
                      onChange={(e) => setCashReceivedNio(e.target.value)}
                      className="w-full bg-transparent text-right font-mono text-3xl text-white focus:outline-none font-black" />
                  </div>
                </div>
              )}

              {/* Cash change */}
              {paymentMethod === 'cash' && parseFloat(cashReceivedNio) > cartTotal && (
                <div className="bg-neon-emerald/10 border border-neon-emerald/30 text-neon-emerald rounded-2xl p-5 text-center mt-4">
                  <span className="block text-sm uppercase font-bold mb-1 opacity-80">Cambio a Entregar al Cliente</span>
                  <span className="text-5xl font-black font-mono tracking-tighter">C$ {(parseFloat(cashReceivedNio) - cartTotal).toFixed(2)}</span>
                </div>
              )}

            </div>
            
            {/* Action Button at very bottom */}
            <div className="p-8 bg-black/40 border-t border-white/5 mt-auto shrink-0">
              <button onClick={handleCompleteSale} disabled={cart.length === 0}
                className="w-full flex items-center justify-center gap-3 py-6 bg-neon-blue hover:bg-neon-blue/80 text-black font-black uppercase tracking-widest rounded-2xl transition disabled:opacity-50 disabled:cursor-not-allowed text-lg shadow-[0_0_30px_rgba(0,240,255,0.4)] hover:scale-[1.02] transform">
                Completar Transacción <ArrowRight size={26} />
              </button>
            </div>

          </div>
        </div>
      )}


    {/* Modal: Autorización Owner para crédito excedido */}
    {showCreditAuthModal && (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="glass-panel w-full max-w-sm rounded-xl p-6 border border-rose-500/30 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <ShieldAlert className="text-rose-400" size={22} />
            <div>
              <h2 className="text-lg font-bold text-white">Autorización Requerida</h2>
              <p className="text-xs text-rose-400">Límite de crédito excedido</p>
            </div>
          </div>
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 mb-4 text-xs space-y-1 font-mono">
            <div className="flex justify-between"><span className="text-gray-400">Límite:</span><span className="text-white">C$ {selectedClient?.credit_limit.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Deuda actual:</span><span className="text-rose-400">C$ {selectedClient?.current_debt.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Esta venta:</span><span className="text-white">C$ {cartTotal.toFixed(2)}</span></div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Ingresa tu contraseña de propietario para autorizar esta venta excepcional:</p>
          <input
            type="password"
            value={creditAuthPassword}
            onChange={(e) => { setCreditAuthPassword(e.target.value); setCreditAuthError(''); }}
            placeholder="Contraseña..."
            className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm mb-2 focus:outline-none focus:border-rose-400"
          />
          {creditAuthError && <p className="text-xs text-rose-400 mb-2">{creditAuthError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCreditAuthModal(false); setCreditAuthPassword(''); setCreditAuthError(''); setPendingSaleCallback(null); }}
              className="flex-1 py-2 border border-white/10 text-gray-400 rounded-lg text-xs font-bold hover:bg-white/5 transition"
            >Cancelar</button>
            <button
              onClick={handleAuthorizeCreditSale}
              disabled={creditAuthLoading}
              className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition"
            >
              {creditAuthLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={13} />}
              Autorizar
            </button>
          </div>
        </div>
      </div>
    )}

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

      {/* Pre-Cierre Informativo */}
      {showPreCloseModal && preCloseData && (
        <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 border border-amber-500/20 shadow-2xl">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Coins className="text-amber-400" size={20} />
                  Pre-Cierre de Caja
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Revise los totales antes de contar el efectivo físico.</p>
              </div>
              <button onClick={() => setShowPreCloseModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Tabla de resumen */}
            <div className="space-y-2 mb-5">
              <div className="flex justify-between items-center py-2.5 px-4 bg-white/3 rounded-lg">
                <span className="text-sm text-gray-400">Fondo inicial de apertura</span>
                <span className="font-mono font-bold text-white">C$ {Number(activeSession?.initial_cash_nio || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-4 bg-white/3 rounded-lg">
                <span className="text-sm text-gray-400">Ventas cobradas en efectivo</span>
                <span className="font-mono font-bold text-neon-emerald">+ C$ {preCloseData.cashSales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-4 bg-white/3 rounded-lg">
                <span className="text-sm text-gray-400">Ventas por transferencia</span>
                <span className="font-mono font-bold text-neon-blue">+ C$ {preCloseData.transferSales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-4 border-t border-white/10 mt-1 pt-3">
                <span className="text-sm font-bold text-white uppercase tracking-wide">Total esperado en caja</span>
                <span className="font-mono font-black text-xl text-white">C$ {preCloseData.expectedCash.toFixed(2)}</span>
              </div>
              {preCloseData.creditSales > 0 && (
                <div className="flex justify-between items-center py-2.5 px-4 bg-amber-500/5 border border-amber-500/20 rounded-lg mt-2">
                  <div>
                    <span className="text-sm text-amber-400 font-semibold">Vendido al crédito</span>
                    <p className="text-[10px] text-gray-500">No está en caja — está en cartera por cobrar</p>
                  </div>
                  <span className="font-mono font-bold text-amber-400">C$ {preCloseData.creditSales.toFixed(2)}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mb-4 text-center">
              Cuente el efectivo físico de su caja y compárelo con el <span className="text-white font-semibold">Total esperado</span> antes de continuar.
            </p>

            <button
              onClick={() => {
                setShowPreCloseModal(false);
                setShowCloseSessionModal(true);
              }}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold uppercase rounded-lg text-xs transition flex items-center justify-center gap-2"
            >
              <ShieldAlert size={14} />
              Proceder al Cierre Definitivo
            </button>
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
