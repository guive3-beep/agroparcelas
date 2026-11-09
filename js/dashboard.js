/* =========================================================================
   AgroParcelas · dashboard.js
   Panel de control: indicadores, filtros, tabla resumen y exportaciones
   (XLSX/CSV + KML).
   ========================================================================= */
(function (global) {
  'use strict';
  var Geo = global.Geo, Store = global.Store, UI = global.UI;

  var filtros = { cultivo: '', desde: '', hasta: '', estado: '', sub: '', especie: '' };

  function coincideCultivo(c, sub, f) {
    if (f.sub && sub.id !== f.sub) return false;
    if (f.estado && c.estado !== f.estado) return false;
    if (f.cultivo && c.nombre.toLowerCase().indexOf(f.cultivo.toLowerCase()) < 0 &&
      (c.variedad || '').toLowerCase().indexOf(f.cultivo.toLowerCase()) < 0) return false;
    if (f.desde && (!c.fechaPlantacion || c.fechaPlantacion < f.desde)) return false;
    if (f.hasta && (!c.fechaPlantacion || c.fechaPlantacion > f.hasta)) return false;
    return true;
  }
  function coincideArbol(a, f) {
    if (f.especie && (a.especie + ' ' + (a.variedad || '')).toLowerCase().indexOf(f.especie.toLowerCase()) < 0) return false;
    if (f.desde && a.fechaPlantacion && a.fechaPlantacion < f.desde) return false;
    if (f.hasta && a.fechaPlantacion && a.fechaPlantacion > f.hasta) return false;
    if (f.estado && a.estado !== f.estado) return false;
    return true;
  }

  function kpi(label, value, unit) {
    return '<div class="dash-kpi"><small>' + label + '</small><b>' + value + ' <em>' + unit + '</em></b></div>';
  }
  function q(v) {
    var s = String(v == null ? '' : v).replace(/"/g, '""');
    return /[;"\n]/.test(s) ? '"' + s + '"' : s;
  }

  function open() {
    var st = Store.stats();

    var subOpts = [{ v: '', t: 'Todas' }].concat(Store.data.subparcelas.map(function (s) {
      return { v: s.id, t: (s.codigo || '') + (s.nombre ? ' · ' + s.nombre : '') };
    }));
    var estados = [{ v: '', t: 'Todos' }].concat(Store.ESTADOS_CULTIVO.map(function (e) { return { v: e, t: e }; }));
    var especies = {};
    Store.data.arboles.forEach(function (a) { especies[a.especie] = 1; });

    var html =
      '<div class="dash-kpis" id="dash-kpis"></div>' +
      '<div class="dash-filters">' +
      '<label class="field"><span>Cultivo</span><input id="f-cultivo" placeholder="Nombre o variedad" value="' + UI.esc(filtros.cultivo) + '"></label>' +
      '<label class="field"><span>Subparcela</span><select id="f-sub">' +
      subOpts.map(function (o) { return '<option value="' + UI.esc(o.v) + '"' + (o.v === filtros.sub ? ' selected' : '') + '>' + UI.esc(o.t) + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="field"><span>Estado</span><select id="f-estado">' +
      estados.map(function (o) { return '<option value="' + UI.esc(o.v) + '"' + (o.v === filtros.estado ? ' selected' : '') + '>' + UI.esc(o.t) + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="field"><span>Plantado desde</span><input type="date" id="f-desde" value="' + filtros.desde + '"></label>' +
      '<label class="field"><span>Plantado hasta</span><input type="date" id="f-hasta" value="' + filtros.hasta + '"></label>' +
      '<label class="field"><span>Especie de árbol</span><select id="f-especie"><option value="">Todas</option>' +
      Object.keys(especies).map(function (e) { return '<option value="' + UI.esc(e) + '"' + (e === filtros.especie ? ' selected' : '') + '>' + UI.esc(e) + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="field" style="justify-content:flex-end"><button class="btn btn-ghost sm" id="f-clear">Limpiar filtros</button></div>' +
      '</div>' +
      '<div id="dash-table"></div>' +
      '<div class="sec-title" style="margin-top:18px">Árboles registrados <span id="arb-count" class="chip"></span></div>' +
      '<div id="dash-trees"></div>';

    UI.openModal({
      title: 'Panel de control',
      body: html,
      size: 'lg',
      submitLabel: '',
      footExtra:
        '<button class="btn btn-soft" id="f-xlsx" title="Resumen de cultivos y árboles en Excel (o CSV si no está disponible)">Resumen Excel/CSV</button>' +
        '<button class="btn btn-soft" id="f-kml" title="Abrir en Google Earth o importar en Google My Maps">Exportar mapa a KML</button>' +
        '<button class="btn btn-ghost grow" id="f-csv" style="margin-right:auto" title="Solo CSV de cultivos y árboles">CSV simple</button>',
      onMount: function (root) {
        function read() {
          filtros.cultivo = root.querySelector('#f-cultivo').value.trim();
          filtros.sub = root.querySelector('#f-sub').value;
          filtros.estado = root.querySelector('#f-estado').value;
          filtros.desde = root.querySelector('#f-desde').value;
          filtros.hasta = root.querySelector('#f-hasta').value;
          filtros.especie = root.querySelector('#f-especie').value;
          paint(root);
        }
        ['#f-cultivo', '#f-sub', '#f-estado', '#f-desde', '#f-hasta', '#f-especie'].forEach(function (sel) {
          var el = root.querySelector(sel);
          el.addEventListener('input', read);
          el.addEventListener('change', read);
        });
        root.querySelector('#f-clear').onclick = function () {
          filtros = { cultivo: '', desde: '', hasta: '', estado: '', sub: '', especie: '' };
          ['#f-cultivo', '#f-sub', '#f-estado', '#f-desde', '#f-hasta', '#f-especie'].forEach(function (s2) {
            root.querySelector(s2).value = '';
          });
          paint(root);
        };
        var xlsxBtn = document.getElementById('f-xlsx');
        if (xlsxBtn) xlsxBtn.onclick = function () { Files.exportResumen(); };
        var kmlBtn = document.getElementById('f-kml');
        if (kmlBtn) kmlBtn.onclick = function () { Files.exportKML(); };
        var csvBtn = document.getElementById('f-csv');
        if (csvBtn) csvBtn.onclick = function () { csv(); };
        paint(root);
      },
      onSubmit: function () { return true; }
    });

    function paint(root) {
      var rows = [];
      Store.data.subparcelas.forEach(function (s) {
        var area = Geo.ringArea(s.vertices);
        if (!s.cultivos.length) {
          if (!filtros.cultivo && !filtros.estado && !filtros.desde && !filtros.hasta &&
            (!filtros.sub || filtros.sub === s.id)) {
            rows.push({ sub: s, cul: null, area: area });
          }
          return;
        }
        s.cultivos.forEach(function (c) {
          if (coincideCultivo(c, s, filtros)) rows.push({ sub: s, cul: c, area: area });
        });
      });

      var totArea = rows.reduce(function (t, r) { return t + r.area; }, 0);
      var totCulArea = rows.reduce(function (t, r) { return t + (r.cul ? Number(r.cul.areaM2) || 0 : 0); }, 0);
      var totPlantas = rows.reduce(function (t, r) { return t + (r.cul ? Number(r.cul.cantidad) || 0 : 0); }, 0);

      root.querySelector('#dash-kpis').innerHTML =
        kpi('Superficie total', Geo.nfmt(st.areaTotal), 'm² · ' + Geo.nfmt(Geo.ha(st.areaTotal), 2) + ' ha') +
        kpi('Subparcelas', st.subparcelas, 'registradas') +
        kpi('Cultivos', rows.filter(function (r) { return r.cul; }).length, 'en el filtro actual') +
        kpi('Plantas', Geo.nfmt(totPlantas), 'unidades') +
        kpi('Árboles', st.arboles, st.arbolesRegistros + ' puntos') +
        kpi('Superficie cultivada', Geo.nfmt(st.cultivada), 'm²') +
        kpi('Disponible', Geo.nfmt(st.disponible), 'm²') +
        kpi('Ocupación', Geo.nfmt(st.ocupacion, 1) + '%', 'del terreno');

      var table = rows.length ?
        '<div class="table-wrap"><table class="dt"><thead><tr>' +
        '<th>Subparcela</th><th>Cultivo</th><th>Variedad</th><th>Plantación</th><th>Siembra</th><th>Cosecha</th>' +
        '<th class="num">Cantidad</th><th class="num">Área cultivo</th><th class="num">Área parcela</th><th>Estado</th><th>Sanidad</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (r) {
          var c = r.cul;
          return '<tr><td><span class="sub-code" style="color:' + r.sub.color + '">' + UI.esc(r.sub.codigo || '—') + '</span>' +
            (r.sub.nombre ? '<div class="muted" style="font-size:10.5px">' + UI.esc(r.sub.nombre) + '</div>' : '') + '</td>' +
            '<td class="cul-name">' + (c ? UI.esc(c.nombre) : '<span class="muted">sin cultivo</span>') + '</td>' +
            '<td>' + (c ? UI.esc(c.variedad || '—') : '—') + '</td>' +
            '<td>' + (c ? Geo.fmtDate(c.fechaPlantacion) : '—') + '</td>' +
            '<td>' + (c && c.fechaSiembra ? Geo.fmtDate(c.fechaSiembra) : '—') + '</td>' +
            '<td>' + (c && c.fechaCosecha ? Geo.fmtDate(c.fechaCosecha) : '—') + '</td>' +
            '<td class="num">' + (c ? Geo.nfmt(c.cantidad) + ' <span class="muted">' + UI.esc(c.unidad || '') + '</span>' : '—') + '</td>' +
            '<td class="num">' + (c ? Geo.nfmt(c.areaM2) + ' m²' : '—') + '</td>' +
            '<td class="num">' + Geo.nfmt(r.area) + ' m²</td>' +
            '<td>' + (c ? '<span class="pill" style="background:' + (Store.ESTADO_COLOR[c.estado] || '#757575') + '">' + UI.esc(c.estado) + '</span>' : '—') + '</td>' +
            '<td>' + (c && c.enfermedad ? '⚠ ' + UI.esc(c.enfermedad) + ' <span class="muted">(' + UI.esc(c.severidad || 'sin datos') + ')</span>' : '—') + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr style="background:#f5f9f6;font-weight:700"><td colspan="6">Totales del filtro</td>' +
        '<td class="num">' + Geo.nfmt(totPlantas) + '</td>' +
        '<td class="num">' + Geo.nfmt(totCulArea) + ' m²</td>' +
        '<td class="num">' + Geo.nfmt(totArea) + ' m²</td><td colspan="2"></td></tr></tfoot></table></div>'
        : '<div class="empty">Ningún cultivo coincide con los filtros aplicados.</div>';
      root.querySelector('#dash-table').innerHTML = table;

      var arboles = Store.data.arboles.filter(function (a) { return coincideArbol(a, filtros); });
      root.querySelector('#arb-count').textContent = arboles.length;
      root.querySelector('#dash-trees').innerHTML = arboles.length ?
        '<div class="table-wrap"><table class="dt" style="min-width:560px"><thead><tr><th>Nombre</th><th>Especie</th><th>Variedad</th><th>Plantación</th><th>Edad</th><th class="num">Cant.</th><th>Estado</th></tr></thead><tbody>' +
        arboles.map(function (a) {
          return '<tr><td class="cul-name">' + UI.esc(a.nombre || a.especie) + '</td><td>' + UI.esc(a.especie || '—') + '</td><td>' + UI.esc(a.variedad || '—') + '</td>' +
            '<td>' + Geo.fmtDate(a.fechaPlantacion) + '</td><td>' + Geo.age(a.fechaPlantacion).text + '</td>' +
            '<td class="num">' + Geo.nfmt(a.cantidad) + '</td>' +
            '<td><span class="pill" style="background:' + (Store.ESTADO_COLOR[a.estado] || '#757575') + '">' + UI.esc(a.estado) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty">No hay árboles registrados con esos filtros.</div>';
    }

    function csv() {
      var lines = [['Proyecto', 'Subparcela', 'Nombre', 'Cultivo', 'Variedad', 'Fecha plantación', 'Fecha siembra', 'Fecha cosecha', 'Cantidad', 'Unidad', 'Área cultivo m²', 'Área parcela m²', 'Estado', 'Enfermedad', 'Severidad', 'Observaciones'].join(';')];
      Store.data.subparcelas.forEach(function (s) {
        var area = Geo.ringArea(s.vertices);
        if (!s.cultivos.length) {
          lines.push([Store.data.nombre, s.codigo, s.nombre, '', '', '', '', '', '', '', '', Math.round(area), '', '', '', ''].map(q).join(';'));
        }
        s.cultivos.forEach(function (c) {
          if (filtros.sub && s.id !== filtros.sub) return;
          if (filtros.estado && c.estado !== filtros.estado) return;
          lines.push([Store.data.nombre, s.codigo, s.nombre, c.nombre, c.variedad, c.fechaPlantacion,
          c.fechaSiembra || '', c.fechaCosecha || '', c.cantidad, c.unidad, Math.round(c.areaM2), Math.round(area),
          c.estado, c.enfermedad || '', c.severidad || '', c.observaciones].map(q).join(';'));
        });
      });
      lines.push('');
      lines.push(['Árboles', 'Nombre', 'Especie', 'Variedad', 'Fecha plantación', 'Edad', 'Cantidad', 'Estado', 'Lat', 'Lng'].join(';'));
      Store.data.arboles.forEach(function (a) {
        lines.push(['', a.nombre || a.especie, a.especie, a.variedad, a.fechaPlantacion, Geo.age(a.fechaPlantacion).text,
        a.cantidad, a.estado, a.pos.lat.toFixed(6), a.pos.lng.toFixed(6)].map(q).join(';'));
      });
      Files._download('\uFEFF' + lines.join('\r\n'),
        'agroparcelas_' + Geo.slug(Store.data.nombre) + '_' + Geo.today() + '.csv', 'text/csv;charset=utf-8;');
      UI.toast('CSV generado.');
    }
  }

  global.Dashboard = { open: open, filtros: filtros };
})(window);
