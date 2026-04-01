/**
 * Authentication Modals Template Component
 * Single source of truth for all authentication-related modals
 * Provides consistent modal structure across all pages
 */

/**
 * Generate all authentication-related modals HTML
 * @returns {string} Complete modals HTML
 */
function getAuthModalsHTML() {
    return `
        <!-- Authentication Modal -->
        <div class="modal fade" id="authModal" tabindex="-1" aria-labelledby="authModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header border-0">
                        <h5 class="modal-title" id="authModalLabel">
                            <i class="bx bx-user me-2"></i>
                            <span id="authModalTitle">Sign In</span>
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    
                    <div class="modal-body">
                        <!-- Auth Mode Tabs -->
                        <ul class="nav nav-pills nav-justified mb-4" id="authTabs" role="tablist">
                            <li class="nav-item" role="presentation">
                                <button class="nav-link active" id="signin-tab" data-bs-toggle="pill"
                                        data-bs-target="#signin-panel" type="button" role="tab">
                                    Sign In
                                </button>
                            </li>
                            <li class="nav-item" role="presentation">
                                <button class="nav-link" id="signup-tab" data-bs-toggle="pill"
                                        data-bs-target="#signup-panel" type="button" role="tab">
                                    Sign Up
                                </button>
                            </li>
                        </ul>
                        
                        <!-- Tab Content -->
                        <div class="tab-content" id="authTabContent">
                            
                            <!-- Sign In Panel -->
                            <div class="tab-pane fade show active" id="signin-panel" role="tabpanel">
                                <form id="signinForm" novalidate>
                                    <div class="mb-3">
                                        <label for="signinEmail" class="form-label">Email</label>
                                        <input type="email" class="form-control" id="signinEmail" required>
                                        <div class="invalid-feedback">Please enter a valid email address.</div>
                                    </div>
                                    <div class="mb-3">
                                        <label for="signinPassword" class="form-label">Password</label>
                                        <input type="password" class="form-control" id="signinPassword" required>
                                        <div class="invalid-feedback">Please enter your password.</div>
                                    </div>
                                    <div class="mb-3">
                                        <button type="button" class="btn btn-link p-0 text-decoration-none" id="forgotPasswordBtn">
                                            Forgot your password?
                                        </button>
                                    </div>
                                    <div class="d-grid gap-2">
                                        <button type="submit" class="btn btn-primary" id="signinBtn">
                                            <i class="bx bx-log-in me-2"></i>
                                            Sign In
                                        </button>
                                        <div class="text-center my-2">
                                            <small class="text-muted">or</small>
                                        </div>
                                        <button type="button" class="btn btn-outline-danger" id="googleSigninBtn">
                                            <i class="bx bxl-google me-2"></i>
                                            Sign in with Google
                                        </button>
                                    </div>
                                </form>
                            </div>
                            
                            <!-- Sign Up Panel -->
                            <div class="tab-pane fade" id="signup-panel" role="tabpanel">
                                <form id="signupForm" novalidate>
                                    <div class="mb-3">
                                        <label for="signupName" class="form-label">Display Name</label>
                                        <input type="text" class="form-control" id="signupName" required>
                                        <div class="invalid-feedback">Please enter your name.</div>
                                    </div>
                                    <div class="mb-3">
                                        <label for="signupEmail" class="form-label">Email</label>
                                        <input type="email" class="form-control" id="signupEmail" required>
                                        <div class="invalid-feedback">Please enter a valid email address.</div>
                                    </div>
                                    <div class="mb-3">
                                        <label for="signupPassword" class="form-label">Password</label>
                                        <input type="password" class="form-control" id="signupPassword" required minlength="6">
                                        <div class="invalid-feedback">Password must be at least 6 characters.</div>
                                        <div class="form-text">Minimum 6 characters</div>
                                    </div>
                                    <div class="mb-3">
                                        <label for="signupPasswordConfirm" class="form-label">Confirm Password</label>
                                        <input type="password" class="form-control" id="signupPasswordConfirm" required>
                                        <div class="invalid-feedback">Passwords do not match.</div>
                                    </div>
                                    <div class="mb-3 form-check">
                                        <input type="checkbox" class="form-check-input" id="agreeTerms" required>
                                        <label class="form-check-label" for="agreeTerms">
                                            I agree to the <a href="/terms.html" target="_blank" class="text-decoration-none">Terms of Service</a> and <a href="/privacy.html" target="_blank" class="text-decoration-none">Privacy Policy</a>
                                        </label>
                                        <div class="invalid-feedback">You must agree to the terms.</div>
                                    </div>
                                    <div class="d-grid gap-2">
                                        <button type="submit" class="btn btn-success" id="signupBtn">
                                            <i class="bx bx-user-plus me-2"></i>
                                            Create Account
                                        </button>
                                        <div class="text-center my-2">
                                            <small class="text-muted">or</small>
                                        </div>
                                        <button type="button" class="btn btn-outline-danger" id="googleSignupBtn">
                                            <i class="bx bxl-google me-2"></i>
                                            Sign up with Google
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                        
                        <!-- Loading State -->
                        <div id="authLoading" class="text-center d-none">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Processing...</span>
                            </div>
                            <p class="mt-2 mb-0">Processing your request...</p>
                        </div>
                        
                        <!-- Error Alert -->
                        <div id="authError" class="alert alert-danger d-none" role="alert">
                            <i class="bx bx-error me-2"></i>
                            <span id="authErrorMessage"></span>
                        </div>
                        
                        <!-- Success Alert -->
                        <div id="authSuccess" class="alert alert-success d-none" role="alert">
                            <i class="bx bx-check-circle me-2"></i>
                            <span id="authSuccessMessage"></span>
                        </div>
                    </div>
                    
                    <div class="modal-footer border-0">
                        <!-- Anonymous Option -->
                        <div class="w-100 text-center">
                            <button type="button" class="btn btn-link text-muted" id="continueAnonymousBtn">
                                <i class="bx bx-user-x me-1"></i>
                                Continue without account
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Backup & Export Modal -->
        <div class="modal fade" id="backupModal" tabindex="-1" aria-labelledby="backupModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="backupModalLabel">
                            <i class="bx bx-cloud-upload me-2"></i>
                            Backup & Export
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    
                    <div class="modal-body">
                        <div class="mb-4">
                            <h6 class="mb-3">Export Data</h6>
                            <div class="d-grid gap-2">
                                <button type="button" class="btn btn-outline-primary" id="exportProgramsBtn">
                                    <i class="bx bx-folder me-2"></i>
                                    Export Programs (JSON)
                                </button>
                                <button type="button" class="btn btn-outline-primary" id="exportWorkoutsBtn">
                                    <i class="bx bx-dumbbell me-2"></i>
                                    Export Workouts (JSON)
                                </button>
                                <button type="button" class="btn btn-primary" id="exportAllBtn">
                                    <i class="bx bx-download me-2"></i>
                                    Export Everything (JSON)
                                </button>
                            </div>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="mb-3">Import Data</h6>
                            <div class="mb-3">
                                <label for="importFileInput" class="form-label">Select JSON file to import:</label>
                                <input type="file" class="form-control" id="importFileInput" accept=".json">
                                <div class="form-text">Import programs and workouts from a JSON backup file</div>
                            </div>
                            <button type="button" class="btn btn-success w-100" id="importDataBtn" disabled>
                                <i class="bx bx-upload me-2"></i>
                                Import Data
                            </button>
                        </div>
                        
                        <div class="alert alert-info mb-0" role="alert">
                            <i class="bx bx-info-circle me-2"></i>
                            <strong>Cloud Sync:</strong> Sign in to automatically sync your data across devices.
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Settings Modal -->
        <div class="modal fade" id="settingsModal" tabindex="-1" aria-labelledby="settingsModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="settingsModalLabel">
                            <i class="bx bx-cog me-2"></i>
                            Settings
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    
                    <div class="modal-body">
                        <div class="mb-4">
                            <h6 class="mb-3">Display Preferences</h6>
                            <div class="form-check form-switch mb-3">
                                <input class="form-check-input" type="checkbox" id="darkModeToggle" disabled>
                                <label class="form-check-label" for="darkModeToggle">
                                    Dark Mode <span class="badge bg-label-secondary">Coming Soon</span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="mb-3">Data Management</h6>
                            <button type="button" class="btn btn-outline-danger w-100" id="clearLocalDataBtn">
                                <i class="bx bx-trash me-2"></i>
                                Clear Local Data
                            </button>
                            <div class="form-text mt-2">
                                This will delete all programs and workouts stored locally. Cloud data will not be affected.
                            </div>
                        </div>
                        
                        <div class="mb-0">
                            <h6 class="mb-3">About</h6>
                            <div class="card bg-light">
                                <div class="card-body">
                                    <p class="mb-2"><strong>Fitness Field Notes</strong></p>
                                    <p class="mb-2 small text-muted">Professional workout program management</p>
                                    <p class="mb-0 small">
                                        <i class="bx bx-code-alt me-1"></i>
                                        Version: <span id="appVersion">20251020-03</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Make globally available immediately
window.getAuthModalsHTML = getAuthModalsHTML;