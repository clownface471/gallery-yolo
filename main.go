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
	// Mencegah browser menyimpan salinan gambar yang sudah didekripsi
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

	filePath := filepath.Join(f.vaultPath, relativePath)

	// 4. Keamanan Path Traversal
	// Pastikan request tidak keluar dari folder vault
	absVaultPath, _ := filepath.Abs(f.vaultPath)
	absFilePath, _ := filepath.Abs(filePath)
	if !strings.HasPrefix(absFilePath, absVaultPath) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// 5. Cek Keberadaan File
	_, err = os.Stat(filePath)
	if os.IsNotExist(err) {
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

	// 7. DEKRIPSI (PENTING)
	// Memanggil fungsi TryDecryptData yang ada di app.go (paket main yang sama)
	decryptedData := TryDecryptData(fileData)

	// 8. Sajikan Gambar
	// Menggunakan time.Now() agar browser tidak melakukan caching berbasis waktu modifikasi
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
			Handler: fileLoader, // Menggunakan handler kustom kita
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}