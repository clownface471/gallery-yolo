# 🔒 GalleryVault

**GalleryVault** adalah aplikasi manajemen galeri desktop yang berfokus pada **Privasi Total** dan **Efisiensi Penyimpanan**. Dibangun menggunakan [Wails](https://wails.io) (Go + React), aplikasi ini memastikan foto-foto berharga Anda aman dari akses tidak sah dan hemat ruang penyimpanan.

## ✨ Fitur Unggulan

### 🛡️ 1. Enkripsi Militer (AES-256)
Semua gambar yang diimpor tidak disimpan sebagai file gambar biasa.
- **Enkripsi On-the-Fly:** File diubah menjadi format terenkripsi menggunakan algoritma **AES-256-GCM**.
- **Anti-Intip:** Jika seseorang membuka folder penyimpanan (`vault`) lewat Windows Explorer, mereka hanya akan melihat file binary acak yang tidak bisa dibuka oleh Image Viewer manapun.
- **Secure Memory:** Gambar hanya didekripsi di memori saat ditampilkan di aplikasi, tidak pernah ditulis ulang dalam bentuk polos ke harddisk.

### 💾 2. Smart Storage Compression
Hemat ruang harddisk Anda tanpa mengorbankan pengalaman visual.
- **Auto Resize:** Gambar resolusi raksasa (4K/8K) otomatis di-resize ke **1920px (Full HD)** agar pas di layar monitor standar.
- **High Efficiency:** Menggunakan kompresi JPEG Quality 60 + Filter CatmullRom untuk mengecilkan ukuran file hingga **70-80%** lebih kecil dari aslinya.

### 👻 3. Anti-Forensik (No-Cache)
- Aplikasi mencegah browser/webview menyimpan *cache* gambar.
- Saat Anda menghapus foto atau menutup aplikasi, tidak ada jejak bayangan (*ghost image*) yang tertinggal di folder temporary sistem.

### ⚡ Fitur Lainnya
- **Cover Management:** Pilih gambar favoritmu untuk menjadi sampul album.
- **Folder Sync:** Tambahkan gambar baru ke album yang sudah ada tanpa duplikasi.
- **Natural Sorting:** Urutan file cerdas (Image 1, Image 2, ... Image 10).
- **Master Password:** Kunci aplikasi dengan satu password utama.

## 📥 Cara Install

1. Buka halaman [Releases](../../releases).
2. Download file **`GalleryVault.exe`**.
3. Jalankan aplikasi (Portable, tidak perlu install).
4. Saat pertama kali dibuka, buat **Master Password** Anda.

## 🛠️ Tech Stack

- **Backend:** Go (Golang) 1.21+
- **Frontend:** React + Vite
- **GUI Framework:** Wails v2
- **Image Processing:** `disintegration/imaging`
- **Security:** `crypto/aes`, `crypto/cipher`

## ⚠️ Disclaimer

Aplikasi ini menggunakan enkripsi untuk melindungi privasi. **JANGAN LUPA PASSWORD ANDA.** Tidak ada cara untuk memulihkan data jika password hilang (karena kunci enkripsi tersimpan lokal).

---
*Dibuat dengan ❤️ dan Kopi.*