import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const nodeEnv = (typeof process !== 'undefined' && process?.env) || {};
const viteEnv =
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};

let supabaseUrl =
  viteEnv.VITE_SUPABASE_URL ||
  nodeEnv.VITE_SUPABASE_URL ||
  nodeEnv.SUPABASE_URL ||
  'https://placeholder-env-not-set.supabase.co';
if (supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1/', '');
}

const supabaseAnonKey =
  viteEnv.VITE_SUPABASE_ANON_KEY ||
  nodeEnv.VITE_SUPABASE_ANON_KEY ||
  nodeEnv.SUPABASE_ANON_KEY ||
  'env-anon-key-not-configured';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
