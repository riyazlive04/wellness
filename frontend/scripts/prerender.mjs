/**
 * Build-time prerender for the marketing pages.
 *
 * The app is a client-rendered SPA: nginx serves one index.html for every URL,
 * so a crawler received 311 bytes with no body text and the same <title> on
 * every page. useDocumentHead sets the real title only after React mounts,
 * which is too late for a crawler or a WhatsApp/LinkedIn link preview.
 *
 * This writes a real HTML file per marketing route into dist/, each with its
 * own title, description, canonical, Open Graph tags, JSON-LD and — crucially —
 * the page's actual text inside #root. React hydrates over it on load, so
 * visitors see no difference; nginx's try_files finds the static file first and
 * only falls back to index.html for app routes.
 *
 * Content is written out here rather than server-rendering the React tree:
 * these pages are static copy, and running the whole app (auth, react-query,
 * realtime) through Node at build time would be far more fragile than keeping
 * the handful of marketing strings in one place. The trade-off is that this
 * file and the page components must be edited together — see README-seo.md.
 *
 * Run automatically after `vite build` (see package.json "build").
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] || 'dist');
const ORIGIN = 'https://nusi.in';
const OG_IMAGE = `${ORIGIN}/og-nusi.jpg`;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Each route's indexable content. Titles lead with what a nutritionist or
 * clinic actually types into Google ("practice management software for
 * nutritionists", "diet plan software India"), not with the brand — nobody is
 * searching "NUSI" yet.
 */
