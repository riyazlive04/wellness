export default {
  no: 13,
  slug: 'team',
  section: 'Team',
  color: '#7c3aed',
  title: 'Your team',
  tagline: 'Invite nutritionists, coaches and front-desk staff, decide what each person can do, and give coaches their own caseload.',
  where: '`Team` in the left menu (under Account)',
  intro: [
    'Only the owner (and anyone the owner allows) can manage the team. Your plan sets how many people can be on it: Starter is for one person, Growth allows 5, Scale Pro is unlimited.',
  ],
  sections: [
    {
      title: 'Invite a team member',
      text: 'Click `Invite member`. In **Add a team member** choose one of two ways:',
      steps: [
        '**Send invite link:** choose the role and click `Create invite`. Copy the link and send it to the person. They sign in, accept, and join your practice. The link expires in 14 days.',
        '**Create login now:** enter their **Email** and a **Password** (or click `Generate`), choose the role, and click `Create login`. Copy the login link, email and password and share them with the person.',
      ],
      tip: 'Pending invites show `Link` (copy it again) and `Revoke` (cancel the invite).',
    },
    {
      title: 'Roles and what they can do',
      table: [
        ['Role', 'Can do by default'],
        ['**Owner**', 'Everything, including billing, team and settings'],
        ['**Manager**', 'Everything except billing'],
        ['**Nutritionist**', 'Clients (view and edit, not delete), programs, recipes, messaging, appointments, AI, analytics, reports, assessments, food library, meal review, team chat, community'],
        ['**Assistant**', 'View clients and programs, recipes, messaging, appointments, AI, assessments, food library, meal review, team chat, community'],
        ['**Coach**', 'View their assigned clients and programs, messaging, AI, analytics, assessments, food library, meal review, team chat, community'],
        ['**Receptionist**', 'View clients, appointments, messaging, assessments, food library, meal review, team chat, community'],
        ['**Support**', 'View clients, messaging, assessments, food library, meal review, team chat, community'],
      ],
      note: 'Only the Owner and Managers can manage the team and settings.',
    },
    {
      title: 'Change someone\'s role or access',
      bullets: [
        'Use the **Role** dropdown next to a member to change their role.',
        'Click `Permissions` to switch individual features on or off for that person.',
        'Click `Remove` to take someone off the team.',
      ],
    },
    {
      title: 'Give a coach their own clients',
      steps: [
        'Open the client\'s profile.',
        'In **Assigned coach**, choose the coach (or nutritionist).',
        'The coach now sees that client. Choose **Unassigned (whole team)** to make the client visible to everyone again.',
      ],
      note: 'Coaches only see the clients assigned to them. Owners and nutritionists see all clients.',
    },
    {
      title: 'Team size by plan',
      table: [
        ['Plan', 'Team members (incl. owner)', 'Managers'],
        ['Free trial', '5', '1'],
        ['Starter', '1 (owner only)', '0'],
        ['Growth', '5', '1'],
        ['Scale Pro', 'Unlimited', 'Unlimited'],
      ],
      text: 'Pending invites count towards the limit. When the team is full, `Invite member` is greyed out with "Team seat limit reached - upgrade to add more".',
    },
  ],
};
