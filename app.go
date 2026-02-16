package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"	
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"runtime" // Standard Library (untuk NumCPU)
	"sort"
	"strconv"
	"strings"
	"sync" // Penting untuk Worker Pool
	"time"
	"unicode"

	"github.com/disintegration/imaging"
	"github.com/glebarez/sqlite"
	
	// [FIX] Kita alias ini jadi 'wailsRuntime' supaya tidak bentrok dengan 'runtime' asli
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime" 
	
	_ "golang.org/x/image/webp"
	"gorm.io/gorm"
)

var EncryptionKey = []byte("GalleryVault_SecureKey_2026_IDN!")

const (
	maxWidth    = 1920
	jpegQuality = 75
	coverWidth  = 300
)

// Job struct untuk worker import
type ImportJob struct {
	Path       string
	DestPath   string
	ResultChan chan<- bool
}

type App struct {
	ctx              context.Context
	db               *gorm.DB
	vaultDir         string
	hiddenModeActive bool
	unlockedBooks    map[string]bool
}

// [BARU] Struct untuk Filter Pencarian dari Frontend
type SearchQuery struct {
	Query    string   `json:"query"`
	Tags     []string `json:"tags"`
	SortBy   string   `json:"sort_by"`
	OnlyFav  bool     `json:"only_fav"`
	Page     int      `json:"page"`
	Limit    int      `json:"limit"`
	SeriesID int      `json:"series_id"` // [BARU] Filter Series
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
	os.MkdirAll(a.vaultDir, 0755)

	dbPath := filepath.Join(appDataDir, "library.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatal("Gagal koneksi database:", err)
	}
	a.db = db
a.db.AutoMigrate(&GlobalConfig{}, &Book{}, &Tag{}, &Series{})
}

// --- CONFIG & SECURITY ---
func HashString(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
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

func (a *App) getConfig(key string) string {
	var conf GlobalConfig
	if a.db.First(&conf, "key = ?", key).Error != nil {
		return ""
	}
	return conf.Value
}

func (a *App) setConfig(key, value string) {
	var conf GlobalConfig
	a.db.Where(GlobalConfig{Key: key}).Assign(GlobalConfig{Value: value}).FirstOrCreate(&conf)
}

func (a *App) HasPassword() bool { return a.getConfig("master_hash") != "" }
func (a *App) VerifyPassword(p string) bool { return HashString(p) == a.getConfig("master_hash") }
func (a *App) SetMasterPassword(p string) bool {
	if p == "" {
		return false
	}
	a.setConfig("master_hash", HashString(p))
	return true
}

func (a *App) SetHiddenZonePassword(p string) bool {
	if p == "" {
		return false
	}
	a.setConfig("hidden_hash", HashString(p))
	return true
}
func (a *App) ToggleHiddenZone(p string) bool {
	storedHash := a.getConfig("hidden_hash")
	if storedHash == "" {
		a.SetHiddenZonePassword(p)
		a.hiddenModeActive = true
		return true
	}
	if HashString(p) == storedHash {
		a.hiddenModeActive = true
		return true
	}
	return false
}
func (a *App) LockHiddenZone()             { a.hiddenModeActive = false }
func (a *App) IsHiddenZoneActive() bool    { return a.hiddenModeActive }
func (a *App) HasHiddenZonePassword() bool { return a.getConfig("hidden_hash") != "" }

// --- SECURITY CHECK (ACCESS CONTROL) ---
func (a *App) CheckAccess(bookName string) bool {
	var book Book
	if err := a.db.Where("LOWER(title) = ?", strings.ToLower(bookName)).First(&book).Error; err != nil {
		return true 
	}
	if book.IsHidden && !a.hiddenModeActive {
		return false
	}
	if book.IsLocked && !a.unlockedBooks[book.Title] {
		return false
	}
	return true
}

// --- BOOK CRUD (HIGH PERFORMANCE IMPORT) ---

// [UPDATE] Hapus parameter 'id int' karena tidak dipakai
func (a *App) imageWorker(jobs <-chan ImportJob, wg *sync.WaitGroup) {
	defer wg.Done()
	for job := range jobs {
		srcImg, err := imaging.Open(job.Path)
		if err != nil {
			job.ResultChan <- false
			continue
		}

		if srcImg.Bounds().Dx() > maxWidth {
			srcImg = imaging.Resize(srcImg, maxWidth, 0, imaging.Lanczos)
		}

		var buf bytes.Buffer
		imaging.Encode(&buf, srcImg, imaging.JPEG, imaging.JPEGQuality(jpegQuality))
		encData, _ := EncryptData(buf.Bytes())

		err = os.WriteFile(job.DestPath, encData, 0644)
		job.ResultChan <- (err == nil)
	}
}

func (a *App) CreateBook(bookName string, sourcePath string, syncMode bool) string {
	if bookName == "" || sourcePath == "" {
		return "Data kosong"
	}
	safeName := SanitizeName(bookName)
	destPath := filepath.Join(a.vaultDir, safeName)

	var existingBook Book
	if err := a.db.Where("path = ?", destPath).First(&existingBook).Error; err == nil && !syncMode {
		return "Buku sudah ada di database."
	}

	if !syncMode {
		os.MkdirAll(destPath, 0755)
	}

	// 1. SCANNING PHASE
	type FileTask struct {
		Source string
		Dest   string
	}
	var tasks []FileTask
	var firstImage string

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
			finalDest := filepath.Join(destPath, filepath.Join(safeParts...))
			
			if firstImage == "" {
				relCover, _ := filepath.Rel(destPath, finalDest)
				firstImage = filepath.ToSlash(relCover)
			}

			if syncMode {
				if _, err := os.Stat(finalDest); !os.IsNotExist(err) {
					return nil
				}
			}

			os.MkdirAll(filepath.Dir(finalDest), 0755)
			tasks = append(tasks, FileTask{Source: path, Dest: finalDest})
		}
		return nil
	})

	if len(tasks) == 0 {
		return "Tidak ada gambar baru ditemukan."
	}

	// 2. PROCESSING PHASE (Concurrency)
	numWorkers := runtime.NumCPU() // Menggunakan 'runtime' asli Go
	jobs := make(chan ImportJob, len(tasks))
	results := make(chan bool, len(tasks))
	var wg sync.WaitGroup

