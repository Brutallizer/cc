// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CredBlock V2 (Platform Self-Service & Kementerian)
 * @author Tugas Akhir - Sistem Informasi
 * @notice Smart contract untuk verifikasi keaslian ijazah dengan sistem pendaftaran mandiri.
 */
contract CredBlock {

    // ============================================================
    // STATE VARIABLES & ENUMS
    // ============================================================

    /**
     * @dev Status pendaftaran sebuah kampus
     * Enum memberikan perlindungan tipe (type safety) dan memori efisien
     */
    enum Status { NotRegistered, Pending, Approved, Rejected }

    /**
     * @dev Struktur data Institusi/Kampus yang mendaftar
     */
    struct Institution {
        string name;
        Status status;
    }

    /**
     * @dev Alamat wallet admin (Kementerian Pendidikan yang berhak nge-approve)
     */
    address public admin;

    /**
     * @dev Database Institusi
     * Key   = address (alamat wallet kampus/universitas)
     * Value = Struct Institution berisi nama dan status pendaftaran
     */
    mapping(address => Institution) public institutions;

    /**
     * @dev Database Hash Ijazah
     * Key   = bytes32 (hash SHA-256 dari data ijazah mahasiswa)
     * Value = address (alamat wallet institusi yang mengunggah)
     */
    mapping(bytes32 => address) private hashes;

    // Array tracking untuk mempermudah Kementerian / Super Admin mengambil daftar antrian
    address[] public allApplicants;

    // ============================================================
    // EVENTS
    // ============================================================

    event RegistrationApplied(address indexed wallet, string name);
    event InstitutionApproved(address indexed wallet, string name);
    event InstitutionRejected(address indexed wallet, string name);
    event HashStored(bytes32 indexed hash, address indexed publisher, uint256 timestamp);

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "CredBlock: Akses ditolak. Hanya Kementerian (Super Admin) yang diizinkan.");
        _;
    }

    modifier onlyApprovedInstitution() {
        require(institutions[msg.sender].status == Status.Approved, "CredBlock: Akses ditolak. Wallet belum di-approve sebagai Institusi resmi.");
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor() {
        // Yang mendeploy = Kementerian Pendidikan / Super Admin Pusat
        admin = msg.sender;
    }

    // ============================================================
    // FUNGSI UNTUK KAMPUS (PENDAFTARAN)
    // ============================================================

    /**
     * @notice Kampus baru mendaftarkan dirinya (Self-Service)
     * @dev Siapapun bisa melamar. Status awal = Pending. 
     *      Legalitas detail disimpan di Off-Chain Database, blockchain cukup menyimpan nama & statusnya.
     */
    function applyForRegistration(string memory _name) public {
        require(bytes(_name).length > 0, "CredBlock: Nama institusi tidak boleh kosong");
        Institution memory existing = institutions[msg.sender];
        
        require(existing.status == Status.NotRegistered || existing.status == Status.Rejected, "CredBlock: Wallet Anda sudah terdaftar atau dalam antrean Pending");

        // Simpan pendaftaran baru ke mapping
        institutions[msg.sender] = Institution({
            name: _name,
            status: Status.Pending
        });

        // Simpan alamat untuk tracking semua pelamar
        allApplicants.push(msg.sender);

        emit RegistrationApplied(msg.sender, _name);
    }

    // ============================================================
    // FUNGSI UNTUK KEMENTERIAN / SUPER ADMIN (APPROVAL)
    // ============================================================

    /**
     * @notice Super Admin menyetujui pendaftaran kampus
     */
    function approveInstitution(address _wallet) public onlyAdmin {
        require(institutions[_wallet].status == Status.Pending, "CredBlock: Tidak ada aplikasi Pending untuk wallet ini");
        
        institutions[_wallet].status = Status.Approved;
        emit InstitutionApproved(_wallet, institutions[_wallet].name);
    }

    /**
     * @notice Super Admin menolak pendaftaran kampus
     */
    function rejectInstitution(address _wallet) public onlyAdmin {
        require(institutions[_wallet].status == Status.Pending, "CredBlock: Tidak ada aplikasi Pending untuk wallet ini");
        
        institutions[_wallet].status = Status.Rejected;
        emit InstitutionRejected(_wallet, institutions[_wallet].name);
    }

    /**
     * @notice Shortcut bagi Super Admin jika ingin mendaftarkan langsung secara manual tanpa antrian
     */
    function registerInstitutionDirectly(address _wallet, string memory _name) public onlyAdmin {
        require(bytes(_name).length > 0, "CredBlock: Nama institusi tidak boleh kosong");
        
        if (institutions[_wallet].status == Status.NotRegistered) {
             allApplicants.push(_wallet);
        }
        
        institutions[_wallet] = Institution({
            name: _name,
            status: Status.Approved
        });

        emit InstitutionApproved(_wallet, _name);
    }

    // ============================================================
    // FUNGSI INTI: PENYIMPANAN & VERIFIKASI IJAZAH
    // ============================================================

    /**
     * @notice Menyimpan (1) hash ijazah ke blockchain. Harus dari Kampus yang berstatus 'Approved'.
     */
    function storeHash(bytes32 _hash) public onlyApprovedInstitution {
        require(hashes[_hash] == address(0), "CredBlock: Hash Ijazah sudah tersimpan sebelumnya");

        hashes[_hash] = msg.sender;
        emit HashStored(_hash, msg.sender, block.timestamp);
    }

    /**
     * @notice Menyimpan BANYAK (Bulk) hash ijazah sekaligus.
     */
    function storeMultipleHashes(bytes32[] calldata _hashes) public onlyApprovedInstitution {
        for (uint256 i = 0; i < _hashes.length; i++) {
            bytes32 currentHash = _hashes[i];
            
            // Bypass duplikat agar eksekusi bulk tidak berhenti tengah jalan
            if (hashes[currentHash] == address(0)) {
                hashes[currentHash] = msg.sender;
                emit HashStored(currentHash, msg.sender, block.timestamp);
            }
        }
    }

    /**
     * @notice Memverifikasi apakah hash ijazah ada di blockchain beserta entitas penerbitnya.
     * @dev Fungsi ini bersifat VIEW (gratis). Bisa dipanggil oleh publik/HRD.
     */
    function verifyHash(bytes32 _hash) public view returns (bool isValid, string memory institutionName, address publisher) {
        address uploader = hashes[_hash]; 
        
        if (uploader != address(0)) {
            // Hash ditemukan, ambil nama dari struct Institution
            string memory campusName = institutions[uploader].name;
            return (true, campusName, uploader);
        } else {
            // Hash tidak ditemukan 
            return (false, "", address(0));
        }
    }

    // ============================================================
    // UTILITY HELPER GETTER
    // ============================================================

    /**
     * @notice Mengembalikan daftar semua pelamar untuk ditampilkan di Dashboard Kementerian
     */
    function getAllApplicants() public view returns (address[] memory) {
        return allApplicants;
    }
}
