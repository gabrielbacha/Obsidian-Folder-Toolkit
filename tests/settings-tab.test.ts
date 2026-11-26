import { installDomHelpers } from "./dom-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Setting, TFolder, type SettingDefinition, type SettingDefinitionGroup, type SettingDefinitionItem, type SettingDefinitionList } from "obsidian";
import FolderToolkitPlugin from "../src/main";
import { ConditionalRuleModal } from "../src/ui/conditional-rule-modal";
import { ConfirmRemoveModal } from "../src/ui/confirm-remove-modal";
import { AppearanceModal } from "../src/ui/appearance-modal";
import { PresetNameModal } from "../src/ui/preset-name-modal";
import { FolderToolkitSettingTab } from "../src/ui/settings-tab";
import type { ConditionalFormatRule, FolderToolkitSettings } from "../src/types";

function rule(id: string, pattern: string, extra: Partial<ConditionalFormatRule> = {}): ConditionalFormatRule {
	return { id, target: "folder", match: "equals", pattern, fontEnabled: true, color: { kind: "custom", hex: "#C8C8C8", strength: 100 }, bold: false, strikethrough: false, ...extra };
}

function folder(path: string): TFolder {
	return Object.assign(new TFolder(), { path, name: path.split("/").at(-1) });
}

function harness(overrides: Partial<FolderToolkitSettings> = {}) {
	const settings: FolderToolkitSettings = {
		schemaVersion: 8, paletteTemplateId: "default", tabStyle: "both", tabStyleWhenOn: "both", savedPresets: [],
		appearanceRules: {}, conditionalFormats: [rule("one", "__system"), rule("two", "_basefiles", { match: "endsWith" })],
		hiddenPaths: [], showHiddenItems: false, nestedVaults: false, vaultMarker: "both", ...overrides,
	};
	const files: Array<{ path: string; name: string }> = [folder("__system"), { path: "Projects/Plan.md", name: "Plan.md" }];
	const toolkit = {
		addConditionalFormat: vi.fn<() => Promise<string>>(),
		reorderConditionalFormat: vi.fn().mockResolvedValue(undefined),
		removeConditionalFormat: vi.fn().mockResolvedValue(undefined),
		unhidePath: vi.fn().mockResolvedValue(undefined),
		setNestedVaults: vi.fn(async (value: boolean) => { settings.nestedVaults = value; }),
		setTabStyle: vi.fn().mockResolvedValue(undefined),
		setShowHiddenItems: vi.fn().mockResolvedValue(undefined),
	};
	const plugin = Object.assign(Object.create(FolderToolkitPlugin.prototype), {
		settings,
		manifest: { version: "1.9.0" },
		app: { vault: { getAllLoadedFiles: () => files, getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null } },
		missingAppearanceRoots: () => [],
		managedPathsRevision: () => "1",
		...toolkit,
	}) as FolderToolkitPlugin;
	const tab = new FolderToolkitSettingTab(plugin);
	const update = vi.fn();
	const refreshDomState = vi.fn();
	Object.assign(tab, { update, refreshDomState });
	const definitions = () => tab.getSettingDefinitions();
	const section = (heading: string) => definitions().find((item) => "heading" in item && item.heading === heading) as SettingDefinitionGroup & SettingDefinitionList;
	return { toolkit, tab, settings, files, update, refreshDomState, definitions, section };
}

/** Renders one definition the way Obsidian does: name and description first, then `render`. */
function renderItem(item: SettingDefinitionItem | undefined): Setting {
	const definition = item as SettingDefinition & { render: (setting: Setting) => void };
	const setting = new Setting(document.body);
	setting.setName(definition.name);
	if (typeof definition.desc === "string") setting.setDesc(definition.desc);
	definition.render(setting);
	return setting;
}

const extraButton = (setting: Setting, label: string) => setting.controlEl.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

