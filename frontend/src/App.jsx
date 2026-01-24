import { useState, useEffect, useCallback } from 'react';
import { 
    CreateBook, 
    GetBooks, 
    GetImagesInBook, 
    SelectFolder,
    HasPassword,
    SetMasterPassword,
    VerifyPassword
} from '../wailsjs/go/main/App';
import './App.css';

// Simple Lock Icon component
const LockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
);


function App() {
    // Authentication states
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [hasPasswordSetup, setHasPasswordSetup] = useState(null); // null: loading, false: setup needed, true: login needed
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    // Navigation and data states
    const [view, setView] = useState('library');
    const [books, setBooks] = useState([]);
    const [currentBook, setCurrentBook] = useState(null);
    const [imageFilenames, setImageFilenames] = useState([]); // <-- Renamed for clarity
    
    // UI states
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [modalImageFile, setModalImageFile] = useState(null); // <-- Renamed for clarity
    const [selectedIndex, setSelectedIndex] = useState(null);

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
    
    const fetchBooks = useCallback(async () => {
        if (!isAuthenticated) return;
        setIsLoading(true);
        try {
            const bookList = await GetBooks();
            setBooks(bookList || []);
        } catch (error) {
            setStatusMessage("Error: Gagal memuat daftar buku.");
            console.error("Failed to fetch books:", error);
        }
        setIsLoading(false);
    }, [isAuthenticated]);

    useEffect(() => {
        fetchBooks();
    }, [fetchBooks, isAuthenticated]);

    useEffect(() => {
        if (view === 'gallery' && currentBook && isAuthenticated) {
            const fetchImages = async () => {
                setIsLoading(true);
                setImageFilenames([]);
                try {
                    // This now returns an array of strings (filenames)
                    const filenameList = await GetImagesInBook(currentBook);
                    setImageFilenames(filenameList || []);
                } catch (error) {
                    setStatusMessage(`Error: Gagal memuat gambar untuk buku ${currentBook}.`);
                    console.error("Failed to fetch images:", error);
                }
                setIsLoading(false);
            };
            fetchImages();
        }
    }, [view, currentBook, isAuthenticated]);

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

    const handleAddBookClick = async () => {
        const bookName = prompt("Masukkan nama untuk buku baru:");
        if (!bookName) return;

        try {
            const sourcePath = await SelectFolder();
            if (!sourcePath) return;
            setIsLoading(true);
            setStatusMessage(`Mengimpor gambar ke buku '${bookName}'...`);
            const result = await CreateBook(bookName, sourcePath);
            setStatusMessage(result);
            await fetchBooks();
        } catch (error) {
            setStatusMessage("Error: Proses pembuatan buku gagal.");
            console.error("Failed to create book:", error);
        }
        setIsLoading(false);
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');
        if (passwordInput.length < 4) {
            setAuthError("Password minimal 4 karakter.");
            return;
        }

        try {
            let success = false;
            if (hasPasswordSetup) {
                success = await VerifyPassword(passwordInput);
            } else {
                success = await SetMasterPassword(passwordInput);
            }

            if (success) {
                setIsAuthenticated(true);
                setHasPasswordSetup(true); // It's now set up
                setPasswordInput('');
            } else {
                setAuthError("Password salah.");
            }
        } catch (error) {
            console.error("Authentication error:", error);
            setAuthError("Terjadi kesalahan saat otentikasi.");
        }
    };
    
    const handleLock = () => {
        setIsAuthenticated(false);
        setPasswordInput('');
        setAuthError('');
    };

    const openBook = (bookName) => {
        setCurrentBook(bookName);
        setView('gallery');
    };

    const openModal = (index) => {
        setSelectedIndex(index);
        setModalImageFile(imageFilenames[index]);
    };

    const closeModal = () => {
        setModalImageFile(null);
        setSelectedIndex(null);
    };
    
    // --- Render Functions ---

    const renderAuthScreen = () => (
        <div className="login-container">
            <div className="login-box">
                <h1>{hasPasswordSetup ? "Enter Password" : "Set Master Password"}</h1>
                <p>{hasPasswordSetup ? "Masukkan password untuk membuka." : "Buat password utama untuk mengamankan galeri."}</p>
                <form onSubmit={handlePasswordSubmit}>
                    <input
                        type="password"
                        className="auth-input"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        autoFocus
                    />
                    <button type="submit" className="auth-button">
                        {hasPasswordSetup ? "Unlock" : "Save & Open"}
                    </button>
                </form>
                {authError && <p className="auth-error">{authError}</p>}
            </div>
        </div>
    );
    
    const renderHeader = () => (
         <header className="app-header">
            <div className="header-content">
                 <h1>Gallery Bookshelf</h1>
                 <p>Pilih sebuah buku untuk dilihat atau tambahkan yang baru.</p>
            </div>
            <button onClick={handleLock} className="lock-btn" title="Lock Application">
                <LockIcon />
            </button>
        </header>
    );

    const renderLibrary = () => (
        <div className="view-container">
            {renderHeader()}
            <div className="book-grid">
                {books.map(book => (
                    <div key={book.name} className="book-card" onClick={() => openBook(book.name)}>
                        <div className="book-cover">
                            {/* Book cover still uses base64, which is fine for small thumbnails */}
                            {book.cover ? <img src={book.cover} alt={`Cover for ${book.name}`} /> : <div className="book-cover-placeholder">📚</div>}
                        </div>
                        <div className="book-title">{book.name.replace(/_/g, " ")}</div>
                    </div>
                ))}
            </div>
            <button className="fab" onClick={handleAddBookClick} disabled={isLoading}>+</button>
        </div>
    );

    const renderGallery = () => (
        <div className="view-container">
            <header className="gallery-header">
                <button onClick={() => { setView('library'); setCurrentBook(null); }} className="back-btn">← Kembali</button>
                <h1>{currentBook.replace(/_/g, " ")}</h1>
                <button onClick={handleLock} className="lock-btn" title="Lock Application">
                    <LockIcon />
                </button>
            </header>
            <div className="masonry-grid">
                {imageFilenames.map((fileName, index) => (
                    <div key={fileName} className="masonry-item" onClick={() => openModal(index)}>
                        {/* Construct URL to the asset server */}
                        <img 
                            src={"/img/" + encodeURIComponent(currentBook) + "/" + encodeURIComponent(fileName)} 
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
        const imageUrl = `/img/${currentBook}/${modalImageFile}`;
        return (
            <div className="modal-overlay" onClick={closeModal}>
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