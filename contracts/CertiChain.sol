// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CertiChain
 * @author Tugas Akhir - Sistem Informasi
 * @notice Smart contract untuk verifikasi keaslian ijazah dan transkrip akademik.
 * 
 * MEKANISME UTAMA:
 * - Admin kampus menginput data mahasiswa (Nama, NIM, Jurusan, IPK, Tanggal Lahir).
 * - Data di-hash menggunakan SHA-256 di sisi frontend (bukan di blockchain).
 * - Hanya HASH yang disimpan di blockchain → hemat gas fee.
 * - HRD/Perusahaan bisa memverifikasi keaslian dokumen dengan menginput ulang
 *   data dari ijazah fisik/PDF, lalu mengecek apakah hash-nya ada di blockchain.
 */
contract CertiChain {

    // ============================================================
    // STATE VARIABLES
    // ============================================================

    /**
     * @dev Alamat wallet admin yang men-deploy contract ini.
     * Hanya admin yang boleh menyimpan hash baru ke blockchain.
     */
    address public admin;

    /**
     * @dev Mapping untuk menyimpan data Institusi.
     * Key   = address (alamat wallet kampus/universitas)
     * Value = string (nama resmi kampus)
     */
    mapping(address => string) public institutions;

    /**
     * @dev Mapping untuk menyimpan hash ijazah.
     * Key   = bytes32 (hash SHA-256 dari data mahasiswa)
     * Value = address (alamat wallet institusi yang mengunggah)
     * 
     * KENAPA mapping, bukan array?
     * → Lookup di mapping = O(1), sangat efisien untuk verifikasi.
     */
    mapping(bytes32 => address) private hashes;

    // ============================================================
    // EVENTS
    // ============================================================

    /**
     * @dev Event yang di-emit setiap kali hash baru berhasil disimpan.
     * Berguna untuk tracking di frontend dan block explorer.
     * @param hash Hash ijazah yang disimpan
     * @param publisher Alamat dompet institusi/universitas yang mengunggah
     * @param timestamp Waktu penyimpanan (block timestamp)
     */
    event HashStored(bytes32 indexed hash, address indexed publisher, uint256 timestamp);

    /**
     * @dev Event yang di-emit ketika institusi/kampus baru didaftarkan.
     */
    event InstitutionRegistered(address indexed wallet, string name);

    // ============================================================
    // MODIFIERS
    // ============================================================

    /**
     * @dev Modifier untuk membatasi akses hanya ke admin.
     * KENAPA perlu modifier ini?
     * → Agar hanya admin kampus yang bisa menambah data ijazah.
     * → Mencegah pihak tidak bertanggung jawab menambah hash palsu.
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "CertiChain: Hanya admin yang dapat menyimpan hash");
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @dev Constructor dijalankan sekali saat contract di-deploy.
     * Menetapkan deployer sebagai admin.
     */
    constructor() {
        admin = msg.sender;
    }

    // ============================================================
    // MAIN FUNCTIONS
    // ============================================================

    /**
     * @notice Mendaftarkan alamat wallet sebagai Institusi / Kampus.
     * @dev Hanya admin (super admin/Kementrian) yang berhak mendaftarkan kampus.
     * 
     * @param _wallet Alamat dompet kampus (yang akan melakukan upload data)
     * @param _name Nama resmi kampus (misal: "Universitas Indonesia")
     */
    function registerInstitution(address _wallet, string memory _name) public onlyAdmin {
        require(bytes(_name).length > 0, "CertiChain: Nama institusi tidak boleh kosong");
        institutions[_wallet] = _name;
        emit InstitutionRegistered(_wallet, _name);
    }

    /**
     * @notice Menyimpan hash ijazah ke blockchain.
     * @dev Hanya bisa dipanggil oleh admin (modifier onlyAdmin).
     * 
     * ALUR:
     * 1. Admin input data mahasiswa di frontend.
     * 2. Frontend men-generate hash SHA-256 dari data tersebut.
     * 3. Hash dikirim ke fungsi ini untuk disimpan di blockchain.
     * 
     * @param _hash Hash SHA-256 dari data ijazah (dalam format bytes32)
     */
    function storeHash(bytes32 _hash) public {
        // Pastikan wallet pemanggil sudah terdaftar sebagai institusi kampus
        require(bytes(institutions[msg.sender]).length > 0, "CertiChain: Alamat Anda belum terdaftar sebagai institusi");
        
        // Pastikan hash belum pernah disimpan sebelumnya (cegah duplikat)
        require(hashes[_hash] == address(0), "CertiChain: Hash sudah tersimpan sebelumnya");

        // Simpan hash (catat address pengunggahnya)
        hashes[_hash] = msg.sender;

        // Emit event untuk logging on-chain
        emit HashStored(_hash, msg.sender, block.timestamp);
    }

    /**
     * @notice Menyimpan BANYAK hash ijazah sekaligus (Bulk Import).
     * @dev Menghemat gas fee karena memproses array hash dalam 1 transaksi.
     * 
     * @param _hashes Array berisi hash SHA-256 dari data banyak mahasiswa
     */
    function storeMultipleHashes(bytes32[] calldata _hashes) public {
        // Pastikan wallet pemanggil sudah terdaftar sebagai institusi kampus
        require(bytes(institutions[msg.sender]).length > 0, "CertiChain: Alamat Anda belum terdaftar sebagai institusi");

        for (uint256 i = 0; i < _hashes.length; i++) {
            bytes32 currentHash = _hashes[i];
            
            // Hanya simpan jika hash belum pernah disimpan (skip duplikat)
            if (hashes[currentHash] == address(0)) {
                hashes[currentHash] = msg.sender;
                emit HashStored(currentHash, msg.sender, block.timestamp);
            }
        }
    }

    /**
     * @notice Memverifikasi apakah hash ijazah ada di blockchain beserta entitas penerbitnya.
     * @dev Fungsi ini bersifat VIEW (tidak mengubah state, gratis dipanggil).
     * Bisa dipanggil oleh siapa saja (HRD, perusahaan, publik).
     * 
     * @param _hash Hash SHA-256 yang ingin diverifikasi
     * @return isValid True jika hash ditemukan (ijazah valid)
     * @return institutionName Nama kampus resmi yang menerbitkan (jika terdaftar)
     * @return publisher Alamat dompet yang mengunggah
     */
    function verifyHash(bytes32 _hash) public view returns (bool isValid, string memory institutionName, address publisher) {
        address uploader = hashes[_hash]; // Dapatkan alamat siapa yang meng-upload
        
        if (uploader != address(0)) {
            // Hash ditemukan! Ambil nama institusinya.
            string memory campusName = institutions[uploader];
            return (true, campusName, uploader);
        } else {
            // Hash tidak ditemukan (palsu/belum diupload)
            return (false, "", address(0));
        }
    }
}
