/**
 * Evaluate the inspection generator against a labelled set.
 *
 *   npm run inspect:eval                    baseline-only (deterministic, offline)
 *   npm run inspect:eval -- --ai            include the AI layer (needs credentials)
 *   npm run inspect:eval -- --file x.jsonl  another labelled set (dataset/README.md)
 *
 * Metrics
 *   category accuracy     identified category == expected
 *   parameter recall      share of mustInclude checks present
 *   relevance violations  generated checks mentioning a mustNotInclude term.
 *                         A bounded stand-in for precision: true precision
 *                         needs a complete gold checklist per product, which
 *                         only real technician feedback will provide.
 *   claim coverage        share of provider claims turned into a claim check
 *                         carrying that claimed value
 *   redundancy            pairs of generated checks that name the same thing
 *   validity              protocol passes ProtocolSchema after a JSON round trip
 *   safety                instructions that fail the safety rules (must be 0)
 *
 * The bundled benchmark (dataset/benchmark.jsonl) is hand-authored by the same
 * author as the rules, so its scores are optimistic. It checks the pipeline
 * does what it claims; it is not evidence of real-world accuracy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import { generateInspectionProtocol } from './generate.js';
import { ProtocolSchema } from './schema.js';
import { loadKnowledge, unsafeReason } from './knowledge.js';
import { findDuplicate } from './validate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const useAi = args.includes('--ai');
const fileArg = args[args.indexOf('--file') + 1];
const file = args.includes('--file') ? fileArg : path.join(HERE, 'dataset', 'benchmark.jsonl');

const squash = (s) => String(s).toLowerCase().replace(/[\s,]+/g, '');
const phraseIn = (term, text) =>
  new RegExp(`(^|[^a-z])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(text);

export async function evaluateRecord(record, options = {}) {
  const knowledge = loadKnowledge();
  const protocol = await generateInspectionProtocol(record.input, options);
  const exp = record.expected;
  const params = protocol.parameters;
  const ids = new Set(params.map((p) => p.id));

  const found = exp.mustInclude.filter((id) => ids.has(id) || ids.has(`spec_${id}`));
  const missing = exp.mustInclude.filter((id) => !found.includes(id));

  const violations = [];
  for (const term of exp.mustNotInclude) {
    for (const p of params) {
      const scope = [p.id.replace(/_/g, ' '), p.id, p.title, p.description, ...p.instructions].join(' ').toLowerCase();
      if (phraseIn(term, scope)) violations.push({ term, parameter: p.title });
    }
  }

  const claimResults = exp.claims.map((c) => {
    const hit = params.find((p) => p.claimedValue !== undefined && squash(p.claimedValue).includes(squash(c.value)));
    return { ...c, covered: Boolean(hit), parameter: hit?.title || null };
  });

  const pool = new Map(params.map((p) => [p.id, { ...p, aliases: [], basis: p.basis, reasons: [] }]));
  const redundant = [];
  for (const p of pool.values()) {
    const others = new Map([...pool].filter(([id]) => id !== p.id));
    const dup = findDuplicate(p, others);
    if (dup && p.id < dup.id) redundant.push([p.title, dup.title]);
  }

  const valid = ProtocolSchema.safeParse(JSON.parse(JSON.stringify(protocol))).success;
  const unsafe = params.flatMap((p) =>
    p.instructions.filter((i) => unsafeReason(i, knowledge.compiled.forbidden)).map((i) => ({ parameter: p.title, instruction: i }))
  );

  return {
    recordId: record.recordId,
    product: record.input.productName,
    expectedCategory: exp.category,
    category: protocol.productCategory,
    categoryCorrect: protocol.productCategory === exp.category,
    parameters: params.length,
    recall: exp.mustInclude.length ? found.length / exp.mustInclude.length : 1,
    missing,
    violations,
    claimCoverage: exp.claims.length ? claimResults.filter((c) => c.covered).length / exp.claims.length : 1,
    claims: claimResults,
    redundant,
    valid,
    unsafe,
    mode: protocol.generation.mode,
    aiStatus: protocol.generation.ai.status,
  };
}

async function main() {
  const records = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const options = useAi ? {} : { ai: false };
  const results = [];
  for (const r of records) results.push(await evaluateRecord(r, options));

  const n = results.length;
  const mean = (f) => results.reduce((s, r) => s + f(r), 0) / n;
  const totalParams = results.reduce((s, r) => s + r.parameters, 0);
  const summary = {
    records: n,
    mode: useAi ? 'with AI (if credentials available)' : 'baseline only',
    aiStatuses: [...new Set(results.map((r) => r.aiStatus))],
    categoryAccuracy: mean((r) => (r.categoryCorrect ? 1 : 0)),
    parameterRecall: mean((r) => r.recall),
    relevanceViolations: results.reduce((s, r) => s + r.violations.length, 0),
    relevanceViolationRate: results.reduce((s, r) => s + r.violations.length, 0) / totalParams,
    claimCoverage: mean((r) => r.claimCoverage),
    redundantPairs: results.reduce((s, r) => s + r.redundant.length, 0),
    validProtocols: results.filter((r) => r.valid).length,
    unsafeInstructions: results.reduce((s, r) => s + r.unsafe.length, 0),
    meanParametersPerProtocol: totalParams / n,
    caveat:
      'Hand-authored benchmark by the same author as the rules: scores are optimistic and are not evidence of real-world accuracy. Replace with technician-labelled data (dataset/README.md).',
  };

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`\nInspection generator evaluation — ${n} records (${path.basename(file)}), ${summary.mode}\n`);
  console.log('  id       category              recall   claims   irrelevant  redundant  params');
  for (const r of results) {
    console.log(
      `  ${r.recordId.padEnd(8)} ${(r.categoryCorrect ? '✓ ' : '✗ ') + r.category.padEnd(20)} ${pct(r.recall).padStart(6)}   ${pct(r.claimCoverage).padStart(6)}   ${String(r.violations.length).padStart(5)}      ${String(r.redundant.length).padStart(5)}     ${String(r.parameters).padStart(4)}`
    );
    if (r.missing.length) console.log(`           missing: ${r.missing.join(', ')}`);
    for (const v of r.violations) console.log(`           irrelevant: "${v.term}" in ${v.parameter}`);
    for (const c of r.claims.filter((x) => !x.covered)) console.log(`           claim not covered: ${c.key} = ${c.value}`);
    for (const [a, b] of r.redundant) console.log(`           redundant: ${a} ~ ${b}`);
  }
  console.log(`
  category accuracy      ${pct(summary.categoryAccuracy)}
  parameter recall       ${pct(summary.parameterRecall)}
  relevance violations   ${summary.relevanceViolations} (${pct(summary.relevanceViolationRate)} of generated checks)
  claim coverage         ${pct(summary.claimCoverage)}
  redundant pairs        ${summary.redundantPairs}
  valid protocols        ${summary.validProtocols}/${n}
  unsafe instructions    ${summary.unsafeInstructions}
  mean checks/protocol   ${summary.meanParametersPerProtocol.toFixed(1)}

  ${summary.caveat}\n`);

  const reportPath = path.join(HERE, 'dataset', 'eval-report.json');
  writeFileSync(reportPath, JSON.stringify({ summary, results, generatedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`  Report written to ${path.relative(process.cwd(), reportPath)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
