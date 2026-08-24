# Panduan Deployment Cloud Hosting & PostgreSQL Database (FormCraft TPM)

Dokumen ini menjelaskan langkah-langkah mempublikasikan aplikasi **FormCraft TPM** ke **Cloud Hosting** dengan **PostgreSQL Database** agar dapat diakses dari mana saja (HP via Telkomsel, Indosat, XL, maupun PC/iPad via Wi-Fi) sesuai diagram arsitektur.

---

## 🏗️ Arsitektur Sistem

```
                  INTERNET
                     |
       +-------------+-------------+
       |             |             |
   Telkomsel      Indosat        Wi-Fi
       |             |             |
       v             v             v
      HP            HP          PC/iPad
       |             |             |
       +-------------+-------------+
                     |
                     v
             +---------------+
             | CLOUD HOSTING |
             | (Flask + App) |
             +---------------+
                     |
                     v
             +---------------+
             | PostgreSQL    |
             | TPM Database  |
             +---------------+
```

---

## 🚀 Opsi 1: Deploy Gratis di Render.com (Sangat Direkomendasikan)

Layanan **Render.com** menyediakan **Free Web Service (Flask)** dan **Free PostgreSQL Database**.

### Langkah-langkah Deployment:
1. **Push Proyek ke GitHub**:
   - Upload seluruh isi folder `Canva` ini ke repository GitHub Anda (misal `tpm-followup-app`).

2. **Daftar/Login di [Render.com](https://render.com)** (Gratis).

3. **Buat Database PostgreSQL**:
   - Klik **New +** -> **PostgreSQL**.
   - Beri nama: `tpm-postgres-db`.
   - Pilih Region: **Singapore**.
   - Klik **Create Database**.
   - Salin **Internal Database URL** atau **External Database URL**.

4. **Buat Web Service Flask**:
   - Klik **New +** -> **Web Service**.
   - Hubungkan ke repository GitHub proyek ini.
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
   - Tambahkan Environment Variable:
     - `DATABASE_URL`: (Paste URL Database PostgreSQL dari Langkah 3)
     - `SECRET_KEY`: `tpm-secret-key-super-safe-2026`
   - Klik **Create Web Service**.

5. **Selesai!**  
   Aplikasi Anda akan mendapatkan URL HTTPS publik (contoh: `https://tpm-followup-app.onrender.com`).  
   URL ini bisa dibuka dari HP (Telkomsel/Indosat), PC, maupun iPad dari mana saja!

---

## ⚡ Opsi 2: Deploy di Vercel + Neon.tech PostgreSQL (Gratis & Sangat Cepat)

1. **Database PostgreSQL**:
   - Buat Database PostgreSQL gratis di **[Neon.tech](https://neon.tech)** (Singapore).
   - Salin `DATABASE_URL` (contoh: `postgresql://user:password@ep-xyz.singapore.aws.neon.tech/tpm_db?sslmode=require`).

2. **Hosting Vercel**:
   - Install Vercel CLI atau buka **[Vercel.com](https://vercel.com)**.
   - Import repository GitHub Anda.
   - Masukkan Environment Variable `DATABASE_URL` dari Neon.tech.
   - Deploy! URL gratis `https://tpm-app.vercel.app` akan langsung aktif.

---

## 🐍 Opsi 3: PythonAnywhere (Gratis)

1. Buat akun gratis di **[PythonAnywhere.com](https://www.pythonanywhere.com)**.
2. Upload folder proyek `Canva`.
3. Konfigurasikan Web App dengan skrip `app.py` dan virtual environment.

---

## 📄 File Konfigurasi yang Tersedia di Workspace:

- **`app.py`**: Sudah mendukung koneksi otomatis ke PostgreSQL Cloud (`DATABASE_URL`) & CORS.
- **`requirements.txt`**: Terdiri dari `Flask`, `Flask-SQLAlchemy`, `Flask-Cors`, `gunicorn`, `psycopg2-binary`.
- **`Procfile`**: Perintah pembuka server untuk cloud hosting (`web: gunicorn app:app`).
- **`render.yaml`**: Manifesto blueprint untuk Render.com.
- **`vercel.json`**: Manifesto konfigurasi Vercel serverless.
