/**
 * server.js — CredBlock Backend API
 * 
 * TUJUAN:
 * 1. Menggantikan localStorage browser dengan database SQLite yang persisten.
 * 2. Memindahkan kalkulasi SHA-256 dari client-side ke server-side.
 * 3. Menyediakan REST API untuk profil institusi (CRUD).
 *
 * JALANKAN: node server.js (atau npm start)
 * PORT: 3001 (default), bisa diubah via env PORT=xxxx
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

// sql.js = SQLite engine murni JavaScript (tanpa native build)
const initSqlJs = require("sql.js");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, "credblock.db");

let db; // SQLite database instance

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet());
app.use(cors({
    origin: [
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:3000",
        "https://credblock.vercel.app",
        "https://cc-steel.vercel.app"
    ],
    methods: ["GET", "POST", "PUT"],
    credentials: true
}));
app.use(express.json({ limit: "1mb" }));

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

async function initDatabase() {
    const SQL = await initSqlJs();

    // Jika file DB sudah ada, muat; jika belum, buat baru
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log("📂 Database dimuat dari file:", DB_PATH);
    } else {
        db = new SQL.Database();
        console.log("🆕 Database baru dibuat.");
    }

    // Buat tabel jika belum ada
    db.run(`
        CREATE TABLE IF NOT EXISTS institutions (
            wallet TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            short_name TEXT,
            sk TEXT,
            akreditasi TEXT,
            website TEXT,
            email TEXT,
            address TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    saveDatabase();
    console.log("✅ Tabel 'institutions' siap.");
}

/**
 * Simpan database ke disk (sql.js bekerja in-memory, perlu manual save).
 */
function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// ============================================================
// API ROUTES: INSTITUTION MANAGEMENT
// ============================================================

/**
 * POST /api/campus/apply
 * Menyimpan metadata legalitas kampus ke database (mengganti localStorage).
 * Dipanggil setelah kampus berhasil memanggil applyForRegistration() on-chain.
 */
