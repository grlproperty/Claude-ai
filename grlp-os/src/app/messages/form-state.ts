/**
 * State the Messages forms carry between submissions.
 *
 * Separate from the actions because a 'use server' module may export nothing
 * but async functions.
 */

export interface ImportReport {
  filename: string;
  ok: boolean;
  problem?: string;
  title?: string;
  threadId?: string;
  messages?: number;
  newMessages?: number;
  category?: string;
  waitingOnUs?: boolean;
  commitments?: number;
  tasksCreated?: number;
  linkedContact?: string | null;
}

export interface UploadState {
  problems: string[];
  reports: ImportReport[];
}

export const NOTHING_UPLOADED: UploadState = { problems: [], reports: [] };

export interface FilingState {
  problems: string[];
  message: string | null;
}

export const NOT_FILED_YET: FilingState = { problems: [], message: null };
