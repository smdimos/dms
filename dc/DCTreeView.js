class DCTreeView extends DCControl
{
	itemSettings = {
		allowDuplicates: false,
		order: false
	};
	#itemTemplate = {};
	#itemsByText = {};
	#selectedItem = null;
	itemBeingRenamed = null;

	constructor(params)
	{
		super(params);
		if (params.order) this.itemSettings.order = params.order;
		this.tabIndex = -1;
		this.addEventListener('keydown', this.navigate.bind(this));
	}

	setItemTemplate(params)
	{
		this.#itemTemplate = params;
	}
	
	addItem({parentItem = this, icon, text, tooltip, contextMenu, onDoubleClick})
	{
		// Create toggle and container within parent item if needed
		if (!parentItem.nodeContainer) {
			parentItem.toggleCtrl = new DCControl({
				in: parentItem,
				classes: ['toggle'],
				onClick: evt => {
					evt.stopPropagation();
					if (!parentItem.nodeContainer.isConnected) {
						parentItem.open();
					} else {
						parentItem.close();
					}
					DCContextMenu.dismissCurrent();
				}
			});
			parentItem.nodeContainer = new DCView({});
			parentItem.nodeContainer.parentItem = parentItem;
			if (parentItem == this) parentItem.appendChild(parentItem.nodeContainer);
		}

		// Item (node)
		let item = new DCItem({ in: parentItem.nodeContainer, itemManager: this });
		this.#itemsByText[text] = item;

		// Label
		item.textNode = new DCText({
			in: item,
			icon: icon || this.#itemTemplate.icon,
			text: text,
			tooltip: tooltip,
			contextMenu: contextMenu || this.#itemTemplate.contextMenu,
			onClick: evt => {
				evt.stopPropagation();
				if (item.textNode.contentEditable == 'plaintext-only') return;
				DCContextMenu.dismissCurrent();
				item.select();
			},
			onDoubleClick: evt => {
				evt.stopPropagation();
				if (onDoubleClick) onDoubleClick(this.#selectedItem);
			}
		});

		// Item methods
		item.addItem = params => {
			params.parentItem = item;
			return this.addItem(params);
		};
		item.getItem = params => {
			params.parentItem = item;
			return this.getItem(params);
		};
		item.getItems = () => {
			let items = [];
			let getChildItems = item => {
				if (!item.nodeContainer) return;
				for (let childItem of item.nodeContainer.children) {
					items.push(childItem);
					getChildItems(childItem);
				}
			};
			getChildItems(item);
			return items;
		};
		item.getText = () => {
			return item.textNode.textContent;
		};
		item.setIcon = icon => {
			return item.textNode.setIcon(icon);
		};
		item.select = (params = {}) => {
			let previousItem = null;
			if (this.#selectedItem) {
				if (item == this.#selectedItem) return;
				previousItem = this.#selectedItem;
				this.#selectedItem.classList.remove('selected');
			}
			let checkElement = item;
			while (checkElement) {
				checkElement = checkElement.parentElement;
				if (checkElement.tagName == 'DC-VIEW' && !checkElement.isConnected) checkElement.parentItem.open();
				if (checkElement.tagName == 'DC-TREEVIEW') break;
			}
			item.classList.add('selected');
			if (params.focus) {
				this.focus();
				item.textNode.scrollIntoViewIfNeeded(true);
				item.textNode.focus();
			}
			this.#selectedItem = item;
			let eventDetail = Object.assign(params, { item: item, previousItem: previousItem });
			this.dispatchEvent(new CustomEvent('itemSelected', { detail: eventDetail }));
		};
		item.open = () => {
			if (!item.toggleCtrl || item.toggleCtrl.classList.contains('open')) return;
			item.appendChild(item.nodeContainer);
			item.toggleCtrl.classList.add('open');
		};
		item.close = () => {
			if (!item.toggleCtrl || !item.toggleCtrl.classList.contains('open')) return;
			item.toggleCtrl.classList.remove('open');
			item.nodeContainer.detach();
		};
		item.order = () => {
			return this.order(item);
		};

		// Item events
		item.addEventListener('renameStart', evt => {
			this.itemBeingRenamed = item;
		});
		item.addEventListener('renameComplete', evt => {
			const oldName = evt.detail.previousText;
			const newName = item.getText();
			if (newName == oldName) {
				this.itemBeingRenamed = null;
				return;
			}
			if (!this.itemSettings.allowDuplicates && this.getItemByText(newName, { not: item })) {
				return evt.preventDefault();
			}
			if (oldName in this.#itemsByText) delete this.#itemsByText[oldName];
			this.#itemsByText[newName] = item;
			this.itemBeingRenamed = null;
			if (this.itemSettings.order) parentItem.order();
		});
		item.addEventListener('removed', evt => {
			if (item == this.#selectedItem) {
				this.#selectedItem = null;
				if (this.itemBeingRenamed) this.itemBeingRenamed = null;
			}
			let removedItems = item.getItems();
			removedItems.push(item);
			for (let removedItem of removedItems) {
				let removedItemText = removedItem.getText();
				if (removedItemText in this.#itemsByText) delete this.#itemsByText[removedItemText];
			}
			if (parentItem.nodeContainer.children.length == 0) {
				parentItem.nodeContainer.remove();
				delete parentItem.nodeContainer;
				parentItem.toggleCtrl.remove();
				delete parentItem.toggleCtrl;
			}
		});

		// Order parent item
		if (this.itemSettings.order && text.length > 0) parentItem.order();

		return item;
	}

	getItem({parentItem = this, at})
	{
		if (typeof at === 'undefined') return null;
		return parentItem.nodeContainer.children[at];
	}

	getItemByText(text, params = {})
	{
		let item = this.#itemsByText[text];
		if (params.not && item == params.not) return null;
		return item;
	}

	getSelectedItem()
	{
		return this.#selectedItem;
	}

	order(item = this)
	{
		if (!item.nodeContainer) return;
		let childItems = {};
		for (let child of item.nodeContainer.children) childItems[child.getText()] = child;
		let orderedKeys = Object.keys(childItems).sort();
		for (let key of orderedKeys) {
			item.nodeContainer.appendChild(childItems[key]);
		}
	}

	navigate(evt)
	{
		if (this.itemBeingRenamed) return;
		if (!this.#selectedItem) return;
		switch(evt.key) {
			
			case 'ArrowUp':
				var sibling = this.#selectedItem.previousSibling;
				if (sibling) {
					var checkNode = sibling;
					while (checkNode.toggleCtrl && checkNode.toggleCtrl.classList.contains('open')) {
						checkNode = checkNode.lastChild.lastChild;
					}
					checkNode.select();
					checkNode.scrollIntoViewIfNeeded(false);
				} else {
					var parent = this.#selectedItem.parentNode.parentNode;
					if (parent.tagName == 'DC-ITEM') {
						parent.select();
						parent.scrollIntoViewIfNeeded(false);
					}
				}
				evt.preventDefault();
			break;
			
			case 'ArrowDown':
				if (this.#selectedItem.toggleCtrl && this.#selectedItem.toggleCtrl.classList.contains('open')) {
					var targetNode = this.#selectedItem.lastChild.firstChild;
					targetNode.select();
					targetNode.scrollIntoViewIfNeeded(false);
				} else {
					var checkNode = this.#selectedItem;
					while (!checkNode.nextSibling) {
						checkNode = checkNode.parentNode.parentNode;
						if (checkNode.tagName != 'DC-ITEM') return;
					}
					checkNode.nextSibling.select();
					checkNode.nextSibling.scrollIntoViewIfNeeded(false);
				}
				evt.preventDefault();
			break;
			
			case 'ArrowRight':
				this.#selectedItem.open();
				evt.preventDefault();
			break;
			
			case 'ArrowLeft':
				this.#selectedItem.close();
				evt.preventDefault();
			break;
			
		}
	}
}

window.customElements.define('dc-treeview', DCTreeView);