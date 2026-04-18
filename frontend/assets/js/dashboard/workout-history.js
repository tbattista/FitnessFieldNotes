/**
 * Ghost Gym - Workout History Module
 * Core state initialization and module coordinator
 *
 * This module serves as the entry point for the workout history feature.
 * The functionality is split across multiple files for maintainability:
 *
 * - workout-history-utils.js    : Statistics, formatting, UI states
 * - workout-history-exercises.js: Exercise performance rendering
 * - workout-history-calendar.js : Calendar view and date filtering
 * - workout-history-sessions.js : Session rendering, filtering, pagination
 * - workout-history-loader.js   : Data fetching and initialization
 *
 * @version 3.0.0
 */

/* ============================================
   GLOBAL STATE INITIALIZATION
   ============================================ */

window.ffn = window.ffn || {};
window.ffn.workoutHistory = {
  // Core identifiers
  workoutId: null,
  workoutInfo: null,
  isAllMode: false, // true when showing all sessions (no workout filter)

  // Data
  sessions: [],
  exerciseHistories: {},
  uniqueWorkouts: [], // Unique workout names for dropdown

  // UI State
  expandedSessions: new Set(),
  expandedExercises: new Set(),
  calendarView: null,

  // Delete Mode (Bulk Delete)
  deleteMode: false,
  selectedSessionIds: new Set(),

  // Exercise filters (Insights tab)
  exerciseFilter: 'all', // 'all', 'low', 'mid', 'high' (dynamic)
  exerciseSort: 'count-desc', // 'name', 'count-asc', 'count-desc'

  // Session filters (All Mode)
  sessionFilter: 'all', // 'all', 'completed', 'partial', 'abandoned'
  workoutTypeFilters: [], // [] = all workouts, or array of selected workout names
  sessionSort: 'date-desc', // 'date-desc', 'date-asc', 'duration-desc', 'duration-asc'

  // Pagination
  pageSize: 20,      // 10, 20, 50, or 'all'
  currentPage: 1,    // Current page number

  // Date filter (calendar click or range selection)
  dateFilter: null,      // null, 'YYYY-MM-DD' string, or { start, end } object
  dateRangeMode: false,  // Whether custom range selection is active
  dateRangePreset: null, // 'this-week' | 'last-7' | 'this-month' | 'last-30' | 'custom' | null

  // Exercise Tab (All Sessions mode)
  allExerciseGroups: [],
  exerciseTabSort: 'frequency', // 'frequency', 'name', 'recent'
  exerciseTabSearch: '',
  expandedExerciseGroups: new Set(),

  // Personal Records
  personalRecords: new Map(),     // PR ID -> PR data
  prExerciseNames: new Set(),     // exercise names (lowercased) that have PRs
  prRecordIds: [],                // ordered array of PR IDs for display order

  // Statistics
  statistics: {
    totalWorkouts: 0,
    avgDuration: 0,
    lastCompleted: null,
    totalVolume: 0
  }
};

/* ============================================
   MODULE LOAD CONFIRMATION
   ============================================ */

console.log('📦 Workout History module loaded (v3.0.0 - Modular Architecture)');
