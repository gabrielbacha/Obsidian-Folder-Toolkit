export function isSameOrDescendant(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

export function parentPaths(path: string): string[] {
	const parts = path.split('/');
	const parents: string[] = [];
	for (let index = parts.length - 1; index > 0; index -= 1) {
		parents.push(parts.slice(0, index).join('/'));
	}
	return parents;
}

export function replacePathRoot(path: string, oldRoot: string, newRoot: string): string {
	if (path === oldRoot) return newRoot;
	if (!path.startsWith(`${oldRoot}/`)) return path;
	return `${newRoot}${path.slice(oldRoot.length)}`;
}

export function findNearestContainingPath(path: string, candidates: readonly string[]): string | null {
	let nearest: string | null = null;
	for (const candidate of candidates) if (isSameOrDescendant(path, candidate) && (!nearest || candidate.length > nearest.length)) nearest = candidate;
	return nearest;
}

export function containingPathIndex(paths: readonly string[]): (path: string) => string | null {
	const roots = new Set(paths);
	return (path) => [path, ...parentPaths(path)].find((candidate) => roots.has(candidate)) ?? null;
}
