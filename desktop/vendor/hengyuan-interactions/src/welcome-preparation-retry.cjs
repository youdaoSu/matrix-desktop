'use strict';

// Preparation recovery is never a second message submission. These fixed
// categories contain no URLs, response text, account IDs or credentials.
const NETWORK_CODES = Object.freeze([
  'ERR_NETWORK_CHANGED', 'ERR_INTERNET_DISCONNECTED', 'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_TIMED_OUT',
  'ERR_NAME_NOT_RESOLVED', 'ERR_TIMED_OUT',
]);
const STAGES = Object.freeze(['profile-load', 'entry', 'chat-verify']);
const RETRY_DELAYS_MS = Object.freeze([15000, 45000]);
const RETRY_WINDOW_MS = 180000;
// Native/page-thrown Error objects cannot authorize recovery by imitating
// public properties. Only the host preparation helper registers this proof.
const releasedPreparations = new WeakMap();

function networkCode(error) {
  return NETWORK_CODES.includes(error?.code) ? error.code : undefined;
}
function preparationFailure(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['code', 'stage', 'networkCode', 'pageReleased'].includes(key)) ||
      !STAGES.includes(input.stage) || input.pageReleased !== true) throw new Error('欢迎语准备恢复证据不正确');
  if (input.code === 'WELCOME_LOAD_FAILED') {
    if (input.stage !== 'entry' || !NETWORK_CODES.includes(input.networkCode)) throw new Error('欢迎语网络恢复原因不明确');
  } else if (!['WELCOME_PREPARE_TIMEOUT', 'PAGE_OPERATION_TIMEOUT'].includes(input.code) || input.networkCode !== undefined) {
    throw new Error('欢迎语准备错误不支持自动恢复');
  }
  return { code: input.code, stage: input.stage, ...(input.networkCode ? { networkCode: input.networkCode } : {}), pageReleased: true };
}
function markReleasedPreparation(error, input) {
  releasedPreparations.set(error, preparationFailure(input));
}
function releasedPreparationFailure(error) {
  const failure = error && (typeof error === 'object' || typeof error === 'function') ? releasedPreparations.get(error) : undefined;
  return failure ? { ...failure } : undefined;
}

module.exports = { networkCode, preparationFailure, markReleasedPreparation, releasedPreparationFailure, RETRY_DELAYS_MS, RETRY_WINDOW_MS };
