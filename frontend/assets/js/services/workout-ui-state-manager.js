/**
 * Ghost Gym - Workout UI State Manager
 * Centralized management of loading, error, and UI states for workout mode
 * @version 1.0.0
 * @date 2025-01-05
 */

class WorkoutUIStateManager {
    /**
     * @param {Object} containerIds - DOM element IDs for state containers
     * @param {string} containerIds.loading - Loading state container ID
     * @param {string} containerIds.error - Error state container ID
     * @param {string} containerIds.loadingMessage - Loading message element ID
     * @param {string} containerIds.errorMessage - Error message element ID
     * @param {string} containerIds.content - Main content container ID
     * @param {string} containerIds.footer - Footer container ID
     * @param {string} containerIds.header - Header container ID (optional)
     */
    constructor(containerIds) {
        this.containerIds = containerIds;
        console.log('🎨 Workout UI State Manager initialized');
    }
    
    // ==================== Loading States ====================
    
    /**
     * Show loading state with optional message
     * @param {string} message - Loading message to display
     */
    showLoading(message = 'Loading...') {
        const loading = document.getElementById(this.containerIds.loading);
        const error = document.getElementById(this.containerIds.error);
        const content = document.getElementById(this.containerIds.content);
        const footer = document.getElementById(this.containerIds.footer);
        const header = document.getElementById(this.containerIds.header);
        
        if (loading) loading.style.display = 'block';
        if (error) error.style.display = 'none';
        if (content) content.style.display = 'none';
        if (footer) footer.style.display = 'none';
        if (header) header.style.display = 'none';
        
        this.updateLoadingMessage(message);
    }
    
    /**
     * Hide loading state and show content
     */
    hideLoading() {
        const loading = document.getElementById(this.containerIds.loading);
        const content = document.getElementById(this.containerIds.content);
        const footer = document.getElementById(this.containerIds.footer);
        const header = document.getElementById(this.containerIds.header);
        
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
        if (footer) footer.style.display = 'block';
        if (header) header.style.display = 'block';
    }
    
    /**
     * Update loading message
     * @param {string} message - New loading message
     */
    updateLoadingMessage(message) {
        const loadingMessage = document.getElementById(this.containerIds.loadingMessage);
        if (loadingMessage) {
            loadingMessage.textContent = message;
        }
    }
    
    // ==================== Error States ====================
    
    /**
     * Show error state with message
     * @param {string} message - Error message to display
     * @param {Object} options - Additional options
     * @param {boolean} options.escape - Whether to escape HTML (default: true)
     */
    showError(message, options = {}) {
        const { escape = true } = options;
        
        console.error('❌ Showing error:', message);
        
        const loading = document.getElementById(this.containerIds.loading);
        const error = document.getElementById(this.containerIds.error);
        const errorMessage = document.getElementById(this.containerIds.errorMessage);
        const content = document.getElementById(this.containerIds.content);
        const footer = document.getElementById(this.containerIds.footer);
        const header = document.getElementById(this.containerIds.header);
        
        // Hide all other states
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'none';
        if (footer) footer.style.display = 'none';
        if (header) header.style.display = 'none';
        
        // Show error with detailed message and troubleshooting tips
        if (error) {
            error.style.display = 'block';
            if (errorMessage && message) {
                const displayMessage = escape && window.WorkoutUtils 
                    ? window.WorkoutUtils.escapeHtml(message) 
                    : message;
                
                errorMessage.innerHTML = `
                    <strong>${displayMessage}</strong>
                    <br><br>
                    <small class="text-muted">
                        <strong>Troubleshooting tips:</strong><br>
                        1. Refresh the page (Ctrl+R or Cmd+R)<br>
                        2. Clear browser cache and try again<br>
                        3. Check browser console for details (F12)<br>
                        4. Try a different browser<br>
                        <br>
                        <em>If this persists, the app may still be initializing. Wait a moment and refresh.</em>
                    </small>
                `;
            }
        }
    }
    
    /**
     * Hide error state
     */
    hideError() {
        const error = document.getElementById(this.containerIds.error);
        if (error) error.style.display = 'none';
    }

    // ==================== Landing Page State ====================

