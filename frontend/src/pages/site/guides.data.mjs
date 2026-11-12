/**
 * Search landing page copy, shared by the React page and the build-time
 * prerenderer.
 *
 * It lives in a .mjs data file rather than inside Guides.tsx because
 * scripts/prerender.mjs is plain Node and cannot import TSX. Keeping one copy
 * means a page can never render text that differs from the text Google is
 * served - which is exactly the kind of drift that is invisible until someone
 * screenshots a search result.
 */
export const GUIDES = [
  /* ── Buying intent ─────────────────────────────────────────────────────── */
  {
    slug: 'diet-chart-software',
    title: 'Diet Chart Software for Dietitians in India | NUSI',
    description:
      'Build a diet chart once and reuse it. NUSI is diet chart software for Indian dietitians: Indian foods with real portions, a client app, and plans you copy between clients. From ₹3,999/month.',
    h1: 'Diet chart software for Indian dietitians',
    intro:
      'Most dietitians still write diet charts in Word or Excel, then retype almost the same chart for the next client. NUSI replaces that with a plan you build once and reuse.',
    sections: [
      {
        heading: 'Build a chart once, reuse it',
        body: [
          'Build a week of meals once and reuse it for any client who needs the same approach. Copy a plan across and choose which weeks carry over, so a four-week plan does not have to be rebuilt for every person on it.',
          'Your own recipes and foods sit in one library, alongside an Indian food database with the portions people actually eat — a katori, a dosa, a roti, not only grams.',
          'Programs go further than a chart: multi-week structures with tasks, so a client knows what to do on day nine without messaging you to ask.',
        ],
      },
      {
        heading: 'The chart reaches the client',
        body: [
          'A diet chart in a PDF is a document. A chart in NUSI is something the client follows on their phone, in an app carrying your practice name on Android and iPhone.',
          'They log meals by photo or by search, and the nutrition is worked out for them. The plate scanner turns a photo of a plate into an estimated log that they can correct.',
          'Meal and water reminders arrive at the times you set, so the chart is in front of them at the moment it matters rather than in a file they opened once.',
        ],
      },
      {
        heading: 'You can see whether it is working',
        body: [
          'Every number a client records is plotted over time: weight, fasting glucose, post-meal readings, blood pressure. Thirty days of readings on one chart, not a number they half-remember during a call.',
          'A list shows which clients have gone quiet and stopped logging, while there is still time to call them.',
          'Reports export as a PDF the client keeps, or shows their doctor.',
        ],
      },
    ],
    faq: [
      {
        q: 'Can I import the diet charts I already have?',
        a: 'Yes. Importing your existing clients and plans is part of the one-time setup, which includes your branding and training.',
      },
      {
        q: 'Does it have Indian foods?',
        a: 'Yes — an Indian food database with household portions, plus your own recipes and foods in a library you control.',
      },
      {
        q: 'What does it cost?',
        a: 'Starter is ₹3,999 a month for a solo nutritionist, with 100 clients. GST is included in the price. Fourteen days free, and no card to begin.',
      },
    ],
  },
  {
    slug: 'nutrition-practice-management-software',
    title: 'Nutrition Practice Management Software in India | NUSI',
    description:
      'Run a nutrition practice on one subscription: meal plans, a branded client app, daily tracking, chat, appointments and GST billing. Built for Indian dietitians and clinics.',
    h1: 'Practice management software for nutrition practices',
    intro:
      'A nutrition practice usually runs on four or five tools that do not talk to each other: Word for plans, personal WhatsApp for clients, a diary for appointments, and a spreadsheet for money. NUSI is one subscription that covers all of it.',
    sections: [
      {
        heading: 'What a practice actually runs on',
        body: [
          'Planning — meal plans and multi-week programs, with your own recipe and food library.',
          'The client relationship — chat in one place attached to the client record, instead of conversations lost in your personal WhatsApp among family messages.',
          'Appointments — clients book inside the working hours you set. Video consultations are included from the Growth plan.',
          'Money — subscriptions, invoices and GST handled through Razorpay, including part-payments and EMI where a client needs them.',
          'Your team — nutritionists and assistants each get their own login and their own level of access.',
        ],
      },
      {
        heading: 'Why practices move',
        body: [
          'Diet charts retyped for every client become a plan you build once and copy across.',
          'Client questions scattered through a personal phone become conversations attached to the client, which anyone on your team can pick up.',
          'Clients who quietly stop logging and then quietly stop paying appear on a list while you can still call them.',
          'Invoices chased by memory become a ledger that tracks what was paid, what is part-paid, and what is due.',
        ],
      },
      {
        heading: 'Built for Indian practices',
        body: [
          'GST is included in the price shown, not added at checkout, and invoices are issued the way an Indian practice needs them.',
          'Payments run through Razorpay, so clients pay by UPI, card or net banking the way they already pay for everything else.',
          'The food database carries Indian foods in the portions people use, and the client app works in English and Tamil.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is this only for solo nutritionists?',
        a: 'No. Starter suits a solo practice, Growth adds up to five team members and video consultations, and Scale Pro covers clinics with unlimited clients, multi-branch and white-label.',
      },
      {
        q: 'Do my clients need to pay for the app?',
        a: 'No. The client app is part of your subscription, and it carries your practice name rather than ours.',
      },
      {
        q: 'How long does it take to move across?',
        a: 'Setup includes importing your existing clients, applying your branding and training you on it. You have fourteen days free to try it before paying anything.',
      },
    ],
  },
  {
    slug: 'client-management-software-for-nutritionists',
    title: 'Client Management Software for Nutritionists | NUSI',
    description:
      'Keep every client in one place: plans, chat, daily logs, progress charts, appointments and payments. Client management software for nutritionists and dietitians in India.',
    h1: 'Client management for nutritionists',
    intro:
      'The hard part of a nutrition practice is not writing the plan. It is knowing, for fifty clients at once, who is following it, who has gone quiet, and who is about to leave.',
    sections: [
      {
        heading: 'Everything about a client in one place',
        body: [
          'One record holds their plan, their daily logs, their measurements, your conversations, their appointments and their payments. You do not reconstruct a client from four apps before a call.',
          'Your team sees the same record. An assistant can answer a question without asking you what was agreed last month.',
          'Progress photos sit alongside weight over time — front, side and back, so change that a number misses is visible.',
        ],
      },
      {
        heading: 'Knowing who needs you',
        body: [
          'A list shows clients who have stopped logging. Most clients do not announce that they are leaving; they go quiet first, and this is the window where a call still works.',
          'You choose what each client records daily — blood sugar, sleep, water, anything — and the answers arrive without you asking each time.',
          'Charts plot every recorded number over time, so a review is based on thirty days of readings rather than what the client recalls in the moment.',
        ],
      },
      {
        heading: 'The admin that surrounds it',
        body: [
          'Appointments are booked by clients inside hours you set, so scheduling stops being a conversation.',
          'Invoices, subscriptions, part-payments and EMI are tracked against the client, with GST handled.',
          'Reminders reach the client on their phone at the times you choose.',
        ],
      },
    ],
    faq: [
      {
        q: 'How many clients can I manage?',
        a: 'A hundred on Starter, five hundred on Growth, and unlimited on Scale Pro.',
      },
      {
        q: 'Can my assistant have their own login?',
        a: 'Yes, from the Growth plan, with their own level of access. Scale Pro has unlimited team members.',
      },
    ],
  },

  /* ── Comparison intent ─────────────────────────────────────────────────── */
  {
    slug: 'practice-better-alternative-india',
    title: 'A Practice Better Alternative for Indian Nutritionists | NUSI',
    description:
      'Looking for a Practice Better alternative in India? NUSI is built for Indian practices: pricing in rupees with GST, Razorpay payments, Indian foods, and a client app in your own name.',
    h1: 'A Practice Better alternative built for India',
    intro:
      'Practice Better is a capable product. It is also priced in US dollars, billed through tools Indian clients do not use, and built around a food database that does not know what a katori is. If that is the friction you are feeling, this page is an honest comparison.',
    sections: [
      {
        heading: 'What actually differs',
        body: [
          'Pricing in rupees, with GST already included in the figure shown, and an invoice your accountant accepts. No currency conversion and no card markup each month.',
          'Payments run through Razorpay, so your clients pay by UPI, card or net banking — the way they already pay for everything else in India.',
          'An Indian food database with the portions people eat, so a plan reads in katoris and rotis rather than only in grams.',
          'The client app carries your practice name on Android and iPhone, and works in English and Tamil.',
        ],
      },
      {
        heading: 'Where we are honest about the gap',
        body: [
          'Practice Better has been built for longer and carries integrations we do not, particularly for the US healthcare market — insurance billing, US lab integrations and HIPAA-specific workflows. If you practise in North America, it is very likely the better fit.',
          'We do not have a decade of third-party integrations. What we have is one product that covers planning, the client app, tracking, chat, appointments and billing without add-ons.',
          'If you are in India and your current friction is dollar pricing, payment methods your clients do not use, and a food database built for another country, that is the gap NUSI was built to close.',
        ],
      },
      {
        heading: 'Moving across',
        body: [
          'Importing your existing clients is part of setup, along with your branding and training.',
          'Fourteen days free, with no card to begin, so you can run both in parallel before deciding.',
          'You can cancel from your billing page at any time and keep access to the end of the month you have paid for.',
        ],
      },
    ],
    faq: [
      {
        q: 'Can you import my data from Practice Better?',
        a: 'Client records, yes — importing your existing clients is part of the one-time setup. Talk to us about your export before you start, and we will tell you honestly what carries over.',
      },
      {
        q: 'How does the price compare?',
        a: 'NUSI starts at ₹3,999 a month with GST included and one-time setup charged with your first invoice. Compare that against your current plan converted to rupees, plus whatever your card charges for a foreign transaction.',
      },
    ],
  },
  {
    slug: 'nutrium-alternative-india',
    title: 'A Nutrium Alternative for Indian Dietitians | NUSI',
    description:
      'Looking for a Nutrium alternative in India? NUSI covers meal plans, a branded client app, daily tracking, appointments and GST billing, priced in rupees for Indian practices.',
    h1: 'A Nutrium alternative for Indian practices',
    intro:
      'Nutrium does meal planning well. What Indian dietitians tend to run into is everything around the plan: payments, GST, the food database, and whether a client in Chennai will actually use the app.',
    sections: [
      {
        heading: 'Beyond the meal plan',
        body: [
          'Billing is part of the product, not a separate tool: subscriptions, invoices, part-payments and EMI, with GST included in the price your client sees.',
          'Appointments are booked by clients inside your working hours, with video consultations included from the Growth plan.',
          'Chat sits against the client record, so conversations stop living in your personal WhatsApp.',
          'A list of clients who have gone quiet tells you who to call before they drift away.',
        ],
      },
      {
        heading: 'Built around Indian practice',
        body: [
          'Prices in rupees, GST included in the figure shown, and payments through Razorpay by UPI, card or net banking.',
          'Indian foods with household portions, plus your own recipe and food library.',
          'A client app in your practice name, on Android and iPhone, in English and Tamil.',
        ],
      },
      {
        heading: 'Where Nutrium may still suit you better',
        body: [
          'Nutrium is strong on European food databases and is available in more languages than we are. If most of your clients are outside India, that matters more than anything on this page.',
          'We are a younger product with fewer third-party integrations. We would rather say so than have you find out in month two.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is there a free trial?',
        a: 'Fourteen days, with no card needed to start.',
      },
      {
        q: 'Do I have to pay setup separately?',
        a: 'The one-time setup fee is charged with your first invoice, and covers account setup, your branding, importing your clients and training.',
      },
    ],
  },

  /* ── Problem-aware ─────────────────────────────────────────────────────── */
  {
    slug: 'how-to-manage-nutrition-clients-online',
    title: 'How to Manage Nutrition Clients Online | A Guide for Dietitians | NUSI',
    description:
      'A practical guide to running nutrition clients online: how to keep plans, conversations, daily logs and payments in one place, and how to spot a client who is about to leave.',
    h1: 'How to manage nutrition clients online',
    intro:
      'Most practices go online by adding tools: a video call app, a payment link, a WhatsApp group. It works at ten clients and quietly falls apart at fifty. This guide covers what actually has to be in place.',
    sections: [
      {
        heading: '1. Put the plan where the client lives',
        body: [
          'A plan emailed as a PDF is opened once. A plan on the client’s phone, with reminders at meal times, is followed.',
          'Whatever tool you use, the test is simple: at 1pm on a Tuesday, can the client see what they are meant to eat without going looking for it?',
          'Logging has to be easier than not logging. A photo of a plate takes five seconds; filling a form takes two minutes, and that difference decides whether you get any data at all.',
        ],
      },
      {
        heading: '2. Get the conversation out of your personal phone',
        body: [
          'Personal WhatsApp fails in three ways: you cannot hand a client to a colleague, you cannot find what was agreed three months ago, and you never stop working.',
          'Conversations should attach to the client record, so anyone on your team can pick one up and the history is still there next year.',
          'This matters more as you grow. One nutritionist can hold fifty clients in their head; a team of four cannot.',
        ],
      },
      {
        heading: '3. Measure something, consistently',
        body: [
          'Decide what each client records daily — weight, blood sugar, water, sleep, whatever fits their goal — and make it the same question every day so the answers are comparable.',
          'Plot it. A chart of thirty fasting glucose readings tells you something; a client saying "it has been okay" does not.',
          'Review against the chart, not against memory. It also shows the client their own progress, which is most of what keeps them paying.',
        ],
      },
      {
        heading: '4. Watch for silence, not complaints',
        body: [
          'Clients rarely say they are leaving. They stop logging, then stop replying, then stop paying — usually in that order, over about three weeks.',
          'The only reliable retention signal is logging activity. Track who has gone quiet and call them in the first week, not the third.',
          'A call at the right moment saves a client. An invoice reminder after they have gone does not.',
        ],
      },
      {
        heading: '5. Make paying you boring',
        body: [
          'Recurring payments should renew without you asking. Chasing payments by message is work that earns nothing and costs goodwill.',
          'Offer the payment methods Indian clients actually use — UPI, card, net banking — and allow part-payments or EMI for larger programs rather than losing the sale.',
          'Issue proper GST invoices from the start. Retrofitting that later is considerably more painful.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need separate tools for all of this?',
        a: 'You can stitch it together from four or five, and plenty of practices do. NUSI exists because that stitching stops working somewhere around fifty clients.',
      },
      {
        q: 'How many clients before this matters?',
        a: 'In practice, around thirty. Below that you can hold it in your head; above it, things start falling through.',
      },
    ],
  },
];
