const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://enswfdlikcgtjlqhgqix.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuc3dmZGxpa2NndGpscWhncWl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg4Mzk5NSwiZXhwIjoyMDg4NDU5OTk1fQ._FU_ky-nSkcEig7fruEn8LJAwf6Q6_JgkmlG1QRAa2Y';
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncOldData() {
    console.log("Membaca data lama dari institutions.json...");
    try {
        const rawdata = fs.readFileSync('frontend/data/institutions.json');
        const db = JSON.parse(rawdata);
        
        const institutionsToInsert = [];
        for (const [wallet, data] of Object.entries(db)) {
            institutionsToInsert.push({
                wallet: wallet.toLowerCase(), // Normalisasi wallet ke lowercase agar konsisten dengan smart contract return
                name: data.name,
                short_name: data.shortName,
                address: data.address,
                akreditasi: data.accreditation,
                website: data.website,
                email: data.email,
                // Kita anggap sk kosongi dulu atau isi "SK-LAMA"
                sk: "Data Lama (Imported)",
                // Semua yang ada di file json lama ini asumsikan sudah 'approved'
                status: 'approved'
            });
        }
        
        console.log(`Ada ${institutionsToInsert.length} kampus lama yang akan diimport.`);
        
        const { data, error } = await supabase
            .from('institutions')
            .upsert(institutionsToInsert, { onConflict: 'wallet' });
            
        if (error) {
            console.error("GAGAL IMPORT!", error);
        } else {
            console.log("✅ BERHASIL MENGIMPORT SEMUA DATA LAMA KE SUPABASE!");
        }
        
    } catch (e) {
        console.error("Error reading file:", e);
    }
}

syncOldData();
