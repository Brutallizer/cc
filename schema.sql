-- 🚀 SCHEMA DATABASE UNTUK SUPABASE
-- Silakan jalankan script SQL ini di SQL Editor Supabase Anda.

-- Menghapus tabel jika sudah ada (hati-hati di production!)
DROP TABLE IF EXISTS institutions;

-- Membuat tabel utama untuk metadata institusi/kampus
CREATE TABLE institutions (
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

-- Membuat fungsi trigger untuk otomatis mengupdate kolom updated_at setiap ada perubahan data
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Menerapkan trigger pada tabel institutions
CREATE TRIGGER update_institutions_updated_at
BEFORE UPDATE ON institutions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Mengaktifkan Row Level Security (RLS) agar aman dari serangan publik langsung
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- Memberi izin BACA (SELECT) untuk publik (karena data kampus bersifat transparan)
CREATE POLICY "Publik boleh melihat data kampus"
ON institutions FOR SELECT
TO authenticated, anon
USING (true);

-- Memberi izin INSERT/UPDATE HANYA via Server (Service Role / API Vercel)
-- Perhatian: Vercel /api/ API akan menggunakan KEY khusus sehingga bypass RLS
