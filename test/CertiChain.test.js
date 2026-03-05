const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertiChain V2", function () {

    let certichain;
    let admin;
    let kampus1;
    let kampus2;

    // Status Enum mapping for easy checking
    const Status = {
        NotRegistered: 0n,
        Pending: 1n,
        Approved: 2n,
        Rejected: 3n
    };

    beforeEach(async function () {
        [admin, kampus1, kampus2] = await ethers.getSigners();

        const CertiChain = await ethers.getContractFactory("CertiChain");
        certichain = await CertiChain.deploy();
        await certichain.waitForDeployment();
    });

    describe("1. Deployment & Roles", function () {
        it("Harus menetapkan deployer sebagai admin kementerian", async function () {
            expect(await certichain.admin()).to.equal(admin.address);
        });
    });

    describe("2. Self-Service Registration Workflow", function () {
        it("Harus memperbolehkan siapapun untuk applyForRegistration (Status jadi Pending)", async function () {
            await expect(certichain.connect(kampus1).applyForRegistration("Universitas Telkom"))
                .to.emit(certichain, "RegistrationApplied")
                .withArgs(kampus1.address, "Universitas Telkom");

            const req = await certichain.institutions(kampus1.address);
            expect(req.name).to.equal("Universitas Telkom");
            expect(req.status).to.equal(Status.Pending);
        });

        it("Tidak memperbolehkan apply jika sudah Pending atau Approved", async function () {
            await certichain.connect(kampus1).applyForRegistration("Universitas A");

            await expect(certichain.connect(kampus1).applyForRegistration("Universitas Baru"))
                .to.be.revertedWith("CertiChain: Wallet Anda sudah terdaftar atau dalam antrean Pending");
        });

        it("Harus menambahkan alamat pelamar ke array allApplicants", async function () {
            await certichain.connect(kampus1).applyForRegistration("Kampus A");
            await certichain.connect(kampus2).applyForRegistration("Kampus B");

            const applicants = await certichain.getAllApplicants();
            expect(applicants.length).to.equal(2);
            expect(applicants[0]).to.equal(kampus1.address);
            expect(applicants[1]).to.equal(kampus2.address);
        });
    });

    describe("3. Kementerian Approval Workflow", function () {
        beforeEach(async function () {
            await certichain.connect(kampus1).applyForRegistration("Institut Pertanian Bogor");
            await certichain.connect(kampus2).applyForRegistration("Kampus Abal Abal");
        });

        it("Hanya Admin yang bisa meng-approve (mengubah status ke Approved)", async function () {
            await expect(certichain.approveInstitution(kampus1.address))
                .to.emit(certichain, "InstitutionApproved")
                .withArgs(kampus1.address, "Institut Pertanian Bogor");

            const inst = await certichain.institutions(kampus1.address);
            expect(inst.status).to.equal(Status.Approved);
        });

        it("Hanya Admin yang bisa menolak / reject", async function () {
            await expect(certichain.rejectInstitution(kampus2.address))
                .to.emit(certichain, "InstitutionRejected")
                .withArgs(kampus2.address, "Kampus Abal Abal");

            const inst = await certichain.institutions(kampus2.address);
            expect(inst.status).to.equal(Status.Rejected);
        });

        it("Non-admin tidak bisa approve", async function () {
            await expect(certichain.connect(kampus2).approveInstitution(kampus1.address))
                .to.be.revertedWith("CertiChain: Akses ditolak. Hanya Kementerian (Super Admin) yang diizinkan.");
        });

        it("Kampus yang di-reject bisa applyForRegistration lagi", async function () {
            await certichain.rejectInstitution(kampus2.address);

            // Reject -> Pending
            await certichain.connect(kampus2).applyForRegistration("Kampus Abal Abal Fix");
            const req = await certichain.institutions(kampus2.address);
            expect(req.status).to.equal(Status.Pending);
        });

        it("Admin bisa bypass antrian dengan mendaftarkan langsung secara manual", async function () {
            await certichain.registerInstitutionDirectly(admin.address, "Kementerian Pusat");
            const req = await certichain.institutions(admin.address);
            expect(req.status).to.equal(Status.Approved);
        });
    });

    describe("4. Simpan Hash Ijazah (Hanya Kampus Ter-Approve)", function () {
        const testHash = ethers.keccak256(ethers.toUtf8Bytes("Ijazah123"));

        beforeEach(async function () {
            // Setup Kampus 1 (Approved)
            await certichain.connect(kampus1).applyForRegistration("ITB");
            await certichain.approveInstitution(kampus1.address);

            // Setup Kampus 2 (Pending - belum approve)
            await certichain.connect(kampus2).applyForRegistration("Kampus Baru");
        });

        it("Kampus dengan status Approved bisa menyimpan Hash", async function () {
            await expect(certichain.connect(kampus1).storeHash(testHash))
                .to.emit(certichain, "HashStored")
                .withArgs(testHash, kampus1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
        });

        it("Kampus dengan status Pending TIDAK BISA menyimpan Hash", async function () {
            await expect(certichain.connect(kampus2).storeHash(testHash))
                .to.be.revertedWith("CertiChain: Akses ditolak. Wallet belum di-approve sebagai Institusi resmi.");
        });

        it("Tidak bisa menyimpan Hash duplikat", async function () {
            await certichain.connect(kampus1).storeHash(testHash);
            await expect(certichain.connect(kampus1).storeHash(testHash))
                .to.be.revertedWith("CertiChain: Hash Ijazah sudah tersimpan sebelumnya");
        });
    });

    describe("5. Bulk Store dan Verifikasi Ijazah", function () {
        const testHash1 = ethers.keccak256(ethers.toUtf8Bytes("Murid 1"));
        const testHash2 = ethers.keccak256(ethers.toUtf8Bytes("Murid 2"));
        const testHash3 = ethers.keccak256(ethers.toUtf8Bytes("Murid 3"));

        beforeEach(async function () {
            await certichain.registerInstitutionDirectly(kampus1.address, "Kampus Hebat");
        });

        it("Batch Simpan Hash berhasil dan mem-bypass duplikat", async function () {
            // Simpan hash1 lebih dulu
            await certichain.connect(kampus1).storeHash(testHash1);

            // Coba simpan 1, 2, 3 sekaligus (1 adalah duplikat)
            await certichain.connect(kampus1).storeMultipleHashes([testHash1, testHash2, testHash3]);

            const res1 = await certichain.verifyHash(testHash1);
            expect(res1[0]).to.be.true;

            const res2 = await certichain.verifyHash(testHash2);
            expect(res2[0]).to.be.true;

            const res3 = await certichain.verifyHash(testHash3);
            expect(res3[0]).to.be.true;
        });

        it("Siapa saja bisa memverifikasi hash secara akurat (Publik / Tanpa Login)", async function () {
            await certichain.connect(kampus1).storeHash(testHash2);

            // Verifikasi menggunakan wallet admin (Public Actor)
            const [isValid, name, publisher] = await certichain.verifyHash(testHash2);
            expect(isValid).to.be.true;
            expect(name).to.equal("Kampus Hebat");
            expect(publisher).to.equal(kampus1.address);
        });

        it("Has tidak valid diproses dengan elegan (Tidak error/revert)", async function () {
            const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake"));
            const [isValid, name, publisher] = await certichain.verifyHash(fakeHash);
            expect(isValid).to.be.false;
            expect(name).to.equal("");
            expect(publisher).to.equal(ethers.ZeroAddress);
        });
    });
});
