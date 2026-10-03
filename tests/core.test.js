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
