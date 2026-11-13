// Job Radar scan. Reads public job sources, keeps product roles that could be done from Barcelona,
// and writes jobs/data/jobs.json for the page. No npm dependencies. Run: node scraper/run.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { get, getJSON, http, pool, sleep } from './http.mjs';

const require = createRequire(import.meta.url);
const JR = require('../jobs/engine.js');
const OUT = 'jobs/data/jobs.json';
const BOARDS = 'scraper/companies.json';
const MAX_AGE_DAYS = 60;
const now = Date.now();

/* ---------- helpers ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', euro: '€', pound: '£', bull: '•', hellip: '…', eacute: 'é', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ' };
const decode = (s) => String(s || '').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
export function text(html) {
  let s = String(html || '');
  if (/&lt;\w/.test(s) && !/<\w/.test(s)) s = decode(s); // some feeds escape their HTML
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(p|div|h\d|ul|ol|li|tr|section)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  return decode(s).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const iso = (d) => { if (d == null || d === '') return null; const t = typeof d === 'number' ? (d < 1e11 ? d * 1000 : d) : Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const TITLE_OK = /product (manager|management|lead|owner|director)|head of product|\bpm\b|growth|\bcro\b|conversion rate|conversion optimi|experimentation|responsable de producto|chief product|vp,? (of )?product/i;
const TITLE_NO = /product marketing|marketing manager|project manager|program manager|designer|engineer|developer|analyst|scientist|account |sales|customer success|recruit|intern\b|production|category manager|brand|community|supply chain|compliance|legal|finance|accountant|operations manager|seo specialist|copywriter|hacker/i;
const titleOk = (t) => TITLE_OK.test(t) && (!TITLE_NO.test(t) || /product manager/i.test(String(t).replace(/product marketing manager/gi, '')));
const GEO_OK = /barcelona|spain|españa|espana|madrid|remote|remoto|anywhere|europe|emea|\beu\b|worldwide|global|catalonia|cataluña|hybrid/i;
const geoOk = (loc) => !loc || GEO_OK.test(loc);
const nice = (slug) => slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const sources = [];
const jobs = [];
function report(id, name, status, count, note) { sources.push({ id, name, status, count, note: note || '' }); console.log(`[${status}] ${name}: ${count ?? ''} ${note || ''}`); }
function add(source, j) {
  if (!j.title || !j.url || !titleOk(j.title) || !geoOk(j.location)) return false;
  jobs.push({ id: source.toLowerCase().replace(/\W/g, '') + ':' + j.id, source, title: decode(j.title).trim(), company: decode(j.company || '').trim(), location: decode(j.location || '').trim(), url: j.url, postedAt: iso(j.postedAt), description: (j.description || '').slice(0, 7000), salaryText: j.salaryText || '', workMode: j.workMode || undefined });
  return true;
}
async function source(id, name, fn) {
  const before = jobs.length;
  try {
    const note = await fn();
    const n = jobs.length - before;
    if (note && note.status) report(id, name, note.status, n, note.note);
    else report(id, name, n ? 'ok' : 'empty', n, note || (n ? '' : 'Answered, but no matching roles today'));
  } catch (e) { report(id, name, 'error', jobs.length - before, String(e.message || e).slice(0, 140)); }
}
const failed = (r) => ({ status: [401, 403, 429, 451, 999].includes(r.status) ? 'blocked' : 'error', note: r.status ? `HTTP ${r.status}` : r.error || 'no response' });

/* ---------- previous run: reuse descriptions, remember when each role was first seen ---------- */
let prev = { jobs: [] };
try { if (existsSync(OUT)) prev = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* first run */ }
const prevById = new Map((prev.jobs || []).map((j) => [j.id, j]));

