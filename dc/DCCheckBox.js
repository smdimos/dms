class DCCheckBox extends DCControl
{
	#inputElement;

	constructor(params)
	{
        // Initialize control
        let textNode;
        if (params.text) {
            textNode = document.createTextNode(params.text);
            delete params.text;
        }
		super(params);

        // Label element
        let labelElement = DCControl.create('label', { in: this });

        // Input element
		this.#inputElement = DCControl.create('input', { in: labelElement });
		this.#inputElement.type = 'checkbox';
		
        // Text node
        if (textNode) labelElement.appendChild(textNode);

        // Preset value
        if (params.value) this.setValue(params.value);

        // Toggle event
        if (params.onToggle) this.#inputElement.addEventListener('change', evt => {
            params.onToggle(this.#inputElement.checked);
        });
	}

	getValue()
	{
		return this.#inputElement.checked;
	}

	setValue(value)
	{
		if (typeof value !== "boolean") return console.error('Non-boolean value ignored.');
		this.#inputElement.checked = value;
	}

    isEnabled()
    {
        return !this.#inputElement.disabled;
    }

    setEnabled(enabled)
    {
        this.#inputElement.disabled = !enabled;
    }
}

window.customElements.define('dc-checkbox', DCCheckBox);