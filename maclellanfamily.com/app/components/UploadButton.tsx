'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload } from 'lucide-react';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import Button from './ui/ButtonN';

interface Folder {
  name: string;
  subFolders: Folder[];
}

const UploadButton = () => {
  const [showUpload, setShowUpload] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const resetForm = () => {
    setFile(null);
    setSelectedPaths([]);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showUpload && isAuthenticated) {
      fetchFolders();
    }
  }, [showUpload, isAuthenticated]);

  const fetchFolders = async () => {
    try {
      setIsLoading(true);
      setError('');
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        throw new Error('User not authenticated');
      }

      const idToken = await user.getIdToken();
      
      const response = await fetch('/api/s3', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch folders');
      }
      
      const data = await response.json();
      setFolders(data.folders || []);
    } catch (err) {
      console.error('Error fetching folders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load folders');
      setShowUpload(false);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentFolderPath = () => {
    // Log the current selected paths for debugging
    console.log('Selected paths:', selectedPaths);
    
    // Join the paths and add proper prefix
    const fullPath = selectedPaths.join('/');
    console.log('Full upload path:', fullPath);
    
    return fullPath;
  };
  
  const handleUpload = async () => {
    if (!file || selectedPaths.length === 0) {
      setError('Please select a file and specify a folder path');
      return;
    }
  
    try {
      setIsUploading(true);
      setError('');
      const auth = getAuth();
      const user = auth.currentUser;
  
      if (!user) {
        throw new Error('User not authenticated');
      }
  
      const idToken = await user.getIdToken();
      const uploadPath = getCurrentFolderPath();
      
      // Log the path being sent to the API
      console.log('Sending path to API:', uploadPath);
  
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderPath', uploadPath);
  
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData,
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
  
      const data = await response.json();
      // Log the server response
      console.log('Upload successful:', data);
      setShowUpload(false);
      resetForm();
    } catch (err) {
      // Log upload errors
      console.error('Upload error details:', err);
      setError(err instanceof Error ? err.message : 'Error uploading file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFolderSelect = (index: number, folderName: string) => {
    const newSelectedPaths = [...selectedPaths.slice(0, index), folderName];
    setSelectedPaths(newSelectedPaths);
  };

  const getAvailableFolders = (depth: number): Folder[] => {
    let currentFolders = folders;
    for (let i = 0; i < depth; i++) {
      const currentFolder = currentFolders.find(f => f.name === selectedPaths[i]);
      if (!currentFolder) return [];
      currentFolders = currentFolder.subFolders;
    }
    return currentFolders;
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setShowUpload(false);
      resetForm();
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <div className="relative group">
        <div className="absolute -inset-1 bg-yellow-100/70 rounded-lg transform rotate-3 group-hover:rotate-6 transition-transform" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowUpload(true)}
          className="relative h-10 w-10 bg-white border-2 border-gray-300 hover:bg-gray-50 transform transition-all duration-200 hover:scale-110 z-10"
        >
          <Upload className="h-5 w-5 text-gray-600" />
        </Button>
      </div>

      {showUpload && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] bg-black bg-opacity-50"
          onClick={handleOverlayClick}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4 transform rotate-1 shadow-xl"
            onClick={e => e.stopPropagation()}
            style={{ margin: 'auto' }}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Select Folder Path
                </label>
                {isLoading ? (
                  <div className="text-sm text-gray-500">Loading folders...</div>
                ) : (
                  <div className="space-y-2">
                    {[...Array(selectedPaths.length + 1)].map((_, index) => {
                      const availableFolders = getAvailableFolders(index);
                      if (availableFolders.length === 0) return null;
                      
                      return (
                        <select
                          key={index}
                          value={selectedPaths[index] || ''}
                          onChange={(e) => handleFolderSelect(index, e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select {index === 0 ? 'folder' : 'subfolder'}</option>
                          {availableFolders.map((folder) => (
                            <option key={folder.name} value={folder.name}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      );
                    })}
                  </div>
                )}
                {selectedPaths.length > 0 && (
                  <div className="text-sm text-gray-500">
                    Current path: {getCurrentFolderPath()}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
              )}

              <div className="flex justify-end space-x-2 mt-4">
                <Button
                  onClick={() => {
                    setShowUpload(false);
                    resetForm();
                  }}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!file || selectedPaths.length === 0 || isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UploadButton;