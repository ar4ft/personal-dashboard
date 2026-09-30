import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { route, slug, sections, select } from '../src/lib/model.mjs';
const data = JSON.parse(readFileSync(new URL('../src/data/dashboard.json', import.meta.url)));
test('Pages project paths stay inside the configured base', () => {
  assert.equal(route('/personal-dashboard/', 'news/'), '/personal-dashboard/news/');
  assert.equal(route('/', 'ideas/build/'), '/ideas/build/');
  assert.equal(route('/personal-dashboard/'), '/personal-dashboard/');
  assert.equal(slug('Twitter / X'), 'twitter-x');
});
test('Every news and idea subsection has matching starter content', () => {
  for (const [section, field] of [['news','source'], ['ideas','stage']]) {
    for (const filter of sections[section].filters) assert.ok(select(data[section],field,filter).length > 0, `${section}: ${filter}`);
  }
});
test('Content IDs are unique and dates, URLs, and task defaults are valid', () => {
  for (const collection of ['news','ideas','todos','events']) {
    assert.equal(new Set(data[collection].map(item=>item.id)).size,data[collection].length);
  }
  for(const item of data.news) assert.equal(new URL(item.url).protocol,'https:');
  for(const item of data.todos) assert.equal(typeof item.done,'boolean');
  for(const event of data.events) {
    assert.match(event.date,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${event.date}T12:00:00Z`).toISOString().slice(0,10),event.date);
    assert.match(event.time,/^(?:[01]\d|2[0-3]):[0-5]\d$/);
  }
});