for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		// [UPDATE] Jangan kirim 'w' lagi
		go a.imageWorker(jobs, &wg)
	}

	for _, t := range tasks {
		jobs <- ImportJob{
			Path:       t.Source,
			DestPath:   t.Dest,
			ResultChan: results,
		}
	}
	close(jobs)
	wg.Wait()
	close(results)

	successCount := 0
	for res := range results {
		if res {
			successCount++
		}
	}

	// 3. DATABASE UPDATE
	if !syncMode {
		newBook := Book{
			Title:     bookName,
			Path:      destPath,
			CoverPath: firstImage,
		}
		a.db.Create(&newBook)
	}

	return fmt.Sprintf("Sukses! %d gambar diimpor (Parallel Mode).", successCount)
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
	return append([]string{summary}, logs...)
}

// [BARU] Helper untuk main.go mengambil path cover
func (a *App) GetBookCoverPath(bookName string) (string, error) {
	var book Book
	// Cari path relatif cover
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return "", err
	}
	// return: "NamaBuku/Chapter1/01.jpg"
	// Ingat path di DB adalah Full Path, kita butuh relatif terhadap Vault untuk main.go
	// Tapi tunggu, Book struct punya 'CoverPath' yang relatif terhadap folder buku.
	// Dan 'Path' adalah full path folder buku.
	// Kita perlu mengembalikan path relatif terhadap VAULT DIR.
	
	// Konstruksi ulang: Book Folder Name + Cover Path
	bookDirName := filepath.Base(book.Path)
	relCover := filepath.Join(bookDirName, book.CoverPath)
	return relCover, nil
}

