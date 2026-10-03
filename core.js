(() => {
  const parseCount = (value) => {
    const text = String(value).trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
    const count = Number(text.replaceAll(',', ''));
    return Number.isSafeInteger(count) ? count : null;
  };

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
    // XE also links to the same board through index.php?mid=board&page=N.
    if (/(^|\.)fmkorea\.com$/.test(url.hostname) && ['/', '/index.php'].includes(url.pathname) && url.searchParams.has('mid')) {
      url.pathname = '/' + encodeURIComponent(url.searchParams.get('mid'));
      url.searchParams.delete('mid');
    }
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
      parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')');
    }
    return parts.join(' > ');
  }

  function recipeFor(option) {
    return {
      container: selectorFor(option.row.parentElement),
      tag: option.row.tagName,
      classes: [...option.row.classList],
      path: option.path,
      shape: [...option.row.children].map(el => el.tagName).join(','),
    };
  }

  function restoreRecipe(recipe) {
    const container = document.querySelector(recipe.container);
    if (!container) return null;
    const tags = [...container.children].filter(el => el.tagName === recipe.tag);
    const common = tags.filter(el => recipe.classes.some(name => el.classList.contains(name)));
    const rows = (recipe.classes.length && common.length ? common : tags)
      .filter(el => [...el.children].map(child => child.tagName).join(',') === recipe.shape);
    const readings = rows.map(row => ({ row, element: readPath(row, recipe.path) }));
    if (!readings.some(item => parseCount(item.element?.textContent ?? '') !== null)) return null;
    return { row: rows[0], path: recipe.path, readings };
  }

  const api = { parseCount, peers, pathTo, readPath, candidates, scopeKey, recipeFor, restoreRecipe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.PickFilterCore = api;
})();
