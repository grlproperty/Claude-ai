/**
 * Errors that staff will actually read.
 *
 * Database and framework errors are never shown raw (spec 117). Each of
 * these carries a message written for an estate agent, while the technical
 * detail stays in the server log.
 */

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: string;

  constructor(code: string, message: string, status = 400, detail?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export class NotAuthenticatedError extends AppError {
  constructor() {
    super('not_authenticated', 'Please sign in to continue.', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(what = 'this') {
    super('forbidden', `You do not have permission to access ${what}.`, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'That record') {
    super(
      'not_found',
      `${what} could not be found, or you do not have permission to see it.`,
      404,
    );
  }
}

/** Spec 105: never silently overwrite another user's work. */
export class ConcurrencyError extends AppError {
  constructor() {
    super(
      'stale_record',
      'This record has been updated by another user. Please refresh before saving.',
      409,
    );
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(fieldErrors: Record<string, string[]>, message = 'Please check the highlighted fields.') {
    super('validation', message, 422);
    this.fieldErrors = fieldErrors;
  }
}

const FRIENDLY_BY_PG_CODE: Record<string, string> = {
  '23505': 'That record already exists. Please check for an existing entry before adding another.',
  '23503': 'This could not be saved because a linked record is no longer available. Please refresh and try again.',
  '23502': 'A required field was left blank. Please complete the form and try again.',
  '23514': 'One of the values is not allowed for this field. Please check and try again.',
  '42501': 'You do not have permission to do that.',
  '40001': 'Another user changed this at the same moment. Please try again.',
};

type PgLikeError = { code?: string; message?: string; constraint?: string };

/**
 * Turns anything thrown during a request into something safe to display.
 * Returns the message for the user plus the detail to log, never both to
 * the same place.
 */
export function toUserFacingError(error: unknown): {
  code: string;
  message: string;
  status: number;
  fieldErrors?: Record<string, string[]>;
  logDetail: string;
} {
  if (error instanceof ValidationError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      fieldErrors: error.fieldErrors,
      logDetail: error.message,
    };
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      logDetail: error.detail ?? error.message,
    };
  }

  const pg = error as PgLikeError;
  if (pg && typeof pg.code === 'string' && FRIENDLY_BY_PG_CODE[pg.code]) {
    return {
      code: `db_${pg.code}`,
      message: FRIENDLY_BY_PG_CODE[pg.code] as string,
      status: pg.code === '42501' ? 403 : 400,
      logDetail: `${pg.code} ${pg.constraint ?? ''} ${pg.message ?? ''}`.trim(),
    };
  }

  return {
    code: 'unexpected',
    message: 'Something went wrong on our side. Nothing was saved. Please try again.',
    status: 500,
    logDetail: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
  };
}
