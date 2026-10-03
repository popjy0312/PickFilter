(() => {
  const parseCount = (value) => {
    const text = String(value).trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
    const count = Number(text.replaceAll(',', ''));
    return Number.isSafeInteger(count) ? count : null;
  };

  // Comment badges commonly wrap a count in brackets: [74]. Keep threshold
  // input strict and never extract a number from a title containing other text.
  function readCount(value) {
    const text = String(value).trim();
    const bracketed = text.match(/^\[\s*(.*?)\s*\]$/);
    return parseCount(bracketed ? bracketed[1] : text);
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
