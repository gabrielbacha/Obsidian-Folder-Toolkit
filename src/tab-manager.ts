import type { App, WorkspaceLeaf } from 'obsidian';
import { resolveAppearance } from './appearance-resolver';
import { syncClass, syncStyle } from './dom-sync';
import type { AppearanceRule, FolderToolkitSettings } from './types';

const TAB_CLASSES = ['ft-tab-has-text', 'ft-tab-background', 'ft-tab-border'] as const;
const TAB_PROPERTIES = [
	'--ft-tab-text', '--ft-tab-background', '--ft-tab-border', '--ft-tab-strength', '--ft-tab-hover-strength',
	'--ft-tab-text-dark', '--ft-tab-text-strength', '--ft-tab-border-strength', '--ft-tab-border-hover-strength',
] as const;

export interface TabAccents {
	text: string | null;
	textDark: string | null;
	textStrength: number | null;
	background: string | null;
	backgroundStrength: number | null;
	/** The item's own border color, or null when it has none. */
	border: string | null;
	borderStrength: number | null;
}

const NO_ACCENTS: TabAccents = {
	text: null, textDark: null, textStrength: null, background: null, backgroundStrength: null, border: null, borderStrength: null,
};

/** Where the "show on note tabs" choice for `path` comes from. */
export interface TabVisibility {
	visible: boolean;
	/** The path whose rule decides, or null for the default. */
	origin: string | null;
}

/** The nearest rule at or above `path` that sets `tabs` decides. Without one, tabs show colors. */
export function tabVisibility(path: string, rules: Record<string, AppearanceRule>): TabVisibility {
	let candidate: string | null = path;
	while (candidate) {
		const tabs = rules[candidate]?.tabs;
		if (typeof tabs === 'boolean') return { visible: tabs, origin: candidate };
		const index = candidate.lastIndexOf('/');
		candidate = index === -1 ? null : candidate.slice(0, index);
	}
	return { visible: true, origin: null };
}

export function tabAccents(path: string, settings: FolderToolkitSettings): TabAccents {
	if (!tabVisibility(path, settings.appearanceRules).visible) return NO_ACCENTS;
	const appearance = resolveAppearance(path, { settings });
	return {
		text: appearance.text?.foregroundLight ?? null,
		textDark: appearance.text?.foregroundDark ?? null,
		textStrength: appearance.text?.strength ?? null,
		background: appearance.background?.hex ?? null,
		backgroundStrength: appearance.background?.strength ?? null,
		border: appearance.border?.color.hex ?? null,
		borderStrength: appearance.border?.color.strength ?? null,
	};
}

export class TabManager {
	private frame: number | null = null;
	private readonly styledHeaders = new Set<HTMLElement>();

	constructor(
		private readonly app: App,
		private readonly getSettings: () => FolderToolkitSettings,
	) {}

	start(): void {
		this.reconcileSoon();
	}

	reconcileSoon(): void {
		if (this.frame !== null) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.reconcile();
		});
	}

	reconcile(): void {
		const settings = this.getSettings();
		const processedHeaders = new Set<HTMLElement>();
		const headerIndexes = new Map<Element, Map<Element, HTMLElement>>();

		if (settings.tabStyle !== 'off') {
			this.app.workspace.iterateAllLeaves((leaf) => {
				const state = leaf.getViewState();
				const path = state.type === 'markdown' && typeof state.state?.file === 'string'
					? state.state.file
					: null;
				if (!path) return;
				const header = this.findHeader(leaf, headerIndexes);
				if (!header) return;

				processedHeaders.add(header);
				this.styledHeaders.add(header);
				const accents = tabAccents(path, settings);
				const style = settings.tabStyle;
				const useBackground = accents.background !== null && (style === 'background' || style === 'both');
				// The border uses the item's border color, or its background color when it has no border.
				const borderColor = accents.border ?? accents.background;
				// A border borrowed from a light background tint would be nearly invisible, so it uses the
				// stylesheet's strong default instead of the background strength.
				const borderStrength = accents.border !== null ? accents.borderStrength : null;
				const useBorder = borderColor !== null && (style === 'border' || style === 'both');

				syncClass(header, 'ft-tab-has-text', accents.text !== null);
				syncClass(header, 'ft-tab-background', useBackground);
				syncClass(header, 'ft-tab-border', useBorder);
				syncStyle(header.style, '--ft-tab-text', accents.text);
				syncStyle(header.style, '--ft-tab-text-dark', accents.textDark);
				syncStyle(header.style, '--ft-tab-text-strength', accents.textStrength === null ? null : `${accents.textStrength}%`);
				syncStyle(header.style, '--ft-tab-background', useBackground ? accents.background : null);
				syncStyle(header.style, '--ft-tab-border', useBorder ? borderColor : null);
				syncStyle(header.style, '--ft-tab-border-strength', useBorder && borderStrength !== null ? `${borderStrength}%` : null);
				syncStyle(header.style, '--ft-tab-border-hover-strength', useBorder && borderStrength !== null ? `${Math.min(100, borderStrength + 20)}%` : null);
				syncStyle(header.style, '--ft-tab-strength', accents.backgroundStrength === null ? null : `${accents.backgroundStrength}%`);
				syncStyle(header.style, '--ft-tab-hover-strength', accents.backgroundStrength === null ? null : `${Math.min(100, accents.backgroundStrength + 8)}%`);
			});
		}

		for (const header of this.app.workspace.containerEl.querySelectorAll<HTMLElement>('.workspace-tab-header')) this.styledHeaders.add(header);
		for (const header of this.styledHeaders) {
			if (!processedHeaders.has(header)) { this.clearHeader(header); this.styledHeaders.delete(header); }
		}
	}

	stop(): void {
		if (this.frame !== null) window.cancelAnimationFrame(this.frame);
		this.frame = null;
		for (const header of this.app.workspace.containerEl.querySelectorAll<HTMLElement>('.workspace-tab-header')) this.styledHeaders.add(header);
		for (const header of this.styledHeaders) this.clearHeader(header);
		this.styledHeaders.clear();
	}

	private findHeader(leaf: WorkspaceLeaf, indexes: Map<Element, Map<Element, HTMLElement>>): HTMLElement | null {
		const leafElement = leaf.view.containerEl.closest('.workspace-leaf');
		const tabsElement = leafElement?.closest('.workspace-tabs');
		if (!leafElement || !tabsElement) return null;
		const cached = indexes.get(tabsElement);
		if (cached) return cached.get(leafElement) ?? null;
		const leaves = [...tabsElement.querySelectorAll<HTMLElement>('.workspace-leaf')]
			.filter((element) => element.closest('.workspace-tabs') === tabsElement);
		const headers = [...tabsElement.querySelectorAll<HTMLElement>('.workspace-tab-header')]
			.filter((element) => element.closest('.workspace-tabs') === tabsElement);
		const mapped = new Map<Element, HTMLElement>();
		leaves.forEach((element, index) => { if (headers[index]) mapped.set(element, headers[index]); });
		indexes.set(tabsElement, mapped);
		return mapped.get(leafElement) ?? null;
	}

	private clearHeader(header: HTMLElement): void {
		for (const className of TAB_CLASSES) syncClass(header, className, false);
		for (const property of TAB_PROPERTIES) syncStyle(header.style, property, null);
	}
}
