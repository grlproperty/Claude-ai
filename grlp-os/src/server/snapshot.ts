import { prisma } from './db';
import type { BusinessSnapshot } from '../domain/risk';
import type { StaffMember } from '../domain/types';

/**
 * Reads the current state of the business out of the database and into the
 * plain shapes the domain engines work on. Keeping this translation in one place
 * is what lets the engines be pure and fully testable.
 */

/** Committed hours are derived from real open work, not self-reported. */
export async function getStaff(): Promise<StaffMember[]> {
  const [users, openTasks, absences] = await Promise.all([
    prisma.user.findMany({ where: { active: true, role: { not: 'SYSTEM' } }, orderBy: { name: 'asc' } }),
    prisma.task.groupBy({
      by: ['ownerId'],
      where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_APPROVAL'] }, ownerId: { not: null } },
      _sum: { estimatedMinutes: true },
      _count: { _all: true },
    }),
    prisma.absencePeriod.findMany({ where: { active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } }),
  ]);

  const overdue = await prisma.task.groupBy({
    by: ['ownerId'],
    where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { lt: new Date() }, ownerId: { not: null } },
    _count: { _all: true },
  });

  const minutesByUser = new Map(openTasks.map((t) => [t.ownerId!, t._sum.estimatedMinutes ?? 0]));
  const overdueByUser = new Map(overdue.map((t) => [t.ownerId!, t._count._all]));
  const awayUsers = new Set(absences.map((a) => a.userId));

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    department: u.department,
    active: u.active,
    isCeo: u.isCeo,
    acceptsDelegation: u.acceptsDelegation,
    weeklyCapacityHours: u.weeklyCapacityHours,
    committedHours: (minutesByUser.get(u.id) ?? 0) / 60,
    overdueCount: overdueByUser.get(u.id) ?? 0,
    away: awayUsers.has(u.id),
  }));
}

export async function getBusinessSnapshot(): Promise<BusinessSnapshot> {
  const [leads, viewings, communications, documents, tasks, transactions, mandates, escalations] = await Promise.all([
    prisma.lead.findMany({ where: { stage: { notIn: ['CONVERTED', 'LOST'] } }, include: { contact: true } }),
    prisma.viewing.findMany({ where: { completedAt: { not: null } }, include: { property: true, contact: true } }),
    prisma.communication.findMany({ where: { direction: 'INBOUND', answeredAt: null, domain: 'BUSINESS' } }),
    prisma.document.findMany({
      where: { status: { in: ['AWAITING_SIGNATURE', 'IN_REVIEW', 'GENERATED'] } },
      include: { signatures: true, extractedFields: true },
    }),
    prisma.task.findMany({ where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] } }, include: { owner: true } }),
    prisma.transaction.findMany({ where: { stage: { notIn: ['CLOSED', 'CANCELLED'] } }, include: { property: true, checklistItems: true } }),
    prisma.mandate.findMany({ where: { status: { in: ['ACTIVE', 'SIGNED'] } }, include: { property: true } }),
    prisma.escalation.findMany({ where: { resolvedAt: null } }),
  ]);

  return {
    leads: leads.map((l) => ({
      id: l.id,
      stage: l.stage,
      contactName: `${l.contact.firstName} ${l.contact.lastName}`.trim(),
      ownerId: l.ownerId,
      createdAt: l.createdAt,
      lastContactAt: l.lastContactAt,
    })),
    viewings: viewings.map((v) => ({
      id: v.id,
      propertyRef: v.property.reference,
      contactName: `${v.contact.firstName} ${v.contact.lastName}`.trim(),
      agentId: v.property.agentId,
      completedAt: v.completedAt,
      feedback: v.feedback,
      sellerUpdatedAt: v.sellerUpdatedAt,
    })),
    communications: communications.map((c) => ({
      id: c.id,
      subject: c.subject,
      fromName: c.fromName,
      ownerId: c.ownerId,
      receivedAt: c.receivedAt,
      answeredAt: c.answeredAt,
      category: c.category,
    })),
    documents: documents.map((d) => {
      const pending = d.signatures.find((s) => ['REQUESTED', 'SENT', 'VIEWED'].includes(s.status));
      return {
        id: d.id,
        title: d.title,
        kind: d.kind,
        status: d.status,
        ownerId: d.uploadedById,
        awaitingSignatureSince: pending?.requestedAt ?? null,
        missingFieldCount: d.extractedFields.filter((f) => f.value == null).length,
      };
    }),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      ownerId: t.ownerId,
      ownerName: t.owner?.name ?? null,
      dueAt: t.dueAt,
      status: t.status,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      propertyRef: t.property.reference,
      stage: t.stage,
      agentId: t.property.agentId,
      lastMovementAt: t.lastMovementAt,
      outstandingItems: t.checklistItems.filter((c) => c.required && !c.completedAt).map((c) => c.label),
    })),
    mandates: mandates.map((m) => ({
      id: m.id,
      propertyRef: m.property.reference,
      status: m.status,
      agentId: m.property.agentId,
      endDate: m.endDate,
    })),
    escalations: escalations.map((e) => ({
      id: e.id,
      title: e.title,
      level: e.level,
      assigneeId: e.assigneeId,
      createdAt: e.createdAt,
      resolvedAt: e.resolvedAt,
      dueAt: e.dueAt,
    })),
  };
}

/** True when GRLP has not yet imported any operational records. */
export async function isEmpty(): Promise<boolean> {
  const [contacts, properties] = await Promise.all([prisma.contact.count(), prisma.property.count()]);
  return contacts === 0 && properties === 0;
}
