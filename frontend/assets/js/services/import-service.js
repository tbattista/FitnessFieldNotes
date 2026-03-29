/**
 * Import Service - Handles workout import parsing and builder population.
 * Sends raw content to backend parsers and populates the workout builder form.
 * @version 2.0.0
 */

window.importService = {

    /**
     * Parse raw text content via the backend API (regex parsers).
     * @param {string} content - Raw workout text (plain text, CSV, JSON)
     * @param {string} [formatHint] - Optional hint: 'text', 'csv', 'json'
     * @returns {Promise<Object>} ImportParseResponse
     */
    async parseText(content, formatHint) {
        const body = { content };
        if (formatHint) body.format_hint = formatHint;

        const response = await fetch('/api/v3/import/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Parse request failed' }));
            throw new Error(error.detail || `Server error: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Parse an uploaded text file via the backend API (regex parsers).
     * @param {File} file - The file to parse (.txt, .csv, .json)
     * @returns {Promise<Object>} ImportParseResponse
     */
    async parseFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/v3/import/parse-file', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'File parse failed' }));
            throw new Error(error.detail || `Server error: ${response.status}`);
        }

        return response.json();
    },

    // ── AI-powered methods ──────────────────────────────────────────

    /**
     * Parse text content using AI (Gemini).
     * @param {string} content - Text content to parse with AI
     * @returns {Promise<Object>} ImportParseResponse
     */
    async parseTextAI(content) {
        const body = { content };
        if (!window.authService?.currentUser) {
            body.anonymous_id = this._getAnonymousId();
        }

        const headers = { 'Content-Type': 'application/json' };
        await this._addAuthHeader(headers);

        const response = await fetch('/api/v3/import/parse-ai', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'AI parse failed' }));
            throw new Error(error.detail || `Server error: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Parse workout from a URL (extracts page content, then uses AI).
     * @param {string} url - URL to extract workout from
     * @returns {Promise<Object>} ImportParseResponse
     */
    async parseURL(url) {
        const body = { url };
        if (!window.authService?.currentUser) {
            body.anonymous_id = this._getAnonymousId();
        }

        const headers = { 'Content-Type': 'application/json' };
        await this._addAuthHeader(headers);

        const response = await fetch('/api/v3/import/parse-url', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'URL parse failed' }));
            throw new Error(error.detail || `Server error: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Parse workout from an uploaded image or PDF using AI.
     * @param {File} file - Image or PDF file
     * @returns {Promise<Object>} ImportParseResponse
     */
    async parseMedia(file) {
        const formData = new FormData();
        formData.append('file', file);

        if (!window.authService?.currentUser) {
            formData.append('anonymous_id', this._getAnonymousId());
        }

        const headers = {};
        await this._addAuthHeader(headers);

        const response = await fetch('/api/v3/import/parse-media', {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Media parse failed' }));
            throw new Error(error.detail || `Server error: ${response.status}`);
        }

        return response.json();
    },

    // ── Client-side helpers ─────────────────────────────────────────

    /**
     * Client-side image compression before upload.
     * @param {File} file - Original image file
     * @param {number} [maxSizeMB=4] - Max size in MB
     * @returns {Promise<File>} Compressed file (or original if already small enough)
     */
    async compressImage(file, maxSizeMB = 4) {
        const maxBytes = maxSizeMB * 1024 * 1024;
        if (file.size <= maxBytes) return file;

        return new Promise((resolve) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            img.onload = () => {
                let { width, height } = img;
                const maxDim = 2048;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        const compressed = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressed);
                    },
                    'image/jpeg',
                    0.85
                );

                URL.revokeObjectURL(img.src);
            };

            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                resolve(file); // Fall back to original
            };

            img.src = URL.createObjectURL(file);
        });
    },

    /**
     * Add auth header if user is authenticated.
     * @param {Object} headers - Headers object to augment
     */
    async _addAuthHeader(headers) {
        try {
            if (window.authService?.currentUser) {
                const token = await window.authService.getIdToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }
        } catch (e) {
            // Not authenticated, proceed without auth
        }
    },

    /**
     * Get or create anonymous ID for rate limiting.
     * @returns {string} Anonymous user identifier
     */
    _getAnonymousId() {
        let id = localStorage.getItem('ffn_anonymous_id');
        if (!id) {
            id = 'anon-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('ffn_anonymous_id', id);
        }
        return id;
    },

    // ── Builder population ──────────────────────────────────────────

    /**
     * Populate the workout builder form with parsed workout data.
     * Follows the same pattern as loadWorkoutIntoEditor() but for NEW imported workouts.
     * Works in both mobile and desktop views (desktop-view-adapter swaps createExerciseGroupCard).
     * @param {Object} workoutData - Parsed workout data (WorkoutTemplate-compatible)
     */
    populateBuilder(workoutData) {
        console.log('📥 Populating builder with imported workout:', workoutData.name);

        // 1. Set builder state for a NEW unsaved workout
        window.ffn.workoutBuilder.selectedWorkoutId = null;
        window.ffn.workoutBuilder.isEditing = true;
        window.ffn.workoutBuilder.isDirty = true;
        window.ffn.workoutBuilder.currentWorkout = { ...workoutData };

        // Clear localStorage editing state (this is a new import, not a refresh recovery)
        try {
            localStorage.removeItem('currentEditingWorkoutId');
        } catch (e) { /* ignore */ }

        // 2. Populate form fields (canonical IDs — work in both views via ID swap)
        document.getElementById('workoutName').value = workoutData.name || '';
        document.getElementById('workoutDescription').value = workoutData.description || '';
        document.getElementById('workoutTags').value = (workoutData.tags || []).join(', ');

        // 3. Clear and rebuild exercise groups
        const container = document.getElementById('exerciseGroups');
        container.innerHTML = '';
        window.exerciseGroupsData = {};

        const groups = workoutData.exercise_groups || [];
        if (groups.length > 0) {
            const totalCards = groups.length;
            groups.forEach((group, index) => {
                const groupId = `group-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                const groupNumber = index + 1;

                // desktop-view-adapter.js overrides window.createExerciseGroupCard
                // to call desktopCardRenderer.createExerciseGroupRow() on desktop
                const cardHtml = window.createExerciseGroupCard(groupId, group, groupNumber, index, totalCards);
                container.insertAdjacentHTML('beforeend', cardHtml);

                // Store data in memory for save/collect
                window.exerciseGroupsData[groupId] = {
                    exercises: group.exercises || { a: '', b: '', c: '' },
                    sets: group.sets || '3',
                    reps: group.reps || '8-12',
                    rest: group.rest || '60s',
                    default_weight: group.default_weight || '',
                    default_weight_unit: group.default_weight_unit || 'lbs',
                    block_id: group.block_id || null,
                    group_name: group.group_name || null,
                };
            });
        } else {
            // No exercises parsed — add one empty group
            if (typeof addExerciseGroup === 'function') {
                addExerciseGroup();
            }
        }

        // 4. Handle template notes (imports typically have none)
        window.ffn.workoutBuilder.currentWorkout.template_notes = workoutData.template_notes || [];

        // 5. Show editor form, hide empty state
        document.getElementById('workoutEditorEmptyState').style.display = 'none';
        document.getElementById('workoutEditorForm').style.display = 'block';

        // Hide delete button (new workout, nothing to delete yet)
        const deleteBtn = document.getElementById('deleteWorkoutBtn');
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }

        // 6. Update save status
        if (typeof updateSaveStatus === 'function') {
            updateSaveStatus('unsaved');
        }

        // 7. Collapse workout library if expanded
        const expandedContent = document.getElementById('workoutLibraryExpandedContent');
        if (expandedContent && expandedContent.style.display !== 'none') {
            if (typeof toggleWorkoutLibraryContent === 'function') {
                toggleWorkoutLibraryContent();
            }
        }

        // 8. Initialize UI features (staggered timeouts match loadWorkoutIntoEditor pattern)
        if (window.initializeExerciseAutocompletesWithAutoCreate) {
            setTimeout(() => window.initializeExerciseAutocompletesWithAutoCreate(), 100);
        } else if (window.initializeExerciseAutocompletes) {
            setTimeout(() => window.initializeExerciseAutocompletes(), 100);
        }

        if (window.initializeExerciseGroupSorting) {
            setTimeout(() => window.initializeExerciseGroupSorting(), 150);
        }

        if (window.builderCardMenu?.updateAllMenuBoundaries) {
            setTimeout(() => window.builderCardMenu.updateAllMenuBoundaries(), 200);
        }

        // Update exercise previews
        setTimeout(() => {
            const groupElements = document.querySelectorAll('#exerciseGroups .exercise-group');
            groupElements.forEach(group => {
                if (window.updateExerciseGroupPreview) {
                    window.updateExerciseGroupPreview(group);
                }
            });
        }, 200);

        // Update metadata button states
        if (window.updateMetadataButtonStates) {
            setTimeout(() => window.updateMetadataButtonStates(), 250);
        }

        // Update muscle group summary
        setTimeout(() => {
            if (window.updateMuscleSummary) {
                window.updateMuscleSummary();
            }
        }, 300);

        // Apply block grouping for imported exercises with block_id
        setTimeout(() => {
            if (window.applyBlockGrouping) {
                window.applyBlockGrouping();
            }
        }, 350);

        // 10. Store extracted session date/time from AI (if available)
        if (workoutData.session_date || workoutData.session_time) {
            const importedSessionMeta = {
                session_date: workoutData.session_date || null,
                session_time: workoutData.session_time || null
            };
            sessionStorage.setItem('ffn_imported_session_datetime', JSON.stringify(importedSessionMeta));
            console.log('📅 AI extracted session date/time:', importedSessionMeta);

            // Show a notice to the user
            setTimeout(() => {
                const dateStr = workoutData.session_date || '';
                const timeStr = workoutData.session_time || '';
                const displayParts = [];
                if (dateStr) displayParts.push(dateStr);
                if (timeStr) displayParts.push(timeStr);
                if (displayParts.length > 0 && window.showToast) {
                    window.showToast(`Detected workout date: ${displayParts.join(' ')}`, 'info');
                }
            }, 500);
        } else {
            sessionStorage.removeItem('ffn_imported_session_datetime');
        }

        console.log('✅ Import populated into builder');
    },
};

console.log('📦 ImportService v2.0.0 loaded');
