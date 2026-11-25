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
// ---- real people: connections file, company matching ----
assert.ok(JR.sameCompany('Preply', 'Preply Inc.'));
assert.ok(JR.sameCompany('Gartner', 'Gartner Digital Markets'));
assert.ok(JR.sameCompany('OLX Group', 'OLX'));
assert.ok(JR.sameCompany('The Knot Worldwide', 'The Knot Worldwide Inc'));
assert.ok(!JR.sameCompany('G2', 'G2 Esports'));
assert.ok(JR.sameCompany('G2', 'G2.com'));
assert.ok(!JR.sameCompany('Preply', 'Prezi'));
assert.ok(!JR.sameCompany('Glovo', 'Globant'));
assert.ok(!JR.sameCompany('Meta', 'Metabase'));
const csv = 'Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nAna,Test,https://www.linkedin.com/in/ana-test,,"Acme & Co, Inc.",Director of Product,12 Mar 2023\nBob,"O""Neil",https://www.linkedin.com/in/bob,,Acme & Co,Senior Product Manager,01 Jan 2020\nCy,Hidden,,,,,05 May 2021\nDee,Rec,https://www.linkedin.com/in/dee,,Acme & Co,Talent Acquisition Partner,02 Feb 2022\nEd,Eng,https://www.linkedin.com/in/ed,,Acme & Co,Software Engineer,02 Feb 2022\nFay,Else,https://evil.example/in/fay,,Other Corp,VP Product,02 Feb 2022\n';
const conns = JR.parseConnections(csv);
assert.equal(conns.length, 5);
assert.equal(conns[1].name, 'Bob O"Neil');
assert.equal(conns[4].url, '', 'non-LinkedIn URLs are dropped');
const netw = { connections: conns, contacts: [{ name: 'Gil', company: 'Acme and Co'.replace('and', '&'), status: 'CV sent', next: 'Follow up' }] };
const who = JR.network({ title: 'Senior Product Manager - Growth', company: 'Acme & Co', location: 'Barcelona', description: '', url: 'https://example.com/j' }, netw);
assert.deepEqual(who.map((x) => x.name), ['Gil', 'Ana Test', 'Bob O"Neil', 'Dee Rec', 'Ed Eng']);
assert.deepEqual(who.map((x) => x.tier), ['other', 'manager', 'peer', 'recruiter', 'other']);
assert.equal(JR.network({ title: 'PM', company: 'Nobody Known', location: '', description: '', url: 'x' }, netw).length, 0);
assert.equal(JR.parseConnections('garbage,with,no,header').length, 0);
// ---- languages: every requirement counts, and country or market words do not ----
const langs = (title, desc) => JR.enrich({ title, location: 'Barcelona', description: desc }).languages.map((l) => l.lang + ':' + l.level).join(' ') || '(none)';
for (const [title, desc, want] of [
  ['Senior PM', '• Languages: Fluent Russian (required, as you will be working in a Russian-speaking team) and English at C1 level, both written and spoken', 'english:required russian:required'],
  ['Senior PM', 'We cannot hire in Belarus, Cuba, Iran, North Korea, Syria, or Russia, including the Ukrainian territories annexed by Russia.', '(none)'],
  ['Senior PM', 'Backed by top investors, from Sequoia’s first German seed to SAP.', '(none)'],
  ['Senior PM', 'Remote across the EU, preference for Prague, Czech Republic and Cyprus.', '(none)'],
  ['Senior PM', 'Fluent English is required. Spanish is a plus.', 'english:required spanish:plus'],
  ['Senior PM', 'Experience with the Spanish market and French customers.', '(none)'],
  ['Growth Strategy Manager - Mandarin speaker', 'Help us grow.', 'chinese:required'],
  ['Product Manager (French fluent)', '', 'french:required'],
  ['Senior PM', 'Spanish: native or C1 level.', 'spanish:required'],
  ['Senior PM', 'You will polish the onboarding and ship polished experiences.', '(none)'],
  ['Senior PM', 'Fluency in English and Hindi is a must.', 'english:required hindi:required'],
  ['Senior PM', 'Excellent English; German would be a plus; working in a Polish-speaking team.', 'english:required german:plus polish:required'],
  ['Senior PM', 'A strong Spanish market presence and German engineering culture.', '(none)'],
  ['Senior PM', 'Strong command of Spanish and English is mandatory.', 'english:required spanish:required'],
  ['Senior PM', 'Nice to have: Italian or Portuguese.', 'italian:plus portuguese:plus'],
]) assert.equal(langs(title, desc), want, desc);
const ru = JR.score({ title: 'Lead Product Manager, Online Donations', company: 'X', location: 'Barcelona', description: 'Own growth and experimentation. • Languages: Fluent Russian (required) and English at C1 level.' }, p);
assert.ok(ru.hardKnockout, 'a required language the user does not speak must block the role');
const ro = JR.score({ title: 'Senior Product Manager', company: 'X', location: 'Barcelona', description: 'Own growth. Romanian speaker required.' }, p);
assert.ok(!ro.hardKnockout, 'Romanian is in the profile');
console.log('people tests passed');
