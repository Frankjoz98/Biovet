import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Plus, Search, AlertTriangle, FileText, Edit, RefreshCw, Trash2, PackagePlus, Tag, Repeat } from 'lucide-react';

export interface Product {
  id: string;
  code: string;
  name: string;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
  category: string;
}

interface InventarioProps {
  userRole: 'admin' | 'collaborator';
}

// The 7 canonical product categories used for commissions
const PRODUCT_CATEGORIES = [
  'Farmacos',
  'Agroquimicos',
  'Concentrados',
  'Accesorios mascotas',
  'Minerales',
  'Semillas de pasto',
  'Otros',
];

// A single line-item inside a purchase order
interface PurchaseItem {
  product_id: string;
  quantity: string;
  cost: string;
}

const EMPTY_PURCHASE_ITEM: PurchaseItem = { product_id: '', quantity: '', cost: '' };

export default function Inventario({ userRole }: InventarioProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [stockFilter, setStockFilter] = useState('Todos');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [savingPurchase, setSavingPurchase] = useState(false);

  // New Product Form
  const [newProduct, setNewProduct] = useState({
    code: '',
    name: '',
    cost: '',
    price: '',
    stock: '0',
    min_stock: '5',
    category: 'Otros',
  });

  // ── Purchase invoice (supports multiple items) ──────────────────────────────
  const [purchaseHeader, setPurchaseHeader] = useState({
    invoice_number: '',
    supplier_name: '',
  });
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([{ ...EMPTY_PURCHASE_ITEM }]);

  // ── Transfer / Conversion State ──────────────────────────────────────────────
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({
    sourceProductId: '',
    sourceQty: '1',
    targetProductId: '',
    conversionFactor: '100',
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  async function handleExecuteTransfer(e: React.FormEvent) {
    e.preventDefault();
    const sourceProduct = products.find(p => p.id === transferForm.sourceProductId);
    const targetProduct = products.find(p => p.id === transferForm.targetProductId);

    if (!sourceProduct || !targetProduct) {
      toast.warning('Por favor seleccione el producto origen y el producto destino.');
      return;
    }

    if (sourceProduct.id === targetProduct.id) {
      toast.warning('El producto origen y el producto destino deben ser distintos.');
      return;
    }

    const qtySource = parseFloat(transferForm.sourceQty);
    const factor = parseFloat(transferForm.conversionFactor);

    if (isNaN(qtySource) || qtySource <= 0) {
      toast.warning('Ingrese una cantidad a extraer válida.');
      return;
    }

    if (isNaN(factor) || factor <= 0) {
      toast.warning('Ingrese un factor de conversión válido.');
      return;
    }

    if (sourceProduct.stock < qtySource) {
      toast.error(`Stock insuficiente en ${sourceProduct.name}. Disponible: ${sourceProduct.stock}`);
      return;
    }

    const targetAddQty = qtySource * factor;

    setSavingTransfer(true);
    try {
      // 1. Restar stock a origen
      const { error: errSource } = await supabase
        .from('bv_products')
        .update({ stock: sourceProduct.stock - qtySource })
        .eq('id', sourceProduct.id);
      if (errSource) throw errSource;

      // 2. Sumar stock a destino
      const { error: errTarget } = await supabase
        .from('bv_products')
        .update({ stock: targetProduct.stock + targetAddQty })
        .eq('id', targetProduct.id);
      if (errTarget) throw errTarget;

      // 3. Registrar auditoría
      await supabase.from('bv_audit_log').insert({
        action: 'STOCK_TRANSFER',
        entity: 'bv_products',
        entity_id: sourceProduct.id,
        old_value: {
          source_name: sourceProduct.name,
          source_old_stock: sourceProduct.stock,
          target_name: targetProduct.name,
          target_old_stock: targetProduct.stock,
        },
        new_value: {
          source_new_stock: sourceProduct.stock - qtySource,
          target_new_stock: targetProduct.stock + targetAddQty,
          qty_transferred: qtySource,
          conversion_factor: factor,
          units_added: targetAddQty,
        }
      });

      setShowTransferModal(false);
      setTransferForm({ sourceProductId: '', sourceQty: '1', targetProductId: '', conversionFactor: '100' });
      fetchProducts();
      toast.success(`Conversión realizada: -${qtySource} en "${sourceProduct.name}" y +${targetAddQty} en "${targetProduct.name}".`);
    } catch (error) {
      const err = error as Error;
      toast.error('Error al realizar el traslado: ' + err.message);
    } finally {
      setSavingTransfer(false);
    }
  }

  async function fetchProducts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bv_products')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      const err = error as Error;
      console.error('Error fetching products:', err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Product CRUD ─────────────────────────────────────────────────────────────
  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProduct.code || !newProduct.name || !newProduct.cost || !newProduct.price) {
      toast.warning('Por favor complete todos los campos obligatorios.');
      return;
    }

    try {
      const payload = {
        code: newProduct.code,
        name: newProduct.name,
        cost: parseFloat(newProduct.cost),
        price: parseFloat(newProduct.price),
        stock: parseInt(newProduct.stock),
        min_stock: parseInt(newProduct.min_stock),
        category: newProduct.category,
      };

      if (editingProduct) {
        const { error } = await supabase.from('bv_products').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
        
        // Registrar en bitácora si cambió el costo
        if (editingProduct.cost !== payload.cost) {
          await supabase.from('bv_audit_log').insert({
            action: 'costo_actualizado',
            entity: 'bv_products',
            entity_id: editingProduct.id,
            old_value: { costo_anterior: editingProduct.cost },
            new_value: { costo_nuevo: payload.cost }
          });
        }
        
        // Registrar edición general
        await supabase.from('bv_audit_log').insert({
          action: 'producto_editado',
          entity: 'bv_products',
          entity_id: editingProduct.id,
          old_value: { nombre: editingProduct.name, precio: editingProduct.price, stock: editingProduct.stock },
          new_value: { nombre: payload.name, precio: payload.price, stock: payload.stock }
        });

        toast.success('Producto actualizado con éxito.');
      } else {
        const { error } = await supabase.from('bv_products').insert(payload);
        if (error) throw error;
        toast.success('Producto agregado con éxito.');
      }

      setShowAddModal(false);
      setEditingProduct(null);
      setNewProduct({ code: '', name: '', cost: '', price: '', stock: '0', min_stock: '5', category: 'Otros' });
      fetchProducts();
    } catch (error) {
      const err = error as Error;
      toast.error('Error guardando producto: ' + err.message);
    }
  }

  // ── Multi-product Purchase ───────────────────────────────────────────────────
  function addPurchaseLine() {
    setPurchaseItems(prev => [...prev, { ...EMPTY_PURCHASE_ITEM }]);
  }

  function removePurchaseLine(idx: number) {
    setPurchaseItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePurchaseLine(idx: number, field: keyof PurchaseItem, value: string) {
    setPurchaseItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Auto-fill cost from latest product cost when product is selected
      if (field === 'product_id' && value) {
        const prod = products.find(p => p.id === value);
        if (prod) updated[idx].cost = prod.cost.toString();
      }
      return updated;
    });
  }

  const purchaseTotal = purchaseItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const cost = parseFloat(item.cost) || 0;
    return sum + qty * cost;
  }, 0);

  async function handleRegisterPurchase(e: React.FormEvent) {
    e.preventDefault();

    // Validate all lines have product, quantity, cost
    const valid = purchaseItems.every(i => i.product_id && i.quantity && i.cost);
    if (!valid || purchaseItems.length === 0) {
      toast.warning('Todos los ítems deben tener producto, cantidad y costo.');
      return;
    }

    setSavingPurchase(true);
    try {
      // 1. Create purchase header
      const { data: purchaseData, error: pError } = await supabase
        .from('bv_purchases')
        .insert({
          invoice_number: purchaseHeader.invoice_number || 'S/N',
          supplier_name: purchaseHeader.supplier_name || 'Proveedor General',
          total_amount: purchaseTotal,
        })
        .select()
        .single();

      if (pError) throw pError;

      // 2. Insert all line items and update stock for each
      for (const item of purchaseItems) {
        const qtyVal = parseInt(item.quantity);
        const costVal = parseFloat(item.cost);

        // Insert purchase item
        const { error: piError } = await supabase.from('bv_purchase_items').insert({
          purchase_id: purchaseData.id,
          product_id: item.product_id,
          quantity: qtyVal,
          cost: costVal,
          total: qtyVal * costVal,
        });
        if (piError) throw piError;

        // Update stock + cost for this product
        const product = products.find(p => p.id === item.product_id);
        if (product) {
          const { error: prodError } = await supabase
            .from('bv_products')
            .update({ stock: product.stock + qtyVal, cost: costVal })
            .eq('id', item.product_id);
          if (prodError) throw prodError;
        }
      }

      setShowPurchaseModal(false);
      setPurchaseHeader({ invoice_number: '', supplier_name: '' });
      setPurchaseItems([{ ...EMPTY_PURCHASE_ITEM }]);
      fetchProducts();
      toast.success(`Compra registrada. ${purchaseItems.length} producto(s) actualizados.`);
    } catch (error) {
      const err = error as Error;
      toast.error('Error registrando compra: ' + err.message);
    } finally {
      setSavingPurchase(false);
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
      min_stock: product.min_stock.toString(),
      category: product.category || 'Otros',
    });
    setShowAddModal(true);
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'Todas' || (p.category || 'Otros') === categoryFilter;
    const matchesStock = stockFilter === 'Todos' ? true :
                         stockFilter === 'En Stock' ? p.stock > p.min_stock :
                         p.stock <= p.min_stock;
    return matchesSearch && matchesCategory && matchesStock;
  });

  const inputClass = 'w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm';
  const inputMonoClass = inputClass + ' font-mono';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Inventario de Productos
          </h1>
          <p className="text-gray-400 text-sm mt-1">Administra stock, costos, precios, categorías y compras a proveedores.</p>
        </div>
        {userRole === 'admin' && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditingProduct(null);
                setNewProduct({ code: '', name: '', cost: '', price: '', stock: '0', min_stock: '5', category: 'Otros' });
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition"
            >
              <Plus size={18} />
              Nuevo Producto
            </button>
            <button
              onClick={() => {
                setPurchaseHeader({ invoice_number: '', supplier_name: '' });
                setPurchaseItems([{ ...EMPTY_PURCHASE_ITEM }]);
                setShowPurchaseModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-lg transition"
            >
              <FileText size={18} />
              Registrar Compra
            </button>
            <button
              onClick={() => {
                setTransferForm({ sourceProductId: '', sourceQty: '1', targetProductId: '', conversionFactor: '100' });
                setShowTransferModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition shadow-lg shadow-purple-900/30"
            >
              <Repeat size={18} />
              Traslado / Conversión
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
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
        <div className="flex gap-3 overflow-x-auto pb-1 lg:pb-0">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#0d0d18] border border-white/10 rounded-lg py-2 px-4 text-gray-300 text-sm focus:outline-none focus:border-neon-blue cursor-pointer shrink-0"
          >
            <option value="Todas">Todas las categorías</option>
            {PRODUCT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="bg-[#0d0d18] border border-white/10 rounded-lg py-2 px-4 text-gray-300 text-sm focus:outline-none focus:border-neon-blue cursor-pointer shrink-0"
          >
            <option value="Todos">Todo el stock</option>
            <option value="En Stock">✅ En stock</option>
            <option value="Bajo Stock">⚠️ Bajo stock / Agotado</option>
          </select>
          <button onClick={fetchProducts} className="p-2 border border-white/10 rounded-lg bg-[#0d0d18] hover:bg-white/5 transition text-gray-400 shrink-0" title="Refrescar">
            <RefreshCw size={18} />
          </button>
        </div>
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
                  <th className="py-4 px-4">Código</th>
                  <th className="py-4 px-4">Producto</th>
                  <th className="py-4 px-4">Categoría</th>
                  {userRole === 'admin' && <th className="py-4 px-4 text-right">Costo (Compra)</th>}
                  <th className="py-4 px-4 text-right">Precio (Venta)</th>
                  <th className="py-4 px-4 text-right">Stock</th>
                  <th className="py-4 px-4">Alerta</th>
                  {userRole === 'admin' && <th className="py-4 px-4 text-center">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 px-6 text-center text-gray-500">No se encontraron productos registrados.</td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isLowStock = p.stock <= p.min_stock;
                    return (
                      <tr key={p.id} className="hover:bg-white/2 transition">
                        <td className="py-3 px-4 font-mono text-neon-blue text-xs">{p.code}</td>
                        <td className="py-3 px-4 font-medium text-white">{p.name}</td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-full">
                            {p.category || 'Otros'}
                          </span>
                        </td>
                        {userRole === 'admin' && <td className="py-3 px-4 text-right font-mono">C$ {p.cost.toFixed(2)}</td>}
                        <td className="py-3 px-4 text-right font-mono">C$ {p.price.toFixed(2)}</td>
                        <td className={`py-3 px-4 text-right font-bold font-mono ${isLowStock ? 'text-rose-500' : 'text-neon-emerald'}`}>{p.stock}</td>
                        <td className="py-3 px-4">
                          {isLowStock ? (
                            <span className="flex items-center gap-1 text-xs text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-full w-fit font-semibold border border-rose-500/20">
                              <AlertTriangle size={11} /> Bajo (Min: {p.min_stock})
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Normal (Min: {p.min_stock})</span>
                          )}
                        </td>
                        {userRole === 'admin' && (
                          <td className="py-3 px-4 text-center">
                            <button onClick={() => startEdit(p)} className="p-1.5 hover:bg-neon-blue/10 rounded-lg text-neon-blue transition" title="Editar">
                              <Edit size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add / Edit Product Modal ─────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-5">
              {editingProduct ? 'Editar Producto' : 'Agregar Nuevo Producto'}
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              {/* Code */}
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Código de Barras / SKU *</label>
                <input type="text" required value={newProduct.code}
                  onChange={(e) => setNewProduct({ ...newProduct, code: e.target.value })}
                  placeholder="Ej: 7441001122" className={inputClass} />
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre del Producto *</label>
                <input type="text" required value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  placeholder="Ej: Desparasitante 10ml" className={inputClass} />
              </div>

              {/* Category */}
              <div>
                <label className="flex items-center gap-1 text-xs font-semibold uppercase text-gray-400 mb-1">
                  <Tag size={11} /> Categoría (Línea de Producto) *
                </label>
                <select value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  className={inputClass}>
                  {PRODUCT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">Define la comisión del vendedor por esta línea de producto.</p>
              </div>

              {/* Cost & Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Costo Compra *</label>
                  <input type="number" step="0.01" required value={newProduct.cost}
                    onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
                    placeholder="0.00" className={inputMonoClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Precio Venta *</label>
                  <input type="number" step="0.01" required value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    placeholder="0.00" className={inputMonoClass} />
                </div>
              </div>

              {/* Stock & Min */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Stock Inicial</label>
                  <input type="number" disabled={!!editingProduct} value={newProduct.stock}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                    className={inputMonoClass + ' disabled:opacity-50'} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Mínimo Stock</label>
                  <input type="number" value={newProduct.min_stock}
                    onChange={(e) => setNewProduct({ ...newProduct, min_stock: e.target.value })}
                    className={inputMonoClass} />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm">Cancelar</button>
                <button type="submit"
                  className="px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition text-sm">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Register Multi-Product Purchase Modal ────────────────────────────── */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-2xl rounded-xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <PackagePlus size={20} className="text-emerald-400" />
              Ingreso de Compra / Reabastecimiento
            </h2>
            <p className="text-xs text-gray-400 mb-5">Puedes agregar múltiples productos de una misma factura de proveedor.</p>

            <form onSubmit={handleRegisterPurchase} className="flex flex-col gap-4 overflow-y-auto flex-1">
              {/* Header: Invoice + Supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nº Factura Proveedor</label>
                  <input type="text" value={purchaseHeader.invoice_number}
                    onChange={(e) => setPurchaseHeader({ ...purchaseHeader, invoice_number: e.target.value })}
                    placeholder="Ej: FAC-12345" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre del Proveedor</label>
                  <input type="text" value={purchaseHeader.supplier_name}
                    onChange={(e) => setPurchaseHeader({ ...purchaseHeader, supplier_name: e.target.value })}
                    placeholder="Ej: Distribuidora Vet S.A." className={inputClass} />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">Productos de la Factura</span>
                  <button type="button" onClick={addPurchaseLine}
                    className="flex items-center gap-1.5 text-xs font-bold text-neon-blue border border-neon-blue/30 bg-neon-blue/10 hover:bg-neon-blue/20 px-3 py-1.5 rounded-lg transition">
                    <Plus size={13} /> Agregar Línea
                  </button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase text-gray-500 px-1">
                  <span className="col-span-5">Producto</span>
                  <span className="col-span-3 text-center">Cantidad</span>
                  <span className="col-span-3 text-center">Costo Unit.</span>
                  <span className="col-span-1"></span>
                </div>

                {purchaseItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white/2 border border-white/5 rounded-lg p-2">
                    {/* Product selector */}
                    <select
                      required
                      value={item.product_id}
                      onChange={(e) => updatePurchaseLine(idx, 'product_id', e.target.value)}
                      className="col-span-5 bg-[#0d0d18] border border-white/10 rounded-md p-2 text-white text-xs focus:outline-none focus:border-neon-blue"
                    >
                      <option value="">Seleccionar...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>

                    {/* Quantity */}
                    <input
                      type="number" required min="1"
                      placeholder="Cant."
                      value={item.quantity}
                      onChange={(e) => updatePurchaseLine(idx, 'quantity', e.target.value)}
                      className="col-span-3 bg-[#0d0d18] border border-white/10 rounded-md p-2 text-white text-xs font-mono text-center focus:outline-none focus:border-neon-blue"
                    />

                    {/* Unit cost */}
                    <input
                      type="number" required step="0.01" min="0"
                      placeholder="Costo"
                      value={item.cost}
                      onChange={(e) => updatePurchaseLine(idx, 'cost', e.target.value)}
                      className="col-span-3 bg-[#0d0d18] border border-white/10 rounded-md p-2 text-white text-xs font-mono text-center focus:outline-none focus:border-neon-blue"
                    />

                    {/* Remove line */}
                    <button
                      type="button"
                      onClick={() => removePurchaseLine(idx)}
                      disabled={purchaseItems.length === 1}
                      className="col-span-1 flex items-center justify-center p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-md transition disabled:opacity-30"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Total summary */}
              <div className="flex justify-between items-center bg-white/2 border border-white/5 rounded-lg px-4 py-3 mt-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Factura:</span>
                <span className="text-lg font-black font-mono text-neon-emerald">C$ {purchaseTotal.toFixed(2)}</span>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm">Cancelar</button>
                <button type="submit" disabled={savingPurchase}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-lg transition text-sm flex items-center gap-2 disabled:opacity-60">
                  {savingPurchase ? 'Guardando...' : `Ingresar ${purchaseItems.length} Producto(s)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Traslado / Conversión de Inventario */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-xl rounded-2xl p-6 shadow-2xl relative border border-purple-500/20">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400">
                  <Repeat size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Traslado y Conversión de Stock</h2>
                  <p className="text-xs text-gray-400">Fracciona sacos/quintales hacia su presentación en libras o menudeo.</p>
                </div>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-gray-400 hover:text-white transition p-1"
              >
                <Trash2 size={0} className="hidden" /> {/* Dummy icon if needed */}
                <span className="text-xl font-bold">&times;</span>
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-5">
              {/* Bloque Origen (De) */}
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 space-y-3">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block">1. Producto Origen (Se descontará stock)</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">Seleccionar Producto Mayo</label>
                    <select
                      required
                      value={transferForm.sourceProductId}
                      onChange={(e) => setTransferForm({ ...transferForm, sourceProductId: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">-- Seleccionar producto --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code}) — Stock: {p.stock}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">Cant. Extraer</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      value={transferForm.sourceQty}
                      onChange={(e) => setTransferForm({ ...transferForm, sourceQty: e.target.value })}
                      className={inputMonoClass}
                      placeholder="Ej: 1"
                    />
                  </div>
                </div>
              </div>

              {/* Icono Conector */}
              <div className="flex justify-center -my-2">
                <div className="bg-purple-600/30 border border-purple-500/40 text-purple-300 p-2 rounded-full shadow-lg animate-bounce">
                  <Repeat size={16} />
                </div>
              </div>

              {/* Bloque Destino (A) */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">2. Producto Destino (Se incrementará stock)</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">Seleccionar Producto Menudeo</label>
                    <select
                      required
                      value={transferForm.targetProductId}
                      onChange={(e) => setTransferForm({ ...transferForm, targetProductId: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">-- Seleccionar producto --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code}) — Stock: {p.stock}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">Unidades / Factor</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      value={transferForm.conversionFactor}
                      onChange={(e) => setTransferForm({ ...transferForm, conversionFactor: e.target.value })}
                      className={inputMonoClass}
                      placeholder="Ej: 100"
                    />
                  </div>
                </div>
              </div>

              {/* Previsualización en Tiempo Real */}
              {(() => {
                const srcP = products.find(p => p.id === transferForm.sourceProductId);
                const tgtP = products.find(p => p.id === transferForm.targetProductId);
                const sQty = parseFloat(transferForm.sourceQty) || 0;
                const factor = parseFloat(transferForm.conversionFactor) || 0;
                const addedQty = sQty * factor;

                if (!srcP || !tgtP) return null;

                const srcNewStock = srcP.stock - sQty;
                const tgtNewStock = tgtP.stock + addedQty;

                return (
                  <div className="bg-[#080812] border border-white/10 rounded-xl p-3.5 space-y-2">
                    <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">Resumen del Movimiento:</span>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                      <div className="p-2 bg-white/5 rounded-lg">
                        <span className="text-gray-400 block text-[10px]">ORIGEN ({srcP.name}):</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-rose-400 font-bold">{srcP.stock}</span>
                          <span className="text-gray-500">➜</span>
                          <span className={`font-bold ${srcNewStock < 0 ? 'text-rose-500 underline' : 'text-white'}`}>{srcNewStock}</span>
                        </div>
                      </div>
                      <div className="p-2 bg-white/5 rounded-lg">
                        <span className="text-gray-400 block text-[10px]">DESTINO ({tgtP.name}):</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-gray-400">{tgtP.stock}</span>
                          <span className="text-gray-500">➜</span>
                          <span className="text-emerald-400 font-bold">+{addedQty} ({tgtNewStock})</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Acciones */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingTransfer}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition text-sm flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-purple-900/40"
                >
                  {savingTransfer ? 'Procesando...' : 'Ejecutar Traslado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
