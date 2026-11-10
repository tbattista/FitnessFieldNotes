/**
 * Exercise Link
 * Links an exercise *name* (e.g. an AI-written "KB Goblet Squat (left)") to
 * its page in the exercise database: /exercise-database.html?find=<name>.
 * The database page uses findMatch() to open the best-matching exercise, or
 * falls back to showing search results for the core words.
 */
(function () {
  'use strict';

  // Words that don't tell exercises apart (the equipment is implied)
  const STOP = new Set(['kb', 'kettlebell', 'kettlebells', 'with', 'the', 'a', 'an', 'on', 'and']);
  // A match on another tool is the wrong move for a kettlebell workout
  const OTHER_EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'lever',
    'sled', 'band', 'ez', 'trap']);
  // Spellings that mean the same thing
  const SYNONYMS = {
    'one-arm': 'single-arm', 'one arm': 'single-arm', '1-arm': 'single-arm', 'single arm': 'single-arm',
    'two-hand': 'two-handed', 'two hand': 'two-handed', '2-hand': 'two-handed', 'two-handed': 'two-handed',
    'two-arm': 'two-handed', 'two arm': 'two-handed',
    'getup': 'get-up', 'get up': 'get-up', 'pushup': 'push-up', 'push up': 'push-up',
    'situp': 'sit-up', 'sit up': 'sit-up', 'rdl': 'romanian deadlift',
  };
  // One whole-word pass, longest spelling first, so "two-handed" stays "two-handed"
  const SYNONYM_RE = new RegExp(
    `(^|[^a-z0-9-])(${Object.keys(SYNONYMS).sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[-\s]/g, (c) => (c === '-' ? '\\-' : '\\s+'))).join('|')})(?=$|[^a-z0-9-])`,
    'g');
  // Qualifiers ("single arm", "two handed") count less than the move itself
  const SOFT = new Set(['single', 'one', 'two', 'arm', 'hand', 'handed']);
  const weight = (t) => (SOFT.has(t) ? 0.35 : 1);
  const AUTO_OPEN_SCORE = 0.6;

  /** Drop side markers like "(left)" / "(R)" so the name is just the move. */
  function cleanName(name) {
    return String(name || '')
      .replace(/\((left|right|l|r|both)\)/gi, '')
      .replace(/\s+[-–]\s+(left|right)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(name) {
    let s = cleanName(name).toLowerCase().replace(/&/g, ' and ');
    s = s.replace(SYNONYM_RE, (m, pre, word) => pre + SYNONYMS[word.replace(/\s+/g, ' ')]);
    return s
      .replace(/[^a-z0-9 ]/g, ' ') // "bent-over" and "bent over" compare equal
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t))
      .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
  }

  function href(name) {
    return `/exercise-database.html?find=${encodeURIComponent(cleanName(name))}`;
  }

  function isKettlebell(ex) {
    return /kettlebell/i.test(`${ex.name || ''} ${ex.primaryEquipment || ''}`);
  }

  /**
   * Best database match for a name.
   * Returns { match, score, query }: `match` is set only when confident
   * enough to open it directly; `query` is the search to show otherwise.
   */
  function findMatch(name, exercises) {
    const want = tokens(name);
    const query = want.join(' ');
    if (!want.length) return { match: null, score: 0, query };
    const wantSet = new Set(want);
    let best = null;
    let bestScore = 0;
    (exercises || []).forEach((ex) => {
      const have = new Set(tokens(ex.name));
      if (!have.size) return;
      let shared = 0;
      let union = 0;
      new Set([...wantSet, ...have]).forEach((t) => {
        union += weight(t);
        if (wantSet.has(t) && have.has(t)) shared += weight(t);
      });
      if (!shared) return;
      // Weighted overlap, nudged toward kettlebell versions of the move and
      // away from the same move done with other equipment (still searchable)
      let score = shared / union;
      if (isKettlebell(ex)) score += 0.05;
      const equipment = tokens(ex.primaryEquipment || '');
      if ([...have, ...equipment].some((t) => OTHER_EQUIPMENT.has(t) && !wantSet.has(t))) score -= 0.3;
      if (score > bestScore) { bestScore = score; best = ex; }
    });
    return {
      match: bestScore >= AUTO_OPEN_SCORE ? best : null,
      score: bestScore,
      query,
    };
  }

  window.ExerciseLink = { href, cleanName, tokens, findMatch };
})();
