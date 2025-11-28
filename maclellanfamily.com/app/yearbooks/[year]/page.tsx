'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { auth, onAuthStateChanged } from "../../lib/firebase-client";
import { logout } from '../../lib/auth';
import { useParams } from 'next/navigation';


interface FolderData {
  name: string;
  path: string;
  type: 'folder' | 'other';
  itemCount?: number;
}

interface BlankPageProps {
  isRight?: boolean;
}

interface ContentsPageProps {
  folders: FolderData[];
  startIndex: number;
  isRight?: boolean;
  isFlipping?: boolean;
  zIndex?: number;
  isMobile?: boolean;
  isVisible?: boolean;
  onFolderClick: (name: string, type: 'folder' | 'other') => void;
}

const BlankPage = ({ isRight }: BlankPageProps) => (
  <div 
    className={`absolute inset-0 w-full h-full bg-[#fff8e7] shadow-lg ${isRight ? 'origin-left' : 'origin-right'}`}
    style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
  >
    <div className="relative w-full h-full p-4 md:p-8">
      <div className="absolute inset-4 border-4 border-dashed border-[#d4c4a8] opacity-30" />
    </div>
  </div>
);

const ContentsPage = ({ 
  folders, 
  startIndex, 
  isRight = false, 
  isFlipping = false, 
  zIndex = 1, 
  isVisible = true,
  onFolderClick 
}: ContentsPageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, [folders]);

  return (
    <div 
      className={`absolute inset-0 w-full h-full bg-[#fff8e7] shadow-lg
        ${isRight ? 'origin-left' : 'origin-right'}
        ${isFlipping ? isRight ? 'page-flip-right' : 'page-flip-left' : ''}
        transition-opacity duration-300
        ${isVisible && isLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={{ zIndex, transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
    >
      <div className="relative w-full h-full p-4 md:p-8 overflow-y-auto">
        <div className="absolute inset-4 border-4 border-dashed border-[#d4c4a8] opacity-30" />
        
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-serif text-amber-900">Table of Contents</h2>
          <div className="mt-2 w-24 h-0.5 bg-amber-800/30 mx-auto" />
        </div>
        
        <div className="space-y-4">
          {folders.map((folder, index) => (
            <div 
              key={folder.name}
              onClick={() => onFolderClick(folder.name, folder.type)}
              className={`
                flex items-baseline group cursor-pointer 
                transition-all duration-500 transform
                hover:translate-x-2
              `}
              style={{ transitionDelay: `${index * 50}ms` }}
            >
              <span className="text-xl md:text-2xl mr-4 font-serif text-amber-900 group-hover:text-amber-700">
                {(startIndex + index + 1).toString().padStart(2, '0')}
              </span>
              <span className="text-lg md:text-xl capitalize font-serif text-amber-900 group-hover:text-amber-700">
                {folder.type === 'other' 
                  ? `Other Items (${folder.itemCount})` 
                  : folder.name.replace(/-/g, ' ')}
              </span>
              <div className="flex-grow border-b-2 border-dotted border-amber-200 mx-4 group-hover:border-amber-300" />
            </div>
          ))}
        </div>
      </div>
      
      <div 
        className="absolute inset-0 w-full h-full bg-[#fff8e7]"
        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
      />
    </div>
  );
};

interface YearParams {
  year: string;
}

export default function YearPage() {
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const mounted = useRef(true);
  const itemsPerPage = isMobile ? 8 : 12;
  
  const params = useParams();
  const { year } = params as unknown as YearParams;

  const navigateWithReload = (url: string) => {
    window.location.href = url;
  };

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const handleNavigation = () => {
      window.location.reload();
    };

    window.addEventListener('popstate', handleNavigation);
    return () => {
      window.removeEventListener('popstate', handleNavigation);
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleAuthError = useCallback(async (error: FirebaseError) => {
    console.error('Auth error:', error);
    if (!mounted.current) return;
    
    if (error.code === 'auth/token-expired' || 
        error.code === 'auth/user-token-expired' ||
        error.code === 'auth/invalid-token') {
      try {
        await logout();
        navigateWithReload('/');
      } catch (logoutError) {
        console.error('Logout error:', logoutError);
        setError('Session expired. Please log in again.');
      }
    } else {
      setError(error.message);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupAuth = async () => {
      try {
        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          if (!mounted.current) return;
          
          setUser(currentUser);
          setIsAuthReady(true);
          
          if (!currentUser) {
            navigateWithReload('/');
          }
        }, (error) => {
          console.error('Auth state change error:', error);
          if (error instanceof FirebaseError && mounted.current) {
            handleAuthError(error);
          }
        });
      } catch (error) {
        console.error('Auth setup error:', error);
        if (mounted.current) {
          if (error instanceof FirebaseError) {
            handleAuthError(error);
          } else {
            setError('Authentication failed');
          }
          setIsAuthReady(true);
        }
      }
    };

    setupAuth();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [handleAuthError]);

  useEffect(() => {
    if (!user || !isAuthReady || !mounted.current) return;

    const fetchFolders = async (retryCount = 0) => {
      setLoading(true);
      setError(null);
      
      try {
        const token = await user.getIdToken(true);
        const response = await fetch(`/api/yearbooks/${year}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-store',
            'Pragma': 'no-cache'
          },
        });

        if (!mounted.current) return;

        const data = await response.json();

        if (!response.ok) {
          if (data.code === 'PLUGIN_ERROR' && retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchFolders(retryCount + 1);
          }
          
          if (response.status === 401) {
            handleAuthError(new FirebaseError('auth/invalid-token', data.message || 'Authentication failed'));
            return;
          }
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }

        if (mounted.current && Array.isArray(data.folders)) {
          setFolders(data.folders);
          setTimeout(() => {
            if (mounted.current) {
              setIsVisible(true);
            }
          }, 100);
        }
      } catch (err) {
        console.error('Error fetching folders:', err);
        if (mounted.current) {
          if (err instanceof FirebaseError) {
            handleAuthError(err);
          } else {
            setError(err instanceof Error ? err.message : 'An error occurred');
          }
          setFolders([]);
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
        }
      }
    };

    fetchFolders();
  }, [year, user, isAuthReady, handleAuthError]);

  const handlePageTurn = (direction: 'next' | 'prev') => {
    if (isFlipping) return;
    
    setFlipDirection(direction);
    setIsFlipping(true);
    setIsVisible(false);

    setTimeout(() => {
      if (direction === 'next') {
        setCurrentPage(prev => Math.min(Math.ceil(folders.length / itemsPerPage) - (isMobile ? 1 : 2), prev + (isMobile ? 1 : 2)));
      } else {
        setCurrentPage(prev => Math.max(0, prev - (isMobile ? 1 : 2)));
      }
      setIsFlipping(false);
      setFlipDirection(null);
      setIsVisible(true);
    }, 800);
  };

  const handleFolderClick = (folderName: string, type: 'folder' | 'other') => {
    try {
      if (type === 'other') {
        navigateWithReload(`/yearbooks/${year}/other`);
      } else {
        navigateWithReload(`/yearbooks/${year}/${folderName}`);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      setError('Navigation failed. Please try again.');
    }
  };

  const getCurrentPageFolders = (pageIndex: number) => {
    const startIndex = pageIndex * itemsPerPage;
    return folders.slice(startIndex, startIndex + itemsPerPage);
  };

  if (!isAuthReady || loading || !user || error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#8b7355]">
        <div className={`text-xl ${error ? "text-red-500" : "text-white"}`}>
          {error ? `Error: ${error}` : loading ? "Loading contents..." : "Checking authentication..."}
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(folders.length / itemsPerPage);

  return (
    <div className="min-h-screen bg-[#8b7355] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-serif text-white mb-4">{year} Yearbook</h1>
          <div className="w-32 h-1 bg-white/30 mx-auto" />
        </div>

        <div className={`relative ${isMobile ? 'aspect-[1/1.4]' : 'aspect-[2/1.4]'} bg-[#654321] rounded-lg shadow-2xl p-4 md:p-8 perspective-[2000px]`}>
          {!isMobile && (
            <div className="absolute left-1/2 top-0 bottom-0 w-8 -ml-4 bg-[#463025] shadow-inner" />
          )}
          
          <div className="relative h-full overflow-hidden">
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
                <ContentsPage 
                  folders={getCurrentPageFolders(currentPage)}
                  startIndex={currentPage * itemsPerPage}
                  isFlipping={isFlipping}
                  zIndex={2}
                  isVisible={isVisible}
                  onFolderClick={handleFolderClick}
                  isMobile={isMobile}
                />
              </div>
            ) : (
              <>
                <div className="absolute left-0 w-1/2 h-full">
                  <ContentsPage 
                    folders={getCurrentPageFolders(currentPage)}
                    startIndex={currentPage * itemsPerPage}
                    isFlipping={isFlipping && flipDirection === 'prev'}
                    zIndex={flipDirection === 'prev' ? 3 : 2}
                    isVisible={isVisible}
                    onFolderClick={handleFolderClick}
                    isMobile={isMobile}
                  />
                </div>
                <div className="absolute right-0 w-1/2 h-full">
                  <ContentsPage 
                    folders={getCurrentPageFolders(currentPage + 1)}
                    startIndex={(currentPage + 1) * itemsPerPage}
                    isRight
                    isFlipping={isFlipping && flipDirection === 'next'}
                    zIndex={flipDirection === 'next' ? 3 : 2}
                    isVisible={isVisible}
                    onFolderClick={handleFolderClick}
                    isMobile={isMobile}
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

        .transition-transform {
          transition-property: transform;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          transition-duration: 300ms;
        }

        .shadow-page {
          box-shadow: 
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06),
            2px 0 8px -2px rgba(0, 0, 0, 0.1);
        }

        .bg-paper {
          background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.1) 25%,
            transparent 25%,
            transparent 75%,
            rgba(255, 255, 255, 0.1) 75%,
            rgba(255, 255, 255, 0.1)
          );
          background-size: 100px 100px;
        }
      `}</style>
    </div>
  );
}