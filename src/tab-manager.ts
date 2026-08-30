import type { App, WorkspaceLeaf } from 'obsidian';
import { resolveAppearance } from './appearance-resolver';
import type { FolderToolkitSettings } from './types';

const TAB_CLASSES = ['ft-tab-has-text', 'ft-tab-background', 'ft-tab-border'] as const;
const TAB_PROPERTIES = ['--ft-tab-text', '--ft-tab-background', '--ft-tab-border'] as const;

export interface TabAccents {
	text: string | null;
	background: string | null;
}

export function tabAccents(path: string, settings: FolderToolkitSettings): TabAccents {
	const appearance = resolveAppearance(path, settings);
	return {
		text: appearance.text?.hex ?? null,
		background: appearance.background?.hex ?? null,
	};
}

export class TabManager {
	private observer: MutationObserver | null = null;
	private frame: number | null = null;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => FolderToolkitSettings,
	) {}

	start(): void {
		const root = this.app.workspace.containerEl;
		const Observer = root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
		this.observer = new Observer(() => this.reconcileSoon());
		this.observer.observe(root, { childList: true, subtree: true });
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
		for (const header of this.app.workspace.containerEl.querySelectorAll<HTMLElement>('.workspace-tab-header')) {
			this.clearHeader(header);
		}
		if (settings.tabStyle === 'off') return;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const state = leaf.getViewState();
			const path = state.type === 'markdown' && typeof state.state?.file === 'string'
				? state.state.file
				: null;
			if (!path) return;
			const header = this.findHeader(leaf);
			if (!header) return;
			const accents = tabAccents(path, settings);
			if (accents.text) {
				header.classList.add('ft-tab-has-text');
				header.style.setProperty('--ft-tab-text', accents.text);
			}
			if (!accents.background) return;
			const treatment = settings.tabStyle === 'background' ? 'background' : 'border';
			header.classList.add(`ft-tab-${treatment}`);
			header.style.setProperty(`--ft-tab-${treatment}`, accents.background);
		});
	}

	stop(): void {
		this.observer?.disconnect();
		this.observer = null;
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
		header.classList.remove(...TAB_CLASSES);
		for (const property of TAB_PROPERTIES) header.style.removeProperty(property);
	}
}
