export interface CounterpartyEntry {
  name: string;
  count: number;
}

export interface CounterpartyGroup {
  key: string;
  label: string;
  members: CounterpartyEntry[];
  totalCount: number;
}

export const getFirstWord = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const rawFirst = trimmed.split(/\s+/)[0] || "";
  return rawFirst.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
};

export const buildGroups = (
  counterparties: CounterpartyEntry[]
): CounterpartyGroup[] => {
  const map = new Map<string, CounterpartyGroup>();

  counterparties.forEach((counterparty) => {
    const firstWord = getFirstWord(counterparty.name);
    if (!firstWord) return;

    const key = firstWord.toLowerCase();
    const existing = map.get(key);

    if (existing) {
      existing.members.push(counterparty);
      existing.totalCount += counterparty.count;
    } else {
      map.set(key, {
        key,
        label: firstWord,
        members: [counterparty],
        totalCount: counterparty.count,
      });
    }
  });

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      members: [...group.members].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name)
      ),
    }))
    .filter((group) => group.members.length > 1)
    .sort(
      (a, b) => b.totalCount - a.totalCount || a.label.localeCompare(b.label)
    );
};

const normalizeForCompare = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const levenshteinDistance = (a: string, b: string) => {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const prevRow = new Array(bLen + 1);
  const currRow = new Array(bLen + 1);

  for (let j = 0; j <= bLen; j += 1) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= aLen; i += 1) {
    currRow[0] = i;
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLen; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    for (let j = 0; j <= bLen; j += 1) {
      prevRow[j] = currRow[j];
    }
  }

  return prevRow[bLen];
};

export const similarityScore = (a: string, b: string) => {
  const normalizedA = normalizeForCompare(a);
  const normalizedB = normalizeForCompare(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  const distance = levenshteinDistance(normalizedA, normalizedB);
  return 1 - distance / Math.max(normalizedA.length, normalizedB.length);
};

export const getAutoMergePairs = (
  counterparties: CounterpartyEntry[],
  similarityThreshold: number
) => {
  const groups = buildGroups(counterparties);
  const merges: Array<{ from: string; to: string }> = [];

  groups.forEach((group) => {
    const targetName = group.members[0]?.name;
    if (!targetName) return;

    group.members.forEach((member) => {
      if (member.name === targetName) return;
      const score = similarityScore(member.name, targetName);
      if (score >= similarityThreshold) {
        merges.push({ from: member.name, to: targetName });
      }
    });
  });

  return merges;
};