const PAGES = [
  {
    path: '/home',
    title: 'Practice Management Software for Nutritionists & Dietitians in India | NUSI',
    description:
      'NUSI is diet and nutrition practice management software for Indian dietitians and clinics. Meal plans, a branded client app, daily tracking, GST billing. From ₹3,999/month, 14 days free.',
    h1: 'Run your practice, not your admin.',
    intro:
      'Meal plans, a client app, daily tracking and billing — one subscription, built for the way a nutrition practice actually works. For nutritionists and dietitians in India.',
    sections: [
      ['Everything in one place, and all of it yours', [
        'Meal plans and programs — build a week once, reuse it, or copy it to another client and pick which weeks carry over.',
        'Client chat — every conversation in one place, attached to the client, not lost in your personal WhatsApp.',
        'Who has gone quiet — a list of clients who stopped logging, while there is still time to call them.',
        'Plate scanner — a client photographs a plate and NUSI estimates what is on it. They correct it if needed.',
        'Daily tasks — meal and water reminders at the times you set, on the client’s phone.',
        'Appointments — clients book inside your working hours. Video consultations included from Growth.',
      ]],
      ['Why nutrition practices move to NUSI', [
        'Diet charts retyped in Word for every client → build a plan once, reuse it, copy it across.',
        'Client questions mixed into your personal WhatsApp → conversations attached to the client record.',
        'No idea who has stopped following the plan → a list of who has gone quiet, before they leave.',
        'Chasing payments by message at month end → subscriptions and GST invoices run themselves.',
        'Notes in one app, weights in another, photos in a third → one record per client, everything in it.',
      ]],
      ['Getting started takes four steps', [
        'Brand it — your practice name, logo and colours. Clients see you, not us.',
        'Bring your clients in — import a list, or invite them one at a time. We help you do it.',
        'Plan once — build your meal plans and programs, and reuse them from then on.',
        'Go live — clients get the app, start logging, and you see it all in one place.',
      ]],
      ['Plans and pricing', [
        'Starter — ₹3,999 a month, for solo nutritionists: 100 clients, 1 user, 500 AI actions a month, 5 GB storage.',
        'Growth — ₹8,999 a month, for growing practices: 500 clients, 5 team members, 5,000 AI actions, video consultations.',
        'Scale Pro — ₹19,999 a month, for clinics and nutrition centres: unlimited clients, unlimited team, multi-branch, white-label.',
        'All prices include GST. Every plan starts with 14 days free and no card needed.',
      ]],
    ],
  },
  {
    path: '/features',
    title: 'Diet & Nutrition Software Features — Meal Plans, Client App, Billing | NUSI',
    description:
      'Everything a nutrition practice runs on: meal plans, programs, a branded client app for Android and iPhone, daily health tracking, charts, chat, appointments and GST billing.',
    h1: 'Everything your practice runs on.',
    intro: 'One subscription. No add-ons to buy before it does what you need.',
    sections: [
      ['Planning', [
        'Meal plans — build a week once and reuse it. Copy a plan to another client, pick which weeks to carry over.',
        'Programs — multi-week structures with tasks, so a client knows what to do on day nine without asking.',
        'Recipes and foods — your own library, plus an Indian food database with portions people actually use.',
      ]],
      ['The client app', [
        'Their own app — clients get a real app, in your practice name, on Android and iPhone.',
        'Food diary — meals logged by photo or search, with the nutrition worked out.',
        'Plate scanner — a photo of a plate becomes an estimated log, which the client can correct.',
        'Daily log — you choose the questions: blood sugar, sleep, water, anything, and they answer daily.',
        'Exercise — a photo and a few words after a walk or a gym session.',
        'Reminders — meal and water nudges at the times you set, on their phone.',
      ]],
      ['Keeping track', [
        'Charts over time — every number a client records, plotted. Fasting glucose over 30 days, not a guess.',
        'Who has gone quiet — a list of clients who stopped logging, before they stop paying.',
        'Progress photos — front, side and back over time, with weight alongside.',
        'Reports — a PDF a client can keep, or show their doctor.',
      ]],
      ['Running the practice', [
        'Client chat — conversations in one place instead of your personal WhatsApp.',
        'Appointments — clients book in your working hours. Video calls included from Growth.',
        'Payments — subscriptions, invoices and GST handled through Razorpay.',
        'Your team — add nutritionists and assistants, each with their own access.',
      ]],
    ],
  },
  {
    path: '/pricing',
    title: 'NUSI Pricing — Nutrition Practice Software from ₹3,999/month (GST incl.)',
    description:
      'NUSI plans for Indian nutrition practices: Starter ₹3,999, Growth ₹8,999, Scale Pro ₹19,999 a month, GST included. 14 days free, no card needed.',
    h1: 'One subscription. Your whole practice.',
    intro: 'Every plan starts with 14 days free, and no card to begin. Prices include GST.',
    sections: [
      ['Plans', [
        'Starter — ₹3,999 a month for solo nutritionists. 100 clients, 1 user, 500 AI actions a month, 5 GB storage. One-time ₹4,999 setup fee.',
        'Growth — ₹8,999 a month for growing practices. 500 clients, 5 team members, 5,000 AI actions, video consultations. One-time ₹9,999 setup fee.',
        'Scale Pro — ₹19,999 a month for clinics and nutrition centres. Unlimited clients, unlimited team, multi-branch, white-label. One-time ₹24,999 setup fee.',
      ]],
      ['Questions', [
        'Is there a free trial? Yes — 14 days, and we do not ask for a card to start.',
        'What is the setup fee for? One payment when you join, charged with your first invoice: account setup, your branding, importing your existing clients, and training.',
        'Can I change plan later? Yes, up or down, whenever. Moving up charges only the difference in the setup fee.',
        'Do prices include GST? Yes. The price you see is the price charged — 18% GST is already in it.',
        'Can I cancel? Any time, from your billing page. You keep access until the end of the month you have paid for.',
      ]],
    ],
  },
  {
    path: '/about',
    title: 'About NUSI — Nutrition Practice Software by Sirah Digital, Chennai',
    description:
      'NUSI is built by Sirah Digital in Chennai, with practising dietitians, for nutrition practices in India.',
    h1: 'About NUSI',
    intro:
      'NUSI is practice software for nutritionists and dietitians, built by Sirah Digital in Chennai, India, with practising dietitians.',
    sections: [],
  },
  {
    path: '/contact',
    title: 'Contact NUSI — Support for Nutrition Practice Software',
    description:
      'Email support@sirahdigital.in or call +91 97899 61631. NUSI is made by Sirah Digital, Pallavaram, Tamil Nadu.',
    h1: 'Contact us',
    intro: 'Email support@sirahdigital.in or call +91 97899 61631. Sirah Digital, Pallavaram, Tamil Nadu, India.',
    sections: [],
  },
  {
    path: '/terms',
    title: 'Terms of Service — NUSI',
    description: 'The terms on which Sirah Digital provides the NUSI practice software to nutrition professionals.',
    h1: 'Terms of Service',
    intro: 'The terms on which Sirah Digital provides the NUSI practice software to nutrition professionals.',
    sections: [],
    noindex: false,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — NUSI',
    description:
      'How Sirah Digital collects, uses and protects data in NUSI, including the health information nutritionists record about their clients.',
    h1: 'Privacy Policy',
    intro:
      'How Sirah Digital collects, uses and protects data in NUSI, including the health information nutritionists record about their clients.',
    sections: [],
  },
  {
    path: '/refunds',
    title: 'Refund and Cancellation Policy — NUSI',
    description: "NUSI's refund policy: a 7-day refund window on your first subscription payment, and how to cancel.",
    h1: 'Refund and Cancellation Policy',
    intro: 'A 7-day refund window on your first subscription payment, and how to cancel.',
    sections: [],
  },
  {
    // The booking funnel is also the site root, so it gets the strongest terms.
    path: '/booking-page',
    alsoAt: '/index.html',
    title: 'Nutrition Practice Management Software in India | Book a Demo | NUSI',
    description:
      'Book a free walkthrough of NUSI — diet and nutrition practice management software for dietitians and clinics in India. Meal plans, client app, daily tracking and GST billing from ₹3,999/month.',
    h1: 'Practice software for nutritionists in India',
    intro:
      'Book a free walkthrough of NUSI and see how Indian nutrition practices run meal plans, a branded client app, daily tracking and GST billing in one place. 14 days free, no card needed.',
    sections: [
      ['What you get', [
        'Meal plans and multi-week programs you build once and reuse.',
        'A client app in your own practice name, on Android and iPhone.',
        'Daily health tracking with the questions you choose, plotted over time.',
        'Chat, appointments and video consultations in one place.',
        'Subscriptions, GST invoices and payment reminders through Razorpay.',
      ]],
    ],
  },
];

