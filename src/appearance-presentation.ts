import type { ResolvedAppearance } from './appearance-resolver';

/** Shared rendering rules. DOM layout and class names remain host-specific. */
export function appearancePresentation(appearance: ResolvedAppearance, isFolder: boolean): {
	directColor: boolean; blocked: boolean; cascade: boolean; borderWidth: string | null; shaded: boolean;
} {
	const direct = appearance.directBackground;
	const border = appearance.border;
	const widths = border?.style === 'box' ? { thin: '1px', medium: '2px', thick: '3px' } : { thin: '2px', medium: '4px', thick: '6px' };
	return {
		directColor: direct !== undefined && direct.choice.kind !== 'none',
		blocked: direct?.choice.kind === 'none',
		cascade: isFolder && direct?.cascade === true,
		borderWidth: border ? widths[border.thickness ?? 'thin'] : null,
		shaded: isFolder && border?.shading === true,
	};
}
