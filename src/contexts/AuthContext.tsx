import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isDemoAccount: boolean;
  demoRole: 'USER' | 'SLP';
  setDemoRole: (role: 'USER' | 'SLP') => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isDemoAccount: false,
  demoRole: 'USER',
  setDemoRole: () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoRole, setDemoRoleState] = useState<'USER' | 'SLP'>(() => {
    try {
      const stored = localStorage.getItem('speakease_demo_role');
      return (stored === 'SLP' || stored === 'USER') ? stored : 'USER';
    } catch {
      return 'USER';
    }
  });

  const setDemoRole = (role: 'USER' | 'SLP') => {
    setDemoRoleState(role);
    try {
      localStorage.setItem('speakease_demo_role', role);
    } catch {
      // ignore storage errors
    }
  };

  const isDemoAccount = Boolean(
    profile && (profile.email?.toLowerCase() === 'admin@gmail.com' || profile.role === 'ADMIN')
  );

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        // Fallback to metadata if DB row isn't created yet
        const { data: userData } = await supabase.auth.getUser();
        const currentUser = userData?.user;
        if (currentUser) {
          const metaRole = (currentUser.user_metadata?.role as any) || 'USER';
          const metaName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User';
          setProfile({
            id: currentUser.id,
            user_id: currentUser.id,
            email: currentUser.email || '',
            full_name: metaName,
            role: metaRole,
            phone: currentUser.user_metadata?.phone || null,
            created_at: currentUser.created_at || new Date().toISOString(),
            updated_at: currentUser.updated_at || new Date().toISOString(),
          });
        }
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await fetchProfile(session.user.id);
      }
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('speakease_demo_role');
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isLoading,
        isDemoAccount,
        demoRole,
        setDemoRole,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
