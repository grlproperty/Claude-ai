import { readFile } from 'node:fs/promises';
import { prepareDocument, type TemplateVersionSpec } from '../src/domain/documents';
import { OTP_RESIDENTIAL_FIELDS } from '../src/domain/otp-fields';

/**
 * Prepares an offer to purchase from a records file and prints what the
 * reviewer would see.
 *
 *   npx tsx scripts/prepare-otp.ts <wording.txt> <records.json>
 *
 * Wording and records are both read from paths you supply — neither is stored in
 * this repository. The output is the reviewer's view: what was filled, what was
 * derived, what is missing, and what failed a check.
 */
async function main() {
  const [bodyPath, recordsPath] = process.argv.slice(2);
  if (!bodyPath || !recordsPath) {
    console.error('Usage: npx tsx scripts/prepare-otp.ts <wording.txt> <records.json>');
    process.exit(1);
  }

  const template: TemplateVersionSpec = {
    templateKey: 'otp.residential',
    version: 1,
    approvedAt: new Date(),
    requiredApproval: 'SIGNATURE',
    signatoryRoles: ['purchaser', 'seller', 'agent'],
    body: await readFile(bodyPath, 'utf8'),
    fields: OTP_RESIDENTIAL_FIELDS,
  };

  const sources = JSON.parse(await readFile(recordsPath, 'utf8')) as Record<string, unknown>;
  const doc = prepareDocument({ template, sources, checkSet: 'otp' });

  const filled = doc.fields.filter((f) => f.value != null);
  const derived = doc.fields.filter((f) => {
    const spec = OTP_RESIDENTIAL_FIELDS.find((s) => s.key === f.key);
    return spec?.transform && f.value != null;
  });
  const defaulted = doc.fields.filter((f) => {
    const spec = OTP_RESIDENTIAL_FIELDS.find((s) => s.key === f.key);
    return spec?.defaultValue && f.value != null;
  });

  const line = '─'.repeat(72);
  console.log(`\n${line}\nOFFER TO PURCHASE — PREPARED\n${line}`);
  console.log(`Template            otp.residential v${doc.templateVersion}`);
  console.log(`Fields populated    ${filled.length} of ${doc.fields.length}`);
  console.log(`  of which derived  ${derived.length} (amounts in words, periods, long dates)`);
  console.log(`  of which default  ${defaulted.length} (commission, deposit period, other terms)`);
  console.log(`Required missing    ${doc.missingRequired.length}`);
  console.log(`Checks              ${doc.issues.filter((i) => i.severity === 'error').length} error(s), ${doc.issues.filter((i) => i.severity === 'warning').length} to confirm`);
  console.log(`Verdict             ${doc.readyForReview ? 'READY FOR REVIEW AND SIGNATURE' : 'NOT READY'}`);

  if (doc.missingRequired.length) {
    console.log(`\nSTILL NEEDED (${doc.missingRequired.length})`);
    for (const key of doc.missingRequired) {
      const field = doc.fields.find((f) => f.key === key)!;
      console.log(`  · ${field.label}`);
    }
  }

  const errors = doc.issues.filter((i) => i.severity === 'error');
  if (errors.length) {
    console.log(`\nERRORS (${errors.length})`);
    for (const i of errors) console.log(`  · ${i.field}: ${i.message}`);
  }

  const warnings = doc.issues.filter((i) => i.severity === 'warning');
  if (warnings.length) {
    console.log(`\nTO CONFIRM (${warnings.length})`);
    for (const i of warnings) console.log(`  · ${i.field}: ${i.message}`);
  }

  console.log(`\n${line}\nDOCUMENT\n${line}\n`);
  console.log(doc.body);
  console.log(`${line}`);
  console.log(
    doc.readyForReview
      ? 'The document is complete. It needs Mandy to read it and sign. The system does not sign.'
      : 'The document is not ready. The gaps above are marked in the text so they cannot be missed.',
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
