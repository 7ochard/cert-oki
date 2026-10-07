import type { BarcodeKind } from "./types";

const CHECK_DIGIT_BODY_LENGTH: Partial<Record<BarcodeKind, number>> = {
  ean8: 7,
  ean13: 12,
  upca: 11,
  upce: 7,
  itf14: 13
};

export function hasManagedCheckDigit(kind: BarcodeKind): boolean {
  return kind in CHECK_DIGIT_BODY_LENGTH;
}

export function normalizeAndApplyCheckDigit(kind: BarcodeKind, value: string): string {
  if (!hasManagedCheckDigit(kind)) {
    return value;
  }

  const digits = requireDigitsOnly(value, kind);
  const bodyLength = CHECK_DIGIT_BODY_LENGTH[kind];
  if (!bodyLength) {
    return digits;
  }

  if (digits.length !== bodyLength && digits.length !== bodyLength + 1) {
    throw new Error(`${kindLabel(kind)} 需要 ${bodyLength} 位主体码或 ${bodyLength + 1} 位完整码。`);
  }

  const body = digits.slice(0, bodyLength);
  const checkDigit = kind === "upce" ? calculateUpceCheckDigit(body) : calculateGs1CheckDigit(body);
  return `${body}${checkDigit}`;
}

export function removeManagedCheckDigit(kind: BarcodeKind, value: string): string {
  const bodyLength = CHECK_DIGIT_BODY_LENGTH[kind];
  if (!bodyLength) {
    return value;
  }

  const digits = requireDigitsOnly(value, kind);
  if (digits.length === bodyLength + 1) {
    return digits.slice(0, bodyLength);
  }
  if (digits.length === bodyLength) {
    return digits;
  }
  throw new Error(`${kindLabel(kind)} 需要 ${bodyLength} 位主体码或 ${bodyLength + 1} 位完整码。`);
}

export function calculateGs1CheckDigit(body: string): number {
  requireNumericString(body, "校验位主体");
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function calculateUpceCheckDigit(upceBody: string): number {
  requireNumericString(upceBody, "UPC-E主体");
  if (upceBody.length !== 7) {
    throw new Error("UPC-E 主体码必须是 7 位。");
  }
  return calculateGs1CheckDigit(expandUpceBodyToUpcaBody(upceBody));
}

export function expandUpceBodyToUpcaBody(upceBody: string): string {
  requireNumericString(upceBody, "UPC-E主体");
  if (upceBody.length !== 7) {
    throw new Error("UPC-E 主体码必须是 7 位。");
  }

  const numberSystem = upceBody[0];
  const payload = upceBody.slice(1);
  const [d1, d2, d3, d4, d5, d6] = payload;

  if ("012".includes(d6)) {
    return `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  }
  if (d6 === "3") {
    return `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
  }
  if (d6 === "4") {
    return `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
  }
  return `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
}

export function requireDigitsOnly(value: string, kind: BarcodeKind): string {
  const trimmed = value.trim();
  requireNumericString(trimmed, kindLabel(kind));
  return trimmed;
}

function requireNumericString(value: string, label: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} 只能包含数字。`);
  }
}

function kindLabel(kind: BarcodeKind): string {
  return kind.toUpperCase().replace("EAN128", "EAN-128").replace("UPCA", "UPC-A").replace("UPCE", "UPC-E");
}
