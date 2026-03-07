const https = require('https');

const PAT = 'sbp_b2b646840602c41d119ffffaf211c2c4921a2bee';
const REF = 'enswfdlikcgtjlqhgqix';

const query = `
-- Membuat tabel utama
CREATE TABLE IF NOT EXISTS institutions (
    wallet TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    sk TEXT,
    akreditasi TEXT,
    website TEXT,
    email TEXT,
    address TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Membuat fungsi trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Menerapkan trigger
DROP TRIGGER IF EXISTS update_institutions_updated_at ON institutions;
CREATE TRIGGER update_institutions_updated_at
BEFORE UPDATE ON institutions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Mengaktifkan RLS
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- Memberi izin
DROP POLICY IF EXISTS "Publik boleh melihat data kampus" ON institutions;
CREATE POLICY "Publik boleh melihat data kampus"
ON institutions FOR SELECT TO authenticated, anon USING (true);
`;

const postData = JSON.stringify({ query: query });

const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${REF}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PAT}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });
  res.on('end', () => {
    console.log('RESPONSE:', responseBody);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
