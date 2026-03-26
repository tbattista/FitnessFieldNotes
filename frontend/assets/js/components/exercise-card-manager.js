/**
 * Ghost Gym - Exercise Card Manager
 * Manages exercise card interactions (expand/collapse, navigation)
 * @version 1.0.0
 * @date 2025-01-05
 */

class ExerciseCardManager {
    /**
     * @param {Object} options - Configuration options
     * @param {string} options.containerSelector - Container CSS selector
     * @param {Object} options.sessionService - Workout session service
     * @param {Object} options.timerManager - Workout timer manager
     * @param {Object} options.workout - Current workout data
     */
    constructor(options) {
        this.containerSelector = options.containerSelector;
        this.sessionService = options.sessionService;
        this.timerManager = options.timerManager;
        this.workout = options.workout;
        
        console.log('🃏 Exercise Card Manager initialized');
    }
    
    // ==================== Card Interactions ====================
    
    /**
     * Toggle exercise card expand/collapse
     * @param {number} index - Exercise index
     */
    toggle(index) {
        const card = document.querySelector(`.workout-card[data-exercise-index="${index}"]`);
        if (!card) return;
        
        const isExpanded = card.classList.contains('expanded');
        const exerciseName = card.getAttribute('data-exercise-name');
        
        if (isExpanded) {
            this.collapse(card);
            // Clear auto-complete timer when collapsing
            if (exerciseName && this.sessionService.isSessionActive()) {
                this.sessionService.clearAutoCompleteTimer(exerciseName);
            }
        } else {
            // Collapse all other cards and clear their timers
            document.querySelectorAll('.workout-card.expanded').forEach(otherCard => {
                const otherName = otherCard.getAttribute('data-exercise-name');
                this.collapse(otherCard);
                // Clear timer for collapsed cards
                if (otherName && this.sessionService.isSessionActive()) {
                    this.sessionService.clearAutoCompleteTimer(otherName);
                }
            });
            this.expand(card);
            
            // Start auto-complete timer when expanding (only during active session)
            if (exerciseName && this.sessionService.isSessionActive()) {
                this.sessionService.startAutoCompleteTimer(exerciseName, 10); // 10 minutes
            }
            
            // Sync global timer with newly expanded card
            this.syncTimerWithCard(index);
        }
    }
    
