/**
 * verify.js — Logic untuk Portal Verifikasi HRD (verify.html)
 * 
 * FUNGSI UTAMA:
 * 1. Menghubungkan ke jaringan blockchain (read-only, tidak perlu signer).
 * 2. Menerima input data dari dokumen ijazah fisik/PDF.
 * 3. Menghasilkan hash SHA-256 dari data yang diinput.
 * 4. Mengecek apakah hash tersebut ada di smart contract.
 * 5. Menampilkan hasil: VALID atau TIDAK DITEMUKAN.
 * 
 * PERBEDAAN DENGAN app.js:
 * → verify.js hanya MEMBACA data (view function), tidak MENULIS.
 * → Tidak memerlukan gas fee (gratis).
 * → Tidak perlu signer / akun admin.
 * 
 * LIBRARY: Ethers.js v6 (dimuat via CDN di verify.html)
 */

// ============================================================
// KONFIGURASI
// ============================================================

const CONTRACT_ADDRESS = "0x830c4Eb9669adF6DeA3c1AeE702AB4f77a865d27"; // CredBlock V3 (UUPS Proxy) - Polygon Amoy

/**
 * ABI minimal — hanya fungsi yang dibutuhkan untuk verifikasi.
 * V3: verifyHash sekarang mengembalikan 4 nilai (termasuk isRevoked).
 */
const CONTRACT_ABI = [
    "function verifyHash(bytes32 _hash) view returns (bool isValid, string memory institutionName, address publisher, bool isRevoked)"
];

// ============================================================
// VARIABEL GLOBAL
// ============================================================

let provider;   // Koneksi ke blockchain (read-only)
let contract;   // Instance smart contract
let institutionsDB = {}; // Database profil kampus (dari Backend API / SQLite)
const BACKEND_URL = "http://localhost:3001"; // Backend API Server

// [SECURITY] RPC Failover URLs
const RPC_URLS = [
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://rpc-amoy.polygon.technology/",
    "https://polygon-amoy.drpc.org"
];

/**
 * [SECURITY] Sanitasi string sebelum inject ke innerHTML untuk mencegah XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// FUNGSI INISIALISASI
// ============================================================

/**
 * Menghubungkan frontend ke jaringan blockchain (mode read-only).
 * 
 * PERBEDAAN DENGAN connectBlockchain() di app.js:
 * → Disini kita TIDAK perlu signer karena verifyHash() adalah view function.
 * → View function tidak mengubah state blockchain = gratis, tidak perlu gas.
 * → Cukup pakai provider (read-only) tanpa signer.
 */
/**
 * [V3] Memuat profil kampus dari Backend API, fallback ke JSON statis.
 */
