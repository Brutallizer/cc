# 🎓 SKENARIO PRESENTASI CREDBLOCK TERBARU (100% LOKAL)

Skenario ini disusun KHUSUS untuk kelancaran Ujian Tugas Akhir Anda menggunakan lingkungan **Localhost** agar terbebas dari masalah Gas Fee habis atau Internet lelet.

---

## 🛠️ TEKNOLOGI YANG DIGUNAKAN (TECH STACK)
*Jika dosen bertanya "Aplikasi ini dibangun pakai apa saja?", ini contekan jawabannya:*

1. **Smart Contract:** `Solidity v0.8.24` (Bahasa pemrograman mutlak standar industri untuk Ethereum/EVM-compatible blockchain).
2. **Local Blockchain & Testing:** `Hardhat v2` (Kerangka kerja untuk mensimulasikan blockchain utuh di komputer lokal, lengkap dengan 10.000 ETH gratis untuk pengujian).
3. **Frontend (Tampilan Web):** HTML5, Vanilla JavaScript, dan `TailwindCSS` (via CDN untuk layout responsif dan bersih).
4. **Web3 Integration:** `Ethers.js v6` (Library JavaScript yang bertugas mengonversi *klik tombol* di website menjadi transaksi nyata ke node Blockchain).
5. **Cryptography Hash:** `Web Crypto API` (Menggunakan pemrosesan SHA-256 bawaan dari browser tanpa library pihak ketiga, menjamin keamanan tingkat tinggi secara gratis dan cepat).

---

## 🔌 PERSIAPAN 1 MENIT (LAKUKAN SEBELUM SIDANG DIMULAI)
1. Buka folder `D:\KULIAH\Tugas_akhir` di VS Code.
2. Buka **Terminal 1**, ketik: `npx hardhat node` (Biarkan nyala terus, ini adalah "Server Blockchain"-mu).
3. Buka **Terminal 2**, ketik: `npx hardhat run scripts/deploy.js --network localhost` (Ini untuk mengaktifkan kode ke blockchain).
4. Buka **Terminal 3**, ketik: `npx serve frontend -l 3000` (Ini untuk menyalakan websitenya).
5. Buka Browser (Chrome/Edge), buka 2 tab bersebelahan:
   - **Tab 1 (Dashboard Admin Kampus):** `http://localhost:3000`
   - **Tab 2 (Portal Verifikasi HRD):** `http://localhost:3000/verify.html`

---

## 🚀 DEMO DIMULAI (SKRIP PRESENTASI & FITUR)

### 👨‍🏫 TAHAP 1: FITUR OTENTIKASI (ACCOUNT ABSTRACTION)
*(Buka layar Terminal & Browser ke `http://localhost:3000`)*
> **Skrip Anda:** "Bapak/Ibu Dosen, ini adalah CredBlock. Berbeda dengan aplikasi jadul yang butuh Username dan Password, aplikasi Web3 ini menggunakan konsep *Smart Wallet*."
1. Klik tombol **"Sign in with Google"**.
2. *Poin Fitur:* **Automated Wallet Injection**. Jelaskan bahwa di belakang layar, sistem otomatis menyuntikkan Private Key kampus untuk mengubah browser ini menjadi *Node Transaksi*.
3. Tunjukkan di navbar kanan ada tulisan **"Terhubung" (Warna Hijau)** dan teks **"0xf39F..."**.

### 👨‍🏫 TAHAP 2: FITUR INPUT MANUAL & KRIPTOGRAFI
> **Skrip Anda:** "Konsep utama aplikasi ini adalah: kita TIDAK pernah mengunggah PDF ijazah asli ke Blockchain, karena itu mahal dan melanggar privasi. Kita hanya mengirimkan DDNA atau 'Sidik Jari' dari ijazah tersebut."
1. Pada bagian Form Ijazah, ketik data ini:
   - **Nama:** Ahmad Fauzan
   - **NIM:** 2024110001
   - **Program Studi:** Sistem Informasi
   - **IPK:** 3.85
   - **Tanggal Lahir:** 2000-05-15
