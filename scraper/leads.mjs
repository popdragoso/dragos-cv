// Job leads: from the day's scan, keep the roles that pass the user's rules and are still open on the
// employer's OWN applicant-tracking system (Greenhouse, Lever, Ashby, Workable), not only on LinkedIn.
//
// Usage: node scraper/leads.mjs [--seen seen.json] [--out leads.json] [--max-age 30] [--min-pay 100000]
//   seen.json: [{ company, title, link }] already in the tracker. Those are never returned again.
// Output: { generatedAt, leads: [...], flagged: [...], dropped: [{ company, title, reason }] }
// Writes no names. Finding a person to contact is a separate, manual step.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getJSON, pool } from './http.mjs';

const require = createRequire(import.meta.url);
const JR = require('../jobs/engine.js');
const { defaultProfile } = require('../jobs/profile-default.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const MAX_AGE = Number(arg('max-age', 30));
const MIN_PAY = Number(arg('min-pay', 100000));
const NOW = Date.now();

/* ---------- the user's rules ---------- */
export const PIPELINE = ['Wallapop', 'Docplanner', 'Schneider Electric', 'SE Ranking', 'EcoVadis', 'Factorial', 'Preply'];
const LEVEL = /\b(senior|sr\.?|lead|staff|principal)\b/i;
const NOT_IC = /\b(director|head of|vp|vice president|chief|group product|manager,? product management|associate|junior)\b/i;
const IS_PM = /product manager|growth product|product lead\b/i;
// In the title, or the description is mostly about it AND the role fits the CV well.
// Recruiters and job aggregators re-post other employers' roles; a lead must come from the employer itself.
const AGGREGATOR = /jobgether|jobfluent|powerup talent|established search|hypergrowth recruitment|\blhh\b|randstad|hays\b|michael page|adecco|recruit|staffing|headhunt|talent partners|executive search/i;
const FOCUS_TITLE = /referral|viral|growth|experiment|\bplg\b|self[- ]serve|product[- ]led|moneti[sz]|pricing|activation|onboarding|retention|conversion|lifecycle|martech|\bai\b|genai|gen ai|llm|generative|agent/i;
const FOCUS_BODY = { growth: 3, experimentation: 2, cro: 2, monetization: 2, genai: 2, activation: 2, retention: 2 };
const BODY_ONLY_MIN_FIT = 70;

export function normTitle(t) {
  return JR.norm(t)
    .replace(/\b(m\/f\/d|f\/m\/d|m\/w\/d|h\/m|all genders|they\/she\/he)\b/g, ' ')
    .replace(/[()[\]]/g, ' ')
    .replace(/[|–—:,/]+/g, ' - ')
    .replace(/\b(barcelona|madrid|spain|espana|remote|hybrid|emea|europe|eu|portugal|lisbon|london|uk|berlin|paris|amsterdam|warsaw|poland|worldwide|anywhere|bcn|100%)\b/g, ' ')
    .replace(/\bsr\.?\b/g, 'senior').replace(/\bpm\b/g, 'product manager')
    .replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const tokens = (t) => new Set(normTitle(t).split(' ').filter((w) => w.length > 1 && !['and', 'the', 'of', 'for', 'to', 'in', 'a'].includes(w)));
export function sameTitle(a, b) {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return false;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  const lvl = (s) => ['senior', 'lead', 'staff', 'principal'].filter((w) => s.has(w)).join();
  return lvl(x) === lvl(y) && inter / (x.size + y.size - inter) >= 0.75;
}
export const cleanLink = (u) => String(u || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^http:/, 'https:').toLowerCase();

/* ---------- employer boards ---------- */
const ATS = {
  greenhouse: { list: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`, rows: (j) => (j.jobs || []).map((x) => ({ title: x.title, url: x.absolute_url, location: x.location?.name || '', posted: x.first_published || x.updated_at })) },
  greenhouse_eu: { list: (s) => `https://boards-api.eu.greenhouse.io/v1/boards/${s}/jobs?content=true`, rows: (j) => (j.jobs || []).map((x) => ({ title: x.title, url: x.absolute_url, location: x.location?.name || '', posted: x.first_published || x.updated_at })) },
  lever: { list: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, rows: (j) => (Array.isArray(j) ? j : []).map((x) => ({ title: x.text, url: x.hostedUrl, location: [x.categories?.location, ...(x.categories?.allLocations || [])].filter(Boolean).join(' / '), posted: x.createdAt, mode: x.workplaceType })) },
  lever_eu: { list: (s) => `https://api.eu.lever.co/v0/postings/${s}?mode=json`, rows: (j) => (Array.isArray(j) ? j : []).map((x) => ({ title: x.text, url: x.hostedUrl, location: [x.categories?.location, ...(x.categories?.allLocations || [])].filter(Boolean).join(' / '), posted: x.createdAt, mode: x.workplaceType })) },
  ashby: { list: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`, rows: (j) => (j.jobs || []).filter((x) => x.isListed !== false).map((x) => ({ title: x.title, url: x.jobUrl, location: [x.location, ...(x.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join(' / '), posted: x.publishedAt, mode: x.workplaceType, pay: x.compensation?.compensationTierSummary || '' })) },
  workable: { list: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`, rows: (j) => (j.jobs || []).map((x) => ({ title: x.title, url: x.url || x.shortlink || '', location: [x.city, x.country].filter(Boolean).join(', ') + (x.telecommuting ? ' (Remote)' : ''), posted: x.published_on || x.created_at, mode: x.telecommuting ? 'remote' : '' })) },
};
const ATS_NAME = { greenhouse: 'Greenhouse', greenhouse_eu: 'Greenhouse', lever: 'Lever', lever_eu: 'Lever', ashby: 'Ashby', workable: 'Workable' };

function slugGuesses(job, known) {
  const out = new Set();
  for (const b of known) if (ATS[b.ats] && JR.sameCompany(b.slug.replace(/[-_]/g, ' '), job.company)) out.add(b.slug);
  const tk = JR.companyTokens(job.company);
  if (tk.length) { out.add(tk.join('')); out.add(tk.join('-')); out.add(tk[0]); }
  const raw = JR.norm(job.company).replace(/[^a-z0-9.]+/g, '');
  if (raw) { out.add(raw); out.add(raw.replace(/\./g, '')); }
  if (job.liCompany) { const s = job.liCompany.toLowerCase(); for (const v of [s, s.replace(/-(app|group|inc|hq|io|com|global|tech)$/, '')]) { out.add(v); out.add(v.replace(/-/g, '')); } }
  // the board link itself, when the scan found the role on the employer's feed
  const m = String(job.url).match(/(?:greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com)\/([^/?#]+)/);
  if (m) out.add(m[1].toLowerCase());
  return [...out].filter((s) => /^[a-z0-9][a-z0-9.-]{1,40}$/.test(s));
}

const boardCache = new Map();
async function board(ats, slug) {
  const k = ats + ':' + slug;
  if (!boardCache.has(k)) boardCache.set(k, (async () => {
    const r = await getJSON(ATS[ats].list(slug), { timeout: 20 }, { retries: 4, backoff: 3000 }); // Workable rate-limits bursts
    if (!r.json) return null;
    const rows = ATS[ats].rows(r.json).filter((x) => x.title && x.url);
    return rows.length ? rows : null;
  })());
  return boardCache.get(k);
}

/** Find this role on the employer's own board. Returns the board's posting, or null. */
export async function verify(job, known) {
  const hits = [];
  for (const slug of slugGuesses(job, known)) {
    for (const ats of Object.keys(ATS)) {
      const rows = await board(ats, slug);
      if (!rows) continue;
      for (const x of rows) if (sameTitle(x.title, job.title)) hits.push({ ...x, ats, slug });
    }
    if (hits.length) break; // first slug that holds the role wins
  }
  if (!hits.length) return null;
  const local = (x) => (/barcelona|spain|espa/i.test(x.location) ? 2 : /remote|europe|emea/i.test(x.location) ? 1 : 0);
  hits.sort((a, b) => local(b) - local(a));
  return hits[0];
}

/* ---------- run ---------- */
async function main() {
  const data = JSON.parse(readFileSync('jobs/data/jobs.json', 'utf8'));
  const known = JSON.parse(readFileSync('scraper/companies.json', 'utf8')).boards || [];
  const seen = arg('seen') ? JSON.parse(readFileSync(arg('seen'), 'utf8')) : [];
  const seenLinks = new Set(seen.map((s) => cleanLink(s.link)));
  const isSeen = (company, title, ...links) => links.some((l) => l && seenLinks.has(cleanLink(l))) || seen.some((s) => JR.sameCompany(s.company, company) && sameTitle(s.title, title));
  const profile = defaultProfile();

  const dropped = [];
  const drop = (j, reason) => dropped.push({ company: j.company, title: j.title, reason });
  const pre = [];
  const byKey = new Map();
  for (const j of data.jobs) {
    const e = (j.e = JR.enrich(j));
    const s = JR.score(j, profile, { now: NOW });
    j.s = s;
    if (!IS_PM.test(j.title) || !LEVEL.test(j.title) || NOT_IC.test(j.title)) continue;
    if (AGGREGATOR.test(j.company)) { drop(j, 'Posted by a recruiter or job aggregator, not the employer'); continue; } // not a Senior/Lead/Staff/Principal PM title: silently out of scope
    const pipeline = PIPELINE.find((p) => JR.sameCompany(p, j.company));
    const focus = FOCUS_TITLE.test(j.title) || (s.fit >= BODY_ONLY_MIN_FIT && Object.entries(FOCUS_BODY).some(([id, n]) => (e.concepts[id]?.tf || 0) >= n));
    if (!focus) { drop(j, 'Not growth, experimentation, PLG, monetization or GenAI'); continue; }
    const where = e.inBarcelona && e.workMode !== 'onsite' ? 'bcn' : e.workMode === 'remote' && ['Spain', 'Europe', 'Worldwide'].includes(e.remoteScope) ? 'remote' : null;
    if (!where) { drop(j, e.workMode === 'onsite' ? 'On-site' : 'Not Barcelona or remote from Spain'); continue; }
    if (e.officeDays >= 5) { drop(j, 'Office five days a week'); continue; }
    if (e.salary && (e.salary.eurMax || e.salary.eurMin) < MIN_PAY && !(e.salary.eurMin && !e.salary.eurMax)) { drop(j, 'Pay shown below €' + MIN_PAY / 1000 + 'K'); continue; }
    if (s.hardKnockout) { drop(j, s.knockouts.filter((k) => k.severity === 'hard').map((k) => k.text).join(', ')); continue; }
    if (isSeen(j.company, j.title, j.url)) continue;
    const k = JR.companyTokens(j.company).join(' ') + '|' + normTitle(j.title);
    const prev = byKey.get(k);
    if (prev) { if ((j.description || '').length > (prev.description || '').length) Object.assign(prev, { description: j.description, e, s }); continue; }
    byKey.set(k, j);
    pre.push(Object.assign(j, { pipeline: pipeline || null }));
  }

  const out = [];
  await pool(pre, 3, async (j) => {
    const v = await verify(j, known);
    if (!v) return drop(j, 'Not found open on the employer\'s own board (Greenhouse, Lever, Ashby, Workable)');
    if (!v.posted && v.ats.startsWith('lever')) { const d = await getJSON(v.url.replace(/^https:\/\/jobs\.(eu\.)?lever\.co\//, (m, eu) => `https://api.${eu || ''}lever.co/v0/postings/`)); v.posted = d.json?.createdAt; }
    const posted = v.posted ? Date.parse(v.posted) : j.postedAt ? Date.parse(j.postedAt) : NaN;
    const age = Number.isFinite(posted) ? Math.floor((NOW - posted) / 864e5) : null;
    if (age != null && age > MAX_AGE) return drop(j, `Posted ${age} days ago on the employer's board`);
    if (/on-?site/i.test(v.mode || '')) return drop(j, 'On-site per the employer\'s board');
    if (isSeen(j.company, v.title, v.url) || out.some((o) => cleanLink(o.link) === cleanLink(v.url))) return;
    const e = j.e, s = j.s;
    const pay = e.salary || (v.pay ? JR.parseMoney(v.pay) : null);
    if (pay && (pay.eurMax || pay.eurMin) < MIN_PAY && !(pay.eurMin && !pay.eurMax)) return drop(j, 'Pay shown below €' + MIN_PAY / 1000 + 'K');
    const report = (j.description || '').match(/\breport(?:s|ing)?\s+(?:directly\s+)?(?:in)?to\s+(?:the\s+|our\s+|a\s+)?([A-Z][A-Za-z&,'’ /-]{3,70}?)(?=[.;\n(]|\s+(?:and|who|based|in|on|at|within)\b)/);
    out.push({
      company: j.company, title: v.title, link: v.url, ats: ATS_NAME[v.ats], boardLocation: v.location, linkedin: j.source === 'LinkedIn' ? j.url : null,
      workMode: e.workMode, remoteScope: e.remoteScope, officeDays: e.officeDays, inBarcelona: e.inBarcelona,
      salary: pay ? { quote: pay.quote, eurMin: pay.eurMin, eurMax: pay.eurMax, currency: pay.currency } : null,
      postedDaysAgo: age, fit: s.fit, overall: JR.overall(s.sub), coverage: s.coverage,
      matched: s.matched.slice(0, 8).map((m) => m.label), missing: s.missing.slice(0, 5).map((m) => m.label),
      focus: e.focus, reportsTo: report ? report[1].trim() : null, liCompany: j.liCompany || null, pipeline: j.pipeline,
    });
  });
  out.sort((a, b) => b.fit - a.fit || b.overall - a.overall);
  const result = { generatedAt: new Date(NOW).toISOString(), scanAt: data.generatedAt, rules: { maxAgeDays: MAX_AGE, minPayEur: MIN_PAY, pipeline: PIPELINE }, leads: out.filter((x) => !x.pipeline), flagged: out.filter((x) => x.pipeline), dropped };
  writeFileSync(arg('out', 'leads.json'), JSON.stringify(result, null, 1));
  console.log(`${result.leads.length} new leads, ${result.flagged.length} at referral-pipeline companies, ${dropped.length} dropped.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
