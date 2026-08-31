import { Modal, TFolder, setIcon } from 'obsidian';
import { resolveAppearance } from '../appearance-resolver';
import { normalizeHex, paletteTemplate, resolveChoice } from '../colors';
import type FolderToolkitPlugin from '../main';
import type { AppearanceRule, BorderRule, ColorChoice } from '../types';

type EffectKey = 'text' | 'background';

interface PreviewItem {
	node: HTMLElement;
	row: HTMLElement;
	path: string;
	isFolder: boolean;
	borderPaletteOffset: number;
}

export class AppearanceModal extends Modal {
	private draft: AppearanceRule;
	private readonly isFolder: boolean;
	private previewItems: PreviewItem[] = [];
	private pickerCleanups: Array<() => void> = [];
	private textExpanded = false;
	private rememberedBorder: BorderRule;

	constructor(
		private readonly toolkit: FolderToolkitPlugin,
		private readonly path: string,
		private readonly onSaved?: () => void,
	) {
		super(toolkit.app);
		this.draft = structuredClone(toolkit.settings.appearanceRules[path] ?? {});
		this.isFolder = toolkit.app.vault.getAbstractFileByPath(path) instanceof TFolder;
		const savedBorder = this.draft.border;
		this.rememberedBorder = structuredClone(savedBorder && savedBorder.color.kind !== 'none' ? savedBorder : {
			style: 'box',
			color: { kind: 'preset', slot: 0 },
			thickness: 'medium',
			shade: false,
			scope: 'self',
		});
	}

	onOpen(): void {
		this.setTitle(`Edit ${this.isFolder ? 'folder' : 'file'} colors`);
		this.render();
	}

	onClose(): void {
		this.clearPickerListeners();
		this.toolkit.clearAppearancePreview(this.path);
		this.contentEl.empty();
		this.previewItems = [];
	}

