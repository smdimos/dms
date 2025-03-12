const http = require('http');
const fs = require('fs');
const path = require('path');
const dialog = require('dialog');
const odbc = require('odbc');
const crypto = require('crypto');
const ConsoleWindow = require('node-hide-console-window');
const WindowsTrayicon = require('windows-trayicon');

class DMS
{
	static trayApp;
	static isConsoleVisible = false;
	static currentDB = null;
	static currentODBCString = null;

	static contentTypeByExt = {
		'css': 'text/css',
		'html': 'text/html',
		'jpg': 'image/jpg',
		'js': 'text/javascript',
		'json': 'application/json',
		'map': 'application/json',
		'png': 'image/png',
		'svg': 'image/svg+xml',
		'wav': 'audio/wav'
	};

	static start()
	{
		// Process title & data directory
		process.title = this.name;
		try {
			this.pathToDataDir = path.join(process.env.APPDATA, 'DMS');
			if (!fs.existsSync(this.pathToDataDir)) fs.mkdirSync(this.pathToDataDir);
		} catch (error) {
			dialog.err('Unable to create directory:\r\n' + this.pathToDataDir + '\r\n\r\n' + error.message + '.', 'Error', evt => process.exit(1));
			return;
		}
		
		// Tray app
		ConsoleWindow.hideConsole();
		this.trayApp = new WindowsTrayicon({
			title: 'DMS',
			icon: path.resolve(__dirname, './rs/flask.ico'),
			menu: [
				{
					id: 'toggleConsole',
					caption: 'Toggle Console'
				},
				{
					id: 'exit',
					caption: 'Exit'
				}
			]
		});
		this.trayApp.item((id) => {
			switch (id) {
				case 'toggleConsole': {
					if (!this.isConsoleVisible) ConsoleWindow.showConsole();
					else ConsoleWindow.hideConsole();
					this.isConsoleVisible = !this.isConsoleVisible;
					break;
				}
				case 'exit': {
					this.exit();
					break;
				}
			}
		});

		// Server
		let port = 3462;
		const server = http.createServer(this.handleRequest.bind(this)).listen(port);
		require('child_process').exec(`start http://localhost:${port}/`);
	}

	static handleRequest(request, response)
	{
		let urlParts = request.url.split('/');
		if (request.method != 'POST') {
			if (request.url == '/') return this.initClient(request, response);
			return this.serveFile(request, response);
		}
		let command = urlParts[1];
		let method = this['$' + command];
		if (typeof method !== 'function') {
			return this.errorOut(response, { message: command.length < 1 ? 'No command specified' : 'Command ' + command + ' not supported' });
		}
		let paramsJSON = '';
		request.on('data', data => paramsJSON += data);
		request.on('end', () => {
			let params = {};
			if (paramsJSON.length !== 0) {
				try {
					params = JSON.parse(paramsJSON);
				} catch (error) {
					return this.errorOut(response, { message: error.message });
				}
			}
			method.call(this, response, params);
		});
	}

	static initClient(request, response)
	{
		// Init includes
		let cssIncludes = [
			'pk/normalize.css'
		];
		let jsIncludes = [
			'pk/ace/ace.js',
			'pk/ag-grid-enterprise.mod.js',
			'pk/xlsx.full.min.js'
		];

		// DMS Controls & Shell & Modules
		let dirs = ['dc/', 'ds/', 'dt/', 'dm/'];
		for (let dir of dirs) {
			let baseNames = fs.readdirSync(dir);
			if (dir == 'dc/') {
				let firstFile = 'DCControl.js';
				let index = baseNames.indexOf(firstFile);
				baseNames.splice(index, 1);
				baseNames.unshift(firstFile);
			}
			for (let baseName of baseNames) {
				let ext = baseName.split('.').pop();
				if (ext == 'css') cssIncludes.push(dir + baseName);
				else if (ext == 'js') jsIncludes.push(dir + baseName);
			}
		}

		// HTML
		let html = `
			<!DOCTYPE html>
			<html lang="en">

			<head>
			<meta charset="UTF-8" />
			<title>DMS</title>
			<link rel="icon" type="image/png" href="rs/flask.png" />
			${cssIncludes.map(fileName => '<link href="' + fileName + '" rel="stylesheet" />').join('\r\n')}
			${jsIncludes.map(fileName => '<script src="' + fileName + '"></script>').join('\r\n')}
			</head>

			<body onload="DS.init()" />

			</html>
		`.replace(/\t/g, '').trim();
		response.writeHead(200, { 'Content-Type': this.contentTypeByExt.html });
		response.end(html, 'utf-8');
	}

	static serveFile(request, response)
	{
		var filePath = '.' + request.url;
		var fileExt = path.extname(filePath);
		if (fileExt) fileExt = fileExt.substring(1);
		let contentType = this.contentTypeByExt[fileExt] || 'text/html';
		fs.readFile(filePath, (error, content) => {
			if (error) return this.errorOut(response, { code: error.code == 'ENOENT' ? 404 : 500, message: error.code });
			response.writeHead(200, { 'Content-Type': contentType });
			response.end(content, 'utf-8');
		});
	}

