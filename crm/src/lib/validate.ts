import { z } from 'zod';
import { ValidationError } from './errors.ts';

/**
 * Server-side validation (spec 102).
 *
 * Every write goes through a schema here before it reaches SQL. The browser
 * does its own checking for convenience; this is the one that counts.
 */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_form';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new ValidationError(fieldErrors);
}

/** Trims, and turns an empty string into null so blanks are stored consistently. */
export const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const requiredText = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

export const optionalUuid = z
  .union([z.uuid('That selection is not valid.'), z.literal('')])
  .optional()
  .transform((value) => (value ? value : null));

export const optionalDate = z
  .union([z.iso.date('Please enter a valid date.'), z.literal('')])
  .optional()
  .transform((value) => (value ? value : null));

export const optionalDateTime = z
  .union([z.iso.datetime({ local: true }), z.iso.date(), z.literal('')])
  .optional()
  .transform((value) => (value ? value : null));

/** Money is kept as a decimal string so that rounding is never done twice. */
export const optionalMoney = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') return null;
    const cleaned = String(value).replace(/[\s,R]/g, '');
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
    return cleaned;
  })
  .refine((value) => value === null || !Number.isNaN(value), {
    message: 'Please enter an amount, for example 1250000 or 1250000.50.',
  }) as unknown as z.ZodType<string | null>;

/** Reads a checkbox group or repeated field from a form submission. */
export function formList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function formBool(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === 'on' || value === 'true' || value === '1';
}

/**
 * Reads repeated sub-form rows named like contacts[0][value].
 * Returns them in index order with gaps removed.
 */
export function formRows(formData: FormData, prefix: string): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  const pattern = new RegExp(`^${prefix}\\[(\\d+)\\]\\[([a-zA-Z0-9_]+)\\]$`);
  for (const [key, value] of formData.entries()) {
    const match = pattern.exec(key);
    if (!match || typeof value !== 'string') continue;
    const index = Number(match[1]);
    const field = match[2] as string;
    const row = rows.get(index) ?? {};
    row[field] = value.trim();
    rows.set(index, row);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}
