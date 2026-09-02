import { PluginSettingTab, Setting, TFolder, setIcon, type SettingDefinitionItem } from 'obsidian';
import { PALETTE_TEMPLATES, paletteTemplate, resolveChoice } from '../colors';
import type FolderToolkitPlugin from '../main';
import type { AppearanceRule, ColorChoice } from '../types';
import { AppearanceModal } from './appearance-modal';
import { ConfirmRemoveModal } from './confirm-remove-modal';
import { replaceOwnedRoot } from './dom-lifecycle';

export class FolderToolkitSettingTab extends PluginSettingTab {
	private search = '';

	constructor(private readonly toolkit: FolderToolkitPlugin) {
		super(toolkit.app, toolkit);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Color palette',
				desc: 'Changing the template recolors palette assignments. Custom colors stay unchanged.',
				aliases: ['colors', 'template', 'appearance'],
				render: (setting) => this.renderPalette(setting),
			},
			{
				name: 'Open note tabs',
				desc: 'Color open-note titles and optionally their background or border.',
				aliases: ['tab background', 'tab border', 'open notes'],
				render: (setting) => this.renderTabStyle(setting),
			},
			{
				name: 'Show hidden items',
				desc: 'Temporarily reveal items marked as permanently hidden.',
				aliases: ['files', 'folders', 'visibility'],
				render: (setting) => this.renderHiddenToggle(setting),
			},
			{
				name: 'Managed paths',
				desc: 'Search, edit, and remove saved color and hiding rules.',
				aliases: ['appearance rules', 'hidden paths', 'files', 'folders'],
				render: (setting) => this.renderPathManager(setting),
			},
		];
	}

	private renderTabStyle(setting: Setting): void {
		setting.controlEl.empty();
		setting
			.setName('Open note tabs')
			.setDesc('Text color styles the title. Note background styles the tab surface or border; missing channels stay unchanged.')
			.addDropdown((dropdown) => dropdown
				.addOption('off', 'Off')
				.addOption('background', 'Colored background')
				.addOption('border', 'Colored border')
				.setValue(this.toolkit.settings.tabStyle)
				.onChange(async (value) => {
					await this.toolkit.setTabStyle(value);
					this.update();
				}));
	}

	private renderPalette(setting: Setting): () => void {
		setting.setName('Color palette').setDesc('Palette assignments update globally; custom hex colors stay unchanged.');
		setting.settingEl.addClass('ft-palette-setting');
		const host = replaceOwnedRoot(setting.controlEl, 'ft-palette-picker');
		const selected = paletteTemplate(this.toolkit.settings.paletteTemplateId);
		const trigger = host.createEl('button', {
			cls: 'ft-palette-trigger',
			attr: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
		});
		const triggerCopy = trigger.createSpan('ft-palette-trigger__copy');
		triggerCopy.createSpan({ text: selected.label, cls: 'ft-palette-trigger__label' });
		this.renderStrip(triggerCopy, selected.colors);
		const chevron = trigger.createSpan('ft-palette-trigger__chevron');
		setIcon(chevron, 'chevron-down');

		const menu = host.createDiv('ft-palette-menu');
		menu.hidden = true;
		menu.setAttribute('role', 'listbox');
		menu.setAttribute('aria-label', 'Color palettes');
		const options: HTMLButtonElement[] = [];
		for (const template of PALETTE_TEMPLATES) {
			const isSelected = template.id === selected.id;
			const option = menu.createEl('button', {
				cls: `ft-palette-option${isSelected ? ' is-selected' : ''}`,
				attr: { type: 'button', role: 'option', 'aria-selected': String(isSelected) },
			});
			const copy = option.createSpan('ft-palette-option__copy');
			copy.createSpan({ text: template.label, cls: 'ft-palette-option__label' });
			copy.createSpan({ text: template.description, cls: 'ft-palette-option__description' });
			this.renderStrip(copy, template.colors);
			const check = option.createSpan('ft-palette-option__check');
			if (isSelected) setIcon(check, 'check');
			option.addEventListener('click', () => {
				closePicker();
				void this.toolkit.setPalette(template.id).then(() => this.update());
			});
			options.push(option);
		}

		const openPicker = (): void => {
			menu.hidden = false;
			trigger.setAttribute('aria-expanded', 'true');
			(options.find((option) => option.getAttribute('aria-selected') === 'true') ?? options[0])?.focus();
		};
		const closePicker = (restoreFocus = false): void => {
			menu.hidden = true;
			trigger.setAttribute('aria-expanded', 'false');
			if (restoreFocus) trigger.focus();
		};
		trigger.addEventListener('click', () => menu.hidden ? openPicker() : closePicker());
		trigger.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				openPicker();
			}
		});
		menu.addEventListener('keydown', (event) => {
			const index = options.indexOf(host.ownerDocument.activeElement as HTMLButtonElement);
			if (event.key === 'Escape') { event.preventDefault(); closePicker(true); return; }
			if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
			event.preventDefault();
			const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
			options[next]?.focus();
		});
		const onDocumentPointer = (event: PointerEvent): void => {
			if (!host.contains(event.target as Node)) closePicker();
		};
		const ownerDocument = host.ownerDocument;
		ownerDocument.addEventListener('pointerdown', onDocumentPointer, true);
		return () => {
			ownerDocument.removeEventListener('pointerdown', onDocumentPointer, true);
			host.remove();
			setting.settingEl.removeClass('ft-palette-setting');
		};
	}

	private renderStrip(container: HTMLElement, colors: readonly string[]): void {
		const strip = container.createSpan('ft-palette-strip');
		strip.setAttribute('aria-hidden', 'true');
		for (const hex of colors) {
			const color = strip.createSpan('ft-palette-strip__color');
			color.style.setProperty('--ft-swatch', hex);
		}
	}

	private renderHiddenToggle(setting: Setting): void {
		setting.controlEl.empty();
		setting
			.setName('Show hidden items')
			.setDesc('Temporarily reveal items marked as permanently hidden.')
			.addToggle((toggle) => toggle
				.setValue(this.toolkit.settings.showHiddenItems)
				.onChange(async (value) => {
					await this.toolkit.setShowHiddenItems(value);
					this.update();
				}));
	}

	private renderPathManager(setting: Setting): () => void {
		setting.setName('Managed paths').setHeading();
		const wrapper = replaceOwnedRoot(setting.settingEl, 'ft-settings-manager');
		const search = wrapper.createEl('input', {
			type: 'search',
			placeholder: 'Search files and folders…',
			cls: 'ft-settings-search',
			attr: { 'aria-label': 'Search managed paths', autocomplete: 'off' },
		});
		search.value = this.search;
		const results = wrapper.createDiv('ft-settings-results');
		const renderResults = (): void => {
			this.search = search.value;
			results.empty();
			this.renderAppearanceRules(results);
			this.renderHiddenPaths(results);
		};
		search.addEventListener('input', renderResults);
		renderResults();
		return () => {
			search.removeEventListener('input', renderResults);
			wrapper.remove();
		};
	}

	private renderAppearanceRules(container: HTMLElement): void {
		const paths = Object.keys(this.toolkit.settings.appearanceRules).filter((path) => this.matches(path)).sort();
		const section = this.ruleSection(container, 'Color rules', paths.length);
		if (paths.length === 0) {
			this.emptyState(section, this.search ? 'No color rules match this search.' : 'No color rules yet. Right-click a file or folder and choose Edit colors.');
			return;
		}
		for (const path of paths) this.renderAppearanceCard(section, path, this.toolkit.settings.appearanceRules[path]);
	}

	private renderAppearanceCard(container: HTMLElement, path: string, rule: AppearanceRule): void {
		const card = container.createDiv('ft-rule-card');
		const identity = card.createDiv('ft-rule-card__identity');
		const { name, parent } = this.splitPath(path);
		identity.createDiv({ text: name, cls: 'ft-rule-card__name' });
		identity.createDiv({ text: parent, cls: 'ft-rule-card__path' });
		const previews = card.createDiv('ft-rule-card__previews');
		this.renderEffectPreview(previews, 'Text', rule.text?.choice);
		this.renderEffectPreview(previews, 'Background', rule.background?.choice);
		this.renderEffectPreview(previews, 'Border', rule.border?.color);

		const actions = card.createDiv('ft-rule-card__actions');
		const exists = this.toolkit.app.vault.getAbstractFileByPath(path) !== null;
		const edit = actions.createEl('button', { text: 'Edit', attr: { type: 'button' } });
		edit.disabled = !exists;
		edit.title = exists ? `Edit colors for ${name}` : 'This path no longer exists';
		edit.addEventListener('click', () => new AppearanceModal(this.toolkit, path, () => this.update()).open());
		const remove = actions.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': `Remove color rule for ${name}` } });
		setIcon(remove, 'trash-2');
		remove.addEventListener('click', () => {
			new ConfirmRemoveModal(this.toolkit.app, path, async () => {
				await this.toolkit.removeAppearance(path);
				this.update();
			}).open();
		});
	}

	private renderHiddenPaths(container: HTMLElement): void {
		const paths = this.toolkit.settings.hiddenPaths.filter((path) => this.matches(path)).sort();
		const section = this.ruleSection(container, 'Hidden items', paths.length);
		if (paths.length === 0) {
			this.emptyState(section, this.search ? 'No hidden items match this search.' : 'No hidden items. Right-click a file or folder and choose Hide.');
			return;
		}
		for (const path of paths) {
			const card = section.createDiv('ft-rule-card ft-rule-card--hidden');
			const { name, parent } = this.splitPath(path);
			const identity = card.createDiv('ft-rule-card__identity');
			identity.createDiv({ text: name, cls: 'ft-rule-card__name' });
			const file = this.toolkit.app.vault.getAbstractFileByPath(path);
			identity.createDiv({ text: `${parent} · ${file instanceof TFolder ? 'Folder' : 'File'}`, cls: 'ft-rule-card__path' });
			const actions = card.createDiv('ft-rule-card__actions');
			const unhide = actions.createEl('button', { text: 'Unhide', attr: { type: 'button' } });
			unhide.addEventListener('click', () => { void this.toolkit.unhidePath(path).then(() => this.update()); });
		}
	}

	private renderEffectPreview(container: HTMLElement, label: string, choice: ColorChoice | undefined): void {
		const preview = container.createDiv('ft-rule-preview');
		const color = choice ? resolveChoice(choice, this.toolkit.settings.paletteTemplateId) : null;
		if (color) {
			const dot = preview.createSpan('ft-rule-preview__dot');
			dot.style.setProperty('--ft-preview-color', color.hex);
		}
		const strength = color?.strength === undefined ? '' : ` · ${color.strength}% strength`;
		preview.createSpan({ text: `${label}: ${choice?.kind === 'none' ? 'None' : color ? `${color.hex}${strength}` : 'Inherit'}` });
	}

	private ruleSection(container: HTMLElement, title: string, count: number): HTMLElement {
		const section = container.createEl('section', { cls: 'ft-rule-section' });
		const header = section.createDiv('ft-rule-section__header');
		header.createDiv({ text: title, cls: 'ft-rule-section__title', attr: { role: 'heading', 'aria-level': '3' } });
		header.createSpan({ text: String(count), cls: 'ft-rule-section__count', attr: { 'aria-label': `${count} items` } });
		return section;
	}

	private emptyState(container: HTMLElement, text: string): void {
		container.createDiv({ text, cls: 'ft-empty-state' });
	}

	private splitPath(path: string): { name: string; parent: string } {
		const parts = path.split('/');
		return { name: parts.pop() ?? path, parent: parts.join('/') || 'Vault root' };
	}

	private matches(path: string): boolean {
		return path.toLocaleLowerCase().includes(this.search.trim().toLocaleLowerCase());
	}
}
