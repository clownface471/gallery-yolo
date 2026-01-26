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

var EncryptionKey = []byte("GalleryVault_SecureKey_2026_IDN!")

const (
	maxWidth    = 1920
	jpegQuality = 75
	coverWidth  = 300
)

// Config struct
type Config struct {
	PasswordHash string `json:"password_hash"`
}

// Book struct
type Book struct {
	Name     string   `json:"name"`
	Cover    string   `json:"cover"`
	Tags     []string `json:"tags"`
	IsLocked bool     `json:"is_locked"` // NEW: Penanda visual buku terkunci
}

// NEW: Struct internal untuk keamanan per buku
type BookSecurity struct {
	PasswordHash string `json:"password_hash"`
}

type App struct {
	ctx        context.Context
	config     Config
	configPath string
	vaultDir   string
}

func NewApp() *App { return &App{} }

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

	if _, err := os.Stat(a.configPath); os.IsNotExist(err) {
		a.config = Config{PasswordHash: ""}
		file, _ := json.MarshalIndent(a.config, "", " ")
		_ = os.WriteFile(a.configPath, file, 0644)
	} else {
		file, err := os.ReadFile(a.configPath)
		if err == nil {
			json.Unmarshal(file, &a.config)
		}
	}
}

// --- CRYPTO HELPER ---

