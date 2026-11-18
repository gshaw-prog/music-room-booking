// Local data store (browser localStorage). Used by api.js in demo mode.
import { ROOMS } from './config.js';
import { seedData } from './seed.js';

const KEY = 'mrb.data.v1';
let state = null;

export async function init() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) { /* storage unavailable — fall back to memory */ }
  if (!state || !Array.isArray(state.users)) {
    state = await seedData();
    save();
  }
  // Make sure every configured room exists (e.g. after adding one in config.js)
  for (const r of ROOMS) {
    if (!state.rooms.find((x) => x.id === r.id)) state.rooms.push(defaultRoom(r));
  }
  state.emails ||= [];
}

export function defaultRoom(r) {
  const image = `assets/rooms/${r.id}.svg`;
  return { ...r, equipment: [...r.equipment], image, defaultImage: image };
}

export function data() { return state; }

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error(e);
    throw new Error('Could not save — browser storage may be full. Try using smaller room images.');
  }
}

export async function reset() { state = await seedData(); save(); }
export function replace(next) { state = next; save(); }
