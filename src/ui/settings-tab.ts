import { PluginSettingTab, TFolder, setIcon, type Setting, type SettingDefinition, type SettingDefinitionItem, type TAbstractFile } from 'obsidian';
import { PALETTE_TEMPLATES, paletteTemplate } from '../colors';
import type FolderToolkitPlugin from '../main';
import type { AppearanceRule, ConditionalFormatRule, SavedPreset } from '../types';
import { AppearanceModal } from './appearance-modal';
import { ConditionalRuleModal, conditionalMatches, describeConditionalRule, matchCountLabel } from './conditional-rule-modal';
import { ConfirmRemoveModal } from './confirm-remove-modal';
import { MissingItemsModal } from './missing-items-modal';
import { PresetNameModal } from './preset-name-modal';
import { buildSampleRow, conditionalSampleName, samplePath, styleConditionalSample, stylePreviewRows, stylePreviewTree } from './preview-tree';
import { ManagedPathIndex } from '../managed-path-index';
import { containingPathIndex } from '../path-utils';
import { replaceOwnedRoot } from './dom-lifecycle';
import { ABOUT_AND_FEEDBACK, BUG_REPORT_URL, FEATURE_REQUEST_URL, MORE_PLUGINS_URL, WEBSITE_URL } from '../external-links';

const PRESET_SAMPLE_NAME = 'Example folder';

/**
 * The plugin's settings, built from Obsidian's own groups and lists so the tab looks
 * and searches like the app's settings. Each definition's `name` and `desc` are what
 * the page shows and what settings search finds.
 */
export class FolderToolkitSettingTab extends PluginSettingTab {
	private readonly managedIndex = new ManagedPathIndex();

