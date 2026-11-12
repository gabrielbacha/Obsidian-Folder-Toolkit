import { installDomHelpers } from "./dom-helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFolder } from "obsidian";
import type FolderToolkitPlugin from "../src/main";
import type { AppearanceRule, FolderToolkitSettings } from "../src/types";
import { AppearanceModal, type AppearanceTarget } from "../src/ui/appearance-modal";


function harness(folder: boolean, appearanceRules: FolderToolkitSettings["appearanceRules"] = {}, siblingPaths: string[] = [], target?: AppearanceTarget) {
	const settings: FolderToolkitSettings = {
		schemaVersion: 6,
		paletteTemplateId: "default",
		tabStyle: "off",
		appearanceRules,
		conditionalFormats: [],
		hiddenPaths: [],
		showHiddenItems: false,
		nestedVaults: false,
		vaultMarker: 'off',
	};
	const previewAppearance = vi.fn();
	const currentFolder = Object.assign(new TFolder(), { path: "Folder", name: "Folder" });
	const siblings = siblingPaths.map((path) => Object.assign(new TFolder(), { path, name: path }));
	const parent = Object.assign(new TFolder(), { path: "", name: "", children: [currentFolder, ...siblings] });
	Object.assign(currentFolder, { parent });
	for (const sibling of siblings) Object.assign(sibling, { parent });
	const setAppearance = vi.fn().mockResolvedValue(undefined);
	const toolkit = {
		app: { vault: { getAbstractFileByPath: () => folder ? currentFolder : {} } },
		settings,
		previewAppearance,
		clearAppearancePreview: vi.fn(),
		setAppearance,
	} as unknown as FolderToolkitPlugin;
	const modal = new AppearanceModal(toolkit, folder ? "Folder" : "note.md", undefined, target);
	modal.onOpen();
	const latestDraft = (): AppearanceRule => previewAppearance.mock.calls.at(-1)?.[1] as AppearanceRule;
	return { toolkit, currentFolder, modal, latestDraft, setAppearance, previewAppearance };
}

