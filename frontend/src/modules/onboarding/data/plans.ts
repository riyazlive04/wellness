export interface Plan {
  id: 'basic' | 'pro' | 'elite';
  name: string;
  price: string;            // formatted: '999'
  pricePaise: number;       // canonical: 99900
  tagline: string;
  popular?: boolean;
  highlights: string[];
  features: {
    clients: string;
    aiCalls: string;
    team: string;
    voiceAI: boolean;
    visionAI: boolean;
    automation: 'basic' | 'full' | 'full+';
    analytics: 'basic' | 'advanced' | 'full';
    whitelabel: boolean;
  };
}

export const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: '5,000',
    pricePaise: 500_000,
    tagline: 'Solo practitioner getting started',
    highlights: ['Up to 50 clients', '3,000 AI calls / month', 'Voice + Vision AI', 'Team of 3'],
    features: {
      clients: 'Up to 50',
      aiCalls: '3,000 / month',
      team: '3 seats',
      voiceAI: true,
      visionAI: true,
      automation: 'basic',
      analytics: 'basic',
      whitelabel: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '10,000',
    pricePaise: 1_000_000,
    tagline: 'Established practice with a team',
    popular: true,
    highlights: ['Up to 150 clients', '12,000 AI calls / month', 'Custom workflows', 'Team of 8'],
    features: {
      clients: 'Up to 150',
      aiCalls: '12,000 / month',
      team: '8 seats',
      voiceAI: true,
      visionAI: true,
      automation: 'full',
      analytics: 'advanced',
      whitelabel: false,
    },
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '15,000',
    pricePaise: 1_500_000,
    tagline: 'Multi-coach clinic at scale',
    highlights: [
      'Unlimited clients',
      '40,000 AI calls / month',
      'White-label invoices & portal',
      'Priority AI compute',
    ],
    features: {
      clients: 'Unlimited',
      aiCalls: '40,000 / month',
      team: 'Unlimited',
      voiceAI: true,
      visionAI: true,
      automation: 'full+',
      analytics: 'full',
      whitelabel: true,
    },
  },
];
