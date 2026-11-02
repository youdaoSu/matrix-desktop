'use strict';

// Pure validation, with bounded reuse limited to one synchronous read scope.
function validate(value, label, dates) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${label}格式不正确。`);
  const date = value.slice(0, 10);
  if (!dates?.has(date)) {
    if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`${label}日期不正确。`);
    if (dates && dates.size < 32) dates.add(date);
  }
  return new Date(value).toISOString();
}
function iso(value, label = '时间') { return validate(value, label); }
function createIsoScope() {
  const values = new Map(), dates = new Set();
  return (value, label = '时间') => {
    if (values.has(value)) return values.get(value);
    const result = validate(value, label, dates);
    if (values.size < 256) values.set(value, result);
    return result;
  };
}
module.exports = { iso, createIsoScope };
