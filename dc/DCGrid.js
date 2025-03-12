class DCGrid extends DCControl
{
	#resizable = false;
	#cells = [];
	#initialRowSizes;
	#rowSizes;
	#initialColSizes;
	#colSizes;
	#sizers = [];
	#activeSizer;
	#resizing = false;
	#visualizeSizers = false;

	constructor(params)
	{
		super(params);
		if (params.classes && params.classes.includes('resizable')) this.#resizable = true;

		this.#rowSizes = params.rows;
		this.#colSizes = params.cols;

		let skipCountsByCol = {};
		for (let r = 0; r < this.#rowSizes.length; r++) {
			for (let c = 0; c < this.#colSizes.length; c++) {
				if (c in skipCountsByCol && skipCountsByCol[c] > 0) {
					skipCountsByCol[c]--;
					continue;
				}
				let cell = new DCView({ in: this });
				cell.dataset.row = r;
				cell.dataset.col = c;
				if (r + 1 == this.#rowSizes.length) cell.classList.add('last-row');
				if (c + 1 == this.#colSizes.length) cell.classList.add('last-col');
				this.#cells.push(cell);
				if ('cellSpans' in params) {
					let cellSpan = params.cellSpans.find(spanInfo => spanInfo.cell[0] == r && spanInfo.cell[1] == c);
					if (cellSpan && cellSpan.rowSpan) {
						cell.classList.add('rspan');
						cell.style.gridRow = 'span ' + cellSpan.rowSpan.toString();
						cell.dataset.sizerRow = r + cellSpan.rowSpan - 1;
						skipCountsByCol[c] = (cellSpan.rowSpan - 1);
						if (r + cellSpan.rowSpan == this.#rowSizes.length) cell.classList.add('last-row');
					}
					if (cellSpan && cellSpan.colSpan) {
						cell.classList.add('cspan');
						cell.style.gridColumn = 'span ' + cellSpan.colSpan.toString();
						c += (cellSpan.colSpan - 1);
					}
				}
			}
		}
		this.#initialRowSizes = [...this.#rowSizes];
		this.#initialColSizes = [...this.#colSizes];
		if (this.#resizable) {
			this.addEventListener('mousemove', this.#onMouseMove.bind(this));
			this.addEventListener('mousedown', this.#onMouseDown.bind(this));
			this.addEventListener('dragstart', evt => {
				evt.preventDefault();
				evt.stopPropagation();
			});
			let resizeObserver = new ResizeObserver(entries => {
				if (entries[0].contentRect.width == 0) return;
				this.#updateSizers();
			});
			resizeObserver.observe(this);
		}
		this.#reflow();
	}

	#reflow()
	{
		this.style.gridTemplateRows = this.#rowSizes.join(' ');
		this.style.gridTemplateColumns = this.#colSizes.join(' ');
		if (this.#resizable) this.#updateSizers();
		this.dispatchEvent(new CustomEvent('reflow', { detail: { rowSizes: this.#rowSizes, colSizes: this.#colSizes } }));
	}

	#updateSizers()
	{
		let gridRect = this.getBoundingClientRect();
		if (gridRect.width == 0) return;
		this.#sizers = [];
		for (let cell of this.children) {
			let cellRect = cell.getBoundingClientRect();
			if (!cell.classList.contains('last-row')) this.#sizers.push({
				type: 'h',
				x0: cellRect.x,
				x1: cellRect.x + cellRect.width,
				y0: cellRect.y + cellRect.height - 6,
				y1: cellRect.y + cellRect.height + 5,
				row: !cell.dataset.sizerRow ? parseInt(cell.dataset.row) : parseInt(cell.dataset.sizerRow),
				col: parseInt(cell.dataset.col)
			});
			if (!cell.classList.contains('last-col')) this.#sizers.push({
				type: 'v',
				x0: cellRect.x + cellRect.width - 6,
				x1: cellRect.x + cellRect.width + 5,
				y0: cellRect.y,
				y1: cellRect.y + cellRect.height,
				row: parseInt(cell.dataset.row),
				col: parseInt(cell.dataset.col)
			});
		}
		if (this.#visualizeSizers) for (let sizer of this.#sizers) {
			let div = document.createElement('div');
			div.style.position = 'fixed';
			div.style.left = `${sizer.x0}px`;
			div.style.top = `${sizer.y0}px`;
			div.style.width = `${sizer.x1 - sizer.x0}px`;
			div.style.height = `${sizer.y1 - sizer.y0}px`;
			div.style.backgroundColor = sizer.type == 'h' ? 'rgba(192, 255, 0, 0.5)' : 'rgba(255, 255, 0, 0.5)';
			document.body.appendChild(div);
		}
	}

	#onMouseMove(evt)
	{
		if (this.#resizing) return;
		let sizer = this.#sizers.find(sizer => sizer.x0 < evt.clientX && sizer.x1 > evt.clientX && sizer.y0 < evt.clientY && sizer.y1 > evt.clientY);
		if (!sizer) {
			this.#activeSizer = null;
			this.classList.remove('h-sizer-active', 'v-sizer-active');
			return;
		}
		this.#activeSizer = sizer;
		this.classList.add(sizer.type == 'h' ? 'h-sizer-active' : 'v-sizer-active');
	}

	#onMouseDown(evt)
	{
		if (!this.#activeSizer) return;
		evt.stopPropagation();
		let { type, row, col } = this.#activeSizer;
		let mouseMoveFn;
		if (type == 'v') {
			let beforeCell = this.querySelector(`[data-col="${col}"]:not(.cspan)`);
			let beforeCellInitialWidth = beforeCell.offsetWidth;
			let afterCell = this.querySelector(`[data-col="${(col + 1)}"]:not(.cspan)`);
			let afterCellInitialWidth = afterCell.offsetWidth;
			let initialX = evt.clientX;
			mouseMoveFn = evt => {
				evt.stopPropagation();
				let d = evt.clientX - initialX;
				let beforeCellNewWidth = beforeCellInitialWidth + d;
				let afterCellNewWidth = afterCellInitialWidth - d;
				if (beforeCellNewWidth > 20 && afterCellNewWidth > 20) {
					this.#colSizes[col] = `${beforeCellNewWidth}px`;
					this.#colSizes[col + 1] = !afterCell.classList.contains('last-col') ? `${afterCellNewWidth}px` : 'auto';
					this.#reflow();
				}
			}
		} else {
			let beforeCell = this.querySelector(`[data-row="${row}"]:not(.rspan)`);
			let beforeCellInitialHeight = beforeCell.offsetHeight;
			let afterCell = this.querySelector(`[data-row="${(row + 1)}"]:not(.rspan)`);
			let afterCellInitialHeight = afterCell.offsetHeight;
			let initialY = evt.clientY;
			mouseMoveFn = evt => {
				evt.stopPropagation();
				let d = evt.clientY - initialY;
				let beforeCellNewHeight = beforeCellInitialHeight + d;
				let afterCellNewHeight = afterCellInitialHeight - d;
				if (beforeCellNewHeight > 20 && afterCellNewHeight > 20) {
					this.#rowSizes[row] = `${beforeCellNewHeight}px`;
					this.#rowSizes[row + 1] = !afterCell.classList.contains('last-row') ? `${afterCellNewHeight}px` : 'auto';
					this.#reflow();
				}
			}
		}
		for (let cell of this.#cells) cell.style.pointerEvents = 'none';
		this.#resizing = true;
		this.addEventListener('mousemove', mouseMoveFn);
		let mouseUpFn = evt => {
			this.removeEventListener('mousemove', mouseMoveFn);
			this.removeEventListener('mouseup', mouseUpFn);
			this.removeEventListener('mouseleave', mouseUpFn);
			for (let cell of this.#cells) cell.style.pointerEvents = 'auto';
			this.#resizing = false;
		}
		this.addEventListener('mouseup', mouseUpFn);
		this.addEventListener('mouseleave', mouseUpFn);
	}

	getCell(cellIndex)
	{
		return this.#cells[cellIndex];
	}
	
	getCells()
	{
		return this.#cells;
	}

	resetLayout()
	{
		this.#rowSizes = [...this.#initialRowSizes];
		this.#colSizes = [...this.#initialColSizes];
		this.#reflow();
	}

	updateLayout({rowSizes, colSizes})
	{
		const areRowSizesSame = rowSizes.every((v,i) => v === this.#rowSizes[i]);
		const areColSizesSame = colSizes.every((v,i) => v === this.#colSizes[i]);
		if (areRowSizesSame && areColSizesSame) return;
		this.#rowSizes = [...rowSizes];
		this.#colSizes = [...colSizes];
		this.#reflow();
	}
}

window.customElements.define('dc-grid', DCGrid);