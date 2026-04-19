/**
 * Recent Workouts Manager
 * Handles fetching and displaying recent completed workout sessions on the dashboard
 */

class RecentWorkoutsManager {
  constructor() {
    this.container = document.getElementById('recentWorkoutsSection');
    this.loadingEl = document.getElementById('recentWorkoutsLoading');
    this.emptyEl = document.getElementById('recentWorkoutsEmpty');
    this.gridEl = document.getElementById('recentWorkoutsGrid');
    this.maxWorkouts = 4;
    
    this.init();
  }

  async init() {
    console.log('🏋️ Initializing Recent Workouts Manager...');
    
    // Wait for Firebase to be ready
    if (!window.firebaseReady) {
      console.log('⏳ Waiting for Firebase...');
      await new Promise(resolve => {
        window.addEventListener('firebaseReady', resolve, { once: true });
      });
    }
    
    console.log('✅ Firebase ready, setting up auth listener');
    
    // Wait for auth state before loading
    if (window.firebaseAuth) {
      window.firebaseAuth.onAuthStateChanged((user) => {
        console.log('🔄 Auth state changed:', user ? 'authenticated' : 'not authenticated');
        if (user) {
          this.loadRecentWorkouts();
        } else {
          this.showEmpty();
        }
      });
    } else {
      console.error('❌ Firebase auth not available');
      this.showEmpty();
    }
  }

  async loadRecentWorkouts() {
    try {
      console.log('📥 Loading recent workouts...');
      this.showLoading();
      
      const user = window.firebaseAuth.currentUser;
      if (!user) {
        console.warn('⚠️ No authenticated user');
        this.showEmpty();
        return;
      }
      
      const idToken = await user.getIdToken();
      console.log('🔑 Got auth token');
      
      const url = `/api/v3/workout-sessions?status=completed&page_size=${this.maxWorkouts}`;
      console.log('🌐 Fetching from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`Failed to fetch recent workouts: ${response.status}`);
      }

      const data = await response.json();
      console.log('📊 Received data:', data);
      
      if (data.sessions && data.sessions.length > 0) {
        console.log('✅ Rendering', data.sessions.length, 'workouts');
        this.renderWorkouts(data.sessions);
      } else {
        console.log('ℹ️ No workouts found');
        this.showEmpty();
      }
    } catch (error) {
      console.error('❌ Error loading recent workouts:', error);
      this.showError(error.message);
    }
  }

  renderWorkouts(sessions) {
    // Clear grid first
    this.gridEl.innerHTML = '';
    
    // Create WorkoutCard for each session
    sessions.forEach(session => {
      const workoutData = this.transformSessionToWorkout(session);
      
      const card = new WorkoutCard(workoutData, {
        showTags: false,
        showExercisePreview: false,
        showDescription: false,
        actions: [{
          id: 'start-again',
          label: 'Start Again',
          icon: 'bx-play-circle',
          variant: 'primary',
          onClick: (workout) => this.startAgain(workout.id)
        }],
        customMetadata: this.renderSessionMetadata.bind(this)
      });
      
      this.gridEl.appendChild(card.render());
    });
    
    this.showContent();
  }

  /**
   * Transform workout session into WorkoutCard-compatible format
   */
  transformSessionToWorkout(session) {
    return {
      id: session.workout_id,
      name: session.workout_name || 'Untitled Workout',
      // Create pseudo exercise_groups for badge display
      exercise_groups: [{
        exercises: Array(session.exercises_performed || 0).fill(null).reduce((acc, _, i) => {
          acc[`ex${i}`] = `Exercise ${i + 1}`;
          return acc;
        }, {})
      }],
      // Store session metadata for custom display
      _sessionData: {
        duration_minutes: session.duration_minutes,
        completed_at: session.completed_at,
        exercises_performed: session.exercises_performed
      }
    };
  }

  /**
   * Render custom metadata for workout sessions
   */
  renderSessionMetadata(workout) {
    const sessionData = workout._sessionData;
    if (!sessionData) return '';
    
    const duration = this.formatDuration(sessionData.duration_minutes);
    const date = this.formatDate(sessionData.completed_at);
    
    return `
      <div class="mb-2">
        <span class="badge bg-label-info">${duration}</span>
      </div>
      <p class="text-muted small mb-3">
        <i class="bx bx-time me-1"></i>
        ${date}
      </p>
    `;
  }

  formatDuration(minutes) {
    if (!minutes || minutes === 0) return '0 min';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  formatDate(timestamp) {
    if (!timestamp) return 'Recently';

    const diffDays = getCalendarDaysAgo(timestamp);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    }

    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  startAgain(workoutId) {
    if (workoutId) {
      window.location.href = window.getWorkoutStartUrl
        ? window.getWorkoutStartUrl(workoutId)
        : `workout-mode.html?id=${workoutId}`;
    }
  }

  showLoading() {
    this.loadingEl.classList.remove('d-none');
    this.emptyEl.classList.add('d-none');
    this.gridEl.classList.add('d-none');
  }

  showEmpty() {
    this.loadingEl.classList.add('d-none');
    this.emptyEl.classList.remove('d-none');
    this.gridEl.classList.add('d-none');
  }

  showContent() {
    this.loadingEl.classList.add('d-none');
    this.emptyEl.classList.add('d-none');
    this.gridEl.classList.remove('d-none');
  }

  showError(message = 'Failed to load recent workouts') {
    console.error('🚨 Showing error state:', message);
    this.gridEl.innerHTML = `
      <div class="col-12">
        <div class="alert alert-danger d-flex align-items-center" role="alert">
          <i class="bx bx-error-circle me-2"></i>
          <div>${message}. Please try refreshing the page.</div>
        </div>
      </div>
    `;
    this.showContent();
  }
}

// Initialize when DOM is ready
let recentWorkoutsManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    recentWorkoutsManager = new RecentWorkoutsManager();
  });
} else {
  recentWorkoutsManager = new RecentWorkoutsManager();
}