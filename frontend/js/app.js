/**
 * app.js — Logic untuk Dashboard Admin Kampus (index.html)
 * 
 * FUNGSI UTAMA:
 * 1. Menghubungkan ke jaringan blockchain (lokal Hardhat / MetaMask).
 * 2. Menerima input data mahasiswa dari form.
 * 3. Menghasilkan hash SHA-256 dari data mahasiswa.
 * 4. Mengirim hash ke smart contract CertiChain untuk disimpan di blockchain.
 * 
 * LIBRARY: Ethers.js v6 (dimuat via CDN di index.html)
 */

// ============================================================
// KONFIGURASI
// ============================================================

const CONTRACT_ADDRESS = "0x6116D452af7a014576BD50aeFfce9586D040D57E"; // <--- Polygon Amoy Testnet

/**
 * ABI (Application Binary Interface) dari smart contract CertiChain.
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
    // Fungsi registerInstitution (dipanggil admin/simulasi)
    "function registerInstitution(address _wallet, string memory _name) public",
    // Fungsi mendapatkan nama institusi dari address
    "function institutions(address) view returns (string)",
    // Fungsi storeHash (satu per satu)
    "function storeHash(bytes32 _hash)",
    // Fungsi storeMultipleHashes (bulk import)
    "function storeMultipleHashes(bytes32[] calldata _hashes)",
    // Fungsi verifyHash (mengembalikan 3 nilai: bool, string, address)
    "function verifyHash(bytes32 _hash) view returns (bool isValid, string memory institutionName, address publisher)",
    // Event HashStored & InstitutionRegistered
    "event HashStored(bytes32 indexed hash, address indexed publisher, uint256 timestamp)",
    "event InstitutionRegistered(address indexed wallet, string name)"
];

// ============================================================
// VARIABEL GLOBAL
// ============================================================

let provider;   // Object untuk berkomunikasi dengan jaringan blockchain
let signer;     // Object yang merepresentasikan akun pengguna (admin)
let contract;   // Instance smart contract yang bisa dipanggil dari JS
let institutionsDB = {}; // Database profil kampus (dari JSON off-chain)

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
    let userAddress;

    if (method === 'metamask' || (method === 'auto' && window.ethereum && localStorage.getItem('certichain_login_method') === 'metamask')) {
        // --- JALUR METAMASK ---
        if (typeof window.ethereum === "undefined") {
            if (method === 'metamask') {
                alert("MetaMask tidak terdeteksi! Silakan install ekstensi MetaMask di browser Anda.");
            }
            return;
        }

        try {
            updateTxStatus("pending", "Menghubungkan ke jaringan MetaMask...");
            // Minta akses wallet (akan memunculkan popup MetaMask)
            await window.ethereum.request({ method: 'eth_requestAccounts' });

            // Gunakan BrowserProvider dari Ethers v6
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();

            // Simpan preferensi login agar auto-reconnect
            localStorage.setItem('certichain_login_method', 'metamask');
            console.log("✅ Terhubung via MetaMask:", userAddress);

            // Dengarkan perubahan akun
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) window.location.reload();
                else {
                    localStorage.removeItem('certichain_login_method');
                    window.location.reload();
                }
            });

        } catch (error) {
            console.error("❌ Batal / Gagal terkoneksi MetaMask:", error);
            if (method === 'metamask') {
                updateTxStatus("error", "Koneksi MetaMask dibatalkan atau gagal.");
            }
            return;
        }

    } else if (method === 'google' || (method === 'auto' && localStorage.getItem("certichain_admin_wallet"))) {
        // --- JALUR GOOGLE (SIMULASI SMART WALLET) ---
        let savedPrivateKey = localStorage.getItem("certichain_admin_wallet");

        if (!savedPrivateKey) {
            if (method === 'google') {
                // Di rilis publik ini, kita hardcode Private Key admin yang nantinya HARUS diisi saldo MATIC Testnet
                savedPrivateKey = "0xc2701619eeb4142848d298211a7c88d26544dce27c1d1e4d211c717e8fc6375a";
                localStorage.setItem("certichain_admin_wallet", savedPrivateKey);
                localStorage.setItem('certichain_login_method', 'google');
            } else {
                document.getElementById("loginOverlay").classList.remove("hidden");
                return;
            }
        }

        try {
            updateTxStatus("pending", "Menghubungkan ke jaringan Polygon Amoy...");
            provider = new ethers.JsonRpcProvider("https://polygon-amoy-bor-rpc.publicnode.com");
            signer = new ethers.Wallet(savedPrivateKey, provider);
            userAddress = await signer.getAddress();
            localStorage.setItem('certichain_login_method', 'google');

            console.log("✅ Terhubung via Smart Wallet (Google Auth)");
            console.log("   Admin address:", userAddress);
        } catch (error) {
            console.error("❌ Gagal load Smart Wallet:", error);
            updateTxStatus("error", "Gagal load sesi login.");
            return;
        }
    } else {
        // Belum login apapun
        document.getElementById("loginOverlay").classList.remove("hidden");
        return;
    }

    // --- BAGIAN UMUM (Berlaku untuk MetaMask & Google) ---
    document.getElementById("loginOverlay").classList.add("hidden");

    try {
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        updateConnectionStatus(true);
        updateNetworkInfo();
        await loadInstitutionsDB();

        const myInstitutionName = await contract.institutions(userAddress);
        const navInstEl = document.getElementById("navInstitutionName");
        const bannerEl = document.getElementById("bannerNotRegistered");
        const profileCardEl = document.getElementById("institutionProfileCard");

        if (myInstitutionName && myInstitutionName !== "") {
            const profile = institutionsDB[userAddress] || null;
            if (navInstEl) navInstEl.textContent = profile ? profile.shortName : myInstitutionName;
            if (bannerEl) bannerEl.classList.add("hidden");
            if (profileCardEl && profile) {
                profileCardEl.classList.remove("hidden");
                document.getElementById("profileCampusName").textContent = profile.name;
                document.getElementById("profileCampusAddr").textContent = profile.address;
                document.getElementById("profileCampusAccred").textContent = profile.accreditation;
                document.getElementById("profileCampusWeb").textContent = profile.website;
                document.getElementById("profileCampusWeb").href = profile.website;
                document.getElementById("profileCampusEmail").textContent = profile.email;
            }
            updateTxStatus("success", `Login berhasil. Identitas: ${myInstitutionName}`);
        } else {
            if (navInstEl) navInstEl.textContent = "⚠️ Belum Terdaftar";
            if (bannerEl) bannerEl.classList.remove("hidden");
            if (profileCardEl) profileCardEl.classList.add("hidden");
            updateTxStatus("error", "Wallet Anda belum terdaftar sebagai institusi kampus.");
        }
    } catch (e) {
        console.error("❌ Gagal verifikasi contract:", e);
        updateTxStatus("error", "Gagal memverifikasi status kampus di blockchain.");
    }
}

// ============================================================
// EVENT LISTENER: GOOGLE LOGIN (SIMULASI)
// ============================================================
const btnGoogleLoginInit = document.getElementById("btnGoogleLogin");
if (btnGoogleLoginInit) {
    btnGoogleLoginInit.addEventListener("click", () => {
        document.getElementById("loginText").textContent = "Authenticating...";
        document.getElementById("loginSpinner").classList.remove("hidden");
        btnGoogleLoginInit.disabled = true;

        setTimeout(() => {
            connectBlockchain('google');
        }, 1500);
    });
}

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
    console.log("📝 Data string:", dataString);

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

    console.log("🔒 Hash SHA-256:", hashHex);
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

        let validRows = 0;
        currentCsvHashes = []; // Reset array
        currentCsvNames = [];  // Reset array nama

        // Asumsi baris 1 adalah header, mulai dari baris 2 (index 1)
        // Format: Nama, NIM, Jurusan, IPK, TanggalLahir
        const startIndex = lines[0].toLowerCase().includes("nama") ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const cols = lines[i].split(",");
            if (cols.length >= 5) {
                // Bersihkan kutipan atau spasi ekstra
                const p = cols.map(c => c.replace(/"/g, "").trim());

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
        <p class="text-sm font-medium pr-2">${message}</p>
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
    const history = localStorage.getItem("certichain_history");
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
    localStorage.setItem("certichain_history", JSON.stringify(history));
    renderHistory();
}

/**
 * Menghitung Total Penghematan Gas (Asumsi 1 tx hemat 0.005 POL)
 */
function updateGasSavings(jumlahDataBaru = 0) {
    let savedTotal = parseInt(localStorage.getItem("certichain_gas_savings") || "0");
    if (jumlahDataBaru > 1) {
        // Jika import massal (lebih dari 1), hemat = n_data - 1 tx
        savedTotal += (jumlahDataBaru - 1);
        localStorage.setItem("certichain_gas_savings", savedTotal.toString());
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
            localStorage.removeItem("certichain_history");
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
    const btnGoogleLogin = document.getElementById("btnGoogleLogin");
    const btnMetaMaskLogin = document.getElementById("btnMetaMaskLogin");

    if (btnGoogleLogin) {
        btnGoogleLogin.addEventListener("click", () => {
            // Hapus session lama jika user klik tombol secara manual (untuk force new wallet)
            localStorage.removeItem("certichain_admin_wallet");
            connectBlockchain('google');
        });
    }

    if (btnMetaMaskLogin) {
        btnMetaMaskLogin.addEventListener("click", () => {
            connectBlockchain('metamask');
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
