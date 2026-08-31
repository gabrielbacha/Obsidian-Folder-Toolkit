import type { App, WorkspaceLeaf } from 'obsidian';
import { resolveAppearance } from './appearance-resolver';
import { syncClass, syncStyle } from './dom-sync';
import type { FolderToolkitSettings } from './types';

const TAB_CLASSES = ['ft-tab-has-text', 'ft-tab-background', 'ft-tab-border'] as const;
const TAB_PROPERTIES = ['--ft-tab-text', '--ft-tab-background', '--ft-tab-border'] as const;

export interface TabAccents {
	text: string | null;
	background: string | null;
}

export function tabAccents(path: string, settings: FolderToolkitSettings): TabAccents {
	const appearance = resolveAppearance(path, { settings });
	return {
		text: appearance.text?.hex ?? null,
		background: appearance.background?.hex ?? null,
	};
}

export class TabManager {
	private frame: number | null = null;

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

		if (settings.tabStyle !== 'off') {
			this.app.workspace.iterateAllLeaves((leaf) => {
				const state = leaf.getViewState();
				const path = state.type === 'markdown' && typeof state.state?.file === 'string'
					? state.state.file
					: null;
				if (!path) return;
				const header = this.findHeader(leaf);
				if (!header) return;

				processedHeaders.add(header);
				const accents = tabAccents(path, settings);
				const useBackground = accents.background !== null && settings.tabStyle === 'background';
				const useBorder = accents.background !== null && settings.tabStyle === 'border';

				syncClass(header, 'ft-tab-has-text', accents.text !== null);
				syncClass(header, 'ft-tab-background', useBackground);
				syncClass(header, 'ft-tab-border', useBorder);
				syncStyle(header.style, '--ft-tab-text', accents.text);
				syncStyle(header.style, '--ft-tab-background', useBackground ? accents.background : null);
				syncStyle(header.style, '--ft-tab-border', useBorder ? accents.background : null);
			});
		}

		for (const header of this.app.workspace.containerEl.querySelectorAll<HTMLElement>('.workspace-tab-header')) {
			if (!processedHeaders.has(header)) this.clearHeader(header);
		}
	}

	stop(): void {
		if (this.frame !== null) window.cancelAnimationFrame(this.frame);
		this.frame = null;
		for (const header of this.app.workspace.containerEl.querySelectorAll<HTMLElement>('.workspace-tab-header')) {
			this.clearHeader(header);
		}
	}

	private findHeader(leaf: WorkspaceLeaf): HTMLElement | null {
		const leafElement = leaf.view.containerEl.closest('.workspace-leaf');
		const tabsElement = leafElement?.closest('.workspace-tabs');
		if (!leafElement || !tabsElement) return null;
		const leaves = [...tabsElement.querySelectorAll<HTMLElement>('.workspace-leaf')]
			.filter((element) => element.closest('.workspace-tabs') === tabsElement);
		const headers = [...tabsElement.querySelectorAll<HTMLElement>('.workspace-tab-header')]
			.filter((element) => element.closest('.workspace-tabs') === tabsElement);
		const index = leaves.indexOf(leafElement as HTMLElement);
		return index >= 0 ? headers[index] ?? null : null;
	}

	private clearHeader(header: HTMLElement): void {
		for (const className of TAB_CLASSES) syncClass(header, className, false);
		for (const property of TAB_PROPERTIES) syncStyle(header.style, property, null);
	}
}
