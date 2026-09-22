'use strict';
'require view';
'require rpc';
'require poll';

var callTrafficStats = rpc.declare({
    object: 'luci.trafficchart',
    method: 'get_stats',
    expect: { '': {} }
});

var callHistory = rpc.declare({
    object: 'luci.trafficchart',
    method: 'get_stats',
    params: [ 'history' ],
    expect: { '': {} }
});

var DIRECTIONS = [
    { suffix: '_in',  title: _('Incoming (Download)'), centerLabel: _('INCOMING SHARE') },
    { suffix: '_out', title: _('Outgoing (Upload)'),    centerLabel: _('OUTGOING SHARE') }
];

var SVG_SIZE = 360;
var CX = SVG_SIZE / 2;
var CY = SVG_SIZE / 2;
var R = 118;
var STROKE_NORMAL = 70;
var STROKE_HOVER = 82;
var CIRC = 2 * Math.PI * R;

var UN_SLOT = 'su';
var UN_MIN_BPS = 5000;
var UN_MIN_SHARE = 0.04;

function formatBytes(b) {
    if (!isFinite(b) || b < 0) b = 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return Math.round(b) + ' B';
}
function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}
function formatRate(bitsPerSec) {
    if (!isFinite(bitsPerSec) || bitsPerSec < 0) bitsPerSec = 0;
    if (bitsPerSec >= 1e6) return (bitsPerSec / 1e6).toFixed(2) + ' Mbit/s';
    if (bitsPerSec >= 1e3) return (bitsPerSec / 1e3).toFixed(1) + ' kbit/s';
    return Math.round(bitsPerSec) + ' bit/s';
}

function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

