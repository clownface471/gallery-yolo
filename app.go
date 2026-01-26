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
	"time" // [PENTING] Import time untuk LastReadTime
	"unicode"

	"github.com/disintegration/imaging"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	_ "golang.org/x/image/webp"
)

var EncryptionKey = []byte("GalleryVault_SecureKey_2026_IDN!")

const (
	maxWidth    = 1920
	jpegQuality = 75
	coverWidth  = 300
)

type Config struct {
	PasswordHash   string `json:"password_hash"`
	HiddenZoneHash string `json:"hidden_zone_hash"`
}

// [UPDATE] Tambah IsFavorite & LastReadTime
type BookMetadata struct {
	Tags         []string `json:"tags"`
	Description  string   `json:"description"`
	MaskCover    bool     `json:"mask_cover"`
	IsHidden     bool     `json:"is_hidden"`
	LastPage     int      `json:"last_page"`
	TotalPages   int      `json:"total_pages"`
	IsFavorite   bool     `json:"is_favorite"`    // [NEW] Status Favorit
	LastReadTime int64    `json:"last_read_time"` // [NEW] Timestamp Unix
}

// [UPDATE] Tambah field untuk frontend
type Book struct {
	Name         string   `json:"name"`
	Cover        string   `json:"cover"`
	Tags         []string `json:"tags"`
	Description  string   `json:"description"`
	IsLocked     bool     `json:"is_locked"`
	IsHidden     bool     `json:"is_hidden"`
	MaskCover    bool     `json:"mask_cover"`
	LastPage     int      `json:"last_page"`
	IsFavorite   bool     `json:"is_favorite"`    // [NEW]
	LastReadTime int64    `json:"last_read_time"` // [NEW]
}

type BookSecurity struct {
	PasswordHash string `json:"password_hash"`
}

type App struct {
	ctx              context.Context
	config           Config
	configPath       string
	vaultDir         string
	hiddenModeActive bool
	unlockedBooks    map[string]bool
}

func NewApp() *App {
	return &App{
		unlockedBooks: make(map[string]bool),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatal(err)
	}

	appDataDir := filepath.Join(userConfigDir, "GalleryVault")
	a.vaultDir = filepath.Join(appDataDir, "vault")
	a.configPath = filepath.Join(appDataDir, "config.json")

	os.MkdirAll(a.vaultDir, 0755)

	if _, err := os.Stat(a.configPath); os.IsNotExist(err) {
		a.config = Config{PasswordHash: ""}
		a.saveConfig()
	} else {
		file, _ := os.ReadFile(a.configPath)
		json.Unmarshal(file, &a.config)
	}
}

func (a *App) saveConfig() {
	file, _ := json.MarshalIndent(a.config, "", " ")
	os.WriteFile(a.configPath, file, 0644)
}

func HashString(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
}

// --- PASSWORD MANAGEMENT ---
func (a *App) HasPassword() bool { return a.config.PasswordHash != "" }
func (a *App) VerifyPassword(p string) bool { return HashString(p) == a.config.PasswordHash }
func (a *App) SetMasterPassword(p string) bool {
	if p == "" {
		return false
	}
	a.config.PasswordHash = HashString(p)
	a.saveConfig()
	return true
}
func (a *App) SetHiddenZonePassword(p string) bool {
	if p == "" {
		return false
	}
	a.config.HiddenZoneHash = HashString(p)
	a.saveConfig()
	return true
}
func (a *App) ToggleHiddenZone(p string) bool {
	if a.config.HiddenZoneHash == "" {
		a.SetHiddenZonePassword(p)
		a.hiddenModeActive = true
		return true
	}
	if HashString(p) == a.config.HiddenZoneHash {
		a.hiddenModeActive = true
		return true
	}
	return false
}
func (a *App) LockHiddenZone() { a.hiddenModeActive = false }
func (a *App) IsHiddenZoneActive() bool { return a.hiddenModeActive }
func (a *App) HasHiddenZonePassword() bool { return a.config.HiddenZoneHash != "" }

