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

  const api = { parseCount, peers, pathTo, readPath, candidates };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.PickFilterCore = api;
})();
