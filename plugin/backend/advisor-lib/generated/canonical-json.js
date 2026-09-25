"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_JSON_DEPTH = void 0;
exports.rememberParsedNumbers = rememberParsedNumbers;
exports.assertJsonText = assertJsonText;
exports.canonicalJson = canonicalJson;
exports.canonicalBytes = canonicalBytes;
exports.MAX_JSON_DEPTH = 16;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const NUMBER_TOKENS = new WeakMap();
function rememberParsedNumbers(value, tokens) {
    if (value !== null && typeof value === 'object' && tokens.size)
        NUMBER_TOKENS.set(value, tokens);
}
function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
function assertJsonText(value) {
    if (CONTROL.test(value))
        throw new TypeError('JSON string contains a control character');
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        const next = value.charCodeAt(index + 1);
        const previous = value.charCodeAt(index - 1);
        if (code >= 0xd800 && code <= 0xdbff && !(next >= 0xdc00 && next <= 0xdfff))
            throw new TypeError('JSON string contains an unpaired surrogate');
        if (code >= 0xdc00 && code <= 0xdfff && !(previous >= 0xd800 && previous <= 0xdbff))
            throw new TypeError('JSON string contains an unpaired surrogate');
    }
}
function compareCodePoints(left, right) {
    const a = Array.from(left, (char) => char.codePointAt(0));
    const b = Array.from(right, (char) => char.codePointAt(0));
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
        if (a[index] !== b[index])
            return a[index] - b[index];
    }
    return a.length - b.length;
}
function expandExponent(raw) {
    const sign = raw.startsWith('-') ? '-' : '';
    const unsigned = sign ? raw.slice(1) : raw;
    const [coefficient, exponentText] = unsigned.split('e');
    const [whole, fraction = ''] = coefficient.split('.');
    const digits = whole + fraction;
    const point = whole.length + Number(exponentText);
    if (point <= 0)
        return `${sign}0.${'0'.repeat(-point)}${digits}`;
    if (point >= digits.length)
        return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
    return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
function toExponent(raw) {
    const sign = raw.startsWith('-') ? '-' : '';
    const unsigned = sign ? raw.slice(1) : raw;
    const point = unsigned.includes('.') ? unsigned.indexOf('.') : unsigned.length;
    const digits = unsigned.replace('.', '');
    const first = digits.search(/[1-9]/u);
    if (first < 0)
        return '0';
    const significant = digits.slice(first).replace(/0+$/u, '');
    const exponent = point - first - 1;
    return `${sign}${significant[0]}${significant.length > 1 ? `.${significant.slice(1)}` : ''}e${exponent >= 0 ? '+' : '-'}${Math.abs(exponent).toString().padStart(2, '0')}`;
}
function normalizeExponent(raw) {
    const [coefficient, power] = raw.split('e');
    const exponent = Number(power);
    return `${coefficient}e${exponent >= 0 ? '+' : '-'}${Math.abs(exponent).toString().padStart(2, '0')}`;
}
function pythonFloat(value) {
    if (Object.is(value, -0))
        return '-0.0';
    const raw = value.toString();
    const absolute = Math.abs(value);
    if (Number.isInteger(value) && absolute < 1e16 && !raw.includes('e'))
        return `${raw}.0`;
    if (absolute >= 1e-4 && absolute < 1e16) {
        return raw.includes('e') ? expandExponent(raw) : raw;
    }
    return raw.includes('e') ? normalizeExponent(raw) : toExponent(raw);
}
function canonicalNumber(value, token) {
    if (token)
        return token.floating ? pythonFloat(value) : token.raw === '-0' ? '0' : token.raw;
    if (Number.isSafeInteger(value) && Math.abs(value) < 1e21)
        return value.toString();
    return pythonFloat(value);
}
function tokenKey(path) { return JSON.stringify(path); }
function canonical(value, depth, root, path) {
    if (value === undefined)
        return '';
    if (depth > exports.MAX_JSON_DEPTH)
        throw new RangeError('JSON nesting is too deep');
    if (value === null || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'string') {
        assertJsonText(value);
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new TypeError('JSON number is not finite');
        return canonicalNumber(value, root ? NUMBER_TOKENS.get(root)?.get(tokenKey(path)) : undefined);
    }
    if (Array.isArray(value))
        return `[${value.map((child, index) => canonical(child, depth + 1, root, [...path, index]) || 'null').join(',')}]`;
    if (!plain(value))
        throw new TypeError('JSON value must be plain');
    return `{${Object.keys(value).sort(compareCodePoints).flatMap((key) => {
        assertJsonText(key);
        const encoded = canonical(value[key], depth + 1, root, [...path, key]);
        return encoded ? [`${JSON.stringify(key)}:${encoded}`] : [];
    }).join(',')}}`;
}
function canonicalJson(value) {
    const root = value !== null && typeof value === 'object' ? value : null;
    return canonical(value, 0, root, []);
}
function canonicalBytes(value) { return new TextEncoder().encode(canonicalJson(value)); }
