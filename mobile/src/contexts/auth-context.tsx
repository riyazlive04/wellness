/**
 * Auth session provider for the SIRAH client app.
 *
 * Ported from the web AuthContext (frontend/src/contexts/AuthContext.tsx) but
 * trimmed to the client's needs and adapted for React Native:
 *   - No react-router navigation here; the root layout redirects declaratively
 *     off `session`/`loading` (idiomatic expo-router).
 *   - Role is read (never created) from user_roles, falling back to a clients
 *     row — same rule as the web app.
 *   - Cached role lives in AsyncStorage instead of localStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type UserRole = 'admin' | 'client' | 'manager' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const ROLE_CACHE_KEY = 'sirah-user-role';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUserRole(userId: string): Promise<UserRole> {
  try {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (roleData?.role) return roleData.role as UserRole;

    // Legacy clients may only have a `clients` row.
    const { data: clientData } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (clientData) return 'client';

    return null;
  } catch (err) {
    console.warn('[auth] role fetch failed', err);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const resolveRole = async (u: User) => {
      // Optimistic: metadata → cache, verified in the background.
      const metaRole = u.user_metadata?.role as UserRole | undefined;
      const cached = (await AsyncStorage.getItem(ROLE_CACHE_KEY)) as UserRole;
      if (mounted && (metaRole || cached)) setUserRole(metaRole ?? cached);

      const verified = await fetchUserRole(u.id);
      if (!mounted) return;
      setUserRole(verified);
      if (verified) await AsyncStorage.setItem(ROLE_CACHE_KEY, verified);
    };

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const s = data.session ?? null;
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          lastUserId.current = s.user.id;
          await resolveRole(s.user);
        }
      })
      .finally(() => mounted && setLoading(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        if (s.user.id !== lastUserId.current || event === 'SIGNED_IN') {
          lastUserId.current = s.user.id;
          void resolveRole(s.user);
        }
      } else {
        setUserRole(null);
        lastUserId.current = null;
        void AsyncStorage.removeItem(ROLE_CACHE_KEY);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { error: error.message };
    if (data.session?.user) {
      setSession(data.session);
      setUser(data.session.user);
      const role = await fetchUserRole(data.session.user.id);
      setUserRole(role);
      if (role) await AsyncStorage.setItem(ROLE_CACHE_KEY, role);
    }
    return { error: null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (err) {
      console.warn('[auth] sign out error', err);
    } finally {
      await AsyncStorage.removeItem(ROLE_CACHE_KEY);
      setUser(null);
      setSession(null);
      setUserRole(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, userRole, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
