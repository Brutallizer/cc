const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("CredBlock V3 — Production Grade", function () {

    let credblock;
    let admin;       // Super Admin (Kementerian)
    let kampus1;     // Kampus resmi
    let kampus2;     // Kampus kedua
    let outsider;    // Orang luar / publik

    // Status Enum mapping
    const Status = {
        NotRegistered: 0n,
        Pending: 1n,
        Approved: 2n,
        Rejected: 3n,
        Deactivated: 4n
    };

    beforeEach(async function () {
        [admin, kampus1, kampus2, outsider] = await ethers.getSigners();

        const CredBlockV3 = await ethers.getContractFactory("CredBlockV3");
        credblock = await upgrades.deployProxy(CredBlockV3, [admin.address], {
            initializer: "initialize",
            kind: "uups"
        });
        await credblock.waitForDeployment();
    });

    // ============================================================
    // 1. DEPLOYMENT & ROLES
    // ============================================================
    describe("1. Deployment & Roles (UUPS + AccessControl)", function () {
        it("Harus berhasil di-deploy sebagai UUPS Proxy", async function () {
            const addr = await credblock.getAddress();
            expect(addr).to.be.properAddress;
        });

        it("Deployer memiliki DEFAULT_ADMIN_ROLE", async function () {
            const DEFAULT_ADMIN = await credblock.DEFAULT_ADMIN_ROLE();
            expect(await credblock.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
        });

        it("Deployer memiliki KEMENTERIAN_ROLE", async function () {
            const KEMENTERIAN = await credblock.KEMENTERIAN_ROLE();
            expect(await credblock.hasRole(KEMENTERIAN, admin.address)).to.be.true;
        });

        it("Versi kontrak awal = 1", async function () {
            expect(await credblock.getVersion()).to.equal(1n);
        });

        it("isKementerian() mengembalikan true untuk admin", async function () {
            expect(await credblock.isKementerian(admin.address)).to.be.true;
        });

        it("isKementerian() mengembalikan false untuk outsider", async function () {
            expect(await credblock.isKementerian(outsider.address)).to.be.false;
        });

        it("Admin bisa menambahkan Kementerian baru (Multi-Admin)", async function () {
            const KEMENTERIAN = await credblock.KEMENTERIAN_ROLE();
            await credblock.grantRole(KEMENTERIAN, kampus2.address);
            expect(await credblock.isKementerian(kampus2.address)).to.be.true;
        });
    });

    // ============================================================
    // 2. SELF-SERVICE REGISTRATION
    // ============================================================
    describe("2. Self-Service Registration", function () {
        it("Siapapun bisa applyForRegistration (Status jadi Pending)", async function () {
            await expect(credblock.connect(kampus1).applyForRegistration("Universitas Indonesia"))
                .to.emit(credblock, "RegistrationApplied")
                .withArgs(kampus1.address, "Universitas Indonesia");

            const inst = await credblock.institutions(kampus1.address);
            expect(inst.status).to.equal(Status.Pending);
        });

        it("Tidak bisa apply jika sudah Pending", async function () {
            await credblock.connect(kampus1).applyForRegistration("UI");
            await expect(credblock.connect(kampus1).applyForRegistration("UI Baru"))
                .to.be.revertedWith("CredBlock: Wallet Anda sudah terdaftar atau dalam antrean Pending");
        });

        it("Menambahkan pelamar ke allApplicants", async function () {
            await credblock.connect(kampus1).applyForRegistration("A");
            await credblock.connect(kampus2).applyForRegistration("B");
            const applicants = await credblock.getAllApplicants();
            expect(applicants.length).to.equal(2);
        });
    });

    // ============================================================
    // 3. KEMENTERIAN APPROVAL WORKFLOW
    // ============================================================
    describe("3. Kementerian Approval Workflow (RBAC)", function () {
        beforeEach(async function () {
            await credblock.connect(kampus1).applyForRegistration("Institut Teknologi Bandung");
            await credblock.connect(kampus2).applyForRegistration("Kampus Abal Abal");
        });

        it("Kementerian bisa approve kampus", async function () {
            await expect(credblock.approveInstitution(kampus1.address))
                .to.emit(credblock, "InstitutionApproved")
                .withArgs(kampus1.address, "Institut Teknologi Bandung");

            const inst = await credblock.institutions(kampus1.address);
            expect(inst.status).to.equal(Status.Approved);
        });

        it("Kementerian bisa reject kampus", async function () {
            await expect(credblock.rejectInstitution(kampus2.address))
                .to.emit(credblock, "InstitutionRejected");

            const inst = await credblock.institutions(kampus2.address);
            expect(inst.status).to.equal(Status.Rejected);
        });

        it("Non-Kementerian TIDAK bisa approve", async function () {
            await expect(credblock.connect(outsider).approveInstitution(kampus1.address))
                .to.be.reverted;
        });

        it("Kampus yang di-reject bisa apply lagi", async function () {
            await credblock.rejectInstitution(kampus2.address);
            await credblock.connect(kampus2).applyForRegistration("Kampus Fix Baru");
            const inst = await credblock.institutions(kampus2.address);
            expect(inst.status).to.equal(Status.Pending);
        });

        it("Kementerian bisa daftarkan langsung (bypass antrian)", async function () {
            await credblock.registerInstitutionDirectly(outsider.address, "Kampus VIP");
            const inst = await credblock.institutions(outsider.address);
            expect(inst.status).to.equal(Status.Approved);
        });
    });

    // ============================================================
    // 4. HASH STORAGE
    // ============================================================
    describe("4. Simpan Hash Ijazah", function () {
        const testHash = ethers.keccak256(ethers.toUtf8Bytes("Ijazah|Ahmad|2024|SI|3.85|2000-01-01"));

        beforeEach(async function () {
            await credblock.connect(kampus1).applyForRegistration("ITB");
            await credblock.approveInstitution(kampus1.address);
        });

        it("Kampus Approved bisa menyimpan hash", async function () {
            await expect(credblock.connect(kampus1).storeHash(testHash))
                .to.emit(credblock, "HashStored");
        });

        it("Kampus Pending TIDAK bisa menyimpan hash", async function () {
            await credblock.connect(kampus2).applyForRegistration("Kampus Baru");
            await expect(credblock.connect(kampus2).storeHash(testHash))
                .to.be.revertedWith("CredBlock: Akses ditolak. Wallet belum di-approve sebagai Institusi resmi.");
        });

        it("Tidak bisa menyimpan hash duplikat", async function () {
            await credblock.connect(kampus1).storeHash(testHash);
            await expect(credblock.connect(kampus1).storeHash(testHash))
                .to.be.revertedWith("CredBlock: Hash Ijazah sudah tersimpan sebelumnya");
        });
    });

    // ============================================================
    // 5. BULK STORE & VERIFIKASI
    // ============================================================
    describe("5. Bulk Store & Verifikasi", function () {
        const h1 = ethers.keccak256(ethers.toUtf8Bytes("Murid 1"));
        const h2 = ethers.keccak256(ethers.toUtf8Bytes("Murid 2"));
        const h3 = ethers.keccak256(ethers.toUtf8Bytes("Murid 3"));

        beforeEach(async function () {
            await credblock.registerInstitutionDirectly(kampus1.address, "Kampus Hebat");
        });

        it("Batch simpan hash dan bypass duplikat", async function () {
            await credblock.connect(kampus1).storeHash(h1);
            await credblock.connect(kampus1).storeMultipleHashes([h1, h2, h3]);

            const [valid1] = await credblock.verifyHash(h1);
            const [valid2] = await credblock.verifyHash(h2);
            const [valid3] = await credblock.verifyHash(h3);
            expect(valid1).to.be.true;
            expect(valid2).to.be.true;
            expect(valid3).to.be.true;
        });

        it("Verifikasi publik akurat (tanpa login)", async function () {
            await credblock.connect(kampus1).storeHash(h2);
            const [isValid, name, publisher, isRevoked] = await credblock.verifyHash(h2);
            expect(isValid).to.be.true;
            expect(name).to.equal("Kampus Hebat");
            expect(publisher).to.equal(kampus1.address);
            expect(isRevoked).to.be.false;
        });

        it("Hash tidak valid diproses elegan", async function () {
            const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake"));
            const [isValid, name, publisher, isRevoked] = await credblock.verifyHash(fakeHash);
            expect(isValid).to.be.false;
            expect(name).to.equal("");
            expect(publisher).to.equal(ethers.ZeroAddress);
            expect(isRevoked).to.be.false;
        });
    });

    // ============================================================
    // 6. HASH REVOCATION (BARU!)
    // ============================================================
    describe("6. Revokasi Hash (Cabut Ijazah)", function () {
        const testHash = ethers.keccak256(ethers.toUtf8Bytes("Ijazah Plagiasi"));

        beforeEach(async function () {
            await credblock.registerInstitutionDirectly(kampus1.address, "Universitas ABC");
            await credblock.connect(kampus1).storeHash(testHash);
        });

        it("Kampus penerbit bisa mencabut hash sendiri", async function () {
            await expect(credblock.connect(kampus1).revokeHash(testHash, "Salah input data"))
                .to.emit(credblock, "HashRevoked");

            const [isValid, , , isRevoked] = await credblock.verifyHash(testHash);
            expect(isValid).to.be.false;
            expect(isRevoked).to.be.true;
        });

        it("Kementerian bisa mencabut hash siapapun", async function () {
            await expect(credblock.revokeHash(testHash, "Alumni terbukti plagiasi"))
                .to.emit(credblock, "HashRevoked");

            const [isValid, , , isRevoked] = await credblock.verifyHash(testHash);
            expect(isValid).to.be.false;
            expect(isRevoked).to.be.true;
        });

        it("Pihak luar TIDAK bisa mencabut hash", async function () {
            await expect(credblock.connect(outsider).revokeHash(testHash, "Coba hack"))
                .to.be.revertedWith("CredBlock: Hanya penerbit asli atau Kementerian yang boleh mencabut hash");
        });

        it("Tidak bisa revoke hash yang sudah di-revoke", async function () {
            await credblock.connect(kampus1).revokeHash(testHash, "Alasan 1");
            await expect(credblock.connect(kampus1).revokeHash(testHash, "Alasan 2"))
                .to.be.revertedWith("CredBlock: Hash sudah di-revoke sebelumnya");
        });

        it("Tidak bisa revoke hash yang tidak ada", async function () {
            const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Tidak Ada"));
            await expect(credblock.revokeHash(fakeHash, "Coba"))
                .to.be.revertedWith("CredBlock: Hash tidak ditemukan di blockchain");
        });

        it("verifyHash mengembalikan isValid=false untuk hash yang di-revoke", async function () {
            await credblock.revokeHash(testHash, "Plagiasi terdeteksi");

            const [isValid, name, publisher, isRevoked] = await credblock.verifyHash(testHash);
            expect(isValid).to.be.false;
            expect(isRevoked).to.be.true;
            // Tapi data tetap tersimpan (untuk audit trail)
            expect(name).to.equal("Universitas ABC");
            expect(publisher).to.equal(kampus1.address);
        });
    });

    // ============================================================
    // 7. INSTITUTION DEACTIVATION (BARU!)
    // ============================================================
    describe("7. Deaktivasi & Reaktivasi Institusi", function () {
        beforeEach(async function () {
            await credblock.registerInstitutionDirectly(kampus1.address, "Kampus Bermasalah");
        });

        it("Kementerian bisa menonaktifkan kampus", async function () {
            await expect(credblock.deactivateInstitution(kampus1.address, "Izin dicabut"))
                .to.emit(credblock, "InstitutionDeactivated");

            const inst = await credblock.institutions(kampus1.address);
            expect(inst.status).to.equal(Status.Deactivated);
        });

        it("Kampus yang dinonaktifkan TIDAK bisa menyimpan hash", async function () {
            await credblock.deactivateInstitution(kampus1.address, "Izin dicabut");
            const hash = ethers.keccak256(ethers.toUtf8Bytes("Test"));
            await expect(credblock.connect(kampus1).storeHash(hash))
                .to.be.revertedWith("CredBlock: Akses ditolak. Wallet belum di-approve sebagai Institusi resmi.");
        });

        it("Kementerian bisa mengaktifkan kembali kampus", async function () {
            await credblock.deactivateInstitution(kampus1.address, "Izin dicabut");
            await expect(credblock.reactivateInstitution(kampus1.address))
                .to.emit(credblock, "InstitutionReactivated");

            const inst = await credblock.institutions(kampus1.address);
            expect(inst.status).to.equal(Status.Approved);
        });

        it("Non-Kementerian TIDAK bisa menonaktifkan kampus", async function () {
            await expect(credblock.connect(outsider).deactivateInstitution(kampus1.address, "Coba"))
                .to.be.reverted;
        });

        it("Hash lama tetap valid setelah kampus dinonaktifkan", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("Ijazah Lama"));
            await credblock.connect(kampus1).storeHash(hash);

            // Nonaktifkan kampus
            await credblock.deactivateInstitution(kampus1.address, "Izin dicabut");

            // Hash lama TETAP valid
            const [isValid, , , isRevoked] = await credblock.verifyHash(hash);
            expect(isValid).to.be.true;
            expect(isRevoked).to.be.false;
        });
    });

    // ============================================================
    // 8. UUPS UPGRADE
    // ============================================================
    describe("8. UUPS Upgrade (Upgradeability)", function () {
        it("Admin bisa meng-upgrade contract", async function () {
            const CredBlockV3_New = await ethers.getContractFactory("CredBlockV3");
            const upgraded = await upgrades.upgradeProxy(await credblock.getAddress(), CredBlockV3_New);
            expect(await upgraded.getVersion()).to.equal(2n);
        });

        it("Non-admin TIDAK bisa meng-upgrade contract", async function () {
            const CredBlockV3_New = await ethers.getContractFactory("CredBlockV3", outsider);
            await expect(
                upgrades.upgradeProxy(await credblock.getAddress(), CredBlockV3_New)
            ).to.be.reverted;
        });

        it("Data TETAP ada setelah upgrade", async function () {
            // Simpan data sebelum upgrade
            await credblock.registerInstitutionDirectly(kampus1.address, "Kampus Tetap");
            const hash = ethers.keccak256(ethers.toUtf8Bytes("Data Persist"));
            await credblock.connect(kampus1).storeHash(hash);

            // Upgrade
            const CredBlockV3_New = await ethers.getContractFactory("CredBlockV3");
            const upgraded = await upgrades.upgradeProxy(await credblock.getAddress(), CredBlockV3_New);

            // Verifikasi data masih ada
            const inst = await upgraded.institutions(kampus1.address);
            expect(inst.name).to.equal("Kampus Tetap");
            expect(inst.status).to.equal(Status.Approved);

            const [isValid] = await upgraded.verifyHash(hash);
            expect(isValid).to.be.true;
        });
    });
});
