import { useState } from 'react';
import Caja from './modules/Caja';
import Inventario from './modules/Inventario';
import Clientes from './modules/Clientes';
import Reportes from './modules/Reportes';
import { ShoppingCart, Clipboard, Users, BarChart3, Heart } from 'lucide-react';

type Tab = 'caja' | 'inventario' | 'clientes' | 'reportes';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('caja');

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
            {[
              { id: 'caja', label: 'Caja (POS)', icon: ShoppingCart },
              { id: 'inventario', label: 'Inventario', icon: Clipboard },
              { id: 'clientes', label: 'Cartera Clientes', icon: Users },
              { id: 'reportes', label: 'Reportes', icon: BarChart3 }
            ].map((item) => {
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

        {/* Sidebar Footer */}
        <div className="p-6 border-t border-white/5 bg-white/2">
          <div className="flex items-center gap-2">
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
          {activeTab === 'inventario' && <Inventario />}
          {activeTab === 'clientes' && <Clientes />}
          {activeTab === 'reportes' && <Reportes />}
        </div>
      </main>

    </div>
  );
}

export default App;
