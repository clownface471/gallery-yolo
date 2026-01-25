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
	vaultPath := filepath.Join(userConfigDir, "GalleryVault", "vault")
	return &FileLoader{
		vaultPath: vaultPath,
	}
}

// ServeHTTP handles the request to serve a file with on-the-fly decryption
func (f *FileLoader) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Disable caching to prevent stale encrypted images
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("ETag", "")

	path, err := url.PathUnescape(r.URL.Path)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		log.Printf("Error unescaping path: %v", err)
		return
	}

	// Path will be like "/img/BookName/image.jpg"
	// Extract to "VAULT_PATH/BookName/image.jpg"
	relativePath := strings.TrimPrefix(path, "/img/")
	if relativePath == path {
		// Path didn't start with /img/
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(f.vaultPath, relativePath)

	// Security: ensure path is within vault
	absVaultPath, _ := filepath.Abs(f.vaultPath)
	absFilePath, _ := filepath.Abs(filePath)
	if !strings.HasPrefix(absFilePath, absVaultPath) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Validate file exists
	stat, err := os.Stat(filePath)
	if os.IsNotExist(err) || stat.IsDir() {
		http.NotFound(w, r)
		return
	}

	// Read file (could be encrypted or plain)
	fileData, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		log.Printf("Error reading file %s: %v", filePath, err)
		return
	}

	// Try to decrypt, or use as-is if it's plain unencrypted
	decryptedData := TryDecryptData(fileData)

	// Serve decrypted data
	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeContent(w, r, filepath.Base(filePath), stat.ModTime(), bytes.NewReader(decryptedData))
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
