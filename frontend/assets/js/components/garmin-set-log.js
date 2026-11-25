/**
 * Garmin Set Log
 * A Garmin strength/HIIT activity as a time-ordered, editable list of every
 * set the watch recorded. Sets group into exercise cards in workout order.
 * Fix a set's exercise, reps or weight; include or leave out sets; add sets;
 * move sets and cards; match the session to a workout (planned vs actual) or
 * save it as a new one. Also reopens imported sessions for corrections.
 *
 *   window.garminSetLog.mount(container, {
 *       pendingId | activity | sessionId, onClose(changed), onMerge() })
 *
 * Backend: POST /api/v3/garmin/import/set-log, GET .../set-log/session/{id},
 * POST .../log-sets (backend/services/garmin/set_log.py).
 * @version 1.0.0
 */
(function () {
    'use strict';

    const KG_TO_LB = 2.20462;
    const DRAFT_PREFIX = 'ffn_garmin_setlog_';
    let st = null;   // state of the mounted editor

    // ── helpers ────────────────────────────────────────────────────────────

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML.replace(/"/g, '&quot;');
    }

    function norm(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    /** Words of a name with plurals folded. Mirrors set_log._words on the server. */
    function words(name) {
        return new Set(norm(name).split(' ').filter(Boolean)
            .map(w => (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)));
    }

    function subset(a, b) {
        for (const x of a) if (!b.has(x)) return false;
        return true;
    }

    /** The workout exercise a name most likely means. Mirrors set_log.template_match. */
    function templateMatch(name, templateNames) {
        const w = words(name);
        if (!w.size) return null;
        let best = null;
        let bestDiff = null;
        for (const t of templateNames) {
            const tw = words(t);
            if (tw.size === w.size && subset(w, tw)) return t;
            if (tw.size && (subset(w, tw) || subset(tw, w))) {
                const diff = Math.abs(tw.size - w.size);
                if (best === null || diff < bestDiff) { best = t; bestDiff = diff; }
            }
        }
        return best;
    }

    function target() {
        return st.targetId ? (st.log.workout_options || []).find(o => o.id === st.targetId) || null : null;
    }

    /** Name a set is shown and saved under: the user's choice, else the matched workout exercise, else the guess. */
    function nameOf(item) {
        if (item.edited) return item.exercise_name;
        // A set the watch couldn't name goes with its neighbour, whatever that ends up being called.
        if (item.name_source === 'neighbor') {
            const at = st.items.indexOf(item);
            const named = i => i.type === 'set' && i.included && i.name_source !== 'neighbor';
            const near = st.items.slice(0, at).reverse().find(named) || st.items.slice(at + 1).find(named);
            if (near) return nameOf(near);
        }
        const t = target();
        if (t) {
            const names = t.exercises.map(e => e.name);
            let hit = templateMatch(item.exercise_name, names);
            if (!hit && item.name_source !== 'saved' && item.name_source !== 'exact') {
                hit = templateMatch(item.garmin_label, names);
            }
            if (hit) return hit;
        }
        return item.exercise_name;
    }

    function fmtTime(iso) {
        return iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    }

    function fmtDur(seconds) {
        if (seconds == null) return '';
        const s = Math.round(seconds);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function fmtNum(n) {
        return n == null || n === '' ? '' : String(Math.round(Number(n) * 2) / 2);
    }

    function notify(message, type) {
        if (window.showToast) window.showToast({ message, type });
    }

    async function api(method, path, body) {
        const headers = await window.garminImportService._headers();
        const response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        return window.garminImportService._handle(response, 'Something went wrong.');
    }

    // ── draft (unsaved edits survive a reload) ─────────────────────────────

    function draftKey() {
        return DRAFT_PREFIX + (st.log.session_id || st.log.activity.external_id);
    }

    function saveDraft() {
        try {
            localStorage.setItem(draftKey(), JSON.stringify({
                items: st.items, unit: st.unit, targetId: st.targetId, workoutName: st.workoutName,
                keepTemplate: st.keepTemplate }));
        } catch (e) { /* storage full or unavailable */ }
    }

    function clearDraft() {
        try { localStorage.removeItem(draftKey()); } catch (e) { /* ignore */ }
    }

    function loadDraft() {
        try {
            const d = JSON.parse(localStorage.getItem(draftKey()) || 'null');
            return d && Array.isArray(d.items) && d.items.length ? d : null;
        } catch (e) {
            return null;
        }
    }

    function touch() {
        st.dirty = true;
        saveDraft();
    }

    // ── cards ──────────────────────────────────────────────────────────────

    /** Consecutive sets with the same exercise form a card; cardio items are their own card. */
    function cards() {
        const out = [];
        st.items.forEach((item, index) => {
            if (item.type === 'cardio') {
                out.push({ type: 'cardio', name: item.name, entries: [{ item, index }] });
                return;
            }
            const name = nameOf(item);
            const last = out[out.length - 1];
            if (last && last.type === 'set' && norm(last.name) === norm(name)) {
                last.entries.push({ item, index });
            } else {
                out.push({ type: 'set', name, entries: [{ item, index }] });
            }
        });
        return out;
    }

    function setsText(items) {
        const parts = items.map(i => {
            const reps = i.reps ? i.reps : (i.duration_s ? `${Math.round(i.duration_s)}s` : '?');
            return i.weight != null && i.weight !== '' ? `${reps}×${fmtNum(i.weight)}` : `${reps}`;
        });
        const weighted = items.some(i => i.weight != null && i.weight !== '');
        return parts.join(', ') + (weighted ? ` ${st.unit}` : '');
    }

    function plannedText(e) {
        const w = e.weight ? ` @ ${e.weight}${/^[0-9.]+$/.test(String(e.weight)) ? ` ${e.weight_unit || ''}` : ''}` : '';
        return `${e.sets || '?'}×${e.reps || '?'}${w}`.trim();
    }

    function plannedHtml() {
        const t = target();
        if (!t) return '';
        const included = st.items.filter(i => i.type === 'set' && i.included);
        const rows = t.exercises.map(e => {
            const done = included.filter(i => norm(nameOf(i)) === norm(e.name));
            return `
              <li class="gsl-planned-row ${done.length ? '' : 'text-muted'}" data-planned="${esc(e.name)}">
                <span class="fw-medium">${esc(e.name)}</span>
                <span class="text-muted">planned ${esc(plannedText(e))}</span>
                <span>${done.length ? `→ ${esc(setsText(done))}` : '→ not done'}</span>
              </li>`;
        }).join('');
        return `<ul class="list-unstyled small mb-0" id="gslPlanned">${rows}</ul>`;
    }

    function setRowHtml(entry, pos, count) {
        const i = entry.item;
        const meta = [];
        if (i.duration_s != null) meta.push(fmtDur(i.duration_s));
        if (i.rest_s != null) meta.push(`rest ${fmtDur(i.rest_s)}`);
        if (i.avg_heart_rate) meta.push(`${i.avg_heart_rate} bpm`);
        const guess = i.garmin_label && norm(i.garmin_label) !== norm(nameOf(i))
            ? `<span class="badge bg-label-secondary" title="What the watch thought this set was">Garmin: ${esc(i.garmin_label)}</span>` : '';
        const flag = i.accidental
            ? '<span class="badge bg-label-warning" title="No reps and only a few seconds">Looks accidental</span>' : '';
        const added = i.added ? '<span class="badge bg-label-info">Added</span>' : '';
        const renaming = st.renamingSet === i.id;
        return `
          <div class="gsl-set ${i.included ? '' : 'gsl-excluded'}" data-set="${esc(i.id)}">
            <span class="gsl-time text-muted small">${esc(fmtTime(i.started_at)) || '–'}</span>
            <span class="gsl-values">
              <input type="number" class="form-control form-control-sm gsl-reps" min="0" max="999" inputmode="numeric"
                     value="${i.reps == null ? '' : esc(i.reps)}" placeholder="${i.duration_s && !i.reps ? `${Math.round(i.duration_s)}s` : 'reps'}"
                     aria-label="Reps" ${i.included ? '' : 'disabled'}>
              <span class="text-muted">×</span>
              <input type="number" class="form-control form-control-sm gsl-weight" min="0" step="0.5" inputmode="decimal"
                     value="${i.weight == null ? '' : esc(fmtNum(i.weight))}" placeholder="${i.bodyweight ? 'Body' : st.unit}"
                     aria-label="Weight (${st.unit})" ${i.included ? '' : 'disabled'}>
            </span>
            <span class="gsl-meta small text-muted">${esc(meta.join(' · '))} ${guess} ${flag} ${added}</span>
            <span class="gsl-actions">
              ${i.included ? `
                <button type="button" class="btn btn-sm btn-icon" data-act="set-up" title="Move set up" aria-label="Move set up" ${pos === 0 && entry.index === 0 ? 'disabled' : ''}><i class="bx bx-chevron-up"></i></button>
                <button type="button" class="btn btn-sm btn-icon" data-act="set-down" title="Move set down" aria-label="Move set down" ${entry.index === st.items.length - 1 ? 'disabled' : ''}><i class="bx bx-chevron-down"></i></button>
                <button type="button" class="btn btn-sm btn-icon" data-act="set-rename" title="This set was a different exercise" aria-label="Change this set's exercise"><i class="bx bx-transfer-alt"></i></button>
                <button type="button" class="btn btn-sm btn-icon" data-act="set-exclude" title="Leave this set out" aria-label="Leave this set out"><i class="bx bx-x"></i></button>`
                : `<button type="button" class="btn btn-sm btn-outline-secondary" data-act="set-include">Include</button>`}
            </span>
            ${renaming ? `
            <span class="gsl-rename w-100 d-flex gap-2 mt-1">
              <input class="form-control form-control-sm gsl-set-name" list="gslExercises" value="${esc(nameOf(i))}"
                     aria-label="Exercise for this set">
              <button type="button" class="btn btn-sm btn-primary" data-act="set-rename-ok">OK</button>
            </span>` : ''}
          </div>`;
    }

    function cardHtml(card, cardIndex, total) {
        const first = card.entries[0];
        const moveBtns = `
            <button type="button" class="btn btn-sm btn-icon" data-act="card-up" title="Move exercise up" aria-label="Move exercise up" ${cardIndex === 0 ? 'disabled' : ''}><i class="bx bx-up-arrow-alt"></i></button>
            <button type="button" class="btn btn-sm btn-icon" data-act="card-down" title="Move exercise down" aria-label="Move exercise down" ${cardIndex === total - 1 ? 'disabled' : ''}><i class="bx bx-down-arrow-alt"></i></button>`;
        if (card.type === 'cardio') {
            const c = first.item;
            const bits = [];
            if (c.duration_minutes) bits.push(`${Math.round(c.duration_minutes)} min`);
            if (c.distance_m) bits.push(`${(c.distance_m / 1609.344).toFixed(2)} mi`);
            if (c.avg_heart_rate) bits.push(`${c.avg_heart_rate} bpm`);
            if (c.calories) bits.push(`${c.calories} cal`);
            return `
              <div class="card gsl-card gsl-cardio mb-2 ${c.included ? '' : 'gsl-excluded'}" data-card="${cardIndex}" data-first="${first.index}" data-set="${esc(c.id)}">
                <div class="card-body py-2 d-flex flex-wrap align-items-center gap-2">
                  <span class="gsl-time text-muted small">${esc(fmtTime(c.started_at))}</span>
                  <i class="bx bx-pulse text-primary"></i>
                  <span class="fw-semibold">${esc(c.name)}</span>
                  <span class="badge bg-label-info">Garmin activity</span>
                  <span class="small text-muted flex-grow-1">${esc(bits.join(' · '))}</span>
                  ${moveBtns}
                  ${c.included
                    ? '<button type="button" class="btn btn-sm btn-icon" data-act="set-exclude" title="Leave it out of this session" aria-label="Leave it out"><i class="bx bx-x"></i></button>'
                    : '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="set-include">Include</button>'}
                </div>
              </div>`;
        }
        const included = card.entries.filter(e => e.item.included).map(e => e.item);
        const t = target();
        let plan = '';
        if (t) {
            const p = t.exercises.find(e => norm(e.name) === norm(card.name));
            plan = p ? `<span class="badge bg-label-success gsl-plan">Planned ${esc(plannedText(p))}</span>`
                : `<span class="badge bg-label-secondary gsl-plan">Not in ${esc(t.name)}</span>`;
        }
        const guessed = card.entries.every(e => !e.item.edited && e.item.name_source !== 'saved'
            && e.item.name_source !== 'exact') && !(t && t.exercises.some(e => norm(e.name) === norm(card.name)));
        return `
          <div class="card gsl-card mb-2" data-card="${cardIndex}" data-first="${first.index}">
            <div class="card-body py-2">
              <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span class="gsl-time text-muted small">${esc(fmtTime(first.item.started_at))}</span>
                <input class="form-control form-control-sm gsl-name flex-grow-1 fw-semibold" list="gslExercises"
                       value="${esc(card.name)}" aria-label="Exercise name" placeholder="Name this exercise">
                ${guessed ? '<span class="badge bg-label-warning" title="A guess: check the name">Check name</span>' : ''}
                ${plan}
                <span class="small text-muted gsl-count">${included.length} set${included.length === 1 ? '' : 's'}</span>
                ${moveBtns}
              </div>
              ${card.entries.map((e, pos) => setRowHtml(e, pos, card.entries.length)).join('')}
              <button type="button" class="btn btn-sm btn-link px-0" data-act="add-set"><i class="bx bx-plus"></i> Add set</button>
            </div>
          </div>`;
    }

    // ── render ─────────────────────────────────────────────────────────────

    function headerHtml() {
        const a = st.log.activity;
        const stats = [`${Math.round(a.duration_minutes || 0)} min`];
        if (a.avg_heart_rate) stats.push(`${a.avg_heart_rate} bpm avg${a.max_heart_rate ? ` / ${a.max_heart_rate} max` : ''}`);
        if (a.calories) stats.push(`${a.calories} cal`);
        const sets = st.items.filter(i => i.type === 'set');
        stats.push(`${sets.filter(i => i.included).length} of ${sets.length} sets included`);
        const when = new Date(a.started_at).toLocaleString([], {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const reopening = !!st.log.session_id;

        const options = (st.log.workout_options || []).map(o => `
            <option value="${esc(o.id)}" ${o.id === st.targetId ? 'selected' : ''}>${esc(o.name)}${o.score ? ` (${Math.round(o.score * 100)}% match)` : ''}</option>`).join('');
        const targetBlock = reopening ? `
            <p class="small text-muted mb-0">Logged to <strong>${esc(st.log.workout_name)}</strong>. Correct the sets and save.</p>` : `
            <div class="row g-2 align-items-end">
              <div class="col-md-5">
                <label class="form-label small mb-1" for="gslTarget">Workout</label>
                <select class="form-select form-select-sm" id="gslTarget">
                  ${options}
                  <option value="" ${st.targetId ? '' : 'selected'}>New workout from this session</option>
                </select>
              </div>
              <div class="col-md-4 ${st.targetId ? 'd-none' : ''}" id="gslNewName">
                <label class="form-label small mb-1" for="gslWorkoutName">Name</label>
                <input class="form-control form-control-sm" id="gslWorkoutName" maxlength="100" value="${esc(st.workoutName)}">
              </div>
              <div class="col-md-3 ${st.targetId ? 'd-none' : ''}" id="gslKeepRow">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="gslKeepTemplate" ${st.keepTemplate ? 'checked' : ''}>
                  <label class="form-check-label small" for="gslKeepTemplate">Keep as a template</label>
                </div>
              </div>
            </div>
            <div class="mt-2" id="gslPlannedWrap">${plannedHtml()}</div>`;

        return `
          <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
            <div>
              <h5 class="mb-0" id="gslTitle">${esc(a.name)} · ${esc(when)}</h5>
              <div class="small text-muted" id="gslStats">${esc(stats.join(' · '))}${a.device ? ` · ${esc(a.device)}` : ''}</div>
            </div>
            <div class="d-flex align-items-center gap-2">
              <select class="form-select form-select-sm garmin-unit-select" id="gslUnit" aria-label="Weight unit">
                <option value="lbs" ${st.unit === 'lbs' ? 'selected' : ''}>lbs</option>
                <option value="kg" ${st.unit === 'kg' ? 'selected' : ''}>kg</option>
              </select>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="gslBack">Back to list</button>
            </div>
          </div>
          ${st.restored ? `<div class="alert alert-info small py-2" id="gslRestored">Your unsaved edits were restored.
              <a href="#" data-act="reset">Reset to watch data</a></div>` : ''}
          ${st.renameOffer ? `<div class="alert alert-secondary small py-2 d-flex align-items-center justify-content-between gap-2" id="gslRenameOffer">
              <span>${st.renameOffer.count} more set${st.renameOffer.count === 1 ? ' is' : 's are'} still named “${esc(st.renameOffer.from)}”.</span>
              <button type="button" class="btn btn-sm btn-primary flex-shrink-0" data-act="rename-all">Rename them to “${esc(st.renameOffer.to)}” too</button>
            </div>` : ''}
          <div class="gsl-target card mb-3"><div class="card-body py-2">${targetBlock}</div></div>`;
    }

    function render() {
        const list = cards();
        const known = new Set([...(target() ? target().exercises.map(e => e.name) : []), ...(st.log.known_exercises || [])]);
        st.host.innerHTML = `
          <div class="garmin-set-log" id="garminSetLog">
            ${headerHtml()}
            <datalist id="gslExercises">${[...known].map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
            <div id="gslCards">${list.map((c, i) => cardHtml(c, i, list.length)).join('')}</div>
            <div class="alert alert-danger small mt-3 d-none" id="gslError" role="alert"></div>
            <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
              <button type="button" class="btn btn-primary px-4" id="gslSave">
                <i class="bx bx-check me-1"></i>${st.log.session_id ? 'Save changes' : 'Log session'}</button>
              <button type="button" class="btn btn-outline-secondary" data-act="reset">Reset to watch data</button>
              ${!st.log.session_id && st.opts.onMerge ? '<button type="button" class="btn btn-link btn-sm" id="gslMerge">Merge into a session I already logged instead</button>' : ''}
            </div>
          </div>`;
        document.getElementById('gslBack').onclick = close;
        document.getElementById('gslSave').onclick = save;
        const merge = document.getElementById('gslMerge');
        if (merge) merge.onclick = () => st.opts.onMerge();
    }

    /** After typing in a reps/weight box: refresh the summaries without redrawing (keeps focus). */
    function refreshSummaries() {
        const wrap = document.getElementById('gslPlannedWrap');
        if (wrap) wrap.innerHTML = plannedHtml();
    }

    // ── edits ──────────────────────────────────────────────────────────────

    function cardAt(el) {
        const cardEl = el.closest('[data-card]');
        return cardEl ? cards()[Number(cardEl.dataset.card)] : null;
    }

    function itemAt(el) {
        const row = el.closest('[data-set]');
        return row ? st.items.find(i => i.id === row.dataset.set) : null;
    }

    function rename(items, name) {
        items.forEach(i => { i.exercise_name = name; i.edited = true; });
    }

    function onChange(e) {
        const el = e.target;
        if (el.id === 'gslTarget') {
            st.targetId = el.value || null;
            st.renameOffer = null;
            touch();
            render();
        } else if (el.id === 'gslUnit') {
            const factor = el.value === 'kg' ? 1 : KG_TO_LB;
            st.items.forEach(i => {
                if (i.type !== 'set' || i.weight == null || i.weight === '') return;
                if (i.weight_kg != null && !i.weightEdited) i.weight = Math.round(i.weight_kg * factor * 2) / 2;
                else i.weight = Math.round(Number(i.weight) * (el.value === 'kg' ? 1 / KG_TO_LB : KG_TO_LB) * 2) / 2;
            });
            st.unit = el.value;
            touch();
            render();
        } else if (el.id === 'gslKeepTemplate') {
            st.keepTemplate = el.checked;
            touch();
        } else if (el.classList.contains('gsl-name')) {
            const card = cardAt(el);
            const name = el.value.trim();
            if (!card || !name || norm(name) === norm(card.name)) { el.value = card ? card.name : ''; return; }
            const from = card.name;
            const mine = new Set(card.entries.map(en => en.item.id));
            rename(card.entries.map(en => en.item), name);
            const others = st.items.filter(i => i.type === 'set' && !mine.has(i.id) && norm(nameOf(i)) === norm(from));
            st.renameOffer = others.length ? { from, to: name, count: others.length } : null;
            touch();
            render();
        }
    }

    function onInput(e) {
        const el = e.target;
        const item = itemAt(el);
        if (el.id === 'gslWorkoutName') {
            st.workoutName = el.value;
            touch();
        } else if (item && el.classList.contains('gsl-reps')) {
            item.reps = el.value === '' ? null : Math.max(0, Math.round(Number(el.value)));
            touch();
            refreshSummaries();
        } else if (item && el.classList.contains('gsl-weight')) {
            item.weight = el.value === '' ? null : Math.max(0, Number(el.value));
            item.weightEdited = true;
            touch();
            refreshSummaries();
        }
    }

    function move(from, to, count) {
        const chunk = st.items.splice(from, count);
        st.items.splice(to, 0, ...chunk);
    }

    function onClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        e.preventDefault();
        const act = btn.dataset.act;
        const item = itemAt(btn);
        const index = item ? st.items.indexOf(item) : -1;
        const list = cards();
        const cardEl = btn.closest('[data-card]');
        const ci = cardEl ? Number(cardEl.dataset.card) : -1;

        if (act === 'reset') {
            st.items = JSON.parse(JSON.stringify(st.original));
            st.unit = st.log.weight_unit;
            st.targetId = st.log.target_id || null;
            st.workoutName = st.log.workout_name;
            st.renameOffer = null;
            st.restored = false;
            st.dirty = false;
            clearDraft();
        } else if (act === 'rename-all' && st.renameOffer) {
            const { from, to } = st.renameOffer;
            rename(st.items.filter(i => i.type === 'set' && norm(nameOf(i)) === norm(from)), to);
            st.renameOffer = null;
            touch();
        } else if (act === 'set-exclude' && item) {
            item.included = false;
            touch();
        } else if (act === 'set-include' && item) {
            item.included = true;
            touch();
        } else if (act === 'set-up' && index > 0) {
            // A set keeps its exercise when it moves, even into another exercise's run.
            if (!item.edited) { item.exercise_name = nameOf(item); item.edited = true; }
            move(index, index - 1, 1);
            touch();
        } else if (act === 'set-down' && index > -1 && index < st.items.length - 1) {
            if (!item.edited) { item.exercise_name = nameOf(item); item.edited = true; }
            move(index, index + 1, 1);
            touch();
        } else if (act === 'set-rename' && item) {
            st.renamingSet = st.renamingSet === item.id ? null : item.id;
        } else if (act === 'set-rename-ok' && item) {
            const input = btn.closest('[data-set]').querySelector('.gsl-set-name');
            const name = input.value.trim();
            if (name) { rename([item], name); touch(); }
            st.renamingSet = null;
        } else if (act === 'add-set' && ci > -1) {
            const card = list[ci];
            const lastEntry = card.entries[card.entries.length - 1];
            const src = lastEntry.item;
            st.added = (st.added || 0) + 1;
            st.items.splice(lastEntry.index + 1, 0, {
                id: `added-${Date.now()}-${st.added}`, type: 'set', started_at: null, garmin_key: null,
                garmin_label: null, exercise_name: card.name, edited: true, name_source: 'user',
                reps: src.reps, weight: src.weight, weight_kg: null, weightEdited: true, bodyweight: src.bodyweight,
                duration_s: null, rest_s: null, avg_heart_rate: null, max_heart_rate: null,
                accidental: false, included: true, added: true });
            touch();
        } else if (act === 'card-up' && ci > 0) {
            const card = list[ci];
            const prev = list[ci - 1];
            move(card.entries[0].index, prev.entries[0].index, card.entries.length);
            touch();
        } else if (act === 'card-down' && ci > -1 && ci < list.length - 1) {
            const card = list[ci];
            const next = list[ci + 1];
            move(next.entries[0].index, card.entries[0].index, next.entries.length);
            touch();
        } else {
            return;
        }
        render();
    }

    // ── save / close ───────────────────────────────────────────────────────

    function close() {
        const cb = st.opts.onClose;
        const changed = st.saved;
        if (cb) cb(changed);
    }

    async function save() {
        const errorBox = document.getElementById('gslError');
        const fail = msg => { errorBox.textContent = msg; errorBox.classList.remove('d-none'); };
        errorBox.classList.add('d-none');

        const included = st.items.filter(i => i.included);
        if (!included.length) return fail('Include at least one set.');
        if (included.some(i => i.type === 'set' && !String(nameOf(i) || '').trim())) {
            return fail('Every set needs an exercise name.');
        }
        if (!st.log.session_id && !st.targetId && !String(st.workoutName || '').trim()) {
            return fail('Give the new workout a name.');
        }

        const btn = document.getElementById('gslSave');
        const label = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';
        try {
            const result = await api('POST', '/api/v3/garmin/import/log-sets', {
                activity: st.log.activity,
                pending_id: st.log.pending_id || null,
                session_id: st.log.session_id || null,
                items: st.items.map(i => (i.type === 'set' ? { ...i, exercise_name: nameOf(i) } : i)),
                target_id: st.targetId,
                workout_name: st.workoutName || '',
                save_as_template: !st.targetId && !!st.keepTemplate,
                weight_unit: st.unit,
            });
            clearDraft();
            st.saved = true;
            notify(result.message || 'Session logged', 'success');
            close();
        } catch (e) {
            fail(e.message);
            btn.disabled = false;
            btn.innerHTML = label;
        }
    }

    // ── mount ──────────────────────────────────────────────────────────────

    async function mount(container, opts) {
        container.innerHTML = `
          <div class="text-center py-5" id="gslLoading">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-3 text-muted">Loading every set from the watch…</p>
          </div>`;
        let log;
        try {
            log = opts.sessionId
                ? await api('GET', `/api/v3/garmin/import/set-log/session/${encodeURIComponent(opts.sessionId)}`)
                : await api('POST', '/api/v3/garmin/import/set-log',
                    { activity: opts.activity || null, pending_id: opts.pendingId || null });
        } catch (e) {
            container.innerHTML = `
              <div class="alert alert-danger small" id="gslError">${esc(e.message)}</div>
              <button class="btn btn-outline-secondary" id="gslBack">Back to list</button>`;
            document.getElementById('gslBack').onclick = () => opts.onClose && opts.onClose(false);
            return;
        }
        st = {
            host: container, opts: opts || {}, log, original: JSON.parse(JSON.stringify(log.items)),
            items: log.items, unit: log.weight_unit, targetId: log.target_id || null,
            workoutName: log.workout_name || '', keepTemplate: false, renameOffer: null, renamingSet: null,
            restored: false, dirty: false, saved: false,
        };
        const draft = loadDraft();
        if (draft) {
            st.items = draft.items;
            st.unit = draft.unit || st.unit;
            st.targetId = draft.targetId !== undefined ? draft.targetId : st.targetId;
            st.workoutName = draft.workoutName || st.workoutName;
            st.keepTemplate = !!draft.keepTemplate;
            st.restored = true;
        }
        if (!container.dataset.gslBound) {
            container.dataset.gslBound = '1';
            container.addEventListener('click', e => { if (st && st.host === container && container.querySelector('#garminSetLog')) onClick(e); });
            container.addEventListener('change', e => { if (st && container.querySelector('#garminSetLog')) onChange(e); });
            container.addEventListener('input', e => { if (st && container.querySelector('#garminSetLog')) onInput(e); });
        }
        render();
    }

    window.garminSetLog = { mount, _templateMatch: templateMatch, _state: () => st };
})();
