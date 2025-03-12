class DMScriptStudio
{
	static shellName = 'Script Studio';
	static shellIcon = 'script';
	static loaded = false;
	static instanceLoadFns = [];
	static #scripts;
	static #settings;
	static #sessions = {};

	static load(thenFn)
	{
		if (this.loaded) return thenFn();
		this.instanceLoadFns.push(thenFn);
		if (this.loaded === null) return;
		this.loaded = null;
		DS.cmd('readFile', { module: this.name }, (data) => {
			if (!('scripts' in data)) data.scripts = {};
			this.#scripts = new Map(Object.entries(data.scripts));
			if (!('settings' in data)) data.settings = {};
			const defaultSettings = {
				showLineNumbers: true
			};
			for (const key in defaultSettings) {
				if (!(key in data.settings)) data.settings[key] = defaultSettings[key];
			}
			this.#settings = data.settings;
			let savedScriptJSON = localStorage.getItem(`${this.name}.savedScript`);
			if (savedScriptJSON) {
				try {
					let savedScript = JSON.parse(savedScriptJSON);
					if (this.#scripts.has(savedScript.name)) {
						this.#scripts.set(savedScript.name, savedScript.contents);
					}
				} catch (error) {
					console.error('Unable to restore saved script.', error);
				}
				localStorage.removeItem(`${this.name}.savedScript`);
				this.save();
			}
			this.loaded = true;
			for (let instanceLoadFn of this.instanceLoadFns) instanceLoadFn();
			this.instanceLoadFns.length = 0;
		}, errorMsg => {
			alert(errorMsg);
		});
	}

	static save()
	{
		let data = {
			scripts: Object.fromEntries(this.#scripts),
			settings: this.#settings
		};
		DS.cmd('writeFile', { module: this.name, data: data }, () => {
			if (!this.activeInstance) return;
			let saveIndicator = this.activeInstance.saveIndicator;
			saveIndicator.setParams({
				tooltip: 'Last saved on ' + (new Intl.DateTimeFormat('sv-SV', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date))
			});
			saveIndicator.style.opacity = '1';
			let fadeAnimation = saveIndicator.animate({ opacity: 0.5 }, { duration: 5000 });
			fadeAnimation.addEventListener('finish', evt => saveIndicator.style.opacity = '0.5');
		}, errorMsg => {
			alert(errorMsg);
		});
	}

	state;
	#settingsDialog;
	listBox;
	#scriptCell;
	editor;
	#outputContainer;
	editorStatusCell;
	saveIndicator;
	#scriptViewButton;
	#outputViewButton;
	
	constructor(params)
	{
		// Instance events
		params.rootNode.addEventListener('show', this.show.bind(this));
		params.rootNode.addEventListener('hide', this.hide.bind(this));
		params.rootNode.addEventListener('quit', this.quit.bind(this));

		// Initial state
		let defaultState = {
			gridLayout: null,
			selectedScript: null
		};
		this.state = params.state || {};
		for (let key in defaultState) {
			if (!(key in this.state)) this.state[key] = defaultState[key];
		}

		// Settings dialog
		this.#settingsDialog = new DCDialog({ in: params.rootNode, title: 'Settings', icon: 'gear' });
		this.#settingsDialog.body.setStyles({ minWidth: '512px' });
		this.#settingsDialog.addEventListener('close', this.updateSettings.bind(this));
		let settingsGrid = new DCGrid({
			in: this.#settingsDialog.body,
			rows: ['1fr', 'auto'],
			cols: ['auto']
		});
		let [bodyCell, okCell] = settingsGrid.getCells();
		bodyCell.style.padding = '10px 0';
		let settingsView = new DCKeyValueView({ in: bodyCell });
		settingsView.addEventListener('complete', evt => this.#settingsDialog.close());
		settingsView.addItem({
			name: 'showLineNumbers',
			label: 'Show Line Numbers',
			type: 'boolean',
			onChange: value => this.editor.renderer.setShowGutter(value)
		});
		let settingsStatusBar = new DCStatusBar({ in: okCell, classes: ['border-top'] });
		settingsStatusBar.addItem({
			width: 'auto',
			classes: ['button'],
			text: 'OK',
			onClick: evt => this.#settingsDialog.close()
		});

		// Module grid
		const moduleGrid = new DCGrid({
			in: params.rootNode,
			cols: ['100%'],
			rows: ['auto', '1fr', 'auto']
		});
		const [toolCell, mainCell, statusCell] = moduleGrid.getCells();

		// ToolBar
		const toolBar = new DCToolBar({ in: toolCell });
		toolBar.addItem({
			icon: 'plus-circle',
			text: 'New Script',
			onClick: this.addScript.bind(this)
		});
		toolBar.addSeparator();
		toolBar.addItem({
			icon: 'gear',
			text: 'Settings...',
			onClick: evt => {
				settingsView.setData(this.constructor.#settings);
				this.#settingsDialog.open(this);
			}
		});
		toolBar.addItem({
			icon: 'play',
			text: 'Run Script',
			tooltip: 'Run Script (⌘↵)',
			onClick: () => this.runScript()
		});
		toolBar.addSeparator();
		this.#scriptViewButton = toolBar.addItem({
			icon: 'script',
			text: 'Script',
			choiceGroup: 'main-view',
			enabled: false,
			onClick: () => this.toggleOutputView(false)
		});
		this.#outputViewButton = toolBar.addItem({
			icon: 'app',
			text: 'Output',
			choiceGroup: 'main-view',
			enabled: false,
			onClick: () => this.toggleOutputView(true)
		});

		// Main grid
		const mainGrid = new DCGrid({
			in: mainCell,
			cols: ['320px', 'auto'],
			rows: ['100%'],
			classes: ['internal-borders', 'resizable']
		});
		if (this.state.gridLayout !== null) mainGrid.updateLayout(this.state.gridLayout);
		mainGrid.addEventListener('reflow', evt => this.state.gridLayout = evt.detail);
		const [listCell, scriptCell] = mainGrid.getCells();

		// Import control
		let importCtrl = DCControl.create('input', { in: listCell });
		importCtrl.accept = ".js,.json";
		importCtrl.type = 'file';
		importCtrl.style.display = 'none';
		importCtrl.addEventListener('change', this.importFile.bind(this));

		// List
		this.listBox = new DCListBox({
			in: listCell,
			rearrangeable: true,
			contextMenu: {
				'Export All': evt => this.exportAll(),
				'Import...': evt => importCtrl.click()
			}
		});
		this.listBox.setItemTemplate({
			onSelected: this.displayScript.bind(this),
			contextMenu: {
				'Rename': evt => this.renameScript(evt.sourceControl),
				'Remove': evt => this.removeScript({ item: evt.sourceControl }),
				'Export': evt => this.exportScript(evt.sourceControl)
			}
		});
		this.listBox.addEventListener('itemsRearranged', this.updateScriptOrder.bind(this));

		// Script cell
		this.#scriptCell = scriptCell;
		this.editor = ace.edit(new DCView({ className: 'fill' }));
		this.editor.$blockScrolling = Infinity;
		this.editor.setTheme("ace/theme/xcode");
		this.editor.renderer.setShowGutter(false);
		this.editor.setShowPrintMargin(false);
		this.editor.setHighlightActiveLine(false);
		this.editor.setFontSize(14);
		this.editor.setOption('scrollPastEnd', 1);
		this.editor.setWrapBehavioursEnabled(false);
		this.editor.commands.addCommand({
			name: 'Run Script',
			exec: () => this.runScript(),
			bindKey: { mac: 'cmd-enter', win: 'ctrl-enter' }
		});
		this.outputContainer = new DCView({ className: 'fill' });

		// Status cell
		let statusBar = new DCStatusBar({ in: statusCell, classes: ['border-top'] });
		this.editorStatusCell = statusBar.addItem({
			width: '1fr',
			classes: ['text']
		});
		statusBar.addItem({
			width: 'auto',
			classes: ['button'],
			icon: 'grid-1x2',
			text: 'Reset Layout',
			onClick: () => mainGrid.resetLayout()
		});
		this.saveIndicator = statusBar.addItem({
			width: 'auto',
			icon: 'floppy',
			styles: { opacity: '0.5' }
		});

		// Key bindings
		this.editor.commands.addCommand({
			name: 'Launch Module',
			exec: () => DSModuleLauncher.open(),
			bindKey: { mac: 'cmd-alt-l', win: 'ctrl-alt-l' }
		});

		// Load data
		this.constructor.load(() => {
			let preselectedItem = null;
			for (let scriptName of this.constructor.#scripts.keys()) {
				let item = this.listBox.addItem({ text: scriptName });
				if (scriptName == this.state.selectedScript) preselectedItem = item;
			}
			this.editor.renderer.setShowGutter(this.constructor.#settings.showLineNumbers);
			if (preselectedItem) preselectedItem.click();
		});
	}

	show()
	{
		if (this.constructor.#settings) {
			this.editor.renderer.setShowGutter(this.constructor.#settings.showLineNumbers);
		}
		this.editor.focus();
	}

	hide()
	{
		let currentItem = this.listBox.getSelectedItem();
		if (currentItem && !currentItem.displayOutput) {
			let scriptContents = this.editor.getValue();
			if (scriptContents != this.constructor.#scripts.get(currentItem.textContent)) {
				this.constructor.#scripts.set(currentItem.textContent, scriptContents);
				this.constructor.save();
			}
		}
	}

	quit()
	{
		let currentItem = this.listBox.getSelectedItem();
		if (currentItem && currentItem.outputNode) {
			currentItem.outputNode.dispatchEvent(new CustomEvent('detached'));
		}
	}

	terminate(evt)
	{
		let currentItem = this.listBox.getSelectedItem();
		if (currentItem && !currentItem.displayOutput) {
			let scriptName = currentItem.textContent;
			let scriptContents = this.editor.getValue();
			if (scriptContents != this.constructor.#scripts.get(scriptName)) {
				let scriptJSON = { name: scriptName, contents: scriptContents };
				localStorage.setItem(`${this.constructor.name}.savedScript`, JSON.stringify(scriptJSON));
			}
		}
	}

	updateSettings()
	{
		this.editor.focus();
		let newSettings = this.#settingsDialog.querySelector('dc-keyvalueview').getData();
		if (JSON.stringify(newSettings) == JSON.stringify(this.constructor.#settings)) return;
		this.constructor.#settings = {...newSettings};
		this.constructor.save();
	}

	addScript()
	{
		if (this.listBox.itemBeingRenamed) return;
		this.constructor.#scripts.set('', '');
		let item = this.listBox.addItem({ text: '' });
		this.listBox.setSelectedItem(item);
		this.renameScript(item);
		for (const instance of this.constructor.instances) {
			if (instance == this) continue;
			instance.listBox.addItem({ text: '' });
		}
	}

	removeScript({ item, interactive = true, scriptName })
	{
		if (interactive) {
			if (!confirm('Script ' + item.textContent + ' will be removed.')) return;
		} else {
			item = this.listBox.getItemByText(scriptName);
		}
		const isSelected = item == this.listBox.getSelectedItem();
		const session = this.constructor.#sessions[item.textContent];
		if (session) {
			session.destroy();
			delete this.constructor.#sessions[item.textContent];
		}
		item.remove();
		if (isSelected) {
			if (item.outputNode) item.outputNode.dispatchEvent(new CustomEvent('detached'));
			this.state.selectedScript = null;
			this.editor.container.detach();
			this.outputContainer.clear();
			this.outputContainer.detach();
			this.editorStatusCell.textContent = '';
			this.#scriptViewButton.setEnabled(false);
			this.#outputViewButton.setEnabled(false);
		}
		if (interactive) {
			this.constructor.#scripts.delete(item.textContent);
			this.constructor.save();
			for (const instance of this.constructor.instances) {
				if (instance == this) continue;
				instance.removeScript({ interactive: false, scriptName: item.textContent });
			}
		}
	}

	renameScript(item)
	{
		item.rename(evt => {
			const oldName = evt.previousText;
			const newName = item.textContent;
			let newScripts = new Map();
			for (let scriptName of this.constructor.#scripts.keys()) {
				newScripts.set(scriptName !== oldName ? scriptName : newName, this.constructor.#scripts.get(scriptName));
				if (scriptName === oldName) {
					let session = this.constructor.#sessions[scriptName];
					if (session) {
						this.constructor.#sessions[newName] = this.constructor.#sessions[oldName];
						delete this.constructor.#sessions[oldName];
					}
				}
			}
			this.constructor.#scripts = newScripts;
			this.constructor.save();
			for (const instance of this.constructor.instances) {
				if (instance == this) continue;
				instance.listBox.getItemByText(oldName).setText(newName);
			}
			if (item == this.listBox.getSelectedItem()) this.state.selectedScript = newName;
		});
	}

	updateScriptOrder()
	{
		let newScripts = new Map();
		for (let item of this.listBox.children) {
			let name = item.textContent;
			newScripts.set(name, this.constructor.#scripts.get(name));
		}
		this.constructor.#scripts = newScripts;
		this.constructor.save();
		for (const instance of this.constructor.instances) {
			if (instance == this) continue;
			let items = {};
			while (instance.listBox.firstChild) {
				let item = instance.listBox.firstChild;
				items[item.textContent] = item;
				item.detach();
			}
			for (let name of newScripts.keys()) instance.listBox.appendChild(items[name]);
		}
	}

	exportScript(item)
	{
		let scriptName = item.textContent;
		let session = this.constructor.#sessions[scriptName];
		let scriptContents = !session ? this.constructor.#scripts.get(scriptName) : session.getValue();
		
		let element = DCControl.create('a', { in: this.#scriptCell });
		element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(scriptContents));
		element.setAttribute('download', scriptName + '.js');
		element.style.display = 'none';
		element.click();
		element.detach();
	}

	exportAll()
	{
		let currentItem = this.listBox.getSelectedItem();
		if (currentItem) {
			const session = this.constructor.#sessions[currentItem.textContent];
			let currentItemValue = session.getValue();
			if (currentItemValue != this.constructor.#scripts.get(currentItem.textContent)) {
				this.constructor.#scripts.set(currentItem.textContent, currentItemValue);
				this.constructor.save();
			}
		}
		let scriptsJSON = JSON.stringify(Object.fromEntries(this.constructor.#scripts), null, '\t');

		let element = DCControl.create('a', { in: this.#scriptCell });
		element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(scriptsJSON));
		element.setAttribute('download', this.constructor.name + '.json');
		element.style.display = 'none';
		element.click();
		element.detach();
	}

	importFile(evt)
	{
		let importCtrl = evt.target;
		var file = importCtrl.files.item(0);
		if (!file) return;
		
		let nameBits = file.name.split('.');
		let extension = nameBits.pop();
		let name = nameBits.join('.');
		
		if (!['js', 'json'].includes(extension)) {
			alert('Unable to import unrecognised file format.');
			return;
		}
		
		let fileReader = new FileReader();
		fileReader.onload = () => {
			let fileContents = fileReader.result;
			let importScripts;
			if (extension == 'js') {
				importScripts = {[name]: fileContents};
			} else {
				try {
					importScripts = JSON.parse(fileContents);
				}
				catch (error) {
					alert('Unable to read JSON.');
					return;
				}
			}
			let importCount = 0;
			for (let key in importScripts) {
				let value = importScripts[key];
				if (typeof value != 'string') continue;
				let counter = 1;
				let importName = key;
				while (this.constructor.#scripts.has(importName)) {
					counter++;
					importName = key + ' ' + counter;
				}
				this.constructor.#scripts.set(importName, value);
				for (const instance of this.constructor.instances) {
					instance.listBox.addItem({ text: importName });
				}
				importCount++;
			}
			if (importCount > 0) this.constructor.save();
		};
		fileReader.onerror = error => {
			alert('Unable to read file.');
		};
		fileReader.readAsText(file);
		importCtrl.value = '';
	}

	displayScript({previousItem, item})
	{
		// Save previous item
		if (previousItem) {
			const previousSession = this.constructor.#sessions[previousItem.textContent];
			let previousItemValue = previousSession.getValue();
			if (previousItemValue != this.constructor.#scripts.get(previousItem.textContent)) {
				this.constructor.#scripts.set(previousItem.textContent, previousItemValue);
				this.constructor.save();
			}
			if (previousItem.outputNode) {
				if (previousItem.displayOutput) previousItem.outputNode.saveViewport();
				previousItem.outputNode.dispatchEvent(new CustomEvent('detached'));
			}
		}

		// Store current script in state
		let scriptName = item.textContent;
		this.state.selectedScript = scriptName;

		// Set editor session
		let session = this.constructor.#sessions[scriptName];
		if (!session) {
			session = ace.createEditSession(this.constructor.#scripts.get(scriptName), 'ace/mode/javascript');
			this.constructor.#sessions[scriptName] = session;
			session.setUseSoftTabs(false);
			session.selection.on('changeCursor', this.updateEditorStatus.bind(this));
			session.selection.on('changeSelection', this.updateEditorStatus.bind(this));
		}
		this.editor.setSession(session);

		// Append item output node
		this.outputContainer.clear();
		if (item.outputNode) {
			this.outputContainer.appendChild(item.outputNode);
			item.outputNode.dispatchEvent(new CustomEvent('attached'));
		}

		// Append editor & output node
		if (!this.#scriptCell.hasChildNodes()) {
			this.#scriptCell.appendChild(this.editor.container);
			this.#scriptCell.appendChild(this.outputContainer);
		}

		// Enable/disable script/output view buttons
		this.#scriptViewButton.setEnabled(true);
		this.#outputViewButton.setEnabled(item.outputNode ? true : false);

		// Display script or output
		let targetButton = !item.displayOutput ? this.#scriptViewButton : this.#outputViewButton;
		if (!targetButton.isSelected()) {
			targetButton.click();
		} else if (!item.displayOutput) {
			this.editor.focus();
		} else {
			item.outputNode.restoreViewport();
		}
	}

	toggleOutputView(visible)
	{
		// Item
		let item = this.listBox.getSelectedItem();
		if (!item) return;

		// Toggle editor and output node visibility
		if (!visible) {
			if (item.displayOutput) item.outputNode.saveViewport();
			item.displayOutput = false;
			this.outputContainer.hide();
			this.editor.container.show();
			this.editor.resize();
			this.updateEditorStatus();
			this.editor.focus();
		} else {
			item.displayOutput = true;
			this.editor.container.hide();
			this.outputContainer.show();
			this.editorStatusCell.textContent = '';
			item.outputNode.restoreViewport();
			item.outputNode.focus();
		}
	}

	updateEditorStatus()
	{
		let selRange = this.editor.getSelectionRange();
		let lineNumber = selRange.start.row + 1;
		let colNumber = selRange.start.column + 1;
		let startPos = this.editor.session.doc.positionToIndex(selRange.start);
		let endPos = this.editor.session.doc.positionToIndex(selRange.end);
		let selLength = endPos - startPos;
		this.editorStatusCell.textContent = 'Ln ' + lineNumber.toString() + ', Col ' + colNumber.toString() + (selLength > 0 ? ', Sel ' + selLength.toString() : '');
	}

	runScript()
	{
		// Item
		let item = this.listBox.getSelectedItem();
		if (!item) return;

		// Save if contents have changed
		let scriptContents = this.editor.getValue();
		if (scriptContents != this.constructor.#scripts.get(item.textContent)) {
			this.constructor.#scripts.set(item.textContent, scriptContents);
			this.constructor.save();
		}

		// Create output node
		item.outputNode = new DCView({
			in: this.outputContainer,
			replaceContents: true,
			classes: ['fill'],
			styles: { overflow: 'auto' }
		});
		item.outputNode.storedScrollTop = 0;
		item.outputNode.storedScrollLeft = 0;
		item.outputNode.saveViewport = () => {
			item.outputNode.storedScrollTop = item.outputNode.scrollTop;
			item.outputNode.storedScrollLeft = item.outputNode.scrollLeft;
		};
		item.outputNode.restoreViewport = () => {
			item.outputNode.scrollTop = item.outputNode.storedScrollTop;
			item.outputNode.scrollLeft = item.outputNode.storedScrollLeft;
		};

		// Run script
		let scriptContext = {
			name: item.textContent,
			rootNode: item.outputNode,
			runScript: secondaryScriptName => {
				let secondaryScriptContents = this.constructor.#scripts.get(secondaryScriptName);
				if (secondaryScriptContents) {
					return Function(secondaryScriptContents).call(scriptContext);
				} else {
					console.error('Could not run script');
					return false;
				}
			}
		};
		try {
			Function(scriptContents).call(scriptContext);
		} catch (error) {
			item.outputNode.classList.add('padded', 'center', 'pre', 'error');
			item.outputNode.textContent = error.message;
			let errorInfoMatches = error.stack.match(/<anonymous>:(\d+):(\d+)/);
			if (errorInfoMatches && errorInfoMatches.length == 3) {
				item.outputNode.textContent += `\non line ${errorInfoMatches[1] - 2} column ${errorInfoMatches[2]}`;
			}
		}

		// If empty, mark output node accordingly
		if (!item.outputNode.hasChildNodes()) {
			item.outputNode.classList.add('padded', 'center', 'pre');
			item.outputNode.textContent = 'Script execution completed successfully without output';
		}

		// Switch to output node
		this.#outputViewButton.setEnabled(true);
		this.#outputViewButton.click();
	}
}

DS.registerModule(DMScriptStudio);