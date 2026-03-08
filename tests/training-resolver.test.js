const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { resolveTrainingsForUser } = require('../src/training-resolver');

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/user-contexts.json'), 'utf8'));

function fixture(id) {
  return fixtures.find((f) => f.id === id).userContext;
}

function statusById(result, id) {
  return result.trainings.find((t) => t.id === id).status;
}

test('admin gets excluded for all trainings', () => {
  const result = resolveTrainingsForUser(fixture('admin'));
  assert.ok(result.trainings.every((t) => t.status === 'excluded'));
});

test('pharma gets pharma required and service optional', () => {
  const result = resolveTrainingsForUser(fixture('pharma'));
  assert.equal(statusById(result, 'pharma-core-v1'), 'required');
  assert.equal(statusById(result, 'service-kasse-v1'), 'optional');
  assert.equal(statusById(result, 'hygiene-basics'), 'required');
});

test('non_pharma gets service required and pharma-core optional', () => {
  const result = resolveTrainingsForUser(fixture('non_pharma'));
  assert.equal(statusById(result, 'service-kasse-v1'), 'required');
  assert.equal(statusById(result, 'pharma-core-v1'), 'optional');
  assert.equal(statusById(result, 'datenschutz-basics'), 'required');
});

test('invalid role behaves as excluded learner', () => {
  const result = resolveTrainingsForUser(fixture('invalid'));
  assert.equal(result.validation.validRole, false);
  assert.ok(result.trainings.every((t) => t.status === 'excluded'));
});

test('every row has reason and matched_rule', () => {
  const result = resolveTrainingsForUser(fixture('pharma'));
  result.trainings.forEach((row) => {
    assert.equal(typeof row.reason, 'string');
    assert.equal(typeof row.matched_rule, 'string');
  });
});