describe("AppearanceModal immediate controls", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		installDomHelpers();
	});

	it("uses a compact file layout and applies text options without an enable gate", () => {
		const { modal, latestDraft } = harness(false);
		expect(modal.contentEl.classList.contains("ft-appearance-modal--file")).toBe(true);
		expect(modal.contentEl.textContent).not.toContain("Override text");
		const headings = [...modal.contentEl.querySelectorAll(".ft-color-card h3")].map((heading) => heading.textContent);
		expect(headings).toEqual(["Background", "Border", "Text"]);
		const textCard = modal.contentEl.querySelector<HTMLElement>(".ft-color-card--text")!;
		expect([...textCard.querySelectorAll<HTMLButtonElement>(".ft-swatch")].every((button) => !button.disabled)).toBe(true);
		textCard.querySelector<HTMLButtonElement>("button[aria-label=Bold]")!.click();
		expect(latestDraft().text?.bold).toBe(true);

		modal.contentEl.querySelector<HTMLElement>(".ft-color-card--text")!.querySelector<HTMLButtonElement>(".ft-swatch")!.click();
		expect(latestDraft().text?.color).toEqual({ kind: "preset", slot: 0 });
		const refreshedText = modal.contentEl.querySelector<HTMLElement>(".ft-color-card--text")!;
		[...refreshedText.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Clear color")!.click();
		expect(latestDraft().text?.color).toBeUndefined();
		expect(latestDraft().text?.bold).toBe(true);
		modal.onClose();
	});

	it("applies, clears, and explicitly blocks a file border", () => {
		const { modal, latestDraft } = harness(false);
		const borderCard = () => [...modal.contentEl.querySelectorAll<HTMLElement>(".ft-color-card")].find((card) => card.querySelector("h3")?.textContent === "Border")!;
		[...borderCard().querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Vertical rail")!.click();
		expect(latestDraft().border).toMatchObject({ style: "rail", color: { kind: "preset", slot: 0 }, thickness: "thin" });
		expect(modal.contentEl.querySelector(".ft-preview-tree .nav-file.ft-preview-border-rail")).not.toBeNull();
		[...borderCard().querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Clear border")!.click();
		expect(latestDraft().border).toBeUndefined();
		[...borderCard().querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "No border")!.click();
		expect(latestDraft().border).toEqual({ kind: "none" });
		modal.onClose();
	});

	it("keeps descendant controls active and activates folder treatments on first click", () => {
		const { modal, latestDraft } = harness(true);
		const cascades = [...modal.contentEl.querySelectorAll<HTMLInputElement>(".ft-cascade-control input")];
		expect(cascades).toHaveLength(2);
		expect(cascades.every((checkbox) => !checkbox.disabled)).toBe(true);
		expect(cascades.every((checkbox) => !checkbox.checked)).toBe(true);
		cascades[0].checked = false;
		cascades[0].dispatchEvent(new Event("change"));
		modal.contentEl.querySelector<HTMLElement>(".ft-color-card--background")!.querySelector<HTMLButtonElement>(".ft-swatch")!.click();
		expect(latestDraft().background?.cascade).toBe(false);

		const borderCard = [...modal.contentEl.querySelectorAll<HTMLElement>(".ft-color-card")].find((card) => card.querySelector("h3")?.textContent === "Border")!;
		[...borderCard.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Rounded box")!.click();
		expect(latestDraft().border).toMatchObject({ style: "box", color: { kind: "preset", slot: 0 } });
		modal.onClose();
	});

	it("applies folder presets to the folder row and selects the next unused sibling color", () => {
		const { modal, latestDraft } = harness(true, {
			"Sibling A": { background: { choice: { kind: "preset", slot: 0 }, cascade: false } },
			"Sibling B": { text: { color: { kind: "preset", slot: 1 }, bold: false, strikethrough: false, cascade: false } },
		}, ["Sibling A", "Sibling B"]);
		const groups = [...modal.contentEl.querySelectorAll<HTMLElement>(".ft-appearance-presets__group")];
		expect(groups.map((group) => group.querySelector("h4")?.textContent)).toEqual(["This folder", "Subfolders"]);
		const labelsOf = (group: HTMLElement) => [...group.querySelectorAll(".ft-appearance-preset__label")].map((label) => label.textContent);
		expect(labelsOf(groups[0])).toEqual([
			"Grouping folder", "Shaded box", "Section rail", "Minimal label", "Highlight", "Attention", "Muted", "Archived",
		]);
		expect(labelsOf(groups[1])).toEqual([
			"Folder only", "Inherit colors", "Subfolder rails", "Shaded rails", "Subfolder boxes", "Shaded boxes",
		]);
		groups[0].querySelector<HTMLButtonElement>(".ft-appearance-preset")!.click();
		expect(latestDraft().background).toEqual({ choice: { kind: "preset", slot: 2, strength: 14 }, cascade: false });
		expect(latestDraft().border).toMatchObject({ style: "box", color: { kind: "preset", slot: 2 } });
		expect(latestDraft().descendants).toBeUndefined();

		[...modal.contentEl.querySelectorAll("button")].find((button) => button.textContent === "Reset to inherited")!.click();
		expect(latestDraft()).toEqual({});
		expect([...modal.contentEl.querySelectorAll<HTMLInputElement>(".ft-cascade-control input")].every((checkbox) => !checkbox.checked)).toBe(true);
		modal.onClose();
	});

	it("keeps folder-row and subfolder presets independent of each other", () => {
		const { modal, latestDraft } = harness(true);
		const presetByLabel = (label: string) => [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".ft-appearance-preset")]
			.find((button) => button.querySelector(".ft-appearance-preset__label")?.textContent === label)!;

		presetByLabel("Shaded rails").click();
		expect(latestDraft()).toEqual({ descendants: { enabled: true, style: "rail", thickness: "thin", shading: true } });
		presetByLabel("Muted").click();
		expect(latestDraft()).toEqual({
			background: { choice: { kind: "custom", hex: "#A8ADB5", strength: 16 }, cascade: false },
			descendants: { enabled: true, style: "rail", thickness: "thin", shading: true },
		});

		presetByLabel("Inherit colors").click();
		expect(latestDraft()).toEqual({ background: { choice: { kind: "custom", hex: "#A8ADB5", strength: 16 }, cascade: true } });
		expect([...modal.contentEl.querySelectorAll<HTMLInputElement>(".ft-cascade-control input")].every((checkbox) => checkbox.checked)).toBe(true);
		presetByLabel("Archived").click();
		expect(latestDraft()).toEqual({
			text: { color: { kind: "custom", hex: "#A8ADB5", strength: 100 }, bold: false, strikethrough: false, cascade: true },
		});
		modal.onClose();
	});

	it("keeps cascade choices from a subfolder preset when the folder has no colors yet", () => {
		const { modal, latestDraft } = harness(true);
		const presetByLabel = (label: string) => [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".ft-appearance-preset")]
			.find((button) => button.querySelector(".ft-appearance-preset__label")?.textContent === label)!;
		presetByLabel("Inherit colors").click();
		expect(latestDraft()).toEqual({});
		presetByLabel("Highlight").click();
		expect(latestDraft().background?.cascade).toBe(true);
		expect(latestDraft().text?.cascade).toBe(true);
		modal.onClose();
	});

	it("places collapsed presets after the controls and keeps their open state across rerenders", () => {
		const { modal } = harness(true);
		const children = [...modal.contentEl.children];
		const presets = modal.contentEl.querySelector<HTMLDetailsElement>("details.ft-appearance-presets")!;
		expect(presets.open).toBe(false);
		expect(children.indexOf(presets)).toBeGreaterThan(children.indexOf(modal.contentEl.querySelector(".ft-appearance-layout")!));
		expect(children.at(-1)?.classList.contains("ft-modal-footer")).toBe(true);
		expect(modal.contentEl.querySelector(".ft-modal-footer .ft-field-error")).not.toBeNull();
		presets.open = true;
		presets.dispatchEvent(new Event("toggle"));
		presets.querySelector<HTMLButtonElement>(".ft-appearance-preset")!.click();
		expect(modal.contentEl.querySelector<HTMLDetailsElement>("details.ft-appearance-presets")?.open).toBe(true);
		modal.onClose();
	});

	it("preserves descendant settings already saved on a folder", () => {
		const { modal } = harness(true, {
			Folder: {
				background: { choice: { kind: "preset", slot: 0 }, cascade: true },
				text: { color: { kind: "preset", slot: 0 }, bold: false, strikethrough: false, cascade: true },
			},
		});
		expect([...modal.contentEl.querySelectorAll<HTMLInputElement>(".ft-cascade-control input")].every((checkbox) => checkbox.checked)).toBe(true);
		modal.onClose();
	});

	it("offers file presets that replace the draft with single-row styling", () => {
		const { modal, latestDraft } = harness(false);
		const presetButtons = [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".ft-appearance-preset")];
		expect(presetButtons.map((button) => button.querySelector(".ft-appearance-preset__label")?.textContent)).toEqual([
			"Important", "Index note", "Tinted", "Highlight", "Attention", "Draft", "Done", "Muted",
		]);
		presetButtons[0].click();
		expect(latestDraft()).toEqual({
			background: { choice: { kind: "preset", slot: 0, strength: 14 }, cascade: false },
			text: { color: { kind: "preset", slot: 0, strength: 100 }, bold: true, strikethrough: false, cascade: false },
		});
		expect(modal.contentEl.querySelectorAll(".ft-cascade-control").length).toBe(0);
		const done = [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".ft-appearance-preset")].find((button) => button.querySelector(".ft-appearance-preset__label")?.textContent === "Done")!;
		done.click();
		expect(latestDraft()).toEqual({
			text: { color: { kind: "custom", hex: "#A8ADB5", strength: 100 }, bold: false, strikethrough: true, cascade: false },
		});
		modal.onClose();
	});

	it("renders a live styled sample inside every preset button", () => {
		const folderHarness = harness(true);
		const folderButtons = [...folderHarness.modal.contentEl.querySelectorAll<HTMLButtonElement>(".ft-appearance-preset")];
		const sampleOf = (buttons: HTMLButtonElement[], label: string) => buttons
			.find((button) => button.querySelector(".ft-appearance-preset__label")?.textContent === label)!
			.querySelector<HTMLElement>(".ft-appearance-preset__sample")!;
		for (const button of folderButtons) {
			expect(button.querySelector(".ft-appearance-preset__sample .ft-preview-tree--compact")).not.toBeNull();
		}
		const grouping = sampleOf(folderButtons, "Grouping folder");
		const groupingRoot = grouping.querySelector<HTMLElement>(".nav-folder")!;
		expect(groupingRoot.classList.contains("ft-preview-border-box")).toBe(true);
		expect(grouping.querySelectorAll(".nav-folder.ft-preview-border-rail").length).toBe(0);
		expect(sampleOf(folderButtons, "Muted").querySelector(".nav-folder")!.classList.contains("ft-preview-background-cascade")).toBe(false);
		expect(sampleOf(folderButtons, "Archived").querySelectorAll(".ft-preview-has-text").length).toBe(1);
		expect(sampleOf(folderButtons, "Subfolder rails").querySelectorAll(".nav-folder.ft-preview-border-rail").length).toBe(2);
		expect(sampleOf(folderButtons, "Shaded boxes").querySelectorAll(".nav-folder.ft-preview-border-box.ft-preview-border-shaded").length).toBe(2);
		folderHarness.modal.onClose();

		const fileHarness = harness(false);
		const fileButtons = [...fileHarness.modal.contentEl.querySelectorAll<HTMLButtonElement>(".ft-appearance-preset")];
		const doneRows = sampleOf(fileButtons, "Done").querySelectorAll<HTMLElement>(".nav-file");
		expect(doneRows.length).toBe(2);
		expect(doneRows[0].classList.contains("ft-preview-is-strikethrough")).toBe(false);
		expect(doneRows[1].classList.contains("ft-preview-is-strikethrough")).toBe(true);
		expect(sampleOf(fileButtons, "Index note").querySelectorAll(".nav-file.ft-preview-border-box").length).toBe(1);
		fileHarness.modal.onClose();
	});
});

