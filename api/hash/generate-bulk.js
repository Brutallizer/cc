const crypto = require('crypto');

/**
 * REST API: POST /api/hash/generate-bulk
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "Array students wajib diisi." });
    }

    if (students.length > 500) {
      return res.status(400).json({ error: "Maksimal 500 data per request." });
    }

    const hashes = students.map((s, index) => {
      if (!s.nama || !s.nim || !s.jurusan || !s.ipk || !s.tanggalLahir) {
        return { index, error: "Data tidak lengkap", hash: null };
      }

      const dataString = `${s.nama}|${s.nim}|${s.jurusan}|${s.ipk}|${s.tanggalLahir}`;
      const hash = "0x" + crypto.createHash("sha256").update(dataString, "utf8").digest("hex");

      return { index, hash, nama: s.nama, nim: s.nim };
    });

    return res.status(200).json({
      success: true,
      count: hashes.filter(h => h.hash).length,
      hashes: hashes
    });
  } catch (error) {
    console.error("❌ Error /api/hash/generate-bulk:", error.message);
    return res.status(500).json({ error: "Gagal menghasilkan bulk hash." });
  }
}
