/**
 * Spin Ride Feedback Service
 * Writes user ratings + comments for completed spin rides directly to the
 * `spin_ride_feedback` Firestore collection. The full ride plan is captured
 * alongside the rating so an admin can review what the AI actually produced
 * and curate good examples for few-shot prompt injection.
 */
(function () {
  'use strict';

  const RATE_LIMIT = 5;
  const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
  const SUBMISSIONS_KEY = 'ffn_spin_feedback_submissions';
  const COLLECTION_NAME = 'spin_ride_feedback';

  class SpinRideFeedbackService {
    checkRateLimit() {
      try {
        const submissions = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY) || '[]');
        const now = Date.now();
        const recent = submissions.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
        localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(recent));
        if (recent.length >= RATE_LIMIT) {
          const minutes = Math.ceil(
            (RATE_LIMIT_WINDOW_MS - (now - Math.min(...recent))) / 60000,
          );
          return { allowed: false, message: `Rate limit reached. Try again in ${minutes}m.` };
        }
        return { allowed: true };
      } catch (e) {
        return { allowed: true };
      }
    }

    recordSubmission() {
      try {
        const subs = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY) || '[]');
        subs.push(Date.now());
        localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(subs));
      } catch (e) {
        // ignore
      }
    }

    collectMetadata() {
      // Reuse the same metadata shape as the main feedback service so the
      // admin page can render uniform context.
      if (window.feedbackService && typeof window.feedbackService.collectMetadata === 'function') {
        return window.feedbackService.collectMetadata();
      }
      // Minimal fallback if feedback-service.js failed to load.
      const meta = {
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };
      if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        meta.userId = window.firebaseAuth.currentUser.uid;
        meta.userEmail = window.firebaseAuth.currentUser.email;
      }
      return meta;
    }

    async submit({ ridePlan, rating, comment, segmentsCompleted, actualSeconds, includeAllOuts }) {
      if (!ridePlan) throw new Error('ridePlan is required');
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new Error('rating must be an integer 1-5');
      }
      const safeComment = typeof comment === 'string' ? comment.trim().slice(0, 500) : '';

      const limit = this.checkRateLimit();
      if (!limit.allowed) throw new Error(limit.message);

      if (!window.firebaseReady) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Firebase timeout')), 5000);
          window.addEventListener('firebaseReady', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
      if (!window.firebaseDb || !window.firestoreFunctions) {
        throw new Error('Firestore not available');
      }

      const doc = {
        ridePlanSnapshot: ridePlan,
        rating,
        comment: safeComment,
        durationMinutes: ridePlan.duration_minutes,
        difficulty: ridePlan.difficulty,
        includeAllOuts: !!includeAllOuts,
        segmentsCompleted: Number.isInteger(segmentsCompleted) ? segmentsCompleted : null,
        actualSeconds: Number.isInteger(actualSeconds) ? actualSeconds : null,
        metadata: this.collectMetadata(),
        status: 'new',
        adminReviewed: false,
        goodExample: null,
        adminNotes: null,
        createdAt: window.firestoreFunctions.serverTimestamp(),
        updatedAt: window.firestoreFunctions.serverTimestamp(),
      };

      const col = window.firestoreFunctions.collection(window.firebaseDb, COLLECTION_NAME);
      const ref = await window.firestoreFunctions.addDoc(col, doc);
      this.recordSubmission();
      console.log('✅ Spin ride feedback saved:', ref.id);
      return { success: true, id: ref.id };
    }
  }

  window.spinRideFeedbackService = new SpinRideFeedbackService();
  console.log('✅ Spin Ride Feedback Service loaded');
})();
