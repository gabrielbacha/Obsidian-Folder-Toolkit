import assert from 'node:assert/strict';
import { launchObsidian } from './obsidian-harness.mjs';

const files = { 'Fixture.md': 'Generated native layout fixture.\n' };
for (let index = 0; index < 200; index++) files['Wide/Folder ' + String(index).padStart(3, '0') + '/Note.md'] = 'Generated wide note.\n';
const deep = ['Deep', ...Array.from({ length: 20 }, (_, index) => 'Level ' + index)];
files[deep.join('/') + '/Note.md'] = 'Generated deep note.\n';
const host = await launchObsidian({ files, pluginFolder: 'folder-toolkit-dev' });
try {
	const { page } = host;
	await page.evaluate(async () => {
		const plugin = window.app.plugins.getPlugin('folder-toolkit');
		await plugin.setAppearance('Wide', {
			text: { color: { kind: 'custom', hex: '#123456' }, bold: true, strikethrough: false, cascade: false },
			background: { choice: { kind: 'custom', hex: '#789ABC' }, cascade: true },
			border: { style: 'box', color: { kind: 'custom', hex: '#56789A' }, thickness: 'thin' },
		});
		await plugin.openAppearanceEditor('Wide');
	});
	let ui;
	for (let attempt = 0; attempt < 100 && !ui; attempt++) {
		for (const candidate of page.context().pages()) if (await candidate.locator('.ft-appearance-modal').count()) { ui = candidate; break; }
		if (!ui) await new Promise(resolve => setTimeout(resolve, 100));
	}
	if (!ui) throw new Error('Owned layout dialog did not appear.');
	if (ui !== page) ui.on('pageerror', error => host.errors.push(error.message));
	const modal = ui.locator('.ft-appearance-modal');
	await modal.waitFor();
	await ui.emulateMedia({ reducedMotion: 'reduce' });
	for (const mode of ['light', 'dark']) {
		await ui.evaluate(mode => {
			document.body.classList.toggle('theme-dark', mode === 'dark');
			document.body.classList.toggle('theme-light', mode === 'light');
		}, mode);
		await ui.screenshot({ path: '/private/tmp/foldertoolkit-native-' + mode + '.png', fullPage: true });
	}
	await ui.setViewportSize({ width: 500, height: 900 });
	await ui.screenshot({ path: '/private/tmp/foldertoolkit-native-narrow.png', fullPage: true });
	const width = await ui.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
	assert.ok(width.scroll <= width.width, JSON.stringify(width));
	await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
	console.log('PASS native default-theme light/dark and 500px layout; reduced-motion controls stay reachable.');

	const future = await page.evaluate(async () => {
		const plugin = window.app.plugins.getPlugin('folder-toolkit'), adapter = window.app.vault.adapter;
		const path = window.app.plugins.manifests['folder-toolkit'].dir + '/data.json', original = await adapter.read(path);
		const candidate = JSON.stringify({ schemaVersion: 99, future: 'owned synthetic data' });
		await adapter.write(path, candidate); await plugin.onExternalSettingsChange();
		let refused = false;
		try { await plugin.setAppearance('Future', { text: { bold: true, strikethrough: false, cascade: false } }); } catch { refused = true; }
		const retained = await adapter.read(path);
		await adapter.write(path, original); await plugin.onExternalSettingsChange();
		return { refused, retained, candidate };
	});
	assert.ok(future.refused); assert.equal(future.retained, future.candidate);
	console.log('PASS future schema remains unchanged and read-only in the native host.');

	for (const folder of ['Wide', ...deep.map((_entry, index) => deep.slice(0, index + 1).join('/'))]) {
		await page.waitForFunction(folder => Boolean(document.querySelector('[data-path=' + JSON.stringify(folder) + ']')), folder).catch(error => { throw new Error('Fixture expansion did not reach ' + folder, { cause: error }); });
		await page.evaluate(folder => {
			const title = document.querySelector('[data-path=' + JSON.stringify(folder) + ']');
			const row = title?.closest('.nav-folder');
			const indicator = row?.querySelector(':scope > .nav-folder-title .collapse-icon, :scope > .tree-item-self .collapse-icon');
			if (!indicator) throw new Error('Fixture folder has no public collapse indicator: ' + folder + ' ' + (title?.outerHTML?.slice(0, 1200) ?? 'missing') + ' ' + (row?.outerHTML?.slice(0, 1200) ?? 'no row'));
			indicator.click();
		}, folder);
	}
	const metrics = await page.evaluate(async () => {
		const plugin = window.app.plugins.getPlugin('folder-toolkit');
		await plugin.setTabStyle('background');
		for (let index = 0; index < 30; index++) {
			const leaf = window.app.workspace.getLeaf('tab');
			await leaf.openFile(window.app.vault.getAbstractFileByPath('Wide/Folder ' + String(index).padStart(3, '0') + '/Note.md'));
		}
		plugin.explorer.syncLeaves();
		const sample = action => {
			const values = [];
			for (let index = 0; index < 20; index++) { const start = performance.now(); action(); values.push(performance.now() - start); }
			values.sort((a,b) => a-b); return { medianMs: values[10], p95Ms: values[18] };
		};
		return {
			fixtureWideFolders: 200, fixtureDepth: 20, fixtureTabs: 30,
			explorerRows: new Set([...document.querySelectorAll('.nav-files-container [data-path]')].map(element => element.closest('.nav-folder,.nav-file')).filter(Boolean)).size,
			tabHeaders: document.querySelectorAll('.workspace-tab-header').length,
			explorer: sample(() => plugin.explorer.reconcile()), tabs: sample(() => plugin.tabs.reconcile()),
		};
	});
	console.log('Native current-state measurements:', JSON.stringify(metrics));
	const popout = await page.evaluate(async () => {
		const app = window.app, plugin = app.plugins.getPlugin('folder-toolkit');
		await plugin.setAppearance('Fixture.md', { text: { color: { kind: 'custom', hex: '#123456' }, bold: true, strikethrough: false, cascade: false }, background: { choice: { kind: 'custom', hex: '#789ABC' }, cascade: false } });
		const leaf = app.workspace.openPopoutLeaf({ x: -2000, y: -2000, size: { width: 800, height: 600 } });
		window.fixturePopoutLeaf = leaf;
		await leaf.openFile(app.vault.getAbstractFileByPath('Fixture.md'));
		await plugin.setTabStyle('border'); plugin.tabs.reconcile();
		const header = leaf.view.containerEl.closest('.workspace-tabs').querySelector('.workspace-tab-header');
		window.fixturePopoutHeader = header;
		return { outsideMain: header.ownerDocument !== document, classes: [...header.classList].filter(value => value.startsWith('ft-')) };
	});
	assert.ok(popout.outsideMain); assert.ok(popout.classes.length);
	const empty = () => page.evaluate(() => ({
		classes: [...window.fixturePopoutHeader.classList].filter(value => value.startsWith('ft-')),
		styles: [...window.fixturePopoutHeader.style].filter(value => value.startsWith('--ft-')),
	}));
	await page.evaluate(async () => { const plugin = window.app.plugins.getPlugin('folder-toolkit'); await plugin.setTabStyle('off'); plugin.tabs.reconcile(); });
	assert.deepEqual(await empty(), { classes: [], styles: [] });
	await page.evaluate(async () => {
		const plugin = window.app.plugins.getPlugin('folder-toolkit');
		await plugin.setTabStyle('border'); plugin.tabs.reconcile();
		await window.app.plugins.disablePlugin('folder-toolkit');
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	assert.deepEqual(await empty(), { classes: [], styles: [] });
	console.log('PASS native popout cleanup on mode off and unload.');
	await page.evaluate(() => window.fixturePopoutLeaf.detach());
	assert.deepEqual(host.errors, []);
} finally { await host.close(); }
