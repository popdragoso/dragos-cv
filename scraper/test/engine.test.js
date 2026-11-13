const JR = require('../../jobs/engine.js');
const { defaultProfile } = require('../../jobs/profile-default.js');
const jobs = require('./fixtures.json');
const p = defaultProfile();
const now = Date.parse('2026-11-13T00:00:00Z');
console.log('profile concepts:', Object.keys(p.concepts).length, 'years', p.years, 'level', p.level);
for (const j of jobs) {
  const s = JR.score(j, p, { now });
  const e = j.e;
  console.log(`\n${j.id} ${j.title} | fit ${s.fit} ats ${s.ats} cov ${s.coverage} overall ${JR.overall(s.sub)} | ${e.workMode}/${e.remoteScope} days=${e.officeDays} elig=${e.eligible} fam=${e.family} sen=${e.seniority} yrs=${e.yearsRequired}`);
  console.log('  salary', e.salary && `${e.salary.eurMin}-${e.salary.eurMax} ${e.salary.currency} "${e.salary.quote}"`, '| hol', e.holidays, '| ben', e.benefits.map(b => b.key).join(','), '| flex', e.flex.map(f => f.key).join(','), e.flexScore, e.benefitScore);
  console.log('  langs', JSON.stringify(e.languages), 'ko', s.knockouts.map(k => k.text).join('; '));
  console.log('  sub', JSON.stringify(s.sub), '| missing', s.missing.slice(0, 6).map(m => m.id).join(','));
}
const t = JR.tailor(jobs[0], p);
console.log('\nTAILOR t1', t.before, '->', t.after, 'guard', t.guard.ok, t.guard.issues.slice(0,5));
console.log(t.changes.map(c => ' * ' + c.text).join('\n'));
console.log(' not added:', t.notAdded.map(m => m.label).join(', '));
console.log(t.text.split('\n').slice(0, 14).join('\n'));
const t2 = JR.tailor(jobs[1], p);
console.log('\nTAILOR t2', t2.before, '->', t2.after, '\n', t2.changes.map(c => ' * ' + c.text).join('\n'), '\n not added:', t2.notAdded.map(m => m.label).join(', '));
console.log(t2.cv.headline, '\n', t2.cv.roles[0].bullets.join('\n '), '\n', t2.cv.skills.join(' | '));
const g = JR.factGuard(p.text, 'Grew revenue 27% at Spotify with 15.5% uplift at Capterra');
console.log('guard test', JSON.stringify(g));
const plain = JR.buildProfile('Jane Roe\nProduct Manager\n2017 - present Acme\n- Managed roadmap\n- Ran A/B tests on checkout, growth up 12%\nLanguages: English (native), French (fluent)');
console.log('plain profile', plain.years, plain.level, plain.languages, Object.keys(plain.concepts).join(','));
console.log(JR.tailor(jobs[0], plain).text);

// ---- who to reach: classification and links ----
const assert = require('node:assert');
const cls = (t, l) => JR.classifyPerson(t, l).tier;
assert.equal(cls('Director of Product, Growth', 3), 'manager');
assert.equal(cls('Group Product Manager', 3), 'manager');
assert.equal(cls('VP of Product', 3), 'decision');
assert.equal(cls('VP Product', 4), 'manager');
assert.equal(cls('Chief Product Officer', 3), 'decision');
assert.equal(cls('CEO & Co-founder', 3), 'decision');
assert.equal(cls('Senior Product Manager', 3), 'peer');
assert.equal(cls('Principal Product Manager', 3), 'peer');
assert.equal(cls('Associate Product Manager', 3), 'other');
assert.equal(cls('Talent Acquisition Partner', 3), 'recruiter');
assert.equal(cls('Product Designer', 3), 'other');
assert.equal(cls('Senior Product Marketing Manager', 3), 'other');
assert.equal(cls('', 3), 'unknown');
const ppl = JR.people({ title: 'Senior Product Manager - Growth', company: 'Acme & Co', location: 'Barcelona', description: '', url: 'https://example.com/j', liCompany: 'acme-co' }, p);
assert.deepEqual(ppl.tiers.map((t) => t.key), ['manager', 'decision', 'peer', 'warm', 'recruiter']);
assert.ok(ppl.tiers[0].start && ppl.area === 'growth');
for (const t of ppl.tiers) for (const l of t.links) { const u = new URL(l.url); assert.equal(u.hostname, 'www.linkedin.com'); assert.ok(u.searchParams.get('keywords')); }
assert.ok(ppl.tiers[0].links[0].url.startsWith('https://www.linkedin.com/company/acme-co/people/?keywords='));
const ppl2 = JR.people({ title: 'Principal Product Manager', company: 'Acme & Co', location: 'Barcelona', description: '', url: 'https://example.com/j', posterListed: true }, p);
assert.equal(ppl2.tiers[0].key, 'listed');
assert.ok(ppl2.tiers[0].start && !ppl2.tiers[1].start && !ppl2.scoped);
assert.ok(new URL(ppl2.tiers[1].links[0].url).searchParams.get('keywords').includes('"Acme & Co"'));
console.log('people tests passed');