return view.extend({
    render: function() {
        if (!document.getElementById('qos_chart_style')) {
            var styleTag = document.createElement('style');
            styleTag.id = 'qos_chart_style';
            styleTag.textContent =
                '.qos-panels { position: relative; z-index: 1; display:flex; justify-content:center; align-items:flex-start;' +
                '  gap:16px; flex-wrap:wrap; }' +
                '.qos-panel { display:flex; flex-direction:column; align-items:center; width:100%; max-width:1280px; box-sizing:border-box; }' +
                '.qos-panel-title { font-size:15px; font-weight:800; color:var(--secondary-dark-color); margin-bottom:6px; letter-spacing:0.3px; }' +
                '.qos-card { display:flex; justify-content:center; align-items:flex-start; gap:12px; flex-wrap:wrap; width:100%; min-width:0; }' +
                '.qos-card > * { min-width:0; }' +
                '.qos-seg { transition: stroke-dasharray 1.2s cubic-bezier(.22,1,.36,1), stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1), stroke-width .25s ease, opacity .25s ease; cursor: pointer; }' +
                '.qos-seg.dimmed { opacity: 0.28; }' +
                '.qos-seg.active { stroke-width: ' + STROKE_HOVER + 'px; }' +
                '.qos-legend-row { transition: background .2s ease, transform .2s ease; border-radius: 10px; cursor: pointer; }' +
                '.qos-legend-row:hover { background: rgba(0,0,0,0.035); transform: translateX(2px); }' +
                '.qos-legend-row.dimmed { opacity: 0.4; }' +
                '.qos-center-value { transition: opacity .18s ease, transform .18s ease; }' +
                '.qos-swatch { transition: transform .2s ease, box-shadow .2s ease; }' +
                '.qos-legend-row:hover .qos-swatch { transform: scale(1.15); }';
            document.head.appendChild(styleTag);
        }

        var tipOld = document.getElementById('qos_tip_style');
        if (tipOld) tipOld.parentNode.removeChild(tipOld);
        var tipStyle = document.createElement('style');
        tipStyle.id = 'qos_tip_style';
        tipStyle.textContent =
            '@keyframes qosTipIn { from { opacity:0; transform: translateY(6px) scale(.97); } to { opacity:1; transform:none; } }' +
            '#qos_tip { animation: qosTipIn .16s ease-out; transform-origin: top left; font-family: inherit; background: rgba(15,23,42,0.68) !important; color: #e2e8f0 !important; }' +
            '#qos_tip table, #qos_tip tbody, #qos_tip tr, #qos_tip th, #qos_tip td { background: transparent !important; border: 0 !important; box-shadow: none !important; text-shadow: none !important; }' +
            '#qos_tip table { border-collapse: collapse; margin:0; width:auto; }' +
            '#qos_tip th { font-weight:600; font-size:10px; letter-spacing:.6px; text-transform:uppercase; color:rgba(226,232,240,.65) !important; padding:0 0 6px 18px; text-align:right; white-space:nowrap; }' +
            '#qos_tip td { font-size:12px; color:#e2e8f0 !important; padding:5px 0 5px 18px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }' +
            '#qos_tip th:first-child, #qos_tip td:first-child { padding-left:0; text-align:left; }' +
            '#qos_tip td:first-child { white-space:normal; min-width:150px; max-width:260px; }' +
            '#qos_tip tr + tr td { border-top: 1px solid rgba(255,255,255,.10) !important; }' +
            '#qos_tip td.dl { color:#6ee7b7 !important; } #qos_tip td.ul { color:#93c5fd !important; }' +
            '#qos_tip .tt-name { color:#f8fafc !important; font-weight:600; }' +
            '#qos_tip .tt-title { color:#ffffff !important; font-size:13px; font-weight:800; }';
        document.head.appendChild(tipStyle);
        var tipEl = document.getElementById('qos_tip');
        if (!tipEl) { tipEl = E('div', { id: 'qos_tip' }); document.body.appendChild(tipEl); }
        tipEl.style.cssText = 'position:fixed; z-index:10000; display:none; pointer-events:none; max-width:min(460px, 92vw); ' +
            'background:rgba(15,23,42,0.68) !important; color:#e2e8f0 !important; ' +
            '-webkit-backdrop-filter:blur(14px) saturate(1.4); backdrop-filter:blur(14px) saturate(1.4); ' +
            'border:1px solid rgba(255,255,255,0.18) !important; border-radius:12px; ' +
            'box-shadow:0 12px 32px rgba(0,0,0,0.5); padding:12px 14px; font-size:12px; line-height:1.35;';
        var tipPos = { x: 0, y: 0 };
        function tipPlace() {
            var pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
            var x = tipPos.x + pad, y = tipPos.y + pad;
            if (x + w > window.innerWidth - 8) x = tipPos.x - pad - w;
            if (y + h > window.innerHeight - 8) y = tipPos.y - pad - h;
            tipEl.style.left = Math.max(8, x) + 'px';
            tipEl.style.top = Math.max(8, y) + 'px';
        }
        function tipTrack(ev) {
            tipPos.x = ev.clientX; tipPos.y = ev.clientY;
            if (tipEl.style.display !== 'none') tipPlace();
        }
        var tipScrollY = window.pageYOffset;
        window.addEventListener('scroll', function() {
            var y = window.pageYOffset;
            if (tipEl.style.display !== 'none') { tipPos.y -= (y - tipScrollY); tipPlace(); }
            tipScrollY = y;
        });
        function tipHide() { tipEl.style.display = 'none'; }
        function tipShow(m) {
            while (tipEl.firstChild) tipEl.removeChild(tipEl.firstChild);
            var max = 0;
            m.details.forEach(function(d) { max = Math.max(max, (d[1] || 0) + (d[2] || 0)); });
            var dot = m.color || '#94a3b8';
            var rows = [ E('tr', {}, [
                E('th', {}, m.detailTitle || _('Top applications')),
                E('th', {}, '\u2193 ' + _('Download')),
                E('th', {}, '\u2191 ' + _('Upload')) ]) ];
            m.details.forEach(function(d) {
                var pct = max > 0 ? Math.max(3, ((d[1] || 0) + (d[2] || 0)) / max * 100) : 0;
                rows.push(E('tr', {}, [
                    E('td', {}, [
                        E('div', { 'class': 'tt-name' }, d[0]),
                        E('div', { style: 'height:3px; margin-top:4px; border-radius:2px; background:rgba(255,255,255,0.12) !important;' }, [
                            E('div', { style: 'height:100%; width:' + pct.toFixed(1) + '%; border-radius:2px; background:hsl(' + slotHue(d[0]) + ',65%,62%) !important;' }) ]) ]),
                    E('td', { 'class': 'dl' }, formatBytes(d[1])),
                    E('td', { 'class': 'ul' }, formatBytes(d[2])) ]));
            });
            tipEl.appendChild(E('div', { style: 'display:flex; align-items:center; gap:8px; margin-bottom:8px;' }, [
                E('span', { style: 'flex-shrink:0; width:8px; height:8px; border-radius:50%; background:' + dot + ' !important; box-shadow:0 0 8px ' + dot + ';' }),
                E('span', { 'class': 'tt-title' }, m.label) ]));
            tipEl.appendChild(E('table', {}, rows));
            tipEl.style.display = 'block';
            tipPlace();
        }

        function buildDirectionPanel(dir, order, metaOf, dynamicMeta, noun) {
            var refs = { classes: {}, segEls: {} };
            var lastValues = { total: '100.0%', classes: {}, counters: {} };
            var pinned = null;
            var hovered = null;
            var currentMeta = null;
            function getMeta(cls) { return (dynamicMeta && currentMeta && currentMeta[cls]) ? currentMeta[cls] : metaOf(cls); }
            var lastUpdateArgs = null;

            var tipShown = false;
            function refreshTip() {
                var m = (dynamicMeta && pinned && currentMeta && panelEl.offsetParent) ? currentMeta[pinned.key] : null;
                if (m && m.details && m.details.length) { tipShow(m); tipShown = true; }
                else if (tipShown) { tipHide(); tipShown = false; }
            }

            function setPinned(newPinned) {
                var wasPinned = !!pinned;
                pinned = newPinned;
                applyHighlight();
                if (wasPinned && !pinned && lastUpdateArgs) {
                    applyUpdate.apply(null, lastUpdateArgs);
                }
            }

            var svg = svgEl('svg', { viewBox: '0 0 ' + SVG_SIZE + ' ' + SVG_SIZE, width: '100%', height: '100%', style: 'display:block; filter: drop-shadow(0 14px 30px rgba(15,23,42,0.16));' });
            svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: 'rgba(0,0,0,0.055)', 'stroke-width': STROKE_NORMAL }));

            var segGroup = svgEl('g', { transform: 'rotate(-90 ' + CX + ' ' + CY + ')' });
            order.forEach(function(cls) {
                var seg = svgEl('circle', {
                    cx: CX, cy: CY, r: R, fill: 'none', stroke: metaOf(cls).color,
                    'stroke-width': STROKE_NORMAL, 'stroke-dasharray': '0 ' + CIRC.toFixed(2),
                    'stroke-dashoffset': '0', class: 'qos-seg'
                });
                seg.addEventListener('mouseenter', function() { hovered = { type: 'class', key: cls }; applyHighlight(); });
                seg.addEventListener('mouseleave', function() { hovered = null; applyHighlight(); });
                seg.addEventListener('click', function(ev) {
                    tipTrack(ev);
                    setPinned((pinned && pinned.type === 'class' && pinned.key === cls) ? null : { type: 'class', key: cls });
                });
                refs.segEls[cls] = seg;
                segGroup.appendChild(seg);
            });
            svg.appendChild(segGroup);

            var centerPctEl = E('div', {
                class: 'qos-center-value',
                style: 'font-size:19px; font-weight:800; color:var(--secondary-dark-color); font-variant-numeric: tabular-nums; min-width:95px; text-align:center;'
            }, '100.0%');
            var centerLabelEl = E('div', {
                class: 'qos-center-value',
                style: 'font-size:9.5px; color:var(--main-bright-color); letter-spacing:0.4px; text-align:center; max-width:125px;'
            }, dir.centerLabel);

            var activeCountEl = E('div', {
                style: 'font-size:11px; color:var(--main-bright-color); text-transform:uppercase; letter-spacing:0.7px; margin-bottom:2px;'
            }, noun || '');

            var legendChildren = [];
            order.forEach(function(cls) {
                refs.classes[cls] = {};

                var liveBarEl = E('div', {
                    style: 'position:absolute; left:0; top:0; bottom:0; width:0%; border-radius:6px; opacity:0.25; background:' + metaOf(cls).color + '; transition:width 0.4s ease;'
                });
                var liveTextEl = E('span', {
                    style: 'position:relative; z-index:1; font-size:11px; font-weight:700; color:var(--secondary-dark-color); font-variant-numeric: tabular-nums;'
                }, '0 bit/s');
                var livePctEl = E('div', {
                    style: 'position:relative; display:inline-flex; align-items:center; justify-content:flex-end; padding:2px 8px; border-radius:6px; background:rgba(0,0,0,0.04); min-width:85px; overflow:hidden;'
                }, [ liveBarEl, liveTextEl ]);

                var sigmaBytesEl = E('span', { style: 'color:var(--main-dark-color);' }, '0 B');
                var sigmaPacketsEl = E('span', { style: 'color:var(--main-dark-color);' }, '0');
                var sigmaSuffixWordEl = E('span', { style: 'color:var(--main-dark-color);' }, ' packets');
                var sigmaSuffixTimeEl = E('span', {}, ' (since start)');
                var sigmaEl = E('span', {
                    style: 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1 1 auto;'
                }, [ E('span', { style: 'color:var(--main-dark-color);' }, 'Total '), sigmaBytesEl, ' - ', sigmaPacketsEl, sigmaSuffixWordEl, sigmaSuffixTimeEl ]);
                var totalPctEl = E('span', {
                    style: 'min-width:58px; text-align:right; display:inline-block; flex-shrink:0;'
                }, 'total: 0.0%');
                refs.classes[cls].livePct = liveTextEl;
                refs.classes[cls].liveBar = liveBarEl;
                refs.classes[cls].sigma = sigmaEl;
                refs.classes[cls].sigmaBytes = sigmaBytesEl;
                refs.classes[cls].sigmaPackets = sigmaPacketsEl;
                refs.classes[cls].sigmaSuffixTime = sigmaSuffixTimeEl;
                refs.classes[cls].totalPct = totalPctEl;

                var labelEl = E('span', { style: 'font-size:11.5px; color:var(--secondary-dark-color); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;' }, metaOf(cls).label);
                var swatch = E('span', { class: 'qos-swatch', style: 'width:11px; height:11px; background:' + metaOf(cls).color + '; border-radius:3px; display:inline-block; flex-shrink:0; box-shadow:0 2px 5px rgba(0,0,0,0.15);' });

                var headerRow = E('div', {
                    class: 'qos-legend-row',
                    style: 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0px 1px;'
                }, [
                    E('div', { style: 'display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden;' }, [
                        swatch,
                        labelEl
                    ]),
                    E('div', { style: 'text-align:right; min-width:85px; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px;' }, [ livePctEl ])
                ]);

                headerRow.addEventListener('mouseenter', function() { hovered = { type: 'class', key: cls }; applyHighlight(); });
                headerRow.addEventListener('mouseleave', function() { hovered = null; applyHighlight(); });
                headerRow.addEventListener('click', function(ev) {
                    tipTrack(ev);
                    setPinned((pinned && pinned.type === 'class' && pinned.key === cls) ? null : { type: 'class', key: cls });
                });

                refs.classes[cls].headerRow = headerRow;
                refs.classes[cls].labelEl = labelEl;
                refs.classes[cls].swatchEl = swatch;

                var rowEl = E('div', {
                    style: 'padding:0px 0; border-bottom:1px solid rgba(165,173,175,0.25); display:none;'
                }, [
                    headerRow,
                    E('div', {
                        style: 'display:flex; flex-wrap:nowrap; justify-content:space-between; align-items:center; gap:4px; margin:0 1px; min-width:0; font-size:9.5px; color:var(--main-bright-color); font-variant-numeric: tabular-nums;'
                    }, [ sigmaEl, totalPctEl ])
                ]);
                refs.classes[cls].rowEl = rowEl;

                legendChildren.push(rowEl);
            });

            function applyHighlight() {
                var active = hovered || pinned;
                refreshTip();

                order.forEach(function(cls) {
                    var seg = refs.segEls[cls];
                    var match = !active || active.key === cls;
                    seg.classList.toggle('dimmed', !!active && !match);
                    seg.classList.toggle('active', !!active && match);
                    refs.classes[cls].headerRow.classList.toggle('dimmed', !!active && !match);
                });

                if (!active) {
                    centerPctEl.textContent = lastValues.total;
                    centerLabelEl.textContent = dir.centerLabel;
                } else {
                    var cv = lastValues.classes[active.key];
                    centerPctEl.textContent = cv ? cv.pct : '0.0%';
                    centerLabelEl.textContent = getMeta(active.key).label;
                }
            }

            var legendGrid = E('div', {
                style: 'display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:0 32px; align-content:start;'
            }, legendChildren);

            var card = E('div', { class: 'qos-card' }, [
                E('div', { style: 'position:relative; width:100%; max-width:360px; aspect-ratio:1/1; flex:0 1 360px;' }, [
                    svg,
                    E('div', {
                        style: 'position:absolute; inset:30.8%; border-radius:50%; background:var(--table-background-color); display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow: inset 0 0 0 1px var(--main-bright-color);'
                    }, [ centerPctEl, centerLabelEl ])
                ]),
                E('div', { style: 'width:100%; max-width:760px; min-width:280px; flex:1 1 520px; box-sizing:border-box;' }, [ activeCountEl, legendGrid ])
            ]);

            var linkStatsBar = E('div', { style: 'position:absolute; left:0; top:0; bottom:0; width:0%; background:var(--main-bright-color); opacity:0.15; transition:width 0.4s ease; border-radius:6px; pointer-events:none;' });
            var linkStatsText = E('span', { style: 'position:relative; z-index:1; font-weight:600;' }, _('Measuring real interface throughput...'));
            var linkStatsEl = E('div', {
                style: 'position:relative; display:inline-block; font-size:11.5px; color:var(--secondary-dark-color); margin-bottom:8px; font-variant-numeric: tabular-nums; text-align:center; padding:4px 12px; border-radius:6px; background:rgba(0,0,0,0.03); overflow:hidden; min-width:60%;'
            }, [ linkStatsBar, linkStatsText ]);

            var diagEl = E('div', {
                style: 'font-size:9.5px; color:var(--main-bright-color); margin-bottom:6px; font-variant-numeric: tabular-nums; text-align:center;'
            }, '');

            var panelEl = E('div', { class: 'qos-panel' }, [
                E('div', { class: 'qos-panel-title' }, dir.title),
                E('div', { style: 'width:100%; display:flex; justify-content:center;' }, [ linkStatsEl ]),
                diagEl,
                card
            ]);

            function refreshMeta() {
                order.forEach(function(cls) {
                    var m = getMeta(cls);
                    refs.segEls[cls].setAttribute('stroke', m.color);
                    refs.classes[cls].swatchEl.style.background = m.color;
                    refs.classes[cls].labelEl.textContent = m.label;
                    if (refs.classes[cls].liveBar)
                        refs.classes[cls].liveBar.style.background = m.color;
                });
            }

            function applyUpdate(classBytes, classPackets, classRate, ifaceRateBps, configuredKbit, ifaceSourceName, baselineLabel, metaSnapshot) {
                if (dynamicMeta) { if (metaSnapshot) currentMeta = metaSnapshot; refreshMeta(); }
                var rawTotal = order.reduce(function(s, cls) { return s + classRate[cls]; }, 0);
                var totalBytesSum = order.reduce(function(s, cls) { return s + classBytes[cls]; }, 0);

                var MIN_SLICE_FRACTION = 0.002;
                var displayRates = {};
                order.forEach(function(cls) {
                    if (rawTotal === 0) {
                        displayRates[cls] = 1;
                    } else if (classRate[cls] > 0) {
                        displayRates[cls] = Math.max(classRate[cls], rawTotal * MIN_SLICE_FRACTION);
                    } else {
                        displayRates[cls] = 0;
                    }
                });
                var displayTotal = order.reduce(function(s, cls) { return s + displayRates[cls]; }, 0);

                var offsetSoFar = 0;
                order.forEach(function(cls) {
                    var frac = displayTotal > 0 ? (displayRates[cls] / displayTotal) : 0;
                    var segLen = frac * CIRC;
                    var seg = refs.segEls[cls];
                    seg.setAttribute('stroke-dasharray', segLen.toFixed(2) + ' ' + (CIRC - segLen).toFixed(2));
                    seg.setAttribute('stroke-dashoffset', (-offsetSoFar).toFixed(2));
                    offsetSoFar += segLen;
                });

                lastValues.total = rawTotal > 0 ? '100.0%' : '0.0%';
                var activeClassCount = order.filter(function(cls) {
                    return classRate[cls] > 0 && cls !== UN_SLOT;
                }).length;
                activeCountEl.textContent = _('%s (%d active)').format(noun, activeClassCount);

                var sourceTxt = ifaceSourceName ? ' [via ' + ifaceSourceName + ']' : '';
                var configuredMbit = (configuredKbit || 0) / 1000;
                var configuredBps = (configuredKbit || 0) * 1000;
                var totalPct = 0;
                
                if (ifaceRateBps === null || ifaceRateBps === undefined) {
                    linkStatsText.textContent = _('Link rate not available (no tc counters)') + sourceTxt;
                } else {
                    var ifaceMbit = ifaceRateBps * 8 / 1e6;
                    if (configuredMbit > 0) {
                        totalPct = Math.min(100, (ifaceMbit / configuredMbit) * 100);
                        linkStatsText.textContent = ifaceMbit.toFixed(1) + ' Mbit/s of ' + configuredMbit.toFixed(0) + ' Mbit/s configured (' + totalPct.toFixed(1) + '%)' + sourceTxt;
                    } else {
                        linkStatsText.textContent = ifaceMbit.toFixed(1) + ' Mbit/s (configured SQM bandwidth not found)' + sourceTxt;
                    }
                }
                linkStatsBar.style.width = totalPct.toFixed(1) + '%';

                order.forEach(function(cls) {
                    var classFrac = rawTotal > 0 ? (classRate[cls] / rawTotal) : 0;
                    var classRateBits = classRate[cls] * 8;
                    var livePct = rawTotal > 0 ? (classFrac * 100).toFixed(1) : '0.0';
                    var tPct = totalBytesSum > 0 ? ((classBytes[cls] / totalBytesSum) * 100).toFixed(1) : '0.0';

                    refs.classes[cls].livePct.textContent = formatRate(classRateBits);
                    
                    // Skalierung der Legenden-Balken relativ zur konfigurierten Linkrate
                    var barPct = 0;
                    if (configuredBps > 0) {
                        barPct = Math.min(100, (classRateBits / configuredBps) * 100);
                    } else if (rawTotal > 0) {
                        barPct = classFrac * 100;
                    }

                    if (refs.classes[cls].liveBar)
                        refs.classes[cls].liveBar.style.width = barPct.toFixed(1) + '%';

                    refs.classes[cls].sigmaBytes.textContent = formatBytes(classBytes[cls]);
                    refs.classes[cls].sigmaPackets.textContent = formatCount(classPackets[cls]);
                    refs.classes[cls].sigmaSuffixTime.textContent = ' (' + (baselineLabel || _('since start')) + ')';
                    refs.classes[cls].sigma.title = _('Total %s - %s packets (%s)')
                        .format(formatBytes(classBytes[cls]), formatCount(classPackets[cls]), baselineLabel || _('since start'));
                    refs.classes[cls].totalPct.textContent = 'total: ' + tPct + '%';

                    lastValues.classes[cls] = { pct: livePct + '%' };
                    refs.classes[cls].rowEl.style.display = classBytes[cls] > 0 ? '' : 'none';
                });

                if (!pinned && !hovered) {
                    centerPctEl.textContent = lastValues.total;
                }
            }

            function update() {
                lastUpdateArgs = arguments;
                if (pinned) return;
                applyUpdate.apply(null, arguments);
            }

            function clearPinned() {
                if (pinned) { setPinned(null); }
            }

            return { el: panelEl, update: update, clearPinned: clearPinned };
        }

        function slotHue(name) {
            var h = 7;
            for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
            return h;
        }

        function makeSlotView(top, noun, labelOf, otherLabelOf, detailsOf, detailTitle) {
            var slots = [];
            for (var i = 0; i <= top; i++) slots.push('s' + i);
            slots.push(UN_SLOT);
            var emptyMeta = { label: '', color: 'hsl(0,0%,70%)' };
            var v = { rate: { 'in': {}, 'out': {} }, order: { 'in': [], 'out': [] } };
            var RANK_MARGIN = 1.25;
            v.panelIn = buildDirectionPanel(DIRECTIONS[0], slots, function() { return emptyMeta; }, true, noun);
            v.panelOut = buildDirectionPanel(DIRECTIONS[1], slots, function() { return emptyMeta; }, true, noun);

            function rankNames(d, items) {
                var all = Object.keys(items), seen = {}, arr = [], sc = {}, fresh;
                all.forEach(function(n) {
                    var act = v.rate[d][n] || 0;
                    sc[n] = { g: act > 0 ? 1 : 0, a: act, t: items[n][d + '_bytes'] || 0 };
                });
                v.order[d].forEach(function(n) { if (n in items) { arr.push(n); seen[n] = true; } });
                fresh = all.filter(function(n) { return !seen[n]; });
                fresh.sort(function(a, b) {
                    var x = sc[a], y = sc[b];
                    return (y.g - x.g) || (y.a - x.a) || (y.t - x.t) || (a < b ? -1 : (a > b ? 1 : 0));
                });
                arr = arr.concat(fresh);
                function beats(x, y) {
                    var X = sc[x], Y = sc[y];
                    if (X.g !== Y.g) return X.g > Y.g;
                    return X.g ? (X.a > Y.a * RANK_MARGIN) : (X.t > Y.t);
                }
                var swapped = true, guard = 0, i, tmp;
                while (swapped && guard++ <= arr.length) {
                    swapped = false;
                    for (i = arr.length - 1; i > 0; i--) {
                        if (beats(arr[i], arr[i - 1])) { tmp = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = tmp; swapped = true; }
                    }
                }
                v.order[d] = arr;
                return arr;
            }

            v.render = function(items, ifaceRate, sqmDownKbit, sqmUpKbit, iface, baselineLabel, rateInfo) {
                var link = ifaceRate || { rx: null, tx: null };
                var res = { meta: { 'in': {}, 'out': {} },
                            'in': { bytes: {}, packets: {}, rate: {} }, 'out': { bytes: {}, packets: {}, rate: {} } };
                ['in', 'out'].forEach(function(d) {
                    Object.keys(items).forEach(function(n) { v.rate[d][n] = items[n][d + '_bps'] || 0; });
                    var names = rankNames(d, items);
                    slots.forEach(function(sl) {
                        res.meta[d][sl] = { label: '', color: 'hsl(0,0%,70%)' };
                        res[d].bytes[sl] = 0; res[d].packets[sl] = 0; res[d].rate[sl] = 0;
                    });
                    names.forEach(function(name, i) {
                        var sl = slots[Math.min(i, top)];
                        if (i < top)
                            res.meta[d][sl] = { label: labelOf(name, items[name]), color: 'hsl(' + slotHue(name) + ',58%,46%)', details: detailsOf ? detailsOf(items[name]) : null, detailTitle: detailTitle };
                        res[d].bytes[sl] += items[name][d + '_bytes'] || 0;
                        res[d].packets[sl] += items[name][d + '_packets'] || 0;
                        res[d].rate[sl] += v.rate[d][name] || 0;
                    });
                    if (names.length > top)
                        res.meta[d][slots[top]] = { label: otherLabelOf(names.length - top), color: 'hsl(210,8%,62%)' };
                    if (rateInfo && rateInfo.tc) {
                        var un = (d === 'in') ? { rate: rateInfo.un_rx_bps || 0, bytes: rateInfo.un_rx_bytes || 0, link: link.rx || 0 }
                                              : { rate: rateInfo.un_tx_bps || 0, bytes: rateInfo.un_tx_bytes || 0, link: link.tx || 0 };
                        if (un.rate >= Math.max(UN_MIN_BPS, UN_MIN_SHARE * un.link)) {
                            res.meta[d][UN_SLOT] = { label: _('Not attributed (not counted by conntrack)'), color: 'hsl(0,0%,55%)', details: null };
                            res[d].rate[UN_SLOT] = un.rate;
                            res[d].bytes[UN_SLOT] = Math.max(un.bytes, 1);
                        }
                    }
                });
                v.panelIn.update(res['in'].bytes, res['in'].packets, res['in'].rate, link.rx, sqmDownKbit, iface ? iface.rx_source : null, baselineLabel, res.meta['in']);
                v.panelOut.update(res['out'].bytes, res['out'].packets, res['out'].rate, link.tx, sqmUpKbit, iface ? iface.tx_source : null, baselineLabel, res.meta['out']);
            };
            return v;
        }

        var MAX_ROWS = 22;
        var appsView = makeSlotView(MAX_ROWS - 1, _('Applications'),
            function(name) { return name; },
            function(n) { return _('Other (%d applications)').format(n); },
            function(e) { return (e.top && e.top.length) ? e.top : null; }, _('Top destinations'));
        var devicesView = makeSlotView(MAX_ROWS - 1, _('Devices'),
            function(key, e) { var nm = e.name || key; return (e.ip && e.ip !== nm) ? nm + ' (' + e.ip + ')' : nm; },
            function(n) { return _('Other (%d devices)').format(n); },
            function(e) {
                var t = (e.top || []).slice();
                if ((e.via_in || 0) + (e.via_out || 0) > 0)
                    t.push([ _('via router services (proxy, DNS, LuCI ...) - LAN side, not WAN'), e.via_in || 0, e.via_out || 0 ]);
                return t.length ? t : null;
            }, _('Top applications'));
        var hostsView = makeSlotView(MAX_ROWS - 1, _('Destinations'),
            function(name) { return name; },
            function(n) { return _('Other (%d destinations)').format(n); },
            function(e) { return (e.top && e.top.length) ? e.top : null; }, _('Top devices'));
        var slotViews = [ appsView, devicesView, hostsView ];

        function makeFlowsView() {
            var v = {};
            // Feste Spaltenbreiten (Summe = 100%), damit die Tabelle bei wechselnden
            // Inhalten (kurze/lange Namen, kurze/lange Zahlen) nicht mehr hin und her springt.
            var COL_WIDTHS = [ 16, 14, 30, 8, 11, 11, 10 ]; // Gerät, App, Ziel, Port, Down, Up, Volumen
            var colgroup = E('colgroup', {}, COL_WIDTHS.map(function(w) {
                return E('col', { style: 'width:' + w + '%;' });
            }));
            var trunc = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            var hdr = function(t, right) { return E('th', { class: 'th', style: (right ? 'text-align:right; ' : '') + trunc }, t); };
            var head = E('tr', { class: 'tr table-titles' }, [
                hdr(_('Device')), hdr(_('Application')), hdr(_('Destination')), hdr(_('Port')),
                hdr(_('Download'), true), hdr(_('Upload'), true), hdr(_('Volume'), true) ]);
            var table = E('table', { class: 'table', id: 'qos_flows_table', style: 'table-layout:fixed; width:100%;' }, [ colgroup, head ]);
            var num = 'text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap;';
            v.el = E('div', { style: 'width:100%; display:none;' }, [
                E('div', { class: 'qos-panel-title', style: 'text-align:center;' }, _('Busiest flows (smoothed rate, top 25)')),
                table ]);
            v.update = function(flows, sqmDownKbit, sqmUpKbit) {
                while (table.rows.length > 1) table.deleteRow(1);
                if (!flows || !flows.length) {
                    table.appendChild(E('tr', { class: 'tr' }, [ E('td', { class: 'td', colspan: 7 }, _('No active flows')) ]));
                    return;
                }
                
                var maxIn = 0, maxOut = 0;
                flows.forEach(function(f) {
                    if ((f.in_bps || 0) > maxIn) maxIn = f.in_bps;
                    if ((f.out_bps || 0) > maxOut) maxOut = f.out_bps;
                });

                var downLimitBps = (sqmDownKbit || 0) * 1000;
                var upLimitBps = (sqmUpKbit || 0) * 1000;

                flows.forEach(function(f) {
                    var dest = f.host || f.dst;
                    var dev = (f.ip && f.ip !== f.dev) ? f.dev + ' (' + f.ip + ')' : f.dev;
                    
                    var inBits = (f.in_bps || 0) * 8;
                    var outBits = (f.out_bps || 0) * 8;

                    // Skalierung der Flow-Balken relativ zur konfigurierten Linkrate (mit Fallback)
                    var pctIn = downLimitBps > 0 ? Math.min(100, (inBits / downLimitBps) * 100) : (maxIn > 0 ? ((f.in_bps || 0) / maxIn * 100) : 0);
                    var pctOut = upLimitBps > 0 ? Math.min(100, (outBits / upLimitBps) * 100) : (maxOut > 0 ? ((f.out_bps || 0) / maxOut * 100) : 0);
                    
                    var tdIn = E('td', { class: 'td', style: num + ' position:relative; padding-right:8px;' }, [
                        E('div', { style: 'position:absolute; right:0; top:2px; bottom:2px; width:' + pctIn.toFixed(1) + '%; background:rgba(110, 231, 183, 0.22); border-radius:4px; z-index:0; transition:width 0.4s ease; pointer-events:none;' }),
                        E('span', { style: 'position:relative; z-index:1;' }, formatRate(inBits))
                    ]);
                    
                    var tdOut = E('td', { class: 'td', style: num + ' position:relative; padding-right:8px;' }, [
                        E('div', { style: 'position:absolute; right:0; top:2px; bottom:2px; width:' + pctOut.toFixed(1) + '%; background:rgba(147, 197, 253, 0.22); border-radius:4px; z-index:0; transition:width 0.4s ease; pointer-events:none;' }),
                        E('span', { style: 'position:relative; z-index:1;' }, formatRate(outBits))
                    ]);

                    table.appendChild(E('tr', { class: 'tr' }, [
                        E('td', { class: 'td', style: trunc, title: dev }, dev),
                        E('td', { class: 'td', style: trunc, title: f.app }, f.app),
                        E('td', { class: 'td', style: trunc, title: f.dst + (f.host ? ' - ' + f.host : '') }, dest),
                        E('td', { class: 'td', style: trunc }, (f.proto || '') + (f.port ? '/' + f.port : '')),
                        tdIn,
                        tdOut,
                        E('td', { class: 'td', style: num + ' ' + trunc }, formatBytes(f.bytes || 0)) ]));
                });
            };
            return v;
        }

        function makeHistoryView() {
            var v = { active: false, loadedAt: 0 };
            var st = { dim: 'a', dir: 'in', buckets: [] };
            var chartHost = E('div', { style: 'width:100%;' });
            var btnStyle = 'margin-right:6px;';
            var dimDefs = [ ['a', _('Applications')], ['d', _('Devices')], ['h', _('Destinations')] ];
            var dirDefs = [ ['in', _('Download')], ['out', _('Upload')], ['both', _('Both')] ];
            var dimBtns = [], dirBtns = [];
            function mark() {
                dimBtns.forEach(function(b, i) { b.className = 'btn cbi-button' + (st.dim === dimDefs[i][0] ? ' cbi-button-apply' : ''); });
                dirBtns.forEach(function(b, i) { b.className = 'btn cbi-button' + (st.dir === dirDefs[i][0] ? ' cbi-button-apply' : ''); });
            }
            dimDefs.forEach(function(d) {
                var b = E('button', { type: 'button', style: btnStyle }, d[1]);
                b.addEventListener('click', function(e) { e.stopPropagation(); st.dim = d[0]; mark(); render(); });
                dimBtns.push(b);
            });
            dirDefs.forEach(function(d) {
                var b = E('button', { type: 'button', style: btnStyle }, d[1]);
                b.addEventListener('click', function(e) { e.stopPropagation(); st.dir = d[0]; mark(); render(); });
                dirBtns.push(b);
            });
            v.el = E('div', { style: 'width:100%; display:none;' }, [
                E('div', { style: 'display:flex; gap:24px; flex-wrap:wrap; justify-content:center; margin-bottom:10px;' }, [
                    E('div', {}, dimBtns), E('div', {}, dirBtns) ]),
                chartHost ]);

            function colorOf(k) {
                if (k === '(other)') return 'hsl(210,8%,62%)';
                return 'hsl(' + slotHue(k) + ',58%,46%)';
            }
            var AXIS_TEXT_STYLE = 'font-size:12px; fill:var(--main-bright-color);';
            function axisRate(mbit) {
                if (mbit >= 100) return Math.round(mbit) + ' Mbit/s';
                if (mbit >= 1) return (Math.round(mbit * 10) / 10) + ' Mbit/s';
                if (mbit > 0) return Math.round(mbit * 1000) + ' kbit/s';
                return '0';
            }
            function niceMax(x) {
                if (x <= 0) return 1;
                var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), n = x / p;
                return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
            }
            function hhmm(epoch) {
                return new Date(epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            function render() {
                while (chartHost.firstChild) chartHost.removeChild(chartHost.firstChild);
                var B = st.buckets || [];
                if (!B.length) {
                    chartHost.appendChild(E('div', { style: 'text-align:center; color:var(--main-bright-color); padding:30px 0;' },
                        _('No history yet - the first bucket is written 5 minutes after the aggregator started.')));
                    return;
                }
                var idx = st.dir === 'in' ? [0] : st.dir === 'out' ? [1] : [0, 1];
                function val(e) { var t = 0; idx.forEach(function(i) { t += e[i] || 0; }); return t; }

                var totals = {}, names = {};
                B.forEach(function(b) {
                    var src = b[st.dim] || {};
                    Object.keys(src).forEach(function(k) {
                        totals[k] = (totals[k] || 0) + val(src[k]);
                        if (st.dim === 'd' && src[k][2]) names[k] = src[k][2];
                    });
                });
                var keys = Object.keys(totals).sort(function(a, b) { return totals[b] - totals[a]; });
                var TOP = 8, shown = keys.slice(0, TOP), rest = keys.slice(TOP);
                var series = shown.slice();
                if (rest.length) series.push('__rest');

                var cols = B.map(function(b) {
                    var dt = b.dt || 300, src = b[st.dim] || {}, out = {}, tot = 0;
                    series.forEach(function(k) { out[k] = 0; });
                    Object.keys(src).forEach(function(k) {
                        var mbit = val(src[k]) * 8 / dt / 1e6;
                        var key = (shown.indexOf(k) >= 0) ? k : '__rest';
                        out[key] = (out[key] || 0) + mbit;
                    });
                    series.forEach(function(k) { tot += out[k] || 0; });
                    return { b: b, v: out, total: tot };
                });
                var maxv = niceMax(Math.max.apply(null, cols.map(function(c) { return c.total; }).concat([0.001])));

                var W = Math.max(360, Math.round(chartHost.clientWidth || 900)), H = 264, pl = 84, pr = 10, pt = 10, pb = 26;
                var pw = W - pl - pr, ph = H - pt - pb;
                var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: 'display:block;' });
                for (var g = 0; g <= 4; g++) {
                    var y = pt + ph - (ph * g / 4);
                    svg.appendChild(svgEl('line', { x1: pl, x2: W - pr, y1: y, y2: y, stroke: 'rgba(0,0,0,0.12)', 'stroke-width': 1 }));
                    var lbl = svgEl('text', { x: pl - 8, y: y + 4, 'text-anchor': 'end', style: AXIS_TEXT_STYLE });
                    lbl.textContent = axisRate(maxv * g / 4);
                    svg.appendChild(lbl);
                }
                var bw = pw / cols.length;
                cols.forEach(function(c, ci) {
                    var acc = 0;
                    series.forEach(function(k) {
                        var vv = c.v[k] || 0;
                        if (vv <= 0) return;
                        var h = ph * vv / maxv, y = pt + ph - ph * (acc + vv) / maxv;
                        var name = k === '__rest' ? _('Other (%d)').format(rest.length) : (st.dim === 'd' ? (names[k] || k) : k);
                        var r = svgEl('rect', { x: pl + ci * bw + bw * 0.1, y: y, width: Math.max(bw * 0.8, 1), height: Math.max(h, 0.5), fill: k === '__rest' ? 'hsl(210,8%,62%)' : colorOf(k) });
                        var t = svgEl('title', {});
                        t.textContent = hhmm(c.b.t) + '  ' + name + ': ' + formatRate(vv * 1e6);
                        r.appendChild(t);
                        svg.appendChild(r);
                        acc += vv;
                    });
                });
                var ticks = [0, Math.floor((cols.length - 1) / 2), cols.length - 1];
                ticks.forEach(function(ci, n) {
                    if (n > 0 && ci === ticks[n - 1]) return;
                    var tx = svgEl('text', { x: pl + ci * bw + bw / 2, y: H - 9, 'text-anchor': n === 0 ? 'start' : (n === ticks.length - 1 ? 'end' : 'middle'), style: AXIS_TEXT_STYLE });
                    tx.textContent = hhmm(cols[ci].b.t);
                    svg.appendChild(tx);
                });
                chartHost.appendChild(svg);

                var legend = E('div', { style: 'display:flex; flex-wrap:wrap; gap:4px 18px; justify-content:center; margin-top:8px; font-size:11.5px;' });
                shown.forEach(function(k) {
                    var name = st.dim === 'd' ? (names[k] || k) : k;
                    legend.appendChild(E('span', {}, [
                        E('span', { style: 'display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:5px; background:' + colorOf(k) + ';' }), name + ' (' + formatBytes(totals[k]) + ')' ]));
                });
                if (rest.length) legend.appendChild(E('span', {}, [
                    E('span', { style: 'display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:5px; background:hsl(210,8%,62%);' }), _('Other (%d)').format(rest.length) ]));
                chartHost.appendChild(legend);
                chartHost.appendChild(E('div', { style: 'text-align:center; font-size:10.5px; color:var(--main-bright-color); margin-top:6px;' },
                    _('Average rate per 5 minute bucket, last 24 h (kept in RAM by the aggregator, lost on reboot).')));
            }
            v.render = render;
            var resizeTimer = null;
            window.addEventListener('resize', function() {
                if (!v.active) return;
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(render, 150);
            });
            v.load = function() {
                v.loadedAt = Date.now();
                return callHistory(1).then(function(d) {
                    st.buckets = (d && d.buckets) ? d.buckets : [];
                    render();
                }).catch(function() {});
            };
            mark();
            render();
            return v;
        }

        var flowsView = makeFlowsView();
        var histView = makeHistoryView();

        var shaperEl = E('div', { style: 'font-size:11.5px; color:var(--secondary-dark-color); margin:0 0 12px; line-height:1.55; font-variant-numeric: tabular-nums;' });
        var prevShaper = { rx: null, tx: null };

        var l2El = E('div', { id: 'qos_l2diag', style: 'font-size:11.5px; color:var(--secondary-dark-color); margin:-6px 0 12px; line-height:1.55; font-variant-numeric: tabular-nums;' });
        function l2Update(r) {
            while (l2El.firstChild) l2El.removeChild(l2El.firstChild);
            if (!r || r.l2 === undefined || !r.tc) return;
            var how = r.l2_mode === 2 ? _('measured, %d windows').format(r.l2_n || 0)
                    : r.l2_mode === 1 ? _('default while measuring: %d of %d windows').format(r.l2_n || 0, r.l2_min || 0)
                    : _('fixed');
            l2El.appendChild(E('span', { title: _('Bytes per packet that the shaper counts but conntrack does not (link layer header). They are subtracted before "Not attributed" is computed.') },
                _('Link header: %d B/packet (%s)').format(r.l2, how)));
            var extra = (r.l2_mode === 2) ? (r.l2_raw || 0) - r.l2 : 0;
            if (extra >= 3)
                l2El.appendChild(E('span', { style: 'color:var(--danger-color); margin-left:10px;' },
                    _('⚠ measured %.1f B/packet: about %.0f B/packet more than a link header - traffic that conntrack does not see is probably present (shown as "Not attributed")').format(r.l2_raw, extra)));
        }
        function shaperUpdate(sh, dt) {
            while (shaperEl.firstChild) shaperEl.removeChild(shaperEl.firstChild);
            [ ['rx', _('Download shaper')], ['tx', _('Upload shaper')] ].forEach(function(def) {
                var cur = sh && sh[def[0]], prev = prevShaper[def[0]];
                if (!cur || cur.sent === undefined) return;
                var dr = prev ? Math.max(0, (cur.dropped || 0) - (prev.dropped || 0)) / dt : 0;
                var er = prev ? Math.max(0, (cur.ecn || 0) - (prev.ecn || 0)) / dt : 0;
                var pct = cur.pkts > 0 ? (cur.dropped / cur.pkts * 100) : 0;
                var line = E('div', { title: _('Drops are normal codel behaviour under load. "Limit hits" > 0 mean the queue limit was exceeded (limit too small for the link speed).') },
                    def[1] + ' (' + (cur.rate || '?') + ', target ' + (cur.target || '?') + ', limit ' + (cur.limit || '?') + '): ' +
                    _('drops') + ' ' + dr.toFixed(1) + '/s (' + formatCount(cur.dropped || 0) + ' ' + _('total') + ', ' + pct.toFixed(3) + ' %) · ECN ' + er.toFixed(1) + '/s (' + formatCount(cur.ecn || 0) + ') · ' +
                    _('backlog') + ' ' + formatBytes(cur.backlog_b || 0) + ' / ' + (cur.backlog_p || 0) + ' pkt · ' +
                    _('limit hits') + ' ' + (cur.drop_overlimit || 0) + ' · ' + _('active flows') + ' ' + ((cur.flows_new || 0) + (cur.flows_old || 0)));
                if ((cur.drop_overlimit || 0) > 0 && prev && cur.drop_overlimit > (prev.drop_overlimit || 0)) line.style.color = 'var(--danger-color)';
                shaperEl.appendChild(line);
            });
            ['rx', 'tx'].forEach(function(d) { prevShaper[d] = (sh && sh[d] && sh[d].sent !== undefined) ? sh[d] : null; });
        }

        var lastData = null;
        function stamp() {
            var d = new Date(), p = function(n) { return (n < 10 ? '0' : '') + n; };
            return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
        }
        function saveFile(name, mime, text) {
            var url = URL.createObjectURL(new Blob([ text ], { type: mime }));
            var a = E('a', { href: url, download: name });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        }
        function csvLine(cells) {
            return cells.map(function(c) { return '"' + String(c === undefined || c === null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
        }
        function exportCsv() {
            if (!lastData) return;
            var d = lastData, lines = [ csvLine([ 'view', 'name', 'in_bytes', 'out_bytes', 'in_packets', 'out_packets', 'in_bytes_per_s', 'out_bytes_per_s' ]) ];
            var block = function(view, obj, labelFn) {
                Object.keys(obj || {}).forEach(function(k) {
                    var e = obj[k];
                    lines.push(csvLine([ view, labelFn ? labelFn(k, e) : k, e.in_bytes, e.out_bytes, e.in_packets, e.out_packets, e.in_bps, e.out_bps ]));
                });
            };
            block('application', d.apps);
            block('device', d.devices, function(k, e) { return (e.name || k) + (e.ip ? ' (' + e.ip + ')' : ''); });
            block('destination', d.hosts);
            lines.push('');
            lines.push(csvLine([ 'busiest_flows', 'device', 'application', 'destination', 'port', 'proto', 'in_bytes_per_s', 'out_bytes_per_s', 'volume_bytes' ]));
            (d.top_flows || []).forEach(function(f) {
                lines.push(csvLine([ 'flow', f.dev, f.app, f.host || f.dst, f.port, f.proto, f.in_bps, f.out_bps, f.bytes ]));
            });
            saveFile('trafficchart-' + stamp() + '.csv', 'text/csv', lines.join('\n') + '\n');
        }
        function exportJson() {
            if (!lastData) return;
            saveFile('trafficchart-' + stamp() + '.json', 'application/json', JSON.stringify(lastData, null, 2));
        }

        var statusEl = E('span', { style: 'color:var(--main-bright-color);' }, _('Querying conntrack via ubus...'));
        var staleEl = E('div', {
            style: 'display:none; color:var(--danger-color); font-size:11.5px; text-align:center; margin-bottom:8px;'
        }, '');

        var container = E('div', {
            id: 'qos_container',
            style: 'background: var(--table-background-color); border: 1px solid var(--main-bright-color); border-radius: .50em; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3); padding:28px 32px; max-width:1700px; margin:0 auto;'
        }, [ statusEl, staleEl ]);

        container.addEventListener('click', function(e) {
            if (e.target.closest && e.target.closest('.qos-seg, .qos-legend-row')) return;
            slotViews.forEach(function(sv) { sv.panelIn.clearPinned(); sv.panelOut.clearPinned(); });
        });

        var m = E('div', { class: 'cbi-map' }, [
            E('h2', {}, 'Live Traffic Chart'),
            E('div', { class: 'cbi-section' }, [ container ])
        ]);

        var chartMounted = false;
        function mountChartOnce(data) {
            if (chartMounted) return;
            container.innerHTML = '';
            
            container.style.position = 'relative';
            container.style.paddingBottom = '40px'; 
            
            var appPanels = E('div', { class: 'qos-panels', style: 'margin-bottom: 40px; display:none;' }, [ appsView.panelIn.el, appsView.panelOut.el ]);
            var devPanels = E('div', { class: 'qos-panels', style: 'margin-bottom: 40px; display:none;' }, [ devicesView.panelIn.el, devicesView.panelOut.el ]);
            var hostPanels = E('div', { class: 'qos-panels', style: 'margin-bottom: 40px; display:none;' }, [ hostsView.panelIn.el, hostsView.panelOut.el ]);
            var groups = [ appPanels, devPanels, hostPanels, flowsView.el, histView.el ];
            var tabDefs = [ ['qos_tab_apps', _('Applications')], ['qos_tab_devices', _('Devices')],
                            ['qos_tab_hosts', _('Destinations')], ['qos_tab_flows', _('Live flows')], ['qos_tab_history', _('History')] ];
            var tabBtns = [];
            function selectTab(idx) {
                tipHide();
                slotViews.forEach(function(sv) { sv.panelIn.clearPinned(); sv.panelOut.clearPinned(); });
                groups.forEach(function(g, i) { g.style.display = (i === idx) ? '' : 'none'; });
                tabBtns.forEach(function(li, i) { li.className = (i === idx) ? 'cbi-tab' : 'cbi-tab-disabled'; });
                histView.active = (idx === 4);
                if (idx === 4) histView.load();
            }
            tabDefs.forEach(function(d, i) {
                var a = E('a', { href: '#', id: d[0] }, d[1]);
                a.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); selectTab(i); });
                tabBtns.push(E('li', {}, a));
            });
            selectTab(0);
            var tabs = E('ul', { class: 'cbi-tabmenu', style: 'flex:1 1 auto;' }, tabBtns);
            var btnJson = E('button', { type: 'button', class: 'btn cbi-button', id: 'qos_export_json' }, _('Export JSON'));
            var btnCsv = E('button', { type: 'button', class: 'btn cbi-button', id: 'qos_export_csv' }, _('Export CSV'));
            btnJson.addEventListener('click', function(e) { e.stopPropagation(); exportJson(); });
            btnCsv.addEventListener('click', function(e) { e.stopPropagation(); exportCsv(); });
            var toolbar = E('div', { style: 'display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;' }, [
                tabs, E('div', { style: 'display:flex; gap:6px; margin-bottom:1em;' }, [ btnJson, btnCsv ]) ]);

            var hintText = _('* Note: rates are the mean of the last %d s, measured by the trafficchart-agg daemon on its own clock (bytes per application, device and destination from /proc/net/nf_conntrack, application names from netifyd). The link rate comes from the tc qdisc counters read in the same instant. "Not attributed" is what the shaper carries but conntrack does not count (after subtracting the link layer header): e.g. traffic to router services, dropped inbound packets, multicast.').format((data && data.rate && data.rate.win) || 0);
            if (data && data.backend === 'nss')
                hintText += ' ' + _('NSS hardware offload bypasses nftables for accelerated flows; conntrack byte counters keep advancing under offload, which is why they are used.');
            var hintEl = E('div', {
                style: 'position: bottom: 14px; left: 32px; margin-top: 40px; margin-left: 40px; margin-right: 40px; font-size: 11px; color: var(--main-bright-color); z-index: 10;'
            }, hintText);

            container.appendChild(staleEl);
            container.appendChild(shaperEl);
            container.appendChild(l2El);
            container.appendChild(toolbar);
            container.appendChild(appPanels);
            container.appendChild(devPanels);
            container.appendChild(hostPanels);
            container.appendChild(flowsView.el);
            container.appendChild(histView.el);
            container.appendChild(hintEl);
            chartMounted = true;
        }

        var lastTime = Date.now();
        var lastSrvUp = null;
        var haveRenderedOnce = false;
        var lastSuccessTime = Date.now();
        var consecutiveFailures = 0;

        function updateStaleIndicator() {
            if (!haveRenderedOnce) return;
            if (consecutiveFailures === 0) {
                staleEl.style.display = 'none';
                return;
            }
            var secsAgo = Math.round((Date.now() - lastSuccessTime) / 1000);
            staleEl.textContent = _('⚠ No update for %ds (last successful read: %s) - retrying automatically...')
                .format(secsAgo, new Date(lastSuccessTime).toLocaleTimeString());
            staleEl.style.display = 'block';
        }

        var baselineTime = null;
        function baselineLabelText() {
            return baselineTime ? (_('since %s').format(baselineTime.toLocaleString())) : _('since start');
        }
        var pollInFlight = false;

        var tabHidden = (typeof document.hidden === 'boolean') ? document.hidden : false;
        document.addEventListener('visibilitychange', function() { tabHidden = document.hidden; });

        poll.add(function() {
            if (tabHidden) return Promise.resolve();
            if (pollInFlight) return Promise.resolve();
            pollInFlight = true;

            if (histView.active && Date.now() - histView.loadedAt > 60000) histView.load();

            var watchdog = setTimeout(function() {
                pollInFlight = false;
            }, 8000);

            return callTrafficStats().then(function(data) {
                clearTimeout(watchdog);
                pollInFlight = false;
                if (!document.getElementById('qos_container')) return;

                if (data.error || !data.apps || !data.rate) {
                    consecutiveFailures++;
                    if (!haveRenderedOnce) {
                        statusEl.style.color = 'red';
                        statusEl.textContent = data && data.error
                            ? _('Error: %s').format(data.error)
                            : (data && data.apps ? _('Error: aggregator too old (no rate data) - update trafficchart-agg and restart the service')
                                                 : _('Error: No data received. Is the trafficchart service running (/etc/init.d/trafficchart start)?'));
                    } else {
                        updateStaleIndicator();
                    }
                    return;
                }

                var now = Date.now();
                var dt = (now - lastTime) / 1000;
                if (dt <= 0) dt = 1;

                var srvUp = (typeof data.up === 'number') ? data.up : null;
                if (haveRenderedOnce && srvUp !== null && lastSrvUp !== null && srvUp <= lastSrvUp && lastSrvUp - srvUp < 30) {
                    lastSuccessTime = Date.now();
                    consecutiveFailures = 0;
                    updateStaleIndicator();
                    return;
                }

                var rateInfo = data.rate;
                var ifaceRate = rateInfo.tc ? { rx: rateInfo.rx_bps || 0, tx: rateInfo.tx_bps || 0 } : null;
                var sqmDownloadKbit = data.sqm ? (data.sqm.download_kbit || 0) : 0;
                var sqmUploadKbit = data.sqm ? (data.sqm.upload_kbit || 0) : 0;

                lastTime = now;
                lastSrvUp = srvUp;
                if (!baselineTime) baselineTime = (data.since ? new Date(data.since * 1000) : new Date(now));

                lastSuccessTime = Date.now();
                consecutiveFailures = 0;
                updateStaleIndicator();

                flowsView.update(data.top_flows || [], sqmDownloadKbit, sqmUploadKbit);
                shaperUpdate(data.shaper, dt);
                l2Update(rateInfo);
                lastData = data;

                mountChartOnce(data);

                var baselineLabel = baselineLabelText();

                if (data.apps) appsView.render(data.apps, ifaceRate, sqmDownloadKbit, sqmUploadKbit, data.iface, baselineLabel, rateInfo);
                if (data.devices) devicesView.render(data.devices, ifaceRate, sqmDownloadKbit, sqmUploadKbit, data.iface, baselineLabel, rateInfo);
                if (data.hosts) hostsView.render(data.hosts, ifaceRate, sqmDownloadKbit, sqmUploadKbit, data.iface, baselineLabel, rateInfo);

                haveRenderedOnce = true;
            }).catch(function(err) {
                clearTimeout(watchdog);
                pollInFlight = false;
                consecutiveFailures++;
                if (haveRenderedOnce) updateStaleIndicator();
                throw err;
            });
        }, 2);

        return m;
    },
    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
