(() => {
  const parseCount = (value) => {
    const text = String(value).trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
    const count = Number(text.replaceAll(',', ''));
    return Number.isSafeInteger(count) ? count : null;
  };

  const unitPowers = { k: 3, m: 6, b: 9, t: 12,
    '십': 1, '백': 2, '천': 3, '만': 4, '백만': 6, '천만': 7,
    '억': 8, '십억': 9, '백억': 10, '천억': 11, '조': 12 };
  const koreanUnits = '천억|백억|십억|천만|백만|십|백|천|만|억|조';
  const unitPattern = new RegExp('^(.*?)[ ]*(' + koreanUnits + '|[kmbt])$', 'i');
  const compoundPattern = new RegExp('^(\\d{1,3}(?:,\\d{3})+|\\d+)[ ]*(' + koreanUnits + ')');
  const label = '(?:조회[ ]*수|댓글[ ]*수|추천[ ]*수|좋아요[ ]*수|조회|댓글|추천|좋아요|하트|답글|열람|views?|comments?|replies|reply|likes?|hearts?|votes?)';
  const prefixLabel = new RegExp('^' + label + '[ \\t\\r\\n]*:?[ \\t\\r\\n]*', 'i');
  const suffixLabel = new RegExp('[ \\t\\r\\n]*' + label + '$', 'i');

  function ungroupInteger(text) {
    if (/^\d+$/.test(text)) return text;
    // Consistent groups only; do not merge adjacent counters or line breaks.
    const grouped = text.match(/^(\d{1,3})([, '])\d{3}(?:\2\d{3})*$/);
    return grouped ? text.replaceAll(grouped[2], '') : null;
  }

  function scaleCount(amount, power) {
    let normalized = amount;
    // Decimal comma is unambiguous with 1–2 fractional digits. Three-digit
    // comma groups retain their existing thousands interpretation.
    if (/^\d+,\d{1,2}$/.test(normalized)) normalized = normalized.replace(',', '.');
    else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(normalized)) {
      normalized = normalized.replaceAll('.', '').replace(',', '.');
    }
    const pieces = normalized.split('.');
    if (pieces.length > 2) return null;
    const whole = ungroupInteger(pieces[0]);
    const fraction = pieces[1] ?? '';
    if (whole === null || (pieces.length === 2 && !/^\d+$/.test(fraction))) return null;
    const numerator = BigInt(whole + fraction) * 10n ** BigInt(power);
    const denominator = 10n ** BigInt(fraction.length);
    if (numerator % denominator !== 0n) return null;
    const result = numerator / denominator;
    return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
  }

  function unwrapCount(text) {
    const pairs = { '[': ']', '(': ')', '【': '】' };
    const close = pairs[text[0]];
    return close && text.endsWith(close) ? text.slice(1, -1).trim() : text;
  }

  function readCount(value) {
    // NFKC covers full-width digits/brackets and common non-breaking spaces.
    let text = String(value).normalize('NFKC').trim();
    if (!text || text.length > 128) return null;
    text = text.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
      .replaceAll('٬', ',').replaceAll('٫', '.').replaceAll('’', "'")
      .replace(/[\u200e\u200f\u2066-\u2069]/g, '')
      .replace(/[十百千万億亿兆]/g, unit => ({ '十': '십', '百': '백', '千': '천',
        '万': '만', '億': '억', '亿': '억', '兆': '조' })[unit]);
    text = unwrapCount(text);
    // Standalone metric icons are decoration, not part of a numeric token.
    text = text.replace(/^(?:👁|♡|♥|❤|💬|👍)\ufe0f?[ ]*/, '');
    const prefixed = prefixLabel.test(text);
    text = prefixed ? text.replace(prefixLabel, '') : text.replace(suffixLabel, '');
    text = unwrapCount(text.trim());
    text = text.replace(/[ ]*(?:회|개|건|명)$/, '').trim();
    text = unwrapCount(text);
    const integer = ungroupInteger(text);
    if (integer !== null) return parseCount(integer);
    // A single dot group is ambiguous with a decimal; multiple groups are not.
    if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(text)) return parseCount(text.replaceAll('.', ''));
    const compact = text.match(unitPattern);
    if (compact) {
      const result = scaleCount(compact[1], unitPowers[compact[2].toLowerCase()]);
      if (result !== null) return result;
    }
    // Korean compounds: 1만 2천, 1억 2,345만 6,789. Units must descend;
    // fractional or overlapping components are deliberately not guessed.
    let rest = text, total = 0n, previous = null, terms = 0;
    while (rest) {
      const part = rest.match(compoundPattern);
      if (!part) break;
      const power = unitPowers[part[2]];
      const component = scaleCount(part[1], power);
      if (component === null || (previous !== null &&
        (power >= previous || BigInt(component) >= 10n ** BigInt(previous)))) return null;
      total += BigInt(component);
      previous = power; terms++;
      rest = rest.slice(part[0].length).trim();
    }
    if (!terms) return null;
    if (rest) {
      const trailing = ungroupInteger(rest);
      const count = trailing === null ? null : parseCount(trailing);
      if (count === null || BigInt(count) >= 10n ** BigInt(previous)) return null;
      total += BigInt(count);
    }
    return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
  }

  // Match repeated siblings by tag and shared classes, never a guessed site selector.
  function peers(row) {
    if (!row.parentElement) return [];
    const tags = [...row.parentElement.children].filter(el => el.tagName === row.tagName);
    const classes = [...row.classList];
    if (!classes.length) return tags;
    const common = tags.filter(el => classes.some(name => el.classList.contains(name)));
    return common.length >= 2 ? common : tags;
  }

  function pathTo(row, selected) {
    const path = [];
    for (let node = selected; node !== row; node = node.parentElement) {
      if (!node.parentElement) return null;
      const siblings = [...node.parentElement.children].filter(el => el.tagName === node.tagName);
      path.unshift({ tag: node.tagName, index: siblings.indexOf(node) });
    }
    return path;
  }

  function readPath(row, path) {
    let node = row;
    for (const step of path) {
      node = [...node.children].filter(el => el.tagName === step.tag)[step.index];
      if (!node) return null;
    }
    return node;
  }

  function candidates(selected) {
    const result = [];
    for (let row = selected.parentElement; row && !['BODY', 'HTML'].includes(row.tagName); row = row.parentElement) {
      const rows = peers(row);
      if (rows.length < 2) continue;
      const path = pathTo(row, selected);
      const readings = rows.map(item => ({ row: item, element: readPath(item, path) }));
      result.push({ row, path, readings });
    }
    return result;
  }

  function scopeKey(input) {
    const url = new URL(input);
    url.hash = '';
    url.searchParams.delete('page');
    url.searchParams.sort();
    return 'pickfilter:v1:' + url.href;
  }

  function selectorFor(element) {
    const parts = [];
    for (let node = element; node; node = node.parentElement) {
      if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        parts.unshift('#' + CSS.escape(node.id)); break;
      }
      const siblings = node.parentElement ? [...node.parentElement.children].filter(el => el.tagName === node.tagName) : [node];
      const tag = node.tagName.toLowerCase();
      const stable = [...node.classList].map(name => tag + '.' + CSS.escape(name))
        .find(selector => siblings.filter(el => el.matches(selector)).length === 1);
      parts.unshift(stable || tag + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')');
    }
    return parts.join(' > ');
  }

  function metricSelectorFor(option) {
    const selected = readPath(option.row, option.path);
    if (!selected) return null;
    // A class-based relative path survives inserted badges, wrappers and cells.
    // Use it only when it resolves the selected metric unambiguously in peers.
    let best = null, bestCount = 1;
    // Include ancestor classes when the numeric span itself has none.
    let node = selected;
    const suffix = [];
    while (node !== option.row) {
      for (const name of node.classList) {
        const selector = node.tagName.toLowerCase() + '.' + CSS.escape(name) + suffix.join('');
        const matches = option.readings.map(item => [...item.row.querySelectorAll(selector)]);
        if (matches.some(items => items.length > 1)) continue;
        const count = matches.filter(items => items.length === 1 && readCount(items[0].textContent) !== null).length;
        if (count > bestCount) { best = selector; bestCount = count; }
      }
      if (best) return best;
      const siblings = [...node.parentElement.children].filter(el => el.tagName === node.tagName);
      suffix.unshift(' > ' + node.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')');
      node = node.parentElement;
    }
    return null;
  }

  function recipeFor(option) {
    return {
      version: 2,
      metricSelector: option.metricSelector || metricSelectorFor(option),
      container: selectorFor(option.row.parentElement),
      tag: option.row.tagName,
      classes: [...option.row.classList],
      path: option.path,
      shape: [...option.row.children].map(el => el.tagName).join(','),
    };
  }

  function restoreRecipe(recipe) {
    const containers = document.querySelectorAll(recipe.container);
    if (containers.length !== 1) return null;
    const container = containers[0];
    const tags = [...container.children].filter(el => el.tagName === recipe.tag);
    const common = tags.filter(el => recipe.classes.some(name => el.classList.contains(name)));
    const rows = (recipe.classes.length && common.length ? common : tags)
      .filter(el => recipe.metricSelector || [...el.children].map(child => child.tagName).join(',') === recipe.shape);
    if (!rows.length) return null;
    const readings = rows.map(row => {
      if (!recipe.metricSelector) return { row, element: readPath(row, recipe.path) };
      const matches = row.querySelectorAll(recipe.metricSelector);
      return { row, element: matches.length === 1 ? matches[0] : null };
    });
    if (!recipe.metricSelector && !readings.some(item => readCount(item.element?.textContent ?? '') !== null)) return null;
    return { row: rows[0], path: recipe.path, metricSelector: recipe.metricSelector, readings };
  }

  const api = { parseCount, readCount, peers, pathTo, readPath, candidates, scopeKey, recipeFor, restoreRecipe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.PickFilterCore = api;
})();
