'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import type { AppointmentStatus } from '@/lib/domain.ts';
import {
  appointmentInputSchema,
  cancelTask,
  completeTask,
  createAppointment,
  createTask,
  setAppointmentStatus,
  taskInputSchema,
  updateAppointment,
  updateTask,
} from '@/lib/tasks.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

function readTaskForm(formData: FormData) {
  return parseOrThrow(taskInputSchema, {
    assignedUserId: formText(formData, 'assignedUserId'),
    personId: formText(formData, 'personId'),
    propertyId: formText(formData, 'propertyId'),
    leadId: formText(formData, 'leadId'),
    transactionId: formText(formData, 'transactionId'),
    taskType: formText(formData, 'taskType') || 'follow_up',
    title: formText(formData, 'title'),
    dueAt: formText(formData, 'dueAt'),
    priority: formText(formData, 'priority') || 'normal',
    status: formText(formData, 'status') || 'to_do',
    notes: formText(formData, 'notes'),
    recurrence: formText(formData, 'recurrence') || 'none',
    recurrenceUntil: formText(formData, 'recurrenceUntil'),
  });
}

function readAppointmentForm(formData: FormData) {
  return parseOrThrow(appointmentInputSchema, {
    appointmentType: formText(formData, 'appointmentType') || 'viewing',
    title: formText(formData, 'title'),
    agentId: formText(formData, 'agentId'),
    personId: formText(formData, 'personId'),
    propertyId: formText(formData, 'propertyId'),
    leadId: formText(formData, 'leadId'),
    startsAt: formText(formData, 'startsAt'),
    endsAt: formText(formData, 'endsAt'),
    location: formText(formData, 'location'),
    status: formText(formData, 'status') || 'scheduled',
    notes: formText(formData, 'notes'),
  });
}

export async function createTaskAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const back = formText(formData, 'returnTo') || '/tasks';
  const result = await runAction<undefined>('tasks.create', async () => {
    const user = await requirePermission('TASKS_CREATE', 'tasks');
    const ctx = await context();
    await withUser(user.id, (db) => createTask(db, ctx, readTaskForm(formData)));
    return { ok: true as const, message: 'Follow-up created.' };
  });
  if (result.ok) {
    revalidatePath('/tasks');
    redirect(back);
  }
  return result;
}

export async function updateTaskAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const taskId = formText(formData, 'taskId');
  const result = await runAction<undefined>('tasks.update', async () => {
    const user = await requirePermission('TASKS_EDIT', 'tasks');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateTask(db, ctx, taskId, readTaskForm(formData), Number(formText(formData, 'rowVersion'))),
    );
    return { ok: true as const, message: 'Task saved.' };
  });
  if (result.ok) {
    revalidatePath('/tasks');
    redirect('/tasks?saved=updated');
  }
  return result;
}

export async function completeTaskAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('tasks.complete', async () => {
    const user = await requirePermission('TASKS_EDIT', 'tasks');
    const ctx = await context();
    await withUser(user.id, (db) => completeTask(db, ctx, formText(formData, 'taskId')));
    return { ok: true as const, message: 'Task completed.' };
  });
  if (result.ok) {
    revalidatePath('/tasks');
    revalidatePath('/');
  }
  return result;
}

export async function cancelTaskAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('tasks.cancel', async () => {
    const user = await requirePermission('TASKS_DELETE', 'cancelling tasks');
    const ctx = await context();
    await withUser(user.id, (db) =>
      cancelTask(db, ctx, formText(formData, 'taskId'), formText(formData, 'reason') || null),
    );
    return { ok: true as const, message: 'Task cancelled.' };
  });
  if (result.ok) revalidatePath('/tasks');
  return result;
}

export async function createAppointmentAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const back = formText(formData, 'returnTo') || '/calendar';
  const result = await runAction<undefined>('appointments.create', async () => {
    const user = await requirePermission('TASKS_CREATE', 'appointments');
    const ctx = await context();
    await withUser(user.id, (db) => createAppointment(db, ctx, readAppointmentForm(formData)));
    return { ok: true as const, message: 'Appointment booked.' };
  });
  if (result.ok) {
    revalidatePath('/calendar');
    redirect(back);
  }
  return result;
}

export async function updateAppointmentAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const appointmentId = formText(formData, 'appointmentId');
  const result = await runAction<undefined>('appointments.update', async () => {
    const user = await requirePermission('TASKS_EDIT', 'appointments');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateAppointment(
        db,
        ctx,
        appointmentId,
        readAppointmentForm(formData),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return { ok: true as const, message: 'Appointment saved.' };
  });
  if (result.ok) {
    revalidatePath('/calendar');
    redirect('/calendar?saved=updated');
  }
  return result;
}

export async function setAppointmentStatusAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('appointments.set-status', async () => {
    const user = await requirePermission('TASKS_EDIT', 'appointments');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setAppointmentStatus(
        db,
        ctx,
        formText(formData, 'appointmentId'),
        formText(formData, 'status') as AppointmentStatus,
      ),
    );
    return { ok: true as const, message: 'Appointment updated.' };
  });
  if (result.ok) revalidatePath('/calendar');
  return result;
}
