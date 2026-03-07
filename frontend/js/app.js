/**
 * app.js — Logic untuk Dashboard Admin Kampus (index.html)
 * 
 * FUNGSI UTAMA:
 * 1. Menghubungkan ke jaringan blockchain (lokal Hardhat / MetaMask).
 * 2. Menerima input data mahasiswa dari form.
 * 3. Menghasilkan hash SHA-256 dari data mahasiswa.
 * 4. Mengirim hash ke smart contract CredBlock untuk disimpan di blockchain.
 * 
 * LIBRARY: Ethers.js v6 (dimuat via CDN di index.html)
 */

// ============================================================
// KONFIGURASI
// ============================================================

const CONTRACT_ADDRESS = "0x1d05E0d9B7b691cc45bE37185ADB117Dc671B8a3"; // <--- CredBlock - Polygon Amoy

/**
 * ABI (Application Binary Interface) dari smart contract CredBlock.
 * 
 * ABI adalah "kontrak" antara frontend dan smart contract.
 * Frontend perlu tahu fungsi apa saja yang tersedia di smart contract
 * dan parameter apa yang dibutuhkan.
 * 
 * KENAPA hanya 3 item?
 * → Kita hanya butuh fungsi yang akan dipanggil dari frontend.
 *   Tidak perlu menyertakan seluruh ABI dari compiler output.
 */
const CONTRACT_ABI = [
    // Info status & nama (Struct)
    "function institutions(address) view returns (string name, uint8 status)",
    // Alamat admin (Kementerian)
    "function admin() view returns (address)",
    // Fungsi penyimpanan & verifikasi
    "function storeHash(bytes32 _hash)",
    "function storeMultipleHashes(bytes32[] calldata _hashes)",
    "function verifyHash(bytes32 _hash) view returns (bool isValid, string memory institutionName, address publisher)",
    // Fungsi untuk Dashboard Kementerian
    "function getAllApplicants() view returns (address[])",
    "function approveInstitution(address _wallet)",
    "function rejectInstitution(address _wallet)",
    // Event
    "event HashStored(bytes32 indexed hash, address indexed publisher, uint256 timestamp)"
];

// ============================================================
// VARIABEL GLOBAL
// ============================================================

let provider;   // Object untuk berkomunikasi dengan jaringan blockchain
let signer;     // Object yang merepresentasikan akun pengguna (admin)
let contract;   // Instance smart contract yang bisa dipanggil dari JS
let institutionsDB = {}; // Database profil kampus (dari JSON off-chain)
let isConnecting = false; // Guard agar koneksi tidak dipanggil berulang kali

// [SECURITY] RPC Failover URLs
const RPC_URLS = [
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://rpc-amoy.polygon.technology/",
    "https://polygon-amoy.drpc.org"
];

/**
 * [SECURITY] Sanitasi string sebelum inject ke innerHTML untuk mencegah XSS.
 * Mengubah karakter berbahaya menjadi HTML entities.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * [SECURITY] Mendapatkan provider RPC yang berfungsi dengan failover.
 */
async function getWorkingProvider() {
    for (const url of RPC_URLS) {
        try {
            const p = new ethers.JsonRpcProvider(url);
            await p.getBlockNumber();
            return p;
        } catch (e) {
            console.warn("RPC gagal, mencoba berikutnya...");
        }
    }
    throw new Error("Semua RPC endpoint gagal. Coba lagi nanti.");
}

// ============================================================
// FUNGSI INISIALISASI & KONEKSI (ACCOUNT ABSTRACTION)
// ============================================================

/**
 * Menghubungkan frontend ke jaringan blockchain menggunakan Smart Wallet / Local Wallet.
 * Jika pengguna login via Google, wallet tersimpan di localStorage.
 */
async function loadInstitutionsDB() {
    try {
        const response = await fetch('data/institutions.json');
        institutionsDB = await response.json();
        console.log(`\u2705 Loaded ${Object.keys(institutionsDB).length} profil kampus dari database`);
    } catch (err) {
        console.warn('\u26a0\ufe0f Gagal memuat institutions.json:', err);
        institutionsDB = {};
    }
}

