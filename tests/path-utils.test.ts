import { describe, expect, it } from 'vitest';
import { findNearestContainingPath, isSameOrDescendant, parentPaths, replacePathRoot } from '../src/path-utils';

describe('path utilities', () => {
	it('matches only complete path segments', () => {
		expect(isSameOrDescendant('Projects/Alpha/note.md', 'Projects/Alpha')).toBe(true);
		expect(isSameOrDescendant('Projects/Alphabet', 'Projects/Alpha')).toBe(false);
	});

	it('returns parents from nearest to farthest', () => {
		expect(parentPaths('A/B/C.md')).toEqual(['A/B', 'A']);
	});

	it('renames roots and descendants without touching similar prefixes', () => {
		expect(replacePathRoot('A/B/note.md', 'A/B', 'Archive/B')).toBe('Archive/B/note.md');
		expect(replacePathRoot('A/Before.md', 'A/B', 'Archive/B')).toBe('A/Before.md');
	});

	it('finds the nearest hidden ancestor', () => {
		expect(findNearestContainingPath('A/B/C.md', ['A', 'A/B'])).toBe('A/B');
	});
});

