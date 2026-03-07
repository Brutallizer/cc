/**
 * deploy_v3.js — Deploy CredBlock V3 sebagai UUPS Proxy
 * 
 * CARA PAKAI:
 *   Lokal:   npx hardhat run scripts/deploy_v3.js --network localhost
 *   Amoy:    npx hardhat run scripts/deploy_v3.js --network amoy
 * 
 * PERBEDAAN DENGAN deploy.js / deploy_v2.js:
 *   → Menggunakan upgrades.deployProxy() untuk membuat Proxy Contract
 *   → Contract bisa di-upgrade di masa depan tanpa kehilangan data
 */

const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║       CredBlock V3 — UUPS Proxy Deployment      ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
    console.log("📍 Deployer (Super Admin):", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH/MATIC");
    console.log("");

    // Deploy sebagai UUPS Proxy
    console.log("⏳ Deploying CredBlockV3 sebagai UUPS Proxy...");
    const CredBlockV3 = await ethers.getContractFactory("CredBlockV3");
    const proxy = await upgrades.deployProxy(CredBlockV3, [deployer.address], {
        initializer: "initialize",
        kind: "uups"
    });

    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("");
    console.log("✅ Deployment Berhasil!");
    console.log("┌──────────────────────────────────────────────────┐");
    console.log("│  Proxy Address    :", proxyAddress);
    console.log("│  Impl. Address    :", implAddress);
    console.log("│  Contract Version :", (await proxy.getVersion()).toString());
    console.log("│  Super Admin      :", deployer.address);
    console.log("└──────────────────────────────────────────────────┘");
    console.log("");

    // Verifikasi role
    const isAdmin = await proxy.hasRole(await proxy.DEFAULT_ADMIN_ROLE(), deployer.address);
    const isKementerian = await proxy.isKementerian(deployer.address);
    console.log("🔐 Role Check:");
    console.log("   DEFAULT_ADMIN_ROLE :", isAdmin ? "✅" : "❌");
    console.log("   KEMENTERIAN_ROLE   :", isKementerian ? "✅" : "❌");
    console.log("");

    // Simpan alamat ke file
    const fs = require("fs");
    const deployInfo = `PROXY_ADDRESS=${proxyAddress}\nIMPL_ADDRESS=${implAddress}\nDEPLOYER=${deployer.address}\nVERSION=1\nTIMESTAMP=${new Date().toISOString()}\n`;

    fs.writeFileSync("deployed_v3.txt", deployInfo);
    console.log("📝 Info deployment disimpan di deployed_v3.txt");

    console.log("");
    console.log("════════════════════════════════════════════════════");
    console.log("  SELANJUTNYA:");
    console.log("  1. Update CONTRACT_ADDRESS di frontend/js/*.js");
    console.log("     dengan Proxy Address di atas.");
    console.log("  2. Update ABI di frontend jika ada perubahan fungsi.");
    console.log("════════════════════════════════════════════════════");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment gagal:", error);
        process.exit(1);
    });
