const CONTRACT_ADDRESS = "0x830c4Eb9669adF6DeA3c1AeE702AB4f77a865d27"; // CredBlock V3 (UUPS Proxy) - Polygon Amoy
const CONTRACT_ABI = [
    "function applyForRegistration(string memory _name)",
    "function institutions(address) view returns (string name, uint8 status)"
];

let provider;
let signer;
let contract;
let userAddress;

// UI Elements
const step1Connect = document.getElementById('step1-connect');
const step2Form = document.getElementById('step2-form');
const step3Status = document.getElementById('step3-status');
const btnConnect = document.getElementById('btnConnect');
const registerForm = document.getElementById('registerForm');

// Enum mapping for Status
const STATUS = {
    0: 'NotRegistered',
    1: 'Pending',
    2: 'Approved',
    3: 'Rejected'
};

document.addEventListener("DOMContentLoaded", () => {
    // 1. Tombol Hubungkan Wallet
    btnConnect.addEventListener('click', connectWallet);

    // 2. Tombol Submit Form Pengajuan
    registerForm.addEventListener('submit', handleRegistration);

    // Auto connect attempt
    if (window.ethereum && localStorage.getItem('credblock_register_method') === 'metamask') {
        connectWallet();
    }
});

async function connectWallet() {
    if (typeof window.ethereum === "undefined") {
        alert("Ekstensi MetaMask tidak ditemukan. Silakan pasang di browser Anda.");
        return;
    }

    try {
        btnConnect.disabled = true;
        btnConnect.innerHTML = `<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Sedang Menghubungkan...`;

        await window.ethereum.request({ method: 'eth_requestAccounts' });

        // Auto Switch to Amoy
        const targetChainId = '0x13882';
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

        if (currentChainId !== targetChainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: targetChainId }],
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: targetChainId,
                            chainName: 'Polygon Amoy Testnet',
                            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                            rpcUrls: ['https://rpc-amoy.polygon.technology/'],
                            blockExplorerUrls: ['https://amoy.polygonscan.com/']
                        }]
                    });
                } else {
                    console.warn("User menolak pindah jaringan ke Amoy. Koneksi jalan dengan peringatan.");
                    showToast('pending', "Peringatan: Jaringan Anda bukan Amoy. Transaksi mungkin gagal.");
                }
            }
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        localStorage.setItem('credblock_register_method', 'metamask');

        // Check current status
        await checkStatus();

    } catch (error) {
        console.error("Koneksi Batal/Gagal:", error);
        btnConnect.disabled = false;
        btnConnect.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" class="w-5 h-5"> Connect MetaMask`;
        showToast('error', error.message || "Gagal menghubungkan MetaMask");
    }
}

async function checkStatus() {
    try {
        const instData = await contract.institutions(userAddress);
        // instData mengembalikan struct tuple: [string name, uint8 status]
        const statusVal = Number(instData[1]);
        const statusEnm = STATUS[statusVal];

        console.log("Status Wallet:", statusEnm);

        if (statusEnm === 'NotRegistered') {
            // Tampilkan Step 2 (Form)
            step1Connect.classList.add('hidden');
            step2Form.classList.remove('hidden');
            step3Status.classList.add('hidden');

        } else if (statusEnm === 'Pending') {
            // Tampilkan Step 3 (Waiting)
            step1Connect.classList.add('hidden');
            step2Form.classList.add('hidden');
            step3Status.classList.remove('hidden');

        } else if (statusEnm === 'Approved') {
            // Sudah approve, suruh masuk portal admin
            window.location.href = 'index.html';

        } else if (statusEnm === 'Rejected') {
            alert("Aplikasi kampus Anda sebelumnya ditolak. Anda dapat mencoba mengisi formulir kembali.");
            step1Connect.classList.add('hidden');
            step2Form.classList.remove('hidden');
            step3Status.classList.add('hidden');
        }

    } catch (e) {
        console.error("Gagal memeriksa status institution:", e);
        showToast('error', "Gagal membaca Data dari Blockchain Amoy");
    }
}

async function handleRegistration(e) {
    e.preventDefault();

    const name = document.getElementById('regName').value.trim();
    if (!name) {
        showToast('error', "Nama kampus wajib diisi");
        return;
    }

    try {
        const btnSubmit = document.getElementById('btnSubmitForm');
        const origText = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Sedang Memproses Tx...`;

        showToast('pending', "Silakan konfirmasi transaksi Pengajuan di MetaMask Anda...");

        const tx = await contract.applyForRegistration(name);

        showToast('pending', "Transaksi sedang ditambang di Polygon Amoy...");
        await tx.wait();

        // Transaction Success 
        showToast('success', "Pendaftaran Berhasil Dikirim ke Jaringan!");

        // Simpan sisa metadata legalitas offchain menggunakan nama localStorage sbg mock B2B Database
        const pendingMetadata = {
            wallet: userAddress,
            name: name,
            shortName: document.getElementById('regShort').value,
            sk: document.getElementById('regSK').value,
            akreditasi: document.getElementById('regAkred').value,
            web: document.getElementById('regWeb').value,
            email: document.getElementById('regEmail').value,
            address: document.getElementById('regAddress').value
        };

        let localQueue = JSON.parse(localStorage.getItem('credblock_pending_db') || "{}");
        localQueue[userAddress] = pendingMetadata;
        localStorage.setItem('credblock_pending_db', JSON.stringify(localQueue));

        // Pindah layar ke pendaftaran sukses
        await checkStatus();

    } catch (error) {
        console.error("Gagal applyForRegistration:", error);
        showToast('error', "Transaksi gagal atau dibatalkan");
        document.getElementById('btnSubmitForm').disabled = false;
        document.getElementById('btnSubmitForm').innerHTML = `<span>Ajukan Pendaftaran ke Kementerian</span>`;
    }
}

// ===================================
// TOAST NOTIFICATIONS (Reused Shadcn Style)
// ===================================
function showToast(type, message) {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "fixed bottom-5 right-5 z-[200] flex flex-col gap-3 pointer-events-none";
        document.body.appendChild(container);
    }

    let bgColor, iconHtml;
    if (type === "success") {
        bgColor = "bg-green-600 text-white shadow-lg";
        iconHtml = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
    } else if (type === "error") {
        bgColor = "bg-red-500 text-white shadow-lg";
        iconHtml = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
    } else {
        bgColor = "bg-blue-600 text-white shadow-lg";
        iconHtml = `<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;
    }

    const toast = document.createElement("div");
    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 ${bgColor} transform transition-all duration-300 translate-y-10 opacity-0`;
    toast.innerHTML = `<div class="flex-shrink-0">${iconHtml}</div><p class="text-sm font-medium pr-2">${message}</p>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("translate-y-10", "opacity-0");
        toast.classList.add("translate-y-0", "opacity-100");
    }, 10);

    if (type !== "pending") {
        setTimeout(() => {
            toast.classList.remove("translate-y-0", "opacity-100");
            toast.classList.add("translate-y-10", "opacity-0");
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}
