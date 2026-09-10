import Anthropic from '@anthropic-ai/sdk';
import { IntegrationNotConfiguredError, missingEnvFor, INTEGRATIONS, type EnvLike } from '../integrations/registry';

/**
 * The language-model provider.
 *
 * Deliberately thin, and deliberately optional: routing, triage, validation,
 * document population, the market assessment and the risk sweep are all
 * deterministic and run without it. The model is used where judgement about
 * language is genuinely needed — drafting a reply, summarising a thread, reading
 * an unstructured document — and nowhere else.
 *
 * With no API key the system does not fabricate a response. It reports that
 * drafting is unavailable and carries on with everything else.
 */

export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Lower for extraction and classification, higher for drafting. */
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

let client: Anthropic | null = null;

export function aiAvailable(env: EnvLike = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

function getClient(): Anthropic {
  if (!aiAvailable()) {
    const spec = INTEGRATIONS.find((i) => i.key === 'anthropic')!;
    throw new IntegrationNotConfiguredError('anthropic', missingEnvFor(spec));
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: req.maxTokens ?? 2048,
    temperature: req.temperature ?? 0.2,
    system: req.system,
    messages: [{ role: 'user', content: req.prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return {
    text,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Asks for JSON and parses it strictly. A malformed reply is an error, never a
 * silently accepted guess — an agent that cannot read a document must say so.
 */
export async function completeJson<T>(req: CompletionRequest & { validate: (v: unknown) => T }): Promise<{ value: T; usage: Omit<CompletionResult, 'text'> }> {
  const result = await complete({
    ...req,
    system: `${req.system}\n\nReply with JSON only. No prose, no code fence.`,
    temperature: req.temperature ?? 0,
  });

  const jsonText = extractJson(result.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`The model did not return usable JSON. It replied: ${result.text.slice(0, 300)}`);
  }

  return {
    value: req.validate(parsed),
    usage: { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
}

/** Tolerates a code fence without tolerating invented structure. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.search(/[[{]/);
  if (start === -1) return text.trim();
  return text.slice(start).trim();
}

/** Shared voice for anything the system writes on GRLP's behalf. */
export const GRLP_VOICE = `You write on behalf of Garden Route Lifestyle Property, an estate agency on South Africa's Garden Route.

Voice: professional, clear, warm and direct. The brand values are professionalism, clarity, approachability and integrity.

Rules you must not break:
- South African English spelling throughout ("realise", "organised", "metre", "programme").
- Rand amounts written as R4 250 000, with a space as the thousands separator.
- Never give legal advice, never state a legal position, never invent a contractual term.
- Never state a price, date, name, or figure that was not given to you. If something is unknown, say it is being confirmed.
- Never promise an outcome on the agency's behalf.
- No emoji. No exclamation marks. No filler openers such as "I hope this email finds you well".
- Sign off as the named person given to you, never as "the team" and never as Mandy unless you were explicitly told to draft in her name.`;
