# Folder Toolkit

Folder Toolkit makes Obsidian's file explorer easier to scan and temporarily simplify. It combines independent folder and note colors, cascading folder styles, subtree borders, permanent hiding, and session-only folder focus.

<div align="center">
  <h3>Created by <a href="https://github.com/gabrielbacha">Gabriel Bacha</a></h3>
  <p>
    <a href="https://www.gabrielbacha.com/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=folder_toolkit_readme_header"><strong>Visit gabrielbacha.com</strong></a>
    &nbsp;·&nbsp;
    <a href="https://obsidian.md/plugins?search=Gabriel%20Bacha"><strong>Explore more Obsidian plugins</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/gabrielbacha/Obsidian-Folder-Toolkit/issues/new?template=feature_request.yml"><strong>Request a feature</strong></a>
  </p>
</div>

## Screenshots

![Folder Toolkit file explorer styling with cascading colors, subtree borders, and shading](Screenshot1.png)

## Features

- Independent text and background colors for folders and notes
- Conditional font and background colors plus bold and strikethrough styling by file or folder name, with exact, prefix, suffix, and contains matching
- Per-effect folder cascading with explicit inheritance blockers
- Rounded-box or vertical-rail borders around folder subtrees, with optional shaded interiors
- Alternating active-palette borders for direct subfolders
- Optional colored backgrounds or borders on open note tabs
- The same eight switchable palette templates as Bases Visuals, plus custom hex colors and adjustable color strength
- Permanent file and folder hiding with a searchable manager
- A temporary focused-folder view that presents any nested folder as the visible explorer root
- Segment-safe path updates when files and folders are renamed or deleted
- Multiple file-explorer panes, desktop, and mobile support
- Efficient differential explorer and tab updates that avoid rewriting unchanged DOM styles

## Usage

Right-click or long-press a file or folder and use the actions in Obsidian's plugin-action group:

- **Edit folder appearance…** or **Edit file appearance…** opens a unified text and background editor with bold, strikethrough, and one descendant-inheritance control for the complete text treatment. Cascaded backgrounds remain aligned to each indented explorer row, while folder borders and optional shading enclose their own subtree. Direct subfolders can receive alternating colors from the active palette. Draft changes preview directly in the file explorer; **Save** keeps them and **Cancel** restores the saved rule.
- **Hide file/folder** permanently removes the item from the explorer until hidden items are shown or the path is unhidden.
- **Focus this folder** temporarily hides unrelated branches. Use **Exit folder focus** from a visible folder or the command palette to restore the explorer.

Use **Folder Toolkit: Toggle hidden items** to reveal hidden paths. The settings tab contains the palette selector and a searchable manager for all appearance and hidden-path rules.

Set **Open note tabs** to **Colored background** or **Colored border** to carry each open note's effective cascaded colors into its workspace tab. Text rules color the tab title, while background rules independently color the tab surface or border.

Use **Conditional formatting** in settings to style items by name anywhere in the vault. Choose files, folders, or both; match an exact name or a name that starts with, ends with, or contains a pattern; then enable font color, background color, bold, or strikethrough in any combination. Font and background colors each have their own color and strength controls. Matching is case-insensitive, and exact or suffix matches work with or without a file extension. Direct item overrides take priority, and the last matching conditional rule wins independently for text color, background color, bold, and strikethrough. Muted font rules for `__system` folders, `__archive` file prefixes, and `_basefiles` folder suffixes are enabled by default.

When a file or folder is renamed or moved, saved rules follow the path and open tabs immediately resolve their appearance from the new folder hierarchy.

Folder focus lasts only for the current Obsidian session. Permanent hiding and appearance settings persist.

## Performance

Folder Toolkit updates explorer rows and open-note tabs only when their managed classes or colors actually change. Tab updates are driven by Obsidian workspace and vault events rather than observing every DOM mutation in the workspace, keeping typing and large file explorers responsive.

## Installation

### Community plugins

After approval, install **Folder Toolkit** from **Settings → Community plugins → Browse**.

### Manual installation

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<vault>/.obsidian/plugins/folder-toolkit/
```

Reload Obsidian and enable **Folder Toolkit**.

## Privacy

Folder Toolkit works entirely offline. It makes no network requests, collects no telemetry, and never modifies note content or frontmatter. Its stored data contains only vault-relative paths and visual preferences.

## Development

```bash
npm install
npm run check
```

## License and acknowledgements

Folder Toolkit is MIT licensed. Its independently implemented feature set was inspired by the MIT-licensed File Color and File Hider community plugins.

---

<div align="center">
  <h3>Created by <a href="https://github.com/gabrielbacha">Gabriel Bacha</a></h3>
  <p>
    <a href="https://www.gabrielbacha.com/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=folder_toolkit_readme_header"><strong>Visit gabrielbacha.com</strong></a>
    &nbsp;·&nbsp;
    <a href="https://obsidian.md/plugins?search=Gabriel%20Bacha"><strong>Explore more Obsidian plugins</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/gabrielbacha/Obsidian-Folder-Toolkit/issues/new?template=feature_request.yml"><strong>Request a feature</strong></a>
  </p>
</div>
