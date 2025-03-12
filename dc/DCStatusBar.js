class DCStatusBar extends DCControl
{
	#itemWidths = [];
	#selectedItemByChoiceGroup = {};

	constructor(params)
	{
		super(params);
		this.style.gridTemplateColumns = '';
		this.style.gridTemplateRows = '100%';
		this.onmousedown = evt => evt.preventDefault();
	}
	
	addItem({width, classes, styles, icon, text, tooltip, choiceGroup, onClick, active})
	{
		this.#itemWidths.push(width);
		let item = new DCItem({
			in: this,
			classes: classes,
			styles: styles,
			icon: icon,
			text: text,
			tooltip: tooltip,
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
				if (DCControl.focusElement) DCControl.focusElement.focus();
			}
		});
		this.style.gridTemplateColumns = this.#itemWidths.join(' ');
		if (active) item.click();
		return item;
	}
}

window.customElements.define('dc-statusbar', DCStatusBar);