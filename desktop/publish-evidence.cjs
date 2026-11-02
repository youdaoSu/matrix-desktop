const fs = require('node:fs');
const path = require('node:path');
const { writeLocalJson } = require('./local-json-store.cjs');

// This is an observation journal, NOT a submission receipt or a source of
// authorization. The only writer is the authenticated official-form handler.
// No HTML, free text, URLs, tokens, form values or local paths are accepted.
const states = new Set(['upload_failed', 'uploading', 'processing', 'waiting_layout', 'waiting_editor', 'waiting_media', 'waiting_preview', 'ambiguous_cover', 'cover_ready', 'submit_ready', 'waiting_submit']);
const signals = new Set(['media_notice', 'upload_notice', 'progress_bar']);
const counters = ['attachedVideoInputs', 'mediaElements', 'decodedMedia', 'coverContainers', 'coverImages', 'decodedCoverImages', 'enabledSubmitButtons'];
const probeCounters = ['componentRoots','viewportWidth','viewportHeight','matchedCovers','matchedVideos'];
const hiddenReasons = new Set(['no_bounds','hidden_style','disabled','hidden_ancestor','transparent_ancestor','hidden_animation']);
const validId = value => typeof value === 'string' && /^[a-z0-9-]{16,80}$/i.test(value);
function sanitizeObservation(value) {
  if (!value || value.version !== 1 || !states.has(value.state) || typeof value.editorReady !== 'boolean' || !Array.isArray(value.busySignals) || value.busySignals.some(item => !signals.has(item))) throw Error('Invalid publish observation');
  const result = { version: 1, state: value.state, busySignals: [...new Set(value.busySignals)].sort(), editorReady: value.editorReady };
  for (const key of counters) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 10000) throw Error('Invalid observation count');
    result[key] = value[key];
  }
  if (value.uploadPercent !== undefined) {
    if (!Number.isInteger(value.uploadPercent) || value.uploadPercent < 0 || value.uploadPercent > 100) throw Error('Invalid observation progress');
    result.uploadPercent = value.uploadPercent;
  }
  if (value.probe !== undefined) {
    const probe = value.probe;
    if (!probe || typeof probe.documentVisible !== 'boolean' || !Array.isArray(probe.rejectedCoverReasons) || probe.rejectedCoverReasons.length > hiddenReasons.size || probe.rejectedCoverReasons.some(reason => !hiddenReasons.has(reason)) || !probeCounters.every(key => Number.isSafeInteger(probe[key]) && probe[key] >= 0 && probe[key] <= 10000)) throw Error('Invalid observation probe');
    result.probe = { ...Object.fromEntries(probeCounters.map(key => [key,probe[key]])), documentVisible:probe.documentVisible, rejectedCoverReasons:[...new Set(probe.rejectedCoverReasons)].sort() };
  }
  return result;
}
function createPublishEvidenceStore(directory, { now = () => Date.now() } = {}) {
  const file = path.join(directory, 'publish-observations.json');
  const read = () => {
    if (!fs.existsSync(file)) return [];
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw Error('Publish evidence store unavailable');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.items) || data.items.length > 2000) throw Error('Invalid publish evidence store');
    return data.items.map(item => {
      if (![item.ownerId, item.accountId, item.taskId, item.attemptId].every(validId) || !['douyin', 'xiaohongshu', 'wechat', 'bilibili'].includes(item.platform) || !Number.isFinite(Date.parse(item.at))) throw Error('Invalid publish evidence record');
      return { ownerId: item.ownerId, accountId: item.accountId, taskId: item.taskId, attemptId: item.attemptId, platform: item.platform, at: item.at, observation: sanitizeObservation(item.observation) };
    });
  };
  return {
    record(context, value) {
      if (![context.ownerId, context.accountId, context.taskId, context.attemptId].every(validId) || !['douyin', 'xiaohongshu', 'wechat', 'bilibili'].includes(context.platform)) throw Error('Invalid publish evidence context');
      const observation = sanitizeObservation(value), items = read(), at = new Date(now()).toISOString();
      const sameAttempt = item => ['ownerId', 'accountId', 'taskId', 'attemptId', 'platform'].every(key => item[key] === context[key]);
      const previous = items.findLast(sameAttempt);
      // Keep transitions and a 30-second heartbeat, not two-second disk spam.
      if (previous && JSON.stringify(previous.observation) === JSON.stringify(observation) && now() - Date.parse(previous.at) < 30000) return { ...previous, observation, stored: true };
      const row = { ownerId: context.ownerId, accountId: context.accountId, taskId: context.taskId, attemptId: context.attemptId, platform: context.platform, at, observation };
      let next = [...items, row];
      // Retain the first sample and the most recent 95 samples per attempt.
      const attempt = next.filter(sameAttempt);
      if (attempt.length > 96) { const keep = new Set([attempt[0], ...attempt.slice(-95)]); next = next.filter(item => !sameAttempt(item) || keep.has(item)); }
      writeLocalJson(file, { version: 1, items: next.slice(-2000) });
      return { ...row, stored: true };
    },
    list(ownerId, taskId, attemptId) {
      if (![ownerId, taskId, attemptId].every(validId)) throw Error('Invalid publish evidence query');
      return read().filter(item => item.ownerId === ownerId && item.taskId === taskId && item.attemptId === attemptId).map(({ ownerId: _, ...item }) => item);
    },
  };
}
module.exports = { sanitizeObservation, createPublishEvidenceStore, validId };
