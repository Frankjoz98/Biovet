import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Heart, LogIn, UserPlus, Eye, EyeOff, Loader2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

type AuthMode = 'login' | 'register';

export default function Login({ onLoginSuccess }: LoginProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (!data.user) throw new Error('No se pudo iniciar sesión.');

      // Verificar que existe un perfil vinculado en bv_collaborators
      const { data: profile, error: profileError } = await supabase
        .from('bv_collaborators')
        .select('id, name')
        .eq('auth_user_id', data.user.id)
        .eq('is_active', true)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        throw new Error('Tu cuenta no tiene un perfil asociado. Contacta al administrador.');
      }

      onLoginSuccess();
    } catch (error) {
      const err = error as Error;
      setError(err.message || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Check if there is already an owner
      const { data: ownerRole } = await supabase
        .from('bv_roles')
        .select('id')
        .eq('name', 'owner')
        .single();

      if (!ownerRole) throw new Error('Error de configuración del sistema.');

      const { count: ownerCount } = await supabase
        .from('bv_collaborators')
        .select('id', { count: 'exact', head: true })
        .eq('role_id', ownerRole.id)
        .eq('is_active', true)
        .not('auth_user_id', 'is', null);

      const isFirstOwner = ownerCount === 0;

      if (!isFirstOwner) {
        // There's already an owner → this email must be pre-registered in bv_collaborators
        const { data: existingProfile, error: profileCheckError } = await supabase
          .from('bv_collaborators')
          .select('id, email, auth_user_id')
          .eq('email', email.toLowerCase().trim())
          .is('auth_user_id', null)
          .eq('is_active', true)
          .single();

        if (profileCheckError || !existingProfile) {
          throw new Error('Tu correo no ha sido registrado por la administración. Contacta a tu supervisor.');
        }

        // 2. Register in Supabase Auth
        const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('Error al crear la cuenta.');

        // 3. Link auth user to existing collaborator profile
        const { error: updateError } = await supabase
          .from('bv_collaborators')
          .update({ auth_user_id: authData.user.id, name: name || existingProfile.email })
          .eq('id', existingProfile.id);

        if (updateError) throw updateError;

      } else {
        // First registration → auto-promote to owner
        if (!name.trim()) throw new Error('El nombre es obligatorio para el primer registro.');

        // 2a. Register in Supabase Auth
        const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('Error al crear la cuenta.');

        // 2b. Update the existing "Administrador General" placeholder or insert new owner
        const { data: existingAdmin } = await supabase
          .from('bv_collaborators')
          .select('id')
          .is('auth_user_id', null)
          .eq('role_id', ownerRole.id)
          .single();

        if (existingAdmin) {
          await supabase
            .from('bv_collaborators')
            .update({ auth_user_id: authData.user.id, name, email: email.toLowerCase().trim() })
            .eq('id', existingAdmin.id);
        } else {
          await supabase.from('bv_collaborators').insert({
            name,
            email: email.toLowerCase().trim(),
            role_id: ownerRole.id,
            auth_user_id: authData.user.id,
            base_salary: 0,
          });
        }
      }

      // Attempt automatic sign in (email confirmation may be disabled)
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Cuenta creada. Si no ingresa automáticamente, revisa tu correo para confirmar la cuenta y luego inicia sesión.');
        setMode('login');
        return;
      }

      onLoginSuccess();
    } catch (error) {
      const err = error as Error;
      setError(err.message || 'Error al registrarse.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#030308] flex items-center justify-center p-4">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-neon-blue/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-rose-500/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-500 shadow-lg animate-pulse">
            <Heart size={28} fill="currentColor" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight text-white">BioVet</h1>
            <span className="text-[11px] text-neon-blue font-bold tracking-widest uppercase">
              Sistema de Gestión Veterinaria
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-2xl p-7 shadow-2xl border border-white/8">
          {/* Tab switcher */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition ${
                mode === 'login'
                  ? 'bg-neon-blue/20 text-neon-blue border-r border-neon-blue/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <LogIn size={12} className="inline mr-1.5" />
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition ${
                mode === 'register'
                  ? 'bg-purple-600/20 text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <UserPlus size={12} className="inline mr-1.5" />
              Activar Cuenta
            </button>
          </div>

          {/* Form */}
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre completo"
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">
                Correo Electrónico *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full bg-[#0d0d18] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-neon-blue transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">
                Contraseña *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full bg-[#0d0d18] border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-neon-blue transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2.5 text-rose-400 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60 ${
                mode === 'login'
                  ? 'bg-neon-blue hover:bg-neon-blue/80 text-black'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {loading
                ? <Loader2 size={16} className="animate-spin" />
                : mode === 'login'
                  ? <><LogIn size={15} /> Ingresar</>
                  : <><UserPlus size={15} /> Activar Cuenta</>
              }
            </button>
          </form>

          {mode === 'register' && (
            <p className="text-[10px] text-gray-600 text-center mt-4">
              Si ya tienes cuenta, usa "Iniciar Sesión". Si eres nuevo colaborador, tu correo debe haber sido pre-registrado por un administrador.
            </p>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-700 mt-6">
          BioVet OS v1.0.0 — Powered by Novarix
        </p>
      </div>
    </div>
  );
}