// --- BOOK SECURITY ---
func (a *App) LockBook(bookName, p string) error {
	path := filepath.Join(a.vaultDir, SanitizeName(bookName), "security.json")
	sec := BookSecurity{PasswordHash: HashString(p)}
	data, _ := json.MarshalIndent(sec, "", " ")
	delete(a.unlockedBooks, bookName)
	return os.WriteFile(path, data, 0644)
}

func (a *App) VerifyBookPassword(bookName, p string) bool {
	path := filepath.Join(a.vaultDir, SanitizeName(bookName), "security.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return true
	}
	var sec BookSecurity
	json.Unmarshal(data, &sec)
	valid := sec.PasswordHash == HashString(p)
	if valid {
		a.unlockedBooks[bookName] = true
	}
	return valid
}

func (a *App) UnlockBook(bookName string) error {
	return os.Remove(filepath.Join(a.vaultDir, SanitizeName(bookName), "security.json"))
}

// --- METADATA MANAGEMENT ---
func (a *App) loadMetadata(bookPath string) BookMetadata {
	meta := BookMetadata{}
	metaPath := filepath.Join(bookPath, "metadata.json")
	if data, err := os.ReadFile(metaPath); err == nil {
		json.Unmarshal(data, &meta)
		return meta
	}
	legacyTagsPath := filepath.Join(bookPath, "tags.json")
	if data, err := os.ReadFile(legacyTagsPath); err == nil {
		json.Unmarshal(data, &meta.Tags)
	}
	if _, err := os.Stat(filepath.Join(bookPath, "hidden.marker")); err == nil {
		meta.IsHidden = true
	}
	return meta
}

func (a *App) UpdateBookMetadata(bookName, newName, description string, tags []string, isHidden, maskCover bool) error {
	oldSafe := SanitizeName(bookName)
	newSafe := SanitizeName(newName)

	if newSafe != oldSafe && newSafe != "" {
		oldPath := filepath.Join(a.vaultDir, oldSafe)
		newPath := filepath.Join(a.vaultDir, newSafe)
		if err := os.Rename(oldPath, newPath); err != nil {
			return err
		}
		bookName = newName
	}

	bookPath := filepath.Join(a.vaultDir, newSafe)
	currentMeta := a.loadMetadata(bookPath)

	uniqueMap := make(map[string]bool)
	var cleanTags []string
	for _, t := range tags {
		l := strings.ToLower(strings.TrimSpace(t))
		if l != "" && !uniqueMap[l] {
			uniqueMap[l] = true
			cleanTags = append(cleanTags, l)
		}
	}

	meta := BookMetadata{
		Tags:         cleanTags,
		Description:  description,
		IsHidden:     isHidden,
		MaskCover:    maskCover,
		LastPage:     currentMeta.LastPage,
		TotalPages:   currentMeta.TotalPages,
		IsFavorite:   currentMeta.IsFavorite,   // Preserve
		LastReadTime: currentMeta.LastReadTime, // Preserve
	}

	data, _ := json.MarshalIndent(meta, "", " ")
	return os.WriteFile(filepath.Join(bookPath, "metadata.json"), data, 0644)
}

// [UPDATE] Update Book Progress + LastReadTime
func (a *App) UpdateBookProgress(bookName string, pageIndex int) error {
	bookPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	meta := a.loadMetadata(bookPath)

	meta.LastPage = pageIndex
	meta.LastReadTime = time.Now().Unix() // Update waktu baca terakhir

	data, _ := json.MarshalIndent(meta, "", " ")
	return os.WriteFile(filepath.Join(bookPath, "metadata.json"), data, 0644)
}

