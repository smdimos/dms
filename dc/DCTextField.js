class DCTextField extends DCControl
{
	#inputElement;
	#dataList;

	constructor(params)
	{
		super(params);
		this.#inputElement = document.createElement('input');
		this.#inputElement.type = 'text';
		if (params.size) this.#inputElement.size = params.size;
		this.appendChild(this.#inputElement);
		if (params.onEnter) this.#inputElement.addEventListener('keydown', evt => {
			if (evt.key != 'Enter') return;
			evt.preventDefault();
			params.onEnter({ field: this });
		});
		if (params.value) this.setValue(params.value);
		if (params.onInput) this.#inputElement.addEventListener('input', params.onInput);
	}

	isEnabled()
	{
		return !this.#inputElement.disabled;
	}

	setEnabled(enabled)
	{
		this.#inputElement.disabled = !enabled;
	}

	getValue()
	{
		return this.#inputElement.value ? this.#inputElement.value : null;
	}

	setValue(value)
	{
		this.#inputElement.value = value;
	}

	focus()
	{
		this.#inputElement.focus();
	}

	blur()
	{
		this.#inputElement.blur();
	}

	setOptions(values)
	{
		if (!this.#dataList) {
			this.#dataList = DCControl.create('datalist', {
				in: this,
				id: 'dl-' + Math.random().toString(36).substr(2, 9)
			});
			this.#inputElement.setAttribute('list', this.#dataList.id);
		}
		this.#dataList.clear();
		for (let value of values) {
			let option = DCControl.create('option', {
				in: this.#dataList,
				value: value
			});
		}
	}
}

window.customElements.define('dc-textfield', DCTextField);