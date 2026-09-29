import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const DEFAULT_SUPABASE_URL = 'https://dbpcjfhrswhphitltpgb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicGNqZmhyc3docGhpdGx0cGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNDgzMTIsImV4cCI6MjEwNDYyNDMxMn0.kLOi2n9CzVT632ooUyqDiNtseLxLTI_yg2Te2As457o';

const rawUrl: string = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseUrl = (cleanedUrl && !cleanedUrl.includes('placeholder')) ? cleanedUrl : DEFAULT_SUPABASE_URL;

const envKey: string = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
const supabaseAnonKey = (envKey && !envKey.includes('placeholder')) ? envKey : DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

