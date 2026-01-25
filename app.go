package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/disintegration/imaging"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	_ "golang.org/x/image/webp"
)

// --- KONFIGURASI KEAMANAN & KOMPRESI ---

// Kunci Enkripsi (32 bytes untuk AES-256).
// Menggunakan string agar lebih mudah dikelola daripada byte array manual.
var EncryptionKey = []byte("GalleryVault_SecureKey_2026_IDN!")

const (
	maxWidth    = 1920 // Resize gambar super besar ke 1080p-ish
	jpegQuality = 75   // Kualitas 75% (Hemat storage signifikan, visual tetap tajam)
	coverWidth  = 300
)

// Config struct to hold application configuration
type Config struct {
	PasswordHash string `json:"password_hash"`
}

// Book struct includes name and cover image
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

	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("Fatal: could not get user config dir: %v", err)
	}

	appDataDir := filepath.Join(userConfigDir, "GalleryVault")
	a.vaultDir = filepath.Join(appDataDir, "vault")
	a.configPath = filepath.Join(appDataDir, "config.json")

	if err := os.MkdirAll(a.vaultDir, 0755); err != nil {
		log.Fatalf("Fatal: could not create vault directory on startup: %v", err)
	}

	// Load or create config file
	if _, err := os.Stat(a.configPath); os.IsNotExist(err) {
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

// EncryptData encrypts data using AES-256-GCM
func EncryptData(plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(EncryptionKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// DecryptData decrypts data using AES-256-GCM
func DecryptData(ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(EncryptionKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

// TryDecryptData attempts to decrypt data, returns plaintext on success or original data if it's not encrypted
func TryDecryptData(data []byte) []byte {
	if len(data) < 16 { // GCM nonce is at least 12 bytes, less than that it's probably plain
		return data
	}

	decrypted, err := DecryptData(data)
	if err != nil {
		// Decryption failed - treat as plain unencrypted data
		return data
	}

	return decrypted
}

// HasPassword checks if a master password has been set
func (a *App) HasPassword() bool {
	return a.config.PasswordHash != ""
}

// SetMasterPassword hashes and saves a new master password
func (a *App) SetMasterPassword(rawPassword string) bool {
	if rawPassword == "" {
		return false
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

// VerifyPassword checks if the provided password is correct
func (a *App) VerifyPassword(input string) bool {
	hasher := sha256.New()
	hasher.Write([]byte(input))
	hash := hex.EncodeToString(hasher.Sum(nil))
	return hash == a.config.PasswordHash
}

// SanitizeName removes characters that are invalid for folder names
func SanitizeName(name string) string {
	// Remove illegal Windows characters
	re := regexp.MustCompile(`[<>:"/\\|?*]`)
	sanitized := re.ReplaceAllString(name, "_")

	// Replace fullwidth colon with underscore
	sanitized = strings.ReplaceAll(sanitized, "：", "_")

	// Replace spaces with underscores and trim
	return strings.TrimSpace(strings.ReplaceAll(sanitized, " ", "_"))
}

// SelectFolder opens a dialog for the user to select a folder
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

// CreateBook creates a new book and imports images with optional sync mode
func (a *App) CreateBook(bookName string, sourcePath string, syncMode bool) string {
	if strings.TrimSpace(bookName) == "" || strings.TrimSpace(sourcePath) == "" {
		return "Error: Nama buku dan folder sumber tidak boleh kosong."
	}

	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)

	if !syncMode {
		if _, err := os.Stat(bookPath); !os.IsNotExist(err) {
			return fmt.Sprintf("Error: Buku dengan nama '%s' sudah ada.", sanitizedBookName)
		}
	}

	if err := os.MkdirAll(bookPath, 0755); err != nil {
		return "Error: Gagal membuat folder untuk buku."
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

				// Resize if too large
				if srcImage.Bounds().Dx() > maxWidth {
					srcImage = imaging.Resize(srcImage, maxWidth, 0, imaging.Lanczos)
				}

				// Always save as JPEG
				originalName := strings.TrimSuffix(info.Name(), filepath.Ext(info.Name()))
				safeName := SanitizeName(originalName)
				destFilename := safeName + ".jpg"
				destPath := filepath.Join(bookPath, destFilename)

				// Check for duplicates in sync mode
				if syncMode {
					if _, err := os.Stat(destPath); !os.IsNotExist(err) {
						return nil // Skip existing file
					}
				} else {
					// Handle duplicates in non-sync mode
					counter := 1
					for {
						if _, err := os.Stat(destPath); os.IsNotExist(err) {
							break
						}
						destFilename = fmt.Sprintf("%s_%d.jpg", safeName, counter)
						destPath = filepath.Join(bookPath, destFilename)
						counter++
					}
				}

				// Encode to JPEG buffer with Quality 75 (Compression)
				var buf bytes.Buffer
				err = imaging.Encode(&buf, srcImage, imaging.JPEG, imaging.JPEGQuality(jpegQuality))
				if err != nil {
					log.Printf("Gagal encode gambar %s: %v", destPath, err)
					return nil
				}

				// Encrypt the image data
				encryptedData, err := EncryptData(buf.Bytes())
				if err != nil {
					log.Printf("Gagal enkripsi gambar %s: %v", destPath, err)
					return nil
				}

				// Write encrypted data
				err = os.WriteFile(destPath, encryptedData, 0644)
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

	if imageCount == 0 && !syncMode {
		os.RemoveAll(bookPath)
		return "Tidak ada gambar baru yang ditemukan di folder sumber."
	}

	if syncMode {
		return fmt.Sprintf("Sinkronisasi Selesai! %d gambar baru telah ditambahkan ke '%s'.", imageCount, sanitizedBookName)
	}

	return fmt.Sprintf("Berhasil! %d gambar telah diimpor ke buku '%s'.", imageCount, sanitizedBookName)
}

// GetBooks returns a list of all available books with their cover images
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
			coverFilename := ""

			// 1. Check for cover.db file
			coverFilePath := filepath.Join(bookPath, "cover.db")
			if content, err := os.ReadFile(coverFilePath); err == nil && len(content) > 0 {
				coverFilename = strings.TrimSpace(string(content))
			}

			// 2. If no cover.db file, find the first image naturally
			if coverFilename == "" {
				images, _ := os.ReadDir(bookPath)
				var imageNames []string
				for _, img := range images {
					if !img.IsDir() && img.Name() != "cover.db" {
						ext := strings.ToLower(filepath.Ext(img.Name()))
						if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" {
							imageNames = append(imageNames, img.Name())
						}
					}
				}

				natsort(imageNames)
				if len(imageNames) > 0 {
					coverFilename = imageNames[0]
				}
			}

			// 3. Generate thumbnail from the determined cover filename
			if coverFilename != "" {
				imagePath := filepath.Join(bookPath, coverFilename)
				if _, err := os.Stat(imagePath); err == nil {
					// Read file (could be encrypted or plain)
					fileData, err := os.ReadFile(imagePath)
					if err == nil {
						// Try to decrypt, or use as-is if it's plain
						decryptedData := TryDecryptData(fileData)

						img, err := imaging.Decode(bytes.NewReader(decryptedData))
						if err == nil {
							thumbnail := imaging.Resize(img, coverWidth, 0, imaging.Lanczos)
							var buf bytes.Buffer
							// Use consistent compression for thumbnails too
							err := imaging.Encode(&buf, thumbnail, imaging.JPEG, imaging.JPEGQuality(jpegQuality))
							if err == nil {
								coverBase64 = "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
							} else {
								log.Printf("Failed to encode thumbnail for %s: %v", bookName, err)
							}
						} else {
							log.Printf("Failed to decode thumbnail for %s: %v", bookName, err)
						}
					} else {
						log.Printf("Failed to read cover image '%s' for book %s: %v", coverFilename, bookName, err)
					}
				} else {
					log.Printf("Cover file '%s' for book '%s' not found.", coverFilename, bookName)
				}
			}

			books = append(books, Book{Name: bookName, Cover: coverBase64})
		}
	}

	return books
}

// GetImagesInBook returns a naturally sorted list of image filenames for a specific book
func (a *App) GetImagesInBook(bookName string) []string {
	filenames := []string{}
	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)

	entries, err := os.ReadDir(bookPath)
	if err != nil {
		log.Printf("Error reading book directory '%s': %v", bookPath, err)
		return filenames
	}

	for _, entry := range entries {
		if !entry.IsDir() && entry.Name() != "cover.db" {
			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" {
				filenames = append(filenames, entry.Name())
			}
		}
	}

	natsort(filenames)
	return filenames
}

// RenameBook renames a book's directory
func (a *App) RenameBook(oldName, newName string) error {
	sanitizedOldName := SanitizeName(oldName)
	sanitizedNewName := SanitizeName(newName)

	if strings.TrimSpace(sanitizedNewName) == "" {
		return fmt.Errorf("nama baru tidak boleh kosong")
	}

	oldPath := filepath.Join(a.vaultDir, sanitizedOldName)
	newPath := filepath.Join(a.vaultDir, sanitizedNewName)

	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		return fmt.Errorf("buku '%s' tidak ditemukan", sanitizedOldName)
	}

	if _, err := os.Stat(newPath); !os.IsNotExist(err) {
		return fmt.Errorf("buku dengan nama '%s' sudah ada", sanitizedNewName)
	}

	return os.Rename(oldPath, newPath)
}

