import { useState, useEffect, useRef } from 'react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { UpdateBookProgress } from '../../wailsjs/go/main/App';

// --- ICONS ---
const ScrollIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12" y2="6"></line><line x1="9" y1="15" x2="12" y2="18"></line><line x1="15" y1="15" x2="12" y2="18"></line></svg>;
const PageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="4" width="6" height="16"></rect></svg>;
const GridIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
const CoverIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 22h-16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2z"></path><path d="m9 12-2 3h10l-4-5-4 5z"></path></svg>;
const ZoomInIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>;
const ZoomOutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>;
const ResetIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>;
const ToolsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const SpreadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>;

const Reader = ({ images, bookName, chapterName, imageCacheBuster, initialPage = 0, onBack, onSetCover }) => {
    const [mode, setMode] = useState('masonry'); 
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [showZoomTools, setShowZoomTools] = useState(false);
    const [isSpread, setIsSpread] = useState(false);

    const scrollContainerRef = useRef(null);

    useEffect(() => {
        if (initialPage > 0) {
            setMode('paged');
            setCurrentIndex(initialPage);
        } else {
            setMode('masonry');
            setCurrentIndex(0);
        }
        setShowZoomTools(false); 
        setIsSpread(false);
    }, [bookName, chapterName, initialPage]);

    useEffect(() => {
        if (bookName && currentIndex >= 0) {
            const timer = setTimeout(() => {
                UpdateBookProgress(bookName, currentIndex);
            }, 1000); 
            return () => clearTimeout(timer);
        }
    }, [currentIndex, bookName]);

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
    }, [mode, currentIndex, images, isSpread]);

    const goNext = () => {
        if (isSpread && currentIndex > 0) {
            if (currentIndex < images.length - 2) setCurrentIndex(prev => prev + 2);
            else if (currentIndex < images.length - 1) setCurrentIndex(prev => prev + 1);
        } else {
            if (currentIndex < images.length - 1) setCurrentIndex(prev => prev + 1);
        }
    };

    const goPrev = () => {
        if (isSpread && currentIndex > 1) {
            setCurrentIndex(prev => Math.max(1, prev - 2)); 
            if(currentIndex <= 2) setCurrentIndex(0);
        } else {
            if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
        }
    };

    const getImgUrl = (filename) => {
        let url = `/img/${encodeURIComponent(bookName)}`;
        if (chapterName) url += `/${encodeURIComponent(chapterName)}`;
        url += `/${encodeURIComponent(filename)}`;
        return url + `?t=${imageCacheBuster}`;
    };

    const handleImageClick = (index) => {
        setCurrentIndex(index);
        setMode('paged'); 
    };

    const displayTitle = chapterName 
        ? `${bookName.replace(/_/g, ' ')} / ${chapterName.replace(/_/g, ' ')}`
        : bookName.replace(/_/g, ' ');

    const renderMasonry = () => (
        <div className="reader-scroll-area">
            <div className="masonry-grid">
                {images.map((img, i) => (
                    <div key={i} className="masonry-item" onClick={() => handleImageClick(i)}>
                        <img src={getImgUrl(img)} alt={`Img ${i}`} loading="lazy"/>
                        {i === currentIndex && i > 0 && (
                            <div style={{position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', color: '#1e1e2e', padding: '4px 8px', fontSize: '0.8rem', fontWeight: 'bold'}}>LAST READ</div>
                        )}
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

            <TransformWrapper
                initialScale={1}
                minScale={1}
                maxScale={4}
                centerOnInit={true}
                wheel={{ step: 0.2 }}
                key={currentIndex + (isSpread ? '_spread' : '_single')}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        <div className="paged-image-wrapper">
                            <TransformComponent 
                                wrapperStyle={{width: "100%", height: "100%"}} 
                                // [FIX] Gunakan display: flex dan flexDirection: row
                                contentStyle={{
                                    width: "100%", 
                                    height: "100%", 
                                    display: "flex", 
                                    flexDirection: "row", // Pastikan baris, bukan kolom
                                    justifyContent: "center", 
                                    alignItems: "center",
                                    gap: "0" // Hapus gap agar 50%+50% pas
                                }}
                            >
                                {isSpread && currentIndex > 0 && currentIndex < images.length ? (
                                    <>
                                        {/* [FIX] Gunakan maxWidth 50% (bukan vw) agar relatif terhadap parent */}
                                        <img 
                                            src={getImgUrl(images[currentIndex])} 
                                            alt={`Page ${currentIndex + 1}`} 
                                            className="paged-image"
                                            style={{maxWidth: '50%', maxHeight: '100%', width:'auto', height:'auto', objectFit: 'contain', flex: '0 1 auto'}}
                                        />
                                        {currentIndex + 1 < images.length && (
                                            <img 
                                                src={getImgUrl(images[currentIndex + 1])} 
                                                alt={`Page ${currentIndex + 2}`} 
                                                className="paged-image"
                                                style={{maxWidth: '50%', maxHeight: '100%', width:'auto', height:'auto', objectFit: 'contain', flex: '0 1 auto'}}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <img 
                                        src={getImgUrl(images[currentIndex])} 
                                        alt={`Page ${currentIndex + 1}`} 
                                        className="paged-image"
                                        style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}}
                                    />
                                )}
                            </TransformComponent>
                        </div>

                        {showZoomTools && (
                            <div className={`zoom-controls ${showControls ? 'visible' : ''}`}>
                                <button onClick={() => zoomIn()} title="Zoom In"><ZoomInIcon/></button>
                                <button onClick={() => zoomOut()} title="Zoom Out"><ZoomOutIcon/></button>
                                <button onClick={() => resetTransform()} title="Reset"><ResetIcon/></button>
                            </div>
                        )}
                    </>
                )}
            </TransformWrapper>

            <div className="page-counter">
                {isSpread && currentIndex > 0 
                    ? `${currentIndex + 1}-${Math.min(currentIndex + 2, images.length)} / ${images.length}` 
                    : `${currentIndex + 1} / ${images.length}`
                }
            </div>
        </div>
    );

    return (
        <div className="reader-wrapper">
            <div className={`reader-controls ${showControls ? 'visible' : ''}`}>
                <div style={{display:'flex', gap:10, alignItems:'center'}}>
                    <button className="control-btn back" onClick={onBack}>← Back</button>
                    <div className="reader-info">{displayTitle}</div>
                </div>

                <div className="mode-switch">
                    {mode === 'paged' && (
                        <button className={`control-btn ${isSpread ? 'active' : ''}`} onClick={() => setIsSpread(!isSpread)} style={{marginRight: 10}} title={isSpread ? "1-Pg" : "2-Pg"}>
                            <SpreadIcon /> {isSpread ? "2-Pg" : "1-Pg"}
                        </button>
                    )}
                    {mode === 'paged' && (
                        <button className="control-btn" onClick={() => onSetCover(images[currentIndex])} style={{marginRight: 10, borderColor: '#a6e3a1', color: '#a6e3a1'}}><CoverIcon /> Set Cover</button>
                    )}
                    {mode === 'paged' && (
                        <button className={`control-btn ${showZoomTools ? 'active' : ''}`} onClick={() => setShowZoomTools(!showZoomTools)} style={{marginRight: 15}} title="Toggle Zoom Controls"><ToolsIcon /> Tools</button>
                    )}
                    <button className={`control-btn ${mode === 'masonry' ? 'active' : ''}`} onClick={() => setMode('masonry')}><GridIcon /></button>
                    <button className={`control-btn ${mode === 'webtoon' ? 'active' : ''}`} onClick={() => setMode('webtoon')}><ScrollIcon /></button>
                    <button className={`control-btn ${mode === 'paged' ? 'active' : ''}`} onClick={() => setMode('paged')}><PageIcon /></button>
                </div>
            </div>

            <div className="reader-content">
                {mode === 'masonry' && renderMasonry()}
                {mode === 'webtoon' && renderWebtoon()}
                {mode === 'paged' && renderPaged()}
            </div>
        </div>
    );
};

export default Reader;