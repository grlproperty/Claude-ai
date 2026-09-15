import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { INTEGRATIONS, missingEnvFor } from '../src/integrations/registry';

/**
 * Seeds configuration, not data.
 *
 * What goes in here: the real GRLP team and their responsibilities, the template
 * field definitions, the workflow definitions, and the integration registry.
 * These are how the business is set up, and the system cannot route work without
 * them.
 *
 * What deliberately does NOT go in here: clients, properties, leads, mandates or
 * transactions. Inventing those would produce a system that demonstrates well
 * and means nothing. GRLP's real records are imported, not imagined.
 *
 * Template wording is also not invented. Each template is seeded with its field
 * definitions and validation rules — which are genuinely useful and reusable —
 * and a body that is explicitly marked as not approved. The document engine
 * refuses to produce anything from an unapproved version, so GRLP must paste in
 * its own approved wording before a mandate or OTP can be generated.
 */

const prisma = new PrismaClient();

/**
 * The mail domain. Confirmed from GRLP's MX records: mail for grproperty.co.za is
 * hosted on rdsa-mail.com (xneelo), not on Google Workspace or Microsoft 365.
 *
 * Only mandy@ has been confirmed by name. The other local-parts are the obvious
 * first-name form and should be checked against the real mailboxes before the
 * system starts routing to them — an address that does not exist fails silently
 * at the mail server, which is the worst way to find out.
 */
const MAIL_DOMAIN = 'grproperty.co.za';

const TEAM: Array<{
  email: string;
  name: string;
  role: Prisma.UserCreateInput['role'];
  department: Prisma.UserCreateInput['department'];
  isCeo?: boolean;
  weeklyCapacityHours?: number;
  note: string;
}> = [
  { email: `mandy@${MAIL_DOMAIN}`, name: 'Mandy', role: 'CEO', department: 'EXECUTIVE', isCeo: true, weeklyCapacityHours: 45, note: 'Founder, manager, senior sales agent, professional oversight.' },
  { email: `kandy@${MAIL_DOMAIN}`, name: 'Kandy', role: 'SALES_AGENT', department: 'SALES', note: 'Sales agent.' },
  { email: `jason@${MAIL_DOMAIN}`, name: 'Jason', role: 'SALES_AGENT', department: 'SALES', note: 'Sales agent.' },
  { email: `angela@${MAIL_DOMAIN}`, name: 'Angela', role: 'SALES_AGENT', department: 'SALES', note: 'Sales agent.' },
  { email: `laurel@${MAIL_DOMAIN}`, name: 'Laurel', role: 'SALES_AGENT', department: 'SALES', note: 'Sales agent.' },
  { email: `melinda@${MAIL_DOMAIN}`, name: 'Melinda', role: 'SALES_AGENT', department: 'SALES', note: 'Sales agent.' },
  { email: `kerin@${MAIL_DOMAIN}`, name: 'Kerin', role: 'SALES_AGENT', department: 'SALES', note: 'Sales agent.' },
  { email: `rochelle@${MAIL_DOMAIN}`, name: 'Rochelle', role: 'SALES_AGENT', department: 'SALES', note: 'Sales agent.' },
  { email: `linda@${MAIL_DOMAIN}`, name: 'Linda', role: 'MARKETING_ADMIN', department: 'MARKETING', note: 'Social media, marketing, some administrative support.' },
  { email: `lisa@${MAIL_DOMAIN}`, name: 'Lisa', role: 'RENTALS', department: 'RENTALS', note: 'Rental operations.' },
  { email: `marion@${MAIL_DOMAIN}`, name: 'Marion', role: 'ACCOUNTS', department: 'ACCOUNTS', note: 'Accounts, rental administration, back office.' },
];

