/**
 * Ghost Gym - Unified Edit Controller
 * Coordinates weight and sets/reps field editors in unified mode
 * 
 * Features:
 * - Single pencil icon opens both editors simultaneously
 * - Editors stay open (no blur-to-close)
 * - Shared save/cancel buttons control both fields
 * - Keyboard shortcuts (Enter = save, Escape = cancel)
 * 
 * @version 1.0.0
 * @date 2026-01-14
 */

class UnifiedEditController {
    /**
     * Initialize unified edit controller
     * @param {HTMLElement} cardElement - The exercise card container
     * @param {Object} weightFieldController - Instance of WeightFieldController
     * @param {Object} repsSetFieldController - Instance of RepsSetsFieldController
     */
    constructor(cardElement, weightFieldController, repsSetFieldController) {
        this.cardElement = cardElement;
        this.weightFieldController = weightFieldController;
        this.repsSetFieldController = repsSetFieldController;

        // Find unified action buttons (inline inside protocol/repssets-editor row)
        this.unifiedActionsContainer = cardElement.querySelector('.workout-unified-actions');
        this.unifiedSaveBtn = cardElement.querySelector('.unified-save-btn');
        this.unifiedCancelBtn = cardElement.querySelector('.unified-cancel-btn');

        // Track unified edit state
        this.isUnifiedEditActive = false;

        this.init();

        console.log('✅ UnifiedEditController initialized for card:', cardElement.dataset.exerciseName);
    }
    
    /**
     * Initialize controller and attach event listeners
     */
    init() {
        // Listen for unified edit mode trigger (from pencil button)
        this.cardElement.addEventListener('enterUnifiedEditMode', (e) => {
            console.log('🔵 enterUnifiedEditMode event received');
            this.enterUnifiedEditMode();
        });

        // Listen for cancel event (from pencil button toggle)
        this.cardElement.addEventListener('cancelUnifiedEditMode', (e) => {
            console.log('🔵 cancelUnifiedEditMode event received');
            this.cancelUnifiedChanges();
        });
        
        // Attach save/cancel button handlers
        if (this.unifiedSaveBtn) {
            this.unifiedSaveBtn.addEventListener('click', () => this.saveUnifiedChanges());
        }
        
        if (this.unifiedCancelBtn) {
            this.unifiedCancelBtn.addEventListener('click', () => this.cancelUnifiedChanges());
        }
        
        // Keyboard shortcuts (when either editor is focused)
        const weightEditor = this.cardElement.querySelector('.weight-editor');
        const repsSetEditor = this.cardElement.querySelector('.repssets-editor');
        
        [weightEditor, repsSetEditor].forEach(editor => {
            if (editor) {
                editor.addEventListener('keydown', (e) => {
                    if (!this.isUnifiedEditActive) return;
                    
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.saveUnifiedChanges();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this.cancelUnifiedChanges();
                    }
                });
            }
        });
    }
    
    /**
     * Enter unified edit mode - opens both editors and shows shared buttons
     */
    enterUnifiedEditMode() {
        // Prevent re-entering if already active
        if (this.isUnifiedEditActive) {
            console.log('⚠️ Already in unified edit mode, ignoring');
            return;
        }

        // Block editing if exercise is completed (user must uncomplete first)
        if (this.cardElement.classList.contains('logged')) {
            console.log('🔒 Edit blocked - exercise is completed:', this.cardElement.dataset.exerciseName);
            if (window.showAlert) {
                window.showAlert('Uncomplete this exercise first to make changes', 'warning');
            }
            return;
        }

        console.log('🟢 Entering unified edit mode');

        // First, expand the card if it's collapsed
        if (!this.cardElement.classList.contains('expanded')) {
            this.cardElement.classList.add('expanded');
        }

        // CRITICAL: Set unified mode flag on BOTH controllers FIRST (before opening editors)
        // This prevents blur handlers from auto-closing when focus moves between fields
        if (this.weightFieldController?.setUnifiedEditMode) {
            this.weightFieldController.setUnifiedEditMode(true);
        }

        if (this.repsSetFieldController?.setUnifiedEditMode) {
            this.repsSetFieldController.setUnifiedEditMode(true);
        }

        // Mark card as being in unified edit mode (shows unified buttons, hides individual)
        this.cardElement.classList.add('unified-edit-active');
        this.isUnifiedEditActive = true;

        // Show the unified actions container (inline-flex for inline layout)
        if (this.unifiedActionsContainer) {
            this.unifiedActionsContainer.style.display = 'inline-flex';
        }

        // NOW open both editors (blur handlers will ignore events because unified mode is active)
        if (this.weightFieldController?.enterEditMode) {
            this.weightFieldController.enterEditMode();
        }

        if (this.repsSetFieldController?.enterEditMode) {
            this.repsSetFieldController.enterEditMode();
        }

        console.log('✅ Unified edit mode active - both editors open with shared buttons');
    }
    
    /**
     * Exit unified edit mode - cleanup and reset state
     */
    exitUnifiedEditMode() {
        console.log('🔴 Exiting unified edit mode');

        // Remove unified edit state
        this.cardElement.classList.remove('unified-edit-active');
        this.isUnifiedEditActive = false;

        // Hide the unified actions container
        if (this.unifiedActionsContainer) {
            this.unifiedActionsContainer.style.display = 'none';
        }

        // Re-enable blur handlers
        if (this.weightFieldController?.setUnifiedEditMode) {
            this.weightFieldController.setUnifiedEditMode(false);
        }

        if (this.repsSetFieldController?.setUnifiedEditMode) {
            this.repsSetFieldController.setUnifiedEditMode(false);
        }

        console.log('✅ Unified edit mode exited');
    }
    
    /**
     * Save changes from both editors
     */
    async saveUnifiedChanges() {
        console.log('💾 Saving unified changes...');
        
        try {
            // Save weight field
            const weightSaved = await this.weightFieldController.saveChanges();
            
            // Save reps/sets field
            const repsSaved = await this.repsSetFieldController.saveChanges();
            
            if (weightSaved && repsSaved) {
                console.log('✅ Both fields saved successfully');
                this.exitUnifiedEditMode();
            } else {
                console.warn('⚠️ One or more fields failed to save');
            }
        } catch (error) {
            console.error('❌ Error saving unified changes:', error);
        }
    }
    
    /**
     * Cancel changes in both editors
     */
    cancelUnifiedChanges() {
        console.log('❌ Canceling unified changes...');
        
        // Cancel weight field
        this.weightFieldController.cancelChanges();
        
        // Cancel reps/sets field
        this.repsSetFieldController.cancelChanges();
        
        console.log('✅ Both fields canceled');
        this.exitUnifiedEditMode();
    }
    
    /**
     * Check if unified edit mode is currently active
     * @returns {boolean}
     */
    isActive() {
        return this.isUnifiedEditActive;
    }
}

// Export globally (CRITICAL - required for workout-mode-controller initialization)
window.UnifiedEditController = UnifiedEditController;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedEditController;
}