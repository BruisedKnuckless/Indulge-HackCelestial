/**
 * Align the RFQ intake model on Nugen.   Run: npm run rfq:align
 *
 *   base model ─► upload documents (training pairs + domain guide)
 *              ─► upload our benchmark (held-out labelled samples)
 *              ─► alignment project ─► aligned model ─► deploy
 *              ─► nugen-model.json (read by intake.js at inference)
 *
 * Needs NUGEN_API_KEY (server/.env is read). NUGEN_BASE_MODEL picks the base
 * (default llama-v3p2-3b-reasoning; the script lists what your account can align).
 *
 * Alignment takes minutes, so every finished step is saved to
 * data/.align-state.json and a re-run continues from there. --fresh starts over;
 * a changed dataset (npm run rfq:dataset) also starts over.
 *
 * LangChain has no alignment API, so this talks to Nugen's REST API directly;
 * inference goes through LangChain (chain.js).
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DATA_DIR, FILES } from './build-dataset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(DATA_DIR, '.align-state.json');
export const MODEL_FILE = path.join(HERE, 'nugen-model.json');

const BASE_URL = (process.env.NUGEN_BASE_URL || 'https://api.nugen.in').replace(/\/+$/, '');
const API_KEY = process.env.NUGEN_API_KEY;
const BASE_MODEL = process.env.NUGEN_BASE_MODEL || 'llama-v3p2-3b-reasoning';
const POLL_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString();

async function nugen(method, route, { json, form } = {}) {
  const res = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      accept: 'application/json',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : form,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status}: ${text.slice(0, 500)}`);
  return body;
}

/** Poll until done() or failed(); prints each status change. */
async function poll(label, fetchStatus, { done, failed, maxMinutes = 240 }) {
  const deadline = Date.now() + maxMinutes * 60000;
  let last = '';
  for (;;) {
    const s = await fetchStatus();
    const line = [s.status, s.progress != null ? `${s.progress}%` : null, s.queue_position != null ? `queue ${s.queue_position}` : null, s.eta_seconds ? `eta ${s.eta_seconds}s` : null]
      .filter(Boolean)
      .join(' · ');
    if (line !== last) console.log(`  [${stamp()}] ${label}: ${line}`);
    last = line;
    if (done(s.status)) return s;
    if (failed(s.status)) throw new Error(`${label} ended ${s.status}${s.error ? `: ${s.error}` : ''}`);
    if (Date.now() > deadline) throw new Error(`${label} still ${s.status} after ${maxMinutes} min — re-run to keep waiting`);
    await sleep(POLL_MS);
  }
}

function fileBlob(name, type) {
  return new Blob([readFileSync(path.join(DATA_DIR, name))], { type });
}

function loadState(datasetHash) {
  if (process.argv.includes('--fresh') && existsSync(STATE_FILE)) rmSync(STATE_FILE);
  if (!existsSync(STATE_FILE)) return { datasetHash };
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  if (state.datasetHash !== datasetHash) {
    console.log('Dataset changed since the last run — starting a new alignment.');
    return { datasetHash };
  }
  return state;
}

const saveState = (state) => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

