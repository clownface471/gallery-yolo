package main

import (
	"bytes"
	"embed"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

// FileLoader implements http.Handler to serve files from the vault
type FileLoader struct {
	vaultPath string
}

// NewFileLoader creates a new FileLoader instance
func NewFileLoader() *FileLoader {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("Fatal: could not get user config dir for FileLoader: %v", err)
	}
	// Pastikan path ini sinkron dengan yang ada di app.go
	vaultPath := filepath.Join(userConfigDir, "GalleryVault", "vault")
	return &FileLoader{
		vaultPath: vaultPath,
	}
}

// ServeHTTP handles the request to serve a file with on-the-fly decryption
func (f *FileLoader) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 1. PRIVASI TOTAL: Header Anti-Cache yang Ketat
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("ETag", "")

	// 2. Decode URL Path
	path, err := url.PathUnescape(r.URL.Path)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		log.Printf("Error unescaping path: %v", err)
		return
	}

	// 3. Validasi Path (/img/...)
	relativePath := strings.TrimPrefix(path, "/img/")
	if relativePath == path {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// [PENTING] Konversi slash '/' (URL) menjadi backslash '\' (Windows)
	// Ini krusial untuk fitur Chapter agar path terbaca: "Book\Chapter1\Image.jpg"
	relativePath = filepath.FromSlash(relativePath)

	// Gabungkan dengan path Vault
	filePath := filepath.Join(f.vaultPath, relativePath)

	// 4. Keamanan Path Traversal (Updated untuk Chapter)
	absVaultPath, _ := filepath.Abs(f.vaultPath)
	absFilePath, _ := filepath.Abs(filePath)

	// Pastikan path yang diminta benar-benar ada DI DALAM folder vault
	if !strings.HasPrefix(absFilePath, absVaultPath) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// 5. Cek Keberadaan File
	stat, err := os.Stat(filePath)
	if os.IsNotExist(err) || stat.IsDir() {
		http.NotFound(w, r)
		return
	}

	// 6. Baca File dari Disk
	fileData, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		log.Printf("Error reading file %s: %v", filePath, err)
		return
	}

	// 7. DEKRIPSI
	// Menggunakan fungsi TryDecryptData dari app.go (package main)
	decryptedData := TryDecryptData(fileData)

	// 8. Sajikan Gambar
	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeContent(w, r, filepath.Base(filePath), time.Now(), bytes.NewReader(decryptedData))
}

func main() {
	app := NewApp()
	fileLoader := NewFileLoader()

	err := wails.Run(&options.App{
		Title:  "GalleryVault",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: fileLoader,
		},
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 46, A: 1}, // Catppuccin Dark Base
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}