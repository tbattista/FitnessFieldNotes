/**
 * Ghost Gym - Workout Exercise Operations Manager
 * Manages exercise operations: skip, edit, complete, replace
 * @version 1.0.0
 * @date 2026-01-05
 * Phase 7: Exercise Operations Management
 */

class WorkoutExerciseOperationsManager {
    constructor(options) {
        // Required services
        this.sessionService = options.sessionService;
        this.dataManager = options.dataManager;
        this.authService = options.authService;
        
        // Callbacks for controller coordination
        this.onRenderWorkout = options.onRenderWorkout || (() => {});
        this.onAutoSave = options.onAutoSave || (() => {});
        this.onGoToNext = options.onGoToNext || (() => {});
        this.onGetCurrentExerciseData = options.onGetCurrentExerciseData || (() => ({}));
        this.onGetAllExerciseNames = options.onGetAllExerciseNames || (() => []);
        this.onGetCurrentWorkout = options.onGetCurrentWorkout || (() => null);
        this.onUpdateExerciseInTemplate = options.onUpdateExerciseInTemplate || (async () => false);
        
        console.log('🏋️ Workout Exercise Operations Manager initialized');
    }
    
    /**
     * Handle skipping an exercise
     * Works BEFORE and DURING workout session
     * @param {string} exerciseName - Exercise name
     * @param {number} index - Exercise index
     */
    handleSkipExercise(exerciseName, index) {
        const isSessionActive = this.sessionService.isSessionActive();
        
        if (!isSessionActive) {
            // PRE-SESSION: Skip without reason prompt (simpler UX)
            this.sessionService.skipPreSessionExercise(exerciseName, 'Skipped before workout');
            this.onRenderWorkout();
            
            if (window.showAlert) {
                window.showAlert(`${exerciseName} will be skipped when you start the workout`, 'warning');
            }
            return;
        }
        
        // ACTIVE SESSION: Show skip reason offcanvas
        window.UnifiedOffcanvasFactory.createSkipExercise(
            { exerciseName },
            async (reason) => {
                // Mark as skipped in session
                this.sessionService.skipExercise(exerciseName, reason);
                
                // Update UI - re-render to show skipped state
                this.onRenderWorkout();
                
                // Auto-advance to next exercise
                setTimeout(() => {
                    this.onGoToNext(index);
                }, 300);
                
                // Show success message
                if (window.showAlert) {
                    const message = reason
                        ? `${exerciseName} skipped: ${reason}`
                        : `${exerciseName} skipped`;
                    window.showAlert(message, 'warning');
                }
                
                // Auto-save session
                try {
                    await this.onAutoSave();
                } catch (error) {
                    console.error('❌ Failed to auto-save after skip:', error);
                }
            }
        );
    }
    
    /**
     * Handle unskipping an exercise
     * Works BEFORE and DURING workout session
     * @param {string} exerciseName - Exercise name
     * @param {number} index - Exercise index
     */
    handleUnskipExercise(exerciseName, index) {
        const isSessionActive = this.sessionService.isSessionActive();
        
        if (!isSessionActive) {
            // PRE-SESSION: Unskip without confirmation
            this.sessionService.unskipPreSessionExercise(exerciseName);
            this.onRenderWorkout();
            
            if (window.showAlert) {
                window.showAlert(`${exerciseName} restored`, 'success');
            }
            return;
        }
        
        // ACTIVE SESSION: Show confirmation modal
        const modalManager = this.getModalManager();
        modalManager.confirm(
            'Unskip Exercise',
            `Resume <strong>${WorkoutUtils.escapeHtml(exerciseName)}</strong>?`,
            async () => {
                // Mark as not skipped in session
                this.sessionService.unskipExercise(exerciseName);
                
                // Update UI - re-render to remove skipped state
                this.onRenderWorkout();
                
                // Show success message
                if (window.showAlert) {
                    window.showAlert(`${exerciseName} resumed`, 'success');
                }
                
                // Auto-save session
                try {
                    await this.onAutoSave();
                } catch (error) {
                    console.error('❌ Failed to auto-save after unskip:', error);
                }
            }
        );
    }
    
