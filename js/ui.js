/* =========================================================================
   AgroParcelas · ui.js
   Render del explorador, panel de detalle, KPIs, leyenda, modales y avisos.
   ========================================================================= */
(function (global) {
  'use strict';
  var Geo = global.Geo, Store = global.Store;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var treeDataUrl = global.treeDataUrl || function () { return ''; };

  function toast(msg, type) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 300);
    }, type === 'err' ? 6000 : 3600);
  }

  var modalResolve = null;

  function openModal(opts) {
    var root = document.getElementById('modal-root');
    var modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = opts.title || '';
    document.getElementById('modal-body').innerHTML = opts.body || '';
    modal.className = 'modal' + (opts.size === 'lg' ? ' modal-lg' : opts.size === 'sm' ? ' modal-sm' : '');

    var foot = document.getElementById('modal-foot');
    foot.innerHTML = '';
    if (opts.footExtra) {
      var tmp = document.createElement('div');
      tmp.innerHTML = opts.footExtra;
      while (tmp.firstChild) foot.appendChild(tmp.firstChild);
    }
    if (opts.submitLabel !== '') {
      var cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.textContent = 'Cancelar';
      cancel.onclick = function () { closeModal(false); };
      foot.appendChild(cancel);
      if (opts.submitLabel) {
        var ok = document.createElement('button');
        ok.className = 'btn btn-primary';
        ok.textContent = opts.submitLabel;
        ok.onclick = function () {
          if (typeof opts.onSubmit === 'function') {
            var r = opts.onSubmit(document.getElementById('modal-body'), root);
            if (r === false) return;
          }
          closeModal(true);
        };
        foot.appendChild(ok);
      }
    } else {
      var close = document.createElement('button');
      close.className = 'btn btn-primary';
      close.textContent = 'Cerrar';
      close.onclick = function () { closeModal(false); };
      foot.appendChild(close);
    }

    root.hidden = false;
    document.body.classList.add('modal-open');
    if (typeof opts.onMount === 'function') {
      try { opts.onMount(document.getElementById('modal-body'), root); } catch (e) { console.error(e); }
    }
    var first = document.querySelector('#modal-body input:not([readonly]), #modal-body select, #modal-body textarea');
    if (first) setTimeout(function () { first.focus(); }, 80);

    return new Promise(function (resolve) { modalResolve = resolve; });
  }

  function closeModal(result) {
    var root = document.getElementById('modal-root');
    root.hidden = true;
    document.body.classList.remove('modal-open');
    if (modalResolve) { var r = modalResolve; modalResolve = null; r(!!result); }
  }

  function confirm(msg, title, onOk, okLabel) {
    var root = document.getElementById('confirm-root');
    document.getElementById('confirm-title').textContent = title || 'Confirmar';
    document.getElementById('confirm-msg').innerHTML = msg;
    var ok = document.getElementById('confirm-ok');
    ok.textContent = okLabel || 'Eliminar';
    ok.onclick = function () {
      root.hidden = true;
      document.body.classList.remove('modal-open');
      onOk();
    };
    root.hidden = false;
    document.body.classList.add('modal-open');
  }

  function renderKpis() {
    var st = Store.stats();
    var items = [
      ['Superficie', Geo.nfmt(Geo.ha(st.areaTotal), 2), 'ha'],
      ['Parcelas', st.subparcelas, ''],
      ['Cultivos', st.cultivos, ''],
      ['Plantas', Geo.nfmt(st.plantas), ''],
      ['Árboles', st.arboles, ''],
      ['Cultivado', Geo.nfmt(st.cultivada), 'm²'],
      ['Disponible', Geo.nfmt(st.disponible), 'm²'],
      ['Ocupación', Geo.nfmt(st.ocupacion, 1), '%']
    ];
    var host = document.getElementById('kpis');
    if (host) host.innerHTML = items.map(function (k) {
      return '<div class="kpi"><small>' + k[0] + '</small><b>' + k[1] + (k[2] ? ' <span>' + k[2] + '</span>' : '') + '</b></div>';
    }).join('');
  }

  var activeTab = 'subparcelas';
  var searchTerm = '';

  function matchSub(s) {
    if (!searchTerm) return true;
    var hay = [s.codigo, s.nombre, s.notas].join(' ').toLowerCase();
    if (hay.indexOf(searchTerm) >= 0) return true;
    return s.cultivos.some(function (c) {
      return [c.nombre, c.variedad, c.observaciones, c.estado, c.enfermedad].join(' ').toLowerCase().indexOf(searchTerm) >= 0;
    });
  }
  function matchArbol(a) {
    if (!searchTerm) return true;
    return [a.nombre, a.especie, a.variedad, a.categoria, a.estado, a.observaciones].join(' ').toLowerCase().indexOf(searchTerm) >= 0;
  }
  function matchCultivoOnly(c) {
    if (!searchTerm) return false;
    return [c.nombre, c.variedad, c.enfermedad].join(' ').toLowerCase().indexOf(searchTerm) >= 0;
  }

  function emptyBlock(t, s) {
    return '<div class="empty"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
      '<div><b>' + esc(t) + '</b></div><div>' + esc(s) + '</div></div>';
  }

  function renderList() {
    var host = document.getElementById('list');

    document.getElementById('c-sub').textContent = Store.data.subparcelas.length;
    document.getElementById('c-cul').textContent = Store.data.subparcelas.reduce(function (t, s) { return t + s.cultivos.length; }, 0);
    document.getElementById('c-arb').textContent = Store.data.arboles.length;

    if (activeTab === 'subparcelas') {
      var subs = Store.data.subparcelas.filter(matchSub);
      if (!Store.data.subparcelas.length) {
        host.innerHTML = emptyBlock('Aún no hay subparcelas', 'Use “Subparcela” y dibuje el primer polígono sobre el mapa satelital.');
        return;
      }
      if (!subs.length) { host.innerHTML = emptyBlock('Sin resultados', 'Ninguna subparcela coincide con la búsqueda.'); return; }
      host.innerHTML = subs.map(function (s) {
        var area = Geo.ringArea(s.vertices);
        var sel = App.selected && App.selected.kind === 'sub' && App.selected.id === s.id;
        var cultivosTxt = s.cultivos.length
          ? s.cultivos.map(function (c) { return c.nombre; }).slice(0, 3).join(' · ')
          : 'sin cultivos';
        return '<div class="item' + (sel ? ' is-active' : '') + '" data-kind="sub" data-id="' + s.id + '">' +
          '<span class="item-dot" style="background:' + s.color + '"></span>' +
          '<div class="item-body"><div class="item-title"><span class="code">' + esc(s.codigo || '—') + '</span>' +
          (s.nombre ? esc(s.nombre) : '') + '</div>' +
          '<div class="item-sub">' + esc(cultivosTxt) + '</div>' +
          '<div class="item-meta"><span class="chip">' + Geo.areaShort(area) + '</span>' +
          (s.cultivos.length ? '<span class="chip">' + s.cultivos.length + ' cultivo' + (s.cultivos.length > 1 ? 's' : '') + '</span>' : '') +
          '</div></div></div>';
      }).join('');
    } else if (activeTab === 'cultivos') {
      var filtros = (global.Dashboard && Dashboard.filtros) || { cultivo: '', estado: '', sub: '', desde: '', hasta: '' };
      var rows = [];
      Store.data.subparcelas.forEach(function (s) {
        s.cultivos.forEach(function (c) {
          if (!matchSub(s) && !matchCultivoOnly(c)) return;
          if (filtros.sub && s.id !== filtros.sub) return;
          if (filtros.estado && c.estado !== filtros.estado) return;
          if (filtros.cultivo && [c.nombre, c.variedad, c.enfermedad].join(' ').toLowerCase().indexOf(filtros.cultivo.toLowerCase()) < 0) return;
          if (filtros.desde && (!c.fechaPlantacion || c.fechaPlantacion < filtros.desde)) return;
          if (filtros.hasta && (!c.fechaPlantacion || c.fechaPlantacion > filtros.hasta)) return;
          rows.push({ s: s, c: c });
        });
      });
      if (!rows.length) { host.innerHTML = emptyBlock('Sin cultivos registrados', 'Seleccione una subparcela y use “Añadir cultivo”.'); return; }
      host.innerHTML = rows.map(function (r) {
        var col = Store.ESTADO_COLOR[r.c.estado] || '#757575';
        return '<div class="item" data-kind="cul" data-sub="' + r.s.id + '" data-id="' + r.c.id + '">' +
          '<span class="item-dot" style="background:' + col + '"></span>' +
          '<div class="item-body"><div class="item-title">' + esc(r.c.nombre) + '</div>' +
          '<div class="item-sub">' + esc(r.s.codigo || '') + (r.c.variedad ? ' · ' + esc(r.c.variedad) : '') + '</div>' +
          '<div class="item-meta"><span class="chip state" style="background:' + col + '">' + esc(r.c.estado) + '</span>' +
          (r.c.cantidad ? '<span class="chip">' + Geo.nfmt(r.c.cantidad) + ' ' + esc(r.c.unidad || '') + '</span>' : '') +
          (r.c.areaM2 ? '<span class="chip">' + Geo.areaShort(r.c.areaM2) + '</span>' : '') +
          (r.c.enfermedad ? '<span class="chip" style="color:#c62828">⚠ ' + esc(r.c.enfermedad) + '</span>' : '') +
          '</div></div></div>';
      }).join('');
    } else {
      var arboles = Store.data.arboles.filter(matchArbol);
      if (!Store.data.arboles.length) { host.innerHTML = emptyBlock('Sin árboles', 'Use “Árbol” y toque el mapa para ubicarlo.'); return; }
      if (!arboles.length) { host.innerHTML = emptyBlock('Sin resultados', 'Ningún árbol coincide con la búsqueda.'); return; }
      host.innerHTML = arboles.map(function (a) {
        var sel = App.selected && App.selected.kind === 'arbol' && App.selected.id === a.id;
        return '<div class="item' + (sel ? ' is-active' : '') + '" data-kind="arbol" data-id="' + a.id + '">' +
          '<span class="item-ico"><img alt="" width="22" height="29" src="' + treeDataUrl(a) + '"></span>' +
          '<div class="item-body"><div class="item-title">' + esc(a.nombre || a.especie) + '</div>' +
          '<div class="item-sub">' + esc(a.especie || '') + (a.variedad ? ' · ' + esc(a.variedad) : '') + ' · ' + esc(Geo.age(a.fechaPlantacion).text) + '</div>' +
          '<div class="item-meta"><span class="chip state" style="background:' + (Store.ESTADO_COLOR[a.estado] || '#757575') + '">' + esc(a.estado) + '</span>' +
          (a.cantidad > 1 ? '<span class="chip">' + a.cantidad + ' ejemplares</span>' : '') + '</div></div></div>';
      }).join('');
    }
  }

  function renderLegend() {
    var body = document.getElementById('legend-body');
    if (!body) return;
    var subs = Store.data.subparcelas;
    var html = '';
    if (subs.length) {
      html += '<div class="legend-sub">Subparcelas</div>' + subs.map(function (s) {
        return '<div class="legend-row"><i style="background:' + s.color + '"></i>' +
          esc((s.codigo || '') + (s.nombre ? ' · ' + s.nombre : '')) + '</div>';
      }).join('');
    }
    var cats = {};
    Store.data.arboles.forEach(function (a) { cats[a.categoria] = (cats[a.categoria] || 0) + 1; });
    if (Object.keys(cats).length) {
      html += '<div class="legend-sub">Árboles</div>' + Object.keys(cats).map(function (k) {
        return '<div class="legend-row"><i style="background:' + ((global.CAT_COLOR || {})[k] || '#6d4c41') + '"></i>' +
          esc(k) + ' · ' + cats[k] + '</div>';
      }).join('');
    }
    body.innerHTML = html || '<div class="legend-row muted">Sin elementos aún</div>';
  }

  function iconBtn(action, label, path, cls) {
    return '<button class="icon-btn ' + (cls || '') + '" data-action="' + action + '" title="' + label + '" aria-label="' + label + '">' +
      '<svg viewBox="0 0 24 24" width="16" height="16"><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  }
  function metric(label, value, unit) {
    return '<div class="metric"><small>' + label + '</small><b>' + value + ' <em>' + unit + '</em></b></div>';
  }
  function quick(action, label) {
    var icons = {
      'draw-sub': 'M4 17 8 5l7 3 5-2-3 12-8-1-5-4Z',
      'draw-terreno': 'M3 6h18v12H3z',
      'place-tree': 'M12 21v-5M6 9a6 6 0 1112 0 6 6 0 01-12 0z',
      'measure': 'M3 15h18M7 15v-3m5 3v-4m5 4v-3'
    };
    return '<button class="quick" data-action="' + action + '">' +
      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="' + icons[action] + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>' +
      label + '</button>';
  }

  function photosHtml(fotos) {
    if (!fotos || !fotos.length) {
      return '<p class="muted" style="font-size:12px;margin:0">Sin fotografías. Añádalas desde “Editar”.</p>';
    }
    return '<div class="photo-grid">' + fotos.map(function (src, i) {
      return '<img alt="foto" src="' + src + '" data-i="' + i + '">';
    }).join('') + '</div>';
  }

  function renderDetail() {
    var host = document.getElementById('detail');
    var title = document.getElementById('right-title');
    var sel = App.selected;

    if (!sel) {
      title.textContent = 'Detalle';
      var st = Store.stats();
      host.innerHTML =
        '<div class="detail-empty">' +
        '<h4>Seleccione un elemento</h4>' +
        '<p>Haga clic sobre una subparcela, un cultivo o un árbol para ver y editar sus datos.</p>' +
        '<div class="quick-grid">' +
        quick('draw-sub', 'Nueva parcela') +
        quick('draw-terreno', 'Delimitar terreno') +
        quick('place-tree', 'Colocar árbol') +
        quick('measure', 'Medir área') +
        '</div>' +
        '<div class="home-card"><h5>Resumen del terreno</h5>' +
        '<dl class="kv"><dt>Superficie</dt><dd>' + Geo.nfmt(st.areaTotal) + ' m² · ' + Geo.nfmt(Geo.ha(st.areaTotal), 3) + ' ha</dd>' +
        '<dt>Parcelas</dt><dd>' + st.subparcelas + '</dd>' +
        '<dt>Cultivado</dt><dd>' + Geo.nfmt(st.cultivada) + ' m²</dd>' +
        '<dt>Disponible</dt><dd>' + Geo.nfmt(st.disponible) + ' m²</dd>' +
        '<dt>Ocupación</dt><dd>' + Geo.nfmt(st.ocupacion, 1) + ' %</dd>' +
        '</dl><div class="bar' + (st.ocupacion > 100 ? ' over' : st.ocupacion > 85 ? ' warn' : '') + '">' +
        '<span style="width:' + Math.min(100, st.ocupacion) + '%"></span></div></div>' +
        '<p class="muted" style="font-size:11.5px">Última modificación: ' +
        (Store.data.actualizado ? new Date(Store.data.actualizado).toLocaleString('es-AR') : '—') + '</p>' +
        '</div>';
      return;
    }

    if (sel.kind === 'sub') {
      var s = Store.getSub(sel.id);
      if (!s) { App.select(null); return; }
      title.textContent = 'Subparcela';
      var area = Geo.ringArea(s.vertices);
      var asignado = s.cultivos.reduce(function (t, c) { return t + (Number(c.areaM2) || 0); }, 0);
      var ocup = area > 0 ? (asignado / area) * 100 : 0;
      var plantas = s.cultivos.reduce(function (t, c) { return t + (Number(c.cantidad) || 0); }, 0);

      host.innerHTML =
        '<div class="d-head"><span class="d-swatch" style="background:' + s.color + '"></span>' +
        '<div class="d-head-txt"><div class="d-code">' + esc(s.codigo || '—') + '</div>' +
        '<div class="d-title">' + esc(s.nombre || 'Subparcela') + '</div></div>' +
        '<div class="d-actions">' +
        iconBtn('zoom-sub', 'Centrar en el mapa', 'M21 21l-4.3-4.3M11 17a6 6 0 100-12 6 6 0 000 12z') +
        iconBtn('edit-sub', 'Editar datos', 'M4 20h4l10-10-4-4L4 16v4zm12-14 2-2 4 4-2 2') +
        iconBtn('del-sub', 'Eliminar', 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13', 'danger') +
        '</div></div>' +

        '<div class="metrics">' +
        metric('Superficie', Geo.nfmt(area), 'm² · ' + Geo.nfmt(Geo.ha(area), 3) + ' ha') +
        metric('Cultivos', s.cultivos.length, 'registrados') +
        metric('Plantas', Geo.nfmt(plantas), 'en total') +
        metric('Ocupado', Geo.nfmt(asignado), 'm² asignados') +
        '</div>' +
        '<div class="bar' + (ocup > 100 ? ' over' : ocup > 92 ? ' warn' : '') + '"><span style="width:' + Math.min(100, ocup) + '%"></span></div>' +
        '<div class="bar-legend"><span>Ocupación ' + Geo.nfmt(ocup, 1) + '%</span><span>Libre ' + Geo.nfmt(Math.max(0, area - asignado)) + ' m²</span></div>' +

        '<div class="sec-title">Cultivos <button class="btn btn-soft sm" data-add-cul>+ Añadir</button></div>' +
        (s.cultivos.length ? s.cultivos.map(function (c) {
          var col = Store.ESTADO_COLOR[c.estado] || '#757575';
          return '<div class="cul-card" data-cul="' + c.id + '">' +
            '<span class="cul-ico" style="background:' + col + '1f;color:' + col + '">' +
            '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 21V9M12 14c-3.3 0-5-1.9-5-4.6 3.3 0 5 1.9 5 4.6zM12 12c3.3 0 5-1.9 5-4.6-3.3 0-5 1.9-5 4.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>' +
            '<div style="flex:1;min-width:0"><div class="row-between"><div class="cul-t">' + esc(c.nombre) + '</div>' +
            '<span class="pill" style="background:' + col + '">' + esc(c.estado) + '</span></div>' +
            '<div class="cul-s">' + esc(c.variedad || 'sin variedad') + ' · ' + Geo.fmtDate(c.fechaPlantacion) + '</div>' +
            '<div class="item-meta" style="margin-top:4px">' +
            '<span class="chip">' + Geo.nfmt(c.cantidad) + ' ' + esc(c.unidad || '') + '</span>' +
            '<span class="chip">' + Geo.nfmt(c.areaM2) + ' m²</span>' +
            (c.distPlantas ? '<span class="chip">↔ ' + esc(c.distPlantas) + '</span>' : '') +
            '</div>' +
            ((c.fechaSiembra || c.fechaCosecha || c.enfermedad || c.tamano || (c.campos && c.campos.length)) ?
              '<div class="item-meta" style="margin-top:3px">' +
              (c.fechaSiembra ? '<span class="chip" title="Fecha de siembra">Siembra ' + Geo.fmtDate(c.fechaSiembra) + '</span>' : '') +
              (c.fechaCosecha ? '<span class="chip" title="Fecha de cosecha">Cosecha ' + Geo.fmtDate(c.fechaCosecha) + '</span>' : '') +
              (c.tamano ? '<span class="chip" title="Tamaño">📐 ' + esc(c.tamano) + '</span>' : '') +
              (c.enfermedad ? '<span class="chip" style="color:' + (c.severidad === 'grave' ? '#c62828' : '#7a4a08') + '" title="Enfermedad/plaga (' + esc(c.severidad || 'sin datos') + ')">⚠ ' + esc(c.enfermedad) + '</span>' : '') +
              ((c.campos || []).map(function (cp) {
                return '<span class="chip" title="Campo personalizado">' + esc(cp.etiqueta) + ': ' + esc(cp.valor) + '</span>';
              }).join('')) +
              '</div>' : '') +
            (c.fotos && c.fotos.length ? '<div class="photo-grid" style="margin-top:6px">' + c.fotos.slice(0, 3).map(function (src) {
              return '<img alt="foto" src="' + src + '">';
            }).join('') + '</div>' : '') +
            '</div></div>';
        }).join('') : '<p class="muted" style="font-size:12px;margin:0 0 6px">Sin cultivos registrados en esta parcela.</p>') +

        (s.notas ? '<div class="sec-title">Observaciones</div><div class="note-box">' + esc(s.notas) + '</div>' : '') +

        '<div class="sec-title">Geometría <button class="btn btn-ghost sm" data-redraw>Redibujar</button></div>' +
        '<p class="muted" style="font-size:11.5px;margin:0 0 6px">Arrastre los nodos blancos sobre el mapa para ajustar los límites; el área se recalcula automáticamente.</p>' +
        '<div class="vertex-list">' + (s.vertices.length
          ? s.vertices.map(function (v, i) {
            return '<div><span>V' + (i + 1) + '</span><span>' + v.lat.toFixed(6) + ', ' + v.lng.toFixed(6) + '</span></div>';
          }).join('')
          : '<div><span>—</span><span>sin vértices</span></div>') + '</div>' +
        '<div class="row mt12"><button class="btn btn-ghost sm" data-copy-coords>Copiar coordenadas</button>' +
        '<button class="btn btn-ghost sm" data-focus-sub>Ver en el mapa</button></div>';
      return;
    }

    if (sel.kind === 'arbol') {
      var a = Store.getArbol(sel.id);
      if (!a) { App.select(null); return; }
      title.textContent = 'Árbol';
      var edad = Geo.age(a.fechaPlantacion);
      host.innerHTML =
        '<div class="d-head"><span class="item-ico" style="width:38px;height:46px">' +
        '<img alt="" width="28" height="37" src="' + treeDataUrl(a) + '"></span>' +
        '<div class="d-head-txt"><div class="d-code">' + esc(a.categoria) + '</div>' +
        '<div class="d-title">' + esc(a.nombre || a.especie) + '</div></div>' +
        '<div class="d-actions">' +
        iconBtn('zoom-tree', 'Centrar', 'M21 21l-4.3-4.3M11 17a6 6 0 100-12 6 6 0 000 12z') +
        iconBtn('edit-tree', 'Editar', 'M4 20h4l10-10-4-4L4 16v4zm12-14 2-2 4 4-2 2') +
        iconBtn('del-tree', 'Eliminar', 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13', 'danger') +
        '</div></div>' +
        '<div class="metrics">' +
        metric('Edad', edad.years + (edad.years === 1 ? ' año' : ' años'), edad.text) +
        metric('Cantidad', Geo.nfmt(a.cantidad), 'ejemplar' + (a.cantidad > 1 ? 'es' : '')) +
        '</div>' +
        '<dl class="kv">' +
        '<dt>Especie</dt><dd>' + esc(a.especie || '—') + '</dd>' +
        '<dt>Variedad</dt><dd>' + esc(a.variedad || '—') + '</dd>' +
        '<dt>Plantación</dt><dd>' + Geo.fmtDate(a.fechaPlantacion) + '</dd>' +
        '<dt>Estado</dt><dd><span class="pill" style="background:' + (Store.ESTADO_COLOR[a.estado] || '#757575') + '">' + esc(a.estado) + '</span></dd>' +
        '<dt>Coordenadas</dt><dd>' + a.pos.lat.toFixed(6) + ', ' + a.pos.lng.toFixed(6) + '</dd>' +
        '</dl>' +
        (a.observaciones ? '<div class="sec-title">Observaciones</div><div class="note-box">' + esc(a.observaciones) + '</div>' : '') +
        '<div class="sec-title">Fotografías</div>' + photosHtml(a.fotos) +
        '<p class="muted" style="font-size:11.5px;margin-top:12px">También puede arrastrar el icono del árbol sobre el mapa para cambiar su ubicación.</p>';
      return;
    }

    if (sel.kind === 'terreno') {
      title.textContent = 'Terreno';
      var v = Store.data.terreno.vertices;
      var areaT = Geo.ringArea(v);
      var st2 = Store.stats();
      host.innerHTML =
        '<div class="d-head"><span class="d-swatch" style="background:#f9a825"></span>' +
        '<div class="d-head-txt"><div class="d-code">Terreno general</div>' +
        '<div class="d-title">' + esc(Store.data.terreno.nombre || 'Terreno') + '</div></div></div>' +
        '<div class="metrics">' +
        metric('Superficie', Geo.nfmt(areaT), 'm² · ' + Geo.nfmt(Geo.ha(areaT), 3) + ' ha') +
        metric('Perímetro', Geo.nfmt(Geo.perimeter(v)), 'metros') +
        '</div>' +
        (v.length >= 3
          ? '<div class="bar"><span style="width:' + Math.min(100, st2.ocupacion) + '%"></span></div>' +
          '<div class="bar-legend"><span>Cultivado ' + Geo.nfmt(st2.cultivada) + ' m²</span><span>Libre ' + Geo.nfmt(st2.disponible) + ' m²</span></div>'
          : '<div class="note-box">Aún no ha delimitado el terreno general.</div>') +
        '<div class="row mt12"><button class="btn btn-primary sm" data-draw-terreno>Delimitar terreno</button>' +
        '<button class="btn btn-ghost sm" data-focus-terreno>Ver en el mapa</button></div>' +
        '<div class="sec-title">Vértices</div>' +
        '<div class="vertex-list">' + (v.length ? v.map(function (p, i) {
          return '<div><span>V' + (i + 1) + '</span><span>' + p.lat.toFixed(6) + ', ' + p.lng.toFixed(6) + '</span></div>';
        }).join('') : '<div><span>—</span><span>sin vértices</span></div>') + '</div>';
      return;
    }
  }

  function renderAll() {
    renderKpis();
    renderList();
    renderDetail();
    renderLegend();
  }

  global.UI = {
    esc: esc, toast: toast, openModal: openModal, closeModal: closeModal, confirm: confirm,
    renderKpis: renderKpis, renderList: renderList, renderDetail: renderDetail,
    renderLegend: renderLegend, renderAll: renderAll,
    get searchTerm() { return searchTerm; },
    set searchTerm(v) { searchTerm = (v || '').toLowerCase().trim(); },
    get activeTab() { return activeTab; },
    set activeTab(v) { activeTab = v; }
  };
})(window);
