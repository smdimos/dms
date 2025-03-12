class DCItem extends DCControl
{
	#itemManager;
	#enabled = true;

	constructor(params)
	{
		super(params);
		if (!params) return;
		this.#itemManager = 'itemManager' in params ? params.itemManager : ('in' in params ? params.in : null);
		if ('icon' in params && params.icon) this.classList.add('icon');
		if ('enabled' in params) this.setEnabled(params.enabled);
	}

	isEnabled()
	{
		return this.#enabled;
	}

	setEnabled(enabled)
	{
		this.#enabled = enabled;
		if (enabled) {
			this.classList.remove('disabled');
			this.dispatchEvent(new CustomEvent('enabled'));
		} else {
			this.classList.add('disabled');
			this.dispatchEvent(new CustomEvent('disabled'));
		}
	}

	getText()
	{
		let textNode = this.textNode || this;
		return textNode.textContent;
	}

	setText(text)
	{
		let textNode = this.textNode || this;
		const previousText = textNode.textContent;
		if (text == previousText) return;
		textNode.textContent = text;
		this.dispatchEvent(new CustomEvent('renameComplete', { cancelable: false, detail: { previousText : previousText } }));
	}

	isSelected()
	{
		return this.classList.contains('selected');
	}

	rename(completeFn)
	{
		let textNode = this.textNode || this;
		let isItemDraggable = this.draggable;
		if (isItemDraggable) this.draggable = false;
		let previousText = textNode.textContent;
		this.dispatchEvent(new CustomEvent('renameStart'));
		textNode.contentEditable = 'plaintext-only';
		let range = document.createRange();
		range.selectNodeContents(textNode);
		range.collapse(false);
		let selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		textNode.focus();
		document.body.classList.add('locked');
		let denyEntryFn = () => {
			textNode.focus();
			textNode.classList.add('error');
			if (textNode.timeout) clearTimeout(textNode.timeout);
			textNode.timeout = setTimeout(() => textNode.classList.remove('error'), 2500);
		}
		textNode.onblur = evt => {
			if (textNode.textContent.length == 0) return denyEntryFn();
			let isTextChanged = textNode.textContent !== previousText;
			let isRenameApproved = this.dispatchEvent(new CustomEvent('renameComplete', { cancelable: true, detail: { previousText: previousText } }));
			if (!isRenameApproved) return denyEntryFn();
			document.body.classList.remove('locked');
			textNode.contentEditable = false;
			textNode.scrollLeft = 0;
			if (isItemDraggable) this.draggable = true;
			textNode.classList.remove('error');
			if (this.#itemManager) this.#itemManager.focus();
			if (isTextChanged && completeFn) {
				completeFn({ item: this, text: textNode.textContent, previousText: previousText });
			}
		}
		textNode.onkeydown = evt => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				textNode.blur();
			} else if (evt.key === 'Escape') {
				textNode.textContent = previousText;
				textNode.blur();
			}
		};
		if (this.#itemManager && this.#itemManager.itemSettings && this.#itemManager.itemSettings.maxTextLength) {
			const maxTextLength = this.#itemManager.itemSettings.maxTextLength;
			textNode.oninput = evt => {
				if (textNode.textContent.length > maxTextLength) {
					textNode.textContent = textNode.textContent.substring(0, maxTextLength);
					textNode.focus();
					document.execCommand('selectAll', false, null);
					document.getSelection().collapseToEnd();
				}
			};
		}
	}

	remove(animate = true)
	{
		let actualizeRemoval = () => {
			this.detach();
			this.dispatchEvent(new CustomEvent('removed'));
		};
		let visible = this.offsetParent !== null;
		if (animate && visible) {
			this.style.transform = 'scaleY(0)';
			this.style.transitionDuration = '0.3s';
			this.addEventListener('transitionend', evt => {
				if (evt.propertyName == 'transform') actualizeRemoval();
			});
		} else {
			actualizeRemoval();
		}
	}
}

window.customElements.define('dc-item', DCItem);