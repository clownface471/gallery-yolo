import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    CreateBook, GetBooks, GetChapters, GetImagesInChapter, SelectFolder, HasPassword,
    SetMasterPassword, VerifyPassword, DeleteBook, UpdateBookMetadata, SetBookCover,
    LockBook, UnlockBook, VerifyBookPassword, ToggleHiddenZone, IsHiddenZoneActive, LockHiddenZone,
    HasHiddenZonePassword, SetHiddenZonePassword, BatchImportBooks, ToggleBookFavorite // [NEW] Import ToggleBookFavorite
} from '../wailsjs/go/main/App';
// Hapus OnFileDrop jika tidak dipakai, tapi biarkan BatchImportBooks karena dipakai di handleAddBook
import { OnFileDrop } from '../wailsjs/runtime/runtime'; 
import './App.css';
import Reader from './components/Reader';

// --- ICONS ---
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const LockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>;
const UnlockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
const SyncIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21h5v-5"></path></svg>;
const BackIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const TagIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>;
const FolderIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
const EyeOffIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const CrossIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
// [NEW] Heart Icon
const HeartIcon = ({ filled }) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;

const BookHero = ({ book }) => {
    if (!book) return null;
    return (
        <div className="book-hero">
            <div className="hero-bg" style={{backgroundImage: `url(${book.cover})`}}></div>
            <div className="hero-content">
                <div className="hero-cover">
                    {book.cover ? <img src={book.cover} alt="Cover"/> : <div className="placeholder">No Cover</div>}
                </div>
                <div className="hero-info">
                    <h1>{book.name.replace(/_/g, ' ')}</h1>
                    <div className="hero-tags">
                        {book.tags && book.tags.map(t => <span key={t}>{t}</span>)}
                    </div>
                    <p className="hero-desc">{book.description || "Tidak ada deskripsi."}</p>
                </div>
            </div>
        </div>
    );
};

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [hasPasswordSetup, setHasPasswordSetup] = useState(null);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    const [view, setView] = useState('library');
    const [books, setBooks] = useState([]);
    const [currentBookObj, setCurrentBookObj] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [currentChapter, setCurrentChapter] = useState('');
    const [imageFilenames, setImageFilenames] = useState([]);
    const [searchQuery, setSearchQuery] = useState(''); 
    const [tagFilters, setTagFilters] = useState({}); 
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
    const [hiddenZoneActive, setHiddenZoneActive] = useState(false);

    // [NEW] Sorting State
    const [sortBy, setSortBy] = useState('name'); // 'name' | 'recent'
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    const authRef = useRef(false);

    // Edit Modal State
    const [editingBook, setEditingBook] = useState(null);
    const [editNameInput, setEditNameInput] = useState('');
    const [editDescInput, setEditDescInput] = useState('');
    const [editTagsInput, setEditTagsInput] = useState('');
    const [editLockPass, setEditLockPass] = useState('');
    const [editIsHidden, setEditIsHidden] = useState(false);
    const [editMaskCover, setEditMaskCover] = useState(false);
    
    const [showSettings, setShowSettings] = useState(false);
    const [settingsPassInput, setSettingsPassInput] = useState('');

    useEffect(() => { authRef.current = isAuthenticated; }, [isAuthenticated]);
    useEffect(() => { const check = async () => setHasPasswordSetup(await HasPassword()); check(); }, []);

    // --- HANDLERS ---
    const handleAddBook = async () => {
        const path = await SelectFolder();
        if (!path) return;
        const folderName = path.split(/[\\/]/).pop();
        const choice = prompt(`Folder: "${folderName}"\n\n1. Import Single Book\n2. Batch Import (Multiple Books)`, "1");

        if (choice === '1') {
            const name = prompt("Nama Buku:", folderName);
            if (!name) return;
            setIsLoading(true);
            await CreateBook(name, path, false);
        } else if (choice === '2') {
            if (!confirm(`Import semua folder di "${folderName}"?`)) return;
            setIsLoading(true);
            const logs = await BatchImportBooks(path);
            alert(logs.join('\n'));
        } else { return; }
        
        await fetchBooks();
        setIsLoading(false);
    };

    const fetchBooks = useCallback(async () => {
        if (!isAuthenticated) return;
        setIsLoading(true);
        try {
            const res = await GetBooks();
            setBooks(res || []);
            const isHiddenActive = await IsHiddenZoneActive();
            setHiddenZoneActive(isHiddenActive);
            setImageCacheBuster(Date.now());
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, [isAuthenticated]);

    useEffect(() => { fetchBooks(); }, [fetchBooks]);

    // [NEW] Toggle Favorite
    const handleToggleFavorite = async (e, bookName) => {
        e.stopPropagation();
        try {
            await ToggleBookFavorite(bookName);
            // Optimistic update
            setBooks(prev => prev.map(b => b.name === bookName ? {...b, is_favorite: !b.is_favorite} : b));
        } catch (err) { alert(err); }
    };

    const uniqueTags = useMemo(() => {
        const tags = new Set();
        books.forEach(b => { if(b.tags) b.tags.forEach(t => tags.add(t)); });
        return Array.from(tags).sort();
    }, [books]);

    // [UPDATED] Filter + Sort Logic
    const filteredBooks = useMemo(() => {
        let result = books.filter(b => {
            if (showFavoritesOnly && !b.is_favorite) return false; // Filter Favorit
            if (searchQuery && !b.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            const includedTags = Object.keys(tagFilters).filter(t => tagFilters[t] === 'include');
            const excludedTags = Object.keys(tagFilters).filter(t => tagFilters[t] === 'exclude');
            if (b.tags && b.tags.some(t => excludedTags.includes(t))) return false;
            if (includedTags.length > 0) {
                if (!b.tags) return false;
                const hasAllIncludes = includedTags.every(inc => b.tags.includes(inc));
                if (!hasAllIncludes) return false;
            }
            return true;
        });

        // Sorting
        return result.sort((a, b) => {
            if (sortBy === 'recent') {
                return (b.last_read_time || 0) - (a.last_read_time || 0); // Descending (Baru -> Lama)
            }
            return a.name.localeCompare(b.name); // Default A-Z
        });
    }, [books, searchQuery, tagFilters, sortBy, showFavoritesOnly]);

    const toggleTag = (tag) => {
        setTagFilters(prev => {
            const current = prev[tag];
            const nextState = { ...prev };
            if (!current) nextState[tag] = 'include';
            else if (current === 'include') nextState[tag] = 'exclude';
            else delete nextState[tag];
            return nextState;
        });
    };

    const handleLogin = async (e) => { e.preventDefault(); if (hasPasswordSetup ? await VerifyPassword(passwordInput) : await SetMasterPassword(passwordInput)) { setIsAuthenticated(true); setHasPasswordSetup(true); setPasswordInput(''); } else setAuthError("Password Salah"); };
    const handleToggleHiddenZone = async () => { const pass = prompt("Password Zona Rahasia:"); if(!pass) return; if(await ToggleHiddenZone(pass)) fetchBooks(); else alert("Salah!"); };
    const handleLockHiddenZone = async () => { await LockHiddenZone(); await fetchBooks(); };
    
    const handleOpenBook = async (book) => {
        if (book.is_locked) {
            const pass = prompt("Buku terkunci. Password:");
            if (!pass) return;
            if (!await VerifyBookPassword(book.name, pass)) { alert("Salah!"); return; }
            await fetchBooks();
        }
        setIsLoading(true); setCurrentBookObj(book);
        try {
            const chapterList = await GetChapters(book.name);
            if (chapterList && chapterList.length > 0) { setChapters(chapterList); setView('chapters'); } 
            else { setChapters([]); await handleOpenChapter(book.name, ""); }
        } catch (e) { alert("Gagal: " + e); }
        setIsLoading(false);
    };

    const handleOpenChapter = async (bookName, chapterName) => {
        setIsLoading(true); setCurrentChapter(chapterName);
        try { const imgs = await GetImagesInChapter(bookName, chapterName); setImageFilenames(imgs || []); setView('gallery'); } 
        catch (e) { alert(e); } setIsLoading(false);
    };

    const handleBack = () => {
        if (view === 'gallery') {
            fetchBooks(); // Refresh progress
            if (chapters.length > 0) { setView('chapters'); setImageFilenames([]); } 
            else { setView('library'); setCurrentBookObj(null); }
        } else if (view === 'chapters') { setView('library'); setCurrentBookObj(null); fetchBooks(); } 
        else { setSearchQuery(''); setTagFilters({}); }
    };

    const handleUpdate = async (e, name) => { e.stopPropagation(); const path = await SelectFolder(); if(!path) return; setIsLoading(true); await CreateBook(name, path, true); await fetchBooks(); setIsLoading(false); };
    const handleDelete = async (e, name) => { e.stopPropagation(); if(confirm(`Hapus ${name}?`)) { setIsLoading(true); await DeleteBook(name); await fetchBooks(); setIsLoading(false); } };
    const openEditModal = (e, book) => { e.stopPropagation(); setEditingBook(book); setEditNameInput(book.name); setEditDescInput(book.description || ''); setEditTagsInput(book.tags ? book.tags.join(', ') : ''); setEditLockPass(''); setEditIsHidden(book.is_hidden); setEditMaskCover(book.mask_cover); };
    const saveMetadata = async (e) => { e.preventDefault(); if(!editingBook) return; setIsLoading(true); try { const tags = editTagsInput.split(',').map(t => t.trim()).filter(t=>t); await UpdateBookMetadata(editingBook.name, editNameInput, editDescInput, tags, editIsHidden, editMaskCover); if(editLockPass) await LockBook(editNameInput, editLockPass); setEditingBook(null); await fetchBooks(); } catch(err) { alert(err); } setIsLoading(false); };
    const handleUnlockAction = async () => { if(confirm("Hapus proteksi?")) { await UnlockBook(editingBook.name); setEditingBook(null); await fetchBooks(); } };
    const handleReaderSetCover = async (filename) => { if(!currentBookObj) return; let f = filename; if (currentChapter) f = currentChapter + "/" + filename; try { await SetBookCover(currentBookObj.name, f); alert("Cover Updated!"); } catch (e) { alert(e); } };
    const handleChangeMasterPass = async () => { if (!settingsPassInput) return; await SetMasterPassword(settingsPassInput); alert("Master OK"); setSettingsPassInput(''); };
    const handleChangeHiddenPass = async () => { if (!settingsPassInput) return; await SetHiddenZonePassword(settingsPassInput); alert("Hidden OK"); setSettingsPassInput(''); };

    // --- RENDERERS ---
    const renderSidebar = () => (
        <div className="sidebar">
            <div className="app-logo">📚 GalleryVault</div>
            <div className="nav-menu-top">
                {view === 'library' && (
                    <div className="search-container">
                        <input name="search" type="text" className="search-input" placeholder="🔍 Cari..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                )}
                <button className={`nav-item ${view === 'library' && !Object.keys(tagFilters).length && !showFavoritesOnly ? 'active' : ''}`} onClick={() => {handleBack(); setTagFilters({}); setShowFavoritesOnly(false);}}>
                    <HomeIcon /> Library
                </button>
                
                {/* [NEW] Filter Favorit */}
                <button className={`nav-item ${showFavoritesOnly ? 'active' : ''}`} onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}>
                    <HeartIcon filled={true}/> Favorites
                </button>

                <button className="nav-item" onClick={() => setShowSettings(true)}><SettingsIcon /> Passwords</button>
            </div>

            {uniqueTags.length > 0 && view === 'library' && (
                <div className="tags-section">
                    <div className="tags-header">FILTERS</div>
                    <div className="tags-scroll">
                        {uniqueTags.map(tag => (
                            <button key={tag} className={`nav-item tag-item ${tagFilters[tag] || ''}`} onClick={() => toggleTag(tag)}>
                                <div style={{display:'flex', alignItems:'center', gap:5}}><TagIcon /> <span>{tag}</span></div>
                                {tagFilters[tag] === 'include' && <CheckIcon />}{tagFilters[tag] === 'exclude' && <CrossIcon />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="nav-menu-bottom">
                <button className={`nav-item ${hiddenZoneActive ? 'active' : ''}`} onClick={hiddenZoneActive ? handleLockHiddenZone : handleToggleHiddenZone} style={{color: hiddenZoneActive ? '#f38ba8' : '#6c7086'}}>{hiddenZoneActive ? <><UnlockIcon /> Exit Hidden</> : <><EyeIcon /> Hidden Zone</>}</button>
                <button className="nav-item" onClick={() => setIsAuthenticated(false)}><LockIcon /> Lock App</button>
            </div>
        </div>
    );

    const renderChapterList = () => (
        <div className="content-scroll-area">
            <BookHero book={currentBookObj} />
            <div className="chapter-list-container">
                <h3 style={{color:'#a6adc8'}}>Chapters ({chapters.length})</h3>
                <div className="chapter-list">
                    {chapters.map(chapter => (
                        <div key={chapter} className="chapter-item" onClick={() => handleOpenChapter(currentBookObj.name, chapter)}><FolderIcon /><div className="chapter-name">{chapter.replace(/_/g, ' ')}</div><div className="chapter-arrow">→</div></div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderLibraryView = () => (
        <div className="content-scroll-area">
            {/* [NEW] Header Sort */}
            <div className="library-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                <div style={{color:'#a6adc8', fontSize:'0.9rem'}}>{filteredBooks.length} Buku ditemukan</div>
                <select 
                    className="auth-input compact" 
                    style={{ width: 'auto', minWidth: '200px', cursor: 'pointer' }} 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="name">🔤 Nama (A-Z)</option>
                    <option value="recent">🕒 Terbaru Dibaca</option>
                </select>
            </div>

            <div className="book-grid">
                {filteredBooks.map(b => (
                    <div key={b.name} className="book-card" style={{opacity: b.is_hidden ? 0.7 : 1, border: b.is_hidden ? '1px dashed #f38ba8' : 'none'}}>
                        <div className="book-cover" onClick={() => handleOpenBook(b)}>
                            {b.cover ? <img src={b.cover} alt="cover"/> : <div className="book-cover-placeholder" style={{flexDirection:'column'}}>{b.mask_cover ? <><EyeOffIcon style={{width:40,height:40}}/><span style={{fontSize:12, marginTop:10}}>Cover Hidden</span></> : "📚"}</div>}
                            <div className="book-info-overlay"><div className="book-title">{b.name.replace(/_/g, ' ')}</div></div>
                            
                            {/* STATUS INDICATORS */}
                            <div style={{position:'absolute', top:5, left:5, display:'flex', gap:5}}>
                                {b.is_locked && <div className="indicator locked"><LockIcon style={{width:14, height:14}} /></div>}
                                {b.is_hidden && <div className="indicator hidden"><EyeOffIcon style={{width:14, height:14}} /></div>}
                            </div>

                            {/* [NEW] FAVORITE BUTTON */}
                            <div 
                                className={`fav-btn ${b.is_favorite ? 'active' : ''}`}
                                onClick={(e) => handleToggleFavorite(e, b.name)}
                                style={{
                                    position:'absolute', top:5, right:5, 
                                    color: b.is_favorite ? '#f38ba8' : 'rgba(255,255,255,0.5)',
                                    cursor:'pointer', zIndex:10
                                }}
                            >
                                <HeartIcon filled={b.is_favorite} />
                            </div>

                            {/* PROGRESS BADGE */}
                            {b.last_page > 0 && (
                                <div className="indicator" style={{
                                    top: 'auto', bottom: 65, right: 10, 
                                    background: 'var(--accent)', color: '#1e1e2e', 
                                    fontSize: '0.7rem', fontWeight: 'bold', 
                                    borderRadius: '4px', padding: '2px 6px'
                                }}>
                                    PAGE {b.last_page + 1}
                                </div>
                            )}

                            {b.tags && b.tags.length > 0 && (
                                <div className="tag-badges">{b.tags.slice(0, 3).map(t => <span key={t}>{t}</span>)}</div>
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

    const renderGalleryView = () => (
        <Reader images={imageFilenames} bookName={currentBookObj?.name} chapterName={currentChapter} imageCacheBuster={imageCacheBuster} initialPage={currentBookObj?.last_page || 0} onBack={handleBack} onSetCover={handleReaderSetCover} />
    );

    const renderEditModal = () => { if(!editingBook) return null; return ( <div className="modal-overlay"> <div className="login-box" onClick={e => e.stopPropagation()} style={{textAlign:'left', width: 500}}> <h2 style={{marginTop:0, color:'#89b4fa'}}>Edit Info</h2> <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:15}}> <div><label className="input-label">Judul</label><input name="editName" className="auth-input compact" value={editNameInput} onChange={e => setEditNameInput(e.target.value)} /></div> <div><label className="input-label">Tags</label><input name="editTags" className="auth-input compact" value={editTagsInput} onChange={e => setEditTagsInput(e.target.value)} /></div> </div> <label className="input-label">Deskripsi</label> <textarea name="editDesc" className="auth-input compact" style={{height:80, resize:'vertical'}} value={editDescInput} onChange={e => setEditDescInput(e.target.value)} /> <div className="security-section"> <label className="input-label" style={{color:'#f38ba8'}}>Keamanan</label> <input name="editPass" className="auth-input compact" type="password" value={editLockPass} onChange={e => setEditLockPass(e.target.value)} placeholder="Set Password Baru"/> <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10}}> <div className="checkbox-row"><input name="hideCheck" type="checkbox" id="hideCheck" checked={editIsHidden} onChange={e => setEditIsHidden(e.target.checked)} /><label htmlFor="hideCheck">Hidden Book</label></div> <div className="checkbox-row"><input name="maskCheck" type="checkbox" id="maskCheck" checked={editMaskCover} onChange={e => setEditMaskCover(e.target.checked)} /><label htmlFor="maskCheck">Mask Cover</label></div> </div> {editingBook.is_locked && <button onClick={handleUnlockAction} className="unlock-btn">🔓 Hapus Password</button>} </div> <div style={{display:'flex', gap:10, marginTop:20}}> <button className="auth-button" onClick={saveMetadata}>Simpan</button> <button className="auth-button secondary" onClick={() => setEditingBook(null)}>Batal</button> </div> </div> </div> ); };
    const renderSettingsModal = () => { if (!showSettings) return null; return ( <div className="modal-overlay"> <div className="login-box" onClick={e => e.stopPropagation()} style={{textAlign:'left'}}> <h2 style={{marginTop:0, color:'#89b4fa'}}>Password Management</h2> <input name="settingsPass" className="auth-input" type="password" value={settingsPassInput} onChange={e => setSettingsPassInput(e.target.value)} placeholder="Password Baru" /> <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:10}}> <button className="auth-button" onClick={handleChangeMasterPass}>Ubah Master Password</button> <button className="auth-button" style={{background:'#f38ba8', color:'#1e1e2e'}} onClick={handleChangeHiddenPass}>Ubah Hidden Zone Password</button> </div> <button className="auth-button secondary" style={{marginTop:20}} onClick={() => {setShowSettings(false); setSettingsPassInput('');}}>Tutup</button> </div> </div> ); };

    if (hasPasswordSetup === null) return <div className="loading-overlay">Loading...</div>;
    if (!isAuthenticated) return ( <div className="login-container"> <div className="login-box"> <h1>{hasPasswordSetup ? "GalleryVault" : "Setup Password"}</h1> <form onSubmit={handleLogin}> <input name="loginPass" type="password" className="auth-input" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} autoFocus placeholder="Passphrase"/> <button className="auth-button">Unlock</button> </form> {authError && <p className="auth-error">{authError}</p>} </div> </div> );

    return (
        <div id="App">
            {isLoading && <div className="loading-overlay"><div></div><p>{statusMessage || 'Processing...'}</p></div>}
            {renderSidebar()}
            <div className="main-content">
                <div className="top-bar">
                    <h2>{view === 'library' ? 'My Collection' : view === 'chapters' ? currentBookObj?.name.replace(/_/g, ' ') : currentChapter ? currentChapter.replace(/_/g, ' ') : currentBookObj?.name.replace(/_/g, ' ')}</h2>
                    {view !== 'library' && <button onClick={handleBack} className="back-btn"><BackIcon/> Back</button>}
                </div>
                {view === 'library' && renderLibraryView()}
                {view === 'chapters' && renderChapterList()}
                {view === 'gallery' && renderGalleryView()}
            </div>
            {renderEditModal()}
            {renderSettingsModal()}
        </div>
    );
}

export default App;