class DCContextMenu extends DCControl
{
	static #currentMenu;

	#dismissListener;
	#ownContextMenuListener;
	#sourceControl;

	constructor(params)
	{
		super();
		let itemSets = params.items.constructor !== Array ? [params.items] : params.items;
		for (const [i, itemSet] of itemSets.entries()) {
			for (const [text, action] of Object.entries(itemSet)) {
				new DCItem({ in: this, text: text, onClick: evt => action({ sourceControl: this.#sourceControl }) });
			}
			if (i !== itemSets.length - 1) {
				new DCView({ in: this, className: 'separator' });
			}
		}
		this.#sourceControl = params.sourceControl;
		this.#dismissListener = evt => {
			if (evt.target == this) return;
			if (evt.target.parentElement && evt.target.parentElement == this && evt.target.tagName == 'DC-VIEW') return;
			this.dismiss(evt);
		}
		this.#ownContextMenuListener = evt => {
			evt.preventDefault();
			evt.stopPropagation();
		}
	}

	show({x, y})
	{
		this.style.left = `${x}px`;
		this.style.top = `${y}px`;
		if (DCContextMenu.#currentMenu) DCContextMenu.#currentMenu.dismiss({ type: 'programmatic' });
		if (DCControl.focusElement) DCControl.focusElement.blur();
		document.body.appendChild(this);
		DCContextMenu.#currentMenu = this;
		let renderedRect = this.getBoundingClientRect();
		let offsetX = document.body.clientWidth - x - renderedRect.width;
		if (offsetX < 0) this.style.left = `${x + offsetX}px`;
		let offsetY = document.body.clientHeight - y - renderedRect.height;
		if (offsetY < 0) this.style.top = `${y + offsetY}px`;
		document.addEventListener('click', this.#dismissListener);
		document.addEventListener('contextmenu', this.#dismissListener);
		this.addEventListener('contextmenu', this.#ownContextMenuListener);
		this.#sourceControl.classList.add('menu-active');
	}

	dismiss(evt)
	{
		document.removeEventListener('click', this.#dismissListener);
		document.removeEventListener('contextmenu', this.#dismissListener);
		this.removeEventListener('contextmenu', this.#ownContextMenuListener);
		this.detach();
		DCContextMenu.#currentMenu = null;
		this.#sourceControl.classList.remove('menu-active');
		if (DCControl.focusElement) DCControl.focusElement.focus();
	}

	static dismissCurrent()
	{
		if (DCContextMenu.#currentMenu) DCContextMenu.#currentMenu.dismiss({ type: 'programmatic' });
	}
}

window.customElements.define('dc-contextmenu', DCContextMenu);