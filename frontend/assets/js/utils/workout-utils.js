/**
 * Ghost Gym - Workout Utilities
 * Shared utility functions for workout mode
 * @version 1.0.0
 * @date 2025-01-05
 */

const WorkoutUtils = {
    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    /**
     * Strip HTML tags from string
     * @param {string} html - HTML string to strip
     * @returns {string} Plain text
     */
    stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    },
    
    /**
     * Parse rest time string to seconds
     * Supports formats: "60s", "60", "2min", "2m", "1:30", "1m30s"
     * @param {string} restStr - Rest time string
     * @returns {number} Rest time in seconds (defaults to 60 for invalid input)
     */
    parseRestTime(restStr) {
        // Handle number inputs directly (e.g., 60 from API/session data)
        if (typeof restStr === 'number' && !isNaN(restStr)) {
            return Math.max(1, Math.round(restStr));
        }
        if (!restStr || typeof restStr !== 'string') {
            console.warn('⚠️ Invalid rest time input, using default 60s');
            return 60;
        }
        
        // Trim and lowercase for consistent parsing
        const input = restStr.trim().toLowerCase();
        
        // Check for completely invalid input (no numbers at all)
        if (!/\d/.test(input)) {
            console.warn(`⚠️ Rest time "${restStr}" contains no numbers, using default 60s`);
            return 60;
        }
        
        // Handle m:ss format (e.g., "1:30" = 90 seconds)
        const timeFormatMatch = input.match(/^(\d+):(\d{1,2})$/);
        if (timeFormatMatch) {
            const minutes = parseInt(timeFormatMatch[1]);
            const seconds = parseInt(timeFormatMatch[2]);
            return (minutes * 60) + seconds;
        }
        
        // Handle combined format (e.g., "1m30s", "2min30sec", "2mins30secs")
        const combinedMatch = input.match(/(\d+)\s*m(?:in)?(?:ute)?s?\s*(\d+)\s*s(?:ec)?(?:ond)?s?/);
        if (combinedMatch) {
            const minutes = parseInt(combinedMatch[1]);
            const seconds = parseInt(combinedMatch[2]);
            return (minutes * 60) + seconds;
        }
        
        // Handle minutes format (e.g., "2min", "2m", "2 minutes", "2mins")
        // Pattern: number + optional space + "m" + optional ("in"/"ins"/"inute"/"inutes"/"inu"...)
        const minMatch = input.match(/(\d+)\s*m(?:in(?:ute)?s?)?$/);
        if (minMatch) {
            return parseInt(minMatch[1]) * 60;
        }
        
        // Handle seconds format (e.g., "60s", "60sec", "60 seconds", or just "60")
        const secMatch = input.match(/(\d+)/);
        if (secMatch) {
            return parseInt(secMatch[1]);
        }
        
        // Fallback to default
        console.warn(`⚠️ Could not parse rest time "${restStr}", using default 60s`);
        return 60;
    },
    
    /**
     * Format seconds as m:ss or just seconds for display
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string (e.g., "1:30" for 90s, "45s" for 45s)
     */
    formatTime(seconds) {
        if (typeof seconds !== 'number' || seconds < 0 || isNaN(seconds)) {
            return '0s';
        }
        
        if (seconds >= 60) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        return `${seconds}s`;
    },
    
    /**
     * Validate rest time input and return cleaned value
     * @param {string} input - User input for rest time
     * @returns {Object} { valid: boolean, value: string, seconds: number, error?: string }
     */
    validateRestTime(input) {
        if (!input || typeof input !== 'string') {
            return { valid: false, value: '60s', seconds: 60, error: 'Empty input' };
        }
        
        const trimmed = input.trim();
        
        // Check for completely invalid input (no numbers)
        if (!/\d/.test(trimmed)) {
            return {
                valid: false,
                value: '60s',
                seconds: 60,
                error: `"${trimmed}" is not a valid rest time. Use formats like 60s, 2min, or 1:30`
            };
        }
        
        // Parse the input
        const seconds = this.parseRestTime(trimmed);
        
        // Validate reasonable range (1 second to 10 minutes)
        if (seconds < 1) {
            return { valid: false, value: '1s', seconds: 1, error: 'Minimum rest time is 1 second' };
        }
        
        if (seconds > 600) {
            return { valid: false, value: '10min', seconds: 600, error: 'Maximum rest time is 10 minutes' };
        }
        
        // Format the output consistently
        const formattedValue = seconds >= 60
            ? (seconds % 60 === 0 ? `${seconds / 60}min` : `${Math.floor(seconds / 60)}m${seconds % 60}s`)
            : `${seconds}s`;
        
        return { valid: true, value: formattedValue, seconds };
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutUtils;
}

// Make available globally for existing code
window.WorkoutUtils = WorkoutUtils;

console.log('📦 Workout Utils loaded');
