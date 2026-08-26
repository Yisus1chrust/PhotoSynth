// Ensure BigInt can be safely serialized with JSON.stringify without throwing "Uncaught TypeError: Do not know how to serialize a BigInt"
if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    const num = Number(this);
    return Number.isSafeInteger(num) ? num : this.toString();
  };
}

export function safeJsonStringify(obj: any, indent?: number): string {
  try {
    return JSON.stringify(
      obj,
      (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
      indent
    );
  } catch (err) {
    console.warn('safeJsonStringify error:', err);
    return '{}';
  }
}

export function safeJsonParse<T>(jsonStr: string | null, fallback: T): T {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    console.warn('safeJsonParse error:', err);
    return fallback;
  }
}

export function safeDeepClone<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  try {
    return JSON.parse(safeJsonStringify(obj));
  } catch {
    return obj;
  }
}
