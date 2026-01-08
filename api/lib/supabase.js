import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root - try multiple paths
const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
  console.log('Trying env path:', envPath);
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log('Successfully loaded env from:', envPath);
    envLoaded = true;
    break;
  } else {
    console.log('Failed to load from:', envPath, result.error.message);
  }
}

if (!envLoaded) {
  console.warn('Warning: Could not load .env file from any location');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Environment check:');
console.log('VITE_SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Present' : 'Missing');
console.log('All env keys:', Object.keys(process.env).filter(key => key.includes('SUPABASE')));

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// 使用服务角色密钥创建客户端，用于后端操作
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});