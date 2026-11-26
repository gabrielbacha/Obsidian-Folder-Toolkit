import { Modal, Scope, SettingGroup, TFolder, type Setting, type TAbstractFile } from 'obsidian';
import DEFAULT_APPEARANCE_STRENGTH from '../appearance-tokens.json';
import { isBackgroundEnabled, isBorderEnabled, isFontEnabled, matchesConditionalFormat } from '../conditional-format';
import type FolderToolkitPlugin from '../main';
import type { BorderRule, ColorChoice, ConditionalFormatRule, ConditionalMatch, ConditionalTarget } from '../types';
import { AppearanceControlRenderer } from './appearance-controls';
import { ConfirmRemoveModal } from './confirm-remove-modal';
import { captureFocus } from './focus-state';
import { buildConditionalSample, styleConditionalSample } from './preview-tree';

export const TARGET_LABELS: Record<ConditionalTarget, string> = { folder: 'Folders', file: 'Files', both: 'Files and folders' };
const MATCH_LABELS: Record<ConditionalMatch, string> = { equals: 'Is exactly', startsWith: 'Starts with', endsWith: 'Ends with', contains: 'Contains' };
const MATCH_PHRASES: Record<ConditionalMatch, string> = { equals: 'named exactly', startsWith: 'starting with', endsWith: 'ending with', contains: 'containing' };
const DEFAULT_BORDER: BorderRule = { style: 'box', color: { kind: 'preset', slot: 0, strength: 42 }, thickness: 'thin' };
const DEFAULT_BACKGROUND: Exclude<ColorChoice, { kind: 'none' }> = { kind: 'custom', hex: '#A8ADB5', strength: 20 };

/** The rule as a sentence, such as: Folders named exactly “__system”. */
export function describeConditionalRule(rule: Pick<ConditionalFormatRule, 'target' | 'match' | 'pattern'>): string {
	const pattern = rule.pattern.trim();
	return pattern ? `${TARGET_LABELS[rule.target]} ${MATCH_PHRASES[rule.match]} “${pattern}”` : `${TARGET_LABELS[rule.target]} with no name yet`;
}

/** The items in `files` that `rule` styles. The vault root is never one of them. */
export function conditionalMatches(rule: ConditionalFormatRule, files: readonly TAbstractFile[]): TAbstractFile[] {
	if (!rule.pattern.trim()) return [];
	return files.filter((file) => file.path !== '/' && file.path !== '' && matchesConditionalFormat(file.path, file instanceof TFolder, rule));
}

export function matchCountLabel(count: number): string {
	return count === 0 ? 'No matches' : count === 1 ? '1 match' : `${count} matches`;
}

function matchSummary(rule: ConditionalFormatRule, files: readonly TAbstractFile[]): string {
	if (!rule.pattern.trim()) return '';
	const matches = conditionalMatches(rule, files);
	if (matches.length === 0) return 'No items in this vault match yet.';
	const names = matches.slice(0, 3).map((file) => file.name).join(', ');
	return `Matches ${matches.length === 1 ? '1 item' : `${matches.length} items`} in this vault: ${names}${matches.length > 3 ? ', …' : ''}`;
}

