//download blobs support
if (!window.tvBroClicksListener) {
    window.tvBroClicksListener = function(e) {
        if (e.target.tagName.toUpperCase() == "A" && e.target.attributes.href.value.toLowerCase().startsWith("blob:")) {
            var fileName = e.target.download;
            var url = e.target.attributes.href.value;
            var xhr=new XMLHttpRequest();
            xhr.open('GET', e.target.attributes.href.value, true);
            xhr.responseType = 'blob';
            xhr.onload = function(e) {
                if (this.status == 200) {
                    var blob = this.response;
                    var reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = function() {
                        base64data = reader.result;
                        TVBro.takeBlobDownloadData(base64data, fileName, url, blob.type);
                    }
                }
            };
            xhr.send();
            e.stopPropagation();
            e.preventDefault();
        }
    };
    document.addEventListener("click", window.tvBroClicksListener);
}

// video playback control support
Object.defineProperty(HTMLMediaElement.prototype, 'playing', {
    get: function(){
        return !!(this.currentTime > 0 && !this.paused && !this.ended && this.readyState > 2);
    }
})

window.tvBroTogglePlayback = function() {
  var media = document.querySelector('video') || document.querySelector('audio');
  if (media) {
      if (media.playing) {
        media.pause();
      } else {
        media.play();
      }
  }
}

window.tvBroStopPlayback = function() {
  var media = document.querySelector('video') || document.querySelector('audio');
  if (media) {
      media.pause();
      media.currentTime = 0;
  }
}

window.tvBroRewind = function() {
    var media = document.querySelector('video') || document.querySelector('audio');
    if (media) {
        media.currentTime -= 10;
    }
}

window.tvBroFastForward = function() {
    var media = document.querySelector('video') || document.querySelector('audio');
    if (media) {
        media.currentTime += 10;
    }
}

// context menu support
window.addEventListener("touchstart", function(e) {
    window.TVBRO_activeElement = e.target;
    window.TVBRO_touchStartX = e.touches[0].clientX;
    window.TVBRO_touchStartY = e.touches[0].clientY;
});

