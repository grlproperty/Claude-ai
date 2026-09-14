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

/**
 * Where a check constraint guards a business rule worth explaining, the
 * explanation belongs here rather than in a generic apology. Anything not
 * listed still falls back to the message for its SQLSTATE.
 */
const FRIENDLY_BY_CONSTRAINT: Record<string, string> = {
  commissions_approved_needs_a_person:
    'A commission cannot be marked approved without recording who approved it and when.',
  commissions_paid_needs_a_person:
    'The CRM is connected to no bank, so a payment must be recorded by a person: '
    + 'the date paid and who is recording it are both required.',
  commissions_payment_needs_approval:
    'This commission has not been approved yet, so it cannot be invoiced or paid.',
  commissions_invoiced_needs_a_number:
    'An invoiced commission needs its invoice number.',
  commissions_override_needs_reason:
    'Changing the calculated figure needs a reason, which is kept with the record.',
  commissions_override_matches_figures:
    'The figure differs from what the rule works out, so it must be recorded as an override with a reason.',
  commissions_one_deal: 'A commission belongs to one sale or one lease, not to both.',
  fica_records_verified_needs_a_person:
    'A FICA file cannot be recorded as verified without naming who verified it and when.',
  communications_logged_by_hand:
    'The CRM does not send anything, so a communication can only be recorded as logged by hand.',
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
    const named = pg.constraint ? FRIENDLY_BY_CONSTRAINT[pg.constraint] : undefined;
    // A check violation raised by a trigger carries no constraint name and
    // its message was written deliberately, for a person to read, so it is
    // passed through rather than replaced with an apology.
    const raised = pg.code === '23514' && !pg.constraint ? pg.message : undefined;
    return {
      code: `db_${pg.code}`,
      message: named ?? raised ?? (FRIENDLY_BY_PG_CODE[pg.code] as string),
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