	private render(): void {
		this.clearPickerListeners();
		this.contentEl.empty();
		this.contentEl.addClass('ft-appearance-modal');
		this.renderPreview();
		const cards = this.contentEl.createDiv('ft-appearance-grid');
		this.renderEffect(cards, 'background', 'Background');
		if (this.isFolder) this.renderBorder(cards);
		this.renderText(cards);

		const footer = this.contentEl.createDiv('ft-modal-footer');
		const clear = footer.createEl('button', { text: 'Reset to inherited', attr: { type: 'button' } });
		clear.addEventListener('click', () => { this.draft = {}; this.render(); });
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
			error.setText('The color rule could not be saved. Try again.');
			error.addClass('is-visible');
			button.disabled = false;
		}
	}

	private renderPreview(): void {
		const preview = this.contentEl.createDiv('ft-live-preview');
		preview.createDiv({ text: 'Preview', cls: 'ft-live-preview__label' });
		const tree = preview.createDiv('ft-live-preview__tree');
		this.previewItems = [];
		const name = this.path.split('/').at(-1) ?? this.path;
		if (this.isFolder) {
			const root = this.createPreviewItem(tree, this.path, name, true, 0);
			const children = root.node.createDiv('ft-live-preview__children');
			this.createPreviewItem(children, `${this.path}/Sample folder`, 'Sample folder', true, 0);
			this.createPreviewItem(children, `${this.path}/Sample note.md`, 'Sample note', false, 0);
		} else {
			const parentPath = this.path.split('/').slice(0, -1).join('/');
			const parent = this.createPreviewItem(tree, parentPath, parentPath.split('/').at(-1) ?? 'Vault', true, 0);
			const children = parent.node.createDiv('ft-live-preview__children');
			this.createPreviewItem(children, this.path, name, false, 0);
		}
		this.updateModalPreview();
	}

	private createPreviewItem(
		container: HTMLElement,
		path: string,
		name: string,
		isFolder: boolean,
		borderPaletteOffset: number,
	): PreviewItem {
		const node = container.createDiv(`ft-live-preview__node${isFolder ? ' is-folder' : ' is-file'}`);
		const row = node.createDiv('ft-live-preview__row');
		if (isFolder) {
			const collapse = row.createSpan('ft-live-preview__collapse');
			setIcon(collapse, 'chevron-down');
		}
		const icon = row.createSpan('ft-live-preview__icon');
		setIcon(icon, isFolder ? 'folder' : 'file-text');
		row.createSpan({ text: name, cls: 'ft-live-preview__name' });
		const item = { node, row, path, isFolder, borderPaletteOffset };
		this.previewItems.push(item);
		return item;
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
		for (const item of this.previewItems) {
			const appearance = resolveAppearance(item.path, settings, { borderPaletteOffset: item.borderPaletteOffset });
			item.node.classList.toggle('ft-preview-has-text', appearance.text !== null);
			item.node.classList.toggle('ft-preview-has-background', appearance.background !== null);
			item.node.classList.toggle('ft-preview-border-box', item.isFolder && appearance.border?.style === 'box');
			item.node.classList.toggle('ft-preview-border-rail', item.isFolder && appearance.border?.style === 'rail');
			item.node.classList.toggle('ft-preview-border-shade', item.isFolder && appearance.border?.shade === true);
			for (const property of ['--ft-preview-text-light', '--ft-preview-text-dark', '--ft-preview-background', '--ft-preview-border', '--ft-preview-border-width']) {
				item.node.style.removeProperty(property);
			}
			if (appearance.text) {
				item.node.style.setProperty('--ft-preview-text-light', appearance.text.foregroundLight);
				item.node.style.setProperty('--ft-preview-text-dark', appearance.text.foregroundDark);
			}
			if (appearance.background) item.node.style.setProperty('--ft-preview-background', appearance.background.hex);
			if (appearance.border) {
				item.node.style.setProperty('--ft-preview-border', appearance.border.color.hex);
				item.node.style.setProperty('--ft-preview-border-width', { thin: '1px', medium: '2px', thick: '3px' }[appearance.border.thickness]);
			}
		}
	}

	private renderEffect(container: HTMLElement, key: EffectKey, label: string): void {
		const card = container.createDiv(`ft-color-card ft-color-card--${key}`);
		const header = card.createDiv('ft-color-card__header');
		header.createEl('h3', { text: label });
		const effect = this.draft[key];
		if (this.isFolder) this.renderCascade(header, key, effect !== undefined);
		this.renderEffectControls(card, key);
	}

	private renderEffectControls(container: HTMLElement, key: EffectKey): void {
		const effect = this.draft[key];
		const modes = container.createDiv('ft-choice-row');
		this.choiceButton(modes, 'Inherit', effect === undefined, () => { delete this.draft[key]; this.render(); });
		this.choiceButton(modes, 'No color', effect?.choice.kind === 'none', () => {
			this.draft[key] = { choice: { kind: 'none' }, cascade: effect?.cascade ?? this.isFolder };
			this.render();
		});
		this.renderColorChoices(container, effect?.choice, (choice, rerender) => {
			this.draft[key] = { choice, cascade: this.draft[key]?.cascade ?? this.isFolder };
			if (rerender) this.render();
			else this.refreshPreview();
		});
	}

	private renderText(container: HTMLElement): void {
		const card = container.createDiv('ft-color-card ft-color-card--text');
		const trigger = card.createEl('button', {
			cls: 'ft-disclosure-trigger',
			attr: { type: 'button', 'aria-expanded': String(this.textExpanded) },
		});
		trigger.createSpan({ text: 'Text (optional)', cls: 'ft-disclosure-trigger__title' });
		const summary = trigger.createSpan('ft-disclosure-trigger__summary');
		const choice = this.draft.text?.choice;
		const color = choice ? resolveChoice(choice, this.toolkit.settings.paletteTemplateId) : null;
		if (color) {
			const dot = summary.createSpan('ft-disclosure-trigger__dot');
			dot.style.setProperty('--ft-summary-color', color.hex);
		}
		summary.createSpan({ text: choice?.kind === 'none' ? 'No color' : color?.hex ?? 'Inherited' });
		const chevron = trigger.createSpan('ft-disclosure-trigger__chevron');
		setIcon(chevron, this.textExpanded ? 'chevron-up' : 'chevron-down');
		trigger.addEventListener('click', () => {
			this.textExpanded = !this.textExpanded;
			this.render();
		});
		if (!this.textExpanded) return;
		const content = card.createDiv('ft-disclosure-content');
		if (this.isFolder) this.renderCascade(content, 'text', this.draft.text !== undefined);
		this.renderEffectControls(content, 'text');
	}

	private renderCascade(container: HTMLElement, key: EffectKey, enabled: boolean): void {
		this.renderPillToggle(container, 'Include descendants', this.draft[key]?.cascade ?? true, enabled, (checked) => {
			const current = this.draft[key];
			if (current) this.draft[key] = { ...current, cascade: checked };
			this.refreshPreview();
		});
	}

	private renderBorder(container: HTMLElement): void {
		const active = this.draft.border !== undefined && this.draft.border.color.kind !== 'none';
		const card = container.createDiv(`ft-color-card ft-color-card--border${active ? '' : ' is-disabled'}`);
		const header = card.createDiv('ft-color-card__header');
		header.createEl('h3', { text: 'Border' });
		const modes = card.createDiv('ft-choice-row');
		this.choiceButton(modes, 'Inherit', this.draft.border === undefined, () => { delete this.draft.border; this.render(); });
		this.choiceButton(modes, 'No border', this.draft.border?.color.kind === 'none', () => {
			this.draft.border = { ...structuredClone(this.rememberedBorder), color: { kind: 'none' }, scope: 'both' };
			this.render();
		});
		this.choiceButton(modes, 'Border', active, () => { this.draft.border = structuredClone(this.rememberedBorder); this.render(); });

		const scope = card.createDiv('ft-border-option');
		scope.createDiv({ text: 'Apply border to', cls: 'ft-border-option__label' });
		const scopeChoices = scope.createDiv('ft-choice-row');
		for (const [value, label] of [['self', 'This folder'], ['descendants', 'Subfolders'], ['both', 'Both']] as const) {
			this.choiceButton(scopeChoices, label, this.rememberedBorder.scope === value, () => {
				this.rememberedBorder = { ...this.rememberedBorder, scope: value };
				if (active) this.draft.border = structuredClone(this.rememberedBorder);
				this.render();
			});
		}

		const styles = card.createDiv('ft-choice-row');
		this.choiceButton(styles, 'Rounded box', this.rememberedBorder.style === 'box', () => {
			this.rememberedBorder = { ...this.rememberedBorder, style: 'box' };
			if (active) this.draft.border = structuredClone(this.rememberedBorder);
			this.render();
		});
		this.choiceButton(styles, 'Vertical rail', this.rememberedBorder.style === 'rail', () => {
			this.rememberedBorder = { ...this.rememberedBorder, style: 'rail' };
			if (active) this.draft.border = structuredClone(this.rememberedBorder);
			this.render();
		});
		const thickness = card.createDiv('ft-border-option');
		thickness.createDiv({ text: 'Thickness', cls: 'ft-border-option__label' });
		const thicknessChoices = thickness.createDiv('ft-choice-row');
		for (const [value, label] of [['thin', 'Thin'], ['medium', 'Medium'], ['thick', 'Thick']] as const) {
			this.choiceButton(thicknessChoices, label, this.rememberedBorder.thickness === value, () => {
				this.rememberedBorder = { ...this.rememberedBorder, thickness: value };
				if (active) this.draft.border = structuredClone(this.rememberedBorder);
				this.render();
			});
		}
		this.renderPillToggle(card, 'Light shading', this.rememberedBorder.shade, active, (checked) => {
			this.rememberedBorder = { ...this.rememberedBorder, shade: checked };
			if (this.draft.border?.color.kind !== 'none') this.draft.border = structuredClone(this.rememberedBorder);
			this.render();
		});
		this.renderColorChoices(card, this.rememberedBorder.color, (choice, rerender) => {
			if (choice.kind !== 'none') {
				this.rememberedBorder = { ...this.rememberedBorder, color: choice };
				if (active) this.draft.border = structuredClone(this.rememberedBorder);
			}
			if (rerender) this.render();
			else this.refreshPreview();
		}, active);
		if (this.rememberedBorder.scope !== 'self') {
			card.createDiv({ text: 'Subfolders cycle through distinct colors from the active palette. Direct child rules override the inherited border.', cls: 'ft-card-hint' });
		}
	}

	private renderPillToggle(
		container: HTMLElement,
		label: string,
		checked: boolean,
		enabled: boolean,
		onChange: (checked: boolean) => void,
	): void {
		const control = container.createDiv('ft-pill-control');
		control.createSpan({ text: label, cls: 'ft-pill-control__label' });
		const toggle = control.createEl('button', {
			cls: 'ft-pill-toggle',
			attr: { type: 'button', role: 'switch', 'aria-checked': String(checked), 'aria-label': label },
		});
		toggle.disabled = !enabled;
		toggle.createSpan('ft-pill-toggle__thumb');
		toggle.addEventListener('click', () => onChange(!checked));
	}

	private renderColorChoices(
		container: HTMLElement,
		selected: ColorChoice | undefined,
		onSelect: (choice: ColorChoice, rerender: boolean) => void,
		autoOpenCustom = true,
	): void {
		const template = paletteTemplate(this.toolkit.settings.paletteTemplateId);
		const paletteLabel = container.createDiv('ft-palette-label');
		paletteLabel.createSpan({ text: template.label });
		paletteLabel.createSpan({ text: 'Palette', cls: 'ft-palette-label__meta' });
		const grid = container.createDiv('ft-swatch-grid');
		grid.setAttribute('role', 'group');
		grid.setAttribute('aria-label', `${template.label} colors`);
		for (const [slot, hex] of template.colors.entries()) {
			const isSelected = selected?.kind === 'preset' && selected.slot === slot;
			const button = grid.createEl('button', {
				cls: `ft-swatch${isSelected ? ' is-selected' : ''}`,
				attr: { type: 'button', 'aria-label': `${hex}, color ${slot + 1}`, 'aria-pressed': String(isSelected), title: hex },
			});
			button.style.setProperty('--ft-swatch', hex);
			button.addEventListener('click', () => onSelect({ kind: 'preset', slot }, true));
		}

		const custom = container.createDiv('ft-custom-control');
		const customOpen = selected?.kind === 'custom' && autoOpenCustom;
		const trigger = custom.createEl('button', {
			cls: `ft-custom-trigger${selected?.kind === 'custom' ? ' is-selected' : ''}`,
			attr: { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': String(customOpen) },
		});
		const triggerDot = trigger.createSpan('ft-custom-trigger__dot');
		const triggerLabel = trigger.createSpan({
			text: selected?.kind === 'custom' ? `Custom ${selected.hex}` : 'Custom…',
			cls: 'ft-custom-trigger__label',
		});
		if (selected?.kind === 'custom') triggerDot.style.setProperty('--ft-custom-color', selected.hex);
		const popover = custom.createDiv('ft-custom-popover');
		popover.hidden = !customOpen;
		popover.setAttribute('role', 'dialog');
		popover.setAttribute('aria-label', 'Custom color');
		const popoverHeader = popover.createDiv('ft-custom-popover__header');
		popoverHeader.createSpan({ text: 'Custom color' });
		const close = popoverHeader.createEl('button', {
			cls: 'clickable-icon',
			attr: { type: 'button', 'aria-label': 'Close custom color picker' },
		});
		setIcon(close, 'x');
		const controls = popover.createDiv('ft-custom-popover__controls');
		const color = controls.createEl('input', { attr: { type: 'color', 'aria-label': 'Choose a custom color' } });
		color.value = selected?.kind === 'custom' ? selected.hex : '#3498DB';
		const field = controls.createDiv('ft-custom-color__field');
		const text = field.createEl('input', { attr: { type: 'text', 'aria-label': 'Custom hex color', autocomplete: 'off', spellcheck: 'false' } });
		text.value = color.value.toUpperCase();
		const error = field.createDiv({ text: 'Enter a 3- or 6-digit hex color.', cls: 'ft-field-error', attr: { role: 'status' } });
		const commit = (value: string): void => {
			const hex = normalizeHex(value);
			text.toggleAttribute('aria-invalid', !hex);
			error.classList.toggle('is-visible', !hex);
			if (!hex) return;
			color.value = hex;
			trigger.addClass('is-selected');
			triggerLabel.setText(`Custom ${hex}`);
			triggerDot.style.setProperty('--ft-custom-color', hex);
			for (const swatch of grid.querySelectorAll<HTMLElement>('.ft-swatch.is-selected')) {
				swatch.removeClass('is-selected');
				swatch.setAttribute('aria-pressed', 'false');
			}
			onSelect({ kind: 'custom', hex }, false);
		};
		color.addEventListener('input', () => { text.value = color.value.toUpperCase(); commit(color.value); });
		text.addEventListener('input', () => commit(text.value));
		const setOpen = (open: boolean, restoreFocus = false): void => {
			popover.hidden = !open;
			trigger.setAttribute('aria-expanded', String(open));
			if (open) text.focus();
			else if (restoreFocus) trigger.focus();
		};
		trigger.addEventListener('click', () => setOpen(popover.hidden));
		close.addEventListener('click', () => setOpen(false, true));
		popover.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				setOpen(false, true);
			}
		});
		const ownerDocument = container.ownerDocument;
		const onDocumentPointer = (event: PointerEvent): void => {
			if (!custom.contains(event.target as Node)) setOpen(false);
		};
		ownerDocument.addEventListener('pointerdown', onDocumentPointer, true);
		this.pickerCleanups.push(() => ownerDocument.removeEventListener('pointerdown', onDocumentPointer, true));
	}

	private clearPickerListeners(): void {
		for (const cleanup of this.pickerCleanups) cleanup();
		this.pickerCleanups = [];
	}

	private choiceButton(container: HTMLElement, label: string, selected: boolean, onClick: () => void): void {
		const button = container.createEl('button', { text: label, cls: selected ? 'is-selected' : '', attr: { type: 'button', 'aria-pressed': String(selected) } });
		button.addEventListener('click', onClick);
	}
}
