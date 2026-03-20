/**
 * Ghost Gym - Program Grid Component
 * Manages a grid of program cards with pagination and state management
 * Follows WorkoutGrid patterns for consistency
 * @version 1.0.0
 */

class ProgramGrid {
    constructor(containerId, config = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container element with id "${containerId}" not found`);
        }

        this.config = {
            // Card configuration
            cardConfig: {},

            // Pagination
            pageSize: 20,
            showPagination: true,

            // Empty state
            emptyIcon: 'bx-folder-open',
            emptyTitle: 'No programs found',
            emptyMessage: 'Create your first program to organize your workouts',
            emptyAction: null,

            // Loading state
            loadingMessage: 'Loading programs...',

            // Workouts reference for calculating stats
            workouts: [],

            // Callbacks
            onPageChange: null,
            onSelectionChange: null,

            ...config
        };

        // State
        this.programs = [];
        this.currentPage = 1;
        this.cards = [];
        this.selectedIds = new Set();

        // DOM elements
        this.elements = {};

        this.initialize();
    }

    /**
     * Initialize the grid
     */
    initialize() {
        this.createStructure();
    }

    /**
     * Create grid structure
     */
    createStructure() {
        this.container.innerHTML = `
            <div class="program-grid-wrapper">
                <!-- Loading State -->
                <div class="program-grid-loading" style="display: none;">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;">
                            <span class="visually-hidden">${this.config.loadingMessage}</span>
                        </div>
                        <h5 class="mt-3">${this.config.loadingMessage}</h5>
                    </div>
                </div>

                <!-- Empty State -->
                <div class="program-grid-empty" style="display: none;">
                    <div class="text-center py-5">
                        <i class="bx ${this.config.emptyIcon} display-1 text-muted"></i>
                        <h5 class="mt-3">${this.config.emptyTitle}</h5>
                        <p class="text-muted">${this.config.emptyMessage}</p>
                        ${this.config.emptyAction ? `
                            <button class="btn btn-primary mt-2" id="emptyActionBtn">
                                <i class="bx ${this.config.emptyAction.icon || 'bx-plus'} me-1"></i>${this.config.emptyAction.label}
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Grid Container -->
                <div class="program-grid-content" style="display: none;">
                    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3" id="programCardsGrid">
                        <!-- Cards will be inserted here -->
                    </div>
                </div>

                <!-- Pagination -->
                ${this.config.showPagination ? `
                <div class="program-grid-pagination mt-4" style="display: none;">
                    <nav aria-label="Program pagination">
                        <ul class="pagination pagination-sm justify-content-center" id="programPaginationList">
                            <!-- Pagination will be inserted here -->
                        </ul>
                    </nav>
                </div>
                ` : ''}

                <!-- Selection Action Bar (for batch operations) -->
                <div class="selection-action-bar" id="selectionActionBar">
                    <div class="selection-info">
                        <button class="btn-close-selection" onclick="window.programGrid?.clearSelection()">×</button>
                        <span class="selection-count" id="selectionCount">0 selected</span>
                    </div>
                    <button class="btn-batch-delete" id="batchDeleteBtn">
                        <i class="bx bx-trash"></i>
                        Delete
                    </button>
                </div>
            </div>
        `;

        // Cache DOM elements
        this.elements = {
            loading: this.container.querySelector('.program-grid-loading'),
            empty: this.container.querySelector('.program-grid-empty'),
            content: this.container.querySelector('.program-grid-content'),
            grid: this.container.querySelector('#programCardsGrid'),
            pagination: this.container.querySelector('.program-grid-pagination'),
            paginationList: this.container.querySelector('#programPaginationList'),
            selectionBar: this.container.querySelector('#selectionActionBar'),
            selectionCount: this.container.querySelector('#selectionCount'),
            batchDeleteBtn: this.container.querySelector('#batchDeleteBtn')
        };

        // Attach empty action listener
        if (this.config.emptyAction) {
            const emptyActionBtn = this.container.querySelector('#emptyActionBtn');
            if (emptyActionBtn) {
                emptyActionBtn.addEventListener('click', () => {
                    this.config.emptyAction.onClick();
                });
            }
        }

        // Attach batch delete listener
        if (this.elements.batchDeleteBtn) {
            this.elements.batchDeleteBtn.addEventListener('click', () => {
                if (this.config.onBatchDelete) {
                    this.config.onBatchDelete(Array.from(this.selectedIds));
                }
            });
        }
    }

    /**
     * Set program data
     * @param {Array} programs
     */
    setData(programs) {
        this.programs = programs;
        this.currentPage = 1;
        this.render();
    }

    /**
     * Set workouts reference (for program stats calculation)
     * @param {Array} workouts
     */
    setWorkouts(workouts) {
        this.config.workouts = workouts;
        this.config.cardConfig.workouts = workouts;
    }

    /**
     * Set current page
     * @param {number} page
     */
    setPage(page) {
        const totalPages = this.getTotalPages();
        if (page < 1 || page > totalPages) return;

        this.currentPage = page;
        this.render();

        // Scroll to top of grid
        this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (this.config.onPageChange) {
            this.config.onPageChange(page);
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.elements.loading.style.display = 'block';
        this.elements.empty.style.display = 'none';
        this.elements.content.style.display = 'none';
        if (this.elements.pagination) {
            this.elements.pagination.style.display = 'none';
        }
        this.hideSelectionBar();
    }

    /**
     * Show empty state
     * @param {string} title - Optional custom title
     * @param {string} message - Optional custom message
     * @param {boolean} showAction - Whether to show the action button
     */
    showEmpty(title = null, message = null, showAction = true) {
        this.elements.loading.style.display = 'none';
        this.elements.empty.style.display = 'block';
        this.elements.content.style.display = 'none';
        if (this.elements.pagination) {
            this.elements.pagination.style.display = 'none';
        }
        this.hideSelectionBar();

        // Update empty state text if provided
        if (title) {
            const titleEl = this.elements.empty.querySelector('h5');
            if (titleEl) titleEl.textContent = title;
        }
        if (message) {
            const messageEl = this.elements.empty.querySelector('p');
            if (messageEl) messageEl.textContent = message;
        }

        // Show/hide action button
        const actionBtn = this.elements.empty.querySelector('#emptyActionBtn');
        if (actionBtn) {
            actionBtn.style.display = showAction ? 'inline-block' : 'none';
        }
    }

    /**
     * Show content
     */
    showContent() {
        this.elements.loading.style.display = 'none';
        this.elements.empty.style.display = 'none';
        this.elements.content.style.display = 'block';
        if (this.elements.pagination && this.getTotalPages() > 1) {
            this.elements.pagination.style.display = 'block';
        }
    }

    /**
     * Render the grid
     */
    render() {
        // Show appropriate state
        if (this.programs.length === 0) {
            this.showEmpty();
            return;
        }

        this.showContent();
        this.renderCards();
        this.renderPagination();
    }

    /**
     * Render program cards
     */
    renderCards() {
        // Clear existing cards
        this.cards.forEach(card => card.destroy());
        this.cards = [];
        this.elements.grid.innerHTML = '';

        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.config.pageSize;
        const endIndex = startIndex + this.config.pageSize;
        const pagePrograms = this.programs.slice(startIndex, endIndex);

        // Create and render cards
        const activeProgramId = localStorage.getItem('ffn_active_program_id');
        pagePrograms.forEach(program => {
            const cardConfig = {
                ...this.config.cardConfig,
                workouts: this.config.workouts,
                isSelected: this.selectedIds.has(program.id),
                isActiveProgram: program.id === activeProgramId,
                onSelectionChange: (programId, isSelected) => {
                    this.handleSelectionChange(programId, isSelected);
                }
            };

            const card = new ProgramCard(program, cardConfig);
            const cardElement = card.render();

            // Wrap card in column div for Bootstrap grid
            const colWrapper = document.createElement('div');
            colWrapper.className = 'col';
            colWrapper.appendChild(cardElement);

            this.elements.grid.appendChild(colWrapper);
            this.cards.push(card);
        });
    }

    /**
     * Handle card selection change
     * @param {string} programId
     * @param {boolean} isSelected
     */
    handleSelectionChange(programId, isSelected) {
        if (isSelected) {
            this.selectedIds.add(programId);
        } else {
            this.selectedIds.delete(programId);
        }

        this.updateSelectionBar();

        if (this.config.onSelectionChange) {
            this.config.onSelectionChange(programId, isSelected, this.selectedIds.size);
        }
    }

    /**
     * Update selection action bar visibility and count
     */
    updateSelectionBar() {
        const count = this.selectedIds.size;

        if (count > 0 && this.config.cardConfig.deleteMode) {
            this.elements.selectionBar.classList.add('active');
            this.elements.selectionCount.textContent = `${count} selected`;
        } else {
            this.hideSelectionBar();
        }
    }

    /**
     * Hide selection action bar
     */
    hideSelectionBar() {
        if (this.elements.selectionBar) {
            this.elements.selectionBar.classList.remove('active');
        }
    }

    /**
     * Render pagination
     */
    renderPagination() {
        if (!this.config.showPagination || !this.elements.paginationList) return;

        const totalPages = this.getTotalPages();

        if (totalPages <= 1) {
            if (this.elements.pagination) {
                this.elements.pagination.style.display = 'none';
            }
            return;
        }

        if (this.elements.pagination) {
            this.elements.pagination.style.display = 'block';
        }

        let html = '';

        // Previous button
        html += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0);" data-page="${this.currentPage - 1}" aria-label="Previous">
                    <i class="bx bx-chevron-left"></i>
                </a>
            </li>
        `;

        // Page numbers (show max 5 pages)
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="javascript:void(0);" data-page="${i}">${i}</a>
                </li>
            `;
        }

        // Next button
        html += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0);" data-page="${this.currentPage + 1}" aria-label="Next">
                    <i class="bx bx-chevron-right"></i>
                </a>
            </li>
        `;

        this.elements.paginationList.innerHTML = html;

        // Attach pagination listeners
        this.elements.paginationList.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = parseInt(link.dataset.page);
                if (page >= 1 && page <= totalPages && page !== this.currentPage) {
                    this.setPage(page);
                }
            });
        });
    }

    /**
     * Refresh the grid (re-render current page)
     */
    refresh() {
        this.render();
    }

    /**
     * Update card configuration
     * @param {Object} cardConfig
     */
    updateCardConfig(cardConfig) {
        this.config.cardConfig = { ...this.config.cardConfig, ...cardConfig };
        this.refresh();
    }

    /**
     * Set delete mode for all cards
     * @param {boolean} enabled
     */
    setDeleteMode(enabled) {
        console.log('🗑️ ProgramGrid.setDeleteMode:', enabled, 'cards count:', this.cards.length);
        this.config.cardConfig.deleteMode = enabled;

        if (!enabled) {
            this.clearSelection();
        }

        this.cards.forEach((card, index) => {
            console.log(`🗑️ Calling card[${index}].setDeleteMode:`, enabled);
            card.setDeleteMode(enabled);
        });
    }

    /**
     * Clear all card selections
     */
    clearSelection() {
        this.selectedIds.clear();

        this.cards.forEach(card => {
            card.config.isSelected = false;
            const checkbox = card.element?.querySelector('.program-select-checkbox');
            if (checkbox) checkbox.checked = false;

            const cardEl = card.element?.querySelector('.card');
            if (cardEl) cardEl.classList.remove('selected');
        });

        this.hideSelectionBar();
    }

    /**
     * Get IDs of all selected cards
     * @returns {Array<string>}
     */
    getSelectedIds() {
        return Array.from(this.selectedIds);
    }

    /**
     * Get current page
     * @returns {number}
     */
    getCurrentPage() {
        return this.currentPage;
    }

    /**
     * Get total pages
     * @returns {number}
     */
    getTotalPages() {
        return Math.ceil(this.programs.length / this.config.pageSize);
    }

    /**
     * Get displayed programs
     * @returns {Array}
     */
    getDisplayedData() {
        const startIndex = (this.currentPage - 1) * this.config.pageSize;
        const endIndex = startIndex + this.config.pageSize;
        return this.programs.slice(startIndex, endIndex);
    }

    /**
     * Get all programs
     * @returns {Array}
     */
    getAllData() {
        return this.programs;
    }

    /**
     * Find a program by ID
     * @param {string} programId
     * @returns {Object|null}
     */
    findProgram(programId) {
        return this.programs.find(p => p.id === programId) || null;
    }

    /**
     * Remove a program from the grid
     * @param {string} programId
     */
    removeProgram(programId) {
        this.programs = this.programs.filter(p => p.id !== programId);
        this.selectedIds.delete(programId);

        // Adjust current page if needed
        const totalPages = this.getTotalPages();
        if (this.currentPage > totalPages && totalPages > 0) {
            this.currentPage = totalPages;
        }

        this.render();
    }

    /**
     * Remove multiple programs from the grid
     * @param {Array<string>} programIds
     */
    removePrograms(programIds) {
        const idsToRemove = new Set(programIds);
        this.programs = this.programs.filter(p => !idsToRemove.has(p.id));

        programIds.forEach(id => this.selectedIds.delete(id));

        // Adjust current page if needed
        const totalPages = this.getTotalPages();
        if (this.currentPage > totalPages && totalPages > 0) {
            this.currentPage = totalPages;
        }

        this.render();
    }

    /**
     * Destroy the grid
     */
    destroy() {
        this.cards.forEach(card => card.destroy());
        this.cards = [];
        this.container.innerHTML = '';
    }
}

// Export for global use
window.ProgramGrid = ProgramGrid;

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgramGrid;
}

console.log('📦 ProgramGrid component loaded');
