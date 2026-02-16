package main

import (
	"time"

	"gorm.io/gorm"
)

// GlobalConfig menyimpan pengaturan aplikasi
type GlobalConfig struct {
	ID        uint   `gorm:"primaryKey"`
	Key       string `gorm:"uniqueIndex"`
	Value     string
	UpdatedAt time.Time
}

// [BARU] Series untuk mengelompokkan buku (misal: "Naruto", "One Piece")
type Series struct {
	ID          uint   `gorm:"primaryKey"`
	Title       string `gorm:"uniqueIndex"` // Judul Series
	Description string
	Books       []Book `gorm:"foreignKey:SeriesID"` // Relasi One-to-Many
}

// Book merepresentasikan satu buku/folder
type Book struct {
	gorm.Model
	Title       string `gorm:"index"`
	Path        string `gorm:"uniqueIndex"`
	CoverPath   string
	Description string

	// [BARU] Relasi ke Series (Nullable)
	SeriesID *uint   `gorm:"index"` 
	Series   *Series `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// Status & Metadata
	IsLocked     bool
	PasswordHash string
	IsHidden     bool
	MaskCover    bool
	IsFavorite   bool

	// Progress Baca
	LastPage     int
	TotalPages   int
	LastReadTime time.Time `gorm:"index"`

	// Relasi
	Tags []Tag `gorm:"many2many:book_tags;"`
}

type Tag struct {
	ID    uint   `gorm:"primaryKey"`
	Name  string `gorm:"uniqueIndex"`
	Books []Book `gorm:"many2many:book_tags;"`
}

type BookFrontend struct {
	Name         string   `json:"name"`
	Cover        string   `json:"cover"` 
	Tags         []string `json:"tags"`
	Description  string   `json:"description"`
	IsLocked     bool     `json:"is_locked"`
	IsHidden     bool     `json:"is_hidden"`
	MaskCover    bool     `json:"mask_cover"`
	LastPage     int      `json:"last_page"`
	IsFavorite   bool     `json:"is_favorite"`
	LastReadTime int64    `json:"last_read_time"`
	SeriesName   string   `json:"series_name"` // [BARU] Untuk frontend
}