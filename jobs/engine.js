/* Job Radar engine. Pure functions, no DOM. Runs in the browser (window.JR) and in Node (module.exports).
   enrich(job)        -> structured facts read out of a posting (work mode, pay, benefits, languages...)
   buildProfile(text) -> a candidate profile from CV / LinkedIn text
   score(job,profile) -> fit %, ATS proxy, and the sub-scores used for ranking
   tailor(job,profile)-> the same CV, re-angled for one posting. It never adds a fact the CV does not contain. */
(function (root) {
  'use strict';

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[‐-―]/g, '-')
      .replace(/\s+/g, ' ');
  const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- 1. Vocabulary: what product postings ask for ----------
     w = how much a recruiter screen cares (3 core, 2 common, 1 nice). Aliases are true synonyms only. */
  const C = (id, label, w, group, aliases) => ({ id, label, w, group, aliases });
  const LEXICON = [
    C('experimentation', 'Experimentation', 3, 'growth', ['experimentation', 'experiments?', 'a/b test(?:ing|s)?', 'ab test(?:ing|s)?', 'split test(?:ing|s)?', 'multivariate', 'test and learn', 'test-and-learn', 'hypothesis[- ]driven', 'hypothes[ie]s']),
    C('cro', 'Conversion rate optimization', 3, 'growth', ['conversion rate optimi[sz]ation', 'cro', 'conversion optimi[sz]ation', 'conversion rates?', 'conversions?', 'ux optimi[sz]ation', 'optimi[sz]ation (?:strategy|program|roadmap)']),
    C('growth', 'Growth', 3, 'growth', ['growth', 'product-led growth', 'plg', 'growth loops?']),
    C('funnel', 'Funnel analysis', 2, 'growth', ['funnels?', 'funnel analysis', 'drop-off']),
    C('acquisition', 'Acquisition', 2, 'growth', ['acquisition', 'user acquisition', 'top of funnel', 'new leads', 'lead generation', 'leads']),
    C('activation', 'Activation and onboarding', 2, 'growth', ['activation', '(?:user|customer|client|seller|buyer) onboarding', 'onboarding (?:flows?|funnel|experience|journey)', 'time to value', 'aha moment']),
    C('retention', 'Retention', 2, 'growth', ['retention', 'churn', 'weekly active users', 'wau', 'mau', 'dau']),
    C('engagement', 'Engagement', 2, 'growth', ['engagement', 'active users']),
    C('monetization', 'Monetization', 3, 'growth', ['moneti[sz]ation', 'pricing', 'paywall', 'pay-per-click', 'pay-per-lead', 'ppc', 'ppl', 'subscriptions?']),
    C('revenue', 'Revenue', 2, 'growth', ['revenue', 'arr', 'mrr', 'gmv', 'incremental revenue']),
    C('checkout', 'Checkout', 1, 'growth', ['checkout']),
    C('landing', 'Landing pages', 1, 'growth', ['landing pages?']),
    C('seo', 'SEO', 1, 'growth', ['seo', 'organic search']),
    C('crm', 'CRM and lifecycle', 1, 'growth', ['crm', 'lifecycle', 'martech', 'push notifications']),
    C('performance', 'Performance marketing', 1, 'growth', ['performance marketing', 'paid marketing', 'paid channels']),
    C('personalization', 'Personalization', 1, 'growth', ['personali[sz]ation', 'recommendations?', 'recommender']),

    C('ai', 'AI', 3, 'ai', ['ai', 'artificial intelligence', 'ai-powered', 'ai-driven', 'ai-native', 'ai-first']),
    C('genai', 'Generative AI', 3, 'ai', ['generative ai', 'genai', 'gen ai', 'gen-ai', 'image[- ]generation', 'prompt-driven', 'prompts?', 'prompt engineering']),
    C('llm', 'LLMs', 2, 'ai', ['llms?', 'large language models?', 'foundation models?', 'gpt', 'agents?', 'agentic', 'rag']),
    C('evals', 'Model evaluation', 2, 'ai', ['evals?', 'model evaluation', 'evaluation rubrics?', 'golden sets?', 'evaluation framework', 'evaluation']),
    C('ml', 'Machine learning', 2, 'ai', ['machine learning', 'ml', 'data science', 'data scientists?']),
    C('aiquality', 'AI output quality', 1, 'ai', ['output quality', 'defect (?:ratio|rate)s?', 'hallucinations?', 'quality bar']),
    C('aitools', 'AI tools', 1, 'ai', ['ai tools', 'claude', 'chatgpt', 'copilot', 'cursor']),

    C('pm', 'Product management', 3, 'craft', ['product management', 'product manager', 'product managers']),
    C('strategy', 'Product strategy', 3, 'craft', ['product strategy', 'strategy', 'strategic']),
    C('roadmap', 'Roadmap', 3, 'craft', ['roadmaps?', 'roadmapping']),
    C('vision', 'Product vision', 2, 'craft', ['vision']),
    C('discovery', 'Product discovery', 2, 'craft', ['discovery', 'customer interviews?', 'user interviews?', 'vendor interviews?', 'user research', 'customer research']),
    C('prioritization', 'Prioritization', 2, 'craft', ['prioriti[sz]ation', 'prioriti[sz]e', 'prioriti[sz]ing', 'trade-offs?', 'tradeoffs?']),
    C('metrics', 'Success metrics', 3, 'craft', ['metrics?', 'kpis?', 'okrs?', 'success metrics', 'north star']),
    C('data', 'Data-driven decisions', 3, 'craft', ['data-driven', 'data driven', 'data-informed', 'analytics', 'analytical', 'insights?', 'quantitative']),
    C('sql', 'SQL', 1, 'craft', ['sql', 'bigquery', 'looker', 'tableau']),
    C('stats', 'Statistics', 2, 'craft', ['statistics', 'statistical', 'significance', 'statistical significance']),
    C('ux', 'UX', 2, 'craft', ['ux', 'user experience', 'usability', 'design thinking', 'ux research']),
    C('delivery', 'End-to-end delivery', 2, 'craft', ['end-to-end', 'end to end', 'delivery', 'shipped', 'shipping', 'launch(?:es|ed)?', 'go-to-market', 'gtm', 'execution']),
    C('agile', 'Agile', 1, 'craft', ['agile', 'scrum', 'sprints?', 'kanban', 'jira']),
    C('qa', 'Quality assurance', 1, 'craft', ['qa', 'quality assurance', 'regression']),
    C('technical', 'Technical fluency', 2, 'craft', ['technical (?:background|fluency|depth|acumen|understanding|relationship)', 'technically', 'codebase', 'code review', 'production changes']),
    C('platform', 'Platform', 2, 'craft', ['platform', 'self-serve', 'self-service']),
    C('mobile', 'Mobile', 1, 'craft', ['mobile', 'ios', 'android']),
    C('tracking', 'Event tracking', 1, 'craft', ['event tracking', 'tracking', 'instrumentation', 'cohorts?', 'amplitude', 'mixpanel', 'ga4', 'google analytics']),
    C('exptools', 'Experimentation tooling', 1, 'craft', ['optimizely', 'launchdarkly', 'kameleoon', 'vwo', 'statsig', 'eppo', 'growthbook', 'feature flags?']),
    C('uxtools', 'Behaviour analytics tools', 1, 'craft', ['hotjar', 'fullstory', 'contentsquare', 'session recordings?', 'heatmaps?']),

    C('stakeholders', 'Stakeholder management', 3, 'people', ['stakeholders?', 'stakeholder management']),
    C('crossfunctional', 'Cross-functional leadership', 3, 'people', ['cross-functional', 'cross functional', 'engineering, design', 'engineers and designers', 'without direct reports']),
    C('leadership', 'Leadership', 2, 'people', ['leadership', 'influence', 'influencing', 'without direct reports', 'without authority']),
    C('execs', 'Executive communication', 2, 'people', ['executives?', 'c-level', 'c-suite', 'vp', 'svp', 'cmo', 'leadership team', 'senior leadership', 'co-founder']),
    C('communication', 'Communication', 2, 'people', ['communication', 'communicator', 'present(?:ed|ing|ations?)?', 'storytelling']),
    C('ownership', 'Ownership', 2, 'people', ['ownership', 'owned', 'autonomy', 'autonomous']),
    C('mentoring', 'Coaching and mentoring', 1, 'people', ['mentor(?:ing|ed)?', 'coach(?:ing|ed)?', 'taught', 'teaching']),
    C('vendors', 'Vendor management', 1, 'people', ['vendor management', 'vendor relationship', 'procurement', 'partnerships?']),
    C('culture', 'Culture change', 1, 'people', ['culture', 'change management', 'risk-averse']),

    C('marketplace', 'Marketplace', 2, 'domain', ['marketplaces?', 'two-sided', 'supply and demand']),
    C('b2b', 'B2B SaaS', 2, 'domain', ['b2b', 'saas', 'enterprise']),
    C('b2c', 'Consumer', 1, 'domain', ['b2c', 'consumer', 'd2c']),
    C('ecommerce', 'E-commerce', 2, 'domain', ['e-commerce', 'ecommerce', 'retail', 'online sales']),
    C('fintech', 'Fintech', 2, 'domain', ['fintech', 'banking', 'lending', 'loans?', 'credit', 'neobank', 'wealth', 'trading', 'insurtech']),
    C('edtech', 'EdTech', 1, 'domain', ['edtech', 'education', 'learning platform']),
    C('gaming', 'Gaming', 2, 'domain', ['gaming', 'games?', 'live ops', 'liveops', 'free-to-play']),
    C('health', 'Healthtech', 2, 'domain', ['healthtech', 'healthcare', 'clinical', 'patients?', 'medical', 'pharma']),
    C('travel', 'Travel', 1, 'domain', ['travel', 'hospitality', 'hotels?', 'airlines?']),
    C('adtech', 'Advertising', 1, 'domain', ['advertising', 'adtech', 'ads']),
    C('content', 'Content products', 1, 'domain', ['content', 'creative', 'social platforms?', 'social media']),
    C('payments', 'Payments and billing', 2, 'domain', ['payments?', 'billing', 'invoicing', 'ledger', 'card issuing', 'psp', 'acquiring']),
    C('crypto', 'Crypto and web3', 3, 'domain', ['crypto', 'blockchain', 'stablecoins?', 'web3', 'defi', 'tokens?', 'wallets?']),
    C('devtools', 'Developer and infrastructure products', 3, 'domain', ['observability', 'o11y', 'kubernetes', 'cloud infrastructure', 'infrastructure', 'developer tools?', 'developer experience', 'developers', 'open source', 'open-source', 'databases?', 'sdks?', 'apis?', 'devops', 'ci/cd', 'cloud-native', 'distributed systems']),
    C('security', 'Security, risk and compliance', 3, 'domain', ['security', 'cybersecurity', 'identity', 'fraud', 'compliance', 'regulatory', 'kyc', 'aml', 'trust (?:and|&) safety', 'privacy']),
    C('hardware', 'Hardware and IoT', 3, 'domain', ['hardware', 'iot', 'telematics', 'automotive', 'vehicles?', 'fleet', 'devices?', 'firmware', 'robotics', 'embedded']),
    C('dataplatform', 'Data platforms', 2, 'domain', ['data platform', 'data engineering', 'data pipelines?', 'data warehouse', 'etl', 'data infrastructure', 'data governance', 'data products?']),
    C('logistics', 'Logistics and supply chain', 2, 'domain', ['logistics', 'supply chain', 'fulfil?lment', 'warehouse', 'last[- ]mile', 'delivery network', 'shipping']),
    C('hrtech', 'HR and payroll', 2, 'domain', ['payroll', 'hr tech', 'hris', 'human resources', 'recruiting', 'talent acquisition', 'workforce']),
    C('proptech', 'Real estate', 2, 'domain', ['real estate', 'proptech', 'property']),
    C('telecom', 'Telecom', 2, 'domain', ['telecom', 'telco', 'connectivity', '5g']),
    C('energy', 'Energy', 2, 'domain', ['energy', 'utilities', 'renewables?', 'solar']),
    C('erp', 'ERP and back office', 2, 'domain', ['erp', 'accounting', 'procure-to-pay', 'back[- ]office', 'treasury', 'tax']),
    C('global', 'International scope', 1, 'domain', ['international', 'global', 'multi-market', 'localization', 'several countries']),
  ];
  for (const c of LEXICON) {
    c.re = new RegExp('(?<![a-z0-9])(?:' + c.aliases.join('|') + ')(?![a-z0-9])', 'g');
    c.aliasRes = c.aliases.map((a) => ({ a, re: new RegExp('(?<![a-z0-9])(?:' + a + ')(?![a-z0-9])') }));
  }
  const LEX = Object.fromEntries(LEXICON.map((c) => [c.id, c]));

  /** concept id -> {tf, phrase} found in a text */
  function concepts(text) {
    const t = norm(text);
    const out = {};
    for (const c of LEXICON) {
      const m = t.match(c.re);
      if (m) {
        const counts = {};
        for (const x of m) counts[x] = (counts[x] || 0) + 1;
        const phrase = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
        out[c.id] = { tf: m.length, phrase };
      }
    }
    return out;
  }

  /* ---------- 2. Reading a posting ---------- */
  const BENEFITS = [
    ['health', 'Private health insurance', 'insurance', /(private )?(health|medical) (insurance|cover(age)?|plan)|seguro (medico|de salud)|healthcare (plan|cover|insurance)|sanitas|adeslas|alan health/],
    ['dental', 'Dental cover', 'insurance', /dental/],
    ['life', 'Life insurance', 'insurance', /life (insurance|assurance)|seguro de vida|accident insurance|disability insurance/],
    ['mental', 'Mental health support', 'insurance', /mental health|therapy|psycholog|wellbeing (support|program)|ifeel|oliva|headspace|calm app/],
    ['pension', 'Pension plan', 'money', /pension|retirement plan|plan de pensiones|401\(?k\)?/],
    ['equity', 'Equity or stock options', 'money', /stock options?|equity|rsus?|esop|phantom shares|share options|vsop|employee share/],
    ['bonus', 'Bonus', 'money', /(annual|performance|yearly|variable) bonus|bonus (scheme|plan|program)|variable (pay|compensation|salary)|\bbonus\b/],
    ['flexpay', 'Flexible compensation', 'money', /retribucion flexible|flexible (remuneration|compensation|retribution|benefits? plan)|cobee|flexoh|payflow/],
    ['meal', 'Meals or meal allowance', 'money', /ticket restaurant|meal (vouchers?|allowance|card)|free (lunch|breakfast|food)|lunch (allowance|is on us)|catered|snacks/],
    ['transport', 'Transport allowance', 'money', /transport (allowance|card|ticket)|commut(er|ing) (benefits?|allowance)|ticket transporte|bicing/],
    ['learning', 'Learning budget', 'growth', /(learning|training|education|development|l&d) (budget|allowance|stipend)|conference budget|personal development budget|udemy|coursera|books? budget/],
    ['language', 'Language classes', 'growth', /(language|spanish|english|french|german) (classes|lessons|courses)|clases de (ingles|idiomas)/],
    ['gym', 'Gym or wellness', 'life', /gym|wellhub|gympass|urban sports|wellness (budget|allowance|stipend)|fitness/],
    ['parental', 'Extended parental leave', 'life', /(parental|maternity|paternity) leave|baby bonus|family leave/],
    ['childcare', 'Childcare support', 'life', /childcare|nursery|guarderia/],
    ['relocation', 'Relocation support', 'life', /relocation|visa (sponsorship|support)|we sponsor/],
    ['homeoffice', 'Home-office budget', 'life', /(home[- ]office|remote|work[- ]from[- ]home|wfh|equipment) (budget|allowance|stipend|setup)|coworking (budget|allowance|membership)/],
    ['equipment', 'Equipment provided', 'life', /macbook|laptop of your choice|top[- ]notch equipment|latest equipment/],
    ['sabbatical', 'Sabbatical', 'life', /sabbatical/],
    ['volunteer', 'Volunteering days', 'life', /volunteer(ing)? (days?|time)/],
    ['offsites', 'Team offsites', 'life', /off-?sites?|team (retreats?|events|building)|company (retreats?|trips?)/],
    ['birthday', 'Birthday off', 'life', /birthday (off|leave|day)|day off (on|for) your birthday/],
    ['pets', 'Pet-friendly office', 'life', /pet[- ]friendly|dog[- ]friendly/],
  ];
  const FLEX = [
    ['hours', 'Flexible hours', 22, /flexible (working )?(hours|schedule|time|working)|flexi-?time|horario flexible|flexible start|work[- ]life balance|flexibility/],
    ['wfa', 'Work-from-anywhere weeks', 18, /work from anywhere|work abroad|workation|wfa|work remotely from (another|any) (country|location)/],
    ['fourday', '4-day week', 30, /4[- ]day (work ?)?week|four[- ]day (work ?)?week/],
    ['async', 'Async-friendly', 12, /async|asynchronous/],
    ['summer', 'Short Fridays or summer hours', 12, /summer (hours|schedule|fridays)|jornada intensiva|short fridays|half[- ]day fridays|free friday afternoons?|intensive (schedule|workday|hours)/],
    ['unlimited', 'Unlimited time off', 20, /unlimited (pto|holidays?|vacations?|time off|paid time off)|flexible (pto|time off|vacation)/],
    ['parttime', 'Part-time possible', 8, /part[- ]time (possible|option)|reduced hours/],
  ];
  const LANGS = { spanish: /spanish|espanol|castellano/, french: /french|francais|frances/, german: /german|deutsch|aleman/, catalan: /catalan|catala/, italian: /italian|italiano/, portuguese: /portuguese|portugues/, dutch: /dutch|nederlands/, english: /english|ingles/ };
  const ES_WORDS = /\b(nuestro|nuestra|buscamos|experiencia|empresa|equipo|trabajo|ofrecemos|requisitos|conocimientos|para|como|tambien|seras|puesto|funciones)\b/g;
  const FR_WORDS = /\b(nous|notre|vous|votre|recherchons|experience|equipe|poste|missions|profil|avec|pour|dans|sein)\b/g;
  const DE_WORDS = /\b(wir|unser|unsere|und|fur|mit|deine|aufgaben|erfahrung|suchen|bieten|bei|das|die|der)\b/g;

  const SENIORITY = [
    ['intern', /\b(intern|internship|trainee|becario|practicas|working student)\b/, 0],
    ['junior', /\b(junior|jr\.?|associate|graduate|entry[- ]level)\b/, 1],
    ['director', /\b(director|vp|vice president|chief|cpo|head of)\b/, 6],
    ['group', /\bgroup product\b/, 5],
    ['principal', /\b(principal|staff)\b/, 4],
    ['lead', /\b(lead|leader)\b/, 3.5],
    ['senior', /\b(senior|sr\.?|sénior)\b/, 3],
  ];

  function parseMoney(raw) {
    const text = String(raw || '').replace(/ /g, ' ');
    const cur = { '€': 'EUR', eur: 'EUR', euros: 'EUR', euro: 'EUR', '$': 'USD', usd: 'USD', '£': 'GBP', gbp: 'GBP', chf: 'CHF' };
    const fx = { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.05 };
    const num = '(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d{2,3}(?:[.,]\\d)?\\s?k|\\d{4,6})';
    const sym = '(€|\\$|£|eur(?:os?)?|usd|gbp|chf)';
    const patterns = [
      new RegExp(sym + '\\s?' + num + '(?:\\s?' + sym + ')?\\s*(?:-|–|—|to|a|y|and|hasta)\\s*' + sym + '?\\s?' + num, 'i'),
      new RegExp(num + '\\s?' + sym + '?\\s*(?:-|–|—|to|a|y|and|hasta)\\s*' + num + '\\s?' + sym, 'i'),
      new RegExp('(?:from|desde|up to|hasta|starting at)\\s*' + sym + '\\s?' + num, 'i'),
      new RegExp('(?:from|desde|up to|hasta|starting at)\\s*' + num + '\\s?' + sym, 'i'),
    ];
    const val = (s) => {
      let x = s.toLowerCase().replace(/\s/g, '');
      if (x.endsWith('k')) return parseFloat(x.replace(',', '.')) * 1000;
      return parseFloat(x.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    };
    for (let i = 0; i < patterns.length; i++) {
      const re = new RegExp(patterns[i].source, 'gi');
      let m;
      while ((m = re.exec(text))) {
        const parts = m.slice(1).filter(Boolean);
        const c = parts.map((p) => cur[p.toLowerCase()]).find(Boolean);
        const nums = parts.filter((p) => /\d/.test(p)).map(val);
        if (!c || !nums.length) continue;
        let [a, b] = nums.length > 1 ? nums : [nums[0], null];
        const ctx = norm(text.slice(Math.max(0, m.index - 90), m.index + m[0].length + 60));
        if (/funding|raised|valuation|revenue|customers|users|series [a-e]|budget|million|billion|\bm\b|invest/.test(ctx) && !/salary|salario|compensation|pay range|gross|bruto|per year|annual|ote/.test(ctx)) continue;
        let period = /per hour|\/ ?h(ou)?r|hourly/.test(ctx) ? 'hour' : /per month|\/ ?month|monthly|al mes|\/ ?mes/.test(ctx) ? 'month' : /per day|\/ ?day|daily rate/.test(ctx) ? 'day' : 'year';
        const mult = period === 'month' ? 12 : period === 'day' ? 220 : period === 'hour' ? 1760 : 1;
        a *= mult;
        if (b) b *= mult;
        if (b && b < a) [a, b] = [b, a];
        if (a < 18000 || a > 500000 || (b && b > 700000)) continue;
        const upTo = i >= 2 && /up to|hasta/.test(m[0].toLowerCase());
        return {
          currency: c,
          min: upTo ? null : Math.round(a),
          max: Math.round(b || (upTo ? a : 0)) || null,
          eurMin: upTo ? null : Math.round(a * fx[c]),
          eurMax: Math.round((b || (upTo ? a : 0)) * fx[c]) || null,
          period,
          converted: c !== 'EUR',
          quote: m[0].trim(),
        };
      }
    }
    return null;
  }

  function enrich(job) {
    const title = norm(job.title);
    const loc = norm(job.location);
    const desc = norm(job.description);
    const all = title + ' . ' + loc + ' . ' + desc;
    const e = {};

    // work mode: explicit source flag > title/location > description wording
    let mode = job.workMode || null;
    if (/100% remote|fully remote|full remote|remote[- ]first|100% remoto/.test(title + ' ' + loc)) mode = 'remote';
    const hybridRe = /hybrid|hibrido|days? (per|a|each) week (in|at|from) (the|our) office|days? in (the|our) office|office days|dias (a la semana )?en (la )?oficina/;
    const remoteStrong = /fully remote|100% remote|remote[- ]first|remote within|remote in (spain|europe|emea|the eu)|remote \(|work from anywhere in|teletrabajo 100|100% teletrabajo|100% remoto|full remote|fully distributed|distributed team|remote position|remote role|this is a remote/;
    const onsiteRe = /on-?site|in-?office|presencial|office[- ]based|5 days (a|per) week in/;
    if (!mode) {
      if (hybridRe.test(title + ' ' + loc)) mode = 'hybrid';
      else if (/remote|remoto|teletrabajo|anywhere/.test(title + ' ' + loc)) mode = 'remote';
      else if (remoteStrong.test(desc) && !/not (a )?remote|no remote/.test(desc)) mode = hybridRe.test(desc) && /office/.test(loc + desc.slice(0, 400)) && !/fully remote|100% remote|remote[- ]first/.test(desc) ? 'hybrid' : 'remote';
      else if (hybridRe.test(desc)) mode = 'hybrid';
      else if (onsiteRe.test(desc)) mode = 'onsite';
      else mode = 'unknown';
    }
    e.workMode = mode;
    const od = desc.match(/(\d|one|two|three|four)\s*(?:-\s*\d\s*)?days? (?:per|a|each) week (?:in|at|from) (?:the|our) office|(\d|one|two|three|four)\s*days? in (?:the|our) office/);
    e.officeDays = od ? ({ one: 1, two: 2, three: 3, four: 4 }[od[1] || od[2]] || Number(od[1] || od[2])) : null;

    // geography
    const geo = loc + ' ' + title;
    e.inBarcelona = /barcelona|bcn|sant cugat|hospitalet|badalona|catalonia|cataluna|catalunya/.test(geo) || (!loc && /barcelona/.test(desc.slice(0, 1500)));
    e.inSpain = e.inBarcelona || /spain|espana|madrid|valencia|malaga|sevilla|bilbao/.test(geo);
    e.remoteScope = null;
    if (mode === 'remote') {
      const g = geo + ' ' + desc.slice(0, 2500);
      const elsewhere = /united states|\busa?\b|u\.s\.|america|canada|latam|apac|asia|india|australia|united kingdom|\buk\b|britain|england|london|ireland|dublin|germany|berlin|france|paris|netherlands|amsterdam|portugal|lisbon|italy|poland|ukraine|romania|bulgaria|serbia|turkey|israel|brazil|mexico|argentina|colombia|philippines|singapore|japan|china|africa|nigeria|kenya|egypt|dubai|uae|new york|san francisco|california|texas|toronto|sweden|denmark|norway|finland|switzerland|austria|belgium|czech|hungary|greece|estonia|lithuania|latvia|cyprus|malta|pakistan|vietnam|indonesia/;
      const wide = /europe|emea|\beu\b|european|worldwide|anywhere|global/;
      if (/spain|espana|barcelona|madrid|valencia|malaga/.test(geo)) e.remoteScope = 'Spain';
      else if (elsewhere.test(loc) && !wide.test(loc)) e.remoteScope = 'Other region';
      else if (/europe|emea|\beu\b|european/.test(loc)) e.remoteScope = 'Europe';
      else if (/worldwide|anywhere|global/.test(loc)) e.remoteScope = /us only|usa only|north america only|must be (based|located) in the (us|united states)|authorized to work in the (us|united states)|us[- ]based/.test(desc) ? 'Other region' : 'Worldwide';
      else if (/remote (within|in|from) spain|anywhere in spain|based in spain|spanish (employment )?contract/.test(g)) e.remoteScope = 'Spain';
      else if (/europe|emea|\beu\b|european|cet\b|utc ?\+ ?[012]\b/.test(g)) e.remoteScope = 'Europe';
      else if (/us only|usa only|united states|north america/.test(g)) e.remoteScope = 'Other region';
      else e.remoteScope = 'Unspecified';
    }
    e.eligible = e.inSpain || (mode === 'remote' && ['Spain', 'Europe', 'Worldwide', 'Unspecified'].includes(e.remoteScope));

    // pay
    e.salary = parseMoney(job.salaryText) || parseMoney(job.description);
    if (e.salary) e.salary.from = job.salaryText && parseMoney(job.salaryText) ? 'listing' : 'description';

    // benefits + flexibility
    e.benefits = [];
    for (const [key, label, group, re] of BENEFITS) if (re.test(desc)) e.benefits.push({ key, label, group });
    const hol = desc.match(/(\d{2})\s*(?:\+\s*)?(?:working |paid |business )?(?:days?|dias) (?:of |de )?(?:paid )?(?:annual leave|holidays?|vacations?|vacaciones|paid time off|pto|time off|leave)/) || desc.match(/(?:holidays?|vacations?|annual leave|pto|vacaciones)[^.\d]{0,25}(\d{2}) (?:working |paid )?(?:days|dias)/);
    e.holidays = hol && Number(hol[1]) >= 20 && Number(hol[1]) <= 60 ? Number(hol[1]) : null;
    if (e.holidays) e.benefits.unshift({ key: 'holidays', label: e.holidays + ' days holiday', group: 'time' });
    e.flex = [];
    let flex = mode === 'remote' ? 45 : mode === 'hybrid' ? 22 : 0;
    for (const [key, label, pts, re] of FLEX)
      if (re.test(desc)) {
        e.flex.push({ key, label });
        flex += pts;
      }
    e.flexScore = clamp(flex);
    const bw = { insurance: 14, money: 12, growth: 9, life: 7, time: 0 };
    let ben = e.benefits.reduce((s, b) => s + bw[b.group], 0);
    if (e.holidays) ben += clamp((e.holidays - 22) * 3, 4, 24);
    e.benefitScore = clamp(ben);

    // languages
    e.languages = [];
    const sentences = desc.split(/(?<=[.!?;:\n•·])\s+|\s-\s/);
    for (const [lang, re] of Object.entries(LANGS)) {
      let level = null;
      for (const s of sentences) {
        if (!re.test(s)) continue;
        if (/\b(plus|bonus|nice to have|advantage|desirable|valorable|valued|preferred|beneficial|asset|would be great|ideal(?:ly)?|not required|is not (a )?must)\b/.test(s)) level = level || 'plus';
        else if (/\b(fluent|fluency|native|proficien|required|must|mandatory|imprescindible|nativo|bilingual|c1|c2|advanced|excellent|professional|business[- ]level|alto|avanzado|speaker|speaking)\b/.test(s)) level = 'required';
        else level = level || 'mentioned';
      }
      if (new RegExp('\\b' + lang + '[- ]speaking|\\(' + lang + '\\)|' + lang + ' fluent|fluent ' + lang).test(title)) level = 'required';
      if (level) e.languages.push({ lang, level });
    }
    const nw = Math.max(1, desc.split(' ').length);
    const share = (re) => (desc.match(re) || []).length / nw;
    e.postingLanguage = share(ES_WORDS) > 0.035 ? 'spanish' : share(FR_WORDS) > 0.05 ? 'french' : share(DE_WORDS) > 0.07 ? 'german' : 'english';
    if (e.postingLanguage !== 'english' && !e.languages.some((l) => l.lang === e.postingLanguage && l.level === 'required')) {
      e.languages = e.languages.filter((l) => l.lang !== e.postingLanguage);
      e.languages.push({ lang: e.postingLanguage, level: 'posting' });
    }

    // level + role family
    e.seniority = 'mid';
    e.level = 2;
    for (const [name, re, lvl] of SENIORITY)
      if (re.test(title)) {
        e.seniority = name;
        e.level = lvl;
        break;
      }
    const yrs = [...desc.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?|anos)/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 15);
    e.yearsRequired = yrs.length ? Math.max(...yrs.slice(0, 4)) : null;

    const isPM = /product (manager|management|lead|owner|director)|head of product|\bpm\b|chief product|vp,? (of )?product|product growth|growth product|group product|responsable de producto/.test(title);
    const isCRO = /\bcro\b|conversion rate|conversion optimi|experimentation|(website|ux|digital|web) optimi[sz]ation|a\/b test/.test(title);
    const isGrowth = /growth/.test(title);
    const off = /data director|director of (growth|marketing|data)|product marketing|marketing manager|project manager|program manager|programme manager|product design|designer|engineer|developer|analyst|data scientist|sales|account (manager|executive)|customer success|recruiter|production manager|product specialist|product operations|category manager|brand manager|content manager|community manager|supply chain|quality manager|compliance|legal|finance manager/.test(title);
    e.family = off && !/product manager/.test(title.replace(/product marketing manager/, '')) ? 'other' : isPM ? (/owner/.test(title) ? 'owner' : 'pm') : isCRO ? 'cro' : isGrowth ? 'growth' : 'other';
    if (/technical product manager|platform product manager|data product manager|hardware/.test(title)) e.techPM = true;
    e.adjacent = e.family !== 'pm' && e.family !== 'owner' && /consultant|specialist|executive|analyst|affiliate|referral|operations|marketing|strategy|sales|partnerships?|community|hacker|seo|paid|crm/.test(title);

    e.concepts = concepts(job.title + '. ' + job.title + '. ' + (job.description || ''));
    e.titleConcepts = concepts(job.title);
    e.focus = ['experimentation', 'growth', 'cro', 'monetization', 'genai', 'ai', 'marketplace', 'b2b', 'ecommerce', 'retention', 'gaming', 'fintech', 'edtech', 'platform', 'mobile'].filter((id) => e.titleConcepts[id] || (e.concepts[id] && e.concepts[id].tf >= (id === 'ai' || id === 'growth' ? 3 : 2)));
    e.hasDescription = (job.description || '').length > 400;
    return e;
  }

  /* ---------- 3. Reading a CV ---------- */
  function buildProfile(text, extra) {
    const t = norm(text);
    const p = Object.assign({ name: '', headline: '', linkedin: '', text: String(text || ''), custom: true }, extra || {});
    p.concepts = concepts(text);
    const spans = [...t.matchAll(/((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now|actualidad)/g)];
    let first = 9999;
    const nowY = new Date().getFullYear();
    for (const m of spans) {
      const y = Number(m[1]);
      if (y >= 1980 && y <= nowY) first = Math.min(first, y);
    }
    const stated = t.match(/(\d{1,2})\s*\+?\s*years/);
    p.years = p.years || (stated ? Number(stated[1]) : first < 9999 ? nowY - first : 5);
    p.level = p.level || (/\b(head of|director|vp)\b/.test(t.slice(0, 600)) ? 6 : /\b(principal|staff)\b/.test(t.slice(0, 600)) ? 4 : /\blead\b/.test(t.slice(0, 400)) ? 3.5 : /\bsenior\b/.test(t.slice(0, 900)) ? 3 : p.years >= 6 ? 3 : 2);
    if (!p.languages) {
      p.languages = {};
      const seg = t.match(/languages?[^a-z]{0,6}([^\n]{0,200})/);
      for (const [lang, re] of Object.entries(LANGS)) {
        const m = (seg ? seg[1] : '').match(new RegExp('(' + re.source + ')[^,;.]{0,40}'));
        if (m) p.languages[lang] = /basic|elementary|beginner|a1|a2|limited/.test(m[0]) ? 'basic' : /native|bilingual|fluent|full professional|c1|c2/.test(m[0]) ? 'fluent' : 'working';
      }
      if (!Object.keys(p.languages).length) p.languages.english = 'fluent';
    }
    p.focus = p.focus || Object.entries(p.concepts).filter(([id, v]) => LEX[id].w >= 2 && v.tf >= 2 && ['growth', 'ai', 'domain'].includes(LEX[id].group)).sort((a, b) => b[1].tf - a[1].tf).slice(0, 8).map(([id]) => id);
    return p;
  }

  /* ---------- 4. Matching ---------- */
  const levelFit = (jobLevel, myLevel) => {
    const d = jobLevel - myLevel;
    if (d === 0) return 1;
    if (d > 0) return d <= 0.5 ? 0.95 : d <= 1 ? 0.75 : d <= 2 ? 0.5 : 0.2;
    return d >= -1 ? 0.5 : d >= -2 ? 0.15 : 0.05;
  };

  function coverage(jobConcepts, profConcepts, titleConcepts) {
    let total = 0, got = 0;
    const matched = [], missing = [];
    for (const [id, v] of Object.entries(jobConcepts)) {
      const c = LEX[id];
      const w = c.w * (1 + Math.log(1 + v.tf)) * (titleConcepts && titleConcepts[id] ? 1.6 : 1);
      total += w;
      const mine = profConcepts[id];
      const item = { id, label: c.label, weight: w, jobPhrase: v.phrase, cvPhrase: mine ? mine.phrase : null };
      if (mine) { got += w; matched.push(item); } else missing.push(item);
    }
    matched.sort((a, b) => b.weight - a.weight);
    missing.sort((a, b) => b.weight - a.weight);
    return { ratio: total ? got / total : 0, matched, missing };
  }

  function knockouts(e, profile) {
    const out = [];
    for (const l of e.languages) {
      const have = (profile.languages || {})[l.lang];
      if (have === 'fluent' || have === 'working') continue;
      if (l.lang === 'english') continue;
      const name = l.lang[0].toUpperCase() + l.lang.slice(1);
      if (l.level === 'required') out.push({ lang: l.lang, severity: 'hard', text: name + ' required' + (have ? ' (yours: ' + have + ')' : '') });
      else if (l.level === 'posting') out.push({ lang: l.lang, severity: 'hard', text: 'Posting written in ' + name });
      else if (l.level === 'mentioned') out.push({ lang: l.lang, severity: 'soft', text: name + ' mentioned' });
      else out.push({ lang: l.lang, severity: 'info', text: name + ' is a plus' });
    }
    return out;
  }

  /** ATS proxy from the earlier 30-posting validation: 70 x coverage + level + years + format - knockouts. */
  function atsScore(cov, e, profile, kos) {
    const level = e.seniority === 'senior' ? 10 : e.seniority === 'lead' ? 8 : ['principal', 'group'].includes(e.seniority) ? 6 : e.seniority === 'director' ? 3 : e.seniority === 'mid' ? 8 : 2;
    const need = e.yearsRequired || 5;
    const years = profile.years >= need ? (need <= 6 ? 10 : need <= 10 ? 7 : 4) : profile.years >= need - 2 ? 5 : 1;
    let pen = 0;
    for (const k of kos) pen += k.severity === 'hard' ? (k.lang === 'spanish' ? 15 : 20) : k.severity === 'soft' ? 3 : 0;
    return Math.round(clamp(70 * cov + level + years + 10 - pen));
  }

  function freshness(postedAt, now) {
    if (!postedAt) return { score: 30, days: null };
    const days = Math.max(0, ((now || Date.now()) - new Date(postedAt).getTime()) / 864e5);
    return { score: Math.round(100 * Math.exp(-days / 12)), days: Math.floor(days) };
  }

  function score(job, profile, opts) {
    const e = job.e || (job.e = enrich(job));
    const cov = coverage(e.concepts, profile.concepts, e.titleConcepts);
    const kos = knockouts(e, profile);
    const hard = kos.some((k) => k.severity === 'hard');

    const pf = new Set(profile.focus || []);
    const titleHits = Object.keys(e.titleConcepts).filter((id) => pf.has(id)).length;
    let role = { pm: 0.72, cro: 0.9, growth: 0.6, owner: 0.5, other: 0.12 }[e.family];
    if (e.family !== 'other') role = Math.min(1, role + 0.14 * titleHits);
    if (e.techPM && !pf.has('platform')) role *= 0.8;
    if (e.adjacent) role *= 0.55;
    // How much of what makes this posting specific does the CV actually have?
    const SPECIAL = { growth: 1, ai: 1, domain: 1 };
    let spTot = 0, spGot = 0;
    for (const m of cov.matched) if (SPECIAL[LEX[m.id].group]) { spTot += m.weight; spGot += m.weight * (pf.has(m.id) ? 1 : 0.6); }
    for (const m of cov.missing) if (SPECIAL[LEX[m.id].group]) spTot += m.weight;
    const special = spTot > 2 ? spGot / spTot : 0.45;
    const foreignTitle = Object.keys(e.titleConcepts).some((id) => LEX[id].group === 'domain' && LEX[id].w >= 2 && !profile.concepts[id]);
    if (foreignTitle) role *= 0.7;
    const lvl = levelFit(e.level, profile.level);
    const yrs = !e.yearsRequired ? 0.85 : profile.years >= e.yearsRequired ? 1 : clamp(1 - (e.yearsRequired - profile.years) * 0.2, 0.2, 1);
    const covPart = e.hasDescription ? Math.pow(cov.ratio, 1.6) : 0.4;

    let fit = 100 * (0.26 * covPart + 0.3 * (e.hasDescription ? special : 0.45) + 0.22 * role + 0.16 * lvl + 0.06 * yrs);
    fit = clamp(fit);
    if (hard) fit *= 0.62;
    if (e.family === 'other') fit = Math.min(fit, 25);
    fit = Math.round(fit);

    const fr = freshness(job.postedAt, opts && opts.now);
    const s = e.salary;
    const payRef = s ? s.eurMax && s.eurMin ? (s.eurMin + s.eurMax) / 2 : s.eurMax || s.eurMin : null;
    const pay = payRef ? Math.round(clamp(((payRef - 45000) / 85000) * 100)) : null;
    const modeScore = e.workMode === 'remote' ? (e.remoteScope === 'Other region' ? 20 : 100) : e.workMode === 'hybrid' ? (e.officeDays ? clamp(80 - e.officeDays * 8, 40, 76) : 62) : e.workMode === 'onsite' ? 25 : 40;

    const reasons = [];
    if (cov.matched.length) reasons.push('Asks for ' + cov.matched.slice(0, 3).map((m) => m.label).join(', ') + ', all in your CV');
    if (titleHits) reasons.push('Title is in your core focus');
    if (lvl >= 0.95) reasons.push('Right level');
    else if (e.level > profile.level) reasons.push('A step up in level (' + e.seniority + ')');
    else reasons.push('Below your level (' + e.seniority + ')');
    if (cov.missing.length) reasons.push('Gap: ' + cov.missing.slice(0, 2).map((m) => m.label).join(', '));

    return {
      fit, ats: e.hasDescription ? atsScore(cov.ratio, e, profile, kos) : null, coverage: Math.round(cov.ratio * 100), matched: cov.matched, missing: cov.missing,
      knockouts: kos, hardKnockout: hard, reasons,
      sub: { fit, mode: modeScore, fresh: fr.score, pay, flex: e.flexScore, benefits: e.benefitScore },
      days: fr.days, payRef,
    };
  }

  const DEFAULT_WEIGHTS = { fit: 40, mode: 20, fresh: 14, pay: 10, flex: 9, benefits: 7 };
  function overall(sub, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    let tot = 0, acc = 0;
    for (const k of Object.keys(w)) {
      const v = sub[k] == null ? (k === 'pay' ? 38 : 40) : sub[k]; // undisclosed pay counts as slightly below average, never as zero
      acc += w[k] * v;
      tot += w[k];
    }
    return tot ? Math.round(acc / tot) : 0;
  }

  /* ---------- 5. Tailoring: same facts, different angle ---------- */
  function relevance(text, jobWeights, variantOf) {
    const cs = concepts(text);
    let s = 0;
    for (const id of Object.keys(cs)) if (jobWeights[id]) s += jobWeights[id];
    return s;
  }

  // The only wording swaps the tool makes on its own: exact synonyms for a skill the CV already shows.
  const SAFE_MIRROR = {
    experimentation: /^(experimentation|a\/b testing|ab testing)$/, cro: /^(conversion rate optimi[sz]ation|cro|conversion optimi[sz]ation)$/,
    genai: /^(generative ai|genai|gen ai)$/, data: /^(data-driven|data driven|analytics)$/, stakeholders: /^(stakeholder management|stakeholders)$/,
    crossfunctional: /^cross[- ]functional$/, metrics: /^(kpis?|success metrics|metrics)$/, funnel: /^funnel analysis$/, monetization: /^moneti[sz]ation$/,
    pm: /^product management$/, strategy: /^product strategy$/, roadmap: /^(roadmaps?|roadmapping)$/, discovery: /^discovery$/, b2b: /^(b2b|saas)$/,
    marketplace: /^marketplaces?$/, prioritization: /^prioriti[sz]ation$/, delivery: /^(end-to-end|go-to-market)$/, ecommerce: /^(e-commerce|ecommerce)$/,
    ux: /^(ux|user experience)$/, evals: /^(model evaluation|evals)$/, retention: /^retention$/, revenue: /^revenue$/,
  };
  const MIRROR_CASE = { cro: 'CRO', kpis: 'KPIs', kpi: 'KPIs', b2b: 'B2B', saas: 'SaaS', ux: 'UX', genai: 'GenAI', 'gen ai': 'Gen AI', 'generative ai': 'Generative AI', 'a/b testing': 'A/B testing', 'ab testing': 'AB testing' };

  function tailor(job, profile) {
    const e = job.e || (job.e = enrich(job));
    const before = score(job, profile);
    const jw = {};
    for (const m of before.matched.concat(before.missing)) jw[m.id] = m.weight;
    const changes = [];
    const cv = profile.cv;
    if (!cv) return tailorPlain(job, profile, before, jw);

    const pick = (item) => {
      // choose the truthful phrasing of this fact that speaks most directly to the posting
      let best = { text: item.text, s: relevance(item.text, jw), base: true };
      for (const v of item.variants || []) {
        const s = relevance(v, jw);
        if (s > best.s * 1.08 + 0.5) best = { text: v, s, base: false };
      }
      return best;
    };

    const topLabels = before.matched.filter((m) => ['growth', 'ai', 'domain'].includes(LEX[m.id].group) || ['experimentation', 'cro'].includes(m.id)).slice(0, 3).map((m) => (cv.headlineTerms && cv.headlineTerms[m.id]) || m.label);
    const headline = cv.title + (topLabels.length ? ' · ' + topLabels.join(' · ') : '');
    if (headline !== cv.headline) changes.push({ type: 'headline', text: 'Headline now leads with what this posting weighs most: ' + topLabels.join(', ') + '.' });

    const sums = cv.summary.map((s) => ({ s, r: relevance(s.text, jw) + (s.always ? 1e6 : 0) }));
    const lead = sums.filter((x) => x.s.always);
    const rest = sums.filter((x) => !x.s.always).sort((a, b) => b.r - a.r).slice(0, cv.summaryMax || 3);
    const summary = lead.concat(rest).map((x) => x.s.text).join(' ');
    if (rest.length && rest[0].s !== cv.summary.filter((s) => !s.always)[0]) changes.push({ type: 'summary', text: 'Summary re-ordered so the most relevant proof comes first.' });

    const roles = cv.roles.map((r) => {
      const scored = r.bullets.map((b, i) => Object.assign(pick(b), { i }));
      const order = scored.slice().sort((a, b) => b.s - 0.7 * b.i - (a.s - 0.7 * a.i) || a.i - b.i);
      const keep = order.slice(0, r.max || order.length);
      const moved = keep.length > 1 && keep[0].i !== 0;
      if (moved) changes.push({ type: 'order', text: r.company + ': moved up "' + keep[0].text.split(/[.,]/)[0].slice(0, 70) + '…"' });
      const re = keep.filter((k) => !k.base).length;
      if (re) changes.push({ type: 'angle', text: r.company + ': ' + re + ' bullet' + (re > 1 ? 's' : '') + ' told from the angle this posting cares about. Same facts, same numbers.' });
      if (order.length > keep.length) changes.push({ type: 'trim', text: r.company + ': left out ' + (order.length - keep.length) + ' less relevant bullet' + (order.length - keep.length > 1 ? 's' : '') + ' to keep it to two pages.' });
      return { company: r.company, title: r.title, dates: r.dates, place: r.place, note: r.note, bullets: keep.map((k) => k.text) };
    });

    // skills: posting's own wording first, but only for things the CV already claims
    const skillScored = cv.skills.map((s, i) => ({ s, i, r: relevance(s, jw) })).sort((a, b) => b.r - a.r || a.i - b.i);
    const skills = skillScored.map((x) => x.s);
    const mirrored = [];
    const have = norm(skills.join(' | ') + ' ' + summary + ' ' + roles.map((r) => r.bullets.join(' ')).join(' '));
    for (const m of before.matched.slice(0, 14)) {
      const phrase = m.jobPhrase;
      if (!phrase || have.includes(phrase) || !SAFE_MIRROR[m.id] || !SAFE_MIRROR[m.id].test(phrase)) continue;
      if ((cv.neverMirror || []).some((re) => re.test(phrase))) continue;
      mirrored.push(MIRROR_CASE[phrase] || phrase[0].toUpperCase() + phrase.slice(1));
    }
    if (mirrored.length) {
      skills.splice(Math.min(3, skills.length), 0, ...mirrored.slice(0, 6));
      changes.push({ type: 'wording', text: 'Added the posting\'s own wording for skills you already show: ' + mirrored.slice(0, 6).join(', ') + '.' });
    }
    if (skillScored[0] && skillScored[0].i !== 0) changes.push({ type: 'skills', text: 'Skills re-ordered: most relevant first.' });

    const out = { name: cv.name, headline, contact: cv.contact, summary, roles, earlier: cv.earlier, skills, tools: cv.tools, certifications: cv.certifications, education: cv.education, languages: cv.languagesLine };
    const textOut = renderText(out);
    const after = score(job, Object.assign({}, profile, { concepts: concepts(textOut) }));
    return {
      cv: out, text: textOut, markdown: renderMarkdown(out), changes,
      before: { ats: before.ats, coverage: before.coverage }, after: { ats: before.ats == null ? null : Math.max(after.ats, before.ats), coverage: Math.max(after.coverage, before.coverage) },
      notAdded: after.missing.slice(0, 12), matched: after.matched,
      guard: factGuard(profile.text + ' ' + JSON.stringify(cv), textOut),
    };
  }

  // For pasted or uploaded CVs there is no structured fact bank, so only re-order what is already there.
  function tailorPlain(job, profile, before, jw) {
    const lines = profile.text.split(/\n/);
    const blocks = [];
    let cur = null;
    for (const ln of lines) {
      const isBullet = /^\s*(?:[-•·*▪◦]|\d+\.)\s+/.test(ln);
      if (isBullet) {
        if (!cur) blocks.push((cur = { bullets: [] }));
        cur.bullets.push(ln);
      } else {
        cur = null;
        blocks.push({ line: ln });
      }
    }
    let moved = 0;
    const text = blocks.map((b) => {
      if (!b.bullets) return b.line;
      const sorted = b.bullets.map((t, i) => ({ t, i, r: relevance(t, jw) })).sort((a, c) => c.r - a.r || a.i - c.i);
      if (sorted[0].i !== 0) moved++;
      return sorted.map((x) => x.t).join('\n');
    }).join('\n');
    const changes = [];
    if (moved) changes.push({ type: 'order', text: 'Re-ordered bullets in ' + moved + ' section' + (moved > 1 ? 's' : '') + ' so the most relevant proof comes first. No wording changed.' });
    const mirror = before.matched.filter((m) => m.jobPhrase && m.cvPhrase && m.jobPhrase !== m.cvPhrase && !norm(profile.text).includes(m.jobPhrase)).slice(0, 8);
    if (mirror.length) changes.push({ type: 'wording', text: 'Worth mirroring by hand, because you already claim the skill: ' + mirror.map((m) => '"' + m.cvPhrase + '" → "' + m.jobPhrase + '"').join(', ') + '.' });
    return { cv: null, text, markdown: text, changes, before: { ats: before.ats, coverage: before.coverage }, after: { ats: before.ats, coverage: before.coverage }, notAdded: before.missing.slice(0, 12), matched: before.matched, guard: { ok: true, issues: [] } };
  }

  function renderText(c) {
    const L = [c.name, c.headline, c.contact, '', 'SUMMARY', c.summary, '', 'EXPERIENCE'];
    for (const r of c.roles) {
      L.push('', r.company + ' | ' + r.title, r.dates + ' | ' + r.place + (r.note ? ' (' + r.note + ')' : ''));
      for (const b of r.bullets) L.push('- ' + b);
    }
    if (c.earlier) L.push('', 'Earlier career', c.earlier);
    L.push('', 'SKILLS', c.skills.join(', ') + '.');
    if (c.tools) L.push('Tools: ' + c.tools);
    if (c.certifications) L.push('', 'CERTIFICATIONS', c.certifications);
    if (c.education) L.push('', 'EDUCATION', c.education);
    if (c.languages) L.push('', 'LANGUAGES', c.languages);
    return L.join('\n');
  }
  function renderMarkdown(c) {
    const L = ['# ' + c.name, '**' + c.headline + '**', '', c.contact, '', '## Summary', c.summary, '', '## Experience'];
    for (const r of c.roles) {
      L.push('', '### ' + r.company + ' — ' + r.title, '_' + r.dates + ' · ' + r.place + (r.note ? ' (' + r.note + ')' : '') + '_');
      for (const b of r.bullets) L.push('- ' + b);
    }
    if (c.earlier) L.push('', '### Earlier career', c.earlier);
    L.push('', '## Skills', c.skills.join(', ') + '.');
    if (c.tools) L.push('', 'Tools: ' + c.tools);
    if (c.certifications) L.push('', '## Certifications', c.certifications);
    if (c.education) L.push('', '## Education', c.education);
    if (c.languages) L.push('', '## Languages', c.languages);
    return L.join('\n');
  }

  /** Every number and every capitalised name in the output must already exist in the source CV. */
  function factGuard(source, output) {
    const src = norm(source);
    const issues = [];
    const nums = String(output).match(/\d+(?:[.,]\d+)?\s?(?:%|x|k|m|\+)?/gi) || [];
    for (const n of new Set(nums.map((x) => x.trim()))) {
      const core = n.replace(/[^\d.,]/g, '');
      if (core.length && !new RegExp('(?<![\\d.,])' + esc(core) + '(?![\\d])').test(src)) issues.push({ kind: 'number', value: n });
    }
    const names = String(output).match(/(?<![.!?]\s)(?<!^)(?<!\n)(?<!- )\b[A-Z][a-zA-Z0-9&]+(?:\s[A-Z][a-zA-Z0-9&]+)*/g) || [];
    for (const n of new Set(names)) {
      if (n.length < 3) continue;
      if (!src.includes(norm(n))) issues.push({ kind: 'name', value: n });
    }
    return { ok: !issues.length, issues };
  }

  const api = { LEXICON, LEX, norm, concepts, enrich, parseMoney, buildProfile, score, overall, tailor, factGuard, freshness, renderText, renderMarkdown, DEFAULT_WEIGHTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JR = Object.assign(root.JR || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