// [NEW] Toggle Favorite Status
func (a *App) ToggleBookFavorite(bookName string) (bool, error) {
	bookPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	meta := a.loadMetadata(bookPath)

	meta.IsFavorite = !meta.IsFavorite // Toggle status

	data, _ := json.MarshalIndent(meta, "", " ")
	err := os.WriteFile(filepath.Join(bookPath, "metadata.json"), data, 0644)
	return meta.IsFavorite, err
}

// --- IMPORT & FILE ---
func SanitizeName(name string) string {
	re := regexp.MustCompile(`[<>:"|?*]`)
	return strings.TrimSpace(re.ReplaceAllString(name, "_"))
}

func (a *App) SelectFolder() string {
	res, _ := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Pilih Folder"})
	return res
}

func (a *App) CreateBook(bookName string, sourcePath string, syncMode bool) string {
	if bookName == "" || sourcePath == "" {
		return "Data kosong"
	}
	safeBookName := SanitizeName(strings.ReplaceAll(bookName, string(os.PathSeparator), "_"))
	bookPath := filepath.Join(a.vaultDir, safeBookName)

	if !syncMode {
		if _, err := os.Stat(bookPath); !os.IsNotExist(err) {
			return "Buku sudah ada."
		}
	}
	os.MkdirAll(bookPath, 0755)

	imageCount := 0
	filepath.WalkDir(sourcePath, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".jpg" || ext == ".png" || ext == ".jpeg" || ext == ".webp" {
			relPath, _ := filepath.Rel(sourcePath, path)
			slashPath := filepath.ToSlash(relPath)
			parts := strings.Split(slashPath, "/")
			var safeParts []string
			for i, p := range parts {
				if i == len(parts)-1 {
					safeParts = append(safeParts, SanitizeName(strings.TrimSuffix(p, filepath.Ext(p)))+".jpg")
				} else {
					safeParts = append(safeParts, SanitizeName(p))
				}
			}
			destPath := filepath.Join(bookPath, filepath.Join(safeParts...))
			os.MkdirAll(filepath.Dir(destPath), 0755)

			if syncMode {
				if _, err := os.Stat(destPath); !os.IsNotExist(err) {
					return nil
				}
			}

			srcImg, err := imaging.Open(path)
			if err == nil {
				if srcImg.Bounds().Dx() > maxWidth {
					srcImg = imaging.Resize(srcImg, maxWidth, 0, imaging.Lanczos)
				}
				var buf bytes.Buffer
				imaging.Encode(&buf, srcImg, imaging.JPEG, imaging.JPEGQuality(jpegQuality))
				encData, _ := EncryptData(buf.Bytes())
				os.WriteFile(destPath, encData, 0644)
				imageCount++
			}
		}
		return nil
	})
	return fmt.Sprintf("Sukses! %d gambar.", imageCount)
}

func (a *App) BatchImportBooks(rootPath string) []string {
	var logs []string
	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return []string{"Gagal membaca folder: " + err.Error()}
	}

	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			bookName := entry.Name()
			fullPath := filepath.Join(rootPath, bookName)
			res := a.CreateBook(bookName, fullPath, false)
			if strings.Contains(res, "Sukses") {
				count++
			} else {
				logs = append(logs, fmt.Sprintf("Skip [%s]: %s", bookName, res))
			}
		}
	}
	summary := fmt.Sprintf("Selesai! %d buku berhasil diimpor.", count)
	result := append([]string{summary}, logs...)
	return result
}