    /**
     * Skip current exercise (called from action bar)
     * Skips the currently expanded exercise card
     */
    skipExercise() {
        if (!this.sessionService.isSessionActive()) {
            console.warn('⚠️ Cannot skip exercise - no active session');
            if (window.showAlert) {
                window.showAlert('Please start your workout session first', 'warning');
            }
            return;
        }
        
        // Find currently expanded card
        const expandedCard = document.querySelector('.exercise-card.expanded');
        
        if (!expandedCard) {
            console.warn('⚠️ No exercise card is expanded');
            if (window.showAlert) {
                window.showAlert('Please expand an exercise to skip it', 'warning');
            }
            return;
        }
        
        const exerciseIndex = parseInt(expandedCard.getAttribute('data-exercise-index'));
        const exerciseName = expandedCard.getAttribute('data-exercise-name');
        
        console.log(`⏭️ Skip button clicked for: ${exerciseName} (index: ${exerciseIndex})`);
        
        // Call existing skip handler
        this.handleSkipExercise(exerciseName, exerciseIndex);
    }
    
    /**
     * Handle replacing an exercise (skip + add new)
     * Works BEFORE and DURING workout session
     * This chains skip and add exercise functionality for a seamless replacement flow
     * @param {string} exerciseName - Exercise name to replace
     * @param {number} index - Exercise index
     */
    async handleReplaceExercise(exerciseName, index) {
        const isSessionActive = this.sessionService.isSessionActive();
        
        console.log(`🔄 Replace button clicked for: ${exerciseName} (index: ${index})`);
        
        if (!isSessionActive) {
            // PRE-SESSION: Skip the exercise + open Add Exercise form at this position
            this.sessionService.skipPreSessionExercise(exerciseName, 'Replaced with alternative exercise');
            this.onRenderWorkout();
            
            if (window.showAlert) {
                window.showAlert(`${exerciseName} will be replaced`, 'info');
            }
            
            // Open Add Exercise form for replacement at the replaced exercise's position
            setTimeout(() => {
                this.showAddExerciseForm(index);
            }, 300);
            return;
        }
        
        // ACTIVE SESSION: Skip + add new exercise
        // Step 1: Skip the current exercise with "Replaced" reason
        this.sessionService.skipExercise(exerciseName, 'Replaced with alternative exercise');
        
        // Step 2: Update UI to show skipped state
        this.onRenderWorkout();
        
        // Step 3: Show success message for skip
        if (window.showAlert) {
            window.showAlert(`${exerciseName} marked as skipped`, 'info');
        }
        
        // Step 4: Auto-save the skip
        try {
            await this.onAutoSave();
        } catch (error) {
            console.error('❌ Failed to auto-save after skip:', error);
        }
        
        // Step 5: Open Add Exercise form for replacement at the replaced exercise's position
        setTimeout(() => {
            this.showAddExerciseForm(index);
        }, 300);
        
        // Step 6: Auto-advance to next exercise after adding (handled by showAddExerciseForm callback)
        setTimeout(() => {
            this.onGoToNext(index);
        }, 600);
    }
    
