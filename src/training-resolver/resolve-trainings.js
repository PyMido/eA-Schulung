const fs = require('fs');
const path = require('path');
const { normalizeUserContext } = require('./user-context-schema');

const MATRIX_PATH = path.resolve(__dirname, '../../docs/training-matrix-v1.json');

function loadTrainingMatrix(matrixPath = MATRIX_PATH) {
  return JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
}

function classifyTraining(training, role) {
  if (!role || role === 'admin') {
    return {
      status: 'excluded',
      reason: 'Admin/Systemrolle oder ungültige Lernrolle.',
      matched_rule: 'role_not_learner'
    };
  }

  if (training.required_for.includes(role)) {
    return {
      status: 'required',
      reason: `Rolle ${role} ist als Pflichtrolle hinterlegt.`,
      matched_rule: 'required_for'
    };
  }

  if (training.optional_for.includes(role)) {
    return {
      status: 'optional',
      reason: `Rolle ${role} ist als optionale Rolle hinterlegt.`,
      matched_rule: 'optional_for'
    };
  }

  return {
    status: 'excluded',
    reason: `Rolle ${role} ist für diese Schulung nicht vorgesehen.`,
    matched_rule: 'no_role_match'
  };
}

function resolveTrainingsForUser(userContext, matrix = loadTrainingMatrix()) {
  const { normalized, validation } = normalizeUserContext(userContext);

  const trainings = matrix.trainings.map((training) => {
    const classification = classifyTraining(training, normalized.role);

    return {
      id: training.id,
      title: training.title,
      status: classification.status,
      reason: classification.reason,
      matched_rule: classification.matched_rule
    };
  });

  const summary = trainings.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return {
    matrix_version: matrix.version,
    user: normalized,
    validation,
    summary,
    trainings
  };
}

module.exports = {
  loadTrainingMatrix,
  classifyTraining,
  resolveTrainingsForUser
};
