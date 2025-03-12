class DCDialog extends DCControl
{
	#dialogElement;
	#grid;
	
	constructor(params)
	{
		super(params);
		this.#dialogElement = document.createElement('dialog');
		this.#dialogElement.addEventListener('close', evt => {
			this.dispatchEvent(new CustomEvent('close', { detail: {  } }));
		});
		this.appendChild(this.#dialogElement);
		this.#grid = new DCGrid({
			in: this.#dialogElement,
			rows: ['auto', '1fr'],
			cols: ['auto', '1fr', 'auto'],
			cellSpans: [{ cell: [1,0], colSpan: 3 }]
		});
		let iconCell, closeCell;
		[iconCell, this.header, closeCell, this.body] = this.#grid.getCells();
		iconCell.setParams({
			classes: ['titlebar', 'icon'],
			icon: params.icon || 'window'
		});
		this.header.setParams({
			text: params.title || '',
			classes: ['titlebar']
		});
		closeCell.setParams({
			classes: ['titlebar', 'button'],
			icon: 'x',
			tooltip: 'Close',
			onClick: evt => {
				evt.stopPropagation();
				this.close();
			}
		});
	}

	open()
	{
		this.#dialogElement.showModal();
	}

	close()
	{
		this.#dialogElement.close();
	}
}

window.customElements.define('dc-dialog', DCDialog);