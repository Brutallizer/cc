import { supabase } from '../_lib/supabase.js';

/**
 * REST API: GET /api/campus/list
 * Mengambil daftar seluruh kampus dari Supabase untuk ditampilkan di Dashboard Kementerian.
 */
export default async function handler(req, res) {
  // Aktifkan CORS secara manual untuk API Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('institutions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ institutions: data || [] });
  } catch (error) {
    console.error('❌ Supabase error:', error.message);
    return res.status(500).json({ error: 'Gagal mengambil data dari Supabase.' });
  }
}