async function connectBlockchain(method = 'auto') {
    // Guard: cegah double-click / race condition
    if (isConnecting) {
        console.warn("⏳ connectBlockchain sudah sedang berjalan, skip.");
        return;
    }
    isConnecting = true;

    let userAddress;

    if (method === 'metamask' || (method === 'auto' && window.ethereum && localStorage.getItem('credblock_login_method') === 'metamask')) {
        // --- JALUR METAMASK ---
        if (typeof window.ethereum === "undefined") {
            if (method === 'metamask') {
                alert("Web3 Wallet tidak terdeteksi! Pastikan ekstensi dompet kripto (seperti MetaMask) sudah terinstall dan aktif di browser Anda.\n\nJika sudah install, coba refresh halaman.");
                updateTxStatus("error", "Wallet tidak terdeteksi di browser ini.");
            }
            // Tampilkan overlay login karena tidak ada wallet
            document.getElementById("loginOverlay").classList.remove("hidden");
            return;
        }

        try {
            updateTxStatus("pending", "Menghubungkan ke jaringan MetaMask...");

            // Timeout wrapper: jika MetaMask tidak merespons dalam 15 detik, batalkan
            const requestWithTimeout = (ms) => {
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        reject(new Error("MetaMask tidak merespons. Pastikan ekstensi MetaMask sudah unlock (masukkan password)."));
                    }, ms);
                    window.ethereum.request({ method: 'eth_requestAccounts' })
                        .then(result => { clearTimeout(timer); resolve(result); })
                        .catch(err => { clearTimeout(timer); reject(err); });
                });
            };

            // Minta akses wallet (dengan timeout 15 detik)
            const accounts = await requestWithTimeout(15000);
            if (!accounts || accounts.length === 0) {
                throw new Error("Tidak ada akun MetaMask yang dipilih.");
            }

            // --- AUTO SWITCH CHAIN KE POLYGON AMOY (Chain ID: 80002 / 0x13882) ---
            const targetChainId = '0x13882';
            const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

            if (currentChainId !== targetChainId) {
                try {
                    updateTxStatus("pending", "Beralih ke Polygon Amoy Testnet...");
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: targetChainId }],
                    });
                } catch (switchError) {
                    // Jika jaringan belum ditambahkan ke MetaMask (Error 4902)
                    if (switchError.code === 4902) {
                        try {
                            updateTxStatus("pending", "Menambahkan jaringan Polygon Amoy...");
                            await window.ethereum.request({
                                method: 'wallet_addEthereumChain',
                                params: [
                                    {
                                        chainId: targetChainId,
                                        chainName: 'Polygon Amoy Testnet',
                                        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                                        rpcUrls: ['https://rpc-amoy.polygon.technology/'],
                                        blockExplorerUrls: ['https://amoy.polygonscan.com/']
                                    }
                                ]
                            });
                        } catch (addError) {
                            throw new Error("Gagal menambahkan Polygon Amoy ke MetaMask.");
                        }
                    } else {
                        // Jangan throw error jika sekedar batal ganti jaringan, biarkan user tetap connect tapi beda jaringan (nanti error saat transaksi)
                        console.warn("User menolak ganti jaringan ke Amoy, tapi wallet tetap terkoneksi.");
                        updateTxStatus("pending", "Peringatan: Anda tidak berada di jaringan Amoy!");
                    }
                }
            }

            // Gunakan BrowserProvider dari Ethers v6
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();

            // Simpan preferensi login agar auto-reconnect
            localStorage.setItem('credblock_login_method', 'metamask');
            console.log("✅ Terhubung via MetaMask:", userAddress);

            // Dengarkan perubahan akun
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) window.location.reload();
                else {
                    localStorage.removeItem('credblock_login_method');
                    window.location.reload();
                }
            });
            // Dengarkan perubahan chain
            window.ethereum.on('chainChanged', (chainId) => {
                console.log("Chain changed to:", chainId);
                window.location.reload();
            });

        } catch (error) {
            console.error("❌ Batal / Gagal terkoneksi MetaMask:", error);
            // Hapus sesi lama agar tidak auto-reconnect loop
            localStorage.removeItem('credblock_login_method');
            if (method === 'metamask') {
                updateTxStatus("error", "Koneksi MetaMask dibatalkan atau gagal. Pastikan MetaMask sudah unlock dan coba lagi.");
            }
            // Tampilkan overlay login
            document.getElementById("loginOverlay").classList.remove("hidden");
            // Harus melempar throw / mengembalikan Promise reject agar akhirnya lompat ke finally, kita gunakan isConnecting reset langsung di try
            return;
        }

    } else {
        // Belum login apapun → tampilkan overlay login
        document.getElementById("loginOverlay").classList.remove("hidden");
        isConnecting = false;
        return;
    }

    // --- BAGIAN UMUM (Berlaku untuk MetaMask & Google) ---
    document.getElementById("loginOverlay").classList.add("hidden");

    try {
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        updateConnectionStatus(true);
        updateNetworkInfo();
        await loadInstitutionsDB();

        try {
            const superAdminAddress = await contract.admin();
            const isSuperAdmin = (userAddress.toLowerCase() === superAdminAddress.toLowerCase());

            const navInstEl = document.getElementById("navInstitutionName");
            const bannerEl = document.getElementById("bannerNotRegistered");
            const profileCardEl = document.getElementById("institutionProfileCard");
            const dashInstitusi = document.getElementById("dashboardInstitusi");
            const dashKementerian = document.getElementById("dashboardKementerian");

            if (isSuperAdmin) {
                // ROLE 1: KEMENTERIAN PENDIDIKAN
                if (navInstEl) navInstEl.textContent = "Super Admin (Kementerian)";
                if (bannerEl) bannerEl.classList.add("hidden");
                if (profileCardEl) profileCardEl.classList.add("hidden");

                // Tampilkan Dashboard Super Admin, sembunyikan Dashboard Normal
                if (dashInstitusi) dashInstitusi.classList.add("hidden");
                if (dashKementerian) dashKementerian.classList.remove("hidden");

                updateTxStatus("success", `Login berhasil sebagai Kementerian Pusat.`);

                // Load antrian kampus
                loadKementerianDashboard();

            } else {
                // ROLE 2: KAMPUS NORMAL
                if (dashKementerian) dashKementerian.classList.add("hidden");

                const instData = await contract.institutions(userAddress);
                const instName = instData[0];
                const instStatus = Number(instData[1]); // Enum (0=NotReg, 1=Pending, 2=Approved, 3=Rejected)

                if (instStatus === 2) { // Approved
                    const profile = institutionsDB[userAddress] || null;
                    if (navInstEl) navInstEl.textContent = profile ? profile.shortName : instName;
                    if (bannerEl) bannerEl.classList.add("hidden");
                    if (dashInstitusi) dashInstitusi.classList.remove("hidden");

                    if (profileCardEl && profile) {
                        profileCardEl.classList.remove("hidden");
                        document.getElementById("profileCampusName").textContent = profile.name;
                        document.getElementById("profileCampusAddr").textContent = profile.address;
                        document.getElementById("profileCampusAccred").textContent = profile.accreditation;
                        document.getElementById("profileCampusWeb").textContent = profile.website;
                        document.getElementById("profileCampusWeb").href = profile.website;
                        document.getElementById("profileCampusEmail").textContent = profile.email;
                    }
                    updateTxStatus("success", `Login berhasil. Identitas: ${instName}`);
                } else {
                    // Pending, Rejected, NotReg
                    if (navInstEl) navInstEl.textContent = "⚠️ Akses Dibatasi";
                    if (bannerEl) bannerEl.classList.remove("hidden");
                    if (profileCardEl) profileCardEl.classList.add("hidden");
                    if (dashInstitusi) dashInstitusi.classList.add("hidden");

                    let msg = "Wallet gagal memuat data.";
                    if (instStatus === 0) msg = "Wallet belum didaftarkan sebagai institusi.";
                    if (instStatus === 1) msg = "Pendaftaran Institusi Anda masih PENDING dan menunggu persetujuan Kementerian.";
                    if (instStatus === 3) msg = "Pendaftaran Institusi Anda telah ditolak Kementerian.";

                    updateTxStatus("error", msg);

                    if (instStatus === 0 || instStatus === 3) {
                        // Beri tombol pendaftaran di banner
                        if (bannerEl) {
                            // [SECURITY FIX] Gunakan DOM API untuk menghindari innerHTML injection
                            const linkDiv = document.createElement('div');
                            linkDiv.className = 'ml-auto';
                            const link = document.createElement('a');
                            link.href = 'register.html';
                            link.className = 'px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition';
                            link.textContent = 'Daftar Sekarang';
                            linkDiv.appendChild(link);
                            bannerEl.appendChild(linkDiv);
                        }
                    }
                } // end else instStatus !== 2
            } // end else isSuperAdmin
        } catch (e) {
            console.error("❌ Gagal memuat atau membaca profil kontrak onchain:", e);
            if (typeof updateTxStatus === "function") {
                updateTxStatus("error", "Gagal memverifikasi status kampus di blockchain.");
            }
        }
    // Ini menutup try terluar (baris 119)
    } catch (e) {
        console.error("❌ Gagal jalankan DApp:", e);
        if (typeof updateTxStatus === "function") {
            updateTxStatus("error", "Koneksi ke DApp gagal akibat masalah Wallet Provider atau RPC.");
        }
    } finally {
        isConnecting = false;
    }
}

