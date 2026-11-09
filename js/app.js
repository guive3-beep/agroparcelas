/* =========================================================================
   AgroParcelas · app.js
   Arranque, integración mapa <-> datos, autoguardado en el navegador y
   respaldo por archivo de texto. Sin claves, sin cuentas, sin permisos.
   ========================================================================= */
(function (global) {
  'use strict';
  var Geo = global.Geo, Store = global.Store, UI = global.UI;

  var LS_DATA = 'agroparcelas:data';

  var App = {
    selected: null,
    pendingRedraw: null,

    boot: function () {
      Store.onChange(function (data, reason) {
        App.persistLocal();
        UI.renderAll();
        if (global.MapMod && MapMod.ready) MapMod.render();
        if (reason && reason !== 'init') App.flashSaved();
      });

      var restored = this.restoreLocal();
      if (!restored) Store.init(Store.nuevoProyecto('Mi proyecto agrícola'));
      document.getElementById('project-name').value = Store.data.nombre || 'Mi proyecto agrícola';

      this.bindGlobal();
      this.initMap();
      UI.renderAll();
    },

    initMap: function () {
      try {
        MapMod.init(document.getElementById('map'), {
          nextColor: function () {
            return Store.PALETTE[Store.data.subparcelas.length % Store.PALETTE.length];
          },
          callbacks: {
            onSelectSub: function (id) { App.select({ kind: 'sub', id: id }); },
            onSelectTree: function (id) { App.select({ kind: 'arbol', id: id }); },
            onMapClick: function () { if (MapMod.mode === 'idle') App.select(null); },
            onDrawComplete: function (kind, pts) { App.onDrawComplete(kind, pts); },
            onMeasure: function (res) { App.showMeasure(res); },
            onPlaceTree: function (pos) { App.onPlaceTree(pos); },
            onGeometryDragEnd: function (kind, id) {
              Store.setGeometria(kind, id, kind === 'terreno'
                ? Store.data.terreno.vertices : (Store.getSub(id) || {}).vertices);
              UI.toast('Área recalculada: ' + Geo.areaFull(kind === 'terreno'
                ? Geo.ringArea(Store.data.terreno.vertices)
                : Geo.ringArea((Store.getSub(id) || { vertices: [] }).vertices)));
            },
            onMoveTree: function (id, pos) { Store.updateArbol(id, { pos: pos }); },
            onModeChange: function (mode, kind) { App.reflectMode(mode, kind); },
            onDrawHint: function (txt) {
              var el = document.getElementById('mode-txt');
              if (el && MapMod.mode !== 'idle') el.textContent = kindLabel(MapMod.mode, MapMod.drawKind) + ' · ' + txt;
            },
            onError: function (m) { UI.toast(m, 'err'); }
          }
        });
        MapMod.render();
        if (Store.data.subparcelas.length || Store.data.arboles.length || Store.data.terreno.vertices.length) {
          setTimeout(function () { MapMod.fitAll(); }, 250);
        }
      } catch (e) {
        console.error(e);
        UI.toast('Error al inicializar el mapa: ' + e.message, 'err');
      }
    },

    select: function (sel, opts) {
      this.selected = sel;
      if (global.MapMod && MapMod.ready) {
        MapMod.select(sel ? sel.kind : null, sel ? sel.id : null);
        if (opts && opts.zoom && sel) {
          if (sel.kind === 'sub') MapMod.zoomToSub(sel.id);
          if (sel.kind === 'arbol') MapMod.zoomToTree(sel.id);
        }
      }
      UI.renderList();
      UI.renderDetail();
      this.openRightOnMobile();
    },

    reflectMode: function (mode, kind) {
      var bar = document.getElementById('mode-bar');
      var tools = document.querySelectorAll('.tool');
      tools.forEach(function (t) {
        t.classList.remove('is-active');
        var a = t.dataset.action;
        if (mode === 'draw' && a === 'draw-sub' && kind === 'sub') t.classList.add('is-active');
        if (mode === 'draw' && a === 'draw-terreno' && kind === 'terreno') t.classList.add('is-active');
        if (mode === 'measure' && a === 'measure') t.classList.add('is-active');
        if (mode === 'place-tree' && a === 'place-tree') t.classList.add('is-active');
      });
      if (mode === 'idle') {
        bar.hidden = true;
        UI.renderDetail();
      } else {
        bar.hidden = false;
        document.getElementById('mode-txt').textContent = 'Toque el mapa para dibujar';
        if (mode === 'place-tree') document.getElementById('mode-txt').textContent = 'Toque el mapa para ubicar el árbol';
        if (mode === 'measure') document.getElementById('mode-txt').textContent = 'Medición · clic para agregar vértices';
      }
    },

    onDrawComplete: function (kind, pts) {
      if (kind === 'terreno') {
        if (Store.data.terreno.vertices.length >= 3) {
          UI.confirm('Ya existe un terreno delimitado. ¿Desea reemplazarlo?', 'Reemplazar terreno', function () {
            Store.setGeometria('terreno', null, pts);
            UI.toast('Terreno actualizado: ' + Geo.areaFull(Geo.ringArea(pts)));
            if (global.MapMod) MapMod.fitAll();
          }, 'Reemplazar');
        } else {
          Store.setGeometria('terreno', null, pts);
          UI.toast('Terreno delimitado: ' + Geo.areaFull(Geo.ringArea(pts)));
          if (global.MapMod) MapMod.fitAll();
        }
        return;
      }
      if (this.pendingRedraw) {
        var id = this.pendingRedraw;
        this.pendingRedraw = null;
        Store.setGeometria('sub', id, pts);
        UI.toast('Límites actualizados: ' + Geo.areaFull(Geo.ringArea(pts)));
        this.select({ kind: 'sub', id: id });
        return;
      }
      global.Forms.subparcela(null, pts);
    },

    onPlaceTree: function (pos) {
      if (global.MapMod) { MapMod.setIdle(); }
      global.Forms.arbol(null, pos);
    },

    showMeasure: function (res) {
      var card = document.getElementById('measure-card');
      card.hidden = false;
      document.getElementById('m-area').textContent = Geo.areaFull(res.area);
      document.getElementById('m-per').textContent = Geo.nfmt(res.perimetro) + ' m';
      document.getElementById('m-vtx').textContent = res.vertices.length;
      if (global.MapMod) MapMod.setIdle();
      UI.toast('Superficie medida: ' + Geo.areaFull(res.area));
    },

    afterChange: function (reason, id, culId) {
      if (reason === 'new-sub' || reason === 'edit-sub') {
        this.select({ kind: 'sub', id: id });
        if (global.MapMod) MapMod.render();
      } else if (reason === 'new-cul' || reason === 'edit-cul') {
        this.select({ kind: 'sub', id: id });
        if (global.MapMod) MapMod.render();
      } else if (reason === 'new-arbol' || reason === 'edit-arbol') {
        this.select({ kind: 'arbol', id: id });
        if (global.MapMod) { MapMod.render(); MapMod.zoomToTree(id); }
      }
      UI.toast('Cambios guardados en este navegador.');
    },

    flashSaved: function () {
      var el = document.getElementById('save-state');
      el.textContent = '✓ Guardado en este navegador · ' + new Date().toLocaleTimeString('es-AR');
      el.className = 'save-state show ok';
      clearTimeout(this._flashT);
      this._flashT = setTimeout(function () { el.classList.remove('show'); }, 2000);
    },

    actions: {
      'draw-sub': function () { App.pendingRedraw = null; MapMod.startDraw('sub'); },
      'draw-terreno': function () { MapMod.startDraw('terreno'); },
      'place-tree': function () { MapMod.startPlaceTree(); },
      'measure': function () { MapMod.startMeasure(); },
      'fit': function () { MapMod.fitAll(); },
      'locate': function () { MapMod.useMyLocation(); },
      'finish-draw': function () { MapMod.finishDraw(); },
      'cancel-draw': function () { MapMod.cancelDraw(); },
      'close-measure': function () { document.getElementById('measure-card').hidden = true; },

      'edit-sub': function () {
        var s = App.selected && Store.getSub(App.selected.id);
        if (s) Forms.subparcela(s);
      },
      'del-sub': function () {
        var s = App.selected && Store.getSub(App.selected.id);
        if (!s) return;
        UI.confirm('Se eliminará <b>' + UI.esc(s.codigo || '') + '</b>' +
          (s.nombre ? ' (' + UI.esc(s.nombre) + ')' : '') + ' junto con sus ' + s.cultivos.length +
          ' cultivo(s). Esta acción no se puede deshacer.',
          'Eliminar subparcela', function () {
            Store.deleteSubparcela(s.id);
            App.select(null);
            UI.toast('Subparcela eliminada.');
          });
      },
      'zoom-sub': function () { MapMod.zoomToSub(App.selected.id); },
      'focus-sub': function () { MapMod.zoomToSub(App.selected.id); },
      'focus-terreno': function () { MapMod.zoomToTerreno(); },
      'edit-tree': function () {
        var a = App.selected && Store.getArbol(App.selected.id);
        if (a) Forms.arbol(a.id);
      },
      'del-tree': function () {
        var a = App.selected && Store.getArbol(App.selected.id);
        if (!a) return;
        UI.confirm('Se eliminará el árbol <b>' + UI.esc(a.nombre || a.especie) + '</b> del mapa.', 'Eliminar árbol', function () {
          Store.deleteArbol(a.id);
          App.select(null);
          UI.toast('Árbol eliminado.');
        });
      },
      'zoom-tree': function () { MapMod.zoomToTree(App.selected.id); }
    },

    handleAction: function (action) {
      var fn = App.actions[action];
      if (fn) { fn(); return true; }
      return false;
    },

    persistLocal: function () {
      try {
        localStorage.setItem(LS_DATA, JSON.stringify(Store.data));
        Store.dirty = false;
      } catch (e) {
        if (e && (/quota/i.test(e.name || '') || /quota/i.test(e.message || ''))) {
          UI.toast('El almacenamiento del navegador se llenó (suele pasar por muchas fotos). Descargue una copia y quite fotos antiguas.', 'err');
        }
      }
    },

    restoreLocal: function () {
      try {
        var raw = localStorage.getItem(LS_DATA);
        if (!raw) return false;
        Store.init(JSON.parse(raw));
        return true;
      } catch (e) { return false; }
    },

    bindGlobal: function () {
      var self = this;

      document.getElementById('btn-save').onclick = function () {
        Store.log('guardado', 'Copia de respaldo descargada');
        Files.download();
      };
      document.getElementById('btn-open-file').onclick = function () { Files.openDialog(); };
      document.getElementById('btn-open-file-2').onclick = function () { Files.openDialog(); };
      document.getElementById('file-open').addEventListener('change', function (e) {
        Files.load(e.target.files && e.target.files[0]);
      });
      document.getElementById('btn-dashboard').onclick = function () { Dashboard.open(); };
      document.getElementById('btn-kml').onclick = function () { Files.exportKML(); };
      document.getElementById('btn-xlsx').onclick = function () { Files.exportResumen(); };
      document.getElementById('btn-new').onclick = function () {
        UI.confirm('Se vaciará el proyecto actual (las parcelas, cultivos y árboles se borrarán). ' +
          'Si quiere conservarlos, descargue antes una copia con “Guardar copia”.',
          'Proyecto nuevo', function () {
            Store.init(Store.nuevoProyecto('Mi proyecto agrícola'));
            document.getElementById('project-name').value = Store.data.nombre;
            self.selected = null;
            if (global.MapMod && MapMod.ready) { MapMod.selected = null; MapMod.render(); }
            UI.renderAll();
            UI.toast('Proyecto nuevo iniciado.');
          }, 'Crear proyecto nuevo');
      };

      var nameInput = document.getElementById('project-name');
      nameInput.addEventListener('change', function () {
        var v = nameInput.value.trim() || 'Mi proyecto agrícola';
        nameInput.value = v;
        Store.data.nombre = v;
        Store._commit('Proyecto renombrado');
      });

      document.getElementById('search').addEventListener('input', function (e) {
        UI.searchTerm = e.target.value;
        UI.renderList();
      });

      var backdrop = document.getElementById('backdrop');
      function closeDrawers() {
        document.getElementById('panel-left').classList.remove('is-open');
        document.getElementById('panel-right').classList.remove('is-open');
        backdrop.hidden = true;
      }
      document.getElementById('btn-menu').onclick = function () {
        var open = document.getElementById('panel-left').classList.toggle('is-open');
        document.getElementById('panel-right').classList.remove('is-open');
        backdrop.hidden = !open;
      };
      document.getElementById('btn-panel-right').onclick = function () {
        var open = document.getElementById('panel-right').classList.toggle('is-open');
        document.getElementById('panel-left').classList.remove('is-open');
        backdrop.hidden = !open;
      };
      backdrop.onclick = closeDrawers;
      document.querySelectorAll('[data-close-panel]').forEach(function (b) { b.onclick = closeDrawers; });
      this.closeDrawers = closeDrawers;

      document.addEventListener('click', function (e) {
        var tool = e.target.closest('.tool');
        if (tool) { self.handleAction(tool.dataset.action); return; }
        var act = e.target.closest('[data-action]');
        if (act && !act.classList.contains('tool')) { self.handleAction(act.dataset.action); return; }

        var item = e.target.closest('.item');
        if (item) {
          if (item.dataset.kind === 'sub') self.select({ kind: 'sub', id: item.dataset.id }, { zoom: false });
          else if (item.dataset.kind === 'arbol') self.select({ kind: 'arbol', id: item.dataset.id }, { zoom: true });
          else if (item.dataset.kind === 'cul') {
            self.select({ kind: 'sub', id: item.dataset.sub });
            var c = Store.getCultivo(item.dataset.sub, item.dataset.id);
            if (c) Forms.cultivo(item.dataset.sub, c.id);
          }
          return;
        }

        if (e.target.closest('[data-add-cul]')) {
          var sub = self.selected && Store.getSub(self.selected.id);
          if (sub) Forms.cultivo(sub.id);
          return;
        }
        var culCard = e.target.closest('[data-cul]');
        if (culCard && self.selected) { Forms.cultivo(self.selected.id, culCard.dataset.cul); return; }

        if (e.target.closest('[data-redraw]') && self.selected) {
          self.pendingRedraw = self.selected.id;
          MapMod.startDraw('sub');
          return;
        }
        if (e.target.closest('[data-copy-coords]')) {
          var s2 = self.selected && Store.getSub(self.selected.id);
          if (!s2) return;
          var txt = s2.vertices.map(function (v) { return v.lat.toFixed(7) + ',' + v.lng.toFixed(7); }).join('\n');
          navigator.clipboard.writeText(txt).then(function () { UI.toast('Coordenadas copiadas.'); })
            .catch(function () { UI.toast('No se pudo copiar.', 'err'); });
          return;
        }
        if (e.target.closest('[data-draw-terreno]')) { self.handleAction('draw-terreno'); return; }

        var photo = e.target.closest('#detail img[data-photo]');
        if (photo && photo.src && photo.src.indexOf('data:') === 0) {
          UI.openModal({
            title: 'Fotografía', body: '<img src="' + photo.src + '" style="width:100%;border-radius:10px">',
            submitLabel: ''
          });
        }
      });

      document.querySelectorAll('.tab').forEach(function (t) {
        t.onclick = function () {
          document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('is-active'); });
          t.classList.add('is-active');
          UI.activeTab = t.dataset.tab;
          UI.renderList();
        };
      });

      var lg = document.getElementById('legend');
      document.getElementById('legend-toggle').onclick = function () {
        var open = lg.dataset.open === '1';
        lg.dataset.open = open ? '0' : '1';
        this.setAttribute('aria-expanded', String(!open));
      };

      document.querySelectorAll('[data-close-modal]').forEach(function (b) { b.onclick = function () { UI.closeModal(false); }; });
      document.querySelectorAll('[data-close-confirm]').forEach(function (b) {
        b.onclick = function () {
          document.getElementById('confirm-root').hidden = true;
          document.body.classList.remove('modal-open');
        };
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          var mr = document.getElementById('modal-root');
          if (!mr.hidden) { UI.closeModal(false); return; }
          var cr = document.getElementById('confirm-root');
          if (!cr.hidden) { cr.hidden = true; document.body.classList.remove('modal-open'); return; }
          if (MapMod.mode !== 'idle') MapMod.cancelDraw();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          Files.download();
        }
      });

      window.addEventListener('beforeunload', function () {
        try { localStorage.setItem(LS_DATA, JSON.stringify(Store.data)); } catch (err) { }
      });
    },

    openRightOnMobile: function () {
      if (window.innerWidth > 900) return;
      document.getElementById('panel-right').classList.add('is-open');
      document.getElementById('panel-left').classList.remove('is-open');
      document.getElementById('backdrop').hidden = false;
    },

    loadDemoData: function () {
      var c = CONFIG.CENTER;
      function ring(cx, cy, r, n) {
        var pts = [];
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2;
          var rr = r * (0.78 + 0.32 * ((i * 37) % 11) / 10);
          pts.push({
            lat: cx + Math.sin(a) * rr,
            lng: cy + Math.cos(a) * rr / Math.cos(cx * Math.PI / 180)
          });
        }
        return pts;
      }
      var d = Store.nuevoProyecto('Finca demostración');
      d.terreno.vertices = ring(c.lat, c.lng, 0.00042, 6);
      Store.init(d);

      var a = Store.addSubparcela({ codigo: 'SP-01', nombre: 'Lote norte', vertices: ring(c.lat + 0.00019, c.lng - 0.00017, 0.00013, 5), color: '#2e7d32' });
      var b = Store.addSubparcela({ codigo: 'SP-02', nombre: 'Lote central', vertices: ring(c.lat - 0.00003, c.lng + 0.00012, 0.00011, 4), color: '#1565c0' });
      var e = Store.addSubparcela({ codigo: 'SP-03', nombre: 'Lote sur', vertices: ring(c.lat - 0.00023, c.lng - 0.00009, 0.00012, 6), color: '#c62828' });

      Store.addCultivo(a.id, { nombre: 'Tomate', variedad: 'Roma', fechaPlantacion: '2026-08-12', fechaSiembra: '2026-08-12', fechaCosecha: '2026-12-30', cantidad: 480, unidad: 'plantas', areaM2: 210, distPlantas: '0,4 m', distSurcos: '0,8 m', estado: 'producción', observaciones: 'Riego por goteo, tutorado en V.' });
      Store.addCultivo(a.id, { nombre: 'Albahaca', variedad: 'Genovesa', fechaPlantacion: '2026-09-02', fechaSiembra: '2026-09-02', cantidad: 120, unidad: 'plantas', areaM2: 60, estado: 'crecimiento', enfermedad: 'Mildiu', severidad: 'leve', detalles: 'Fungicida preventivo cada 10 días.' });
      Store.addCultivo(b.id, { nombre: 'Lechuga', variedad: 'Mantecosa', fechaPlantacion: '2026-10-05', fechaSiembra: '2026-10-05', fechaCosecha: '2027-01-05', cantidad: 900, unidad: 'plantas', areaM2: 180, distPlantas: '0,25 m', distSurcos: '0,35 m', estado: 'sembrado' });
      Store.addCultivo(e.id, { nombre: 'Maíz', variedad: 'Dekalb', fechaPlantacion: '2026-07-20', fechaSiembra: '2026-07-20', cantidad: 1400, unidad: 'semillas', areaM2: 320, estado: 'crecimiento' });

      Store.addArbol({ nombre: 'Olivo 1', especie: 'Olivo', variedad: 'Arbequina', categoria: 'olivo', fechaPlantacion: '2018-03-15', cantidad: 1, estado: 'en producción', etiqueta: { forma: 'circle', color: '#e53935' }, pos: { lat: c.lat + 0.00031, lng: c.lng + 0.00021 } });
      Store.addArbol({ nombre: 'Limonero 1', especie: 'Limonero', variedad: 'Eureka', categoria: 'cítrico', fechaPlantacion: '2021-09-01', cantidad: 1, estado: 'sano', etiqueta: { forma: 'triangle', color: '#fdd835' }, pos: { lat: c.lat + 0.00030, lng: c.lng + 0.00029 } });
      Store.addArbol({ nombre: 'Nogales portón', especie: 'Nogal', variedad: 'Franquette', categoria: 'frutal', fechaPlantacion: '2015-06-10', cantidad: 3, estado: 'en producción', etiqueta: { forma: 'star', color: '#1e88e5' }, pos: { lat: c.lat - 0.00031, lng: c.lng + 0.00034 } });

      this.select({ kind: 'sub', id: a.id });
      UI.toast('Datos de ejemplo cargados. ¡Empiece a explorar!');
    }
  };

  function kindLabel(mode, kind) {
    if (mode === 'measure') return 'Midiendo';
    if (mode === 'place-tree') return 'Colocando árbol';
    return kind === 'terreno' ? 'Delimitando terreno' : 'Dibujando subparcela';
  }

  global.App = App;
  document.addEventListener('DOMContentLoaded', function () { App.boot(); });
})(window);
