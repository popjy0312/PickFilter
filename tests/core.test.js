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
  const base = 'https://example.com/board';
  assert.equal(scopeKey(base), scopeKey(base + '?page=2#list'));
  assert.notEqual(scopeKey(base), scopeKey('https://example.com/other?page=2'));
  assert.notEqual(scopeKey(base), scopeKey(base + '/12345'));
  assert.notEqual(scopeKey('https://example.com/index.php?mid=one'), scopeKey('https://example.com/index.php?mid=two'));
  assert.equal(scopeKey('https://example.com/index.php?mid=one'), scopeKey('https://example.com/index.php?page=2&mid=one'));
  assert.notEqual(scopeKey(base), scopeKey(base + '?search_keyword=test'));
  assert.notEqual(scopeKey(base), scopeKey('https://other.example/board'));
});

test('comment badges accept bracketed counts without treating title numbers as metrics', () => {
  const { readCount } = require('../core.js');
  for (const [input, expected] of [['[74]',74], [' [ 1,234 ] ',1234], ['[0]',0], ['74',74]]) {
    assert.equal(readCount(input), expected);
  }
  for (const input of ['[]', '[1,23]', '[-1]', '[1.5]', '제목 [74]', '[74] 제목', '[74][12]', '2026년 경기']) {
    assert.equal(readCount(input), null, input);
  }
  assert.equal(parseCount('[74]'), null, 'threshold input stays strict');
});

test('abbreviated metrics convert English and Korean units to whole counts', () => {
  const { readCount } = require('../core.js');
  for (const [input, expected] of [
    ['1.3k', 1300], ['1.3천', 1300], ['1.3K', 1300], [' 1.3 천 ', 1300],
    ['0.9k', 900], ['1.001k', 1001], ['1.0010k', 1001], ['1.2만', 12000],
    ['2M', 2000000], ['0.5백만', 500000], ['1.5m', 1500000], ['2억', 200000000],
    ['1.2B', 1200000000], ['[1.3k]', 1300], ['[ 1.3천 ]', 1300],
    ['1,234.5k', 1234500], ['0k', 0], ['0.000000001b', 1],
    ['9007199254740.991k', Number.MAX_SAFE_INTEGER],
  ]) assert.equal(readCount(input), expected, input);
  for (const input of ['1.3k', '1.3천', '[1.3k]']) assert.equal(parseCount(input), null, 'threshold remains strict');
});

test('abbreviated metrics reject ambiguous text, malformed values and unsafe counts', () => {
  const { readCount } = require('../core.js');
  for (const input of ['1.3', '1..3k', '-1k', '+1k', '1e3k', '.3k', '1.k',
    '1k2', '1.3kk', '1.3k+',
    '0.0001k', '1.0001k', '9007199254740.992k', '999999999999999999999b']) {
    assert.equal(readCount(input), null, input);
  }
});

const supportedFormats = [
  ['1.3k', 1300], ['1,3k', 1300], ['1,30K', 1300], ['1,234k', 1234000],
  ['1.234,5k', 1234500], ['1.2T', 1200000000000], ['2.5億', 250000000], ['1.3万', 13000], ['1亿', 100000000], ['1万2千', 12000], ['3백', 300],
  ['2백만', 2000000], ['1.5천만', 15000000], ['1.2조', 1200000000000],
  ['1만 2천', 12000], ['1천3백', 1300], ['1만2345', 12345],
  ['1억 2,345만 6,789', 123456789], ['1조 2억 3만 4', 1000200030004],
  ['1 234', 1234], ['1\u00a0234', 1234], ['1\u202f234', 1234], ['1\u2009234', 1234],
  ["1'234", 1234], ['1’234’567', 1234567], ['1.234.567', 1234567],
  ['１．３ｋ', 1300], ['［７４］', 74], ['（１．３万）', 13000], ['(1.3천)', 1300], ['【74】', 74],
  ['조회수 1.3천', 1300], ['조회 수: 1,234회', 1234], ['댓글 [74]', 74],
  ['댓글 수 (1.3k)', 1300], ['좋아요 ２．５Ｋ개', 2500], ['[댓글 74]', 74],
  ['조회수\n1.3k', 1300], ['[74개]', 74], ['74건', 74], ['2만명', 20000],
  ['1.3k 댓글', 1300], ['1.3K views', 1300], ['Views: 1.3K', 1300],
  ['Comments (74)', 74], ['LIKES: 1,234', 1234], ['74 replies', 74],
  ['👁️ 1.3k', 1300], ['💬 [74]', 74], ['♥ 1.2만', 12000], ['👍 74', 74],
  ['١٬٢٣٤', 1234], ['۱٫۳k', 1300], ['\u200e1.3k\u200f', 1300],
];
for (const [input, expected] of supportedFormats) {
  test('display format: ' + JSON.stringify(input), () => {
    assert.equal(require('../core.js').readCount(input), expected);
  });
}
const rejectedFormats = [
  '1.234', '1,23', '1 23', '1 234,567', "1,234'567", '1  234', '74\n123',
  '1천 2만', '1만 20천', '1만 2만', '1.2만 3천', '1억 2억', '1만 10000',
  '조회수 74 댓글수 12', 'Views 74 likes', 'Views 74 12', '댓글 74개 증가',
  '제목 1234', '2026-10-03', '2026.10.03', '12:30', '74%', '₩1,300', '$1.3K',
  '1k+', '1천 이상', '>100', '약 1천', '~1k', '1k–2k', '[74', '74]',
  '1.3KB', '1.3km', '1.3ms', '1.3K followers', 'Infinity', 'NaN',
  '1'.repeat(129) + 'k', '9007199254740991만', '9007199254740991만 1',
];
for (const input of rejectedFormats) {
  test('reject ambiguous display: ' + JSON.stringify(input), () => {
    assert.equal(require('../core.js').readCount(input), null);
  });
}
test('decimal unit conversion stays exact across a generated boundary matrix', () => {
  const { readCount } = require('../core.js');
  for (const [unit, multiplier] of [['k',1000], ['천',1000], ['만',10000], ['M',1000000], ['억',100000000]]) {
    for (let n = 1; n <= 200; n++) {
      const amount = (n / 100).toFixed(2);
      assert.equal(readCount(amount + unit), n * (multiplier / 100), amount + unit);
    }
  }
});
