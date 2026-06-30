import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, ClipboardList, Plus, RefreshCw, ShoppingBag } from 'lucide-react';

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  created_at: string;
}

interface SaleRow {
  id: string;
  total_amount: number;
  payment_method: string;
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

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  
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

  // Add Expense form
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    category: 'Alquiler'
  });

  useEffect(() => {
    fetchFinancialData();
  }, []);

  async function fetchFinancialData() {
    setLoading(true);
    try {
      // 1. Fetch sales
      const { data: salesData } = await supabase
        .from('bv_sales')
        .select('id, total_amount, payment_method, created_at, bv_clients(name)')
        .order('created_at', { ascending: false });

      // 2. Fetch sale items to calculate COGS
      const { data: saleItemsData } = await supabase
        .from('bv_sale_items')
        .select('quantity, unit_cost');

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

      // Calculations
      const totalSales = (salesData || []).reduce((sum, s) => sum + Number(s.total_amount), 0);
      const totalExpenses = (expensesData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const totalCogs = (saleItemsData || []).reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unit_cost)), 0);
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

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Reportes y Flujo Financiero
          </h1>
          <p className="text-gray-400 text-sm mt-1">Monitorea ingresos, egresos de caja, costos de inventario y ganancias netas.</p>
        </div>
        <div className="flex gap-3">
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
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Ventas */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Total Ventas</span>
                <span className="text-2xl font-black font-mono text-white">${summary.totalSales.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-neon-blue/10 rounded-lg text-neon-blue">
                <TrendingUp size={20} />
              </div>
            </div>

            {/* Costo Mercancía */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Costo Ventas (Invertido)</span>
                <span className="text-2xl font-black font-mono text-gray-400">${summary.totalCogs.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-white/5 rounded-lg text-gray-400">
                <ClipboardList size={20} />
              </div>
            </div>

            {/* Gastos */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow">
              <div className="space-y-1">
                <span className="text-gray-400 text-xs font-semibold uppercase block">Gastos Operativos</span>
                <span className="text-2xl font-black font-mono text-rose-500">${summary.totalExpenses.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-rose-500/10 rounded-lg text-rose-500">
                <TrendingDown size={20} />
              </div>
            </div>

            {/* Ganancias */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between shadow-card-glow border-neon-emerald/20 bg-neon-emerald/5">
              <div className="space-y-1">
                <span className="text-neon-emerald text-xs font-semibold uppercase block">Ganancia Neta</span>
                <span className="text-2xl font-black font-mono text-neon-emerald">${summary.netProfit.toFixed(2)}</span>
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
                Historial de Ventas Recientes
              </h2>
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                        <th className="py-3 px-4">Fecha</th>
                        <th className="py-3 px-4">Cliente</th>
                        <th className="py-3 px-4">Método</th>
                        <th className="py-3 px-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs font-sans">
                      {recentSales.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-gray-500">No hay ventas registradas.</td>
                        </tr>
                      ) : (
                        recentSales.map((s) => (
                          <tr key={s.id} className="hover:bg-white/2 transition">
                            <td className="py-3 px-4 text-gray-400">{new Date(s.created_at).toLocaleString()}</td>
                            <td className="py-3 px-4 text-white font-medium">{s.bv_clients?.name || 'Venta General'}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                s.payment_method === 'cash' ? 'bg-neon-emerald/20 text-neon-emerald' : s.payment_method === 'transfer' ? 'bg-neon-blue/20 text-neon-blue' : 'bg-amber-500/20 text-amber-500'
                              }`}>
                                {s.payment_method === 'cash' ? 'Efectivo' : s.payment_method === 'transfer' ? 'Transf.' : 'Crédito'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-white font-mono">${s.total_amount.toFixed(2)}</td>
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
                        <span className="font-bold text-rose-500 font-mono">${e.amount.toFixed(2)}</span>
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
                        <div>
                          <span className="font-semibold text-white block">{p.supplier_name}</span>
                          <span className="text-[10px] text-gray-500 font-mono">Factura: {p.invoice_number}</span>
                        </div>
                        <span className="font-bold text-emerald-500 font-mono">${p.total_amount.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        </>
      )}

      {/* Add Expense Modal */}
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
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Monto ($) *</label>
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

    </div>
  );
}
