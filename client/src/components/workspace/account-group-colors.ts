// Colors apply to the entire group heading, not to an icon or the account rows.
export const groupLabelPalette = ['#f1f2f5', '#fff0e5', '#fbeaea', '#f5edfc', '#eaf0ff', '#eaf5fc', '#e9f6f1', '#eef5e9'];
const legacyPointColors: Record<string, string> = Object.fromEntries(
  ['#64748b', '#f28b38', '#ef476f', '#b36ae2', '#6376dd', '#3aa4d7', '#2fa889', '#5d9d47'].map((value, index) => [value, groupLabelPalette[index]]),
);

export function groupLabelColor(value?: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(value || '') ? value!.toLowerCase() : groupLabelPalette[0];
  return legacyPointColors[safe] || safe;
}

export function groupLabelForeground(value: string) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#20242c' : '#ffffff';
}
