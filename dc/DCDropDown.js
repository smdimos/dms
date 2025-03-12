class DCDropDown extends DCControl
{
	#selectElement;

	constructor(params)
	{
		super(params);
		this.#selectElement = document.createElement('select');
		this.appendChild(this.#selectElement);
		this.#selectElement.addEventListener('change', evt => {
			let selectedIndex = this.#selectElement.selectedIndex;
			let selectedItem = selectedIndex > -1 ? this.#selectElement.options[selectedIndex] : null;
			this.dispatchEvent(new CustomEvent('itemSelected', { detail: { item: selectedItem } }));
		});
		if (params.onEnter) this.#selectElement.addEventListener('keydown', evt => {
			if (evt.key != 'Enter') return;
			evt.preventDefault();
			params.onEnter({ field: this });
		});
	}

	get disabled()
	{
		return this.#selectElement.disabled;
	}

	set disabled(disabled)
	{
		this.#selectElement.disabled = disabled;
	}

	get children()
	{
		return this.#selectElement.children;
	}

	get firstChild()
	{
		return this.#selectElement.firstChild;
	}

	focus()
	{
		this.#selectElement.focus();
	}
	
	addItem({text, value, before = null, color})
	{
		let lastSelectedIndex = this.#selectElement.selectedIndex;
		let item;
		if (text) {
			item = document.createElement('option');
			item.textContent = text;
			item.value = typeof value !== 'undefined' ? value : text;
			if (color) item.style.backgroundColor = color;
		} else {
			item = document.createElement('hr');
		}
		if (!before) this.#selectElement.append(item);
		else this.#selectElement.insertBefore(item, before);
		this.#selectElement.selectedIndex = lastSelectedIndex;
		return item;
	}

	getItemByText(text)
	{
		for (let item of this.children) {
			if (item.textContent == text) return item;
		}
		return null;
	}

	getSelectedItem()
	{
		let selectedIndex = this.#selectElement.selectedIndex;
		return selectedIndex > -1 ? this.#selectElement.options[selectedIndex] : null;
	}
	
	setSelectedItem(item)
	{
		if (item) this.#selectElement.selectedIndex = item.index;
		else this.#selectElement.selectedIndex = -1;
	}

	getValue()
	{
		return this.#selectElement.value;
	}

	setValue(value)
	{
		this.#selectElement.value = value;
	}

	removeItem(item)
	{
		let selectedItem = null;
		for (let checkItem of this.#selectElement.children) {
			if (checkItem.selected && checkItem != item) selectedItem = checkItem;
		}
		item.detach();
		this.#selectElement.selectedIndex = selectedItem ? selectedItem.index : -1;
	}
}

window.customElements.define('dc-dropdown', DCDropDown);