/**
 * Dashboard Workout Card Component
 * Compact card for horizontal scrolling workout carousel
 * @version 1.0.0
 */

class DashboardWorkoutCard {
  constructor(workout, options = {}) {
    this.workout = workout;
    this.options = {
      width: '280px',
      showLastCompleted: true,
      onStart: null, // callback function
      ...options
    };
    this.element = null;
  }
  
  /**
   * Render the workout card
   * @returns {HTMLElement}
   */
  render() {
    const card = document.createElement('div');
    card.className = 'card dashboard-workout-card';
    card.style.minWidth = this.options.width;
    card.style.maxWidth = this.options.width;
    card.setAttribute('data-workout-id', this.workout.id);
    
    card.innerHTML = `
      <div class="card-body">
        ${this._renderHeader()}
        ${this._renderMeta()}
        ${this._renderLastCompleted()}
        ${this._renderAction()}
      </div>
    `;
    
    this.element = card;
    this._attachEventListeners();
    
    return card;
  }
  
  /**
   * Render card header with icon and name
   * @private
   */
  _renderHeader() {
    const workoutData = this.workout.workout_data || this.workout;
    const name = workoutData.name || this.workout.name || 'Untitled Workout';
    
    return `
      <div class="d-flex align-items-center mb-2">
        <div class="workout-icon bg-label-primary me-2">
          <i class="bx bx-dumbbell"></i>
        </div>
        <h6 class="workout-name">${this._escapeHtml(name)}</h6>
      </div>
    `;
  }
  
  /**
   * Render workout metadata (exercises, duration)
   * @private
   */
  _renderMeta() {
    const workoutData = this.workout.workout_data || this.workout;
    const exerciseCount = this._getExerciseCount(workoutData);
    const duration = workoutData.estimated_duration || this._estimateDuration(exerciseCount);
    
    return `
      <div class="workout-meta">
        <span class="badge bg-label-info">${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
        <span class="badge bg-label-secondary">~${duration} min</span>
      </div>
    `;
  }
  
  /**
   * Render last completed date
   * @private
   */
  _renderLastCompleted() {
    if (!this.options.showLastCompleted) return '';
    
    const lastCompleted = this.workout.last_completed || this.workout.last_completed_at;
    
    if (!lastCompleted) {
      return `<small class="workout-last-completed">Never completed</small>`;
    }
    
    const daysAgo = this._getDaysAgo(lastCompleted);
    let text = '';
    
    if (daysAgo === 0) {
      text = 'Last: Today';
    } else if (daysAgo === 1) {
      text = 'Last: Yesterday';
    } else if (daysAgo < 7) {
      text = `Last: ${daysAgo} days ago`;
    } else if (daysAgo < 30) {
      const weeksAgo = Math.floor(daysAgo / 7);
      text = `Last: ${weeksAgo} ${weeksAgo === 1 ? 'week' : 'weeks'} ago`;
    } else {
      text = `Last: ${new Date(lastCompleted).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    
    return `<small class="workout-last-completed">${text}</small>`;
  }
  
  /**
   * Render action buttons
   * @private
   */
  _renderAction() {
    return `
      <button class="btn btn-primary btn-start w-100 mb-2" data-action="start">
        <i class="bx bx-play me-1"></i>Start Workout
      </button>
      <a href="exercise-history-demo.html?workoutId=${this.workout.id}"
         class="btn btn-sm btn-outline-primary w-100"
         data-action="view-progress">
        <i class="bx bx-trending-up me-1"></i>View Progress
      </a>
    `;
  }
  
  /**
   * Attach event listeners
   * @private
   */
  _attachEventListeners() {
    if (!this.element) return;
    
    const startBtn = this.element.querySelector('[data-action="start"]');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleStart();
      });
    }
  }
  
  /**
   * Handle start workout action
   * @private
   */
  _handleStart() {
    if (this.options.onStart) {
      this.options.onStart(this.workout);
    } else {
      // Default: navigate to workout mode (tabata workouts route to the timer page)
      window.location.href = window.getWorkoutStartUrl
        ? window.getWorkoutStartUrl(this.workout)
        : `workout-mode.html?id=${this.workout.id}`;
    }
  }
  
  /**
   * Get total exercise count
   * @private
   */
  _getExerciseCount(workoutData) {
    if (window.ExerciseDataUtils) {
      return ExerciseDataUtils.getExerciseCount(workoutData);
    }
    let count = 0;
    (workoutData.exercise_groups || []).forEach(group => {
      count += Object.keys(group.exercises || {}).length;
    });
    return count || 0;
  }
  
  /**
   * Estimate workout duration based on exercise count
   * @private
   */
  _estimateDuration(exerciseCount) {
    // Rough estimate: 6-8 minutes per exercise
    return Math.round(exerciseCount * 7);
  }
  
  /**
   * Calculate days ago from date
   * @private
   */
  _getDaysAgo(dateString) {
    return getCalendarDaysAgo(dateString);
  }
  
  /**
   * Escape HTML to prevent XSS
   * @private
   */
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Update workout data
   */
  update(workout) {
    this.workout = workout;
    if (this.element) {
      const newElement = this.render();
      this.element.replaceWith(newElement);
    }
  }
  
  /**
   * Destroy the card
   */
  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}

// Export for global use
window.DashboardWorkoutCard = DashboardWorkoutCard;

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DashboardWorkoutCard;
}

console.log('📦 DashboardWorkoutCard component loaded (v1.0.0)');
