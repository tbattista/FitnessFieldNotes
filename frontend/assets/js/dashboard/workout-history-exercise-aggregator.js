/**
 * Workout History - Exercise Aggregator
 * Extracts and groups exercise data from sessions for the Exercises tab
 * @version 2.0.0
 */

/* ============================================
   EXERCISE NAME ALIASES
   ============================================ */

/**
 * Maps common user exercise names to standard DB exercise names.
 * Used as a fast-path before fuzzy matching. Keys must be lowercase.
 */
const EXERCISE_NAME_ALIASES = {
  // Squat variants
  'back squat':           'Barbell Full Squat',
  'squat':                'Barbell Full Squat',
  'front squat':          'Barbell Front Squat',
  'goblet squat':         'Dumbbell Goblet Squat',
  'overhead squat':       'Barbell Overhead Squat',
  'zercher squat':        'Barbell Zercher Squat',
  'hack squat':           'Sled Hack Squat',
  'split squat':          'Dumbbell Single Leg Split Squat',
  'jump squat':           'Jump Squat',
  'sissy squat':          'Sissy Squat',
  // Bench variants
  'bench press':          'Barbell Bench Press - Medium Grip',
  'bench':                'Barbell Bench Press - Medium Grip',
  'flat bench':           'Barbell Bench Press - Medium Grip',
  'incline bench':        'Barbell Incline Bench Press',
  'incline bench press':  'Barbell Incline Bench Press',
  'decline bench':        'Barbell Decline Bench Press',
  'decline bench press':  'Barbell Decline Bench Press',
  // Deadlift variants
  'deadlift':             'Barbell Deadlift',
  'sumo deadlift':        'Barbell Sumo Deadlift',
  'romanian deadlift':    'Barbell Romanian Deadlift',
  'rdl':                  'Barbell Romanian Deadlift',
  'stiff leg deadlift':   'Barbell Stiff Leg Deadlift',
  // Press variants
  'ohp':                  'Barbell Standing Military Press',
  'overhead press':       'Barbell Standing Military Press',
  'military press':       'Barbell Standing Military Press',
  'shoulder press':       'Barbell Standing Military Press',
  // Pull / Row variants
  'pull up':              'Pull Up',
  'pullup':               'Pull Up',
  'chin up':              'Chin-Up',
  'chinup':               'Chin-Up',
  'lat pulldown':         'Cable Lat Pulldown',
  'row':                  'Barbell Bent Over Row',
  'barbell row':          'Barbell Bent Over Row',
  'bent over row':        'Barbell Bent Over Row',
  'pendlay row':          'Barbell Bent Over Row',
  // Accessory
  'dip':                  'Chest Dip',
  'dips':                 'Chest Dip',
  'curl':                 'Barbell Curl',
  'bicep curl':           'Barbell Curl',
  'tricep extension':     'Dumbbell Triceps Extension',
  'skull crusher':        'EZ-Bar Skullcrusher',
  'leg press':            'Lever Seated Leg Press',
  'leg curl':             'Lever Lying Leg Curl',
  'leg extension':        'Lever Leg Extension',
  'calf raise':           'Lever Seated Calf Raise',
  'hip thrust':           'Barbell Hip Thrust',
  'lunge':                'Dumbbell Lunge',
  'lunges':               'Dumbbell Lunge',
  'face pull':            'Cable Face Pull',
  'lateral raise':        'Dumbbell Lateral Raise',
  'shrug':                'Barbell Shrug',
  'shrugs':               'Barbell Shrug',
};

/* ============================================
   FUZZY MATCHING INDEX
   ============================================ */

/** Cached index of standard exercise base names for fuzzy matching */
let _standardBaseNameIndex = null;
/** Map of lowercase baseName -> canonical baseName */
let _standardBaseNameMap = null;

/**
 * Build a Fuse.js index over unique base names from the standard exercise DB.
 * Called once, then cached.
 */
function buildStandardBaseNameIndex() {
  if (_standardBaseNameIndex) return;

  const cacheService = window.exerciseCacheService;
  if (!cacheService || !cacheService.exercises || cacheService.exercises.length === 0) {
    console.warn('[Aggregator] Exercise cache not ready for fuzzy index');
    return;
  }

  _standardBaseNameMap = new Map();
  const uniqueBaseNames = [];

  for (const ex of cacheService.exercises) {
    if (!ex.name) continue;
    const { baseName } = parseExerciseName(ex.name);
    const key = baseName.toLowerCase();
    if (!_standardBaseNameMap.has(key)) {
      _standardBaseNameMap.set(key, baseName);
      uniqueBaseNames.push({ baseName, key });
    }
  }

  // Build Fuse index over base names only (not full exercise names with equipment)
  if (typeof Fuse !== 'undefined') {
    _standardBaseNameIndex = new Fuse(uniqueBaseNames, {
      keys: ['baseName'],
      threshold: 0.3,
      distance: 60,
      minMatchCharLength: 3,
      includeScore: true
    });
    console.log(`[Aggregator] Fuzzy index built: ${uniqueBaseNames.length} unique base names`);
  }
}