describe("AppearanceModal for a nested vault", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		installDomHelpers();
	});

	it("edits the rule stored in the owning vault with that vault's palette and saves it there", async () => {
		const owner = { root: "Vaults/Inner", relativePath: "Folder" };
		const stored: AppearanceRule = { text: { bold: true, strikethrough: false, cascade: false } };
		const { modal, setAppearance, previewAppearance } = harness(true, {}, [], { owner, paletteTemplateId: "ember", rule: stored });
		expect(modal.contentEl.textContent).toContain("Saved in the settings of the “Inner” vault.");
		expect(modal.contentEl.querySelector(".ft-palette-label")?.textContent).toContain("Ember");
		const save = [...modal.contentEl.querySelectorAll("button")].find((button) => button.textContent === "Save");
		save?.click();
		await Promise.resolve();
		expect(setAppearance).toHaveBeenCalledWith("Folder", stored, owner);
		expect(previewAppearance).toHaveBeenLastCalledWith("Folder", stored, "ember");
	});
});

describe("appearance save and focus ownership", () => {
	beforeEach(() => { document.body.replaceChildren(); installDomHelpers(); });
	it("retains newer edits and disables every rebuilt Save while an earlier draft is publishing", async () => {
		const h = harness(true); document.body.append(h.modal.contentEl);
		let complete!: () => void; h.setAppearance.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
		const close = vi.spyOn(h.modal, "close");
		h.modal.contentEl.querySelector<HTMLButtonElement>(".ft-modal-footer .mod-cta")!.click();
		await Promise.resolve();
		h.modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!.click();
		expect(h.modal.contentEl.querySelector<HTMLButtonElement>(".ft-modal-footer .mod-cta")!.disabled).toBe(true);
		expect(h.setAppearance).toHaveBeenCalledWith("Folder", {});
		complete(); await Promise.resolve(); await Promise.resolve();
		expect(close).not.toHaveBeenCalled(); expect(h.latestDraft().text?.bold).toBe(true);
		expect(h.modal.contentEl.querySelector<HTMLButtonElement>(".ft-modal-footer .mod-cta")!.disabled).toBe(false);
	});
	it("rejects a save after the original folder was renamed", async () => {
		const h = harness(true); h.currentFolder.path = "Moved";
		h.modal.contentEl.querySelector<HTMLButtonElement>(".ft-modal-footer .mod-cta")!.click(); await Promise.resolve();
		expect(h.setAppearance).not.toHaveBeenCalled(); expect(h.modal.contentEl.textContent).toContain("Reopen");
	});
	it('keeps the complete copied rule and descendant request after a failed save', async () => {
		const own: AppearanceRule = { text: { bold: true, strikethrough: true, cascade: true }, background: { choice: { kind: 'custom', hex: '#123456', strength: 44 }, cascade: true }, descendants: { enabled: true, style: 'rail', thickness: 'thick', shading: true } };
		const child: AppearanceRule = { text: { bold: false, strikethrough: false, cascade: false } };
		const h = harness(true); const close = vi.spyOn(h.modal, 'close');
		const pasteDescendantAppearance = vi.fn().mockRejectedValueOnce(new Error('descendant write failed')).mockResolvedValue({ saved: 1, skipped: 0 });
		Object.assign(h.toolkit, { readCopiedAppearance: vi.fn().mockResolvedValue({ '.': own, 'Child.md': child }), pasteDescendantAppearance });
		h.modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Paste appearance"]')!.click();
		await Promise.resolve(); await Promise.resolve(); expect(h.latestDraft()).toEqual(own);
		h.modal.contentEl.querySelector<HTMLButtonElement>('.ft-modal-footer .mod-cta')!.click();
		await vi.waitFor(() => expect(h.modal.contentEl.textContent).toContain('descendant write failed'));
		expect(close).not.toHaveBeenCalled(); expect(h.latestDraft()).toEqual(own);
		expect(pasteDescendantAppearance).toHaveBeenLastCalledWith('Folder', { 'Child.md': child });
		h.modal.contentEl.querySelector<HTMLButtonElement>('.ft-modal-footer .mod-cta')!.click();
		await vi.waitFor(() => expect(close).toHaveBeenCalled());
		expect(pasteDescendantAppearance).toHaveBeenNthCalledWith(2, 'Folder', { 'Child.md': child });
		expect(h.setAppearance).toHaveBeenLastCalledWith('Folder', own);
	});
	it("keeps logical keyboard focus after a full control rebuild and retains preset DOM", () => {
		const h = harness(true); document.body.append(h.modal.contentEl);
		const preset = h.modal.contentEl.querySelector(".ft-appearance-preset");
		const bold = h.modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!; bold.focus(); bold.click();
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Bold");
		expect(h.modal.contentEl.querySelector(".ft-appearance-preset")).toBe(preset);
	});
	it("shows inherited typography and saves an explicit false when it is turned off", () => {
		const h = harness(true, { Parent: { text: { bold: true, strikethrough: true, cascade: true } } });
		// This fixture folder is not under Parent; exercise its real controlling path through the saved direct rule.
		h.toolkit.settings.appearanceRules.Folder = { text: { bold: true, strikethrough: true, cascade: false } };
		h.modal.close();
		const modal = new AppearanceModal(h.toolkit, "Folder"); modal.onOpen();
		modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!.click();
		modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Strikethrough"]')!.click();
		const draft = h.previewAppearance.mock.calls.at(-1)![1] as AppearanceRule;
		expect(draft.text?.bold).toBe(false); expect(draft.text?.strikethrough).toBe(false);
	});
});

