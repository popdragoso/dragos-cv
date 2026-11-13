/* Job Radar UI. Vanilla JS, no build step. Data comes from data/jobs.json (GitHub Pages) or window.JR_DATA (single-file build). */
(function () {
  'use strict';
  const JR = window.JR;
  const ENV = window.JR_ENV || {};
  const $ = (s, el) => (el || document).querySelector(s);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('jr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('jr.' + k, JSON.stringify(v)); } catch (e) { /* storage is a convenience only */ } },
  };

  const S = {
    data: null, jobs: [], profile: null,
    weights: store.get('weights', Object.assign({}, JR.DEFAULT_WEIGHTS)),
    f: Object.assign({ q: '', sort: 'overall', modes: [], days: 0, minFit: 0, pay: false, hideBlocked: true, source: '', show: 'open', all: false }, store.get('filters', {})),
    marks: store.get('marks', {}), // id -> 'saved' | 'hidden' | 'applied'
    showWeights: false, sheet: null, limit: 40,
  };
  S.f.q = '';

  /* ---------- profile ---------- */
  function loadProfile() {
    const saved = store.get('profile', null);
    if (saved && saved.text) {
      S.profile = JR.buildProfile(saved.text, { name: saved.name || 'You', linkedin: saved.linkedin || '', languages: saved.languages || undefined, custom: true });
    } else S.profile = JR.defaultProfile();
    S.profile.salaryFloor = store.get('floor', null);
  }

  /* ---------- scoring ---------- */
  function key(j) { return JR.norm(j.company).replace(/[^a-z0-9]/g, '') + '|' + JR.norm(j.title).replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, ''); }
  function prepare() {
    const seen = new Map();
    for (const j of (S.data && S.data.jobs) || []) {
      const k = key(j);
      const prev = seen.get(k);
      if (prev) {
        prev.sourcesAll = [...new Set(prev.sourcesAll.concat(j.source))];
        if ((j.description || '').length > (prev.description || '').length) { prev.description = j.description; delete prev.e; }
        if (j.postedAt && (!prev.postedAt || j.postedAt > prev.postedAt)) prev.postedAt = j.postedAt;
        if (!prev.salaryText && j.salaryText) { prev.salaryText = j.salaryText; delete prev.e; }
        continue;
      }
      seen.set(k, Object.assign({ sourcesAll: [j.source] }, j));
    }
    S.jobs = [...seen.values()];
    rescore();
  }
  function rescore() {
    const now = Date.now();
    for (const j of S.jobs) {
      j.s = JR.score(j, S.profile, { now });
      j.o = JR.overall(j.s.sub, S.weights);
    }
    badges();
  }
  function relevant(j) { return j.e.eligible && j.e.family !== 'other'; }
  function badges() {
    for (const j of S.jobs) j.badges = [];
    const pool = S.jobs.filter((j) => relevant(j) && !j.s.hardKnockout && S.marks[j.id] !== 'hidden');
    const strong = pool.filter((j) => j.s.fit >= 55);
    const base = strong.length >= 3 ? strong : pool;
    const top = (arr, f) => arr.reduce((b, j) => (f(j) != null && (b == null || f(j) > f(b)) ? j : b), null);
    S.picks = [
      ['Best overall', top(pool, (j) => j.o), (j) => j.o + ' / 100', 'Fit, remote, freshness, pay, flexibility and benefits, weighted your way'],
      ['Highest fit', top(pool, (j) => j.s.fit), (j) => j.s.fit + '% match', 'Closest to your CV'],
      ['Newest strong match', top(base.filter((j) => j.s.days != null), (j) => -j.s.days * 1000 + j.s.fit), (j) => ago(j.s.days), 'Posted most recently among good fits'],
      ['Best paid', top(base.filter((j) => j.s.payRef), (j) => j.s.payRef), (j) => payText(j.e.salary, true), 'Highest disclosed pay among good fits'],
      ['Most flexible', top(base, (j) => j.s.sub.mode * 2 + j.s.sub.flex + j.s.fit / 100), (j) => modeLabel(j.e), 'Remote first, then hybrid, then extra flexibility'],
      ['Best benefits', top(base.filter((j) => j.e.benefitScore > 0), (j) => j.e.benefitScore * 100 + j.s.fit), (j) => j.e.benefits.length + ' benefits listed', 'Most benefits stated in the posting'],
    ].filter((p) => p[1]);
    for (const [name, j] of S.picks) j.badges.push(name);
  }

  /* ---------- formatting ---------- */
  function ago(d) { return d == null ? 'Date not given' : d === 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? d + ' days ago' : Math.round(d / 30) + ' mo ago'; }
  const money = (n, c) => (c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : c + ' ') + Math.round(n / 1000) + 'k';
  function payText(s, short) {
    if (!s) return 'Pay not disclosed';
    const a = s.min && s.max && s.min !== s.max ? money(s.min, s.currency) + '–' + money(s.max, s.currency) : s.max && !s.min ? 'up to ' + money(s.max, s.currency) : 'from ' + money(s.min || s.max, s.currency);
    const eur = s.converted ? ' (≈ €' + Math.round((s.eurMax || s.eurMin) / 1000) + 'k)' : '';
    return a + (short ? '' : eur + (s.period !== 'year' ? ', annualised from per-' + s.period : ''));
  }
  function modeLabel(e) {
    if (e.workMode === 'remote') return 'Remote' + (e.remoteScope && e.remoteScope !== 'Unspecified' ? ' · ' + e.remoteScope : '');
    if (e.workMode === 'hybrid') return 'Hybrid' + (e.officeDays ? ' · ' + e.officeDays + ' office day' + (e.officeDays > 1 ? 's' : '') : '');
    if (e.workMode === 'onsite') return 'On-site';
    return 'Work mode not stated';
  }
  const ringColor = (v) => (v >= 70 ? 'var(--good)' : v >= 50 ? 'var(--accent)' : v >= 35 ? 'var(--warn)' : 'var(--faint)');
  function fmtDate(iso) { try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } }

  /* ---------- filtering ---------- */
  function visible() {
    const f = S.f;
    const q = JR.norm(f.q).trim();
    let arr = S.jobs.filter((j) => {
      const mark = S.marks[j.id];
      if (f.show === 'open' && (mark === 'hidden' || mark === 'applied')) return false;
      if (f.show === 'saved' && mark !== 'saved') return false;
      if (f.show === 'applied' && mark !== 'applied') return false;
      if (f.show === 'hidden' && mark !== 'hidden') return false;
      if (!f.all && !relevant(j)) return false;
      if (f.hideBlocked && j.s.hardKnockout) return false;
      if (f.modes.length && !f.modes.includes(j.e.workMode)) return false;
      if (f.days && (j.s.days == null || j.s.days > f.days)) return false;
      if (j.s.fit < f.minFit) return false;
      if (f.pay && !j.e.salary) return false;
      if (f.source && !j.sourcesAll.includes(f.source)) return false;
      if (q && !JR.norm(j.title + ' ' + j.company + ' ' + j.location + ' ' + (j.description || '')).includes(q)) return false;
      return true;
    });
    const by = {
      overall: (j) => j.o, fit: (j) => j.s.fit, newest: (j) => (j.s.days == null ? -1e6 : -j.s.days), pay: (j) => j.s.payRef || 0,
      flex: (j) => j.s.sub.mode * 2 + j.s.sub.flex, benefits: (j) => j.e.benefitScore,
    }[f.sort];
    arr.sort((a, b) => by(b) - by(a) || b.s.fit - a.s.fit);
    return arr;
  }

  /* ---------- render ---------- */
  function render() {
    store.set('filters', S.f);
    const d = S.data;
    const jobs = visible();
    const rel = S.jobs.filter(relevant);
    const srcOk = d ? d.sources.filter((s) => s.status === 'ok').length : 0;
    const ageH = d && d.generatedAt ? (Date.now() - new Date(d.generatedAt).getTime()) / 36e5 : null;
    const p = S.profile;
    const blocked = rel.filter((j) => j.s.hardKnockout).length;
    const sources = [...new Set(S.jobs.flatMap((j) => j.sourcesAll))].sort();

    $('#app').innerHTML = `
    <div class="top">
      <div class="who">
        <span class="label">Job Radar</span>
        <h1>Product roles in Barcelona and remote from Spain, ranked for ${h(p.name || 'you')}</h1>
        <p class="sub">${h(p.custom ? 'Matched against the CV you added.' : 'Matched against your CV: experimentation, growth and GenAI product.')} Every role is scored for fit, work mode, freshness, pay, flexibility and benefits.</p>
      </div>
      <div class="actions">
        <button class="btn" data-act="profile">Profile and LinkedIn</button>
        <button class="btn" data-act="sources">Sources</button>
      </div>
    </div>
    <div class="status num">
      ${d && d.jobs.length ? `<span><span class="dot ${ageH > 36 ? 'stale' : ''}"></span>Last scan <b>${h(fmtDate(d.generatedAt))}</b></span>
      <span><b>${rel.length}</b> matching roles from <b>${S.jobs.length}</b> collected</span>
      <span><b>${srcOk}</b> of ${d.sources.length} sources answered</span>
      ${blocked ? `<span><b>${blocked}</b> need a language you do not list</span>` : ''}` : `<span><span class="dot none"></span>No scan has run yet</span>`}
    </div>
    ${d && d.jobs.length && d.note ? `<div class="note warn">${h(d.note)}</div>` : ''}
    ${d && d.jobs.length ? `
    <section class="picks n${S.picks.length}" aria-label="Top picks">
      ${S.picks.map(([name, j, val, hint]) => `<button class="pick" data-open="${h(j.id)}" title="${h(hint)}"><span class="label">${h(name)}</span><span class="v num">${h(val(j))}</span><span class="t">${h(j.title)}</span><span class="small muted">${h(j.company)}</span></button>`).join('')}
    </section>
    <section class="controls">
      <div class="row">
        <input class="field" type="search" id="q" placeholder="Search title, company or keyword" value="${h(S.f.q)}" aria-label="Search">
        <select class="field" id="sort" aria-label="Sort by">
          ${[['overall', 'Best overall'], ['fit', 'Highest fit'], ['newest', 'Newest'], ['pay', 'Best paid'], ['flex', 'Most flexible'], ['benefits', 'Best benefits']].map(([v, l]) => `<option value="${v}" ${S.f.sort === v ? 'selected' : ''}>Sort: ${l}</option>`).join('')}
        </select>
        <button class="btn" data-act="weights" aria-pressed="${S.showWeights}">What matters to you</button>
      </div>
      ${S.showWeights ? `<div class="weights">${[['fit', 'Fit with your CV'], ['mode', 'Remote over hybrid over on-site'], ['fresh', 'Freshness'], ['pay', 'Pay'], ['flex', 'Flexibility'], ['benefits', 'Benefits']].map(([k, l]) => `<label for="w-${k}"><span class="wl"><span>${l}</span><span class="num muted">${S.weights[k]}</span></span><input type="range" id="w-${k}" data-w="${k}" min="0" max="60" value="${S.weights[k]}"></label>`).join('')}<div class="small muted">"Best overall" uses these weights. Pay that is not disclosed counts as slightly below average, never as zero. <button class="btn quiet" data-act="resetw">Reset</button></div></div>` : ''}
      <div class="row">
        <span class="seg">${[['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']].map(([v, l]) => `<button class="btn" data-mode="${v}" aria-pressed="${S.f.modes.includes(v)}">${l}</button>`).join('')}</span>
        <select class="field" id="days" aria-label="Posted within">${[[0, 'Any date'], [1, 'Last 24 hours'], [3, 'Last 3 days'], [7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days']].map(([v, l]) => `<option value="${v}" ${S.f.days == v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="field" id="minfit" aria-label="Minimum fit">${[0, 40, 50, 60, 70, 80].map((v) => `<option value="${v}" ${S.f.minFit == v ? 'selected' : ''}>${v ? 'Fit ' + v + '%+' : 'Any fit'}</option>`).join('')}</select>
        <select class="field" id="source" aria-label="Source"><option value="">All sources</option>${sources.map((s) => `<option ${S.f.source === s ? 'selected' : ''}>${h(s)}</option>`).join('')}</select>
        <button class="btn" data-tog="pay" aria-pressed="${S.f.pay}">Pay disclosed</button>
        <button class="btn" data-tog="hideBlocked" aria-pressed="${S.f.hideBlocked}">Hide language blockers</button>
        <button class="btn" data-tog="all" aria-pressed="${S.f.all}" title="Also show roles outside Spain and non-product titles">Show everything</button>
      </div>
      <div class="row small">
        <span class="seg">${[['open', 'Open'], ['saved', 'Saved'], ['applied', 'Applied'], ['hidden', 'Hidden']].map(([v, l]) => `<button class="btn quiet" data-show="${v}" aria-pressed="${S.f.show === v}">${l}${v !== 'open' ? ' ' + Object.values(S.marks).filter((m) => m === v).length : ''}</button>`).join('')}</span>
        <span class="spacer"></span><span class="muted num">${jobs.length} role${jobs.length === 1 ? '' : 's'} shown</span>
      </div>
    </section>
    <section class="list">${jobs.length ? jobs.slice(0, S.limit).map(card).join('') + (jobs.length > S.limit ? `<button class="btn" data-act="more">Show ${Math.min(40, jobs.length - S.limit)} more</button>` : '') : `<div class="empty"><h2>Nothing matches these filters</h2><p>Loosen a filter or clear the search.</p><button class="btn" data-act="clear">Clear filters</button></div>`}</section>`
    : emptyState()}
    <p class="small muted">Scores are estimates from the text of each posting. Pay, benefits and work mode are shown only when the posting states them. The ATS score is a keyword proxy, validated on 30 Barcelona product postings; it is not any employer's real system. Saved, applied and hidden marks are kept in this browser only.</p>`;
    if (S.sheet) renderSheet();
  }

  function emptyState() {
    const d = S.data;
    return `<div class="empty"><h2>The radar is built. It has not scanned yet.</h2>
      <p>${h((d && d.note) || 'The scan runs on GitHub Actions every morning and writes its results here. Once the first run finishes, this page fills with ranked roles.')}</p>
      <p>Everything else already works: open <b>Profile and LinkedIn</b> to see how your CV is read, and <b>Sources</b> to see which boards are covered.</p>
      <div class="row"><button class="btn primary" data-act="profile">See my profile</button><button class="btn" data-act="sources">See sources</button></div></div>`;
  }

  function card(j) {
    const e = j.e, s = j.s, mark = S.marks[j.id];
    const ben = e.benefits.slice(0, 5);
    return `<article class="job ${mark === 'hidden' ? 'dim' : ''}">
      <div class="ring" style="--p:${s.fit};--ring:${ringColor(s.fit)}" title="Fit with your CV"><span class="num">${s.fit}</span><small>fit</small></div>
      <div class="head">
        <button class="title" data-open="${h(j.id)}">${h(j.title)}</button>
        ${j.badges.map((b) => `<span class="chip badge">${h(b)}</span>`).join('')}
      </div>
      <div class="body">
        <div class="meta"><span><b>${h(j.company)}</b></span><span>${h(j.location || 'Location not given')}</span><span class="num">${h(ago(s.days))}</span><span>via ${h(j.sourcesAll.join(', '))}</span><span class="num">Overall ${j.o}</span></div>
        <div class="chips">
          <span class="chip ${e.workMode}">${h(modeLabel(e))}</span>
          <span class="chip ${e.salary ? 'pay' : ''} num">${h(payText(e.salary, true))}</span>
          ${s.knockouts.filter((k) => k.severity !== 'info').map((k) => `<span class="chip ${k.severity === 'hard' ? 'bad' : ''}">${h(k.text)}</span>`).join('')}
          ${e.flex.map((x) => `<span class="chip">${h(x.label)}</span>`).join('')}
          ${ben.map((b) => `<span class="chip">${h(b.label)}</span>`).join('')}${e.benefits.length > ben.length ? `<span class="chip">+${e.benefits.length - ben.length} more</span>` : ''}
        </div>
        <div class="why">${h(s.reasons.join(' · '))}</div>
        <div class="acts">
          <a class="btn" href="${h(j.url)}" target="_blank" rel="noopener noreferrer">Open posting</a>
          <button class="btn primary" data-tailor="${h(j.id)}">Tailor my CV</button>
          <button class="btn quiet" data-mark="saved" data-id="${h(j.id)}" aria-pressed="${mark === 'saved'}">${mark === 'saved' ? 'Saved' : 'Save'}</button>
          <button class="btn quiet" data-mark="applied" data-id="${h(j.id)}" aria-pressed="${mark === 'applied'}">${mark === 'applied' ? 'Applied' : 'Mark applied'}</button>
          <button class="btn quiet" data-mark="hidden" data-id="${h(j.id)}" aria-pressed="${mark === 'hidden'}">${mark === 'hidden' ? 'Hidden' : 'Hide'}</button>
        </div>
      </div>
    </article>`;
  }

  /* ---------- sheets ---------- */
  function renderSheet() {
    let el = $('#sheet');
    if (!S.sheet) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'sheet'; el.className = 'scrim'; document.body.appendChild(el); }
    const body = S.sheet.type === 'job' ? jobSheet() : S.sheet.type === 'profile' ? profileSheet() : sourcesSheet();
    const keep = $('.sheet', el) ? $('.sheet', el).scrollTop : 0;
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${body}</div>`;
    $('.sheet', el).scrollTop = S.sheet.keepScroll ? keep : 0;
    S.sheet.keepScroll = true;
  }

  function jobSheet() {
    const j = S.jobs.find((x) => x.id === S.sheet.id);
    if (!j) return '<p>Role not found.</p>';
    const e = j.e, s = j.s;
    const groups = { time: 'Time off', insurance: 'Insurance and health', money: 'Money', growth: 'Learning', life: 'Life' };
    const bars = [['Fit with your CV', s.sub.fit, s.fit + '%'], ['Work mode', s.sub.mode, modeLabel(e)], ['Freshness', s.sub.fresh, ago(s.days)], ['Pay', s.sub.pay, payText(e.salary, true)], ['Flexibility', s.sub.flex, e.flex.length ? e.flex.map((x) => x.label).join(', ') : 'Nothing stated'], ['Benefits', s.sub.benefits, e.benefits.length ? e.benefits.length + ' listed' : 'Nothing stated']];
    const t = S.sheet.tailor ? JR.tailor(j, S.profile) : null;
    return `<header><div><span class="label">${h(j.company)}</span><h1>${h(j.title)}</h1><p class="muted">${h(j.location || '')} · ${h(ago(s.days))} · via ${h(j.sourcesAll.join(', '))}</p></div><button class="btn" data-act="close" aria-label="Close">Close</button></header>
    <div class="row"><a class="btn primary" href="${h(j.url)}" target="_blank" rel="noopener noreferrer">Open posting</a>
      <button class="btn" data-act="toggletailor" aria-pressed="${!!S.sheet.tailor}">Tailor my CV for this role</button>
      ${ENV.trackerSheet ? `<button class="btn" data-act="track">Add to my tracker sheet</button>` : ''}</div>
    ${S.sheet.msg ? `<div class="note ${S.sheet.msgKind || ''}">${h(S.sheet.msg)}</div>` : ''}
    ${t ? tailorBlock(j, t) : ''}
    <section><h2>Why it ranks ${j.o} / 100 overall</h2><div class="card"><div class="bars num">${bars.map(([l, v, txt]) => `<span>${l}</span><span class="bar"><i style="width:${v == null ? 0 : v}%"></i></span><span class="muted">${h(txt)}</span>`).join('')}</div>
      ${s.knockouts.length ? `<div class="chips">${s.knockouts.map((k) => `<span class="chip ${k.severity === 'hard' ? 'bad' : ''}">${h(k.text)}</span>`).join('')}</div>` : ''}</div></section>
    <section><h2>What the posting states</h2><div class="card"><dl class="kv">
      <dt>Work mode</dt><dd>${h(modeLabel(e))}</dd>
      <dt>Pay</dt><dd class="num">${h(payText(e.salary))}${e.salary ? ` <span class="muted">· quoted as "${h(e.salary.quote)}"</span>` : ''}${e.salary && S.profile.salaryFloor ? ((e.salary.eurMax || e.salary.eurMin) >= S.profile.salaryFloor ? ' · reaches your floor' : ' · below your floor') : ''}</dd>
      <dt>Level</dt><dd>${h(e.seniority)}${e.yearsRequired ? ' · asks for ' + e.yearsRequired + '+ years' : ''}</dd>
      <dt>Languages</dt><dd>${e.languages.length ? h(e.languages.map((l) => l.lang + ' (' + (l.level === 'posting' ? 'posting language' : l.level) + ')').join(', ')) : 'None stated beyond English'}</dd>
      <dt>Flexibility</dt><dd>${e.flex.length ? h(e.flex.map((x) => x.label).join(', ')) : 'Nothing stated'}</dd>
      ${Object.entries(groups).map(([g, name]) => { const b = e.benefits.filter((x) => x.group === g); return b.length ? `<dt>${name}</dt><dd>${h(b.map((x) => x.label).join(', '))}</dd>` : ''; }).join('')}
      ${e.benefits.length ? '' : '<dt>Benefits</dt><dd>Nothing stated</dd>'}
    </dl></div></section>
    <section><h2>Keyword match: ${s.coverage}% of what it asks for${s.ats != null ? ' · ATS estimate ' + s.ats + ' / 100' : ''}</h2><div class="card">
      <div><span class="label">In your CV</span><div class="chips" style="margin-top:6px">${s.matched.slice(0, 24).map((m) => `<span class="chip have">${h(m.label)}</span>`).join('') || '<span class="muted small">None found</span>'}</div></div>
      <div><span class="label">Asked for, not in your CV</span><div class="chips" style="margin-top:6px">${s.missing.slice(0, 16).map((m) => `<span class="chip gap">${h(m.label)}</span>`).join('') || '<span class="muted small">Nothing missing</span>'}</div></div>
    </div></section>
    <section><h2>Posting text</h2><div class="card"><div class="desc">${e.hasDescription ? h(j.description) : 'This source gave only a short summary. Open the posting for the full text; fit is estimated from the title.'}</div></div></section>`;
  }

  function tailorBlock(j, t) {
    const sh = S.sheet;
    const text = sh.polished || t.text;
    const same = t.before.coverage === t.after.coverage;
    return `<section><h2>Your CV, angled for this role</h2>
      <div class="card">
        <div class="delta num"><span><span class="label">Keyword coverage</span><br><span class="big">${t.before.coverage}%${same ? '' : ' → ' + t.after.coverage + '%'}</span></span>
        ${t.before.ats != null ? `<span><span class="label">ATS estimate</span><br><span class="big">${t.before.ats}${t.after.ats === t.before.ats ? '' : ' → ' + t.after.ats}</span></span>` : ''}</div>
        ${same ? '<p class="small muted">Your CV already covers these keywords, so the changes below are about order and emphasis: what a recruiter sees in the first ten seconds.</p>' : ''}
        <div><span class="label">What changed</span><ul class="plain" style="margin-top:6px">${t.changes.map((c) => `<li>${h(c.text)}</li>`).join('') || '<li>Nothing needed changing.</li>'}</ul></div>
        ${t.notAdded.length ? `<div><span class="label">Not added. Only add these if they are true</span><div class="chips" style="margin-top:6px">${t.notAdded.map((m) => `<span class="chip gap">${h(m.label)}</span>`).join('')}</div></div>` : ''}
        <div class="note ok">No fact was added. Every number, employer and tool in the text below is in your original CV.</div>
      </div>
      ${sh.guard && !sh.guard.ok ? `<div class="note bad">Claude's version used ${sh.guard.issues.length} item${sh.guard.issues.length > 1 ? 's' : ''} that are not in your CV (${h(sh.guard.issues.slice(0, 6).map((i) => i.value).join(', '))}). Check them before using it, or go back to the rule-based version.</div>` : sh.polished ? '<div class="note ok">Claude\'s wording passed the fact check: no new numbers or names.</div>' : ''}
      <div class="cvout" id="cvout" tabindex="0">${h(text)}</div>
      <div class="row">
        <button class="btn primary" data-act="copycv">Copy</button>
        ${ENV.artifact ? '' : '<button class="btn" data-act="dlcv">Download .md</button>'}
        ${ENV.artifact ? '<button class="btn" data-act="polish">Polish wording with Claude</button>' : ''}
        ${ENV.driveFolder ? '<button class="btn" data-act="savedrive">Save to my Drive folder</button>' : ''}
        ${sh.polished ? '<button class="btn quiet" data-act="unpolish">Back to rule-based version</button>' : ''}
      </div></section>`;
  }

  function profileSheet() {
    const p = S.profile;
    const top = Object.entries(p.concepts).map(([id, v]) => ({ id, w: JR.LEX[id].w * (1 + Math.log(1 + v.tf)) })).sort((a, b) => b.w - a.w).slice(0, 28);
    const sh = S.sheet;
    return `<header><div><span class="label">Profile</span><h1>${h(p.name || 'Your profile')}</h1><p class="muted">${h(p.headline || '')}</p></div><button class="btn" data-act="close">Close</button></header>
    ${sh.msg ? `<div class="note ${sh.msgKind || ''}">${h(sh.msg)}</div>` : ''}
    <section><h2>How the radar reads this CV</h2><div class="card">
      <dl class="kv"><dt>Experience</dt><dd class="num">${p.years}+ years, ${p.level >= 6 ? 'director' : p.level >= 4 ? 'staff or principal' : p.level >= 3.5 ? 'lead' : p.level >= 3 ? 'senior' : 'mid'} level</dd>
      <dt>Languages</dt><dd>${h(Object.entries(p.languages).map(([l, v]) => l + ' (' + v + ')').join(', '))}</dd>
      <dt>LinkedIn</dt><dd>${p.linkedin ? `<a href="${h(p.linkedin)}" target="_blank" rel="noopener noreferrer">${h(p.linkedin.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : 'Not connected'}</dd>
      <dt>Source</dt><dd>${p.custom ? 'CV you added in this browser' : 'Your public CV (cv.md) and LinkedIn export, loaded for you'}</dd></dl>
      <div><span class="label">Strongest signals</span><div class="chips" style="margin-top:6px">${top.map((c) => `<span class="chip have">${h(JR.LEX[c.id].label)}</span>`).join('')}</div></div>
    </div></section>
    <section><h2>Connect a LinkedIn profile</h2><div class="card">
      <div class="row"><input class="field" id="liurl" style="flex:1 1 260px" placeholder="https://www.linkedin.com/in/your-name" value="${h(sh.li || '')}" aria-label="LinkedIn profile URL"><button class="btn primary" data-act="connect">Connect</button></div>
      <p class="small muted">LinkedIn does not let any tool read a profile from its URL without you being logged in. So the link is kept for your tailored CVs, and the content comes from LinkedIn's own export: on your profile choose <b>Resources → Save to PDF</b>, then drop that file here. Any CV as PDF or text works too. Nothing leaves this browser.</p>
      <div class="row"><input type="file" id="cvfile" accept=".pdf,.txt,.md" class="field" aria-label="CV or LinkedIn PDF"></div>
      <textarea class="field" id="cvtext" placeholder="Or paste the CV or LinkedIn profile text here">${h(sh.text || '')}</textarea>
      <div class="row"><button class="btn primary" data-act="usetext">Use this CV</button>${p.custom ? '<button class="btn" data-act="resetprofile">Back to the built-in profile</button>' : ''}</div>
    </div></section>
    <section><h2>Pay floor (optional)</h2><div class="card"><div class="row"><input class="field num" id="floor" type="number" min="0" step="5000" placeholder="e.g. 90000" value="${p.salaryFloor || ''}" aria-label="Pay floor in euros per year"><button class="btn" data-act="floor">Save</button></div><p class="small muted">Euros per year, gross. Kept in this browser only. Postings that disclose pay are then marked as reaching it or not.</p></div></section>`;
  }

  function sourcesSheet() {
    const d = S.data || { sources: [] };
    const tone = { ok: 'have', empty: '', blocked: 'bad', error: 'bad', off: '' };
    return `<header><div><span class="label">Sources</span><h1>Where the roles come from</h1><p class="muted">${d.generatedAt ? 'Last scan ' + h(fmtDate(d.generatedAt)) : 'No scan yet'}</p></div><button class="btn" data-act="close">Close</button></header>
    <div class="card"><div class="tablewrap"><table class="src"><thead><tr><th>Source</th><th>Status</th><th>Roles</th><th>Note</th></tr></thead><tbody>
    ${d.sources.map((s) => `<tr><td><b>${h(s.name)}</b></td><td><span class="chip ${tone[s.status] || ''}">${h(s.status)}</span></td><td class="num">${s.count == null ? '' : s.count}</td><td class="muted small">${h(s.note || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">The source list appears after the first scan.</td></tr>'}
    </tbody></table></div></div>
    <p class="small muted">Only public, logged-out pages and official public feeds are read, at a slow pace. A board that refuses automated readers is listed as blocked and left alone; its roles usually still arrive through LinkedIn or the employer's own careers feed.</p>`;
  }

  /* ---------- capabilities (only inside a Claude artifact) ---------- */
  async function cap(name) { try { return window.claude && window.claude.use ? await window.claude.use(name) : null; } catch (e) { return null; } }
  function say(msg, kind) { if (S.sheet) { S.sheet.msg = msg; S.sheet.msgKind = kind || ''; renderSheet(); } }
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  const errText = (e) => (e && (e.message || e.code)) || 'unknown error';

  async function polish(j) {
    const sample = await cap('sample');
    if (!sample) return say('Claude is not available in this view. The rule-based version above is complete on its own.', 'warn');
    const t = JR.tailor(j, S.profile);
    say('Claude is rewording…');
    const prompt = `You are editing a CV for one job application. Reword it so it speaks to the posting, under strict rules.\n\nRULES\n1. Use ONLY facts in the CV below. Never add a number, employer, tool, skill, title, date or achievement that is not there.\n2. Keep every number exactly as written.\n3. You may re-order, merge, shorten and re-angle sentences, and use the posting's vocabulary where the CV already shows that skill.\n4. Do not mention the hiring company. No first-person fluff, no adjectives like "passionate" or "results-driven".\n5. Keep the same sections and plain-text layout. Output the CV only.\n\nPOSTING: ${j.title}\n${(j.description || '').slice(0, 5000)}\n\nCV\n${t.text}`;
    try {
      const r = await sample(prompt, { modelTier: 'default' });
      const out = (r.text || '').trim();
      if (!out) return say('Claude returned nothing. The rule-based version is unchanged.', 'warn');
      S.sheet.polished = out;
      S.sheet.guard = JR.factGuard(S.profile.text + ' ' + JSON.stringify(S.profile.cv || {}), out);
      say('');
    } catch (e) { say(e && e.code === 'not_granted' ? 'You declined Claude for this page, so the rule-based version stays.' : 'Claude could not reword it (' + errText(e) + '). The rule-based version is unchanged.', 'warn'); }
  }
  async function saveDrive(j) {
    const mcp = await cap('mcp');
    if (!mcp) return say('Google Drive is not available in this view. Use Copy instead.', 'warn');
    const t = JR.tailor(j, S.profile);
    say('Saving to Drive…');
    try {
      await mcp.callTool('Google Drive', 'create_file', { title: 'CV - ' + j.company + ' - ' + j.title + ' (' + new Date().toISOString().slice(0, 10) + ')', parentId: ENV.driveFolder, textContent: S.sheet.polished || t.text, contentMimeType: 'text/plain' }, { cache: false });
      say('Saved as a Google Doc in your job-search folder.', 'ok');
    } catch (e) { say('Could not save to Drive (' + errText(e) + '). Use Copy instead.', 'bad'); }
  }
  async function track(j) {
    const mcp = await cap('mcp');
    if (!mcp) return say('Google Sheets is not available in this view.', 'warn');
    say('Adding to your tracker…');
    const today = new Date().toISOString().slice(0, 10);
    try {
      await mcp.callTool('Google Sheets', 'append_values', { spreadsheetId: ENV.trackerSheet, range: 'Applications!A1', values: [[j.company, j.title, j.url, today, '', 'Job Radar (' + j.sourcesAll.join(', ') + ')', Math.max(1, Math.round(j.s.fit / 20)), 'To apply', '', '', 'Tailor CV and apply', '', j.e.salary ? payText(j.e.salary) : '', 'Fit ' + j.s.fit + '%, ' + modeLabel(j.e)]] }, { cache: false });
      S.marks[j.id] = 'saved'; store.set('marks', S.marks);
      say('Added to the Applications tab of your Job Search Tracker.', 'ok');
    } catch (e) { say('Could not write to the tracker (' + errText(e) + ').', 'bad'); }
  }

  /* ---------- CV intake ---------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.head.appendChild(s); }); }
  async function readPdf(file) {
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    if (!window.pdfjsLib) await loadScript(base + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      let lastY = null;
      for (const it of tc.items) { if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) out += '\n'; out += it.str + ' '; lastY = it.transform[5]; }
      out += '\n';
    }
    return out;
  }
  function useText(text, li) {
    const clean = String(text || '').trim();
    if (clean.length < 200) return say('That is too short to be a CV. Paste the full text or drop the PDF.', 'warn');
    const name = clean.split('\n').map((x) => x.trim()).find((x) => x && x.length < 60 && !/@|http|contact|page \d/i.test(x)) || 'You';
    store.set('profile', { text: clean, name, linkedin: li || '' });
    loadProfile(); rescore();
    S.sheet = { type: 'profile', msg: 'Profile updated. Every role has been re-scored against this CV.', msgKind: 'ok' };
    render();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-act],[data-open],[data-tailor],[data-mark],[data-mode],[data-tog],[data-show]');
    if (ev.target.id === 'sheet') { S.sheet = null; return renderSheet(); }
    if (!t) return;
    const d = t.dataset;
    const cur = S.sheet && S.sheet.type === 'job' ? S.jobs.find((x) => x.id === S.sheet.id) : null;
    if (d.open) { S.sheet = { type: 'job', id: d.open }; return renderSheet(); }
    if (d.tailor) { S.sheet = { type: 'job', id: d.tailor, tailor: true }; return renderSheet(); }
    if (d.mark) { S.marks[d.id] = S.marks[d.id] === d.mark ? undefined : d.mark; if (!S.marks[d.id]) delete S.marks[d.id]; store.set('marks', S.marks); badges(); return render(); }
    if (d.mode) { const i = S.f.modes.indexOf(d.mode); if (i >= 0) S.f.modes.splice(i, 1); else S.f.modes.push(d.mode); S.limit = 40; return render(); }
    if (d.tog) { S.f[d.tog] = !S.f[d.tog]; S.limit = 40; return render(); }
    if (d.show) { S.f.show = d.show; S.limit = 40; return render(); }
    switch (d.act) {
      case 'close': S.sheet = null; return renderSheet();
      case 'profile': S.sheet = { type: 'profile', li: S.profile.linkedin }; return renderSheet();
      case 'sources': S.sheet = { type: 'sources' }; return renderSheet();
      case 'weights': S.showWeights = !S.showWeights; return render();
      case 'resetw': S.weights = Object.assign({}, JR.DEFAULT_WEIGHTS); store.set('weights', S.weights); rescore(); return render();
      case 'more': S.limit += 40; return render();
      case 'clear': S.f = Object.assign(S.f, { q: '', modes: [], days: 0, minFit: 0, pay: false, source: '', show: 'open' }); return render();
      case 'toggletailor': S.sheet.tailor = !S.sheet.tailor; S.sheet.polished = null; S.sheet.guard = null; return renderSheet();
      case 'copycv': {
        const text = $('#cvout').textContent;
        try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#cvout')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Selected. Press Ctrl or Cmd + C'); }
        return;
      }
      case 'dlcv': { const tl = JR.tailor(cur, S.profile); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([tl.markdown], { type: 'text/markdown' })); a.download = 'CV - ' + cur.company.replace(/[^\w -]/g, '') + '.md'; a.click(); return; }
      case 'polish': return polish(cur);
      case 'unpolish': S.sheet.polished = null; S.sheet.guard = null; return renderSheet();
      case 'savedrive': return saveDrive(cur);
      case 'track': return track(cur);
      case 'connect': {
        const url = $('#liurl').value.trim();
        const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (!m) return say('That does not look like a LinkedIn profile link. It should contain linkedin.com/in/…', 'warn');
        if (m[1].toLowerCase() === JR.DEFAULT_LINKEDIN) { store.set('profile', null); loadProfile(); rescore(); S.sheet = { type: 'profile', li: url, msg: 'Connected. This is the built-in profile, already loaded from your CV and LinkedIn export.', msgKind: 'ok' }; return render(); }
        const saved = store.get('profile', null);
        if (saved && saved.text) { saved.linkedin = url; store.set('profile', saved); loadProfile(); S.sheet = { type: 'profile', li: url, msg: 'Link saved to your profile.', msgKind: 'ok' }; return render(); }
        S.sheet.li = url; return say('Link noted. Now drop the PDF that LinkedIn exports (Resources → Save to PDF) or paste the profile text, so there is content to match against.', 'warn');
      }
      case 'usetext': return useText($('#cvtext').value, ($('#liurl').value || '').trim());
      case 'resetprofile': store.set('profile', null); loadProfile(); rescore(); S.sheet = { type: 'profile', msg: 'Back to the built-in profile.', msgKind: 'ok' }; return render();
      case 'floor': { const v = Number($('#floor').value) || null; store.set('floor', v); S.profile.salaryFloor = v; return say(v ? 'Pay floor saved.' : 'Pay floor cleared.', 'ok'); }
    }
  });
  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.id === 'sort') { S.f.sort = t.value; render(); }
    else if (t.id === 'days') { S.f.days = Number(t.value); render(); }
    else if (t.id === 'minfit') { S.f.minFit = Number(t.value); render(); }
    else if (t.id === 'source') { S.f.source = t.value; render(); }
    else if (t.dataset.w) { S.weights[t.dataset.w] = Number(t.value); store.set('weights', S.weights); rescore(); render(); }
    else if (t.id === 'cvfile' && t.files[0]) {
      const f = t.files[0];
      const li = ($('#liurl').value || '').trim();
      try {
        say('Reading ' + f.name + '…');
        const text = /\.pdf$/i.test(f.name) ? await readPdf(f) : await f.text();
        useText(text, li);
      } catch (e) { say('Could not read that file (' + errText(e) + '). Paste the text instead.', 'bad'); }
    }
  });
  let qTimer;
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'q') return;
    S.f.q = ev.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { render(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 220);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && S.sheet) { S.sheet = null; renderSheet(); } });

  /* ---------- boot ---------- */
  async function boot() {
    loadProfile();
    if (window.JR_DATA) S.data = window.JR_DATA;
    else {
      try { const r = await fetch('data/jobs.json', { cache: 'no-cache' }); if (r.ok) S.data = await r.json(); } catch (e) { /* first run: no data yet */ }
    }
    S.data = S.data || { generatedAt: null, sources: [], jobs: [] };
    prepare();
    render();
  }
  boot();
})();
