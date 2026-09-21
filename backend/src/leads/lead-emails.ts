/**
 * Email copies of the WhatsApp messages a landing-page lead receives - the
 * booking confirmation and each sales-stage message. Same words as WhatsApp
 * (so the two never tell a lead different things), wrapped in a simple NUSI
 * branded layout. Emails need no Meta approval, so they go out even while a
 * WhatsApp template is still pending.
 */

export type LeadEmailKind = 'lead_confirmation' | 'contacted' | 'demo_done' | 'won' | 'lost';

const SUBJECTS: Record<LeadEmailKind, string> = {
  lead_confirmation: 'Your NUSI demo request is confirmed',
  contacted: 'Your NUSI demo - next steps',
  demo_done: 'Thank you for joining the NUSI demo',
  won: 'Welcome to NUSI',
  lost: 'Thank you for exploring NUSI',
};

/** WhatsApp-style replies ("reply to this message") read oddly in email. */
function forEmail(text: string): string {
  return text
    .replace(/simply reply to this message/gi, 'simply reply to this email')
    .replace(/reply to this message/gi, 'reply to this email')
    .replace(/just reply here/gi, 'just reply to this email')
    .replace(/reply here/gi, 'reply to this email');
}

export function leadEmail(kind: LeadEmailKind, text: string): { subject: string; html: string } {
  const paragraphs = forEmail(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const body = linkify(escapeHtml(p)).replace(/\n/g, '<br>');
      return p.startsWith('- Team NUSI')
        ? `<p style="margin:24px 0 0;color:#3f6212;font-weight:600">${body}</p>`
        : `<p style="margin:0 0 16px">${body}</p>`;
    })
    .join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f8ee">
  <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#4d7c0f;margin:0 0 16px">NUSI</div>
    <div style="background:#ffffff;border:1px solid #e2ecd3;border-radius:16px;padding:28px;color:#1f2937;font-size:15px;line-height:1.6">
      ${paragraphs}
    </div>
    <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:16px 4px 0">
      You are receiving this because you requested a demo at
      <a href="https://nusi.in" style="color:#4d7c0f">nusi.in</a>. NUSI by Sirah Digital.
    </p>
  </div></body></html>`;

  return { subject: SUBJECTS[kind], html };
}

function linkify(s: string): string {
  return s.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#4d7c0f">${url}</a>`);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