app.post("/api/campus/apply", (req, res) => {
    try {
        const { wallet, name, shortName, sk, akreditasi, website, email, address } = req.body;

        if (!wallet || !name) {
            return res.status(400).json({ error: "Wallet dan nama institusi wajib diisi." });
        }

        // Validasi panjang input
        if (name.length > 200 || (sk && sk.length > 100) || (wallet && wallet.length > 42)) {
            return res.status(400).json({ error: "Input terlalu panjang." });
        }

        // Cek apakah sudah ada
        const existing = db.exec("SELECT wallet FROM institutions WHERE wallet = ?", [wallet.toLowerCase()]);
        
        if (existing.length > 0 && existing[0].values.length > 0) {
            // Update data yang sudah ada
            db.run(`
                UPDATE institutions SET 
                    name = ?, short_name = ?, sk = ?, akreditasi = ?, 
                    website = ?, email = ?, address = ?, updated_at = CURRENT_TIMESTAMP
                WHERE wallet = ?
            `, [name, shortName || "", sk || "", akreditasi || "", website || "", email || "", address || "", wallet.toLowerCase()]);
        } else {
            // Insert baru
            db.run(`
                INSERT INTO institutions (wallet, name, short_name, sk, akreditasi, website, email, address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [wallet.toLowerCase(), name, shortName || "", sk || "", akreditasi || "", website || "", email || "", address || ""]);
        }

        saveDatabase();
        console.log(`✅ Profil kampus disimpan: ${name} (${wallet})`);
        res.json({ success: true, message: "Profil institusi berhasil disimpan." });

    } catch (error) {
        console.error("❌ Error /api/campus/apply:", error);
        res.status(500).json({ error: "Gagal menyimpan data institusi." });
    }
});

/**
 * GET /api/campus/list
 * Mengambil SEMUA profil institusi dari database.
 * Digunakan oleh Dashboard Kementerian dan halaman verifikasi.
 */
app.get("/api/campus/list", (req, res) => {
    try {
        const result = db.exec("SELECT * FROM institutions ORDER BY created_at DESC");
        
        if (result.length === 0) {
            return res.json({ institutions: [] });
        }

        const columns = result[0].columns;
        const institutions = result[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
        });

        res.json({ institutions });
    } catch (error) {
        console.error("❌ Error /api/campus/list:", error);
        res.status(500).json({ error: "Gagal mengambil data institusi." });
    }
});

/**
 * GET /api/campus/:wallet
 * Mengambil profil SATU institusi berdasarkan wallet address.
 */
app.get("/api/campus/:wallet", (req, res) => {
    try {
        const wallet = req.params.wallet.toLowerCase();
        const result = db.exec("SELECT * FROM institutions WHERE wallet = ?", [wallet]);

        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(404).json({ error: "Institusi tidak ditemukan." });
        }

        const columns = result[0].columns;
        const row = result[0].values[0];
        const institution = {};
        columns.forEach((col, i) => { institution[col] = row[i]; });

        res.json({ institution });
    } catch (error) {
        console.error("❌ Error /api/campus/:wallet:", error);
        res.status(500).json({ error: "Gagal mengambil data institusi." });
    }
});

/**
 * PUT /api/campus/:wallet/status
 * Update status institusi (approved/rejected/deactivated).
 * Dipanggil oleh Dashboard Kementerian setelah approve/reject on-chain.
 */
app.put("/api/campus/:wallet/status", (req, res) => {
    try {
        const wallet = req.params.wallet.toLowerCase();
        const { status } = req.body;

        const validStatuses = ["pending", "approved", "rejected", "deactivated"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Status tidak valid." });
        }

        db.run(
            "UPDATE institutions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet = ?",
            [status, wallet]
        );

        saveDatabase();
        res.json({ success: true, message: `Status diubah ke '${status}'.` });
    } catch (error) {
        console.error("❌ Error /api/campus/:wallet/status:", error);
        res.status(500).json({ error: "Gagal memperbarui status." });
    }
});

// ============================================================
// API ROUTES: SERVER-SIDE HASHING
// ============================================================

/**
 * POST /api/hash/generate
 * Menghasilkan hash SHA-256 dari data mahasiswa di SERVER (bukan di browser).
 * 
 * KENAPA di server?
 * → Mencegah kampus/pengguna nakal memodifikasi skrip JS di browser
 *   dan menyimpan hash sembarang ke blockchain.
 * → Hash yang dihasilkan server dijamin konsisten dan valid.
 * 
 * FORMAT: "nama|nim|jurusan|ipk|tanggalLahir" (HARUS SAMA dengan frontend!)
 */
app.post("/api/hash/generate", (req, res) => {
    try {
        const { nama, nim, jurusan, ipk, tanggalLahir } = req.body;

        if (!nama || !nim || !jurusan || !ipk || !tanggalLahir) {
            return res.status(400).json({ error: "Semua field wajib diisi." });
        }

        // Validasi panjang input (anti-DoS)
        if (nama.length > 200 || nim.length > 50 || jurusan.length > 200 || ipk.length > 10) {
            return res.status(400).json({ error: "Input terlalu panjang." });
        }

        // Format HARUS IDENTIK dengan frontend: "nama|nim|jurusan|ipk|tanggalLahir"
        const dataString = `${nama}|${nim}|${jurusan}|${ipk}|${tanggalLahir}`;

        // Kalkulasi SHA-256 menggunakan Node.js crypto (bukan browser Web Crypto)
        const hash = "0x" + crypto.createHash("sha256").update(dataString, "utf8").digest("hex");

        // Jangan log data mahasiswa (PII protection), hanya log hash
        console.log(`🔒 Hash generated: ${hash.substring(0, 16)}...`);

        res.json({
            success: true,
            hash: hash,
            algorithm: "SHA-256",
            source: "server-side"
        });

    } catch (error) {
        console.error("❌ Error /api/hash/generate:", error);
        res.status(500).json({ error: "Gagal menghasilkan hash." });
    }
});

/**
 * POST /api/hash/generate-bulk
 * Menghasilkan BANYAK hash sekaligus (untuk fitur Bulk Upload CSV).
 */
app.post("/api/hash/generate-bulk", (req, res) => {
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

        console.log(`🔒 Bulk hash: ${hashes.filter(h => h.hash).length}/${students.length} berhasil`);

        res.json({
            success: true,
            count: hashes.filter(h => h.hash).length,
            hashes: hashes
        });

    } catch (error) {
        console.error("❌ Error /api/hash/generate-bulk:", error);
        res.status(500).json({ error: "Gagal menghasilkan bulk hash." });
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "CredBlock Backend API",
        version: "1.0.0",
        database: db ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// SERVER START
// ============================================================

async function start() {
    await initDatabase();

    app.listen(PORT, () => {
        console.log("");
        console.log("╔══════════════════════════════════════════════════╗");
        console.log("║        CredBlock Backend API — Running          ║");
        console.log("╚══════════════════════════════════════════════════╝");
        console.log(`   🌐 URL        : http://localhost:${PORT}`);
        console.log(`   📦 Database   : ${DB_PATH}`);
        console.log(`   🔐 CORS       : Enabled`);
        console.log(`   🛡️  Helmet     : Enabled`);
        console.log("");
        console.log("   Endpoints:");
        console.log("   POST /api/campus/apply          — Simpan profil kampus");
        console.log("   GET  /api/campus/list           — Daftar semua kampus");
        console.log("   GET  /api/campus/:wallet        — Profil satu kampus");
        console.log("   PUT  /api/campus/:wallet/status — Update status kampus");
        console.log("   POST /api/hash/generate         — Server-side SHA-256");
        console.log("   POST /api/hash/generate-bulk    — Bulk SHA-256");
        console.log("   GET  /api/health                — Health check");
        console.log("");
    });
}

start().catch(err => {
    console.error("❌ Gagal memulai server:", err);
    process.exit(1);
});
