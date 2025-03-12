class DCPager extends DCControl
{
	#selectedItem = null;
	#rearrangeable = false;
	#itemBeingDragged;
	#lastCursorX;
	#lastPushOverElement = -1;

	constructor(params)
	{
		super(params);
		this.style.gridTemplateColumns = '';
		this.style.gridTemplateRows = '100%';
		this.#rearrangeable = 'rearrangeable' in params && params.rearrangeable;
		if (this.#rearrangeable) {
			this.addEventListener('dragstart', evt => evt.stopPropagation());
			this.addEventListener('dragenter', evt => evt.preventDefault());
			this.addEventListener('dragover', evt => evt.preventDefault());
		}
	}
	
	addItem({icon, text, node, onMiddleClick})
	{
		// Create item
		let item = new DCItem({
			in: this,
			icon: icon,
			text: text,
			draggable: this.#rearrangeable,
			onClick: evt => this.setSelectedItem(evt.target),
			onMiddleClick: onMiddleClick
		});
		if (node) item.node = node;

		// Add isSelected method
		item.isSelected = () => item == this.#selectedItem;

		// Item remove method
		item.remove = () => {
			if (item == this.#selectedItem) this.setSelectedItem(null);
			item.detach();
		};

		// Add rearrangement events
		if (this.#rearrangeable) {
			item.addEventListener('drag', this.#onItemDragged.bind(this));
			item.addEventListener('dragend', this.#onItemDropped.bind(this));
		}

		// Reflow & return
		this.style.gridTemplateColumns = Array(this.childNodes.length).fill('min-content').join(' ');
		return item;
	}

	getSelectedItem()
	{
		return this.#selectedItem;
	}
	
	setSelectedItem(item)
	{
		let previousItem = null;
		if (this.#selectedItem) {
			previousItem = this.#selectedItem;
			this.#selectedItem.classList.remove('active');
			if ('node' in this.#selectedItem) this.#selectedItem.node.hide();
		}
		if (item && !(item instanceof DCItem)) {
			item = this.childNodes[item.at];
		}
		if (item) {
			item.classList.add('active');
			item.scrollIntoView();
			if ('node' in item) item.node.show();
			this.#selectedItem = item;
		} else {
			this.#selectedItem = null;
		}
		this.dispatchEvent(new CustomEvent('itemSelected', { detail: { item: this.#selectedItem, previousItem: previousItem } }));
	}

	#onItemDragged(evt)
	{
		if (!this.#itemBeingDragged) {
			evt.dataTransfer.effectAllowed = 'move';
			this.#lastCursorX = evt.screenX;
			this.#itemBeingDragged = evt.target;
			this.classList.add('in-drag');
			this.#itemBeingDragged.classList.add('being-dragged');
		}
		let d = evt.screenX - this.#lastCursorX;
		if (d == 0) return;
		let isRight = d > 0;
		this.#lastCursorX = evt.screenX;
		let dragOverElement = document.elementFromPoint(evt.clientX, evt.clientY);
		let itemBeingDragged = this.#itemBeingDragged;
		let rect = itemBeingDragged.getBoundingClientRect();
		if (dragOverElement.parentElement != this) return;
		if (itemBeingDragged != dragOverElement && dragOverElement.tagName == 'DC-ITEM') {
			let pushOverElement = isRight ? dragOverElement.nextSibling : dragOverElement;
			if (pushOverElement == this.#lastPushOverElement || pushOverElement == itemBeingDragged) return;
			this.#lastPushOverElement = pushOverElement;
			let translateXSize = rect.width * (isRight ? -1 : 1);
			dragOverElement.style.transform = `translateX(${translateXSize}px)`;
			dragOverElement.style.transition = "transform 0.2s";
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
		this.#lastCursorX = null;
		this.classList.remove('in-drag');
		this.dispatchEvent(new CustomEvent('itemsRearranged', { detail: {  } }));
	}
}

window.customElements.define('dc-pager', DCPager);