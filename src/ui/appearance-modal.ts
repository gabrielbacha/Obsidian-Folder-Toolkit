import { Modal, TAbstractFile, TFolder } from 'obsidian';
import {
	createFileAppearancePreset,
	createFolderAppearancePreset,
	FILE_APPEARANCE_PRESETS,
	createSubfolderAppearancePreset,
	FOLDER_APPEARANCE_PRESETS,
	paletteSlotsUsedByAppearance,
	SUBFOLDER_APPEARANCE_PRESETS,
	withSubfolderAppearance,
	type AppearancePresetDefinition,
	type SubfolderAppearanceState,
} from '../appearance-presets';
import { paletteTemplate } from '../colors';
import { AppearanceControlRenderer } from './appearance-controls';
import { buildPreviewTree, stylePreviewTree, type PreviewTree } from './preview-tree';
import type FolderToolkitPlugin from '../main';
import { tagAppearancePalette, type AppearanceOwner } from '../nested-vaults';
import type { AppearanceRule, BorderAppearanceRule, BorderRule, DescendantRule, FolderToolkitSettings, PaletteTemplateId, TextAppearanceRule } from '../types';

/** The vault that stores an item's appearance, its palette, and the rule saved there. */
export interface AppearanceTarget {
	owner: AppearanceOwner;
	paletteTemplateId: PaletteTemplateId;
	rule: AppearanceRule | undefined;
}

type EffectKey = 'text' | 'background';

interface PresetResult {
	rule: AppearanceRule;
	subfolders?: SubfolderAppearanceState;
}

function isBorderRule(border: BorderAppearanceRule | undefined): border is BorderRule {
	return border !== undefined && !('kind' in border);
}

export class AppearanceModal extends Modal {
	private draft: AppearanceRule;
	private readonly isFolder: boolean;
	private readonly controls: AppearanceControlRenderer;
	private readonly target: AppearanceTarget;
	private rememberedBorder: BorderRule;
	private rememberedDescendants: DescendantRule;
	private textCascade: boolean;
	private backgroundCascade: boolean;
	private presetsOpen = false;

	constructor(
		private readonly toolkit: FolderToolkitPlugin,
		private readonly path: string,
		private readonly onSaved?: () => void,
		target?: AppearanceTarget,
	) {
		super(toolkit.app);
		this.target = target ?? {
			owner: { root: null, relativePath: path },
			paletteTemplateId: toolkit.settings.paletteTemplateId,
			rule: toolkit.settings.appearanceRules[path],
		};
		this.controls = new AppearanceControlRenderer(toolkit, () => this.target.paletteTemplateId);
		this.draft = structuredClone(this.target.rule ?? {});
		this.isFolder = toolkit.app.vault.getAbstractFileByPath(path) instanceof TFolder;
		this.rememberedBorder = structuredClone(isBorderRule(this.draft.border) ? this.draft.border : {
			style: 'box',
			color: { kind: 'preset', slot: 0 },
			thickness: 'thin',
		});
		this.rememberedDescendants = structuredClone(this.draft.descendants ?? {
			enabled: true,
			style: 'rail',
			thickness: 'thin',
			shading: false,
		});
		this.textCascade = this.draft.text?.cascade ?? false;
		this.backgroundCascade = this.draft.background?.cascade ?? false;
	}

	onOpen(): void {
		this.contentEl.ownerDocument.body.addClass('ft-show-direct-color-indicators');
		this.setTitle(`Edit ${this.isFolder ? 'folder' : 'file'} appearance`);
		this.render();
	}

	onClose(): void {
		this.contentEl.ownerDocument.body.removeClass('ft-show-direct-color-indicators');
		this.clearPickerListeners();
		this.toolkit.clearAppearancePreview(this.path);
		this.contentEl.empty();
	}

