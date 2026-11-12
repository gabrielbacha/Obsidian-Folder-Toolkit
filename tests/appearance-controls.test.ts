import { installDomHelpers } from "./dom-helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceControlRenderer } from "../src/ui/appearance-controls";
import type FolderToolkitPlugin from "../src/main";


function toolkit(): FolderToolkitPlugin {
	return { settings: { paletteTemplateId: "default" } } as FolderToolkitPlugin;
}

describe("AppearanceControlRenderer", () => {
	beforeEach(() => installDomHelpers());

	it("exposes pressed typography state and keyboard-native buttons", () => {
		const host = document.createElement("div");
		const onChange = vi.fn();
		new AppearanceControlRenderer(toolkit()).renderTypography(host, true, false, onChange);
		const [bold, strike] = [...host.querySelectorAll<HTMLButtonElement>("button")];
		expect(bold?.getAttribute("aria-pressed")).toBe("true");
		expect(strike?.getAttribute("aria-pressed")).toBe("false");
		strike?.click();
		expect(onChange).toHaveBeenCalledWith(true, true);
	});

	it("keeps an existing custom picker compact until requested and validates hex beside it", () => {
		const host = document.createElement("div");
		const onSelect = vi.fn();
		const controls = new AppearanceControlRenderer(toolkit());
		controls.renderColorControls(host, {
			selected: { kind: "custom", hex: "#C8C8C8", strength: 100 },
			defaultStrength: 100,
			onSelect,
		});
		const trigger = host.querySelector<HTMLButtonElement>(".ft-custom-trigger")!;
		const popover = host.querySelector<HTMLElement>(".ft-custom-popover")!;
		expect(popover.hidden).toBe(true);
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		trigger.click();
		expect(popover.hidden).toBe(false);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		const field = host.querySelector<HTMLInputElement>("input[type=text]")!;
		field.value = "nope";
		field.dispatchEvent(new Event("input"));
		expect(field.getAttribute("aria-invalid")).toBe("true");
		const errorId = field.getAttribute("aria-describedby");
		expect(errorId).toBeTruthy();
		expect(host.querySelector(`[id="${errorId}"]`)?.textContent).toContain("hex color");
		expect(host.querySelector(".ft-field-error")?.classList.contains("is-visible")).toBe(true);
		controls.dispose();
	});

	it("keeps custom color active when strength changes after a palette selection", () => {
		const host = document.createElement("div");
		const onSelect = vi.fn();
		new AppearanceControlRenderer(toolkit()).renderColorControls(host, {
			selected: { kind: "preset", slot: 2, strength: 40 },
			defaultStrength: 100,
			onSelect,
		});
		host.querySelector<HTMLButtonElement>(".ft-custom-trigger")!.click();
		const field = host.querySelector<HTMLInputElement>("input[type=text]")!;
		field.value = "#123456";
		field.dispatchEvent(new Event("input"));
		expect(host.querySelector(".ft-swatch.is-selected")).toBeNull();
		const slider = host.querySelector<HTMLInputElement>("input[type=range]")!;
		slider.value = "50";
		slider.dispatchEvent(new Event("input"));
		expect(onSelect).toHaveBeenLastCalledWith({ kind: "custom", hex: "#123456", strength: 50 }, false);
	});

});

it("keeps the current slider strength when a later color is selected", () => {
	installDomHelpers(); const host = document.createElement("div"); const onSelect = vi.fn();
	new AppearanceControlRenderer(toolkit()).renderColorControls(host, { selected: { kind: "preset", slot: 0 }, defaultStrength: 12, includeWhite: true, onSelect });
	const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!; slider.value = "74"; slider.dispatchEvent(new Event("input"));
	expect(host.querySelector<HTMLButtonElement>('.ft-color-strength__reset')!.disabled).toBe(false);
	host.querySelector<HTMLButtonElement>('button[aria-label="White"]')!.click();
	expect(onSelect.mock.calls.at(-1)![0]).toEqual({ kind: "custom", hex: "#FFFFFF", strength: 74 });
});
it("Escape closes the picker, restores focus, and cannot close its parent modal", () => {
	installDomHelpers(); const host = document.createElement("div"); document.body.append(host); const parent = vi.fn(); host.addEventListener("keydown", parent);
	new AppearanceControlRenderer(toolkit()).renderColorControls(host, { selected: { kind: "custom", hex: "#ABCDEF" }, defaultStrength: 100, onSelect: vi.fn() });
	const trigger = host.querySelector<HTMLButtonElement>('.ft-custom-trigger')!; trigger.click();
	host.querySelector<HTMLInputElement>('input[type=text]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	expect(parent).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
});
