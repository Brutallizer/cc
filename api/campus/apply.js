import { supabase } from '../../_lib/supabase.js';

/**
 * REST API: POST /api/campus/apply
 * Menerima pendaftaran institusi baru dan menyimpannya ke Supabase.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { wallet, name, shortName, sk, akreditasi, website, email, address } = req.body;

    if (!wallet || !name) {
      return res.status(400).json({ error: "Wallet dan nama institut wajib diisi." });
    }

    const { error } = await supabase
      .from('institutions')
      .upsert({
        wallet: wallet.toLowerCase(),
        name: name,
        short_name: shortName || "",
        sk: sk || "",
        akreditasi: akreditasi || "",
        website: website || "",
        email: email || "",
        address: address || "",
        status: 'pending'
      }, { onConflict: 'wallet' }); // upsert based on wallet primary key

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Profil kampus tersimpan di Supabase.' });
  } catch (error) {
    console.error('❌ Supabase insert error:', error.message);
    return res.status(500).json({ error: 'Gagal memproses pendaftaran.' });
  }
}
