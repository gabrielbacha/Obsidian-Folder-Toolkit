import { describe, expect, it } from 'vitest';
import { focusRelation, hiddenBy } from '../src/visibility';

describe('visibility', () => {
	it('classifies a focused subtree and its ancestors', () => {
		expect(focusRelation('A/B', 'A/B')).toBe('root');
		expect(focusRelation('A/B/C.md', 'A/B')).toBe('descendant');
		expect(focusRelation('A', 'A/B')).toBe('ancestor');
		expect(focusRelation('Other', 'A/B')).toBe('outside');
	});

	it('finds permanent hiding inherited from a parent', () => {
		expect(hiddenBy('A/B/C.md', ['A/B'])).toBe('A/B');
		expect(hiddenBy('A/Before.md', ['A/B'])).toBeNull();
	});
});

