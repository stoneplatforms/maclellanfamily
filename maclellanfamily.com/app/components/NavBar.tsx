'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../components/ui/ButtonN';
import { logout } from '../lib/auth';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import UploadButton from './UploadButton';

const NavButton = ({ 
    children, 
    onClick, 
    rotate = '0' 
  }: {
    children: React.ReactNode;
    onClick: () => void;
    rotate?: string;
  }) => (
    <div className="relative group">
      <div className="absolute -inset-1 bg-yellow-100/70 rounded-lg transform rotate-3 group-hover:rotate-6 transition-transform" />
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className={`relative h-10 w-10 bg-white border-2 border-gray-300 hover:bg-gray-50 transform ${rotate} transition-all duration-200 hover:scale-110 z-10`}
      >
        {children}
      </Button>
    </div>
  );

const Navbar = () => {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        setIsAdmin(userData?.role === 'admin');
      } else {
        setIsAdmin(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleSettings = () => {
    router.push('/settings');
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50">
        {/* Decorative tape strips */}
        <div className="absolute top-0 left-1/4 w-16 h-8 bg-yellow-100/70 transform -rotate-12" />
        <div className="absolute top-0 right-1/4 w-16 h-8 bg-pink-100/70 transform rotate-12" />
        
        <div className="relative flex items-center justify-between p-4 bg-[#f5e6d3] border-b-2 border-gray-300 shadow-md">
          {/* Left side navigation */}
          <div className="flex items-center space-x-4">
            <div className="flex space-x-2 bg-white p-2 rounded-lg shadow-md transform -rotate-1">
              <NavButton onClick={() => router.back()} rotate="-rotate-3">
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              </NavButton>
              <NavButton onClick={() => router.forward()} rotate="rotate-3">
                <ChevronRight className="h-5 w-5 text-gray-600" />
              </NavButton>
            </div>
          </div>

          {/* Right side buttons */}
          <div className="flex items-center space-x-4 bg-white p-2 rounded-lg shadow-md transform rotate-1">
            {isAdmin && (
              <>
                <UploadButton />
                <NavButton onClick={handleSettings}>
                  <Settings className="h-5 w-5 text-gray-600" />
                </NavButton>
              </>
            )}
            <NavButton onClick={handleLogout}>
              <LogOut className="h-5 w-5 text-gray-600" />
            </NavButton>
          </div>

          {/* Decorative elements */}
          <div className="absolute -bottom-2 left-12 w-16 h-16 bg-blue-100/20 rounded-full transform -translate-y-1/2" />
          <div className="absolute -bottom-2 right-12 w-12 h-12 bg-green-100/20 rounded-full transform -translate-y-1/2" />
        </div>
      </nav>

      {/* Add spacing below navbar to prevent content overlap */}
      <div className="h-20" />
    </>
  );
};

export default Navbar;