import { describe, expect, it } from 'vitest';
import { normalizeHex, paletteTemplate, resolveChoice } from '../src/colors';

describe('colors', () => {
	it('normalizes valid hex values', () => {
		expect(normalizeHex('abc')).toBe('#AABBCC');
		expect(normalizeHex('#12ef90')).toBe('#12EF90');
		expect(normalizeHex('not-a-color')).toBeNull();
	});

	it('uses the same eight palette templates as Bases Visuals', () => {
		expect(paletteTemplate('electric-bloom').colors).toHaveLength(10);
		expect(paletteTemplate('default').colors[1]).toBe('#3498DB');
	});

	it('changes preset slots with the palette but preserves custom colors', () => {
		expect(resolveChoice({ kind: 'preset', slot: 0 }, 'default')?.hex).toBe('#16A085');
		expect(resolveChoice({ kind: 'preset', slot: 0 }, 'ember')?.hex).toBe('#03071E');
		expect(resolveChoice({ kind: 'custom', hex: '#123456' }, 'ember')?.hex).toBe('#123456');
		expect(resolveChoice({ kind: 'none' }, 'default')).toBeNull();
	});
});