	static errorOut(response, {code = 400, message = ''})
	{
		response.writeHead(code);
		response.end(message);
	}

	static $readFile(response, { module })
	{
		let data = {};
		try {
			let pathToData = path.join(this.pathToDataDir, (module || 'state') + '.json');
			if (fs.existsSync(pathToData)) {
				data = JSON.parse(fs.readFileSync(pathToData, 'utf8'));
			} else {
				fs.writeFileSync(pathToData, JSON.stringify(data));
			}
		} catch(error) {
			return this.errorOut(response, { code: 500, message: error.message });
		}
		response.writeHead(200, {"Content-Type": "application/json"});
		response.write(JSON.stringify(data));
		response.end();
	}

	static $writeFile(response, { module, data })
	{
		let pathToData = path.join(this.pathToDataDir, (module || 'state') + '.json');
		let dataJSON = JSON.stringify(data);
		try {
			fs.writeFileSync(pathToData, dataJSON);
		} catch (error) {
			if (module) return this.errorOut(response, { code: 500, message: error.message });
			else console.error(error.message);
		}
		response.writeHead(200);
		response.end();
	}

	static $connect(response, { odbcString, testOnly = false })
	{
		if (!testOnly && odbcString == this.currentODBCString) {
			response.writeHead(200);
			response.end();
			return;
		}
		if (!testOnly && this.currentDB) {
			this.currentDB.closeSync();
			this.currentDB = null;
		}
		odbc.open(odbcString, (error, db) => {
			if (error) {
				db.closeSync();
				return this.errorOut(response, { message: error.message });
			}
			if (testOnly) db.closeSync();
			else {
				this.currentDB = db;
				this.currentODBCString = odbcString;
				try {
					db.querySync("ALTER SESSION SET nls_date_format='yyyy-mm-dd hh24:mi:ss'");
				} catch (error) {}
			}
			response.writeHead(200);
			response.end();
		});
	}

	static $disconnect(response)
	{
		if (!this.currentDB) return this.errorOut(response, { message: 'Not currently connected' });
		this.currentDB.closeSync();
		this.currentDB = null;
		this.currentODBCString = null;
		response.writeHead(200);
		response.end();
	}

	static $structure(response)
	{
		if (!this.currentDB) return this.errorOut(response, { message: 'Not currently connected' });
		let schemaName = this.currentDB.conn.getInfoSync(odbc.SQL_USER_NAME);
		let structure = {};
		this.currentDB.tables(null, null, null, 'TABLE', (error, tableInfoEntries) => {
			if (error) return this.errorOut(response, { message: error });
			if (tableInfoEntries.length < 1) return this.errorOut(response, { message: 'No table entries retrieved' });
			for (let entry of tableInfoEntries) {
				if (entry.TABLE_SCHEM == schemaName || entry.TABLE_SCHEM == schemaName.toUpperCase()) {
					schemaName = entry.TABLE_SCHEM;
					break;
				}
			}
			this.currentDB.columns(null, schemaName, null, null, (error, columnInfoEntries) => {
				if (error) return this.errorOut(response, { message: error.message });
				for (let entry of columnInfoEntries) {
					if (!(entry.TABLE_NAME in structure)) structure[entry.TABLE_NAME] = {};
					structure[entry.TABLE_NAME][entry.COLUMN_NAME] = {
						type: entry.TYPE_NAME,
						columnSize: entry.COLUMN_SIZE,
						bufferLength: entry.BUFFER_LENGTH,
						decimalDigits: entry.DECIMAL_DIGITS,
						nullable: entry.NULLABLE == 1
					};
				}
				response.writeHead(200, {"Content-Type": "application/json"});
				response.write(JSON.stringify(structure));
				response.end();
			});
		});
	}

	static $query(response, { query, recordLimit = null })
	{
		if (!this.currentDB) return this.errorOut(response, { message: 'Not connected to a database' });

		// Run query
		let startTime = Date.now();
		let result;
		try {
			result = this.currentDB.queryResultSync(query);
		} catch (error) {
			return this.errorOut(response, { message: error.message });
		}
		let endTime = Date.now();
		
		// Fetch records
		let maxRecordCountReached = false;
		let records = [];
		for (let r = 0; (!recordLimit || r <= recordLimit); r++) {
			let row;
			try {
				row = result.fetchSync();
			} catch (error) {
				return this.errorOut(response, { message: error.message });
			}
			if (!recordLimit || r < recordLimit) {
				if (!row) break;
				let processedRecord = {};
				for (let key in row) {
					let value = row[key];
					if (value instanceof Date) {
						value = value.toLocaleString("sv-SE");
					}
					processedRecord[key != key.toUpperCase() ? key : key.toLowerCase()] = value;
				}
				records.push(processedRecord);
			} else {
				maxRecordCountReached = true;
			}
		}
		
		// Generate output
		var output = {
			records: records,
			info: {
				affectedRecordCount: result.getRowCountSync(),
				fieldNames: result.getColumnNamesSync(),
				timeToRunQuery: endTime - startTime,
				recordsLimitedAtCount: maxRecordCountReached ? recordLimit : null
			}
		};
		result.closeSync();
		
		response.writeHead(200, {"Content-Type": "application/json"});
		response.write(JSON.stringify(output));
		response.end();
	}
	
