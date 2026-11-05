import { setIcon } from 'obsidian';
import { normalizeHex, paletteTemplate } from '../colors';
import type FolderToolkitPlugin from '../main';
import type { ColorChoice, PaletteTemplateId } from '../types';

export interface ColorControlOptions {
	selected: ColorChoice | undefined;
	defaultStrength: number;
	includeWhite?: boolean;
	allowInherit?: boolean;
	disabled?: boolean;
	onSelect: (choice: ColorChoice | undefined, rerender: boolean) => void;
}

export interface StrengthSliderOptions {
	label: string;
	value: number | undefined;
	defaultValue: number;
	disabled?: boolean;
	onInput: (value: number) => void;
	onReset: () => void;
}

export class AppearanceControlRenderer {
	private cleanups: Array<() => void> = [];

	/** `palette` returns the palette to show. It defaults to this vault's palette. */
	constructor(
		toolkit: FolderToolkitPlugin,
		private readonly palette: () => PaletteTemplateId = () => toolkit.settings.paletteTemplateId,
	) {}

	dispose(): void {
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups = [];
	}

	/** Renders a 0-100% slider with a reset button. `value` undefined means the default is in use. */
	renderStrengthSlider(container: HTMLElement, options: StrengthSliderOptions): void {
		const { label, value, defaultValue, disabled = false, onInput, onReset } = options;
		const current = value ?? defaultValue;
		const control = container.createDiv('ft-color-strength');
		const labelEl = control.createEl('label', { text: label });
		const actions = labelEl.createSpan('ft-color-strength__actions');
		const resetLabel = `Reset ${label.toLowerCase()} to default`;
		const reset = actions.createEl('button', { cls: 'clickable-icon ft-color-strength__reset', attr: { type: 'button', 'aria-label': resetLabel, title: resetLabel } });
		setIcon(reset, 'rotate-ccw');
		reset.disabled = disabled || value === undefined;
		const valueEl = actions.createSpan({ text: `${current}%`, cls: 'ft-color-strength__value' });
		const slider = control.createEl('input', { attr: { type: 'range', min: '0', max: '100', step: '1', value: String(current), 'aria-label': label } });
		slider.disabled = disabled;
		slider.addEventListener('input', () => {
			const strength = Number(slider.value);
			valueEl.textContent = `${strength}%`;
			reset.disabled = false;
			onInput(strength);
		});
		reset.addEventListener('click', onReset);
	}