    /**
     * Handle editing an exercise's details (sets, reps, rest, weight)
     * Works BEFORE and DURING workout session
     * @param {string} exerciseName - Exercise name
     * @param {number} index - Exercise index
     */
    handleEditExercise(exerciseName, index) {
        // Block editing if exercise is completed during active session
        if (this.sessionService.isSessionActive()) {
            const exerciseData = this.sessionService.getExerciseWeight(exerciseName);
            if (exerciseData?.is_completed) {
                console.log('🔒 Edit blocked - exercise is completed:', exerciseName);
                if (window.showAlert) {
                    window.showAlert('Uncomplete this exercise first to make changes', 'warning');
                }
                return;
            }
        }

        // Get current exercise data from appropriate source
        const currentData = this.onGetCurrentExerciseData(exerciseName, index);
        
        console.log('✏️ Opening exercise editor for:', exerciseName, currentData);
        
        const isSessionActive = this.sessionService.isSessionActive();
        
        // Show edit offcanvas
        window.UnifiedOffcanvasFactory.createExerciseDetailsEditor(
            currentData,
            async (updatedData) => {
                console.log('💾 Saving updated exercise details:', updatedData);
                console.log('🔄 Update template flag:', updatedData.updateTemplate);
                
                if (isSessionActive) {
                    // ACTIVE SESSION: Save to session (existing behavior)
                    this.sessionService.updateExerciseDetails(exerciseName, updatedData);
                    
                    // Auto-save to server
                    try {
                        await this.onAutoSave();
                        
                        // If updateTemplate flag is set, also update the workout template
                        if (updatedData.updateTemplate) {
                            console.log('📝 Updating workout template for exercise:', exerciseName);
                            const templateUpdated = await this.onUpdateExerciseInTemplate(exerciseName, updatedData);
                            
                            if (templateUpdated) {
                                if (window.showAlert) {
                                    window.showAlert(`${exerciseName} updated & template saved`, 'success');
                                }
                            } else {
                                if (window.showAlert) {
                                    window.showAlert(`${exerciseName} updated (template update failed)`, 'warning');
                                }
                            }
                        } else {
                            if (window.showAlert) {
                                window.showAlert(`${exerciseName} updated`, 'success');
                            }
                        }
                    } catch (error) {
                        console.error('❌ Failed to save exercise updates:', error);
                        if (window.showAlert) {
                            window.showAlert('Failed to save changes. Please try again.', 'danger');
                        }
                    }
                } else {
                    // PRE-SESSION: Save to pre-session edits
                    this.sessionService.updatePreSessionExercise(exerciseName, updatedData);
                    
                    // If updateTemplate flag is set, also update the workout template
                    if (updatedData.updateTemplate) {
                        console.log('📝 Updating workout template for exercise (pre-session):', exerciseName);
                        try {
                            const templateUpdated = await this.onUpdateExerciseInTemplate(exerciseName, updatedData);
                            
                            if (templateUpdated) {
                                if (window.showAlert) {
                                    window.showAlert(`${exerciseName} updated & template saved for future workouts`, 'success');
                                }
                            } else {
                                if (window.showAlert) {
                                    window.showAlert(`${exerciseName} updated - changes will apply when you start the workout`, 'success');
                                }
                            }
                        } catch (error) {
                            console.error('❌ Failed to update template:', error);
                            if (window.showAlert) {
                                window.showAlert(`${exerciseName} updated - changes will apply when you start the workout`, 'success');
                            }
                        }
                    } else {
                        if (window.showAlert) {
                            window.showAlert(`${exerciseName} updated - changes will apply when you start the workout`, 'success');
                        }
                    }
                }
                
                // Re-render to show updated values
                this.onRenderWorkout();
            }
        );
    }
    
    /**
     * Handle completing an exercise
     * @param {string} exerciseName - Exercise name
     * @param {number} index - Exercise index
     */
    handleCompleteExercise(exerciseName, index) {
        if (!this.sessionService.isSessionActive()) {
            console.warn('⚠️ Cannot complete exercise - no active session');
            return;
        }

        // Save any pending unified edit changes before completing
        const exerciseCard = document.querySelector(`.workout-card[data-exercise-name="${exerciseName}"]`);
        if (exerciseCard?.unifiedEditController?.isActive()) {
            console.log('💾 Saving pending edit changes before completing exercise');
            exerciseCard.unifiedEditController.saveUnifiedChanges();
        }

        // Clear auto-complete timer since user manually completed
        this.sessionService.clearAutoCompleteTimer(exerciseName);
        
        // Mark as completed
        this.sessionService.completeExercise(exerciseName);
        
        // Re-render to show completed state
        this.onRenderWorkout();
        
        // Show success message
        if (window.showAlert) {
            window.showAlert(`${exerciseName} completed! 💪`, 'success');
        }
        
        // Auto-save session
        this.onAutoSave().catch(error => {
            console.error('❌ Failed to auto-save after completion:', error);
        });
        
        // Auto-advance to next exercise after short delay
        setTimeout(() => {
            this.onGoToNext(index);
        }, 500);
    }
    
    /**
     * Handle uncompleting an exercise
     * @param {string} exerciseName - Exercise name
     * @param {number} index - Exercise index
     */
    handleUncompleteExercise(exerciseName, index) {
        if (!this.sessionService.isSessionActive()) {
            console.warn('⚠️ Cannot uncomplete exercise - no active session');
            return;
        }
        
        const modalManager = this.getModalManager();
        modalManager.confirm(
            'Uncomplete Exercise',
            `Mark <strong>${WorkoutUtils.escapeHtml(exerciseName)}</strong> as not completed?`,
            async () => {
                // Mark as not completed
                this.sessionService.uncompleteExercise(exerciseName);
                
                // Re-render to remove completed state
                this.onRenderWorkout();
                
                // Show message
                if (window.showAlert) {
                    window.showAlert(`${exerciseName} marked as not completed`, 'info');
                }
                
                // Auto-save session
                try {
                    await this.onAutoSave();
                } catch (error) {
                    console.error('❌ Failed to auto-save after uncomplete:', error);
                }
            }
        );
    }
    