	private render(): void {
		this.clearPickerListeners();
		this.contentEl.empty();
		this.contentEl.addClass('ft-appearance-modal', this.isFolder ? 'ft-appearance-modal--folder' : 'ft-appearance-modal--file');
		const layout = this.contentEl.createDiv('ft-appearance-layout');
		const previewPane = layout.createDiv('ft-appearance-preview-pane');
		this.renderPreview(previewPane);
		const cards = layout.createDiv('ft-appearance-grid');
		this.renderBackground(cards);
		this.renderBorder(cards);
		this.renderText(cards);
		if (this.isFolder) this.renderDescendants(cards);
		this.renderPresets();
		this.renderOwnerNote();

		const footer = this.contentEl.createDiv('ft-modal-footer');
		const error = footer.createDiv({ cls: 'ft-field-error', attr: { role: 'status' } });
		const clear = footer.createEl('button', { text: 'Reset to inherited', attr: { type: 'button' } });
		clear.addEventListener('click', () => {
			this.draft = {};
			this.textCascade = false;
			this.backgroundCascade = false;
			this.render();
		});
		const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		const save = footer.createEl('button', { text: 'Save', cls: 'mod-cta', attr: { type: 'button' } });
		save.addEventListener('click', () => { void this.save(save, error); });
		this.refreshPreview();
	}

	private renderPresets(): void {
		const section = this.contentEl.createEl('details', { cls: 'ft-appearance-presets' });
		section.open = this.presetsOpen;
		section.addEventListener('toggle', () => { this.presetsOpen = section.open; });
		const heading = section.createEl('summary', { cls: 'ft-appearance-presets__header' });
		heading.createSpan({ text: 'Presets', cls: 'ft-card-title' });
		const slot = this.nextSiblingPaletteSlot();
		if (!this.isFolder) {
			heading.createSpan({ text: 'Replace all settings above with a starting style.', cls: 'ft-appearance-presets__hint' });
			this.renderPresetGroup(section, undefined, FILE_APPEARANCE_PRESETS, (id) => ({ rule: createFileAppearancePreset(id, slot) }));
			return;
		}
		heading.createSpan({ text: 'Each group replaces only its own settings.', cls: 'ft-appearance-presets__hint' });
		this.renderPresetGroup(
			section,
			{ title: 'This folder', hint: 'Background, border, and label of the folder row.' },
			FOLDER_APPEARANCE_PRESETS,
			(id) => {
				const subfolders = this.subfolderState();
				return { rule: withSubfolderAppearance(createFolderAppearancePreset(id, slot), subfolders), subfolders };
			},
		);
		this.renderPresetGroup(
			section,
			{ title: 'Subfolders', hint: 'How the folder style reaches its subfolders and notes.' },
			SUBFOLDER_APPEARANCE_PRESETS,
			(id) => {
				const subfolders = createSubfolderAppearancePreset(id);
				return { rule: withSubfolderAppearance(this.draft, subfolders), subfolders };
			},
		);
	}

	/** Renders one row of preset buttons. `build` returns the full draft that applying the preset produces, plus the subfolder state for folders. */
	private renderPresetGroup<Id extends string>(
		container: HTMLElement,
		heading: { title: string; hint: string } | undefined,
		presets: ReadonlyArray<AppearancePresetDefinition<Id>>,
		build: (id: Id) => PresetResult,
	): void {
		const group = container.createDiv('ft-appearance-presets__group');
		if (heading) {
			const header = group.createDiv('ft-appearance-presets__group-header');
			header.createEl('h4', { text: heading.title });
			header.createSpan({ text: heading.hint, cls: 'ft-appearance-presets__hint' });
		}
		const list = group.createDiv('ft-appearance-presets__list');
		for (const preset of presets) {
			const { rule } = build(preset.id);
			const button = list.createEl('button', {
				cls: 'ft-appearance-preset',
				attr: { type: 'button', 'aria-label': `Apply ${preset.label} preset. ${preset.description}`, title: preset.description },
			});
			const sample = button.createDiv({ cls: 'ft-appearance-preset__sample', attr: { 'aria-hidden': 'true' } });
			const tree = buildPreviewTree(sample, this.path, this.isFolder, 'compact');
			stylePreviewTree(tree, this.previewSettings(), this.path, this.previewRule(rule));
			button.createSpan({ text: preset.label, cls: 'ft-appearance-preset__label' });
			button.addEventListener('click', () => this.applyPreset(build(preset.id)));
		}
	}

	private subfolderState(): SubfolderAppearanceState {
		return {
			...(this.draft.descendants ? { descendants: this.draft.descendants } : {}),
			textCascade: this.textCascade,
			backgroundCascade: this.backgroundCascade,
		};
	}

