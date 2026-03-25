/**
 * Desktop Card Data Module
 * Static utility methods for getting/setting field values and converting card types.
 * Extracted from DesktopCardRenderer for modularity.
 * @version 1.0.0
 */
(function() {
    'use strict';

    class DesktopCardData {

        // =========================================
        // Field Value Get/Set
        // =========================================

        static getFieldValue(groupId, field) {
            const data = window.exerciseGroupsData[groupId];
            if (!data) return '';

            switch (field) {
                case 'exercise-a': return data.exercises.a || '';
                case 'exercise-b': return data.exercises.b || '';
                case 'exercise-c': return data.exercises.c || '';
                case 'protocol': {
                    const s = data.sets || '';
                    const r = data.reps || '';
                    if (s && r) return `${s}×${r}`;
                    return s || r || '';
                }
                case 'rest': return data.rest || '';
                case 'weight': return data.default_weight || '';
                // Cardio fields
                case 'activity-name': return data.cardio_config?.activity_type || '';
                case 'duration': return data.cardio_config?.duration_minutes ? String(data.cardio_config.duration_minutes) : '';
                case 'distance': return data.cardio_config?.distance ? String(data.cardio_config.distance) : '';
                case 'pace': return data.cardio_config?.target_pace || '';
                case 'rpe': return data.cardio_config?.target_rpe ? String(data.cardio_config.target_rpe) : '';
                case 'heart_rate': return data.cardio_config?.target_heart_rate ? String(data.cardio_config.target_heart_rate) : '';
                case 'calories': return data.cardio_config?.target_calories ? String(data.cardio_config.target_calories) : '';
                case 'elevation': return data.cardio_config?.elevation_gain ? String(data.cardio_config.elevation_gain) : '';
                case 'cadence': return data.cardio_config?.activity_details?.cadence ? String(data.cardio_config.activity_details.cadence) : '';
                case 'stroke_rate': return data.cardio_config?.activity_details?.stroke_rate ? String(data.cardio_config.activity_details.stroke_rate) : '';
                case 'laps': return data.cardio_config?.activity_details?.laps ? String(data.cardio_config.activity_details.laps) : '';
                case 'incline': return data.cardio_config?.activity_details?.incline ? String(data.cardio_config.activity_details.incline) : '';
                case 'notes': return data.cardio_config?.notes || '';
                default: return '';
            }
        }

        static setFieldValue(groupId, field, value) {
            const data = window.exerciseGroupsData[groupId];
            if (!data) return;

            switch (field) {
                case 'exercise-a': data.exercises.a = value; break;
                case 'exercise-b': data.exercises.b = value; break;
                case 'exercise-c': data.exercises.c = value; break;
                case 'protocol': {
                    const xPattern = /(\d+)\s*[x×]\s*(.+)/i;
                    const setsPattern = /(\d+)\s*set/i;
                    const xMatch = value.match(xPattern);
                    if (xMatch) {
                        data.sets = xMatch[1];
                        data.reps = xMatch[2];
                    } else {
                        const setsMatch = value.match(setsPattern);
                        if (setsMatch) {
                            data.sets = setsMatch[1];
                            data.reps = 'varies';
                        } else {
                            data.sets = '1';
                            data.reps = value;
                        }
                    }
                    break;
                }
                case 'rest': data.rest = value; break;
                case 'weight':
                    data.default_weight = value;
                    if (value && !data.default_weight_unit) data.default_weight_unit = 'lbs';
                    break;
                // Cardio fields
                case 'activity-name':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.activity_type = value;
                    break;
                case 'duration':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.duration_minutes = value ? parseInt(value, 10) || null : null;
                    break;
                case 'distance':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.distance = value ? parseFloat(value) || null : null;
                    break;
                case 'pace':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.target_pace = value;
                    break;
                case 'rpe':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.target_rpe = value ? parseInt(value, 10) || null : null;
                    break;
                case 'heart_rate':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.target_heart_rate = value ? parseInt(value, 10) || null : null;
                    break;
                case 'calories':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.target_calories = value ? parseInt(value, 10) || null : null;
                    break;
                case 'elevation':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.elevation_gain = value ? parseFloat(value) || null : null;
                    break;
                case 'cadence':
                    if (!data.cardio_config) data.cardio_config = {};
                    if (!data.cardio_config.activity_details) data.cardio_config.activity_details = {};
                    data.cardio_config.activity_details.cadence = value ? parseInt(value, 10) || null : null;
                    break;
                case 'stroke_rate':
                    if (!data.cardio_config) data.cardio_config = {};
                    if (!data.cardio_config.activity_details) data.cardio_config.activity_details = {};
                    data.cardio_config.activity_details.stroke_rate = value ? parseInt(value, 10) || null : null;
                    break;
                case 'laps':
                    if (!data.cardio_config) data.cardio_config = {};
                    if (!data.cardio_config.activity_details) data.cardio_config.activity_details = {};
                    data.cardio_config.activity_details.laps = value ? parseInt(value, 10) || null : null;
                    break;
                case 'incline':
                    if (!data.cardio_config) data.cardio_config = {};
                    if (!data.cardio_config.activity_details) data.cardio_config.activity_details = {};
                    data.cardio_config.activity_details.incline = value ? parseFloat(value) || null : null;
                    break;
                case 'notes':
                    if (!data.cardio_config) data.cardio_config = {};
                    data.cardio_config.notes = value;
                    break;
            }
        }

        static getPlaceholder(field) {
            // Check ActivityDisplayConfig first (covers all cardio fields)
            const def = window.ActivityDisplayConfig?.getFieldDef(field);
            if (def) return def.placeholder;

            switch (field) {
                case 'protocol': return '3×10';
                case 'rest': return '60s';
                case 'weight': return 'lbs';
                default: return '';
            }
        }

        // =========================================
        // Type Conversion
        // =========================================

        /**
         * Convert a card from one type to another.
         * Re-renders the row in-place.
         * @param {string} groupId - The group/note ID
         * @param {string} fromType - Current type: 'exercise' | 'note' | 'cardio'
         * @param {string} toType - Target type
         */
        static convertCardType(groupId, fromType, toType) {
            if (fromType === toType) return;

            const row = document.querySelector(`.desktop-activity-row[data-group-id="${groupId}"]`);
            if (!row) return;

            const data = window.exerciseGroupsData[groupId];
            if (!data) return;

            const renderer = window.desktopCardRenderer;
            let newHtml = '';

            if (fromType === 'exercise' && toType === 'cardio') {
                const doConvertToCardio = () => {
                    const name = data.exercises.a || '';
                    let activityType = '';
                    if (name && window.ActivityTypeRegistry) {
                        const allTypes = window.ActivityTypeRegistry.getAll();
                        const match = allTypes.find(t => t.name.toLowerCase() === name.toLowerCase() || t.id === name.toLowerCase());
                        if (match) activityType = match.id;
                    }

                    data.group_type = 'cardio';
                    data.exercises = { a: '' };
                    data.sets = ''; data.reps = ''; data.rest = '';
                    data.default_weight = ''; data.default_weight_unit = 'lbs';
                    data.note_content = undefined;
                    data.cardio_config = {
                        activity_type: activityType || name,
                        duration_minutes: null, distance: null,
                        distance_unit: 'mi', target_pace: '',
                        activity_details: {}, notes: ''
                    };
                    const html = renderer.createCardioRow(groupId, data);
                    row.outerHTML = html;
                    if (window.markEditorDirty) window.markEditorDirty();
                    if (window.applyBlockGrouping) window.applyBlockGrouping();
                };

                if (data.exercises.a) {
                    ffnModalManager.confirm('Convert to Activity', 'Converting to Activity will replace sets, reps, rest, and weight with activity fields. Continue?', doConvertToCardio, { confirmText: 'Convert', confirmClass: 'btn-warning', size: 'sm' });
                    return;
                }
                doConvertToCardio();
                return;

            } else if (fromType === 'exercise' && toType === 'note') {
                const doConvertExToNote = () => {
                    data.group_type = 'note';
                    data.note_content = data.exercises.a || '';
                    data.exercises = { a: '' };
                    data.sets = ''; data.reps = ''; data.rest = '';
                    data.default_weight = ''; data.default_weight_unit = 'lbs';
                    const html = renderer.createNoteRow(groupId, data);
                    row.outerHTML = html;
                    if (window.markEditorDirty) window.markEditorDirty();
                    if (window.applyBlockGrouping) window.applyBlockGrouping();
                };

                if (data.exercises.a) {
                    ffnModalManager.confirm('Convert to Note', 'Converting to Note will remove all exercise data. Continue?', doConvertExToNote, { confirmText: 'Convert', confirmClass: 'btn-warning', size: 'sm' });
                    return;
                }
                doConvertExToNote();
                return;

            } else if (fromType === 'cardio' && toType === 'exercise') {
                const activityName = data.cardio_config?.activity_type || '';
                let exerciseName = activityName;
                if (activityName && window.ActivityTypeRegistry) {
                    const type = window.ActivityTypeRegistry.getById(activityName);
                    if (type && type.name !== activityName) exerciseName = type.name;
                }

                data.group_type = 'standard';
                data.exercises = { a: exerciseName, b: '', c: '' };
                data.sets = '3'; data.reps = '8-12'; data.rest = '60s';
                data.default_weight = ''; data.default_weight_unit = 'lbs';
                data.cardio_config = null;
                data.note_content = undefined;
                newHtml = renderer.createExerciseGroupRow(groupId, data);

            } else if (fromType === 'cardio' && toType === 'note') {
                ffnModalManager.confirm('Convert to Note', 'Converting to Note will remove all activity data. Continue?', () => {
                    const activityName = data.cardio_config?.activity_type || '';
                    let content = activityName;
                    if (activityName && window.ActivityTypeRegistry) {
                        content = window.ActivityTypeRegistry.getName(activityName) || activityName;
                    }

                    data.group_type = 'note';
                    data.note_content = content;
                    data.exercises = { a: '' };
                    data.sets = ''; data.reps = ''; data.rest = '';
                    data.cardio_config = null;
                    const html = renderer.createNoteRow(groupId, data);
                    row.outerHTML = html;
                    if (window.markEditorDirty) window.markEditorDirty();
                    if (window.applyBlockGrouping) window.applyBlockGrouping();
                }, { confirmText: 'Convert', confirmClass: 'btn-warning', size: 'sm' });
                return;

            } else if (fromType === 'note' && toType === 'exercise') {
                const content = data.note_content || '';

                data.group_type = 'standard';
                data.exercises = { a: content, b: '', c: '' };
                data.sets = '3'; data.reps = '8-12'; data.rest = '60s';
                data.default_weight = ''; data.default_weight_unit = 'lbs';
                data.note_content = undefined;
                newHtml = renderer.createExerciseGroupRow(groupId, data);

            } else if (fromType === 'note' && toType === 'cardio') {
                const content = data.note_content || '';

                let activityType = '';
                if (content && window.ActivityTypeRegistry) {
                    const allTypes = window.ActivityTypeRegistry.getAll();
                    const match = allTypes.find(t => t.name.toLowerCase() === content.toLowerCase());
                    if (match) activityType = match.id;
                }

                data.group_type = 'cardio';
                data.exercises = { a: '' };
                data.sets = ''; data.reps = ''; data.rest = '';
                data.note_content = undefined;
                data.cardio_config = {
                    activity_type: activityType || content,
                    duration_minutes: null, distance: null,
                    distance_unit: 'mi', target_pace: '',
                    activity_details: {}, notes: ''
                };
                newHtml = renderer.createCardioRow(groupId, data);
            }

            if (newHtml) {
                row.insertAdjacentHTML('afterend', newHtml);
                row.remove();
                if (window.markEditorDirty) window.markEditorDirty();
                if (window.applyBlockGrouping) window.applyBlockGrouping();
            }
        }
    }

    window.DesktopCardData = DesktopCardData;

    console.log('📦 Desktop Card Data module loaded');
})();
