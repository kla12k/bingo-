/**
 * Normalize card numbers to row-major 5x5. Handles:
 * - Row-major [[r0],[r1],...] (our format)
 * - Column-major [[B],[I],[N],[G],[O]] (Django/Apple Bingo game_card)
 * - Object {0: [...], 1: [...]} from JSON
 */
export function toRowMajorNumbers(numbers: unknown): number[][] {
  if (typeof numbers === "string") {
    try {
      numbers = JSON.parse(numbers) as unknown;
    } catch {
      return [];
    }
  }
  let arr: number[][] = [];
  if (Array.isArray(numbers)) {
    arr = numbers.map((row) => (Array.isArray(row) ? row : []));
  } else if (numbers && typeof numbers === "object") {
    arr = Object.values(numbers as Record<string, unknown>)
      .filter(Array.isArray)
      .map((r) => r as number[]);
  }
  if (arr.length !== 5 || arr.some((r) => !Array.isArray(r) || r.length !== 5)) {
    return [];
  }
  // Detect column-major: each arr[i] has 5 numbers in same 15-number range
  const isColumnMajor = arr.every((col, c) => {
    const min = c * 15 + 1;
    const max = c === 2 ? 45 : (c + 1) * 15; // N includes 0 (free)
    return col.every((n) => n === 0 || (n >= min && n <= max));
  });
  if (isColumnMajor) {
    return Array.from({ length: 5 }, (_, r) => arr.map((col) => col[r]));
  }
  return arr;
}

/** Returns flat number[] in row-major order for grid display. */
export function toDisplayNumbers(numbers: unknown): number[] {
  return toRowMajorNumbers(numbers).flat();
}

/**
 * Generate 5x5 bingo card: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75.
 * Center (2,2) is free space = 0.
 */
export function generateCardWithFreeSpace(): number[][] {
  const grid: number[][] = [];
  for (let c = 0; c < 5; c++) {
    const min = c * 15 + 1;
    const max = (c + 1) * 15;
    const col: number[] = [];
    const used = new Set<number>();
    while (col.length < 5) {
      const n = min + Math.floor(Math.random() * (max - min + 1));
      if (!used.has(n)) {
        used.add(n);
        col.push(n);
      }
    }
    grid.push(col);
  }
  const rows = Array.from({ length: 5 }, (_, row) =>
    grid.map((col) => col[row])
  );
  rows[2][2] = 0;
  return rows;
}

/**
 * List completed win patterns on a card (rows, cols, diagonals, corners).
 */
export function getCompletedPatterns(
  card: number[][],
  calledNumbers: number[]
): { patternIds: string[]; winningCells: number[] } {
  const called = new Set(calledNumbers.map(Number));
  const has = (n: unknown) => called.has(Number(n));
  const patternIds: string[] = [];
  const cellSet = new Set<number>();

  const flat = (r: number, c: number) => r * 5 + c + 1;

  const addPattern = (id: string, cells: number[]) => {
    patternIds.push(id);
    for (const cell of cells) cellSet.add(cell);
  };

  for (let r = 0; r < 5; r++) {
    if (card[r].every((n) => has(n))) {
      addPattern(
        `row-${r}`,
        Array.from({ length: 5 }, (_, c) => flat(r, c))
      );
    }
  }
  for (let c = 0; c < 5; c++) {
    if (card.every((row) => has(row[c]))) {
      addPattern(
        `col-${c}`,
        Array.from({ length: 5 }, (_, r) => flat(r, c))
      );
    }
  }
  if ([0, 1, 2, 3, 4].every((i) => has(card[i][i]))) {
    addPattern("diag-main", [1, 7, 13, 19, 25]);
  }
  if ([0, 1, 2, 3, 4].every((i) => has(card[i][4 - i]))) {
    addPattern("diag-anti", [5, 9, 13, 17, 21]);
  }
  if (has(card[0][0]) && has(card[0][4]) && has(card[4][0]) && has(card[4][4])) {
    addPattern("corners-outer", [1, 5, 21, 25]);
  }
  if (has(card[1][1]) && has(card[1][3]) && has(card[3][1]) && has(card[3][3])) {
    addPattern("corners-inner", [7, 9, 17, 19]);
  }

  return { patternIds, winningCells: Array.from(cellSet) };
}

export function meetsWinRequirement(
  card: number[][],
  calledNumbers: number[],
  requiredPatterns = 1
): { met: boolean; patternCount: number; winningCells: number[] | null } {
  const required = Math.max(1, Math.floor(requiredPatterns));
  const { patternIds, winningCells } = getCompletedPatterns(card, calledNumbers);
  const met = patternIds.length >= required;
  return {
    met,
    patternCount: patternIds.length,
    winningCells: met ? winningCells : null,
  };
}

/**
 * Check if card has any winning pattern. calledNumbers should include 0 for free space.
 * Mirrors Apple Bingo backend game/consumers.py has_bingo():
 * - Diagonals: card[i][i], card[i][4-i]
 * - Rows: each card[r] all in called
 * - Columns: each card[*][c] all in called
 * - 4 corners: card[0][0], [0][4], [4][0], [4][4]
 * - 4 inner corners: card[1][1], [1][3], [3][1], [3][3]
 * Card and calledNumbers can contain number or string; both are coerced to number for comparison.
 */
export function hasBingo(
  card: number[][],
  calledNumbers: number[]
): number[] | null {
  return meetsWinRequirement(card, calledNumbers, 1).winningCells;
}

/** Fisher-Yates shuffle for numbers 1-75 */
export function shuffleNumbers(): number[] {
  const arr = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Fisher-Yates shuffle for any array */
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Bones multiplier by call count (stakes 10,20,50 and >=10 players only). */
export function getBonesMultiplier(callCount: number): number {
  if (callCount <= 5) return 10;
  if (callCount === 6) return 8;
  if (callCount === 7) return 6;
  if (callCount === 8) return 4;
  if (callCount === 9) return 3;
  if (callCount === 10) return 2;
  if (callCount === 11) return 1;
  return 0;
}

/** B (1-15), I (16-30), N (31-45), G (46-60), O (61-75) */
export const getBingoLetter = (number: number): "B" | "I" | "N" | "G" | "O" => {
  if (number >= 1 && number <= 15) return "B";
  if (number >= 16 && number <= 30) return "I";
  if (number >= 31 && number <= 45) return "N";
  if (number >= 46 && number <= 60) return "G";
  if (number >= 61 && number <= 75) return "O";
  return "B";
};
