class DCControl extends HTMLElement
{
	static focusListener;
	static focusElement;

	constructor(params)
	{
		super();
		if (!DCControl.focusListener) {
			DCControl.focusListener = evt => {
				let element = evt.target;
				while (element.parentElement) {
					if (element.tagName == 'INPUT') break;
					if (element.tagName == 'DC-TOOLBAR' || element.tagName == 'DC-STATUSBAR' || element.tagName == 'DC-CONTEXTMENU') return;
					element = element.parentElement;
				}
				DCControl.focusElement = evt.target;
			};
			document.addEventListener('focusin', DCControl.focusListener);
		}
		if (!params) return;
		this.setParams(params);
	}
	
	setStyles(styles)
	{
		return Object.assign(this.style, styles);
	}
	
	show()
	{
		this.classList.remove('hidden');
		this.dispatchEvent(new CustomEvent('show'));
	}
	
	hide()
	{
		this.classList.add('hidden');
		this.dispatchEvent(new CustomEvent('hide'));
	}

	static create(elementType, params)
	{
		const element = document.createElement(elementType);
		if (params) element.setParams(params);
		return element;
	}
}

window.customElements.define('dc-control', DCControl);

HTMLElement.prototype.setParams = function(params)
{
	if (params.replaceContents && params.in) params.in.clear();
	if ('in' in params) params.in.appendChild(this);
	if (params.id) this.id = params.id;
	if (params.styles) Object.assign(this.style, params.styles);
	if ('icon' in params && params.icon) this.setIcon(params.icon);
	if ('onClick' in params) this.addEventListener('click', params.onClick);
	if ('onDoubleClick' in params) this.addEventListener('dblclick', params.onDoubleClick);
	this.addEventListener('auxclick', evt => {
		if (evt.which == 2) this.dispatchEvent(new CustomEvent('middleClick', { detail: { item: this } }));
	});
	if ('onMiddleClick' in params) this.addEventListener('middleClick', params.onMiddleClick);
	if ('onSelected' in params && params.onSelected) this.onSelected = params.onSelected;
	if ('text' in params) {
		if (this.textNode) this.textNode.textContent = params.text;
		else this.textContent = params.text;
	}
	if (params.value) this.value = params.value;
	if ('tooltip' in params) this.title = params.tooltip || '';
	if ('show' in params) {
		if (params.show) this.show();
		else this.hide();
	}
	if ('className' in params) this.className = params.className;
	if (params.classes) params.classes.forEach(className => this.classList.add(className));
	if ('draggable' in params) this.setAttribute('draggable', params.draggable);
	if ('contextMenu' in params && params.contextMenu) {
		this.contextMenu = new DCContextMenu({ sourceControl: this, items: params.contextMenu });
		this.addEventListener('contextmenu', evt => {
			if (this.contentEditable == 'plaintext-only') return evt.stopPropagation();
			evt.preventDefault();
			evt.stopPropagation();
			this.contextMenu.show({ x: evt.clientX, y: evt.clientY });
		});
	}
};

HTMLElement.prototype.setIcon = function(icon)
{
	if (!this.classList.contains('icon')) this.classList.add('icon');
	this.style.backgroundImage = 'url(rs/icons/' + icon + (icon.indexOf('.') == -1 ? '.svg' : '') + ')';
}

HTMLElement.prototype.clear = function()
{
	while (this.firstChild) this.firstChild.detach();
};

HTMLElement.prototype.detach = function()
{
	this.parentElement.removeChild(this);
};