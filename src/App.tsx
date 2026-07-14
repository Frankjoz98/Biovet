import { useState, useEffect } from 'react';
import Caja from './modules/Caja';
import Inventario from './modules/Inventario';
import Clientes from './modules/Clientes';
import Reportes from './modules/Reportes';
import Rutas from './modules/Rutas';
import Ajustes from './modules/Ajustes';
import Bitacora from './modules/Bitacora';
import Login from './modules/Login';
import { ShoppingCart, Clipboard, Users, BarChart3, Heart, MapPin, LogOut, Crown, ShieldCheck, User2, Loader2, X, Settings, BookOpen } from 'lucide-react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

type Tab = 'caja' | 'inventario' | 'clientes' | 'rutas' | 'reportes' | 'ajustes' | 'bitacora';
type UserRole = 'owner' | 'admin' | 'collaborator';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const ROLE_BADGE: Record<UserRole, { label: string; color: string; icon: React.ReactNode }> = {
  owner: { label: 'Dueño', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30', icon: <Crown size={10} /> },
  admin: { label: 'Administrador', color: 'text-neon-blue bg-neon-blue/10 border-neon-blue/30', icon: <ShieldCheck size={10} /> },
  collaborator: { label: 'Colaborador', color: 'text-purple-400 bg-purple-400/10 border-purple-400/30', icon: <User2 size={10} /> },
};

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('caja');
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Bootstrap: listen to Supabase auth changes and Custom Toast Events
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        // Nunca mostrar la pantalla de carga global en eventos de background o cambios de pestaña.
        // La pantalla de carga solo se muestra al inicio (authLoading inicia en true por defecto).
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setAuthLoading(false);
      }
    });

    // Listen to custom toasts
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ToastMessage>;
      const newToast = customEvent.detail;
      setToasts(prev => [...prev, newToast]);

      // Auto-remove toast after 4 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('biovet-toast', handleToastEvent);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('biovet-toast', handleToastEvent);
    };
  }, []);

  async function fetchUserProfile(authUserId: string) {
    try {
      const { data, error } = await supabase
        .from('bv_collaborators')
        .select('id, name, email, bv_roles(name)')
        .eq('auth_user_id', authUserId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        await supabase.auth.signOut();
        return;
      }

      const roleName = (data.bv_roles as any)?.name as UserRole || 'collaborator';

      setUserProfile({
        id: data.id,
        name: data.name || data.email || 'Usuario',
        email: data.email || '',
        role: roleName,
      });

      // Redirect collaborator away from restricted tabs if needed
      if (roleName === 'collaborator' && (activeTab === 'reportes' || activeTab === 'inventario')) {
        setActiveTab('caja');
      }
    } catch (err) {
      console.error('Error loading profile:', err);
      await supabase.auth.signOut();
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setActiveTab('caja');
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ----- Loading screen -----
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#030308] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Heart size={28} className="text-rose-500 animate-pulse" fill="currentColor" />
          <Loader2 size={24} className="text-neon-blue animate-spin" />
          <span className="text-gray-500 text-xs">Verificando sesión...</span>
        </div>
      </div>
    );
  }

  // ----- Login screen (no session) -----
  if (!session || !userProfile) {
    return <Login onLoginSuccess={() => {/* handled by auth state change */}} />;
  }

  const role = userProfile.role;
  const isPrivileged = role === 'owner' || role === 'admin';

  // Build navigation based on role
  const navigationItems = [
    { id: 'caja', label: 'Caja (POS)', icon: ShoppingCart, visible: true },
    { id: 'inventario', label: 'Inventario', icon: Clipboard, visible: true },
    { id: 'clientes', label: 'Cartera Clientes', icon: Users, visible: true },
    { id: 'rutas', label: 'Rutas & Vendedores', icon: MapPin, visible: true },
    { id: 'reportes', label: 'Reportes', icon: BarChart3, visible: isPrivileged },
    { id: 'bitacora', label: 'Bitácora', icon: BookOpen, visible: role === 'owner' },
    { id: 'ajustes', label: 'Ajustes', icon: Settings, visible: isPrivileged },
  ].filter(item => item.visible);

  const badge = ROLE_BADGE[role];

  return (
    <div className="min-h-screen bg-[#030308] text-gray-300 flex flex-col md:flex-row font-sans">
      
      {/* Sidebar Navigation — horizontal on mobile, vertical on md+ */}
      <aside className="w-full md:w-64 glass-panel border-b md:border-b-0 md:border-r border-white/5 flex flex-col md:justify-between shrink-0 z-20 md:h-screen md:sticky md:top-0">
        {/* Logo — hidden on very small screens, shown from sm */}
        <div className="p-4 md:p-6">
          {/* Logo Brand */}
          <div className="hidden md:flex items-center gap-3 mb-8">
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 shadow-neon-purple animate-pulse">
              <Heart size={20} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">BioVet</h1>
              <span className="text-[10px] text-neon-blue font-bold tracking-widest uppercase">POS & CRÉDITOS</span>
            </div>
          </div>
 
          {/* Navigation Links — horizontal scrollable on mobile, vertical on md+ */}
          <nav className="flex md:flex-col gap-1 md:space-y-1.5 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`flex-shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                    isActive 
                      ? 'bg-neon-blue/10 border border-neon-blue/20 text-neon-blue shadow-neon-blue' 
                      : 'border border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-xs md:text-sm">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
 
        {/* Sidebar Footer — hidden on mobile to save space */}
        <div className="hidden md:block p-5 border-t border-white/5 space-y-3">
          {/* Logged-in user info */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-gray-300 font-bold text-sm shrink-0">
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{userProfile.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{userProfile.email}</p>
              <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}>
                {badge.icon} {badge.label}
              </span>
            </div>
          </div>
 
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 text-gray-500 hover:text-rose-400 hover:border-rose-500/20 hover:bg-rose-500/5 transition text-xs font-semibold"
          >
            <LogOut size={14} />
            Cerrar Sesión
          </button>
 
          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <div className="w-2 h-2 bg-neon-emerald rounded-full animate-ping"></div>
            <span className="text-xs font-semibold text-gray-400">Sistema Conectado</span>
          </div>
          <span className="text-[10px] text-gray-600 block">BioVet OS v1.0.0</span>
        </div>
      </aside>
 
      {/* Main Content Stage */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto md:h-screen">
        <div className="max-w-7xl mx-auto">
          <div style={{ display: activeTab === 'caja' ? 'block' : 'none' }}>
            <Caja currentUserId={userProfile.id} />
          </div>
          <div style={{ display: activeTab === 'inventario' ? 'block' : 'none' }}>
            <Inventario userRole={role === 'collaborator' ? 'collaborator' : 'admin'} />
          </div>
          <div style={{ display: activeTab === 'clientes' ? 'block' : 'none' }}>
            <Clientes />
          </div>
          <div style={{ display: activeTab === 'rutas' ? 'block' : 'none' }}>
            <Rutas
              userRole={role === 'collaborator' ? 'collaborator' : 'admin'}
              currentCollaboratorId={userProfile.id}
            />
          </div>
          {isPrivileged && (
            <div style={{ display: activeTab === 'reportes' ? 'block' : 'none' }}>
              <Reportes />
            </div>
          )}
          {role === 'owner' && (
            <div style={{ display: activeTab === 'bitacora' ? 'block' : 'none' }}>
              <Bitacora />
            </div>
          )}
          {isPrivileged && (
            <div style={{ display: activeTab === 'ajustes' ? 'block' : 'none' }}>
              <Ajustes />
            </div>
          )}
        </div>
      </main>

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => {
          const typeStyles = {
            success: 'bg-emerald-500/10 border-emerald-500/30 text-neon-emerald',
            error: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
            warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
            info: 'bg-neon-blue/10 border-neon-blue/30 text-neon-blue'
          };
          return (
            <div
              key={t.id}
              className={`p-3.5 rounded-lg border glass-panel flex justify-between items-start gap-3 shadow-2xl pointer-events-auto animate-fade-in ${typeStyles[t.type] || typeStyles.info}`}
            >
              <span className="text-xs font-medium">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="text-gray-500 hover:text-white transition shrink-0 mt-0.5"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
 
    </div>
  );
}

export default App;

