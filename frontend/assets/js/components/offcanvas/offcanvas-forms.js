/**
 * Ghost Gym - Form Offcanvas Components (Barrel Re-export)
 * Maintains backward compatibility by re-exporting from focused module files
 *
 * @module offcanvas-forms
 * @version 4.0.0
 * @date 2026-03-25
 */

export { createConfirmOffcanvas } from './offcanvas-confirm.js';
export { createFilterOffcanvas } from './offcanvas-filter.js';
export { createSkipExercise } from './offcanvas-skip-exercise.js';
export { createExerciseGroupEditor, renderAlternateSlot, createExerciseDetailsEditor } from './offcanvas-exercise-editor.js';

console.log('📦 Offcanvas form components loaded (barrel)');