async function main() {
  if (!API_KEY) {
    console.error('NUGEN_API_KEY is not set. Add it to server/.env (see .env.example).');
    process.exit(1);
  }
  const manifestPath = path.join(DATA_DIR, FILES.manifest);
  if (!existsSync(manifestPath)) {
    console.error('No dataset yet. Run: npm run rfq:dataset');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const state = loadState(manifest.datasetHash);

  // A saved alignment might already be FAILED/STOPPED from an earlier run
  // (e.g. a base model this account can't align) — reconcile that up front,
  // before the base-model check below, so a re-run doesn't keep proposing
  // the same dead alignment (and its now-wrong base model) forever.
  if (state.alignmentId) {
    try {
      const s = await nugen('GET', `/api/v3/alignment-projects/${state.alignmentId}/status`);
      if (s.status === 'FAILED' || s.status === 'STOPPED') {
        console.log(`Previous alignment ${state.alignmentId} ended ${s.status} — starting a new one.\n`);
        delete state.alignmentId;
        delete state.modelId;
        saveState(state);
      }
    } catch {
      // Can't check right now — fall through and let the normal poll below surface it.
    }
  }

  // An alignment already under way (or done) keeps the base model it was
  // created with; a fresh attempt (nothing saved yet, or a prior one was
  // cleared after failing) always uses the currently configured BASE_MODEL —
  // so fixing NUGEN_BASE_MODEL after a bad first pick takes effect without --fresh.
  state.baseModelId = state.alignmentId ? state.baseModelId : BASE_MODEL;
  console.log(`Nugen alignment · dataset ${manifest.datasetHash} · base ${state.baseModelId}\n`);

  // 1. What can this account align? A model that isn't even in this account's
  // catalog is a hard stop here — Nugen accepts the alignment request either
  // way and only fails it minutes later, so catching it now saves that wait.
  let baseModels = [];
  try {
    const res = await nugen('GET', '/api/v3/models/base');
    baseModels = res.models || [];
    console.log('Base models on this account:');
    for (const m of baseModels) {
      console.log(`  ${m.alignment_ready ? '✓' : ' '} ${m.model_id}${m.parameters ? ` (${m.parameters})` : ''}${m.available_on_request ? ' — on request' : ''}`);
    }
    console.log();
  } catch (err) {
    console.warn(`Could not list base models (${err.message}); continuing with ${state.baseModelId}.\n`);
  }
  if (baseModels.length) {
    const chosen = baseModels.find((m) => m.model_id === state.baseModelId);
    if (!chosen) {
      const alignable = baseModels.filter((m) => m.alignment_ready).map((m) => m.model_id);
      throw new Error(
        `${state.baseModelId} is not a model on this account. Set NUGEN_BASE_MODEL to one of: ${alignable.join(', ') || '(none marked alignment_ready)'}`
      );
    }
    if (!chosen.alignment_ready) console.warn(`  ! ${state.baseModelId} is not marked alignment_ready; it may still fail once alignment starts.\n`);
  }

  // 2. Documents: the training pairs and the domain guide.
  if (!state.documentIds) {
    console.log('Uploading documents…');
    const form = new FormData();
    form.append('files', fileBlob(FILES.train, 'application/json'), FILES.train);
    form.append('files', fileBlob(FILES.guide, 'text/markdown'), FILES.guide);
    form.append('names', 'Indulge RFQ intake - training pairs');
    form.append('names', 'Indulge RFQ intake - domain guide');
    form.append('categories', 'indulge-rfq');
    const { document_ids: ids } = await nugen('POST', '/api/v3/documents/create', { form });
    if (!ids?.length) throw new Error('Nugen returned no document ids');
    state.documentIds = ids;
    saveState(state);
    console.log(`  documents ${ids.join(', ')}`);
  }
  try {
    for (const id of state.documentIds) {
      await poll(`document ${id}`, () => nugen('GET', `/api/v3/documents/${id}/status`), {
        done: (s) => s === 'READY',
        failed: (s) => s === 'FAILED',
        maxMinutes: 30,
      });
    }
  } catch (err) {
    // A terminally failed upload can't be retried by its own id — drop it so
    // a re-run uploads fresh documents instead of polling a dead one forever.
    delete state.documentIds;
    saveState(state);
    throw err;
  }

  // 3. Our own benchmark, so alignment is scored on this task.
  if (!state.benchmarkId) {
    console.log('Uploading benchmark…');
    const form = new FormData();
    form.append('file', fileBlob(FILES.benchmark, 'application/json'), FILES.benchmark);
    form.append('benchmark_name', `Indulge RFQ intake ${manifest.datasetHash}`);
    form.append('document_id', state.documentIds[0]);
    form.append('description', `${manifest.sizes.benchmark} held-out RFQ requests with gold JSON (${manifest.promptVersion})`);
    const res = await nugen('POST', '/api/v3/benchmarks/upload', { form });
    state.benchmarkId = res.benchmark_id;
    saveState(state);
    console.log(`  benchmark ${state.benchmarkId} (${res.n_samples ?? '?'} samples)`);
  }
  try {
    await poll(`benchmark ${state.benchmarkId}`, () => nugen('GET', `/api/v3/benchmarks/${state.benchmarkId}/status`), {
      done: (s) => s === 'READY',
      failed: (s) => s === 'FAILED',
      maxMinutes: 30,
    });
  } catch (err) {
    delete state.benchmarkId;
    saveState(state);
    throw err;
  }

  // 4. Alignment.
  if (!state.alignmentId) {
    console.log('Creating alignment project…');
    const res = await nugen('POST', '/api/v3/alignment-projects/create', {
      json: {
        alignment_name: `indulge-rfq-intake-${manifest.datasetHash.slice(0, 8)}`,
        base_model_id: state.baseModelId,
        document_ids: state.documentIds,
        benchmark_id: state.benchmarkId,
        description: 'Indulge RFQ intake: free-text hospitality requests (Indian units, Hinglish) to structured RFQ JSON.',
      },
    });
    state.alignmentId = res.alignment_id;
    saveState(state);
    console.log(`  alignment ${state.alignmentId}`);
  }
  try {
    await poll(`alignment ${state.alignmentId}`, () => nugen('GET', `/api/v3/alignment-projects/${state.alignmentId}/status`), {
      done: (s) => s === 'COMPLETED' || s === 'READY',
      failed: (s) => s === 'FAILED' || s === 'STOPPED',
    });
  } catch (err) {
    // A FAILED/STOPPED alignment is terminal — re-polling the same id next
    // run would just fail again immediately. Clear it so a re-run creates a
    // new alignment project (picking up NUGEN_BASE_MODEL fresh, if changed).
    delete state.alignmentId;
    saveState(state);
    throw err;
  }

  // 5. The aligned model it produced.
  if (!state.modelId) {
    const { domain_aligned_models: models = [] } = await nugen('GET', '/api/v3/models/aligned');
    const model = models.find((m) => m.alignment_id === state.alignmentId);
    if (!model) throw new Error(`No aligned model found for ${state.alignmentId} yet — re-run in a minute`);
    state.modelId = model.model_id;
    state.modelName = model.model_name;
    saveState(state);
    console.log(`  aligned model ${state.modelId}`);
  }

  // 6. Deploy it.
  const current = await nugen('GET', `/api/v3/models/${state.modelId}/deployment/status`).catch(() => ({ status: 'UNDEPLOYED' }));
  if (!['DEPLOYED', 'DEPLOYING'].includes(current.status)) {
    console.log('Deploying…');
    await nugen('POST', `/api/v3/models/${state.modelId}/deployment`, { json: {} });
  }
  await poll(`deployment ${state.modelId}`, () => nugen('GET', `/api/v3/models/${state.modelId}/deployment/status`), {
    done: (s) => s === 'DEPLOYED',
    failed: (s) => s === 'FAILED',
    maxMinutes: 60,
  });

  // 7. Record it for inference.
  const record = {
    modelId: state.modelId,
    modelName: state.modelName || null,
    baseModelId: state.baseModelId,
    alignmentId: state.alignmentId,
    benchmarkId: state.benchmarkId,
    documentIds: state.documentIds,
    datasetHash: manifest.datasetHash,
    promptVersion: manifest.promptVersion,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(MODEL_FILE, JSON.stringify(record, null, 2) + '\n');
  console.log(`\nDeployed. Wrote ${path.relative(process.cwd(), MODEL_FILE)} — the intake route now uses ${state.modelId}.`);
  console.log('Next: npm run rfq:eval');
}

main().catch((err) => {
  console.error(`\nAlignment stopped: ${err.message}\nRe-run npm run rfq:align to continue from the last finished step.`);
  process.exit(1);
});
