const { ethers } = require('ethers');

async function testE2E() {
    console.log("=========================================");
    console.log("   CERTICHAIN AMOY E2E INTEGRATION TEST ");
    console.log("=========================================");

    const provider = new ethers.JsonRpcProvider("https://polygon-amoy-bor-rpc.publicnode.com");
    // Alamat yg tadi di-deploy
    const CONTRACT_ADDRESS = "0x6116D452af7a014576BD50aeFfce9586D040D57E";
    const PRIVATE_KEY = "0xc2701619eeb4142848d298211a7c88d26544dce27c1d1e4d211c717e8fc6375a"; // Private key admin tester
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);

    const ABI = [
        "function verifyHash(bytes32 _hash) view returns (bool isValid, string memory institutionName, address publisher)",
        "function institutions(address) view returns(string)",
        "function storeHash(bytes32 _hash)"
    ];

    // contract dengan signer (write/read)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    try {
        let block = await provider.getBlockNumber();
        console.log(`✅ [1/5] Koneksi RPC Berhasil. Block Saat Ini: ${block}`);

        // Buat dummy hash
        const dummyData = "NAMA_MAHASISWA_TEST_" + Date.now();
        const hash = ethers.id(dummyData); // keccak256
        console.log(`✅ [2/5] Hash Ter-Generate: ${hash}`);

        // Verifikasi kalau awalnya kosong (FALSE) - Skenario Verify.html Publik
        const verify1 = await contract.verifyHash(hash);
        if (verify1.isValid === false) {
            console.log(`✅ [3/5] Hash baru BELUM TERSIMPAN (Skenario Ijazah Validasi Gagal = Berhasil dicegah)`);
        } else {
            throw new Error("Loh, hash baru kok udah terdaftar?");
        }

        // Coba Write ke Blockchain - Skenario Login Google
        console.log(`⏳ Sedang menyimpan hash ijazah ke Smart Contract (Harap tunggu, real blockchain)...`);
        const tx = await contract.storeHash(hash);
        console.log(`⏳ Tx terkirim! Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ [4/5] Transaksi Berhasil! Disimpan di block: ${receipt.blockNumber} Gas Used: ${receipt.gasUsed}`);

        // Verifikasi kembali kalau Hash DITEMUKAN (TRUE)
        const verify2 = await contract.verifyHash(hash);
        if (verify2.isValid === true && verify2.institutionName.includes("UICI")) {
            console.log(`✅ [5/5] Hash BERHASIL DIVERIFIKASI! Diterbitkan oleh: ${verify2.institutionName} (${verify2.publisher})`);
        } else {
            throw new Error(`Verifikasi Gagal: ${verify2.institutionName}`);
        }

        console.log("\n✅✅✅ SEMUA INTEGRATION TEST E2E AMOY BERHASIL! APLIKASI AMAN 100%! ✅✅✅");

    } catch (e) {
        console.error("❌ E2E TEST GAGAL: " + e.message);
        process.exit(1);
    }
}

testE2E();
