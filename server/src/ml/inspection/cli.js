/**
 * Inspection protocol generator — command line.
 *
 *   npm run inspect:demo                 the demo products → examples/output/*.json
 *   npm run inspect:generate -- in.json  one product (JSON matching InputSchema)
 *   add --no-ai to force the baseline-only path
 *
 * AI augmentation runs only when Anthropic credentials are configured
 * (see ai.js); otherwise protocols are baseline-only and say so.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import { generateInspectionProtocol } from './generate.js';
import { DEMO_CASES } from './examples/cases.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const noAi = args.includes('--no-ai');
const opts = noAi ? { ai: false } : {};

function printProtocol(p) {
  const g = p.generation;
  console.log(`\n━━ ${p.productName}  →  ${p.categoryLabel}  (${p.classification.method}; matched: ${p.classification.matchedTerms.join(', ') || '—'})`);
  console.log(`   ${p.summary.total} parameters · ${p.summary.critical} critical · ${p.summary.claimChecks} claim checks · ${p.summary.requiresQualifiedInspector} need a qualified inspector`);
  console.log(`   mode ${g.mode} · AI ${g.ai.status}${g.ai.reason ? ` (${g.ai.reason})` : ''} · model ${g.modelVersion} · ${g.templateVersion}`);
  if (p.summary.brandProfiles.length) console.log(`   product-specific profiles: ${p.summary.brandProfiles.join(', ')}`);
  if (p.inspectionScope.sampleSize) console.log(`   scope: ${p.inspectionScope.rule}`);
  let section = '';
  p.parameters.forEach((x, i) => {
    if (x.category !== section) {
      section = x.category;
      console.log(`   ${section.toUpperCase()}`);
    }
    const claim = x.claimedValue !== undefined ? `  [claim: ${x.claimedValue}]` : '';
    const flags = [x.priority, x.requiresQualifiedInspector ? 'qualified' : '', x.appliesTo !== 'every_unit' ? x.appliesTo : '', x.generationSource !== 'baseline' ? x.generationSource : '']
      .filter(Boolean)
      .join(', ');
    console.log(`   ${String(i + 1).padStart(3)}. ${x.title}${claim}  (${flags})`);
  });
}

async function main() {
  const outDir = path.join(HERE, 'examples', 'output');
  mkdirSync(outDir, { recursive: true });

  if (args[0] === 'generate') {
    const file = args.find((a, i) => i > 0 && !a.startsWith('--'));
    if (!file) throw new Error('Usage: npm run inspect:generate -- <input.json> [--no-ai]');
    const protocol = await generateInspectionProtocol(JSON.parse(readFileSync(file, 'utf8')), opts);
    printProtocol(protocol);
    if (args.includes('--json')) console.log(JSON.stringify(protocol, null, 2));
    return;
  }

  for (const c of DEMO_CASES) {
    const protocol = await generateInspectionProtocol(c.input, opts);
    printProtocol(protocol);
    writeFileSync(path.join(outDir, `${c.key}.json`), JSON.stringify(protocol, null, 2) + '\n');
  }
  console.log(`\nFull protocols written to ${path.relative(process.cwd(), outDir)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
