/**
 * Spin Ride Feedback Admin Service
 * Lists user-submitted spin ride feedback and lets the admin curate
 * "good examples" that feed back into the AI prompt few-shot injection.
 */
(function () {
  'use strict';

  const ADMIN_EMAIL = 'tbattista@gmail.com';
  const COLLECTION_NAME = 'spin_ride_feedback';

  class SpinRideFeedbackAdminService {
    constructor() {
      this.currentUser = null;
    }

    async checkAdminAccess() {
      if (!window.firebaseReady) {
        await new Promise((resolve) => window.addEventListener('firebaseReady', resolve, { once: true }));
      }
      if (!window.firebaseAuth || !window.firebaseAuthFunctions) {
        alert('Auth not loaded. Please refresh.');
        window.location.href = '/';
        return false;
      }
      const user = await new Promise((resolve) => {
        const { onAuthStateChanged } = window.firebaseAuthFunctions;
        const unsub = onAuthStateChanged(window.firebaseAuth, (u) => {
          unsub();
          resolve(u);
        });
      });
      if (!user) {
        alert('Please sign in to access the admin dashboard.');
        window.location.href = '/';
        return false;
      }
      if (user.email !== ADMIN_EMAIL) {
        alert('Access denied. Admin privileges required.');
        window.location.href = '/';
        return false;
      }
      this.currentUser = user;
      return true;
    }

    async loadFeedback({ filter } = {}) {
      if (!window.firebaseDb || !window.firestoreFunctions) {
        throw new Error('Firestore not available');
      }
      const { collection, query, where, getDocs, orderBy } = window.firestoreFunctions;
      let q = collection(window.firebaseDb, COLLECTION_NAME);
      const wheres = [];
      if (filter === 'unreviewed') wheres.push(where('adminReviewed', '==', false));
      else if (filter === 'good') wheres.push(where('goodExample', '==', true));
      else if (filter === 'low') wheres.push(where('rating', '<=', 2));
      if (wheres.length) q = query(q, ...wheres);

      const snapshot = await getDocs(q);
      const items = [];
      snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
      // Sort: lowest rating first, then newest first.
      items.sort((a, b) => {
        const r = (a.rating || 0) - (b.rating || 0);
        if (r !== 0) return r;
        const aCreated = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bCreated = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bCreated - aCreated;
      });
      return items;
    }

    async updateFeedback(id, updates) {
      if (!window.firebaseDb || !window.firestoreFunctions) {
        throw new Error('Firestore not available');
      }
      const { doc, updateDoc, serverTimestamp } = window.firestoreFunctions;
      const ref = doc(window.firebaseDb, COLLECTION_NAME, id);
      await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
    }

    async markReviewed(id, goodExample) {
      await this.updateFeedback(id, {
        adminReviewed: true,
        goodExample: !!goodExample,
        status: 'reviewed',
      });
    }
  }

  window.spinRideFeedbackAdminService = new SpinRideFeedbackAdminService();
  console.log('✅ Spin Ride Feedback Admin Service loaded');
})();
