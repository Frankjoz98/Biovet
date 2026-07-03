import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { MapPin, Users, Plus, Shield, ShieldAlert, Award, RefreshCw, Navigation } from 'lucide-react';

interface Collaborator {
  id: string;
  name: string;
  phone: string;
  email: string;
  role_id: string;
  base_salary: number;
  bv_roles?: { name: string };
}

interface Route {
  id: string;
  name: string;
  status: string;
  collaborator_id: string;
  bv_collaborators?: { name: string };
}

interface RouteClient {
  id: string;
  route_id: string;
  client_id: string;
  visit_order: number;
  gps_latitude: number;
  gps_longitude: number;
  business_notes: string;
  bv_clients?: { name: string; phone: string };
}

interface CategoryCommission {
  id: string;
  category_name: string;
  percentage: number;
}

interface RutasProps {
  userRole: 'admin' | 'collaborator';
  currentCollaboratorId?: string;
}

export default function Rutas({ userRole, currentCollaboratorId }: RutasProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [commissions, setCommissions] = useState<CategoryCommission[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active selections
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [routeClients, setRouteClients] = useState<RouteClient[]>([]);
  const [loadingRouteDetails, setLoadingRouteDetails] = useState(false);

  // Modals & Forms
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);

  // Forms states
  const [newCollab, setNewCollab] = useState({
    name: '',
    phone: '',
    email: '',
    base_salary: '0',
    role_name: 'collaborator'
  });

  const [newRoute, setNewRoute] = useState({
    name: '',
    collaborator_id: ''
  });

  const [newRouteClient, setNewRouteClient] = useState({
    client_id: '',
    gps_latitude: '',
    gps_longitude: '',
    business_notes: ''
  });

  const [gettingGPS, setGettingGPS] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [userRole, currentCollaboratorId]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      // 1. Fetch Collaborators
      const { data: collabData } = await supabase
        .from('bv_collaborators')
        .select('*, bv_roles(name)')
        .order('name', { ascending: true });
      setCollaborators(collabData || []);

      // 2. Fetch Commissions
      const { data: commData } = await supabase
        .from('bv_category_commissions')
        .select('*')
        .order('category_name', { ascending: true });
      setCommissions(commData || []);

      // 3. Fetch Clients (for route association)
      const { data: clientData } = await supabase
        .from('bv_clients')
        .select('id, name, phone')
        .order('name', { ascending: true });
      setClients(clientData || []);

      // 4. Fetch Routes (filtered if collaborator)
      let routeQuery = supabase
        .from('bv_routes')
        .select('*, bv_collaborators(name)');
      
      if (userRole === 'collaborator' && currentCollaboratorId) {
        routeQuery = routeQuery.eq('collaborator_id', currentCollaboratorId);
      }
      
      const { data: routesData } = await routeQuery.order('name', { ascending: true });
      setRoutes(routesData || []);

    } catch (err: any) {
      console.error('Error fetching routes initial data:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRouteClients(routeId: string) {
    setLoadingRouteDetails(true);
    try {
      const { data, error } = await supabase
        .from('bv_route_clients')
        .select('*, bv_clients(name, phone)')
        .eq('route_id', routeId)
        .order('visit_order', { ascending: true });

      if (error) throw error;
      setRouteClients(data || []);
    } catch (err: any) {
      console.error('Error fetching route clients:', err.message);
    } finally {
      setLoadingRouteDetails(false);
    }
  }

  // Handle Collaborator Save
  async function handleAddCollab(e: React.FormEvent) {
    e.preventDefault();
    if (!newCollab.name) return;

    try {
      // Find role uuid
      const { data: roleData } = await supabase
        .from('bv_roles')
        .select('id')
        .eq('name', newCollab.role_name)
        .single();

      if (!roleData) throw new Error('Rol no encontrado');

      const { error } = await supabase
        .from('bv_collaborators')
        .insert({
          name: newCollab.name,
          phone: newCollab.phone,
          email: newCollab.email,
          base_salary: parseFloat(newCollab.base_salary) || 0,
          role_id: roleData.id
        });

      if (error) throw error;

      setShowCollabModal(false);
      setNewCollab({ name: '', phone: '', email: '', base_salary: '0', role_name: 'collaborator' });
      fetchInitialData();
      toast.success('Colaborador registrado con éxito');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  }

  // Handle Route Save
  async function handleAddRoute(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoute.name) return;

    try {
      const { error } = await supabase
        .from('bv_routes')
        .insert({
          name: newRoute.name,
          collaborator_id: newRoute.collaborator_id || null
        });

      if (error) throw error;

      setShowRouteModal(false);
      setNewRoute({ name: '', collaborator_id: '' });
      fetchInitialData();
      toast.success('Ruta creada con éxito');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  }

  // Handle Client Route Association
  async function handleAddClientToRoute(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoute || !newRouteClient.client_id) return;

    try {
      const { error } = await supabase
        .from('bv_route_clients')
        .insert({
          route_id: selectedRoute.id,
          client_id: newRouteClient.client_id,
          gps_latitude: parseFloat(newRouteClient.gps_latitude) || null,
          gps_longitude: parseFloat(newRouteClient.gps_longitude) || null,
          business_notes: newRouteClient.business_notes,
          visit_order: routeClients.length + 1
        });

      if (error) throw error;

      setShowAddClientModal(false);
      setNewRouteClient({ client_id: '', gps_latitude: '', gps_longitude: '', business_notes: '' });
      fetchRouteClients(selectedRoute.id);
      toast.success('Cliente agregado a la ruta');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  }

  // Fetch Current GPS Coordinates
  function getGPSCoordinates() {
    setGettingGPS(true);
    if (!navigator.geolocation) {
      toast.warning('Geolocalización no soportada en este navegador');
      setGettingGPS(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewRouteClient(prev => ({
          ...prev,
          gps_latitude: position.coords.latitude.toString(),
          gps_longitude: position.coords.longitude.toString()
        }));
        setGettingGPS(false);
        toast.success('Coordenadas GPS obtenidas.');
      },
      (error) => {
        toast.error('Error obteniendo GPS: ' + error.message);
        setGettingGPS(false);
      },
      { enableHighAccuracy: true }
    );
  }

  // Update commission percentage (Admin only)
  async function handleUpdateCommission(id: string, val: string) {
    const percentage = parseFloat(val) || 0;
    try {
      const { error } = await supabase
        .from('bv_category_commissions')
        .update({ percentage, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setCommissions(commissions.map(c => c.id === id ? { ...c, percentage } : c));
      toast.success('Comisión actualizada.');
    } catch (err: any) {
      toast.error('Error actualizando comisión: ' + err.message);
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Módulo de Rutas & Comisiones
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {userRole === 'admin' 
              ? 'Configura porcentajes de comisiones por línea de producto, gestiona colaboradores y visualiza rutas.' 
              : 'Visualiza tus rutas asignadas y registra la geolocalización de tus visitas a clientes.'}
          </p>
        </div>
        <div className="flex gap-3">
          {userRole === 'admin' && (
            <>
              <button
                onClick={() => setShowCollabModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition text-sm shadow-lg"
              >
                <Users size={16} />
                Nuevo Colaborador
              </button>
              <button
                onClick={() => setShowRouteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition text-sm shadow-lg"
              >
                <Plus size={18} />
                Nueva Ruta
              </button>
            </>
          )}
          <button
            onClick={fetchInitialData}
            className="p-2 border border-white/10 rounded-lg bg-[#0d0d18] hover:bg-white/5 transition text-gray-400"
            title="Refrescar"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Routes List (Col-span 1 or 2 depending on layout) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-5 rounded-xl border border-white/5 shadow-card-glow">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Navigation className="text-neon-blue animate-pulse" size={18} />
              Rutas de Venta
            </h2>

            {loading ? (
              <div className="flex justify-center items-center py-10">
                <div className="w-8 h-8 border-2 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
              </div>
            ) : routes.length === 0 ? (
              <p className="text-gray-500 text-xs py-8 text-center">No hay rutas registradas o asignadas.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {routes.map((route) => {
                  const isSelected = selectedRoute?.id === route.id;
                  return (
                    <button
                      key={route.id}
                      onClick={() => {
                        setSelectedRoute(route);
                        fetchRouteClients(route.id);
                      }}
                      className={`p-4 rounded-xl text-left border transition flex flex-col justify-between h-28 ${
                        isSelected 
                          ? 'bg-neon-blue/10 border-neon-blue text-white shadow-neon-blue' 
                          : 'bg-white/2 border-white/5 hover:bg-white/5 text-gray-300'
                      }`}
                    >
                      <div>
                        <h3 className="font-bold text-sm block truncate">{route.name}</h3>
                        <span className="text-[10px] text-gray-400 mt-1 block">
                          Asignado a: <b className="text-neon-blue">{route.bv_collaborators?.name || 'Sin asignar'}</b>
                        </span>
                      </div>
                      <div className="flex items-center justify-between w-full mt-2 text-[10px] uppercase font-bold text-neon-emerald">
                        <span>Estado: {route.status}</span>
                        <span>Ver clientes &rarr;</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Route Details (Clients in Route) */}
          {selectedRoute && (
            <div className="glass-panel p-5 rounded-xl border border-neon-blue/20 shadow-card-glow space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-white">Clientes en: {selectedRoute.name}</h3>
                  <p className="text-[11px] text-gray-400">Orden de visita y detalles del negocio</p>
                </div>
                <button
                  onClick={() => setShowAddClientModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-blue/20 hover:bg-neon-blue/30 text-neon-blue font-bold rounded-lg text-xs transition"
                >
                  <Plus size={14} /> Add Cliente
                </button>
              </div>

              {loadingRouteDetails ? (
                <div className="flex justify-center items-center py-10">
                  <div className="w-8 h-8 border-2 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin"></div>
                </div>
              ) : routeClients.length === 0 ? (
                <p className="text-gray-500 text-xs py-8 text-center">No hay clientes agregados a esta ruta aún.</p>
              ) : (
                <div className="space-y-3">
                  {routeClients.map((rc, idx) => (
                    <div key={rc.id} className="bg-white/2 border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between md:items-center gap-3">
                      <div className="flex gap-3 items-start">
                        <span className="font-black font-mono text-neon-blue text-sm bg-neon-blue/10 px-2 py-0.5 rounded">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-white">{rc.bv_clients?.name}</h4>
                          <p className="text-xs text-gray-400">{rc.bv_clients?.phone || 'Sin teléfono'}</p>
                          {rc.business_notes && (
                            <p className="text-[11px] text-gray-500 italic mt-1 bg-black/30 p-2 rounded">
                              Nota: {rc.business_notes}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* GPS / Action coordinates */}
                      <div className="flex items-center gap-2">
                        {rc.gps_latitude && rc.gps_longitude ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${rc.gps_latitude},${rc.gps_longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] font-semibold text-neon-emerald bg-neon-emerald/10 border border-neon-emerald/30 px-3 py-1.5 rounded-lg hover:bg-neon-emerald/20 transition"
                          >
                            <MapPin size={12} />
                            Ver Mapa ({rc.gps_latitude.toFixed(4)}, {rc.gps_longitude.toFixed(4)})
                          </a>
                        ) : (
                          <span className="text-[10px] text-rose-500 border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5 rounded-lg">
                            Sin GPS
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Configuration Sidebar (Commissions - Admin only or warning) */}
        <div className="space-y-6">
          
          {/* Commission Config Card */}
          <div className="glass-panel p-5 rounded-xl border border-white/5 shadow-card-glow space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Award className="text-purple-400" size={18} />
              Comisiones por Categoría
            </h2>
            
            {userRole === 'admin' ? (
              <p className="text-[10px] text-neon-emerald font-semibold uppercase tracking-wider flex items-center gap-1">
                <Shield size={10} /> Acceso de Administrador
              </p>
            ) : (
              <div className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-rose-400 text-[11px] flex gap-1.5 items-start">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>Solo Administradores pueden editar los porcentajes de comisión.</span>
              </div>
            )}

            <div className="space-y-3.5 pt-2">
              {commissions.map((comm) => (
                <div key={comm.id} className="flex justify-between items-center gap-4">
                  <span className="text-xs text-gray-300 font-medium truncate">{comm.category_name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      step="0.1"
                      disabled={userRole !== 'admin'}
                      value={comm.percentage}
                      onChange={(e) => handleUpdateCommission(comm.id, e.target.value)}
                      className="w-14 bg-[#0d0d18] border border-white/10 rounded px-2 py-1 text-center text-xs text-white font-mono focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <span className="text-xs text-gray-400 font-mono">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Collaborator Quick Summary (Admin only) */}
          {userRole === 'admin' && (
            <div className="glass-panel p-5 rounded-xl border border-white/5 shadow-card-glow space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="text-neon-blue" size={18} />
                Lista de Colaboradores
              </h2>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {collaborators.map((c) => (
                  <div key={c.id} className="bg-white/2 border border-white/5 p-3 rounded-lg flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-white block">{c.name}</span>
                      <span className="text-[10px] text-purple-400 uppercase font-semibold">
                        Rol: {c.bv_roles?.name || 'Vendedor'}
                      </span>
                    </div>
                    <div className="text-right font-mono text-gray-400">
                      <span>Salario Base:</span>
                      <b className="text-white block">C$ {c.base_salary.toLocaleString()}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Collaborator Modal */}
      {showCollabModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4">Registrar Nuevo Colaborador</h2>
            <form onSubmit={handleAddCollab} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={newCollab.name}
                  onChange={(e) => setNewCollab(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm"
                  placeholder="Ej: Milton Estrada"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={newCollab.phone}
                    onChange={(e) => setNewCollab(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm font-mono"
                    placeholder="8888-8888"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Rol</label>
                  <select
                    value={newCollab.role_name}
                    onChange={(e) => setNewCollab(prev => ({ ...prev, role_name: e.target.value }))}
                    className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm"
                  >
                    <option value="collaborator">Colaborador / Vendedor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Salario Base Mensual (C$)</label>
                <input
                  type="number"
                  value={newCollab.base_salary}
                  onChange={(e) => setNewCollab(prev => ({ ...prev, base_salary: e.target.value }))}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm font-mono"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCollabModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition text-sm"
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Route Modal */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-xl p-6 shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4">Crear Nueva Ruta</h2>
            <form onSubmit={handleAddRoute} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre de la Ruta *</label>
                <input
                  type="text"
                  required
                  value={newRoute.name}
                  onChange={(e) => setNewRoute(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm"
                  placeholder="Ej: Ruta Norte Managua"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Asignar Colaborador</label>
                <select
                  value={newRoute.collaborator_id}
                  onChange={(e) => setNewRoute(prev => ({ ...prev, collaborator_id: e.target.value }))}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm"
                >
                  <option value="">Dejar sin asignar...</option>
                  {collaborators.filter(c => c.bv_roles?.name === 'collaborator').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowRouteModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition text-sm"
                >
                  Crear Ruta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Client to Route Modal */}
      {showAddClientModal && selectedRoute && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-xl p-6 shadow-2xl relative border border-neon-blue/20">
            <h2 className="text-xl font-bold text-white mb-1">Asociar Cliente a Ruta</h2>
            <p className="text-gray-400 text-xs mb-4">Agrega geolocalización y datos del negocio.</p>
            
            <form onSubmit={handleAddClientToRoute} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Seleccionar Cliente *</label>
                <select
                  required
                  value={newRouteClient.client_id}
                  onChange={(e) => setNewRouteClient(prev => ({ ...prev, client_id: e.target.value }))}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-sm"
                >
                  <option value="">Seleccione un cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Ubicación GPS (Opcional)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.0000001"
                    placeholder="Latitud"
                    value={newRouteClient.gps_latitude}
                    onChange={(e) => setNewRouteClient(prev => ({ ...prev, gps_latitude: e.target.value }))}
                    className="flex-1 bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-xs font-mono"
                  />
                  <input
                    type="number"
                    step="0.0000001"
                    placeholder="Longitud"
                    value={newRouteClient.gps_longitude}
                    onChange={(e) => setNewRouteClient(prev => ({ ...prev, gps_longitude: e.target.value }))}
                    className="flex-1 bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={getGPSCoordinates}
                    disabled={gettingGPS}
                    className="px-3 bg-neon-emerald text-black font-bold rounded-lg text-xs hover:bg-neon-emerald/80 transition flex items-center justify-center disabled:opacity-50"
                    title="Obtener GPS actual"
                  >
                    {gettingGPS ? '...' : <MapPin size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Notas sobre Finca/Negocio</label>
                <textarea
                  value={newRouteClient.business_notes}
                  onChange={(e) => setNewRouteClient(prev => ({ ...prev, business_notes: e.target.value }))}
                  placeholder="Ej: Finca Las Delicias, preguntar por el administrador Don Carlos..."
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white text-xs h-20"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddClientModal(false)}
                  className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-bold rounded-lg transition text-sm"
                >
                  Agregar a Ruta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
