package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/disintegration/imaging"
	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	_ "golang.org/x/image/webp" // Side-effect import for WEBP decoding
)

// Config struct to hold application configuration, like the password hash.
type Config struct {
	PasswordHash string `json:"password_hash"`
}

// Book struct now includes a cover image
type Book struct {
	Name  string `json:"name"`
	Cover string `json:"cover"`
}

// App struct
type App struct {
	ctx        context.Context
	config     Config
	configPath string
	vaultDir   string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Get user's config directory
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("Fatal: could not get user config dir: %v", err)
	}

	appDataDir := filepath.Join(userConfigDir, "GalleryVault")
	a.vaultDir = filepath.Join(appDataDir, "vault")
	a.configPath = filepath.Join(appDataDir, "config.json")

	// Create application data directory if it doesn't exist
	if err := os.MkdirAll(a.vaultDir, 0755); err != nil {
		log.Fatalf("Fatal: could not create vault directory on startup: %v", err)
	}

	// Load or create config file
	if _, err := os.Stat(a.configPath); os.IsNotExist(err) {
		// Create a new empty config
		a.config = Config{PasswordHash: ""}
		file, _ := json.MarshalIndent(a.config, "", " ")
		_ = os.WriteFile(a.configPath, file, 0644)
	} else {
		file, err := os.ReadFile(a.configPath)
		if err != nil {
			log.Fatalf("Fatal: could not read config file: %v", err)
		}
		err = json.Unmarshal(file, &a.config)
		if err != nil {
			log.Fatalf("Fatal: could not parse config file: %v", err)
		}
	}
}

// HasPassword checks if a master password has been set.
func (a *App) HasPassword() bool {
	return a.config.PasswordHash != ""
}

// SetMasterPassword hashes and saves a new master password.
func (a *App) SetMasterPassword(rawPassword string) bool {
	if rawPassword == "" {
		return false // Or return an error
	}
	hasher := sha256.New()
	hasher.Write([]byte(rawPassword))
	hash := hex.EncodeToString(hasher.Sum(nil))

	a.config.PasswordHash = hash
	file, err := json.MarshalIndent(a.config, "", " ")
	if err != nil {
		log.Printf("Error marshaling config to save password: %v", err)
		return false
	}

	err = os.WriteFile(a.configPath, file, 0644)
	if err != nil {
		log.Printf("Error writing config file to save password: %v", err)
		return false
	}
	return true
}

// VerifyPassword checks if the provided password is correct.
func (a *App) VerifyPassword(input string) bool {
	hasher := sha256.New()
	hasher.Write([]byte(input))
	hash := hex.EncodeToString(hasher.Sum(nil))
	return hash == a.config.PasswordHash
}

const maxWidth = 1920
const coverWidth = 300

// SanitizeName removes characters that are invalid for folder names.
func SanitizeName(name string) string {
	re := regexp.MustCompile(`[<>:"/\\|?*]`) // Corrected escaping for backslash
	sanitized := re.ReplaceAllString(name, "")
	return strings.TrimSpace(strings.ReplaceAll(sanitized, " ", "_"))
}

// SelectFolder opens a dialog for the user to select a folder.
func (a *App) SelectFolder() string {
	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Pilih Folder Sumber Gambar",
	})
	if err != nil {
		log.Printf("Error selecting directory: %v", err)
		return ""
	}
	return selection
}

// CreateBook creates a new book and imports images into it.
func (a *App) CreateBook(bookName string, sourcePath string) string {
	if strings.TrimSpace(bookName) == "" || strings.TrimSpace(sourcePath) == "" {
		return "Error: Nama buku dan folder sumber tidak boleh kosong."
	}
	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)

	if _, err := os.Stat(bookPath); !os.IsNotExist(err) {
		return fmt.Sprintf("Error: Buku dengan nama '%s' sudah ada.", sanitizedBookName)
	}
	if err := os.MkdirAll(bookPath, 0755); err != nil {
		return "Error: Gagal membuat folder untuk buku baru."
	}

	imageCount := 0
	err := filepath.Walk(sourcePath, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(path))
			if ext == ".jpg" || ext == ".png" || ext == ".jpeg" || ext == ".webp" {
				srcImage, err := imaging.Open(path)
				if err != nil {
					log.Printf("Gagal membuka gambar %s: %v", path, err)
					return nil
				}

				if srcImage.Bounds().Dx() > maxWidth {
					srcImage = imaging.Resize(srcImage, maxWidth, 0, imaging.Lanczos)
				}

				uniqueName := uuid.New().String() + ".jpg"
				destPath := filepath.Join(bookPath, uniqueName)
				err = imaging.Save(srcImage, destPath, imaging.JPEGQuality(80))
				if err != nil {
					log.Printf("Gagal menyimpan gambar %s: %v", destPath, err)
					return nil
				}
				imageCount++
			}
		}
		return nil
	})

	if err != nil {
		return "Error: Gagal memindai folder sumber."
	}
	if imageCount == 0 {
		os.Remove(bookPath)
		return "Tidak ada gambar yang ditemukan di folder sumber."
	}
	return fmt.Sprintf("Berhasil! %d gambar telah diimpor ke buku '%s'.", imageCount, sanitizedBookName)
}

// GetBooks returns a list of all available books with their cover images.
func (a *App) GetBooks() []Book {
	books := []Book{}
	entries, err := os.ReadDir(a.vaultDir)
	if err != nil {
		log.Printf("Error reading vault directory: %v", err)
		return books
	}

	for _, entry := range entries {
		if entry.IsDir() {
			bookName := entry.Name()
			bookPath := filepath.Join(a.vaultDir, bookName)
			coverBase64 := ""

			// Find the first image to use as a cover
			imageEntries, _ := os.ReadDir(bookPath)
			if len(imageEntries) > 0 {
				// os.ReadDir provides sorted entries by name
				firstImagePath := filepath.Join(bookPath, imageEntries[0].Name())
				img, err := imaging.Open(firstImagePath)
				if err == nil {
					// Create a small thumbnail
					thumbnail := imaging.Resize(img, coverWidth, 0, imaging.Lanczos)

					// Save thumbnail to a buffer in memory
					var buf bytes.Buffer
					err := imaging.Encode(&buf, thumbnail, imaging.JPEG)
					if err == nil {
						coverBase64 = "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
					} else {
						log.Printf("Failed to encode thumbnail for %s: %v", bookName, err)
					}
				} else {
					log.Printf("Failed to open cover image for %s: %v", bookName, err)
				}
			}
			books = append(books, Book{Name: bookName, Cover: coverBase64})
		}
	}
	return books
}

// GetImagesInBook returns a sorted list of image filenames for a specific book.
func (a *App) GetImagesInBook(bookName string) []string {
	filenames := []string{}
	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)

	entries, err := os.ReadDir(bookPath)
	if err != nil {
		log.Printf("Error reading book directory '%s': %v", bookPath, err)
		return filenames
	}

	// Sort entries alphabetically to ensure consistent order
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if !entry.IsDir() {
			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" {
				filenames = append(filenames, entry.Name())
			}
		}
	}
	sort.Strings(filenames)
	return filenames
}