import type { WatchRule, RuleState } from '../types'

export function buildPickerScript(): string {
  return `
    new Promise(function(resolve) {
      var highlighted = null;
      var styleEl = document.createElement('style');
      styleEl.textContent = '.__watcher-hover { outline: 2px solid #f97316 !important; outline-offset: 1px !important; cursor: crosshair !important; }';
      document.head.appendChild(styleEl);

      function cleanup() {
        document.removeEventListener('mouseover', onHover, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        if (highlighted) highlighted.classList.remove('__watcher-hover');
        if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        delete window.__pickerCancel;
      }

      function getCssPath(el) {
        var parts = [];
        var node = el;
        while (node && node.nodeType === 1 && node !== document.body) {
          var tag = node.tagName.toLowerCase();
          var id = node.id;
          if (id) {
            parts.unshift('#' + id);
            break;
          }
          var cls = Array.from(node.classList).filter(function(c) { return !/^__watcher/.test(c); });
          var selector = tag + (cls.length ? '.' + cls.join('.') : '');
          var siblings = node.parentNode ? Array.from(node.parentNode.children).filter(function(c) { return c.tagName === node.tagName; }) : [];
          if (siblings.length > 1) {
            selector += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
          }
          parts.unshift(selector);
          node = node.parentNode;
        }
        return parts.join(' > ');
      }

      function getXPath(el) {
        var parts = [];
        var node = el;
        while (node && node.nodeType === 1) {
          var tag = node.tagName.toLowerCase();
          var siblings = node.parentNode ? Array.from(node.parentNode.children).filter(function(c) { return c.tagName === node.tagName; }) : [];
          var idx = siblings.length > 1 ? '[' + (siblings.indexOf(node) + 1) + ']' : '';
          parts.unshift(tag + idx);
          node = node.parentNode;
          if (!node || node === document.documentElement) break;
        }
        return '//' + parts.join('/');
      }

      function onHover(e) {
        if (highlighted) highlighted.classList.remove('__watcher-hover');
        highlighted = e.target;
        highlighted.classList.add('__watcher-hover');
      }

      function getSimpleSelector(el) {
        if (el.id) return '#' + el.id;
        var cls = Array.from(el.classList || []).filter(function(c) { return !/^__watcher/.test(c); });
        var tag = el.tagName.toLowerCase();
        if (cls.length) return tag + '.' + cls.slice(0, 3).join('.');
        var siblings = el.parentNode ? Array.from(el.parentNode.children).filter(function(c) { return c.tagName === el.tagName; }) : [];
        if (siblings.length > 1) return tag + ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
        return tag;
      }

      function onClick(e) {
        e.preventDefault();
        e.stopPropagation();
        var el = e.target;
        if (el.classList) el.classList.remove('__watcher-hover');
        cleanup();
        var attrs = {};
        Array.from(el.attributes || []).forEach(function(a) { attrs[a.name] = a.value; });
        resolve({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: Array.from(el.classList || []).filter(function(c) { return !/^__watcher/.test(c); }),
          simpleSelector: getSimpleSelector(el),
          cssPath: getCssPath(el),
          xpath: getXPath(el),
          text: (el.textContent || '').trim().slice(0, 200),
          childCount: el.children ? el.children.length : 0,
          attrs: attrs
        });
      }

      function onKey(e) {
        if (e.key === 'Escape') { cleanup(); resolve(null); }
      }

      window.__pickerCancel = function() { cleanup(); resolve(null); };

      document.addEventListener('mouseover', onHover, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    })
  `
}

export function buildExtractionScript(rules: WatchRule[]): string {
  if (rules.length === 0) return '({})'

  const blocks = rules.map((r) => {
    const id = r.id

    if (r.selector_type === 'page') {
      const patterns = r.detect.filter((d) => d.startsWith('regex_count:')).map((d) => d.slice(12))
      return `
        (function() {
          try {
            var fullText = (document.body || document.documentElement).textContent || '';
            var regexCounts = {};
            var patterns = ${JSON.stringify(patterns)};
            for (var i = 0; i < patterns.length; i++) {
              try { var m = fullText.match(new RegExp(patterns[i], 'g')); regexCounts[patterns[i]] = m ? m.length : 0; }
              catch(e) { regexCounts[patterns[i]] = 0; }
            }
            states[${id}] = { exists: true, text: '', childCount: 0, attrs: {}, regexCounts: regexCounts };
          } catch(e) { states[${id}] = { exists: true, text: '', childCount: 0, attrs: {}, regexCounts: {} }; }
        })()`
    }

    if (r.selector_type === 'xpath') {
      return `
        (function() {
          try {
            var xr = document.evaluate(${JSON.stringify(r.selector)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            var el = xr.singleNodeValue;
            var attrs = {};
            if (el && el.attributes) Array.from(el.attributes).forEach(function(a) { attrs[a.name] = a.value; });
            states[${id}] = { exists: !!el, text: el ? (el.textContent || '').trim().slice(0, 5000) : '', childCount: el ? el.children.length : 0, attrs: attrs, regexCounts: {} };
          } catch(e) { states[${id}] = { exists: false, text: '', childCount: 0, attrs: {}, regexCounts: {} }; }
        })()`
    }

    return `
      (function() {
        try {
          var el = document.querySelector(${JSON.stringify(r.selector)});
          var attrs = {};
          if (el && el.attributes) Array.from(el.attributes).forEach(function(a) { attrs[a.name] = a.value; });
          states[${id}] = { exists: !!el, text: el ? (el.textContent || '').trim().slice(0, 5000) : '', childCount: el ? el.children.length : 0, attrs: attrs, regexCounts: {} };
        } catch(e) { states[${id}] = { exists: false, text: '', childCount: 0, attrs: {}, regexCounts: {} }; }
      })()`
  })

  return `(function() { var states = {}; ${blocks.join(';')}; return states; })()`
}

// Kept here so App.svelte can import the type without importing from types.ts separately
export type { RuleState }