/**
 * Resolve a user-entered base name to a canonical standard base name.
 * Returns { canonical, wasNormalized, original }
 */
function resolveCanonicalBaseName(baseName) {
  if (!baseName) return { canonical: baseName, wasNormalized: false, original: baseName };

  const lower = baseName.toLowerCase().trim();

  // 1. Check alias map (fast path for known shorthand)
  const aliasTarget = EXERCISE_NAME_ALIASES[lower];
  if (aliasTarget) {
    const { baseName: aliasBase } = parseExerciseName(aliasTarget);
    return { canonical: aliasBase, wasNormalized: true, original: baseName };
  }

  // 2. Check exact match in standard base names
  if (_standardBaseNameMap && _standardBaseNameMap.has(lower)) {
    const canonical = _standardBaseNameMap.get(lower);
    // Only count as normalized if casing differs
    return { canonical, wasNormalized: canonical !== baseName, original: baseName };
  }

  // 3. Fuzzy match against standard base names
  if (_standardBaseNameIndex) {
    const results = _standardBaseNameIndex.search(baseName, { limit: 1 });
    if (results.length > 0 && results[0].score <= 0.3) {
      const matched = results[0].item.baseName;
      return { canonical: matched, wasNormalized: true, original: baseName };
    }
  }

  // No match — keep original
  return { canonical: baseName, wasNormalized: false, original: baseName };
}

/* ============================================
   EQUIPMENT PREFIX PARSING
   ============================================ */

// Sorted by length descending so multi-word prefixes match first
const EQUIPMENT_PREFIXES = [
  'Leverage Machine',
  'Smith Machine',
  'Cable Machine',
  'Body Weight',
  'Bodyweight',
  'Trap Bar',
  'Kettlebell',
  'EZ-Bar',
  'EZ Bar',
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Band'
];

/**
 * Parse exercise name into base movement name and equipment
 * e.g., "Barbell Bench Press" -> { baseName: "Bench Press", equipment: "Barbell" }
 * e.g., "Push-up" -> { baseName: "Push-up", equipment: null }
 */
function parseExerciseName(fullName) {
  if (!fullName) return { baseName: fullName || '', equipment: null };

  const nameLower = fullName.toLowerCase();

  for (const prefix of EQUIPMENT_PREFIXES) {
    const prefixLower = prefix.toLowerCase();
    if (nameLower.startsWith(prefixLower + ' ')) {
      const baseName = fullName.substring(prefix.length).trim();
      if (baseName.length > 0) {
        // Normalize equipment display names
        let equipment = prefix;
        if (equipment === 'Body Weight') equipment = 'Bodyweight';
        if (equipment === 'EZ Bar') equipment = 'EZ-Bar';
        if (equipment === 'Leverage Machine') equipment = 'Machine';
        if (equipment === 'Cable Machine') equipment = 'Cable';
        return { baseName, equipment };
      }
    }
  }

  return { baseName: fullName, equipment: null };
}

/* ============================================
   SESSION AGGREGATION
   ============================================ */

/**
 * Aggregate exercise data from all sessions into grouped structure
 * @param {Array} sessions - Strength sessions (already filtered, no cardio)
 * @returns {Array} Sorted array of exercise group objects
 */
