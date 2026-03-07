// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title CredBlock V3 — Production-Grade Upgradeable Contract
 * @author Tugas Akhir — Sistem Informasi (Enterprise Overhaul)
 * @notice Smart contract untuk verifikasi keaslian ijazah dengan arsitektur:
 *         - UUPS Proxy (Upgradeable tanpa kehilangan data)
 *         - Role-Based Access Control (Multi-Admin, bukan single admin)
 *         - Hash Revocation (Cabut ijazah yang terbukti palsu/dicabut gelarnya)
 *         - Institution Deactivation (Nonaktifkan kampus yang dicabut izinnya)
 */
contract CredBlockV3 is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    // ============================================================
    // ROLES
    // ============================================================

    /// @dev Role untuk Kementerian Pendidikan (Super Admin).
    /// Bisa approve/reject kampus, deactivate institution, dan upgrade contract.
    bytes32 public constant KEMENTERIAN_ROLE = keccak256("KEMENTERIAN_ROLE");

    // ============================================================
    // STATE VARIABLES & ENUMS
    // ============================================================

    enum Status { NotRegistered, Pending, Approved, Rejected, Deactivated }

    struct Institution {
        string name;
        Status status;
    }

    /// @dev Database Institusi (address => Institution)
    mapping(address => Institution) public institutions;

    /// @dev Database Hash Ijazah (hash => publisher address)
    mapping(bytes32 => address) private hashes;

    /// @dev Database Revokasi (hash => true jika dicabut/dianulir)
    mapping(bytes32 => bool) public revokedHashes;

    /// @dev Array tracking semua pelamar
    address[] public allApplicants;

    /// @dev Versi kontrak (untuk tracking upgrade)
    uint256 public contractVersion;

    // ============================================================
    // EVENTS
    // ============================================================

    event RegistrationApplied(address indexed wallet, string name);
    event InstitutionApproved(address indexed wallet, string name);
    event InstitutionRejected(address indexed wallet, string name);
    event InstitutionDeactivated(address indexed wallet, string name, string reason);
    event InstitutionReactivated(address indexed wallet, string name);
    event HashStored(bytes32 indexed hash, address indexed publisher, uint256 timestamp);
    event HashRevoked(bytes32 indexed hash, address indexed revokedBy, string reason, uint256 timestamp);
    event ContractUpgraded(uint256 newVersion, address upgradedBy);

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyApprovedInstitution() {
        require(
            institutions[msg.sender].status == Status.Approved,
            "CredBlock: Akses ditolak. Wallet belum di-approve sebagai Institusi resmi."
        );
        _;
    }

    // ============================================================
    // INITIALIZER (Pengganti Constructor untuk Proxy)
    // ============================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Fungsi inisialisasi (dipanggil SEKALI saat deploy proxy).
     * @dev Menggantikan constructor karena Proxy Pattern tidak menggunakan constructor.
     * @param _superAdmin Alamat wallet deployer yang menjadi Super Admin pertama.
     */
    function initialize(address _superAdmin) public initializer {
        __AccessControl_init();

        // Berikan DEFAULT_ADMIN_ROLE dan KEMENTERIAN_ROLE kepada deployer
        _grantRole(DEFAULT_ADMIN_ROLE, _superAdmin);
        _grantRole(KEMENTERIAN_ROLE, _superAdmin);

        contractVersion = 1;
    }

    // ============================================================
    // FUNGSI UNTUK KAMPUS (PENDAFTARAN)
    // ============================================================

    /**
     * @notice Kampus baru mendaftarkan dirinya (Self-Service).
     * @dev Siapapun bisa melamar. Status awal = Pending.
     */
    function applyForRegistration(string memory _name) public {
        require(bytes(_name).length > 0, "CredBlock: Nama institusi tidak boleh kosong");
        Institution memory existing = institutions[msg.sender];

        require(
            existing.status == Status.NotRegistered || existing.status == Status.Rejected,
            "CredBlock: Wallet Anda sudah terdaftar atau dalam antrean Pending"
        );

        institutions[msg.sender] = Institution({
            name: _name,
            status: Status.Pending
        });

        allApplicants.push(msg.sender);
        emit RegistrationApplied(msg.sender, _name);
    }

    // ============================================================
    // FUNGSI UNTUK KEMENTERIAN / SUPER ADMIN
    // ============================================================

    /**
     * @notice Super Admin menyetujui pendaftaran kampus.
     */
    function approveInstitution(address _wallet) public onlyRole(KEMENTERIAN_ROLE) {
        require(
            institutions[_wallet].status == Status.Pending,
            "CredBlock: Tidak ada aplikasi Pending untuk wallet ini"
        );

        institutions[_wallet].status = Status.Approved;
        emit InstitutionApproved(_wallet, institutions[_wallet].name);
    }

    /**
     * @notice Super Admin menolak pendaftaran kampus.
     */
    function rejectInstitution(address _wallet) public onlyRole(KEMENTERIAN_ROLE) {
        require(
            institutions[_wallet].status == Status.Pending,
            "CredBlock: Tidak ada aplikasi Pending untuk wallet ini"
        );

        institutions[_wallet].status = Status.Rejected;
        emit InstitutionRejected(_wallet, institutions[_wallet].name);
    }

    /**
     * @notice Shortcut bagi Kementerian untuk mendaftarkan kampus langsung tanpa antrian.
     */
    function registerInstitutionDirectly(address _wallet, string memory _name) public onlyRole(KEMENTERIAN_ROLE) {
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

    /**
     * @notice [BARU] Nonaktifkan institusi yang dicabut izin operasionalnya.
     * @dev Kampus yang di-deactivate TIDAK bisa menyimpan hash baru.
     *      Hash lama yang sudah tersimpan TETAP valid (kecuali di-revoke secara individual).
     * @param _wallet Alamat wallet kampus yang akan dinonaktifkan.
     * @param _reason Alasan penonaktifan (misal: "Izin dicabut oleh Kemendikbud").
     */
    function deactivateInstitution(address _wallet, string memory _reason) public onlyRole(KEMENTERIAN_ROLE) {
        require(
            institutions[_wallet].status == Status.Approved || institutions[_wallet].status == Status.Pending,
            "CredBlock: Institusi bukan berstatus Approved/Pending"
        );

        institutions[_wallet].status = Status.Deactivated;
        emit InstitutionDeactivated(_wallet, institutions[_wallet].name, _reason);
    }

    /**
     * @notice [BARU] Mengaktifkan kembali institusi yang sebelumnya dinonaktifkan.
     */
    function reactivateInstitution(address _wallet) public onlyRole(KEMENTERIAN_ROLE) {
        require(
            institutions[_wallet].status == Status.Deactivated,
            "CredBlock: Institusi tidak berstatus Deactivated"
        );

        institutions[_wallet].status = Status.Approved;
        emit InstitutionReactivated(_wallet, institutions[_wallet].name);
    }

    // ============================================================
    // FUNGSI INTI: PENYIMPANAN & VERIFIKASI IJAZAH
    // ============================================================

    /**
     * @notice Menyimpan hash ijazah ke blockchain. Harus dari Kampus berstatus 'Approved'.
     */
    function storeHash(bytes32 _hash) public onlyApprovedInstitution {
        require(hashes[_hash] == address(0), "CredBlock: Hash Ijazah sudah tersimpan sebelumnya");

        hashes[_hash] = msg.sender;
        emit HashStored(_hash, msg.sender, block.timestamp);
    }

    /**
     * @notice Menyimpan BANYAK hash ijazah sekaligus (Bulk).
     * @dev Batas 500 hash per transaksi untuk menghindari Out-of-Gas.
     */
    function storeMultipleHashes(bytes32[] calldata _hashes) public onlyApprovedInstitution {
        require(_hashes.length <= 500, "CredBlock: Maksimal 500 hash per transaksi");

        for (uint256 i = 0; i < _hashes.length; i++) {
            bytes32 currentHash = _hashes[i];
            if (hashes[currentHash] == address(0)) {
                hashes[currentHash] = msg.sender;
                emit HashStored(currentHash, msg.sender, block.timestamp);
            }
        }
    }

    /**
     * @notice [BARU] Mencabut / menganulir hash ijazah yang sudah tersimpan.
     * @dev Bisa dipanggil oleh:
     *      - Kampus penerbit asli (misalnya salah input data)
     *      - Kementerian (misalnya alumni terbukti plagiasi)
     * @param _hash Hash ijazah yang akan dicabut.
     * @param _reason Alasan pencabutan (disimpan di event log untuk audit trail).
     */
    function revokeHash(bytes32 _hash, string memory _reason) public {
        address publisher = hashes[_hash];
        require(publisher != address(0), "CredBlock: Hash tidak ditemukan di blockchain");
        require(!revokedHashes[_hash], "CredBlock: Hash sudah di-revoke sebelumnya");

        // Hanya publisher asli ATAU Kementerian yang boleh revoke
        require(
            msg.sender == publisher || hasRole(KEMENTERIAN_ROLE, msg.sender),
            "CredBlock: Hanya penerbit asli atau Kementerian yang boleh mencabut hash"
        );

        revokedHashes[_hash] = true;
        emit HashRevoked(_hash, msg.sender, _reason, block.timestamp);
    }

    /**
     * @notice Memverifikasi apakah hash ijazah ada di blockchain.
     * @dev Fungsi VIEW (gratis, bisa dipanggil publik).
     *      Sekarang juga mengecek status revokasi.
     * @return isValid Apakah hash ditemukan dan BELUM dicabut
     * @return institutionName Nama kampus penerbit
     * @return publisher Alamat wallet kampus penerbit
     * @return isRevoked Apakah hash sudah dicabut/dianulir
     */
    function verifyHash(bytes32 _hash) public view returns (
        bool isValid,
        string memory institutionName,
        address publisher,
        bool isRevoked
    ) {
        address uploader = hashes[_hash];

        if (uploader != address(0)) {
            string memory campusName = institutions[uploader].name;
            bool revoked = revokedHashes[_hash];
            // isValid = true HANYA jika hash ada DAN belum di-revoke
            return (!revoked, campusName, uploader, revoked);
        } else {
            return (false, "", address(0), false);
        }
    }

    // ============================================================
    // UTILITY HELPERS
    // ============================================================

    /**
     * @notice Mengembalikan daftar semua pelamar.
     */
    function getAllApplicants() public view returns (address[] memory) {
        return allApplicants;
    }

    /**
     * @notice Mengecek apakah sebuah alamat memiliki role Kementerian.
     */
    function isKementerian(address _addr) public view returns (bool) {
        return hasRole(KEMENTERIAN_ROLE, _addr);
    }

    /**
     * @notice Mengembalikan versi kontrak saat ini.
     */
    function getVersion() public view returns (uint256) {
        return contractVersion;
    }

    // ============================================================
    // UUPS UPGRADE AUTHORIZATION
    // ============================================================

    /**
     * @dev Hanya DEFAULT_ADMIN_ROLE yang bisa meng-upgrade contract.
     *      Ini adalah pintu gerbang keamanan utama UUPS.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        contractVersion++;
        emit ContractUpgraded(contractVersion, msg.sender);
    }
}
