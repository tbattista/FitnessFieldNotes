/**
 * Ghost Gym Dashboard - Workout Database Delete Manager
 * Handles batch selection, deletion mode, action bar, and single/batch delete operations
 * @version 1.0.0 - Extracted from workout-database.js
 */

/**
 * Toggle delete mode on/off
 */
function toggleDeleteMode() {
    const toggle = document.getElementById('deleteModeToggle');
    const isActive = toggle ? toggle.checked : !window.ffn.workoutDatabase.deleteMode;

    // Sync toggle state
    if (toggle) toggle.checked = isActive;
    window.ffn.workoutDatabase.deleteMode = isActive;

    // Clear selection when entering/exiting
    window.ffn.workoutDatabase.selectedWorkoutIds.clear();

    console.log(`🗑️ Delete mode ${isActive ? 'activated' : 'deactivated'}`);

    // Update grid delete mode
    if (window.workoutGrid) {
        window.workoutGrid.setDeleteMode(isActive);
        window.workoutGrid.clearSelection();
    }

    // Show/hide selection action bar
    if (isActive) {
        showSelectionActionBar();
    } else {
        hideSelectionActionBar();
    }

    // Body class for global styling
    document.body.classList.toggle('delete-mode-active', isActive);
}

/**
 * Enter delete mode with a workout pre-selected
 * Called from the 3-dot menu on workout cards
 * @param {string} workoutId - Workout ID to pre-select
 */
function enterDeleteModeWithSelection(workoutId) {
    const toggle = document.getElementById('deleteModeToggle');

    // Enter delete mode
    if (toggle) toggle.checked = true;
    window.ffn.workoutDatabase.deleteMode = true;
    window.ffn.workoutDatabase.selectedWorkoutIds.clear();
    window.ffn.workoutDatabase.selectedWorkoutIds.add(workoutId);

    console.log(`🗑️ Delete mode activated with workout pre-selected: ${workoutId}`);

    // Update grid delete mode and set selection
    if (window.workoutGrid) {
        // Set isSelected BEFORE re-render so checkbox renders as checked
        const card = window.workoutGrid.cards.find(c => c.workout.id === workoutId);
        if (card) {
            card.config.isSelected = true;
        }
        window.workoutGrid.setDeleteMode(true);
    }

    // Show action bar with 1 selected
    showSelectionActionBar();
    document.body.classList.add('delete-mode-active');
}

/**
 * Handle selection change from card checkbox
 * @param {string} workoutId - The workout ID
 * @param {boolean} isSelected - Whether it's selected
 */
function handleSelectionChange(workoutId, isSelected) {
    const selected = window.ffn.workoutDatabase.selectedWorkoutIds;
    if (isSelected) {
        selected.add(workoutId);
    } else {
        selected.delete(workoutId);
    }
    updateSelectionCount();
}

/**
 * Show selection action bar (contextual action bar)
 */
function showSelectionActionBar() {
    let bar = document.getElementById('selectionActionBar');
    const isArchivedView = window.ffn.workoutDatabase.filters.showArchived;

    // Remove existing bar to rebuild with correct buttons
    if (bar) bar.remove();

    bar = document.createElement('div');
    bar.id = 'selectionActionBar';
    bar.className = 'selection-action-bar';

    if (isArchivedView) {
        // Archived view: Restore + Permanently Delete
        bar.innerHTML = `
            <div class="selection-info">
                <button class="btn-close-selection" onclick="exitDeleteMode()" type="button">
                    <i class="bx bx-x"></i>
                </button>
                <span class="selection-count">0 selected</span>
            </div>
            <div class="d-flex gap-2">
                <button class="btn-batch-restore" onclick="confirmBatchRestore()" type="button" disabled>
                    <i class="bx bx-undo"></i>
                    Restore
                </button>
                <button class="btn-batch-delete" onclick="confirmBatchPermanentDelete()" type="button" disabled>
                    <i class="bx bx-trash"></i>
                    Permanently Delete
                </button>
            </div>
        `;
    } else {
        // Normal view: Archive
        bar.innerHTML = `
            <div class="selection-info">
                <button class="btn-close-selection" onclick="exitDeleteMode()" type="button">
                    <i class="bx bx-x"></i>
                </button>
                <span class="selection-count">0 selected</span>
            </div>
            <button class="btn-batch-delete" onclick="confirmBatchDelete()" type="button" disabled>
                <i class="bx bx-archive-in"></i>
                Archive
            </button>
        `;
    }

    document.body.appendChild(bar);
    bar.style.display = 'flex';
    updateSelectionCount();
}

/**
 * Hide selection action bar
 */
function hideSelectionActionBar() {
    const bar = document.getElementById('selectionActionBar');
    if (bar) {
        bar.style.display = 'none';
    }
}

