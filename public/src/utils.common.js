'use strict';

// Add default escape function for escaping HTML entities
const escapeCharMap = Object.freeze({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	'\'': '&#x27;',
	'`': '&#x60;',
	'=': '&#x3D;',
});
function replaceChar(c) {
	return escapeCharMap[c];
}

const escapeChars = /[&<>"'`=]/g;

const HTMLEntities = Object.freeze({
	amp: '&',
	gt: '>',
	lt: '<',
	quot: '"',
	apos: '\'',
	AElig: 198,
	Aacute: 193,
	Acirc: 194,
	Agrave: 192,
	Aring: 197,
	Atilde: 195,
	Auml: 196,
	Ccedil: 199,
	ETH: 208,
	Eacute: 201,
	Ecirc: 202,
	Egrave: 200,
	Euml: 203,
	Iacute: 205,
	Icirc: 206,
	Igrave: 204,
	Iuml: 207,
	Ntilde: 209,
	Oacute: 211,
	Ocirc: 212,
	Ograve: 210,
	Oslash: 216,
	Otilde: 213,
	Ouml: 214,
	THORN: 222,
	Uacute: 218,
	Ucirc: 219,
	Ugrave: 217,
	Uuml: 220,
	Yacute: 221,
	aacute: 225,
	acirc: 226,
	aelig: 230,
	agrave: 224,
	aring: 229,
	atilde: 227,
	auml: 228,
	ccedil: 231,
	eacute: 233,
	ecirc: 234,
	egrave: 232,
	eth: 240,
	euml: 235,
	iacute: 237,
	icirc: 238,
	igrave: 236,
	iuml: 239,
	ntilde: 241,
	oacute: 243,
	ocirc: 244,
	ograve: 242,
	oslash: 248,
	otilde: 245,
	ouml: 246,
	szlig: 223,
	thorn: 254,
	uacute: 250,
	ucirc: 251,
	ugrave: 249,
	uuml: 252,
	yacute: 253,
	yuml: 255,
	copy: 169,
	reg: 174,
	nbsp: 160,
	iexcl: 161,
	cent: 162,
	pound: 163,
	curren: 164,
	yen: 165,
	brvbar: 166,
	sect: 167,
	uml: 168,
	ordf: 170,
	laquo: 171,
	not: 172,
	shy: 173,
	macr: 175,
	deg: 176,
	plusmn: 177,
	sup1: 185,
	sup2: 178,
	sup3: 179,
	acute: 180,
	micro: 181,
	para: 182,
	middot: 183,
	cedil: 184,
	ordm: 186,
	raquo: 187,
	frac14: 188,
	frac12: 189,
	frac34: 190,
	iquest: 191,
	times: 215,
	divide: 247,
	'OElig;': 338,
	'oelig;': 339,
	'Scaron;': 352,
	'scaron;': 353,
	'Yuml;': 376,
	'fnof;': 402,
	'circ;': 710,
	'tilde;': 732,
	'Alpha;': 913,
	'Beta;': 914,
	'Gamma;': 915,
	'Delta;': 916,
	'Epsilon;': 917,
	'Zeta;': 918,
	'Eta;': 919,
	'Theta;': 920,
	'Iota;': 921,
	'Kappa;': 922,
	'Lambda;': 923,
	'Mu;': 924,
	'Nu;': 925,
	'Xi;': 926,
	'Omicron;': 927,
	'Pi;': 928,
	'Rho;': 929,
	'Sigma;': 931,
	'Tau;': 932,
	'Upsilon;': 933,
	'Phi;': 934,
	'Chi;': 935,
	'Psi;': 936,
	'Omega;': 937,
	'alpha;': 945,
	'beta;': 946,
	'gamma;': 947,
	'delta;': 948,
	'epsilon;': 949,
	'zeta;': 950,
	'eta;': 951,
	'theta;': 952,
	'iota;': 953,
	'kappa;': 954,
	'lambda;': 955,
	'mu;': 956,
	'nu;': 957,
	'xi;': 958,
	'omicron;': 959,
	'pi;': 960,
	'rho;': 961,
	'sigmaf;': 962,
	'sigma;': 963,
	'tau;': 964,
	'upsilon;': 965,
	'phi;': 966,
	'chi;': 967,
	'psi;': 968,
	'omega;': 969,
	'thetasym;': 977,
	'upsih;': 978,
	'piv;': 982,
	'ensp;': 8194,
	'emsp;': 8195,
	'thinsp;': 8201,
	'zwnj;': 8204,
	'zwj;': 8205,
	'lrm;': 8206,
	'rlm;': 8207,
	'ndash;': 8211,
	'mdash;': 8212,
	'lsquo;': 8216,
	'rsquo;': 8217,
	'sbquo;': 8218,
	'ldquo;': 8220,
	'rdquo;': 8221,
	'bdquo;': 8222,
	'dagger;': 8224,
	'Dagger;': 8225,
	'bull;': 8226,
	'hellip;': 8230,
	'permil;': 8240,
	'prime;': 8242,
	'Prime;': 8243,
	'lsaquo;': 8249,
	'rsaquo;': 8250,
	'oline;': 8254,
	'frasl;': 8260,
	'euro;': 8364,
	'image;': 8465,
	'weierp;': 8472,
	'real;': 8476,
	'trade;': 8482,
	'alefsym;': 8501,
	'larr;': 8592,
	'uarr;': 8593,
	'rarr;': 8594,
	'darr;': 8595,
	'harr;': 8596,
	'crarr;': 8629,
	'lArr;': 8656,
	'uArr;': 8657,
	'rArr;': 8658,
	'dArr;': 8659,
	'hArr;': 8660,
	'forall;': 8704,
	'part;': 8706,
	'exist;': 8707,
	'empty;': 8709,
	'nabla;': 8711,
	'isin;': 8712,
	'notin;': 8713,
	'ni;': 8715,
	'prod;': 8719,
	'sum;': 8721,
	'minus;': 8722,
	'lowast;': 8727,
	'radic;': 8730,
	'prop;': 8733,
	'infin;': 8734,
	'ang;': 8736,
	'and;': 8743,
	'or;': 8744,
	'cap;': 8745,
	'cup;': 8746,
	'int;': 8747,
	'there4;': 8756,
	'sim;': 8764,
	'cong;': 8773,
	'asymp;': 8776,
	'ne;': 8800,
	'equiv;': 8801,
	'le;': 8804,
	'ge;': 8805,
	'sub;': 8834,
	'sup;': 8835,
	'nsub;': 8836,
	'sube;': 8838,
	'supe;': 8839,
	'oplus;': 8853,
	'otimes;': 8855,
	'perp;': 8869,
	'sdot;': 8901,
	'lceil;': 8968,
	'rceil;': 8969,
	'lfloor;': 8970,
	'rfloor;': 8971,
	'lang;': 9001,
	'rang;': 9002,
	'loz;': 9674,
	'spades;': 9824,
	'clubs;': 9827,
	'hearts;': 9829,
	'diams;': 9830,
});

const utils = {
	// https://github.com/substack/node-ent/blob/master/index.js
	decodeHTMLEntities(html) {
		return String(html)
			.replaceAll(/&#(\d+);?/g, (_, code) => String.fromCharCode(code))
			.replaceAll(/&#[xX]([A-Fa-f\d]+);?/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
			.replaceAll(/&([^;\W]+;?)/g, (m, e) => {
				const ee = e.replace(/;$/, '');
				const target = HTMLEntities[e] || (e.match(/;$/) && HTMLEntities[ee]);

				if (typeof target === 'number') {
					return String.fromCharCode(target);
				}

				if (typeof target === 'string') {
					return target;
				}

				return m;
			});
	},
	// https://github.com/jprichardson/string.js/blob/master/lib/string.js
	stripHTMLTags(string_, tags) {
		const pattern = (tags || ['']).join('|');
		return String(string_).replaceAll(new RegExp('<(\\/)?(' + (pattern || '[^\\s>]+') + ')(\\s+[^<>]*?)?\\s*(\\/)?>', 'gi'), '');
	},

	cleanUpTag(tag, maxLength) {
		if (typeof tag !== 'string' || tag.length === 0) {
			return '';
		}

		tag = tag.trim().toLowerCase();
		// See https://github.com/NodeBB/NodeBB/issues/4378
		tag = tag.replaceAll(/\u202E/gi, '');
		tag = tag.replaceAll(/[,/#!$^*;:{}=_`<>'"~()?|]/g, '');
		tag = tag.slice(0, maxLength || 15).trim();
		const matches = tag.match(/^[.-]*(.+?)[.-]*$/);
		if (matches && matches.length > 1) {
			tag = matches[1];
		}

		return tag;
	},

	removePunctuation(string_) {
		return string_.replaceAll(/[.,-/#!$%^&*;:{}=\-_`<>'"~()?]/g, '');
	},

	isEmailValid(email) {
		return typeof email === 'string' && email.length && email.includes('@') && !email.includes(',') && !email.includes(';');
	},

	isUserNameValid(name) {
		return (name && name !== '' && (/^['" \-+.*[\]\d\u00BF-\u1FFF\u2C00-\uD7FF\w]+$/.test(name)));
	},

	isPasswordValid(password) {
		return typeof password === 'string' && password.length;
	},

	isNumber(n) {
		// `isFinite('') === true` so isNan parseFloat check is necessary
		return !isNaN(Number.parseFloat(n)) && isFinite(n);
	},

	languageKeyRegex: /\[\[\w+:.+]]/,
	hasLanguageKey(input) {
		return utils.languageKeyRegex.test(input);
	},
	userLangToTimeagoCode(userLang) {
		const mapping = {
			'en-GB': 'en',
			'en-US': 'en',
			'fa-IR': 'fa',
			'pt-BR': 'pt-br',
			nb: 'no',
		};
		return mapping.hasOwnProperty(userLang) ? mapping[userLang] : userLang;
	},
	// Shallow objects merge
	merge() {
		const result = {};
		let object;
		let keys;
		for (const argument of arguments) {
			object = argument || {};
			keys = Object.keys(object);
			for (const key of keys) {
				result[key] = object[key];
			}
		}

		return result;
	},

	fileExtension(path) {
		return (String(path)).split('.').pop();
	},

	extensionMimeTypeMap: {
		bmp: 'image/bmp',
		cmx: 'image/x-cmx',
		cod: 'image/cis-cod',
		gif: 'image/gif',
		ico: 'image/x-icon',
		ief: 'image/ief',
		jfif: 'image/pipeg',
		jpe: 'image/jpeg',
		jpeg: 'image/jpeg',
		jpg: 'image/jpeg',
		png: 'image/png',
		pbm: 'image/x-portable-bitmap',
		pgm: 'image/x-portable-graymap',
		pnm: 'image/x-portable-anymap',
		ppm: 'image/x-portable-pixmap',
		ras: 'image/x-cmu-raster',
		rgb: 'image/x-rgb',
		svg: 'image/svg+xml',
		tif: 'image/tiff',
		tiff: 'image/tiff',
		xbm: 'image/x-xbitmap',
		xpm: 'image/x-xpixmap',
		xwd: 'image/x-xwindowdump',
	},

	fileMimeType(path) {
		return utils.extensionToMimeType(utils.fileExtension(path));
	},

	extensionToMimeType(extension) {
		return utils.extensionMimeTypeMap.hasOwnProperty(extension) ? utils.extensionMimeTypeMap[extension] : '*';
	},

	isPromise(object) {
		// https://stackoverflow.com/questions/27746304/how-do-i-tell-if-an-object-is-a-promise#comment97339131_27746324
		return object && typeof object.then === 'function';
	},

	promiseParallel(object) {
		const keys = Object.keys(object);
		return Promise.all(
			keys.map(k => object[k]),
		).then(results => {
			const data = {};
			for (const [i, k] of keys.entries()) {
				data[k] = results[i];
			}

			return data;
		});
	},

	// https://github.com/sindresorhus/is-absolute-url
	isAbsoluteUrlRE: /^[a-zA-Z][a-zA-Z\d+\-.]*:/,
	isWinPathRE: /^[a-zA-Z]:\\/,
	isAbsoluteUrl(url) {
		if (utils.isWinPathRE.test(url)) {
			return false;
		}

		return utils.isAbsoluteUrlRE.test(url);
	},

	isRelativeUrl(url) {
		return !utils.isAbsoluteUrl(url);
	},

	makeNumberHumanReadable(number_) {
		const n = Number.parseInt(number_, 10);
		if (!n) {
			return number_;
		}

		if (n > 999_999) {
			return (n / 1_000_000).toFixed(1) + 'm';
		}

		if (n > 999) {
			return (n / 1000).toFixed(1) + 'k';
		}

		return n;
	},

	// Takes a string like 1000 and returns 1,000
	addCommas(text) {
		return String(text).replaceAll(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
	},

	toISOString(timestamp) {
		if (!timestamp || !Date.prototype.toISOString) {
			return '';
		}

		// Prevent too-high values to be passed to Date object
		timestamp = Math.min(timestamp, 8_640_000_000_000_000);

		try {
			return new Date(Number.parseInt(timestamp, 10)).toISOString();
		} catch {
			return timestamp;
		}
	},

	tags: ['a',
		'abbr',
		'acronym',
		'address',
		'applet',
		'area',
		'article',
		'aside',
		'audio',
		'b',
		'base',
		'basefont',
		'bdi',
		'bdo',
		'big',
		'blockquote',
		'body',
		'br',
		'button',
		'canvas',
		'caption',
		'center',
		'cite',
		'code',
		'col',
		'colgroup',
		'command',
		'datalist',
		'dd',
		'del',
		'details',
		'dfn',
		'dialog',
		'dir',
		'div',
		'dl',
		'dt',
		'em',
		'embed',
		'fieldset',
		'figcaption',
		'figure',
		'font',
		'footer',
		'form',
		'frame',
		'frameset',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'head',
		'header',
		'hr',
		'html',
		'i',
		'iframe',
		'img',
		'input',
		'ins',
		'kbd',
		'keygen',
		'label',
		'legend',
		'li',
		'link',
		'map',
		'mark',
		'menu',
		'meta',
		'meter',
		'nav',
		'noframes',
		'noscript',
		'object',
		'ol',
		'optgroup',
		'option',
		'output',
		'p',
		'param',
		'pre',
		'progress',
		'q',
		'rp',
		'rt',
		'ruby',
		's',
		'samp',
		'script',
		'section',
		'select',
		'small',
		'source',
		'span',
		'strike',
		'strong',
		'style',
		'sub',
		'summary',
		'sup',
		'table',
		'tbody',
		'td',
		'textarea',
		'tfoot',
		'th',
		'thead',
		'time',
		'title',
		'tr',
		'track',
		'tt',
		'u',
		'ul',
		'const',
		'video',
		'wbr'],

	stripTags: ['abbr',
		'acronym',
		'address',
		'applet',
		'area',
		'article',
		'aside',
		'audio',
		'base',
		'basefont',
		'bdi',
		'bdo',
		'big',
		'blink',
		'body',
		'button',
		'canvas',
		'caption',
		'center',
		'cite',
		'code',
		'col',
		'colgroup',
		'command',
		'datalist',
		'dd',
		'del',
		'details',
		'dfn',
		'dialog',
		'dir',
		'div',
		'dl',
		'dt',
		'em',
		'embed',
		'fieldset',
		'figcaption',
		'figure',
		'font',
		'footer',
		'form',
		'frame',
		'frameset',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'head',
		'header',
		'hr',
		'html',
		'iframe',
		'input',
		'ins',
		'kbd',
		'keygen',
		'label',
		'legend',
		'li',
		'link',
		'map',
		'mark',
		'marquee',
		'menu',
		'meta',
		'meter',
		'nav',
		'noframes',
		'noscript',
		'object',
		'ol',
		'optgroup',
		'option',
		'output',
		'param',
		'pre',
		'progress',
		'q',
		'rp',
		'rt',
		'ruby',
		's',
		'samp',
		'script',
		'section',
		'select',
		'source',
		'span',
		'strike',
		'style',
		'sub',
		'summary',
		'sup',
		'table',
		'tbody',
		'td',
		'textarea',
		'tfoot',
		'th',
		'thead',
		'time',
		'title',
		'tr',
		'track',
		'tt',
		'u',
		'ul',
		'const',
		'video',
		'wbr'],

	escapeRegexChars(text) {
		return text.replaceAll(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
	},

	escapeHTML(string_) {
		if (string_ == null) {
			return '';
		}

		if (!string_) {
			return String(string_);
		}

		return string_.toString().replaceAll(escapeChars, replaceChar);
	},

	isAndroidBrowser() {
		// http://stackoverflow.com/questions/9286355/how-to-detect-only-the-native-android-browser
		const nua = navigator.userAgent;
		return ((nua.includes('Mozilla/5.0') && nua.includes('Android ') && nua.includes('AppleWebKit')) && !(nua.includes('Chrome')));
	},

	isTouchDevice() {
		return 'ontouchstart' in document.documentElement;
	},

	findBootstrapEnvironment() {
		// http://stackoverflow.com/questions/14441456/how-to-detect-which-device-view-youre-on-using-twitter-bootstrap-api
		const environments = ['xs', 'sm', 'md', 'lg'];
		const $element = $('<div>');

		$element.appendTo($('body'));

		for (let i = environments.length - 1; i >= 0; i -= 1) {
			const env = environments[i];

			$element.addClass('hidden-' + env);
			if ($element.is(':hidden')) {
				$element.remove();
				return env;
			}
		}
	},

	isMobile() {
		const env = utils.findBootstrapEnvironment();
		return ['xs', 'sm'].includes(env);
	},

	getHoursArray() {
		const currentHour = new Date().getHours();
		const labels = [];

		for (let i = currentHour, ii = currentHour - 24; i > ii; i -= 1) {
			const hour = i < 0 ? 24 + i : i;
			labels.push(hour + ':00');
		}

		return labels.reverse();
	},

	getDaysArray(from, amount) {
		const currentDay = new Date(Number.parseInt(from, 10) || Date.now()).getTime();
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const labels = [];
		let temporaryDate;

		for (let x = (amount || 30) - 1; x >= 0; x -= 1) {
			temporaryDate = new Date(currentDay - (1000 * 60 * 60 * 24 * x));
			labels.push(months[temporaryDate.getMonth()] + ' ' + temporaryDate.getDate());
		}

		return labels;
	},

	/* Retrieved from http://stackoverflow.com/a/7557433 @ 27 Mar 2016 */
	isElementInViewport(element) {
		// Special bonus for those using jQuery
		if (typeof jQuery === 'function' && element instanceof jQuery) {
			element = element[0];
		}

		const rect = element.getBoundingClientRect();

		return (
			rect.top >= 0
            && rect.left >= 0
            && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) /* Or $(window).height() */
            && rect.right <= (window.innerWidth || document.documentElement.clientWidth) /* Or $(window).width() */
		);
	},

	// Get all the url params in a single key/value hash
	params(options = {}) {
		let url;
		if (options.url && !options.url.startsWith('http')) {
			// Relative path passed in
			options.url = options.url.replaceAll(new RegExp(`/?${config.relative_path.slice(1)}/`, 'g'), '');
			url = new URL(document.location);
			url.pathname = options.url;
		} else {
			url = new URL(options.url || document.location);
		}

		let parameters = url.searchParams;

		if (options.full) { // Return URLSearchParams object
			return parameters;
		}

		// Handle arrays passed in query string (Object.fromEntries does not)
		const arrays = {};
		for (let [key, value] of parameters.entries()) {
			if (!key.endsWith('[]')) {
				continue;
			}

			key = key.slice(0, -2);
			arrays[key] = arrays[key] || [];
			arrays[key].push(utils.toType(value));
		}

		for (const key of Object.keys(arrays)) {
			parameters.delete(`${key}[]`);
		}

		// Backwards compatibility with v1.x -- all values passed through utils.toType()
		parameters = Object.fromEntries(parameters);
		for (const key of Object.keys(parameters)) {
			parameters[key] = utils.toType(parameters[key]);
		}

		return {...parameters, ...arrays};
	},

	param(key) {
		return this.params()[key];
	},

	urlToLocation(url) {
		const a = document.createElement('a');
		a.href = url;
		return a;
	},

	// Return boolean if string 'true' or string 'false', or if a parsable string which is a number
	// also supports JSON object and/or arrays parsing
	toType(string_) {
		const type = typeof string_;
		if (type !== 'string') {
			return string_;
		}

		const nb = Number.parseFloat(string_);
		if (!isNaN(nb) && isFinite(string_)) {
			return nb;
		}

		if (string_ === 'false') {
			return false;
		}

		if (string_ === 'true') {
			return true;
		}

		try {
			string_ = JSON.parse(string_);
		} catch {}

		return string_;
	},

	// Safely get/set chained properties on an object
	// set example: utils.props(A, 'a.b.c.d', 10) // sets A to {a: {b: {c: {d: 10}}}}, and returns 10
	// get example: utils.props(A, 'a.b.c') // returns {d: 10}
	// get example: utils.props(A, 'a.b.c.foo.bar') // returns undefined without throwing a TypeError
	// credits to github.com/gkindel
	props(object, properties, value) {
		if (object === undefined) {
			object = window;
		}

		if (properties == null) {
			return undefined;
		}

		const i = properties.indexOf('.');
		if (i === -1) {
			if (value !== undefined) {
				object[properties] = value;
			}

			return object[properties];
		}

		const property = properties.slice(0, i);
		const newProperties = properties.slice(i + 1);

		if (properties !== undefined && !(object[property] instanceof Object)) {
			object[property] = {};
		}

		return utils.props(object[property], newProperties, value);
	},

	isInternalURI(targetLocation, referenceLocation, relative_path) {
		return targetLocation.host === '' // Relative paths are always internal links
            || (
            	targetLocation.host === referenceLocation.host
                // Otherwise need to check if protocol and host match
                && targetLocation.protocol === referenceLocation.protocol
                // Subfolder installs need this additional check
                && (relative_path.length > 0 ? targetLocation.pathname.indexOf(relative_path) === 0 : true)
            );
	},

	rtrim(string_) {
		return string_.replaceAll(/\s+$/g, '');
	},

	debounce(function_, wait, immediate) {
		// Modified from https://davidwalsh.name/javascript-debounce-function
		let timeout;
		return function () {
			const context = this;
			const arguments_ = arguments;
			const later = function () {
				timeout = null;
				if (!immediate) {
					function_.apply(context, arguments_);
				}
			};

			const callNow = immediate && !timeout;
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
			if (callNow) {
				function_.apply(context, arguments_);
			}
		};
	},
	throttle(function_, wait, immediate) {
		let timeout;
		return function () {
			const context = this;
			const arguments_ = arguments;
			const later = function () {
				timeout = null;
				if (!immediate) {
					function_.apply(context, arguments_);
				}
			};

			const callNow = immediate && !timeout;
			timeout ||= setTimeout(later, wait);

			if (callNow) {
				function_.apply(context, arguments_);
			}
		};
	},
};

module.exports = utils;
