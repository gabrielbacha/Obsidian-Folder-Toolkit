import { Modal, TFolder, setIcon } from 'obsidian';
import { resolveAppearance } from '../appearance-resolver';
import { AppearanceControlRenderer } from './appearance-controls';
import type FolderToolkitPlugin from '../main';
import type { AppearanceRule, BorderAppearanceRule, BorderRule, DescendantRule, TextAppearanceRule } from '../types';

type EffectKey = 'text' | 'background';

function isBorderRule(border: BorderAppearanceRule | undefined): border is BorderRule {
	return border !== undefined && !('kind' in border);
}

export class AppearanceModal extends Modal {
	private draft: AppearanceRule;
	private readonly isFolder: boolean;
	private readonly controls = new AppearanceControlRenderer(this.toolkit);
	private rememberedBorder: BorderRule;
	private rememberedDescendants: DescendantRule;
	private textCascade: boolean;
	private backgroundCascade: boolean;

	constructor(
		private readonly toolkit: FolderToolkitPlugin,
		private readonly path: string,
		private readonly onSaved?: () => void,
	) {
		super(toolkit.app);
		this.draft = structuredClone(toolkit.settings.appearanceRules[path] ?? {});
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
		this.textCascade = this.draft.text?.cascade ?? this.isFolder;
		this.backgroundCascade = this.draft.background?.cascade ?? this.isFolder;
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

		const footer = this.contentEl.createDiv('ft-modal-footer');
		const clear = footer.createEl('button', { text: 'Reset to inherited', attr: { type: 'button' } });
		clear.addEventListener('click', () => {
			this.draft = {};
			this.textCascade = this.isFolder;
			this.backgroundCascade = this.isFolder;
			this.render();
		});
		const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		const save = footer.createEl('button', { text: 'Save', cls: 'mod-cta', attr: { type: 'button' } });
		const error = this.contentEl.createDiv({ cls: 'ft-field-error', attr: { role: 'status' } });
		footer.before(error);
		save.addEventListener('click', () => { void this.save(save, error); });
		this.refreshPreview();
	}

	private async save(button: HTMLButtonElement, error: HTMLElement): Promise<void> {
		button.disabled = true;
		try {
			await this.toolkit.setAppearance(this.path, this.draft);
			this.onSaved?.();
			this.close();
		} catch {
			error.setText('The appearance rule could not be saved. Try again.');
			error.addClass('is-visible');
			button.disabled = false;
		}
	}

	private previewRows: Array<{ path: string; el: HTMLElement; titleEl: HTMLElement; isFolder: boolean; relation: 'root' | 'ancestor' | 'descendant' }> = [];

	private renderPreview(container: HTMLElement): void {
		const preview = container.createDiv('ft-live-preview');
		preview.createDiv({ text: 'Preview', cls: 'ft-live-preview__label' });
		this.previewRows = [];
		const tree = preview.createDiv('ft-preview-tree');
		
		const createFolderRow = (parent: HTMLElement, name: string, path: string, relation: 'root' | 'ancestor' | 'descendant', collapsed: boolean = false) => {
			const folderContainer = parent.createDiv('nav-folder');
			const titleRow = folderContainer.createDiv('ft-live-preview__row ft-live-preview__folder-title nav-folder-title');
			const icon = titleRow.createDiv('nav-folder-collapse-indicator collapse-icon' + (collapsed ? ' is-collapsed' : ''));
			setIcon(icon, collapsed ? 'chevron-right' : 'chevron-down');
			titleRow.createSpan({ text: name, cls: 'ft-live-preview__name nav-folder-title-content' });
			this.previewRows.push({ path, el: folderContainer, titleEl: titleRow, isFolder: true, relation });
			const childrenContainer = folderContainer.createDiv('nav-folder-children ft-preview-children');
			if (collapsed) childrenContainer.hide();
			return { folderContainer, childrenContainer };
		};

		const createFileRow = (parent: HTMLElement, name: string, path: string, relation: 'root' | 'ancestor' | 'descendant') => {
			const row = parent.createDiv('ft-live-preview__row nav-file');
			row.createDiv('nav-folder-collapse-indicator collapse-icon'); // empty spacer
			row.createSpan({ text: name, cls: 'ft-live-preview__name nav-file-title-content' });
			this.previewRows.push({ path, el: row, titleEl: row, isFolder: false, relation });
			return row;
		};

		const rootName = this.path.split('/').at(-1) ?? this.path;
		if (this.isFolder) {
			const { childrenContainer } = createFolderRow(tree, rootName, this.path, 'root');
			
			// Subfolder 1 (Collapsed)
			const sub1Path = `${this.path}/Subfolder 1`;
			createFolderRow(childrenContainer, 'Subfolder 1', sub1Path, 'descendant', true);

			// Subfolder 2 and 3 (Expanded)
			for (let i = 2; i <= 3; i++) {
				const subfolderPath = `${this.path}/Subfolder ${i}`;
				const sub = createFolderRow(childrenContainer, `Subfolder ${i}`, subfolderPath, 'descendant');
				createFileRow(sub.childrenContainer, `File ${i}.1`, `${subfolderPath}/File ${i}.1`, 'descendant');
			}
			createFileRow(childrenContainer, 'File 1', `${this.path}/File 1`, 'descendant');
		} else {
			createFileRow(tree, rootName, this.path, 'root');
		}

		this.updateModalPreview();
	}

