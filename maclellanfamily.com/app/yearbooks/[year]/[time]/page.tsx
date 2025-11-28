'use client';
import React from 'react';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { User } from 'firebase/auth';
import { auth, onAuthStateChanged } from "../../../lib/firebase-client";
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Image from 'next/image';



interface ImageData {
  key: string;
  url: string;
  lastModified: string;
}

interface ModalProps {
  image: ImageData | null;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  currentIndex: number;
  totalImages: number;
}

interface PageProps {
  images: ImageData[];
  isRight?: boolean;
  isFlipping?: boolean;
  zIndex?: number;
  isMobile?: boolean;
  layouts?: string[];
  onImageClick: (image: ImageData, index: number) => void;
}

interface PageLayout {
  imageCount: number;
  layouts: string[];
}

interface PageLayouts {
  [pageIndex: number]: PageLayout;
}

const layoutTypes = [
  'col-span-4 row-span-4', // Full page
  'col-span-4 row-span-2', // Full width
  'col-span-2 row-span-4', // Full height
  'col-span-2 row-span-2', // Quarter page
] as const;

const mobileLayoutTypes = [
  'col-span-2 row-span-3', // Full mobile page
  'col-span-2 row-span-2', // Full width
  'col-span-1 row-span-2', // Half height
  'col-span-1 row-span-1', // Quarter
] as const;

const rotations = [-3, -2, -1, 0, 1, 2, 3] as const;

