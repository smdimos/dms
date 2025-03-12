class DSInfoManager
{
	static #infoCell;

	static init(getInfoCell)
	{
		// Dialog
		let dialog = new DCDialog({ in: getInfoCell, title: 'Info', icon: 'info-circle', tooltip: '' });
		let dialogGrid = new DCGrid({
			in: dialog.body,
			rows: ['364px', 'auto'],
			cols: ['1fr', '3fr'],
			cellSpans: [{ cell: [1,0], colSpan: 2 }],
			classes: ['internal-borders'],
			styles: { width: '720px' }
		});
		let [listCell, infoCell, okCell] = dialogGrid.getCells();

		// Dialog > List
		let listBox = new DCListBox({ in: listCell });
		listBox.setItemTemplate({
			onSelected: this.displayFile.bind(this)
		});
		let firstItem;
		for (let itemText of ['About', 'Credits', 'License']) {
			let item = listBox.addItem({ text: itemText });
			if (!firstItem) firstItem = item;
		}

		// Dialog > Info
		infoCell.classList.add('pre', 'padded', 'monospace');
		this.#infoCell = infoCell;

		// Dialog > OK Button
		let statusBar = new DCStatusBar({ in: okCell });
		statusBar.addItem({
			width: 'auto',
			classes: ['button'],
			text: 'OK',
			onClick: evt => {
				evt.stopPropagation();
				dialog.close();
			}
		});

		// Get info cell
		getInfoCell.setParams({
			classes: ['titlebar', 'button'],
			icon: 'info-circle',
			tooltip: 'Info',
			onClick: evt => dialog.open()
		});

		// Open first item
		listBox.setSelectedItem(firstItem);
	}

	static displayFile(evt)
	{
		let pathToFile = '/rs/' + evt.item.getText().toLowerCase().replaceAll(' ', '-') + '.txt';
		DS.cmd('getFile', { file: pathToFile }, contents => {
			this.#infoCell.classList.remove('error');
			this.#infoCell.textContent = contents;
		}, errorMsg => {
			this.#infoCell.classList.add('error');
			if (errorMsg == 'ENOENT') errorMsg = 'File not found';
			this.#infoCell.textContent = `Error retrieving ${pathToFile}:\r\n${errorMsg}.`;
		});
	}
}