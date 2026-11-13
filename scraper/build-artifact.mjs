// Packs the page into one HTML file (styles, scripts and data inline) for hosts that serve a single file.
// Usage: node scraper/build-artifact.mjs <out.html> [env.json]   env.json may hold { driveFolder, trackerSheet }
import { readFileSync, writeFileSync } from 'node:fs';
const [out, envFile] = process.argv.slice(2);
const r = (f) => readFileSync('jobs/' + f, 'utf8');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const env = Object.assign({ artifact: true }, envFile ? JSON.parse(readFileSync(envFile, 'utf8')) : {});
const html = `<title>Job Radar</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap">
<style>
${r('styles.css')}
</style>
<div id="app"></div>
<script>window.JR_ENV=${safe(JSON.stringify(env))};window.JR_DATA=${safe(r('data/jobs.json'))};</script>
<script>
${safe(r('engine.js'))}
</script>
<script>
${safe(r('profile-default.js'))}
</script>
<script>
${safe(r('app.js'))}
</script>
`;
writeFileSync(out, html);
console.log('wrote', out, html.length, 'bytes');
