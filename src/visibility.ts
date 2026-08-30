import { findNearestContainingPath, isSameOrDescendant } from './path-utils';

export type FocusRelation = 'root' | 'descendant' | 'ancestor' | 'outside';

export function focusRelation(path: string, focusPath: string | null): FocusRelation {
	if (!focusPath) return 'descendant';
	if (path === focusPath) return 'root';
	if (isSameOrDescendant(path, focusPath)) return 'descendant';
	if (isSameOrDescendant(focusPath, path)) return 'ancestor';
	return 'outside';
}

export function hiddenBy(path: string, hiddenPaths: readonly string[]): string | null {
	return findNearestContainingPath(path, hiddenPaths);
}

