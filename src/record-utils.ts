export function hasOwn(value: object, key: PropertyKey): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

/** JSON data equality does not depend on object property insertion order. */
export function sameJsonData(a: unknown, b: unknown): boolean {
	const encode = (value: unknown): string | undefined => JSON.stringify(value, (_key: string, item: unknown) => {
		if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
		const record = item as Record<string, unknown>;
		return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
	});
	return encode(a) === encode(b);
}
