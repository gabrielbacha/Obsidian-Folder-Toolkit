import { PALETTE_TEMPLATE_IDS, type ColorChoice, type PaletteTemplateId } from './types';

export interface PaletteTemplate {
	id: PaletteTemplateId;
	label: string;
	description: string;
	colors: readonly string[];
}

export interface ResolvedColor {
	hex: string;
	strength?: number;
	foregroundLight: string;
	foregroundDark: string;
}

export const PALETTE_TEMPLATES: readonly PaletteTemplate[] = [
	{ id: 'default', label: 'Default · Folder Toolkit', description: 'Green Sea, Peter River, and warm accents.', colors: ['#16A085', '#3498DB', '#8E44AD', '#2C3E50', '#D33682', '#F1C40F', '#E67E22', '#C0392B', '#8B5A2B'] },
	{ id: 'sunset-spectrum', label: 'Sunset spectrum', description: 'Warm reds and oranges balanced by fresh greens and cool blues.', colors: ['#F94144', '#F3722C', '#F8961E', '#F9844A', '#F9C74F', '#90BE6D', '#43AA8B', '#4D908E', '#577590', '#277DA1'] },
	{ id: 'desert-coast', label: 'Desert coast', description: 'Deep coastal teals flowing into sand, ochre, and terracotta.', colors: ['#001219', '#005F73', '#0A9396', '#94D2BD', '#E9D8A6', '#EE9B00', '#CA6702', '#BB3E03', '#AE2012', '#9B2226'] },
	{ id: 'editorial', label: 'Editorial', description: 'Blue, green, orange, cream, and neutral ink.', colors: ['#003C71', '#3A8F5B', '#E24E1B', '#FCBF49', '#EAE2B7', '#F5F5F5', '#898989', '#3A3A3A'] },
	{ id: 'ocean-depth', label: 'Ocean depth', description: 'A progression from deep navy to pale arctic blue.', colors: ['#03045E', '#023E8A', '#0077B6', '#0096C7', '#00B4D8', '#48CAE4', '#90E0EF', '#ADE8F4', '#CAF0F8'] },
	{ id: 'ember', label: 'Ember', description: 'Near-black plum through crimson, flame orange, and molten gold.', colors: ['#03071E', '#370617', '#6A040F', '#9D0208', '#D00000', '#DC2F02', '#E85D04', '#F48C06', '#FAA307', '#FFBA08'] },
	{ id: 'citrus-grove', label: 'Citrus grove', description: 'Evergreen and leaf tones brightening into citrus yellow.', colors: ['#007F5F', '#2B9348', '#55A630', '#80B918', '#AACC00', '#BFD200', '#D4D700', '#DDDF00', '#EEEF20', '#FFFF3F'] },
	{ id: 'electric-bloom', label: 'Electric bloom', description: 'Hot pink and violet shifting through indigo into cyan.', colors: ['#F72585', '#B5179E', '#7209B7', '#560BAD', '#480CA8', '#3A0CA3', '#3F37C9', '#4361EE', '#4895EF', '#4CC9F0'] },
];

export function normalizePaletteTemplateId(value: unknown): PaletteTemplateId {
	return typeof value === 'string' && PALETTE_TEMPLATE_IDS.includes(value as PaletteTemplateId)
		? value as PaletteTemplateId
		: 'default';
}

export function paletteTemplate(id: PaletteTemplateId): PaletteTemplate {
	return PALETTE_TEMPLATES.find((template) => template.id === id) ?? PALETTE_TEMPLATES[0];
}

export function normalizeHex(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(input.trim());
	if (!match?.[1]) return null;
	const raw = match[1].toUpperCase();
	return raw.length === 3
		? `#${raw.split('').map((character) => character.repeat(2)).join('')}`
		: `#${raw}`;
}

export function resolveChoice(choice: ColorChoice, paletteId: PaletteTemplateId): ResolvedColor | null {
	if (choice.kind === 'none') return null;
	const template = paletteTemplate(paletteId);
	const hex = choice.kind === 'custom'
		? normalizeHex(choice.hex)
		: template.colors[Math.min(Math.max(choice.slot, 0), template.colors.length - 1)];
	if (!hex) return null;
	return {
		hex,
		...(choice.strength === undefined ? {} : { strength: normalizeStrength(choice.strength) }),
		foregroundLight: adjustForContrast(hex, '#FFFFFF'),
		foregroundDark: adjustForContrast(hex, '#1E1E1E'),
	};
}

export function normalizeStrength(input: unknown): number {
	return typeof input === 'number' && Number.isFinite(input)
		? Math.min(100, Math.max(0, Math.round(input)))
		: 100;
}

export function resolveTextAgainstBackground(
	text: ResolvedColor,
	background: ResolvedColor | null,
): ResolvedColor {
	const backgroundAmount = (background?.strength ?? 12) / 100;
	const lightSurface = background ? mixHex('#FFFFFF', background.hex, backgroundAmount) : '#FFFFFF';
	const darkSurface = background ? mixHex('#1E1E1E', background.hex, backgroundAmount) : '#1E1E1E';
	return {
		...text,
		foregroundLight: adjustForContrast(text.hex, lightSurface),
		foregroundDark: adjustForContrast(text.hex, darkSurface),
	};
}

export function resolveAutomaticText(background: ResolvedColor): ResolvedColor {
	const amount = (background.strength ?? 12) / 100;
	const lightSurface = mixHex('#FFFFFF', background.hex, amount);
	const darkSurface = mixHex('#1E1E1E', background.hex, amount);
	const mostReadable = (surface: string) => contrastRatio('#FFFFFF', surface) >= contrastRatio('#000000', surface)
		? '#FFFFFF'
		: '#000000';
	const foregroundLight = mostReadable(lightSurface);
	const foregroundDark = mostReadable(darkSurface);
	return {
		hex: foregroundLight,
		strength: 100,
		foregroundLight,
		foregroundDark,
	};
}

interface Rgb { r: number; g: number; b: number }

function hexToRgb(hex: string): Rgb {
	const normalized = normalizeHex(hex) ?? '#000000';
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16),
	};
}

function rgbToHex(rgb: Rgb): string {
	const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0').toUpperCase();
	return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
	return {
		r: from.r + (to.r - from.r) * amount,
		g: from.g + (to.g - from.g) * amount,
		b: from.b + (to.b - from.b) * amount,
	};
}

function mixHex(from: string, to: string, amount: number): string {
	return rgbToHex(mixRgb(hexToRgb(from), hexToRgb(to), amount));
}

function relativeLuminance(rgb: Rgb): number {
	const linearize = (channel: number) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

export function contrastRatio(firstHex: string, secondHex: string): number {
	const first = relativeLuminance(hexToRgb(firstHex));
	const second = relativeLuminance(hexToRgb(secondHex));
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function adjustForContrast(foregroundHex: string, backgroundHex: string, minimumRatio = 4.5): string {
	if (contrastRatio(foregroundHex, backgroundHex) >= minimumRatio) return normalizeHex(foregroundHex)!;
	const foreground = hexToRgb(foregroundHex);
	const background = hexToRgb(backgroundHex);
	const target = relativeLuminance(background) > 0.5
		? { r: 0, g: 0, b: 0 }
		: { r: 255, g: 255, b: 255 };
	for (let step = 1; step <= 100; step += 1) {
		const candidate = rgbToHex(mixRgb(foreground, target, step / 100));
		if (contrastRatio(candidate, backgroundHex) >= minimumRatio) return candidate;
	}
	return rgbToHex(target);
}
