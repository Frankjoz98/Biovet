import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Plus, Search, Edit, CreditCard, DollarSign, RefreshCw, X } from 'lucide-react';

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  credit_limit: number;
  current_debt: number;
}

export interface Credit {
  id: string;
  sale_id: string;
  total_amount: number;
  remaining_amount: number;
  status: string;
  created_at: string;
}

export default function Clientes() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modals & Selected details
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientCredits, setClientCredits] = useState<Credit[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);

  // New Client Form
  const [newClient, setNewClient] = useState({
    name: '',
    phone: '',
    email: '',
    credit_limit: '500' // Default limit
  });

  // New Abono Form
  const [abonoForm, setAbonoForm] = useState({
    amount: '',
    payment_method: 'cash',
    notes: ''
  });

  // Credit payments history
  const [creditPaymentsMap, setCreditPaymentsMap] = useState<Record<string, {id: string; amount: number; payment_method: string; notes: string | null; created_at: string}[]>>({});

  // Expanded state for payment history per credit
  const [expandedCredits, setExpandedCredits] = useState<Record<string, boolean>>({})

  function toggleCreditExpanded(creditId: string) {
    setExpandedCredits(prev => ({ ...prev, [creditId]: !prev[creditId] }));
  };

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bv_clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      const err = error as Error;
      console.error('Error fetching clients:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchClientCredits(clientId: string) {
    setLoadingCredits(true);
    try {
      const { data, error } = await supabase
        .from('bv_credits')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClientCredits(data || []);

      // Fetch all payments for these credits
      if (data && data.length > 0) {
        const creditIds = data.map((c: Record<string, unknown>) => c.id);
        const { data: paymentsData } = await supabase
          .from('bv_credit_payments')
          .select('*')
          .in('credit_id', creditIds)
          .order('created_at', { ascending: false });
        // Group by credit_id
        const grouped: Record<string, any[]> = {};
        (paymentsData || []).forEach((p: Record<string, unknown>) => {
          const cid = String(p.credit_id);
          if (!grouped[cid]) grouped[cid] = [];
          grouped[cid].push(p);
        });
        setCreditPaymentsMap(grouped);
      }
    } catch (error) {
      const err = error as Error;
      console.error('Error fetching client credits:', err.message);
    } finally {
      setLoadingCredits(false);
    }
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClient.name) {
      toast.warning('Por favor complete el nombre del cliente.');
      return;
    }

    try {
      if (editingClient) {
        // Update client
        const { error } = await supabase
          .from('bv_clients')
          .update({
            name: newClient.name,
            phone: newClient.phone,
            email: newClient.email,
            credit_limit: parseFloat(newClient.credit_limit)
          })
          .eq('id', editingClient.id);

        if (error) throw error;
        toast.success('Cliente actualizado correctamente.');
      } else {
        // Insert client
        const { error } = await supabase
          .from('bv_clients')
          .insert({
            name: newClient.name,
            phone: newClient.phone,
            email: newClient.email,
            credit_limit: parseFloat(newClient.credit_limit),
            current_debt: 0
          });

        if (error) throw error;
        toast.success('Cliente creado correctamente.');
      }

      setShowAddModal(false);
      setEditingClient(null);
      setNewClient({ name: '', phone: '', email: '', credit_limit: '500' });
      fetchClients();
      if (selectedClient && editingClient?.id === selectedClient.id) {
        // Refresh details
        const updatedClient = { ...selectedClient, name: newClient.name, phone: newClient.phone, email: newClient.email, credit_limit: parseFloat(newClient.credit_limit) };
        setSelectedClient(updatedClient);
      }
    } catch (error) {
      const err = error as Error;
      toast.error('Error guardando cliente: ' + err.message);
    }
  }

  async function handleRegisterAbono(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCredit || !abonoForm.amount) return;

    const abonoAmount = parseFloat(abonoForm.amount);
    if (abonoAmount <= 0) {
      toast.warning('El monto del abono debe ser mayor a 0.');
      return;
    }

    if (abonoAmount > selectedCredit.remaining_amount) {
      toast.warning(`El monto no puede exceder la deuda del crédito (C$ ${selectedCredit.remaining_amount.toFixed(2)}).`);
      return;
    }

    try {
      // Create payment
      const { error } = await supabase
        .from('bv_credit_payments')
        .insert({
          credit_id: selectedCredit.id,
          amount: abonoAmount,
          payment_method: abonoForm.payment_method,
          notes: abonoForm.notes || null
        });

      if (error) throw error;

      // Register in audit log
      await supabase.from('bv_audit_log').insert({
        action: 'abono_registrado',
        entity: 'bv_credits',
        entity_id: selectedCredit.id,
        old_value: { saldo_anterior: selectedCredit.remaining_amount },
        new_value: { abono: abonoAmount, metodo: abonoForm.payment_method, saldo_nuevo: Math.max(0, selectedCredit.remaining_amount - abonoAmount) }
      });

      setShowAbonoModal(false);
      setAbonoForm({ amount: '', payment_method: 'cash', notes: '' });
      setSelectedCredit(null);
      
      // Refresh data
      toast.success('Abono registrado con éxito.');
      await fetchClients();
      if (selectedClient) {
        fetchClientCredits(selectedClient.id);
        
        // Correct way: Fetch updated client data directly from Supabase to avoid race conditions/desyncs
        const { data: latestClientData } = await supabase
          .from('bv_clients')
          .select('current_debt')
          .eq('id', selectedClient.id)
          .single();

        if (latestClientData) {
          setSelectedClient({ ...selectedClient, current_debt: latestClientData.current_debt });
        }
      }
    } catch (error) {
      const err = error as Error;
      toast.error('Error registrando abono: ' + err.message);
    }
  }

  async function handleCancelCredit(credit: Credit) {
    if (!window.confirm('¿Está seguro de que desea cancelar (perdonar/eliminar) este crédito? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      // To cancel a credit, we insert a final payment covering the exact remaining amount
      const { error } = await supabase
        .from('bv_credit_payments')
        .insert({
          credit_id: credit.id,
          amount: credit.remaining_amount,
          payment_method: 'cash' // default
        });

      if (error) throw error;

      toast.success('Crédito cancelado exitosamente.');
      await fetchClients();
      if (selectedClient) {
        fetchClientCredits(selectedClient.id);
        
        const { data: latestClientData } = await supabase
          .from('bv_clients')
          .select('current_debt')
          .eq('id', selectedClient.id)
          .single();

        if (latestClientData) {
          setSelectedClient({ ...selectedClient, current_debt: latestClientData.current_debt });
        }
      }
    } catch (error) {
      const err = error as Error;
      toast.error('Error al cancelar crédito: ' + err.message);
    }
  }

  function startEdit(client: Client) {
    setEditingClient(client);
    setNewClient({
      name: client.name,
      phone: client.phone || '',
      email: client.email || '',
      credit_limit: client.credit_limit.toString()
    });
    setShowAddModal(true);
  }

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone && c.phone.includes(search))
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Client List (Left Columns) */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Cartera de Clientes & Créditos
            </h1>
            <p className="text-gray-400 text-sm mt-1">Controla límites de endeudamiento, cuentas por cobrar y abonos.</p>
          </div>
          <button
            onClick={() => {
              setEditingClient(null);
              setNewClient({ name: '', phone: '', email: '', credit_limit: '500' });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition text-sm"
          >
            <Plus size={18} />
            Nuevo Cliente
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Buscar clientes por nombre o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0d0d18] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-neon-blue/50 transition text-sm"
            />
          </div>
          <button
            onClick={fetchClients}
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
                    <th className="py-4 px-6">Cliente</th>
                    <th className="py-4 px-6">Teléfono</th>
                    <th className="py-4 px-6 text-right">Límite Crédito</th>
                    <th className="py-4 px-6 text-right">Deuda Pendiente</th>
                    <th className="py-4 px-6 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 px-6 text-center text-gray-500">
                        No se encontraron clientes.
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((c) => {
                      const isOverLimit = c.current_debt > c.credit_limit;
                      const hasDebt = c.current_debt > 0;
                      const isSelected = selectedClient?.id === c.id;
                      return (
                        <tr 
                          key={c.id} 
                          className={`cursor-pointer transition ${isSelected ? 'bg-neon-blue/10 border-l-2 border-l-neon-blue' : 'hover:bg-white/2'}`}
                          onClick={() => {
                            setSelectedClient(c);
                            fetchClientCredits(c.id);
                          }}
                        >
                          <td className="py-4 px-6">
                            <span className="font-semibold text-white block">{c.name}</span>
                            <span className="text-gray-500 text-xs">{c.email || 'Sin correo'}</span>
                          </td>
                          <td className="py-4 px-6 font-mono text-gray-300">{c.phone || '—'}</td>
                           <td className="py-4 px-6 text-right font-mono">C$ {c.credit_limit.toFixed(2)}</td>
                           <td className={`py-4 px-6 text-right font-mono font-bold ${isOverLimit ? 'text-rose-500' : hasDebt ? 'text-amber-500' : 'text-neon-emerald'}`}>
                             C$ {c.current_debt.toFixed(2)}
                           </td>
                           <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                             <button
                               onClick={() => startEdit(c)}
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
       </div>
 
       {/* Credit Details Panel (Right Sidebar) */}
       <div className="space-y-6">
         {selectedClient ? (
           <div className="glass-panel rounded-xl p-6 shadow-card-glow space-y-6 border border-neon-blue/20">
             {/* Header info */}
             <div className="flex justify-between items-start">
               <div>
                 <h2 className="text-xl font-bold text-white">{selectedClient.name}</h2>
                 <p className="text-gray-400 text-xs mt-1">Detalle de Créditos y Pagos</p>
               </div>
               <button 
                 onClick={() => setSelectedClient(null)} 
                 className="p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition"
               >
                 <X size={18} />
               </button>
             </div>
 
             {/* Credit Progress Cards */}
             <div className="grid grid-cols-2 gap-4">
               <div className="bg-[#0d0d18] border border-white/5 p-4 rounded-lg">
                 <span className="text-gray-400 text-xs font-semibold uppercase block">Techo Crédito</span>
                 <span className="text-xl font-bold font-mono text-white block mt-1">
                   C$ {selectedClient.credit_limit.toFixed(2)}
                 </span>
               </div>
               <div className="bg-[#0d0d18] border border-white/5 p-4 rounded-lg">
                 <span className="text-gray-400 text-xs font-semibold uppercase block">Deuda Total</span>
                 <span className="text-xl font-bold font-mono text-amber-500 block mt-1">
                   C$ {selectedClient.current_debt.toFixed(2)}
                 </span>
               </div>
            </div>

            {/* Credit list */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Historial de Créditos</h3>
              {loadingCredits ? (
                <div className="flex justify-center items-center py-6">
                  <div className="w-6 h-6 border-2 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
                </div>
              ) : clientCredits.length === 0 ? (
                <p className="text-gray-500 text-xs py-4 text-center">Este cliente no posee créditos pendientes.</p>
              ) : (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {clientCredits.map((credit) => {
                    const isPaid = credit.status === 'paid';
                    const paidAmt = credit.total_amount - credit.remaining_amount;
                    const progressPct = credit.total_amount > 0 ? (paidAmt / credit.total_amount) * 100 : 0;
                    const payments = creditPaymentsMap[credit.id] || [];
                    const expanded = !!expandedCredits[credit.id];
                    return (
                      <div key={credit.id} className="bg-[#0d0d18] border border-white/5 p-3 rounded-lg flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-gray-500 block">
                              {new Date(credit.created_at).toLocaleDateString()}
                            </span>
                            <span className="text-xs text-gray-400 font-semibold block mt-0.5">
                              Total: C$ {credit.total_amount.toFixed(2)}
                            </span>
                          </div>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${isPaid ? 'bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/30' : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'}`}>
                            {isPaid ? 'Liquidado' : 'Pendiente'}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-neon-emerald">Abonado: C$ {paidAmt.toFixed(2)}</span>
                            <span className="text-amber-500">Saldo: C$ {credit.remaining_amount.toFixed(2)}</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-neon-emerald to-neon-blue rounded-full transition-all"
                              style={{ width: `${Math.min(100, progressPct)}%` }} />
                          </div>
                        </div>

                        {/* Payment history toggle */}
                        {payments.length > 0 && (
                          <button onClick={() => toggleCreditExpanded(credit.id)}
                            className="text-[10px] text-gray-500 hover:text-neon-blue text-left underline transition">
                            {expanded ? 'Ocultar' : `Ver ${payments.length} pago(s) anterior(es)`}
                          </button>
                        )}
                        {expanded && (
                          <div className="space-y-1.5 mt-1">
                            {payments.map((p) => (
                              <div key={p.id} className="bg-white/2 border border-white/5 rounded p-2 text-[10px] flex justify-between items-center gap-2">
                                <div>
                                  <span className="text-gray-500 font-mono">{new Date(p.created_at).toLocaleDateString()}</span>
                                  {p.notes && <span className="text-gray-400 block mt-0.5">{p.notes}</span>}
                                </div>
                                <div className="text-right">
                                  <span className="text-neon-emerald font-bold font-mono block">+ C$ {Number(p.amount).toFixed(2)}</span>
                                  <span className="text-gray-500 capitalize">{p.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {!isPaid && (
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => {
                                setSelectedCredit(credit);
                                setShowAbonoModal(true);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 bg-neon-blue/20 hover:bg-neon-blue/30 text-neon-blue font-bold rounded text-xs transition"
                            >
                              <DollarSign size={12} />
                              Registrar Abono
                            </button>
                            <button
                              onClick={() => handleCancelCredit(credit)}
                              className="py-1 px-2 border border-white/5 hover:border-rose-500/50 hover:bg-rose-500/10 text-gray-500 hover:text-rose-500 font-bold rounded text-xs transition"
                              title="Liquidar Total"
                            >
                              Liquidar Deuda
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="glass-panel rounded-xl p-8 text-center shadow-card-glow border border-white/5 h-64 flex flex-col justify-center items-center">
            <CreditCard className="text-gray-600 mb-3" size={32} />
            <h3 className="text-white font-semibold text-sm">Selecciona un cliente</h3>
            <p className="text-gray-500 text-xs mt-1 max-w-[200px]">Haz clic en un cliente de la lista para ver su historial de deudas y abonos.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingClient ? 'Editar Cliente' : 'Agregar Nuevo Cliente'}
            </h2>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  placeholder="Ej: 8888-8888"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="Ej: juan@gmail.com"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Límite de Crédito Autorizado (C$)</label>
                <input
                  type="number"
                  required
                  value={newClient.credit_limit}
                  onChange={(e) => setNewClient({ ...newClient, credit_limit: e.target.value })}
                  placeholder="Ej: 500"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                />
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

      {/* Abono Modal */}
      {showAbonoModal && selectedCredit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 shadow-2xl relative border border-neon-blue/20">
            <h2 className="text-lg font-bold text-white mb-1">Registrar Abono a Deuda</h2>
            <p className="text-gray-400 text-xs mb-4">Ingrese el pago para amortizar este saldo pendiente.</p>
            <form onSubmit={handleRegisterAbono} className="space-y-4">
              <div className="bg-[#0d0d18] border border-white/5 p-3 rounded-lg text-xs space-y-1">
                <div className="flex justify-between text-gray-400">
                  <span>Monto Crédito Inicial:</span>
                  <span className="font-mono">C$ {selectedCredit.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-white font-semibold">
                  <span>Saldo Deudor Actual:</span>
                  <span className="font-mono text-amber-500">C$ {selectedCredit.remaining_amount.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Monto del Abono *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  max={selectedCredit.remaining_amount}
                  value={abonoForm.amount}
                  onChange={(e) => setAbonoForm({ ...abonoForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Método de Pago</label>
                <select
                  value={abonoForm.payment_method}
                  onChange={(e) => setAbonoForm({ ...abonoForm, payment_method: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia Bancaria</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Observaciones (Opcional)</label>
                <input
                  type="text"
                  value={abonoForm.notes}
                  onChange={(e) => setAbonoForm({ ...abonoForm, notes: e.target.value })}
                  placeholder="Ej: Depósito bancario #1234..."
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-neon-blue text-sm"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAbonoModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition text-sm"
                >
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
