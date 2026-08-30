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
	return candidates
		.filter((candidate) => isSameOrDescendant(path, candidate))
		.sort((first, second) => second.length - first.length)[0] ?? null;
}