	constructor(private readonly toolkit: FolderToolkitPlugin) {
		super(toolkit.app, toolkit);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			this.appearanceGroup(),
			this.presetList(),
			this.nameRuleList(),
			this.styledItemList(),
			this.missingItemsGroup(),
			this.hiddenItemList(),
			this.nestedVaultGroup(),
			this.aboutGroup(),
		];
	}

	/** Scrolls to the name rules once the tab has rendered them. */
	revealConditionalFormats(attempts = 5): void {
		window.requestAnimationFrame(() => {
			const section = this.containerEl.querySelector<HTMLElement>('.ft-name-rules');
			if (section) section.scrollIntoView({ block: 'start' });
			else if (attempts > 1) this.revealConditionalFormats(attempts - 1);
		});
	}

	openRuleEditor(id: string, isNew = false): void {
		new ConditionalRuleModal(this.toolkit, id, { isNew, onClose: () => this.update() }).open();
	}

	private appearanceGroup(): SettingDefinitionItem {
		return {
			type: 'group',
			heading: 'Appearance',
			items: [
				{
					name: 'Color palette',
					desc: 'The colors every color picker offers. Custom colors stay as they are.',
					aliases: ['colors', 'template', 'appearance'],
					render: (setting) => this.renderPalette(setting),
				},
				{
					name: 'Note tab colors',
					desc: 'Show item colors on open note tabs. Text color is always included.',
					aliases: ['open note tabs', 'tab background', 'tab border'],
					render: (setting) => {
						setting.addDropdown((dropdown) => dropdown
							.addOptions({ off: 'Off', background: 'Background', border: 'Border', both: 'Background and border' })
							.setValue(this.toolkit.settings.tabStyle)
							.onChange(async (value) => { await this.toolkit.setTabStyle(value); }));
					},
				},
			],
		};
	}

	private presetList(): SettingDefinitionItem {
		const presets = [...(this.toolkit.settings.savedPresets ?? [])];
		return {
			type: 'list',
			heading: 'Presets',
			cls: 'ft-presets',
			emptyState: 'No presets yet. Save one from the appearance editor, or from Appearance in the file menu.',
			onDelete: (index) => { const preset = presets[index]; if (preset) this.confirmDeletePreset(preset); },
			items: presets.map((preset): SettingDefinition => ({
				name: preset.name,
				aliases: ['preset'],
				render: (setting) => {
					this.renderPresetSample(setting.descEl, preset.rule);
					setting.addExtraButton((button) => button.setIcon('pencil').setTooltip('Rename').onClick(() => this.renamePreset(preset)));
				},
			})),
		};
	}

	private nameRuleList(): SettingDefinitionItem {
		const rules = [...this.toolkit.settings.conditionalFormats];
		const files = this.toolkit.app.vault.getAllLoadedFiles?.() ?? [];
		return {
			type: 'list',
			heading: 'Name rules',
			cls: 'ft-name-rules',
			emptyState: 'No name rules yet. Add one to style files and folders by their name.',
			addItem: {
				name: 'Add name rule',
				action: () => {
					void this.toolkit.addConditionalFormat().then((id) => {
						this.update();
						this.openRuleEditor(id, true);
					});
				},
			},
			onReorder: (from, to) => { void this.toolkit.reorderConditionalFormat(from, to).then(() => this.update()); },
			onDelete: (index) => { const rule = rules[index]; if (rule) this.confirmDeleteRule(rule); },
			items: rules.map((rule): SettingDefinition => ({
				name: describeConditionalRule(rule),
				aliases: ['name rule', 'conditional formatting', rule.pattern],
				render: (setting) => this.renderRuleRow(setting, rule, files),
			})),
		};
	}

	private styledItemList(): SettingDefinitionItem {
		const missingIndex = containingPathIndex(this.toolkit.missingAppearanceRoots().map((root) => root.path));
		const paths = this.managedPaths().appearance.map((entry) => entry.path).filter((path) => missingIndex(path) === null);
		return {
			type: 'list',
			heading: 'Styled items',
			cls: 'ft-styled-items',
			emptyState: 'No styled items yet. Right-click a file or folder and choose Edit appearance.',
			...(paths.length > 0 ? { search: { placeholder: 'Search styled items…', match: (def: SettingDefinition, query: string) => def.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) } } : {}),
			onDelete: (index) => { const path = paths[index]; if (path) this.confirmRemoveAppearance(path); },
			items: paths.map((path): SettingDefinition => ({
				name: path,
				render: (setting) => this.renderStyledRow(setting, path),
			})),
		};
	}

	private missingItemsGroup(): SettingDefinitionItem {
		const count = this.toolkit.missingAppearanceRoots().length;
		return {
			type: 'group',
			cls: 'ft-missing-items',
			visible: count > 0,
			items: [{
				name: 'Missing items',
				desc: `${count === 1 ? '1 styled item was' : `${count} styled items were`} moved, renamed or deleted outside Obsidian.`,
				aliases: ['reattach', 'moved', 'renamed'],
				render: (setting) => {
					setting.addButton((button) => button.setButtonText('Review…').onClick(() => new MissingItemsModal(this.toolkit, () => this.update()).open()));
				},
			}],
		};
	}

	private hiddenItemList(): SettingDefinitionItem {
		const hidden = this.managedPaths().hidden.map((entry) => entry.path);
		return {
			type: 'list',
			heading: 'Hidden items',
			cls: 'ft-hidden-items',
			items: [
				{
					name: 'Show hidden items',
					desc: hidden.length > 0 ? 'Show the items you hid, until you turn this off.' : 'Nothing is hidden yet. Right-click a file or folder and choose Hide.',
					aliases: ['visibility', 'reveal'],
					render: (setting) => {
						setting.addToggle((toggle) => toggle
							.setValue(this.toolkit.settings.showHiddenItems)
							.onChange(async (value) => { await this.toolkit.setShowHiddenItems(value); }));
					},
				},
				...hidden.map((path): SettingDefinition => ({
					name: path,
					render: (setting) => this.renderHiddenRow(setting, path),
				})),
			],
		};
	}

	private nestedVaultGroup(): SettingDefinitionItem {
		return {
			type: 'group',
			heading: 'Nested vaults',
			items: [
				{
					name: 'Nested vaults',
					desc: 'Show and save the colors of vault folders inside this vault.',
					aliases: ['vault inside vault', 'nested', 'sub vault'],
					render: (setting) => {
						setting.addToggle((toggle) => toggle
							.setValue(this.toolkit.settings.nestedVaults)
							.onChange(async (value) => {
								await this.toolkit.setNestedVaults(value);
								this.refreshDomState();
							}));
					},
				},
				{
					name: 'Vault marker',
					desc: 'How folders that are vaults are marked.',
					aliases: ['nested', 'vault icon', 'vault border'],
					visible: () => this.toolkit.settings.nestedVaults,
					render: (setting) => {
						setting.addDropdown((dropdown) => dropdown
							.addOptions({ both: 'Icon and border', icon: 'Icon', border: 'Border', off: 'Off' })
							.setValue(this.toolkit.settings.vaultMarker)
							.onChange(async (value) => { await this.toolkit.setVaultMarker(value); }));
					},
				},
			],
		};
	}

	private aboutGroup(): SettingDefinitionItem {
		return {
			type: 'group',
			heading: ABOUT_AND_FEEDBACK.heading,
			cls: 'ft-about',
			items: [{
				name: `${ABOUT_AND_FEEDBACK.name} ${this.toolkit.manifest.version}`,
				desc: ABOUT_AND_FEEDBACK.description,
				aliases: ['feedback', 'bug', 'feature request', 'website', 'mindful apps'],
				render: (setting) => {
					const link = (icon: string, label: string, url: string) => setting.addExtraButton((button) => button.setIcon(icon).setTooltip(label).onClick(() => openExternalLink(url)));
					link('bug', ABOUT_AND_FEEDBACK.bugReportLabel, BUG_REPORT_URL);
					link('lightbulb', ABOUT_AND_FEEDBACK.featureRequestLabel, FEATURE_REQUEST_URL);
					link('puzzle', ABOUT_AND_FEEDBACK.morePluginsLabel, MORE_PLUGINS_URL);
					link('globe', ABOUT_AND_FEEDBACK.websiteLabel, WEBSITE_URL);
				},
			}],
		};
	}

	private managedPaths(): ReturnType<ManagedPathIndex['read']> {
		return this.managedIndex.read(this.toolkit.settings, this.toolkit.managedPathsRevision?.() ?? '');
	}

	private renderRuleRow(setting: Setting, rule: ConditionalFormatRule, files: readonly TAbstractFile[]): void {
		setting.settingEl.addClass('ft-list-row', 'ft-list-row--clickable');
		const desc = setting.descEl;
		desc.empty();
		if (rule.pattern.trim()) {
			const isFolder = rule.target !== 'file';
			const name = conditionalSampleName(rule);
			const tree = buildSampleRow(desc, name, samplePath(name, isFolder), isFolder);
			styleConditionalSample(tree, this.toolkit.settings, rule);
			desc.createSpan({ text: matchCountLabel(conditionalMatches(rule, files).length), cls: 'ft-list-row__meta' });
		} else {
			desc.createSpan({ text: 'Not used until it has a name pattern.', cls: 'ft-list-row__meta' });
		}
		setting.addExtraButton((button) => button.setIcon('pencil').setTooltip('Edit rule').onClick(() => this.openRuleEditor(rule.id)));
		setting.settingEl.addEventListener('click', (event) => {
			if ((event.target as HTMLElement).closest('.setting-item-control')) return;
			this.openRuleEditor(rule.id);
		});
	}

	private renderStyledRow(setting: Setting, path: string): void {
		setting.settingEl.addClass('ft-list-row', 'ft-list-row--clickable');
		const file = this.toolkit.app.vault.getAbstractFileByPath(path);
		const isFolder = file instanceof TFolder;
		const parts = path.split('/');
		const name = parts.pop() ?? path;
		setting.nameEl.empty();
		const tree = buildSampleRow(setting.nameEl, isFolder ? name : name.replace(/\.md$/i, ''), path, isFolder);
		stylePreviewRows(tree, this.toolkit.settings);
		setting.setDesc(parts.join('/'));
		const edit = (): void => new AppearanceModal(this.toolkit, path, () => this.update()).open();
		setting.addExtraButton((button) => button.setIcon('pencil').setTooltip('Edit appearance').onClick(edit));
		setting.settingEl.addEventListener('click', (event) => {
			if ((event.target as HTMLElement).closest('.setting-item-control')) return;
			edit();
		});
	}

	private renderHiddenRow(setting: Setting, path: string): void {
		setting.settingEl.addClass('ft-list-row');
		const parts = path.split('/');
		const name = parts.pop() ?? path;
		const kind = this.toolkit.app.vault.getAbstractFileByPath(path) instanceof TFolder ? 'Folder' : 'File';
		setting.setName(name).setDesc(parts.length > 0 ? `${kind} in ${parts.join('/')}` : kind);
		setting.addExtraButton((button) => button.setIcon('eye').setTooltip('Unhide').onClick(() => {
			void this.toolkit.unhidePath(path).then(() => this.update());
		}));
	}

	private renderPresetSample(container: HTMLElement, rule: AppearanceRule): void {
		container.empty();
		const path = samplePath(PRESET_SAMPLE_NAME, true);
		const tree = buildSampleRow(container, PRESET_SAMPLE_NAME, path, true);
		stylePreviewTree(tree, {
			...this.toolkit.settings,
			appearanceRules: Object.create(null) as Record<string, AppearanceRule>,
			conditionalFormats: [],
		}, path, rule);
	}

	private renamePreset(preset: SavedPreset): void {
		new PresetNameModal(this.toolkit.app, {
			title: 'Rename preset',
			initialName: preset.name,
			submitLabel: 'Rename',
			onSubmit: async (name) => { await this.toolkit.renamePreset(preset.id, name); this.update(); },
		}).open();
	}

	private confirmDeletePreset(preset: SavedPreset): void {
		new ConfirmRemoveModal(this.toolkit.app, preset.name, async () => {
			await this.toolkit.deletePreset(preset.id);
			this.update();
		}, {
			title: 'Delete preset?',
			description: 'This deletes the saved preset. Files and folders that use its style keep it.',
			confirmLabel: 'Delete preset',
		}).open();
	}

	private confirmDeleteRule(rule: ConditionalFormatRule): void {
		new ConfirmRemoveModal(this.toolkit.app, describeConditionalRule(rule), async () => {
			await this.toolkit.removeConditionalFormat(rule.id);
			this.update();
		}, {
			title: 'Delete name rule?',
			description: 'This deletes the rule. Files and folders are not changed.',
			confirmLabel: 'Delete rule',
		}).open();
	}

	private confirmRemoveAppearance(path: string): void {
		new ConfirmRemoveModal(this.toolkit.app, path, async () => {
			await this.toolkit.removeAppearance(path);
			this.update();
		}).open();
	}

	private renderPalette(setting: Setting): () => void {
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
}

function openExternalLink(url: string): void {
	window.open(url, '_blank', 'noopener,noreferrer');
}
