/**
 * Script Deployment CredBlock
 * 
 * FUNGSI:
 * Men-deploy smart contract CredBlock ke jaringan blockchain.
 * Bisa digunakan untuk jaringan lokal (Hardhat node) maupun testnet (Polygon Amoy).
 * 
 * CARA PAKAI:
 * 1. Jaringan lokal:  npx hardhat run scripts/deploy.js --network localhost
 * 2. Polygon Amoy:    npx hardhat run scripts/deploy.js --network amoy
 */

const hre = require("hardhat");

async function main() {
    console.log("==============================================");
    console.log("  CredBlock - Deployment Script");
    console.log("==============================================\n");

    // Ambil akun deployer (akun pertama dari konfigurasi network)
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer address:", deployer.address);

    // Ambil saldo deployer untuk memastikan cukup gas fee
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH\n");

    // Deploy contract CredBlock
    console.log("Deploying CredBlock contract...");
    const CredBlock = await hre.ethers.getContractFactory("CredBlock");
    const credblock = await CredBlock.deploy();

    // Tunggu sampai contract ter-deploy dan terkonfirmasi
    await credblock.waitForDeployment();

    // Ambil alamat contract yang sudah ter-deploy
    const contractAddress = await credblock.getAddress();

    // Registrasi otomatis dompet deployer sebagai institusi kampus Kementerian
    console.log("Mendaftarkan deployer sebagai institusi 'Kementerian (SuperAdmin)'...");
    const regTx = await credblock.registerInstitutionDirectly(deployer.address, "Kementerian Pusat");
    await regTx.wait();

    console.log("\n==============================================");
    console.log("  DEPLOYMENT BERHASIL!");
    console.log("==============================================");
    console.log("Contract Address:", contractAddress);
    console.log("Admin Address:  ", deployer.address);
    console.log("==============================================\n");

    // PENTING: Catat alamat contract ini!
    // Alamat ini dibutuhkan oleh frontend (app.js & verify.js)
    // untuk berinteraksi dengan smart contract.
    console.log("CATATAN: Salin Contract Address di atas ke file frontend/js/app.js dan frontend/js/verify.js");
}

// Jalankan fungsi main dan handle error
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment gagal:", error);
        process.exit(1);
    });