/**
 * Update the selection count display
 */
function updateSelectionCount() {
    const count = window.ffn.workoutDatabase.selectedWorkoutIds.size;
    const countEl = document.querySelector('.selection-count');
    const deleteBtn = document.querySelector('.btn-batch-delete');
    const restoreBtn = document.querySelector('.btn-batch-restore');

    if (countEl) countEl.textContent = `${count} selected`;
    if (deleteBtn) deleteBtn.disabled = count === 0;
    if (restoreBtn) restoreBtn.disabled = count === 0;
}

/**
 * Exit delete mode - called from action bar button
 */
function exitDeleteMode() {
    const toggle = document.getElementById('deleteModeToggle');
    if (toggle) {
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
    } else {
        // Direct toggle if checkbox not available
        window.ffn.workoutDatabase.deleteMode = false;
        window.ffn.workoutDatabase.selectedWorkoutIds.clear();
        if (window.workoutGrid) {
            window.workoutGrid.setDeleteMode(false);
            window.workoutGrid.clearSelection();
        }
        hideSelectionActionBar();
        document.body.classList.remove('delete-mode-active');
    }
}

/**
 * Confirm batch delete of selected workouts
 */
async function confirmBatchDelete() {
    const selected = window.ffn.workoutDatabase.selectedWorkoutIds;
    const count = selected.size;
    if (count === 0) return;

    // Get workout names for confirmation
    const workoutNames = [...selected].map(id => {
        const workout = window.ffn.workoutDatabase.all.find(w => w.id === id);
        return workout?.name || 'Unknown workout';
    }).slice(0, 3); // Show max 3 names

    let message = `Archive ${count} workout${count > 1 ? 's' : ''}?\n\n`;
    message += workoutNames.join('\n');
    if (count > 3) {
        message += `\n...and ${count - 3} more`;
    }
    message += '\n\nYou can restore archived workouts later.';

    ffnModalManager.confirm('Archive Workouts', message, async () => {
        await batchDeleteWorkouts([...selected]);
    }, { confirmText: 'Archive', confirmClass: 'btn-warning', size: 'sm' });
}

/**
 * Batch delete multiple workouts
 * @param {Array<string>} workoutIds - Array of workout IDs to delete
 */
async function batchDeleteWorkouts(workoutIds) {
    console.log('📦 Batch archiving workouts:', workoutIds);

    // Show loading state
    const deleteBtn = document.querySelector('.btn-batch-delete');
    if (deleteBtn) {
        deleteBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Archiving...';
        deleteBtn.disabled = true;
    }

    try {
        // Archive each workout
        let archivedCount = 0;
        for (const id of workoutIds) {
            try {
                await window.dataManager.deleteWorkout(id);
                archivedCount++;
            } catch (error) {
                console.error(`Failed to archive workout ${id}:`, error);
            }
        }

        // Update local state: mark as archived (don't remove)
        window.ffn.workoutDatabase.all.forEach(w => {
            if (workoutIds.includes(w.id)) {
                w.is_archived = true;
                w.archived_at = new Date().toISOString();
            }
        });

        // Update stats (count non-archived only)
        const activeCount = window.ffn.workoutDatabase.all.filter(w => !w.is_archived).length;
        window.ffn.workoutDatabase.stats.total = activeCount;

        // Update total count display
        const totalCountEl = document.getElementById('totalWorkoutsCount');
        if (totalCountEl) {
            totalCountEl.textContent = activeCount;
        }

        // Show success message
        if (window.showToast) {
            window.showToast(`Archived ${archivedCount} workout${archivedCount > 1 ? 's' : ''}`, 'success');
        }

        // Exit delete mode and refresh
        exitDeleteMode();
        window.filterWorkouts();

        // Re-render favorites section
        window.renderFavoritesSection?.();

    } catch (error) {
        console.error('Batch archive failed:', error);
        if (window.showToast) {
            window.showToast('Failed to archive some workouts', 'error');
        }
    } finally {
        // Reset button state
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i class="bx bx-archive-in"></i> Archive';
            deleteBtn.disabled = false;
        }
    }
}

/**
 * Delete workout from database with confirmation
 */
