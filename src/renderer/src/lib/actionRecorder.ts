export function buildRecorderScript(): string {
    return `(function() {
    if (window.__recorderActive) return;
    window.__recorderActive = true;
    window.__recordedActions = [];

    var style = document.createElement('style');
    style.textContent = '.__rec-flash { outline: 3px solid #f97316 !important; outline-offset: 2px !important; }';
    document.head.appendChild(style);

    var activeInput = null;
    var activeInputInitialValue = '';

    function isEditable(el) {
        var tag = (el.tagName || '').toUpperCase();
        var type = (el.type || '').toLowerCase();
        if (tag === 'INPUT' && type !== 'checkbox' && type !== 'radio' && type !== 'submit' && type !== 'button' && type !== 'file' && type !== 'reset' && type !== 'image') return true;
        if (tag === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function isClickTarget(el) {
        var tag = (el.tagName || '').toLowerCase();
        var role = el.getAttribute ? el.getAttribute('role') : null;
        var type = (el.type || '').toLowerCase();
        return tag === 'button' || tag === 'a' || role === 'button' || type === 'submit' || type === 'button';
    }

    function getSelector(el) {
        if (!el || el.nodeType !== 1) return '';
        if (el.id) return '#' + el.id;
        var parts = [];
        var node = el;
        while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
            if (node.id) { parts.unshift('#' + node.id); break; }
            var tag = node.tagName.toLowerCase();
            var cls = Array.from(node.classList || []).filter(function(c) { return !c.startsWith('__rec'); });
            var s = tag + (cls.length ? '.' + cls.slice(0, 2).map(function(c) { return CSS.escape(c); }).join('.') : '');
            var parent = node.parentNode;
            if (parent && parent.children) {
                var sibs = Array.from(parent.children).filter(function(c) { return c.tagName === node.tagName; });
                if (sibs.length > 1) s += ':nth-of-type(' + (Array.prototype.indexOf.call(sibs, node) + 1) + ')';
            }
            parts.unshift(s);
            node = parent;
        }
        return parts.join(' > ');
    }

    document.addEventListener('click', function(e) {
        var el = e.target;
        if (!el || isEditable(el)) return;

        var text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
        var action;
        if (text && isClickTarget(el)) {
            action = { type: 'click_text', text: text };
        } else {
            action = { type: 'click_selector', selector: getSelector(el) };
        }
        window.__recordedActions.push(action);

        var captured = el;
        captured.classList.add('__rec-flash');
        setTimeout(function() { try { captured.classList.remove('__rec-flash'); } catch(err) {} }, 300);
    }, true);

    document.addEventListener('focusin', function(e) {
        var el = e.target;
        if (isEditable(el)) {
            activeInput = el;
            activeInputInitialValue = el.value !== undefined ? el.value : (el.textContent || '');
        }
    }, true);

    document.addEventListener('focusout', function(e) {
        var el = e.target;
        if (el && el === activeInput) {
            var newVal = el.value !== undefined ? el.value : (el.textContent || '');
            if (newVal !== activeInputInitialValue) {
                window.__recordedActions.push({ type: 'type', selector: getSelector(el), text: newVal });
            }
            activeInput = null;
            activeInputInitialValue = '';
        }
    }, true);
})()`
}
