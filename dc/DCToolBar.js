class DCToolBar extends DCControl
{
	#selectedItemByChoiceGroup = {};

	constructor(params)
	{
		super(params);
		this.style.gridTemplateColumns = '';
		this.style.gridTemplateRows = '100%';
		this.onmousedown = evt => evt.preventDefault();
	}
	
	addItem({icon, text, tooltip, choiceGroup, classes, expand, enabled, before, menu, onClick, onMiddleClick})
	{
		// Create item
		let item = new DCItem({
			in: this,
			icon: icon,
			text: text,
			tooltip: tooltip,
			classes: classes,
			enabled: typeof enabled !== 'undefined' ? enabled : true,
			onClick: evt => {
				if (!item.isEnabled) return;
				if (choiceGroup) {
					if (this.#selectedItemByChoiceGroup[choiceGroup]) {
						if (item == this.#selectedItemByChoiceGroup[choiceGroup]) return;
						this.#selectedItemByChoiceGroup[choiceGroup].classList.remove('active');
					}
					item.classList.add('active');
					this.#selectedItemByChoiceGroup[choiceGroup] = item;
				}
				if (onClick) onClick(evt);
				if (DCControl.focusElement && !menu) DCControl.focusElement.focus();
			},
			onMiddleClick: onMiddleClick
		});

		// Index item by choice group
		if (choiceGroup) item.dataset.choiceGroup = choiceGroup;

		// Append item
		if (before) this.insertBefore(item, before);

		// Add isSelected method
		item.isSelected = () => item.classList.contains('active');

		// Item remove method
		item.remove = () => {
			if (choiceGroup && item == this.#selectedItemByChoiceGroup[choiceGroup]) {
				this.#selectedItemByChoiceGroup[choiceGroup] = null;
			}
			item.detach();
		};

		// Handle item being disabled
		if (choiceGroup) item.addEventListener('disabled', evt => {
			if (item == this.#selectedItemByChoiceGroup[choiceGroup]) {
				item.classList.remove('active');
				this.#selectedItemByChoiceGroup[choiceGroup] = null;
			}
		});

		// Register text node
		if (text) item.textNode = item.firstChild;

		// Prevent mousedown propagation
		item.onmousedown = evt => evt.stopPropagation();

		// Context menu
		if (typeof menu !== 'undefined') {
			new DCText({
				in: item,
				className: 'caret'
			});
			item.menu = new DCContextMenu({ sourceControl: item, items: menu });
			item.addEventListener('click', evt => {
				if (!item.menu.isConnected) {
					evt.stopPropagation();
					let rect = item.getBoundingClientRect();
					item.menu.show({ x: rect.left, y: rect.bottom });
				}
			});
			item.addEventListener('mousedown', evt => evt.stopPropagation());
		}
		
		// Reflow & return
		item.width = !expand ? 'min-content' : '1fr';
		this.#reflow();
		return item;
	}

	addSeparator()
	{
		let separator = new DCView({ in: this, className: 'separator' });
		separator.width = 'min-content';
		this.#reflow();
		return separator;
	}

	#reflow()
	{
		let colWidths = [];
		for (let childNode of this.childNodes) colWidths.push(childNode.width);
		this.style.gridTemplateColumns = colWidths.join(' ');
	}

	getItemsByChoiceGroup(choiceGroup)
	{
		return this.querySelectorAll(`[data-choice-group="${choiceGroup}"]`);
	}

	getSelectedItemByChoiceGroup(choiceGroup)
	{
		return this.#selectedItemByChoiceGroup[choiceGroup];
	}
}

window.customElements.define('dc-toolbar', DCToolBar);