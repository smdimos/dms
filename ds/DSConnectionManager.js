class DSConnectionManager
{
	static #eventListeners = {};
	static #connections;
	static #odbcDialog;
	static #listBox;
	static #infoCell;
	static #testResultCell;
	static #dbSelector;
	static #manageItem;
	static #currentSelectorItem;
	static #inTest = false;

	static init(widgetCell, connections, closeFn)
	{
		// Connections (working copy)
		this.#connections = connections;

		// Dialog
		this.#odbcDialog = new DCDialog({ in: widgetCell, title: 'ODBC Connections', icon: 'database' });
		this.#odbcDialog.addEventListener('close', evt => {
			let currentItem = this.#listBox.getSelectedItem();
			if (currentItem) this.#connections[currentItem.textContent] = this.#infoCell.textContent;
			if (closeFn) closeFn(this.#connections);
		});
		let odbcDialogGrid = new DCGrid({
			in: this.#odbcDialog.body,
			rows: ['364px', 'auto'],
			cols: ['auto', '1fr'],
			classes: ['internal-borders'],
			styles: { width: '720px' }
		});
		let [listCell, infoCell, buttonCell, testResultCell] = odbcDialogGrid.getCells();
		this.#infoCell = infoCell;

		// Dialog > List
		this.#listBox = new DCListBox({ in: listCell, rearrangeable: true, maxTextLength: 32 });
		this.#listBox.setItemTemplate({
			onSelected: this.displayConnection.bind(this)
		});
		this.#listBox.addEventListener('itemsRearranged', this.updateConnectionOrder.bind(this));
		for (let name in this.#connections) {
			let item = this.#listBox.addItem({
				text: name
			});
		}

		// Dialog > ODBC String
		this.#infoCell.classList.add('editable');

		// Dialog > Action Buttons
		let actionBar = new DCStatusBar({ in: buttonCell });
		actionBar.addItem({
			width: '50px',
			classes: ['button'],
			icon: 'plus',
			tooltip: 'Add Connection',
			onClick: evt => this.addConnection()
		});
		actionBar.addItem({
			width: '50px',
			classes: ['button'],
			icon: 'dash',
			tooltip: 'Remove Connection',
			onClick: evt => {
				let selectedItem = this.#listBox.getSelectedItem();
				if (selectedItem) this.removeConnection(selectedItem);
			}
		});
		actionBar.addItem({
			width: '50px',
			classes: ['button'],
			icon: 'rename',
			tooltip: 'Rename Connection',
			onClick: evt => {
				let selectedItem = this.#listBox.getSelectedItem();
				if (selectedItem) this.renameConnection(selectedItem);
			}
		});
		actionBar.addItem({
			width: '50px',
			classes: ['button'],
			icon: 'play',
			tooltip: 'Test Connection',
			onClick: evt => {
				let selectedItem = this.#listBox.getSelectedItem();
				if (selectedItem) this.testConnection(selectedItem);
			}
		});

		// Dialog > Test Result Cell
		let testResultBar = new DCStatusBar({ in: testResultCell });
		this.#testResultCell = testResultBar.addItem({
			width: '100%',
			classes: ['text']
		});

		// DB Selector
		this.#dbSelector = new DCDropDown({ in: widgetCell });
		for (let name in this.#connections) {
			this.#dbSelector.addItem({ text: name });
		}
		if (this.#dbSelector.children.length > 0) this.#dbSelector.addItem({});
		this.#manageItem = this.#dbSelector.addItem({ text: 'Manage Connections...' });
		this.#currentSelectorItem = null;
		this.#dbSelector.addEventListener('itemSelected', evt => {
			this.connect(evt.detail.item);
		});
	}

	static addEventListener(evtName, listenerFn)
	{
		if (!(evtName in this.#eventListeners)) this.#eventListeners[evtName] = [];
		this.#eventListeners[evtName].push(listenerFn);
	}

	static addConnection()
	{
		if (this.#listBox.itemBeingRenamed) return;
		let item = this.#listBox.addItem({ text: '' });
		this.#listBox.setSelectedItem(item);
		this.renameConnection(item);
	}

	static removeConnection(item)
	{
		this.#infoCell.textContent = '';
		this.#infoCell.contentEditable = false;
		delete this.#connections[item.textContent];
		for (let checkItem of this.#dbSelector.children) {
			if (checkItem.tagName == 'OPTION' && checkItem.textContent == item.textContent) {
				if (checkItem.selected) DS.cmd('disconnect');
				this.#currentSelectorItem = null;
				this.#dbSelector.removeItem(checkItem);
			}
		}
		if (this.#dbSelector.children.length == 2) this.#dbSelector.children[0].detach();
		item.remove();
	}

	static renameConnection(item)
	{
		item.rename(evt => {
			const oldName = evt.previousText;
			const newName = item.textContent;
			let newConnections = {};
			for (let key in this.#connections) {
				newConnections[key !== oldName ? key : newName] = this.#connections[key];
			}
			this.#connections = newConnections;
			let separator = null;
			for (let item of this.#dbSelector.children) {
				if (item.tagName == 'OPTION' && item.textContent == oldName) {
					item.textContent = newName;
					return;
				} else if (item.tagName == 'HR') {
					separator = item;
					break;
				}
			}
			if (!separator) {
				separator = this.#dbSelector.addItem({ before: this.#manageItem });
			}
			this.#dbSelector.addItem({ text: newName, before: separator });
		});
	}

	static updateConnectionOrder()
	{
		let newConnections = {};
		let separator = null;
		let selectedItem = this.#dbSelector.getSelectedItem();
		let selectedName = selectedItem ? selectedItem.textContent : null;
		while (this.#dbSelector.firstChild) {
			if (this.#dbSelector.firstChild.tagName == 'HR') {
				separator = this.#dbSelector.firstChild;
				break;
			}
			this.#dbSelector.firstChild.detach();
		}
		for (let item of this.#listBox.children) {
			let name = item.textContent;
			newConnections[name] = this.#connections[name];
			let selectorItem = this.#dbSelector.addItem({ text: name, before: separator });
			if (name == selectedName) {
				selectorItem.selected = true;
				this.#currentSelectorItem = selectorItem;
			}
		}
		this.#connections = newConnections;
		if (!selectedName) this.#dbSelector.setSelectedItem();
	}

	static displayConnection({ previousItem, item })
	{
		this.#testResultCell.textContent = '';
		if (previousItem) this.#connections[previousItem.textContent] = this.#infoCell.textContent;
		this.#infoCell.contentEditable = 'plaintext-only';
		this.#infoCell.textContent = this.#connections[item.textContent];
		this.#infoCell.focus();
	}

	static testConnection(item)
	{
		if (this.#inTest) return;
		this.#inTest = true;
		this.#testResultCell.classList.remove('success', 'failure');
		this.#testResultCell.textContent = 'Awaiting response...';
		DS.cmd('connect', { odbcString: this.#infoCell.textContent, testOnly: true }, () => {
			this.#testResultCell.textContent = 'Connection successful';
			this.#testResultCell.classList.remove('failure');
			this.#testResultCell.classList.add('success');
			this.#inTest = false;
		}, errorMsg => {
			this.#testResultCell.textContent = errorMsg;
			this.#testResultCell.classList.remove('success');
			this.#testResultCell.classList.add('failure');
			this.#inTest = false;
		});
	}

	static connect(itemOrConnectionName)
	{
		let item;
		if (typeof itemOrConnectionName === 'string') {
			item = this.#dbSelector.getItemByText(itemOrConnectionName);
			if (!item) return;
		} else {
			item = itemOrConnectionName;
		}
		this.#dbSelector.setSelectedItem();
		if (item == this.#manageItem) {
			this.#odbcDialog.open();
			this.#dbSelector.setSelectedItem(this.#currentSelectorItem);
			return;
		}
		let statusItem = this.#dbSelector.addItem({ text: 'connecting...' });
		this.#dbSelector.setSelectedItem(statusItem);
		this.#dbSelector.disabled = true;
		this.#currentSelectorItem = null;
		DS.cmd('connect', { odbcString: this.#connections[item.textContent] }, () => {
			this.#dbSelector.disabled = false;
			this.#dbSelector.setSelectedItem(item);
			this.#currentSelectorItem = item;
			statusItem.detach();
			if ('connected' in this.#eventListeners) {
				this.#eventListeners.connected.forEach(listenerFn => listenerFn({ connectionName: item.textContent }));
			}
		}, errorMsg => {
			statusItem.detach();
			this.#dbSelector.setSelectedItem();
			this.#dbSelector.disabled = false;
			alert(errorMsg);
		});
	}

	static getCurrentConnectionName()
	{
		if (!this.#dbSelector) return null;
		let value = this.#dbSelector.getValue();
		return value.length > 0 && value !== 'connecting...' ? value : null;
	}
}