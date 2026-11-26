export class Scope {
	constructor(public parent?: Scope) {}
	register(_modifiers: unknown, _key: unknown, callback: () => unknown): unknown { return callback; }
}
export class Menu {}
export class Modal {
	closed = true;
	modalEl = document.createElement('div');
	titleEl = document.createElement('div');
	contentEl = document.createElement('div');
	scope = new Scope();
	constructor(public app?: unknown) {}
	setTitle(title = ''): this { this.titleEl.textContent = title; return this; }
	open(): void { if (!this.closed) return; this.closed = false; (this as { onOpen?: () => void }).onOpen?.(); }
	close(): void { this.closed = true; (this as { onClose?: () => void }).onClose?.(); }
}
export class FuzzySuggestModal {
	inputEl = document.createElement('input');
	constructor(public app: unknown) {}
	setPlaceholder(): void {}
	setInstructions(): void {}
	onOpen(): void {}
	open(): void { this.onOpen(); }
}
export class Notice {}
export class Plugin {}
export class PluginSettingTab {
	containerEl = document.createElement('div');
	update(): void {}
	refreshDomState(): void {}
}
export class TAbstractFile {}
export class TFolder extends TAbstractFile {}
export function setIcon(): void {}

type Listener<T> = (value: T) => unknown;

/** A small stand-in for Obsidian's setting row. Controls fire their callbacks on DOM events. */
export class Setting {
	settingEl = document.createElement('div');
	infoEl = document.createElement('div');
	nameEl = document.createElement('div');
	descEl = document.createElement('div');
	controlEl = document.createElement('div');

	constructor(containerEl?: HTMLElement) {
		this.settingEl.className = 'setting-item';
		this.infoEl.className = 'setting-item-info';
		this.nameEl.className = 'setting-item-name';
		this.descEl.className = 'setting-item-description';
		this.controlEl.className = 'setting-item-control';
		this.infoEl.append(this.nameEl, this.descEl);
		this.settingEl.append(this.infoEl, this.controlEl);
		containerEl?.append(this.settingEl);
	}

	setName(name: string | DocumentFragment): this { this.nameEl.replaceChildren(name); return this; }
	setDesc(desc: string | DocumentFragment): this { this.descEl.replaceChildren(desc); return this; }
	setClass(cls: string): this { this.settingEl.classList.add(cls); return this; }
	setHeading(): this { this.settingEl.classList.add('setting-item-heading'); return this; }

	addToggle(callback: (toggle: ToggleComponent) => unknown): this { callback(new ToggleComponent(this.controlEl)); return this; }
	addDropdown(callback: (dropdown: DropdownComponent) => unknown): this { callback(new DropdownComponent(this.controlEl)); return this; }
	addText(callback: (text: TextComponent) => unknown): this { callback(new TextComponent(this.controlEl)); return this; }
	addButton(callback: (button: ButtonComponent) => unknown): this { callback(new ButtonComponent(this.controlEl)); return this; }
	addExtraButton(callback: (button: ExtraButtonComponent) => unknown): this { callback(new ExtraButtonComponent(this.controlEl)); return this; }
}

export class SettingGroup {
	groupEl = document.createElement('div');
	headingEl = document.createElement('div');
	listEl = document.createElement('div');
	constructor(containerEl: HTMLElement) {
		this.groupEl.className = 'setting-group';
		this.headingEl.className = 'setting-item setting-item-heading';
		this.listEl.className = 'setting-items';
		this.groupEl.append(this.headingEl, this.listEl);
		containerEl.append(this.groupEl);
	}
	setHeading(text: string): this { this.headingEl.textContent = text; return this; }
	addClass(...classes: string[]): this { this.groupEl.classList.add(...classes); return this; }
	addSetting(callback: (setting: Setting) => void): this { callback(new Setting(this.listEl)); return this; }
}

class ToggleComponent {
	toggleEl = document.createElement('label');
	private readonly input = document.createElement('input');
	private listener: Listener<boolean> | null = null;
	constructor(parent: HTMLElement) {
		this.toggleEl.className = 'checkbox-container';
		this.toggleEl.tabIndex = 0;
		this.input.type = 'checkbox';
		this.toggleEl.append(this.input);
		parent.append(this.toggleEl);
		this.toggleEl.addEventListener('click', () => this.setValue(!this.input.checked, true));
	}
	getValue(): boolean { return this.input.checked; }
	setValue(value: boolean, notify = false): this {
		this.input.checked = value;
		this.toggleEl.classList.toggle('is-enabled', value);
		if (notify) void this.listener?.(value);
		return this;
	}
	onChange(listener: Listener<boolean>): this { this.listener = listener; return this; }
	setDisabled(disabled: boolean): this { this.input.disabled = disabled; return this; }
}

class DropdownComponent {
	selectEl = document.createElement('select');
	constructor(parent: HTMLElement) { this.selectEl.className = 'dropdown'; parent.append(this.selectEl); }
	addOption(value: string, label: string): this { this.selectEl.append(new Option(label, value)); return this; }
	addOptions(options: Record<string, string>): this { for (const [value, label] of Object.entries(options)) this.addOption(value, label); return this; }
	getValue(): string { return this.selectEl.value; }
	setValue(value: string): this { this.selectEl.value = value; return this; }
	onChange(listener: Listener<string>): this { this.selectEl.addEventListener('change', () => { void listener(this.selectEl.value); }); return this; }
	setDisabled(disabled: boolean): this { this.selectEl.disabled = disabled; return this; }
}

class TextComponent {
	inputEl = document.createElement('input');
	constructor(parent: HTMLElement) { this.inputEl.type = 'text'; parent.append(this.inputEl); }
	getValue(): string { return this.inputEl.value; }
	setValue(value: string): this { this.inputEl.value = value; return this; }
	setPlaceholder(value: string): this { this.inputEl.placeholder = value; return this; }
	onChange(listener: Listener<string>): this { this.inputEl.addEventListener('input', () => { void listener(this.inputEl.value); }); return this; }
}

class ButtonComponent {
	buttonEl = document.createElement('button');
	constructor(parent: HTMLElement) { parent.append(this.buttonEl); }
	setButtonText(text: string): this { this.buttonEl.textContent = text; return this; }
	setCta(): this { this.buttonEl.classList.add('mod-cta'); return this; }
	setWarning(): this { this.buttonEl.classList.add('mod-warning'); return this; }
	setDestructive(): this { this.buttonEl.classList.add('mod-destructive'); return this; }
	setTooltip(text: string): this { this.buttonEl.setAttribute('aria-label', text); return this; }
	setIcon(): this { return this; }
	setDisabled(disabled: boolean): this { this.buttonEl.disabled = disabled; return this; }
	onClick(listener: () => unknown): this { this.buttonEl.addEventListener('click', () => { if (!this.buttonEl.disabled) void listener(); }); return this; }
}

class ExtraButtonComponent {
	extraSettingsEl = document.createElement('div');
	private disabled = false;
	constructor(parent: HTMLElement) { this.extraSettingsEl.className = 'clickable-icon extra-setting-button'; this.extraSettingsEl.tabIndex = 0; parent.append(this.extraSettingsEl); }
	setIcon(icon: string): this { this.extraSettingsEl.dataset.icon = icon; return this; }
	setTooltip(text: string): this { this.extraSettingsEl.setAttribute('aria-label', text); return this; }
	setDisabled(disabled: boolean): this { this.disabled = disabled; this.extraSettingsEl.classList.toggle('is-disabled', disabled); return this; }
	onClick(listener: () => unknown): this { this.extraSettingsEl.addEventListener('click', () => { if (!this.disabled) void listener(); }); return this; }
}