// [UPDATE] GetBooks dengan Pagination yang Benar
func (a *App) GetBooks(filter SearchQuery) []BookFrontend {
	var books []Book
	var result []BookFrontend

	// Preload Tags dan Series
	db := a.db.Model(&Book{}).Preload("Tags").Preload("Series")

	// --- FILTERING (Sama seperti sebelumnya) ---
	if !a.hiddenModeActive {
		db = db.Where("is_hidden = ?", false)
	}
	if filter.Query != "" {
		likeQuery := "%" + strings.ToLower(filter.Query) + "%"
		db = db.Where("LOWER(title) LIKE ?", likeQuery)
	}
	if filter.OnlyFav {
		db = db.Where("is_favorite = ?", true)
	}
	if len(filter.Tags) > 0 {
		db = db.Joins("JOIN book_tags ON book_tags.book_id = books.id").
			Joins("JOIN tags ON tags.id = book_tags.tag_id").
			Where("tags.name IN ?", filter.Tags).
			Group("books.id").
			Having("COUNT(DISTINCT tags.id) = ?", len(filter.Tags))
	}
	if filter.SeriesID > 0 {
		db = db.Where("series_id = ?", filter.SeriesID)
	}

	// --- SORTING ---
	switch filter.SortBy {
	case "date_desc":
		db = db.Order("last_read_time desc")
	case "date_asc":
		db = db.Order("last_read_time asc")
	case "name_desc":
		db = db.Order("title desc")
	default:
		db = db.Order("title asc")
	}

	// --- [BARU] PAGINATION LOGIC ---
	// Jika Limit > 0, kita batasi result set
	if filter.Limit > 0 {
		offset := (filter.Page - 1) * filter.Limit
		db = db.Offset(offset).Limit(filter.Limit)
	}

	// Eksekusi Query
	db.Find(&books)

	// Convert ke Frontend
	for _, b := range books {
		var tagNames []string
		for _, t := range b.Tags {
			tagNames = append(tagNames, t.Name)
		}
        
        // Cek nama series
        seriesName := ""
        if b.Series != nil {
            seriesName = b.Series.Title
        }

		result = append(result, BookFrontend{
			Name:         b.Title,
			Cover:        "", // Frontend pakai Thumbnail URL
			Tags:         tagNames,
			Description:  b.Description,
			IsLocked:     b.IsLocked,
			IsHidden:     b.IsHidden,
			MaskCover:    b.MaskCover,
			LastPage:     b.LastPage,
			IsFavorite:   b.IsFavorite,
			LastReadTime: b.LastReadTime.Unix(),
            SeriesName:   seriesName,
		})
	}
	return result
}

func (a *App) UpdateBookMetadata(bookName, newName, description string, tags []string, isHidden, maskCover bool) error {
	var book Book
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return fmt.Errorf("buku tidak ditemukan")
	}

	if newName != bookName && newName != "" {
		newSafe := SanitizeName(newName)
		newPath := filepath.Join(a.vaultDir, newSafe)
		if err := os.Rename(book.Path, newPath); err != nil {
			return err
		}
		book.Title = newName
		book.Path = newPath
	}

	book.Description = description
	book.IsHidden = isHidden
	book.MaskCover = maskCover

	a.db.Model(&book).Association("Tags").Clear()
	var newTags []Tag
	for _, tName := range tags {
		cleanName := strings.TrimSpace(tName)
		if cleanName != "" {
			var t Tag
			a.db.FirstOrCreate(&t, Tag{Name: cleanName})
			newTags = append(newTags, t)
		}
	}
	book.Tags = newTags
	return a.db.Save(&book).Error
}

func (a *App) UpdateBookProgress(bookName string, pageIndex int) error {
	return a.db.Model(&Book{}).Where("title = ?", bookName).Updates(map[string]interface{}{
		"last_page":      pageIndex,
		"last_read_time": time.Now(),
	}).Error
}

func (a *App) ToggleBookFavorite(bookName string) (bool, error) {
	var book Book
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return false, err
	}
	newStatus := !book.IsFavorite
	err := a.db.Model(&book).Update("is_favorite", newStatus).Error
	return newStatus, err
}

func (a *App) DeleteBook(bookName string) error {
	var book Book
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return err
	}
	os.RemoveAll(book.Path)
	return a.db.Unscoped().Delete(&book).Error
}

// --- CHAPTERS & READERS ---
func (a *App) GetChapters(bookName string) []string {
	var book Book
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return []string{}
	}
	var chapters []string
	entries, _ := os.ReadDir(book.Path)
	for _, e := range entries {
		if e.IsDir() {
			chapters = append(chapters, e.Name())
		}
	}
	natsort(chapters)
	return chapters
}