const ImageModal: React.FC<ModalProps> = ({ image, onClose, onNext, onPrevious, currentIndex, totalImages }) => {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  
  const minSwipeDistance = 50;

  const handleNext = useCallback(() => {
    if (currentIndex < totalImages - 1 && !isTransitioning) {
      setIsTransitioning(true);
      setSlideDirection('left');
      setTimeout(() => {
        onNext();
        setIsTransitioning(false);
      }, 300);
    }
  }, [currentIndex, isTransitioning, onNext, totalImages]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0 && !isTransitioning) {
      setIsTransitioning(true);
      setSlideDirection('right');
      setTimeout(() => {
        onPrevious();
        setIsTransitioning(false);
      }, 300);
    }
  }, [currentIndex, isTransitioning, onPrevious]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrevious();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleNext, handlePrevious]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < totalImages - 1) {
      handleNext();
    }
    if (isRightSwipe && currentIndex > 0) {
      handlePrevious();
    }
  };

  if (!image || !image.url) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/0 animate-modal-backdrop"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors z-50 animate-modal-content"
      >
        <X size={24} />
      </button>

      <div 
        className={`absolute left-[5vw] top-0 bottom-0 w-12 flex items-center justify-start animate-modal-content
          ${currentIndex === 0 ? 'invisible' : 'visible'}`}
        onClick={(e) => {
          e.stopPropagation();
          handlePrevious();
        }}
      >
        <div className="w-12 h-12 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-colors cursor-pointer">
          <ChevronLeft size={24} />
        </div>
      </div>

      <div 
        className={`absolute right-[5vw] top-0 bottom-0 w-12 flex items-center justify-end animate-modal-content
          ${currentIndex === totalImages - 1 ? 'invisible' : 'visible'}`}
        onClick={(e) => {
          e.stopPropagation();
          handleNext();
        }}
      >
        <div className="w-12 h-12 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-colors cursor-pointer">
          <ChevronRight size={24} />
        </div>
      </div>

      <div 
        className="relative max-w-7xl w-full h-full flex items-center justify-center px-20 animate-modal-content"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className={`relative w-full h-full transition-transform duration-300 ease-in-out
          ${isTransitioning ? (slideDirection === 'left' ? 'translate-x-[-100%] opacity-0' : 'translate-x-[100%] opacity-0') : 'translate-x-0 opacity-100'}`}>
          <Image
            src={image.url}
            alt="Full size view"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 1200px"
            priority
            unoptimized
            draggable={false}
          />
        </div>
        
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg animate-modal-content">
          {currentIndex + 1} of {totalImages}
        </div>
      </div>

      <style jsx global>{`
        @keyframes modalBackdropShow {
          from { background-color: rgba(0, 0, 0, 0); }
          to { background-color: rgba(0, 0, 0, 0.75); }
        }

        @keyframes modalContentShow {
          from { 
            opacity: 0;
            transform: scale(0.95);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-modal-backdrop {
          animation: modalBackdropShow 0.3s ease-out forwards;
        }

        .animate-modal-content {
          animation: modalContentShow 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

const getRandomImageCount = () => Math.floor(Math.random() * 4) + 2;

const BlankPage: React.FC<{ isRight?: boolean }> = ({ isRight }) => (
  <div 
    className={`absolute inset-0 w-full h-full bg-[#fff8e7] shadow-lg ${isRight ? 'origin-left' : 'origin-right'}`}
    style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
  >
    <div className="relative w-full h-full p-4 md:p-8">
      <div className="absolute inset-4 border-4 border-dashed border-[#d4c4a8] opacity-30" />
    </div>
  </div>
);

const getOptimalLayout = (imageCount: number, isMobile: boolean) => {
  switch (imageCount) {
    case 2:
      return Array(2).fill(isMobile ? mobileLayoutTypes[0] : layoutTypes[1]);
    case 3:
      if (isMobile) {
        return [
          mobileLayoutTypes[1],
          mobileLayoutTypes[3],
          mobileLayoutTypes[3],
        ];
      }
      return [
        layoutTypes[1],
        layoutTypes[3],
        layoutTypes[3],
      ];
    case 4:
      if (isMobile) {
        return [
          mobileLayoutTypes[1],
          mobileLayoutTypes[3],
          mobileLayoutTypes[3],
          mobileLayoutTypes[1],
        ];
      }
      return Array(4).fill(layoutTypes[3]);
    default:
      return Array(imageCount).fill(isMobile ? mobileLayoutTypes[3] : layoutTypes[3]);
  }
};

const ScrapbookPage: React.FC<PageProps> = ({
  images,
  isRight = false,
  isFlipping = false,
  zIndex = 1,
  isMobile = false,
  layouts,
  onImageClick
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const pageLayouts = layouts || getOptimalLayout(images.length, isMobile);

  useEffect(() => {
    setIsLoaded(false);
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, [images]);

  const validImages = images.filter(img => img && img.url && img.url.trim() !== '');

  return (
    <div 
      className={`
        absolute inset-0
        w-full h-full
        bg-[#fff8e7]
        shadow-lg
        ${isRight ? 'origin-left' : 'origin-right'}
        ${isFlipping ? isRight ? 'page-flip-right' : 'page-flip-left' : ''}
        transition-opacity duration-300
        ${isLoaded ? 'opacity-100' : 'opacity-0'}
      `}
      style={{ zIndex, transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
    >
      <div className="relative w-full h-full p-4 md:p-8 overflow-hidden">
        <div className="absolute inset-4 border-4 border-dashed border-[#d4c4a8] opacity-30" />
        
        <div className="h-full">
          <div className={`grid ${isMobile ? 'grid-cols-2 grid-rows-3' : 'grid-cols-4 grid-rows-4'} gap-2 md:gap-4 h-full`}>
            {validImages.map((image, index) => {
              if (!image || !image.url) return null;
              
              const layout = pageLayouts[index];
              const rotation = rotations[Math.floor(Math.random() * rotations.length)];
              
              return (
                <div
                  key={image.key}
                  className={`
                    relative
                    ${layout}
                    group
                    bg-white
                    p-2 md:p-3
                    shadow-md
                    hover:shadow-xl
                    transition-all
                    duration-300
                    transform-gpu
                    cursor-pointer
                  `}
                  style={{ transform: `rotate(${rotation}deg)` }}
                  onClick={() => onImageClick(image, index)}
                >
                  <div className="relative w-full h-full">
                    {image.url && (
                      <Image
                        src={image.url}
                        alt={`Item ${index + 1}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 33vw, 25vw"
                        unoptimized
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div 
        className="absolute inset-0 w-full h-full bg-[#fff8e7]"
        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
      />
    </div>
  );
};

interface TimeParams {
  year: string;
  time: string;
}

function formatTitle(timeParam: string): string {
  // Decode URL encoded characters
  const decoded = decodeURIComponent(timeParam);
  
  // Replace hyphens and underscores with spaces
  const withSpaces = decoded.replace(/[-_]/g, ' ');
  
  // Capitalize first letter of each word
  return withSpaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default function TimeItemsPage() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pageLayouts, setPageLayouts] = useState<PageLayouts>({});
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(-1);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useParams();
  const { year, time } = params as unknown as TimeParams;
  const router = useRouter();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || window.innerHeight < 600);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        router.replace('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    const fetchImages = async () => {
      if (!user || !isAuthReady) return;
      
      setLoading(true);
      setError(null);
    
      try {
        const token = await user.getIdToken(true);
        const response = await fetch(`/api/yearbooks/${year}/${time}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-store',
            'Pragma': 'no-cache'
          },
        });
    
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
    
        const data = await response.json();
        
        const validImages = (data.images || [])
          .filter((img: ImageData) => img.url && img.url.trim() !== '')
          .map((img: ImageData) => ({
            key: img.key,
            url: img.url,
            lastModified: img.lastModified || new Date().toISOString()
          }));
    
        setImages(validImages);
      } catch (err) {
        console.error('Error fetching images:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setImages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, [year, time, user, isAuthReady]);

  const getOrCreatePageLayout = useCallback((pageIndex: number, availableImages: ImageData[]) => {
    if (pageLayouts[pageIndex]) {
      return pageLayouts[pageIndex];
    }

    const imageCount = Math.min(getRandomImageCount(), availableImages.length);
    const layouts = getOptimalLayout(imageCount, isMobile);
    
    const newLayout = { imageCount, layouts };
    setPageLayouts(prev => ({ ...prev, [pageIndex]: newLayout }));
    return newLayout;
  }, [isMobile, pageLayouts]);

  const getCurrentPageImages = useCallback((pageIndex: number) => {
    let startIndex = 0;
    for (let i = 0; i < pageIndex; i++) {
      if (pageLayouts[i]) {
        startIndex += pageLayouts[i].imageCount;
      }
    }
    
    const layout = getOrCreatePageLayout(pageIndex, images.slice(startIndex));
    return images.slice(startIndex, startIndex + layout.imageCount);
  }, [images, pageLayouts, getOrCreatePageLayout]);

  const calculateTotalPages = useCallback(() => {
    let totalImages = 0;
    let pageCount = 0;
    
    while (totalImages < images.length) {
      const currentPageLayout = pageLayouts[pageCount] || 
        { imageCount: Math.min(getRandomImageCount(), images.length - totalImages) };
      totalImages += currentPageLayout.imageCount;
      pageCount++;
    }
    
    return Math.ceil(pageCount / (isMobile ? 1 : 2));
  }, [images.length, isMobile, pageLayouts]);

  const handleImageClick = (image: ImageData, index: number) => {
    setSelectedImage(image);
    setSelectedImageIndex(index);
  };

  const handleNextImage = () => {
    if (selectedImageIndex < images.length - 1) {
      setSelectedImageIndex(prev => prev + 1);
      setSelectedImage(images[selectedImageIndex + 1]);
    }
  };

  const handlePreviousImage = () => {
    if (selectedImageIndex > 0) {
      setSelectedImageIndex(prev => prev - 1);
      setSelectedImage(images[selectedImageIndex - 1]);
    }
  };

  const handleCloseModal = () => {
    setSelectedImage(null);
    setSelectedImageIndex(-1);
  };

  const handlePageTurn = useCallback((direction: 'next' | 'prev') => {
    if (isFlipping) return;
    
    setFlipDirection(direction);
    setIsFlipping(true);

    setTimeout(() => {
      if (direction === 'next') {
        setCurrentPage(prev => Math.min(calculateTotalPages() - (isMobile ? 1 : 2), prev + (isMobile ? 1 : 2)));
      } else {
        setCurrentPage(prev => Math.max(0, prev - (isMobile ? 1 : 2)));
      }
      setIsFlipping(false);
      setFlipDirection(null);
    }, 800);
  }, [isFlipping, isMobile, calculateTotalPages]);

  const totalPages = calculateTotalPages();

  if (!isAuthReady) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#8b7355]">
        <div className="text-xl text-white">Checking authentication...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#8b7355]">
        <div className="text-xl text-white">Loading images...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#8b7355]">
        <div className="text-xl text-white">Please log in to view this content...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#8b7355]">
        <div className="text-xl text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#8b7355] p-4 md:p-8">
      <div className="max-w-[1800px] mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-serif text-white mb-4">
            {formatTitle(time)} - {year}
          </h1>
          <div className="w-32 h-1 bg-white/30 mx-auto" />
        </div>

        <div className={`relative ${isMobile ? 'aspect-[1/1.4]' : 'aspect-[2/1.4]'} bg-[#654321] rounded-lg shadow-2xl p-4 md:p-8 perspective-[2000px]`}>
          {!isMobile && (
            <div className="absolute left-1/2 top-0 bottom-0 w-8 -ml-4 bg-[#463025] shadow-inner" />
          )}
          
          <div className="relative h-full overflow-hidden book-pages">
            {!isMobile && (
              <>
                <div className="absolute left-0 w-1/2 h-full">
                  <BlankPage />
                </div>
                <div className="absolute right-0 w-1/2 h-full">
                  <BlankPage isRight />
                </div>
              </>
            )}

            {isMobile ? (
              <div className="absolute inset-0">
                <ScrapbookPage 
                  images={getCurrentPageImages(currentPage)}
                  isFlipping={isFlipping}
                  zIndex={2}
                  isMobile={true}
                  layouts={pageLayouts[currentPage]?.layouts}
                  onImageClick={handleImageClick}
                />
              </div>
            ) : (
              <>
                <div className="absolute left-0 w-1/2 h-full">
                  <ScrapbookPage 
                    images={getCurrentPageImages(currentPage)}
                    isFlipping={isFlipping && flipDirection === 'prev'}
                    zIndex={flipDirection === 'prev' ? 3 : 2}
                    layouts={pageLayouts[currentPage]?.layouts}
                    onImageClick={handleImageClick}
                  />
                </div>
                <div className="absolute right-0 w-1/2 h-full">
                  <ScrapbookPage 
                    images={getCurrentPageImages(currentPage + 1)}
                    isRight
                    isFlipping={isFlipping && flipDirection === 'next'}
                    zIndex={flipDirection === 'next' ? 3 : 2}
                    layouts={pageLayouts[currentPage + 1]?.layouts}
                    onImageClick={handleImageClick}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-4 md:mt-8 space-x-4 md:space-x-8">
          <button
            onClick={() => handlePageTurn('prev')}
            disabled={currentPage === 0 || isFlipping}
            className="px-4 md:px-6 py-2 md:py-3 bg-[#463025] text-white rounded-lg disabled:opacity-50 transition-opacity hover:bg-[#5a4132] disabled:hover:bg-[#463025]"
          >
            <ChevronLeft size={isMobile ? 20 : 24} />
          </button>
          <div className="text-white font-serif">
            Page {currentPage + 1} of {totalPages}
          </div>
          <button
            onClick={() => handlePageTurn('next')}
            disabled={currentPage >= totalPages - (isMobile ? 1 : 2) || isFlipping}
            className="px-4 md:px-6 py-2 md:py-3 bg-[#463025] text-white rounded-lg disabled:opacity-50 transition-opacity hover:bg-[#5a4132] disabled:hover:bg-[#463025]"
          >
            <ChevronRight size={isMobile ? 20 : 24} />
          </button>
        </div>
      </div>

      {selectedImage && (
        <ImageModal
          image={selectedImage}
          onClose={handleCloseModal}
          onNext={handleNextImage}
          onPrevious={handlePreviousImage}
          currentIndex={selectedImageIndex}
          totalImages={images.length}
        />
      )}

      <style jsx global>{`
        .page-flip-right {
          animation: flipRight 0.8s ease-in-out;
          transform-origin: left;
          perspective: 2000px;
        }

        .page-flip-left {
          animation: flipLeft 0.8s ease-in-out;
          transform-origin: right;
          perspective: 2000px;
        }

        @keyframes flipRight {
          0% {
            transform: rotateY(0deg);
            z-index: 3;
          }
          100% {
            transform: rotateY(-180deg);
            z-index: 3;
          }
        }

        @keyframes flipLeft {
          0% {
            transform: rotateY(0deg);
            z-index: 3;
          }
          100% {
            transform: rotateY(180deg);
            z-index: 3;
          }
        }

        .perspective-[2000px] {
          perspective: 2000px;
        }
      `}</style>
    </div>
  );
}