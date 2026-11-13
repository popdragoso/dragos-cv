/* Default profile: Dragos Pop. Every line below is taken from his public CV (cv.md in this repository).
   "variants" re-tell the same fact from another angle. They never add a number, a name, a tool or a claim
   that is not in the base CV. If you edit the CV, edit it here too. */
(function (root) {
  'use strict';
  const JR = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.JR;

  const cv = {
    name: 'Dragos Pop',
    title: 'Senior Product Manager',
    headline: 'Senior Product Manager · Experimentation · Growth · GenAI product',
    contact: 'Barcelona, Spain · linkedin.com/in/dragospopthecropm · popdragoso.github.io/dragos-cv',
    headlineTerms: { experimentation: 'Experimentation', cro: 'Conversion (CRO)', growth: 'Growth', monetization: 'Monetization', genai: 'GenAI product', ai: 'AI product', marketplace: 'Marketplaces', b2b: 'B2B SaaS', funnel: 'Funnel optimization', retention: 'Retention', ecommerce: 'E-commerce', evals: 'AI evaluation', acquisition: 'Acquisition', activation: 'Activation', engagement: 'Engagement', revenue: 'Revenue growth', content: 'Content products', global: 'International products' },
    summaryMax: 3,
    summary: [
      { always: true, text: 'Senior Product Manager, 10+ years in digital growth, five of them in product.' },
      { text: 'At Gartner Digital Markets I owned the conversion and monetization funnels across Capterra, Software Advice and GetApp (2.5M monthly sessions), took landing-page testing from 1% of traffic to about 50% and testing capacity up 3-4x.' },
      { text: 'At G2 I took Content Studio from a 10-partner beta to a self-serve GenAI product, with weekly active users up 119% in the first quarter and defects down from 41% to under 10%.' },
      { text: 'Started in agency optimization at iProspect (Dentsu), Manchester.' },
    ],
    roles: [
      {
        company: 'G2', title: 'Senior Product Manager, Content Studio', dates: 'Feb 2026 – Oct 2026', place: 'Barcelona',
        bullets: [
          {
            text: 'Took over product and go-to-market for Content Studio and moved it from a 10-partner closed beta to a self-serve platform, with a 119% lift in weekly active users in the first quarter.',
            variants: [
              'Grew Content Studio from a 10-partner closed beta to a self-serve platform, owning product and go-to-market. Weekly active users rose 119% in the first quarter.',
              'Owned product and go-to-market for Content Studio, a self-serve GenAI product, taking it from a 10-partner closed beta to a self-serve platform with weekly active users up 119% in the first quarter.',
            ],
          },
          {
            text: 'Ran vendor interviews that led to the pivot from static assets to self-serve, prompt-driven generation. Shipped it, plus multi-level editing and regeneration for copy and aspect ratios on social platforms.',
            variants: [
              'Led product discovery through vendor interviews, which drove the pivot from static assets to self-serve, prompt-driven generation. Shipped it end to end, plus multi-level editing and regeneration for copy and aspect ratios on social platforms.',
            ],
          },
          {
            text: 'Started and championed the quality effort: a golden set and evaluation rubrics built with engineering. With the model change, generation time went from 10+ minutes to under 3 and defects from 41% to under 10%.',
            variants: [
              'Set the quality bar for AI-generated content: started the model evaluation effort, a golden set and evaluation rubrics built with engineering. With the model change, defects fell from 41% to under 10% and generation time from 10+ minutes to under 3.',
              'Defined how output quality was measured (a golden set and evaluation rubrics, built with engineering) and championed the effort. With the model change, the defect ratio went from 41% to under 10% and generation time from 10+ minutes to under 3.',
            ],
          },
          {
            text: 'Led the evaluation and migration across leading image-generation models. Ran the technical relationship with OpenAI (twice-weekly syncs) and shipped production changes through code review.',
            variants: [
              'Managed the vendor relationship with OpenAI (twice-weekly technical syncs), led the evaluation and migration across leading image-generation models, and shipped production changes through code review.',
            ],
          },
          {
            text: 'Set up funnel event tracking and behavioral cohorts in Amplitude. Presented bi-weekly to the Co-Founder, SVP of Product and GM of AI.',
            variants: [
              'Built the data foundation for product decisions: funnel event tracking and behavioral cohorts in Amplitude. Presented bi-weekly to the Co-Founder, SVP of Product and GM of AI.',
              'Reported bi-weekly to senior stakeholders (the Co-Founder, SVP of Product and GM of AI), backed by the funnel event tracking and behavioral cohorts I set up in Amplitude.',
            ],
          },
        ],
      },
      {
        company: 'Gartner Digital Markets', title: 'Senior CRO Product Manager', dates: 'Mar 2022 – Feb 2026', place: 'Barcelona', note: 'CRO Product Manager 2022–2024, Senior from 2024',
        bullets: [
          {
            text: 'Owned the conversion roadmap and monetization funnels (pay-per-click and pay-per-lead) across Capterra, Software Advice and GetApp. A single experiment lifted vendor conversion rate by up to 15.5%.',
            variants: [
              'Owned the roadmap for the monetization funnels (pay-per-click and pay-per-lead) of three B2B software marketplaces: Capterra, Software Advice and GetApp. A single experiment lifted vendor conversion rate by up to 15.5%.',
              'Owned growth of the conversion and monetization funnels (pay-per-click and pay-per-lead) across Capterra, Software Advice and GetApp, with a roadmap built on experimentation. A single A/B test lifted vendor conversion rate by up to 15.5%.',
            ],
          },
          {
            text: 'Took a risk-averse culture from testing on about 1% of traffic on the largest landing page, one test at a time, to about 50%, running 3-4 tests in parallel.',
            variants: [
              'Scaled experimentation in a risk-averse culture: from A/B testing on about 1% of traffic on the largest landing page, one test at a time, to about 50%, running 3-4 tests in parallel.',
            ],
          },
          {
            text: 'Took testing capacity up 3-4x by rewriting the experimentation methodology, building prioritization logic and adding a structured risk matrix.',
            variants: [
              'Rewrote the experimentation methodology, built the prioritization logic and added a structured risk matrix to weigh trade-offs, which took testing capacity up 3-4x.',
            ],
          },
          {
            text: 'Presented weekly to the Managing VP and VP of Growth. Led delivery across engineering, UX and analytics without direct reports.',
            variants: [
              'Managed senior stakeholders with a weekly readout to the Managing VP and VP of Growth, and led cross-functional delivery across engineering, UX and analytics without direct reports.',
            ],
          },
          {
            text: 'Created the team\'s first experiment QA framework (pre-flight checks, 1-hour post-launch verification, 24-hour regression reviews), used by multiple product teams.',
          },
          {
            text: 'Wrote the tool comparison report that drove Gartner\'s global move to a new A/B testing tool. Taught peers statistics, risk and experiment design; presented to executive leadership, including the Gartner CMO.',
            variants: [
              'Influenced a global decision: my tool comparison report drove Gartner\'s move to a new A/B testing tool. Taught peers statistics, risk and experiment design; presented to executive leadership, including the Gartner CMO.',
            ],
          },
        ],
      },
      {
        company: 'Festo', title: 'Conversion and UX Optimization', dates: 'Jan 2021 – Mar 2022', place: 'Barcelona',
        bullets: [
          {
            text: 'Owned the global experimentation roadmap, vendor tool stack and UX optimization strategy for Festo\'s international digital sales platform.',
            variants: ['Owned the experimentation roadmap, vendor tool stack and UX optimization strategy for Festo\'s international e-commerce platform (digital sales), across several countries.'],
          },
          { text: 'Got executive budget approved, then ran evaluation, procurement and onboarding of Hotjar and Kameleoon and rolled testing out across several countries.' },
          { text: 'Made A/B testing the mandatory validation step before engineering time was allocated.' },
        ],
      },
      {
        company: 'iProspect (Dentsu)', title: 'Optimisation Executive', dates: 'Oct 2018 – Dec 2020', place: 'Manchester',
        bullets: [
          { text: 'Ran optimization and UX strategy for 7+ enterprise clients and 20+ websites across insurance, automotive leasing and e-commerce.' },
          {
            text: 'Test wins of 10-15% incremental revenue. Funnel changes generated 3,000+ net new leads in 8 months and a 40% lift in checkout completion.',
            variants: ['Drove revenue growth through experimentation: test wins of 10-15% incremental revenue, 3,000+ net new leads in 8 months from funnel changes, and a 40% lift in checkout completion.'],
          },
        ],
      },
    ],
    earlier: '2014 – 2018 · Bucharest. Growth, partnership and sales roles at WebDigital, Omniconvert and others. Signed 50+ clients at WebDigital and co-founded Blue Alliance, a network of digital agencies.',
    skills: ['Experimentation and A/B testing', 'Experiment QA and prioritization', 'Growth and monetization', 'Funnel analysis', 'Product strategy and roadmaps', 'GenAI product (model evaluation, vendor management)', 'Stakeholder management', 'Product discovery', 'Success metrics', 'Retention', 'Marketplace growth', 'B2B SaaS'],
    tools: 'LaunchDarkly, Optimizely, Kameleoon, Amplitude, GA4, FullStory, Hotjar, ContentSquare, BrowserStack, Power BI, Jira, Confluence, Productboard, Coda, Claude.',
    certifications: 'Baymard Institute E-commerce UX · IBM Enterprise Design Thinking Practitioner · Marketing Analytics: Setting and Measuring KPIs · Conversion Rate Optimization.',
    education: 'BA in Journalism, Hyperion University of Bucharest (2009–2012).',
    languagesLine: 'English and Romanian (native), Spanish (basic).',
    // Terms he has not confirmed he can claim. The tool will list them as gaps, never write them in.
    neverMirror: [/execution/, /autonom/, /ai[- ](native|first|powered|driven|tools)/, /data scien/, /llm/, /sql/, /machine learning/, /agent/],
  };

  function baseCV() {
    return {
      name: cv.name, headline: cv.headline, contact: cv.contact,
      summary: cv.summary.map((s) => s.text).join(' '),
      roles: cv.roles.map((r) => ({ company: r.company, title: r.title, dates: r.dates, place: r.place, note: r.note, bullets: r.bullets.map((b) => b.text) })),
      earlier: cv.earlier, skills: cv.skills, tools: cv.tools, certifications: cv.certifications, education: cv.education, languages: cv.languagesLine,
    };
  }

  function defaultProfile() {
    const text = JR.renderText(baseCV());
    return JR.buildProfile(text, {
      name: cv.name, headline: cv.headline, linkedin: 'https://www.linkedin.com/in/dragospopthecropm',
      years: 10, level: 3, languages: { english: 'fluent', romanian: 'fluent', spanish: 'basic' },
      focus: ['experimentation', 'cro', 'growth', 'monetization', 'funnel', 'genai', 'ai', 'evals', 'marketplace', 'b2b', 'ecommerce', 'retention'],
      cv, custom: false, pastEmployers: ['Gartner', 'Capterra', 'G2', 'Festo', 'Dentsu'],
    });
  }

  const api = { defaultProfile, baseCV, DEFAULT_LINKEDIN: 'dragospopthecropm' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.JR, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