function aggregateExercisesFromSessions(sessions) {
  // Build fuzzy matching index (no-op if already built)
  buildStandardBaseNameIndex();

  // Nested map: canonicalBaseName -> equipment -> variantData
  const groupMap = new Map();
  // Track alias/merged names per group: canonicalBaseName -> Set of original names
  const aliasMap = new Map();

  for (const session of sessions) {
    const exercises = session.exercises_performed || [];
    const sessionDate = session.completed_at || session.started_at || session.created_at;

    for (const ex of exercises) {
      if (!ex.exercise_name || ex.is_skipped) continue;

      const { baseName, equipment } = parseExerciseName(ex.exercise_name);

      // Resolve to canonical standard name via alias/fuzzy matching
      const { canonical, wasNormalized, original } = resolveCanonicalBaseName(baseName);
      const canonicalKey = canonical;
      const equipmentKey = equipment || 'Other';

      // Track alias names for display
      if (wasNormalized && original !== canonical) {
        if (!aliasMap.has(canonicalKey)) aliasMap.set(canonicalKey, new Set());
        aliasMap.get(canonicalKey).add(original);
      }

      // Get or create group
      if (!groupMap.has(canonicalKey)) {
        groupMap.set(canonicalKey, new Map());
      }
      const variants = groupMap.get(canonicalKey);

      // Get or create variant
      if (!variants.has(equipmentKey)) {
        variants.set(equipmentKey, {
          fullName: ex.exercise_name,
          equipment: equipmentKey,
          entries: [],
          sessionDates: new Set()
        });
      }
      const variant = variants.get(equipmentKey);

      // Add entry
      const weight = ex.weight || null;
      const weightUnit = ex.weight_unit || 'lbs';
      const sets = ex.sets_completed || ex.target_sets || '';
      const reps = ex.target_reps || '';

      variant.entries.push({
        date: sessionDate,
        weight,
        weightUnit,
        sets,
        reps,
        sessionId: session.id
      });

      // Track unique session dates
      if (sessionDate) {
        variant.sessionDates.add(new Date(sessionDate).toDateString());
      }
    }
  }

  // Build result array
  const groups = [];

  for (const [canonicalBaseName, variants] of groupMap) {
    const variantArray = [];
    let groupTotalSessions = 0;
    let groupLastDate = null;

    for (const [equipmentKey, variant] of variants) {
      // Sort entries by date descending
      variant.entries.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Deduplicate: keep best weight per date
      const deduped = deduplicateVariantEntries(variant.entries);

      const totalSessions = variant.sessionDates.size;
      const lastEntry = deduped[0];
      const bestWeight = getBestWeight(deduped);
      // Find the earliest date the best weight was first achieved (before truncating)
      const bestWeightDate = getBestWeightFirstDate(deduped, bestWeight);

      variantArray.push({
        fullName: variant.fullName,
        equipment: equipmentKey,
        entries: deduped.slice(0, 5), // Keep last 5 for timeline
        totalSessions,
        lastWeight: lastEntry?.weight || null,
        lastWeightUnit: lastEntry?.weightUnit || 'lbs',
        lastReps: lastEntry?.reps || '',
        lastDate: lastEntry?.date || null,
        bestWeight,
        bestWeightDate
      });

      groupTotalSessions += totalSessions;
      if (lastEntry?.date) {
        const d = new Date(lastEntry.date);
        if (!groupLastDate || d > groupLastDate) groupLastDate = d;
      }
    }

    // Sort variants by session count descending
    variantArray.sort((a, b) => b.totalSessions - a.totalSessions);

    groups.push({
      baseName: canonicalBaseName,
      variants: variantArray,
      totalSessions: groupTotalSessions,
      lastDate: groupLastDate ? groupLastDate.toISOString() : null,
      mergedNames: aliasMap.get(canonicalBaseName) || new Set()
    });
  }

  // Default sort: frequency descending
  groups.sort((a, b) => b.totalSessions - a.totalSessions);

  return groups;
}

/**
 * Deduplicate entries by date, keeping best weight per date
 */
function deduplicateVariantEntries(entries) {
  const byDate = {};

  for (const entry of entries) {
    if (!entry.date) continue;
    const dateKey = new Date(entry.date).toDateString();
    const weight = parseFloat(entry.weight) || 0;

    if (!byDate[dateKey] || weight > (parseFloat(byDate[dateKey].weight) || 0)) {
      byDate[dateKey] = entry;
    }
  }

  return Object.values(byDate).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Find the best (highest) numeric weight from entries
 */
function getBestWeight(entries) {
  let best = 0;
  for (const entry of entries) {
    const w = parseFloat(entry.weight);
    if (!isNaN(w) && w > best) best = w;
  }
  return best > 0 ? best : null;
}

/**
 * Find the earliest date the best weight was achieved.
 * Entries are sorted newest-first, so iterate to find the oldest match.
 */
function getBestWeightFirstDate(entries, bestWeight) {
  if (!bestWeight) return null;
  let oldestDate = null;
  for (const entry of entries) {
    const w = parseFloat(entry.weight);
    if (w === bestWeight && entry.date) {
      oldestDate = entry.date;
    }
  }
  return oldestDate;
}

/* ============================================
   EXPORTS
   ============================================ */

window.parseExerciseName = parseExerciseName;
window.aggregateExercisesFromSessions = aggregateExercisesFromSessions;
window.buildStandardBaseNameIndex = buildStandardBaseNameIndex;
window.resolveCanonicalBaseName = resolveCanonicalBaseName;
window.EXERCISE_NAME_ALIASES = EXERCISE_NAME_ALIASES;

console.log('Workout History Exercise Aggregator module loaded (v2.0.0)');
