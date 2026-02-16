package main

import (
	"bytes"
	"embed"
	"image/jpeg"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/disintegration/imaging" // Pastikan library ini ada
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

type FileLoader struct {
	app       *App
	vaultPath string
	cachePath string // [BARU] Folder khusus cache thumbnail
}

func NewFileLoader(app *App) *FileLoader {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("Fatal: could not get user config dir: %v", err)
	}
	baseDir := filepath.Join(userConfigDir, "GalleryVault")
	return &FileLoader{
		app:       app,
		vaultPath: filepath.Join(baseDir, "vault"),
		cachePath: filepath.Join(baseDir, "cache"), // Cache terpisah dari Vault
	}
}

func (f *FileLoader) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	
	rawPath := r.URL.Path
	path, err := url.PathUnescape(rawPath)
	if err != nil { http.Error(w, "Bad request", 400); return }

	// --- HANDLER 1: THUMBNAIL (/thumbnail/BookName) ---
	if strings.HasPrefix(path, "/thumbnail/") {
		bookName := strings.TrimPrefix(path, "/thumbnail/")
		f.serveThumbnail(w, r, bookName)
		return
	}

	// --- HANDLER 2: ORIGINAL IMAGE (/img/...) ---
	if strings.HasPrefix(path, "/img/") {
		relativePath := strings.TrimPrefix(path, "/img/")
		if relativePath == path { http.Error(w, "Bad request", 400); return }

		// SECURITY CHECK
		cleanRelPath := filepath.FromSlash(relativePath)
		parts := strings.Split(cleanRelPath, string(os.PathSeparator))
		if len(parts) > 0 {
			// Cek akses ke buku (Hidden/Locked)
			if !f.app.CheckAccess(parts[0]) {
				http.Error(w, "Forbidden", 403)
				return
			}
		}

		filePath := filepath.Join(f.vaultPath, cleanRelPath)
		// Prevent Path Traversal
		absVault, _ := filepath.Abs(f.vaultPath)
		absFile, _ := filepath.Abs(filePath)
		if !strings.HasPrefix(absFile, absVault) { http.Error(w, "Forbidden", 403); return }

		stat, err := os.Stat(filePath)
		if os.IsNotExist(err) || stat.IsDir() { http.NotFound(w, r); return }

		fileData, err := os.ReadFile(filePath)
		if err != nil { http.Error(w, "Error", 500); return }

		decryptedData := TryDecryptData(fileData)
		w.Header().Set("Content-Type", "image/jpeg")
		http.ServeContent(w, r, filepath.Base(filePath), time.Now(), bytes.NewReader(decryptedData))
		return
	}

	http.NotFound(w, r)
}

// [BARU] Fungsi Generate/Serve Thumbnail
func (f *FileLoader) serveThumbnail(w http.ResponseWriter, r *http.Request, bookName string) {
	// 1. Cek Cache
	// Nama file cache: Hash dari nama buku supaya aman dari karakter aneh
	safeCacheName := HashString(bookName) + ".jpg"
	cacheFilePath := filepath.Join(f.cachePath, safeCacheName)

	// Jika Cache ada, langsung kirim (SUPER CEPAT)
	if _, err := os.Stat(cacheFilePath); err == nil {
		http.ServeFile(w, r, cacheFilePath)
		return
	}

	// 2. Jika Cache tidak ada, Generate baru
	// (Proses ini agak berat, tapi hanya terjadi sekali seumur hidup per buku)
	
	// Cek akses dulu (Thumbnail Hidden Book tidak boleh bocor kalau Hidden Zone mati)
	if !f.app.CheckAccess(bookName) {
		// Kirim gambar placeholder transparan atau 403
		http.Error(w, "Forbidden", 403)
		return
	}

	// Cari path cover asli dari DB (via App)
	coverPath, err := f.app.GetBookCoverPath(bookName)
	if err != nil || coverPath == "" {
		http.NotFound(w, r)
		return
	}

	fullCoverPath := filepath.Join(f.vaultPath, coverPath)
	fileData, err := os.ReadFile(fullCoverPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// Decrypt & Resize
	decrypted := TryDecryptData(fileData)
	img, err := imaging.Decode(bytes.NewReader(decrypted))
	if err != nil {
		http.Error(w, "Decode Error", 500)
		return
	}

	// Resize ke lebar 300px (tinggi menyesuaikan)
	thumb := imaging.Resize(img, 300, 0, imaging.Lanczos)

	// Simpan ke Cache
	os.MkdirAll(f.cachePath, 0755)
	out, err := os.Create(cacheFilePath)
	if err == nil {
		jpeg.Encode(out, thumb, &jpeg.Options{Quality: 75})
		out.Close()
	}

	// Kirim hasil resize
	buf := new(bytes.Buffer)
	jpeg.Encode(buf, thumb, &jpeg.Options{Quality: 75})
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(buf.Bytes())
}

func main() {
	app := NewApp()
	fileLoader := NewFileLoader(app)

	err := wails.Run(&options.App{
		Title:  "GalleryVault",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: fileLoader,
		},
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 46, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,  
			DisableWebViewDrop: true,  
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}