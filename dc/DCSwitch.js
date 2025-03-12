class DCSwitch extends DCControl
{
	#slider;
	#value = false;

	constructor(params)
	{
		super(params);
		this.tabIndex = 0;
		this.#slider = new DCControl({ in: this, className: 'slider' });
		this.addEventListener('click', this.toggle.bind(this, true));
		this.addEventListener('keydown', evt => {
			if (evt.key != ' ') return;
			evt.preventDefault();
			this.toggle(true);
		});
		if (params.onEnter) this.addEventListener('keydown', evt => {
			if (evt.key != 'Enter') return;
			evt.preventDefault();
			params.onEnter({ field: this });
		});
	}

	toggle(interactive = false)
	{
		this.#value = !this.#value;
		if (this.#value) this.classList.add('on');
		else this.classList.remove('on');
		if (interactive) this.dispatchEvent(new CustomEvent('toggle', { detail: { value: this.#value } }));
	}

	getValue()
	{
		return this.#value;
	}

	setValue(value)
	{
		if (typeof value !== "boolean") return console.error('Non-boolean value ignored.');
		if (value !== this.#value) this.toggle();
	}
}

window.customElements.define('dc-switch', DCSwitch);