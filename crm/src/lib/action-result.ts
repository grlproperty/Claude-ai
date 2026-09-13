import { toUserFacingError } from './errors.ts';

/**
 * The single shape every server action returns.
 *
 * Success is only ever reported when the work actually completed (spec 120),
 * and failures arrive as language staff can act on, with the technical
 * detail logged on the server instead of shown (spec 117).
 */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; code?: string; fieldErrors?: Record<string, string[]> };

export const idleResult: ActionResult = { ok: true };

export function failure(message: string, code = 'error'): ActionResult<never> {
  return { ok: false, message, code };
}

/**
 * Wraps a server action body. Anything that escapes is turned into a safe
 * message; nothing raw ever reaches the browser.
 */
export async function runAction<T>(
  label: string,
  body: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (error) {
    const safe = toUserFacingError(error);
    console.error(`[action:${label}] ${safe.code}: ${safe.logDetail}`);
    return {
      ok: false,
      message: safe.message,
      code: safe.code,
      ...(safe.fieldErrors ? { fieldErrors: safe.fieldErrors } : {}),
    };
  }
}