	private refreshPreview(): void {
		this.updateModalPreview();
		this.toolkit.previewAppearance(this.path, this.draft);
	}

	private updateModalPreview(): void {
		const appearanceRules = { ...this.toolkit.settings.appearanceRules };
		if (Object.keys(this.draft).length === 0) delete appearanceRules[this.path];
		else appearanceRules[this.path] = structuredClone(this.draft);
		const settings = { ...this.toolkit.settings, appearanceRules };
		const previewOrder = [this.path, `${this.path}/Subfolder 1`, `${this.path}/Subfolder 2`, `${this.path}/Subfolder 3`];
		const context = {
			settings,
			getDescendantIndex: (p: string) => {
				const i = previewOrder.indexOf(p);
				return Math.max(0, i - 1);
			},
		};

		for (const { path, el, titleEl, isFolder, relation } of this.previewRows) {
			const appearance = resolveAppearance(path, { ...context, isFolder });
			const directBackground = appearanceRules[path]?.background;
			const directHasColor = directBackground !== undefined && directBackground.choice.kind !== 'none';
			const directBlocks = directBackground?.choice.kind === 'none';
			const directCascades = isFolder && directBackground?.cascade === true;
			titleEl.classList.toggle('ft-preview-has-text', appearance.text !== null);
			titleEl.classList.toggle('ft-preview-is-bold', appearance.bold === true);
			titleEl.classList.toggle('ft-preview-is-strikethrough', appearance.strikethrough === true);
			el.classList.toggle('ft-preview-background-cascade', directHasColor && directCascades);
			el.classList.toggle('ft-preview-background-block', directBlocks === true);
			el.classList.toggle('ft-preview-background-block-cascade', directBlocks === true && directCascades);
			titleEl.classList.toggle(
				'ft-preview-has-background',
				appearance.background !== null && ((directHasColor && !directCascades) || (!directBackground && relation === 'root')),
			);
			
			const hasBorder = appearance.border !== null;
			el.classList.toggle('ft-preview-border-box', !!(hasBorder && appearance.border?.style === 'box'));
			el.classList.toggle('ft-preview-border-rail', !!(hasBorder && appearance.border?.style === 'rail'));
			el.classList.toggle('ft-preview-border-shaded', !!(hasBorder && appearance.border?.shading));

			for (const property of ['--ft-preview-text-light', '--ft-preview-text-dark', '--ft-preview-text-strength', '--ft-preview-background', '--ft-preview-background-strength', '--ft-preview-border', '--ft-preview-border-strength', '--ft-preview-border-width']) {
				el.style.removeProperty(property);
				titleEl.style.removeProperty(property);
			}

			if (appearance.text) {
				el.style.setProperty('--ft-preview-text-light', appearance.text.foregroundLight);
				el.style.setProperty('--ft-preview-text-dark', appearance.text.foregroundDark);
				if (appearance.text.strength !== undefined) el.style.setProperty('--ft-preview-text-strength', `${appearance.text.strength}%`);
			}
			if (appearance.background) {
				el.style.setProperty('--ft-preview-background', appearance.background.hex);
				titleEl.style.setProperty('--ft-preview-background', appearance.background.hex);
				if (appearance.background.strength !== undefined) {
					el.style.setProperty('--ft-preview-background-strength', `${appearance.background.strength}%`);
					titleEl.style.setProperty('--ft-preview-background-strength', `${appearance.background.strength}%`);
				}
			}
			if (hasBorder && appearance.border) {
				el.style.setProperty('--ft-preview-border', appearance.border.color.hex);
				if (appearance.border.color.strength !== undefined) el.style.setProperty('--ft-preview-border-strength', `${appearance.border.color.strength}%`);
				const thicknessMap = appearance.border.style === 'box'
					? { thin: '1px', medium: '2px', thick: '3px' }
					: { thin: '2px', medium: '4px', thick: '6px' };
				el.style.setProperty('--ft-preview-border-width', thicknessMap[appearance.border.thickness ?? 'thin']);
			}
		}
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
