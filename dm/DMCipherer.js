class DMCipherer
{
	static shellName = 'Cipherer';
	static shellIcon = 'encrypted-file';
	static loaded = false;
	static instanceLoadFns = [];
	static #salts;

	static load(thenFn)
	{
		if (this.loaded) return thenFn();
		this.instanceLoadFns.push(thenFn);
		if (this.loaded === null) return;
		this.loaded = null;
		DS.cmd('readFile', { module: this.name }, (data) => {
			this.#salts = 'salts' in data ? data.salts : [];
			this.loaded = true;
			for (let instanceLoadFn of this.instanceLoadFns) instanceLoadFn();
			this.instanceLoadFns.length = 0;
		}, errorMsg => {
			alert(errorMsg);
		});
	}

	static save()
	{
		let data = { salts: this.#salts };
		DS.cmd('writeFile', { module: this.name, data: data }, null, errorMsg => {
			alert(errorMsg);
		});
	}

	state;
	#manageSaltsItem;
	saltField;
	#textCell;
	#cipherCell;
	
	constructor(params)
	{
		// Initial state
		let defaultState = {
			salt: '',
			lastDirection: 0,
			text: '',
			cipherText: ''
		};
		this.state = params.state || {};
		for (let key in defaultState) {
			if (!(key in this.state)) this.state[key] = defaultState[key];
		}

		// Salt management dialog
		let saltDialog = new DCDialog({ in: params.rootNode, title: 'Salts', icon: 'wallet2' });
		saltDialog.body.setStyles({ minWidth: '256px' });
		saltDialog.addEventListener('close', evt => {
			let newSalts = [];
			for (let item of saltListBox.children) {
				let salt = item.textContent;
				if (salt) newSalts.push(salt);
			}
			saltListBox.clear();
			if (JSON.stringify(newSalts) == JSON.stringify(this.constructor.#salts)) return;
			this.constructor.#salts = [...newSalts];
			this.constructor.save();
			for (let instance of this.constructor.instances) {
				instance.saltField.setOptions(newSalts);
			}
		});
		let saltGrid = new DCGrid({
			in: saltDialog.body,
			rows: ['1fr', 'auto'],
			cols: ['auto']
		});
		let [bodyCell, buttonCell] = saltGrid.getCells();
		let saltListBox = new DCListBox({ in: bodyCell, rearrangeable: true, maxTextLength: 32, styles: { minHeight: '96px' } });
		let actionBar = new DCStatusBar({ in: buttonCell, classes: ['border-top'] });
		actionBar.addItem({
			width: 'auto',
			classes: ['button'],
			icon: 'plus',
			tooltip: 'Add Salt',
			onClick: evt => {
				if (saltListBox.itemBeingRenamed) return;
				let item = saltListBox.addItem({ text: '' });
				saltListBox.setSelectedItem(item);
				item.rename();
			}
		});
		actionBar.addItem({
			width: 'auto',
			classes: ['button'],
			icon: 'dash',
			tooltip: 'Remove Salt',
			onClick: evt => {
				let selectedItem = saltListBox.getSelectedItem();
				if (selectedItem) selectedItem.remove();
			}
		});
		actionBar.addItem({
			width: 'auto',
			classes: ['button'],
			icon: 'rename',
			tooltip: 'Edit Salt',
			onClick: evt => {
				let selectedItem = saltListBox.getSelectedItem();
				if (selectedItem) selectedItem.rename();
			}
		});

		// Input timer
		let inputTimer;
		let inputHandlerFn = direction => {
			clearTimeout(inputTimer);
			inputTimer = setTimeout(this.transformText.bind(this, direction), 1000);
		};

		// Module grid
		const moduleGrid = new DCGrid({
			in: params.rootNode,
			cols: ['100%'],
			rows: ['auto', '1fr', 'auto']
		});
		const [toolCell, mainCell, statusCell] = moduleGrid.getCells();

		// Toolbar
		const toolBar = new DCToolBar({ in: toolCell });
		this.#manageSaltsItem = toolBar.addItem({
			icon: 'wallet2',
			text: 'Salts...',
			enabled: false,
			onClick: evt => {
				for (let salt of this.constructor.#salts) {
					saltListBox.addItem({ text: salt });
				}
				saltDialog.open();
			}
		});
		toolBar.addSeparator();
		let saltItem = toolBar.addItem({
			icon: 'key',
			classes: ['static'],
			expand: true,
			onClick: evt => this.saltField.focus()
		});
		this.saltField = new DCTextField({
			in: saltItem,
			classes: ['fill'],
			value: this.state.salt,
			onInput: inputHandlerFn.bind(this, 0)
		});

		// Main grid
		const mainGrid = new DCGrid({
			in: mainCell,
			cols: ['50%', '50%'],
			rows: ['100%'],
			classes: ['internal-borders']
		});

		// Text & ciphertext cells
		let onTextCell = true;
		for (let cell of mainGrid.getCells()) {
			cell.contentEditable = 'plaintext-only';
			cell.classList.add('editable');
			cell.setStyles({
				fontSize: 'larger',
				backgroundImage: onTextCell ? 'url(/rs/abc.png)' : 'url(/rs/encryption.png)',
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center center',
				backgroundColor: 'rgba(255,255,255,0.9)',
				backgroundBlendMode: 'lighten',
				whiteSpace: 'nowrap'
			});
			cell.innerHTML = onTextCell ? this.state.text : this.state.cipherText;
			cell.addEventListener('input', inputHandlerFn.bind(this, onTextCell ? 1 : -1));
			if (onTextCell) this.#textCell = cell;
			else this.#cipherCell = cell;
			onTextCell = false;
		}

		// Load data
		this.constructor.load(() => {
			this.#manageSaltsItem.setEnabled(true);
			this.saltField.setOptions(this.constructor.#salts);
		});
	}

	transformText(direction)
	{
		// Store state
		this.state.salt = this.saltField.getValue();
		this.state.text = this.#textCell.innerHTML;
		this.state.cipherText = this.#cipherCell.innerHTML;

		// Determine & store direction
		if (direction === 0) {
			if (!this.state.lastDirection) return;
			direction = this.state.lastDirection;
		} else {
			this.state.lastDirection = direction;
		}

		// Salt
		if (!this.state.salt) return;

		// Encrypt/decrypt
		let cmd = direction > 0 ? 'encrypt' : 'decrypt';
		let sourceCell = direction > 0 ? this.#textCell : this.#cipherCell;
		let targetCell = direction > 0 ? this.#cipherCell : this.#textCell;
		if (sourceCell.innerText.trim().length == 0) return;
		let inputStrings = sourceCell.innerText.replace(/\r/gm, '').replace(/\n\n/gm, '\n').split('\n');
		let params = { salt: this.state.salt };
		if (direction > 0) params.texts = inputStrings;
		else params.cipherTexts = inputStrings;
		DS.cmd(cmd, params, outputStrings => {
			targetCell.clear();
			for (let outputString of outputStrings) {
				let div = DCControl.create('div', { in: targetCell });
				if (typeof outputString === 'string') {
					div.textContent = outputString;
					if (outputString.length == 0) DCControl.create('br', { in: div });
				} else if ('error' in outputString) {
					div.textContent = outputString.error;
					div.style.color = 'red';
				}
			}
			if (direction > 0) this.state.cipherText = targetCell.innerHTML;
			else this.state.text = targetCell.innerHTML;
		}, errorMsg => {
			alert(errorMsg);
		});
	}
}

DS.registerModule(DMCipherer);