/* ---------- LinkedIn (public, logged-out job pages) ---------- */
async function linkedin() {
  const S = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
  const queries = ['senior product manager', 'product manager growth', 'product manager experimentation', 'product manager AI', 'lead product manager', 'principal product manager', 'conversion rate optimization', 'growth product manager'];
  const plans = [];
  for (const q of queries) {
    for (const [wt, mode] of [[2, 'remote'], [3, 'hybrid'], [1, 'onsite']]) plans.push({ q, loc: 'Barcelona, Catalonia, Spain', wt, mode, pages: 2 });
    plans.push({ q, loc: 'Spain', wt: 2, mode: 'remote', pages: 2 });
  }
  for (const q of queries.slice(0, 4)) plans.push({ q, loc: 'European Union', wt: 2, mode: 'remote', pages: 1 });
  const found = new Map();
  let refused = 0, asked = 0;
  await pool(plans, 2, async (p) => {
    for (let page = 0; page < p.pages; page++) {
      const u = `${S}?keywords=${encodeURIComponent(p.q)}&location=${encodeURIComponent(p.loc)}&f_WT=${p.wt}&f_TPR=r2592000&sortBy=DD&start=${page * 10}`;
      const r = await get(u, {}, { retries: 2, backoff: 4000 });
      asked++;
      if (r.status !== 200) { refused++; break; }
      const cards = r.body.split(/<li[\s>]/).slice(1);
      if (!cards.length) break;
      for (const c of cards) {
        const id = (c.match(/jobPosting:(\d+)/) || [])[1];
        if (!id || found.has(id)) continue;
        const pick = (re) => text((c.match(re) || [])[1] || '');
        const title = pick(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/);
        if (!titleOk(title)) continue;
        found.set(id, { id, title, company: pick(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/), location: pick(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/), postedAt: (c.match(/<time[^>]*datetime="([^"]+)"/) || [])[1], salaryText: pick(/job-search-card__salary-info[^>]*>([\s\S]*?)<\/span>/), workMode: p.mode, url: `https://www.linkedin.com/jobs/view/${id}` });
      }
      await sleep(900 + Math.random() * 700);
      if (cards.length < 10) break;
    }
  });
  if (!found.size) return { status: refused ? 'blocked' : 'empty', note: refused ? `LinkedIn refused ${refused} of ${asked} requests from this server` : 'No results' };
  const list = [...found.values()].slice(0, 320);
  let fetched = 0;
  await pool(list, 3, async (j) => {
    const old = prevById.get('linkedin:' + j.id);
    if (old && old.description && old.description.length > 400) { j.description = old.description; return; }
    const r = await get(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${j.id}`, {}, { retries: 2, backoff: 4000 });
    if (r.status === 200) {
      j.description = text((r.body.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      if (!j.salaryText) j.salaryText = text((r.body.match(/compensation__salary[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      fetched++;
    }
    await sleep(700 + Math.random() * 600);
  });
  for (const j of list) add('LinkedIn', j);
  return `${found.size} roles found, ${fetched} descriptions read this run${refused ? `, ${refused} requests refused` : ''}`;
}

/* ---------- company career feeds (official public APIs of applicant-tracking systems) ---------- */
const ATS = {
  greenhouse: { probe: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`, count: (j) => j.jobs?.length },
  lever: { probe: (s) => `https://api.lever.co/v0/postings/${s}?mode=json&limit=2`, count: (j) => (Array.isArray(j) ? j.length : 0) },
  lever_eu: { probe: (s) => `https://api.eu.lever.co/v0/postings/${s}?mode=json&limit=2`, count: (j) => (Array.isArray(j) ? j.length : 0) },
  ashby: { probe: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`, count: (j) => j.jobs?.length },
  smartrecruiters: { probe: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`, count: (j) => j.totalFound },
  workable: { probe: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}`, count: (j) => j.jobs?.length },
  recruitee: { probe: (s) => `https://${s}.recruitee.com/api/offers/`, count: (j) => j.offers?.length },
};
async function discoverBoards() {
  let cache = null;
  try { cache = JSON.parse(readFileSync(BOARDS, 'utf8')); } catch { /* none yet */ }
  if (cache && now - Date.parse(cache.checkedAt) < 14 * 864e5 && cache.boards?.length) return cache.boards;
  const slugs = [...new Set(readFileSync('scraper/company-candidates.txt', 'utf8').toLowerCase().split(/\s+/).filter(Boolean))];
  const tasks = slugs.flatMap((s) => Object.keys(ATS).map((a) => [s, a]));
  const boards = [];
  await pool(tasks, 16, async ([slug, ats]) => {
    const r = await getJSON(ATS[ats].probe(slug), { timeout: 12 }, { retries: 0 });
    if (r.json && ATS[ats].count(r.json) > 0) boards.push({ slug, ats });
  });
  boards.sort((a, b) => a.slug.localeCompare(b.slug) || a.ats.localeCompare(b.ats));
  if (boards.length) writeFileSync(BOARDS, JSON.stringify({ checkedAt: new Date().toISOString(), boards }, null, 1));
  return boards.length ? boards : cache?.boards || [];
}
const boardReaders = {
  async greenhouse(slug) {
    const r = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    for (const j of r.json?.jobs || []) add('Greenhouse', { id: slug + j.id, title: j.title, company: j.company_name || nice(slug), location: j.location?.name, url: j.absolute_url, postedAt: j.first_published || j.updated_at, description: text(j.content) });
  },
  async lever(slug, eu) {
    const r = await getJSON(`https://api.${eu ? 'eu.' : ''}lever.co/v0/postings/${slug}?mode=json`);
    for (const j of Array.isArray(r.json) ? r.json : []) {
      const sr = j.salaryRange;
      add('Lever', { id: j.id, title: j.text, company: nice(slug), location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / '), url: j.hostedUrl, postedAt: j.createdAt, workMode: { remote: 'remote', hybrid: 'hybrid', 'on-site': 'onsite', onsite: 'onsite' }[String(j.workplaceType || '').toLowerCase()], salaryText: sr ? `${sr.currency} ${sr.min} - ${sr.currency} ${sr.max} per ${String(sr.interval || 'year').replace(/^per-|-salary$/g, '')}` : '', description: [j.descriptionPlain, ...(j.lists || []).map((l) => l.text + '\n' + text(l.content)), j.additionalPlain].filter(Boolean).join('\n\n') });
    }
  },
  lever_eu(slug) { return boardReaders.lever(slug, true); },
  async ashby(slug) {
    const r = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
    for (const j of r.json?.jobs || []) add('Ashby', { id: j.id, title: j.title, company: nice(slug), location: [j.location, ...(j.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join(' / ') + (j.isRemote ? ' (Remote)' : ''), url: j.jobUrl, postedAt: j.publishedAt, workMode: { Remote: 'remote', Hybrid: 'hybrid', OnSite: 'onsite' }[j.workplaceType], salaryText: j.compensation?.compensationTierSummary || j.compensation?.scrapeableCompensationSalarySummary || '', description: j.descriptionPlain || text(j.descriptionHtml) });
  },
  async smartrecruiters(slug) {
    const r = await getJSON(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&q=product`);
    const hits = (r.json?.content || []).filter((j) => titleOk(j.name) && geoOk([j.location?.fullLocation, j.location?.city, j.location?.country, j.location?.remote ? 'remote' : ''].join(' '))).slice(0, 12);
    for (const j of hits) {
      const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${slug}/postings/${j.id}`);
      const sec = d.json?.jobAd?.sections || {};
      add('SmartRecruiters', { id: j.id, title: j.name, company: j.company?.name || nice(slug), location: (j.location?.fullLocation || [j.location?.city, j.location?.country].filter(Boolean).join(', ')) + (j.location?.remote ? ' (Remote)' : ''), url: d.json?.postingUrl || `https://jobs.smartrecruiters.com/${slug}/${j.id}`, postedAt: j.releasedDate, workMode: j.location?.remote ? 'remote' : j.location?.hybrid ? 'hybrid' : undefined, description: ['jobDescription', 'qualifications', 'additionalInformation'].map((k) => text(sec[k]?.text)).filter(Boolean).join('\n\n') });
    }
  },
  async workable(slug) {
    const r = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`);
    for (const j of r.json?.jobs || []) add('Workable', { id: slug + j.shortcode, title: j.title, company: r.json.name || nice(slug), location: [j.city, j.country].filter(Boolean).join(', ') + (j.telecommuting ? ' (Remote)' : ''), url: j.url || j.shortlink, postedAt: j.published_on || j.created_at, workMode: j.telecommuting ? 'remote' : undefined, description: text(j.description) });
  },
  async recruitee(slug) {
    const r = await getJSON(`https://${slug}.recruitee.com/api/offers/`);
    for (const j of r.json?.offers || []) add('Recruitee', { id: slug + j.id, title: j.title, company: j.company_name || nice(slug), location: j.location || [j.city, j.country].filter(Boolean).join(', '), url: j.careers_url, postedAt: j.published_at || j.created_at, workMode: j.remote ? 'remote' : j.hybrid ? 'hybrid' : undefined, description: text(j.description) + '\n\n' + text(j.requirements) });
  },
};

/* ---------- open job-board feeds ---------- */
const feeds = {
  async Remotive() {
    const r = await getJSON('https://remotive.com/api/remote-jobs?category=product');
    if (!r.json) return failed(r);
    for (const j of r.json.jobs || []) add('Remotive', { id: j.id, title: j.title, company: j.company_name, location: 'Remote · ' + (j.candidate_required_location || 'Worldwide'), url: j.url, postedAt: j.publication_date, salaryText: j.salary, workMode: 'remote', description: text(j.description) });
  },
  async 'Remote OK'() {
    const r = await getJSON('https://remoteok.com/api');
    if (!r.json) return failed(r);
    for (const j of r.json.filter((x) => x.position)) add('Remote OK', { id: j.id, title: j.position, company: j.company, location: 'Remote · ' + (j.location || 'Worldwide'), url: j.url || `https://remoteok.com/remote-jobs/${j.id}`, postedAt: j.date, salaryText: j.salary_min ? `$${j.salary_min} - $${j.salary_max} per year` : '', workMode: 'remote', description: text(j.description) });
  },
  async Arbeitnow() {
    let ok = false;
    for (let p = 1; p <= 4; p++) {
      const r = await getJSON(`https://www.arbeitnow.com/api/job-board-api?page=${p}`);
      if (!r.json) { if (!ok) return failed(r); break; }
      ok = true;
      for (const j of r.json.data || []) add('Arbeitnow', { id: j.slug, title: j.title, company: j.company_name, location: (j.location || '') + (j.remote ? ' (Remote)' : ''), url: j.url, postedAt: j.created_at, workMode: j.remote ? 'remote' : undefined, description: text(j.description) });
    }
  },
  async Himalayas() {
    let ok = false;
    for (let p = 0; p < 20; p++) {
      const r = await getJSON(`https://himalayas.app/jobs/api?limit=20&offset=${p * 20}`, {}, { retries: 1 });
      if (!r.json) { if (!ok) return failed(r); break; }
      ok = true;
      for (const j of r.json.jobs || []) add('Himalayas', { id: j.guid || j.applicationLink, title: j.title, company: j.companyName, location: 'Remote · ' + ((j.locationRestrictions || []).join(', ') || 'Worldwide'), url: j.applicationLink || j.guid, postedAt: j.pubDate, salaryText: j.minSalary ? `${j.currency || 'USD'} ${j.minSalary} - ${j.currency || 'USD'} ${j.maxSalary} per year` : '', workMode: 'remote', description: text(j.description) });
      await sleep(300);
    }
  },
  async 'The Muse'() {
    let ok = false;
    for (const loc of ['Barcelona%2C%20Spain', 'Flexible%20%2F%20Remote']) for (let p = 0; p < 3; p++) {
      const r = await getJSON(`https://www.themuse.com/api/public/jobs?category=Product%20Management&category=Product&location=${loc}&page=${p}`);
      if (!r.json) { if (!ok) return failed(r); break; }
      ok = true;
      for (const j of r.json.results || []) add('The Muse', { id: j.id, title: j.name, company: j.company?.name, location: (j.locations || []).map((l) => l.name).join(' / '), url: j.refs?.landing_page, postedAt: j.publication_date, description: text(j.contents) });
      if (p + 1 >= (r.json.page_count || 1)) break;
    }
  },
  async Jobicy() {
    const r = await getJSON('https://jobicy.com/api/v2/remote-jobs?count=50&tag=product%20manager');
    if (!r.json) return failed(r);
    for (const j of r.json.jobs || []) add('Jobicy', { id: j.id, title: j.jobTitle, company: j.companyName, location: 'Remote · ' + (j.jobGeo || 'Anywhere'), url: j.url, postedAt: j.pubDate, salaryText: j.annualSalaryMin ? `${j.salaryCurrency || 'USD'} ${j.annualSalaryMin} - ${j.salaryCurrency || 'USD'} ${j.annualSalaryMax} per year` : '', workMode: 'remote', description: text(j.jobDescription) });
  },
  async 'Working Nomads'() {
    const r = await getJSON('https://www.workingnomads.com/api/exposed_jobs/');
    if (!r.json) return failed(r);
    for (const j of r.json) add('Working Nomads', { id: j.url, title: j.title, company: j.company_name, location: 'Remote · ' + (j.location || 'Anywhere'), url: j.url, postedAt: j.pub_date, workMode: 'remote', description: text(j.description) });
  },
  async 'We Work Remotely'() {
    const r = await get('https://weworkremotely.com/categories/remote-product-jobs.rss');
    if (r.status !== 200) return failed(r);
    for (const it of r.body.split('<item>').slice(1)) {
      const tag = (t) => decode(((it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '').replace(/^<!\[CDATA\[|\]\]>$/g, ''));
      const [company, ...rest] = tag('title').split(': ');
      add('We Work Remotely', { id: tag('guid') || tag('link'), title: rest.join(': ') || company, company: rest.length ? company : '', location: 'Remote · ' + (tag('region') || 'Anywhere'), url: tag('link'), postedAt: tag('pubDate'), workMode: 'remote', description: text(tag('description')) });
    }
  },
};

/* Boards that sit behind bot protection. One plain request each; if they say no, that is the answer. */
async function knock(id, name, url, looksLikeListings) {
  const r = await http(url);
  const ok = r.status === 200 && looksLikeListings.test(r.body);
  report(id, name, 'blocked', 0, ok ? 'Reachable, but its terms do not allow automated reading, so it is not parsed. Its roles usually also appear on LinkedIn or the employer feed.' : `Refuses automated readers (${r.status || 'no response'}). Its roles usually also appear on LinkedIn or the employer feed.`);
}

/* ---------- run ---------- */
await source('linkedin', 'LinkedIn', linkedin);
const boards = await discoverBoards();
const perAts = {};
await pool(boards, 6, async (b) => {
  const before = jobs.length;
  try { await boardReaders[b.ats](b.slug); } catch { /* one bad board never stops the scan */ }
  const k = b.ats.replace('_eu', '');
  perAts[k] = perAts[k] || { boards: 0, n: 0 };
  perAts[k].boards++;
  perAts[k].n += jobs.length - before;
});
for (const [k, v] of Object.entries(perAts)) report(k, { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters', workable: 'Workable', recruitee: 'Recruitee' }[k] + ' company career pages', v.n ? 'ok' : 'empty', v.n, `${v.boards} employers checked`);
if (!boards.length) report('ats', 'Company career pages', 'error', 0, 'No employer feeds could be reached');
for (const [name, fn] of Object.entries(feeds)) await source(name.toLowerCase().replace(/\W/g, ''), name, fn);
await knock('indeed', 'Indeed', 'https://es.indeed.com/jobs?q=senior+product+manager&l=Barcelona', /jobsearch|job_seen_beacon/);
await knock('glassdoor', 'Glassdoor', 'https://www.glassdoor.es/Empleo/barcelona-product-manager-empleos-SRCH_IL.0,9_IC2562177_KO10,25.htm', /JobCard|jobListing/);
await knock('infojobs', 'InfoJobs', 'https://www.infojobs.net/jobsearch/search-results/list.xhtml?keyword=product+manager&provinceIds=9', /ij-OfferCard|offer-list/);

// keep what a Barcelona-based candidate could take; stamp first-seen; drop stale
const today = new Date(now).toISOString();
const seen = new Set();
const kept = [];
for (const j of jobs) {
  if (seen.has(j.id)) continue;
  seen.add(j.id);
  const old = prevById.get(j.id);
  j.firstSeen = old?.firstSeen || today;
  if (!j.postedAt) j.postedAt = old?.postedAt || null;
  const e = JR.enrich(j);
  if (!e.eligible || e.family === 'other') continue;
  const age = (now - Date.parse(j.postedAt || j.firstSeen)) / 864e5;
  if (age > MAX_AGE_DAYS) continue;
  kept.push(j);
}
const okSources = sources.filter((s) => s.status === 'ok').length;
if (!kept.length && (prev.jobs || []).length) {
  console.error('Scan found nothing; keeping the previous data so the page never goes blank.');
  process.exit(0);
}
mkdirSync('jobs/data', { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: today, sources, jobs: kept }));
console.log(`\nWrote ${kept.length} roles (${jobs.length} collected) from ${okSources} of ${sources.length} sources.`);
