import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const rawUrl: string = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') || 'https://placeholder.supabase.co';
const supabaseAnonKey: string = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);
