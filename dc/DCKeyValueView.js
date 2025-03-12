class DCKeyValueView extends DCControl
{
	#itemContainer;
	#columnize = false;
	#static = false;
	#fields = {};
	#stateValuesJSON;
	
	constructor(params)
	{
		super(params);
		if (params.columnize) this.#columnize = params.columnize;
		this.#static = this.classList.contains('static');
		this.#itemContainer = new DCView({ in: this });
	}

	addItem({name, label, type, options, show = true, size, value, params, styles, insteadOf, onChange})
	{
		// Item
		let item = new DCItem({ in: this.#itemContainer, show: show, styles: styles });
		item.keyCell = new DCView({ in: item, className: 'label', text: label || name });
		item.valueCell = new DCView({ in: item, className: 'field' });

		// Replace
		if (insteadOf) {
			delete this.#fields[insteadOf.field.name];
			insteadOf.replaceWith(item);
		}

		// Field
		if (!this.#static) {
			if (!params) params = {};
			params.in = item.valueCell;
			params.onEnter = evt => {
				let nextItem = evt.field.parentElement.parentElement.nextSibling;
				if (nextItem) nextItem.lastChild.firstChild.focus();
				else this.dispatchEvent(new CustomEvent('complete'));
			};
			let field;
			switch(type) {
				
				case 'list':
					field = new DCDropDown(params);
					for (let option of options) field.addItem({ text: option });
					if (onChange) field.addEventListener('itemSelected', evt => {
						if (evt.detail.item) onChange(evt.detail.item.value);
					});
					break;
					
				case 'boolean':
					field = new DCSwitch(params);
					if (onChange) field.addEventListener('toggle', evt => {
						onChange(evt.detail.value);
					});
					item.toggle = interactive => field.toggle(interactive);
					break;
					
				case 'number':
					field = new DCNumberField(params);
					break;
					
				case 'integer':
					params.allowDecimal = false;
					field = new DCNumberField(params);
					break;
					
				case 'text':
					field = new DCTextField(params);
					break;
				
			}
			field.type = type;
			field.item = item;
			field.name = name;
			item.field = field;
			this.#fields[name] = field;
			if (value != null) field.setValue(value);
		}

		// Update column layout
		if (this.#columnize) this.updateColumns();

		// Item events
		item.addEventListener('removed', evt => {
			delete this.#fields[name];
			if (this.#columnize) this.updateColumns();
		});

		return item;
	}

	getFields()
	{
		return this.#fields;
	}

	getField(fieldName)
	{
		return this.#fields[fieldName];
	}

	setData(data)
	{
		for (const key in data) this.#fields[key].setValue(data[key]);
	}

	getData()
	{
		let data = {};
		for (const key in this.#fields) data[key] = this.#fields[key].getValue();
		return data;
	}

	isModified()
	{
		return JSON.stringify(this.getData()) != this.#stateValuesJSON;
	}

	initState()
	{
		if (!this.isModified()) return;
		let changedData = this.getData();
		this.#stateValuesJSON = JSON.stringify(changedData);
	}

	updateColumns()
	{
		this.style.columnCount = '';
		if (this.#itemContainer.children.length == 0) return;
		let kvvWidth = this.getBoundingClientRect().width;
		let itemWidth = this.#itemContainer.firstChild.getBoundingClientRect().width;
		if (kvvWidth > 0 && itemWidth > 0) {
			if (this.#static) itemWidth += 18;
			let colCount = Math.floor(kvvWidth / itemWidth);
			let itemCount = this.#itemContainer.children.length;
			if (itemCount <= 6 && colCount > 1) colCount = 1;
			else if (itemCount <= 12 && colCount > 2) colCount = 2;
			else if (itemCount <= 18 && colCount > 3) colCount = 3;
			else if (colCount > itemCount) colCount = itemCount;
			this.style.columnCount = colCount;
		}
	}
}

window.customElements.define('dc-keyvalueview', DCKeyValueView);