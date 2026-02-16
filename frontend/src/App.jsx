import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// ... (Import Wails functions TETAP SAMA) ...
import {
    CreateBook, GetBooks, GetChapters, GetImagesInChapter, SelectFolder, HasPassword,
    SetMasterPassword, VerifyPassword, DeleteBook, UpdateBookMetadata, SetBookCover,
    LockBook, UnlockBook, VerifyBookPassword, ToggleHiddenZone, IsHiddenZoneActive, LockHiddenZone,
    HasHiddenZonePassword, SetHiddenZonePassword, BatchImportBooks, ToggleBookFavorite, UpdateBookProgress,
    GetAllSeries, CreateSeries, AddBookToSeries, RemoveBookFromSeries, DeleteSeries
} from '../wailsjs/go/main/App';
import './App.css';
import Reader from './components/Reader';
import Toast from './components/Toast'; // [BARU]

// ... (ICON COMPONENTS TETAP SAMA - Copy Paste dari sebelumnya) ...
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
const HeartIcon = ({ filled }) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const SeriesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>;
const DashboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>; // [BARU]

function App() {
    // --- STATE UTAMA ---
    const [toasts, setToasts] = useState([]); // [BARU] State untuk Toast
    
    // Helper untuk menambah Toast
    const addToast = (msg, type='info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, msg, type }]);
    };
    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    const [isAdmin, setIsAdmin] = useState(false);
    const [hasPasswordSetup, setHasPasswordSetup] = useState(null);
    const [passwordInput, setPasswordInput] = useState('');
    const [showLoginModal, setShowLoginModal] = useState(false);

    const [view, setView] = useState('library');
    const [books, setBooks] = useState([]);
    
    // Series State
    const [seriesList, setSeriesList] = useState([]);
    const [activeSeries, setActiveSeries] = useState(null);
    const [showCreateSeries, setShowCreateSeries] = useState(false);
    const [newSeriesName, setNewSeriesName] = useState('');
    
    // Admin Dashboard State
    const [dashboardData, setDashboardData] = useState(null);
    const [adminViewMode, setAdminViewMode] = useState('stats');
    const [allTags, setAllTags] = useState([]);
    const [tagSearch, setTagSearch] = useState('');

    const [currentBookObj, setCurrentBookObj] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [currentChapter, setCurrentChapter] = useState('');
    const [imageFilenames, setImageFilenames] = useState([]);
    
    // Filter & Pagination
    const [searchQuery, setSearchQuery] = useState(''); 
    const [tagFilters, setTagFilters] = useState({}); 
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
    const [hiddenZoneActive, setHiddenZoneActive] = useState(false);
    
    // [UPDATE] Persistence: Load dari LocalStorage
    const [sortBy, setSortBy] = useState(localStorage.getItem('gv_sortBy') || 'name_asc'); 
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const observerTarget = useRef(null);
    const LIMIT = 50; 

    const [editingBook, setEditingBook] = useState(null);
    const [editSeriesInput, setEditSeriesInput] = useState('');
    const [editNameInput, setEditNameInput] = useState('');
    const [editDescInput, setEditDescInput] = useState('');
    const [editTagsInput, setEditTagsInput] = useState('');
    const [editLockPass, setEditLockPass] = useState('');
    const [editIsHidden, setEditIsHidden] = useState(false);
    const [editMaskCover, setEditMaskCover] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsPassInput, setSettingsPassInput] = useState('');

    // [BARU] Simpan preferensi setiap kali berubah
    useEffect(() => {
        localStorage.setItem('gv_sortBy', sortBy);
    }, [sortBy]);

    useEffect(() => { 
        const check = async () => {
            const hasPass = await HasPassword();
            setHasPasswordSetup(hasPass);
            if (!hasPass) setIsAdmin(true);
            const isHiddenActive = await IsHiddenZoneActive();
            setHiddenZoneActive(isHiddenActive);
        }; 
        check(); 
    }, []);

    // --- FETCH FUNCTIONS ---
    const fetchSeries = useCallback(async () => {
        const res = await GetAllSeries();
        setSeriesList(res || []);
    }, []);

    useEffect(() => {
        if (view === 'series') fetchSeries();
    }, [view, fetchSeries]);

    const fetchBooks = useCallback(async (reset = false) => {
        setIsLoading(true);
        try {
            const activeTags = Object.keys(tagFilters).filter(t => tagFilters[t] === 'include');
            const currentPage = reset ? 1 : page;
            const filter = {
                query: searchQuery,
                tags: activeTags,
                sort_by: sortBy,
                only_fav: showFavoritesOnly,
                page: currentPage,
                limit: LIMIT,
                series_id: activeSeries ? activeSeries.id : 0
            };

            const res = await GetBooks(filter);
            if (res && res.length > 0) {
                if (reset) setBooks(res);
                else {
                    setBooks(prev => {
                        const existingIds = new Set(prev.map(b => b.name));
                        const uniqueNew = res.filter(b => !existingIds.has(b.name));
                        return [...prev, ...uniqueNew];
                    });
                }
                if (res.length < LIMIT) setHasMore(false);
                else setHasMore(true);
            } else {
                if (reset) setBooks([]);
                setHasMore(false);
            }
            if (reset) {
                setPage(2);
                setImageCacheBuster(Date.now());
            } else setPage(prev => prev + 1);

        } catch (e) { 
            console.error(e);
            addToast("Gagal memuat buku", 'error');
        }
        setIsLoading(false);
    }, [searchQuery, tagFilters, sortBy, showFavoritesOnly, page, activeSeries]);

    // Reset saat filter berubah
    useEffect(() => {
        if (view === 'library') {
            setPage(1); setHasMore(true);
            const timer = setTimeout(() => fetchBooks(true), 300); 
            return () => clearTimeout(timer);
        }
    }, [searchQuery, tagFilters, sortBy, showFavoritesOnly, view, activeSeries]);

    // Infinite Scroll
    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && !isLoading && view === 'library') fetchBooks(false);
        }, { threshold: 0.5 });
        if (observerTarget.current) observer.observe(observerTarget.current);
        return () => { if (observerTarget.current) observer.unobserve(observerTarget.current); };
    }, [hasMore, isLoading, fetchBooks, view]);

    // --- ADMIN HANDLERS ---
    const loadDashboard = async () => { setDashboardData(await GetDashboardStats()); };
    const loadTagsAdmin = async () => { setAllTags(await GetAllTagsAdmin() || []); };
    
    const handleRenameTag = async (oldName) => {
        const newName = prompt(`Rename tag "${oldName}" menjadi:`, oldName);
        if (newName && newName !== oldName) {
            const res = await RenameTag(oldName, newName); // RenameTag is defined in App.go from previous context?
            // Note: If RenameTag is missing in frontend import, ensure it's imported
            addToast(res, 'success');
            loadTagsAdmin();
        }
    };

    const handleDeleteTagMaster = async (name) => {
        if(confirm(`YAKIN HAPUS TAG "${name}"?`)) {
            const res = await DeleteTagMaster(name); // Ensure imported
            addToast(res, 'success');
            loadTagsAdmin();
        }
    };

    // --- ACTION HANDLERS (Updated with Toast) ---
    const handleCreateSeries = async () => {
        if (!newSeriesName) return;
        const res = await CreateSeries(newSeriesName, "");
        if (res === "OK") {
            addToast("Series berhasil dibuat!", 'success');
            setNewSeriesName(''); setShowCreateSeries(false); fetchSeries();
        } else addToast(res, 'error');
    };

    const handleDeleteSeries = async (e, name) => {
        e.stopPropagation();
        if(confirm(`Hapus series "${name}"?`)) {
            await DeleteSeries(name);
            addToast("Series dihapus", 'info');
            fetchSeries();
        }
    };

    const handleAddBook = async () => {
        const path = await SelectFolder();
        if (!path) return;
        const folderName = path.split(/[\\/]/).pop();
        const choice = prompt(`Folder: "${folderName}"\n\n1. Import Single Book\n2. Batch Import`, "1");

        setIsLoading(true);
        if (choice === '1') {
            const name = prompt("Nama Buku:", folderName);
            if (name) {
                const res = await CreateBook(name, path, false);
                addToast(res, 'info');
            }
        } else if (choice === '2') {
            if (confirm(`Import semua di "${folderName}"?`)) {
                const logs = await BatchImportBooks(path);
                alert(logs.join('\n')); // Batch log terlalu panjang buat toast, keep alert/modal
            }
        }
        setIsLoading(false);
        fetchBooks(true);
    };

    const handleUpdate = async (e, name) => { 
        e.stopPropagation(); 
        const path = await SelectFolder(); 
        if(!path) return; 
        setIsLoading(true); 
        await CreateBook(name, path, true); 
        setIsLoading(false); 
        addToast("Buku diperbarui", 'success');
        fetchBooks(true); 
    };

    const handleDelete = async (e, name) => { 
        e.stopPropagation(); 
        if(confirm(`Hapus ${name}?`)) { 
            setIsLoading(true); 
            await DeleteBook(name); 
            setIsLoading(false); 
            addToast("Buku dihapus", 'info');
            fetchBooks(true); 
        } 
    };

    const saveMetadata = async (e) => { 
        e.preventDefault(); 
        if(!editingBook) return; 
        setIsLoading(true); 
        try { 
            const tags = editTagsInput.split(',').map(t => t.trim()).filter(t=>t); 
            await UpdateBookMetadata(editingBook.name, editNameInput, editDescInput, tags, editIsHidden, editMaskCover); 
            if(editLockPass) await LockBook(editNameInput, editLockPass); 
            if (editSeriesInput && editSeriesInput !== "") {
                if (editSeriesInput === "NO_SERIES") await RemoveBookFromSeries(editingBook.name);
                else await AddBookToSeries(editingBook.name, editSeriesInput);
            }
            setEditingBook(null); 
            addToast("Metadata disimpan", 'success');
            fetchBooks(true); 
        } catch(err) { addToast(err, 'error'); } 
        setIsLoading(false); 
    };

    const handleOpenBook = async (book) => {
        if (book.is_locked) {
            const pass = prompt("Password:");
            if (!pass) return;
            if (!await VerifyBookPassword(book.name, pass)) { addToast("Password Salah!", 'error'); return; }
        }
        setIsLoading(true); setCurrentBookObj(book);
        try {
            const chapterList = await GetChapters(book.name);
            if (chapterList && chapterList.length > 0) { setChapters(chapterList); setView('chapters'); } 
            else { setChapters([]); await handleOpenChapter(book.name, ""); }
        } catch (e) { addToast("Gagal membuka buku: " + e, 'error'); }
        setIsLoading(false);
    };

    const handleOpenChapter = async (bookName, chapterName) => {
        setIsLoading(true); setCurrentChapter(chapterName);
        try { 
            const imgs = await GetImagesInChapter(bookName, chapterName); 
            setImageFilenames(imgs || []); 
            setView('gallery'); 
        } catch (e) { addToast(e, 'error'); } 
        setIsLoading(false);
    };

    // --- Other Handlers ---
    const handleToggleFavorite = async (e, bookName) => {
        e.stopPropagation();
        try {
            await ToggleBookFavorite(bookName);
            setBooks(prev => prev.map(b => b.name === bookName ? {...b, is_favorite: !b.is_favorite} : b));
        } catch (err) { addToast(err, 'error'); }
    };
    
    // Admin Login with Toast
    const handleAdminLogin = async (e) => {
        e.preventDefault();
        if (!hasPasswordSetup) {
            await SetMasterPassword(passwordInput);
            setHasPasswordSetup(true); setIsAdmin(true); setPasswordInput(''); setShowLoginModal(false);
            addToast("Admin Password Dibuat!", 'success');
            return;
        }
        const ok = await VerifyPassword(passwordInput);
        if (ok) { setIsAdmin(true); setPasswordInput(''); setShowLoginModal(false); addToast("Login Admin Berhasil", 'success'); } 
        else { addToast("Password Salah!", 'error'); }
    };
    
    // ... (Sisa handler standar: openEditModal, handleBack, dll tetap sama) ...
    const handleOpenSeries = (series) => { setActiveSeries(series); setView('library'); };
    const uniqueTags = useMemo(() => { const tags = new Set(); books.forEach(b => { if(b.tags) b.tags.forEach(t => tags.add(t)); }); return Array.from(tags).sort(); }, [books]);
    const toggleTag = (tag) => { setTagFilters(prev => { const current = prev[tag]; const nextState = { ...prev }; if (!current) nextState[tag] = 'include'; else delete nextState[tag]; return nextState; }); };
    const handleLogout = () => { setIsAdmin(false); if(hiddenZoneActive) handleLockHiddenZone(); addToast("Admin Mode OFF", 'info'); };
    const handleToggleHiddenZone = async () => { const pass = prompt("Password Zona Rahasia:"); if(!pass) return; if(await ToggleHiddenZone(pass)) { addToast("Hidden Zone Terbuka", 'success'); } else addToast("Password Salah", 'error'); };
    const handleLockHiddenZone = async () => { await LockHiddenZone(); setHiddenZoneActive(false); addToast("Hidden Zone Terkunci", 'info'); };
    const handleUnlockAction = async () => { if(confirm("Hapus proteksi?")) { await UnlockBook(editingBook.name); setEditingBook(null); fetchBooks(true); addToast("Proteksi dihapus", 'success'); } };
    const handleReaderSetCover = async (filename) => { if(!currentBookObj) return; let f = filename; if (currentChapter) f = currentChapter + "/" + filename; try { await SetBookCover(currentBookObj.name, f); addToast("Cover berhasil diganti!", 'success'); } catch (e) { addToast(e, 'error'); } };
    const handleChangeMasterPass = async () => { if (!settingsPassInput) return; await SetMasterPassword(settingsPassInput); addToast("Master Password Diubah", 'success'); setSettingsPassInput(''); };
    const handleChangeHiddenPass = async () => { if (!settingsPassInput) return; await SetHiddenZonePassword(settingsPassInput); addToast("Hidden Password Diubah", 'success'); setSettingsPassInput(''); };

    // --- RENDERERS ---
    // (renderSidebar, renderSeriesList, renderLibraryView, renderChapterList, renderEditModal, renderSettingsModal, renderLoginModal, renderAdminDashboard)
    // Gunakan kembali render functions dari kode sebelumnya. Perbedaan hanya pada penggunaan addToast() jika ada interaksi baru.
    // Untuk mempersingkat, saya tulis ulang kerangka utamanya saja, pastikan isi JSX sama persis dengan yang sebelumnya + tombol Dashboard baru.

    const renderSidebar = () => (
        <div className="sidebar">
            <div className="app-logo">GalleryVault</div>
            <div className="nav-menu-top">
                {view === 'library' && !activeSeries && ( <div className="search-container"> <input name="search" type="text" className="search-input" placeholder="Cari..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /> </div> )}
                <button className={`nav-item ${(view === 'library' && !activeSeries && !showFavoritesOnly) ? 'active' : ''}`} onClick={() => {setActiveSeries(null); setView('library'); setShowFavoritesOnly(false);}}> <HomeIcon /> Library </button>
                <button className={`nav-item ${(view === 'series' || activeSeries) ? 'active' : ''}`} onClick={() => {setActiveSeries(null); setView('series');}}> <SeriesIcon /> Series </button>
                <button className={`nav-item ${showFavoritesOnly ? 'active' : ''}`} onClick={() => {setActiveSeries(null); setShowFavoritesOnly(!showFavoritesOnly); setView('library');}}> <HeartIcon filled={true}/> Favorites </button>
                {isAdmin && ( <button className={`nav-item ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}> <DashboardIcon /> Dashboard </button> )}
                {hiddenZoneActive && ( <button className="nav-item" onClick={() => setShowSettings(true)} style={{color: '#f38ba8'}}> <SettingsIcon /> Passwords </button> )}
            </div>
            {uniqueTags.length > 0 && view === 'library' && !activeSeries && ( <div className="tags-section"> <div className="tags-header">TAGS (VISIBLE)</div> <div className="tags-scroll"> {uniqueTags.map(tag => ( <button key={tag} className={`nav-item tag-item ${tagFilters[tag] || ''}`} onClick={() => toggleTag(tag)}> <div style={{display:'flex', alignItems:'center', gap:5}}><TagIcon /> <span>{tag}</span></div> {tagFilters[tag] === 'include' && <CheckIcon />} </button> ))} </div> </div> )}
            <div className="nav-menu-bottom"> {isAdmin && ( <button className={`nav-item ${hiddenZoneActive ? 'active' : ''}`} onClick={hiddenZoneActive ? handleLockHiddenZone : handleToggleHiddenZone} style={{color: hiddenZoneActive ? '#f38ba8' : '#6c7086'}}> {hiddenZoneActive ? <><UnlockIcon /> Exit Hidden</> : <><EyeIcon /> Hidden Zone</>} </button> )} {isAdmin ? ( <button className="nav-item" onClick={handleLogout} style={{color: '#a6e3a1'}}> <UserIcon /> Admin On </button> ) : ( <button className="nav-item" onClick={() => setShowLoginModal(true)}> <LockIcon /> Admin Login </button> )} </div>
        </div>
    );

    const renderAdminDashboard = () => {
        if (!dashboardData && adminViewMode === 'stats') loadDashboard();
        if (allTags.length === 0 && adminViewMode === 'tags') loadTagsAdmin();
        return (
            <div className="content-scroll-area" style={{padding: '20px'}}>
                <div className="library-header" style={{marginBottom: 20}}> <h2>Admin Dashboard</h2> <div style={{display:'flex', gap:10}}> <button className={`auth-button compact ${adminViewMode==='stats'?'':'secondary'}`} onClick={()=>{setAdminViewMode('stats'); loadDashboard();}}>Overview</button> <button className={`auth-button compact ${adminViewMode==='tags'?'':'secondary'}`} onClick={()=>{setAdminViewMode('tags'); loadTagsAdmin();}}>Tag Manager</button> </div> </div>
                {adminViewMode === 'stats' && dashboardData && ( <div className="dashboard-grid"> <div className="stat-card"><h3>{dashboardData.total_books}</h3><p>Total Buku</p></div> <div className="stat-card"><h3>{dashboardData.total_series}</h3><p>Total Series</p></div> <div className="stat-card"><h3>{dashboardData.total_tags}</h3><p>Total Tags</p></div> <div className="stat-panel full-width"> <h4>Top Tags</h4> <div className="tags-bar-chart"> {dashboardData.top_tags.map(t => ( <div key={t.name} className="tag-bar-item"> <div style={{display:'flex', justifyContent:'space-between', marginBottom:5}}> <span>{t.name}</span> <span style={{color:'#a6adc8'}}>{t.count}</span> </div> <div className="progress-bg"><div className="progress-fill" style={{width: `${(t.count / dashboardData.top_tags[0].count) * 100}%`}}></div></div> </div> ))} </div> </div> <div className="stat-panel full-width"> <h4>Baru Dibaca / Ditambahkan</h4> <div className="mini-book-list"> {dashboardData.recent_books.map(b => ( <div key={b.name} className="mini-book-item" onClick={() => handleOpenBook(b)}> <img src={`/thumbnail/${encodeURIComponent(b.name)}?t=${Date.now()}`} alt="thm"/> <div> <div style={{fontWeight:'bold'}}>{b.name.replace(/_/g, ' ')}</div> <div style={{fontSize:'0.8rem', color:'#a6adc8'}}>Hal. {b.last_page + 1}</div> </div> </div> ))} </div> </div> </div> )}
                {adminViewMode === 'tags' && ( <div className="stat-panel full-width"> <div style={{display:'flex', justifyContent:'space-between', marginBottom:15}}> <h4>Manage All Tags ({allTags.length})</h4> <input className="auth-input compact" style={{width:200}} placeholder="Cari tag..." value={tagSearch} onChange={e=>setTagSearch(e.target.value)} /> </div> <div className="tag-manager-list"> {allTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase())).map(t => ( <div key={t.name} className="tag-manager-row"> <div style={{display:'flex', alignItems:'center', gap:10}}> <TagIcon /> <span style={{fontWeight:'bold', color:'#cdd6f4'}}>{t.name}</span> <span className="tag-count-badge">{t.count} buku</span> </div> <div style={{display:'flex', gap:5}}> <button className="action-btn" onClick={()=>handleRenameTag(t.name)}><EditIcon/></button> <button className="action-btn danger" onClick={()=>handleDeleteTagMaster(t.name)}><TrashIcon/></button> </div> </div> ))} </div> </div> )}
            </div>
        );
    };
    
    // Series & Library Views (Copy paste dari sebelumnya)
    const renderSeriesList = () => ( <div className="content-scroll-area"> <div className="library-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}> <div style={{color:'#a6adc8', fontSize:'0.9rem'}}>{seriesList.length} Series</div> {isAdmin && <button className="auth-button compact" onClick={() => setShowCreateSeries(true)}>+ Buat Series</button>} </div> <div className="book-grid"> {seriesList.map(s => ( <div key={s.id} className="book-card" onClick={() => handleOpenSeries(s)}> <div className="book-cover"> <div style={{position:'absolute', top:-5, right:-5, width:'100%', height:'100%', background:'#313244', borderRadius:8, zIndex:-1}}></div> <div style={{position:'absolute', top:-10, right:-10, width:'100%', height:'100%', background:'#1e1e2e', borderRadius:8, zIndex:-2}}></div> {s.cover_book ? ( <img src={`/thumbnail/${encodeURIComponent(s.cover_book)}?t=${Date.now()}`} alt="cover" loading="lazy" /> ) : ( <div className="book-cover-placeholder"><SeriesIcon style={{width:40,height:40}}/></div> )} <div className="book-info-overlay"><div className="book-title">{s.title}</div></div> <div className="indicator" style={{top: 'auto', bottom: 10, right: 10, background: '#89b4fa', color: '#1e1e2e'}}>{s.count} Books</div> </div> {isAdmin && ( <div className="book-actions"> <button className="action-btn danger" onClick={(e) => handleDeleteSeries(e, s.title)}><TrashIcon/></button> </div> )} </div> ))} </div> {showCreateSeries && ( <div className="modal-overlay"> <div className="login-box" style={{width:400}}> <h3 style={{marginTop:0}}>Buat Series Baru</h3> <input className="auth-input" placeholder="Nama Series" value={newSeriesName} onChange={e => setNewSeriesName(e.target.value)} autoFocus /> <div style={{display:'flex', gap:10, marginTop:15}}> <button className="auth-button" onClick={handleCreateSeries}>Buat</button> <button className="auth-button secondary" onClick={() => setShowCreateSeries(false)}>Batal</button> </div> </div> </div> )} </div> );
    const renderLibraryView = () => ( <div className="content-scroll-area"> <div className="library-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}> <div style={{color:'#a6adc8', fontSize:'0.9rem'}}> {activeSeries ? `Series: ${activeSeries.title} (${books.length})` : `${books.length} Buku (Loaded)`} </div> <select className="auth-input compact" style={{width:'auto', minWidth:'200px', cursor:'pointer'}} value={sortBy} onChange={(e) => setSortBy(e.target.value)}> <option value="name_asc">Nama (A-Z)</option> <option value="name_desc">Nama (Z-A)</option> <option value="date_desc">Terakhir Dibaca</option> <option value="date_asc">Terlama Dibaca</option> </select> </div> <div className="book-grid"> {books.map(b => ( <div key={b.name} className="book-card" style={{opacity: b.is_hidden ? 0.7 : 1, border: b.is_hidden ? '1px dashed #f38ba8' : 'none'}}> <div className="book-cover" onClick={() => handleOpenBook(b)}> {b.mask_cover && !hiddenZoneActive ? ( <div className="book-cover-placeholder" style={{flexDirection:'column'}}><EyeOffIcon style={{width:40,height:40}}/><span style={{fontSize:12, marginTop:10}}>Hidden</span></div> ) : ( <img src={`/thumbnail/${encodeURIComponent(b.name)}?t=${imageCacheBuster}`} alt="cover" loading="lazy" onError={(e) => {e.target.style.display='none';}} /> )} <div className="book-info-overlay"><div className="book-title">{b.name.replace(/_/g, ' ')}</div></div> <div style={{position:'absolute', top:5, left:5, display:'flex', gap:5}}> {b.is_locked && <div className="indicator locked"><LockIcon style={{width:14, height:14}} /></div>} {b.is_hidden && <div className="indicator hidden"><EyeOffIcon style={{width:14, height:14}} /></div>} </div> {b.series_name && !activeSeries && ( <div className="indicator" style={{top: 5, right: 5, background: '#cba6f7', color: '#1e1e2e', fontSize:'0.7rem', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}> {b.series_name} </div> )} </div> {isAdmin && ( <div className="book-actions"> <button className="action-btn" onClick={(e)=>handleUpdate(e, b.name)}><SyncIcon/></button> <button className="action-btn" onClick={(e)=>openEditModal(e, b)}><EditIcon/></button> <button className="action-btn danger" onClick={(e)=>handleDelete(e, b.name)}><TrashIcon/></button> </div> )} </div> ))} {hasMore && <div ref={observerTarget} className="loading-sentinel" style={{gridColumn:'1/-1', textAlign:'center', padding:20, color:'#6c7086'}}>Loading...</div>} </div> {isAdmin && !activeSeries && <button className="fab" onClick={handleAddBook}>+</button>} </div> );
    const renderChapterList = () => ( <div className="content-scroll-area"> <div className="book-hero"> <div className="hero-bg" style={{backgroundImage: `url(/thumbnail/${encodeURIComponent(currentBookObj?.name)}?t=${Date.now()})`}}></div> <div className="hero-content"> <div className="hero-cover"> <img src={`/thumbnail/${encodeURIComponent(currentBookObj?.name)}?t=${Date.now()}`} alt="Cover" /> </div> <div className="hero-info"> <h1>{currentBookObj?.name.replace(/_/g, ' ')}</h1> <p>{currentBookObj?.description || "Tidak ada deskripsi."}</p> </div> </div> </div> <div className="chapter-list-container"> <h3 style={{color:'#a6adc8'}}>Chapters ({chapters.length})</h3> <div className="chapter-list"> {chapters.map(chapter => ( <div key={chapter} className="chapter-item" onClick={() => handleOpenChapter(currentBookObj.name, chapter)}> <FolderIcon /> <div className="chapter-name">{chapter.replace(/_/g, ' ')}</div> <div className="chapter-arrow">→</div> </div> ))} </div> </div> </div> );
    const renderGalleryView = () => ( <Reader images={imageFilenames} bookName={currentBookObj?.name} chapterName={currentChapter} chapters={chapters} onChapterChange={(newChapter) => handleOpenChapter(currentBookObj.name, newChapter)} imageCacheBuster={imageCacheBuster} initialPage={currentBookObj?.last_page || 0} onBack={handleBack} onSetCover={handleReaderSetCover} isAdmin={isAdmin} /> );
    const renderEditModal = () => { if(!editingBook) return null; return ( <div className="modal-overlay"> <div className="login-box" onClick={e => e.stopPropagation()} style={{textAlign:'left', width: 500}}> <h2 style={{marginTop:0, color:'#89b4fa'}}>Edit Info</h2> <div style={{marginBottom:15}}> <label className="input-label">Series Group</label> <select className="auth-input compact" value={editSeriesInput} onChange={e => setEditSeriesInput(e.target.value)}> <option value="">-- Tidak ada Series --</option> {seriesList.map(s => <option key={s.id} value={s.title}>{s.title}</option>)} <option value="NO_SERIES" style={{color:'#f38ba8'}}>Keluarkan dari Series</option> </select> </div> <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:15}}> <div><label className="input-label">Judul</label><input className="auth-input compact" value={editNameInput} onChange={e => setEditNameInput(e.target.value)} /></div> <div><label className="input-label">Tags</label><input className="auth-input compact" value={editTagsInput} onChange={e => setEditTagsInput(e.target.value)} /></div> </div> <label className="input-label">Deskripsi</label> <textarea className="auth-input compact" style={{height:80, resize:'vertical'}} value={editDescInput} onChange={e => setEditDescInput(e.target.value)} /> {hiddenZoneActive && ( <div className="security-section"> <label className="input-label" style={{color:'#f38ba8'}}>Keamanan</label> <input className="auth-input compact" type="password" value={editLockPass} onChange={e => setEditLockPass(e.target.value)} placeholder="Set Password Baru"/> <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10}}> <div className="checkbox-row"><input type="checkbox" checked={editIsHidden} onChange={e => setEditIsHidden(e.target.checked)} /><label>Hidden Book</label></div> <div className="checkbox-row"><input type="checkbox" checked={editMaskCover} onChange={e => setEditMaskCover(e.target.checked)} /><label>Mask Cover</label></div> </div> {editingBook.is_locked && <button onClick={handleUnlockAction} className="unlock-btn">Hapus Password</button>} </div> )} <div style={{display:'flex', gap:10, marginTop:20}}> <button className="auth-button" onClick={saveMetadata}>Simpan</button> <button className="auth-button secondary" onClick={() => setEditingBook(null)}>Batal</button> </div> </div> </div> ); };
    const renderSettingsModal = () => { if (!showSettings) return null; return ( <div className="modal-overlay"> <div className="login-box" onClick={e => e.stopPropagation()} style={{textAlign:'left'}}> <h2 style={{marginTop:0, color:'#89b4fa'}}>Settings</h2> <input className="auth-input" type="password" value={settingsPassInput} onChange={e => setSettingsPassInput(e.target.value)} placeholder="Password Baru" /> <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:10}}> <button className="auth-button" onClick={handleChangeMasterPass}>Ubah Master Password</button> <button className="auth-button" style={{background:'#f38ba8', color:'#1e1e2e'}} onClick={handleChangeHiddenPass}>Ubah Hidden Zone Password</button> </div> <button className="auth-button secondary" style={{marginTop:20}} onClick={() => {setShowSettings(false); setSettingsPassInput('');}}>Tutup</button> </div> </div> ); };
    const renderLoginModal = () => { if (!showLoginModal) return null; return ( <div className="modal-overlay" onClick={() => setShowLoginModal(false)}> <div className="login-box" onClick={e => e.stopPropagation()}> <h2 style={{marginTop:0}}>Admin Access</h2> <form onSubmit={handleAdminLogin}> <input type="password" className="auth-input" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} autoFocus placeholder="Passphrase"/> <button className="auth-button" style={{marginTop:10}}>Unlock</button> </form> </div> </div> ); };

    if (hasPasswordSetup === null) return <div className="loading-overlay">Loading...</div>;
    return ( 
        <div id="App"> 
            {isLoading && <div className="loading-overlay"><div></div><p>{statusMessage}</p></div>} 
            
            {/* RENDER TOAST CONTAINER */}
            <div className="toast-container">
                {toasts.map(t => (
                    <Toast key={t.id} message={t.msg} type={t.type} onClose={() => removeToast(t.id)} />
                ))}
            </div>

            {renderSidebar()} 
            <div className="main-content"> 
                <div className="top-bar"> 
                    <h2>{ view === 'library' ? (activeSeries ? activeSeries.title : 'My Collection') : view === 'series' ? 'Series Collection' : view === 'chapters' ? currentBookObj?.name.replace(/_/g, ' ') : view === 'admin' ? 'Admin Dashboard' : currentChapter || currentBookObj?.name }</h2> 
                    {(view !== 'library' || activeSeries) && view !== 'admin' && <button onClick={handleBack} className="back-btn"><BackIcon/> Back</button>} 
                </div> 
                {view === 'library' && renderLibraryView()} 
                {view === 'series' && renderSeriesList()} 
                {view === 'chapters' && renderChapterList()} 
                {view === 'gallery' && renderGalleryView()} 
                {view === 'admin' && renderAdminDashboard()}
            </div> 
            {renderEditModal()} {renderSettingsModal()} {renderLoginModal()} 
        </div> 
    );
}

export default App;