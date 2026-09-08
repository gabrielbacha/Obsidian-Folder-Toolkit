import { describe, expect, it } from 'vitest';
import { normalizeHex, paletteTemplate, resolveAutomaticText, resolveChoice } from '../src/colors';

describe('colors', () => {
	it('normalizes valid hex values', () => {
		expect(normalizeHex('abc')).toBe('#AABBCC');
		expect(normalizeHex('#12ef90')).toBe('#12EF90');
		expect(normalizeHex('not-a-color')).toBeNull();
	});

	it('chooses readable automatic text for strong backgrounds', () => {
		const dark = resolveChoice({ kind: 'custom', hex: '#111111', strength: 100 }, 'default')!;
		const light = resolveChoice({ kind: 'custom', hex: '#FFFF00', strength: 100 }, 'default')!;
		expect(resolveAutomaticText(dark).foregroundLight).toBe('#FFFFFF');
		expect(resolveAutomaticText(light).foregroundLight).toBe('#000000');
	});

	it('uses the same eight palette templates as Bases Visuals', () => {
		expect(paletteTemplate('electric-bloom').colors).toHaveLength(10);
		expect(paletteTemplate('default').colors[1]).toBe('#3498DB');
	});

	it('changes preset slots with the palette but preserves custom colors', () => {
		expect(resolveChoice({ kind: 'preset', slot: 0 }, 'default')?.hex).toBe('#16A085');
		expect(resolveChoice({ kind: 'preset', slot: 0 }, 'ember')?.hex).toBe('#03071E');
		expect(resolveChoice({ kind: 'custom', hex: '#123456' }, 'ember')?.hex).toBe('#123456');
		expect(resolveChoice({ kind: 'custom', hex: '#123456', strength: 75 }, 'ember')?.strength).toBe(75);
		expect(resolveChoice({ kind: 'preset', slot: 0, strength: 100 }, 'ember')?.strength).toBe(100);
		expect(resolveChoice({ kind: 'none' }, 'default')).toBeNull();
	});

	it('preserves exact hex for custom colors without forced contrast alteration', () => {
		const white = resolveChoice({ kind: 'custom', hex: '#FFFFFF', strength: 100 }, 'default')!;
		expect(white.hex).toBe('#FFFFFF');
		expect(white.foregroundLight).toBe('#FFFFFF');
		expect(white.foregroundDark).toBe('#FFFFFF');
		expect(white.strength).toBe(100);

		const black = resolveChoice({ kind: 'custom', hex: '#000000', strength: 100 }, 'default')!;
		expect(black.hex).toBe('#000000');
		expect(black.foregroundLight).toBe('#000000');
		expect(black.foregroundDark).toBe('#000000');
	});
});
