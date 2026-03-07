/**
 * ═══════════════════════════════════════════════════════════════
 *  SIMULASI END-TO-END TESTING — CredBlock V3
 *  Menguji SEMUA role: Super Admin, Admin Kampus, dan HRD
 * ═══════════════════════════════════════════════════════════════
 */

const { ethers } = require("ethers");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// ============================================================
// KONFIGURASI
// ============================================================
const RPC_URL = "https://polygon-amoy-bor-rpc.publicnode.com";
const CONTRACT_ADDRESS = "0x830c4Eb9669adF6DeA3c1AeE702AB4f77a865d27";
const DEPLOYER_PRIVATE_KEY = "6ac0f5ea2d262ad14c4c10c11697161ee6dd281042c509eac72403826a755f09";

const SUPABASE_URL = "https://enswfdlikcgtjlqhgqix.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuc3dmZGxpa2NndGpscWhncWl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg4Mzk5NSwiZXhwIjoyMDg4NDU5OTk1fQ._FU_ky-nSkcEig7fruEn8LJAwf6Q6_JgkmlG1QRAa2Y";

const VERCEL_API = "https://cc-bice-ten.vercel.app";

const CONTRACT_ABI = [
    "function applyForRegistration(string memory _name)",
    "function institutions(address) view returns (string name, uint8 status)",
    "function getAllApplicants() view returns (address[])",
    "function approveInstitution(address _wallet)",
    "function rejectInstitution(address _wallet)",
    "function deactivateInstitution(address _wallet, string memory _reason)",
    "function reactivateInstitution(address _wallet)",
    "function storeHash(bytes32 _hash)",
    "function verifyHash(bytes32 _hash) view returns (bool isValid, string memory institutionName, address publisher, bool isRevoked)",
    "function isKementerian(address _addr) view returns (bool)",
    "function getVersion() view returns (uint256)"
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// HELPER
// ============================================================
function generateSHA256(nama, nim, jurusan, ipk, tanggalLahir) {
    const dataString = `${nama}|${nim}|${jurusan}|${ipk}|${tanggalLahir}`;
    const hash = crypto.createHash("sha256").update(dataString).digest("hex");
    return "0x" + hash;
}

function printHeader(title) {
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log(`║  ${title.padEnd(60)}║`);
    console.log("╚══════════════════════════════════════════════════════════════╝");
}

function printResult(label, value, emoji = "✅") {
    console.log(`  ${emoji} ${label}: ${value}`);
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ PASS: ${testName}`);
    } else {
        failedTests++;
        console.log(`  ❌ FAIL: ${testName}`);
    }
}

// ============================================================
// MAIN SIMULATION
// ============================================================
async function runSimulation() {
    console.log("🚀 MEMULAI SIMULASI END-TO-END CREDBLOCK V3...");
    console.log(`   Waktu: ${new Date().toISOString()}`);
    console.log(`   Network: Polygon Amoy Testnet`);
    console.log(`   Contract: ${CONTRACT_ADDRESS}`);

    // Setup provider & wallets
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Super Admin wallet (deployer)
    const superAdminWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const superAdminContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, superAdminWallet);

    // Kampus wallet (generate random baru agar bersih)
    const campusWallet = ethers.Wallet.createRandom().connect(provider);
    const campusAddress = campusWallet.address;

    console.log(`   Super Admin Wallet: ${superAdminWallet.address}`);
    console.log(`   Kampus Wallet (Baru): ${campusAddress}`);

    // Cek saldo Super Admin
    const balance = await provider.getBalance(superAdminWallet.address);
    console.log(`   Saldo Super Admin: ${ethers.formatEther(balance)} MATIC`);

    if (balance === 0n) {
        console.error("❌ FATAL: Super Admin tidak punya saldo MATIC! Tidak bisa melanjutkan.");
        return;
    }

    // ============================================================
    // TAHAP 0: VERIFIKASI INFRASTRUKTUR
    // ============================================================
    printHeader("TAHAP 0: VERIFIKASI INFRASTRUKTUR");

    // Test 0.1: Koneksi ke Smart Contract
    try {
        const version = await superAdminContract.getVersion();
        assert(version > 0n, `Smart Contract aktif, Versi: ${version}`);
    } catch (e) {
        assert(false, `Gagal terkoneksi ke Smart Contract: ${e.message}`);
        return;
    }

    // Test 0.2: Verifikasi Super Admin Role
    try {
        const isAdmin = await superAdminContract.isKementerian(superAdminWallet.address);
        assert(isAdmin === true, `Wallet deployer MEMILIKI role KEMENTERIAN_ROLE`);
    } catch (e) {
        assert(false, `Gagal cek role: ${e.message}`);
    }

    // Test 0.3: Koneksi ke Supabase
    try {
        const { data, error } = await supabase.from("institutions").select("wallet").limit(1);
        assert(!error, `Supabase PostgreSQL terkoneksi (Tabel institutions ada)`);
    } catch (e) {
        assert(false, `Gagal koneksi Supabase: ${e.message}`);
    }

    // Test 0.4: Vercel API endpoint aktif
    try {
        const resp = await fetch(`${VERCEL_API}/api/campus/list`);
        assert(resp.ok, `Vercel API /api/campus/list merespon HTTP ${resp.status}`);
    } catch (e) {
        assert(false, `Vercel API tidak merespon: ${e.message}`);
    }

    // ============================================================
    // TAHAP 1: PENDAFTARAN KAMPUS (Role: Calon Admin Kampus)
    // ============================================================
    printHeader("TAHAP 1: PENDAFTARAN KAMPUS BARU");

    const campusName = "Universitas Simulasi E2E";
    const campusMeta = {
        wallet: campusAddress.toLowerCase(),
        name: campusName,
        shortName: "USE2E",
        sk: "SK-DIKTI-SIM-2026",
        akreditasi: "A (Unggul)",
        website: "https://simulasi-e2e.ac.id",
        email: "admin@simulasi-e2e.ac.id",
        address: "Jl. Testing No.1, Jakarta Pusat"
    };

    // Test 1.1: Mendaftarkan kampus ke Blockchain
    // Karena kampus baru tidak punya MATIC, Super Admin mendaftarkan atas namanya
    // menggunakan registerInstitutionDirectly TIDAK, karena itu langsung approve.
    // Kita pakai cara: Super Admin kirim sedikit MATIC ke kampus, lalu kampus daftar sendiri.
    // TAPI wallet random tidak punya MATIC.
    // Solusi realistis: Gunakan Super Admin wallet untuk memanggil applyForRegistration,
    // TAPI applyForRegistration memakai msg.sender sebagai wallet kampus.
    // Jadi kita harus mengirim MATIC ke wallet kampus dulu.
    // Untuk menghemat waktu, kita gunakan Super Admin sebagai "Kampus" juga 
    // (dengan nama baru) untuk test pendaftaran.
    // WAIT: Super Admin sudah punya role KEMENTERIAN, jadi institutions[superAdmin] mungkin sudah diset.
    // Mari kita cek status Super Admin terlebih dahulu.

    let useDirectRegistration = false;
    try {
        const instData = await superAdminContract.institutions(campusAddress);
        const status = Number(instData[1]);
        printResult("Status awal kampus baru di blockchain", `${status} (NotRegistered)`, "📋");

        if (status === 0 || status === 3) {
            // Kampus belum terdaftar atau sebelumnya ditolak — kita bisa daftarkan
            // Karena kampus wallet tidak punya MATIC, gunakan registerInstitutionDirectly
            // dari Super Admin (ini langsung Approved, tapi kita bisa test deactivate/reactivate nanti)
            useDirectRegistration = true;
        }
    } catch (e) {
        console.log("  ⚠️ Gagal cek status awal:", e.message);
    }

    if (useDirectRegistration) {
        try {
            console.log("  📝 Mendaftarkan kampus via registerInstitutionDirectly (Super Admin bayar gas)...");
            const tx = await superAdminContract.registerInstitutionDirectly(campusAddress, campusName);
            console.log(`  ⏳ Tx terkirim: ${tx.hash}`);
            const receipt = await tx.wait();
            assert(receipt.status === 1, `Blockchain Tx SUKSES (Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed})`);

            // Verifikasi status berubah jadi Approved (2)
            const instData = await superAdminContract.institutions(campusAddress);
            const newStatus = Number(instData[1]);
            assert(newStatus === 2, `Status kampus berubah ke Approved (${newStatus})`);
        } catch (e) {
            assert(false, `Gagal mendaftarkan kampus ke blockchain: ${e.message}`);
        }
    }

    // Test 1.2: Mendaftarkan metadata kampus ke Supabase via Vercel API
    try {
        console.log("  📝 Mengirim metadata kampus ke Vercel API /api/campus/apply...");
        const resp = await fetch(`${VERCEL_API}/api/campus/apply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(campusMeta)
        });
        const result = await resp.json();
        assert(resp.ok && result.success, `Vercel API menyimpan data ke Supabase (HTTP ${resp.status})`);
    } catch (e) {
        assert(false, `Gagal kirim metadata ke Vercel API: ${e.message}`);
    }

    // Test 1.3: Verifikasi data masuk ke Supabase
    try {
        const { data, error } = await supabase
            .from("institutions")
            .select("*")
            .eq("wallet", campusAddress.toLowerCase())
            .single();

        assert(!error && data, `Data kampus ditemukan di Supabase PostgreSQL`);
        if (data) {
            assert(data.name === campusName, `Nama kampus cocok: "${data.name}"`);
            assert(data.sk === "SK-DIKTI-SIM-2026", `Nomor SK cocok: "${data.sk}"`);
            assert(data.email === "admin@simulasi-e2e.ac.id", `Email cocok: "${data.email}"`);
        }
    } catch (e) {
        assert(false, `Gagal baca Supabase: ${e.message}`);
    }

    // ============================================================
    // TAHAP 2: CABUT IZIN & AKTIFKAN ULANG (Role: Super Admin)
    // ============================================================
    printHeader("TAHAP 2: CABUT IZIN & AKTIFKAN ULANG (Super Admin)");

    // Test 2.1: Deactivate institusi
    try {
        console.log("  🔒 Super Admin mencabut izin kampus (Deactivate)...");
        const tx = await superAdminContract.deactivateInstitution(campusAddress, "Uji Coba Pencabutan Izin");
        await tx.wait();

        const instData = await superAdminContract.institutions(campusAddress);
        const status = Number(instData[1]);
        assert(status === 4, `Status berubah ke Deactivated (${status})`);
    } catch (e) {
        assert(false, `Gagal deactivate: ${e.message}`);
    }

    // Test 2.2: Reactivate institusi
    try {
        console.log("  🔓 Super Admin mengaktifkan ulang kampus (Reactivate)...");
        const tx = await superAdminContract.reactivateInstitution(campusAddress);
        await tx.wait();

        const instData = await superAdminContract.institutions(campusAddress);
        const status = Number(instData[1]);
        assert(status === 2, `Status kembali ke Approved (${status})`);
    } catch (e) {
        assert(false, `Gagal reactivate: ${e.message}`);
    }

    // ============================================================
    // TAHAP 3: CETAK IJAZAH (Role: Admin Kampus)
    // ============================================================
    printHeader("TAHAP 3: CETAK HASH IJAZAH (Admin Kampus)");

    // Data mahasiswa fiktif
    const mahasiswa = {
        nama: "Budi Santoso",
        nim: "1234567890",
        jurusan: "Teknik Informatika",
        ipk: "3.85",
        tanggalLahir: "2026-03-08"
    };

    // Test 3.1: Generate Hash SHA-256 (Server-side simulation)
    const ijazahHash = generateSHA256(
        mahasiswa.nama, mahasiswa.nim, mahasiswa.jurusan, mahasiswa.ipk, mahasiswa.tanggalLahir
    );
    printResult("Hash SHA-256 mahasiswa", ijazahHash, "🔐");
    assert(ijazahHash.startsWith("0x") && ijazahHash.length === 66, `Hash format valid (${ijazahHash.length} karakter)`);

    // Test 3.2: Simpan hash ke Blockchain
    // Karena kampus wallet tidak punya MATIC, kita panggil storeHash dari Super Admin wallet
    // TAPI storeHash punya modifier onlyApprovedInstitution yang memeriksa msg.sender!
    // Super Admin BUKAN institusi approved (kecuali ia juga didaftarkan sebagai kampus).
    // Solusi: Kita kirim sedikit MATIC ke campusWallet, lalu panggil storeHash dari campusWallet.
    // Tapi campusWallet adalah random wallet...
    // ALTERNATIVE: Kita bisa mendaftarkan Super Admin juga sebagai kampus (registerInstitutionDirectly ke dirinya sendiri)
    // lalu panggil storeHash dari Super Admin.

    // Cek apakah Super Admin sudah terdaftar sebagai institusi
    let hashStorer = superAdminContract; // default
    try {
        const superInstData = await superAdminContract.institutions(superAdminWallet.address);
        const superStatus = Number(superInstData[1]);
        
        if (superStatus !== 2) {
            // Daftarkan Super Admin sebagai kampus agar bisa storeHash
            console.log("  📝 Mendaftarkan Super Admin sebagai kampus sementara untuk test storeHash...");
            const tx = await superAdminContract.registerInstitutionDirectly(
                superAdminWallet.address, "Kampus Admin Tester"
            );
            await tx.wait();
        }
    } catch (e) {
        console.log("  ⚠️ Super Admin sudah terdaftar, lanjut...");
    }

    try {
        console.log("  📤 Menyimpan hash ijazah ke blockchain...");
        const tx = await superAdminContract.storeHash(ijazahHash);
        console.log(`  ⏳ Tx terkirim: ${tx.hash}`);
        const receipt = await tx.wait();
        assert(receipt.status === 1, `Hash ijazah berhasil disimpan (Block: ${receipt.blockNumber})`);
    } catch (e) {
        if (e.message.includes("sudah tersimpan")) {
            console.log("  ℹ️ Hash sudah tersimpan sebelumnya (duplikat). Melanjutkan...");
            assert(true, "Hash sudah ada di blockchain (duplikat detection bekerja)");
        } else {
            assert(false, `Gagal storeHash: ${e.message}`);
        }
    }

    // ============================================================
    // TAHAP 4: VERIFIKASI KEASLIAN IJAZAH (Role: HRD / Publik)
    // ============================================================
    printHeader("TAHAP 4: VERIFIKASI IJAZAH (HRD / Publik)");

    // Test 4.1: Verifikasi hash ASLI (harus VALID)
    try {
        console.log("  🔍 HRD memverifikasi ijazah Budi Santoso (data ASLI)...");
        const [isValid, institutionName, publisher, isRevoked] = await superAdminContract.verifyHash(ijazahHash);
        
        printResult("isValid", isValid, isValid ? "✅" : "❌");
        printResult("Nama Penerbit", institutionName, "🏛️");
        printResult("Wallet Penerbit", publisher, "💼");
        printResult("Dicabut (Revoked)", isRevoked, isRevoked ? "⚠️" : "✅");
        
        assert(isValid === true, "Ijazah ASLI terverifikasi VALID");
        assert(isRevoked === false, "Ijazah TIDAK dalam status revoked");
        assert(institutionName.length > 0, `Nama institusi penerbit terdeteksi: "${institutionName}"`);
    } catch (e) {
        assert(false, `Gagal verifikasi hash asli: ${e.message}`);
    }

    // Test 4.2: Verifikasi hash PALSU (harus INVALID)
    try {
        console.log("  🔍 HRD memverifikasi ijazah PALSU (IPK dimanipulasi 3.85 → 3.90)...");
        const fakeHash = generateSHA256(
            "Budi Santoso", "1234567890", "Teknik Informatika", "3.90", "2026-03-08"
        );
        printResult("Hash Palsu", fakeHash, "🚨");

        const [isValid, institutionName, publisher, isRevoked] = await superAdminContract.verifyHash(fakeHash);
        
        assert(isValid === false, "Ijazah PALSU terdeteksi INVALID ✨");
        assert(publisher === "0x0000000000000000000000000000000000000000", "Publisher kosong (tidak ada penerbit)");
    } catch (e) {
        assert(false, `Gagal verifikasi hash palsu: ${e.message}`);
    }

    // Test 4.3: Verifikasi hash dengan nama typo (harus INVALID)
    try {
        console.log("  🔍 HRD memverifikasi ijazah dengan TYPO NAMA (Budi Santoso → Budi Santosa)...");
        const typoHash = generateSHA256(
            "Budi Santosa", "1234567890", "Teknik Informatika", "3.85", "2026-03-08"
        );

        const [isValid] = await superAdminContract.verifyHash(typoHash);
        assert(isValid === false, "Typo 1 huruf (o→a) langsung terdeteksi INVALID ✨");
    } catch (e) {
        assert(false, `Gagal verifikasi hash typo: ${e.message}`);
    }

    // ============================================================
    // TAHAP 5: VERIFIKASI VERCEL API ENDPOINTS
    // ============================================================
    printHeader("TAHAP 5: VERIFIKASI SEMUA API ENDPOINTS");

    // Test 5.1: GET /api/campus/list
    try {
        const resp = await fetch(`${VERCEL_API}/api/campus/list`);
        const data = await resp.json();
        assert(resp.ok && data.institutions, `GET /api/campus/list aktif (${data.institutions.length} kampus terdaftar)`);
    } catch (e) {
        assert(false, `API /api/campus/list gagal: ${e.message}`);
    }

    // Test 5.2: GET /api/campus/[wallet]
    try {
        const resp = await fetch(`${VERCEL_API}/api/campus/${campusAddress.toLowerCase()}`);
        const data = await resp.json();
        assert(resp.ok && data.institution, `GET /api/campus/[wallet] aktif dan mengembalikan data kampus`);
    } catch (e) {
        assert(false, `API /api/campus/[wallet] gagal: ${e.message}`);
    }

    // Test 5.3: POST /api/hash/generate
    try {
        const resp = await fetch(`${VERCEL_API}/api/hash/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nama: "Test User",
                nim: "999",
                jurusan: "Test",
                ipk: "4.00",
                tanggalLahir: "2026-01-01"
            })
        });
        const data = await resp.json();
        assert(resp.ok && data.hash, `POST /api/hash/generate aktif (Hash: ${data.hash?.substring(0, 16)}...)`);
    } catch (e) {
        assert(false, `API /api/hash/generate gagal: ${e.message}`);
    }

    // ============================================================
    // LAPORAN AKHIR
    // ============================================================
    printHeader("LAPORAN AKHIR SIMULASI");
    
    console.log(`  📊 Total Tes     : ${totalTests}`);
    console.log(`  ✅ Berhasil (PASS): ${passedTests}`);
    console.log(`  ❌ Gagal (FAIL)   : ${failedTests}`);
    console.log("");

    if (failedTests === 0) {
        console.log("  🏆🏆🏆 SEMPURNA! SEMUA TES LULUS 100%! 🏆🏆🏆");
        console.log("  Sistem CredBlock V3 berjalan TANPA CACAT di semua role.");
    } else {
        console.log(`  ⚠️ Ada ${failedTests} tes yang gagal. Perlu investigasi lebih lanjut.`);
    }

    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");

    // Cleanup: hapus data simulasi dari Supabase agar tidak mengotori database
    try {
        await supabase.from("institutions").delete().eq("wallet", campusAddress.toLowerCase());
        console.log("  🧹 Data simulasi dibersihkan dari Supabase.");
    } catch (e) {
        console.log("  ⚠️ Gagal membersihkan data simulasi:", e.message);
    }
}

// RUN!
runSimulation().catch(err => {
    console.error("💥 SIMULASI CRASH:", err);
    process.exit(1);
});
