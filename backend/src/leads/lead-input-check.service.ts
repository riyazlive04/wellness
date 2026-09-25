import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface InputVerdict {
  valid: boolean;
  /** A short, friendly nudge shown to the visitor when `valid` is false. */
  message?: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const OPENAI_MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 8000;

const PURPOSE_HINT = "Tell us what you'd like to see - for example, moving your clients or building diet plans.";
const NAME_HINT = 'Please enter your real name.';

const PURPOSE_INSTRUCTIONS = `You screen one field on a demo-booking form for NUSI, a practice-management
platform for dietitians and nutritionists in India. The field asks: "What is the purpose of the call?"

Decide whether the answer is a GENUINE reason a person might book a product demo.

VALID (be generous): any real intent about their practice or the software - seeing features,
moving clients off Excel/WhatsApp/notebooks, diet plans, follow-ups, pricing, trying the app,
their team or clinic, curiosity about how it works. Short, informal, Hinglish, broken English
or typos are all fine.

INVALID: gibberish or random letters; the same word or phrase repeated to pad the length
("test test test", "hello hello"); filler with no intent; abusive text; clearly unrelated
content (advertising, spam, job applications, selling something to us).

When unsure, answer valid.

Reply with JSON only: {"valid": true|false, "hint": "..."}
"hint" is empty when valid. When invalid, it is one friendly sentence (under 20 words)
telling them what to write instead, e.g. "Tell us what you'd like to see - for example,
moving your clients or building diet plans."`;

const NAME_INSTRUCTIONS = `You screen the "name" field on a sign-up form for NUSI, used by dietitians and
nutritionists, mostly in India.

Decide whether the text is a plausible REAL PERSON'S NAME.

VALID (be generous): real first names or full names from any culture or language, Indian names
of every region, single names, initials ("K. Priya", "S R Nair"), titles such as Dr., Dt., Mr., Ms.

INVALID: gibberish or keyboard mashing ("asdf", "qwerty", "xyz"); placeholders and test entries
("test", "abc", "name", "user", "none", "na", "demo", "your name"); fictional or celebrity joke
names used as a joke ("Batman", "Iron Man"); ordinary words that are not names ("hello",
"dietitian", "nothing"); insults or offensive text.

When unsure, answer valid.

Reply with JSON only: {"valid": true|false, "hint": "..."}
"hint" is empty when valid. When invalid, it is one short friendly sentence (under 12 words),
e.g. "Please enter your real name so we know what to call you."`;

/** Words people type instead of a name; caught without spending an AI call. */
const NOT_NAMES = new Set(['test', 'testing', 'abc', 'xyz', 'name', 'user', 'none', 'na', 'nil', 'demo', 'asdf', 'qwerty', 'hello', 'hi', 'admin', 'aaa']);

/**
 * AI checks for the landing page's free-text fields: that "purpose of the call"
 * is a real reason (not padding typed to pass the 10-word minimum) and that a
 * name is a real person's name. Obvious junk is caught by cheap rules first;
 * then OpenAI judges (OPENAI_API_KEY, model OPENAI_CHECK_MODEL), falling back
 * to Gemini (GEMINI_API_KEY). If no AI is configured or both fail - slow, rate
 * limited, unreadable reply - the input is treated as valid: a lead must never
 * be lost to an AI hiccup.
 */
@Injectable()
export class LeadInputCheckService {
  private readonly logger = new Logger(LeadInputCheckService.name);
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly openaiKey: string | null;
  private readonly openaiModel: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('GEMINI_API_KEY')?.trim();
    this.genAI = key ? new GoogleGenerativeAI(key) : null;
    this.openaiKey = config.get<string>('OPENAI_API_KEY')?.trim() || null;
    this.openaiModel = config.get<string>('OPENAI_CHECK_MODEL')?.trim() || OPENAI_MODEL;
  }

  async checkPurpose(purpose: string): Promise<InputVerdict> {
    const text = (purpose ?? '').trim().slice(0, 300);
    if (!text) return { valid: true };
    // Padding like "test test test ..." - no AI call needed.
    const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (words.length >= 5 && new Set(words).size / words.length < 0.4) {
      return { valid: false, message: PURPOSE_HINT };
    }
    return this.ask(PURPOSE_INSTRUCTIONS, text, PURPOSE_HINT);
  }

  async checkName(name: string): Promise<InputVerdict> {
    const text = (name ?? '').trim().replace(/\s+/g, ' ');
    // Letters (any script), spaces, dots, apostrophes and hyphens only.
    if (text.length < 2 || text.length > 60 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(text)) {
      return { valid: false, message: NAME_HINT };
    }
    const bare = text.toLowerCase().replace(/[^\p{L}]/gu, '');
    if (NOT_NAMES.has(bare) || /^(.)\1+$/u.test(bare)) return { valid: false, message: NAME_HINT };
    // Random-caps mashing ("AkjsaidjiQWI"): two or more capitals right after a
    // lowercase letter inside a word - real names essentially never do this.
    if (/\p{Ll}\p{Lu}{2,}/u.test(text)) return { valid: false, message: NAME_HINT };
    return this.ask(NAME_INSTRUCTIONS, text, NAME_HINT);
  }

  private async ask(instructions: string, text: string, fallbackHint: string): Promise<InputVerdict> {
    const prompt = `Text to check:\n<<<${text}>>>`;
    const reply =
      (this.openaiKey ? await this.askOpenAi(instructions, prompt) : null) ??
      (this.genAI ? await this.askGemini(instructions, prompt) : null);
    if (!reply) return { valid: true };
    try {
      const parsed = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) as { valid?: unknown; hint?: unknown };
      if (parsed.valid === false) {
        const hint = typeof parsed.hint === 'string' ? parsed.hint.trim().slice(0, 160) : '';
        return { valid: false, message: hint || fallbackHint };
      }
    } catch {
      this.logger.warn('Input check reply was not JSON - treated as valid');
    }
    return { valid: true };
  }

  /** The model's raw JSON reply, or null if the call failed. */
  private async askOpenAi(instructions: string, prompt: string): Promise<string | null> {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.openaiModel,
          temperature: 0,
          max_tokens: 120,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        this.logger.warn(`OpenAI input check failed ${res.status}: ${body?.error?.message?.slice(0, 120) ?? ''}`);
        return null;
      }
      return body?.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      this.logger.warn(`OpenAI input check error: ${(err as Error).message.slice(0, 120)}`);
      return null;
    }
  }

  /** The model's raw JSON reply, or null if the call failed. */
  private async askGemini(instructions: string, prompt: string): Promise<string | null> {
    try {
      const model = this.genAI!.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: instructions,
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 400 },
      });
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
      ]);
      return result.response.text();
    } catch (err) {
      this.logger.warn(`Gemini input check error: ${(err as Error).message.slice(0, 120)}`);
      return null;
    }
  }
}