const UNAPPROVED_NOTICE = [
  '################################################################',
  '# THIS IS NOT APPROVED WORDING.',
  '#',
  '# The field definitions and validation rules below are ready to use.',
  '# The wording of this document is not: it must be replaced with the',
  '# approved GRLP template and approved by an authorised person before',
  '# any document is produced from it.',
  '#',
  '# Until that happens the document engine will refuse to generate.',
  '################################################################',
  '',
].join('\n');

type FieldSeed = {
  key: string;
  label: string;
  dataType: string;
  required?: boolean;
  validators?: string[];
  sourcePath?: string;
  conditionalOn?: Prisma.InputJsonValue;
};

const MANDATE_FIELDS: FieldSeed[] = [
  { key: 'sellerFullName', label: 'Seller full name', dataType: 'string', validators: ['required_text'], sourcePath: 'seller.fullName' },
  { key: 'sellerIdNumber', label: 'Seller identity number', dataType: 'id_number', validators: ['sa_id'], sourcePath: 'seller.idNumber' },
  { key: 'sellerEmail', label: 'Seller email', dataType: 'string', validators: ['email'], sourcePath: 'seller.email' },
  { key: 'sellerPhone', label: 'Seller telephone', dataType: 'string', validators: ['sa_phone'], sourcePath: 'seller.phone' },
  { key: 'propertyAddress', label: 'Property address', dataType: 'string', validators: ['required_text'], sourcePath: 'property.addressLine' },
  { key: 'propertyErf', label: 'Erf / title description', dataType: 'string', required: false, sourcePath: 'property.reference' },
  { key: 'mandateType', label: 'Mandate type', dataType: 'string', validators: ['required_text'], sourcePath: 'mandate.type' },
  { key: 'listPrice', label: 'List price', dataType: 'currency', validators: ['positive'], sourcePath: 'mandate.listPrice' },
  { key: 'commissionPct', label: 'Commission percentage', dataType: 'number', validators: ['percentage', 'positive'], sourcePath: 'mandate.commissionPct' },
  { key: 'startDate', label: 'Start date', dataType: 'date', validators: ['date'], sourcePath: 'mandate.startDate' },
  { key: 'endDate', label: 'End date', dataType: 'date', validators: ['date'], sourcePath: 'mandate.endDate' },
  { key: 'agentName', label: 'Agent', dataType: 'string', validators: ['required_text'], sourcePath: 'agent.name' },
];

const OTP_FIELDS: FieldSeed[] = [
  { key: 'buyerFullName', label: 'Purchaser full name', dataType: 'string', validators: ['required_text'], sourcePath: 'buyer.fullName' },
  { key: 'buyerIdNumber', label: 'Purchaser identity number', dataType: 'id_number', validators: ['sa_id'], sourcePath: 'buyer.idNumber' },
  { key: 'buyerEmail', label: 'Purchaser email', dataType: 'string', validators: ['email'], sourcePath: 'buyer.email' },
  { key: 'sellerFullName', label: 'Seller full name', dataType: 'string', validators: ['required_text'], sourcePath: 'seller.fullName' },
  { key: 'sellerIdNumber', label: 'Seller identity number', dataType: 'id_number', validators: ['sa_id'], sourcePath: 'seller.idNumber' },
  { key: 'propertyAddress', label: 'Property address', dataType: 'string', validators: ['required_text'], sourcePath: 'property.addressLine' },
  { key: 'offerAmount', label: 'Offer amount', dataType: 'currency', validators: ['positive'], sourcePath: 'offer.amount' },
  { key: 'depositAmount', label: 'Deposit', dataType: 'currency', validators: ['positive'], sourcePath: 'offer.depositAmount' },
  { key: 'bondAmount', label: 'Bond amount', dataType: 'currency', required: false, validators: ['currency'], sourcePath: 'offer.bondAmount' },
  { key: 'bondApprovalDays', label: 'Bond approval period (days)', dataType: 'number', required: false, validators: ['positive'], sourcePath: 'offer.bondApprovalDays', conditionalOn: { path: 'offer.bondAmount', present: true } },
  { key: 'occupationDate', label: 'Occupation date', dataType: 'date', validators: ['date'], sourcePath: 'offer.occupationDate' },
  { key: 'offerDate', label: 'Offer date', dataType: 'date', validators: ['date'], sourcePath: 'offer.createdAt' },
  { key: 'agentName', label: 'Agent', dataType: 'string', validators: ['required_text'], sourcePath: 'agent.name' },
];

