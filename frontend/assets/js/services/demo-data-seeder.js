/**
 * Demo Auto Sign-In
 * Automatically signs anonymous visitors into a shared demo account
 * so they can explore the app with real Firestore data (workouts, history, programs, PRs).
 *
 * When the visitor creates their own account (sign up / log in),
 * Firebase auth switches to their real account automatically.
 */

(function () {
    'use strict';

    const DEMO_UID_PREFIX = 'demo-';
    const TEMPLATE_UID = 'reviewer-demo-user';

    async function signInAsDemo() {
        try {
            const response = await fetch('/api/v3/auth/demo-token', { method: 'POST' });
            if (!response.ok) {
                console.warn('[Demo] Could not get demo token:', response.status);
                return;
            }

            const { token } = await response.json();
            if (window.authService?.signInWithCustomToken) {
                await window.authService.signInWithCustomToken(token);
                console.log('[Demo] Signed in as demo user');
            }
        } catch (err) {
            console.warn('[Demo] Auto sign-in failed:', err.message);
        }
    }

    function isDemoUser(user) {
        if (!user?.uid) return false;
        return user.uid.startsWith(DEMO_UID_PREFIX) || user.uid === TEMPLATE_UID;
    }

    function init() {
        // Don't auto-sign-in if ?landing is in URL (user wants the marketing page)
        if (new URLSearchParams(window.location.search).has('landing')) return;

        const onReady = () => {
            // Wait for auth state to settle and page to reach idle.
            // The 2s delay ensures page load/networkidle completes before
            // we trigger additional network requests for the demo sign-in.
            setTimeout(() => {
                const user = window.firebaseAuth?.currentUser;
                if (!user) {
                    signInAsDemo();
                }
            }, 2000);
        };

        if (window.firebaseReady) {
            onReady();
        } else {
            window.addEventListener('firebaseReady', onReady, { once: true });
        }
    }

    // Expose API
    window.DemoAutoSignIn = {
        signIn: signInAsDemo,
        isDemoUser: isDemoUser,
        DEMO_UID_PREFIX: DEMO_UID_PREFIX,
        TEMPLATE_UID: TEMPLATE_UID,
    };

    init();

})();
