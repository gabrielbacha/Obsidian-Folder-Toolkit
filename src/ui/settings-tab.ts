import { PluginSettingTab, Setting, TFolder, setIcon, type SettingDefinitionItem } from 'obsidian';
import { PALETTE_TEMPLATES, paletteTemplate, resolveChoice } from '../colors';
import { AppearanceControlRenderer } from './appearance-controls';
import { isBackgroundEnabled, isFontEnabled } from '../conditional-format';
import type FolderToolkitPlugin from '../main';
import type { AppearanceRule, ColorChoice, ConditionalMatch, ConditionalTarget } from '../types';
import { AppearanceModal } from './appearance-modal';
import { ConfirmRemoveModal } from './confirm-remove-modal';
import { replaceOwnedRoot } from './dom-lifecycle';
import { ABOUT_AND_FEEDBACK, BUG_REPORT_URL, FEATURE_REQUEST_URL, MORE_PLUGINS_URL, WEBSITE_URL } from '../external-links';

export class FolderToolkitSettingTab extends PluginSettingTab {
	private search = '';
	private readonly expandedConditionalIds = new Set<string>();
	private pendingConditionalFocusId: string | null = null;

	constructor(private readonly toolkit: FolderToolkitPlugin) {
		super(toolkit.app, toolkit);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: ABOUT_AND_FEEDBACK.heading,
				render: (setting) => { setting.setName(ABOUT_AND_FEEDBACK.heading).setHeading(); },
			},
			{
				name: ABOUT_AND_FEEDBACK.name,
				desc: ABOUT_AND_FEEDBACK.description,
				render: (setting) => {
					setting
						.setName(ABOUT_AND_FEEDBACK.name)
						.setDesc(ABOUT_AND_FEEDBACK.description)
						.addButton((button) => button.setButtonText(ABOUT_AND_FEEDBACK.websiteLabel).setCta().onClick(() => openExternalLink(WEBSITE_URL)))
						.addButton((button) => button.setButtonText(ABOUT_AND_FEEDBACK.morePluginsLabel).onClick(() => openExternalLink(MORE_PLUGINS_URL)))
						.addButton((button) => button.setButtonText(ABOUT_AND_FEEDBACK.featureRequestLabel).onClick(() => openExternalLink(FEATURE_REQUEST_URL)))
						.addButton((button) => button.setButtonText(ABOUT_AND_FEEDBACK.bugReportLabel).onClick(() => openExternalLink(BUG_REPORT_URL)));
				},
			},
			{
				name: 'Appearance',
				desc: 'Choose the shared palette and how styling carries into open note tabs.',
				aliases: ['colors', 'style'],
				render: (setting) => { setting.setName('Appearance').setHeading(); },
			},
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
				name: 'Conditional formatting',
				desc: 'Style matching file and folder names with the same text and background controls used for direct editing.',
				aliases: ['name rules', 'starts with', 'folder shading', 'file shading'],
				render: (setting) => this.renderConditionalFormats(setting),
			},
			{
				name: 'Visibility',
				desc: 'Reveal or manage items hidden by Folder Toolkit.',
				aliases: ['hidden', 'files', 'folders'],
				render: (setting) => { setting.setName('Visibility').setHeading(); },
			},
			{
				name: 'Show hidden items',
				desc: 'Temporarily reveal items marked as permanently hidden.',
				aliases: ['files', 'folders', 'visibility'],
				render: (setting) => this.renderHiddenToggle(setting),
			},
			{
				name: 'Managed paths',
				desc: 'Search, edit, and remove saved appearance and hiding rules.',
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

	private renderConditionalFormats(setting: Setting): () => void {
		setting.setName('Name rules').setHeading();
		setting.settingEl.addClass('ft-conditional-setting');
		const wrapper = replaceOwnedRoot(setting.settingEl, 'ft-conditional-formats');
		const controls = new AppearanceControlRenderer(this.toolkit);
		wrapper.createDiv({ text: 'Style files and folders by name. When rules overlap, the later rule wins for each style.', cls: 'ft-card-hint' });
		const add = wrapper.createEl('button', { cls: 'ft-conditional-add', attr: { type: 'button', 'aria-label': 'Add conditional formatting rule' } });
		setIcon(add, 'plus');
		add.createSpan({ text: 'Add rule' });
		add.addEventListener('click', () => {
			void this.toolkit.addConditionalFormat().then((id) => {
				this.expandedConditionalIds.add(id);
				this.pendingConditionalFocusId = id;
				this.update();
			});
		});

		if (this.toolkit.settings.conditionalFormats.length === 0) {
			wrapper.createDiv({ text: 'No name rules yet. Add a rule to style matching files or folders.', cls: 'ft-empty-state' });
		}

		const targetLabels: Record<ConditionalTarget, string> = { folder: 'Folders', file: 'Files', both: 'Files and folders' };
		const matchLabels: Record<ConditionalMatch, string> = { equals: 'is exactly', startsWith: 'starts with', endsWith: 'ends with', contains: 'contains' };
		for (const [index, rule] of this.toolkit.settings.conditionalFormats.entries()) {
			const expanded = this.expandedConditionalIds.has(rule.id);
			const card = wrapper.createDiv(`ft-conditional-card${expanded ? ' is-expanded' : ''}`);
			const header = card.createDiv('ft-conditional-summary-row');
			const disclosure = header.createEl('button', {
				cls: 'ft-conditional-disclosure',
				attr: { type: 'button', 'aria-expanded': String(expanded), 'aria-controls': `ft-rule-editor-${rule.id}` },
			});
			const summary = disclosure.createSpan('ft-conditional-summary');
			summary.createSpan({ text: targetLabels[rule.target], cls: 'ft-conditional-summary__target' });
			summary.createSpan({ text: matchLabels[rule.match], cls: 'ft-conditional-summary__match' });
			summary.createSpan({ text: rule.pattern || 'Unnamed rule', cls: `ft-conditional-summary__pattern${rule.pattern ? '' : ' is-empty'}` });
			const badges = summary.createSpan('ft-conditional-summary__badges');
			if (isFontEnabled(rule)) this.renderStyleBadge(badges, 'Font', rule.color);
			if (isBackgroundEnabled(rule)) this.renderStyleBadge(badges, 'Background', rule.backgroundColor ?? rule.color);
			if (rule.bold) badges.createSpan({ text: 'B', cls: 'ft-style-badge ft-style-badge--bold', attr: { 'aria-label': 'Bold' } });
			if (rule.strikethrough) badges.createSpan({ text: 'S', cls: 'ft-style-badge ft-style-badge--strike', attr: { 'aria-label': 'Strikethrough' } });
			const chevron = disclosure.createSpan('ft-conditional-disclosure__chevron');
			setIcon(chevron, expanded ? 'chevron-up' : 'chevron-down');
			disclosure.addEventListener('click', () => {
				if (expanded) this.expandedConditionalIds.delete(rule.id);
				else this.expandedConditionalIds.add(rule.id);
				this.update();
			});

			const actions = header.createDiv('ft-conditional-actions');
			const moveUp = actions.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': `Move ${rule.pattern || 'unnamed rule'} up`, title: 'Move up' } });
			setIcon(moveUp, 'arrow-up');
			moveUp.disabled = index === 0;
			moveUp.addEventListener('click', () => { void this.toolkit.moveConditionalFormat(rule.id, -1).then(() => this.update()); });
			const moveDown = actions.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': `Move ${rule.pattern || 'unnamed rule'} down`, title: 'Move down' } });
			setIcon(moveDown, 'arrow-down');
			moveDown.disabled = index === this.toolkit.settings.conditionalFormats.length - 1;
			moveDown.addEventListener('click', () => { void this.toolkit.moveConditionalFormat(rule.id, 1).then(() => this.update()); });
			const remove = actions.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': `Remove rule for ${rule.pattern || 'unnamed pattern'}` } });
			setIcon(remove, 'trash-2');
			remove.addEventListener('click', () => {
				new ConfirmRemoveModal(this.toolkit.app, rule.pattern || 'Unnamed rule', async () => {
					await this.toolkit.removeConditionalFormat(rule.id);
					this.expandedConditionalIds.delete(rule.id);
					this.update();
				}, {
					title: 'Remove name rule?',
					description: 'This removes the conditional formatting rule. Files and folders are not changed.',
					confirmLabel: 'Remove rule',
				}).open();
			});
			if (!expanded) continue;

			const editor = card.createDiv({ cls: 'ft-conditional-editor', attr: { id: `ft-rule-editor-${rule.id}` } });
			const error = editor.createDiv({ cls: 'ft-field-error', attr: { role: 'status' } });
			const save = async (rerender = false): Promise<void> => {
				try {
					await this.toolkit.updateConditionalFormat(rule.id, rule);
					if (rerender) this.update();
				} catch {
					error.setText('This rule could not be saved. Try again.');
					error.addClass('is-visible');
				}
			};
			const meta = editor.createDiv('ft-conditional-meta-row');
			const targetLabel = meta.createEl('label', { text: 'Apply to' });
			const target = targetLabel.createEl('select', { attr: { 'aria-label': 'Apply rule to' } });
			for (const [value, label] of Object.entries(targetLabels)) target.createEl('option', { text: label, value });
			target.value = rule.target;
			target.addEventListener('change', () => { rule.target = target.value as ConditionalTarget; void save(true); });
			const matchLabel = meta.createEl('label', { text: 'Name' });
			const match = matchLabel.createEl('select', { attr: { 'aria-label': 'Name comparison' } });
			for (const [value, label] of Object.entries(matchLabels)) match.createEl('option', { text: label.charAt(0).toUpperCase() + label.slice(1), value });
			match.value = rule.match;
			match.addEventListener('change', () => { rule.match = match.value as ConditionalMatch; void save(true); });
			const patternErrorId = `ft-rule-pattern-error-${index}`;
			const patternLabel = meta.createEl('label', { text: 'Pattern' });
			const pattern = patternLabel.createEl('input', {
				type: 'text',
				value: rule.pattern,
				placeholder: '__system',
				attr: { 'aria-label': 'Name pattern', 'aria-describedby': patternErrorId, spellcheck: 'false' },
			});
			const patternError = patternLabel.createSpan({
				text: 'Enter a name pattern. Empty rules are ignored.',
				cls: 'ft-field-error',
				attr: { id: patternErrorId },
			});
			const validatePattern = (): boolean => {
				const invalid = pattern.value.trim().length === 0;
				pattern.toggleClass('is-invalid', invalid);
				pattern.toggleAttribute('aria-invalid', invalid);
				patternError.toggleClass('is-visible', invalid);
				return !invalid;
			};
			validatePattern();
			pattern.addEventListener('input', validatePattern);
			pattern.addEventListener('change', () => { rule.pattern = pattern.value; void save(true); });
			if (this.pendingConditionalFocusId === rule.id) {
				this.pendingConditionalFocusId = null;
				window.requestAnimationFrame(() => pattern.focus());
			}

			const styleGrid = editor.createDiv('ft-shared-style-grid');
			const textCard = styleGrid.createDiv('ft-color-card ft-color-card--text');
			const textHeader = textCard.createDiv('ft-color-card__header');
			textHeader.createDiv({ text: 'Text', cls: 'ft-card-title', attr: { role: 'heading', 'aria-level': '3' } });
			const fontToggle = textHeader.createEl('label', { cls: 'ft-border-toggle' });
			const fontCheck = fontToggle.createEl('input', { attr: { type: 'checkbox' } });
			fontCheck.checked = isFontEnabled(rule);
			fontToggle.createSpan({ text: 'Font color' });
			fontCheck.addEventListener('change', () => { rule.fontEnabled = fontCheck.checked; void save(true); });
			controls.renderColorControls(textCard, {
				selected: rule.color,
				defaultStrength: 100,
				includeWhite: true,
				disabled: !fontCheck.checked,
				onSelect: (choice, rerender) => {
					if (!choice || choice.kind === 'none') return;
					rule.color = choice;
					void save(rerender);
				},
			});
			controls.renderTypography(textCard, rule.bold === true, rule.strikethrough === true, (bold, strikethrough) => {
				rule.bold = bold;
				rule.strikethrough = strikethrough;
				void save(true);
			});

			const backgroundCard = styleGrid.createDiv('ft-color-card ft-color-card--background');
			const backgroundHeader = backgroundCard.createDiv('ft-color-card__header');
			backgroundHeader.createDiv({ text: 'Background', cls: 'ft-card-title', attr: { role: 'heading', 'aria-level': '3' } });
			const backgroundToggle = backgroundHeader.createEl('label', { cls: 'ft-border-toggle' });
			const backgroundCheck = backgroundToggle.createEl('input', { attr: { type: 'checkbox' } });
			backgroundCheck.checked = isBackgroundEnabled(rule);
			backgroundToggle.createSpan({ text: 'Enable background' });
			backgroundCheck.addEventListener('change', () => { rule.backgroundEnabled = backgroundCheck.checked; void save(true); });
			const backgroundChoice = rule.backgroundColor ?? { kind: 'custom' as const, hex: '#A8ADB5', strength: 20 };
			controls.renderColorControls(backgroundCard, {
				selected: backgroundChoice,
				defaultStrength: 20,
				disabled: !backgroundCheck.checked,
				onSelect: (choice, rerender) => {
					if (!choice || choice.kind === 'none') return;
					rule.backgroundColor = choice;
					void save(rerender);
				},
			});
		}

		return () => {
			controls.dispose();
			wrapper.remove();
			setting.settingEl.removeClass('ft-conditional-setting');
		};
	}

	private renderStyleBadge(container: HTMLElement, label: string, choice: ColorChoice): void {
		const resolved = resolveChoice(choice, this.toolkit.settings.paletteTemplateId);
		const badge = container.createSpan({ text: label, cls: 'ft-style-badge' });
		if (resolved) badge.style.setProperty('--ft-rule-color', resolved.hex);
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
		const section = this.ruleSection(container, 'Appearance rules', paths.length);
		if (paths.length === 0) {
			this.emptyState(section, this.search ? 'No appearance rules match this search.' : 'No appearance rules yet. Right-click a file or folder and choose Edit appearance.');
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
		this.renderEffectPreview(previews, 'Text', rule.text?.color);
		this.renderEffectPreview(previews, 'Background', rule.background?.choice);
		this.renderEffectPreview(previews, 'Border', rule.border?.color);
		const textStyles = [rule.text?.bold ? 'Bold' : null, rule.text?.strikethrough ? 'Strikethrough' : null].filter((style): style is string => style !== null);
		if (textStyles.length > 0) previews.createDiv({ text: `Text style: ${textStyles.join(' · ')}`, cls: 'ft-rule-preview' });

		const actions = card.createDiv('ft-rule-card__actions');
		const exists = this.toolkit.app.vault.getAbstractFileByPath(path) !== null;
		const edit = actions.createEl('button', { text: 'Edit', attr: { type: 'button' } });
		edit.disabled = !exists;
		edit.title = exists ? `Edit appearance for ${name}` : 'This path no longer exists';
		edit.addEventListener('click', () => new AppearanceModal(this.toolkit, path, () => this.update()).open());
		const remove = actions.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': `Remove appearance rule for ${name}` } });
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

function openExternalLink(url: string): void {
	window.open(url, '_blank', 'noopener,noreferrer');
}
