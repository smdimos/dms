class DMClassBrowser
{
	static shellName = 'Class Browser';
	static shellIcon = 'boxes';

	state;
	#mainCell;
	#classHierarchy;
	#classDetails;
	#treeView;
	#methodListCell;
	#treeNodeByClassName = {};
	#recordedNodes = [];
	#recordedNodeIndex = -1;
	
	constructor(params)
	{
		// Instance events
		params.rootNode.addEventListener('show', this.show.bind(this));

		// Initial state
		let defaultState = {
			gridLayout: null,
			selectedClass: null,
			treeScrollTop: 0
		};
		this.state = params.state || {};
		for (let key in defaultState) {
			if (!(key in this.state)) this.state[key] = defaultState[key];
		}

		// Module grid
		const moduleGrid = new DCGrid({
			in: params.rootNode,
			cols: ['100%'],
			rows: ['auto', '1fr', 'auto']
		});
		const [toolCell, mainCell, statusCell] = moduleGrid.getCells();

		// Toolbar
		const toolBar = new DCToolBar({ in: toolCell });
		toolBar.addItem({
			icon: 'arrow-left',
			tooltip: 'Back',
			onClick: evt => this.navigate(-1)
		});
		toolBar.addItem({
			icon: 'arrow-right',
			tooltip: 'Forward',
			onClick: evt => this.navigate(1)
		});
		toolBar.addSeparator();
		let searchItem = toolBar.addItem({
			icon: 'search',
			classes: ['static'],
			expand: true,
			onClick: evt => searchField.focus()
		});
		let searchTimer;
		let searchField = new DCTextField({
			in: searchItem,
			classes: ['fill'],
			onInput: evt => {
				searchField.setOptions([]);
				if (evt.constructor.name == 'InputEvent') {
					clearTimeout(searchTimer);
					searchTimer = setTimeout(this.search.bind(this, searchField), 1000);
				} else {
					this.openSearchResult(searchField.getValue());
				}
			},
			onEnter: evt => {
				this.openSearchResult(searchField.getValue());
			}
		});

		// Load
		this.#mainCell = mainCell;
		this.load();
	}

	load()
	{
		new DCView({
			in: this.#mainCell,
			className: 'loader',
			replaceContents: true
		});
		let pathToFile = '/rs/class-hierarchy.json';
		DS.cmd('getFile', { file: pathToFile }, classHierarchy => {
			this.#classHierarchy = classHierarchy;
			this.renderBrowser();
		}, errorMsg => {
			if (errorMsg == 'ENOENT') errorMsg = 'File not found';
			this.renderError(`Error retrieving ${pathToFile}:\r\n${errorMsg}.`);
		});
	}

	renderError(errorText)
	{
		new DCView({
			in: this.#mainCell,
			replaceContents: true,
			text: errorText,
			classes: ['fill', 'padded', 'center', 'error', 'pre'],
			contextMenu: {
				'Reload': evt => {
					this.load();
				}
			}
		});
	}

	renderBrowser()
	{
		// Main grid
		const mainGrid = new DCGrid({
			in: this.#mainCell,
			replaceContents: true,
			cols: ['320px', 'auto'],
			rows: ['100%'],
			classes: ['internal-borders', 'resizable']
		});
		if (this.state.gridLayout !== null) mainGrid.updateLayout(this.state.gridLayout);
		mainGrid.addEventListener('reflow', evt => this.state.gridLayout = evt.detail);
		const [treeCell, methodListCell] = mainGrid.getCells();
		this.#methodListCell = methodListCell;

		// Tree container scroll management
		treeCell.addEventListener('scroll', evt => this.state.treeScrollTop = treeCell.scrollTop);

		// Class hierarchy
		let preselectNode;
		this.#treeView = new DCTreeView({ in: treeCell });
		this.#treeView.addEventListener('itemSelected', evt => {
			if (!('internalNavigation' in evt.detail)) {
				this.#recordedNodeIndex++;
				if (typeof this.#recordedNodes[this.#recordedNodeIndex] !== 'undefined') {
					this.#recordedNodes.length = this.#recordedNodeIndex;
				}
				this.#recordedNodes.push(evt.detail.item);
			}
			this.renderClassInfo(evt.detail.item.getText());
		});
		this.#treeNodeByClassName = {};
		let renderNode = (parentNode, className, subclasses) => {
			let node = parentNode.addItem({ text: className });
			this.#treeNodeByClassName[className] = node;
			if (className == this.state.selectedClass) preselectNode = node;
			for (let subclassName of Object.keys(subclasses).sort()) {
				renderNode(node, subclassName, subclasses[subclassName]);
			}
		};
		renderNode(this.#treeView, 'Object', this.#classHierarchy.Object);

		// Open the Object node
		let objectNode = this.#treeView.getItem({ at: 0 });
		if (objectNode) objectNode.open();

		// Load class details
		let pathToFile = '/rs/class-details.json';
		DS.cmd('getFile', { file: pathToFile }, classDetails => {
			this.#classDetails = classDetails;
		}, errorMsg => {
			if (errorMsg == 'ENOENT') errorMsg = 'File not found';
			this.#classDetails = `Error retrieving ${pathToFile}:\r\n${errorMsg}.`;
		}, () => {
			if (preselectNode) preselectNode.select({ focus: true });
			treeCell.scrollTop = this.state.treeScrollTop;
		});
	}

	renderClassInfo(className)
	{
		// Store class name in state
		this.state.selectedClass = className;

		// Ensure info is available
		let errorText = !this.#classDetails ? 'Class details not loaded' : (
			typeof this.#classDetails === 'string' ? this.#classDetails : (
				!(className in this.#classDetails) ? 'Class details not found' : null
			)
		);
		if (errorText) {
			new DCView({
				in: this.#methodListCell,
				replaceContents: true,
				text: errorText,
				classes: ['fill', 'padded', 'center', 'error', 'pre']
			});
			return;
		}

		// Methods
		let container = new DCView({
			in: this.#methodListCell,
			replaceContents: true,
			classes: ['fill', 'document']
		});
		for (let i = 0; i < 2; i++) {
			let header = new DCText({
				in: container,
				classes: ['heading', 'block', 'margin-bottom-half'],
				text: i == 0 ? 'Static Methods' : 'Methods'
			});
			let ul = DCControl.create('ul', {
				in: container,
				styles: {
					padding: '0',
					listStyleType: 'none',
					columnCount: 3
				}
			});
			if (i == 1) ul.classList.add('margin-bottom-0');
			for (let methodName of i == 0 ? this.#classDetails[className].staticMethods : this.#classDetails[className].methods) {
				DCControl.create('li', { in: ul, text: methodName });
			}
			if (ul.children.length == 0) DCControl.create('li', { in: ul, text: '—' });
		}
	}

	search(searchField)
	{
		if (!this.#classDetails) return;

		// Needle
		let needle = searchField.getValue().toLowerCase();
		if (!needle) return;

		// Results array & max count
		let results = [];
		let maxResultCount = 512;

		// Get matches
		let limitReached = false;
		for (let key in this.#classDetails) {
			if (limitReached) break;
			if (key.toLowerCase().includes(needle)) {
				results.push(key);
				limitReached = results.length == maxResultCount;
			}
			for (let i = 0; i < 2; i++) {
				if (limitReached) break;
				let methodNames = i == 0 ? this.#classDetails[key].staticMethods : this.#classDetails[key].methods;
				for (let methodName of methodNames) {
					if (limitReached) break;
					if (methodName.toLowerCase().includes(needle)) {
						results.push(key + ' ' + (i == 0 ? '⊕' : '⊖') + ' ' + methodName);
						limitReached = results.length == maxResultCount;
					}
				}
			}
		}

		// Set the options
		searchField.setOptions(results.sort());
	}

	openSearchResult(resultText)
	{
		let className = resultText.split(' ')[0];
		let treeNode = this.#treeNodeByClassName[className];
		if (treeNode) treeNode.select({ focus: true });
	}

	navigate(direction)
	{
		if (this.#recordedNodeIndex == -1) return;
		if (
			(direction == -1 && this.#recordedNodeIndex == 0) ||
			(direction == 1 && this.#recordedNodeIndex == (this.#recordedNodes.length - 1))
		) {
			this.#treeView.focus();
			return;
		}
		this.#recordedNodeIndex += direction;
		let node = this.#recordedNodes[this.#recordedNodeIndex];
		node.select({ internalNavigation: true, focus: true });
	}

	show()
	{
		if (!this.#treeView) return;
		let treeContainer = this.#treeView.parentElement;
		if (treeContainer.scrollTop == 0) treeContainer.scrollTop = this.state.treeScrollTop;
		this.#treeView.focus();
	}
}

DS.registerModule(DMClassBrowser);