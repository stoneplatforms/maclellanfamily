// /lib/auth.ts
import { auth } from "./firebase-client";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  User
} from "firebase/auth";
import { FirebaseError } from 'firebase/app';

// Define a User type for more structured return values
type AuthenticatedUser = User | null;

// Custom error type for auth operations
interface AuthOperationError {
  code: string;
  message: string;
}

// Helper function to format Firebase errors
const handleFirebaseError = (error: FirebaseError): AuthOperationError => {
  return {
    code: error.code,
    message: error.message
  };
};

// Email verification function
export const sendVerificationEmail = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }
    
    await sendEmailVerification(user);
    console.log("Verification email sent successfully");
  } catch (error) {
    if (error instanceof FirebaseError) {
      const authError = handleFirebaseError(error);
      console.error("Send verification email error:", authError.message);
      throw authError;
    }
    console.error("Unexpected send verification email error");
    throw new Error("An unexpected error occurred while sending verification email");
  }
};

// Check if current user's email is verified
export const isEmailVerified = (): boolean => {
  const user = auth.currentUser;
  return user ? user.emailVerified : false;
};

// Reload user to get fresh verification status
export const reloadUser = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }
    
    await user.reload();
  } catch (error) {
    if (error instanceof FirebaseError) {
      const authError = handleFirebaseError(error);
      console.error("Reload user error:", authError.message);
      throw authError;
    }
    console.error("Unexpected reload user error");
    throw new Error("An unexpected error occurred while reloading user");
  }
};

// Check email verification status via backend API
export const checkVerificationStatusViaAPI = async (): Promise<{ emailVerified: boolean; email: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }

    const token = await user.getIdToken(true); // Force token refresh
    
    const response = await fetch('/api/auth/check-verification', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to check verification status');
    }

    return { emailVerified: data.emailVerified, email: data.email };
  } catch (error) {
    console.error("API check verification status error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unexpected error occurred while checking verification status");
  }
};

// Update email using backend API
export const updateEmailViaAPI = async (newEmail: string): Promise<{ success: boolean; message: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }

    const token = await user.getIdToken(true); // Force token refresh
    
    const response = await fetch('/api/auth/update-email', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newEmail }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update email');
    }

    // Reload the user to get the updated email
    await user.reload();

    return { success: true, message: data.message };
  } catch (error) {
    console.error("API update email error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unexpected error occurred while updating email");
  }
};

// Send verification email using backend API
export const sendVerificationEmailViaAPI = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }

    const token = await user.getIdToken(true); // Force token refresh
    
    const response = await fetch('/api/auth/send-verification', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send verification email');
    }

    return { success: true, message: data.message };
  } catch (error) {
    console.error("API send verification email error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unexpected error occurred while sending verification email");
  }
};

// Login function
export const login = async (email: string, password: string): Promise<AuthenticatedUser> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    if (error instanceof FirebaseError) {
      const authError = handleFirebaseError(error);
      console.error("Login error:", authError.message);
      throw authError;
    }
    console.error("Unexpected login error");
    throw new Error("An unexpected error occurred during login");
  }
};

// Register function
export const register = async (email: string, password: string): Promise<AuthenticatedUser> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    if (error instanceof FirebaseError) {
      const authError = handleFirebaseError(error);
      console.error("Registration error:", authError.message);
      throw authError;
    }
    console.error("Unexpected registration error");
    throw new Error("An unexpected error occurred during registration");
  }
};

// Logout function
export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
    console.log("Logged out successfully");
  } catch (error) {
    if (error instanceof FirebaseError) {
      const authError = handleFirebaseError(error);
      console.error("Logout error:", authError.message);
      throw authError;
    }
    console.error("Unexpected logout error");
    throw new Error("An unexpected error occurred during logout");
  }
};

// Export types that might be useful in other parts of the app
export type { AuthenticatedUser, AuthOperationError };