    /**
     * Expand a card
     * @param {HTMLElement} card - Card element to expand
     */
    expand(card) {
        // Show body immediately so CSS transitions can take effect
        const body = card.querySelector('.workout-card-body');
        if (body) {
            body.style.display = 'block';
            // Force reflow to ensure initial state is set before transition
            void body.offsetHeight;
        }
        
        // Add expanded class to trigger CSS transitions
        card.classList.add('expanded');
        
        // OPTIMIZED: Faster scroll for snappier feel
        setTimeout(() => {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
    
    /**
     * Collapse a card
     * @param {HTMLElement} card - Card element to collapse
     */
    collapse(card) {
        // Remove expanded class to trigger reverse CSS transitions
        card.classList.remove('expanded');
        
        // OPTIMIZED: Wait for faster transitions to complete before hiding
        const body = card.querySelector('.workout-card-body');
        if (body) {
            setTimeout(() => {
                // Only hide if card is still collapsed (user didn't re-expand)
                if (!card.classList.contains('expanded')) {
                    body.style.display = 'none';
                }
            }, 200); // Match new faster CSS transition duration (0.2s)
        }
    }
    
    /**
     * Expand the first exercise card
     */
    expandFirst() {
        const firstCard = document.querySelector('.workout-card[data-exercise-index="0"]');
        if (firstCard && !firstCard.classList.contains('expanded')) {
            console.log('✨ Auto-expanding first exercise card');
            this.toggle(0);
        }
    }
    
    // ==================== Navigation ====================
    
    /**
     * Go to next exercise
     * @param {number} currentIndex - Current exercise index
     */
    goToNext(currentIndex) {
        const allCards = document.querySelectorAll('.workout-card');
        const nextIndex = currentIndex + 1;
        
        if (nextIndex < allCards.length) {
            const currentCard = allCards[currentIndex];
            this.collapse(currentCard);
            
            // OPTIMIZED: Start next card opening while current is still closing (overlapping animations)
            setTimeout(() => {
                this.toggle(nextIndex);
            }, 50); // Reduced from 300ms to 50ms for overlapping effect
        } else {
            // Last exercise - trigger complete workout callback
            console.log('🎉 Last exercise completed');
            if (this.onLastExerciseComplete) {
                this.onLastExerciseComplete();
            }
        }
    }
    
    // ==================== Data Access ====================
    
    /**
     * Get exercise group data by index
     * Merges session data with template data for updated values (sets, reps, rest, weight)
     * @param {number} index - Exercise index
     * @returns {Object|null} Exercise group data or null
     */
    getExerciseGroup(index) {
        let exerciseGroup = null;
        let exerciseName = null;
        
        // Check regular exercise groups first
        if (this.workout.exercise_groups && index < this.workout.exercise_groups.length) {
            exerciseGroup = { ...this.workout.exercise_groups[index] };
            exerciseName = exerciseGroup.exercises?.a;
        }
        
        if (!exerciseGroup) {
            return null;
        }
        
        // 🔧 FIX: Merge session data to get updated rest time, sets, reps, weight
        // This ensures timer sync and card display use user-edited values
        if (exerciseName && this.sessionService) {
            // Check for active session data first
            if (this.sessionService.isSessionActive()) {
                const sessionData = this.sessionService.getExerciseWeight(exerciseName);
                if (sessionData) {
                    console.log(`🔄 Merging session data for ${exerciseName}:`, sessionData);
                    exerciseGroup = {
                        ...exerciseGroup,
                        rest: sessionData.rest || exerciseGroup.rest,
                        sets: sessionData.target_sets || exerciseGroup.sets,
                        reps: sessionData.target_reps || exerciseGroup.reps,
                        default_weight: sessionData.weight || exerciseGroup.default_weight,
                        default_weight_unit: sessionData.weight_unit || exerciseGroup.default_weight_unit
                    };
                }
            } else {
                // Check for pre-session edits (before workout started)
                const preSessionEdit = this.sessionService.getPreSessionEdits(exerciseName);
                if (preSessionEdit) {
                    console.log(`🔄 Merging pre-session edit for ${exerciseName}:`, preSessionEdit);
                    exerciseGroup = {
                        ...exerciseGroup,
                        rest: preSessionEdit.rest || exerciseGroup.rest,
                        sets: preSessionEdit.target_sets || exerciseGroup.sets,
                        reps: preSessionEdit.target_reps || exerciseGroup.reps,
                        default_weight: preSessionEdit.weight || exerciseGroup.default_weight,
                        default_weight_unit: preSessionEdit.weight_unit || exerciseGroup.default_weight_unit
                    };
                }
            }
        }
        
        return exerciseGroup;
    }
    
    /**
     * Get currently expanded card
     * @returns {HTMLElement|null} Expanded card element or null
     */
    getCurrentlyExpanded() {
        return document.querySelector('.workout-card.expanded');
    }
    
    /**
     * Get currently expanded exercise index
     * @returns {number|null} Exercise index or null
     */
    getCurrentlyExpandedIndex() {
        const expanded = this.getCurrentlyExpanded();
        if (!expanded) return null;
        
        return parseInt(expanded.getAttribute('data-exercise-index'));
    }
    
    // ==================== Timer Integration ====================
    
    /**
     * Sync global timer with expanded card
     * @param {number} exerciseIndex - Exercise index
     */
    syncTimerWithCard(exerciseIndex) {
        if (!this.timerManager || !this.workout) return;
        
        const exerciseGroup = this.getExerciseGroup(exerciseIndex);
        
        if (exerciseGroup) {
            const restSeconds = WorkoutUtils.parseRestTime(exerciseGroup.rest || '60s');
            this.timerManager.syncWithExpandedCard(exerciseIndex, restSeconds);
            console.log(`🔄 Timer synced with exercise ${exerciseIndex}: ${restSeconds}s`);
        }
    }
    
    // ==================== Event Callbacks ====================
    
    /**
     * Register callback for card expanded event
     * @param {Function} callback - Callback function(index, card)
     */
    onCardExpanded(callback) {
        this.cardExpandedCallback = callback;
    }
    
    /**
     * Register callback for card collapsed event
     * @param {Function} callback - Callback function(index, card)
     */
    onCardCollapsed(callback) {
        this.cardCollapsedCallback = callback;
    }
    
    /**
     * Register callback for last exercise complete
     * @param {Function} callback - Callback function
     */
    onLastExerciseComplete(callback) {
        this.lastExerciseCompleteCallback = callback;
    }
    
    // ==================== Update Workout ====================
    
    /**
     * Update workout reference (useful when workout changes)
     * @param {Object} workout - New workout data
     */
    updateWorkout(workout) {
        this.workout = workout;
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExerciseCardManager;
}

console.log('📦 Exercise Card Manager loaded');
