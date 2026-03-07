require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.24",
    networks: {
        // Jaringan lokal Hardhat (default, digunakan saat development)
        localhost: {
            url: "http://127.0.0.1:8545",
        },
        // Polygon Amoy Testnet (untuk rilis nyata di Internet Publik)
        amoy: {
            url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/",
            // Dompet Kampus untuk Deployer dan Institusi Utama
            // Ganti PRIVATE_KEY di file .env Anda!
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 80002,
        },
    },
};