/** Organization + SoftwareApplication, so search engines can show rich results. */
function jsonLd(page) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NUSI',
    url: ORIGIN,
    logo: `${ORIGIN}/nusi-logo.png`,
    email: 'support@sirahdigital.in',
    telephone: '+91-97899-61631',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Pallavaram',
      addressRegion: 'Tamil Nadu',
      addressCountry: 'IN',
    },
    parentOrganization: { '@type': 'Organization', name: 'Sirah Digital' },
  };
  const app = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'NUSI',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    description:
      'Practice management software for nutritionists, dietitians and nutrition clinics in India: meal plans, a branded client app, daily health tracking, appointments and GST billing.',
    url: ORIGIN,
    offers: [
      { '@type': 'Offer', name: 'Starter', price: '3999', priceCurrency: 'INR' },
      { '@type': 'Offer', name: 'Growth', price: '8999', priceCurrency: 'INR' },
      { '@type': 'Offer', name: 'Scale Pro', price: '19999', priceCurrency: 'INR' },
    ],
    areaServed: { '@type': 'Country', name: 'India' },
  };
  return [org, app].map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n    ');
}

/**
 * The crawlable copy. Hidden from sight (React replaces #root on mount, and
 * this would otherwise flash before hydration), but present in the HTML and
 * not hidden from crawlers by `display:none` on the element they read — it is
 * inside #root, which React takes over immediately.
 */
function body(page) {
  const parts = [`<h1>${esc(page.h1)}</h1>`, `<p>${esc(page.intro)}</p>`];
  for (const [heading, items] of page.sections ?? []) {
    parts.push(`<h2>${esc(heading)}</h2>`);
    parts.push(`<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);
  }
  parts.push(
    '<nav><a href="/home">Home</a> <a href="/features">Features</a> <a href="/pricing">Pricing</a> ' +
      '<a href="/about">About</a> <a href="/contact">Contact</a> <a href="/booking-page">Book a demo</a></nav>',
  );
  return parts.join('\n      ');
}

function render(shell, page) {
  const canonical = page.path === '/booking-page' ? ORIGIN + '/' : ORIGIN + page.path;
  let html = shell;

  // Replace the shell's single generic title/description with this page's own.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${esc(page.description)}" />`,
  );

  // The shell ships placeholder og:* tags pointing at via.placeholder.com.
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(page.title)}" />`);
  html = html.replace(
    /<meta property="og:description"[^>]*>/,
    `<meta property="og:description" content="${esc(page.description)}" />`,
  );
  html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${OG_IMAGE}" />`);
  html = html.replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${OG_IMAGE}" />`);

  const head = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:site_name" content="NUSI" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${page.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}" />`,
    jsonLd(page),
  ].join('\n    ');
  html = html.replace('</head>', `  ${head}\n  </head>`);

  // Seed #root so the HTML carries the page's text. main.tsx uses createRoot
  // (not hydrateRoot), so React discards this wholesale on mount — no
  // hydration mismatch is possible.
  //
  // Wrapped in an off-screen container rather than display:none: it never
  // flashes before React takes over, and visually-positioned text is treated
  // far less suspiciously by search engines than text hidden outright.
  const hidden = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><div data-prerender style="${hidden}">\n      ${body(page)}\n    </div></div>`,
  );
  return html;
}

const shellPath = join(DIST, 'index.html');
if (!existsSync(shellPath)) {
  console.error(`prerender: ${shellPath} not found — run vite build first.`);
  process.exit(1);
}
const shell = readFileSync(shellPath, 'utf8');

// Running twice over the same dist would treat an already-prerendered page as
// the shell, baking one page's text and canonical into every other page. The
// marker makes that a loud failure instead of silently wrong SEO.
if (shell.includes('data-prerender')) {
  console.error('prerender: dist/index.html is already prerendered — run `vite build` first.');
  process.exit(1);
}

let written = 0;
for (const page of PAGES) {
  const targets = [page.path === '/booking-page' ? 'index.html' : `${page.path.slice(1)}/index.html`];
  for (const t of targets) {
    const out = join(DIST, t);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, render(shell, page), 'utf8');
    written++;
  }
}

// Sitemap: the canonical URL of every indexable page.
const urls = PAGES.filter((p) => !p.noindex).map((p) =>
  p.path === '/booking-page' ? ORIGIN + '/' : ORIGIN + p.path,
);
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${u}</loc><lastmod>${today}</lastmod>` +
          `<priority>${u === ORIGIN + '/' ? '1.0' : '0.8'}</priority></url>`,
      )
      .join('\n') +
    `\n</urlset>\n`,
  'utf8',
);

writeFileSync(
  join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\n# The app itself is private and has nothing to index.\nDisallow: /auth\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /client\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
  'utf8',
);

console.log(`prerender: wrote ${written} pages, sitemap.xml (${urls.length} urls) and robots.txt`);
