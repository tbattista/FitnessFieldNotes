/**
 * Firebase Auth Service for Ghost Gym V3 Phase 2
 * Handles authentication operations and user management
 */

class AuthService {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.authStateListeners = [];
        this.initialized = false;
        
        // Wait for Firebase to be ready
        this.waitForFirebase();
    }
    
    async waitForFirebase() {
        // Wait for Firebase initialization
        if (window.firebaseReady) {
            this.initialize();
        } else {
            window.addEventListener('firebaseReady', () => this.initialize());
        }
    }
    
    initialize() {
        // Guard against duplicate initialization (both flag check and event can trigger this)
        if (this._initializing || this.initialized) return;
        this._initializing = true;

        try {
            if (!window.firebaseAuth || !window.firebaseAuthFunctions) {
                throw new Error('Firebase Auth not available');
            }
            
            // Set up auth state listener
            const { onAuthStateChanged, getRedirectResult } = window.firebaseAuthFunctions;

            onAuthStateChanged(window.firebaseAuth, (user) => {
                this.handleAuthStateChange(user);
            });

            // Handle redirect result (from fallback sign-in)
            if (getRedirectResult) {
                getRedirectResult(window.firebaseAuth).then((result) => {
                    if (result && result.user) {
                        console.log('✅ Google redirect sign-in successful');
                    }
                }).catch((error) => {
                    if (error.code !== 'auth/popup-closed-by-user') {
                        console.error('❌ Redirect sign-in error:', error);
                        const userMessage = this.formatAuthError(error).message;
                        if (window.showToast) {
                            window.showToast(userMessage, 'danger');
                        }
                    }
                });
            }

            this.initialized = true;
            console.log('✅ Firebase Auth Service initialized');
            
        } catch (error) {
            console.error('⚠️ Firebase Auth initialization failed:', error.message);
            this.initialized = false;
            this._initializing = false;
        }
    }
    
    handleAuthStateChange(user) {
        const wasAuthenticated = this.isAuthenticated;
        this.currentUser = user;
        this.isAuthenticated = !!user;

        console.log(`🔄 Auth state changed: ${this.isAuthenticated ? 'authenticated' : 'anonymous'}`);

        // Create/update user document in Firestore (fire-and-forget)
        if (user && !user.isAnonymous && window.firebaseDb && window.firestoreFunctions) {
            this._ensureUserDocument(user);
            this._syncActiveProgram(user);
        }

        // Notify all listeners
        this.authStateListeners.forEach(callback => {
            try {
                callback(user);
            } catch (error) {
                console.error('❌ Error in auth state listener:', error);
            }
        });

        // Dispatch global event
        window.dispatchEvent(new CustomEvent('authStateChanged', {
            detail: { user, isAuthenticated: this.isAuthenticated }
        }));
    }

    async _ensureUserDocument(user) {
        try {
            const { doc, getDoc, setDoc, serverTimestamp } = window.firestoreFunctions;
            const userDocRef = doc(window.firebaseDb, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);

            const userData = {
                email: user.email,
                displayName: user.displayName || null,
                last_login: serverTimestamp()
            };

            if (!docSnap.exists()) {
                userData.created_at = serverTimestamp();
            }

            await setDoc(userDocRef, userData, { merge: true });
            console.log('👤 User document synced');
        } catch (error) {
            console.warn('⚠️ Could not sync user document:', error.message);
        }
    }
    
    async _syncActiveProgram(user) {
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user/active-program', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.program_id) {
                    localStorage.setItem('ffn_active_program_id', data.program_id);
                } else {
                    localStorage.removeItem('ffn_active_program_id');
                }
                console.log('📌 Active program synced:', data.program_id || 'none');
            }
        } catch (error) {
            console.warn('⚠️ Could not sync active program:', error.message);
        }
    }

    // Public API Methods
    
    onAuthStateChange(callback) {
        if (typeof callback === 'function') {
            this.authStateListeners.push(callback);
            
            // If already initialized, call immediately with current state
            if (this.initialized) {
                callback(this.currentUser);
            }
        }
    }
    
    async signInWithEmail(email, password) {
        if (!this.initialized || !window.firebaseAuthFunctions) {
            throw new Error('Auth service not initialized');
        }
        
        try {
            const { signInWithEmailAndPassword } = window.firebaseAuthFunctions;
            const userCredential = await signInWithEmailAndPassword(window.firebaseAuth, email, password);
            
            console.log('✅ Email sign-in successful');
            return userCredential.user;
            
        } catch (error) {
            console.error('❌ Email sign-in failed:', error);
            throw this.formatAuthError(error);
        }
    }
    
    async signUpWithEmail(email, password, displayName = null) {
        if (!this.initialized || !window.firebaseAuthFunctions) {
            throw new Error('Auth service not initialized');
        }
        
        try {
            const { createUserWithEmailAndPassword, updateProfile } = window.firebaseAuthFunctions;
            const userCredential = await createUserWithEmailAndPassword(window.firebaseAuth, email, password);
            
            // Update display name if provided
            if (displayName) {
                await updateProfile(userCredential.user, { displayName });
            }
            
            console.log('✅ Email sign-up successful');
            return userCredential.user;
            
        } catch (error) {
            console.error('❌ Email sign-up failed:', error);
            throw this.formatAuthError(error);
        }
    }
    
    async signInWithGoogle() {
        if (!this.initialized || !window.firebaseAuthFunctions) {
            throw new Error('Auth service not initialized');
        }

        try {
            const { signInWithPopup, signInWithRedirect, GoogleAuthProvider } = window.firebaseAuthFunctions;
            const provider = new GoogleAuthProvider();

            try {
                const userCredential = await signInWithPopup(window.firebaseAuth, provider);
                console.log('✅ Google sign-in successful');
                return userCredential.user;
            } catch (popupError) {
                // Only fallback to redirect when popup was actually blocked by the browser
                if (popupError.code === 'auth/popup-blocked') {
                    console.log('🔄 Popup blocked, falling back to redirect sign-in...');
                    await signInWithRedirect(window.firebaseAuth, provider);
                    return null;
                }
                // User closed the popup themselves - just re-throw (not an error worth redirecting for)
                throw popupError;
            }

        } catch (error) {
            console.error('❌ Google sign-in failed:', error);
            throw this.formatAuthError(error);
        }
    }
    
    async signInAnonymously() {
        if (!this.initialized || !window.firebaseAuthFunctions) {
            throw new Error('Auth service not initialized');
        }
        
        try {
            const { signInAnonymously } = window.firebaseAuthFunctions;
            const userCredential = await signInAnonymously(window.firebaseAuth);
            
            console.log('✅ Anonymous sign-in successful');
            return userCredential.user;
            
        } catch (error) {
            console.error('❌ Anonymous sign-in failed:', error);
            throw this.formatAuthError(error);
        }
    }
    
    async signInWithCustomToken(token) {
        if (!this.initialized || !window.firebaseAuthFunctions) {
            throw new Error('Auth service not initialized');
        }

        try {
            const { signInWithCustomToken } = window.firebaseAuthFunctions;
            const userCredential = await signInWithCustomToken(window.firebaseAuth, token);
            console.log('Review token sign-in successful');
            return userCredential.user;
        } catch (error) {
            console.error('Custom token sign-in failed:', error);
            throw this.formatAuthError(error);
        }
    }

    async signOut() {
        if (!this.initialized || !window.firebaseAuthFunctions) {
            throw new Error('Auth service not initialized');
        }
        
        try {
            const { signOut } = window.firebaseAuthFunctions;
            await signOut(window.firebaseAuth);
            localStorage.removeItem('ffn_active_program_id');

            console.log('✅ Sign-out successful');
            
        } catch (error) {
            console.error('❌ Sign-out failed:', error);
            throw this.formatAuthError(error);
        }
    }
    
    async sendPasswordResetEmail(email) {
        if (!this.initialized || !window.firebaseAuthFunctions) {
            throw new Error('Auth service not initialized');
        }
        
        try {
            const { sendPasswordResetEmail } = window.firebaseAuthFunctions;
            await sendPasswordResetEmail(window.firebaseAuth, email);
            
            console.log('✅ Password reset email sent');
            
        } catch (error) {
            console.error('❌ Password reset failed:', error);
            throw this.formatAuthError(error);
        }
    }
    
    async sendEmailVerification() {
        if (!this.currentUser) {
            throw new Error('No user signed in');
        }
        
        try {
            const { sendEmailVerification } = window.firebaseAuthFunctions;
            await sendEmailVerification(this.currentUser);
            
            console.log('✅ Email verification sent');
            
        } catch (error) {
            console.error('❌ Email verification failed:', error);
            throw this.formatAuthError(error);
        }
    }
    
    async getIdToken(forceRefresh = false) {
        if (!this.currentUser) {
            throw new Error('No user signed in');
        }
        
        try {
            return await this.currentUser.getIdToken(forceRefresh);
        } catch (error) {
            console.error('❌ Error getting ID token:', error);
            throw error;
        }
    }
    
    // Utility Methods
    
    getCurrentUser() {
        return this.currentUser;
    }
    
    isUserAuthenticated() {
        return this.isAuthenticated;
    }
    
    isInitialized() {
        return this.initialized;
    }
    
    formatAuthError(error) {
        const errorMessages = {
            'auth/user-not-found': 'No account found with this email address.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/weak-password': 'Password should be at least 6 characters.',
            'auth/invalid-email': 'Invalid email address.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
            'auth/popup-closed-by-user': 'Sign-in popup was closed.',
            'auth/cancelled-popup-request': 'Sign-in was cancelled.',
            'auth/popup-blocked': 'Sign-in popup was blocked by the browser.'
        };
        
        const message = errorMessages[error.code] || error.message || 'An authentication error occurred.';
        
        return new Error(message);
    }
}

