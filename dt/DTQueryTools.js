class DTQueryTools
{
	static FORMAT_TO_BASIC = 1;
	static FORMAT_FROM_BASIC = 2;

	static parseQueries(queriesString, targetPos)
	{
		let chars = Array.from(queriesString);
		let inSingleLineComment = false;
		let inMultiLineComment = false;
		let inString = false;
		let lastStringOpener = null;
		let lastStartPos = 0;
		let charCaptured = false;
		let queries = {};
		let queryIndex = 0;
		
		for (let pos = 0; pos <= chars.length; pos++) {
			if (pos == chars.length) inSingleLineComment = false;
			let chr = pos != chars.length ? chars[pos] : ';';
			
			// Single-line comment
			if (!inSingleLineComment && !inMultiLineComment && !inString && chr == '-') {
				pos++;
				if (pos != chars.length && chars[pos] == '-') {
					inSingleLineComment = true;
					continue;
				} else {
					pos--;
				}
			}
			if (inSingleLineComment && chr == '\n') inSingleLineComment = false;
			
			// Multi-line comment
			if (!inSingleLineComment && !inMultiLineComment && !inString && chr == '/') {
				pos++;
				if (pos != chars.length && chars[pos] == '*') {
					inMultiLineComment = true;
					continue;
				} else {
					pos--;
				}
			}
			if (inMultiLineComment && !inSingleLineComment && !inString && chr == '*') {
				pos++;
				if (pos != chars.length && chars[pos] == '/') {
					inMultiLineComment = false;
					if (!charCaptured) lastStartPos = pos + 1;
					continue;
				} else {
					pos--;
				}
			}
			
			// String
			if (!inSingleLineComment && !inMultiLineComment && (chr == "'" || chr == '"' || chr == '`' || chr == '[' || chr == ']')) {
				if (inString && chr == lastStringOpener && chr != '[') {
					inString = false;
					lastStringOpener = null;
				} else if (!inString && chr != ']') {
					inString = true;
					lastStringOpener = chr != '[' ? chr : ']';
				}
				continue;
			}
			if (inString && chr == '\n') inString = false;
			
			// Whitespace
			if (!inString && !inSingleLineComment && !inMultiLineComment && !charCaptured && (chr == ' ' || chr == '\n' || chr == '\r' || chr == '\t')) {
				lastStartPos++;
				continue;
			} else if (!inMultiLineComment) {
				charCaptured = true;
			}
			
			// Semicolon
			if (!inSingleLineComment && !inMultiLineComment && !inString && chr == ';') {
				queryIndex++;
				let query = queriesString.substring(lastStartPos, pos);
				let match = query.match(/--[ \t]*«(.+)»/);
				let name = match !== null && !(match[1] in queries) ? match[1].trim() : 'Q' + queryIndex.toString();
				queries[name] = query;
				if (targetPos !== null && ((targetPos >= lastStartPos && targetPos <= pos) || targetPos < lastStartPos)) {
					return {
						query: query,
						name: name,
						startPos: lastStartPos,
						endPos: pos
					};
				}
				lastStartPos = pos + 1;
				charCaptured = false;
			}
			
		}
		
		return !targetPos ? queries : null;
	}

	static formatQuery(query, format)
	{
		let formattedQuery = '';

		switch(format) {

			case this.FORMAT_TO_BASIC:
				if (query.includes('"')) {
					throw new Error('Cannot format queries containing a double quote to BASIC.');
				}
				for (let line of query.replace(/\r/g, '').split('\n')) {
					formattedQuery += formattedQuery.length == 0 ? 'qry = "' + line + ' "' : '\r\nqry = qry & "' + line + ' "';
				}
				break;

			case this.FORMAT_FROM_BASIC:
				let matches = query.match(/"(.*?)"/gm);
				if (!matches) throw new Error('Unable to detect double-quoted strings.');
				for (let match of matches) {
					if (formattedQuery.length > 0) formattedQuery += '\r\n';
					formattedQuery += match.replace(/"/g, '').trimEnd();
				}
				break;

			default:
				throw new Error('Unknown format.');
				break;
			
		}

		return formattedQuery;
	}
}