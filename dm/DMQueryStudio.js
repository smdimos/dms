class DMQueryStudio
{
	static shellName = 'Query Studio';
	static shellIcon = 'database-gear';
	static loaded = false;
	static instanceLoadFns = [];
	static #connectionListener;
	static #pages;
	static #settings;
	static #sessions = {};
	static #aceRange = ace.require('ace/range').Range;
	static #structures = {};

	static load(thenFn)
	{
		if (this.loaded) return thenFn();
		this.instanceLoadFns.push(thenFn);
		if (this.loaded === null) return;
		this.loaded = null;
		DS.cmd('readFile', { module: this.name }, (data) => {
			if (!('pages' in data)) data.pages = {};
			this.#pages = new Map(Object.entries(data.pages));
			if (!('settings' in data)) data.settings = {};
			const defaultSettings = {
				autoLoadStructure: true,
				editorMode: 'SQL',
				showLineNumbers: false,
				recordLimit: 1000
			};
			for (const key in defaultSettings) {
				if (!(key in data.settings)) data.settings[key] = defaultSettings[key];
			}
			this.#settings = data.settings;
			let savedPageJSON = localStorage.getItem(`${this.name}.savedPage`);
			if (savedPageJSON) {
				try {
					let savedPage = JSON.parse(savedPageJSON);
					if (this.#pages.has(savedPage.name)) {
						this.#pages.set(savedPage.name, savedPage.contents);
					}
				} catch (error) {
					console.error('Unable to restore saved page.', error);
				}
				localStorage.removeItem(`${this.name}.savedPage`);
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
			pages: Object.fromEntries(this.#pages),
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
	loaded = false;
	#settingsDialog;
	#runQueryControls;
	listBox;
	#pageCell;
	editor;
	editorStatusCell;
	#dataCell;
	dataStatusCell;
	saveIndicator;
	
	constructor(params)
	{
		// Instance events
		params.rootNode.addEventListener('show', this.show.bind(this));
		params.rootNode.addEventListener('hide', this.hide.bind(this));
		params.rootNode.addEventListener('quit', this.quit.bind(this));

		// Initial state
		let defaultState = {
			gridLayout: null,
			sidePaneView: 'pageList',
			selectedPage: null,
			outputTarget: 'dataView'
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
			name: 'autoLoadStructure',
			label: 'Auto Load Structure',
			type: 'boolean'
		});
		settingsView.addItem({
			name: 'editorMode',
			label: 'Editor Mode',
			type: 'list',
			options: ['PGSQL', 'PLSQL', 'SQL', 'SQLSERVER'],
			onChange: value => {
				for (let sessionName in this.constructor.#sessions) {
					this.constructor.#sessions[sessionName].setMode('ace/mode/' + value.toLowerCase());
				}
			}
		});
		settingsView.addItem({
			name: 'showLineNumbers',
			label: 'Show Line Numbers',
			type: 'boolean',
			onChange: value => this.editor.renderer.setShowGutter(value)
		});
		settingsView.addItem({
			name: 'recordLimit',
			label: 'Maximum Records',
			type: 'number',
			params: { allowDecimal: false, allowNegative: false, step: 100, min: 100, max: 10000 }
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
			text: 'New Page',
			onClick: this.addPage.bind(this)
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
			icon: 'code-slash',
			text: 'Format Query',
			menu: {
				'To BASIC': this.formatQuery.bind(this, DTQueryTools.FORMAT_TO_BASIC),
				'From BASIC': this.formatQuery.bind(this, DTQueryTools.FORMAT_FROM_BASIC)
			}
		});
		toolBar.addSeparator();
		let dataTargetItem = toolBar.addItem({
			text: 'Output Target',
			menu: {
				'Data View': () => this.setOutputTarget(dataTargetItem, 'dataView'),
				'XLSX': () => this.setOutputTarget(dataTargetItem, 'xlsx')
			}
		});
		this.setOutputTarget(dataTargetItem, this.state.outputTarget);
		let runButton = toolBar.addItem({
			icon: 'play',
			text: 'Run Query',
			tooltip: 'Run Query (⌘↵)',
			onClick: () => this.runQuery()
		});
		let runAllButton = toolBar.addItem({
			icon: 'collection-play',
			text: 'Run Page',
			onClick: () => this.runQuery(true)
		});
		this.#runQueryControls = [dataTargetItem, runButton, runAllButton];

		// Main grid
		const mainGrid = new DCGrid({
			in: mainCell,
			cols: ['320px', 'auto'],
			rows: ['50%', '50%'],
			cellSpans: [{ cell: [0,0], rowSpan: 2 }],
			classes: ['internal-borders', 'resizable']
		});
		if (this.state.gridLayout !== null) mainGrid.updateLayout(this.state.gridLayout);
		mainGrid.addEventListener('reflow', evt => this.state.gridLayout = evt.detail);
		const [listCell, pageCell, dataCell] = mainGrid.getCells();

		// Import control
		let importCtrl = DCControl.create('input', { in: listCell });
		importCtrl.accept = ".sql,.json";
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
			onSelected: this.displayPage.bind(this),
			contextMenu: {
				'Rename': evt => this.renamePage(evt.sourceControl),
				'Remove': evt => this.removePage({ item: evt.sourceControl }),
				'Export': evt => this.exportPage(evt.sourceControl)
			}
		});
		this.listBox.addEventListener('itemsRearranged', this.updatePageOrder.bind(this));

		// Structure view
		this.structureView = new DCView({
			in: listCell,
			classes: ['fill'],
			styles: { display: 'none' },
			contextMenu: {
				'Reload': evt => {
					this.structureView.clear();
					let connectionName = DSConnectionManager.getCurrentConnectionName();
					if (connectionName !== null) this.loadStructure(connectionName);
				}
			}
		});

		// Page cell
		this.#pageCell = pageCell;
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
			name: 'Run Query',
			exec: () => this.runQuery(),
			bindKey: { mac: 'cmd-enter', win: 'ctrl-enter' }
		});

		// Data cell
		this.#dataCell = dataCell;

		// Status cell
		let statusBar = new DCStatusBar({ in: statusCell, classes: ['border-top'] });
		let pageListButton = statusBar.addItem({
			width: 'auto',
			classes: ['button'],
			icon: 'list',
			text: 'Page List',
			choiceGroup: 'side-pane-view',
			active: this.state.sidePaneView == 'pageList',
			onClick: () => this.toggleStructureView(false)
		});
		let structureButton = statusBar.addItem({
			width: 'auto',
			classes: ['button'],
			icon: 'boxes',
			text: 'Structure',
			choiceGroup: 'side-pane-view',
			active: this.state.sidePaneView == 'structure',
			onClick: () => this.toggleStructureView(true)
		});
		this.editorStatusCell = statusBar.addItem({
			width: '1fr',
			classes: ['text']
		});
		this.dataStatusCell = statusBar.addItem({
			width: '1fr',
			classes: ['text']
		});
		statusBar.addItem({
			width: 'auto',
			classes: ['button'],
			icon: 'copy',
			text: 'Copy Dataset',
			onClick: () => this.copyDataset()
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
		let toggleSidePaneView = () => {
			if (this.state.sidePaneView == 'pageList') structureButton.click();
			else pageListButton.click();
		};
		params.rootNode.addEventListener('command', evt => {
			if (evt.detail.key == 's') toggleSidePaneView();
		});
		this.editor.commands.addCommand({
			name: 'Launch Module',
			exec: () => DSModuleLauncher.open(),
			bindKey: { mac: 'cmd-alt-l', win: 'ctrl-alt-l' }
		});
		this.editor.commands.addCommand({
			name: 'Toggle Structure',
			exec: toggleSidePaneView,
			bindKey: { mac: 'cmd-alt-s', win: 'ctrl-alt-s' }
		});

		// Load data
		this.constructor.load(() => {

			// Populate page list
			let preselectedItem = null;
			for (let pageName of this.constructor.#pages.keys()) {
				let item = this.listBox.addItem({ text: pageName });
				item.running = false;
				if (pageName == this.state.selectedPage) preselectedItem = item;
			}
			this.editor.renderer.setShowGutter(this.constructor.#settings.showLineNumbers);
			if (preselectedItem) preselectedItem.click();

			// Structure
			let connectionName = DSConnectionManager.getCurrentConnectionName();
			if (connectionName !== null) {
				if (connectionName in this.constructor.#structures) {
					this.updateStructureView(connectionName);
				} else if (this.constructor.#settings.autoLoadStructure) {
					this.loadStructure(connectionName);
				} else {
					this.constructor.#structures[connectionName] = 'Auto-populate structure is off.';
					this.updateStructureView(connectionName);
				}
			} else {
				new DCView({
					in: this.structureView,
					classes: ['fill', 'center', 'error'],
					text: 'Not connected to a database.'
				});
			}

			// Connection listener
			if (!this.constructor.#connectionListener) {
				this.constructor.#connectionListener = evt => {
					if (evt.connectionName in this.constructor.#structures) {
						for (let instance of this.constructor.instances) instance.updateStructureView(evt.connectionName);
					} else if (this.constructor.#settings.autoLoadStructure) {
						this.loadStructure(evt.connectionName);
					} else {
						this.constructor.#structures[evt.connectionName] = 'Auto-populate structure is off.';
						for (let instance of this.constructor.instances) instance.updateStructureView(evt.connectionName);
					}
				};
				DSConnectionManager.addEventListener('connected', this.constructor.#connectionListener);
			}

			// Mark instance as loaded
			this.loaded = true;

		});
	}

	show()
	{
		if (this.constructor.#settings) {
			this.editor.renderer.setShowGutter(this.constructor.#settings.showLineNumbers);
			let session = this.editor.getSession();
			if (session && !session.destroyed) session.setMode({ path: 'ace/mode/' + this.constructor.#settings.editorMode.toLowerCase(), v: Date.now()});
		}
		this.editor.focus();
		let currentItem = this.listBox.getSelectedItem();
		if (currentItem && currentItem.activeDataGrid) {
			currentItem.activeDataGrid.autoSizeColumnsIfNeeded();
		}
	}

	hide()
	{
		let currentItem = this.listBox.getSelectedItem();
		if (currentItem) {
			let queriesCSV = this.editor.getValue();
			if (queriesCSV != this.constructor.#pages.get(currentItem.textContent)) {
				this.constructor.#pages.set(currentItem.textContent, queriesCSV);
				this.constructor.save();
			}
		}
	}

	quit()
	{
		for (let item of this.listBox.children) {
			if (item.dataGrids) {
				for (let dataGrid of item.dataGrids) dataGrid.destroy();
			}
		}
	}

	terminate(evt)
	{
		let currentItem = this.listBox.getSelectedItem();
		if (currentItem) {
			let pageName = currentItem.textContent;
			let queriesCSV = this.editor.getValue();
			if (queriesCSV != this.constructor.#pages.get(pageName)) {
				let pageJSON = { name: pageName, contents: queriesCSV };
				localStorage.setItem(`${this.constructor.name}.savedPage`, JSON.stringify(pageJSON));
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

	loadStructure(connectionName)
	{
		this.constructor.#structures[connectionName] = null;
		DS.cmd('structure', { ts: Date.now() }, (structure) => {
			this.constructor.#structures[connectionName] = structure;
		}, errorMsg => {
			this.constructor.#structures[connectionName] = errorMsg;
		}, () => {
			for (let instance of this.constructor.instances) instance.updateStructureView(connectionName);
		});
	}

	updateStructureView(connectionName)
	{
		this.structureView.clear();
		let insertTextInEditor = text => {
			let item = this.listBox.getSelectedItem();
			if (!item) return;
			if (text == text.toUpperCase()) text = text.toLowerCase();
			this.editor.insert(text);
			this.editor.focus();
		};
		let structure = this.constructor.#structures[connectionName];
		if (typeof structure !== 'string') {
			let treeView = new DCTreeView({ in: this.structureView });
			for (let tableName in structure) {
				let tableNode = treeView.addItem({
					icon: 'table',
					text: tableName,
					onDoubleClick: item => insertTextInEditor(item.getText())
				});
				for (let fieldName in structure[tableName]) {
					let fieldInfo = structure[tableName][fieldName];
					let fieldTooltipLines = [];
					for (let infoKey in fieldInfo) {
						fieldTooltipLines.push(infoKey + ': ' + fieldInfo[infoKey]);
					}
					tableNode.addItem({
						icon: 'file',
						text: fieldName,
						tooltip: fieldTooltipLines.join('\r\n'),
						onDoubleClick: item => insertTextInEditor(item.getText())
					});
				}
			}
		} else {
			new DCView({
				in: this.structureView,
				classes: ['fill', 'center', 'padded', 'error'],
				text: structure || '...'
			});
		}
	}

	toggleStructureView(visible)
	{
		this.state.sidePaneView = visible ? 'structure' : 'pageList';
		this.listBox.style.display = visible ? 'none' : 'block';
		this.structureView.style.display = visible ? 'block' : 'none';
	}

	addPage()
	{
		if (this.listBox.itemBeingRenamed) return;
		this.constructor.#pages.set('', '');
		let item = this.listBox.addItem({ text: '' });
		this.listBox.setSelectedItem(item);
		this.renamePage(item);
		for (const instance of this.constructor.instances) {
			if (instance == this) continue;
			instance.listBox.addItem({ text: '' });
		}
	}

	removePage({ item, interactive = true, pageName })
	{
		if (interactive) {
			if (!confirm('Query page ' + item.textContent + ' will be removed.')) return;
		} else {
			item = this.listBox.getItemByText(pageName);
		}
		const isSelected = item == this.listBox.getSelectedItem();
		const session = this.constructor.#sessions[item.textContent];
		if (session) {
			session.destroy();
			delete this.constructor.#sessions[item.textContent];
		}
		if (item.dataGrids) {
			for (let dataGrid of item.dataGrids) dataGrid.destroy();
			item.activeDataGrid = null;
		}
		this.dataStatusCell.textContent = '';
		item.remove();
		if (isSelected) {
			this.state.selectedPage = null;
			this.editor.container.detach();
			this.editorStatusCell.textContent = '';
			this.#dataCell.clear();
		}
		if (interactive) {
			this.constructor.#pages.delete(item.textContent);
			this.constructor.save();
			for (const instance of this.constructor.instances) {
				if (instance == this) continue;
				instance.removePage({ interactive: false, pageName: item.textContent });
			}
		}
	}

	renamePage(item)
	{
		item.rename(evt => {
			const oldName = evt.previousText;
			const newName = item.textContent;
			let newPages = new Map();
			for (let pageName of this.constructor.#pages.keys()) {
				newPages.set(pageName !== oldName ? pageName : newName, this.constructor.#pages.get(pageName));
				if (pageName === oldName) {
					let session = this.constructor.#sessions[pageName];
					if (session) {
						this.constructor.#sessions[newName] = this.constructor.#sessions[oldName];
						delete this.constructor.#sessions[oldName];
					}
				}
			}
			this.constructor.#pages = newPages;
			this.constructor.save();
			for (const instance of this.constructor.instances) {
				if (instance == this) continue;
				instance.listBox.getItemByText(oldName).setText(newName);
			}
			if (item == this.listBox.getSelectedItem()) this.state.selectedPage = newName;
		});
	}

	updatePageOrder()
	{
		let newPages = new Map();
		for (let item of this.listBox.children) {
			let name = item.textContent;
			newPages.set(name, this.constructor.#pages.get(name));
		}
		this.constructor.#pages = newPages;
		this.constructor.save();
		for (const instance of this.constructor.instances) {
			if (instance == this) continue;
			let items = {};
			while (instance.listBox.firstChild) {
				let item = instance.listBox.firstChild;
				items[item.textContent] = item;
				item.detach();
			}
			for (let name of newPages.keys()) instance.listBox.appendChild(items[name]);
		}
	}

	exportPage(item)
	{
		let pageName = item.textContent;
		let session = this.constructor.#sessions[pageName];
		let pageContents = !session ? this.constructor.#pages.get(pageName) : session.getValue();
		
		let element = DCControl.create('a', { in: this.#pageCell });
		element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(pageContents));
		element.setAttribute('download', pageName + '.sql');
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
			if (currentItemValue != this.constructor.#pages.get(currentItem.textContent)) {
				this.constructor.#pages.set(currentItem.textContent, currentItemValue);
				this.constructor.save();
			}
		}
		let pagesJSON = JSON.stringify(Object.fromEntries(this.constructor.#pages), null, '\t');

		let element = DCControl.create('a', { in: this.#pageCell });
		element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(pagesJSON));
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
		
		if (!['sql', 'json'].includes(extension)) {
			alert('Unable to import unrecognised file format.');
			return;
		}
		
		let fileReader = new FileReader();
		fileReader.onload = () => {
			let fileContents = fileReader.result;
			let importPages;
			if (extension == 'sql') {
				importPages = {[name]: fileContents};
			} else {
				try {
					importPages = JSON.parse(fileContents);
				}
				catch (error) {
					alert('Unable to read JSON.');
					return;
				}
			}
			let importCount = 0;
			for (let key in importPages) {
				let value = importPages[key];
				if (typeof value != 'string') continue;
				let counter = 1;
				let importName = key;
				while (this.constructor.#pages.has(importName)) {
					counter++;
					importName = key + ' ' + counter;
				}
				this.constructor.#pages.set(importName, value);
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

	displayPage({previousItem, item})
	{
		if (previousItem) {
			const previousSession = this.constructor.#sessions[previousItem.textContent];
			let previousItemValue = previousSession.getValue();
			if (previousItemValue != this.constructor.#pages.get(previousItem.textContent)) {
				this.constructor.#pages.set(previousItem.textContent, previousItemValue);
				this.constructor.save();
			}
		}
		let pageName = item.textContent;
		this.state.selectedPage = pageName;
		let session = this.constructor.#sessions[pageName];
		if (!session) {
			session = ace.createEditSession(this.constructor.#pages.get(pageName), 'ace/mode/' + this.constructor.#settings.editorMode.toLowerCase());
			this.constructor.#sessions[pageName] = session;
			session.setUseSoftTabs(false);
			session.selection.on('changeCursor', this.updateEditorStatus.bind(this));
			session.selection.on('changeSelection', this.updateEditorStatus.bind(this));
		}
		this.editor.setSession(session);
		this.#pageCell.appendChild(this.editor.container);
		this.updateEditorStatus();
		this.#dataCell.clear();
		if (item.dataNode) {
			this.#dataCell.appendChild(item.dataNode);
			if (item.activeDataGrid) {
				let dataGrid = item.activeDataGrid;
				dataGrid.restoreViewport();
				dataGrid.autoSizeColumnsIfNeeded();
			}
		}
		this.dataStatusCell.textContent = item.runStatus || '';
		this.editor.focus();
		this.setRunControlsEnabled(!item.running);
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

	formatQuery(format)
	{
		// Item
		let item = this.listBox.getSelectedItem();
		if (!item) return;

		// Parse page to get query at current cursor position
		let queriesCSV = this.editor.getValue();
		let curPos = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
		let {query, startPos, endPos} = DTQueryTools.parseQueries(queriesCSV, curPos);

		// Format query
		let formattedQuery;
		try {
			formattedQuery = DTQueryTools.formatQuery(query, format);
		} catch (error) {
			alert(error);
			return;
		}

		// Replace selection
		let editorStartPos = this.editor.session.doc.indexToPosition(startPos);
		let editorEndPos = this.editor.session.doc.indexToPosition(endPos);
		let selectionRange = new this.constructor.#aceRange(editorStartPos.row, editorStartPos.column, editorEndPos.row, editorEndPos.column);
		this.editor.session.replace(selectionRange, formattedQuery);
		this.editor.focus();
	}

	setOutputTarget(dataTargetItem, target)
	{
		dataTargetItem.setParams({
			icon: target == 'dataView' ? 'eye' : 'file-spreadsheet',
			text: 'Output: ' + (target == 'dataView' ? 'Data View' : 'XLSX')
		});
		this.state.outputTarget = target;
	}

	setRunControlsEnabled(enabled)
	{
		if (enabled) {
			for (let control of this.#runQueryControls) control.setEnabled(true);
			this.editor.setReadOnly(false);
			this.editor.container.classList.remove('locked');
		} else {
			for (let control of this.#runQueryControls) control.setEnabled(false);
			this.editor.setReadOnly(true);
			this.editor.container.classList.add('locked');
		}
	}

	runQuery(runAll = false)
	{
		// Item
		let item = this.listBox.getSelectedItem();
		if (!item) return;
		item.running = true;

		// Clear previous grids
		if (item.dataGrids) {
			for (let dataGrid of item.dataGrids) dataGrid.destroy();
			item.activeDataGrid = null;
		}
		item.dataGrids = [];

		// Clear previous status
		item.runStatus = '';
		this.dataStatusCell.textContent = '';

		// Progress node
		this.#dataCell.clear();
		item.dataNode = new DCView({ in: this.#dataCell, className: 'loader' });
		new DCView({
			in: item.dataNode,
			classes: ['button', 'icon'],
			icon: 'x-lg',
			onClick: evt => {
				killSwitchEngaged = true;
				currentRequest.abort('Query execution aborted');
			}
		});

		// Save if contents have changed
		let queriesCSV = this.editor.getValue();
		if (queriesCSV != this.constructor.#pages.get(item.textContent)) {
			this.constructor.#pages.set(item.textContent, queriesCSV);
			this.constructor.save();
		}

		// Get current query or all queries
		let queries, curPos;
		if (!runAll) {
			curPos = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
			let {query, name, startPos, endPos} = DTQueryTools.parseQueries(queriesCSV, curPos);
			queries = { [name]: query };
			let editorStartPos = this.editor.session.doc.indexToPosition(startPos);
			let editorEndPos = this.editor.session.doc.indexToPosition(endPos);
			let selectionRange = new this.constructor.#aceRange(editorStartPos.row, editorStartPos.column, editorEndPos.row, editorEndPos.column);
			this.editor.selection.setRange(selectionRange);
		} else {
			queries = DTQueryTools.parseQueries(queriesCSV);
		}

		// Remove last query if it's blank
		let queryNames = Object.keys(queries);
		if (queryNames.length > 1 && queries[queryNames[queryNames.length - 1]].trim().length == 0) {
			let lastKey = queryNames.pop();
			delete queries[lastKey];
		}

		// Execute queries and render results
		this.setRunControlsEnabled(false);
		let killSwitchEngaged = false;
		let currentRequest;
		let queryIndex = 0;
		let dataNodes = {};
		let errorCount = 0;
		let runTime = 0;
		let workbook;
		if (this.state.outputTarget != 'dataView') workbook = XLSX.utils.book_new();
		let runQuery = queryName => {
			let query = queries[queryName];
			currentRequest = DS.cmd('query', {
				query: query,
				recordLimit: this.constructor.#settings.recordLimit
			}, ({records, info}) => {
				if (info.affectedRecordCount < 0) {
					if (this.state.outputTarget == 'dataView') {
						let dataNode = new DCView({ classes: ['fill', 'ag-theme-quartz'], show: false });
						dataNodes[queryName] = dataNode;
						let gridOptions = {
							rowData: records,
							columnDefs: [],
							//rowSelection: 'single',
							autoSizeStrategy: {
								type: 'fitCellContents'
							}
						};
						info.fieldNames.forEach(fieldName => {
							gridOptions.columnDefs.push({
								field: fieldName == fieldName.toUpperCase() ? fieldName.toLowerCase() : fieldName,
								headerName: fieldName,
								maxWidth: 500,
								editable: true,
								cellEditor: 'agLargeTextCellEditor',
								cellEditorPopup: true
							});
						}); 
						let dataGrid = agGrid.createGrid(dataNode, gridOptions);
						item.dataGrids.push(dataGrid);
						dataNode.dataGrid = dataGrid;
						dataGrid.dataNode = dataNode;
						dataGrid.gridScrollTop = 0;
						dataGrid.gridScrollLeft = 0;
						dataGrid.saveViewport = () => {
							let viewPortY = dataNode.querySelector('.ag-body-vertical-scroll-viewport');
							dataGrid.gridScrollTop = viewPortY.scrollTop;
							let viewPortX = dataNode.querySelector('.ag-center-cols-viewport');
							dataGrid.gridScrollLeft = viewPortX.scrollLeft;
						};
						dataGrid.addEventListener('bodyScrollEnd', () => dataGrid.saveViewport());
						dataGrid.restoreViewport = () => {
							let viewPortY = dataNode.querySelector('.ag-body-vertical-scroll-viewport');
							viewPortY.scrollTop = dataGrid.gridScrollTop;
							let viewPortX = dataNode.querySelector('.ag-center-cols-viewport');
							viewPortX.scrollLeft = dataGrid.gridScrollLeft;
						};
						dataGrid.autoSizeColumnsIfNeeded = () => {
							let cols = dataGrid.getColumns();
							if (cols.length >= 1 && cols[0].actualWidth <= 36) dataGrid.autoSizeAllColumns();
						};
					} else {
						let worksheet = XLSX.utils.json_to_sheet(records);
						XLSX.utils.book_append_sheet(workbook, worksheet, queryName);
					}
					item.runStatus = (info.recordsLimitedAtCount ? 'First ' : '') + 
						(records.length > 0 ? records.length.toString() : 'No') + 
						' record' + (records.length > 1 ? 's' : '') + 
						' retrieved in ' + info.timeToRunQuery.toString() + ' ms';
					runTime += info.timeToRunQuery;
				} else {
					let recordsAffectedNotice = (info.affectedRecordCount > 0 ? info.affectedRecordCount.toString() : 'No') + 
						' record' + (info.affectedRecordCount > 1 ? 's' : '') + 
						' affected';
					if (this.state.outputTarget == 'dataView') {
						let dataNode = new DCView({ text: recordsAffectedNotice, classes: ['fill', 'padded', 'center'], show: false });
						dataNodes[queryName] = dataNode;
					} else {
						let worksheet = XLSX.utils.aoa_to_sheet([recordsAffectedNotice]);
						XLSX.utils.book_append_sheet(workbook, worksheet, queryName);
					}
					item.runStatus = recordsAffectedNotice + ' in ' + info.timeToRunQuery.toString() + ' ms';
					runTime += info.timeToRunQuery;
				}
			}, (errorMsg) => {
				if (this.state.outputTarget == 'dataView') {
					let dataNode = new DCView({ text: errorMsg, classes: ['fill', 'padded', 'center', 'error'], show: false });
					dataNodes[queryName] = dataNode;
				} else {
					let worksheet = XLSX.utils.aoa_to_sheet([[errorMsg]]);
					XLSX.utils.book_append_sheet(workbook, worksheet, queryName);
				}
				errorCount++;
			}, () => {
				queryIndex++;
				if (queryIndex < queryNames.length && !killSwitchEngaged) {
					runQuery(queryNames[queryIndex]);
				} else {
					item.running = false;
					if (killSwitchEngaged) {
						for (let dataGrid of item.dataGrids) dataGrid.destroy();
						item.dataGrids = [];
						item.runStatus = '';
						item.dataNode = new DCView({ text: 'Query execution aborted', classes: ['fill', 'padded', 'center', 'error'], show: true });
					} else if (queryNames.length == 1) {
						if (this.state.outputTarget == 'dataView') {
							item.dataNode = dataNodes[queryNames[0]];
							if (item.dataNode.dataGrid) item.activeDataGrid = item.dataNode.dataGrid;
							item.dataNode.show();
						} else {
							item.dataNode = new DCView({ text: 'Dataset generated as XLSX', classes: ['fill', 'padded', 'center'], show: true });
						}
					} else {
						if (this.state.outputTarget == 'dataView') {
							item.dataNode = new DCGrid({ cols: ['100%'], rows: ['auto', '1fr'] });
							const [pagerCell, dataNodeCell] = item.dataNode.getCells();
							let dataNodePager = new DCPager({ in: pagerCell, classes: ['flush-edge'] });
							for (let nodeName in dataNodes) {
								let dataNode = dataNodes[nodeName];
								dataNodeCell.appendChild(dataNode);
								let pagerItem = dataNodePager.addItem({
									text: nodeName,
									node: dataNode
								});
								dataNode.addEventListener('show', evt => {
									if (dataNode.dataGrid) {
										dataNode.dataGrid.restoreViewport();
										dataNode.dataGrid.autoSizeColumnsIfNeeded();
										item.activeDataGrid = dataNode.dataGrid;
									} else {
										item.activeDataGrid = null;
									}
								});
							}
							dataNodePager.setSelectedItem({ at: 0 });
						} else {
							item.dataNode = new DCView({ text: 'Dataset generated as XLSX', classes: ['fill', 'padded', 'center'], show: true });
						}
						item.runStatus = `${queryNames.length} quer${queryNames.length > 1 ? 'ies' : 'y'} executed`;
						if (errorCount > 0) item.runStatus += ` (${errorCount} error${errorCount > 1 ? 's' : ''})`;
						item.runStatus += ` in ${runTime} ms`;
					}
					if (this.listBox.getSelectedItem() == item) {
						this.#dataCell.clear();
						this.#dataCell.appendChild(item.dataNode);
						if (item.activeDataGrid) item.activeDataGrid.autoSizeColumnsIfNeeded();
						if (!runAll) {
							this.editor.selection.clearSelection();
							let editorCurPos = this.editor.session.doc.indexToPosition(curPos);
							this.editor.moveCursorTo(editorCurPos.row, editorCurPos.column);
						}
						this.dataStatusCell.textContent = item.runStatus;
						this.setRunControlsEnabled(true);
						this.editor.focus();
					}
					if (this.state.outputTarget != 'dataView') {
						XLSX.writeFile(workbook, item.textContent + '.xlsx');
					}
				}
			});
		};
		runQuery(queryNames[queryIndex]);
	}

	copyDataset()
	{
		// Item
		let item = this.listBox.getSelectedItem();
		if (!item || !item.dataNode) return;

		if (item.activeDataGrid) {

			// Placeholder table
			let table = DCControl.create('table', { in: item.dataNode, styles: { opacity: 0, position: 'absolute', zIndex: -1 }});
			let tbody = DCControl.create('tbody', { in: table });
			let tr = DCControl.create('tr', { in: tbody });
			for (let columnDef of item.activeDataGrid.getColumnDefs()) DCControl.create('th', { in: tr, text: columnDef.headerName });
			item.activeDataGrid.forEachNode(node => {
				tr = DCControl.create('tr', { in: tbody });
				for (let key in node.data) {
					let value = node.data[key];
					if (value == null) value = "";
					DCControl.create('td', { in: tr, text: value });
				}
			});

			// Selection range
			let range = document.createRange();
			range.selectNode(table);
			
			// Active selection
			let sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
			
			// Copy & cleanup
			document.execCommand('copy');
			sel.removeAllRanges();
			table.detach();

		} else if (item.dataNode.tagName != 'DC-GRID') {
			navigator.clipboard.writeText(item.dataNode.textContent);
		} else {
			let pager = item.dataNode.firstChild.firstChild;
			navigator.clipboard.writeText(pager.getSelectedItem().node.textContent);
		}
	}
}

DS.registerModule(DMQueryStudio);