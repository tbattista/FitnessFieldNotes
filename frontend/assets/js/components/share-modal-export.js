/**
 * Ghost Gym - Share Modal Export Handlers
 * Handles workout export functionality (image, text, print, gym log)
 * Extracted from share-modal.js for modularity
 * @version 1.0.0
 */

(function() {
    'use strict';

    class ShareModalExport {
        /**
         * @param {object} modal - Reference to the ShareModal instance
         *   Provides: modal.currentWorkoutId, modal.currentWorkout, modal.getAuthToken()
         */
        constructor(modal) {
            this.modal = modal;
        }

        async handleImageExport() {
            const btn = document.getElementById('exportImageBtn');
            const originalHTML = btn.innerHTML;
            const includeWeights = document.getElementById('includeWeightsCheckbox')?.checked || false;

            try {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';

                const token = await this.modal.getAuthToken();

                const response = await fetch(`/api/v3/export/image/${this.modal.currentWorkoutId}?include_weights=${includeWeights}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to generate image');
                }

                // Download the image
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.modal.currentWorkout?.name || 'workout'}.png`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();

                this.showExportStatus('Image downloaded successfully!', 'success');
                if (window.analyticsService) {
                    window.analyticsService.trackExport('image', this.modal.currentWorkout?.name);
                }
                console.log('✅ Image exported');

            } catch (error) {
                console.error('❌ Error exporting image:', error);
                this.showExportStatus(error.message, 'danger');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }

        async handleTextExport() {
            const btn = document.getElementById('exportTextBtn');
            const originalHTML = btn.innerHTML;
            const includeWeights = document.getElementById('includeWeightsCheckbox')?.checked || false;

            try {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Copying...';

                const token = await this.modal.getAuthToken();

                const response = await fetch(`/api/v3/export/text/${this.modal.currentWorkoutId}?include_weights=${includeWeights}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to generate text');
                }

                const text = await response.text();

                // Copy to clipboard
                await navigator.clipboard.writeText(text);

                // Show success
                btn.innerHTML = '<i class="bx bx-check me-1"></i>Copied!';
                btn.classList.remove('btn-outline-secondary');
                btn.classList.add('btn-success');

                this.showExportStatus('Text copied to clipboard!', 'success');
                if (window.analyticsService) {
                    window.analyticsService.trackExport('text', this.modal.currentWorkout?.name);
                }
                console.log('✅ Text exported and copied');

                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-outline-secondary');
                }, 2000);

            } catch (error) {
                console.error('❌ Error exporting text:', error);
                this.showExportStatus(error.message, 'danger');
                btn.innerHTML = originalHTML;
            } finally {
                btn.disabled = false;
            }
        }

        async handlePrintExport() {
            const btn = document.getElementById('exportPrintBtn');
            const originalHTML = btn.innerHTML;
            const includeWeights = document.getElementById('includeWeightsCheckbox')?.checked || false;

            try {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';

                const token = await this.modal.getAuthToken();

                const response = await fetch(`/api/v3/export/print/${this.modal.currentWorkoutId}?include_weights=${includeWeights}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to generate PDF');
                }

                // Download the PDF
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.modal.currentWorkout?.name || 'workout'}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();

                this.showExportStatus('PDF downloaded successfully!', 'success');
                if (window.analyticsService) {
                    window.analyticsService.trackExport('pdf', this.modal.currentWorkout?.name);
                }
                console.log('✅ PDF exported');

            } catch (error) {
                console.error('❌ Error exporting PDF:', error);
                this.showExportStatus(error.message, 'danger');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }

        async handleGymLogExport() {
            const btn = document.getElementById('exportGymLogBtn');
            const originalHTML = btn.innerHTML;
            const includeWeights = document.getElementById('includeWeightsCheckbox')?.checked || false;

            try {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';

                const token = await this.modal.getAuthToken();

                const response = await fetch(`/api/v3/export/print/${this.modal.currentWorkoutId}?include_weights=${includeWeights}&format=log`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to generate PDF');
                }

                // Download the PDF
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.modal.currentWorkout?.name || 'workout'}_log.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();

                this.showExportStatus('Gym log PDF downloaded!', 'success');
                if (window.analyticsService) {
                    window.analyticsService.trackExport('gym-log', this.modal.currentWorkout?.name);
                }
                console.log('✅ Gym log PDF exported');

            } catch (error) {
                console.error('❌ Error exporting gym log:', error);
                this.showExportStatus(error.message, 'danger');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }

        showExportStatus(message, type) {
            const statusEl = document.getElementById('exportStatusMessage');
            if (!statusEl) return;

            statusEl.textContent = message;
            statusEl.className = `alert alert-${type} mb-0`;
            statusEl.style.display = 'block';

            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    statusEl.style.display = 'none';
                }, 3000);
            }
        }
    }

    window.ShareModalExport = ShareModalExport;

    console.log('📦 Share Modal Export component loaded');

})();