async function loadInstitutionsDB() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/campus/list`);
        const data = await response.json();
        if (data.institutions && data.institutions.length > 0) {
            data.institutions.forEach(inst => {
                institutionsDB[inst.wallet] = {
                    name: inst.name,
                    shortName: inst.short_name,
                    address: inst.address,
                    accreditation: inst.akreditasi,
                    website: inst.website,
                    email: inst.email
                };
            });
            console.log(`\u2705 Loaded ${data.institutions.length} profil kampus dari Backend API`);
            return;
        }
    } catch (err) {
        console.warn('\u26a0\ufe0f Backend API tidak tersedia, fallback ke JSON statis');
    }

    try {
        const response = await fetch('data/institutions.json');
        institutionsDB = await response.json();
        console.log(`\u2705 Loaded ${Object.keys(institutionsDB).length} profil kampus dari JSON`);
    } catch (err) {
        console.warn('\u26a0\ufe0f Gagal memuat institutions.json:', err);
        institutionsDB = {};
    }
}

async function connectBlockchain() {
    try {
        // [SECURITY FIX] RPC failover — coba beberapa endpoint
        for (const url of RPC_URLS) {
            try {
                provider = new ethers.JsonRpcProvider(url);
                await provider.getBlockNumber(); // Test koneksi
                break;
            } catch (e) {
                console.warn("RPC gagal, mencoba berikutnya...");
                provider = null;
            }
        }

        if (!provider) {
            // Fallback ke MetaMask jika semua RPC gagal
            if (typeof window.ethereum !== "undefined") {
                provider = new ethers.BrowserProvider(window.ethereum);
            } else {
                throw new Error("Tidak ada provider blockchain.");
            }
        }
    } catch (err) {
        throw err;
    }

    // Buat instance contract dengan PROVIDER (bukan signer)
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    // Load profil kampus dari JSON
    await loadInstitutionsDB();

    // Update UI
    updateConnectionStatus(true);
    updateNetworkInfo();
}

// ============================================================
// FUNGSI HASHING (SAMA PERSIS DENGAN app.js)
// ============================================================

/**
 * Menghasilkan hash SHA-256 dari data mahasiswa.
 * 
 * PENTING: Fungsi ini HARUS menghasilkan hash yang IDENTIK
 * dengan fungsi generateHash() di app.js!
 * 
 * Jika format (urutan field, separator, dll) berbeda,
 * hash yang dihasilkan akan berbeda → verifikasi selalu gagal.
 * 
 * @param {string} nama - Nama lengkap mahasiswa
 * @param {string} nim - Nomor Induk Mahasiswa
 * @param {string} jurusan - Program studi
 * @param {string} ipk - Indeks Prestasi Kumulatif
 * @param {string} tanggalLahir - Tanggal lahir (format: YYYY-MM-DD)
 * @returns {string} Hash dalam format hex (0x...)
 */
async function generateHash(nama, nim, jurusan, ipk, tanggalLahir) {
    // Format HARUS sama: "nama|nim|jurusan|ipk|tanggalLahir"
    const dataString = `${nama}|${nim}|${jurusan}|${ipk}|${tanggalLahir}`;
    // [SECURITY FIX] Hapus console.log data mahasiswa (PII protection)

    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);

    // Hash menggunakan SHA-256 (Web Crypto API)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Konversi ke hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // [SECURITY FIX] Jangan log hash ke console di production
    return hashHex;
}

// ============================================================
// FUNGSI VERIFIKASI
// ============================================================

/**
 * Event handler untuk form verifikasi.
 * 
 * ALUR:
 * 1. Ambil data dari form (yang diinput HRD dari ijazah fisik/PDF).
 * 2. Generate hash SHA-256 dari data tersebut.
 * 3. Panggil verifyHash() di smart contract.
 * 4. Jika return true  → Ijazah VALID (hash ditemukan di blockchain).
 *    Jika return false → TIDAK DITEMUKAN (kemungkinan palsu/salah input).
 */
document.getElementById("verifyForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!contract) {
        alert("Belum terhubung ke blockchain! Refresh halaman dan coba lagi.");
        return;
    }

    const nama = document.getElementById("nama").value.trim();
    const nim = document.getElementById("nim").value.trim();
    const jurusan = document.getElementById("jurusan").value.trim();
    const ipk = document.getElementById("ipk").value.trim();
    const tanggalLahir = document.getElementById("tanggalLahir").value;

    if (!nama || !nim || !jurusan || !ipk || !tanggalLahir) {
        alert("Harap isi semua field!");
        return;
    }

    // Disable tombol saat proses berjalan
    const btnVerify = document.getElementById("btnVerify");
    btnVerify.disabled = true;

    // Tampilkan loading
    showResult("loading", "Memverifikasi di blockchain...");

    try {
        // Generate hash dari data yang diinput HRD
        const hash = await generateHash(nama, nim, jurusan, ipk, tanggalLahir);

        // Panggil smart contract untuk cek apakah hash ada
        // verifyHash() mengembalikan Array/Tuple: [isValid, campusName, publisher]
        const result = await contract.verifyHash(hash);
        const isValid = result[0];
        const campusName = result[1];
        const publisher = result[2];
        const isRevoked = result[3];

        if (isRevoked) {
            // ⛔ HASH DITEMUKAN TAPI SUDAH DICABUT/DIANULIR
            const profile = institutionsDB[publisher] || null;
            let revokedProfileHtml = '';
            if (profile) {
                revokedProfileHtml = `
                    <div class="mt-3">
                        <span class="text-xs text-red-700 bg-red-100 px-2 py-1 rounded inline-block mb-1">Awalnya Diterbitkan Oleh:</span><br>
                        <strong>${escapeHtml(profile.name)}</strong><br>
                        <span class="text-[10px] text-gray-500 font-mono">${escapeHtml(publisher)}</span>
                    </div>
                `;
            } else {
                revokedProfileHtml = `
                    <div class="mt-3">
                        <span class="text-xs text-red-700 bg-red-100 px-2 py-1 rounded inline-block mb-1">Awalnya Diterbitkan Oleh:</span><br>
                        <strong>${escapeHtml(campusName)}</strong><br>
                        <span class="text-[10px] text-gray-500 font-mono">${escapeHtml(publisher)}</span>
                    </div>
                `;
            }
            showResult("invalid", `Sertifikat ini telah <strong>DICABUT / DIANULIR</strong> oleh penerbit atau Kementerian. Dokumen ini <strong>TIDAK LAGI SAH</strong>.${revokedProfileHtml}`, hash);
        } else if (isValid) {
            // ✅ HASH DITEMUKAN → Ijazah VALID
            // Cari profil lengkap dari JSON off-chain berdasarkan publisher address
            const profile = institutionsDB[publisher] || null;

            let profileHtml = '';
            if (profile) {
                profileHtml = `
                    <div class="mt-4 pt-4 border-t border-green-200">
                        <div class="bg-white rounded-lg border border-green-100 p-4 space-y-2">
                            <div class="flex items-center gap-2 mb-2">
                                <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span class="text-xs font-bold text-green-800">Profil Penerbit Terverifikasi</span>
                            </div>
                            <p class="text-sm font-bold text-gray-900">${escapeHtml(profile.name)}</p>
                            <p class="text-xs text-gray-600">${escapeHtml(profile.address)}</p>
                            <div class="flex flex-wrap gap-2 mt-1">
                                <span class="text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">${escapeHtml(profile.accreditation)}</span>
                            </div>
                            <div class="flex items-center gap-4 text-[11px] text-gray-500 mt-2">
                                <a href="${escapeHtml(profile.website)}" target="_blank" class="text-primary-500 hover:underline">${escapeHtml(profile.website)}</a>
                                <span>${escapeHtml(profile.email)}</span>
                            </div>
                            <p class="text-[10px] text-gray-400 font-mono mt-1">Wallet: ${publisher}</p>
                        </div>
                    </div>
                `;
            } else {
                profileHtml = `
                    <div class="mt-3">
                        <span class="text-xs text-green-700 bg-green-100 px-2 py-1 rounded inline-block mb-1">Diterbitkan Oleh:</span><br>
                        <strong>${escapeHtml(campusName)}</strong><br>
                        <span class="text-[10px] text-gray-500 font-mono">${escapeHtml(publisher)}</span>
                    </div>
                `;
            }

            const validationMsg = `Ijazah <strong>TERVERIFIKASI</strong> dan terdaftar di blockchain.${profileHtml}`;
            showResult("valid", validationMsg, hash);
        } else {
            // ❌ HASH TIDAK DITEMUKAN → Kemungkinan palsu atau salah input
            showResult("invalid", `Data <strong>TIDAK DITEMUKAN</strong> di blockchain. Dokumen kemungkinan tidak asli atau data yang diinput tidak sesuai.`, hash);
        }

    } catch (error) {
        console.error("❌ Error verifikasi:", error);
        showResult("error", "Terjadi kesalahan saat memverifikasi. Pastikan koneksi blockchain aktif.");
    }

    btnVerify.disabled = false;
});

// ============================================================
// FUNGSI UI HELPER
// ============================================================

/**
 * Menampilkan hasil verifikasi di bawah form.
 * @param {string} type - "loading" | "valid" | "invalid" | "error"
 * @param {string} message - Pesan yang ditampilkan
 * @param {string} hash - Hash SHA-256 (opsional, untuk ditampilkan)
 */
function showResult(type, message, hash = null) {
    const resultSection = document.getElementById("resultSection");
    resultSection.classList.remove("hidden");

    const configs = {
        loading: {
            bgColor: "bg-blue-50 border-blue-200",
            icon: `<div class="spinner"></div>`,
            textColor: "text-blue-700"
        },
        valid: {
            bgColor: "bg-green-50 border-green-200",
            icon: `<svg class="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                   </svg>`,
            textColor: "text-green-700",
            label: "✅ VALID",
            labelColor: "text-green-600"
        },
        invalid: {
            bgColor: "bg-red-50 border-red-200",
            icon: `<svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                   </svg>`,
            textColor: "text-red-700",
            label: "❌ TIDAK DITEMUKAN",
            labelColor: "text-red-600"
        },
        error: {
            bgColor: "bg-gray-50 border-gray-200",
            icon: `<svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                   </svg>`,
            textColor: "text-gray-600"
        }
    };

    const config = configs[type];

    let hashSection = "";
    if (hash) {
        hashSection = `
            <div class="mt-4 pt-4 border-t ${type === 'valid' ? 'border-green-200' : 'border-red-200'}">
                <p class="text-xs text-gray-500 mb-1">Hash SHA-256:</p>
                <code class="text-xs font-mono text-gray-600 break-all">${hash}</code>
            </div>
        `;
    }

    resultSection.innerHTML = `
        <div class="rounded-xl border ${config.bgColor} p-6 fade-in-up">
            <div class="flex items-start gap-4">
                <div class="flex-shrink-0">${config.icon}</div>
                <div>
                    ${config.label ? `<h4 class="text-lg font-bold ${config.labelColor} mb-1">${config.label}</h4>` : ""}
                    <p class="text-sm ${config.textColor} leading-relaxed">${message}</p>
                    ${hashSection}
                </div>
            </div>
        </div>
    `;
}