	private applyPreset({ rule, subfolders }: PresetResult): void {
		this.draft = rule;
		this.textCascade = subfolders?.textCascade ?? false;
		this.backgroundCascade = subfolders?.backgroundCascade ?? false;
		if (isBorderRule(this.draft.border)) this.rememberedBorder = structuredClone(this.draft.border);
		if (this.draft.descendants) this.rememberedDescendants = structuredClone(this.draft.descendants);
		this.render();
	}

	/**
	 * Picks the first palette slot not already used by a sibling of the same kind
	 * (folders compare against sibling folders, files against sibling files), so
	 * neighbouring items receive distinct colors. Falls back to a stable
	 * alphabetical position when every slot is taken.
	 */
	private nextSiblingPaletteSlot(): number {
		const item = this.toolkit.app.vault.getAbstractFileByPath(this.path);
		const paletteLength = paletteTemplate(this.target.paletteTemplateId).colors.length;
		if (!(item instanceof TAbstractFile) || !item.parent || paletteLength === 0) return 0;
		const sameKind = (candidate: TAbstractFile) => (candidate instanceof TFolder) === this.isFolder;
		const siblings = item.parent.children.filter((child) => sameKind(child) && child.path !== item.path);
		const rules = this.previewSettings().appearanceRules;
		const used = new Set(siblings.flatMap((sibling) => paletteSlotsUsedByAppearance(rules[sibling.path])));
		for (let slot = 0; slot < paletteLength; slot += 1) {
			if (!used.has(slot)) return slot;
		}
		const ordered = [...siblings, item].sort((a, b) => a.name.localeCompare(b.name));
		return Math.max(0, ordered.findIndex((candidate) => candidate.path === item.path)) % paletteLength;
	}

	private async save(button: HTMLButtonElement, error: HTMLElement): Promise<void> {
		button.disabled = true;
		try {
			if (this.isNested()) await this.toolkit.setAppearance(this.path, this.draft, this.target.owner);
			else await this.toolkit.setAppearance(this.path, this.draft);
			this.onSaved?.();
			this.close();
		} catch {
			error.setText('The appearance rule could not be saved. Try again.');
			error.addClass('is-visible');
			button.disabled = false;
		}
	}

	private previewTree: PreviewTree | null = null;

	private renderPreview(container: HTMLElement): void {
		const preview = container.createDiv('ft-live-preview');
		preview.createDiv({ text: 'Preview', cls: 'ft-live-preview__label' });
		this.previewTree = buildPreviewTree(preview, this.path, this.isFolder, 'full');
		this.updateModalPreview();
	}

	private refreshPreview(): void {
		this.updateModalPreview();
		if (this.isNested()) this.toolkit.previewAppearance(this.path, this.draft, this.target.paletteTemplateId);
		else this.toolkit.previewAppearance(this.path, this.draft);
	}

	private updateModalPreview(): void {
		if (this.previewTree) stylePreviewTree(this.previewTree, this.previewSettings(), this.path, this.previewRule(this.draft));
	}

	private isNested(): boolean {
		return this.target.owner.root !== null;
	}

	/** Settings as the explorer shows them, so inherited colors from nested vaults appear in the preview. */
	private previewSettings(): FolderToolkitSettings {
		return typeof this.toolkit.effectiveSettings === 'function' ? this.toolkit.effectiveSettings() : this.toolkit.settings;
	}

	private previewRule(rule: AppearanceRule): AppearanceRule {
		return this.isNested() ? tagAppearancePalette(rule, this.target.paletteTemplateId) : rule;
	}

	/** Says where the rule is saved when that is not obvious. */
	private renderOwnerNote(): void {
		const { root, skippedVault } = this.target.owner;
		const vaultName = (path: string) => path.split('/').at(-1) ?? path;
		const text = root !== null
			? `Saved in the settings of the “${vaultName(root)}” vault.`
			: skippedVault
				? `The “${vaultName(skippedVault)}” vault does not have Folder Toolkit, so this is saved in this vault.`
				: null;
		if (text) this.contentEl.createDiv({ text, cls: 'ft-appearance-owner' });
	}

