'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formBool, formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import {
  archiveCompany,
  companyInputSchema,
  companyPersonInputSchema,
  createCompany,
  linkCompanyToProperty,
  linkPersonToCompany,
  unlinkPersonFromCompany,
  updateCompany,
} from '@/lib/companies.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

function readForm(formData: FormData) {
  return parseOrThrow(companyInputSchema, {
    registeredName: formText(formData, 'registeredName'),
    tradingName: formText(formData, 'tradingName'),
    entityType: formText(formData, 'entityType') || 'pty_ltd',
    registrationNumber: formText(formData, 'registrationNumber'),
    vatNumber: formText(formData, 'vatNumber'),
    taxNumber: formText(formData, 'taxNumber'),
    addressLine1: formText(formData, 'addressLine1'),
    addressLine2: formText(formData, 'addressLine2'),
    suburb: formText(formData, 'suburb'),
    city: formText(formData, 'city'),
    province: formText(formData, 'province'),
    postalCode: formText(formData, 'postalCode'),
    businessArea: formText(formData, 'businessArea') || 'sales',
    primaryAgentId: formText(formData, 'primaryAgentId'),
    secondaryAgentId: formText(formData, 'secondaryAgentId'),
    notes: formText(formData, 'notes'),
  });
}

export async function createCompanyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  const result = await runAction<undefined>('company.create', async () => {
    const user = await requirePermission('PEOPLE_CREATE', 'companies');
    const ctx = await context();
    const created = await withUser(user.id, (db) => createCompany(db, ctx, readForm(formData)));
    createdId = created.id;
    return { ok: true as const, message: `${created.companyRef} created.` };
  });

  if (result.ok && createdId) {
    revalidatePath('/companies');
    redirect(`/companies/${createdId}?saved=created`);
  }
  return result;
}

export async function updateCompanyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'companyId');

  const result = await runAction<undefined>('company.update', async () => {
    const user = await requirePermission('PEOPLE_EDIT', 'companies');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateCompany(db, ctx, id, readForm(formData), Number(formText(formData, 'rowVersion'))),
    );
    return { ok: true as const, message: 'Saved.' };
  });

  if (result.ok) redirect(`/companies/${id}?saved=updated`);
  return result;
}

export async function linkPersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const companyId = formText(formData, 'companyId');

  const result = await runAction<undefined>('company.link-person', async () => {
    const user = await requirePermission('PEOPLE_EDIT', 'companies');
    const ctx = await context();
    await withUser(user.id, (db) =>
      linkPersonToCompany(
        db,
        ctx,
        companyId,
        parseOrThrow(companyPersonInputSchema, {
          personId: formText(formData, 'personId'),
          role: formText(formData, 'role'),
          isPrimaryContact: formBool(formData, 'isPrimaryContact'),
          shareholdingPercent: formText(formData, 'shareholdingPercent'),
          appointedOn: formText(formData, 'appointedOn'),
          resignedOn: formText(formData, 'resignedOn'),
          notes: formText(formData, 'notes'),
        }),
      ),
    );
    return { ok: true as const, message: 'Linked.' };
  });

  if (result.ok) revalidatePath(`/companies/${companyId}`);
  return result;
}

export async function unlinkPersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const companyId = formText(formData, 'companyId');

  const result = await runAction<undefined>('company.unlink-person', async () => {
    const user = await requirePermission('PEOPLE_EDIT', 'companies');
    const ctx = await context();
    await withUser(user.id, (db) =>
      unlinkPersonFromCompany(db, ctx, companyId, formText(formData, 'linkId')),
    );
    return { ok: true as const, message: 'Removed. Neither record was deleted.' };
  });

  if (result.ok) revalidatePath(`/companies/${companyId}`);
  return result;
}

export async function archiveCompanyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'companyId');

  const result = await runAction<undefined>('company.archive', async () => {
    const user = await requirePermission('PEOPLE_DELETE', 'archiving a company');
    const ctx = await context();
    await withUser(user.id, (db) =>
      archiveCompany(db, ctx, id, formText(formData, 'archiveReason')),
    );
    return { ok: true as const, message: 'Archived. Nothing was deleted.' };
  });

  if (result.ok) revalidatePath(`/companies/${id}`);
  return result;
}

export async function linkCompanyToPropertyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');

  const result = await runAction<undefined>('property.link-company', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'properties');
    const ctx = await context();
    await withUser(user.id, (db) =>
      linkCompanyToProperty(db, ctx, {
        propertyId,
        companyId: formText(formData, 'companyId'),
        role: formText(formData, 'role'),
        ownershipPercent: formText(formData, 'ownershipPercent') || null,
        notes: formText(formData, 'notes') || null,
      }),
    );
    return { ok: true as const, message: 'Entity linked to the property.' };
  });

  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}