func (a *App) GetImagesInChapter(bookName, chapterName string) []string {
	var book Book
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return []string{}
	}
	targetPath := book.Path
	if chapterName != "" {
		targetPath = filepath.Join(targetPath, chapterName)
	}
	var files []string
	entries, _ := os.ReadDir(targetPath)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".jpg") {
			files = append(files, e.Name())
		}
	}
	natsort(files)
	return files
}

// --- SERIES MANAGEMENT ---

// Struct untuk Frontend
type SeriesFrontend struct {
	ID          uint   `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Count       int64  `json:"count"`      // Jumlah buku
	Cover       string `json:"cover_book"` // Nama buku untuk diambil thumbnail-nya
}

// 1. Ambil Daftar Series
func (a *App) GetAllSeries() []SeriesFrontend {
	var series []Series
	var result []SeriesFrontend

	// Ambil semua series dengan preload Books (hanya butuh 1 buku untuk cover)
	// Kita gunakan subquery atau logic manual biar efisien
	a.db.Model(&Series{}).Preload("Books", func(db *gorm.DB) *gorm.DB {
		return db.Select("id, series_id, title").Order("title asc").Limit(1)
	}).Find(&series)

	for _, s := range series {
		// Hitung jumlah buku
		var count int64
		a.db.Model(&Book{}).Where("series_id = ?", s.ID).Count(&count)
		
		coverBook := ""
		if len(s.Books) > 0 {
			coverBook = s.Books[0].Title
		}

		result = append(result, SeriesFrontend{
			ID:          s.ID,
			Title:       s.Title,
			Description: s.Description,
			Count:       count,
			Cover:       coverBook, // Frontend akan request /thumbnail/CoverBook
		})
	}
	return result
}

// 2. Buat Series Baru
func (a *App) CreateSeries(name, desc string) string {
	if name == "" { return "Nama tidak boleh kosong" }
	
	// Cek duplikat
	var count int64
	a.db.Model(&Series{}).Where("title = ?", name).Count(&count)
	if count > 0 { return "Series sudah ada" }

	newSeries := Series{Title: name, Description: desc}
	if err := a.db.Create(&newSeries).Error; err != nil {
		return "Error: " + err.Error()
	}
	return "OK"
}

// 3. Tambahkan Buku ke Series
func (a *App) AddBookToSeries(bookName, seriesName string) error {
	var series Series
	if err := a.db.Where("title = ?", seriesName).First(&series).Error; err != nil {
		return fmt.Errorf("series tidak ditemukan")
	}

	var book Book
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return fmt.Errorf("buku tidak ditemukan")
	}

	// Update relasi
	book.SeriesID = &series.ID
	return a.db.Save(&book).Error
}

// 4. Keluarkan Buku dari Series
func (a *App) RemoveBookFromSeries(bookName string) error {
	return a.db.Model(&Book{}).Where("title = ?", bookName).Update("series_id", nil).Error
}

// 5. Hapus Series (Buku tidak terhapus, cuma ungroup)
func (a *App) DeleteSeries(name string) error {
	// Karena constraint OnDelete: SET NULL di models, buku otomatis lepas dari series
	return a.db.Where("title = ?", name).Delete(&Series{}).Error
}

func (a *App) SetBookCover(bookName, imageName string) error {
	return a.db.Model(&Book{}).Where("title = ?", bookName).Update("cover_path", imageName).Error
}

func (a *App) SelectFolder() string {
	// [FIX] Menggunakan 'wailsRuntime' untuk memanggil dialog Wails
	res, _ := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{Title: "Pilih Folder"})
	return res
}

func (a *App) LockBook(bookName, p string) error {
	if p == "" {
		return fmt.Errorf("password tidak boleh kosong")
	}
	return a.db.Model(&Book{}).Where("title = ?", bookName).Updates(map[string]interface{}{
		"is_locked":     true,
		"password_hash": HashString(p),
	}).Error
}

func (a *App) UnlockBook(bookName string) error {
	return a.db.Model(&Book{}).Where("title = ?", bookName).Updates(map[string]interface{}{
		"is_locked":     false,
		"password_hash": "",
	}).Error
}

func (a *App) VerifyBookPassword(bookName, p string) bool {
	var book Book
	if err := a.db.Where("title = ?", bookName).First(&book).Error; err != nil {
		return false
	}
	if book.IsLocked && book.PasswordHash == "" {
		a.unlockedBooks[bookName] = true
		return true
	}
	if HashString(p) == book.PasswordHash {
		a.unlockedBooks[bookName] = true
		return true
	}
	return false
}

func SanitizeName(name string) string {
	re := regexp.MustCompile(`[<>:"|?*]`)
	return strings.TrimSpace(re.ReplaceAllString(name, "_"))
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

// --- ADMIN DASHBOARD & TAG MANAGER ---

type DashboardStats struct {
	TotalBooks    int64          `json:"total_books"`
	TotalSeries   int64          `json:"total_series"`
	TotalTags     int64          `json:"total_tags"`
	TopTags       []TagWithCount `json:"top_tags"`
	RecentBooks   []BookFrontend `json:"recent_books"`
}

type TagWithCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// 1. Get Dashboard Data
func (a *App) GetDashboardStats() DashboardStats {
	var stats DashboardStats

	// Hitung Total
	a.db.Model(&Book{}).Count(&stats.TotalBooks)
	a.db.Model(&Series{}).Count(&stats.TotalSeries)
	a.db.Model(&Tag{}).Count(&stats.TotalTags)

	// Ambil Top 10 Tags
	// Query SQL Agak kompleks: Join tags & book_tags, Group by tag name, Order by count
	a.db.Table("tags").
		Select("tags.name, count(book_tags.book_id) as count").
		Joins("left join book_tags on book_tags.tag_id = tags.id").
		Group("tags.id").
		Order("count desc").
		Limit(10).
		Scan(&stats.TopTags)

	// Ambil 5 Buku Terakhir Dibaca
	filter := SearchQuery{SortBy: "date_desc", Limit: 5}
	// Reuse logic GetBooks yang sudah ada (biar DRY - Don't Repeat Yourself)
	// Tapi kita perlu bypass Hidden Check kalau admin yang minta? 
	// Asumsikan Dashboard ini aman.
	stats.RecentBooks = a.GetBooks(filter)

	return stats
}

// 2. Ambil SEMUA Tag (Untuk Manager)
func (a *App) GetAllTagsAdmin() []TagWithCount {
	var tags []TagWithCount
	a.db.Table("tags").
		Select("tags.name, count(book_tags.book_id) as count").
		Joins("left join book_tags on book_tags.tag_id = tags.id").
		Group("tags.id").
		Order("name asc").
		Scan(&tags)
	return tags
}

// 3. Rename Tag (Massal)
func (a *App) RenameTag(oldName, newName string) string {
	if oldName == "" || newName == "" { return "Nama tidak boleh kosong" }
	
	// Cek apakah tag target sudah ada
	var targetTag Tag
	if err := a.db.Where("name = ?", newName).First(&targetTag).Error; err == nil {
		// KASUS MERGE: Tag baru sudah ada (misal rename 'Actionn' ke 'Action').
		// Kita harus memindahkan semua buku dari tag lama ke tag baru, lalu hapus tag lama.
		
		var oldTag Tag
		if err := a.db.Where("name = ?", oldName).First(&oldTag).Error; err != nil {
			return "Tag lama tidak ditemukan"
		}

		// Ambil semua buku yang punya tag lama
		var books []Book
		a.db.Model(&oldTag).Association("Books").Find(&books)

		// Tambahkan tag baru ke buku-buku tersebut
		for _, b := range books {
			a.db.Model(&b).Association("Tags").Append(&targetTag)
		}

		// Hapus tag lama
		a.db.Delete(&oldTag)
		return "Tag berhasil di-merge!"
	}

	// KASUS RENAME BIASA: Tag target belum ada. Cukup update nama.
	if err := a.db.Model(&Tag{}).Where("name = ?", oldName).Update("name", newName).Error; err != nil {
		return "Error: " + err.Error()
	}
	return "Tag berhasil di-rename!"
}

// 4. Hapus Tag (Dari Database & Semua Buku)
func (a *App) DeleteTagMaster(tagName string) string {
	var tag Tag
	if err := a.db.Where("name = ?", tagName).First(&tag).Error; err != nil {
		return "Tag tidak ditemukan"
	}

	// Hapus relasi di tabel pivot book_tags
	a.db.Model(&tag).Association("Books").Clear()
	
	// Hapus tag dari tabel tags
	a.db.Delete(&tag)
	
	return "Tag berhasil dihapus permanen"
}