const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrue } = require('../bright-data-amazon');

test('Bright Data sponsored flag: the string "false" is NOT sponsored', () => {
  assert.equal(isTrue('false'), false);
  assert.equal(isTrue(false), false);
  assert.equal(isTrue(null), false);
  assert.equal(isTrue(undefined), false);
  assert.equal(isTrue('true'), true);
  assert.equal(isTrue(true), true);
  assert.equal(isTrue(1), true);
  assert.equal(isTrue('Sponsored'), true);
  assert.equal(isTrue(''), false);
});
