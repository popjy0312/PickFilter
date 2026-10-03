const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCount } = require('../core.js');
test('counts accept whole numbers, whitespace, and correctly grouped commas', () => {
  for (const [input, expected] of [['0',0], ['999',999], ['1000',1000], [' 1,234 ',1234], ['1,234,567',1234567]]) {
    assert.equal(parseCount(input), expected);
  }
});
test('missing, malformed, fractional, negative, and unsafe counts stay unreadable', () => {
  for (const input of ['', ' ', '비공개', '-1', '1.2', '1,23', '12,34,567', '조회수 123', '1e3', '9007199254740992']) {
    assert.equal(parseCount(input), null, input);
  }
});

test('page numbers share settings while other paths, origins and queries stay separate', () => {
  const { scopeKey } = require('../core.js');
  const base = 'https://www.fmkorea.com/starcraft';
  assert.equal(scopeKey(base), scopeKey(base + '?page=2#list'));
  assert.equal(scopeKey(base), scopeKey('https://www.fmkorea.com/index.php?mid=starcraft&page=3'));
  assert.notEqual(scopeKey(base), scopeKey('https://www.fmkorea.com/other?page=2'));
  assert.notEqual(scopeKey(base), scopeKey(base + '/12345'));
  assert.notEqual(scopeKey(base), scopeKey(base + '?search_keyword=test'));
  assert.notEqual(scopeKey(base), scopeKey('https://other.example/starcraft'));
});
