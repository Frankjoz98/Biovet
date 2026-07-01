import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, AlertTriangle, FileText, Edit, RefreshCw } from 'lucide-react';

export interface Product {
  id: string;
  code: string;
  name: string;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
}

export default function Inventario() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // New Product Form
  const [newProduct, setNewProduct] = useState({
    code: '',
    name: '',
    cost: '',
    price: '',
    stock: '0',
    min_stock: '5'
  });

  // New Purchase Form
  const [purchaseInvoice, setPurchaseInvoice] = useState({
    invoice_number: '',
    supplier_name: '',
    product_id: '',
    quantity: '',
    cost: ''
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bv_products')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error fetching products:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProduct.code || !newProduct.name || !newProduct.cost || !newProduct.price) {
      alert('Por favor complete todos los campos obligatorios.');
      return;
    }

    try {
      if (editingProduct) {
        // Update product
        const { error } = await supabase
          .from('bv_products')
          .update({
            code: newProduct.code,
            name: newProduct.name,
            cost: parseFloat(newProduct.cost),
            price: parseFloat(newProduct.price),
            stock: parseInt(newProduct.stock),
            min_stock: parseInt(newProduct.min_stock)
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
      } else {
        // Insert product
        const { error } = await supabase
          .from('bv_products')
          .insert({
            code: newProduct.code,
            name: newProduct.name,
            cost: parseFloat(newProduct.cost),
            price: parseFloat(newProduct.price),
            stock: parseInt(newProduct.stock),
            min_stock: parseInt(newProduct.min_stock)
          });

        if (error) throw error;
      }

      setShowAddModal(false);
      setEditingProduct(null);
      setNewProduct({ code: '', name: '', cost: '', price: '', stock: '0', min_stock: '5' });
      fetchProducts();
    } catch (err: any) {
      alert('Error guardando producto: ' + err.message);
    }
  }

  async function handleRegisterPurchase(e: React.FormEvent) {
    e.preventDefault();
    const { invoice_number, supplier_name, product_id, quantity, cost } = purchaseInvoice;
    if (!product_id || !quantity || !cost) {
      alert('Por favor complete los campos del producto, cantidad y costo.');
      return;
    }

    const qtyVal = parseInt(quantity);
    const costVal = parseFloat(cost);

    try {
      // 1. Create purchase record
      const { data: purchaseData, error: pError } = await supabase
        .from('bv_purchases')
        .insert({
          invoice_number: invoice_number || 'S/N',
          supplier_name: supplier_name || 'Proveedor General',
          total_amount: qtyVal * costVal
        })
        .select()
        .single();

      if (pError) throw pError;

      // 2. Create purchase item
      const { error: piError } = await supabase
        .from('bv_purchase_items')
        .insert({
          purchase_id: purchaseData.id,
          product_id,
          quantity: qtyVal,
          cost: costVal,
          total: qtyVal * costVal
        });

      if (piError) throw piError;

      // 3. Update product stock and cost
      const product = products.find(p => p.id === product_id);
      if (product) {
        const newStock = product.stock + qtyVal;
        const { error: prodError } = await supabase
          .from('bv_products')
          .update({
            stock: newStock,
            cost: costVal // Update to latest purchase cost
          })
          .eq('id', product_id);

        if (prodError) throw prodError;
      }

      setShowPurchaseModal(false);
      setPurchaseInvoice({ invoice_number: '', supplier_name: '', product_id: '', quantity: '', cost: '' });
      fetchProducts();
      alert('Compra registrada exitosamente. Inventario actualizado.');
    } catch (err: any) {
      alert('Error registrando compra: ' + err.message);
    }
  }

  function startEdit(product: Product) {
    setEditingProduct(product);
    setNewProduct({
      code: product.code,
      name: product.name,
      cost: product.cost.toString(),
      price: product.price.toString(),
      stock: product.stock.toString(),
      min_stock: product.min_stock.toString()
    });
    setShowAddModal(true);
  }

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Inventario de Medicamentos y Productos
          </h1>
          <p className="text-gray-400 text-sm mt-1">Administra el stock, costos de compra, precios de venta y compras a proveedores.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setEditingProduct(null);
              setNewProduct({ code: '', name: '', cost: '', price: '', stock: '0', min_stock: '5' });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition"
          >
            <Plus size={18} />
            Nuevo Producto
          </button>
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-lg transition"
          >
            <FileText size={18} />
            Registrar Compra
          </button>
        </div>
      </div>

      {/* Search & Actions */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o código de barra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0d0d18] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-neon-blue/50 transition text-sm"
          />
        </div>
        <button
          onClick={fetchProducts}
          className="p-2 border border-white/10 rounded-lg bg-[#0d0d18] hover:bg-white/5 transition text-gray-400"
          title="Refrescar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden shadow-card-glow">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-4 px-6">Código</th>
                  <th className="py-4 px-6">Producto</th>
                  <th className="py-4 px-6 text-right">Costo (Compra)</th>
                  <th className="py-4 px-6 text-right">Precio (Venta)</th>
                  <th className="py-4 px-6 text-right">Stock</th>
                  <th className="py-4 px-6">Alerta Stock</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 px-6 text-center text-gray-500">
                      No se encontraron productos registrados.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isLowStock = p.stock <= p.min_stock;
                    return (
                      <tr key={p.id} className="hover:bg-white/2 transition">
                        <td className="py-4 px-6 font-mono text-neon-blue text-xs">{p.code}</td>
                        <td className="py-4 px-6 font-medium text-white">{p.name}</td>
                        <td className="py-4 px-6 text-right font-mono">${p.cost.toFixed(2)}</td>
                        <td className="py-4 px-6 text-right font-mono">${p.price.toFixed(2)}</td>
                        <td className={`py-4 px-6 text-right font-bold font-mono ${isLowStock ? 'text-rose-500' : 'text-neon-emerald'}`}>
                          {p.stock}
                        </td>
                        <td className="py-4 px-6">
                          {isLowStock ? (
                            <span className="flex items-center gap-1 text-xs text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-full w-fit font-semibold border border-rose-500/20">
                              <AlertTriangle size={12} /> Stock Bajo (Min: {p.min_stock})
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Normal (Min: {p.min_stock})</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => startEdit(p)}
                            className="p-1.5 hover:bg-neon-blue/10 rounded-lg text-neon-blue transition"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingProduct ? 'Editar Producto' : 'Agregar Nuevo Producto'}
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Código de Barras / SKU *</label>
                <input
                  type="text"
                  required
                  value={newProduct.code}
                  onChange={(e) => setNewProduct({ ...newProduct, code: e.target.value })}
                  placeholder="Ej: 7441001122"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre del Producto *</label>
                <input
                  type="text"
                  required
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  placeholder="Ej: Desparasitante 10ml"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Costo Compra *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newProduct.cost}
                    onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Precio Venta *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Stock Inicial</label>
                  <input
                    type="number"
                    disabled={!!editingProduct} // For editing, stock should be changed via purchase entry
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Mínimo Stock</label>
                  <input
                    type="number"
                    value={newProduct.min_stock}
                    onChange={(e) => setNewProduct({ ...newProduct, min_stock: e.target.value })}
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition text-sm"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4">Ingreso de Compra / Reabastecimiento</h2>
            <form onSubmit={handleRegisterPurchase} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Número de Factura Proveedor</label>
                <input
                  type="text"
                  value={purchaseInvoice.invoice_number}
                  onChange={(e) => setPurchaseInvoice({ ...purchaseInvoice, invoice_number: e.target.value })}
                  placeholder="Ej: FAC-12345"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre del Proveedor</label>
                <input
                  type="text"
                  value={purchaseInvoice.supplier_name}
                  onChange={(e) => setPurchaseInvoice({ ...purchaseInvoice, supplier_name: e.target.value })}
                  placeholder="Ej: Distribuidora Veterinaria S.A."
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Producto a Ingresar *</label>
                <select
                  required
                  value={purchaseInvoice.product_id}
                  onChange={(e) => {
                    const prod = products.find(p => p.id === e.target.value);
                    setPurchaseInvoice({ 
                      ...purchaseInvoice, 
                      product_id: e.target.value,
                      cost: prod ? prod.cost.toString() : ''
                    });
                  }}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                >
                  <option value="">Seleccione un producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Cantidad *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={purchaseInvoice.quantity}
                    onChange={(e) => setPurchaseInvoice({ ...purchaseInvoice, quantity: e.target.value })}
                    placeholder="Cantidad"
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Costo Unitario Compra *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={purchaseInvoice.cost}
                    onChange={(e) => setPurchaseInvoice({ ...purchaseInvoice, cost: e.target.value })}
                    placeholder="Costo"
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-lg transition text-sm"
                >
                  Ingresar Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
