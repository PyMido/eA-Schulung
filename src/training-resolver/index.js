const { normalizeUserContext } = require('./user-context-schema');
const { loadTrainingMatrix, classifyTraining, resolveTrainingsForUser } = require('./resolve-trainings');

module.exports = {
  normalizeUserContext,
  loadTrainingMatrix,
  classifyTraining,
  resolveTrainingsForUser
};
