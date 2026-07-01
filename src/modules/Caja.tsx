import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, ShoppingCart, Trash2, User, CreditCard, DollarSign, ArrowRight, RefreshCw, Printer, X } from 'lucide-react';
import type { Product } from './Inventario';
import type { Client } from './Clientes';

interface CartItem {
  product: Product;
  quantity: number;
}

export default function Caja() {
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
  const [cashReceived, setCashReceived] = useState('');

  // Receipt modal state
  const [receiptData, setReceiptData] = useState<{
    id: string;
    items: CartItem[];
    total: number;
    paymentMethod: string;
    cashReceived: number;
    change: number;
    clientName?: string;
    date: string;
  } | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

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

      setProducts(prodData || []);
      setClients(clientData || []);
    } catch (err: any) {
      console.error('Error fetching checkout data:', err.message);
    } finally {
      setLoading(false);
    }
  }

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      alert('¡Producto sin stock disponible!');
      return;
    }

    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    if (existingIndex > -1) {
      const newQty = cart[existingIndex].quantity + 1;
      if (newQty > product.stock) {
        alert(`No hay suficiente stock. Disponible: ${product.stock}`);
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
      alert(`No hay suficiente stock. Disponible: ${item.product.stock}`);
      return;
    }

    setCart(cart.map(item => 
      item.product.id === productId ? { ...item, quantity } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      alert('El carrito está vacío.');
      return;
    }

    if (paymentMethod === 'credit' && !selectedClient) {
      alert('Debe seleccionar un cliente para realizar una venta al crédito.');
      return;
    }

    const cashReceivedVal = parseFloat(cashReceived) || 0;
    if (paymentMethod === 'cash' && cashReceivedVal < cartTotal) {
      alert(`El dinero recibido ($${cashReceivedVal.toFixed(2)}) es menor que el total de la venta ($${cartTotal.toFixed(2)}).`);
      return;
    }

    if (paymentMethod === 'credit' && selectedClient) {
      // Validate credit limit
      const projectedDebt = selectedClient.current_debt + cartTotal;
      if (projectedDebt > selectedClient.credit_limit) {
        const confirmOver = window.confirm(
          `¡Límite de crédito excedido!\n\n` +
          `Límite: $${selectedClient.credit_limit.toFixed(2)}\n` +
          `Deuda Actual: $${selectedClient.current_debt.toFixed(2)}\n` +
          `Venta Nueva: $${cartTotal.toFixed(2)}\n` +
          `Deuda Proyectada: $${projectedDebt.toFixed(2)}\n\n` +
          `¿Desea autorizar esta venta de todas formas?`
        );
        if (!confirmOver) return;
      }
    }

    try {
      // 1. Insert into bv_sales
      const { data: saleData, error: saleError } = await supabase
        .from('bv_sales')
        .insert({
          client_id: selectedClient?.id || null,
          payment_method: paymentMethod,
          total_amount: cartTotal,
          cash_received: paymentMethod === 'cash' ? cashReceivedVal : 0
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // 2. Insert items into bv_sale_items & Update stock
      for (const item of cart) {
        const { error: itemError } = await supabase
          .from('bv_sale_items')
          .insert({
            sale_id: saleData.id,
            product_id: item.product.id,
            quantity: item.quantity,
            unit_cost: item.product.cost,
            unit_price: item.product.price,
            total: item.product.price * item.quantity
          });

        if (itemError) throw itemError;

        // Decrement stock in database
        const { error: stockError } = await supabase
          .from('bv_products')
          .update({ stock: item.product.stock - item.quantity })
          .eq('id', item.product.id);

        if (stockError) throw stockError;
      }

      // 3. Show Receipt Modal
      setReceiptData({
        id: saleData.id.substring(0, 8),
        items: [...cart],
        total: cartTotal,
        paymentMethod: paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'transfer' ? 'Transferencia' : 'Crédito',
        cashReceived: paymentMethod === 'cash' ? cashReceivedVal : 0,
        change: paymentMethod === 'cash' ? Math.max(0, cashReceivedVal - cartTotal) : 0,
        clientName: selectedClient?.name,
        date: new Date().toLocaleString()
      });

      // Reset cart and states
      setCart([]);
      setCashReceived('');
      setSelectedClient(null);
      setPaymentMethod('cash');
      
      // Refresh inventory
      fetchInitialData();
    } catch (err: any) {
      alert('Error procesando la venta: ' + err.message);
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      
      {/* Product Selection (Left 2 Columns) */}
      <div className="lg:col-span-2 flex flex-col h-full space-y-4">
        {/* Search */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Escribe el nombre o escanea el código del producto..."
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
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
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
                      <span className="text-[10px] font-mono text-neon-blue group-hover:text-white transition">{p.code}</span>
                      <h3 className="text-sm font-semibold text-white mt-1 line-clamp-2">{p.name}</h3>
                    </div>
                    <div className="flex justify-between items-end w-full mt-2">
                      <span className="text-xs text-gray-400 font-mono">Stock: <b className={p.stock <= p.min_stock ? 'text-rose-500' : 'text-neon-emerald'}>{p.stock}</b></span>
                      <span className="text-base font-bold font-mono text-white">${p.price.toFixed(2)}</span>
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
      <div className="glass-panel rounded-xl border border-white/10 flex flex-col h-full overflow-hidden shadow-card-glow bg-glass-card">
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                  <span className="text-[10px] text-gray-400 font-mono">${item.product.price.toFixed(2)} x {item.quantity}</span>
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
                <span className="text-[10px] text-gray-400 font-mono">Deuda: ${selectedClient.current_debt.toFixed(2)} / Límite: ${selectedClient.credit_limit.toFixed(2)}</span>
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
        <div className="p-4 border-t border-white/5 bg-[#07070f] space-y-4">
          {/* Total Price */}
          <div className="flex justify-between items-end">
            <span className="text-gray-400 text-xs font-semibold uppercase">Total a Cobrar</span>
            <span className="text-2xl font-black font-mono text-white">${cartTotal.toFixed(2)}</span>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'transfer', 'credit'] as const).map((method) => {
              const isActive = paymentMethod === method;
              return (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 px-1 border rounded-lg text-xs font-semibold uppercase transition flex flex-col items-center gap-1 ${
                    isActive 
                      ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' 
                      : 'bg-white/2 border-white/10 text-gray-400 hover:bg-white/5'
                  }`}
                >
                  {method === 'cash' ? <DollarSign size={14} /> : method === 'transfer' ? <RefreshCw size={14} /> : <CreditCard size={14} />}
                  <span>{method === 'cash' ? 'Efectivo' : method === 'transfer' ? 'Transf.' : 'Crédito'}</span>
                </button>
              );
            })}
          </div>

          {/* Cash input for change calculation */}
          {paymentMethod === 'cash' && (
            <div className="flex gap-2 items-center bg-[#0d0d18] border border-white/10 p-2 rounded-lg">
              <span className="text-xs text-gray-400 font-semibold uppercase pl-1">Efectivo Recibido:</span>
              <input
                type="number"
                placeholder="0.00"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="flex-1 bg-transparent text-right font-mono text-sm text-white focus:outline-none font-bold"
              />
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleCompleteSale}
            disabled={cart.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-neon-blue hover:bg-neon-blue/80 text-black font-black uppercase tracking-wider rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-neon-blue"
          >
            Completar Transacción
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-black w-full max-w-sm rounded-lg p-6 shadow-2xl font-mono text-xs space-y-4">
            
            <div className="text-center space-y-1 relative">
              <button 
                onClick={() => setReceiptData(null)}
                className="absolute right-0 top-0 p-1 text-gray-400 hover:text-black transition"
              >
                <X size={18} />
              </button>
              <h2 className="text-base font-black uppercase">BioVet Clínica Veterinaria</h2>
              <p className="text-[10px]">Atención Profesional y Calidad</p>
              <p className="text-[10px]">{receiptData.date}</p>
            </div>

            <hr className="border-dashed border-black" />

            <div className="space-y-1">
              <p><b>Transacción ID:</b> {receiptData.id}</p>
              <p><b>Método Pago:</b> {receiptData.paymentMethod}</p>
              {receiptData.clientName && <p><b>Cliente:</b> {receiptData.clientName}</p>}
            </div>

            <hr className="border-dashed border-black" />

            {/* Receipt Items */}
            <div className="space-y-1.5">
              {receiptData.items.map((item) => (
                <div key={item.product.id} className="flex justify-between">
                  <span>{item.product.name} (x{item.quantity})</span>
                  <span>${(item.product.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <hr className="border-dashed border-black" />

            <div className="space-y-1 text-right">
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL:</span>
                <span>${receiptData.total.toFixed(2)}</span>
              </div>
              {receiptData.paymentMethod === 'Efectivo' && (
                <>
                  <div className="flex justify-between">
                    <span>Recibido:</span>
                    <span>${receiptData.cashReceived.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cambio:</span>
                    <span>${receiptData.change.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            <hr className="border-dashed border-black" />

            <div className="text-center font-bold py-2 space-y-2">
              <p>¡Gracias por su confianza!</p>
              <button
                onClick={() => window.print()}
                className="no-print mx-auto flex items-center gap-1.5 px-3 py-1 bg-black text-white hover:bg-gray-800 rounded font-sans font-bold text-xs transition"
              >
                <Printer size={12} />
                Imprimir Recibo
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
