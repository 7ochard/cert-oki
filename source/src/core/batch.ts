import { hasManagedCheckDigit, normalizeAndApplyCheckDigit, removeManagedCheckDigit } from "./checkDigits";
import type { BarcodeKind } from "./types";

export function buildBatchInputs(kind: BarcodeKind, seed: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("批量数量必须是 1 到 500 的整数。");
  }

  if (count === 1) {
    return [normalizeForBatchItem(kind, seed)];
  }

  if (hasManagedCheckDigit(kind)) {
    const body = removeManagedCheckDigit(kind, seed);
    return Array.from({ length: count }, (_, index) => normalizeAndApplyCheckDigit(kind, incrementNumericString(body, index)));
  }

  const match = findLastNumberRun(seed);
  if (!match) {
    throw new Error("批量生成需要数据中至少包含一段数字。");
  }

  return Array.from({ length: count }, (_, index) => {
    const nextNumber = incrementNumericString(match.value, index);
    return `${seed.slice(0, match.start)}${nextNumber}${seed.slice(match.end)}`;
  });
}

function normalizeForBatchItem(kind: BarcodeKind, seed: string): string {
  if (hasManagedCheckDigit(kind)) {
    return normalizeAndApplyCheckDigit(kind, seed);
  }
  return seed;
}

function incrementNumericString(value: string, by: number): string {
  const next = BigInt(value) + BigInt(by);
  const text = next.toString();
  if (text.length > value.length) {
    throw new Error("批量递增已超出原始数字位数。");
  }
  return text.padStart(value.length, "0");
}

function findLastNumberRun(value: string): { value: string; start: number; end: number } | null {
  const matches = Array.from(value.matchAll(/\d+/g));
  const match = matches[matches.length - 1];
  if (!match || match.index === undefined) {
    return null;
  }
  return {
    value: match[0],
    start: match.index,
    end: match.index + match[0].length
  };
}
