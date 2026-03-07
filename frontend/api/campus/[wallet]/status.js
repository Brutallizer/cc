const { supabase } = require('../../../_lib/supabase.js');

/**
 * REST API: PUT /api/campus/[wallet]/status
 * Endpoint untuk Admin Kementerian mengupdate status verifikasi kampus (approved/rejected).
 * Di Vercel, [wallet] otomatis tersedia via req.query.wallet
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const wallet = req.query.wallet;
    const { status } = req.body;

    if (!wallet || !status) return res.status(400).json({ error: 'Parameter tidak lengkap' });

    const validStatuses = ["pending", "approved", "rejected", "deactivated"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Status tidak valid." });
    }

    const { error } = await supabase
      .from('institutions')
      .update({ status: status })
      .eq('wallet', wallet.toLowerCase());

    if (error) throw error;

    return res.status(200).json({ success: true, message: `Status diubah ke '${status}'` });
  } catch (error) {
    console.error('❌ Supabase update status error:', error.message);
    return res.status(500).json({ error: 'Gagal memperbarui status.' });
  }
}
