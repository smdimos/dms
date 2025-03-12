class DMTestArea
{
	static shellName = 'Test Area';
	static shellIcon = 'flask';
	
	constructor(params)
	{
		// Module grid
		const moduleGrid = new DCGrid({
			in: params.rootNode,
			cols: ['100%'],
			rows: ['auto', '1fr', 'auto']
		});
		const [toolCell, mainCell, statusCell] = moduleGrid.getCells();

		// Toolbar
		const toolBar = new DCToolBar({ in: toolCell });
		toolBar.addItem({
			icon: 'plus-circle',
			text: 'New Page',
			onClick: evt => {
				alert('hello');
			}
		});
		toolBar.addSeparator();
		toolBar.addItem({
			icon: 'palette',
			text: 'Change Color',
			menu: {
				'#ffeeee': evt => entryCell.style.backgroundColor = '#ffeeee',
				'#ffeef8': evt => entryCell.style.backgroundColor = '#ffeef8',
				'#fbeeff': evt => entryCell.style.backgroundColor = '#fbeeff',
				'#eef1ff': evt => entryCell.style.backgroundColor = '#eef1ff',
				'#eefcff': evt => entryCell.style.backgroundColor = '#eefcff'
			}
			/*onClick: evt => {
				let colors = ['lime', 'blue', 'red', 'purple', 'yellow'];
				let randomIndex = Math.floor(Math.random() * colors.length);
				entryCell.style.backgroundColor = colors[randomIndex];
			}*/
		});
		toolBar.addItem({
			icon: 'file-spreadsheet',
			text: 'Generate XLSX',
			onClick: evt => {
				/* original data */
				var filename = "write.xlsx";
				var data = [[1,2,3],[true, false, null, "sheetjs"],["foo","bar",new Date("2014-02-19T14:30Z"), "0.3"], ["baz", null, "qux"]]
				var ws_name = "SheetJS";

				if(typeof console !== 'undefined') console.log(new Date());
				var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(data);

				/* add worksheet to workbook */
				XLSX.utils.book_append_sheet(wb, ws, ws_name);

				/* write workbook */
				if(typeof console !== 'undefined') console.log(new Date());
				XLSX.writeFile(wb, filename);
				if(typeof console !== 'undefined') console.log(new Date());
			}
		});

		// Grid
		const grid = new DCGrid({
			in: mainCell,
			cols: ['320px', 'auto'],
			rows: ['50%', '50%'],
			cellSpans: [{ cell: [0,0], rowSpan: 2 }],
			//cols: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
			//rows: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
			//cellSpans: [{ cell: [2,3], rowSpan: 3 }],
			classes: ['internal-borders', 'resizable'],
		});
		const [listCell, entryCell, resultCell] = grid.getCells();

		/*// List
		//listCell.style.borderRight = '1px solid #D9D9D9';
		let listBox = new DCListBox({
			in: listCell,
			rearrangeable: true,
			contextMenu: {
				'Do Stuff': evt => console.log('doing stuff'),
				'Lalala': evt => console.log('haha')
			}
		});
		for (let word of ['Aaamazzarite', 'Aalaag', 'Abh', 'Abductors', 'Abu Chacha', 'Abzorbalof', 'Abyormenites', 'Acamarian', 'Acquarans', 'Adipose', 'Advent', 'Aenar', 'Aeodronians', 'Aerophibian', 'Affront', 'Agorian', 'Akaali', 'Akiss', 'Akrennians', 'Akritirians', 'Albategna', 'Alf', 'Alkari', 'Allasomorph', 'Amaut', 'Altarians', 'Amazonians', 'Amnioni', 'Amorphs', 'Anabis', 'Ancients', 'Ancients', 'Ancient', 'Andalites', 'Andorians', 'Andromeni', 'Angol Mois', 'Angosian', 'Annari', 'Anodite', 'Antarans', 'Antarians', 'Antedeans', 'Anterians', 'Anticans', 'The Anti-Monitor', 'Appoplexian', 'Aqualish', 'Aquatoids', 'Arachnichimp', 'Arachnids', 'Arachnoids', 'Aras', 'Arbryls', 'Arburian Pelarota', 'Arcadians', 'Arceans', 'Arcturians', 'Argolin', 'Arilou Lalee\'lay', 'Arisians and Eddorians', 'Ark Megaforms', 'Arkonides', 'Armada of Annihilation', 'Arquillians', 'Airlia', 'Arnor', 'Asari', 'Aschen', 'Asgard', 'Aslan', 'Asuran', 'Atavus', 'Atevi', 'Atraxi', 'Aurelians', 'Autobot', 'Auronar', 'Autons', 'Axanars', 'Axons', 'Azathoth', 'Azgonians', 'Aziam', 'Azwaca']) {
			let item = listBox.addItem({
				text: word,
				icon: 'robot',
				contextMenu: {
					'Rename': evt => item.rename(),
					'Remove': evt => item.detach()
				}
			});
		}*/

		// TreeView
		let treeView = new DCTreeView({
			in: listCell
		});
		let birdsNode = treeView.addItem({ icon: 'feather', text: 'Birds' });
		birdsNode.addItem({ icon: 'android', text: 'Kuss' });
		birdsNode.addItem({ icon: 'android', text: 'Skaczek' });
		let catsNode = treeView.addItem({ icon: 'globe', text: 'Cats' });
		catsNode.addItem({ icon: 'android', text: 'Bruce' });
		catsNode.addItem({ icon: 'android', text: 'Sweet' });
		catsNode.addItem({ icon: 'android', text: 'Ug' });
		catsNode.addItem({ icon: 'android', text: 'Val' });
		let dogsNode = treeView.addItem({ icon: 'radioactive', text: 'Dogs' });
		dogsNode.addItem({ icon: 'android', text: 'Dana' });
		let szNode = dogsNode.addItem({ icon: 'android', text: 'Szarik' });
		szNode.addItem({ icon: 'alipay', text: 'White Hair' });

		// Entry cell
		//entryCell.style.borderBottom = '1px solid #D9D9D9';

		// Result cell
		let dataNodeGrid = new DCGrid({
			in: resultCell,
			cols: ['100%'],
			rows: ['auto', '1fr']
		});
		const [pagerCell, dataNodeCell] = dataNodeGrid.getCells();
		let dataNodePager = new DCPager({ in: pagerCell, classes: ['flush-edge'] });
		for (let i = 0; i <= 25; i++) {
			let page = new DCView({ in: dataNodeCell, show: false, classes: ['fill'], text: i });
			let pagerItem = dataNodePager.addItem({
				text: 'Q10' + i.toString(),
				node: page
			});
		}
		dataNodePager.setSelectedItem({ at: 0 });
		//dataNodeCell.style.backgroundColor = 'pink';

		// Statusbar
		statusCell.classList.add('statusbar', 'bordered');
		statusCell.textContent = '[' + (new Intl.DateTimeFormat('sv-SV', { dateStyle: 'short', timeStyle: 'short' }).format(new Date)) + '] Sandbox up';
	}
}

DS.registerModule(DMTestArea);