// Create global instance
window.authService = new AuthService();

// Auto-login via review code in URL (?review_code=SECRET)
(function() {
    const params = new URLSearchParams(window.location.search);
    const reviewCode = params.get('review_code');
    if (!reviewCode) return;

    async function attemptReviewSignIn() {
        // Wait for authService to be ready
        let retries = 0;
        while ((!window.authService || !window.authService.initialized) && retries < 50) {
            await new Promise(r => setTimeout(r, 100));
            retries++;
        }
        if (!window.authService?.initialized) {
            console.error('AuthService not ready, cannot process review code');
            return;
        }

        try {
            const response = await fetch(
                (window.config?.api?.getUrl?.('/api/v3/auth/review-token') || '/api/v3/auth/review-token'),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: reviewCode })
                }
            );

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${response.status}`);
            }

            const { token } = await response.json();
            await window.authService.signInWithCustomToken(token);

            // Strip review_code from URL
            params.delete('review_code');
            const newSearch = params.toString();
            const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
            window.history.replaceState({}, '', newUrl);

            if (window.showToast) {
                window.showToast('Signed in as reviewer', 'success');
            }
        } catch (error) {
            console.error('Review sign-in failed:', error.message);
            if (window.showToast) {
                window.showToast('Review sign-in failed: ' + error.message, 'danger');
            }
        }
    }

    attemptReviewSignIn();
})();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}