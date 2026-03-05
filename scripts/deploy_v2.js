const hre = require("hardhat");
const fs = require("fs");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const bal = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(bal), "MATIC");

    // Estimated cost: 2,000,000 gas * 30 gwei = 0.06 MATIC (cukup)
    // Let's check if we have enough
    const gasLimit = 2500000n;
    const maxFeePerGas = hre.ethers.parseUnits("30", "gwei");
    const maxPriorityFeePerGas = hre.ethers.parseUnits("26", "gwei");

    const maxCost = gasLimit * maxFeePerGas;
    console.log("Max deploy cost:", hre.ethers.formatEther(maxCost), "MATIC");

    if (bal < maxCost) {
        console.log("WARNING: Balance may be insufficient! Need ~" + hre.ethers.formatEther(maxCost) + " MATIC");
        console.log("Try getting testnet MATIC from https://faucet.polygon.technology/");
        return;
    }

    const C = await hre.ethers.getContractFactory("CertiChain");

    console.log("Deploying CertiChain V2...");
    const c = await C.deploy({
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
    });

    console.log("Tx hash:", c.deploymentTransaction().hash);
    console.log("Waiting for confirmation...");
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("CONTRACT DEPLOYED:", addr);

    // Register admin
    console.log("Registering admin...");
    const tx = await c.registerInstitutionDirectly(deployer.address, "Kementerian Pusat", {
        gasLimit: 200000,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
    });
    await tx.wait();
    console.log("Admin registered!");

    fs.writeFileSync("deployed_address.txt", addr, "utf8");
    console.log("DONE! NEW_CONTRACT=" + addr);

    const newBal = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Remaining:", hre.ethers.formatEther(newBal), "MATIC");
}

main().then(() => process.exit(0)).catch(e => { console.error("ERROR:", e.message); process.exit(1); });
