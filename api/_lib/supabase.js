const { createClient } = require('@supabase/supabase-js');

// Baca dari Environment Variables Vercel
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset. Database operations mungkin gagal.");
}

// Gunakan Service Role Key untuk operasi admin (bypass RLS) yang diamankan di belakang Serverless API
const supabase = createClient(supabaseUrl || 'https://xyz.supabase.co', supabaseKey || 'dummy');

module.exports = { supabase };
