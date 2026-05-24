(function () {
  'use strict';

  var jwt = localStorage.getItem('jwt');
  if (!jwt) { window.location.replace('/graphql/'); return; }

  document.getElementById('logout-btn').addEventListener('click', function () {
    localStorage.removeItem('jwt');
    window.location.replace('/graphql/');
  });

  (async function init() {
    try {
      var data = await fetchAllData();
      var user = data.user && data.user[0];

      if (!user) throw new Error('No user data returned.');

      var projects = (data.projects || []).filter(function (p) {
        if (!p.path) return false;

        var path = p.path.toLowerCase();

        return (
          path.startsWith('/bahrain/bh-module') &&
          !path.includes('piscine') &&
          !path.includes('onboarding') &&
          !path.includes('exam')
        );
      });

      render(user, projects);

    } catch (err) {
      document.getElementById('loading').classList.add('hidden');
      var errEl = document.getElementById('load-error');
      errEl.classList.remove('hidden');
      document.getElementById('load-error-msg').textContent =
        'Failed to load profile: ' + err.message;
    }
  })();

  function render(user, projects) {

    var level = user.level && user.level[0] ? user.level[0].amount : 0;

    /* =========================
       XP FILTERED TRANSACTIONS
    ========================== */
    var xpTransactions = (user.transactions || []).filter(function (t) {
      if (!t.type || t.type.toLowerCase() !== 'xp') return false;
      if (!t.path) return false;

      var path = t.path.toLowerCase();

      return (
        path.startsWith('/bahrain/bh-module') &&
        !path.includes('piscine') &&
        !path.includes('onboarding') &&
        !path.includes('exam')
      );
    });

    xpTransactions.sort(function (a, b) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    /* =========================
       XP CALCULATION 
    ========================== */
    var xpMap = {};
    xpTransactions.forEach(function (t) {
      if (!xpMap[t.path] || t.amount > xpMap[t.path]) {
        xpMap[t.path] = t.amount;
      }
    });

    var totalXP = Object.values(xpMap).reduce(function (a, b) {
      return a + b;
    }, 0);

    /* =========================
       AUDIT 
    ========================== */
    var auditUp = 0;
    var auditDown = 0;

    xpTransactions.forEach(function (t) {
      if (t.type === 'up') auditUp += t.amount || 0;
      if (t.type === 'down') auditDown += t.amount || 0;
    });

    var ratio = auditDown > 0 ? (auditUp / auditDown).toFixed(2) : 'N/A';

    /* =========================
       PASS / FAIL PROJECTS
    ========================== */
    var passCount = 0;
    var failCount = 0;

    var seen = {};

    projects.forEach(function (p) {
      if (!p.path || seen[p.path]) return;
      seen[p.path] = true;

      if (p.isDone === true) passCount++;
      else failCount++;
    });

    /* =========================
       DOM
    ========================== */
    document.getElementById('header-login').textContent = user.login;
    document.getElementById('user-login').textContent = user.login;
    document.getElementById('user-id').textContent = 'ID: ' + user.id;
    document.getElementById('avatar-char').textContent = user.login[0].toUpperCase();
    document.getElementById('user-level').textContent = level;

    document.getElementById('total-xp').textContent = fmtXP(totalXP);
    document.getElementById('audit-ratio').textContent = ratio;
    document.getElementById('xp-up').textContent = fmtXP(auditUp);
    document.getElementById('xp-down').textContent = fmtXP(auditDown);

    document.getElementById('projects-passed').textContent = passCount;
    document.getElementById('projects-failed').textContent = failCount;

    /* =========================
       GRAPH DATA (ALREADY FILTERED)
    ========================== */
    drawXPTimeline(xpTransactions);
    drawPassFailDonut(passCount, failCount);
    drawAuditBars(auditUp, auditDown);

    var projectBars = Object.keys(xpMap)
      .map(function (path) {
        return {
          name: path.split('/').pop(),
          xp: xpMap[path],
          path: path
        };
      });

    drawProjectsList(projectBars);

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('profile-content').classList.remove('hidden');
  }

  function fmtXP(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + ' MB';
    if (n >= 1000) return (n / 1000).toFixed(1) + ' kB';
    return n + ' B';
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      e.setAttribute(k, attrs[k]);
    });
    return e;
  }

  function makeSVG(w, h) {
    return svgEl('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      height: h,
      style: 'display:block; overflow:visible'
    });
  }

  var tooltip = null;
  function getTooltip() {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'graph-tooltip';
      tooltip.style.opacity = '0';
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function showTip(html, x, y) {
    var t = getTooltip();
    if (html) t.innerHTML = html;
    t.style.left = (x + 14) + 'px';
    t.style.top = (y - 10) + 'px';
    t.style.opacity = '1';
  }

  function hideTip() {
    getTooltip().style.opacity = '0';
  }


  // Graph 1: XP Over Time
  function drawXPTimeline(txns) {
    var wrap = document.getElementById('xp-timeline-chart');
    if (!txns || txns.length === 0) {
      wrap.innerHTML = '<p class="mono muted" style="font-size:.75rem">No XP data.</p>';
      return;
    }

    var W = 560, H = 220;
    var PAD = { top: 20, right: 20, bottom: 40, left: 60 };
    var cW = W - PAD.left - PAD.right;
    var cH = H - PAD.top  - PAD.bottom;

    var cumulative = 0;
    var points = txns.map(function (t) {
      cumulative += t.amount;
      return { date: new Date(t.createdAt), xp: cumulative, raw: t.amount, path: t.path };
    });

    var minDate = points[0].date.getTime();
    var maxDate = points[points.length - 1].date.getTime();
    var maxXP   = points[points.length - 1].xp;

    function xScale(d) {
      return PAD.left + ((d.getTime() - minDate) / (maxDate - minDate || 1)) * cW;
    }
    function yScale(xp) {
      return PAD.top + cH - (xp / maxXP) * cH;
    }

    var svg = makeSVG(W, H);

    for (var i = 0; i <= 4; i++) {
      var yv = PAD.top + (cH / 4) * i;
      svg.appendChild(svgEl('line', {
        x1: PAD.left, y1: yv, x2: PAD.left + cW, y2: yv,
        stroke: '#1e1e2e', 'stroke-width': 1
      }));
      var lbl = svgEl('text', {
        x: PAD.left - 6, y: yv + 4, fill: '#555570', 'font-size': 10,
        'text-anchor': 'end', 'font-family': 'Space Mono, monospace'
      });
      lbl.textContent = fmtXP(Math.round(maxXP - (maxXP / 4) * i));
      svg.appendChild(lbl);
    }

    var areaPath = 'M ' + xScale(points[0].date) + ' ' + (PAD.top + cH);
    points.forEach(function (p) { areaPath += ' L ' + xScale(p.date) + ' ' + yScale(p.xp); });
    areaPath += ' L ' + xScale(points[points.length - 1].date) + ' ' + (PAD.top + cH) + ' Z';
    svg.appendChild(svgEl('path', { d: areaPath, fill: 'rgba(0,255,136,.06)', stroke: 'none' }));

    var linePath = '';
    points.forEach(function (p, i) {
      linePath += (i === 0 ? 'M ' : ' L ') + xScale(p.date) + ' ' + yScale(p.xp);
    });
    svg.appendChild(svgEl('path', {
      d: linePath, fill: 'none', stroke: '#00ff88',
      'stroke-width': 2, 'stroke-linejoin': 'round'
    }));

    var labelStep = Math.max(1, Math.floor(points.length / Math.min(6, points.length)));
    for (var j = 0; j < points.length; j += labelStep) {
      var xl = svgEl('text', {
        x: xScale(points[j].date), y: PAD.top + cH + 20,
        fill: '#555570', 'font-size': 9,
        'text-anchor': 'middle', 'font-family': 'Space Mono, monospace'
      });
      xl.textContent = points[j].date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      svg.appendChild(xl);
    }

    var stride = Math.max(1, Math.floor(points.length / 60));
    for (var k = 0; k < points.length; k += stride) {
      (function (pt) {
        var dot = svgEl('circle', {
          cx: xScale(pt.date), cy: yScale(pt.xp), r: 5,
          fill: 'transparent', style: 'cursor:crosshair'
        });
        dot.addEventListener('mouseenter', function (ev) {
          showTip(
            '<b>' + pt.date.toLocaleDateString() + '</b><br>' +
            'Cumulative: ' + fmtXP(pt.xp) + '<br>' +
            '+' + fmtXP(pt.raw) + ' — ' + (pt.path ? pt.path.split('/').pop() : ''),
            ev.clientX, ev.clientY
          );
        });
        dot.addEventListener('mousemove', function (ev) { showTip(null, ev.clientX, ev.clientY); });
        dot.addEventListener('mouseleave', hideTip);
        svg.appendChild(dot);
      })(points[k]);
    }

    wrap.innerHTML = '';
    wrap.appendChild(svg);
  }

  // Graph 2: Pass/Fail Donut
  function drawPassFailDonut(passed, failed) {
    var wrap = document.getElementById('pass-fail-chart');
    var total = passed + failed;
    if (total === 0) {
      wrap.innerHTML = '<p class="mono muted" style="font-size:.75rem">No result data.</p>';
      return;
    }

    var W = 200, H = 200, R = 70, r = 45, cx = 100, cy = 100;

    function polarToXY(angle, radius) {
      return {
        x: cx + radius * Math.cos(angle - Math.PI / 2),
        y: cy + radius * Math.sin(angle - Math.PI / 2)
      };
    }
    function arcPath(s, e, oR, iR) {
      var s1 = polarToXY(s, oR), e1 = polarToXY(e, oR);
      var s2 = polarToXY(e, iR), e2 = polarToXY(s, iR);
      var la = (e - s) > Math.PI ? 1 : 0;
      return ['M',s1.x,s1.y,'A',oR,oR,0,la,1,e1.x,e1.y,'L',s2.x,s2.y,'A',iR,iR,0,la,0,e2.x,e2.y,'Z'].join(' ');
    }

    var svg = makeSVG(W, H);
    var passAngle = (passed / total) * 2 * Math.PI;

    var passArc = svgEl('path', { d: arcPath(0, passAngle, R, r), fill: '#00ff88', opacity: 0.9, style: 'cursor:pointer' });
    passArc.addEventListener('mouseenter', function (ev) {
      showTip('<b>PASSED</b>: ' + passed + ' (' + Math.round(passed/total*100) + '%)', ev.clientX, ev.clientY);
    });
    passArc.addEventListener('mouseleave', hideTip);
    svg.appendChild(passArc);

    if (failed > 0) {
      var failArc = svgEl('path', { d: arcPath(passAngle, 2*Math.PI, R, r), fill: '#ff4d4d', opacity: 0.9, style: 'cursor:pointer' });
      failArc.addEventListener('mouseenter', function (ev) {
        showTip('<b>FAILED</b>: ' + failed + ' (' + Math.round(failed/total*100) + '%)', ev.clientX, ev.clientY);
      });
      failArc.addEventListener('mouseleave', hideTip);
      svg.appendChild(failArc);
    }

    var ct = svgEl('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', fill: '#e8e8f0', 'font-size': 22, 'font-weight': 700, 'font-family': 'Space Mono, monospace' });
    ct.textContent = Math.round(passed / total * 100) + '%';
    svg.appendChild(ct);

    var cs = svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', fill: '#555570', 'font-size': 10, 'font-family': 'Space Mono, monospace' });
    cs.textContent = 'PASS RATE';
    svg.appendChild(cs);

    [{ label: 'PASS', color: '#00ff88', count: passed }, { label: 'FAIL', color: '#ff4d4d', count: failed }].forEach(function (item, i) {
      var gy = H - 28 + i * 14;
      svg.appendChild(svgEl('rect', { x: 20, y: gy - 8, width: 8, height: 8, fill: item.color }));
      var lt = svgEl('text', { x: 34, y: gy, fill: '#888', 'font-size': 9, 'font-family': 'Space Mono, monospace' });
      lt.textContent = item.label + ' ' + item.count;
      svg.appendChild(lt);
    });

    wrap.innerHTML = '';
    wrap.appendChild(svg);
  }

  // Graph 3: Audit Bars
  function drawAuditBars(up, down) {
    var wrap = document.getElementById('audit-chart');
    var W = 200, H = 200, svg = makeSVG(W, H);
    var maxVal = Math.max(up, down, 1);
    var barH = 28, barMaxW = 130, startX = 55;

    [up, down].forEach(function (val, i) {
      var barW = (val / maxVal) * barMaxW;
      var y = 60 + i * 60;
      var color = i === 0 ? '#00ff88' : '#7c3aed';
      var label = i === 0 ? 'GIVEN' : 'RECEIVED';

      var lbl = svgEl('text', { x: startX - 6, y: y + barH/2 + 4, fill: '#555570', 'font-size': 9, 'text-anchor': 'end', 'font-family': 'Space Mono, monospace' });
      lbl.textContent = label;
      svg.appendChild(lbl);

      svg.appendChild(svgEl('rect', { x: startX, y: y, width: barMaxW, height: barH, fill: '#1e1e2e' }));

      var bar = svgEl('rect', { x: startX, y: y, width: 0, height: barH, fill: color, opacity: 0.9 });
      svg.appendChild(bar);
      setTimeout(function () {
        bar.style.transition = 'width .8s cubic-bezier(.4,0,.2,1)';
        bar.setAttribute('width', barW);
      }, 100 + i * 100);

      var vl = svgEl('text', { x: startX + barMaxW + 6, y: y + barH/2 + 4, fill: color, 'font-size': 9, 'font-family': 'Space Mono, monospace' });
      vl.textContent = fmtXP(val);
      svg.appendChild(vl);
    });

    var ratio = down > 0 ? (up / down).toFixed(2) : 'N/A';
    var ratioColor = parseFloat(ratio) >= 1 ? '#00ff88' : '#ff4d4d';
    var rt = svgEl('text', { x: W/2, y: 30, 'text-anchor': 'middle', fill: ratioColor, 'font-size': 28, 'font-weight': 700, 'font-family': 'Space Mono, monospace' });
    rt.textContent = ratio;
    svg.appendChild(rt);

    var rs = svgEl('text', { x: W/2, y: 44, 'text-anchor': 'middle', fill: '#555570', 'font-size': 9, 'font-family': 'Space Mono, monospace' });
    rs.textContent = 'AUDIT RATIO';
    svg.appendChild(rs);

    wrap.innerHTML = '';
    wrap.appendChild(svg);
  }

  // Projects List
  function drawProjectsList(projectBars) {
    var container = document.getElementById('projects-list');

    var sorted = projectBars
      .filter(function (p) { return p.xp > 0; })
      .sort(function (a, b) { return b.xp - a.xp; })
      .slice(0, 10);

    if (sorted.length === 0) {
      container.innerHTML = '<p class="mono muted" style="font-size:.75rem">No project data.</p>';
      return;
    }

    var maxXP = sorted[0].xp;
    container.innerHTML = '';

    sorted.forEach(function (proj) {
      var row = document.createElement('div');
      row.className = 'project-row';

      var nameEl = document.createElement('span');
      nameEl.className = 'project-name';
      nameEl.textContent = proj.name;

      var barWrap = document.createElement('div');
      barWrap.className = 'project-bar-wrap';
      var bar = document.createElement('div');
      bar.className = 'project-bar';
      bar.style.width = '0%';
      barWrap.appendChild(bar);

      var xpEl = document.createElement('span');
      xpEl.className = 'project-xp';
      xpEl.textContent = fmtXP(proj.xp);

      row.appendChild(nameEl);
      row.appendChild(barWrap);
      row.appendChild(xpEl);
      container.appendChild(row);

      setTimeout(function () {
        bar.style.width = Math.round((proj.xp / maxXP) * 100) + '%';
      }, 80);
    });
  }

})();