func EncryptData(plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(EncryptionKey)
	if err != nil { return nil, err }
	gcm, err := cipher.NewGCM(block)
	if err != nil { return nil, err }
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil { return nil, err }
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

func TryDecryptData(data []byte) []byte {
	if len(data) < 16 { return data }
	decrypted, err := DecryptData(data)
	if err != nil { return data }
	return decrypted
}

func DecryptData(ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(EncryptionKey)
	if err != nil { return nil, err }
	gcm, err := cipher.NewGCM(block)
	if err != nil { return nil, err }
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize { return nil, fmt.Errorf("ciphertext too short") }
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

func HashString(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
}

// --- AUTH UTILS ---

func (a *App) HasPassword() bool { return a.config.PasswordHash != "" }
func (a *App) SetMasterPassword(raw string) bool {
	if raw == "" { return false }
	a.config.PasswordHash = HashString(raw)
	file, _ := json.MarshalIndent(a.config, "", " ")
	os.WriteFile(a.configPath, file, 0644)
	return true
}
func (a *App) VerifyPassword(input string) bool { return HashString(input) == a.config.PasswordHash }

// --- FEATURE: DOUBLE LAYER PROTECTION ---

// LockBook membuat file security.json di dalam folder buku
func (a *App) LockBook(bookName, password string) error {
	if password == "" { return fmt.Errorf("password tidak boleh kosong") }
	bookPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	
	sec := BookSecurity{PasswordHash: HashString(password)}
	data, err := json.MarshalIndent(sec, "", " ")
	if err != nil { return err }
	
	return os.WriteFile(filepath.Join(bookPath, "security.json"), data, 0644)
}

// UnlockBook menghapus file security.json
func (a *App) UnlockBook(bookName string) error {
	bookPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	return os.Remove(filepath.Join(bookPath, "security.json"))
}

// VerifyBookPassword mengecek password kedua
func (a *App) VerifyBookPassword(bookName, password string) bool {
	bookPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	secPath := filepath.Join(bookPath, "security.json")
	
	data, err := os.ReadFile(secPath)
	if err != nil { return true } // Jika file hilang, anggap tidak terkunci (fail-open logic for simplicity here)
	
	var sec BookSecurity
	json.Unmarshal(data, &sec)
	return sec.PasswordHash == HashString(password)
}

// --- FILE OPERATIONS ---

func SanitizeName(name string) string {
	re := regexp.MustCompile(`[<>:"/\\|?*]`)
	sanitized := re.ReplaceAllString(name, "_")
	sanitized = strings.ReplaceAll(sanitized, "：", "_")
	return strings.TrimSpace(strings.ReplaceAll(sanitized, " ", "_"))
}

func (a *App) SelectFolder() string {
	res, _ := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Pilih Folder Sumber"})
	return res
}

// --- FEATURE: SMART CHAPTER IMPORT ---
// Update CreateBook agar mempertahankan struktur folder
func (a *App) CreateBook(bookName string, sourcePath string, syncMode bool) string {
	if strings.TrimSpace(bookName) == "" || strings.TrimSpace(sourcePath) == "" {
		return "Error: Data tidak lengkap."
	}

	sanitizedBookName := SanitizeName(bookName)
	bookPath := filepath.Join(a.vaultDir, sanitizedBookName)

	if !syncMode {
		if _, err := os.Stat(bookPath); !os.IsNotExist(err) {
			return fmt.Sprintf("Error: Buku '%s' sudah ada.", sanitizedBookName)
		}
	}
	os.MkdirAll(bookPath, 0755)

	imageCount := 0
	
	// Walk function yang mempertahankan hierarki folder (Chapter)
	filepath.Walk(sourcePath, func(path string, info fs.FileInfo, err error) error {
		if err != nil { return nil }

		// Jika Directory: Buat folder yang sama di dalam Vault (sebagai Chapter)
		if info.IsDir() {
			if path == sourcePath { return nil } // Skip root folder
			relPath, _ := filepath.Rel(sourcePath, path)
			// Buat folder chapter di vault
			chapterPath := filepath.Join(bookPath, relPath) 
			os.MkdirAll(chapterPath, 0755)
			return nil
		}

		// Jika File Gambar
		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".jpg" || ext == ".png" || ext == ".jpeg" || ext == ".webp" {
			// Hitung path relatif untuk mempertahankan struktur
			// Contoh: Source/Chapter1/Img1.jpg -> Vault/Book/Chapter1/Img1.jpg
			relPath, _ := filepath.Rel(sourcePath, path)
			
			// Ganti ekstensi jadi .jpg dan sanitize nama file-nya saja
			dir := filepath.Dir(relPath)
			fileName := filepath.Base(relPath)
			nameWithoutExt := strings.TrimSuffix(fileName, filepath.Ext(fileName))
			
			// Nama file akhir
			destRelPath := filepath.Join(dir, SanitizeName(nameWithoutExt)+".jpg")
			destPath := filepath.Join(bookPath, destRelPath)
			
			// Pastikan folder chapter ada (double check)
			os.MkdirAll(filepath.Dir(destPath), 0755)

			if syncMode {
				if _, err := os.Stat(destPath); !os.IsNotExist(err) { return nil }
			}

			// Proses Gambar (Resize -> Encrypt -> Save)
			srcImage, err := imaging.Open(path)
			if err != nil { return nil }

			if srcImage.Bounds().Dx() > maxWidth {
				srcImage = imaging.Resize(srcImage, maxWidth, 0, imaging.Lanczos)
			}

			var buf bytes.Buffer
			err = imaging.Encode(&buf, srcImage, imaging.JPEG, imaging.JPEGQuality(jpegQuality))
			if err != nil { return nil }

			encryptedData, err := EncryptData(buf.Bytes())
			if err != nil { return nil }

			if err := os.WriteFile(destPath, encryptedData, 0644); err == nil {
				imageCount++
			}
		}
		return nil
	})

	if imageCount == 0 && !syncMode {
		os.RemoveAll(bookPath)
		return "Gagal: Tidak ada gambar ditemukan."
	}
	return fmt.Sprintf("Sukses! %d gambar diamankan.", imageCount)
}

func (a *App) GetBooks() []Book {
	books := []Book{}
	entries, _ := os.ReadDir(a.vaultDir)

	for _, entry := range entries {
		if entry.IsDir() {
			bookName := entry.Name()
			bookPath := filepath.Join(a.vaultDir, bookName)
			
			// Load Tags
			tags := []string{}
			if tagsData, err := os.ReadFile(filepath.Join(bookPath, "tags.json")); err == nil {
				_ = json.Unmarshal(tagsData, &tags)
			}
			
			// Check Lock Status
			isLocked := false
			if _, err := os.Stat(filepath.Join(bookPath, "security.json")); err == nil {
				isLocked = true
			}

			// Load Cover (Cari di root, atau masuk ke folder chapter pertama)
			coverBase64 := ""
			coverName := ""
			
			if d, err := os.ReadFile(filepath.Join(bookPath, "cover.db")); err == nil {
				coverName = string(d)
			} else {
				// Recursive find first image for cover
				filepath.Walk(bookPath, func(path string, info fs.FileInfo, err error) error {
					if coverName != "" { return io.EOF } // Sudah ketemu, stop walk
					if !info.IsDir() && strings.HasSuffix(strings.ToLower(info.Name()), ".jpg") {
						rel, _ := filepath.Rel(bookPath, path)
						coverName = rel
						return io.EOF
					}
					return nil
				})
			}

			if coverName != "" {
				if data, err := os.ReadFile(filepath.Join(bookPath, coverName)); err == nil {
					decrypted := TryDecryptData(data)
					if img, err := imaging.Decode(bytes.NewReader(decrypted)); err == nil {
						thumb := imaging.Resize(img, coverWidth, 0, imaging.Lanczos)
						var buf bytes.Buffer
						imaging.Encode(&buf, thumb, imaging.JPEG, imaging.JPEGQuality(jpegQuality))
						coverBase64 = "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
					}
				}
			}

			books = append(books, Book{Name: bookName, Cover: coverBase64, Tags: tags, IsLocked: isLocked})
		}
	}
	return books
}

// --- FEATURE: TAGS CASE INSENSITIVE ---

func (a *App) SetBookTags(bookName string, tags []string) error {
	path := filepath.Join(a.vaultDir, SanitizeName(bookName), "tags.json")
	
	// Gunakan Map untuk Deduplikasi + Lowercase
	uniqueMap := make(map[string]bool)
	cleanTags := []string{}
	
	for _, t := range tags {
		lower := strings.ToLower(strings.TrimSpace(t))
		if lower != "" && !uniqueMap[lower] {
			uniqueMap[lower] = true
			cleanTags = append(cleanTags, lower)
		}
	}
	
	data, err := json.MarshalIndent(cleanTags, "", " ")
	if err != nil { return err }
	return os.WriteFile(path, data, 0644)
}

// --- FEATURE: CHAPTER HANDLING ---

// GetChapters mengembalikan daftar folder di dalam buku
func (a *App) GetChapters(bookName string) []string {
	var chapters []string
	bookPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	
	entries, _ := os.ReadDir(bookPath)
	for _, e := range entries {
		if e.IsDir() {
			chapters = append(chapters, e.Name())
		}
	}
	natsort(chapters)
	return chapters
}

// GetImagesInChapter mengembalikan gambar di dalam spesifik chapter (folder)
func (a *App) GetImagesInChapter(bookName, chapterName string) []string {
	var files []string
	// Jika chapterName kosong, ambil dari root buku
	targetPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	if chapterName != "" {
		targetPath = filepath.Join(targetPath, chapterName)
	}

	entries, _ := os.ReadDir(targetPath)
	for _, e := range entries {
		if !e.IsDir() {
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if ext == ".jpg" || ext == ".jpeg" || ext == ".png" {
				files = append(files, e.Name())
			}
		}
	}
	natsort(files)
	return files
}

// GetImagesInBook (Legacy/Flat): Masih dipakai jika buku tidak punya chapter
// atau untuk mengambil gambar di root folder buku
func (a *App) GetImagesInBook(bookName string) []string {
	return a.GetImagesInChapter(bookName, "")
}

// --- STANDARD OPS ---

func (a *App) RenameBook(o, n string) error {
	return os.Rename(filepath.Join(a.vaultDir, SanitizeName(o)), filepath.Join(a.vaultDir, SanitizeName(n)))
}
func (a *App) SetBookCover(b, i string) error {
	return os.WriteFile(filepath.Join(a.vaultDir, SanitizeName(b), "cover.db"), []byte(i), 0644)
}
func (a *App) DeleteBook(b string) error { 
	return os.RemoveAll(filepath.Join(a.vaultDir, SanitizeName(b))) 
}
func (a *App) DeleteImage(b, i string) error { 
	return os.Remove(filepath.Join(a.vaultDir, SanitizeName(b), i)) 
}

// Utils
func natsort(s []string) { sort.Slice(s, func(i, j int) bool { return naturalCompare(s[i], s[j]) }) }
func naturalCompare(a, b string) bool {
	i, j := 0, 0
	for i < len(a) && j < len(b) {
		if unicode.IsDigit(rune(a[i])) && unicode.IsDigit(rune(b[j])) {
			iEnd, jEnd := i, j
			for iEnd < len(a) && unicode.IsDigit(rune(a[iEnd])) { iEnd++ }
			for jEnd < len(b) && unicode.IsDigit(rune(b[jEnd])) { jEnd++ }
			numA, _ := strconv.Atoi(a[i:iEnd]); numB, _ := strconv.Atoi(b[j:jEnd])
			if numA != numB { return numA < numB }
			i, j = iEnd, jEnd
		} else {
			if a[i] != b[j] { return a[i] < b[j] }
			i++; j++
		}
	}
	return len(a) < len(b)
}