	private renderBackground(container: HTMLElement): void {
		const card = container.createDiv('ft-color-card ft-color-card--background');
		const header = card.createDiv('ft-color-card__header');
		header.createEl('h3', { text: 'Background' });
		if (this.isFolder) this.renderCascade(header, 'background');
		const actions = card.createDiv('ft-choice-row');
		this.clearButton(actions, 'Clear color', this.draft.background === undefined, () => {
			delete this.draft.background;
			this.render();
		});
		this.controls.choiceButton(actions, 'No color', this.draft.background?.choice.kind === 'none', () => {
			this.draft.background = { choice: { kind: 'none' }, cascade: this.backgroundCascade };
			this.render();
		});
		this.controls.renderColorControls(card, {
			selected: this.draft.background?.choice,
			defaultStrength: 12,
			onSelect: (choice, rerender) => {
				if (!choice) return;
				this.draft.background = { choice, cascade: this.backgroundCascade };
				if (rerender) this.render(); else this.refreshPreview();
			},
		});
	}

	private renderText(container: HTMLElement): void {
		const card = container.createDiv('ft-color-card ft-color-card--text');
		const header = card.createDiv('ft-color-card__header');
		header.createEl('h3', { text: 'Text' });
		if (this.isFolder) this.renderCascade(header, 'text');
		const actions = card.createDiv('ft-choice-row');
		this.clearButton(actions, 'Clear color', this.draft.text?.color === undefined, () => {
			if (!this.draft.text) return;
			delete this.draft.text.color;
			this.removeEmptyTextOverride();
			this.render();
		});
		this.controls.choiceButton(actions, 'No color', this.draft.text?.color?.kind === 'none', () => {
			this.ensureText().color = { kind: 'none' };
			this.render();
		});
		this.controls.renderColorControls(card, {
			selected: this.draft.text?.color,
			defaultStrength: 100,
			includeWhite: true,
			onSelect: (choice, rerender) => {
				if (!choice) return;
				this.ensureText().color = choice;
				if (rerender) this.render(); else this.refreshPreview();
			},
		});
		this.controls.renderTypography(card, this.draft.text?.bold ?? false, this.draft.text?.strikethrough ?? false, (bold, strikethrough) => {
			this.draft.text = { ...this.ensureText(), bold, strikethrough };
			this.removeEmptyTextOverride();
			this.render();
		});
	}

	private ensureText(): TextAppearanceRule {
		this.draft.text ??= { bold: false, strikethrough: false, cascade: this.textCascade };
		return this.draft.text;
	}

	private removeEmptyTextOverride(): void {
		if (this.draft.text && this.draft.text.color === undefined && !this.draft.text.bold && !this.draft.text.strikethrough) {
			delete this.draft.text;
		}
	}

	private renderCascade(container: HTMLElement, key: EffectKey): void {
		const cascade = container.createEl('label', { cls: 'ft-cascade-control' });
		const checkbox = cascade.createEl('input', { attr: { type: 'checkbox' } });
		checkbox.checked = key === 'text' ? this.textCascade : this.backgroundCascade;
		cascade.createSpan({ text: 'Include descendants' });
		checkbox.addEventListener('change', () => {
			if (key === 'text') {
				this.textCascade = checkbox.checked;
				if (this.draft.text) this.draft.text = { ...this.draft.text, cascade: checkbox.checked };
			} else {
				this.backgroundCascade = checkbox.checked;
				if (this.draft.background) this.draft.background = { ...this.draft.background, cascade: checkbox.checked };
			}
			this.refreshPreview();
		});
	}

