/**
 * Ghost Gym - Programs Page Filters
 * Filtering, sorting, and tag filter logic for the programs page
 * Extracted from programs-page.js for modularity
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Sort options constant (shared with main controller)
    const SORT_OPTIONS = [
        { value: 'modified_date', label: 'Newest', icon: 'bx-sort-alt-2' },
        { value: 'created_date', label: 'Created', icon: 'bx-calendar-plus' },
        { value: 'name', label: 'A-Z', icon: 'bx-sort-a-z' }
    ];

    /**
     * Filter programs based on filter state
     * @param {Array} programs - All programs
     * @param {Object} filters - Filter state { search, difficulty, tags }
     * @returns {Array} Filtered programs
     */
    function filterPrograms(programs, filters) {
        let filtered = [...programs];

        // Apply search filter
        const searchTerm = (filters.search || '').toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(program => {
                const nameMatch = (program.name || '').toLowerCase().includes(searchTerm);
                const descMatch = (program.description || '').toLowerCase().includes(searchTerm);
                const tagMatch = (program.tags || []).some(t => t.toLowerCase().includes(searchTerm));
                return nameMatch || descMatch || tagMatch;
            });
        }

        // Apply difficulty filter
        if (filters.difficulty) {
            filtered = filtered.filter(p => p.difficulty_level === filters.difficulty);
        }

        // Apply tag filters
        if (filters.tags && filters.tags.length > 0) {
            filtered = filtered.filter(program =>
                filters.tags.some(tag => (program.tags || []).includes(tag))
            );
        }

        return filtered;
    }

    /**
     * Sort programs by a given field and order
     * @param {Array} programs - Programs to sort (mutates array)
     * @param {string} sortBy - Sort field: 'name', 'created_date', 'modified_date'
     * @param {string} sortOrder - 'asc' or 'desc'
     * @returns {Array} Sorted programs
     */
    function sortPrograms(programs, sortBy, sortOrder) {
        sortOrder = sortOrder || 'desc';

        return programs.sort((a, b) => {
            let aVal, bVal;

            switch (sortBy) {
                case 'name':
                    aVal = (a.name || '').toLowerCase();
                    bVal = (b.name || '').toLowerCase();
                    return sortOrder === 'asc'
                        ? aVal.localeCompare(bVal)
                        : bVal.localeCompare(aVal);
                case 'created_date':
                    aVal = new Date(a.created_date || 0).getTime();
                    bVal = new Date(b.created_date || 0).getTime();
                    break;
                case 'modified_date':
                default:
                    aVal = new Date(a.modified_date || 0).getTime();
                    bVal = new Date(b.modified_date || 0).getTime();
                    break;
            }

            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });
    }

    /**
     * Cycle to next sort option
     * @param {number} currentIndex - Current sort option index
     * @returns {Object} { index, sortBy, sortOrder, label }
     */
    function cycleSort(currentIndex) {
        const nextIndex = (currentIndex + 1) % SORT_OPTIONS.length;
        const option = SORT_OPTIONS[nextIndex];

        return {
            index: nextIndex,
            sortBy: option.value,
            sortOrder: option.value === 'name' ? 'asc' : 'desc',
            label: option.label
        };
    }

    /**
     * Get default/cleared filter state
     * @returns {Object} Default filter state
     */
    function getDefaultFilters() {
        return {
            search: '',
            tags: [],
            difficulty: null,
            sortBy: 'modified_date',
            sortOrder: 'desc'
        };
    }

    /**
     * Render tag filter chips into a container
     * @param {HTMLElement} container - Container element
     * @param {Array} programs - All programs (to count tags)
     * @param {Array} activeTags - Currently active tag filters
     * @param {Function} onToggle - Callback when tag is toggled: (tag, isActive) => {}
     */
    function renderTagFilters(container, programs, activeTags, onToggle) {
        if (!container) return;

        // Collect all tags
        const tagCounts = {};
        programs.forEach(program => {
            (program.tags || []).forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });

        const tags = Object.keys(tagCounts).sort();

        if (tags.length === 0) {
            container.innerHTML = '<p class="text-muted small mb-0">No tags available</p>';
            return;
        }

        container.innerHTML = tags.map(tag => `
            <label class="tag-filter-chip ${activeTags.includes(tag) ? 'active' : ''}"
                   data-tag="${tag}">
                ${tag} (${tagCounts[tag]})
            </label>
        `).join('');

        // Attach listeners
        container.querySelectorAll('.tag-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const tag = chip.dataset.tag;
                const isActive = chip.classList.contains('active');

                if (isActive) {
                    chip.classList.remove('active');
                } else {
                    chip.classList.add('active');
                }

                if (onToggle) onToggle(tag, !isActive);
            });
        });
    }

    // Export
    window.ProgramsPageFilters = {
        SORT_OPTIONS: SORT_OPTIONS,
        filterPrograms: filterPrograms,
        sortPrograms: sortPrograms,
        cycleSort: cycleSort,
        getDefaultFilters: getDefaultFilters,
        renderTagFilters: renderTagFilters
    };

    console.log('📦 Programs Page Filters module loaded');

})();