	static $encrypt(response, {salt, text, texts = []})
	{
		if (!salt) return this.errorOut(response, { message: 'No salt provided'});
		if (!text && !texts) return this.errorOut(response, { message: 'No text to encrypt'});

		if (texts.length == 0) texts.push(text);
		let cipherTexts = [];
		for (let text of texts) {
			if (text.length == 0) {
				cipherTexts.push('');
				continue;
			}

			let pepper = '&#$!';
			var footer = Buffer.allocUnsafe(Uint16Array.BYTES_PER_ELEMENT);
			var hashData = Buffer.allocUnsafe(salt.length + pepper.length + footer.length);

			// Generate a random footer value (presumably a pseudo-iv)
			footer.writeUInt16LE(Math.floor(Math.random() * 65535)); // MAX_UINT16

			footer.copy(hashData);
			hashData.write(salt + pepper, footer.length);

			var key = this.cryptDeriveKeyFromData(hashData, 'sha1', 256);
			var cipher = crypto.createCipheriv('aes-256-cbc', key, Buffer.alloc(16, 0));

			// Encode input text to a padded utf16 string
			var encodedText = Buffer.alloc(16 * (Math.ceil(text.length * 2 / 16)));
			encodedText.write(text, 'utf16le');

			var cipheredData = Buffer.concat([
				Buffer.from('LWV3', 'ascii'),
				cipher.update(encodedText), cipher.final(), 
				Buffer.from('=' + footer.toString('base64'), 'ascii')
			]);

			cipherTexts.push(cipheredData.toString('hex').toUpperCase());
		}
		
		response.writeHead(200, {"Content-Type": "application/json"});
		response.write(JSON.stringify(cipherTexts));
		response.end();
	}
	
	static $decrypt(response, {salt, cipherText, cipherTexts = []})
	{
		if (!salt) return this.errorOut(response, { message: 'No salt provided'});
		if (!cipherText && !cipherTexts) return this.errorOut(response, { message: 'No ciphertext to decrypt'});
		
		if (cipherTexts.length == 0) cipherTexts.push(cipherText);
		let texts = [];
		for (let cipherText of cipherTexts) {
			if (cipherText.length == 0) {
				texts.push('');
				continue;
			}
			let header = cipherText.substring(0, 8);
			if (header == '4C575633') { // LWV3
				let pepper = '&#$!';
				let footer = Buffer.from(Buffer.from(cipherText.substr(-8, 6), 'hex').toString('ascii'), 'base64');
				let hashData = Buffer.allocUnsafe(salt.length + pepper.length + footer.length);
				let cipherData = Buffer.from(Buffer.from(cipherText.slice(8, -10), 'hex'));

				footer.copy(hashData);
				hashData.write(salt + pepper, footer.length);

				let key = this.cryptDeriveKeyFromData(hashData, 'sha1', 256);

				let decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.alloc(16, 0));
				let decipheredData = decipher.update(cipherData);
				decipher.setAutoPadding(false);
				try {
					decipher.final();
				} catch (error) {
					texts.push({error: 'ERROR: ' + error.reason});
					continue;
				}

				texts.push(decipheredData.toString('utf16le').replace(/\0/g, ''));
			} else {
				texts.push({error: 'ERROR: unrecognized ciphertext format'});
			}
		}
		
		response.writeHead(200, {"Content-Type": "application/json"});
		response.write(JSON.stringify(texts));
		response.end();
	}
	
	// Reimplementation of Microsoft's CryptHashData + CryptDeriveKey
	static cryptDeriveKeyFromData(data, algorithm, bits) {
		// RSAENH HMAC specification inner and outer key padding values
		var innerKeyData = Buffer.alloc(64, 0x36);
		var outerKeyData = Buffer.alloc(64, 0x5c);

		var dataHash = crypto.createHash(algorithm).update(data).digest();

		// Perform XOR operation using hashed data on inner and outer key data
		for (const [index, value] of dataHash.entries()) {
			innerKeyData[index] ^= value;
			outerKeyData[index] ^= value;
		}

		// Re-hash inner and outer key data and build key, trimmed to bit size
		return Buffer.concat([
			crypto.createHash(algorithm).update(innerKeyData).digest(),
			crypto.createHash(algorithm).update(outerKeyData).digest()], bits / 8);
	}
}

DMS.start();