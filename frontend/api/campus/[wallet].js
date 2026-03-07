const { supabase } = require('../_lib/supabase.js');

/**
 * REST API: GET /api/campus/[wallet]
 * Mengambil profil satu institusi berdasarkan wallet address.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const wallet = req.query.wallet;
    if (!wallet) return res.status(400).json({ error: 'Wallet parameter missing' });

    const { data, error } = await supabase
      .from('institutions')
      .select('*')
      .eq('wallet', wallet.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    if (!data) {
      return res.status(404).json({ error: 'Institusi tidak ditemukan' });
    }

    return res.status(200).json({ institution: data });
  } catch (error) {
    console.error('❌ Supabase GET campus error:', error.message);
    return res.status(500).json({ error: 'Gagal mengambil data kampus' });
  }
}