    /**
     * Show landing page (no workout in progress)
     * @param {Object} options - Landing page options
     * @param {boolean} options.isAuthenticated - Whether user is authenticated
     * @param {Object} options.suggestion - Workout suggestion (optional)
     */
    showLanding(options = {}) {
        const { isAuthenticated = false, suggestion = null } = options;

        console.log('📄 Showing landing page', { isAuthenticated, hasSuggestion: !!suggestion });

        const loading = document.getElementById(this.containerIds.loading);
        const error = document.getElementById(this.containerIds.error);
        const content = document.getElementById(this.containerIds.content);
        const footer = document.getElementById(this.containerIds.footer);
        const header = document.getElementById(this.containerIds.header);
        const landing = document.getElementById(this.containerIds.landing);

        // Hide all other states
        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'none';
        if (content) content.style.display = 'none';
        if (footer) footer.style.display = 'none';
        if (header) header.style.display = 'none';

        // Show landing page
        if (landing) landing.style.display = 'block';

        // Handle sign-in prompt visibility
        const signInPrompt = document.getElementById('landingSignInPrompt');
        if (signInPrompt) {
            signInPrompt.style.display = isAuthenticated ? 'none' : 'block';
        }

        // Handle suggestion card
        this.renderSuggestionCard(suggestion);
    }

    /**
     * Hide landing page
     */
    hideLanding() {
        const landing = document.getElementById(this.containerIds.landing);
        if (landing) landing.style.display = 'none';
    }

    /**
     * Render suggestion card on landing page
     * @param {Object} suggestion - Suggestion data from getTodayRecommendation()
     */
    renderSuggestionCard(suggestion) {
        const container = document.getElementById('landingSuggestionCard');
        if (!container) return;

        // Hide if no suggestion or type is 'empty'
        if (!suggestion || suggestion.type === 'empty') {
            container.style.display = 'none';
            return;
        }

        const workout = suggestion.workout;
        if (!workout) {
            container.style.display = 'none';
            return;
        }

        // Escape workout name for safety
        const escapedName = workout.name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        // Build card HTML - matches stacked card format
        const isResume = suggestion.type === 'resume';
        const iconClass = isResume ? 'bx-play' : 'bx-star';
        const iconColor = isResume ? 'text-success' : 'text-warning';
        const cardTitle = isResume ? 'Resume Workout' : escapedName;
        const cardSubtitle = isResume ? escapedName : (suggestion.message || 'Suggested for today');

        container.innerHTML = `
            <a href="workout-mode.html?id=${workout.id}" class="card landing-action-card landing-suggestion-card text-decoration-none mb-3">
                <div class="card-body d-flex align-items-center py-3 px-3">
                    <div class="landing-card-icon me-3">
                        <i class="bx ${iconClass} ${iconColor}"></i>
                    </div>
                    <div class="landing-card-content">
                        <h6 class="card-title mb-0">${cardTitle}</h6>
                        <small class="suggestion-meta">${cardSubtitle}</small>
                    </div>
                    <i class="bx bx-chevron-right text-muted ms-auto"></i>
                </div>
            </a>
        `;

        container.style.display = 'block';
    }

    // ==================== Session UI ====================
    
    /**
     * Update session UI based on active state
     * @param {boolean} isActive - Whether session is active
     * @param {Object} session - Current session data (optional)
     */
    updateSessionState(isActive, session = null) {
        const sessionIndicator = document.getElementById('sessionActiveIndicator');
        const sessionInfo = document.getElementById('sessionInfo');
        const footer = document.getElementById(this.containerIds.footer);
        
        // Always show footer when workout is loaded
        if (footer) footer.style.display = 'block';
        
        if (isActive) {
            if (sessionIndicator) sessionIndicator.style.display = 'block';
            if (sessionInfo) sessionInfo.style.display = 'block';
        } else {
            if (sessionIndicator) sessionIndicator.style.display = 'none';
            if (sessionInfo) sessionInfo.style.display = 'none';
        }
    }
    
    // ==================== Save Indicators ====================
    
    /**
     * Show save indicator on element
     * @param {HTMLElement} element - Card element to show indicator on
     * @param {string} state - Indicator state: 'saving' | 'success' | 'error'
     */
    showSaveIndicator(element, state) {
        if (!element) return;
        
        const saveIndicator = element.querySelector('.save-indicator');
        const saveSuccess = element.querySelector('.save-success');
        
        if (!saveIndicator || !saveSuccess) return;
        
        saveIndicator.style.display = 'none';
        saveSuccess.style.display = 'none';
        
        switch (state) {
            case 'saving':
                saveIndicator.style.display = 'inline-block';
                break;
            case 'success':
                saveSuccess.style.display = 'inline-block';
                setTimeout(() => {
                    saveSuccess.style.display = 'none';
                }, 2000);
                break;
        }
    }
    
    // ==================== Start Button Tooltip ====================
    
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutUIStateManager;
}

console.log('📦 Workout UI State Manager loaded');