const WORKFLOWS: Array<{ key: string; name: string; description: string; trigger: Prisma.InputJsonValue; steps: Prisma.InputJsonValue }> = [
  {
    key: 'lead.intake',
    name: 'New lead arrives',
    description: 'Create the record, assign an owner, respond, and schedule the follow-up.',
    trigger: { type: 'event', event: 'lead.created' },
    steps: [
      { key: 'route', workKey: 'lead.assign' },
      { key: 'first_response', workKey: 'lead.first_response' },
      { key: 'schedule_follow_up', workKey: 'buyer.follow_up', delayHours: 48 },
    ],
  },
  {
    key: 'viewing.completed',
    name: 'Viewing completed',
    description: 'Request buyer feedback, update the seller, and move the lead on.',
    trigger: { type: 'event', event: 'viewing.completed' },
    steps: [
      { key: 'request_feedback', workKey: 'viewing.feedback_request', delayHours: 4 },
      { key: 'update_seller', workKey: 'seller.progress_update', delayHours: 24 },
    ],
  },
  {
    key: 'mandate.requested',
    name: 'Mandate requested',
    description: 'Gather the information, prepare the package, validate it, and route it for approval.',
    trigger: { type: 'event', event: 'mandate.requested' },
    steps: [
      { key: 'collect_fica', workKey: 'fica.collect' },
      { key: 'prepare', workKey: 'mandate.prepare' },
      { key: 'approval', type: 'approval' },
      { key: 'signature', type: 'signature' },
    ],
  },
  {
    key: 'otp.received',
    name: 'Offer received',
    description: 'Read the offer, validate it, open the transaction, and identify what is missing.',
    trigger: { type: 'event', event: 'offer.received' },
    steps: [
      { key: 'validate', workKey: 'otp.validate' },
      { key: 'build_checklist', workKey: 'transaction.build_checklist' },
      { key: 'approval', type: 'approval' },
    ],
  },
  {
    key: 'daily.sweep',
    name: 'Daily risk sweep',
    description: 'Find what is falling through the cracks and clear what can be cleared.',
    trigger: { type: 'schedule', cron: '0 6 * * *' },
    steps: [{ key: 'sweep', type: 'risk_sweep' }],
  },
];

