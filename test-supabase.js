const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://enswfdlikcgtjlqhgqix.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuc3dmZGxpa2NndGpscWhncWl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg4Mzk5NSwiZXhwIjoyMDg4NDU5OTk1fQ._FU_ky-nSkcEig7fruEn8LJAwf6Q6_JgkmlG1QRAa2Y';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
    console.log("Mencoba koneksi ke Supabase...");
    
    // 1. Coba ambil data (untuk melihat apakah tabel institutions ada)
    const { data: readData, error: readError } = await supabase
        .from('institutions')
        .select('*')
        .limit(1);

    if (readError) {
        console.error("ERROR MEMBACA TABEL:", readError);
        return;
    }
    console.log("BERHASIL MEMBACA TABEL. Data saat ini:", readData);

    // 2. Coba insert data dummy
    const dummyData = {
        wallet: "0xTest" + Math.floor(Math.random() * 1000),
        name: "Kampus Uji Coba Fakta",
        short_name: "KUF",
        sk: "123",
        akreditasi: "A",
        website: "http://test.com",
        email: "test@test.com",
        address: "Jalan Fakta",
        status: "pending"
    };

    console.log("Mencoba insert data:", dummyData);
    const { data: insertData, error: insertError } = await supabase
        .from('institutions')
        .upsert(dummyData, { onConflict: 'wallet' });

    if (insertError) {
        console.error("ERROR INSERT DATA:", insertError);
    } else {
        console.log("SUKSES INSERT DATA!");
    }
}

testSupabase();
