import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    CreateBook, GetBooks, GetChapters, GetImagesInChapter, SelectFolder, HasPassword,
    SetMasterPassword, VerifyPassword, DeleteBook, RenameBook, SetBookCover, SetBookTags,
    LockBook, UnlockBook, VerifyBookPassword
} from '../wailsjs/go/main/App';
import './App.css';
import Reader from './components/Reader';

// --- Icons ---
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const LockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
const SyncIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21h5v-5"></path></svg>;
const BackIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const TagIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>;
const FolderIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>;

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [hasPasswordSetup, setHasPasswordSetup] = useState(null);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    // Views: 'library' | 'chapters' | 'gallery'
    const [view, setView] = useState('library');
    const [books, setBooks] = useState([]);
    
    // Navigation State
    const [currentBook, setCurrentBook] = useState(null);
    const [chapters, setChapters] = useState([]); // List of chapter names
    const [currentChapter, setCurrentChapter] = useState(''); // Selected chapter
    const [imageFilenames, setImageFilenames] = useState([]);
    
    const [searchQuery, setSearchQuery] = useState(''); 
    const [selectedTag, setSelectedTag] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());

    const [editingBook, setEditingBook] = useState(null);
    const [editNameInput, setEditNameInput] = useState('');
    const [editTagsInput, setEditTagsInput] = useState('');
    const [editLockPass, setEditLockPass] = useState('');

    useEffect(() => {
        const check = async () => setHasPasswordSetup(await HasPassword());
        check();
    }, []);

    const fetchBooks = useCallback(async () => {
        if (!isAuthenticated) return;
        setIsLoading(true);
        try {
            const res = await GetBooks();
            setBooks(res || []);
            setImageCacheBuster(Date.now());
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, [isAuthenticated]);

    useEffect(() => { fetchBooks(); }, [fetchBooks]);

    const uniqueTags = useMemo(() => {
        const tags = new Set();
        books.forEach(b => { if(b.tags) b.tags.forEach(t => tags.add(t)); });
        return Array.from(tags).sort();
    }, [books]);

    const filteredBooks = useMemo(() => {
        return books.filter(b => {
            const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesTag = selectedTag ? (b.tags && b.tags.includes(selectedTag)) : true;
            return matchesSearch && matchesTag;
        });
    }, [books, searchQuery, selectedTag]);

    const handleLogin = async (e) => {
        e.preventDefault();
        const ok = hasPasswordSetup ? await VerifyPassword(passwordInput) : await SetMasterPassword(passwordInput);
        if (ok) { setIsAuthenticated(true); setHasPasswordSetup(true); setPasswordInput(''); } 
        else setAuthError("Password Salah");
    };

    // --- NAVIGATION LOGIC ---

    // 1. Buka Buku -> Cek Chapter atau Langsung Gambar
    const handleOpenBook = async (book) => {
        if (book.is_locked) {
            const pass = prompt("Buku ini terkunci. Masukkan password:");
            if (!pass) return;
            const valid = await VerifyBookPassword(book.name, pass);
            if (!valid) { alert("Password Salah!"); return; }
        }

        setIsLoading(true);
        setCurrentBook(book.name);
        
        try {
            // Cek apakah buku punya chapters (sub-folder)
            const chapterList = await GetChapters(book.name);
            
            if (chapterList && chapterList.length > 0) {
                // Mode Chapter: Tampilkan daftar folder
                setChapters(chapterList);
                setView('chapters');
            } else {
                // Mode Flat: Langsung load gambar dari root
                setChapters([]);
                await handleOpenChapter(book.name, ""); 
            }
        } catch (e) {
            alert("Gagal membuka buku: " + e);
        }
        setIsLoading(false);
    };

    // 2. Buka Chapter -> Load Gambar
    const handleOpenChapter = async (bookName, chapterName) => {
        setIsLoading(true);
        setCurrentChapter(chapterName);
        try {
            // Backend sekarang support GetImagesInChapter(book, chapter)
            // Jika chapterName kosong, dia ambil dari root book
            const imgs = await GetImagesInChapter(bookName, chapterName);
            setImageFilenames(imgs || []);
            setView('gallery');
        } catch (e) {
            alert("Gagal memuat chapter: " + e);
        }
        setIsLoading(false);
    };

    // 3. Tombol Back (Bertingkat)
    const handleBack = () => {
        if (view === 'gallery') {
            // Jika kita sedang baca chapter dan buku punya daftar chapter, kembali ke daftar chapter
            if (chapters.length > 0) {
                setView('chapters');
                setImageFilenames([]); // Clear images memory
            } else {
                // Jika buku flat, kembali ke library
                setView('library');
                setCurrentBook(null);
                fetchBooks();
            }
        } else if (view === 'chapters') {
            // Dari daftar chapter kembali ke library
            setView('library');
            setCurrentBook(null);
            fetchBooks();
        } else {
            // Di library, reset filter
            setSearchQuery('');
            setSelectedTag(null);
        }
    };

    const handleAddBook = async () => {
        const name = prompt("Nama Buku Baru:"); if(!name) return;
        const path = await SelectFolder(); if(!path) return;
        setIsLoading(true); setStatusMessage("Importing...");
        await CreateBook(name, path, false);
        await fetchBooks();
        setIsLoading(false);
    };

    const handleUpdate = async (e, name) => {
        e.stopPropagation();
        const path = await SelectFolder(); if(!path) return;
        setIsLoading(true); setStatusMessage("Syncing...");
        await CreateBook(name, path, true);
        await fetchBooks();
        setIsLoading(false);
    };

    const handleDelete = async (e, name) => {
        e.stopPropagation();
        if(confirm(`Hapus ${name}?`)) {
            setIsLoading(true); await DeleteBook(name); await fetchBooks(); setIsLoading(false);
        }
    };

    const openEditModal = (e, book) => {
        e.stopPropagation();
        setEditingBook(book);
        setEditNameInput(book.name);
        setEditTagsInput(book.tags ? book.tags.join(', ') : '');
        setEditLockPass('');
    };

    const saveMetadata = async (e) => {
        e.preventDefault();
        if(!editingBook) return;
        setIsLoading(true);
        try {
            let currentName = editingBook.name;
            if(editNameInput !== editingBook.name) {
                await RenameBook(editingBook.name, editNameInput);
                currentName = editNameInput;
            }
            const tagsArray = editTagsInput.split(',').map(t => t.trim()).filter(t => t !== "");
            await SetBookTags(currentName, tagsArray);
            
            if (editLockPass) { await LockBook(currentName, editLockPass); }
            
            setEditingBook(null); await fetchBooks();
        } catch(err) { alert("Error: " + err); }
        setIsLoading(false);
    };

    const handleUnlockAction = async () => {
        if(confirm("Hapus proteksi password dari buku ini?")) {
            await UnlockBook(editingBook.name);
            setEditingBook(null); await fetchBooks();
        }
    }

    const handleReaderSetCover = async (filename) => {
        if(!currentBook || !filename) return;
        // Jika ada di dalam chapter, filename harus full relative path agar backend ketemu
        // Tapi backend SetBookCover mengharapkan nama file relatif terhadap root buku.
        // Karena GetImagesInChapter mengembalikan nama file saja, kita perlu gabungkan jika dalam chapter.
        let targetFile = filename;
        if (currentChapter) {
            // Gunakan separator '/' untuk konsistensi, backend akan handle (semoga)
            // Atau lebih aman: Backend logic SetBookCover harus support path chapter
            // Untuk sekarang asumsi gambar cover dicari recursive atau di root.
            // WORKAROUND: Copy file tersebut ke root cover.db
            // Backend CreateBook sudah handle flatten names -> NO, smart chapter keeps folders.
            
            // SOLUSI SEMENTARA: Fitur set cover saat ini mungkin hanya work untuk gambar di root 
            // atau perlu update backend SetBookCover untuk support nested path.
            // Untuk v0.2, kita kirim path relatif manual:
            targetFile = currentChapter + "/" + filename;
        }

        try { await SetBookCover(currentBook, targetFile); alert("Cover Updated!"); } 
        catch (e) { alert("Error setting cover (Pastikan gambar support): " + e); }
    };

    // --- RENDERERS ---
    const renderSidebar = () => (
        <div className="sidebar">
            <div className="app-logo">📚 GalleryVault</div>
            {view === 'library' && (
                <div className="search-container">
                    <input type="text" className="search-input" placeholder="🔍 Cari buku..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
            )}
            <div className="nav-menu">
                <button className={`nav-item ${view === 'library' && selectedTag === null ? 'active' : ''}`} onClick={() => {handleBack(); setSelectedTag(null);}}>
                    <HomeIcon /> Library
                </button>
                {/* Tampilkan breadcrumb simple saat baca buku */}
                {view !== 'library' && (
                    <div style={{padding:'10px 15px', fontSize:'0.9em', color:'#89b4fa', fontWeight:'bold'}}>
                        📖 {currentBook && currentBook.replace(/_/g, ' ')}
                    </div>
                )}

                {uniqueTags.length > 0 && view === 'library' && (
                    <div style={{marginTop: 20}}>
                        <div style={{padding:'0 15px', fontSize:'0.8em', color:'#666', fontWeight:'bold', marginBottom:10}}>TAGS</div>
                        {uniqueTags.map(tag => (
                            <button key={tag} className={`nav-item ${selectedTag === tag ? 'active' : ''}`} onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}>
                                <TagIcon /> <span style={{textTransform:'capitalize'}}>{tag}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <button className="nav-item" onClick={() => setIsAuthenticated(false)}><LockIcon /> Lock App</button>
        </div>
    );

    const renderEditModal = () => {
        if(!editingBook) return null;
        return (
            <div className="modal-overlay">
                <div className="login-box" onClick={e => e.stopPropagation()} style={{textAlign:'left'}}>
                    <h2 style={{marginTop:0, color:'#89b4fa'}}>Edit Metadata</h2>
                    <label style={{display:'block', marginBottom:5, fontSize:'0.9em'}}>Judul Buku</label>
                    <input className="auth-input" style={{margin:'0 0 15px 0'}} value={editNameInput} onChange={e => setEditNameInput(e.target.value)} />
                    <label style={{display:'block', marginBottom:5, fontSize:'0.9em'}}>Tags (Pisahkan koma)</label>
                    <input className="auth-input" style={{margin:'0 0 15px 0'}} value={editTagsInput} onChange={e => setEditTagsInput(e.target.value)} placeholder="action, isekai"/>
                    <div style={{borderTop:'1px solid #444', paddingTop:15, marginTop:10}}>
                        <label style={{display:'block', marginBottom:5, fontSize:'0.9em', color:'#f38ba8'}}>
                            {editingBook.is_locked ? "Ganti Password Buku" : "Set Password Buku (Opsional)"}
                        </label>
                        <input className="auth-input" type="password" style={{margin:'0 0 10px 0'}} value={editLockPass} onChange={e => setEditLockPass(e.target.value)} placeholder="Biarkan kosong jika tidak ingin mengubah"/>
                        {editingBook.is_locked && (
                            <button onClick={handleUnlockAction} style={{background:'none', border:'1px solid #f38ba8', color:'#f38ba8', padding:'5px 10px', borderRadius:5, cursor:'pointer', marginBottom:15, fontSize:'0.8rem'}}>🔓 Hapus Password</button>
                        )}
                    </div>
                    <div style={{display:'flex', gap:10, marginTop:10}}>
                        <button className="auth-button" onClick={saveMetadata}>Simpan</button>
                        <button className="auth-button" style={{background:'#45475a'}} onClick={() => setEditingBook(null)}>Batal</button>
                    </div>
                </div>
            </div>
        );
    };

    const renderLibraryView = () => (
        <div className="content-scroll-area">
            <div className="book-grid">
                {filteredBooks.map(b => (
                    <div key={b.name} className="book-card">
                        <div className="book-cover" onClick={() => handleOpenBook(b)}>
                            {b.cover ? <img src={b.cover} alt="cover"/> : <div className="book-cover-placeholder">📚</div>}
                            <div className="book-info-overlay"><div className="book-title">{b.name.replace(/_/g, ' ')}</div></div>
                            {b.is_locked && ( <div style={{position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.8)', color:'#f38ba8', padding:'5px', borderRadius:'50%'}}><LockIcon style={{width:16, height:16}} /></div> )}
                            {b.tags && b.tags.length > 0 && (
                                <div style={{position:'absolute', top:10, left:10, display:'flex', flexWrap:'wrap', gap:4}}>
                                    {b.tags.slice(0, 3).map(t => ( <span key={t} style={{background:'rgba(0,0,0,0.7)', color:'#89b4fa', fontSize:'0.7em', padding:'2px 6px', borderRadius:4, textTransform:'capitalize'}}>{t}</span> ))}
                                </div>
                            )}
                        </div>
                        <div className="book-actions">
                            <button className="action-btn" onClick={(e)=>handleUpdate(e, b.name)}><SyncIcon/></button>
                            <button className="action-btn" onClick={(e)=>openEditModal(e, b)}><EditIcon/></button>
                            <button className="action-btn danger" onClick={(e)=>handleDelete(e, b.name)}><TrashIcon/></button>
                        </div>
                    </div>
                ))}
            </div>
            <button className="fab" onClick={handleAddBook}>+</button>
        </div>
    );

    // --- NEW: CHAPTER LIST VIEW ---
    const renderChapterList = () => (
        <div className="content-scroll-area">
            <h3 style={{marginTop:0, marginBottom:20, color:'#a6adc8'}}>Chapters / Folders</h3>
            <div className="book-grid">
                {chapters.map(chapter => (
                    <div key={chapter} className="book-card" style={{aspectRatio:'3/1', minHeight: '80px', flexDirection:'row', alignItems:'center', padding:'0 20px'}} onClick={() => handleOpenChapter(currentBook, chapter)}>
                        <div style={{color:'#89b4fa', marginRight: 15}}><FolderIcon /></div>
                        <div className="book-title" style={{fontSize:'1.1rem', whiteSpace:'normal'}}>{chapter.replace(/_/g, ' ')}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderGalleryView = () => (
        <Reader images={imageFilenames} currentBook={currentBook + (currentChapter ? ` / ${currentChapter}` : "")} imageCacheBuster={imageCacheBuster} onBack={handleBack} onSetCover={handleReaderSetCover}/>
    );

    if (hasPasswordSetup === null) return <div className="loading-overlay">Loading...</div>;
    if (!isAuthenticated) return (
        <div className="login-container">
            <div className="login-box">
                <h1>{hasPasswordSetup ? "Gallery Locked" : "Setup Password"}</h1>
                <form onSubmit={handleLogin}>
                    <input type="password" className="auth-input" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} autoFocus placeholder="Passphrase"/>
                    <button className="auth-button">Unlock</button>
                </form>
                {authError && <p className="auth-error">{authError}</p>}
            </div>
        </div>
    );

    return (
        <div id="App">
            {isLoading && <div className="loading-overlay"><div></div><p>{statusMessage || 'Processing...'}</p></div>}
            {renderSidebar()}
            <div className="main-content">
                <div className="top-bar">
                    <h2>
                        {view === 'library' ? 'My Collection' : 
                         view === 'chapters' ? currentBook?.replace(/_/g, ' ') : 
                         currentChapter ? currentChapter.replace(/_/g, ' ') : currentBook?.replace(/_/g, ' ')}
                    </h2>
                    {view !== 'library' && <button onClick={handleBack} className="back-btn"><BackIcon/> Back</button>}
                </div>
                {view === 'library' && renderLibraryView()}
                {view === 'chapters' && renderChapterList()}
                {view === 'gallery' && renderGalleryView()}
            </div>
            {renderEditModal()}
        </div>
    );
}

export default App;