// ---------------------------------------------------------------------
// TV Bro spatial navigation ("Netflix style" D-pad focus travel)
// Injected once per page load. Only acts while
// window.__tvbroSpatialNavEnabled === true (Direct Navigation Mode).
// ---------------------------------------------------------------------
if (!window.__tvbroSpatialNavInstalled) {
    window.__tvbroSpatialNavInstalled = true;
    window.__tvbroSpatialNavEnabled = false;

    var SELECTOR = [
        'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea',
        '[tabindex]', '[role=button]', '[role=link]', '[role=tab]',
        '[role=menuitem]', '[onclick]', 'video', 'audio', '[contenteditable=true]'
    ].join(',');

    var highlight = null;

    function ensureHighlight() {
        if (highlight && document.body.contains(highlight)) return highlight;
        highlight = document.createElement('div');
        highlight.id = '__tvbro_spatial_highlight';
        highlight.style.cssText = [
            'position:fixed', 'pointer-events:none', 'z-index:2147483647',
            'box-sizing:border-box', 'border:3px solid #ff3b30', 'border-radius:6px',
            'box-shadow:0 0 0 2px rgba(255,255,255,0.85), 0 0 18px 4px rgba(255,59,48,0.75)',
            'transition:top .12s ease-out,left .12s ease-out,width .12s ease-out,height .12s ease-out,opacity .12s ease-out',
            'display:none', 'opacity:0'
        ].join(';');
        (document.body || document.documentElement).appendChild(highlight);
        return highlight;
    }

    function isVisible(el) {
        if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
        var style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) return false;
        var r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        if (el.disabled) return false;
        return true;
    }

    function isEditable(el) {
        if (!el) return false;
        var tag = el.tagName ? el.tagName.toUpperCase() : '';
        if (tag === 'TEXTAREA') return true;
        if (tag === 'INPUT') {
            var t = (el.getAttribute('type') || 'text').toLowerCase();
            return ['text','search','email','url','tel','number','password','date','time','datetime-local','month','week'].indexOf(t) !== -1;
        }
        return el.isContentEditable === true;
    }

    function getCandidates() {
        var nodes = document.querySelectorAll(SELECTOR);
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var ti = el.getAttribute && el.getAttribute('tabindex');
            if (ti !== null && parseInt(ti, 10) < 0) continue;
            if (isVisible(el)) out.push(el);
        }
        return out;
    }

    function rectOf(el) { return el.getBoundingClientRect(); }

    // Find the best candidate in a given direction relative to `fromRect`.
    function findNext(direction, fromRect) {
        var candidates = getCandidates();
        var best = null, bestScore = Infinity;
        var fcx = fromRect.left + fromRect.width / 2;
        var fcy = fromRect.top + fromRect.height / 2;

        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            var r = rectOf(el);
            if (r.width === 0 && r.height === 0) continue;
            var cx = r.left + r.width / 2;
            var cy = r.top + r.height / 2;
            var dx = cx - fcx, dy = cy - fcy;

            var primary, lateral;
            if (direction === 'left') { if (dx >= -1) continue; primary = -dx; lateral = dy; }
            else if (direction === 'right') { if (dx <= 1) continue; primary = dx; lateral = dy; }
            else if (direction === 'up') { if (dy >= -1) continue; primary = -dy; lateral = dx; }
            else { if (dy <= 1) continue; primary = dy; lateral = dx; }

            // Favor elements aligned on the perpendicular axis; penalize offset.
            var score = primary + Math.abs(lateral) * 2.2;
            if (score < bestScore) { bestScore = score; best = el; }
        }
        return best;
    }

    function currentFocusRect() {
        var el = document.activeElement;
        if (el && el !== document.body && el !== document.documentElement && isVisible(el)) {
            return rectOf(el);
        }
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    function paintHighlight(el) {
        var hl = ensureHighlight();
        if (!el) { hl.style.display = 'none'; hl.style.opacity = '0'; return; }
        var r = rectOf(el);
        hl.style.left = Math.max(0, r.left - 4) + 'px';
        hl.style.top = Math.max(0, r.top - 4) + 'px';
        hl.style.width = (r.width + 8) + 'px';
        hl.style.height = (r.height + 8) + 'px';
        hl.style.display = 'block';
        requestAnimationFrame(function () { hl.style.opacity = '1'; });
    }

    function focusInitial() {
        var candidates = getCandidates();
        if (!candidates.length) return;
        // Prefer the topmost-leftmost visible candidate within the viewport.
        var vh = window.innerHeight;
        var best = null, bestScore = Infinity;
        for (var i = 0; i < candidates.length; i++) {
            var r = rectOf(candidates[i]);
            if (r.top < -r.height || r.top > vh) continue;
            var score = Math.max(0, r.top) * 2 + Math.max(0, r.left);
            if (score < bestScore) { bestScore = score; best = candidates[i]; }
        }
        if (best) {
            best.focus({ preventScroll: true });
            paintHighlight(best);
        }
    }

    document.addEventListener('focusin', function (e) {
        if (!window.__tvbroSpatialNavEnabled) return;
        paintHighlight(e.target);
    }, true);

    window.addEventListener('scroll', function () {
        if (!window.__tvbroSpatialNavEnabled) return;
        var el = document.activeElement;
        if (el && el !== document.body) paintHighlight(el);
    }, true);

    document.addEventListener('keydown', function (e) {
        if (!window.__tvbroSpatialNavEnabled) return;
        var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
        var dir = map[e.key];
        if (!dir) return;
        if (isEditable(document.activeElement)) return; // let caret movement / native behaviour work

        var fromRect = currentFocusRect();
        if (fromRect.width === 0 && fromRect.height === 0) {
            focusInitial();
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        var next = findNext(dir, fromRect);
        if (next) {
            e.preventDefault();
            e.stopPropagation();
            next.focus({ preventScroll: true });
            next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            paintHighlight(next);
        }
        // If nothing found, let the event fall through (e.g. page's own scroll handling).
    }, true);

    window.__tvbroSetSpatialNavEnabled = function (enabled) {
        window.__tvbroSpatialNavEnabled = !!enabled;
        if (enabled) {
            if (!document.activeElement || document.activeElement === document.body) {
                focusInitial();
            } else {
                paintHighlight(document.activeElement);
            }
        } else {
            paintHighlight(null);
        }
    };
}