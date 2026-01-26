import { useState, useEffect, useRef } from 'react';

// --- ICONS ---
const ScrollIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12" y2="6"></line><line x1="9" y1="15" x2="12" y2="18"></line><line x1="15" y1="15" x2="12" y2="18"></line></svg>;
const PageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="4" width="6" height="16"></rect></svg>;
const GridIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
const CoverIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 22h-16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2z"></path><path d="m9 12-2 3h10l-4-5-4 5z"></path></svg>;

// Tambahkan prop 'onSetCover'
const Reader = ({ images, currentBook, imageCacheBuster, onBack, onSetCover }) => {
    const [mode, setMode] = useState('masonry'); 
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const scrollContainerRef = useRef(null);

    // Auto-hide controls
    useEffect(() => {
        let timeout;
        const resetTimer = () => {
            setShowControls(true);
            clearTimeout(timeout);
            timeout = setTimeout(() => setShowControls(false), 3000);
        };
        window.addEventListener('mousemove', resetTimer);
        return () => {
            window.removeEventListener('mousemove', resetTimer);
            clearTimeout(timeout);
        };
    }, []);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (mode === 'paged') {
                if (e.key === 'ArrowRight') goNext();
                if (e.key === 'ArrowLeft') goPrev();
            } else if (e.key === 'Escape') {
                if (mode === 'paged' || mode === 'webtoon') setMode('masonry');
                else onBack();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, currentIndex, images]);

    const goNext = () => { if (currentIndex < images.length - 1) setCurrentIndex(prev => prev + 1); };
    const goPrev = () => { if (currentIndex > 0) setCurrentIndex(prev => prev - 1); };

    const getImgUrl = (filename) => `/img/${encodeURIComponent(currentBook)}/${encodeURIComponent(filename)}?t=${imageCacheBuster}`;

    const handleImageClick = (index) => {
        setCurrentIndex(index);
        setMode('paged'); 
    };

    // --- RENDER MODES ---
    const renderMasonry = () => (
        <div className="reader-scroll-area">
            <div className="masonry-grid" style={{padding: '80px 20px 20px 20px'}}>
                {images.map((img, i) => (
                    <div key={i} className="masonry-item" onClick={() => handleImageClick(i)}>
                        <img src={getImgUrl(img)} alt={`Img ${i}`} loading="lazy"/>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderWebtoon = () => (
        <div className="webtoon-container" ref={scrollContainerRef}>
            {images.map((img, i) => (
                <img key={i} src={getImgUrl(img)} alt={`Page ${i}`} className="webtoon-page" loading="lazy"/>
            ))}
            <div className="end-marker">--- END OF CHAPTER ---</div>
        </div>
    );

    const renderPaged = () => (
        <div className="paged-container">
            <div className="click-zone left" onClick={goPrev} title="Previous"></div>
            <div className="click-zone right" onClick={goNext} title="Next"></div>
            <div className="paged-image-wrapper">
                <img src={getImgUrl(images[currentIndex])} alt={`Page ${currentIndex + 1}`} className="paged-image"/>
                <div className="page-counter">{currentIndex + 1} / {images.length}</div>
            </div>
        </div>
    );

    return (
        <div className="reader-wrapper">
            <div className={`reader-controls ${showControls ? 'visible' : ''}`}>
                <div style={{display:'flex', gap:10, alignItems:'center'}}>
                    <button className="control-btn back" onClick={onBack}>← Back</button>
                    <div className="reader-info">{currentBook.replace(/_/g, ' ')}</div>
                </div>

                <div className="mode-switch">
                    {/* BUTTON SET COVER (Hanya Muncul di Paged Mode) */}
                    {mode === 'paged' && (
                        <button 
                            className="control-btn" 
                            onClick={() => onSetCover(images[currentIndex])}
                            title="Set current image as Book Cover"
                            style={{marginRight: 15, borderColor: '#a6e3a1', color: '#a6e3a1'}}
                        >
                            <CoverIcon /> Set Cover
                        </button>
                    )}

                    <button className={`control-btn ${mode === 'masonry' ? 'active' : ''}`} onClick={() => setMode('masonry')}><GridIcon /></button>
                    <button className={`control-btn ${mode === 'webtoon' ? 'active' : ''}`} onClick={() => setMode('webtoon')}><ScrollIcon /></button>
                    <button className={`control-btn ${mode === 'paged' ? 'active' : ''}`} onClick={() => setMode('paged')}><PageIcon /></button>
                </div>
            </div>

            <div className="reader-content" style={{height:'100%', width:'100%'}}>
                {mode === 'masonry' && renderMasonry()}
                {mode === 'webtoon' && renderWebtoon()}
                {mode === 'paged' && renderPaged()}
            </div>
        </div>
    );
};

export default Reader;