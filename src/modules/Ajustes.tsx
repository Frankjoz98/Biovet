import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Settings, Save, Shield, Users, Mail, UserX, Loader2, Edit2, Check, X, Lock, Eye, EyeOff } from 'lucide-react';

interface BusinessSettings {
  business_name: string;
  business_phone: string;
  business_address: string;
  business_website: string;
}

interface Collaborator {
  id: string;
  name: string;
  email: string;
  phone: string;
  base_salary: number;
  is_active: boolean;
  role_id: string;
  bv_roles?: { name: string };
}

export default function Ajustes() {
  const [activeTab, setActiveTab] = useState<'negocio' | 'usuarios' | 'seguridad'>('negocio');
  const [loading, setLoading] = useState(false);

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });

  // Business settings state
  const [settings, setSettings] = useState<BusinessSettings>({
    business_name: '',
    business_phone: '',
    business_address: '',
    business_website: ''
  });

  // Users state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [roles, setRoles] = useState<{id: string, name: string}[]>([]);
  const [editingCollabId, setEditingCollabId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Collaborator>>({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch settings
      const { data: settingsData } = await supabase.from('bv_settings').select('*');
      if (settingsData) {
        const mappedSettings: Record<string, string> = {};
        settingsData.forEach(s => {
          mappedSettings[s.key] = s.value;
        });
        setSettings(mappedSettings as unknown as BusinessSettings);
      }

      // Fetch collaborators (including inactive so we can manage them)
      const { data: colData } = await supabase
        .from('bv_collaborators')
        .select('*, bv_roles(name)')
        .order('name');
      if (colData) setCollaborators(colData);

      // Fetch roles
      const { data: rolesData } = await supabase.from('bv_roles').select('*');
      if (rolesData) setRoles(rolesData);

    } catch (error) {
      const err = error as Error;
      toast.error('Error cargando ajustes: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const updates = Object.entries(settings).map(([key, value]) => ({
        key,
        value
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('bv_settings')
          .update({ value: update.value })
          .eq('key', update.key);
        if (error) throw error;
      }

      toast.success('Ajustes del negocio guardados correctamente.');
    } catch (error) {
      const err = error as Error;
      toast.error('Error guardando ajustes: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(email: string) {
    if (!email) {
      toast.error('Este usuario no tiene un correo válido registrado.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast.success(`Enlace de recuperación enviado a: ${email}`);
    } catch (err: any) {
      toast.error('Error al solicitar restablecimiento: ' + err.message);
    }
  }

  async function handleToggleStatus(collab: Collaborator) {
    const newStatus = !collab.is_active;
    try {
      const { error } = await supabase
        .from('bv_collaborators')
        .update({ is_active: newStatus })
        .eq('id', collab.id);
      
      if (error) throw error;
      toast.success(newStatus ? 'Usuario reactivado' : 'Usuario suspendido');
      fetchData();
    } catch (error) {
      const err = error as Error;
      toast.error('Error cambiando estado: ' + err.message);
    }
  }

  function startEditing(collab: Collaborator) {
    setEditingCollabId(collab.id);
    setEditForm({
      name: collab.name,
      phone: collab.phone || '',
      base_salary: collab.base_salary,
      role_id: collab.role_id
    });
  }

  async function saveCollabEdit() {
    if (!editingCollabId) return;
    try {
      const { error } = await supabase
        .from('bv_collaborators')
        .update({
          name: editForm.name,
          phone: editForm.phone,
          base_salary: editForm.base_salary,
          role_id: editForm.role_id
        })
        .eq('id', editingCollabId);

      if (error) throw error;
      toast.success('Usuario actualizado correctamente.');
      setEditingCollabId(null);
      fetchData();
    } catch (error) {
      const err = error as Error;
      toast.error('Error actualizando colaborador: ' + err.message);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwForm.next || pwForm.next.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    setPwLoading(true);
    try {
      // Verify current password by re-signing in
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData?.session?.user?.email;
      if (!email) throw new Error('No hay sesión activa.');

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: pwForm.current,
      });
      if (verifyError) throw new Error('La contraseña actual es incorrecta.');

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password: pwForm.next });
      if (updateError) throw updateError;

      toast.success('¡Contraseña actualizada exitosamente!');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (error) {
      const err = error as Error;
      toast.error(err.message);
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
          <Settings size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Configuración</h1>
          <p className="text-gray-400 text-sm">Ajustes generales del sistema y gestión de accesos.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 glass-panel p-1 rounded-xl w-max">
        <button
          onClick={() => setActiveTab('negocio')}
          className={`px-6 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'negocio' ? 'bg-purple-600/30 text-purple-400 shadow-lg' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Perfil de Negocio
        </button>
        <button
          onClick={() => setActiveTab('usuarios')}
          className={`px-6 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'usuarios' ? 'bg-neon-blue/20 text-neon-blue shadow-lg' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Gestión de Usuarios
        </button>
        <button
          onClick={() => setActiveTab('seguridad')}
          className={`px-6 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'seguridad' ? 'bg-rose-500/20 text-rose-400 shadow-lg' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Seguridad
        </button>
      </div>

      {/* Negocio Tab */}
      {activeTab === 'negocio' && (
        <div className="glass-panel rounded-2xl p-6 border border-purple-500/10">
          <h2 className="text-lg font-bold text-white mb-6">Datos del Recibo y Empresa</h2>
          <form onSubmit={handleSaveSettings} className="space-y-5 max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Nombre Comercial</label>
                <input
                  type="text"
                  value={settings.business_name}
                  onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:border-purple-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Teléfono Principal</label>
                <input
                  type="text"
                  value={settings.business_phone}
                  onChange={(e) => setSettings({ ...settings, business_phone: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:border-purple-500 outline-none transition"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Dirección</label>
                <input
                  type="text"
                  value={settings.business_address}
                  onChange={(e) => setSettings({ ...settings, business_address: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:border-purple-500 outline-none transition"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Sitio Web / Red Social</label>
                <input
                  type="text"
                  value={settings.business_website}
                  onChange={(e) => setSettings({ ...settings, business_website: e.target.value })}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 text-white focus:border-purple-500 outline-none transition"
                />
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/5">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2 transition"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Usuarios Tab */}
      {activeTab === 'usuarios' && (
        <div className="glass-panel rounded-2xl p-6 border border-neon-blue/10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="text-neon-blue" size={20} />
              Control de Accesos
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Usuario</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Rol</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Salario / Info</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {collaborators.map((col) => {
                  const isEditing = editingCollabId === col.id;
                  
                  return (
                    <tr key={col.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-4 px-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                            className="bg-[#0d0d18] border border-white/20 rounded px-2 py-1 text-sm text-white w-full"
                          />
                        ) : (
                          <div>
                            <p className="font-bold text-white text-sm">{col.name}</p>
                            <p className="text-xs text-gray-500">{col.email || 'Sin correo vinculado'}</p>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {isEditing ? (
                          <select
                            value={editForm.role_id}
                            onChange={(e) => setEditForm({...editForm, role_id: e.target.value})}
                            className="bg-[#0d0d18] border border-white/20 rounded px-2 py-1 text-xs text-white w-full uppercase"
                          >
                            {roles.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase border ${
                            col.bv_roles?.name === 'owner' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                            col.bv_roles?.name === 'admin' ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
                            'bg-gray-500/10 border-gray-500/30 text-gray-400'
                          }`}>
                            {col.bv_roles?.name || 'collaborator'}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={editForm.base_salary}
                              onChange={(e) => setEditForm({...editForm, base_salary: Number(e.target.value)})}
                              className="bg-[#0d0d18] border border-white/20 rounded px-2 py-1 text-sm text-white w-20"
                              title="Salario Base"
                            />
                            <input
                              type="text"
                              value={editForm.phone}
                              onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                              className="bg-[#0d0d18] border border-white/20 rounded px-2 py-1 text-sm text-white w-28"
                              placeholder="Teléfono"
                            />
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-mono text-gray-300">C$ {Number(col.base_salary).toFixed(2)}</p>
                            {col.phone && <p className="text-xs text-gray-500">{col.phone}</p>}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`flex items-center gap-1.5 text-xs font-bold ${col.is_active ? 'text-neon-emerald' : 'text-rose-500'}`}>
                          <div className={`w-2 h-2 rounded-full ${col.is_active ? 'bg-neon-emerald' : 'bg-rose-500'}`}></div>
                          {col.is_active ? 'Activo' : 'Suspendido'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={saveCollabEdit} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/40 transition">
                              <Check size={16} />
                            </button>
                            <button onClick={() => setEditingCollabId(null)} className="p-1.5 bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/40 transition">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleResetPassword(col.email)}
                              className="p-2 text-gray-400 hover:text-neon-blue hover:bg-neon-blue/10 rounded-lg transition"
                              title="Enviar enlace de restablecer contraseña"
                            >
                              <Mail size={16} />
                            </button>
                            <button 
                              onClick={() => startEditing(col)}
                              className="p-2 text-gray-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition"
                              title="Editar Perfil"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleToggleStatus(col)}
                              className={`p-2 rounded-lg transition ${
                                col.is_active 
                                ? 'text-gray-400 hover:text-rose-500 hover:bg-rose-500/10' 
                                : 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/30'
                              }`}
                              title={col.is_active ? "Suspender Usuario" : "Reactivar Usuario"}
                            >
                              {col.is_active ? <UserX size={16} /> : <Shield size={16} />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Seguridad Tab */}
      {activeTab === 'seguridad' && (
        <div className="glass-panel rounded-2xl p-6 border border-rose-500/10 max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-rose-500/10 rounded-lg">
              <Lock size={20} className="text-rose-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Cambiar Contraseña</h2>
              <p className="text-xs text-gray-400">Actualiza la contraseña de tu cuenta de acceso.</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {/* Contraseña actual */}
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Contraseña Actual</label>
              <div className="relative">
                <input
                  type={showPw.current ? 'text' : 'password'}
                  value={pwForm.current}
                  onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                  placeholder="Tu contraseña actual"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 pr-10 text-white focus:border-rose-500/50 outline-none transition text-sm"
                  required
                />
                <button type="button" onClick={() => setShowPw({ ...showPw, current: !showPw.current })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                  {showPw.current ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Nueva contraseña */}
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Nueva Contraseña</label>
              <div className="relative">
                <input
                  type={showPw.next ? 'text' : 'password'}
                  value={pwForm.next}
                  onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg p-2.5 pr-10 text-white focus:border-rose-500/50 outline-none transition text-sm"
                  required
                />
                <button type="button" onClick={() => setShowPw({ ...showPw, next: !showPw.next })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                  {showPw.next ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Strength indicator */}
              {pwForm.next.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {[1,2,3,4].map((lvl) => (
                    <div key={lvl} className={`h-1 flex-1 rounded-full transition-all ${
                      pwForm.next.length >= lvl * 3
                        ? lvl <= 1 ? 'bg-rose-500'
                          : lvl <= 2 ? 'bg-amber-500'
                          : lvl <= 3 ? 'bg-yellow-400'
                          : 'bg-neon-emerald'
                        : 'bg-white/10'
                    }`} />
                  ))}
                </div>
              )}
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Confirmar Contraseña</label>
              <div className="relative">
                <input
                  type={showPw.confirm ? 'text' : 'password'}
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  placeholder="Repite la nueva contraseña"
                  className={`w-full bg-[#0d0d18] border rounded-lg p-2.5 pr-10 text-white focus:outline-none transition text-sm ${
                    pwForm.confirm && pwForm.next !== pwForm.confirm
                      ? 'border-rose-500/60'
                      : pwForm.confirm && pwForm.next === pwForm.confirm
                      ? 'border-neon-emerald/60'
                      : 'border-white/10'
                  }`}
                  required
                />
                <button type="button" onClick={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                  {showPw.confirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                <p className="text-[11px] text-rose-400 mt-1">Las contraseñas no coinciden</p>
              )}
              {pwForm.confirm && pwForm.next === pwForm.confirm && (
                <p className="text-[11px] text-neon-emerald mt-1">✓ Las contraseñas coinciden</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={pwLoading || !pwForm.current || !pwForm.next || !pwForm.confirm}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-2 transition"
              >
                {pwLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {pwLoading ? 'Actualizando...' : 'Actualizar Contraseña'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
