class DSModuleLauncher
{
	static #modulesDialog;

	static init(launchCell, modules)
	{
		this.#modulesDialog = new DCDialog({ in: launchCell, title: 'Modules', icon: 'app' });
		this.#modulesDialog.body.setStyles({ minWidth: '256px', minHeight: '256px' });
		let modulesDialogGrid = new DCGrid({
			in: this.#modulesDialog.body,
			rows: ['1fr', 'auto'],
			cols: ['auto'],
			classes: ['internal-borders']
		});
		let [bodyCell, playCell] = modulesDialogGrid.getCells();
		let modulesListBox = new DCListBox({ in: bodyCell });
		let launchHandler = evt => {
			this.#modulesDialog.close();
			DS.createInstance(modulesListBox.getSelectedItem().moduleClass, { bringToFore: true });
			modulesListBox.setSelectedItem();
		};
		for (let moduleClass of Object.values(modules)) {
			let item = modulesListBox.addItem({
				icon: moduleClass.shellIcon,
				text: moduleClass.shellName,
				onDoubleClick: launchHandler
			});
			item.moduleClass = moduleClass;
		}
		let actionBar = new DCStatusBar({ in: playCell });
		actionBar.addItem({
			width: '100%',
			classes: ['button'],
			icon: 'play',
			tooltip: 'Launch',
			onClick: evt => {
				evt.stopPropagation();
				if (modulesListBox.getSelectedItem()) launchHandler();
			}
		});

		launchCell.setParams({
			classes: ['titlebar', 'button'],
			icon: 'grid-3x3-gap-fill',
			tooltip: 'Launch (⌘L)',
			onClick: evt => this.#modulesDialog.open()
		});
	}

	static open()
	{
		this.#modulesDialog.open();
	}
}