it("uses a local disposal field without overriding the native Modal closed flag", () => {
	installDomHelpers(); const h = harness(true); h.modal.close();
	const modal = new AppearanceModal(h.toolkit, "Folder"); modal.open();
	expect(modal.contentEl.classList.contains("ft-appearance-modal")).toBe(true);
});


it('returns typography to inheritance without removing direct color or other effects', () => {
	installDomHelpers();
	const h = harness(true, { Folder: { text: { color: { kind: 'custom', hex: '#123456' }, bold: true, strikethrough: true, cascade: false }, background: { choice: { kind: 'preset', slot: 2 }, cascade: true } } });
	[...h.modal.contentEl.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Use inherited typography')!.click();
	const draft = h.latestDraft();
	expect(draft.text?.color).toEqual({ kind: 'custom', hex: '#123456' });
	expect(draft.text?.inheritTypography).toBe(true); expect(draft.background?.choice).toEqual({ kind: 'preset', slot: 2 });
	h.modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!.click();
	expect(h.latestDraft().text?.inheritTypography).toBeUndefined();
});


it('keeps typography inherited when adding only a direct text color', () => {
	installDomHelpers(); const h = harness(true);
	h.modal.contentEl.querySelector<HTMLButtonElement>('.ft-color-card--text .ft-swatch')!.click();
	expect(h.latestDraft().text?.color?.kind).toBe('preset');
	expect(h.latestDraft().text?.inheritTypography).toBe(true);
});


it('does not restore a closed editor or its preview from a late clipboard paste', async () => {
	installDomHelpers(); const h = harness(true); let release!: (value: unknown) => void;
	Object.assign(h.toolkit, { readCopiedAppearance: () => new Promise(resolve => { release = resolve; }) });
	h.modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Paste appearance"]')!.click();
	h.modal.close(); const count = h.previewAppearance.mock.calls.length;
	release({ '.': { text: { bold: true, strikethrough: false, cascade: false } } }); await Promise.resolve(); await Promise.resolve();
	expect(h.modal.contentEl.childElementCount).toBe(0); expect(h.previewAppearance.mock.calls).toHaveLength(count);
});


it('accepts an unchanged controlling rule after its JSON keys are reordered', async () => {
	installDomHelpers(); const original = { text: { bold: true, strikethrough: false, cascade: false } };
	const h = harness(true, { Folder: original });
	Object.assign(h.toolkit, { appearanceTarget: async () => ({ owner: { relativePath: 'Folder', root: null }, paletteTemplateId: 'default', rule: { text: { cascade: false, strikethrough: false, bold: true } } }) });
	h.modal.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Strikethrough"]')!.click();
	[...h.modal.contentEl.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Save')!.click();
	await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
	expect(h.setAppearance).toHaveBeenCalledOnce();
});