func (a *App) GetBooks() []Book {
	var books []Book
	entries, _ := os.ReadDir(a.vaultDir)
	for _, e := range entries {
		if e.IsDir() {
			bookPath := filepath.Join(a.vaultDir, e.Name())
			meta := a.loadMetadata(bookPath)

			if meta.IsHidden && !a.hiddenModeActive {
				continue
			}

			isLocked := false
			if _, err := os.Stat(filepath.Join(bookPath, "security.json")); err == nil {
				isLocked = true
			}

			coverB64 := ""
			shouldShowCover := !meta.MaskCover || (meta.MaskCover && a.unlockedBooks[e.Name()])

			if shouldShowCover {
				coverName := ""
				if d, err := os.ReadFile(filepath.Join(bookPath, "cover.db")); err == nil {
					coverName = string(d)
				} else {
					filepath.WalkDir(bookPath, func(p string, d fs.DirEntry, er error) error {
						if !d.IsDir() && strings.HasSuffix(strings.ToLower(d.Name()), ".jpg") {
							coverName, _ = filepath.Rel(bookPath, p)
							return io.EOF
						}
						return nil
					})
				}
				if coverName != "" {
					if data, err := os.ReadFile(filepath.Join(bookPath, coverName)); err == nil {
						dec := TryDecryptData(data)
						if img, err := imaging.Decode(bytes.NewReader(dec)); err == nil {
							thm := imaging.Resize(img, coverWidth, 0, imaging.Lanczos)
							var buf bytes.Buffer
							imaging.Encode(&buf, thm, imaging.JPEG, imaging.JPEGQuality(jpegQuality))
							coverB64 = "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
						}
					}
				}
			}

			books = append(books, Book{
				Name:         e.Name(),
				Cover:        coverB64,
				Tags:         meta.Tags,
				Description:  meta.Description,
				IsLocked:     isLocked,
				IsHidden:     meta.IsHidden,
				MaskCover:    meta.MaskCover,
				LastPage:     meta.LastPage,
				IsFavorite:   meta.IsFavorite,   // [NEW]
				LastReadTime: meta.LastReadTime, // [NEW]
			})
		}
	}
	return books
}

func (a *App) GetChapters(bookName string) []string {
	var chapters []string
	entries, _ := os.ReadDir(filepath.Join(a.vaultDir, SanitizeName(bookName)))
	for _, e := range entries {
		if e.IsDir() {
			chapters = append(chapters, e.Name())
		}
	}
	natsort(chapters)
	return chapters
}
func (a *App) GetImagesInChapter(bookName, chapterName string) []string {
	var files []string
	targetPath := filepath.Join(a.vaultDir, SanitizeName(bookName))
	if chapterName != "" {
		targetPath = filepath.Join(targetPath, chapterName)
	}
	entries, _ := os.ReadDir(targetPath)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".jpg") {
			files = append(files, e.Name())
		}
	}
	natsort(files)
	return files
}
func EncryptData(plain []byte) ([]byte, error) {
	block, _ := aes.NewCipher(EncryptionKey)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	io.ReadFull(rand.Reader, nonce)
	return gcm.Seal(nonce, nonce, plain, nil), nil
}
func TryDecryptData(data []byte) []byte {
	if len(data) < 16 {
		return data
	}
	block, _ := aes.NewCipher(EncryptionKey)
	gcm, _ := cipher.NewGCM(block)
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return data
	}
	return plain
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
func natsort(s []string) {
	sort.Slice(s, func(i, j int) bool { return naturalCompare(s[i], s[j]) })
}

func naturalCompare(a, b string) bool {
	i, j := 0, 0
	for i < len(a) && j < len(b) {
		if unicode.IsDigit(rune(a[i])) && unicode.IsDigit(rune(b[j])) {
			iEnd, jEnd := i, j
			for iEnd < len(a) && unicode.IsDigit(rune(a[iEnd])) {
				iEnd++
			}
			for jEnd < len(b) && unicode.IsDigit(rune(b[jEnd])) {
				jEnd++
			}
			numA, _ := strconv.Atoi(a[i:iEnd])
			numB, _ := strconv.Atoi(b[j:jEnd])
			if numA != numB {
				return numA < numB
			}
			i, j = iEnd, jEnd
		} else {
			if a[i] != b[j] {
				return a[i] < b[j]
			}
			i++
			j++
		}
	}
	return len(a) < len(b)
}