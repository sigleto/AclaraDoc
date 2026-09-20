import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocument } from '../src/services/analysis';
import { decodeHistory, encodeHistory } from '../src/services/history';
import type { SelectedDocument } from '../src/types/document';
const document: SelectedDocument = { id: 'test', createdAt: new Date().toISOString(), pages: [
  { id: '1', uri: 'file:///private/secret.jpg', name: 'private-name.jpg', kind: 'image', pageCount: 1 },
  { id: '2', uri: 'content://private/document.pdf', name: 'private-name.pdf', kind: 'pdf', pageCount: null },
] };
test('simulator supports mixed multipage input and does not access URIs', async () => {
  const result = await analyzeDocument(document);
  assert.equal(result.simulated, true);
  assert.equal(result.confidence.level, 'unavailable');
  assert.equal(result.deadlines[0].date, null);
  assert.ok(result.actions.length);
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('empty selections cannot be analyzed', async () => {
  await assert.rejects(analyzeDocument({ ...document, pages: [] }));
});
test('persistence strips attachments and unknown fields even when nested', async () => {
  const result = await analyzeDocument(document);
  const contaminated = { ...result, pages: document.pages, uri: 'private', actions: result.actions.map(a => ({ ...a, uri: 'private' })) };
  const encoded = encodeHistory([contaminated]);
  assert.ok(!encoded.includes('private'));
  assert.deepEqual(decodeHistory(encoded), [result]);
});
test('history handles empty, corrupt and malformed storage', () => {
  assert.deepEqual(decodeHistory(null), []);
  for (const raw of ['invalid', '{}', '[null]', '[{"simulated":true}]']) assert.throws(() => decodeHistory(raw));
});
test('history keeps at most 50 results', async () => {
  const result = await analyzeDocument(document);
  assert.equal(decodeHistory(encodeHistory(Array.from({ length: 60 }, (_, i) => ({ ...result, id: String(i) })))).length, 50);
});