async function deleteWorkoutFromDatabase(workoutId, workoutName) {
    console.log('📦 Archive requested for workout:', workoutId, workoutName);

    ffnModalManager.confirm('Archive Workout', `Archive "${workoutName}"?\n\nYou can restore it later from the archived workouts filter.`, async () => {
        try {
            console.log('🔄 Archiving workout...');

            // Archive via data manager (soft-delete)
            await window.dataManager.deleteWorkout(workoutId);

            // Update local state: mark as archived (don't remove)
            const workout = window.ffn.workoutDatabase.all.find(w => w.id === workoutId);
            if (workout) {
                workout.is_archived = true;
                workout.archived_at = new Date().toISOString();
            }

            // Update stats (count non-archived only)
            const activeCount = window.ffn.workoutDatabase.all.filter(w => !w.is_archived).length;
            window.ffn.workoutDatabase.stats.total = activeCount;

            const totalCountEl = document.getElementById('totalWorkoutsCount');
            if (totalCountEl) {
                totalCountEl.textContent = activeCount;
            }

            // Re-apply filters and render
            window.filterWorkouts();

            // Re-render Favorites section
            window.renderFavoritesSection?.();

            console.log('✅ Workout archived successfully');

            if (window.showAlert) {
                window.showAlert(`"${workoutName}" archived. Use the filter to view archived workouts.`, 'success');
            }

        } catch (error) {
            console.error('❌ Failed to archive workout:', error);

            if (window.showAlert) {
                window.showAlert('Failed to archive workout: ' + error.message, 'danger');
            }
        }
    }, { confirmText: 'Archive', confirmClass: 'btn-warning', size: 'sm' });
}

/**
 * Restore an archived workout
 */
async function restoreWorkoutFromArchive(workoutId, workoutName) {
    try {
        console.log('🔄 Restoring workout:', workoutId);
        await window.dataManager.restoreWorkout(workoutId);

        // Update local state
        const workout = window.ffn.workoutDatabase.all.find(w => w.id === workoutId);
        if (workout) {
            workout.is_archived = false;
            workout.archived_at = null;
        }

        // Update stats
        const activeCount = window.ffn.workoutDatabase.all.filter(w => !w.is_archived).length;
        window.ffn.workoutDatabase.stats.total = activeCount;
        const totalCountEl = document.getElementById('totalWorkoutsCount');
        if (totalCountEl) totalCountEl.textContent = activeCount;

        window.filterWorkouts();
        window.renderFavoritesSection?.();

        if (window.showToast) {
            window.showToast(`"${workoutName}" restored`, 'success');
        }
    } catch (error) {
        console.error('❌ Failed to restore workout:', error);
        if (window.showToast) {
            window.showToast('Failed to restore workout', 'error');
        }
    }
}

/**
 * Permanently delete a workout (from archived view)
 */
async function permanentDeleteWorkout(workoutId, workoutName) {
    const safeName = String(workoutName || 'Untitled Workout')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const body = `
        Permanently delete <strong>"${safeName}"</strong>?<br>
        <span class="text-danger">This will NOT go to your archive. This cannot be undone.</span>
    `;
    const doDelete = async () => {
        try {
            console.log('🗑️ Permanently deleting workout:', workoutId);
            await window.dataManager.permanentDeleteWorkout(workoutId);

            // Remove from local state entirely
            window.ffn.workoutDatabase.all = window.ffn.workoutDatabase.all.filter(w => w.id !== workoutId);
            window.ffn.workouts = (window.ffn.workouts || []).filter(w => w.id !== workoutId);

            // Update stats
            const activeCount = window.ffn.workoutDatabase.all.filter(w => !w.is_archived).length;
            window.ffn.workoutDatabase.stats.total = activeCount;
            const totalCountEl = document.getElementById('totalWorkoutsCount');
            if (totalCountEl) totalCountEl.textContent = activeCount;

            window.filterWorkouts();

            if (window.showToast) {
                window.showToast(`"${workoutName}" permanently deleted`, 'success');
            }
        } catch (error) {
            console.error('❌ Failed to permanently delete workout:', error);
            if (window.showToast) {
                window.showToast('Failed to delete workout', 'error');
            }
        }
    };

    // Prefer type-to-confirm if available; fall back to plain confirm.
    if (typeof ffnModalManager.typeToConfirm === 'function') {
        ffnModalManager.typeToConfirm('Delete permanently', body, 'delete', doDelete, {
            confirmText: 'Delete permanently',
            confirmClass: 'btn-danger',
            size: 'sm',
        });
    } else {
        ffnModalManager.confirm('Delete permanently', `Permanently delete "${workoutName}"? This cannot be undone.`, doDelete, {
            confirmText: 'Delete permanently', confirmClass: 'btn-danger', size: 'sm',
        });
    }
}

/**
 * Confirm batch restore of selected archived workouts
 */