	private renderBorder(container: HTMLElement): void {
		const card = container.createDiv('ft-color-card ft-color-card--border');
		const header = card.createDiv('ft-color-card__header');
		header.createEl('h3', { text: 'Border' });
		this.clearButton(header, 'Clear border', this.draft.border === undefined, () => {
			if (isBorderRule(this.draft.border)) this.rememberedBorder = structuredClone(this.draft.border);
			delete this.draft.border;
			this.render();
		});

		const activeBorder = isBorderRule(this.draft.border) ? this.draft.border : undefined;
		const styles = card.createDiv('ft-choice-row');
		this.choiceButton(styles, 'No border', this.draft.border !== undefined && !isBorderRule(this.draft.border), () => {
			this.draft.border = { kind: 'none' };
			this.render();
		});
		this.choiceButton(styles, 'Rounded box', activeBorder?.style === 'box', () => {
			this.rememberedBorder = { ...this.rememberedBorder, style: 'box' };
			this.draft.border = structuredClone(this.rememberedBorder);
			this.render();
		});
		this.choiceButton(styles, 'Vertical rail', activeBorder?.style === 'rail', () => {
			this.rememberedBorder = { ...this.rememberedBorder, style: 'rail' };
			this.draft.border = structuredClone(this.rememberedBorder);
			this.render();
		});

		const thicknessRow = card.createDiv('ft-choice-row');
		const currentThickness = activeBorder?.thickness;
		for (const size of ['thin', 'medium', 'thick'] as const) {
			this.choiceButton(thicknessRow, size.charAt(0).toUpperCase() + size.slice(1), currentThickness === size, () => {
				this.rememberedBorder = { ...this.rememberedBorder, thickness: size };
				this.draft.border = structuredClone(this.rememberedBorder);
				this.render();
			});
		}

		this.controls.renderColorControls(card, {
			selected: activeBorder?.color,
			defaultStrength: this.rememberedBorder.style === 'box' ? 42 : 55,
			onSelect: (choice, rerender) => {
				if (choice && choice.kind !== 'none') {
					this.rememberedBorder = { ...this.rememberedBorder, color: choice };
					this.draft.border = structuredClone(this.rememberedBorder);
				}
				if (rerender) this.render(); else this.refreshPreview();
			},
		});
	}

	private renderDescendants(container: HTMLElement): void {
		const card = container.createDiv('ft-color-card ft-color-card--border');
		const header = card.createDiv('ft-color-card__header');
		header.createEl('h3', { text: 'Direct subfolders' });
		this.clearButton(header, 'Clear subfolder style', this.draft.descendants === undefined, () => {
			if (this.draft.descendants) this.rememberedDescendants = structuredClone(this.draft.descendants);
			delete this.draft.descendants;
			this.render();
		});

		const styles = card.createDiv('ft-choice-row');
		this.choiceButton(styles, 'Rounded box', this.draft.descendants?.style === 'box', () => {
			this.rememberedDescendants = { ...this.rememberedDescendants, style: 'box' };
			this.draft.descendants = structuredClone(this.rememberedDescendants);
			this.render();
		});
		this.choiceButton(styles, 'Vertical rail', this.draft.descendants?.style === 'rail', () => {
			this.rememberedDescendants = { ...this.rememberedDescendants, style: 'rail' };
			this.draft.descendants = structuredClone(this.rememberedDescendants);
			this.render();
		});

		const thicknessRow = card.createDiv('ft-choice-row');
		const currentThickness = this.draft.descendants?.thickness;
		for (const size of ['thin', 'medium', 'thick'] as const) {
			this.choiceButton(thicknessRow, size.charAt(0).toUpperCase() + size.slice(1), currentThickness === size, () => {
				this.rememberedDescendants = { ...this.rememberedDescendants, thickness: size };
				this.draft.descendants = structuredClone(this.rememberedDescendants);
				this.render();
			});
		}

		const shadingRow = card.createDiv('ft-choice-row');
		const shadingToggle = shadingRow.createEl('label', { cls: 'ft-border-toggle' });
		const shadingCheck = shadingToggle.createEl('input', { attr: { type: 'checkbox' } });
		shadingCheck.checked = this.draft.descendants?.shading === true;
		shadingToggle.createSpan({ text: 'Light shading inside border' });
		shadingCheck.addEventListener('change', () => {
			this.rememberedDescendants = { ...this.rememberedDescendants, shading: shadingCheck.checked };
			this.draft.descendants = structuredClone(this.rememberedDescendants);
			this.render();
		});
	}

	private clearButton(container: HTMLElement, label: string, disabled: boolean, onClick: () => void): void {
		const button = container.createEl('button', { text: label, cls: 'ft-clear-override', attr: { type: 'button' } });
		button.disabled = disabled;
		button.addEventListener('click', onClick);
	}

	private clearPickerListeners(): void {
		this.controls.dispose();
	}

	private choiceButton(container: HTMLElement, label: string, selected: boolean, onClick: () => void): void {
		this.controls.choiceButton(container, label, selected, onClick);
	}
}
