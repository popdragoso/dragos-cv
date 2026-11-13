// Tiny HTTP helper built on curl (present on every GitHub runner, honours proxies, no npm deps).
import { execFile } from 'node:child_process';

// Honest, identifiable client string. Sources that do not want automated readers can refuse it.
export const UA = 'Mozilla/5.0 (compatible; JobRadar/1.0; personal job search; +https://github.com/popdragoso/dragos-cv)';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** GET/POST a URL. Never throws: resolves {status, body, error}. */
export function http(url, { method = 'GET', headers = {}, body = null, timeout = 25 } = {}) {
  const args = ['-sS', '-L', '--compressed', '-m', String(timeout), '-A', UA, '-X', method, '-w', '\n%{http_code}'];
  const h = { 'Accept-Language': 'en-GB,en;q=0.9,es;q=0.6', ...headers };
  for (const [k, v] of Object.entries(h)) args.push('-H', `${k}: ${v}`);
  if (body != null) args.push('--data-binary', typeof body === 'string' ? body : JSON.stringify(body));
  args.push(url);
  return new Promise((resolve) => {
    execFile('curl', args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const out = stdout || '';
      const cut = out.lastIndexOf('\n');
      const status = Number(out.slice(cut + 1)) || 0;
      resolve({
        status,
        body: cut >= 0 ? out.slice(0, cut) : '',
        error: err ? String(stderr || err.message).trim().slice(0, 200) : null,
      });
    });
  });
}

/** GET with polite retries on 429/5xx/network errors. */
export async function get(url, opts = {}, { retries = 3, backoff = 2500 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    last = await http(url, opts);
    if (last.status >= 200 && last.status < 300) return last;
    if (![0, 429, 500, 502, 503, 504].includes(last.status)) return last;
    await sleep(backoff * (i + 1) + Math.random() * 800);
  }
  return last;
}

export async function getJSON(url, opts = {}, retry) {
  const r = await get(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } }, retry);
  if (r.status < 200 || r.status >= 300) return { ...r, json: null };
  try {
    return { ...r, json: JSON.parse(r.body) };
  } catch {
    return { ...r, json: null, error: 'invalid JSON' };
  }
}

/** Run async fn over items with bounded concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx], idx);
        } catch (e) {
          out[idx] = { error: String(e) };
        }
      }
    }),
  );
  return out;
}