	renderColorControls(container: HTMLElement, options: ColorControlOptions): void {
		const { selected, defaultStrength, includeWhite = false, allowInherit = false, disabled = false, onSelect } = options;
		const host = container.createDiv(`ft-color-controls${disabled ? ' is-disabled' : ''}`);
		if (allowInherit) {
			const modes = host.createDiv('ft-choice-row');
			this.choiceButton(modes, 'Inherit color', selected === undefined, () => onSelect(undefined, true), disabled);
			this.choiceButton(modes, 'No color', selected?.kind === 'none', () => onSelect({ kind: 'none' }, true), disabled);
		}
		const template = paletteTemplate(this.palette());
		const selectedStrength = selected && selected.kind !== 'none' ? selected.strength : undefined;
		let activeChoice: Exclude<ColorChoice, { kind: 'none' }> | undefined = selected?.kind === 'none' ? undefined : selected;
		const paletteLabel = host.createDiv('ft-palette-label');
		paletteLabel.createSpan({ text: template.label });
		paletteLabel.createSpan({ text: 'Palette', cls: 'ft-palette-label__meta' });
		const grid = host.createDiv('ft-swatch-grid');
		grid.setAttribute('role', 'group');
		grid.setAttribute('aria-label', `${template.label} colors`);
		for (const [slot, hex] of template.colors.entries()) {
			const isSelected = selected?.kind === 'preset' && selected.slot === slot;
			const button = grid.createEl('button', {
				cls: `ft-swatch${isSelected ? ' is-selected' : ''}`,
				attr: { type: 'button', 'aria-label': `${hex}, color ${slot + 1}`, 'aria-pressed': String(isSelected), title: hex },
			});
			button.disabled = disabled;
			button.style.setProperty('--ft-swatch', hex);
			button.addEventListener('click', () => onSelect({ kind: 'preset', slot, ...(selectedStrength === undefined ? {} : { strength: selectedStrength }) }, true));
		}
		if (includeWhite) {
			const isSelected = selected?.kind === 'custom' && selected.hex === '#FFFFFF';
			const white = grid.createEl('button', {
				cls: `ft-swatch ft-swatch--white${isSelected ? ' is-selected' : ''}`,
				attr: { type: 'button', 'aria-label': 'White', 'aria-pressed': String(isSelected), title: 'White' },
			});
			white.disabled = disabled;
			white.addEventListener('click', () => onSelect({ kind: 'custom', hex: '#FFFFFF', ...(selectedStrength === undefined ? {} : { strength: selectedStrength }) }, true));
		}

		const custom = host.createDiv('ft-custom-control');
		const customOpen = false;
		const trigger = custom.createEl('button', {
			cls: `ft-custom-trigger${selected?.kind === 'custom' ? ' is-selected' : ''}`,
			attr: { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': String(customOpen) },
		});
		trigger.disabled = disabled;
		const triggerDot = trigger.createSpan('ft-custom-trigger__dot');
		const triggerLabel = trigger.createSpan({ text: selected?.kind === 'custom' ? `Custom ${selected.hex}` : 'Custom…', cls: 'ft-custom-trigger__label' });
		if (selected?.kind === 'custom') triggerDot.style.setProperty('--ft-custom-color', selected.hex);
		const popover = custom.createDiv('ft-custom-popover');
		popover.hidden = !customOpen;
		popover.setAttribute('role', 'dialog');
		popover.setAttribute('aria-label', 'Custom color');
		const popoverHeader = popover.createDiv('ft-custom-popover__header');
		popoverHeader.createSpan({ text: 'Custom color' });
		const close = popoverHeader.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': 'Close custom color picker' } });
		setIcon(close, 'x');
		const controls = popover.createDiv('ft-custom-popover__controls');
		const color = controls.createEl('input', { attr: { type: 'color', 'aria-label': 'Choose a custom color' } });
		color.value = selected?.kind === 'custom' ? selected.hex : '#3498DB';
		const field = controls.createDiv('ft-custom-color__field');
		const text = field.createEl('input', { attr: { type: 'text', 'aria-label': 'Custom hex color', autocomplete: 'off', spellcheck: 'false' } });
		text.value = color.value.toUpperCase();
		const error = field.createDiv({ text: 'Enter a 3- or 6-digit hex color.', cls: 'ft-field-error', attr: { role: 'status' } });
		let currentHex = color.value.toUpperCase();
		const selectCustom = (): void => {
			const choice: Exclude<ColorChoice, { kind: 'none' }> = { kind: 'custom', hex: currentHex, ...(selectedStrength === undefined ? {} : { strength: selectedStrength }) };
			activeChoice = choice;
			for (const swatch of grid.querySelectorAll<HTMLButtonElement>('.ft-swatch')) {
				swatch.classList.remove('is-selected');
				swatch.setAttribute('aria-pressed', 'false');
			}
			onSelect(choice, selected === undefined || selected.kind === 'none');
		};
		const commit = (value: string): void => {
			const hex = normalizeHex(value);
			text.toggleAttribute('aria-invalid', !hex);
			error.classList.toggle('is-visible', !hex);
			if (!hex) return;
			color.value = hex;
			currentHex = hex;
			triggerLabel.textContent = `Custom ${hex}`;
			triggerDot.style.setProperty('--ft-custom-color', hex);
			trigger.classList.add('is-selected');
			selectCustom();
		};
		color.addEventListener('input', () => { text.value = color.value.toUpperCase(); commit(color.value); });
		text.addEventListener('input', () => commit(text.value));
		if (selected && selected.kind !== 'none') {
			this.renderStrengthSlider(host, {
				label: 'Color strength',
				value: selected.strength,
				defaultValue: defaultStrength,
				disabled,
				onInput: (strength) => {
					if (!activeChoice) return;
					activeChoice = { ...activeChoice, strength };
					onSelect(activeChoice, false);
				},
				onReset: () => {
					if (!activeChoice) return;
					const { strength: _strength, ...defaultChoice } = activeChoice;
					onSelect(defaultChoice, true);
				},
			});
		}
		const setOpen = (open: boolean, restoreFocus = false): void => {
			popover.hidden = !open;
			trigger.setAttribute('aria-expanded', String(open));
			if (open) text.focus();
			else if (restoreFocus) trigger.focus();
		};
		trigger.addEventListener('click', () => setOpen(popover.hidden));
		close.addEventListener('click', () => setOpen(false, true));
		popover.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') { event.preventDefault(); setOpen(false, true); }
		});
		const onDocumentPointer = (event: PointerEvent): void => {
			if (!custom.contains(event.target as Node)) setOpen(false);
		};
		container.ownerDocument.addEventListener('pointerdown', onDocumentPointer, true);
		this.cleanups.push(() => container.ownerDocument.removeEventListener('pointerdown', onDocumentPointer, true));
	}

	renderTypography(container: HTMLElement, bold: boolean, strikethrough: boolean, onChange: (bold: boolean, strikethrough: boolean) => void, disabled = false): void {
		const group = container.createDiv('ft-typography-control');
		group.createSpan({ text: 'Style', cls: 'ft-control-label' });
		const buttons = group.createDiv('ft-style-buttons');
		const add = (label: string, glyph: string, active: boolean, update: () => void): void => {
			const button = buttons.createEl('button', { cls: `ft-style-toggle${active ? ' is-active' : ''}`, attr: { type: 'button', 'aria-label': label, 'aria-pressed': String(active) } });
			button.disabled = disabled;
			button.createSpan({ text: glyph, cls: label === 'Bold' ? 'ft-style-glyph--bold' : 'ft-style-glyph--strike' });
			button.addEventListener('click', update);
		};
		add('Bold', 'B', bold, () => onChange(!bold, strikethrough));
		add('Strikethrough', 'S', strikethrough, () => onChange(bold, !strikethrough));
	}

	choiceButton(container: HTMLElement, label: string, selected: boolean, onClick: () => void, disabled = false): void {
		const button = container.createEl('button', { text: label, cls: selected ? 'is-selected' : '', attr: { type: 'button', 'aria-pressed': String(selected) } });
		button.disabled = disabled;
		button.addEventListener('click', onClick);
	}
}
