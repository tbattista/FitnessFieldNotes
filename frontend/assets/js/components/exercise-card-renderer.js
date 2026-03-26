/**
 * Ghost Gym - Exercise Card Renderer
 * Handles rendering of exercise cards in workout mode
 * @version 1.1.0 - Unified Editor V2 with shared save/cancel buttons
 * @date 2026-01-14
 */

class ExerciseCardRenderer {
    /**
     * @param {Object} sessionService - Workout session service instance
     */
    constructor(sessionService) {
        this.sessionService = sessionService;
    }

    /**
     * Render an exercise card
     * @param {Object} group - Exercise group data
     * @param {number} index - Card index
     * @param {number} totalCards - Total number of cards (to determine if this is the last one)
     * @returns {string} HTML string for the card
     */
    renderCard(group, index, totalCards = 0) {
        const exercises = group.exercises || {};
        const mainExercise = exercises.a || 'Unknown Exercise';
        const alternates = this._getAlternates(exercises);
        
        // Check data in priority order: Session > Pre-Session Edits > Template
        const isSessionActive = this.sessionService.isSessionActive();
        const exerciseData = this.sessionService.getExerciseWeight(mainExercise);
        const preSessionEdit = !isSessionActive ? this.sessionService.getPreSessionEdits(mainExercise) : null;
        
        // Priority: Active Session > Pre-Session Edit > Template
        const sets = exerciseData?.target_sets || preSessionEdit?.target_sets || group.sets || '3';
        const reps = exerciseData?.target_reps || preSessionEdit?.target_reps || group.reps || '8-12';
        const rest = exerciseData?.rest || preSessionEdit?.rest || group.rest || '60s';
        const notes = exerciseData?.notes || group.notes || '';
        
        const restSeconds = this._parseRestTime(rest);
        
        // Get exercise history
        const history = this.sessionService.getExerciseHistory(mainExercise);
        const lastWeight = history?.last_weight || '';
        const lastWeightUnit = history?.last_weight_unit || 'lbs';
        const lastSessionDate = history?.last_session_date || null;
        const recentSessions = history?.recent_sessions || [];
        
        // Get last weight direction from history
        const lastDirection = this.sessionService.getLastWeightDirection(mainExercise);
        const currentDirection = this.sessionService.getWeightDirection(mainExercise);
        
        // Get weight data with proper fallback chain
        const weightData = this.sessionService.getExerciseWeight(mainExercise);
        const templateWeight = group.default_weight || '';
        const templateUnit = group.default_weight_unit || 'lbs';
        
        // Check if exercise is skipped (active session OR pre-session)
        const preSessionSkipped = !isSessionActive && this.sessionService.isPreSessionSkipped(mainExercise);
        const isSkipped = weightData?.is_skipped || preSessionSkipped;
        const skipReason = weightData?.skip_reason || (preSessionSkipped ? 'Skipped before workout' : '');
        
        // Check if exercise is completed
        const isCompleted = weightData?.is_completed || false;
        
        // Determine current weight with proper fallback
        const currentWeight = weightData?.weight || templateWeight || lastWeight || '';
        const currentUnit = weightData?.weight_unit ||
                          (weightData?.weight ? templateUnit : (templateWeight ? templateUnit : lastWeightUnit));
        
        // State classes for card
        const stateClasses = [];
        if (isCompleted) stateClasses.push('logged');
        if (isSkipped) stateClasses.push('skipped');
        
        return `
            <div class="workout-card ${stateClasses.join(' ')}"
                 data-exercise-index="${index}"
                 data-exercise-name="${this._escapeHtml(mainExercise)}"
                 onclick="if(!event.target.closest('.workout-more-btn, .workout-edit-btn, .workout-menu')) { if(window.workoutModeController?.cardManager) { window.workoutModeController.cardManager.toggle(${index}); } else { this.classList.toggle('expanded'); if(this.classList.contains('expanded')) setTimeout(() => this.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); } }">
                <!-- Collapsed Header -->
                <div class="workout-card-header">
                    <!-- Row 1: Exercise Name (full width, no wrap) -->
                    <div class="workout-exercise-name-row">
                        <div class="workout-exercise-name">
                            ${notes ? '<i class="bx bx-note exercise-note-indicator" title="Has notes"></i>' : ''}
                            ${this._escapeHtml(mainExercise)}
                        </div>
                        <div class="workout-header-actions">
                            <button class="workout-edit-btn${isCompleted ? ' edit-locked' : ''}" onclick="window.workoutModeController?.handleEditExercise?.('${this._escapeHtml(mainExercise)}', ${index}); event.stopPropagation();" aria-label="${isCompleted ? 'Editing locked - uncomplete to edit' : 'Modify exercise'}" title="${isCompleted ? 'Uncomplete to edit' : 'Modify exercise'}">
                                <i class="bx ${isCompleted ? 'bx-lock-alt' : 'bx-edit-alt'}"></i>
                            </button>
                            <button class="workout-more-btn" onclick="window.workoutModeController?.toggleExerciseMenu?.(this, '${this._escapeHtml(mainExercise)}', ${index}); event.stopPropagation();" title="More options">
                                <i class="bx bx-dots-vertical"></i>
                            </button>
                            <i class="bx bx-chevron-down workout-chevron"></i>
                            ${this._renderMoreMenu(mainExercise, index, isSkipped, isCompleted, totalCards)}
                        </div>
                    </div>
                    <!-- Row 2: Meta info (sets/reps/rest, weight, direction) -->
                    <div class="workout-exercise-info">
                        <div class="workout-exercise-meta">${sets} × ${reps} • ${rest}</div>
                        <div class="workout-state-row">
                            ${currentWeight ? `<div class="workout-state-item highlight">Today: ${currentWeight} ${currentUnit}</div>` : ''}
                            ${lastWeight ? `<div class="workout-state-item"><span class="tree-branch">└─</span> Last: ${lastWeight} ${lastWeightUnit}</div>` : ''}
                            ${currentDirection === 'up' ? '<span class="workout-state-item next-up"><i class="bx bx-up-arrow-alt"></i> Increase</span>' : ''}
                            ${currentDirection === 'down' ? '<span class="workout-state-item next-down"><i class="bx bx-down-arrow-alt"></i> Decrease</span>' : ''}
                            ${currentDirection === 'same' ? '<span class="workout-state-item"><i class="bx bx-minus"></i> No Change</span>' : ''}
                        </div>
                        ${notes ? `<div class="workout-note-preview">${this._escapeHtml(notes)}</div>` : ''}
                    </div>
                </div>
                
                <!-- Expanded Body -->
                <div class="workout-card-body" onclick="event.stopPropagation()">
                    ${isSkipped ? `
                        <div class="alert alert-warning">
                            <i class="bx bx-info-circle me-2"></i>
                            <strong>Exercise Skipped</strong>
                            ${skipReason ? `<p class="mb-0 mt-1 small">${this._escapeHtml(skipReason)}</p>` : ''}
                        </div>
                    ` : ''}
                    
                    ${lastDirection && !isSkipped ? `
                        <div class="alert alert-${lastDirection === 'up' ? 'success' : 'warning'} d-flex align-items-center mb-3">
                            <i class="bx bx-chevron-${lastDirection} me-2" style="font-size: 1.5rem;"></i>
                            <div>
                                <strong>From last session:</strong> ${lastDirection === 'up' ? 'Increase' : 'Decrease'} weight
                            </div>
                        </div>
                    ` : ''}
                    
                    ${!isSkipped ? `
                        <!-- Weight Section -->
                        <div class="workout-section">
                            <div class="workout-section-label"><i class="bx bx-dumbbell"></i>Weight</div>
                            ${this._renderWeightField(currentWeight, currentUnit, mainExercise)}
                            ${this._renderPlateBreakdown(currentWeight, currentUnit)}
                        </div>

                        <!-- Protocol Section (formerly Sets × Reps) -->
                        <div class="workout-section">
                            <div class="workout-section-label"><i class="bx bx-list-ul"></i>Protocol</div>
                            ${this._renderRepsSetsField(sets, reps, mainExercise)}
                        </div>

                        <!-- Unified Save/Cancel Buttons (below both fields, outside sections) -->
                        <div class="workout-unified-actions" onclick="event.stopPropagation();">
                            <button class="btn btn-sm btn-success unified-save-btn" type="button" aria-label="Save changes" title="Save">
                                <i class="bx bx-check"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary unified-cancel-btn" type="button" aria-label="Cancel changes" title="Cancel">
                                <i class="bx bx-x"></i>
                            </button>
                        </div>

                        <!-- Notes Section -->
                        <div class="workout-section workout-notes-timer-section workout-unified-notes">
                            <!-- Notes Content (Full Width - Above Button) -->
                            <div class="workout-notes-content" style="display: none;">
                                <textarea class="workout-notes-input"
                                          placeholder="Add a note about this exercise..."
                                          rows="3"
                                          data-exercise-name="${this._escapeHtml(mainExercise)}"
                                          onclick="event.stopPropagation();">${notes || ''}</textarea>
                            </div>
                            <!-- Notes Button Row -->
                            <div class="workout-notes-timer-row">
                                <div class="workout-notes-col w-100">
                                    ${this._renderNoteButton(mainExercise, notes)}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Weight History -->
                        ${lastWeight ? `
                            <div class="workout-section">
                                <div class="workout-section-label"><i class="bx bx-history"></i>Weight History</div>
                                ${this._renderWeightHistory(mainExercise, lastWeight, lastWeightUnit, lastSessionDate, recentSessions)}
                            </div>
                        ` : ''}

                        <!-- Direction Chips (During Active Session) -->
                        ${isSessionActive ? `
                            <div class="workout-section workout-next-section">
                                <div class="workout-section-label workout-next-label">NEXT SESSION (OPTIONAL)</div>
                                ${this._renderDirectionChips(mainExercise, currentDirection)}
                            </div>
                        ` : ''}
                        
                        <!-- Primary Action (only during active session) -->
                        ${isSessionActive ? `
                            <div class="workout-actions">
                                ${isCompleted ? `
                                    <button class="workout-primary-action completed"
                                            onclick="window.workoutModeController?.handleUncompleteExercise?.('${this._escapeHtml(mainExercise)}', ${index}); event.stopPropagation();">
                                        <i class="bx bx-check"></i> Completed
                                    </button>
                                ` : `
                                    <button class="workout-primary-action save"
                                            onclick="window.workoutModeController?.handleCompleteExercise?.('${this._escapeHtml(mainExercise)}', ${index}); event.stopPropagation();">
                                        Mark Done
                                    </button>
                                `}
                            </div>
                        ` : ''}
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render weight badge with visual progression feedback (Phase 4)
     * Redesigned: Badge shows only weight value, status indicator appears separately to the right
     * @private
     */
    _renderWeightBadge(currentWeight, currentUnit, weightSource, lastWeight, lastWeightUnit, lastDirection, currentDirection, isSessionActive) {
        // No current weight - show placeholder
        if (!currentWeight) {
            if (lastWeight) {
                const unitDisplay = lastWeightUnit !== 'other' ? ` ${lastWeightUnit}` : '';
                return `<span class="badge bg-label-secondary" title="Last used weight - click Edit Weight to use">Last: ${lastWeight}${unitDisplay}</span>`;
            }
            return `<span class="badge bg-label-secondary" title="No weight set - click Edit Weight to add">No weight</span>`;
        }
        
        // PHASE 4: Determine progression state for separate status indicator
        let progressionClass = '';
        let statusIcon = '';
        let statusLabel = '';
        let tooltipText = '';
        const unitDisplay = currentUnit !== 'other' ? ` ${currentUnit}` : '';
        
        // Determine which direction to display
        // Priority: Active session current direction > Last session reminder
        const displayDirection = isSessionActive ? currentDirection : lastDirection;
        
        // Status indicator logic - icon and label appear outside badge
        if (displayDirection) {
            if (isSessionActive) {
                // Current session direction (user just set this)
                if (displayDirection === 'up') {
                    progressionClass = 'direction-up';
                    statusIcon = '✓↑';
                    statusLabel = 'Next: Increase';
                    tooltipText = `Next session: Increase weight`;
                } else if (displayDirection === 'down') {
                    progressionClass = 'direction-down';
                    statusIcon = '✓↓';
                    statusLabel = 'Next: Decrease';
                    tooltipText = `Next session: Decrease weight`;
                } else if (displayDirection === 'same') {
                    progressionClass = 'direction-same';
                    statusIcon = '✓→';
                    statusLabel = 'Next: No change';
                    tooltipText = `Next session: Keep same weight`;
                }
            } else {
                // Last session reminder (what they noted last time)
                if (displayDirection === 'up') {
                    progressionClass = 'direction-reminder direction-up';
                    statusIcon = '📝↑';
                    statusLabel = 'Reminder: Increase';
                    tooltipText = `Last session reminder: Increase weight`;
                } else if (displayDirection === 'down') {
                    progressionClass = 'direction-reminder direction-down';
                    statusIcon = '📝↓';
                    statusLabel = 'Reminder: Decrease';
                    tooltipText = `Last session reminder: Decrease weight`;
                } else if (displayDirection === 'same') {
                    progressionClass = 'direction-reminder direction-same';
                    statusIcon = '📝→';
                    statusLabel = 'Reminder: No change';
                    tooltipText = `Last session reminder: Keep same weight`;
                }
            }
        } else if (!lastWeight) {
            // First time doing this exercise
            progressionClass = 'new';
            statusIcon = '★';
            statusLabel = 'New';
            tooltipText = `First time doing this exercise!`;
        } else {
            const weightDiff = currentWeight - lastWeight;
            if (weightDiff > 0) {
                // Weight increased
                progressionClass = 'increased';
                statusIcon = '↑';
                statusLabel = 'Increased';
                tooltipText = `Increased ${weightDiff.toFixed(1)}${unitDisplay} from last time`;
            } else if (weightDiff < 0) {
                // Weight decreased
                progressionClass = 'decreased';
                statusIcon = '↓';
                statusLabel = 'Decreased';
                tooltipText = `Decreased ${Math.abs(weightDiff).toFixed(1)}${unitDisplay} from last time`;
            } else {
                // Same weight
                progressionClass = 'same';
                statusIcon = '→';
                statusLabel = 'No change';
                tooltipText = `Same as last time`;
            }
        }
        
        // Add modified indicator if user changed from template
        const modifiedClass = weightSource === 'session' ? 'modified' : '';
        
        // Build the HTML: Badge (weight only) + Status indicator (icon + label)
        return `<span class="badge weight-badge ${progressionClass} ${modifiedClass}"
                      data-direction="${displayDirection || 'none'}"
                      data-bs-toggle="tooltip"
                      data-bs-placement="top"
                      title="${currentWeight}${unitDisplay}${modifiedClass ? ' - Modified from template' : ''}">
            ${currentWeight}${unitDisplay}
        </span>
        <span class="weight-status-indicator status-${progressionClass}"
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              title="${tooltipText}">
            <span class="weight-status-icon">${statusIcon}</span>
            <span class="weight-status-label">${statusLabel}</span>
        </span>`;
    }

    /**
     * Get alternate exercises
     * @private
     */
    _getAlternates(exercises) {
        const alternates = [];
        if (exercises.b) alternates.push({ label: 'Alt1', name: exercises.b });
        if (exercises.c) alternates.push({ label: 'Alt2', name: exercises.c });
        return alternates;
    }

    /**
     * Parse rest time string to seconds
     * Handles formats: "60s", "2min", "2m", "1m30s", "90"
     * @private
     */
    _parseRestTime(restStr) {
        if (!restStr) return 60;

        const str = String(restStr).toLowerCase().trim();

        // Try compound format first: "1m30s" or "1min30s"
        const compoundMatch = str.match(/(\d+)\s*m(?:in)?\s*(\d+)\s*s/);
        if (compoundMatch) {
            return parseInt(compoundMatch[1]) * 60 + parseInt(compoundMatch[2]);
        }

        // Minutes only: "2min", "2m"
        const minMatch = str.match(/(\d+)\s*m(?:in)?$/);
        if (minMatch) {
            return parseInt(minMatch[1]) * 60;
        }

        // Seconds only: "60s" or just "60"
        const secMatch = str.match(/(\d+)\s*s?$/);
        if (secMatch) {
            return parseInt(secMatch[1]);
        }

        return 60;
    }

    /**
     * Calculate barbell plate breakdown using plate calculator service
     * @private
     */
    _calculatePlateBreakdown(weightStr, unit) {
        // Use plate calculator service if available
        if (window.plateCalculatorService) {
            return window.plateCalculatorService.calculateBreakdown(weightStr, unit);
        }
        
        // Fallback to basic calculation if service not loaded
        if (unit !== 'lbs') return null;
        
        const totalWeight = parseFloat(weightStr);
        if (isNaN(totalWeight) || totalWeight <= 45) {
            return null;
        }
        
        const barWeight = 45;
        const weightPerSide = (totalWeight - barWeight) / 2;
        
        if (weightPerSide <= 0) {
            return null;
        }
        
        const plates = [45, 35, 25, 10, 5, 2.5];
        const plateCount = {};
        let remaining = weightPerSide;
        
        for (const plate of plates) {
            const count = Math.floor(remaining / plate);
            if (count > 0) {
                plateCount[plate] = count;
                remaining -= count * plate;
            }
        }
        
        const plateParts = [];
        for (const [plate, count] of Object.entries(plateCount)) {
            plateParts.push(`${count}×${plate}lb`);
        }
        
        if (plateParts.length === 0) {
            return null;
        }
        
        return `45lb bar + (${plateParts.join(' + ')}) each side`;
    }

    /**
     * Render weight field with morph pattern HTML (v2.0 - Unit Switching)
     * @private
     */
    _renderWeightField(weight, unit, exerciseName) {
        const displayWeight = weight || '—';
        const displayUnit = unit !== 'other' ? unit : '';

        // Determine current mode (default to 'lbs' if not set)
        const currentUnit = unit || 'lbs';
        const isDIYMode = currentUnit === 'diy';

        return `
            <div class="workout-weight-field" data-weight="${weight || 0}" data-unit="${currentUnit}" data-weight-mode="${isDIYMode ? 'text' : 'numeric'}" data-exercise-name="${this._escapeHtml(exerciseName)}">
                <!-- Display Mode (click to edit) -->
                <div class="weight-display click-to-edit" onclick="event.stopPropagation(); this.closest('.workout-card')?.dispatchEvent(new CustomEvent('enterUnifiedEditMode', { bubbles: false }));">
                    <div class="weight-value-group">
                        <span class="weight-value">${displayWeight}</span>
                        ${(displayUnit && currentUnit !== 'diy') ? `<span class="weight-unit">${displayUnit}</span>` : ''}
                    </div>
                </div>

                <!-- Edit Mode (hidden initially) -->
                <div class="weight-editor ${isDIYMode ? 'diy-active' : ''}" style="display: none;">
                    <!-- Numeric Mode: Full width input -->
                    <div class="weight-input-row numeric-mode">
                        <input type="number" class="weight-input" value="${isDIYMode ? '' : (weight || '')}" step="5" min="0" max="9999" inputmode="decimal" placeholder="0" onclick="event.stopPropagation();" />
                    </div>

                    <!-- DIY Mode: Full width text input -->
                    <div class="weight-input-row diy-mode">
                        <input type="text" class="weight-text-input" value="${isDIYMode ? weight : ''}" placeholder="e.g., body weight + 10lbs" onclick="event.stopPropagation();" />
                    </div>

                    <!-- Unit Selector -->
                    <div class="weight-unit-selector">
                        <button class="unit-btn ${currentUnit === 'lbs' ? 'active' : ''}" data-unit="lbs" type="button" onclick="event.stopPropagation();">lbs</button>
                        <button class="unit-btn ${currentUnit === 'kg' ? 'active' : ''}" data-unit="kg" type="button" onclick="event.stopPropagation();">kg</button>
                        <button class="unit-btn ${currentUnit === 'diy' ? 'active' : ''}" data-unit="diy" type="button" onclick="event.stopPropagation();">DIY</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render reps/sets field with single text input (v3.0.0)
     * Full-width layout, labeled "Protocol"
     * @private
     */
    _renderRepsSetsField(sets, reps, exerciseName) {
        // Check if we have new format (single field) or need to construct from old format
        let displayValue;

        if (sets && reps) {
            // Old format: Combine with separator for display
            displayValue = `${sets}×${reps}`;
        } else {
            // Already combined or default
            displayValue = sets || reps || '3×10';
        }

        return `
            <div class="workout-repssets-field" data-protocol="${displayValue}" data-exercise-name="${this._escapeHtml(exerciseName)}">
                <!-- Display Mode (click to edit) -->
                <div class="repssets-display click-to-edit" onclick="event.stopPropagation(); this.closest('.workout-card')?.dispatchEvent(new CustomEvent('enterUnifiedEditMode', { bubbles: false }));">
                    <span class="repssets-value-text">${displayValue}</span>
                </div>

                <!-- Edit Mode (Full Width) -->
                <div class="repssets-editor" style="display: none;">
                    <input type="text"
                           class="repssets-input repssets-text-input"
                           value="${displayValue}"
                           placeholder="e.g., 3x10, 4 sets to failure, AMRAP"
                           onclick="event.stopPropagation();" />
                </div>
            </div>
        `;
    }
    
    /**
     * Render direction chips (horizontal layout) - Low-priority pill buttons
     * Only one button can be active at a time, no default selection
     * @private
     */
    _renderDirectionChips(exerciseName, currentDirection) {
        return `
            <div class="workout-next-chips">
                <button class="workout-chip ${currentDirection === 'down' ? 'active' : ''}"
                        data-direction="down"
                        onclick="window.workoutModeController?.toggleWeightDirection?.(this, '${this._escapeHtml(exerciseName)}', 'down'); event.stopPropagation();">
                    Decrease
                </button>
                <button class="workout-chip ${!currentDirection || currentDirection === 'same' ? 'active' : ''}"
                        data-direction="same"
                        onclick="window.workoutModeController?.toggleWeightDirection?.(this, '${this._escapeHtml(exerciseName)}', 'same'); event.stopPropagation();">
                    Same
                </button>
                <button class="workout-chip ${currentDirection === 'up' ? 'active' : ''}"
                        data-direction="up"
                        onclick="window.workoutModeController?.toggleWeightDirection?.(this, '${this._escapeHtml(exerciseName)}', 'up'); event.stopPropagation();">
                    Increase
                </button>
            </div>
        `;
    }
    
    /**
     * Format seconds into display string (e.g., 90 → "1m30s", 60 → "1min", 45 → "45s")
     * @private
     */
    _formatRestDisplay(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (secs === 0) {
            return `${mins}min`;
        }
        return `${mins}m${secs}s`;
    }

    /**
     * Render inline rest timer section
     * @private
     */
    _renderInlineRestTimer(restSeconds, index) {
        const restDisplay = this._formatRestDisplay(restSeconds);

        return `
            <div class="inline-rest-timer" data-rest-seconds="${restSeconds}" data-rest-display="${restDisplay}">
                <div class="inline-rest-timer-inner">
                    <div class="inline-timer-display" data-inline-timer-display="${index}">
                        <strong><i class="bx bx-time-five me-1"></i>${restDisplay}</strong>
                    </div>
                    <div class="inline-timer-controls" data-inline-timer="${index}">
                        <!-- Timer controls will be rendered here by InlineRestTimer component -->
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render more menu (⋯ menu)
     * @param {string} exerciseName - Name of the exercise
     * @param {number} index - Card index
     * @param {boolean} isSkipped - Whether exercise is skipped
     * @param {boolean} isCompleted - Whether exercise is completed
     * @param {number} totalCards - Total number of cards (for move up/down boundaries)
     * @private
     */
    _renderMoreMenu(exerciseName, index, isSkipped, isCompleted, totalCards) {
        return `
            <div class="workout-menu" onclick="event.stopPropagation()">
                ${!isSkipped ? `
                    <button class="workout-menu-item" onclick="window.workoutModeController?.handleSkipExercise?.('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();">
                        <i class="bx bx-skip-next"></i>
                        Skip for today
                    </button>
                ` : ''}
                ${isSkipped ? `
                    <button class="workout-menu-item" onclick="window.workoutModeController?.handleUnskipExercise?.('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();" style="color: var(--workout-success);">
                        <i class="bx bx-undo" style="color: var(--workout-success);"></i>
                        Unskip exercise
                    </button>
                ` : ''}
                <button class="workout-menu-item${isCompleted ? ' disabled' : ''}" onclick="window.workoutModeController?.handleEditExercise?.('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"${isCompleted ? ' disabled' : ''}>
                    <i class="bx ${isCompleted ? 'bx-lock-alt' : 'bx-edit-alt'}"></i>
                    ${isCompleted ? 'Modify (uncomplete first)' : 'Modify exercise'}
                </button>
                <button class="workout-menu-item" onclick="window.workoutModeController?.handleReplaceExercise?.('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();">
                    <i class="bx bx-transfer-alt"></i>
                    Replace exercise
                </button>
                <div class="workout-menu-divider"></div>
                <button class="workout-menu-item" onclick="window.workoutWeightManager?.showPlateCalculator?.(); event.stopPropagation();">
                    <i class="bx bx-cog"></i>
                    Plate calculator
                </button>
                <div class="workout-menu-divider"></div>
                <button class="workout-menu-item${index === 0 ? ' disabled' : ''}" onclick="window.workoutModeController?.handleMoveUp?.(${index}); event.stopPropagation();"${index === 0 ? ' disabled' : ''}>
                    <i class="bx bx-chevron-up"></i>
                    Move up
                </button>
                <button class="workout-menu-item${index >= totalCards - 1 ? ' disabled' : ''}" onclick="window.workoutModeController?.handleMoveDown?.(${index}); event.stopPropagation();"${index >= totalCards - 1 ? ' disabled' : ''}>
                    <i class="bx bx-chevron-down"></i>
                    Move down
                </button>
            </div>
        `;
    }

    /**
     * Render card action buttons (Complete/Skip/Modify/Replace)
     * PHASE 1: Modify button now shows BEFORE session starts for pre-session editing
     * PRE-SESSION UPDATE: Now also shows Skip and Replace buttons
     * @private
     */
    _renderCardActionButtons(exerciseName, index, isSkipped, isCompleted, isSessionActive) {
        if (!isSessionActive) {
            // PRE-SESSION: Show Skip/Replace/Modify buttons (or Unskip if skipped)
            if (isSkipped) {
                return `
                    <div class="card-action-buttons mt-3 pt-3 border-top">
                        <button class="btn btn-sm btn-warning w-100 mb-2"
                                onclick="window.workoutModeController.handleUnskipExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Resume this exercise">
                            <i class="bx bx-undo me-1"></i>Unskip
                        </button>
                        <button class="btn btn-sm btn-outline-primary w-100"
                                onclick="window.workoutModeController.handleEditExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Modify exercise details">
                            <i class="bx bx-edit me-1"></i>Modify
                        </button>
                    </div>
                `;
            }
            
            // Normal pre-session: Modify, Replace, Skip
            return `
                <div class="card-action-buttons mt-3 pt-3 border-top">
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary flex-fill"
                                onclick="window.workoutModeController.handleEditExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Modify exercise details">
                            <i class="bx bx-edit me-1"></i>Modify
                        </button>
                        <button class="btn btn-sm btn-outline-info flex-fill"
                                onclick="window.workoutModeController.handleReplaceExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Replace with alternative exercise">
                            <i class="bx bx-refresh me-1"></i>Replace
                        </button>
                        <button class="btn btn-sm btn-outline-warning flex-fill"
                                onclick="window.workoutModeController.handleSkipExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Skip this exercise">
                            <i class="bx bx-skip-next me-1"></i>Skip
                        </button>
                    </div>
                </div>
            `;
        }
        
        // ACTIVE SESSION: Show all action buttons in 2-line layout
        // Line 1: Completed button (full width)
        // Line 2: Modify and Skip buttons (side by side)
        return `
            <div class="card-action-buttons mt-3 pt-3 border-top">
                ${isSkipped ? `
                    <!-- Skipped state: Show Unskip button full width -->
                    <button class="btn btn-sm btn-warning w-100 mb-2"
                            onclick="window.workoutModeController.handleUnskipExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                            title="Resume this exercise">
                        <i class="bx bx-undo me-1"></i>Unskip
                    </button>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary flex-fill"
                                onclick="window.workoutModeController.handleEditExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Modify exercise details">
                            <i class="bx bx-edit me-1"></i>Modify
                        </button>
                    </div>
                ` : `
                    <!-- Line 1: Complete/Completed button (full width) -->
                    ${isCompleted ? `
                        <button class="btn btn-sm btn-success w-100 mb-2"
                                onclick="window.workoutModeController.handleUncompleteExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Mark as not completed">
                            <i class="bx bx-check-circle me-1"></i>Completed
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-outline-success w-100 mb-2"
                                onclick="window.workoutModeController.handleCompleteExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Mark exercise as complete">
                            <i class="bx bx-check me-1"></i>Complete
                        </button>
                    `}
                    <!-- Line 2: Modify, Replace, and Skip buttons (side by side) -->
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary flex-fill"
                                onclick="window.workoutModeController.handleEditExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Modify exercise details">
                            <i class="bx bx-edit me-1"></i>Modify
                        </button>
                        <button class="btn btn-sm btn-outline-info flex-fill"
                                onclick="window.workoutModeController.handleReplaceExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Skip this exercise and add a replacement">
                            <i class="bx bx-refresh me-1"></i>Replace
                        </button>
                        <button class="btn btn-sm btn-outline-warning flex-fill"
                                onclick="window.workoutModeController.handleSkipExercise('${this._escapeHtml(exerciseName)}', ${index}); event.stopPropagation();"
                                title="Skip this exercise">
                            <i class="bx bx-skip-next me-1"></i>Skip
                        </button>
                    </div>
                `}
            </div>
        `;
    }

    /**
     * Render weight history showing the 4 most recent weights (tree style)
     * @private
     */
    _renderWeightHistory(exerciseName, lastWeight, lastWeightUnit, lastSessionDate, recentSessions) {
        if (!lastWeight || !lastSessionDate) {
            return '';
        }
        
        // Helper to format date - relative within 2 weeks, absolute otherwise
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const diffDays = getCalendarDaysAgo(dateStr);
            if (diffDays === 0) return 'today';
            if (diffDays === 1) return 'yesterday';
            if (diffDays < 14) return `${diffDays} days ago`;
            return 'on ' + new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };
        
        // Show up to 3 additional sessions (4 total including primary)
        const sessionsToShow = recentSessions ? recentSessions.slice(1, 4) : [];
        
        return `
            <div class="workout-history">
                <div class="workout-history-primary">
                    <span class="history-label">Last:</span>
                    <span class="history-weight">${lastWeight}${lastWeightUnit !== 'other' ? ` ${lastWeightUnit}` : ''}</span>
                    <span class="history-date">${formatDate(lastSessionDate)}</span>
                </div>
                ${sessionsToShow.length > 0 ? `
                    <div class="workout-history-tree">
                        ${sessionsToShow.map((session, index) => {
                            const isLast = index === sessionsToShow.length - 1;
                            const connector = isLast ? '└─' : '├─';
                            const weight = session.weight || '—';
                            const unit = session.weight_unit || 'lbs';
                            return `
                                <div class="workout-history-tree-item">
                                    <span class="tree-branch">${connector}</span>
                                    <span class="history-weight">${weight}${unit !== 'other' ? ` ${unit}` : ''}</span>
                                    <span>${formatDate(session.date)}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Get label for weight direction
     * @private
     */
    _getDirectionLabel(direction) {
        const labels = {
            'down': 'Decrease weight next session',
            'same': 'Keep same weight next session',
            'up': 'Increase weight next session'
        };
        return labels[direction] || '';
    }

    /**
     * Render plate breakdown display (small footer style)
     * @private
     */
    _renderPlateBreakdown(weight, unit) {
        // Only show for numeric weights in lbs/kg (not DIY mode)
        if (!weight || unit === 'diy') {
            return '';
        }
        
        const breakdown = this._calculatePlateBreakdown(weight, unit);
        
        if (!breakdown) {
            return '';
        }
        
        return `
            <div class="plate-breakdown">
                <i class="bx bx-dumbbell"></i>
                <span class="plate-breakdown-text">${breakdown}</span>
            </div>
        `;
    }
    
    /**
     * Render note toggle button only (v2.2.0)
     * Button only - textarea is rendered separately above the buttons row
     * @private
     */
    _renderNoteButton(exerciseName, notes) {
        const hasNote = notes && notes.trim().length > 0;
        const buttonText = hasNote ? 'Edit Note' : 'Add Note';

        return `
            <button class="workout-note-toggle-btn ${hasNote ? 'has-note' : ''}"
                    data-exercise-name="${this._escapeHtml(exerciseName)}"
                    onclick="event.stopPropagation();">
                <i class="bx bx-note"></i>
                <span>${buttonText}</span>
            </button>
        `;
    }
    
    /**
     * Escape HTML to prevent XSS
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export globally
window.ExerciseCardRenderer = ExerciseCardRenderer;

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExerciseCardRenderer;
}

console.log('📦 ExerciseCardRenderer component loaded');