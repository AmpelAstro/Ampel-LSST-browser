// Bit positions of the Ampel journal `action` flags
const ACTION_FLAGS: Array<[string, number]> = [
  ["T0_ADD_CHANNEL", 0],
  ["T0_PULL_CHANNEL", 1],
  ["T0_ADD_TAG", 2],
  ["T0_PULL_TAG", 3],
  ["T0_ADD_EXCL", 6],
  ["T0_PULL_EXCL", 7],

  ["T1_ADD_CHANNEL", 8],
  ["T1_PULL_CHANNEL", 9],
  ["T1_ADD_BODY", 10],
  ["T1_ADD_TAG", 11],
  ["T1_PULL_TAG", 12],
  ["T1_SET_CODE", 13],
  ["T1_EXTRA_META", 14],
  ["T1_EXTRA_JOURNAL", 15],

  ["T2_ADD_CHANNEL", 16],
  ["T2_PULL_CHANNEL", 17],
  ["T2_ADD_BODY", 18],
  ["T2_ADD_TAG", 19],
  ["T2_PULL_TAG", 20],
  ["T2_SET_CODE", 21],
  ["T2_EXTRA_JOURNAL", 22],
  ["T2_EXPORT_DOC", 23],
  ["T2_IMPORT_RESULT", 24],

  ["T3_ADD_DOC", 25],

  ["STOCK_ADD_CHANNEL", 26],
  ["STOCK_PULL_CHANNEL", 27],
  ["STOCK_BUMP_UPD", 28],
  ["STOCK_ADD_TAG", 29],
  ["STOCK_PULL_TAG", 30],
  ["STOCK_ADD_NAME", 31],
  ["STOCK_PULL_NAME", 32],
  ["STOCK_SET_BODY", 33],

  ["STOCK_RESET_BODY", 34],
  ["T1_RESET_CODE", 35],
  ["T1_RESET_BODY", 36],
  ["T2_RESET_CODE", 37],
  ["T2_RESET_BODY", 38],
];

// BigInt because flags exceed the 32 bits JS bitwise operators support
export function decodeActionFlags(action: number | null | undefined): string[] {
  if (action == null || !Number.isFinite(action)) return [];
  const value = BigInt(Math.trunc(action));
  return ACTION_FLAGS.filter(([, bit]) => (value >> BigInt(bit)) & 1n).map(
    ([name]) => name,
  );
}

export function formatTimeDelta(timestamp: string | null, now: number): string {
  if (!timestamp) return "unknown";
  const seconds = Math.round((now - new Date(timestamp).getTime()) / 1000);
  const abs = Math.abs(seconds);
  const units: Array<[string, number]> = [
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ];
  const parts: string[] = [];
  let remainder = abs;
  for (const [label, size] of units) {
    const count = Math.floor(remainder / size);
    if (count > 0 && parts.length < 2) parts.push(`${count}${label}`);
    remainder -= count * size;
  }
  const text = parts.length ? parts.join(" ") : "0s";
  return seconds >= 0 ? `${text} ago` : `in ${text}`;
}