// ============================================================
// DASHBOARD KEMENTERIAN / SUPER ADMIN LOGIC
// ============================================================
async function loadKementerianDashboard() {
    try {
        const tableBody = document.getElementById("approvalTableBody");
        if (!tableBody) return;

        const applicants = await contract.getAllApplicants();
        if (applicants.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">Belum ada pengajuan kampus saat ini.</td></tr>`;
            return;
        }

        let html = '';
        let pendingCount = 0;
        let approvedCount = 0;

        // Ambil pending DB dari simulasi B2B lokal
        const localDB = JSON.parse(localStorage.getItem('credblock_pending_db') || "{}");

        for (let i = 0; i < applicants.length; i++) {
            const wallet = applicants[i];
            const data = await contract.institutions(wallet);
            const statusInt = Number(data[1]);
            const onchainName = data[0];

            let badgeHtml = '';
            let isActionable = false;

            if (statusInt === 1) { // Pending
                badgeHtml = '<span class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-yellow-700 bg-yellow-100 rounded-full">Antrean (Pending)</span>';
                isActionable = true;
                pendingCount++;
            } else if (statusInt === 2) { // Approved
                badgeHtml = '<span class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-100 rounded-full">Terdaftar (Approved)</span>';
                approvedCount++;
            } else if (statusInt === 3) { // Rejected
                badgeHtml = '<span class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 rounded-full">Ditolak</span>';
            }

            // Gabungkan metadata detail dari JSON (institutionsDB) atau pending lokal (localDB)
            let detailData = localDB[wallet] || institutionsDB[wallet] || {};
            // [SECURITY FIX] Escape semua data yang masuk ke innerHTML untuk mencegah XSS
            let theName = escapeHtml(detailData.name || onchainName || "Institusi Anonim");
            let webEmail = '<span class="text-xs text-gray-400">Data legalitas offchain tidak ditemukan</span>';

            if (detailData.sk) {
                webEmail = `<div class="text-[11px] text-gray-500 mt-1 flex gap-2"><span>SK: ${escapeHtml(detailData.sk)}</span> &bull; <span>${escapeHtml(detailData.akreditasi || '-')}</span></div>`;
            }

            // [SECURITY FIX] Ganti inline onclick dengan data-attributes (event delegation)
            html += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4">
                    <p class="font-medium text-gray-900">${theName}</p>
                    ${webEmail}
                </td>
                <td class="px-6 py-4">
                    <span class="font-mono text-[11px] text-gray-600 bg-gray-100 px-2 py-1 rounded truncate max-w-[120px] block" title="${escapeHtml(wallet)}">${wallet.slice(0, 8)}...${wallet.slice(-6)}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    ${badgeHtml}
                </td>
                <td class="px-6 py-4 text-right">
                    ${isActionable ? `
                        <button data-action="approve" data-wallet="${escapeHtml(wallet)}" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded shadow-sm transition active:scale-95 ml-1">Approve</button>
                        <button data-action="reject" data-wallet="${escapeHtml(wallet)}" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded shadow-sm transition active:scale-95 ml-1">Tolak</button>
                    ` : `
                        <span class="text-[11px] text-gray-400 font-medium">Selesai</span>
                    `}
                </td>
            </tr>`;
        }

        tableBody.innerHTML = html;

        // [SECURITY FIX] Event delegation untuk tombol Approve/Reject
        tableBody.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const wallet = btn.dataset.wallet;
            if (btn.dataset.action === 'approve') actionApprove(wallet);
            if (btn.dataset.action === 'reject') actionReject(wallet);
        });

        if (document.getElementById("statPending")) document.getElementById("statPending").textContent = pendingCount;
        if (document.getElementById("statApproved")) document.getElementById("statApproved").textContent = approvedCount;

    } catch (e) {
        console.error("Gagal load antrian kementerian", e);
    }
}

// Fungsi Approval dipanggil dari UI Tabel
window.actionApprove = async function (wallet) {
    if (!confirm('Yakin ingin menerima institusi ini mengakses CredBlock?')) return;
    try {
        updateTxStatus('pending', 'Mengirim transaksi persetujuan...');
        const tx = await contract.approveInstitution(wallet);

        updateTxStatus('pending', 'Menunggu konfirmasi blockchain...');
        await tx.wait();

        updateTxStatus('success', 'Institusi berhasil diapprove!');
        // Pindahkan data JSON dr Antrian ke Data Resmi (Simulasi)
        let localDB = JSON.parse(localStorage.getItem('credblock_pending_db') || "{}");
        if (localDB[wallet]) {
            institutionsDB[wallet] = localDB[wallet];
            institutionsDB[wallet].verified = true;
            delete localDB[wallet];
            localStorage.setItem('credblock_pending_db', JSON.stringify(localDB));
        }

        loadKementerianDashboard(); // reload table
    } catch (e) {
        console.error("Approve error:", e);
        updateTxStatus('error', 'Gagal memproses approval.');
    }
};

window.actionReject = async function (wallet) {
    if (!confirm('Yakin ingin menolak pendaftaran institusi ini?')) return;
    try {
        updateTxStatus('pending', 'Memprose penolakan (Reject)...');
        const tx = await contract.rejectInstitution(wallet);
        await tx.wait();

        updateTxStatus('success', 'Aplikasi berhasil ditolak.');
        loadKementerianDashboard();
    } catch (e) {
        updateTxStatus('error', 'Gagal memproses penolakan.');
    }
};

// ============================================================
// EVENT LISTENER: GOOGLE LOGIN (SIMULASI)
// NOTE: Event listener UTAMA untuk Google dan MetaMask ada di DOMContentLoaded di bawah.
//       Blok ini DIHAPUS untuk menghindari duplikat listener.
// ============================================================

// ============================================================
// FUNGSI HASHING
// ============================================================

/**
 * Menghasilkan hash SHA-256 dari data mahasiswa.
 * 
 * ALUR:
 * 1. Gabungkan semua data menjadi satu string dengan separator "|"
 *    Contoh: "Ahmad Fauzan|2024110001|Sistem Informasi|3.85|2000-05-15"
 * 2. Encode string menjadi bytes (UTF-8)
 * 3. Hash menggunakan SHA-256 (Web Crypto API bawaan browser)
 * 4. Konversi hasil hash ke format hex string (0x...)
 * 
 * KENAPA SHA-256?
 * → Standar kriptografi yang aman dan widely-used.
 * → Menghasilkan output 256-bit (32 bytes) = cocok dengan bytes32 di Solidity.
 * → Sifat one-way: tidak bisa dikembalikan ke data asli.
 * → Sifat deterministic: input yang sama selalu menghasilkan hash yang sama.
 * 
 * KENAPA pakai separator "|"?
 * → Agar data "Ali|12345" dan "Ali1|2345" menghasilkan hash berbeda.
 *   Tanpa separator, keduanya jadi "Ali12345" → hash sama → BAHAYA!
 * 
 * @param {string} nama - Nama lengkap mahasiswa
 * @param {string} nim - Nomor Induk Mahasiswa
 * @param {string} jurusan - Program studi
 * @param {string} ipk - Indeks Prestasi Kumulatif
 * @param {string} tanggalLahir - Tanggal lahir (format: YYYY-MM-DD)
 * @returns {string} Hash dalam format hex (0x...)
 */
async function generateHash(nama, nim, jurusan, ipk, tanggalLahir) {
    // Langkah 1: Gabungkan data dengan separator "|"
    const dataString = `${nama}|${nim}|${jurusan}|${ipk}|${tanggalLahir}`;
    // [SECURITY FIX] Hapus console.log data mahasiswa (PII protection)

    // Langkah 2: Encode string ke bytes (UTF-8)
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);

    // Langkah 3: Hash menggunakan SHA-256 (Web Crypto API)
    // Web Crypto API adalah API bawaan browser modern untuk operasi kriptografi.
    // Tidak perlu library eksternal!
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Langkah 4: Konversi ArrayBuffer ke hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // [SECURITY FIX] Jangan log hash ke console di production
    return hashHex;
}

// ============================================================
// FUNGSI PREVIEW HASH
// ============================================================

/**
 * Menampilkan preview hash SHA-256 sebelum disimpan ke blockchain.
 * Dipanggil saat tombol "Preview Hash" diklik.
 * 
 * TUJUAN:
 * → Agar admin bisa memverifikasi data sebelum mengirim ke blockchain.
 * → Sekali data masuk blockchain, TIDAK BISA diedit/dihapus!
 */
async function previewHash() {
    const nama = document.getElementById("nama").value.trim();
    const nim = document.getElementById("nim").value.trim();
    const jurusan = document.getElementById("jurusan").value.trim();
    const ipk = document.getElementById("ipk").value.trim();
    const tanggalLahir = document.getElementById("tanggalLahir").value;

    // Validasi: pastikan semua field terisi
    if (!nama || !nim || !jurusan || !ipk || !tanggalLahir) {
        alert("Harap isi semua field terlebih dahulu!");
        return;
    }

    // Generate dan tampilkan hash
    const hash = await generateHash(nama, nim, jurusan, ipk, tanggalLahir);

    document.getElementById("hashValue").textContent = hash;
    document.getElementById("hashPreview").classList.remove("hidden");
}

// ============================================================
// FUNGSI SUBMIT (SIMPAN KE BLOCKCHAIN)
// ============================================================

/**
 * Event handler untuk form submit.
 * Mengambil data dari form, generate hash, dan simpan ke blockchain.
 */
document.getElementById("hashForm").addEventListener("submit", async function (e) {
    e.preventDefault(); // Cegah reload halaman

    // Pastikan sudah terhubung ke blockchain
    if (!contract) {
        alert("Belum terhubung ke blockchain! Refresh halaman dan coba lagi.");
        return;
    }

    const nama = document.getElementById("nama").value.trim();
    const nim = document.getElementById("nim").value.trim();
    const jurusan = document.getElementById("jurusan").value.trim();
    const ipk = document.getElementById("ipk").value.trim();
    const tanggalLahir = document.getElementById("tanggalLahir").value;

    // Validasi
    if (!nama || !nim || !jurusan || !ipk || !tanggalLahir) {
        alert("Harap isi semua field!");
        return;
    }

    // [SECURITY FIX] Validasi panjang input untuk mencegah DoS
    if (nama.length > 200 || nim.length > 50 || jurusan.length > 200 || ipk.length > 10) {
        alert("Input terlalu panjang! Periksa kembali data Anda.");
        return;
    }

    // Disable tombol saat proses berjalan
    const btnSubmit = document.getElementById("btnSubmit");
    btnSubmit.disabled = true;

    // Update status ke "Pending"
    updateTxStatus("pending", "Mengirim transaksi ke blockchain...");

    try {
        // Generate hash SHA-256 dari data mahasiswa
        const hash = await generateHash(nama, nim, jurusan, ipk, tanggalLahir);

        // Tampilkan preview hash
        document.getElementById("hashValue").textContent = hash;
        document.getElementById("hashPreview").classList.remove("hidden");

        // Kirim hash ke smart contract
        console.log("📤 Mengirim hash ke smart contract...");
        const tx = await contract.storeHash(hash);

        // Update status: transaksi terkirim, menunggu konfirmasi
        updateTxStatus("pending", `Transaksi terkirim! Menunggu konfirmasi...\nTx Hash: ${tx.hash}`);

        // Tunggu transaksi terkonfirmasi di blockchain
        const receipt = await tx.wait();

        // Transaksi berhasil!
        console.log("✅ Transaksi berhasil:", receipt);
        updateTxStatus("success", `Hash berhasil disimpan ke blockchain!\n\nTx Hash: ${tx.hash}\nBlock: ${receipt.blockNumber}\nGas Used: ${receipt.gasUsed.toString()}`);

        // Lakukan pencatatan History Lokal
        addHistoryLog(nama, hash, tx.hash);

        // Reset form setelah berhasil
        document.getElementById("hashForm").reset();
        document.getElementById("hashPreview").classList.add("hidden");

        // Tampilkan animasi toast sukses
        showToastSuccess("Satu data berhasil diamankan ke blockchain!");

    } catch (error) {
        console.error("❌ Error:", error);

        // Tampilkan pesan error yang user-friendly
        let errorMsg = "Gagal menyimpan hash ke blockchain.";
        if (error.message.includes("Hash sudah tersimpan")) {
            errorMsg = "Hash ini sudah tersimpan sebelumnya! Data mahasiswa ini sudah terdaftar.";
        } else if (error.message.includes("belum terdaftar sebagai institusi")) {
            errorMsg = "Wallet Anda belum terdaftar sebagai institusi kampus. Hubungi Super Admin.";
        }

        updateTxStatus("error", errorMsg);
    }

    btnSubmit.disabled = false;
});

// ============================================================
// FUNGSI SUBMIT (BULK IMPORT CSV)
// ============================================================

let currentCsvHashes = []; // Menyimpan hash dari file CSV
let currentCsvNames = []; // Menyimpan nama dari file CSV untuk Display History

// Listener untuk input file CSV (kapan user memilih file)
document.getElementById("csvFile").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // Tampilkan info file
    document.getElementById("csvFileName").textContent = file.name;
    document.getElementById("csvFileInfo").classList.remove("hidden");

    const reader = new FileReader();
    reader.onload = async function (event) {
        const text = event.target.result;
        // Parsing CSV dasar (asumsi separator koma atau baris baru)
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");

        // [SECURITY FIX] Batas maksimum baris untuk mencegah DoS/crash browser
        const MAX_CSV_ROWS = 500;
        if (lines.length > MAX_CSV_ROWS + 1) {
            alert(`File CSV terlalu besar. Maksimum ${MAX_CSV_ROWS} baris data.`);
            document.getElementById("btnProcessCsv").disabled = true;
            return;
        }

        let validRows = 0;
        currentCsvHashes = []; // Reset array
        currentCsvNames = [];  // Reset array nama

        // Asumsi baris 1 adalah header, mulai dari baris 2 (index 1)
        // Format: Nama, NIM, Jurusan, IPK, TanggalLahir
        const startIndex = lines[0].toLowerCase().includes("nama") ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const cols = lines[i].split(",");
            if (cols.length >= 5) {
                // [SECURITY FIX] Sanitasi: hapus formula injection + batasi panjang
                const p = cols.map(c => {
                    let clean = c.replace(/"/g, "").trim();
                    if (/^[=+\-@]/.test(clean)) clean = "'" + clean;
                    if (clean.length > 200) clean = clean.substring(0, 200);
                    return clean;
                });

                // Urutan: nama, nim, jurusan, ipk, tanggalLahir
                const hash = await generateHash(p[0], p[1], p[2], p[3], p[4]);
                currentCsvHashes.push(hash);
                currentCsvNames.push(p[0]); // Simpan nama untuk history
                validRows++;
            }
        }

        document.getElementById("csvRowCount").textContent = `Menemukan ${validRows} baris data valid`;

        if (validRows === 0) {
            alert("File CSV kosong atau format tidak sesuai.\nFormat harus: Nama, NIM, Jurusan, IPK, Tanggal (Contoh: Budi,123,SI,3.5,2000-01-01)");
            document.getElementById("btnProcessCsv").disabled = true;
        } else {
            document.getElementById("btnProcessCsv").disabled = false;
        }
    };

    reader.readAsText(file);
});

// Listener untuk tombol Proses CSV
document.getElementById("btnProcessCsv").addEventListener("click", async function () {
    if (currentCsvHashes.length === 0) return;

    if (!contract) {
        alert("Belum terhubung ke blockchain!");
        return;
    }

    if (!confirm(`Anda akan menyimpan ${currentCsvHashes.length} data mahasiswa sekaligus ke blockchain. Lanjutkan?`)) {
        return;
    }

    // Disable form UI
    const btnProcess = document.getElementById("btnProcessCsv");
    btnProcess.disabled = true;
    updateTxStatus("pending", `Memproses ${currentCsvHashes.length} data ke blockchain (Bulk Import)...`);

    try {
        console.log("📤 Mengirim BANYAK hash ke smart contract...");
        const tx = await contract.storeMultipleHashes(currentCsvHashes);

        updateTxStatus("pending", `Bulk Import terkirim! Menunggu konfirmasi...\nTx Hash: ${tx.hash}`);
        const receipt = await tx.wait();

        console.log("✅ Bulk Import berhasil:", receipt);
        updateTxStatus("success", `${currentCsvHashes.length} Data Mahasiswa berhasil disimpan sekaligus!\n\nTx Hash: ${tx.hash}\nBlock: ${receipt.blockNumber}\nGas Used: ${receipt.gasUsed.toString()}`);

        // Update Statistik untuk setiap item CSV
        currentCsvNames.forEach((nama, i) => {
            addHistoryLog(nama, currentCsvHashes[i], tx.hash);
        });
        updateGasSavings(currentCsvHashes.length);

        // Tampilkan animasi toast sukses
        showToastSuccess(`Bulk Import Sukses: ${currentCsvHashes.length} Ijazah diamankan!`);

        // Reset UI
        document.getElementById("csvForm").reset();
        document.getElementById("csvFileInfo").classList.add("hidden");
        currentCsvHashes = [];

    } catch (error) {
        console.error("❌ Error Bulk Import:", error);
        let errorMsg = "Gagal memproses Bulk Import.";
        if (error.message.includes("belum terdaftar sebagai institusi")) {
            errorMsg = "Wallet Anda belum terdaftar sebagai institusi kampus. Hubungi Super Admin.";
        }
        updateTxStatus("error", errorMsg);
    }

    btnProcess.disabled = false;
});

// ============================================================
// FUNGSI UI HELPER
// ============================================================

/**
 * Mengupdate status koneksi di navbar (mengaktifkan profil admin).
 * @param {boolean} isConnected - Apakah sudah terhubung ke blockchain
 */
async function updateConnectionStatus(isConnected) {
    const indicatorEl = document.getElementById("connectionIndicator");
    const profileArea = document.getElementById("adminProfileArea");

    // Fallback if elements not found (in case used in verify.js)
    if (!indicatorEl || !profileArea) {
        // Fallback to old behavior for verify.js compatibility
        const statusEl = document.getElementById("connectionStatus");
        if (statusEl && isConnected) {
            statusEl.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-green-500 pulse-dot"></span>
                <span class="text-green-700">Terhubung</span>
            `;
            statusEl.className = "flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-xs font-medium";
        }
        return;
    }

    if (isConnected) {
        // Tampilkan indikator hijau
        indicatorEl.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-green-500 pulse-dot"></span>
            <span class="text-green-700">Terhubung</span>
        `;
        // Set className secara absolut (JANGAN pakai += agar tidak menumpuk)
        indicatorEl.className = "flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-xs font-medium border border-green-200";

        // Tampilkan profil admin
        profileArea.classList.remove("hidden");
        profileArea.classList.add("flex");

        try {
            // Isi address ke navbar profil
            const addr = await signer.getAddress();
            document.getElementById("navAdminAddr").textContent = addr.slice(0, 6) + "..." + addr.slice(-4);
        } catch (e) {
            console.log("Not using signer");
        }
    }

    // Inisialisasi Render Log Aktivitas & Stats saat berhasil connect
    renderHistory();
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

        const adminAddress = await signer.getAddress();
        document.getElementById("adminAddr").textContent = adminAddress.slice(0, 8) + "..." + adminAddress.slice(-6);
        document.getElementById("adminAddr").title = adminAddress;
    } catch (error) {
        console.error("Gagal mengambil info jaringan:", error);
    }
}

/**
 * Menampilkan Notifikasi Toast Modern (Shadcn Style)
 * @param {string} type - "success" | "error" | "pending"
 * @param {string} message - Pesan yang ditampilkan
 */
function showToast(type, message) {
    // Buat container toast jika belum ada
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none";
        document.body.appendChild(container);
    }

    // Variasi warna dan icon
    let bgColor, iconHtml;
    if (type === "success") {
        bgColor = "bg-accent-500 text-white shadow-lg shadow-accent-500/20";
        iconHtml = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
    } else if (type === "error") {
        bgColor = "bg-red-500 text-white shadow-lg shadow-red-500/20";
        iconHtml = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
    } else { // pending
        bgColor = "bg-primary-500 text-white shadow-lg shadow-primary-500/20";
        iconHtml = `<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;
    }

    // Elemen Toast
    const toast = document.createElement("div");
    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 ${bgColor} transform transition-all duration-300 translate-y-10 opacity-0`;

    toast.innerHTML = `
        <div class="flex-shrink-0">${iconHtml}</div>
        <p class="text-sm font-medium pr-2">${escapeHtml(message)}</p>
    `;

    container.appendChild(toast);

    // Animasi Masuk
    setTimeout(() => {
        toast.classList.remove("translate-y-10", "opacity-0");
        toast.classList.add("translate-y-0", "opacity-100");
    }, 10);

    // Hapus otomatis jika bukan status loading, atau hapus loading setelah 5 detik backup
    if (type !== "pending" || type === "pending") {
        const hideDelay = type === "pending" ? 6000 : 4000;
        setTimeout(() => {
            toast.classList.remove("translate-y-0", "opacity-100");
            toast.classList.add("translate-y-10", "opacity-0");
            setTimeout(() => toast.remove(), 300);
        }, hideDelay);
    }
}

// Bumper untuk kompatibilitas kode lama
function updateTxStatus(status, message) {
    showToast(status, message);
}

// ============================================================
// FUNGSI HISTORY & ANALYTICS (PRO-MAX)
// ============================================================

/**
 * Mendapatkan riwayat dari LocalStorage
 */
function getHistory() {
    const history = localStorage.getItem("credblock_history");
    return history ? JSON.parse(history) : [];
}

/**
 * Menambah catatan ke History Lokal
 */
function addHistoryLog(nama, hash, txHash) {
    const history = getHistory();
    const newRecord = {
        nama: nama,
        hash: hash,
        txHash: txHash,
        waktu: new Date().toISOString()
    };
    history.unshift(newRecord); // Tambah di paling atas
    // Batasi maksimum 50 list history agar tidak memberatkan browser
    if (history.length > 50) history.pop();
    localStorage.setItem("credblock_history", JSON.stringify(history));
    renderHistory();
}

/**
 * Menghitung Total Penghematan Gas (Asumsi 1 tx hemat 0.005 POL)
 */
function updateGasSavings(jumlahDataBaru = 0) {
    let savedTotal = parseInt(localStorage.getItem("credblock_gas_savings") || "0");
    if (jumlahDataBaru > 1) {
        // Jika import massal (lebih dari 1), hemat = n_data - 1 tx
        savedTotal += (jumlahDataBaru - 1);
        localStorage.setItem("credblock_gas_savings", savedTotal.toString());
    }

    // Asumsi per transaksi reguler sekitar 0.005 POL
    const estimasiPOL = (savedTotal * 0.005).toFixed(3);
    const gasEl = document.getElementById("statGasSaved");
    if (gasEl) gasEl.innerHTML = `${estimasiPOL} <span class="text-lg font-medium text-gray-500">POL</span>`;
}

/**
 * Render ulang isi panel History & Bento Grid Stat
 */
function renderHistory() {
    const history = getHistory();
    const container = document.getElementById("historyListContainer");
    const emptyState = document.getElementById("emptyHistoryState");
    const statTotalEl = document.getElementById("statTotalData");

    if (!container) return; // Jika tidak ada elementnya (misal di verify.js)

    // Update Counter Total
    if (statTotalEl) statTotalEl.textContent = history.length;

    // Update Gas Saved Counter (Tanpa Nambah Data)
    updateGasSavings(0);

    if (history.length === 0) {
        container.innerHTML = "";
        if (emptyState) container.appendChild(emptyState);
        emptyState.classList.remove("hidden");
        return;
    }

    if (emptyState) emptyState.classList.add("hidden");
    container.innerHTML = "";

    history.forEach(item => {
        const timeObj = new Date(item.waktu);
        const timeStr = timeObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        const hashShort = item.hash.substring(0, 10) + "...";
        const txShort = item.txHash ? item.txHash.substring(0, 10) + "..." : "-";

        const cardHtml = `
            <div class="px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-gray-900 leading-tight">${item.nama}</p>
                        <p class="text-[10px] bg-clip-text text-transparent bg-gradient-to-r from-gray-500 to-gray-400 font-mono mt-0.5" title="${item.hash}">${hashShort}</p>
                    </div>
                </div>
                <div class="text-right flex flex-col items-end">
                    <span class="text-[10px] font-medium text-gray-400">${timeStr}</span>
                    <span class="text-[10px] text-primary-500 mt-0.5 hidden group-hover:block transition-all" title="${item.txHash}">📋 Lokal</span>
                    <span class="text-[10px] text-green-500 font-medium mt-0.5 group-hover:hidden outline-1 outline-green-100">Sukses</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML("beforeend", cardHtml);
    });
}

