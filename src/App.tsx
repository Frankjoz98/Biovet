import { useState, useEffect } from 'react';
import Caja from './modules/Caja';
import Inventario from './modules/Inventario';
import Clientes from './modules/Clientes';
import Reportes from './modules/Reportes';
import Rutas from './modules/Rutas';
import { ShoppingCart, Clipboard, Users, BarChart3, Heart, MapPin, Shield, User } from 'lucide-react';
import { supabase } from './lib/supabase';

type Tab = 'caja' | 'inventario' | 'clientes' | 'rutas' | 'reportes';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('caja');
  const [userRole, setUserRole] = useState<'admin' | 'collaborator'>('admin');
  const [currentCollaboratorId, setCurrentCollaboratorId] = useState<string>('');
  const [collabList, setCollabList] = useState<any[]>([]);

  useEffect(() => {
    fetchCollaborators();
  }, []);

  async function fetchCollaborators() {
    try {
      const { data } = await supabase
        .from('bv_collaborators')
        .select('id, name');
      if (data && data.length > 0) {
        setCollabList(data);
        setCurrentCollaboratorId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Filter tabs based on role
  const navigationItems = [
    { id: 'caja', label: 'Caja (POS)', icon: ShoppingCart },
    { id: 'inventario', label: 'Inventario', icon: Clipboard },
    { id: 'clientes', label: 'Cartera Clientes', icon: Users },
    { id: 'rutas', label: 'Rutas & Vendedores', icon: MapPin },
    ...(userRole === 'admin' ? [{ id: 'reportes', label: 'Reportes', icon: BarChart3 }] : [])
  ];

  return (
    <div className="min-h-screen bg-[#030308] text-gray-300 flex flex-col md:flex-row font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 glass-panel border-r border-white/5 flex flex-col justify-between shrink-0 z-10 md:h-screen sticky top-0">
        <div className="p-6">
          {/* Logo Brand */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 shadow-neon-purple animate-pulse">
              <Heart size={20} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">BioVet</h1>
              <span className="text-[10px] text-neon-blue font-bold tracking-widest uppercase">POS & CRÉDITOS</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                    isActive 
                      ? 'bg-neon-blue/10 border border-neon-blue/20 text-neon-blue shadow-neon-blue' 
                      : 'border border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer & Role Simulator */}
        <div className="p-6 border-t border-white/5 bg-white/2 space-y-3">
          <div className="space-y-1.5">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Simular Rol:</span>
            <div className="flex flex-col gap-1.5">
              <select
                value={userRole}
                onChange={(e) => {
                  const role = e.target.value as 'admin' | 'collaborator';
                  setUserRole(role);
                  if (role === 'admin') {
                    setActiveTab('caja');
                  } else if (activeTab === 'reportes') {
                    setActiveTab('caja');
                  }
                }}
                className="w-full bg-[#0d0d18] border border-white/10 rounded p-1.5 text-xs text-white focus:outline-none"
              >
                <option value="admin">Administrador (Admin)</option>
                <option value="collaborator">Colaborador / Vendedor</option>
              </select>

              {userRole === 'collaborator' && collabList.length > 0 && (
                <select
                  value={currentCollaboratorId}
                  onChange={(e) => setCurrentCollaboratorId(e.target.value)}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded p-1.5 text-xs text-white focus:outline-none"
                >
                  {collabList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <div className="w-2 h-2 bg-neon-emerald rounded-full animate-ping"></div>
            <span className="text-xs font-semibold text-gray-400">Sistema Conectado</span>
          </div>
          <span className="text-[10px] text-gray-600 block mt-1">BioVet OS v1.0.0</span>
        </div>
      </aside>

      {/* Main Content Stage */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto h-screen">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'caja' && <Caja />}
          {activeTab === 'inventario' && <Inventario userRole={userRole} />}
          {activeTab === 'clientes' && <Clientes />}
          {activeTab === 'rutas' && <Rutas userRole={userRole} currentCollaboratorId={currentCollaboratorId} />}
          {activeTab === 'reportes' && userRole === 'admin' && <Reportes />}
        </div>
      </main>

    </div>
  );
}

export default App;