function sameRule(a: ConditionalFormatRule, b: ConditionalFormatRule | undefined): boolean {
	return b !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

export interface ConditionalRuleModalOptions {
	/** The rule was just added. Closing without Save removes it again. */
	isNew?: boolean;
	/** Runs after the dialog closes, so the settings list can show the saved state. */
	onClose: () => void;
}

/**
 * Edits one name rule. Changes show in the file explorer and in the preview at once,
 * and are saved only with Save, like the appearance editor for one item.
 */
export class ConditionalRuleModal extends Modal {
	private draft: ConditionalFormatRule;
	private readonly controls: AppearanceControlRenderer;
	private saving = false;
	private saved = false;
	private refreshPreview = (): void => {};
	private refreshFooter = (): void => {};
	private refreshDuplicate = (): void => {};

	constructor(
		private readonly toolkit: FolderToolkitPlugin,
		private readonly ruleId: string,
		private readonly options: ConditionalRuleModalOptions,
	) {
		super(toolkit.app);
		const rule = this.savedRule();
		if (!rule) throw new Error(`Folder Toolkit: no name rule with id ${ruleId}.`);
		this.draft = structuredClone(rule);
		this.controls = new AppearanceControlRenderer(toolkit);
		this.scope = new Scope(this.scope);
		this.scope.register([], 'Escape', () => {
			if (!this.controls.closeOpenPicker()) this.close();
			return false;
		});
	}

	onOpen(): void {
		this.modalEl.addClass('ft-rule-modal');
		this.setTitle(this.options.isNew ? 'New name rule' : 'Edit name rule');
		this.render();
		if (!this.draft.pattern) this.contentEl.querySelector<HTMLInputElement>('input[aria-label="Name pattern"]')?.focus();
	}

	onClose(): void {
		this.controls.dispose();
		this.toolkit.clearConditionalFormatPreview(this.ruleId);
		this.contentEl.empty();
		if (this.options.isNew && !this.saved && this.savedRule()) {
			void this.toolkit.removeConditionalFormat(this.ruleId).then(this.options.onClose, this.options.onClose);
			return;
		}
		this.options.onClose();
	}

	private savedRule(): ConditionalFormatRule | undefined {
		return this.toolkit.settings.conditionalFormats.find((rule) => rule.id === this.ruleId);
	}

	private dirty(): boolean {
		return !sameRule(this.draft, this.savedRule());
	}

	private canSave(): boolean {
		return !this.saving && this.draft.pattern.trim().length > 0 && (this.dirty() || this.options.isNew === true);
	}

	/** Shows the draft in the explorer. `rerender` rebuilds the dialog when controls appear or disappear. */
	private changed(rerender: boolean): void {
		this.toolkit.previewConditionalFormat(this.draft);
		if (rerender) this.render();
		else { this.refreshPreview(); this.refreshFooter(); this.refreshDuplicate(); }
	}

	private render(): void {
		const restoreFocus = captureFocus(this.contentEl);
		this.controls.dispose();
		this.contentEl.empty();
		this.refreshDuplicate = () => {};
		this.contentEl.addClass('ft-rule-editor');
		this.renderMatch();
		this.renderText();
		this.renderBackground();
		this.renderBorder();
		if (!this.options.isNew) this.renderRuleActions();
		this.renderFooter();
		restoreFocus();
	}

	private group(heading: string): SettingGroup {
		return new SettingGroup(this.contentEl).setHeading(heading);
	}

	/** One sentence-like row: [Folders] [named exactly] [pattern], with the preview right under it. */
	private renderMatch(): void {
		const draft = this.draft;
		const group = this.group('Match').addSetting((setting) => {
			setting.setClass('ft-rule-match').setDesc('Letter case does not matter.');
			setting.addDropdown((dropdown) => {
				dropdown.addOptions(TARGET_LABELS).setValue(draft.target)
					.onChange((value) => { draft.target = value as ConditionalTarget; this.changed(true); });
				dropdown.selectEl.setAttribute('aria-label', 'Apply to');
			});
			setting.addDropdown((dropdown) => {
				dropdown.addOptions(MATCH_LABELS).setValue(draft.match)
					.onChange((value) => { draft.match = value as ConditionalMatch; this.changed(true); });
				dropdown.selectEl.setAttribute('aria-label', 'Name match');
			});
			setting.addText((text) => {
				text.setPlaceholder('Name').setValue(draft.pattern).onChange((value) => {
					draft.pattern = value;
					this.changed(false);
				});
				text.inputEl.setAttribute('aria-label', 'Name pattern');
				text.inputEl.spellcheck = false;
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					void this.save();
				});
			});
		});
		group.addSetting((setting) => {
			const host = wideRow(setting, 'ft-rule-sample');
			const files = this.toolkit.app.vault.getAllLoadedFiles?.() ?? [];
			this.refreshPreview = () => {
				host.empty();
				const tree = buildConditionalSample(host, this.draft);
				if (tree) styleConditionalSample(tree, this.toolkit.settings, this.draft);
				const summary = matchSummary(this.draft, files);
				if (summary) host.createDiv({ text: summary, cls: 'ft-rule-sample__matches', attr: { role: 'status' } });
			};
			this.refreshPreview();
		});
	}

	private colorRow(group: SettingGroup, selected: ColorChoice, defaultStrength: number, apply: (choice: Exclude<ColorChoice, { kind: 'none' }>) => void, includeWhite = false): void {
		group.addSetting((setting) => {
			setting.setName('Color');
			this.controls.renderColorControls(wideRow(setting, 'ft-rule-color'), {
				selected,
				defaultStrength,
				includeWhite,
				onSelect: (choice, rerender) => {
					if (!choice || choice.kind === 'none') return;
					apply(choice);
					this.changed(rerender);
				},
			});
		});
	}

	private renderText(): void {
		const draft = this.draft;
		const group = this.group('Text').addSetting((setting) => {
			setting.setName('Text color');
			styleToggle(setting, 'bold', 'Bold', draft.bold === true, (value) => { draft.bold = value; this.changed(false); });
			styleToggle(setting, 'strikethrough', 'Strikethrough', draft.strikethrough === true, (value) => { draft.strikethrough = value; this.changed(false); });
			setting.addToggle((toggle) => toggle
				.setTooltip('Text color')
				.setValue(isFontEnabled(draft))
				.onChange((value) => { draft.fontEnabled = value; this.changed(true); }));
		});
		if (isFontEnabled(draft)) this.colorRow(group, draft.color, DEFAULT_APPEARANCE_STRENGTH.text, (choice) => { draft.color = choice; }, true);
	}

	private renderBackground(): void {
		const draft = this.draft;
		const group = this.group('Background').addSetting((setting) => void setting.setName('Background color').addToggle((toggle) => toggle
			.setValue(isBackgroundEnabled(draft))
			.onChange((value) => {
				draft.backgroundEnabled = value;
				if (value && !draft.backgroundColor) draft.backgroundColor = structuredClone(DEFAULT_BACKGROUND);
				this.changed(true);
			})));
		if (isBackgroundEnabled(draft)) {
			this.colorRow(group, draft.backgroundColor ?? DEFAULT_BACKGROUND, 20, (choice) => { draft.backgroundColor = choice; });
		}
	}

	private renderBorder(): void {
		const draft = this.draft;
		const enabled = isBorderEnabled(draft) && draft.border !== undefined;
		const group = this.group('Border').addSetting((setting) => {
			setting.setName('Border');
			const border = draft.border;
			if (enabled && border) {
				setting.addDropdown((dropdown) => {
					dropdown.addOptions({ box: 'Box', rail: 'Rail' }).setValue(border.style)
						.onChange((value) => { draft.border = { ...border, style: value === 'rail' ? 'rail' : 'box' }; this.changed(true); });
					dropdown.selectEl.setAttribute('aria-label', 'Border shape');
				});
				setting.addDropdown((dropdown) => {
					dropdown.addOptions({ thin: 'Thin', medium: 'Medium', thick: 'Thick' }).setValue(border.thickness ?? 'thin')
						.onChange((value) => { draft.border = { ...border, thickness: value as BorderRule['thickness'] }; this.changed(true); });
					dropdown.selectEl.setAttribute('aria-label', 'Border thickness');
				});
			}
			setting.addToggle((toggle) => toggle
				.setTooltip('Border')
				.setValue(isBorderEnabled(draft))
				.onChange((value) => {
					draft.borderEnabled = value;
					if (value && !draft.border) draft.border = structuredClone(DEFAULT_BORDER);
					this.changed(true);
				}));
		});
		if (!enabled || !draft.border) return;
		const border = draft.border;
		const strength = border.style === 'box' ? DEFAULT_APPEARANCE_STRENGTH.box : DEFAULT_APPEARANCE_STRENGTH.rail;
		this.colorRow(group, border.color, strength, (choice) => { draft.border = { ...border, color: choice }; });
	}

	private renderRuleActions(): void {
		const rules = this.toolkit.settings.conditionalFormats;
		const index = rules.findIndex((rule) => rule.id === this.ruleId);
		this.group('Rule').addSetting((setting) => {
			setting
				.setName(`Rule ${index + 1} of ${rules.length}`)
				.setDesc('When rules overlap, the lower rule wins.')
				.addExtraButton((button) => button.setIcon('arrow-up').setTooltip('Move up').setDisabled(index <= 0)
					.onClick(() => { void this.toolkit.moveConditionalFormat(this.ruleId, -1).then(() => this.render()); }))
				.addExtraButton((button) => button.setIcon('arrow-down').setTooltip('Move down').setDisabled(index < 0 || index >= rules.length - 1)
					.onClick(() => { void this.toolkit.moveConditionalFormat(this.ruleId, 1).then(() => this.render()); }))
				.addExtraButton((button) => {
					button.setIcon('copy').onClick(() => { void this.duplicate(); });
					this.refreshDuplicate = () => {
						const blocked = this.dirty();
						button.setTooltip(blocked ? 'Save or cancel your changes to duplicate' : 'Duplicate rule').setDisabled(blocked);
					};
					this.refreshDuplicate();
				})
				.addExtraButton((button) => button.setIcon('trash-2').setTooltip('Delete rule').onClick(() => this.confirmDelete()));
		});
	}

	private renderFooter(): void {
		const footer = this.contentEl.createDiv('ft-modal-footer ft-rule-editor__footer');
		const status = footer.createSpan({ cls: 'ft-rule-editor__status', attr: { role: 'status' } });
		const error = footer.createSpan({ cls: 'ft-field-error', attr: { role: 'alert' } });
		const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
		const save = footer.createEl('button', { text: 'Save', cls: 'mod-cta', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		save.addEventListener('click', () => { void this.save(); });
		this.refreshFooter = () => {
			status.setText(this.draft.pattern.trim() ? (this.dirty() ? 'Unsaved changes' : '') : 'Type a name pattern to save this rule.');
			save.disabled = !this.canSave();
			error.removeClass('is-visible');
		};
		this.refreshFooter();
	}

	private async save(): Promise<void> {
		if (!this.canSave()) return;
		this.saving = true;
		this.refreshFooter();
		try {
			await this.toolkit.updateConditionalFormat(this.ruleId, structuredClone(this.draft));
			this.saved = true;
			this.close();
		} catch {
			const error = this.contentEl.querySelector<HTMLElement>('.ft-rule-editor__footer .ft-field-error');
			error?.setText('This rule could not be saved. Try again.');
			error?.addClass('is-visible');
		} finally {
			this.saving = false;
			if (!this.saved) this.refreshFooter();
		}
	}

	private async duplicate(): Promise<void> {
		const copy = await this.toolkit.duplicateConditionalFormat(this.ruleId);
		if (!copy) return;
		const { onClose } = this.options;
		this.close();
		new ConditionalRuleModal(this.toolkit, copy, { onClose }).open();
	}

	private confirmDelete(): void {
		new ConfirmRemoveModal(this.toolkit.app, describeConditionalRule(this.draft), async () => {
			await this.toolkit.removeConditionalFormat(this.ruleId);
			this.close();
		}, {
			title: 'Delete name rule?',
			description: 'This deletes the rule. Files and folders are not changed.',
			confirmLabel: 'Delete rule',
		}).open();
	}
}

/** Gives a setting row a full-width area below its name for controls that need the space. */
/** An icon button that stays pressed while its style is on, so related styles share one row. */
function styleToggle(setting: Setting, icon: string, label: string, value: boolean, onChange: (value: boolean) => void): void {
	setting.addExtraButton((button) => {
		let pressed = value;
		const paint = () => {
			button.extraSettingsEl.toggleClass('is-active', pressed);
			button.extraSettingsEl.setAttribute('aria-pressed', String(pressed));
		};
		button.setIcon(icon).setTooltip(label).onClick(() => { pressed = !pressed; paint(); onChange(pressed); });
		button.extraSettingsEl.addClass('ft-style-toggle');
		paint();
	});
}

export function wideRow(setting: Setting, className: string): HTMLElement {
	setting.settingEl.addClass('ft-setting-wide');
	return setting.settingEl.createDiv(`ft-setting-wide__body ${className}`);
}
