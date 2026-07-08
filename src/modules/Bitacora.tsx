import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { BookOpen, RefreshCw, Search, TrendingUp, TrendingDown, ShoppingCart, Settings, User, Loader2 } from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null | string;
  new_value: Record<string, unknown> | null | string;
  created_at: string;
  bv_collaborators?: { name: string } | null;
}

const ACTION_ICONS: Record<string, JSX.Element> = {
  'venta_anulada':    <ShoppingCart size={14} className="text-rose-400" />,
  'venta_registrada': <ShoppingCart size={14} className="text-neon-emerald" />,
  'costo_actualizado': <TrendingUp size={14} className="text-amber-400" />,
  'producto_editado': <Settings size={14} className="text-neon-blue" />,
  'usuario_suspendido': <User size={14} className="text-rose-400" />,
  'usuario_reactivado': <User size={14} className="text-neon-emerald" />,
  'abono_registrado': <TrendingDown size={14} className="text-purple-400" />,
};

const ACTION_LABELS: Record<string, string> = {
  'venta_anulada': 'Factura Anulada',
  'venta_registrada': 'Venta Registrada',
  'costo_actualizado': 'Costo de Producto Actualizado',
  'producto_editado': 'Producto Editado',
  'usuario_suspendido': 'Usuario Suspendido',
  'usuario_reactivado': 'Usuario Reactivado',
  'abono_registrado': 'Abono a Crédito Registrado',
};

export default function Bitacora() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().substring(0, 10));

  useEffect(() => {
    fetchLogs();
  }, [dateFrom, dateTo]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bv_audit_log')
        .select('*, bv_collaborators(name)')
        .gte('created_at', `${dateFrom}T00:00:00Z`)
        .lte('created_at', `${dateTo}T23:59:59Z`)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      const err = error as Error;
      toast.error('Error cargando bitácora: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = logs.filter(log => {
    const matchesSearch = !search ||
      (log.action || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.entity || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.bv_collaborators?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filterAction || log.action === filterAction;
    return matchesSearch && matchesFilter;
  });

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  function formatValue(val: unknown): string {
    if (!val) return '—';
    if (typeof val === 'object') {
      return Object.entries(val)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
    return String(val);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
          <BookOpen size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Bitácora del Sistema</h1>
          <p className="text-gray-400 text-sm">Registro de acciones clave para auditoría y trazabilidad.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center glass-panel p-4 rounded-xl border border-white/5">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por acción, entidad o usuario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0d0d18] border border-white/10 rounded-lg py-2 pl-8 pr-3 text-sm text-white focus:outline-none focus:border-indigo-400 transition"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="bg-[#0d0d18] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
        >
          <option value="">Todas las Acciones</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="bg-[#0d0d18] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400" />
          <span className="text-gray-500 text-xs">al</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="bg-[#0d0d18] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400" />
        </div>
        <button onClick={fetchLogs} className="p-2 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Log Table */}
      <div className="glass-panel rounded-xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <BookOpen size={32} className="mx-auto mb-3 text-gray-600" />
            <p className="text-sm">No se encontraron registros de auditoría para el período seleccionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="py-3 px-5">Fecha / Hora</th>
                  <th className="py-3 px-5">Acción</th>
                  <th className="py-3 px-5">Entidad</th>
                  <th className="py-3 px-5">Valor Anterior</th>
                  <th className="py-3 px-5">Valor Nuevo</th>
                  <th className="py-3 px-5">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-5 font-mono text-gray-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        {ACTION_ICONS[log.action] || <Settings size={14} className="text-gray-500" />}
                        <span className="font-semibold text-white">
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-gray-400">
                      <span className="font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded">
                        {log.entity || '—'}
                      </span>
                      {log.entity_id && (
                        <span className="ml-1 text-gray-600 font-mono text-[10px]">
                          #{log.entity_id.substring(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5 max-w-[160px]">
                      {log.old_value ? (
                        <span className="text-rose-400 font-mono text-[10px] break-all line-clamp-2">
                          {formatValue(log.old_value)}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-3 px-5 max-w-[160px]">
                      {log.new_value ? (
                        <span className="text-neon-emerald font-mono text-[10px] break-all line-clamp-2">
                          {formatValue(log.new_value)}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-3 px-5 text-white font-semibold">
                      {log.bv_collaborators?.name || 'Sistema'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-white/5 text-xs text-gray-500">
              Mostrando {filteredLogs.length} de {logs.length} registros
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
