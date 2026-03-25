/**
 * Section Data Collector Module
 * Handles serialization of section DOM state back to data objects
 * matching the backend WorkoutSection format.
 *
 * Extracted from SectionManager to separate data collection concerns.
 */
(function () {
    'use strict';

    const SectionDataCollector = {

        /**
         * Collect sections data from the current DOM state.
         * Walks section containers and reads exercise data from window.exerciseGroupsData.
         * Returns an array matching the backend WorkoutSection format.
         */
        // Keep in sync with FormDataCollector.collectSections()
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

                    // Cardio groups — include group_type and cardio_config
                    if (data.group_type === 'cardio') {
                        if (!data.cardio_config?.activity_type && !data.cardio_config?.duration_minutes) return;
                        exercises.push({
                            exercise_id: groupId,
                            name: data.cardio_config?.activity_type || '',
                            alternates: [],
                            group_type: 'cardio',
                            cardio_config: data.cardio_config,
                            sets: '', reps: '', rest: '',
                            default_weight: null,
                            default_weight_unit: data.default_weight_unit || 'lbs'
                        });
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

                    const entry = {
                        exercise_id: groupId,
                        name: primaryName,
                        alternates: alternates,
                        sets: data.sets || '3',
                        reps: data.reps || '8-12',
                        rest: data.rest || '60s',
                        default_weight: data.default_weight || null,
                        default_weight_unit: data.default_weight_unit || 'lbs'
                    };
                    if (data.interval_config) entry.interval_config = data.interval_config;
                    exercises.push(entry);
                });

                if (exercises.length > 0) {
                    sections.push({
                        section_id: sectionId,
                        type: sectionType,
                        name: name,
                        description: description,
                        exercises: exercises
                    });
                }
            });

            console.log('📦 Collected', sections.length, 'sections');
            return sections;
        }
    };

    // Expose globally
    window.SectionDataCollector = SectionDataCollector;

    console.log('📦 SectionDataCollector module loaded');
})();
