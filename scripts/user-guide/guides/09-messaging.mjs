export default {
  no: 9,
  slug: 'messaging',
  section: 'Messaging',
  color: '#3b82f6',
  title: 'Messaging & Team chat',
  tagline: 'Chat one-to-one with clients (text, photos, files and voice notes), and talk privately with your team.',
  where: '`Messaging` and `Team chat` in the left menu',
  sections: [
    {
      title: 'The Messages inbox',
      bullets: [
        'Every client conversation in one list. Search by name, or filter `All` / `Unread`.',
        'The number next to `Messaging` in the menu shows unread messages. Opening a chat marks it read.',
        'Under the client\'s name you see **Active now** or when they were last active.',
        '`Profile` in the chat header opens the client\'s profile.',
      ],
    },
    {
      title: 'Sending messages',
      bullets: [
        'Type and press **Enter** to send. **Shift + Enter** starts a new line (up to 4,000 characters).',
        '**Attach** a photo or file. Photos are made smaller automatically; other files must be under 1.4 MB.',
        '**Voice note:** click the microphone, speak, then click stop to send. Silent recordings are not sent.',
      ],
    },
    {
      title: 'Save time',
      bullets: [
        '**Quick replies:** type a message you send often and click `Save current`. Click a saved reply to put it in the box.',
        '**Schedule send:** pick a date and time; the message goes out then, even if you are offline. Scheduled messages are listed with `Cancel`.',
        '**Summarize:** NUSI\'s AI sums up a long conversation.',
        '**Suggest replies:** NUSI\'s AI suggests short replies you can send or edit.',
      ],
      note: 'Summaries and suggested replies use AI credits.',
    },
    {
      title: 'Message actions',
      text: 'Hover over a message to:',
      bullets: [
        '**React** with an emoji, **Reply** to it, or **Pin** it to the top of the chat.',
        '**Edit** your own text message within 15 minutes.',
        '**Delete for everyone** (your own message, within 15 minutes) or **Delete for me**.',
      ],
    },
    {
      title: 'Team chat (staff only)',
      text: 'Team chat is a private space for your team. **Clients never see it.** It has two tabs:',
      bullets: [
        '**Chat:** channels for your team. Click `+` to create one (for example #general). Messages refresh every few seconds. Team chat is text only.',
        '**Notes:** shared notes for the team. Click `New shared note`, add a title (optional) and the text, then `Add note`. Pin important notes to the top.',
      ],
      note: 'Deleting a channel deletes all its messages for everyone.',
    },
  ],
};
