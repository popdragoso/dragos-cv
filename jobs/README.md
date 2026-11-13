# Job Radar

Product roles in Barcelona and remote from Spain, collected every morning and ranked against a CV.
Live page: `https://popdragoso.github.io/dragos-cv/jobs/` (not linked from the CV, not indexed).

## What it does

- **Collects** roles from LinkedIn's public job pages, the public career feeds of several hundred employers
  (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee) and open remote boards
  (Remotive, Remote OK, Arbeitnow, Himalayas, The Muse, Jobicy, Working Nomads, We Work Remotely).
  Indeed, Glassdoor and InfoJobs refuse automated readers; they are listed as blocked rather than worked around.
- **Reads each posting** for work mode (remote, hybrid with office days, on-site), pay, holidays, insurance,
  equity, other benefits, flexibility, required languages, level and years.
- **Scores fit** against the CV: weighted keyword coverage, title and level fit, focus overlap, language blockers.
- **Ranks** by a blend you control: fit, remote over hybrid over on-site, freshness, pay, flexibility, benefits.
  Six top picks are always called out: best overall, highest fit, newest strong match, best paid, most flexible, best benefits.
- **Tailors the CV** to one posting: re-orders and re-angles existing bullets and mirrors the posting's wording
  for skills the CV already shows. It never adds a fact. Missing keywords are listed as "only add if true".
- **Works for anyone**: add a LinkedIn link and drop LinkedIn's own PDF export (or any CV) and every role is re-scored
  in the browser. Nothing is uploaded.

## How it runs

| Part | Where | Notes |
| --- | --- | --- |
| Page | `jobs/` (static, no build step) | `engine.js` is shared by the page and the scanner |
| Scanner | `scraper/run.mjs` | Node 22, no dependencies. `node scraper/run.mjs` |
| Schedule | `.github/workflows/job-radar.yml` | Daily, plus "Run workflow" in the Actions tab |
| Data | `jobs/data/jobs.json` | Committed by the workflow |
| Tests | `node scraper/test/engine.test.js` | Engine checks on sample postings |

## Honest limits

- Scores are estimates from posting text. The ATS number is a keyword proxy validated on 30 Barcelona product
  postings, not any employer's real system.
- Pay, benefits and work mode appear only when the posting states them.
- LinkedIn may refuse requests from GitHub's servers on some days. The scan then keeps the previous day's roles
  and says so under Sources.
- LinkedIn does not allow reading a profile from its URL. The profile comes from the PDF LinkedIn itself exports.
