/**
 * Firebase SDK Loader - Centralized Firebase initialization
 * Loads Firebase once and makes it available globally
 * 
 * This replaces the duplicate Firebase initialization code that was in every HTML file.
 * Requires: app-config.js to be loaded first
 */
(async function() {
    'use strict';
    
    // Only load if not already loaded
    if (window.firebaseReady) {
        console.log('⚠️ Firebase already loaded, skipping initialization');
        return;
    }
    
    // Check if config is available
    if (!window.config?.firebase) {
        console.error('❌ Firebase config not found. Make sure app-config.js is loaded first.');
        return;
    }
    
    // Helper to retry CDN imports once on failure
    async function importWithRetry(url) {
        try {
            return await import(url);
        } catch (error) {
            console.warn(`⚠️ Failed to load ${url}, retrying in 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            return await import(url);
        }
    }

    try {
        console.log('🔥 Loading Firebase SDK...');

        // Dynamic import Firebase SDK from CDN (with retry on failure)
        const { initializeApp } = await importWithRetry('https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js');
        const {
            getAuth,
            setPersistence,
            indexedDBLocalPersistence,
            browserLocalPersistence,
            signInWithEmailAndPassword,
            createUserWithEmailAndPassword,
            signInWithPopup,
            signInWithRedirect,
            getRedirectResult,
            GoogleAuthProvider,
            signInAnonymously,
            signOut,
            onAuthStateChanged,
            sendEmailVerification,
            sendPasswordResetEmail,
            updateProfile,
            signInWithCustomToken,
        } = await importWithRetry('https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js');
        const {
            getFirestore,
            collection,
            addDoc,
            getDocs,
            doc,
            getDoc,
            setDoc,
            updateDoc,
            deleteDoc,
            query,
            where,
            orderBy,
            serverTimestamp,
            Timestamp
        } = await importWithRetry('https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js');
        
        // Initialize Firebase with centralized config
        const app = initializeApp(window.config.firebase);
        const auth = getAuth(app);
        const db = getFirestore(app);

        // Explicit persistence: prefer IndexedDB (survives iOS PWA storage pressure
        // better than localStorage), fall back to localStorage if IDB is unavailable
        // (e.g. private mode). Without this, iOS PWAs can sign users out unexpectedly
        // when ITP evicts storage after 7 days of inactivity.
        try {
            await setPersistence(auth, indexedDBLocalPersistence);
        } catch (persistenceError) {
            console.warn('⚠️ IndexedDB persistence unavailable, falling back to localStorage:', persistenceError);
            try {
                await setPersistence(auth, browserLocalPersistence);
            } catch (fallbackError) {
                console.warn('⚠️ Auth persistence could not be set:', fallbackError);
            }
        }

        // Make Firebase services available globally
        window.firebaseApp = app;
        window.firebaseAuth = auth;
        window.firebaseDb = db;
        
        // Make Firestore functions available globally
        window.firestoreFunctions = {
            collection,
            addDoc,
            getDocs,
            doc,
            getDoc,
            setDoc,
            updateDoc,
            deleteDoc,
            query,
            where,
            orderBy,
            serverTimestamp,
            Timestamp
        };
        
        // Make Firebase Auth functions available globally
        window.firebaseAuthFunctions = {
            signInWithEmailAndPassword,
            createUserWithEmailAndPassword,
            signInWithPopup,
            signInWithRedirect,
            getRedirectResult,
            GoogleAuthProvider,
            signInAnonymously,
            signOut,
            onAuthStateChanged,
            sendEmailVerification,
            sendPasswordResetEmail,
            updateProfile,
            signInWithCustomToken,
            // authStateReady returns a Promise that resolves when initial auth state is determined
            // This is the recommended way to wait for auth initialization (Firebase v9.16.0+)
            authStateReady: () => auth.authStateReady()
        };
        
        // Signal that Firebase is ready
        window.firebaseReady = true;
        window.dispatchEvent(new Event('firebaseReady'));
        
        console.log('✅ Firebase initialized globally');
        console.log('🔥 Firebase App:', app.name);
        console.log('🔥 Firebase Project:', window.config.firebase.projectId);
        
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        console.error('Stack:', error.stack);
        window.dispatchEvent(new Event('firebaseLoadFailed'));
        if (window.showToast) {
            window.showToast('Unable to connect to authentication service. Some features may be unavailable.', 'warning');
        }
    }
})();