// Event Clear History
const btnClear = document.getElementById("btnClearHistory");
if (btnClear) {
    btnClear.addEventListener("click", () => {
        if (confirm("Hapus seluruh histori aktivitas dari tampilan lokal? (Data di blockchain tetap aman)")) {
            localStorage.removeItem("credblock_history");
            renderHistory();
        }
    });
}

// ============================================================
// TOAST NOTIFICATION (PRO-MAX)
// ============================================================
function showToastSuccess(pesan) {
    // Mengecek apakah container toast sudah ada
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "fixed bottom-5 right-5 z-50 flex flex-col gap-2";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    // Styling Toast ala shadcn/ui minimalis premium
    toast.className = "bg-gray-900 border border-gray-800 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 transform transition-all duration-300 translate-y-10 opacity-0";
    toast.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
        </div>
        <p class="text-sm font-medium tracking-wide">${pesan}</p>
    `;

    container.appendChild(toast);

    // Animasi Masuk (Pop & Slide)
    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-10", "opacity-0");
        toast.classList.add("translate-y-0", "opacity-100");
    });

    // Otomatis Hilang setelah 4.5 detik
    setTimeout(() => {
        toast.classList.remove("translate-y-0", "opacity-100");
        toast.classList.add("translate-y-2", "opacity-0");
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// ============================================================
// INISIALISASI SAAT HALAMAN DIMUAT
// ============================================================

/**
 * Saat halaman selesai dimuat, setup event listener tombol login
 * dan coba auto-login jika sudah ada sesi sebelumnya.
 */
document.addEventListener("DOMContentLoaded", () => {
    // Setup Listeners untuk tombol login
    const btnMetaMaskLogin = document.getElementById("btnMetaMaskLogin");

    if (btnMetaMaskLogin) {
        btnMetaMaskLogin.addEventListener("click", () => {
            // Disable tombol saat proses koneksi
            btnMetaMaskLogin.disabled = true;
            btnMetaMaskLogin.style.opacity = '0.6';
            connectBlockchain('metamask').finally(() => {
                btnMetaMaskLogin.disabled = false;
                btnMetaMaskLogin.style.opacity = '1';
            });
        });
    }
});

window.addEventListener("load", async function () {
    try {
        await connectBlockchain('auto');
    } catch (error) {
        console.error("\u274c Gagal inisialisasi awal:", error.message);
    }
});