async function confirmBatchRestore() {
    const selected = window.ffn.workoutDatabase.selectedWorkoutIds;
    const count = selected.size;
    if (count === 0) return;

    ffnModalManager.confirm('Restore Workouts', `Restore ${count} workout${count > 1 ? 's' : ''}?`, async () => {
        const restoreBtn = document.querySelector('.btn-batch-restore');
    if (restoreBtn) {
        restoreBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Restoring...';
        restoreBtn.disabled = true;
    }

    try {
        let restoredCount = 0;
        for (const id of selected) {
            try {
                await window.dataManager.restoreWorkout(id);
                const workout = window.ffn.workoutDatabase.all.find(w => w.id === id);
                if (workout) {
                    workout.is_archived = false;
                    workout.archived_at = null;
                }
                restoredCount++;
            } catch (error) {
                console.error(`Failed to restore workout ${id}:`, error);
            }
        }

        const activeCount = window.ffn.workoutDatabase.all.filter(w => !w.is_archived).length;
        window.ffn.workoutDatabase.stats.total = activeCount;
        const totalCountEl = document.getElementById('totalWorkoutsCount');
        if (totalCountEl) totalCountEl.textContent = activeCount;

        if (window.showToast) {
            window.showToast(`Restored ${restoredCount} workout${restoredCount > 1 ? 's' : ''}`, 'success');
        }

        exitDeleteMode();
        window.filterWorkouts();
        window.renderFavoritesSection?.();
    } catch (error) {
        console.error('Batch restore failed:', error);
        if (window.showToast) {
            window.showToast('Failed to restore some workouts', 'error');
        }
    }
    }, { confirmText: 'Restore', confirmClass: 'btn-primary', size: 'sm' });
}

/**
 * Confirm batch permanent delete of selected archived workouts
 */
async function confirmBatchPermanentDelete() {
    const selected = window.ffn.workoutDatabase.selectedWorkoutIds;
    const count = selected.size;
    if (count === 0) return;

    ffnModalManager.confirm('Delete Permanently', `Permanently delete ${count} workout${count > 1 ? 's' : ''}?\n\nThis cannot be undone.`, async () => {
        const deleteBtn = document.querySelector('.btn-batch-delete');
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Deleting...';
            deleteBtn.disabled = true;
        }

        try {
            let deletedCount = 0;
            for (const id of [...selected]) {
                try {
                    await window.dataManager.permanentDeleteWorkout(id);
                    deletedCount++;
                } catch (error) {
                    console.error(`Failed to permanently delete workout ${id}:`, error);
                }
            }

            // Remove from local state entirely
            const idsToRemove = [...selected];
            window.ffn.workoutDatabase.all = window.ffn.workoutDatabase.all.filter(
                w => !idsToRemove.includes(w.id)
            );
            window.ffn.workouts = (window.ffn.workouts || []).filter(
                w => !idsToRemove.includes(w.id)
            );

            const activeCount = window.ffn.workoutDatabase.all.filter(w => !w.is_archived).length;
            window.ffn.workoutDatabase.stats.total = activeCount;
            const totalCountEl = document.getElementById('totalWorkoutsCount');
            if (totalCountEl) totalCountEl.textContent = activeCount;

            if (window.showToast) {
                window.showToast(`Permanently deleted ${deletedCount} workout${deletedCount > 1 ? 's' : ''}`, 'success');
            }

            exitDeleteMode();
            window.filterWorkouts();
        } catch (error) {
            console.error('Batch permanent delete failed:', error);
            if (window.showToast) {
                window.showToast('Failed to delete some workouts', 'error');
            }
        }
    }, { confirmText: 'Delete Permanently', confirmClass: 'btn-danger', size: 'sm' });
}

/**
 * Initialize delete mode toggle
 */
function initDeleteModeToggle() {
    const toggle = document.getElementById('deleteModeToggle');
    if (toggle) {
        toggle.addEventListener('change', toggleDeleteMode);
        console.log('✅ Delete mode toggle initialized');
    } else {
        console.warn('⚠️ Delete mode toggle not found');
    }
}

// Window exports
window.toggleDeleteMode = toggleDeleteMode;
window.enterDeleteModeWithSelection = enterDeleteModeWithSelection;
window.handleSelectionChange = handleSelectionChange;
window.showSelectionActionBar = showSelectionActionBar;
window.hideSelectionActionBar = hideSelectionActionBar;
window.updateSelectionCount = updateSelectionCount;
window.exitDeleteMode = exitDeleteMode;
window.confirmBatchDelete = confirmBatchDelete;
window.batchDeleteWorkouts = batchDeleteWorkouts;
window.deleteWorkoutFromDatabase = deleteWorkoutFromDatabase;
window.initDeleteModeToggle = initDeleteModeToggle;
window.restoreWorkoutFromArchive = restoreWorkoutFromArchive;
window.permanentDeleteWorkout = permanentDeleteWorkout;
window.confirmBatchRestore = confirmBatchRestore;
window.confirmBatchPermanentDelete = confirmBatchPermanentDelete;

console.log('📦 WorkoutDatabaseDeleteManager loaded');