async function main() {
  const password = process.env.SEED_PASSWORD;
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  if (!password) {
    console.log('No SEED_PASSWORD set — users are created without a password and cannot sign in until one is set.');
  }

  for (const member of TEAM) {
    await prisma.user.upsert({
      where: { email: member.email },
      update: { name: member.name, role: member.role, department: member.department, isCeo: member.isCeo ?? false },
      create: {
        email: member.email,
        name: member.name,
        role: member.role,
        department: member.department,
        isCeo: member.isCeo ?? false,
        weeklyCapacityHours: member.weeklyCapacityHours ?? 40,
        passwordHash,
      },
    });
  }
  console.log(`Seeded ${TEAM.length} team members.`);

  const templates: Array<{ key: string; name: string; kind: Prisma.TemplateCreateInput['kind']; fields: FieldSeed[]; requiredApproval: Prisma.TemplateVersionCreateInput['requiredApproval']; signatories: string[] }> = [
    { key: 'mandate', name: 'Sole / open mandate', kind: 'MANDATE', fields: MANDATE_FIELDS, requiredApproval: 'APPROVAL', signatories: ['seller', 'agent'] },
    { key: 'otp', name: 'Offer to purchase', kind: 'OTP', fields: OTP_FIELDS, requiredApproval: 'SIGNATURE', signatories: ['purchaser', 'seller', 'agent'] },
  ];

  for (const t of templates) {
    const template = await prisma.template.upsert({
      where: { key: t.key },
      update: { name: t.name, kind: t.kind },
      create: { key: t.key, name: t.name, kind: t.kind, description: 'Field definitions ready; wording awaiting GRLP’s approved template.' },
    });

    const body =
      UNAPPROVED_NOTICE +
      t.fields.map((f) => `${f.label}: {{${f.key}}}`).join('\n') +
      '\n\n[ Replace everything above with the approved GRLP wording. Keep the double-brace ' +
      'field markers exactly as they appear above — they are what the system fills in. ]';

    // Idempotent in two steps rather than one: a version that exists but has no
    // fields is a half-finished seed, not a finished one, and skipping it would
    // leave a template that silently produces an empty document.
    const version = await prisma.templateVersion.upsert({
      where: { templateId_version: { templateId: template.id, version: 1 } },
      update: {},
      create: {
        templateId: template.id,
        version: 1,
        body,
        requiredApproval: t.requiredApproval,
        signatoryRoles: t.signatories,
        // Deliberately null: unapproved wording cannot produce a document.
        approvedAt: null,
        approvedById: null,
      },
    });

    for (const [i, f] of t.fields.entries()) {
      await prisma.templateField.upsert({
        where: { versionId_key: { versionId: version.id, key: f.key } },
        update: {
          label: f.label,
          dataType: f.dataType,
          required: f.required ?? true,
          validators: f.validators ?? [],
          sourcePath: f.sourcePath ?? null,
          conditionalOn: f.conditionalOn ?? Prisma.DbNull,
          order: i,
        },
        create: {
          versionId: version.id,
          key: f.key,
          label: f.label,
          dataType: f.dataType,
          required: f.required ?? true,
          validators: f.validators ?? [],
          sourcePath: f.sourcePath ?? null,
          conditionalOn: f.conditionalOn ?? Prisma.DbNull,
          order: i,
        },
      });
    }
  }
  for (const t of templates) {
    const count = await prisma.templateField.count({
      where: { version: { template: { key: t.key }, version: 1 } },
    });
    if (count !== t.fields.length) {
      throw new Error(`Template "${t.key}" has ${count} fields, expected ${t.fields.length}. The seed did not complete.`);
    }
  }
  console.log(`Seeded ${templates.length} templates (field definitions only — wording awaits approval).`);

  for (const w of WORKFLOWS) {
    await prisma.workflowDefinition.upsert({
      where: { key: w.key },
      update: { name: w.name, description: w.description, trigger: w.trigger, steps: w.steps },
      create: w,
    });
  }
  console.log(`Seeded ${WORKFLOWS.length} workflow definitions.`);

  for (const spec of INTEGRATIONS) {
    const missing = missingEnvFor(spec);
    await prisma.integration.upsert({
      where: { key: spec.key },
      update: {
        status: missing.length === spec.requiredEnv.length ? 'NOT_CONFIGURED' : missing.length ? 'CREDENTIALS_MISSING' : 'CONNECTED',
        requiredEnv: spec.requiredEnv,
        scopes: spec.scopes,
        notes: spec.degradedBehaviour,
      },
      create: {
        key: spec.key,
        name: spec.name,
        category: spec.category,
        status: missing.length === spec.requiredEnv.length ? 'NOT_CONFIGURED' : missing.length ? 'CREDENTIALS_MISSING' : 'CONNECTED',
        requiredEnv: spec.requiredEnv,
        scopes: spec.scopes,
        notes: spec.degradedBehaviour,
      },
    });
  }
  console.log(`Registered ${INTEGRATIONS.length} integrations with their real status.`);

  console.log('\nNo clients, properties, leads or transactions were created. Import GRLP’s real records.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
