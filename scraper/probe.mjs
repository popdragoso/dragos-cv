// Reconnaissance: which public job sources answer from a GitHub runner, and in what shape?
// Only public, unauthenticated endpoints. A source that refuses is recorded as refused, nothing more.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { http, pool } from './http.mjs';

const urls = {
  li_search:
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=senior%20product%20manager&location=Barcelona%2C%20Catalonia%2C%20Spain&f_TPR=r2592000&sortBy=DD&start=0',
  li_search_remote:
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=senior%20product%20manager&location=Spain&f_WT=2&f_TPR=r2592000&start=0',
  indeed: 'https://es.indeed.com/jobs?q=senior+product+manager&l=Barcelona',
  glassdoor: 'https://www.glassdoor.es/Empleo/barcelona-product-manager-empleos-SRCH_IL.0,9_IC2562177_KO10,25.htm',
  infojobs: 'https://www.infojobs.net/jobsearch/search-results/list.xhtml?keyword=product+manager&provinceIds=9',
  tecnoempleo: 'https://www.tecnoempleo.com/ofertas-trabajo/?te=product+manager&pr=231',
  remotive: 'https://remotive.com/api/remote-jobs?category=product',
  remoteok: 'https://remoteok.com/api',
  arbeitnow: 'https://www.arbeitnow.com/api/job-board-api',
  himalayas: 'https://himalayas.app/jobs/api?limit=20',
  themuse: 'https://www.themuse.com/api/public/jobs?category=Product%20Management&location=Barcelona%2C%20Spain&page=1',
  jobicy: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=product%20manager',
  landing: 'https://landing.jobs/api/v1/jobs?limit=50',
  workingnomads: 'https://www.workingnomads.com/api/exposed_jobs/',
  wwr: 'https://weworkremotely.com/categories/remote-product-jobs.rss',
  manfred: 'https://www.getmanfred.com/api/v2/public/offers?lang=EN&onlyActive=true',
  workable_search: 'https://jobs.workable.com/api/v1/jobs?query=product%20manager&location=Barcelona',
  sr_search: 'https://api.smartrecruiters.com/v1/postings?q=product%20manager&city=Barcelona&limit=20',
  jobfluent: 'https://www.jobfluent.com/jobs-barcelona?q=product+manager',
  euremote: 'https://euremotejobs.com/?feed=job_feed&search_keywords=product+manager',
  nodesk: 'https://nodesk.co/remote-jobs/product/index.xml',
  jobspresso: 'https://jobspresso.co/?feed=job_feed&job_types=product-management',
  hn: 'https://hn.algolia.com/api/v1/search_by_date?query=%22product%20manager%22%20barcelona&tags=comment',
};

const out = {};
mkdirSync('jobs/data/_probe', { recursive: true });
await pool(Object.entries(urls), 6, async ([k, u]) => {
  const r = await http(u);
  out[k] = { status: r.status, size: r.body.length, error: r.error };
  writeFileSync(`jobs/data/_probe/${k}.txt`, r.body.slice(0, k.startsWith('li_') ? 40000 : 6000));
});

// LinkedIn public job page sample: first job id from the search page.
const m = readFileSync('jobs/data/_probe/li_search.txt', 'utf8').match(/jobPosting:(\d+)/);
if (m) {
  const r = await http(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${m[1]}`);
  out.li_detail = { status: r.status, size: r.body.length, id: m[1] };
  writeFileSync('jobs/data/_probe/li_detail.txt', r.body.slice(0, 60000));
}

// ---- Which companies publish a public careers feed, and on which applicant-tracking system? ----
const slugs = [...new Set(readFileSync('scraper/company-candidates.txt', 'utf8').toLowerCase().split(/\s+/).filter(Boolean))];
const ats = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
  lever: (s) => `https://api.lever.co/v0/postings/${s}?mode=json&limit=2`,
  lever_eu: (s) => `https://api.eu.lever.co/v0/postings/${s}?mode=json&limit=2`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
  smartrecruiters: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`,
  workable: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}`,
  recruitee: (s) => `https://${s}.recruitee.com/api/offers/`,
  personio: (s) => `https://${s}.jobs.personio.de/xml`,
  teamtailor: (s) => `https://${s}.teamtailor.com/jobs.rss`,
};
const found = [];
const tasks = [];
for (const s of slugs) for (const a of Object.keys(ats)) tasks.push([s, a]);
await pool(tasks, 20, async ([s, a]) => {
  const r = await http(ats[a](s), { timeout: 12 });
  if (r.status !== 200 || r.body.length < 30) return;
  let n = null;
  try {
    const j = JSON.parse(r.body);
    if (a === 'greenhouse') n = j.jobs?.length;
    else if (a.startsWith('lever')) n = Array.isArray(j) ? j.length : null;
    else if (a === 'ashby') n = j.jobs?.length;
    else if (a === 'smartrecruiters') n = j.totalFound;
    else if (a === 'workable') n = j.jobs?.length;
    else if (a === 'recruitee') n = j.offers?.length;
  } catch {
    if (a === 'personio') n = (r.body.match(/<position>/g) || []).length;
    else if (a === 'teamtailor') n = (r.body.match(/<item>/g) || []).length;
  }
  if (n) found.push({ slug: s, ats: a, n });
});
found.sort((x, y) => x.slug.localeCompare(y.slug) || x.ats.localeCompare(y.ats));
writeFileSync('jobs/data/_probe/ats.json', JSON.stringify(found, null, 1));
writeFileSync('jobs/data/_probe/summary.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
console.log('Company career feeds found:', found.length);