describe("settings tab", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		installDomHelpers();
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
	});
	afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

	it("builds native groups and lists in order", () => {
		const { definitions } = harness();
		const items = definitions();
		expect(items.map((item) => ("heading" in item ? item.heading : undefined) ?? null)).toEqual(["Appearance", "Presets", "Name rules", "Styled items", null, "Hidden items", "Nested vaults", "About"]);
		expect(items.map((item) => ("type" in item ? item.type : null))).toEqual(["group", "list", "list", "list", "group", "list", "group", "group"]);
		expect((items[4] as SettingDefinitionGroup).visible).toBe(false);
		const about = (items[7] as SettingDefinitionGroup).items?.[0] as SettingDefinition;
		expect(about.name).toBe("Folder Toolkit 1.9.0");
		expect(about.desc).toBe("By Mindful Apps");
	});

	it("shows each name rule as a sentence with a styled sample and its match count", () => {
		const { section } = harness();
		const rules = section("Name rules");
		expect(rules.items?.map((item) => (item as SettingDefinition).name)).toEqual(["Folders named exactly “__system”", "Folders ending with “_basefiles”"]);
		const row = renderItem(rules.items?.[0]);
		const sample = row.descEl.querySelector(".ft-preview-tree--row .ft-live-preview__row");
		expect(sample?.textContent).toBe("__system");
		expect(sample?.classList.contains("ft-preview-has-text")).toBe(true);
		expect(row.descEl.querySelector(".ft-list-row__meta")?.textContent).toBe("1 match");
		expect(renderItem(rules.items?.[1]).descEl.querySelector(".ft-list-row__meta")?.textContent).toBe("No matches");
	});

	it("opens the rule editor from the row and from its edit button", () => {
		const open = vi.spyOn(ConditionalRuleModal.prototype, "open").mockImplementation(() => {});
		const row = renderItem(harness().section("Name rules").items?.[0]);
		extraButton(row, "Edit rule").click();
		row.nameEl.click();
		expect(open).toHaveBeenCalledTimes(2);
	});

	it("reorders, deletes after confirmation, and adds name rules", async () => {
		const { section, toolkit, settings, update } = harness();
		const open = vi.spyOn(ConditionalRuleModal.prototype, "open").mockImplementation(() => {});
		const confirm = vi.spyOn(ConfirmRemoveModal.prototype, "open").mockImplementation(() => {});
		const rules = section("Name rules");
		rules.onReorder?.(0, 1);
		expect(toolkit.reorderConditionalFormat).toHaveBeenCalledWith(0, 1);
		rules.onDelete?.(1);
		expect(confirm).toHaveBeenCalledOnce();
		expect(toolkit.removeConditionalFormat).not.toHaveBeenCalled();

		toolkit.addConditionalFormat.mockImplementation(async () => { settings.conditionalFormats.push(rule("new", "")); return "new"; });
		rules.addItem?.action(document.createElement("div"));
		await Promise.resolve(); await Promise.resolve();
		expect(update).toHaveBeenCalled();
		expect(open).toHaveBeenCalledOnce();
		expect(section("Name rules").items?.map((item) => (item as SettingDefinition).name).at(-1)).toBe("Folders with no name yet");
	});

	it("lists styled items in their own style, searchable by path", () => {
		const { section } = harness({ appearanceRules: { "Projects/Plan.md": { text: { color: { kind: "preset", slot: 2 }, bold: true, strikethrough: false, cascade: false } }, __system: { tabs: false } } });
		const list = section("Styled items");
		expect(list.items?.map((item) => (item as SettingDefinition).name)).toEqual(["Projects/Plan.md", "__system"]);
		expect(list.search?.match(list.items?.[0] as SettingDefinition, "plan")).toBe(true);
		expect(list.search?.match(list.items?.[1] as SettingDefinition, "plan")).toBe(false);
		const row = renderItem(list.items?.[0]);
		const sample = row.nameEl.querySelector(".ft-live-preview__row");
		expect(sample?.textContent).toBe("Plan");
		expect(sample?.classList.contains("ft-preview-is-bold")).toBe(true);
		expect(row.descEl.textContent).toBe("Projects");
		const edit = vi.spyOn(AppearanceModal.prototype, "open").mockImplementation(() => {});
		extraButton(row, "Edit appearance").click();
		expect(edit).toHaveBeenCalledOnce();
		const confirm = vi.spyOn(ConfirmRemoveModal.prototype, "open").mockImplementation(() => {});
		list.onDelete?.(0);
		expect(confirm).toHaveBeenCalledOnce();
	});

	it("shows hidden items with an unhide button under the reveal switch", async () => {
		const empty = harness().section("Hidden items");
		expect((empty.items?.[0] as SettingDefinition).desc).toContain("Nothing is hidden yet");
		const { section, toolkit, update } = harness({ hiddenPaths: ["__system"] });
		const list = section("Hidden items");
		expect(list.items).toHaveLength(2);
		const row = renderItem(list.items?.[1]);
		expect(row.nameEl.textContent).toBe("__system");
		expect(row.descEl.textContent).toBe("Folder");
		extraButton(row, "Unhide").click();
		await Promise.resolve();
		expect(toolkit.unhidePath).toHaveBeenCalledWith("__system");
		expect(update).toHaveBeenCalled();
	});

	it("shows the vault marker only while nested vaults are on", async () => {
		const { section, refreshDomState } = harness();
		const group = section("Nested vaults");
		const marker = group.items?.[1] as SettingDefinition & { visible: () => boolean };
		expect(marker.visible()).toBe(false);
		const toggle = renderItem(group.items?.[0]).controlEl.querySelector<HTMLElement>(".checkbox-container")!;
		toggle.click();
		await Promise.resolve(); await Promise.resolve();
		expect(marker.visible()).toBe(true);
		expect(refreshDomState).toHaveBeenCalled();
	});

	it("shows presets with a styled sample, rename and delete", () => {
		const { section } = harness({ savedPresets: [{ id: "p1", name: "Review", rule: { text: { color: { kind: "preset", slot: 1 }, bold: true, strikethrough: false, cascade: false } } }] });
		const list = section("Presets");
		const row = renderItem(list.items?.[0]);
		expect(row.nameEl.textContent).toBe("Review");
		const sample = row.descEl.querySelector(".ft-live-preview__row");
		expect(sample?.textContent).toBe("Example folder");
		expect(sample?.classList.contains("ft-preview-has-text")).toBe(true);
		const rename = vi.spyOn(PresetNameModal.prototype, "open").mockImplementation(() => {});
		extraButton(row, "Rename").click();
		expect(rename).toHaveBeenCalledOnce();
		const confirm = vi.spyOn(ConfirmRemoveModal.prototype, "open").mockImplementation(() => {});
		list.onDelete?.(0);
		expect(confirm).toHaveBeenCalledOnce();
	});

	it("scrolls to the name rules once they are on screen", () => {
		const { tab } = harness();
		const scroll = vi.fn();
		HTMLElement.prototype.scrollIntoView = scroll;
		let frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
		tab.revealConditionalFormats();
		const run = () => { const pending = frames; frames = []; for (const frame of pending) frame(0); };
		run();
		expect(scroll).not.toHaveBeenCalled();
		tab.containerEl.createDiv("ft-name-rules");
		run();
		expect(scroll).toHaveBeenCalledOnce();
	});
});
