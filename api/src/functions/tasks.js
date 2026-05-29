'use strict';

const { app } = require('@azure/functions');
const { MongoClient, ObjectId } = require('mongodb');

// Standardopgaver der oprettes automatisk første gang databasen er tom.
const DEFAULT_TASKS = [
  'Støvsuge',
  'Tømme skraldespande',
  'Tømme skraldespande i køkken',
  'Rengøre køkken og håndvask',
  'Tørre kontorborde af',
  'Rengøre toiletter',
  'Vaske gulv',
  'Tørre vindueskarme af',
  'Tørre døre og håndtag af',
  'Rengør køleskab',
  'Vande planter',
  'Tørre spiseborde af',
  'Tørre borde af i mødelokaler',
  'Påfyld toiletpapir og håndklædeark'
];

// ── MongoDB-forbindelse (genbruges på tværs af kald) ──
let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Miljøvariablen MONGODB_URI er ikke sat.');
    clientPromise = new MongoClient(uri).connect();
  }
  return clientPromise;
}

async function getCollection() {
  const client = await getClient();
  const dbName = process.env.MONGODB_DB || 'rengoring';
  return client.db(dbName).collection('tasks');
}

async function ensureSeed(col) {
  const count = await col.countDocuments();
  if (count === 0) {
    await col.insertMany(DEFAULT_TASKS.map(name => ({ name, completions: [] })));
  }
}

// Gør et Mongo-dokument klar til JSON (ObjectId → string).
function serialize(doc) {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    completions: (doc.completions || []).map(c => ({
      _id: c._id.toString(),
      person: c.person,
      date: c.date,
      timestamp: c.timestamp
    }))
  };
}

function json(status, body) {
  return { status, jsonBody: body };
}

async function readBody(req) {
  try { return await req.json(); } catch (e) { return null; }
}

// ── GET /api/tasks ──  Hent alle opgaver med historik
app.http('getTasks', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'tasks',
  handler: async () => {
    const col = await getCollection();
    await ensureSeed(col);
    const docs = await col.find().toArray();
    return json(200, docs.map(serialize));
  }
});

// ── POST /api/tasks ──  Opret ny opgave
app.http('createTask', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'tasks',
  handler: async (req) => {
    const body = await readBody(req);
    const name = body && typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return json(400, { error: 'Opgavens titel mangler.' });
    const col = await getCollection();
    const existing = await col.findOne({ name });
    if (existing) return json(409, { error: 'Der findes allerede en opgave med den titel.' });
    const result = await col.insertOne({ name, completions: [] });
    return json(201, serialize({ _id: result.insertedId, name, completions: [] }));
  }
});

// ── PATCH /api/tasks/{id} ──  Omdøb opgave
app.http('updateTask', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'tasks/{id}',
  handler: async (req) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return json(400, { error: 'Ugyldigt id.' });
    const body = await readBody(req);
    const name = body && typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return json(400, { error: 'Titlen må ikke være tom.' });
    const col = await getCollection();
    const dup = await col.findOne({ name, _id: { $ne: new ObjectId(id) } });
    if (dup) return json(409, { error: 'Der findes allerede en opgave med den titel.' });
    const r = await col.updateOne({ _id: new ObjectId(id) }, { $set: { name } });
    if (!r.matchedCount) return json(404, { error: 'Opgaven blev ikke fundet.' });
    const doc = await col.findOne({ _id: new ObjectId(id) });
    return json(200, serialize(doc));
  }
});

// ── DELETE /api/tasks/{id} ──  Slet opgave
app.http('deleteTask', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'tasks/{id}',
  handler: async (req) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return json(400, { error: 'Ugyldigt id.' });
    const col = await getCollection();
    await col.deleteOne({ _id: new ObjectId(id) });
    return { status: 204 };
  }
});

// ── POST /api/tasks/{id}/completions ──  Registrér en udførelse
app.http('addCompletion', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'tasks/{id}/completions',
  handler: async (req) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return json(400, { error: 'Ugyldigt id.' });
    const body = await readBody(req);
    const person = body && typeof body.person === 'string' ? body.person.trim() : '';
    const date = body && typeof body.date === 'string' ? body.date.trim() : '';
    if (!person || !date) return json(400, { error: 'Navn og dato kræves.' });
    const col = await getCollection();
    const completion = { _id: new ObjectId(), person, date, timestamp: Date.now() };
    const r = await col.updateOne({ _id: new ObjectId(id) }, { $push: { completions: completion } });
    if (!r.matchedCount) return json(404, { error: 'Opgaven blev ikke fundet.' });
    const doc = await col.findOne({ _id: new ObjectId(id) });
    return json(201, serialize(doc));
  }
});

// ── DELETE /api/tasks/{id}/completions/{cid} ──  Fjern en udførelse
app.http('deleteCompletion', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'tasks/{id}/completions/{cid}',
  handler: async (req) => {
    const { id, cid } = req.params;
    if (!ObjectId.isValid(id) || !ObjectId.isValid(cid)) return json(400, { error: 'Ugyldigt id.' });
    const col = await getCollection();
    await col.updateOne({ _id: new ObjectId(id) }, { $pull: { completions: { _id: new ObjectId(cid) } } });
    return { status: 204 };
  }
});
