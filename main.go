package main

import (
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

// FileLoader implements http.Handler to serve files from the vault.
type FileLoader struct {
	vaultPath string
}

// NewFileLoader creates a new FileLoader instance.
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

// ServeHTTP handles the request to serve a file.
func (f *FileLoader) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path, err := url.PathUnescape(r.URL.Path)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	// The path will be like "/img/BookName/image.jpg"
	// We want to serve the file at "VAULT_PATH/BookName/image.jpg"
	relativePath := strings.TrimPrefix(path, "/img/")
	filePath := filepath.Join(f.vaultPath, relativePath)

	// Check if file exists to prevent directory listing etc.
	stat, err := os.Stat(filePath)
	if os.IsNotExist(err) || stat.IsDir() {
		http.NotFound(w, r)
		return
	}

	// Disable caching
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	http.ServeFile(w, r, filePath)
}


func main() {
	// Create an instance of the app structure
	app := NewApp()
	fileLoader := NewFileLoader()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "GalleryVault",
		Width:  1280, // Increased width for better viewing
		Height: 800,  // Increased height for better viewing
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: fileLoader, // Use the custom file loader
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