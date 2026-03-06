const { ethers } = require('ethers');

async function testE2E() {
    console.log("=========================================");
    console.log("   CREDBLOCK AMOY E2E INTEGRATION TEST ");
    console.log("=========================================");

    const provider = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology/");
    // Alamat V2 yang baru di-deploy
    const CONTRACT_ADDRESS = "0xF20276816FDEb9f76Bd385086CEB8e44826B689b";
    const PRIVATE_KEY = process.env.PRIVATE_KEY; // Gunakan .env agar aman
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);

    const ABI = [
        "function verifyHash(bytes32 _hash) view returns (bool isValid, string memory institutionName, address publisher)",
        "function institutions(address) view returns(string name, uint8 status)",
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
