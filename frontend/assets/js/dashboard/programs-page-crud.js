/**
 * Ghost Gym - Programs Page CRUD Operations
 * Create, read, update, delete operations for programs
 * Extracted from programs-page.js for modularity
 * @version 1.0.0
 */

(function() {
    'use strict';

    /**
     * Add workouts to a program
     * @param {string} programId - Program ID
     * @param {Array} workoutIds - Array of workout IDs to add
     * @param {Array} allPrograms - All programs array (will be mutated)
     * @returns {Promise<boolean>} Success
     */
    async function addWorkoutsToProgram(programId, workoutIds, allPrograms) {
        try {
            const program = allPrograms.find(p => p.id === programId);
            if (!program) return false;

            // Add workouts locally
            const currentOrder = program.workouts?.length || 0;
            program.workouts = program.workouts || [];

            workoutIds.forEach((workoutId, index) => {
                const exists = program.workouts.some(pw => pw.workout_id === workoutId);
                if (!exists) {
                    program.workouts.push({
                        workout_id: workoutId,
                        order_index: currentOrder + index
                    });
                }
            });

            // Save to backend
            if (window.dataManager?.updateProgram) {
                await window.dataManager.updateProgram(programId, program);
            }

            if (window.showAlert) {
                window.showAlert(`Added ${workoutIds.length} workout${workoutIds.length !== 1 ? 's' : ''} to program`, 'success');
            }
            return true;
        } catch (error) {
            console.error('Error adding workouts:', error);
            if (window.showAlert) {
                window.showAlert('Failed to add workouts', 'danger');
            }
            return false;
        }
    }

    /**
     * Remove workout from a program
     * @param {string} programId - Program ID
     * @param {string} workoutId - Workout ID to remove
     * @param {Array} allPrograms - All programs array (will be mutated)
     * @returns {Promise<boolean>} Success
     */
    async function removeWorkoutFromProgram(programId, workoutId, allPrograms) {
        try {
            const program = allPrograms.find(p => p.id === programId);
            if (!program) return false;

            program.workouts = (program.workouts || []).filter(pw => pw.workout_id !== workoutId);

            // Reindex order
            program.workouts.forEach((pw, index) => {
                pw.order_index = index;
            });

            // Save to backend
            if (window.dataManager?.updateProgram) {
                await window.dataManager.updateProgram(programId, program);
            }

            if (window.showAlert) {
                window.showAlert('Workout removed from program', 'success');
            }
            return true;
        } catch (error) {
            console.error('Error removing workout:', error);
            if (window.showAlert) {
                window.showAlert('Failed to remove workout', 'danger');
            }
            return false;
        }
    }

    /**
     * Reorder workouts in a program
     * @param {string} programId - Program ID
     * @param {Array} newOrder - Array of { workout_id, order_index }
     * @param {Array} allPrograms - All programs array (will be mutated)
     * @returns {Promise<boolean>} Success
     */
    async function reorderProgramWorkouts(programId, newOrder, allPrograms) {
        try {
            const program = allPrograms.find(p => p.id === programId);
            if (!program) return false;

            // Update order
            program.workouts = program.workouts.map(pw => {
                const orderInfo = newOrder.find(o => o.workout_id === pw.workout_id);
                return {
                    ...pw,
                    order_index: orderInfo?.order_index ?? pw.order_index
                };
            }).sort((a, b) => a.order_index - b.order_index);

            // Save to backend
            if (window.dataManager?.updateProgram) {
                await window.dataManager.updateProgram(programId, program);
            }

            console.log('Workout order saved');
            return true;
        } catch (error) {
            console.error('Error reordering workouts:', error);
            if (window.showAlert) {
                window.showAlert('Failed to save workout order', 'danger');
            }
            return false;
        }
    }

    /**
     * Delete a single program
     * @param {string} programId - Program ID
     * @param {string} programName - Program name (for confirmation)
     * @param {Object} callbacks - { onSuccess(programId), onError(error) }
     */
    function handleDeleteProgram(programId, programName, callbacks) {
        ffnModalManager.confirm(
            'Delete Program',
            `Are you sure you want to delete "${programName}"?\n\nThis action cannot be undone.`,
            async () => {
                try {
                    if (window.dataManager?.deleteProgram) {
                        await window.dataManager.deleteProgram(programId);
                    }

                    if (callbacks?.onSuccess) callbacks.onSuccess(programId);

                    if (window.showAlert) {
                        window.showAlert(`Program "${programName}" deleted`, 'success');
                    }
                } catch (error) {
                    console.error('Error deleting program:', error);
                    if (callbacks?.onError) callbacks.onError(error);
                    if (window.showAlert) {
                        window.showAlert('Failed to delete program', 'danger');
                    }
                }
            },
            { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' }
        );
    }

    /**
     * Delete multiple programs (batch)
     * @param {Array} programIds - Array of program IDs
     * @param {Object} callbacks - { onSuccess(programIds), onError(error) }
     */
    function handleBatchDelete(programIds, callbacks) {
        const count = programIds.length;
        ffnModalManager.confirm(
            'Delete Programs',
            `Delete ${count} program${count !== 1 ? 's' : ''}?\n\nThis action cannot be undone.`,
            async () => {
                try {
                    // Delete each program
                    for (const id of programIds) {
                        if (window.dataManager?.deleteProgram) {
                            await window.dataManager.deleteProgram(id);
                        }
                    }

                    if (callbacks?.onSuccess) callbacks.onSuccess(programIds);

                    if (window.showAlert) {
                        window.showAlert(`${count} program${count !== 1 ? 's' : ''} deleted`, 'success');
                    }
                } catch (error) {
                    console.error('Error deleting programs:', error);
                    if (callbacks?.onError) callbacks.onError(error);
                    if (window.showAlert) {
                        window.showAlert('Failed to delete programs', 'danger');
                    }
                }
            },
            { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' }
        );
    }

    /**
     * Save program to backend (explicit save action)
     * @param {Object} program - Program object
     * @param {Object} options - { getLatest: fn, allPrograms: Array }
     * @returns {Promise<boolean>} Success
     */
    async function saveProgram(program, options) {
        try {
            console.log('Saving program:', program.id);

            // Get the latest version (may have been modified in offcanvas)
            const currentProgram = (options?.getLatest ? options.getLatest() : null) || program;

            // Update modified date
            currentProgram.modified_date = new Date().toISOString();

            // Save to backend
            if (window.dataManager?.updateProgram) {
                await window.dataManager.updateProgram(currentProgram.id, currentProgram);
            }

            // Update local state
            if (options?.allPrograms) {
                const index = options.allPrograms.findIndex(p => p.id === currentProgram.id);
                if (index >= 0) {
                    options.allPrograms[index] = { ...currentProgram };
                }
            }

            if (window.showAlert) {
                window.showAlert('Program saved successfully', 'success');
            }
            console.log('Program saved:', currentProgram.id);
            return true;
        } catch (error) {
            console.error('Error saving program:', error);
            if (window.showAlert) {
                window.showAlert('Failed to save program', 'danger');
            }
            return false;
        }
    }

    // Export
    window.ProgramsPageCrud = {
        addWorkoutsToProgram: addWorkoutsToProgram,
        removeWorkoutFromProgram: removeWorkoutFromProgram,
        reorderProgramWorkouts: reorderProgramWorkouts,
        handleDeleteProgram: handleDeleteProgram,
        handleBatchDelete: handleBatchDelete,
        saveProgram: saveProgram
    };

    console.log('📦 Programs Page CRUD module loaded');

})();
