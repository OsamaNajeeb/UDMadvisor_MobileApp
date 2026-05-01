// utils/planStorage.js
//
// Local import/export for Personalize Plan.
// - Plans live in AsyncStorage under `udmadvisor.imported_plans` (index)
//   and one blob per plan under `udmadvisor.imported_plan.<id>`.
// - Exchange formats:
//     * JSON file  → .udmplan extension (still text/json)
//     * String code → base64(JSON) with "UDM1:" prefix so unknown pastes
//       are rejected fast
// - Shape validation is intentionally lenient. We accept the same shape
//   per_plan.js already renders (program, plan.semesters[].courses[]),
//   because that's what sharePlan/the local state produces.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';

// ---------- keys ----------
const INDEX_KEY = 'udmadvisor.imported_plans';
const blobKey = (id) => `udmadvisor.imported_plan.${id}`;

// ---------- format ----------
const FORMAT = 'udmadvisor.plan';
const FORMAT_VERSION = 1;
const STRING_PREFIX = 'UDM1:'; // bump when the envelope changes

/**
 * Wrap a raw plan object in the transport envelope.
 * Accepts either the full API response ({program, plan: {semesters: [...]}})
 * or an already-wrapped envelope, and returns an envelope.
 */
export function buildEnvelope(plan, { name } = {}) {
  // Already wrapped? trust it but refresh exportedAt.
  if (plan && plan.format === FORMAT) {
    return { ...plan, exportedAt: new Date().toISOString() };
  }
  if (!plan || !plan.plan || !Array.isArray(plan.plan.semesters)) {
    throw new Error('Plan is missing the expected { plan: { semesters: [] } } shape.');
  }
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    name: name || plan.program || 'Imported Plan',
    plan: {
      program: plan.program || '',
      minor: plan.minor || '',
      // Keep plan.plan as-is so per_plan.js renders it with zero changes.
      plan: plan.plan,
    },
  };
}

/**
 * Validate an envelope. Throws a user-friendly Error on problems.
 * Returns the envelope unchanged when valid.
 */
export function validateEnvelope(env) {
  if (!env || typeof env !== 'object') {
    throw new Error('File is empty or not a JSON object.');
  }
  if (env.format !== FORMAT) {
    throw new Error('This file is not a UDM Advisor plan.');
  }
  if (typeof env.version !== 'number') {
    throw new Error('Plan file is missing a version number.');
  }
  if (env.version > FORMAT_VERSION) {
    throw new Error('This plan was exported from a newer version of the app. Please update.');
  }
  if (!env.plan || !env.plan.plan || !Array.isArray(env.plan.plan.semesters)) {
    throw new Error('Plan file is missing semester data.');
  }
  return env;
}

// ---------- JSON file ----------
export function envelopeToJson(env) {
  return JSON.stringify(env, null, 2);
}

export function envelopeFromJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }
  return validateEnvelope(parsed);
}

// ---------- Shareable string (base64) ----------
//
// Why base64 instead of raw JSON in a text box? Two reasons:
//   1. JSON pasted through messaging apps often gets "helpfully" reformatted
//      (smart quotes, line collapsing). Base64 survives that intact.
//   2. A "UDM1:" prefix lets us reject obviously-wrong pastes before trying
//      to parse a hundred-KB blob.
export function envelopeToShareString(env) {
  const json = JSON.stringify(env);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  return STRING_PREFIX + b64;
}

export function envelopeFromShareString(raw) {
  if (typeof raw !== 'string') {
    throw new Error('No code provided.');
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith(STRING_PREFIX)) {
    throw new Error('This code does not look like a UDM Advisor plan.');
  }
  let json;
  try {
    const b64 = trimmed.slice(STRING_PREFIX.length).trim();
    json = Buffer.from(b64, 'base64').toString('utf8');
  } catch (e) {
    throw new Error('Code is corrupted — please ask for it to be re-copied.');
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error('Code is corrupted — the decoded data is not valid JSON.');
  }
  return validateEnvelope(parsed);
}

// ---------- Local library (AsyncStorage) ----------
//
// The index is a JSON array of {id, name, program, importedAt}. The blob
// for each plan is stored separately so listing stays cheap.

function newId() {
  return 'imp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function readIndex() {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    // Corrupt index: reset rather than crash.
    return [];
  }
}

async function writeIndex(index) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/** List imported plans, newest first. */
export async function listImportedPlans() {
  const index = await readIndex();
  return [...index].sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
}

/** Save an envelope locally. Returns the generated id. */
export async function saveImportedPlan(env, { nameOverride } = {}) {
  validateEnvelope(env);
  const id = newId();
  const name = nameOverride || env.name || env.plan?.program || 'Imported Plan';
  const importedAt = new Date().toISOString();

  const meta = { id, name, program: env.plan?.program || '', importedAt };
  const index = await readIndex();
  index.push(meta);

  await AsyncStorage.setItem(blobKey(id), JSON.stringify(env));
  await writeIndex(index);
  return id;
}

/** Load a saved envelope by id, or null if not found. */
export async function loadImportedPlan(id) {
  const raw = await AsyncStorage.getItem(blobKey(id));
  if (!raw) return null;
  try {
    return validateEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Delete a saved plan by id. Silent if it doesn't exist. */
export async function deleteImportedPlan(id) {
  await AsyncStorage.removeItem(blobKey(id));
  const index = await readIndex();
  const next = index.filter((m) => m.id !== id);
  await writeIndex(next);
}

/** Rename a saved plan. */
export async function renameImportedPlan(id, newName) {
  const index = await readIndex();
  const i = index.findIndex((m) => m.id === id);
  if (i === -1) return;
  index[i] = { ...index[i], name: newName };
  await writeIndex(index);
}

/**
 * Update an EXISTING imported plan in-place. Replaces the stored envelope
 * with `env` and refreshes index metadata (name, program, importedAt).
 * Used when the user edits an imported plan and re-exports it — keeps
 * AsyncStorage in sync with the file they just wrote, so the next time
 * they open the plan from Plan Viewer they see their edits.
 *
 * Does nothing if `id` doesn't exist in the index — caller should fall
 * back to saveImportedPlan in that case.
 */
export async function updateImportedPlan(id, env) {
  validateEnvelope(env);
  const index = await readIndex();
  const i = index.findIndex((m) => m.id === id);
  if (i === -1) return false;

  // Refresh the index entry. We deliberately preserve the original `id`
  // and `importedAt` is updated to "now" so this entry sorts to the top
  // of the list (most-recently-touched first), which matches the user's
  // mental model: "I just edited this; show it first."
  index[i] = {
    ...index[i],
    name: env.name || index[i].name,
    program: env.plan?.program || index[i].program,
    importedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(blobKey(id), JSON.stringify(env));
  await writeIndex(index);
  return true;
}