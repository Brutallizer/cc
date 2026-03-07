const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://enswfdlikcgtjlqhgqix.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuc3dmZGxpa2NndGpscWhncWl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg4Mzk5NSwiZXhwIjoyMDg4NDU5OTk1fQ._FU_ky-nSkcEig7fruEn8LJAwf6Q6_JgkmlG1QRAa2Y';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const { data, error } = await supabase
        .from('institutions')
        .select('*');
        
    if (error) {
        console.error("GAGAL MEMBACA:", error);
    } else {
        console.log("Data saat ini ada", data.length, "baris:");
        data.forEach(d => console.log(`- ${d.name} (${d.status})`));
    }
}

checkData();
