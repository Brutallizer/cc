const { ethers } = require("ethers");
const { createClient } = require('@supabase/supabase-js');

const CONTRACT_ADDRESS = "0x830c4Eb9669adF6DeA3c1AeE702AB4f77a865d27";
const RPC_URL = "https://rpc-amoy.polygon.technology/";
const ABI = [
    "function getAllApplicants() view returns (address[])",
    "function institutions(address) view returns (string name, uint8 status)"
];

const supabaseUrl = 'https://enswfdlikcgtjlqhgqix.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuc3dmZGxpa2NndGpscWhncWl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg4Mzk5NSwiZXhwIjoyMDg4NDU5OTk1fQ._FU_ky-nSkcEig7fruEn8LJAwf6Q6_JgkmlG1QRAa2Y';
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeAndSync() {
    console.log("Menghubungkan ke Polygon Amoy...");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    
    console.log("Mengambil semua pendaftar dari Blockchain...");
    const applicants = await contract.getAllApplicants();
    console.log(`Ditemukan ${applicants.length} pendaftar di Blockchain:`, applicants);
    
    const walletsToInsert = [];
    
    for (let wallet of applicants) {
        const data = await contract.institutions(wallet);
        console.log(`- ${wallet}: ${data[0]} (Status: ${data[1]})`);
        
        let statusStr = 'pending';
        if (data[1] == 2n) statusStr = 'approved';
        if (data[1] == 3n) statusStr = 'rejected';
        if (data[1] == 4n) statusStr = 'deactivated';
        
        walletsToInsert.push({
            wallet: wallet.toLowerCase(),
            name: data[0],
            short_name: data[0].substring(0, 5),
            sk: "SK-RECOVERY",
            akreditasi: "B",
            website: "-",
            email: "recovery@test.com",
            address: "Data Dipulihkan dari Blockchain",
            status: statusStr
        });
    }
    
    console.log("Memasukkan data yang hilang ke Supabase...");
    const { error } = await supabase.from('institutions').upsert(walletsToInsert, { onConflict: 'wallet' });
    
    if (error) {
        console.error("Gagal sinkronisasi ke Supabase:", error);
    } else {
        console.log("✅ Berhasil menyinkronkan data Blockchain ke Supabase!");
    }
}

analyzeAndSync();