/**
 * Mengupdate status koneksi di navbar.
 */
function updateConnectionStatus(isConnected) {
    const statusEl = document.getElementById("connectionStatus");
    if (isConnected) {
        statusEl.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-green-500 pulse-dot"></span>
            <span class="text-green-700">Terhubung</span>
        `;
        statusEl.className = "flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-xs font-medium";
    }
}

/**
 * Mengupdate informasi jaringan di panel samping.
 */
async function updateNetworkInfo() {
    try {
        const network = await provider.getNetwork();
        const networkName = network.chainId === 31337n ? "Hardhat Local" : network.name;

        document.getElementById("networkName").textContent = networkName;
        document.getElementById("contractAddr").textContent = CONTRACT_ADDRESS.slice(0, 8) + "..." + CONTRACT_ADDRESS.slice(-6);
        document.getElementById("contractAddr").title = CONTRACT_ADDRESS;
    } catch (error) {
        console.error("Gagal mengambil info jaringan:", error);
    }
}

// ============================================================
// INISIALISASI
// ============================================================

window.addEventListener("load", async function () {
    try {
        await connectBlockchain();
    } catch (error) {
        console.error("❌ Gagal terhubung:", error.message);
        showResult("error", "Gagal terhubung ke blockchain. Pastikan Hardhat node berjalan (npx hardhat node) atau MetaMask terinstall.");
    }
});