// SetBookCover sets a specific image as the cover for a book
func (a *App) SetBookCover(bookName, imageFilename string) error {
	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)
	coverFilePath := filepath.Join(bookPath, "cover.db")

	imagePath := filepath.Join(bookPath, imageFilename)
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		return fmt.Errorf("file gambar '%s' tidak ditemukan di buku '%s'", imageFilename, sanitizedBookName)
	}

	return os.WriteFile(coverFilePath, []byte(imageFilename), 0644)
}

// --- Natural Sort Implementation ---

// natsort sorts a slice of strings in natural order
func natsort(s []string) {
	sort.Slice(s, func(i, j int) bool {
		return naturalCompare(s[i], s[j])
	})
}

// naturalCompare compares two strings using natural sort logic
func naturalCompare(a, b string) bool {
	i, j := 0, 0

	for i < len(a) && j < len(b) {
		charA, charB := a[i], b[j]
		isDigitA := unicode.IsDigit(rune(charA))
		isDigitB := unicode.IsDigit(rune(charB))

		if isDigitA && isDigitB {
			// Find the end of the number chunk
			i_end, j_end := i, j
			for i_end < len(a) && unicode.IsDigit(rune(a[i_end])) {
				i_end++
			}
			for j_end < len(b) && unicode.IsDigit(rune(b[j_end])) {
				j_end++
			}

			// Parse numbers
			numA, _ := strconv.Atoi(a[i:i_end])
			numB, _ := strconv.Atoi(b[j:j_end])

			if numA != numB {
				return numA < numB
			}

			i, j = i_end, j_end
		} else {
			if charA != charB {
				return charA < charB
			}
			i++
			j++
		}
	}

	return len(a) < len(b)
}

// DeleteBook deletes an entire book directory
func (a *App) DeleteBook(bookName string) error {
	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)

	if !strings.HasPrefix(bookPath, a.vaultDir) {
		return fmt.Errorf("invalid book name, path traversal detected")
	}

	return os.RemoveAll(bookPath)
}

// DeleteImage deletes a specific image from a book
func (a *App) DeleteImage(bookName string, imageName string) error {
	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)
	imagePath := filepath.Join(bookPath, imageName)

	if !strings.HasPrefix(imagePath, bookPath) {
		return fmt.Errorf("invalid image name, path traversal detected")
	}

	return os.Remove(imagePath)
}