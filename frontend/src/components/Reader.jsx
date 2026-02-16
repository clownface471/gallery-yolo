import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UpdateBookProgress } from '../../wailsjs/go/main/App';
import './Reader.css';

// --- KOMPONEN PINTAR: LAZY IMAGE ---
// Hanya me-load gambar jika masuk ke viewport (layar)
const LazyImage = ({ src, alt, index, onInView }) => {
    const [isVisible, setIsVisible] = useState(false);
    const imgRef = useRef();

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    if (onInView) onInView(index); // Lapor ke induk: "Aku lagi dilihat nih"
                    observer.disconnect(); // Stop memantau setelah load (hemat resource)
                }
            },
            { rootMargin: '800px 0px' } // Load 800px sebelum muncul di layar (Buffer)
        );

        if (imgRef.current) observer.observe(imgRef.current);
        return () => observer.disconnect();
    }, [index, onInView]);

    return (
        <div ref={imgRef} className="image-container" style={{ minHeight: isVisible ? 'auto' : '1000px' }}>
            {isVisible ? (
                <img src={src} alt={alt} loading="lazy" />
            ) : (
                <div className="loading-placeholder">
                    <span>Halaman {index + 1}</span>
                    <div className="spinner"></div>
                </div>
            )}
        </div>
    );
};

