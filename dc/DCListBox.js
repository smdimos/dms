class DCListBox extends DCControl
{
	itemSettings = {
		allowDuplicates: false,
		maxTextLength: null,
		rearrangeable: false
	};
	#itemTemplate = {};
	#itemsByText = {};
	#selectedItem = null;
	#contextMenuEntries;
	itemBeingRenamed = null;
	#itemBeingDragged;
	#lastCursorY;

	constructor(params)
	{
		super(params);
		for (let key in this.itemSettings) {
			if (key in params) this.itemSettings[key] = params[key];
		}
		if (this.itemSettings.rearrangeable) {
			this.addEventListener('dragstart', evt => evt.stopPropagation());
			this.addEventListener('dragenter', evt => evt.preventDefault());
			this.addEventListener('dragover', evt => evt.preventDefault());
		}
		if (params.contextMenu) this.#contextMenuEntries = params.contextMenu;
		if (params.onItemSelected) this.addEventListener('itemSelected', params.onItemSelected);
	}

	clear()
	{
		if (this.itemBeingRenamed) this.itemBeingRenamed = null;
		super.clear();
	}

	setItemTemplate(params)
	{
		this.#itemTemplate = params;
	}
	
	addItem({ icon, text, onDoubleClick, contextMenu, onSelected })
	{
		// Context menu
		let contextMenus = [];
		if (contextMenu) contextMenus.push(contextMenu);
		if (this.#itemTemplate.contextMenu) contextMenus.push(this.#itemTemplate.contextMenu);
		if (this.#contextMenuEntries) contextMenus.push(this.#contextMenuEntries);

		// Create item
		let item = new DCItem({
			in: this,
			icon: icon || this.#itemTemplate.icon,
			text: text || this.#itemTemplate.text,
			contextMenu: contextMenus.length > 0 ? contextMenus : null,
			draggable: this.itemSettings.rearrangeable,
			onClick: evt => this.setSelectedItem(evt.target),
			onSelected: onSelected || this.#itemTemplate.onSelected,
			onDoubleClick: onDoubleClick || this.#itemTemplate.onDoubleClick
		});
		this.#itemsByText[item.textContent] = item;

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
		});
		item.addEventListener('removed', evt => {
			if (item == this.#selectedItem) {
				this.#selectedItem = null;
				if (this.itemBeingRenamed) this.itemBeingRenamed = null;
			}
			if (item.textContent in this.#itemsByText) delete this.#itemsByText[item.textContent];
		});

		// Rearrangement
		if (this.itemSettings.rearrangeable) {
			item.addEventListener('drag', this.#onItemDragged.bind(this));
			item.addEventListener('dragend', this.#onItemDropped.bind(this));
		}

		return item;
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
	
	setSelectedItem(item)
	{
		if (this.itemBeingRenamed) return;
		let previousItem = null;
		if (this.#selectedItem) {
			if (item == this.#selectedItem) return;
			previousItem = this.#selectedItem;
			this.#selectedItem.classList.remove('selected');
		}
		if (item && !(item instanceof DCItem)) {
			item = this.childNodes[item.at];
		}
		if (item) {
			item.classList.add('selected');
			item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			this.#selectedItem = item;
			if (item.onSelected) item.onSelected({ item: item, previousItem: previousItem });
		} else {
			this.#selectedItem = null;
		}
		this.dispatchEvent(new CustomEvent('itemSelected', { detail: { item: item, previousItem: previousItem } }));
	}

	#onItemDragged(evt)
	{
		if (!this.#itemBeingDragged) {
			evt.dataTransfer.effectAllowed = 'move';
			this.#lastCursorY = evt.screenY;
			this.#itemBeingDragged = evt.target;
			this.classList.add('in-drag');
			this.#itemBeingDragged.classList.add('being-dragged');
		}
		let d = evt.screenY - this.#lastCursorY;
		if (d == 0) return;
		let isDown = d > 0;
		this.#lastCursorY = evt.screenY;
		let dragOverElement = document.elementFromPoint(evt.clientX, evt.clientY);
		let itemBeingDragged = this.#itemBeingDragged;
		if (dragOverElement.parentElement != this) return;
		if (itemBeingDragged != dragOverElement && dragOverElement.tagName == 'DC-ITEM') {
			let pushOverElement = isDown ? dragOverElement.nextSibling : dragOverElement;
			dragOverElement.style.transform = `translateY(${isDown ? '-100%' : '100%'})`;
			dragOverElement.style.transition = "transform .2s";
			dragOverElement.ontransitionend = () => {
				dragOverElement.style.transition = "";
				dragOverElement.style.transform = "";
				this.insertBefore(itemBeingDragged, pushOverElement);
				dragOverElement.ontransitionend = null;
			};
		};
	}

	#onItemDropped(evt)
	{
		this.#itemBeingDragged.classList.remove('being-dragged');
		this.#itemBeingDragged = null;
		this.#lastCursorY = null;
		this.classList.remove('in-drag');
		this.dispatchEvent(new CustomEvent('itemsRearranged', { detail: {  } }));
	}
}

window.customElements.define('dc-listbox', DCListBox);