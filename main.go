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

type FileLoader struct {
	vaultPath string
}

func NewFileLoader() *FileLoader {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("Fatal: could not get user config dir: %v", err)
	}
	return &FileLoader{
		vaultPath: filepath.Join(userConfigDir, "GalleryVault", "vault"),
	}
}

func (f *FileLoader) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	
	path, err := url.PathUnescape(r.URL.Path)
	if err != nil { http.Error(w, "Bad request", 400); return }

	relativePath := strings.TrimPrefix(path, "/img/")
	if relativePath == path { http.Error(w, "Bad request", 400); return }

	relativePath = filepath.FromSlash(relativePath)
	filePath := filepath.Join(f.vaultPath, relativePath)

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
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 46, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
		// [KEMBALIKAN KE TRUE] Agar Wails menghandle event, bukan browser
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,  
			DisableWebViewDrop: true,  
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}