import crypto from 'crypto';

/**
 * REST API: POST /api/hash/generate
 * Kalkulasi SHA-256 Server-side (Bebas dari client tampering)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { nama, nim, jurusan, ipk, tanggalLahir } = req.body;

    if (!nama || !nim || !jurusan || !ipk || !tanggalLahir) {
      return res.status(400).json({ error: "Semua field wajib diisi." });
    }

    if (nama.length > 200 || nim.length > 50 || jurusan.length > 200 || ipk.length > 10) {
      return res.status(400).json({ error: "Input terlalu panjang." });
    }

    const dataString = `${nama}|${nim}|${jurusan}|${ipk}|${tanggalLahir}`;
    const hash = "0x" + crypto.createHash("sha256").update(dataString, "utf8").digest("hex");

    return res.status(200).json({
      success: true,
      hash: hash,
      algorithm: "SHA-256",
      source: "serverless-api"
    });
  } catch (error) {
    console.error("❌ Error /api/hash/generate:", error.message);
    return res.status(500).json({ error: "Gagal menghasilkan hash." });
  }
}