// --- MAIN READER COMPONENT ---
const Reader = ({ 
    images, bookName, chapterName, 
    chapters = [], 
    onChapterChange, 
    imageCacheBuster, initialPage, onBack, onSetCover, isAdmin 
}) => {
    // [UPDATE] Load preference dari localStorage, default 'webtoon'
    const [readMode, setReadMode] = useState(localStorage.getItem('gv_readMode') || 'webtoon'); 
    
    // State Halaman
    const [currentIndex, setCurrentIndex] = useState(initialPage || 0);
    const [showControls, setShowControls] = useState(true);
    
    // Ref untuk Debounce Auto-Save
    const saveTimeoutRef = useRef(null);

    // [BARU] Simpan preferensi mode baca setiap kali berubah
    useEffect(() => {
        localStorage.setItem('gv_readMode', readMode);
    }, [readMode]);

    // [BARU] Logic Auto-Save ke Database (Debounce 1 detik)
    useEffect(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(() => {
            if (bookName) {
                UpdateBookProgress(bookName, currentIndex);
            }
        }, 1000);

        return () => clearTimeout(saveTimeoutRef.current);
    }, [currentIndex, bookName]);

    // Auto-hide controls saat idle
    useEffect(() => {
        let timer;
        const resetTimer = () => {
            setShowControls(true);
            clearTimeout(timer);
            timer = setTimeout(() => setShowControls(false), 3000);
        };
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keydown', resetTimer);
        resetTimer();
        return () => {
            window.removeEventListener('mousemove', resetTimer);
            window.removeEventListener('keydown', resetTimer);
            clearTimeout(timer);
        };
    }, []);

    // --- NAVIGATION LOGIC ---
    const handleNextChapter = () => {
        if (!chapters.length || !onChapterChange) return;
        const currentIdx = chapters.indexOf(chapterName);
        if (currentIdx > -1 && currentIdx < chapters.length - 1) {
            onChapterChange(chapters[currentIdx + 1]);
            setCurrentIndex(0); // Reset ke hal 1 di chapter baru
            window.scrollTo(0,0);
        } else {
            alert("Ini adalah chapter terakhir.");
        }
    };

    const handlePrevChapter = () => {
        if (!chapters.length || !onChapterChange) return;
        const currentIdx = chapters.indexOf(chapterName);
        if (currentIdx > 0) {
            onChapterChange(chapters[currentIdx - 1]);
            setCurrentIndex(0); 
            window.scrollTo(0,0);
        }
    };

    const changePage = (delta) => {
        const next = currentIndex + delta;
        if (next >= 0 && next < images.length) {
            setCurrentIndex(next);
            window.scrollTo(0, 0);
        } else if (next >= images.length) {
            // Jika di halaman terakhir dan tekan Next -> Tawarkan Chapter Selanjutnya
            if (confirm("Ganti ke chapter selanjutnya?")) handleNextChapter();
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onBack();
            
            // Mode Single Page Navigation
            if (readMode === 'single') {
                if (e.key === 'ArrowRight') changePage(1);
                if (e.key === 'ArrowLeft') changePage(-1);
            }

            // Shortcut Ganti Chapter (Shift + Panah)
            if (e.shiftKey && e.key === 'ArrowRight') handleNextChapter();
            if (e.shiftKey && e.key === 'ArrowLeft') handlePrevChapter();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [currentIndex, readMode, chapterName, chapters]); // Dependency penting agar state terbaca update

    // Helper URL Gambar
    const getImageUrl = (filename) => {
        const safeBook = encodeURIComponent(bookName);
        const safeFile = encodeURIComponent(filename);
        
        let url = `/img/${safeBook}/${safeFile}`;
        if (chapterName) {
            const safeChapter = encodeURIComponent(chapterName);
            url = `/img/${safeBook}/${safeChapter}/${safeFile}`;
        }
        return `${url}?t=${imageCacheBuster}`;
    };

    const handleInView = useCallback((index) => {
        setCurrentIndex(index);
    }, []);

    const setAsCover = () => {
        if(confirm("Jadikan halaman ini sebagai cover buku?")) {
            onSetCover(images[currentIndex]);
        }
    };

    return (
        <div className={`reader-wrapper ${showControls ? '' : 'hide-cursor'}`}>
            
            {/* --- HEADER CONTROLS --- */}
            <div className={`reader-header ${showControls ? 'visible' : ''}`}>
                <div style={{display:'flex', gap:10}}>
                    <button onClick={onBack} className="reader-btn">← Exit</button>
                    {chapters.length > 0 && (
                        <>
                            <button 
                                onClick={handlePrevChapter} 
                                disabled={chapters.indexOf(chapterName) <= 0} 
                                className="reader-btn"
                            >
                                Prev Ch.
                            </button>
                            <button 
                                onClick={handleNextChapter} 
                                disabled={chapters.indexOf(chapterName) >= chapters.length-1} 
                                className="reader-btn"
                            >
                                Next Ch.
                            </button>
                        </>
                    )}
                </div>
                
                <div className="reader-title">
                    <span className="book-title">{bookName.replace(/_/g, ' ')}</span>
                    <span className="chapter-title">{chapterName ? ` / ${chapterName.replace(/_/g, ' ')}` : ''}</span>
                    <span className="page-info">({currentIndex + 1}/{images.length})</span>
                </div>

                <div className="reader-actions">
                    <select value={readMode} onChange={(e) => setReadMode(e.target.value)} className="mode-select">
                        <option value="webtoon">Webtoon Mode</option>
                        <option value="single">Single Page Mode</option>
                    </select>
                    {isAdmin && <button onClick={setAsCover} className="reader-btn">★ Cover</button>}
                </div>
            </div>

            {/* --- CONTENT AREA --- */}
            <div className={`reader-content ${readMode}`}>
                
                {/* MODE WEBTOON: Render List dengan Lazy Loading */}
                {readMode === 'webtoon' && (
                    <div className="webtoon-container">
                        {images.map((img, idx) => (
                            <LazyImage 
                                key={img} 
                                index={idx}
                                src={getImageUrl(img)} 
                                alt={`Page ${idx}`} 
                                onInView={handleInView}
                            />
                        ))}
                        
                        {/* Area Tombol Next Chapter di Bawah Scroll */}
                        {chapters.length > 0 && chapters.indexOf(chapterName) < chapters.length - 1 && (
                            <div className="next-chapter-area" onClick={handleNextChapter}>
                                <span>Chapter Selanjutnya →</span>
                            </div>
                        )}
                    </div>
                )}

                {/* MODE SINGLE: Render Satu Gambar Saja */}
                {readMode === 'single' && (
                    <div className="single-container" onClick={(e) => {
                        // Klik kiri layar = Next, Klik kanan layar = Prev
                        const width = e.target.clientWidth;
                        if (e.nativeEvent.offsetX > width / 2) changePage(1);
                        else changePage(-1);
                    }}>
                        <img 
                            src={getImageUrl(images[currentIndex])} 
                            alt={`Page ${currentIndex}`} 
                            className="single-image" 
                        />
                    </div>
                )}
            </div>

            {/* --- FOOTER PROGRESS BAR --- */}
            <div className={`reader-progress ${showControls ? 'visible' : ''}`}>
                <input 
                    type="range" 
                    min="0" 
                    max={images.length - 1} 
                    value={currentIndex} 
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setCurrentIndex(val);
                        if(readMode === 'webtoon') {
                            // Scroll ke elemen ybs
                            const elements = document.querySelectorAll('.image-container');
                            if(elements[val]) elements[val].scrollIntoView();
                        }
                    }} 
                />
            </div>
        </div>
    );
};

export default Reader;