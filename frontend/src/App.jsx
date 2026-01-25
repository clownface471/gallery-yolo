import { useState, useEffect, useCallback } from 'react';
import {
    CreateBook,
    GetBooks,
    GetImagesInBook,
    SelectFolder,
    HasPassword,
    SetMasterPassword,
    VerifyPassword,
    DeleteBook,
    DeleteImage,
    RenameBook,
    SetBookCover
} from '../wailsjs/go/main/App';
import './App.css';

// --- Icon Components ---
const LockIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>);
const TrashIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>);
const EditIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>);
const SyncIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>);
const CoverIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 22h-16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2z"></path><path d="m9 12-2 3h10l-4-5-4 5z"></path></svg>);


function App() {
    // --- State Hooks ---
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [hasPasswordSetup, setHasPasswordSetup] = useState(null);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    const [view, setView] = useState('library');
    const [books, setBooks] = useState([]);
    const [currentBook, setCurrentBook] = useState(null);
    const [imageFilenames, setImageFilenames] = useState([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [modalImageFile, setModalImageFile] = useState(null);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());

    // --- Auth Check on Startup ---
    useEffect(() => {
        const checkPasswordStatus = async () => {
            try {
                const hasSetup = await HasPassword();
                setHasPasswordSetup(hasSetup);
            } catch (error) {
                console.error("Error checking password status:", error);
                setAuthError("Gagal memverifikasi status aplikasi.");
            }
        };
        checkPasswordStatus();
    }, []);

    // --- Data Fetching & State Management ---
    const forceImageRefresh = () => setImageCacheBuster(Date.now());
    
    const fetchBooks = useCallback(async () => {
        if (!isAuthenticated) return;
        setIsLoading(true);
        try {
            const bookList = await GetBooks();
            setBooks(bookList || []);
            forceImageRefresh(); // Refresh images after fetching books (e.g., cover changes)
        } catch (error) {
            setStatusMessage("Error: Gagal memuat daftar buku.");
            console.error("Failed to fetch books:", error);
        }
        setIsLoading(false);
    }, [isAuthenticated]);

    const fetchImages = useCallback(async () => {
        if (view === 'gallery' && currentBook && isAuthenticated) {
            setIsLoading(true);
            setImageFilenames([]);
            try {
                const filenameList = await GetImagesInBook(currentBook);
                setImageFilenames(filenameList || []);
            } catch (error) {
                setStatusMessage(`Error: Gagal memuat gambar untuk buku ${currentBook}.`);
                console.error("Failed to fetch images:", error);
            }
            setIsLoading(false);
        }
    }, [view, currentBook, isAuthenticated]);

    useEffect(() => { fetchBooks(); }, [fetchBooks]);
    useEffect(() => { fetchImages(); }, [fetchImages]);

    // --- Modal Navigation ---
    const showNextImage = useCallback(() => {
        if (imageFilenames.length === 0) return;
        const nextIndex = (selectedIndex + 1) % imageFilenames.length;
        setSelectedIndex(nextIndex);
        setModalImageFile(imageFilenames[nextIndex]);
    }, [selectedIndex, imageFilenames]);

    const showPrevImage = useCallback(() => {
        if (imageFilenames.length === 0) return;
        const prevIndex = (selectedIndex - 1 + imageFilenames.length) % imageFilenames.length;
        setSelectedIndex(prevIndex);
        setModalImageFile(imageFilenames[prevIndex]);
    }, [selectedIndex, imageFilenames]);

    // Keyboard navigation for modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!modalImageFile) return;
            if (e.key === 'ArrowRight') showNextImage();
            else if (e.key === 'ArrowLeft') showPrevImage();
            else if (e.key === 'Escape') closeModal();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [modalImageFile, showNextImage, showPrevImage]);


    // --- Event Handlers ---
    const showLoadingStatus = (message, duration = 3000) => {
        setIsLoading(true);
        setStatusMessage(message);
        setTimeout(() => {
            setIsLoading(false);
            setStatusMessage('');
        }, duration);
    };

    const handleAddBookClick = async () => {
        const bookName = prompt("Masukkan nama untuk buku baru:");
        if (!bookName) return;

        try {
            const sourcePath = await SelectFolder();
            if (!sourcePath) return;
            setIsLoading(true);
            setStatusMessage(`Mengimpor gambar ke buku '${bookName}'...`);
            const result = await CreateBook(bookName, sourcePath, false); // syncMode = false
            setStatusMessage(result);
            await fetchBooks();
        } catch (error) {
            setStatusMessage("Error: Proses pembuatan buku gagal.");
            console.error("Failed to create book:", error);
        }
        setIsLoading(false);
    };
    
    const handleUpdateBook = async (e, bookName) => {
        e.stopPropagation();
        if (!window.confirm(`Update buku "${bookName.replace(/_/g, " ")}" dengan gambar dari folder baru?\nGambar yang sudah ada tidak akan diduplikasi.`)) return;

        try {
            const sourcePath = await SelectFolder();
            if (!sourcePath) return;
            setIsLoading(true);
            setStatusMessage(`Sinkronisasi gambar untuk '${bookName}'...`);
            const result = await CreateBook(bookName, sourcePath, true); // syncMode = true
            showLoadingStatus(result);
            await fetchBooks();
        } catch (error) {
            showLoadingStatus(`Error: Gagal sinkronisasi: ${error}`);
            console.error("Failed to sync book:", error);
        }
    };
    
    const handleRenameBook = async (e, oldName) => {
        e.stopPropagation();
        const newName = prompt(`Masukkan nama baru untuk "${oldName.replace(/_/g, " ")}":`, oldName.replace(/_/g, " "));
        if (!newName || newName === oldName) return;

        setIsLoading(true);
        setStatusMessage(`Mengganti nama menjadi '${newName}'...`);
        try {
            await RenameBook(oldName, newName);
            showLoadingStatus(`Buku berhasil diganti nama menjadi '${newName}'.`);
            await fetchBooks();
        } catch (error) {
            showLoadingStatus(`Error: ${error}`);
            console.error("Failed to rename book:", error);
        }
    };

    const handleDeleteBook = async (e, bookName) => {
        e.stopPropagation();
        if (window.confirm(`Yakin ingin menghapus buku "${bookName.replace(/_/g, " ")}"? Aksi ini tidak bisa dibatalkan.`)) {
            setIsLoading(true);
            setStatusMessage(`Menghapus buku '${bookName}'...`);
            try {
                await DeleteBook(bookName);
                showLoadingStatus(`Buku '${bookName}' berhasil dihapus.`);
                await fetchBooks();
            } catch (error) {
                showLoadingStatus(`Error: Gagal menghapus buku ${bookName}.`);
                console.error("Failed to delete book:", error);
            }
        }
    };
    
    const handleSetCover = async (e) => {
        e.stopPropagation();
        if (!currentBook || !modalImageFile) return;

        setIsLoading(true);
        setStatusMessage(`Menjadikan gambar sebagai cover...`);
        try {
            await SetBookCover(currentBook, modalImageFile);
            showLoadingStatus(`Cover untuk buku '${currentBook.replace(/_/g, " ")}' telah diubah.`);
            // No need to call fetchBooks, just refresh images
            forceImageRefresh();
        } catch(error) {
            showLoadingStatus(`Error: ${error}`);
            console.error("Failed to set cover:", error);
        }
    };

    const handleDeleteImage = async (e) => {
        e.stopPropagation();
        if (window.confirm(`Yakin ingin menghapus gambar ini?`)) {
            setIsLoading(true);
            setStatusMessage(`Menghapus gambar...`);
            try {
                await DeleteImage(currentBook, modalImageFile);
                
                const newImageFilenames = imageFilenames.filter(name => name !== modalImageFile);
                setImageFilenames(newImageFilenames);
                
                if (newImageFilenames.length === 0) {
                    closeModal();
                } else {
                    const deletedIndex = selectedIndex;
                    const nextIndex = deletedIndex % newImageFilenames.length;
                    setSelectedIndex(nextIndex);
                    setModalImageFile(newImageFilenames[nextIndex]);
                }
                showLoadingStatus(`Gambar berhasil dihapus.`, 2000);

            } catch (error) {
                showLoadingStatus(`Error: Gagal menghapus gambar.`);
                console.error("Failed to delete image:", error);
            }
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');
        if (passwordInput.length < 4) {
            setAuthError("Password minimal 4 karakter.");
            return;
        }
        try {
            const success = hasPasswordSetup ? await VerifyPassword(passwordInput) : await SetMasterPassword(passwordInput);
            if (success) {
                setIsAuthenticated(true);
                setHasPasswordSetup(true);
                setPasswordInput('');
            } else {
                setAuthError("Password salah.");
            }
        } catch (error) {
            console.error("Authentication error:", error);
            setAuthError("Terjadi kesalahan saat otentikasi.");
        }
    };
    
    const handleLock = () => { setIsAuthenticated(false); setPasswordInput(''); setAuthError(''); };
    const openBook = (bookName) => { setCurrentBook(bookName); setView('gallery'); };
    const openModal = (index) => { setSelectedIndex(index); setModalImageFile(imageFilenames[index]); };
    const closeModal = () => { setModalImageFile(null); setSelectedIndex(null); };
    
    // --- Render Functions ---
    const renderAuthScreen = () => (
        <div className="login-container"><div className="login-box">
            <h1>{hasPasswordSetup ? "Enter Password" : "Set Master Password"}</h1>
            <p>{hasPasswordSetup ? "Masukkan password untuk membuka." : "Buat password utama untuk mengamankan galeri."}</p>
            <form onSubmit={handlePasswordSubmit}>
                <input type="password" className="auth-input" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="••••••••" autoFocus />
                <button type="submit" className="auth-button">{hasPasswordSetup ? "Unlock" : "Save & Open"}</button>
            </form>
            {authError && <p className="auth-error">{authError}</p>}
        </div></div>
    );
    
    const renderHeader = () => (
         <header className="app-header">
            <div className="header-content"><h1>Gallery Bookshelf</h1><p>Pilih sebuah buku untuk dilihat atau tambahkan yang baru.</p></div>
            <button onClick={handleLock} className="lock-btn" title="Lock Application"><LockIcon /></button>
        </header>
    );

    const renderLibrary = () => (
        <div className="view-container">
            {renderHeader()}
            <div className="book-grid">
                {books.map(book => (
                    <div key={book.name} className="book-card">
                        <div className="book-card-content" onClick={() => openBook(book.name)}>
                            <div className="book-cover">
                                {book.cover ? <img src={`${book.cover}&t=${imageCacheBuster}`} alt={`Cover for ${book.name}`} /> : <div className="book-cover-placeholder">📚</div>}
                            </div>
                            <div className="book-title">{book.name.replace(/_/g, " ")}</div>
                        </div>
                        <div className="book-card-actions">
                           <button onClick={(e) => handleUpdateBook(e, book.name)} title="Update/Sync"><SyncIcon /></button>
                           <button onClick={(e) => handleRenameBook(e, book.name)} title="Ganti Nama"><EditIcon /></button>
                           <button onClick={(e) => handleDeleteBook(e, book.name)} title="Hapus Buku"><TrashIcon /></button>
                        </div>
                    </div>
                ))}
            </div>
            <button className="fab" onClick={handleAddBookClick} disabled={isLoading}>+</button>
        </div>
    );

    const renderGallery = () => (
        <div className="view-container">
            <header className="gallery-header">
                <button onClick={() => { setView('library'); setCurrentBook(null); fetchBooks(); }} className="back-btn">← Kembali</button>
                <h1>{currentBook.replace(/_/g, " ")}</h1>
                <button onClick={handleLock} className="lock-btn" title="Lock Application"><LockIcon /></button>
            </header>
            <div className="masonry-grid">
                {imageFilenames.map((fileName, index) => (
                    <div key={fileName} className="masonry-item" onClick={() => openModal(index)}>
                        <img 
                            src={`/img/${encodeURIComponent(currentBook)}/${encodeURIComponent(fileName)}?t=${imageCacheBuster}`}
                            alt={`Image ${index + 1}`}
                            loading="lazy" 
                        />
                    </div>
                ))}
            </div>
        </div>
    );

    const renderModal = () => {
        if (!modalImageFile) return null;
        const imageUrl = `/img/${encodeURIComponent(currentBook)}/${encodeURIComponent(modalImageFile)}?t=${imageCacheBuster}`;
        return (
            <div className="modal-overlay" onClick={closeModal}>
                <div className="modal-toolbar">
                    <button onClick={handleSetCover} title="Jadikan Cover"><CoverIcon /> Jadikan Cover</button>
                    <button onClick={handleDeleteImage} title="Hapus Gambar Ini"><TrashIcon /> Hapus</button>
                </div>
                <button className="modal-nav prev" onClick={(e) => { e.stopPropagation(); showPrevImage(); }}>‹</button>
                <img src={imageUrl} alt="Fullscreen View" className="modal-content" onClick={(e) => e.stopPropagation()} />
                <button className="modal-nav next" onClick={(e) => { e.stopPropagation(); showNextImage(); }}>›</button>
            </div>
        );
    };

    // --- Main Render Logic ---
    if (hasPasswordSetup === null) {
        return <div className="loading-overlay"><div></div><p>Checking security...</p></div>;
    }

    return (
        <div id="App">
            {isLoading && <div className="loading-overlay"><div></div><p>{statusMessage || 'Loading...'}</p></div>}
            
            {!isAuthenticated ? (
                renderAuthScreen()
            ) : (
                <>
                    {view === 'library' ? renderLibrary() : renderGallery()}
                    {renderModal()}
                </>
            )}
        </div>
    );
}

export default App;