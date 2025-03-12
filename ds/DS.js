class DS
{
	static #shellName = document.title;
	static #data;
	static #modules = {};
	static #instancePager;
	static #moduleCell;
	static #pageTrail = [];
	
	static registerModule(moduleClass)
	{
		this.#modules[moduleClass.name] = moduleClass;
	}

	static cmd(cmd, params = {}, okFn, errorFn, thenFn)
	{
		let request;
		let requestTags = {};
		if ('requestTags' in params) {
			requestTags = params.requestTags;
			delete params.requestTags;
		}
		if (cmd != 'getFile') {
			let abortController = new AbortController();
			let uri = `http://${window.location.host}/${encodeURIComponent(cmd)}`;
			request = new Request(uri, { method: 'POST', body: JSON.stringify(params), signal: abortController.signal });
		} else {
			request = params.file;
		}
		fetch(request).then(response => {
			let contentType = response.headers.get('content-type');
			if (response.status === 200) {
				if (contentType == 'application/json') response.json().then(obj => {
					if (okFn) okFn(obj, requestTags);
					if (thenFn) thenFn(requestTags);
				}).catch(error => {
					if (errorFn) errorFn(error.message, requestTags);
					if (thenFn) thenFn(requestTags);
				});
				else response.text().then(text => {
					if (okFn) okFn(text, requestTags);
					if (thenFn) thenFn(requestTags);
				});
			} else {
				response.text().then(text => {
					if (errorFn) errorFn(text, requestTags);
					if (thenFn) thenFn(requestTags);
				});
			}
		}).catch(error => {
			if (errorFn) errorFn(typeof error === 'string' ? error : error.message, requestTags);
			else console.log(error);
			if (thenFn) thenFn(requestTags);
		});
		if (cmd != 'getFile') return {
			abort: reason => abortController.abort(reason)
		};
	}

	static query(query, okFn, errorFn, thenFn)
	{
		return this.cmd('query', { query: query }, recordsAndInfo => okFn(recordsAndInfo.records, recordsAndInfo.info), errorFn, thenFn);
	}
	
	static init()
	{
		// Main grid
		const mainGrid = new DCGrid({
			in: document.body,
			cols: ['100%'],
			rows: ['auto', '1fr']
		});
		const [navCell, moduleCell] = mainGrid.getCells();
		
		// Nav cell
		navCell.classList.add('titlebar');
		const navGrid = new DCGrid({
			in: navCell,
			cols: ['8px', '1fr', 'auto', 'auto', 'auto'],
			rows: ['100%']
		});
		const [spacerCell, pagerCell, widgetCell, launchCell, getInfoCell] = navGrid.getCells();

		// Nav > Pager
		this.#instancePager = new DCPager({ in: pagerCell, rearrangeable: true });
		this.#instancePager.addEventListener('itemSelected', evt => {
			let item = evt.detail.item;
			if (!item) return;
			let itemPos = this.#pageTrail.indexOf(item);
			if (itemPos > -1) {
				this.#pageTrail.push(this.#pageTrail.splice(itemPos, 1)[0]);
			} else {
				this.#pageTrail.push(item);
			}
		});

		// Nav > Module Launcher
		DSModuleLauncher.init(launchCell, this.#modules);

		// Nav > Info
		DSInfoManager.init(getInfoCell);
		
		// Module cell
		moduleCell.classList.add('module');
		this.#moduleCell = moduleCell;

		// Key bindings
		document.addEventListener('keydown', evt => {
			if ((evt.metaKey || evt.ctrlKey) && evt.altKey && evt.key != 'Alt' && evt.key != 'Control') {
				evt.preventDefault();
				switch (evt.key) {
					case 'l': launchCell.click(); break;
					default:
						let activePagerTab = this.#instancePager.getSelectedItem();
						if (activePagerTab) activePagerTab.node.dispatchEvent(new CustomEvent('command', { detail: { key: evt.key } }));
					break;
				}
			}
		});

		// Read data & state
		DS.cmd('readFile', { module: this.name }, (data) => {
			this.#data = data;
			if (!('connections' in this.#data)) this.#data.connections = {};
			DSConnectionManager.init(widgetCell, {...this.#data.connections}, connections => {
				if (JSON.stringify(connections) == JSON.stringify(this.#data.connections)) return;
				this.#data.connections = {...connections};
				this.save();
			});
			DS.cmd('readFile', {}, (state) => {
				if ('moduleInstances' in state) {
					for (let instanceInfo of state.moduleInstances) {
						let module = this.#modules[instanceInfo.moduleName];
						this.createInstance(module, { state: instanceInfo.state });
					}
				}
				if ('activeModuleInstance' in state && state.activeModuleInstance !== null) {
					this.#instancePager.setSelectedItem({ at: state.activeModuleInstance });
				}
				if ('connection' in state && state.connection !== null) {
					DSConnectionManager.connect(state.connection);
				}
				if (this.#instancePager.children.length == 0) DSModuleLauncher.open();
			}, errorMsg => {
				alert(errorMsg);
			});
		}, errorMsg => {
			alert(errorMsg);
		});

		// Write state when exiting DMS Shell
		document.onvisibilitychange = () => {
			if (document.visibilityState === 'hidden') {
				let state = {
					moduleInstances: [],
					activeModuleInstance: null,
					connection: DSConnectionManager.getCurrentConnectionName()
				};
				let items = this.#instancePager.children;
				for (let i = 0; i < items.length; i++) {
					let item = items[i];
					state.moduleInstances.push({
						moduleName: item.moduleInstance.constructor.name,
						state: item.moduleInstance.state ? item.moduleInstance.state : null
					});
					if (item.isSelected()) state.activeModuleInstance = i;
				}
				navigator.sendBeacon('/writeFile', JSON.stringify({data: state}));
			}
		};

		// Notify active module when DMS Shell is about to be terminated
		window.addEventListener('beforeunload', evt => {
			let activePagerTab = this.#instancePager.getSelectedItem();
			if (activePagerTab) {
				let instance = activePagerTab.moduleInstance;
				if (instance.terminate) {
					instance.terminate(evt);
				}
			}
		});

		// History management
		window.onpopstate = evt => {
			let direction = evt.state === null ? -1 : evt.state.stage;
			if (direction == 0) return;
			else if (direction < 0) history.forward();
			else if (direction > 0) history.back();
			let activePagerTab = this.#instancePager.getSelectedItem();
			if (activePagerTab) {
				let instance = activePagerTab.moduleInstance;
				if (instance.navigate) {
					instance.navigate(direction);
				}
			}
		};
		if (history.length < 2) {
			history.pushState({ stage: 0 }, null);
			history.pushState({ stage: 1 }, null);
			history.back();
		}
	}

	static save()
	{
		DS.cmd('writeFile', { module: this.name, data: this.#data }, () => {
			console.log('wrote data');
		}, errorMsg => {
			alert(errorMsg);
		});
	}
	
	static createInstance(moduleClass, params = {})
	{
		// Instance page
		let page = new DCView({ in: this.#moduleCell, show: false, styles: { height: '100%' } });

		// Module instance
		let moduleInstance = new moduleClass({ rootNode: page, state: 'state' in params ? params.state : null });
		if (!moduleClass.instances) moduleClass.instances = [];
		moduleClass.instances.push(moduleInstance);
		moduleClass.activeInstance = null;

		// Instance pager item
		moduleInstance.pagerTab = this.#instancePager.addItem({
			icon: moduleClass.shellIcon,
			text: moduleClass.shellName,
			node: page,
			onMiddleClick: this.destroyInstance.bind(this, moduleInstance)
		});
		moduleInstance.pagerTab.moduleInstance = moduleInstance;

		// Track active instance
		this.#instancePager.addEventListener('itemSelected', evt => {
			let previousTab = evt.detail.previousItem;
			if (previousTab) previousTab.moduleInstance.constructor.activeInstance = null;
			let currentTab = evt.detail.item;
			if (currentTab) {
				currentTab.moduleInstance.constructor.activeInstance = currentTab.moduleInstance;
				document.title = currentTab.moduleInstance.constructor.shellName;
			} else {
				document.title = this.#shellName;
			}
		});

		// Bring to fore
		let bringToFore = 'bringToFore' in params ? params.bringToFore : false;
		if (bringToFore) this.#instancePager.setSelectedItem(moduleInstance.pagerTab);
	}

	static destroyInstance(instance)
	{
		// Notify instance
		instance.pagerTab.node.dispatchEvent(new CustomEvent('quit'));

		// Remove instance
		let moduleClass = instance.constructor;
		let instanceIndex = moduleClass.instances.indexOf(instance);
		moduleClass.instances[instanceIndex] = null;
		moduleClass.instances.splice(instanceIndex, 1);

		// Remove trail entry, page, and pager tab
		let pagerTabPos = this.#pageTrail.indexOf(instance.pagerTab);
		if (pagerTabPos > -1) this.#pageTrail.splice(pagerTabPos, 1);
		instance.pagerTab.node.detach();
		instance.pagerTab.remove();

		// Activate next instance
		if (this.#pageTrail.length > 0) {
			let previousActiveItem = this.#pageTrail[this.#pageTrail.length - 1];
			if (previousActiveItem) previousActiveItem.click();
		} else {
			let lastPagerTab = this.#instancePager.lastChild;
			if (lastPagerTab) lastPagerTab.click();
			else DSModuleLauncher.open();
		}
	}
}