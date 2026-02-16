package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// --- DEFINISI MODEL (Harus sama persis dengan aplikasi utama) ---

type Book struct {
	gorm.Model
	Title        string `gorm:"index"`
	Path         string `gorm:"uniqueIndex"`
	CoverPath    string
	Description  string
	IsLocked     bool
	IsHidden     bool
	MaskCover    bool
	IsFavorite   bool
	LastPage     int
	TotalPages   int
	LastReadTime time.Time `gorm:"index"`
	Tags         []Tag     `gorm:"many2many:book_tags;"`
}

type Tag struct {
	ID    uint   `gorm:"primaryKey"`
	Name  string `gorm:"uniqueIndex"`
	Books []Book `gorm:"many2many:book_tags;"`
}

// --- STRUKTUR METADATA LAMA (JSON) ---
type LegacyMetadata struct {
	Tags         []string `json:"tags"`
	Description  string   `json:"description"`
	MaskCover    bool     `json:"mask_cover"`
	IsHidden     bool     `json:"is_hidden"`
	LastPage     int      `json:"last_page"`
	TotalPages   int      `json:"total_pages"`
	IsFavorite   bool     `json:"is_favorite"`
	LastReadTime int64    `json:"last_read_time"`
}

func main() {
	fmt.Println("=== GALLERY VAULT MIGRATION TOOL ===")
	fmt.Println("Membaca konfigurasi...")

	// 1. Cari Folder Konfigurasi
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatal("Gagal mencari folder user:", err)
	}

	appDataDir := filepath.Join(userConfigDir, "GalleryVault")
	vaultDir := filepath.Join(appDataDir, "vault")
	dbPath := filepath.Join(appDataDir, "library.db")

	fmt.Printf("Database: %s\n", dbPath)
	fmt.Printf("Vault:    %s\n", vaultDir)

	// 2. Koneksi Database
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatal("Gagal koneksi database:", err)
	}

	// Pastikan tabel sudah ada (AutoMigrate)
	db.AutoMigrate(&Book{}, &Tag{})

	// 3. Scan Folder Vault
	fmt.Println("Memindai folder vault...")
	entries, err := os.ReadDir(vaultDir)
	if err != nil {
		log.Fatal("Gagal membaca vault:", err)
	}

	successCount := 0
	skipCount := 0

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		bookName := entry.Name()
		bookPath := filepath.Join(vaultDir, bookName)

		// Cek apakah sudah ada di DB
		var count int64
		db.Model(&Book{}).Where("path = ?", bookPath).Count(&count)
		if count > 0 {
			fmt.Printf("[SKIP] %s (Sudah ada di DB)\n", bookName)
			skipCount++
			continue
		}

		fmt.Printf("[MIGRATE] %s... ", bookName)

		// Baca Metadata Lama
		var meta LegacyMetadata
		metaPath := filepath.Join(bookPath, "metadata.json")
		if data, err := os.ReadFile(metaPath); err == nil {
			json.Unmarshal(data, &meta)
		}

		// Cari Cover
		coverImage := ""
		if coverData, err := os.ReadFile(filepath.Join(bookPath, "cover.db")); err == nil {
			coverImage = string(coverData)
		} else {
			// Fallback: Cari gambar jpg pertama
			files, _ := os.ReadDir(bookPath)
			for _, f := range files {
				if strings.HasSuffix(strings.ToLower(f.Name()), ".jpg") {
					coverImage = f.Name()
					break
				}
			}
		}

		// Siapkan Tags
		var tags []Tag
		for _, tName := range meta.Tags {
			clean := strings.TrimSpace(tName)
			if clean != "" {
				var t Tag
				// FirstOrCreate mencegah duplikasi tag
				db.FirstOrCreate(&t, Tag{Name: clean})
				tags = append(tags, t)
			}
		}

		// Insert ke DB
		newBook := Book{
			Title:        bookName,
			Path:         bookPath,
			CoverPath:    coverImage,
			Description:  meta.Description,
			IsHidden:     meta.IsHidden,
			MaskCover:    meta.MaskCover,
			IsFavorite:   meta.IsFavorite,
			LastPage:     meta.LastPage,
			TotalPages:   meta.TotalPages,
			LastReadTime: time.Unix(meta.LastReadTime, 0),
			Tags:         tags,
		}

		if err := db.Create(&newBook).Error; err != nil {
			fmt.Printf("GAGAL: %v\n", err)
		} else {
			fmt.Println("OK")
			successCount++
		}
	}

	fmt.Println("------------------------------------------------")
	fmt.Printf("SELESAI. Berhasil: %d, Terlewati: %d\n", successCount, skipCount)
	fmt.Println("Sekarang silakan jalankan aplikasi utama (wails dev).")
}