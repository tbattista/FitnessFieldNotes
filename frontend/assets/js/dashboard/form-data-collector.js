/**
 * Form Data Collector Module
 * Pure data-extraction utilities for reading workout form state
 * Extracted from workouts.js
 */

const FormDataCollector = {

    /**
     * Collect exercise groups from card data storage
     * @returns {Array} Array of exercise group objects
     */
    collectExerciseGroups() {
        const groups = [];

        const cardElements = document.querySelectorAll('#exerciseGroups .exercise-group-card');

        cardElements.forEach(cardEl => {
            const groupId = cardEl.getAttribute('data-group-id');
            const groupData = window.exerciseGroupsData[groupId];

            if (!groupData) {
                console.warn('⚠️ Missing exercise group data for groupId:', groupId);
                console.warn('⚠️ Available groupIds:', Object.keys(window.exerciseGroupsData));
                return;
            }

            // Notes are collected separately via collectTemplateNotes()
            if (groupData.group_type === 'note') return;

            if (groupData && groupData.exercises) {
                const exercises = {};
                Object.keys(groupData.exercises).forEach(key => {
                    if (groupData.exercises[key]) {
                        exercises[key] = groupData.exercises[key];
                    }
                });

                // For standard groups, require exercise 'a'; for blocks, require at least one exercise
                // For cardio groups, require activity_type or duration
                const isBlock = groupData.group_type === 'block';
                const isCardio = groupData.group_type === 'cardio';
                const hasRequiredExercises = isBlock
                    ? Object.keys(exercises).length > 0
                    : isCardio
                        ? !!(groupData.cardio_config?.activity_type || groupData.cardio_config?.duration_minutes)
                        : !!exercises.a;

                if (hasRequiredExercises) {
                    const groupEntry = {
                        group_id: groupId,
                        group_type: groupData.group_type || 'standard',
                        exercises: isCardio ? { a: groupData.cardio_config?.activity_type || '' } : exercises,
                        sets: isCardio ? '' : (groupData.sets || '3'),
                        reps: isCardio ? '' : (groupData.reps || '8-12'),
                        rest: isCardio ? '' : (groupData.rest || '60s'),
                        default_weight: groupData.default_weight || null,
                        default_weight_unit: groupData.default_weight_unit || 'lbs'
                    };

                    // Include optional fields if present
                    if (groupData.block_id) {
                        groupEntry.block_id = groupData.block_id;
                    }
                    if (groupData.group_name) {
                        groupEntry.group_name = groupData.group_name;
                    }
                    if (groupData.cardio_config) {
                        groupEntry.cardio_config = groupData.cardio_config;
                    }
                    if (groupData.interval_config) {
                        groupEntry.interval_config = groupData.interval_config;
                    }

                    groups.push(groupEntry);
                }
            }
        });

        console.log('🔍 Collected', groups.length, 'exercise groups');
        return groups;
    },

    /**
     * Collect sections data from DOM.
     * Walks section containers and reads exercise data from window.exerciseGroupsData.
     * Returns array matching the backend WorkoutSection format.
     */
    // Keep in sync with SectionManager.collectSections()
    collectSections() {
        const sections = [];

        document.querySelectorAll('#exerciseGroups .workout-section').forEach(sectionEl => {
            const sectionId = sectionEl.dataset.sectionId;
            const sectionType = sectionEl.dataset.sectionType || 'standard';
            // Support both inline input (Phase 2+) and span (legacy)
            const nameInput = sectionEl.querySelector('.section-name-input');
            const nameSpan = sectionEl.querySelector('.section-name');
            const name = (sectionType !== 'standard')
                ? (nameInput?.value?.trim() || nameSpan?.textContent?.trim() || null)
                : null;
            const description = sectionEl.querySelector('.section-description-input')?.value?.trim() || null;

            const exercises = [];
            sectionEl.querySelectorAll('.section-exercises .exercise-group-card').forEach(cardEl => {
                const groupId = cardEl.dataset.groupId;
                const data = window.exerciseGroupsData[groupId];
                if (!data) return;

                // Notes are collected separately via collectTemplateNotes()
                if (data.group_type === 'note') return;

                const isCardioGroup = data.group_type === 'cardio';

                // Cardio groups use activity_type as their primary identifier
                if (isCardioGroup) {
                    if (!data.cardio_config?.activity_type && !data.cardio_config?.duration_minutes) return;
                    const entry = {
                        exercise_id: groupId,
                        name: data.cardio_config?.activity_type || '',
                        alternates: [],
                        group_type: 'cardio',
                        sets: '', reps: '', rest: '',
                        default_weight: null,
                        default_weight_unit: data.default_weight_unit || 'lbs'
                    };
                    if (data.cardio_config) entry.cardio_config = data.cardio_config;
                    exercises.push(entry);
                    return;
                }

                const primaryName = data.exercises?.a || '';
                const alternates = [];
                Object.keys(data.exercises || {}).sort().forEach(key => {
                    if (key !== 'a' && data.exercises[key]) {
                        alternates.push(data.exercises[key]);
                    }
                });

                if (!primaryName && alternates.length === 0) return;

                exercises.push({
                    exercise_id: groupId,
                    name: primaryName,
                    alternates: alternates,
                    sets: data.sets || '3',
                    reps: data.reps || '8-12',
                    rest: data.rest || '60s',
                    default_weight: data.default_weight || null,
                    default_weight_unit: data.default_weight_unit || 'lbs'
                });
            });

            if (exercises.length > 0) {
                const entry = {
                    section_id: sectionId,
                    type: sectionType,
                    name: name,
                    description: description,
                    exercises: exercises
                };
                if (sectionType === 'tabata' && window.SectionDataCollector?._collectTabataConfig) {
                    entry.config = window.SectionDataCollector._collectTabataConfig(sectionEl);
                }
                sections.push(entry);
            }
        });

        console.log('📦 Collected', sections.length, 'sections');
        return sections;
    }
};

// Expose module
window.FormDataCollector = FormDataCollector;

// Backward-compat globals
window.collectExerciseGroups = FormDataCollector.collectExerciseGroups;
window.collectSections = FormDataCollector.collectSections.bind(FormDataCollector);

console.log('📦 FormDataCollector module loaded');