    /**
     * Show add exercise form (two-offcanvas approach)
     * Opens the Add Exercise form with search button integration
     * @param {number|null} insertAtIndex - Optional index to insert exercise at (for replace functionality)
     */
    async showAddExerciseForm(insertAtIndex = null) {
        try {
            window.UnifiedOffcanvasFactory.createExerciseGroupEditor(
                {
                    mode: 'single',
                    title: insertAtIndex !== null ? 'Replace Exercise' : 'Add Exercise',
                    exercises: { a: '', b: '', c: '' },
                    sets: '3',
                    reps: '12',
                    rest: '60s',
                    weight: '',
                    weightUnit: 'lbs',
                    isNew: true
                },
                // onSave callback
                async (groupData) => {
                    const newExerciseName = groupData.exercises.a;
                    const isSessionActive = this.sessionService.isSessionActive();

                    // Add exercise as a new group to the workout template
                    this._addExerciseGroupToWorkout({
                        name: newExerciseName,
                        sets: groupData.sets || '3',
                        reps: groupData.reps || '12',
                        rest: groupData.rest || '60s',
                        weight: groupData.default_weight || '',
                        weight_unit: groupData.default_weight_unit || 'lbs'
                    }, insertAtIndex);

                    // For pre-workout mode with insertAtIndex, update the exercise order
                    if (!isSessionActive && insertAtIndex !== null) {
                        this._updatePreSessionOrderForReplace(newExerciseName, insertAtIndex);
                    }

                    this.onRenderWorkout();

                    // Scroll to newly added exercise after render
                    setTimeout(() => {
                        const newCard = document.querySelector(`[data-exercise-name="${newExerciseName}"]`);
                        if (newCard) {
                            // Expand the new card
                            newCard.classList.add('expanded');
                            const body = newCard.querySelector('.workout-card-body, .exercise-card-body');
                            if (body) body.style.display = 'block';
                            // Scroll to center
                            newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 150);

                    const message = !isSessionActive
                        ? `${newExerciseName} added! It will be included when you start the workout. 💪`
                        : `${newExerciseName} added to your workout! 💪`;
                    if (window.showAlert) window.showAlert(message, 'success');
                },
                // onDelete callback (not used in single mode)
                async () => {
                    console.warn('⚠️ Delete not applicable in single mode');
                },
                // onSearchClick callback
                (slotKey, populateCallback) => {
                    // Open Exercise Search offcanvas
                    this.showExerciseSearchOffcanvas(populateCallback);
                }
            );
        } catch (error) {
            console.error('❌ Error showing add exercise form:', error);
            const modalManager = this.getModalManager();
            modalManager.alert('Error', 'Failed to load add exercise form. Please try again.', 'danger');
        }
    }
    
    /**
     * Show add activity form (cardio editor offcanvas)
     * Opens the cardio editor to add an activity card inline to the workout
     */
    async showAddActivityForm() {
        try {
            if (!window.UnifiedOffcanvasFactory?.createCardioEditor) {
                console.error('❌ Cardio editor not available');
                return;
            }

            const groupId = `added-${Date.now()}`;

            window.UnifiedOffcanvasFactory.createCardioEditor({
                groupId,
                cardioConfig: {},
                onSave: (updatedCardioConfig) => {
                    this._addActivityGroupToWorkout(updatedCardioConfig);
                    this.onRenderWorkout();

                    const Registry = window.ActivityTypeRegistry;
                    const typeName = Registry?.getById(updatedCardioConfig.activity_type)?.name || 'Activity';
                    const isSessionActive = this.sessionService.isSessionActive();
                    const message = !isSessionActive
                        ? `${typeName} added! It will be included when you start the workout. 💪`
                        : `${typeName} added to your workout! 💪`;
                    if (window.showAlert) window.showAlert(message, 'success');
                }
            });
        } catch (error) {
            console.error('❌ Error showing add activity form:', error);
            const modalManager = this.getModalManager();
            modalManager.alert('Error', 'Failed to load activity form. Please try again.', 'danger');
        }
    }

    /**
     * Add a new activity (cardio) group to the workout template
     * @param {Object} cardioConfig - Cardio config from the editor
     * @private
     */
    _addActivityGroupToWorkout(cardioConfig) {
        const workout = this.onGetCurrentWorkout();
        if (!workout) {
            console.error('❌ Cannot add activity: no current workout');
            return;
        }

        if (!workout.exercise_groups) {
            workout.exercise_groups = [];
        }

        const newGroup = {
            group_id: `added-${Date.now()}`,
            group_type: 'cardio',
            cardio_config: cardioConfig,
            exercises: { a: cardioConfig.activity_type || 'Activity' }
        };

        workout.exercise_groups.push(newGroup);
        console.log(`✅ Added activity "${cardioConfig.activity_type}" to workout`);
    }

    /**
     * Add a new exercise group to the workout template
     * @param {Object} exerciseData - Exercise data (name, sets, reps, rest, weight, weight_unit)
     * @param {number|null} insertAtIndex - Optional index to insert at (null = append)
     * @private
     */
    _addExerciseGroupToWorkout(exerciseData, insertAtIndex = null) {
        const workout = this.onGetCurrentWorkout();
        if (!workout) {
            console.error('❌ Cannot add exercise: no current workout');
            return;
        }

        if (!workout.exercise_groups) {
            workout.exercise_groups = [];
        }

        const newGroup = {
            group_id: `added-${Date.now()}`,
            exercises: { a: exerciseData.name },
            sets: exerciseData.sets,
            reps: exerciseData.reps,
            rest: exerciseData.rest,
            default_weight: exerciseData.weight,
            default_weight_unit: exerciseData.weight_unit
        };

        if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex < workout.exercise_groups.length) {
            workout.exercise_groups.splice(insertAtIndex, 0, newGroup);
        } else {
            workout.exercise_groups.push(newGroup);
        }

        console.log(`✅ Added exercise "${exerciseData.name}" to workout (index: ${insertAtIndex ?? 'end'})`);
    }

    /**
     * Update pre-session exercise order for replacement
     * Builds the complete exercise list and inserts the new exercise at the correct position
     * @param {string} newExerciseName - Name of the new exercise to insert
     * @param {number} insertAtIndex - Index where to insert the exercise
     * @private
     */
    _updatePreSessionOrderForReplace(newExerciseName, insertAtIndex) {
        console.log(`📋 Updating pre-session order: inserting ${newExerciseName} at index ${insertAtIndex}`);
        
        // Get all current exercise names from the controller
        const allExerciseNames = this.onGetAllExerciseNames();
        
        if (allExerciseNames.length === 0) {
            console.warn('⚠️ Could not get exercise names for order update');
            return;
        }
        
        // Build new order with the replacement at the correct position
        const newOrder = [...allExerciseNames];
        
        // Remove the new exercise if it's already in the list (it was just added)
        const existingIndex = newOrder.indexOf(newExerciseName);
        if (existingIndex !== -1) {
            newOrder.splice(existingIndex, 1);
        }
        
        // Insert at the correct position
        const validIndex = Math.min(Math.max(0, insertAtIndex), newOrder.length);
        newOrder.splice(validIndex, 0, newExerciseName);
        
        console.log(`✅ New exercise order:`, newOrder);
        
        // Update the pre-session order
        this.sessionService.setExerciseOrder(newOrder);
    }
    
    /**
     * Show exercise search offcanvas
     * Opens the standalone exercise search interface
     * @param {Function} populateCallback - Callback to populate the Add Exercise form with selected exercise
     */
    showExerciseSearchOffcanvas(populateCallback) {
        try {
            window.UnifiedOffcanvasFactory.createExerciseSearchOffcanvas(
                {
                    title: 'Search Exercise Library',
                    showFilters: true,
                    buttonText: 'Select',
                    buttonIcon: 'bx-check'
                },
                (selectedExercise) => {
                    // Exercise selected from search
                    // Populate the Add Exercise form via callback
                    populateCallback(selectedExercise);
                    
                    console.log('✅ Exercise selected:', selectedExercise.name);
                }
            );
        } catch (error) {
            console.error('❌ Error showing exercise search:', error);
            const modalManager = this.getModalManager();
            modalManager.alert('Error', 'Failed to load exercise search. Please try again.', 'danger');
        }
    }
    
    /**
     * Get modal manager (lazy load to ensure it's available)
     * @returns {Object} Modal manager or fallback
     */
    getModalManager() {
        if (!window.ffnModalManager) {
            console.warn('⚠️ Modal manager not available');
        }
        return window.ffnModalManager;
    }
    
    /**
     * Strip HTML tags from string
     * @param {string} html - HTML string
     * @returns {string} Plain text
     */
    stripHtml(html) {
        return WorkoutUtils.stripHtml(html);
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutExerciseOperationsManager;
}

console.log('📦 Workout Exercise Operations Manager loaded');
