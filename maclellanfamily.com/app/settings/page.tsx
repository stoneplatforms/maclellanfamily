'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../lib/firebase-client';
import { db } from '../lib/firebase-client';
import { doc, updateDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { sendVerificationEmail, sendVerificationEmailViaAPI, checkVerificationStatusViaAPI, updateEmailViaAPI } from '../lib/auth';
import Button from '../components/ui/ButtonN';
import { Mail, Lock, Folder, UserCog, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

const Settings = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [users, setUsers] = useState<Array<{id: string, email: string, role: string}>>([]);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('user');
  const [emailVerified, setEmailVerified] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [verificationCooldown, setVerificationCooldown] = useState<number>(0);

  // Function to check verification status from both client and backend
  const checkVerificationStatus = async () => {
    const user = auth.currentUser;
    if (!user) return false;

    try {
      // First, reload user to get fresh client-side data
      await user.reload();
      const clientVerified = user.emailVerified;
      
      // Then check with backend API for server-side verification status
      try {
        const backendStatus = await checkVerificationStatusViaAPI();
        const backendVerified = backendStatus.emailVerified;
        
        // Use the more recent/accurate status (backend is authoritative)
        const finalVerified = backendVerified || clientVerified;
        
        console.log('Verification status check:', {
          clientVerified,
          backendVerified,
          finalVerified
        });
        
        return finalVerified;
      } catch (apiError) {
        // If backend check fails, fall back to client-side status
        console.warn('Backend verification check failed, using client-side status:', apiError);
        return clientVerified;
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
      // Return current state as fallback
      return user.emailVerified;
    }
  };

  useEffect(() => {
    const loadUserSettings = async () => {
      setIsLoadingSettings(true);
      const user = auth.currentUser;
      if (!user) {
        router.push('/');
        return;
      }

      setEmail(user.email || '');
      
      // Check verification status on load
      try {
        const verificationStatus = await checkVerificationStatus();
        setEmailVerified(verificationStatus);
      } catch (err) {
        console.error('Failed to check verification status on load:', err);
        // Fallback to client-side status
        setEmailVerified(user.emailVerified);
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setFolderPath(userDoc.data().folderPath || '');
          setCurrentUserRole(userDoc.data().role || 'user');
        }

        // Only load users list if current user is admin
        if (userDoc.data()?.role === 'admin') {
          const usersSnapshot = await getDocs(collection(db, 'users'));
          const usersData = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            email: doc.data().email || 'No email',
            role: doc.data().role || 'user',
            folderPath: doc.data().folderPath
          }));
          setUsers(usersData);
          
        }
      } catch (err) {
        setError('Failed to load settings');
        console.error(err);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadUserSettings();
  }, [router]);

  const handleRefreshVerificationStatus = async () => {
    setIsCheckingVerification(true);
    setError('');
    setSuccess('');

    try {
      const verificationStatus = await checkVerificationStatus();
      setEmailVerified(verificationStatus);
      
      if (verificationStatus) {
        setSuccess('Email verification status updated - your email is verified!');
      } else {
        setError('Your email is still not verified. Please check your email and click the verification link.');
      }
    } catch (err) {
      setError('Failed to refresh verification status');
      console.error(err);
    } finally {
      setIsCheckingVerification(false);
    }
  };

  // Helper function to handle Firebase verification errors
  const handleVerificationError = (error: unknown): string => {
    const errorObj = error as { message?: string; code?: string; toString?: () => string };
    const errorString = errorObj?.message || errorObj?.toString?.() || String(error);
    const errorCode = errorObj?.code;
    
    if (errorString.includes('TOO_MANY_ATTEMPTS_TRY_LATER') || 
        errorString.includes('too-many-requests') ||
        errorCode === 'auth/too-many-requests') {
      
      // Set a 5-minute cooldown
      const cooldownTime = Date.now() + (5 * 60 * 1000);
      setVerificationCooldown(cooldownTime);
      
      return 'Too many verification attempts. Please wait 5 minutes before trying again. This helps prevent spam and protects your account.';
    }
    
    if (errorString.includes('INVALID_EMAIL') || errorCode === 'auth/invalid-email') {
      return 'Invalid email address. Please check your email and try again.';
    }
    
    if (errorString.includes('USER_NOT_FOUND') || errorCode === 'auth/user-not-found') {
      return 'User account not found. Please try logging out and back in.';
    }
    
    return 'Failed to send verification email. Please try again in a few minutes.';
  };

  const handleSendVerificationEmail = async () => {
    // Check if we're still in cooldown period
    const now = Date.now();
    if (verificationCooldown > now) {
      const remainingMinutes = Math.ceil((verificationCooldown - now) / (60 * 1000));
      setError(`Please wait ${remainingMinutes} more minute(s) before trying again.`);
      return;
    }

    setIsSendingVerification(true);
    setError('');
    setSuccess('');

    try {
      // Try using the client-side method first
      await sendVerificationEmail();
      setSuccess('Verification email sent! Please check your email and click the verification link.');
    } catch (err) {
      console.error('Client-side verification failed:', err);
      
      // If client-side fails, try the API method
      try {
        const result = await sendVerificationEmailViaAPI();
        if (result.success) {
          setSuccess(result.message + ' Please check your email and click the verification link.');
        }
      } catch (apiErr) {
        console.error('API verification failed:', apiErr);
        
        // Use the more specific error from the API if available, otherwise use client error
        const errorToHandle = apiErr || err;
        const errorMessage = handleVerificationError(errorToHandle);
        setError(errorMessage);
      }
    } finally {
      setIsSendingVerification(false);
    }
  };

  const handleReauthenticate = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) return false;
  
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      return true;
    } catch {  // Removed the error parameter completely
      setError('Invalid current password');
      return false;
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!emailVerified) {
      setError('Please verify your current email address before changing it.');
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      if (await handleReauthenticate()) {
        const result = await updateEmailViaAPI(newEmail);
        if (result.success) {
          setSuccess(result.message);
          setEmail(newEmail); // Update the displayed current email
          setNewEmail('');
          setCurrentPassword('');
          // Reset verification status since email changed and new email needs verification
          setEmailVerified(false);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update email');
      }
      console.error(err);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!emailVerified) {
      setError('Please verify your email address before changing your password.');
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      if (await handleReauthenticate()) {
        await updatePassword(user, newPassword);
        setSuccess('Password updated successfully');
        setNewPassword('');
        setCurrentPassword('');
      }
    } catch (err) {
      setError('Failed to update password');
      console.error(err);
    }
  };

  const handleUpdateFolderPath = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const user = auth.currentUser;
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        folderPath: folderPath
      });
      setSuccess('Folder path updated successfully');
    } catch (err) {
      setError('Failed to update folder path');
      console.error(err);
    }
  };

  const handleUpdateUserRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedUserId || !selectedRole) {
      setError('Please select both a user and a role');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', selectedUserId), {
        role: selectedRole
      });
      
      // Update local users state to reflect the change
      setUsers(users.map(user => 
        user.id === selectedUserId 
          ? { ...user, role: selectedRole }
          : user
      ));
      
      setSuccess(`Role updated successfully for user`);
      setSelectedUserId('');
      setSelectedRole('user');
    } catch (err) {
      setError('Failed to update user role');
      console.error(err);
    }
  };

  // Reusable components for scrapbook elements
  const TapeCorner = () => (
    <div className="absolute w-16 h-16 transform rotate-45 bg-yellow-100/70 -top-2 -left-2" />
  );

  const Sticker = ({ children, color }: { children: React.ReactNode; color: string }) => (
    <div className={`absolute ${color} rounded-full w-12 h-12 flex items-center justify-center transform rotate-12 shadow-md`}>
      {children}
    </div>
  );

  const FormInput = ({ 
    label, 
    type, 
    value, 
    onChange, 
    disabled = false, 
    required = false,
    accentColor = "blue" 
  }: {
    label: string;
    type: string;
    value: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    required?: boolean;
    accentColor?: string;
  }) => (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className={`w-full px-3 py-2 border-2 rounded-md ${
          disabled ? 'bg-gray-50' : 'bg-white'
        } focus:ring-2 focus:ring-${accentColor}-200`}
      />
    </div>
  );

  // Email Verification Status Component
  const EmailVerificationStatus = () => (
    <section className="bg-white p-6 rounded-lg shadow-md relative transform rotate-1 border-2 border-gray-200 mb-8">
      <div className="absolute -right-3 -top-3">
        <Sticker color={emailVerified ? "bg-green-200" : "bg-red-200"}>
          {emailVerified ? (
            <CheckCircle className="w-6 h-6 text-green-600" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-red-600" />
          )}
        </Sticker>
      </div>
      <TapeCorner />
      <h2 className="text-xl font-bold mb-4 text-gray-800">Email Verification Status</h2>
      
      {isLoadingSettings ? (
        <div className="p-4 rounded-lg border-2 bg-gray-50 border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw className="w-5 h-5 text-gray-600 animate-spin" />
            <span className="font-medium text-gray-800">
              Checking verification status...
            </span>
          </div>
        </div>
      ) : (
        <div className={`p-4 rounded-lg border-2 ${
          emailVerified 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            {emailVerified ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-medium ${
              emailVerified ? 'text-green-800' : 'text-red-800'
            }`}>
              {emailVerified ? 'Email Verified' : 'Email Not Verified'}
            </span>
          </div>
          
          <p className={`text-sm mb-4 ${
            emailVerified ? 'text-green-700' : 'text-red-700'
          }`}>
            {emailVerified 
              ? 'Your email address has been verified. You can update your email and password.'
              : 'Your email address is not verified. Please verify your email to update your account settings.'
            }
          </p>

          {!emailVerified && (
            <div className="space-y-3">
              <Button
                onClick={handleSendVerificationEmail}
                disabled={isSendingVerification}
                variant="default"
                className="bg-blue-500 hover:bg-blue-600 transform hover:rotate-1 transition-all"
              >
                {isSendingVerification ? 'Sending...' : 'Send Verification Email'}
              </Button>
            </div>
          )}

          <div className="mt-3">
            <Button
              onClick={handleRefreshVerificationStatus}
              disabled={isCheckingVerification}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingVerification ? 'animate-spin' : ''}`} />
              {isCheckingVerification ? 'Checking...' : 'Refresh Status'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );

  // Only render the role management section if the current user is an admin
  const RoleManagementSection = () => {
    if (currentUserRole !== 'admin') return null;

    return (
      <section className="bg-white p-6 rounded-lg shadow-md relative transform rotate-1 border-2 border-gray-200">
        <div className="absolute -right-3 -top-3">
          <Sticker color="bg-orange-200">
            <UserCog className="w-6 h-6 text-orange-600" />
          </Sticker>
        </div>
        <TapeCorner />
        <h2 className="text-xl font-bold mb-4 text-gray-800">Manage User Roles</h2>
        <form onSubmit={handleUpdateUserRole} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Select User</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border-2 rounded-md bg-white focus:ring-2 focus:ring-orange-200"
              required
            >
              <option value="">Choose a user...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.email} (Current: {user.role || 'user'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Select Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 border-2 rounded-md bg-white focus:ring-2 focus:ring-orange-200"
              required
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button variant="default" className="w-full bg-orange-500 hover:bg-orange-600 transform hover:rotate-1 transition-all">
            Update Role
          </Button>
        </form>
      </section>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-6 min-h-screen bg-[#f5e6d3]">
      <div className="text-center mb-12 relative">
        <h1 className="text-4xl font-bold mb-8 font-indie relative inline-block">
          <span className="relative z-10 text-gray-800">My Scrapbook Settings</span>
          <div className="absolute -bottom-2 left-0 w-full h-4 bg-yellow-200/50 -rotate-1" />
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 rounded mb-4 relative transform -rotate-1">
          <TapeCorner />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border-2 border-green-400 text-green-700 px-4 py-3 rounded mb-4 relative transform rotate-1">
          <TapeCorner />
          {success}
        </div>
      )}

      <div className="space-y-8">
        {/* Email Verification Status Section */}
        <EmailVerificationStatus />

        {/* Update Email Section */}
        <section className="bg-white p-6 rounded-lg shadow-md relative transform -rotate-1 border-2 border-gray-200">
          <div className="absolute -right-3 -top-3">
            <Sticker color="bg-blue-200">
              <Mail className="w-6 h-6 text-blue-600" />
            </Sticker>
          </div>
          <TapeCorner />
          <h2 className="text-xl font-bold mb-4 text-gray-800">Update Email</h2>
          {!emailVerified && (
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-4">
              <p className="text-yellow-800 text-sm">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Please verify your current email address before updating it.
              </p>
            </div>
          )}
          <form onSubmit={handleUpdateEmail} className="space-y-4">
            <FormInput
              label="Current Email"
              type="email"
              value={email}
              disabled={true}
            />
            <FormInput
              label="New Email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required={true}
              disabled={!emailVerified}
              accentColor="blue"
            />
            <FormInput
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required={true}
              disabled={!emailVerified}
              accentColor="blue"
            />
            <Button 
              variant="default" 
              className="w-full bg-blue-500 hover:bg-blue-600 transform hover:-rotate-1 transition-all"
              disabled={!emailVerified}
            >
              Update Email
            </Button>
          </form>
        </section>

        {/* Update Password Section */}
        <section className="bg-white p-6 rounded-lg shadow-md relative transform rotate-1 border-2 border-gray-200">
          <div className="absolute -right-3 -top-3">
            <Sticker color="bg-purple-200">
              <Lock className="w-6 h-6 text-purple-600" />
            </Sticker>
          </div>
          <TapeCorner />
          <h2 className="text-xl font-bold mb-4 text-gray-800">Update Password</h2>
          {!emailVerified && (
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-4">
              <p className="text-yellow-800 text-sm">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Please verify your email address before updating your password.
              </p>
            </div>
          )}
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <FormInput
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required={true}
              disabled={!emailVerified}
              accentColor="purple"
            />
            <FormInput
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required={true}
              disabled={!emailVerified}
              accentColor="purple"
            />
            <Button 
              variant="default" 
              className="w-full bg-purple-500 hover:bg-purple-600 transform hover:rotate-1 transition-all"
              disabled={!emailVerified}
            >
              Update Password
            </Button>
          </form>
        </section>

        {/* Update Folder Path Section */}
        <section className="bg-white p-6 rounded-lg shadow-md relative transform -rotate-1 border-2 border-gray-200">
          <div className="absolute -right-3 -top-3">
            <Sticker color="bg-green-200">
              <Folder className="w-6 h-6 text-green-600" />
            </Sticker>
          </div>
          <TapeCorner />
          <h2 className="text-xl font-bold mb-4 text-gray-800">Update Folder Path</h2>
          <form onSubmit={handleUpdateFolderPath} className="space-y-4">
            <FormInput
              label="Folder Path"
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              required={true}
              accentColor="green"
            />
            <Button variant="default" className="w-full bg-green-500 hover:bg-green-600 transform hover:-rotate-1 transition-all">
              Update Folder Path
            </Button>
          </form>
        </section>

        {/* Role Management Section */}
        <RoleManagementSection />
      </div>
    </div>
  );
};

export default Settings;