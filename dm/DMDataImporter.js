class DMDataImporter
{
	static shellName = 'Data Importer';
	static shellIcon = 'import';
	static loaded = false;
	static instanceLoadFns = [];
	static #recordTypes;

	static load(thenFn)
	{
		if (this.loaded) return thenFn();
		this.instanceLoadFns.push(thenFn);
		if (this.loaded === null) return;
		this.loaded = null;
		let loadCompleteFn = () => {
			this.loaded = true;
			for (let instanceLoadFn of this.instanceLoadFns) instanceLoadFn();
			this.instanceLoadFns.length = 0;
		};
		DS.cmd('readFile', { module: this.name }, (data) => {
			if ('recordTypes' in data) {
				this.#recordTypes = data.recordTypes;
				loadCompleteFn();
			} else {
				let pathToFile = '/rs/record-types.json';
				DS.cmd('getFile', { file: pathToFile }, masterRecordTypes => {
					this.#recordTypes = masterRecordTypes;
					this.save();
				}, errorMsg => {
					this.#recordTypes = {};
					if (errorMsg == 'ENOENT') errorMsg = pathToFile + ' not found. No record types currently defined.';
					alert(errorMsg);
				}, () => {
					loadCompleteFn();
				});
			}
		}, errorMsg => {
			alert(errorMsg);
		});
	}

	static save()
	{
		let data = { recordTypes: this.#recordTypes };
		DS.cmd('writeFile', { module: this.name, data: data }, null, errorMsg => {
			alert(errorMsg);
		});
	}

	static getRecordKey(recordType, key)
	{
		let typeInfo = this.#recordTypes[recordType];
		if (typeInfo.remapFields && key in typeInfo.remapFields) key = typeInfo.remapFields[key]
		return key;
	}

	#toolBar;
	#pagerSeparator;
	#applyChangesButton;
	#mainCell;
	#currentPage;
	#pageItems = {};
	typeTree;
	#typeInfoCell;
	#auditInfo;
	
	constructor(params)
	{
		// Module grid
		const moduleGrid = new DCGrid({
			in: params.rootNode,
			cols: ['100%'],
			rows: ['auto', '1fr', 'auto']
		});
		const [toolCell, mainCell, statusCell] = moduleGrid.getCells();
		this.#mainCell = mainCell;

		// Toolbar
		this.#toolBar = new DCToolBar({ in: toolCell });
		let typesButton = this.#toolBar.addItem({
			icon: 'boxes',
			text: 'Types & Templates',
			choiceGroup: 'page',
			onClick: () => this.openPage(typesGrid)
		});
		this.#pagerSeparator = this.#toolBar.addSeparator();
		let selectWorkbookButton = this.#toolBar.addItem({
			icon: 'plus-lg',
			text: 'Add Workbook...',
			enabled: false,
			onClick: evt => importCtrl.click()
		});
		this.#applyChangesButton = this.#toolBar.addItem({
			icon: 'check-lg',
			text: 'Apply Changes',
			enabled: false,
			onClick: evt => {
				this.applyChanges();
			}
		});

		// Import control
		let importCtrl = DCControl.create('input', { in: selectWorkbookButton });
		importCtrl.accept = ".xlsx";
		importCtrl.type = 'file';
		importCtrl.style.display = 'none';
		importCtrl.addEventListener('change', evt => {
			this.saveAnyChanges();
			let file = importCtrl.files.item(0);
			if (!file) return;
			importCtrl.value = '';
			let fileReader = new FileReader();
			fileReader.onload = evt => this.processWorkbook(file.name, evt.target.result);
			fileReader.readAsBinaryString(file);
		});

		// Types & Templates Grid
		const typesGrid = new DCGrid({
			in: mainCell,
			cols: ['320px', 'auto'],
			rows: ['100%'],
			classes: ['internal-borders', 'resizable'],
			show: false
		});
		typesButton.click();

		// Type info cell
		this.#typeInfoCell = typesGrid.getCell(1);
		this.#typeInfoCell.classList.add('document');
		new ResizeObserver(entries => {
			if (this.#typeInfoCell.templateView) this.#typeInfoCell.templateView.updateColumns();
		}).observe(this.#typeInfoCell);

		// Type tree
		this.typeTree = new DCTreeView({
			in: typesGrid.getCell(0),
			order: true,
			contextMenu: {
				'Add Primary Type': evt => this.addType(this.typeTree)
			}
		});
		this.typeTree.setItemTemplate({
			icon: 'box',
			contextMenu: {
				'Add Child Type': evt => this.addType(evt.sourceControl.parentElement),
				'Rename': evt => this.renameType(evt.sourceControl.parentElement),
				'Remove': evt => this.removeType(evt.sourceControl.parentElement)
			}
		});
		this.typeTree.addEventListener('itemSelected', evt => {
			this.saveAnyChanges();
			this.displayType(evt.detail.item);
		});

		// Save current type info (if any) upon hide/quit
		params.rootNode.addEventListener('hide', this.saveAnyChanges.bind(this));
		params.rootNode.addEventListener('quit', this.saveAnyChanges.bind(this));

		// Load data
		this.constructor.load(() => {
			let createNodes = (parentNode = this.typeTree, parentType = null) => {
				for (let typeName in this.constructor.#recordTypes) {
					let typeInfo = this.constructor.#recordTypes[typeName];
					if (!typeInfo.parentType) typeInfo.parentType = null;
					if (typeInfo.parentType !== parentType) continue;
					let node = parentNode.addItem({ text: typeName });
					createNodes(node, typeName);
				}
			};
			createNodes();
			selectWorkbookButton.setEnabled(true);
		});
	}

	openPage(page)
	{
		this.saveAnyChanges();
		if (this.#currentPage) this.#currentPage.hide();
		page.show();
		this.#currentPage = page;
		this.#applyChangesButton.setEnabled('pendingUpdates' in page && page.pendingUpdates);
	}

	addType(parentNode)
	{
		if (this.typeTree.itemBeingRenamed) return;
		this.constructor.#recordTypes[''] = { parentType: parentNode == this.typeTree ? null : parentNode.getText() };
		let item = parentNode.addItem({ text: '' });
		item.select({ focus: true });
		this.renameType(item);
		for (const instance of this.constructor.instances) {
			if (instance == this) continue;
			let instanceParentNode = parentNode == this.typeTree ? instance.typeTree : instance.typeTree.getItemByText(parentNode.getText());
			instanceParentNode.addItem({ text: '' });
		}
	}

	removeType(item, isOriginator = true)
	{
		if (item.isSelected()) {
			this.#typeInfoCell.typeNode = null;
			this.#typeInfoCell.typeNode = null;
			this.#typeInfoCell.typeView = null;
			this.#typeInfoCell.templateView = null;
			this.#typeInfoCell.clear();
		}
		if (isOriginator) {
			let childItems = item.getItems();
			for (let childItem of childItems) delete this.constructor.#recordTypes[childItem.getText()];
			delete this.constructor.#recordTypes[item.getText()];
			this.constructor.save();
			for (const instance of this.constructor.instances) {
				if (instance == this) continue;
				let downstreamItem = instance.typeTree.getItemByText(item.getText());
				instance.removeType(downstreamItem, false);
			}
		}
		item.remove();
	}

	renameType(item)
	{
		item.rename(evt => {
			const oldName = evt.previousText;
			const newName = evt.text;
			let newTypes = {};
			for (let typeName in this.constructor.#recordTypes) {
				let typeInfo = this.constructor.#recordTypes[typeName];
				if (typeInfo.parentType == oldName) typeInfo.parentType = newName;
				newTypes[typeName !== oldName ? typeName : newName] = typeInfo;
			}
			this.constructor.#recordTypes = newTypes;
			this.constructor.save();
			for (const instance of this.constructor.instances) {
				if (instance == this) continue;
				instance.typeTree.getItemByText(oldName).setText(newName);
			}
		});
	}

	displayType(typeNode)
	{
		// Node & type info
		let typeInfo = this.constructor.#recordTypes[typeNode.getText()];

		// Type details
		let typeView = new DCKeyValueView({ in: this.#typeInfoCell, replaceContents: true, className: 'margin-bottom-1' });
		typeView.addItem({
			name: 'keyFields',
			label: 'Key Fields',
			type: 'text',
			value: typeInfo.keyFields && typeInfo.keyFields.join(', ')
		});
		typeView.addItem({
			name: 'remapFields',
			label: 'Remap Fields',
			type: 'text',
			value: typeInfo.remapFields && Object.entries(typeInfo.remapFields).map(([key, value]) => `${key} => ${value}`).join(', ')
		});
		typeView.addItem({
			name: 'ordered',
			label: 'Ordered',
			type: 'boolean',
			value: 'ordered' in typeInfo && typeInfo.ordered
		});
		let incrementSwitch = typeView.addItem({
			name: 'useIncrement',
			label: 'Increment',
			type: 'boolean',
			onChange: value => {
				for (let item of incrementItems) {
					if (value) item.show();
					else item.hide();
				}
			}
		});
		let incrementItems = [
			typeView.addItem({
				name: 'incrementField',
				label: 'Increment Field',
				type: 'text',
				value: typeInfo.increment && typeInfo.increment.field,
				show: false
			}),
			typeView.addItem({
				name: 'incrementType',
				label: 'Increment Type',
				type: 'text',
				value: typeInfo.increment && typeInfo.increment.incrementType,
				show: false
			}),
			typeView.addItem({
				name: 'incrementName',
				label: 'Increment Name',
				type: 'text',
				value: typeInfo.increment && typeInfo.increment.incrementName,
				show: false
			})
		];
		if (typeInfo.increment) incrementSwitch.toggle(true);
		typeView.initState();

		// Record template
		new DCText({
			in: this.#typeInfoCell,
			text: 'Record Template',
			classes: ['block', 'heading', 'centered', 'margin-bottom-half']
		});
		let templateView = new DCKeyValueView({
			in: this.#typeInfoCell,
			columnize: true,
			classes: ['margin-bottom-half']
		});
		if (!typeInfo.fields) typeInfo.fields = {};
		for (let fieldName in typeInfo.fields) {
			let fieldInfo = typeInfo.fields[fieldName];
			templateView.addItem({
				name: fieldName,
				type: fieldInfo.type,
				value: fieldInfo.defaultValue
			});
		}
		templateView.initState();
		let syncButton = DCControl.create('button', {
			in: this.#typeInfoCell,
			text: 'synchronize with field master',
			classes: ['block', 'centered'],
			onClick: evt => this.syncRecordTemplate(typeNode.getText(), templateView)
		});

		// Store references for saving
		this.#typeInfoCell.typeNode = typeNode;
		this.#typeInfoCell.typeInfo = typeInfo;
		this.#typeInfoCell.typeView = typeView;
		this.#typeInfoCell.templateView = templateView;
	}

	syncRecordTemplate(recordType, templateView)
	{
		// Save type info
		this.saveAnyChanges();

		// Keys to exclude
		let keysToExclude = [];
		let currentType = recordType;
		while (currentType) {
			let currentTypeInfo = this.constructor.#recordTypes[currentType];
			let keys = currentTypeInfo.keyFields;
			for (let key of keys) {
				keysToExclude.push(this.constructor.getRecordKey(recordType, key));
			}
			currentType = currentTypeInfo.parentType;
		}

		// Existing keys
		let typeInfo = this.constructor.#recordTypes[recordType];
		if (!typeInfo.fields) typeInfo.fields = {};
		let existingKeys = Object.keys(typeInfo.fields);

		DS.query(`SELECT * FROM field_master WHERE table_name = '${recordType}'`, fieldDefinitions => {
			for (let fieldDefinition of fieldDefinitions) {

				// Field name
				let fieldName = fieldDefinition.field_name;
				if (keysToExclude.includes(fieldName)) continue;
				fieldName = fieldName.toLowerCase();

				// Field type
				let fieldType = 'text';
				if (['Boolean', 'Number', 'Integer'].includes(fieldDefinition.data_type)) fieldType = fieldDefinition.data_type.toLowerCase();

				// Field is non-obsolete
				let keyIndex = existingKeys.indexOf(fieldName);
				if (keyIndex > -1) existingKeys.splice(keyIndex, 1);
				
				// Skip or replace existing field
				let field = templateView.getField(fieldName);
				if (field) {
					if (field.type != fieldType) {
						templateView.addItem({
							insteadOf: field.item,
							name: fieldName,
							type: fieldType,
							styles: { backgroundColor: '#fcf8e3' }
						});
					}
					continue;
				}

				// Add template view item
				templateView.addItem({
					name: fieldName,
					type: fieldType,
					styles: { backgroundColor: '#d9edf7' }
				});

			}

			// Remove obsolete keys
			for (let obsoleteKey of existingKeys) {
				delete this.constructor.#recordTypes[recordType].fields[obsoleteKey];
				let field = templateView.getField(obsoleteKey);
				field.item.remove();
			}

		}, errorMsg => {
			alert(errorMsg);
		});
	}

	saveAnyChanges()
	{
		// References
		if (!this.#typeInfoCell || !this.#typeInfoCell.typeNode) return;
		const {typeNode, typeInfo, typeView, templateView} = this.#typeInfoCell;
		let doSave = false;

		// Type info
		if (typeView.isModified()) {
			doSave = true;
			let data = typeView.getData();
			let newTypeInfo = {};
			newTypeInfo.parentType = typeInfo.parentType;
			if (data.keyFields) newTypeInfo.keyFields = data.keyFields.split(',').map(word => word.trim());
			if (data.remapFields) newTypeInfo.remapFields = Object.fromEntries(
				data.remapFields.split(',').map(remapDefinition => remapDefinition.trim().split('=>').map(word => word.trim()))
			);
			if (data.ordered) newTypeInfo.ordered = true;
			if (data.useIncrement) {
				newTypeInfo.increment = {
					field: data.incrementField,
					incrementType: data.incrementType,
					incrementName: data.incrementName
				}
			}
			if ('fields' in typeInfo) newTypeInfo.fields = typeInfo.fields;
			this.constructor.#recordTypes[typeNode.getText()] = newTypeInfo;
			typeView.initState();
		}

		// Record template
		if (templateView.isModified()) {
			doSave = true;
			let newFields = {};
			for (const [fieldName, field] of Object.entries(templateView.getFields())) {
				newFields[fieldName] = {
					type: field.type,
					defaultValue: field.getValue()
				};
			}
			this.constructor.#recordTypes[typeNode.getText()].fields = newFields;
			templateView.initState();
		}

		// Save
		if (doSave) this.constructor.save();
	}

	processWorkbook(baseName, fileContents)
	{
		// Page name
		let pageNames = Object.keys(this.#pageItems);
		let pageName = baseName.replace(/\.[^/.]+$/, '');
		for (let suffix = 2; pageNames.includes(pageName); suffix++) {
			pageName = `${baseName} ${suffix}`;
		}

		// Page grid
		const pageGrid = new DCGrid({
			in: this.#mainCell,
			cols: ['320px', 'auto'],
			rows: ['100%'],
			classes: ['internal-borders', 'resizable'],
			show: false
		});

		// Page items
		this.#pageItems[pageName] = {
			pageGrid: pageGrid,
			progenitorIDs: [],
			progenitorIndex: -1,
			records: {},
			requestCount: 0,
			proposedUpdates: {},
			changesApplied: false,
			versionByTypeAndName: {}
		};

		// Toolbar button
		let pageButton = this.#toolBar.addItem({
			before: this.#pagerSeparator,
			icon: 'file-spreadsheet',
			text: pageName,
			choiceGroup: 'page',
			onClick: evt => this.openPage(pageGrid),
			onMiddleClick: evt => {
				pageGrid.remove();
				pageButton.remove();
				delete this.#pageItems[pageName];
				let remainingPageButtons = this.#toolBar.getItemsByChoiceGroup('page');
				remainingPageButtons[remainingPageButtons.length - 1].click();
			}
		});
		pageButton.click();

		// Record tree
		this.#pageItems[pageName].recordTree = new DCTreeView({ in: pageGrid.getCell(0) });
		this.#pageItems[pageName].recordTree.addEventListener('itemSelected', evt => {
			if (evt.detail.item.record) this.displayRecord(pageName, evt.detail.item);
			else this.displayError(pageName, evt.detail.item);
		});

		// Info cell
		this.#pageItems[pageName].infoCell = pageGrid.getCell(1);

		// Load workbook
		let workbook = XLSX.read(fileContents, { type: 'binary', cellDates:true, cellStyles:true });

		// Read worksheets
		for (let recordType in workbook.Sheets) {

			// Get type info
			let typeInfo = this.constructor.#recordTypes[recordType];
			if (!typeInfo) {
				let treeNode = this.#pageItems[pageName].recordTree.addItem({
					icon: 'record-red-exclamation.png',
					text: recordType
				});
				treeNode.style.color = 'red';
				treeNode.errorMsg = `Unknown record type ${recordType}`;
				continue;
			}

			// Read updates
			let sheet = workbook.Sheets[recordType];
			let rawUpdates = XLSX.utils.sheet_to_json(sheet);
			let updates = [];
			for (let rawUpdate of rawUpdates) {
				let update = {};
				for (let key in rawUpdate) update[key.toLowerCase()] = rawUpdate[key];
				updates.push(update);
			}
			this.#pageItems[pageName].proposedUpdates[recordType] = updates;
			if (updates.length == 0) {
				let treeNode = this.#pageItems[pageName].recordTree.addItem({
					icon: 'record-red-exclamation.png',
					text: recordType
				});
				treeNode.style.color = 'red';
				treeNode.errorMsg = `No ${recordType} updates defined in selected workbook`;
				continue;
			}

			// Check keys and determine progenitor type/keys
			let missingKeys = [];
			let checkType = recordType;
			let progenitorType;
			let progenitorKeyFields = [];
			while (checkType) {
				let checkInfo = this.constructor.#recordTypes[checkType];
				if (!('keyFields' in checkInfo)) checkInfo.keyFields = [];
				for (let key of checkInfo.keyFields) {
					let recordKey = this.constructor.getRecordKey(recordType, key).toLowerCase();
					if (!(recordKey in updates[0]) && recordKey != 'version') missingKeys.push(key);
					if (!checkInfo.parentType) progenitorKeyFields.push(key);
				}
				if (!checkInfo.parentType) progenitorType = checkType;
				checkType = checkInfo.parentType;
			}
			if (missingKeys.length > 0) {
				delete this.#pageItems[pageName].proposedUpdates[recordType];
				let treeNode = this.#pageItems[pageName].recordTree.addItem({
					icon: 'record-red-exclamation.png',
					text: recordType
				});
				treeNode.style.color = 'red';
				treeNode.errorMsg = `Missing ${missingKeys.length < 2 ? 'key' : 'keys'} ${missingKeys.join(', ')}`;
				continue;
			}

			// Collate progenitors
			for (let update of updates) {

				// Compose progenitor ID
				let idParts = [];
				for (let fieldName of progenitorKeyFields) {
					let recordKey = this.constructor.getRecordKey(recordType, fieldName).toLowerCase();
					let value = update[recordKey];
					if (!value && recordKey == 'version') value = 'LATEST';
					idParts.push(value);
				}
				let progenitorID = progenitorType + '>' + idParts.join(':');
				
				// Add to list of progenitors to load if needed
				if (!this.#pageItems[pageName].progenitorIDs.includes(progenitorID)) this.#pageItems[pageName].progenitorIDs.push(progenitorID);

			}
		}

		// Load progenitors
		this.loadProgenitor(pageName);
	}

	loadProgenitor(pageName)
	{
		// Determine progenitor to load
		this.#pageItems[pageName].progenitorIndex++;
		let progenitorID = this.#pageItems[pageName].progenitorIDs[this.#pageItems[pageName].progenitorIndex];
		if (!progenitorID) {
			this.determineChanges(pageName);
			return;
		}

		// Get progenitor record type and selectors
		let selectors = [];
		let [recordType, recordID] = progenitorID.split('>');
		let typeInfo = this.constructor.#recordTypes[recordType];
		let keyNames = typeInfo.keyFields;
		let keyValues = recordID.split(':');
		for (let f = 0; f < keyNames.length; f++) {
			let keyName = keyNames[f];
			let recordKey = this.constructor.getRecordKey(recordType, keyName).toLowerCase();
			let keyValue = keyValues[f];
			if (typeof keyValue === 'string') keyValue = keyValue.replaceAll("'", "''");
			if (!['version'].includes(recordKey)) keyValue = `'${keyValue}'`;
			if (keyValue == 'LATEST') keyValue = `(SELECT version FROM versions WHERE table_name = '${recordType}' AND name = '${keyValues[0]}')`;
			selectors.push(`${recordKey} = ${keyValue}`);
		}

		// Read records
		this.readRecords(pageName, recordType, selectors);
	}

	readRecords(pageName, recordType, selectors = [], insertionPoint = this.#pageItems[pageName].records, progenitor)
	{
		// Type info & key fields
		let typeInfo = this.constructor.#recordTypes[recordType];
		let actualKeyFields = typeInfo.keyFields.map(key => this.constructor.getRecordKey(recordType, key));
		
		// Retrieve records
		let query = `
			SELECT *
			FROM ${recordType}
			WHERE ${selectors.length > 0 ? selectors.join(' AND ') : '1 = 1'}
			ORDER BY ${typeInfo.ordered ? 'order_number' : (actualKeyFields.length > 0 ? actualKeyFields.join(', ') : '1')}
		`;
		this.#pageItems[pageName].requestCount++;
		DS.query(query, records => {
			
			// Add type key to read records
			let typeKey = '@' + recordType;
			if (!(typeKey in insertionPoint)) insertionPoint[typeKey] = {};

			// Establish order if this is not a progenitor
			if (typeInfo.parentType) insertionPoint[typeKey]['#order'] = [];
			
			// Iterate records
			for (let record of records) {
				
				// Compose record ID
				let keyValues = [];
				for (let actualKeyField of actualKeyFields) {
					let keyName = actualKeyField.toLowerCase();
					let keyValue = record[keyName];
					if (keyName == 'version') {
						this.#pageItems[pageName].versionByTypeAndName[recordType + ' ' + keyValues.join(':')] = keyValue;
					};
					keyValues.push(keyValue);
				}
				let recordID = keyValues.join(':');

				// Add record ID to order
				if (typeInfo.parentType) {
					insertionPoint[typeKey]['#order'].push(recordID);
					record['#progenitor'] = progenitor;
				} else {
					progenitor = record;
					progenitor['#markChange'] = () => {
						if (progenitor['#action'] == 'insert') return;
						if (progenitor.changed_on && progenitor.changed_on.constructor !== Array) {
							progenitor.changed_on = [progenitor.changed_on, (new Date).toLocaleString("sv-SE")];
							progenitor['#action'] = 'update';
							progenitor['#apply'] = true;
						}
						if (progenitor.changed_by && progenitor.changed_by != 'SYSTEM' && progenitor.changed_on.constructor !== Array) {
							progenitor.changed_by = [progenitor.changed_by, 'SYSTEM'];
							progenitor['#action'] = 'update';
							progenitor['#apply'] = true;
						}
					};
				}
				
				// Add record to read records
				insertionPoint[typeKey][recordID] = record;
			
				// Read child records
				for (let childRecordType in this.constructor.#recordTypes) {
					
					// Get child type info
					let childTypeInfo = this.constructor.#recordTypes[childRecordType];
					if (childTypeInfo.parentType != recordType) continue;
					
					// Compose selectors
					let selectors = [];
					let currentType = childTypeInfo.parentType;
					while (currentType) {
						let currentTypeInfo = this.constructor.#recordTypes[currentType];
						for (let key of currentTypeInfo.keyFields) {
							let recordKey = this.constructor.getRecordKey(recordType, key).toLowerCase();
							let value = record[recordKey];
							if (typeof value === 'string') value = value.replaceAll("'", "''");
							if (!['version'].includes(value)) value = `'${value}'`;
							if (recordKey == 'version' && !value) {
								let name = this.constructor.getRecordKey(currentType, currentTypeInfo.keyFields[0]);
								value = `(SELECT version FROM versions WHERE table_name = '${currentType}' AND name = '${keyValues[0]}')`;
							}
							let sqlKey = this.constructor.getRecordKey(childRecordType, key);
							selectors.push(`${sqlKey} = ${value}`);
						}
						currentType = currentTypeInfo.parentType;
					}
					
					// Read child records
					this.readRecords(pageName, childRecordType, selectors, insertionPoint[typeKey][recordID], progenitor);
				}
				
			}
		}, errorMsg => {
			console.error(errorMsg);
		}, () => {
			this.#pageItems[pageName].requestCount--;
			if (this.#pageItems[pageName].requestCount == 0) this.loadProgenitor(pageName);
		});
	}

	determineChanges(pageName)
	{
		for (let recordType in this.#pageItems[pageName].proposedUpdates) {
			let typeInfo = this.constructor.#recordTypes[recordType];
			let updates = this.#pageItems[pageName].proposedUpdates[recordType];

			for (let update of updates) {

				// Locate record corresponding to proposed update
				let pathToRecord = [];
				let keyValues = {};
				let currentType = recordType;
				while (currentType) {
					let currentTypeInfo = this.constructor.#recordTypes[currentType];
					let idParts = [];
					for (let f = 0; f < currentTypeInfo.keyFields.length; f++) {
						let keyName = currentTypeInfo.keyFields[f];
						let recordKey = this.constructor.getRecordKey(recordType, keyName).toLowerCase();
						let keyValue = update[recordKey];
						if (!keyValue && recordKey == 'version') {
							keyValue = this.#pageItems[pageName].versionByTypeAndName[currentType + ' ' + idParts.join(':')];
							if (!keyValue) keyValue = '1';
						}
						idParts.push(keyValue);
						keyValues[recordKey] = keyValue;
						delete update[recordKey];
					}
					let recordID = idParts.join(':');
					pathToRecord.push(recordID);
					pathToRecord.push('@' + currentType);
					currentType = currentTypeInfo.parentType;
				}
				pathToRecord.reverse();
				let record = this.#pageItems[pageName].records;
				let recordContainer;
				for (let step of pathToRecord) {
					let isTypeStep = step.slice(0, 1) == '@';
					if (isTypeStep) currentType = step.slice(1);
					if (!(step in record)) {
						record[step] = {};
						if (!isTypeStep) {
							record[step]['#action'] = 'insert';
							let currentTypeInfo = this.constructor.#recordTypes[currentType];
							let fields = currentTypeInfo.fields;
							if (fields) {
								record[step]['#apply'] = true;
								for (let fieldName in keyValues) {
									let altFieldName = this.constructor.getRecordKey(currentType, fieldName.toUpperCase()).toLowerCase();
									record[step][altFieldName] = keyValues[fieldName];
								}
								for (let fieldName in fields) {
									if (fieldName == 'changed_on' && !currentTypeInfo.parentType) {
										record[step][fieldName] = (new Date).toLocaleString("sv-SE");
										continue;
									}
									if (fieldName == 'changed_by' && !currentTypeInfo.parentType) {
										record[step][fieldName] = 'SYSTEM';
										continue;
									}
									let defaultValue = fields[fieldName].defaultValue;
									if (typeof defaultValue == 'boolean') defaultValue = defaultValue ? 'T' : 'F';
									record[step][fieldName] = fieldName in update ? update[fieldName] : defaultValue;
								}
								if (record[step]['#progenitor']) record[step]['#progenitor']['#markChange']();
							} else {
								record[step]['#apply'] = false;
							}
						}
					}
					record = record[step];
					if (isTypeStep) recordContainer = record;
					else if ('#order' in recordContainer) {
						if (!('#proposedOrder' in recordContainer)) recordContainer['#proposedOrder'] = [];
						if (!recordContainer['#proposedOrder'].includes(step)) recordContainer['#proposedOrder'].push(step);
					}
				}

				// Continue if insertion not possible due to missing record template
				if (record['#action'] == 'insert' && record['#apply'] === false) {
					continue;
				}

				// Compare record and update field values
				for (let fieldName in record) {
					if (['@', '#'].includes(fieldName.slice(0, 1))) continue;
					if (!(fieldName in update)) continue;
					if (['changed_on', 'changed_by'].includes(fieldName)) continue;
					let recordValue = record[fieldName];
					let updateValue = update[fieldName];
					delete update[fieldName];
					if (updateValue instanceof Date) updateValue = updateValue.toLocaleString("sv-SE");
					if (typeof recordValue === 'string') recordValue = recordValue.replaceAll('\r', '');
					if (typeof updateValue === 'string') updateValue = updateValue.replaceAll('\r', '');
					if (recordValue === updateValue) continue;
					if (recordValue === null || recordValue.constructor !== Array) {
						record[fieldName] = [recordValue, updateValue];
						record['#action'] = 'update';
						record['#apply'] = true;
					}
					if (record['#progenitor']) record['#progenitor']['#markChange']();
					else if (record['#markChange']) record['#markChange']();
				}

				// Mark update keys not present on record
				for (let fieldName in update) {
					record['!' + fieldName] = update[fieldName];
				}

			}
			
		}

		this.determineInterRecordChanges(pageName);
	}

	determineInterRecordChanges(pageName, record = this.#pageItems[pageName].records)
	{
		let childTypes = Object.keys(record).filter(key => key.slice(0, 1) == '@');
		for (let childType of childTypes) {

			// Determine child record order
			let recordOrder;
			if ('#proposedOrder' in record[childType]) recordOrder = record[childType]['#proposedOrder'];
			else if ('#order' in record[childType]) recordOrder = record[childType]['#order'];
			else recordOrder = Object.keys(record[childType]).filter(key => key.slice(0, 1) != '#');

			// Render child records in proposed order
			let orderNumber = 0;
			for (let childID of recordOrder) {

				// Access child record
				let childRecord = record[childType][childID];

				// Compare order number and update if needed
				orderNumber++;
				if (('order_number' in childRecord) && childRecord.order_number !== orderNumber) {
					if (childRecord['#action'] != 'insert') {
						childRecord.order_number = [childRecord.order_number, orderNumber];
						childRecord['#action'] = 'update';
						childRecord['#apply'] = true;
					} else {
						childRecord.order_number = orderNumber;
					}
					if (childRecord['#progenitor']) childRecord['#progenitor']['#markChange']();
				}

				// If parent record is marked for removal, mark child record for removal too
				if ('#action' in record && record['#action'] == 'delete') {
					childRecord['#action'] = 'delete';
					childRecord['#apply'] = true;
					if (childRecord['#progenitor']) childRecord['#progenitor']['#markChange']();
				}

				// Process child records
				this.determineInterRecordChanges(pageName, childRecord);

			}

			// Check for records not included in proposed order
			if ('#proposedOrder' in record[childType]) {
				for (let childID of record[childType]['#order']) {

					// Skip included record
					if (record[childType]['#proposedOrder'].includes(childID)) continue;

					// Access child record
					let childRecord = record[childType][childID];

					// Mark for removal
					childRecord['#action'] = 'delete';
					childRecord['#apply'] = true;
					if (childRecord['#progenitor']) childRecord['#progenitor']['#markChange']();
	
					// Render child nodes
					this.determineInterRecordChanges(pageName, childRecord);

				}
			}

		}
		if (record == this.#pageItems[pageName].records) {
			console.log(this.#pageItems[pageName].records);
			this.renderTreeNode(pageName);
		}
	}

	renderTreeNode(pageName, record = this.#pageItems[pageName].records, parentNode = this.#pageItems[pageName].recordTree)
	{
		let childTypes = Object.keys(record).filter(key => key.slice(0, 1) == '@');
		for (let childType of childTypes) {

			// Determine child record order
			let recordOrder;
			if ('#proposedOrder' in record[childType]) recordOrder = record[childType]['#proposedOrder'];
			else if ('#order' in record[childType]) recordOrder = record[childType]['#order'];
			else recordOrder = Object.keys(record[childType]).filter(key => key.slice(0, 1) != '#');

			// Render child records in proposed order
			for (let childID of recordOrder) {

				// Access child record
				let childRecord = record[childType][childID];

				// Determine icon based on proposed action
				let icon, skipIcon;
				switch (childRecord['#action']) {
					case 'insert': icon = 'record-blue.png'; skipIcon = 'record-blue-x.png'; break;
					case 'update': icon = 'record-orange.png'; skipIcon = 'record-orange-x.png'; break;
					case 'delete': icon = 'record-red.png'; skipIcon = 'record-red-x.png'; break;
					default: icon = 'record.png'; break;
				}

				// Signal pending updates
				if (childRecord['#action'] && childRecord['#apply']) {
					this.#pageItems[pageName].pageGrid.pendingUpdates = true;
					this.#applyChangesButton.setEnabled(true);
				}

				// Create tree node
				let nodeIcon = '#action' in childRecord ? (childRecord['#apply'] ? icon : skipIcon) : icon;
				let treeNode = parentNode.addItem({
					icon: nodeIcon,
					text: childType.slice(1) + ' ' + childID
				});
				treeNode.recordType = childType.slice(1);
				treeNode.record = childRecord;
				treeNode.applyIcon = icon;
				treeNode.skipIcon = skipIcon;

				// Render child nodes
				this.renderTreeNode(pageName, childRecord, treeNode);

			}

			// Check for records not included in proposed order
			if ('#proposedOrder' in record[childType]) {
				for (let childID of record[childType]['#order']) {

					// Skip included record
					if (record[childType]['#proposedOrder'].includes(childID)) continue;

					// Access child record
					let childRecord = record[childType][childID];

					// Create tree node
					let treeNode = parentNode.addItem({
						icon: 'record-red.png',
						text: childType.slice(1) + ' ' + childID
					});
					treeNode.recordType = childType.slice(1);
					treeNode.record = childRecord;
					treeNode.applyIcon = 'record-red.png';
					treeNode.skipIcon = 'record-red-x.png';
	
					// Render child nodes
					this.renderTreeNode(pageName, childRecord, treeNode);

				}
			}

		}
	}

	checkForChanges(pageName, record = this.#pageItems[pageName].records)
	{
		if (record['#action'] && record['#apply']) return true;
		let childTypes = Object.keys(record).filter(key => key.slice(0, 1) == '@');
		for (let childType of childTypes) {
			let childNames = Object.keys(record[childType]).filter(key => key.slice(0, 1) != '#');
			for (let childName of childNames) {
				let isChanged = this.checkForChanges(pageName, record[childType][childName]);
				if (isChanged) return true;
			}
		}
		return false;
	}

	displayRecord(pageName, treeNode)
	{
		if (this.#pageItems[pageName].changesApplied) return;

		let recordType = treeNode.recordType;
		let record = treeNode.record;

		// Action view
		let actionView = new DCView({
			in: this.#pageItems[pageName].infoCell,
			replaceContents: true,
			className: 'center',
			styles: { margin: '10px 0', fontWeight: 'bold' }
		});
		if (!record['#action']) actionView.textContent = '—';
		else new DCCheckBox({
			in: actionView,
			text: record['#action'].toUpperCase(),
			value: record['#apply'],
			onToggle: value => {
				record['#apply'] = value;
				treeNode.setIcon(value ? treeNode.applyIcon : treeNode.skipIcon);
				this.#pageItems[pageName].pageGrid.pendingUpdates = this.checkForChanges(pageName);
				this.#applyChangesButton.setEnabled(this.#pageItems[pageName].pageGrid.pendingUpdates);
			}
		});

		// Check for fieldless record
		let fieldNames = Object.keys(record).filter(fieldName => !['@', '#', '!'].includes(fieldName.slice(0, 1)));
		if (record['#action'] && fieldNames.length == 0) {
			actionView.firstChild.setEnabled(false);
			new DCView({
				in: this.#pageItems[pageName].infoCell,
				classes: ['center', 'error'],
				text: 'Unable to insert due to missing field definitions'
			});
			return;
		}

		// Compile fields to exclude from view
		let excludeKeys = [];
		let checkType = recordType;
		while (checkType) {
			let typeInfo = this.constructor.#recordTypes[checkType];
			let keyFields = typeInfo.keyFields;
			excludeKeys.push(...keyFields.map(key => this.constructor.getRecordKey(recordType, key)));
			checkType = typeInfo.parentType;
		}

		// Key-value view
		let keyValueView = new DCKeyValueView({ in: this.#pageItems[pageName].infoCell, className: 'static', columnize: true });
		for (let key in record) {
			if (excludeKeys.includes(key.toUpperCase())) continue;
			if (['@', '#'].includes(key.slice(0, 1))) continue;
			let value = record[key];
			let item = keyValueView.addItem({ label: key });
			if (key.slice(0, 1) == '!') {
				item.style.textDecoration = 'line-through';
				item.keyCell.textContent = key.slice(1);
			}
			if (value === null) {
				item.valueCell.textContent = 'NULL';
				item.valueCell.style.fontStyle = 'italic';
			} else if (value.constructor === Array) {
				item.style.backgroundColor = '#fcf8e3';
				new DCText({
					in: item.valueCell,
					text: value[0] === null ? 'NULL' : value[0],
					styles: { textDecoration: 'line-through', fontStyle: value[0] === null ? 'italic' : '' }
				});
				new DCText({
					in: item.valueCell,
					text: ' ' + (value[1] === null ? 'NULL' : value[1]),
					styles: { fontStyle: value[1] === null ? 'italic' : '' }
				});
			} else {
				item.valueCell.textContent = value;
			}
		}
		if (record['#action'] && record['#action'] == 'insert') keyValueView.style.backgroundColor = '#d9edf7';
		if (record['#action'] && record['#action'] == 'delete') keyValueView.style.backgroundColor = '#f2dede';
		keyValueView.updateColumns();
	}

	displayError(pageName, treeNode)
	{
		new DCView({
			in: this.#pageItems[pageName].infoCell,
			replaceContents: true,
			classes: ['fill', 'center', 'error'],
			text: treeNode.errorMsg
		});
	}

	composeQuery(record, recordType, recordName)
	{
		let queries = [];
		if (record['#action'] && record['#apply']) {
			let typeInfo = this.constructor.#recordTypes[recordType];
			let actualKeyFields = [];
			let checkType = recordType;
			while (checkType) {
				let typeInfo = this.constructor.#recordTypes[checkType];
				let keyFields = typeInfo.keyFields;
				actualKeyFields = keyFields.map(key => this.constructor.getRecordKey(recordType, key).toLowerCase()).concat(actualKeyFields);
				checkType = typeInfo.parentType;
			}
			
			// Audit
			let auditTxHeaderPieces = [];
			let auditTxBodyPieces = [];
			if (!typeInfo.parentType) {
				this.#auditInfo = {
					parentTable: recordType,
					parentKey: record[actualKeyFields[0]],
					auditTimestamp: (new Date).toLocaleString("sv-SE", { timeZone: "UTC" }),
					counter: 0
				};
			}
			
			// Query
			let query;
			if (['update', 'delete'].includes(record['#action'])) {
				
				// UPDATE or DELETE
				if (record['#action'] == 'update') {
					query = 'UPDATE ' + recordType.toLowerCase() + '\n'
					let setClauseParts = [];
					for (let fieldName in record) {
						let value = record[fieldName];
						if (value === null || value.constructor != Array) continue;
						value = value[1];
						auditTxBodyPieces.push(fieldName.toUpperCase());
						auditTxBodyPieces.push(value);
						if (value === null) value = 'NULL';
						else if (typeof value !== 'number') value = `'${value.replaceAll("'", "''")}'`;
						setClauseParts.push(fieldName + ' = ' + value);
					}
					query += 'SET ' + setClauseParts.join(', ') + '\n';
				} else {
					query = 'DELETE FROM ' + recordType.toLowerCase() + '\n'
				}
				
				// WHERE clause
				let whereClauseParts = [];
				for (let fieldName of actualKeyFields) {
					let value = record[fieldName];
					auditTxHeaderPieces.push(fieldName.toUpperCase());
					auditTxHeaderPieces.push(value);
					if (value === null) value = 'NULL';
					else if (typeof value !== 'number') value = `'${value.replaceAll("'", "''")}'`;
					whereClauseParts.push(fieldName + ' = ' + value);
				}
				query += 'WHERE ' + whereClauseParts.join('\n\tAND ');
				
			} else {
				
				// INSERT
				let filteredKeys = Object.keys(record).filter(key => !['#', '!', '@'].includes(key.slice(0, 1)));
				let keysCSV = '';
				let valuesCSV = '';
				for (let f = 0; f < filteredKeys.length; f++) {
					if (f > 0) {
						keysCSV += ', ';
						valuesCSV += ', ';
					}
					if (f % 6 == 0) {
						keysCSV += '\n\t';
						valuesCSV += '\n\t';
					}
					keysCSV += filteredKeys[f];
					let value = record[filteredKeys[f]];
					if (value !== null) {
						auditTxBodyPieces.push(filteredKeys[f].toUpperCase());
						auditTxBodyPieces.push(value);
					}
					if (value === null) value = 'NULL';
					else if (typeof value !== 'number') value = `'${value.replaceAll("'", "''")}'`;
					valuesCSV += value;
				}
				query = 'INSERT INTO ' + recordType.toLowerCase() + ' (' + keysCSV + '\n) VALUES (' + valuesCSV + '\n)';
				
				// VERSIONS record
				if (filteredKeys.includes('version') && !typeInfo.parentType) {
					queries.push(query);
					query = `INSERT INTO versions (table_name, name, version) VALUES ('${recordType}', '${record[actualKeyFields[0]]}', ${record.version})`;
				}
			}
			queries.push(query);
				
			// Audit transaction
			if (auditTxBodyPieces.length > 0 && this.#auditInfo) {
				this.#auditInfo.counter++;
				query = {
					parentTable: this.#auditInfo.parentTable,
					parentKey: this.#auditInfo.parentKey,
					tableName: recordType,
					auditTimestamp: this.#auditInfo.auditTimestamp,
					counter: this.#auditInfo.counter,
					action: record['#action'] == 'insert' ? 'Insert' : 'Update',
					rawTransString: auditTxHeaderPieces.concat(auditTxBodyPieces).join(String.fromCharCode(1))
				};
				queries.push(query);
			}

		}
		let childTypes = Object.keys(record).filter(key => key.slice(0, 1) == '@');
		for (let childType of childTypes) {
			let childNames = Object.keys(record[childType]).filter(key => key.slice(0, 1) != '#');
			for (let childName of childNames) {
				let subQueries = this.composeQuery(record[childType][childName], childType.slice(1), childName);
				if (subQueries.length > 0) queries = queries.concat(subQueries);
			}
		}
		return queries;
	}

	applyChanges()
	{
		// Get page name & disable treeview node selection
		let pageName = this.#toolBar.getSelectedItemByChoiceGroup('page').getText();
		this.#pageItems[pageName].changesApplied = true;
		
		// Initialize editor
		let editor = ace.edit(new DCView({
			in: this.#pageItems[pageName].infoCell,
			replaceContents: true,
			className: 'fill'
		}));
		editor.$blockScrolling = Infinity;
		editor.setTheme("ace/theme/xcode");
		editor.getSession().setMode("ace/mode/sql");
		editor.renderer.setShowGutter(false);
		editor.setShowPrintMargin(false);
		editor.setHighlightActiveLine(false);
		editor.setFontSize(14);
		editor.setWrapBehavioursEnabled(false);
		editor.setReadOnly(true);

		// Get queries and audit objects
		let queries = this.composeQuery(this.#pageItems[pageName].records);
		this.convertAuditObjectToQuery(queries, -1, editor);
	}
	
	convertAuditObjectToQuery(queries, q, editor)
	{
		q++;
		if (q == queries.length) return this.runQuery(queries, -1, editor);
		
		let query = queries[q];
		if (typeof query !== 'object') return this.convertAuditObjectToQuery(queries, q, editor);
		
		DS.cmd('encrypt', {salt: 'UnLicensed copy - Demo only', text: query.rawTransString}, cipherTexts => {
			let auditRecord = {
				parent_table: query.parentTable,
				parent_key: query.parentKey,
				audit_timestamp: query.auditTimestamp,
				counter: query.counter,
				trans_order: query.counter,
				table_name: query.tableName,
				action: query.action,
				audit_type: 'TableUpdate',
				reason: 'Imported using LabSys Data Importer',
				user_name: 'SYSTEM',
				user_role: null,
				record_signed: 'F',
				trans_string: cipherTexts[0]
			};
			let keysCSV = Object.keys(auditRecord).join(', ');
			let valuesCSV = Object.values(auditRecord).map(value => {
				if (value === null) value = 'NULL';
				else if (typeof value !== 'number') value = `'${value.replaceAll("'", "''")}'`;
				return value;
			}).join(', ');
			queries[q] = `INSERT INTO table_audit_log (${keysCSV}) VALUES (${valuesCSV})`;
		}, errorMsg => {
			console.error(errorMsg);
		}, () => {
			this.convertAuditObjectToQuery(queries, q, editor);
		});
	}
	
	runQuery(queries, q, editor)
	{
		q++;
		let query = queries[q];
		if (!query) return;
		editor.session.insert(editor.getCursorPosition(), query + '\n');
		DS.cmd('query', {query: query}, ({records, info}) => {
			let recordsAffectedNotice = (info.affectedRecordCount > 0 ? info.affectedRecordCount.toString() : 'No') + 
				' record' + (info.affectedRecordCount > 1 ? 's' : '') + 
				' affected';
			editor.session.insert(editor.getCursorPosition(), '-- ' + recordsAffectedNotice + '\n\n');
		}, (errorMsg) => {
			editor.session.insert(editor.getCursorPosition(), '-- ' + errorMsg + '\n\n');
		}, () => {
			editor.renderer.scrollToLine(Number.POSITIVE_INFINITY);
			this.runQuery(queries, q, editor);
		});
	}
}

DS.registerModule(DMDataImporter);