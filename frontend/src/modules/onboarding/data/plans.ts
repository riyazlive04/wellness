export interface Plan {
  id: 'starter' | 'pro' | 'scale' | 'enterprise';
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
    id: 'starter',
    name: 'Starter',
    price: '999',
    pricePaise: 99_900,
    tagline: 'Solo practitioner getting started',
    highlights: ['Up to 25 clients', '1,000 AI calls / month', 'Voice AI included'],
    features: {
      clients: 'Up to 25',
      aiCalls: '1,000 / month',
      team: '1 seat',
      voiceAI: true,
      visionAI: false,
      automation: 'basic',
      analytics: 'basic',
      whitelabel: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '1,999',
    pricePaise: 199_900,
    tagline: 'Established solo practice',
    popular: true,
    highlights: ['Up to 100 clients', '5,000 AI calls / month', 'Voice + Vision AI', 'Team of 3'],
    features: {
      clients: 'Up to 100',
      aiCalls: '5,000 / month',
      team: '3 seats',
      voiceAI: true,
      visionAI: true,
      automation: 'full',
      analytics: 'advanced',
      whitelabel: false,
    },
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '2,999',
    pricePaise: 299_900,
    tagline: 'Small clinic with a team',
    highlights: ['Up to 300 clients', '15,000 AI calls / month', 'Custom workflows', 'Team of 10'],
    features: {
      clients: 'Up to 300',
      aiCalls: '15,000 / month',
      team: '10 seats',
      voiceAI: true,
      visionAI: true,
      automation: 'full+',
      analytics: 'advanced',
      whitelabel: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '3,999',
    pricePaise: 399_900,
    tagline: 'Multi-coach clinic',
    highlights: [
      'Unlimited clients',
      '50,000 AI calls / month',
      'White-label invoices',
      'Priority AI compute',
    ],
    features: {
      clients: 'Unlimited',
      aiCalls: '50,000 / month',
      team: 'Unlimited',
      voiceAI: true,
      visionAI: true,
      automation: 'full+',
      analytics: 'full',
      whitelabel: true,
    },
  },
];
