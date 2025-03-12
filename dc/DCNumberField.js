class DCNumberField extends DCControl
{
	#inputElement;
	#allowDecimal = true;
	#allowNegative = true;
	#minValue;
	#maxValue;

	constructor(params)
	{
		super(params);
		this.#inputElement = document.createElement('input');
		this.#inputElement.type = 'number';
		if ('allowDecimal' in params) this.#allowDecimal = params.allowDecimal;
		if ('allowNegative' in params) {
			this.#allowNegative = params.allowNegative
			if (!this.#allowNegative) this.#inputElement.min = 0;
		};
		if ('min' in params) {
			this.#inputElement.min = params.min;
			this.#minValue = params.min;
		}
		if ('max' in params) {
			this.#inputElement.max = params.max;
			this.#maxValue = params.max;
		}
		if ('step' in params) this.#inputElement.step = params.step;
		this.#inputElement.onkeypress = this.validateKey.bind(this);
		this.#inputElement.onblur = this.validateInput.bind(this);
		this.appendChild(this.#inputElement);
		if (params.onEnter) this.#inputElement.addEventListener('keydown', evt => {
			if (evt.key != 'Enter') return;
			evt.preventDefault();
			params.onEnter({ field: this });
		});
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
		return !isNaN(this.#inputElement.valueAsNumber) ? this.#inputElement.valueAsNumber : null;
	}

	setValue(value)
	{
		this.#inputElement.value = value;
	}

	focus()
	{
		this.#inputElement.focus();
	}

	validateKey(evt)
	{
		if (!this.#allowDecimal && evt.charCode == 46) evt.preventDefault();
		if (!this.#allowNegative && evt.charCode == 45) evt.preventDefault();
	}

	validateInput(evt)
	{
		if (typeof this.#minValue !== 'undefined' && this.#inputElement.valueAsNumber < this.#minValue) this.setValue(this.#minValue);
		if (typeof this.#maxValue !== 'undefined' && this.#inputElement.valueAsNumber > this.#maxValue) this.setValue(this.#maxValue);
	}
}

window.customElements.define('dc-numberfield', DCNumberField);