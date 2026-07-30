export function serializeDates<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (!(obj instanceof Object)) return obj;

  if (obj instanceof Date) {
    return obj.toISOString() as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeDates) as any;
  }

  const serialized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      serialized[key] = serializeDates((obj as any)[key]);
    }
  }
  return serialized;
}
