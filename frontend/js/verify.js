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

const CONTRACT_ADDRESS = "0x6116D452af7a014576BD50aeFfce9586D040D57E"; // <--- Polygon Amoy Testnet

/**
 * ABI minimal — hanya fungsi yang dibutuhkan untuk verifikasi.
 * verifyHash adalah view function, artinya tidak mengubah state blockchain.
 */
const CONTRACT_ABI = [
    // Fungsi verifyHash (mengembalikan tuple 3 nilai: bool, string, address)
    "function verifyHash(bytes32 _hash) view returns (bool isValid, string memory institutionName, address publisher)"
];

// ============================================================
// VARIABEL GLOBAL
// ============================================================

let provider;   // Koneksi ke blockchain (read-only)
let contract;   // Instance smart contract
let institutionsDB = {}; // Database profil kampus (dari JSON off-chain)

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
 * Memuat profil kampus dari file JSON statis.
 */
async function loadInstitutionsDB() {
    try {
        const response = await fetch('data/institutions.json');
        institutionsDB = await response.json();
        console.log(`\u2705 Loaded ${Object.keys(institutionsDB).length} profil kampus`);
    } catch (err) {
        console.warn('\u26a0\ufe0f Gagal memuat institutions.json:', err);
        institutionsDB = {};
    }
}

async function connectBlockchain() {
    try {
        // Karena ini akan ditaruh di Vercel (Produksi)
        // Kita langsung konek ke Public RPC Polygon Amoy
        provider = new ethers.JsonRpcProvider("https://polygon-amoy-bor-rpc.publicnode.com");
        await provider.getBlockNumber(); // Test koneksi

        console.log("\u2705 Terhubung ke Jaringan Polygon Amoy (read-only)");

    } catch (localError) {
        console.log("\u26a0\ufe0f RPC down, mencoba fallback ke MetaMask...");

        if (typeof window.ethereum !== "undefined") {
            provider = new ethers.BrowserProvider(window.ethereum);
            console.log("\u2705 Terhubung via MetaMask (read-only fallbak)");
        } else {
            throw new Error("Tidak ada provider blockchain.");
        }
    }

    // Buat instance contract dengan PROVIDER (bukan signer)
    // Provider = read-only, cukup untuk memanggil view functions
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
    console.log("📝 Data string:", dataString);

    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);

    // Hash menggunakan SHA-256 (Web Crypto API)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Konversi ke hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    console.log("🔒 Hash SHA-256:", hashHex);
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

        if (isValid) {
            // \u2705 HASH DITEMUKAN \u2192 Ijazah VALID
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
                            <p class="text-sm font-bold text-gray-900">${profile.name}</p>
                            <p class="text-xs text-gray-600">${profile.address}</p>
                            <div class="flex flex-wrap gap-2 mt-1">
                                <span class="text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">${profile.accreditation}</span>
                            </div>
                            <div class="flex items-center gap-4 text-[11px] text-gray-500 mt-2">
                                <a href="${profile.website}" target="_blank" class="text-primary-500 hover:underline">${profile.website}</a>
                                <span>${profile.email}</span>
                            </div>
                            <p class="text-[10px] text-gray-400 font-mono mt-1">Wallet: ${publisher}</p>
                        </div>
                    </div>
                `;
            } else {
                profileHtml = `
                    <div class="mt-3">
                        <span class="text-xs text-green-700 bg-green-100 px-2 py-1 rounded inline-block mb-1">Diterbitkan Oleh:</span><br>
                        <strong>${campusName}</strong><br>
                        <span class="text-[10px] text-gray-500 font-mono">${publisher}</span>
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
