/**
 * Unit Test untuk Smart Contract CertiChain
 * 
 * FUNGSI:
 * Memastikan semua fungsi smart contract bekerja dengan benar
 * sebelum di-deploy ke testnet/mainnet.
 * 
 * CARA JALANKAN:
 * npx hardhat test
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertiChain", function () {

    let certichain;  // Instance smart contract
    let admin;       // Akun admin (deployer)
    let otherUser;   // Akun non-admin (untuk test access control)

    /**
     * beforeEach: Dijalankan sebelum SETIAP test case.
     * Deploy contract baru agar setiap test dimulai dari state bersih.
     */
    beforeEach(async function () {
        // Ambil dua akun test dari Hardhat
        [admin, otherUser] = await ethers.getSigners();

        // Deploy contract CertiChain
        const CertiChain = await ethers.getContractFactory("CertiChain");
        certichain = await CertiChain.deploy();
        await certichain.waitForDeployment();
    });

    // ============================================================
    // TEST: Deployment & Registration
    // ============================================================
    describe("Deployment & Registration", function () {
        it("Harus menetapkan deployer sebagai admin", async function () {
            // Cek apakah admin address di contract = deployer address
            expect(await certichain.admin()).to.equal(admin.address);
        });

        it("Admin harus bisa mendaftarkan institusi baru", async function () {
            await certichain.registerInstitution(admin.address, "Universitas Testing");
            const name = await certichain.institutions(admin.address);
            expect(name).to.equal("Universitas Testing");
        });

        it("Non-admin tidak boleh mendaftarkan institusi", async function () {
            await expect(certichain.connect(otherUser).registerInstitution(otherUser.address, "Hacker Univ"))
                .to.be.revertedWith("CertiChain: Hanya admin yang dapat menyimpan hash");
        });
    });

    // ============================================================
    // TEST: Store Hash (Simpan Hash)
    // ============================================================
    describe("Store Hash", function () {
        beforeEach(async function () {
            // Daftarkan admin sbg institusi sebelum test storeHash jalan
            await certichain.registerInstitution(admin.address, "Universitas Indonesia");
        });

        it("Admin yang terdaftar harus bisa menyimpan hash baru", async function () {
            // Buat contoh hash (simulasi SHA-256 dari data mahasiswa)
            const testHash = ethers.keccak256(ethers.toUtf8Bytes("John Doe|12345|Sistem Informasi|3.85|2000-01-15"));

            // Simpan hash ke blockchain dan cek event
            const tx = await certichain.storeHash(testHash);
            await tx.wait();

            // Pastikan event HashStored ter-emit
            await expect(tx).to.emit(certichain, "HashStored");
        });

        it("Gagal jika institusi belum terdaftar (meskipun dia admin)", async function () {
            const testHash = ethers.keccak256(ethers.toUtf8Bytes("Unregistered"));

            // Kita pakai contract baru dimana admin belum diregister
            const CertiChain = await ethers.getContractFactory("CertiChain");
            const newContract = await CertiChain.deploy();

            await expect(newContract.storeHash(testHash))
                .to.be.revertedWith("CertiChain: Alamat Anda belum terdaftar sebagai institusi");
        });

        it("Harus gagal jika hash sudah tersimpan (duplikat)", async function () {
            const testHash = ethers.keccak256(ethers.toUtf8Bytes("Duplicate Test"));

            // Simpan hash pertama kali → sukses
            await certichain.storeHash(testHash);

            // Simpan hash yang sama lagi → harus GAGAL
            await expect(certichain.storeHash(testHash))
                .to.be.revertedWith("CertiChain: Hash sudah tersimpan sebelumnya");
        });

        it("Gagal menyimpan hash public jika belum terdaftar institusi", async function () {
            const testHash = ethers.keccak256(ethers.toUtf8Bytes("Unauthorized Test"));

            // otherUser mencoba menyimpan hash → harus GAGAL karena belum terdaftar di `institutions`
            await expect(certichain.connect(otherUser).storeHash(testHash))
                .to.be.revertedWith("CertiChain: Alamat Anda belum terdaftar sebagai institusi");
        });
    });

    // ============================================================
    // TEST: Bulk Store Hashes
    // ============================================================
    describe("Bulk Store Hashes", function () {
        beforeEach(async function () {
            await certichain.registerInstitution(admin.address, "Universitas Indonesia");
        });

        it("Admin terdaftar harus bisa menyimpan banyak hash sekaligus", async function () {
            const hash1 = ethers.keccak256(ethers.toUtf8Bytes("Mahasiswa 1"));
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("Mahasiswa 2"));
            const hash3 = ethers.keccak256(ethers.toUtf8Bytes("Mahasiswa 3"));

            const hashes = [hash1, hash2, hash3];

            // Simpan semua hash sekaligus
            const tx = await certichain.storeMultipleHashes(hashes);
            await tx.wait();

            // Verifikasi bahwa semua hash berhasil tersimpan
            const res1 = await certichain.verifyHash(hash1);
            expect(res1[0]).to.equal(true);
            const res2 = await certichain.verifyHash(hash2);
            expect(res2[0]).to.equal(true);
            const res3 = await certichain.verifyHash(hash3);
            expect(res3[0]).to.equal(true);
        });

        it("Harus mengabaikan hash duplikat saat bulk store", async function () {
            const hash1 = ethers.keccak256(ethers.toUtf8Bytes("Simpan Dulu"));
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("Baru"));

            await certichain.storeHash(hash1);

            const hashes = [hash1, hash2];
            const tx = await certichain.storeMultipleHashes(hashes);
            await tx.wait();

            const result = await certichain.verifyHash(hash2);
            expect(result[0]).to.equal(true);
        });
    });

    // ============================================================
    // TEST: Verify Hash (Verifikasi Hash & Nama Kampus)
    // ============================================================
    describe("Verify Hash", function () {
        beforeEach(async function () {
            await certichain.registerInstitution(admin.address, "Universitas Indonesia");
        });

        it("Harus mengembalikan TRUE, Nama Kampus, dan Address untuk hash yang tersimpan", async function () {
            const testHash = ethers.keccak256(ethers.toUtf8Bytes("Valid Certificate"));

            await certichain.storeHash(testHash);

            const [isValid, campusName, publisher] = await certichain.verifyHash(testHash);

            expect(isValid).to.equal(true);
            expect(campusName).to.equal("Universitas Indonesia");
            expect(publisher).to.equal(admin.address);
        });

        it("Harus mengembalikan FALSE dan data kosong untuk hash yang BELUM tersimpan", async function () {
            const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake Certificate"));

            const [isValid, campusName, publisher] = await certichain.verifyHash(fakeHash);

            expect(isValid).to.equal(false);
            expect(campusName).to.equal("");
            expect(publisher).to.equal(ethers.ZeroAddress);
        });

        it("Siapa saja (termasuk non-admin) bisa memverifikasi hash", async function () {
            const testHash = ethers.keccak256(ethers.toUtf8Bytes("Public Verify Test"));

            await certichain.storeHash(testHash);

            // Verifikasi menggunakan koneksi otherUser (non-admin)
            const [isValid] = await certichain.connect(otherUser).verifyHash(testHash);
            expect(isValid).to.equal(true);
        });
    });
});