2. Klik tombol abu-abu **"Preview Hash"**.
3. *Poin Fitur:* **Local Cryptography (SHA-256)**. Tunjukkan teks acak yang muncul di kotak bawah. Jelaskan bahwa teks panjang inilah yang dikirim ke jaringan.
4. Klik tombol biru **"Simpan ke Blockchain"**.
5. *Poin Fitur:* **State Modification (Write)**. Anda akan melihat Notifikasi Hijau (*Toast Success*) muncul. Angka di box "Total Lulusan" juga nambah jadi 1.

### 👨‍🏫 TAHAP 3: FITUR EFISIENSI (BULK IMPORT)
*(Arahkan layar ke kotak CSV di atas form)*
> **Skrip Anda:** "Tentu kampus meluluskan ribuan sarjana tiap tahun. Kalau diinput manual, biaya Gas Fee-nya akan jebol. Maka saya merancang arsitektur Bulk Import yang bisa meringkas ribuan transaksi jadi SATU."
1. Klik area Upload CSV, lalu pilih file `Data_Mahasiswa_Simulasi.csv`.
2. Klik tombol **"Proses & Simpan"**.
3. *Poin Fitur:* **Array Batch Processing**. "Seluruh baris mahasiswa di-hash secara bersamaan di RAM komputer lokal, baru dikirim serempak ke Blockchain!"
4. Tunjukkan box "Estimasi Gas Dihemat" yang angkanya bertambah, bukti bahwa sistem *cost-efficient*.

### 🕵️‍♂️ TAHAP 4: FITUR VERIFIKASI HRD (PUNCAK ACARA)
*(Beralih ke Tab 2: `http://localhost:3000/verify.html`)*
> **Skrip Anda:** "Sekarang anggaplah saya adalah Pihak HRD Perusahaan. Saya menerima kertas ijazah atas nama Ahmad Fauzan. Saya ingin tahu apakah ijazah ini ASLI atau bodong."
1. Input data Fauzan PERSIS SAMA seperti Tahap 2 awal tadi (IPK 3.85).
2. Klik **"Verifikasi Keaslian Ijazah"**.
3. *Poin Fitur:* **View Function (Read)**. Hasilnya akan Muncul Kotak Hijau **✅ VALID**.
> "Sistem membuktikan datanya otentik dari Sistem Informasi kampus karena Hash-nya cocok 100% dengan di Blockchain."

### ❌ TAHAP 5: FITUR ANTI-PEMALSUAN (IMMUTABILITY)
*(Tetap di Tab 2)*
> **Skrip Anda:** "Bagaimana kalau ada pelamar nakal bernama Fauzan yang memakai PDF/Photoshop dan mengubah IPK-nya menjadi cumlaude 3.99?"
1. Ubah bagian IPK Ahmad Fauzan di form menjadi: **3.99**.
2. Klik **"Verifikasi Keaslian Ijazah"**.
3. Hasilnya langsung muncul Kotak Merah **❌ TIDAK DITEMUKAN**.
> "Karena sifat mutlak kriptografi, beda angka sehelai pun (3.85 jadi 3.99), Hash-nya akan berantakan seluruhnya. Blockchain menolak memverifikasi data palsu ini. 100% kebal manipulasi."

---

## 💡 PERTANYAAN DOSEN BIASANYA:

**T: "Bagaimana caranya kampus lain mendaftar akun?"**
J: *"Di versi MVP Tugas Akhir ini, satu Smart Contract didedikasikan mutlak untuk satu Universitas (Siapapun yang men-deploy contract-nya, dia adalah Admin Tunggal-nya). Untuk masa depan skala nasional, sistem dapat menggunakan arsitektur 'Master Contract' (Role-Based Access) yang dipegang kementerian."*

**T: "Kenapa disimpannya pakai blockchain, bukan database biasa (MySQL)?"**
J: *"Kalau pakai database terpusat, admin IT atau hacker yang masuk ke server masih bisa mengubah nilainya (mengganti angka IPK di tabel). Dengan Blockchain, sekalinya hash terukir ke blok baru, kemustahilan matematis untuk diubah (Immutable) oleh siapapun di muka bumi."*

**T: "File PFD ijazahnya di mana?"**
J: *"Saya pakai pendekatan 'Zero-Knowledge Concept'. Menyimpan file memakan jutaan rupiah di blockchain. Saya hanya menyimpan sidik jari unik matematisnya. Asalkan pihak verifikator punya file fisik/PDF-nya, mereka bisa menyamakannya kapan saja."*
