// Legacy creator comments expose opaque encrypted references. These are not
// numeric account/work IDs, and must never enter signing, login or send paths.
function commentIdentifier(value, legacy = false) {
  if (typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)) return value;
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  // An encrypted reference is data, not a username: its first character need
  // not be alphanumeric and its length need not be at least eight. Preserve
  // exact observed tokens, including URL-encoded/versioned legacy forms.
  // Verified legacy response references are opaque data, not an encoding we
  // control. Keep punctuation verbatim; never interpret it as code or headers.
  return legacy && typeof value === 'string' && /^[\x21-\x7e]{1,512}$/.test(value) && !/^(?:https?|file|data|javascript):/i.test(value) && !/^\d+$/.test(value) ? value : '';
}
module.exports = { commentIdentifier };
