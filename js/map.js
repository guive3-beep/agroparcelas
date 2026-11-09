/* =========================================================================
   AgroParcelas · map.js   (Leaflet — sin claves de API)
   Zoom profundo: las teselas satelitales se estiran más allá de su escala
   nativa (maxNativeZoom) en lugar de ponerse en blanco.
   Árboles con nombre etiquetado en el mapa y estilo de etiqueta
   (forma + color) elegido por el usuario.
   ========================================================================= */
(function (global) {
  'use strict';
  var Geo = global.Geo, Store = global.Store;

  var MAX_ZOOM = 25;            // zoom máximo de la interfaz (teselas estiradas)
  var CAT_COLOR = {
    frutal: '#2e7d32', 'cítrico': '#f9a825', olivo: '#7cb342', vid: '#8e24aa',
    forestal: '#1b5e20', palmera: '#00897b', otro: '#6d4c41'
  };

  function shapeSvg(shape, color) {
    if (!shape || shape === 'none') return '';
    var inner;
    if (shape === 'circle') inner = '<circle cx="7" cy="7" r="5.4" fill="' + color + '"/>';
    else if (shape === 'square') inner = '<rect x="1.8" y="1.8" width="10.4" height="10.4" rx="2" fill="' + color + '"/>';
    else if (shape === 'triangle') inner = '<path d="M7 1.4 13.2 12.6H.8Z" fill="' + color + '"/>';
    else if (shape === 'star') inner = '<path d="M7 .8 8.9 5.2 13.6 5.6 10.1 8.7 11.2 13.3 7 10.8 2.8 13.3 3.9 8.7.4 5.6 5.1 5.2Z" fill="' + color + '"/>';
    else return '';
    return '<svg width="14" height="14" viewBox="0 0 14 14" style="flex:0 0 auto">' + inner + '</svg>';
  }

  function treeSvg(color, forma, labelColor) {
    var badge = '';
    if (forma && forma !== 'none') {
      /* insignia de la forma elegida, abajo a la derecha del copete */
      var b;
      if (forma === 'circle') b = '<circle cx="20" cy="27" r="4.6" fill="' + labelColor + '" stroke="#fff" stroke-width="1.4"/>';
      else if (forma === 'square') b = '<rect x="15.6" y="22.6" width="9" height="9" rx="1.8" fill="' + labelColor + '" stroke="#fff" stroke-width="1.4"/>';
      else if (forma === 'triangle') b = '<path d="M20 21.8 25 30.4H15Z" fill="' + labelColor + '" stroke="#fff" stroke-width="1.4"/>';
      else if (forma === 'star') b = '<path d="M20 21.6 21.5 25.4 25.6 25.7 22.4 28.3 23.5 32.2 20 30 16.5 32.2 17.6 28.3 14.4 25.7 18.5 25.4Z" fill="' + labelColor + '" stroke="#fff" stroke-width="1.2"/>';
      else b = '';
      badge = b;
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">' +
      '<ellipse cx="13" cy="31.5" rx="5.5" ry="2" fill="rgba(0,0,0,.28)"/>' +
      '<rect x="11.5" y="17" width="3" height="12.5" rx="1.3" fill="#6d4c41"/>' +
      '<circle cx="13" cy="12" r="9.2" fill="' + color + '" stroke="#ffffff" stroke-width="1.8"/>' +
      '<circle cx="9.6" cy="9.6" r="3.1" fill="rgba(255,255,255,.28)"/>' +
      '<circle cx="16.4" cy="14.4" r="2.1" fill="rgba(0,0,0,.12)"/>' +
      badge + '</svg>';
  }

  function treeIcon(a) {
    var c = CAT_COLOR[a.categoria] || CAT_COLOR.otro;
    var et = a.etiqueta || {};
    return L.icon({
      iconUrl: 'data:image/svg+xml;charset=UTF-8,' +
        encodeURIComponent(treeSvg(c, et.forma, et.color || '#e53935')),
      iconSize: [26, 34], iconAnchor: [13, 32]
    });
  }

  function treeDataUrl(a) {
    var c = CAT_COLOR[a.categoria] || CAT_COLOR.otro;
    var et = a.etiqueta || {};
    return 'data:image/svg+xml;charset=UTF-8,' +
      encodeURIComponent(treeSvg(c, et.forma, et.color || '#e53935'));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var MapMod = {
    map: null, ready: false,
    mode: 'idle', drawKind: 'sub',
    drawPoints: [], drawMarkers: [], draftLine: null, draftShape: null,
    polygons: {}, handles: [], treeMarkers: {},
    terrenoPoly: null, selected: null, callbacks: {},
    layers: {},

    init: function (container, opts) {
      var self = this;
      var cfg = global.CONFIG || {};
      this.opts = opts || {};
      this.callbacks = this.opts.callbacks || {};

      /* Teselas: maxNativeZoom = última escala real del proveedor;
         maxZoom = zoom de interfaz (Leaflet estira la última tesela). */
      var esri = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: MAX_ZOOM, maxNativeZoom: 17, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' });
      var hib = L.layerGroup([
        esri,
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: MAX_ZOOM, maxNativeZoom: 18 })
      ]);
      var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: MAX_ZOOM, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
      this.layers = { esri: esri, hib: hib, osm: osm };

      this.map = L.map(container, {
        center: [cfg.CENTER.lat, cfg.CENTER.lng],
        zoom: cfg.ZOOM || 17,
        maxZoom: MAX_ZOOM,
        minZoom: 2,
        layers: [hib],
        zoomControl: true,
        doubleClickZoom: true,
        attributionControl: true
      });
	// Aquí comienza el código nuevo
      this.map.on('zoomend', () => {
    	console.log('ZOOM ACTUAL:', this.map.getZoom());
      });

      L.control.layers({
        'Satelital con etiquetas': hib, 'Satelital': esri, 'Mapa (calles)': osm
      }, null, { position: 'topright' }).addTo(this.map);
      L.control.scale({ metric: true, imperial: false }).addTo(this.map);

      this.map.on('click', function (e) {
        if (self.mode === 'draw') self._addDrawPoint(e.latlng);
        else if (self.mode === 'measure') self._addMeasurePoint(e.latlng);
        else if (self.mode === 'place-tree' && self.callbacks.onPlaceTree) {
          self.callbacks.onPlaceTree({ lat: e.latlng.lat, lng: e.latlng.lng });
        } else if (self.callbacks.onMapClick) self.callbacks.onMapClick();
      });
      this.map.on('dblclick', function () {
        if (self.mode === 'draw' || self.mode === 'measure') {
          setTimeout(function () { self.finishDraw(); }, 0);
        }
      });
      document.addEventListener('keydown', function (ev) {
        if (self.mode === 'draw' || self.mode === 'measure') {
          if (ev.key === 'Escape') { ev.preventDefault(); self.cancelDraw(); }
          if (ev.key === 'Enter') { ev.preventDefault(); self.finishDraw(); }
          if ((ev.key === 'Backspace' || ev.key === 'Delete') && self.drawPoints.length) {
            ev.preventDefault();
            self.drawPoints.pop();
            var m = self.drawMarkers.pop();
            if (m) self.map.removeLayer(m);
            self._redrawDraft();
          }
        }
      });

      this.ready = true;
      return this.map;
    },

    render: function () {
      if (!this.ready) return;
      var self = this;
      var data = Store.data;

      if (this.terrenoPoly) { this.map.removeLayer(this.terrenoPoly); this.terrenoPoly = null; }
      var tv = data.terreno.vertices || [];
      if (tv.length >= 3) {
        this.terrenoPoly = L.polygon(tv, {
          color: '#f9a825', weight: 3, opacity: 0.95,
          fillColor: '#f9a825', fillOpacity: 0.05, interactive: false
        }).addTo(this.map);
        this.terrenoPoly.bindTooltip(
          '<div class="lf-tip lf-tip-terr">Terreno · ' + Geo.areaShort(Geo.ringArea(tv)) + '</div>',
          { permanent: true, direction: 'center', className: 'lf-tipwrap' });
      }

      var seen = {};
      data.subparcelas.forEach(function (sub) {
        seen[sub.id] = true;
        var sel = self.selected && self.selected.kind === 'sub' && self.selected.id === sub.id;
        var poly = self.polygons[sub.id];
        if (!poly) {
          poly = L.polygon(sub.vertices, {}).addTo(self.map);
          poly.on('click', function () {
            if (self.mode === 'draw' || self.mode === 'measure' || self.mode === 'place-tree') return;
            if (self.callbacks.onSelectSub) self.callbacks.onSelectSub(sub.id);
          });
          self.polygons[sub.id] = poly;
        } else {
          poly.setLatLngs(sub.vertices);
        }
        poly.setStyle({
          color: sub.color, weight: sel ? 5 : 3, opacity: 0.95,
          fillColor: sub.color, fillOpacity: sel ? 0.45 : 0.28
        });
        if (poly.bringToFront) poly.bringToFront();

        var area = Geo.ringArea(sub.vertices);
        var html = '<div class="lf-tip" style="border-left-color:' + sub.color + '">' +
          '<b>' + esc(sub.codigo || 'SP') + '</b>' +
          '<span>' + Geo.areaShort(area) + '</span>' +
          (sub.cultivos.length ? '<i>' + sub.cultivos.length + ' cultivo' + (sub.cultivos.length > 1 ? 's' : '') + '</i>' : '') +
          '</div>';
        if (!poly.getTooltip()) poly.bindTooltip(html, { permanent: true, direction: 'center', className: 'lf-tipwrap' });
        else poly.setTooltipContent(html);
      });
      Object.keys(this.polygons).forEach(function (id) {
        if (!seen[id]) { self.map.removeLayer(self.polygons[id]); delete self.polygons[id]; }
      });

      this.renderTrees();
      this.renderVertices();
    },

    renderTrees: function () {
      var self = this;
      var seen = {};
      Store.data.arboles.forEach(function (a) {
        seen[a.id] = true;
        var sel = self.selected && self.selected.kind === 'arbol' && self.selected.id === a.id;
        var mk = self.treeMarkers[a.id];
        if (!mk) {
          mk = L.marker([a.pos.lat, a.pos.lng], {
            draggable: true, zIndexOffset: 500,
            title: (a.nombre || a.especie) + (a.variedad ? ' · ' + a.variedad : '')
          }).addTo(self.map);
          mk.on('click', function () {
            if (self.callbacks.onSelectTree) self.callbacks.onSelectTree(a.id);
          });
          mk.on('dragend', function (e) {
            if (self.callbacks.onMoveTree) {
              self.callbacks.onMoveTree(a.id, { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng });
            }
          });
          self.treeMarkers[a.id] = mk;
        } else {
          mk.setLatLng([a.pos.lat, a.pos.lng]);
        }
        mk.setIcon(treeIcon(a));
        mk.setZIndexOffset(sel ? 900 : 500);
        mk.setOpacity(sel ? 1 : 0.95);

        /* etiqueta permanente con el nombre y el estilo elegido */
        var mostrar = a.mostrarEtiqueta !== false;
        var nombre = a.nombre || a.especie;
        if (mostrar && nombre) {
          var et = a.etiqueta || {};
          var html = '<div class="tree-tag" style="--tc:' + esc(et.color || '#e53935') + '">' +
            shapeSvg(et.forma, et.color || '#e53935') +
            '<span>' + esc(nombre) + '</span></div>';
          if (mk.getTooltip()) mk.setTooltipContent(html);
          else mk.bindTooltip(html, { permanent: true, direction: 'right', className: 'lf-tree-tip', offset: [10, 0] });
        } else if (mk.getTooltip()) {
          mk.unbindTooltip();
        }
      });
      Object.keys(this.treeMarkers).forEach(function (id) {
        if (!seen[id]) { self.map.removeLayer(self.treeMarkers[id]); delete self.treeMarkers[id]; }
      });
    },

    renderVertices: function () {
      var self = this;
      this.handles.forEach(function (m) { self.map.removeLayer(m); });
      this.handles = [];
      if (!this.selected || this.mode !== 'idle') return;

      var vertices = null, color = '#555';
      if (this.selected.kind === 'sub') {
        var sub = Store.getSub(this.selected.id);
        if (sub) { vertices = sub.vertices; color = sub.color; }
      } else if (this.selected.kind === 'terreno') {
        vertices = Store.data.terreno.vertices;
        color = '#f9a825';
      }
      if (!vertices || vertices.length < 3) return;

      var poly = this.selected.kind === 'sub' ? this.polygons[this.selected.id] : this.terrenoPoly;
      vertices.forEach(function (v, idx) {
        var mk = L.marker([v.lat, v.lng], {
          draggable: true, zIndexOffset: 1000, keyboard: false,
          icon: L.divIcon({
            className: 'vtx-wrap',
            html: '<div class="vtx" style="border-color:' + color + '"></div>',
            iconSize: [14, 14], iconAnchor: [7, 7]
          })
        }).addTo(self.map);
        mk.on('drag', function (e) {
          var ll = e.target.getLatLng();
          vertices[idx] = { lat: ll.lat, lng: ll.lng };
          if (poly) poly.setLatLngs(vertices);
        });
        mk.on('dragend', function () {
          if (self.callbacks.onGeometryDragEnd) self.callbacks.onGeometryDragEnd(self.selected.kind, self.selected.id);
        });
        self.handles.push(mk);
      });
    },

    startDraw: function (kind) {
      this.cancelDraw();
      this.mode = 'draw'; this.drawKind = kind;
      this.selected = null;
      this.renderVertices();
      this._setCursor('crosshair');
      if (this.callbacks.onModeChange) this.callbacks.onModeChange('draw', kind);
    },

    _addDrawPoint: function (latlng) {
      var self = this;
      var p = { lat: latlng.lat, lng: latlng.lng };
      var last = this.drawPoints[this.drawPoints.length - 1];
      if (last && Math.abs(last.lat - p.lat) < 1e-9 && Math.abs(last.lng - p.lng) < 1e-9) return;
      this.drawPoints.push(p);
      var color = this.drawKind === 'terreno' ? '#f9a825' : (this.opts.nextColor ? this.opts.nextColor() : '#2e7d32');
      var mk = L.marker([p.lat, p.lng], {
        draggable: true, zIndexOffset: 1100,
        icon: L.divIcon({
          className: 'vtx-wrap',
          html: '<div class="vtx" style="border-color:' + color + '"></div>',
          iconSize: [14, 14], iconAnchor: [7, 7]
        })
      }).addTo(this.map);
      mk.on('drag', function (e) {
        var i = self.drawMarkers.indexOf(mk);
        var ll = e.target.getLatLng();
        if (i >= 0) { self.drawPoints[i] = { lat: ll.lat, lng: ll.lng }; self._redrawDraft(); }
      });
      this.drawMarkers.push(mk);
      this._redrawDraft();
    },

    _redrawDraft: function () {
      var pts = this.drawPoints;
      if (this.draftLine) { this.map.removeLayer(this.draftLine); this.draftLine = null; }
      if (this.draftShape) { this.map.removeLayer(this.draftShape); this.draftShape = null; }
      if (pts.length < 2) { this._updateDrawHint(); return; }
      var color = this.drawKind === 'terreno' ? '#f9a825' : '#2e7d32';
      this.draftLine = L.polyline(pts, { color: color, weight: 3, opacity: 0.95 }).addTo(this.map);
      if (pts.length >= 3) {
        this.draftShape = L.polygon(pts, { color: color, weight: 1, fillColor: color, fillOpacity: 0.18, interactive: false }).addTo(this.map);
      }
      this._updateDrawHint();
    },

    _updateDrawHint: function () {
      var n = this.drawPoints.length;
      var txt = n === 0 ? 'Haga clic en el mapa para el primer vértice'
        : n + ' vértice' + (n > 1 ? 's' : '') +
        (n >= 3 ? ' · ' + Geo.areaFull(Geo.ringArea(this.drawPoints)) : ' · mínimo 3 para cerrar');
      if (this.callbacks.onDrawHint) this.callbacks.onDrawHint(txt);
    },

    finishDraw: function () {
      if (this.mode === 'measure') {
        if (this.drawPoints.length >= 3 && this.callbacks.onMeasure) {
          this.callbacks.onMeasure({
            area: Geo.ringArea(this.drawPoints),
            perimetro: Geo.perimeter(this.drawPoints),
            vertices: this.drawPoints.slice()
          });
        }
        return;
      }
      if (this.mode !== 'draw') return;
      if (this.drawPoints.length < 3) {
        if (this.callbacks.onError) this.callbacks.onError('Un polígono necesita al menos 3 vértices.');
        return;
      }
      var kind = this.drawKind;
      var pts = this.drawPoints.slice();
      this.cancelDraw(true);
      if (this.callbacks.onDrawComplete) this.callbacks.onDrawComplete(kind, pts);
    },

    cancelDraw: function (keepSilent) {
      var self = this;
      this.drawMarkers.forEach(function (m) { self.map.removeLayer(m); });
      if (this.draftLine) this.map.removeLayer(this.draftLine);
      if (this.draftShape) this.map.removeLayer(this.draftShape);
      this.drawMarkers = []; this.drawPoints = [];
      this.draftLine = null; this.draftShape = null;
      this.mode = 'idle';
      this._setCursor(null);
      if (!keepSilent && this.callbacks.onModeChange) this.callbacks.onModeChange('idle', null);
      if (this.callbacks.onDrawHint) this.callbacks.onDrawHint('');
      this.renderVertices();
    },

    startMeasure: function () {
      this.cancelDraw();
      this.mode = 'measure';
      this._setCursor('crosshair');
      if (this.callbacks.onModeChange) this.callbacks.onModeChange('measure', null);
    },

    _addMeasurePoint: function (latlng) {
      var p = { lat: latlng.lat, lng: latlng.lng };
      var last = this.drawPoints[this.drawPoints.length - 1];
      if (last && Math.abs(last.lat - p.lat) < 1e-9 && Math.abs(last.lng - p.lng) < 1e-9) return;
      this.drawPoints.push(p);
      var mk = L.marker([p.lat, p.lng], {
        zIndexOffset: 1100,
        icon: L.divIcon({
          className: 'vtx-wrap',
          html: '<div class="vtx" style="border-color:#1565c0"></div>',
          iconSize: [14, 14], iconAnchor: [7, 7]
        })
      }).addTo(this.map);
      this.drawMarkers.push(mk);
      this._redrawDraft();
    },

    startPlaceTree: function () {
      this.cancelDraw();
      this.mode = 'place-tree';
      this._setCursor('copy');
      if (this.callbacks.onModeChange) this.callbacks.onModeChange('place-tree', null);
    },

    setIdle: function () {
      this.cancelDraw();
      this.mode = 'idle';
      this._setCursor(null);
      if (this.callbacks.onModeChange) this.callbacks.onModeChange('idle', null);
      this.renderVertices();
    },

    _setCursor: function (c) {
      if (!this.map) return;
      this.map.getContainer().style.cursor = c || '';
    },

    select: function (kind, id) {
      this.selected = kind ? { kind: kind, id: id } : null;
      this.render();
    },

    zoomToSub: function (id) {
      var sub = Store.getSub(id);
      if (!sub || !sub.vertices.length) return;
      this.map.fitBounds(L.latLngBounds(sub.vertices), { padding: [60, 60] });
    },

    zoomToTerreno: function () {
      var v = Store.data.terreno.vertices;
      if (v && v.length >= 3) this.map.fitBounds(L.latLngBounds(v), { padding: [60, 60] });
    },

    zoomToTree: function (id) {
      var a = Store.getArbol(id);
      if (!a) return;
      this.map.setView([a.pos.lat, a.pos.lng], Math.max(this.map.getZoom(), 19));
    },

    fitAll: function () {
      var pts = [];
      if (Store.data.terreno.vertices.length >= 3) pts = pts.concat(Store.data.terreno.vertices);
      Store.data.subparcelas.forEach(function (s) { pts = pts.concat(s.vertices); });
      if (!pts.length) Store.data.arboles.forEach(function (a) { pts.push(a.pos); });
      if (!pts.length) return;
      this.map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 21 });
    },

    useMyLocation: function () {
      var self = this;
      if (!navigator.geolocation) {
        if (this.callbacks.onError) this.callbacks.onError('Este navegador no permite geolocalización.');
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        var p = [pos.coords.latitude, pos.coords.longitude];
        self.map.setView(p, 18);
        L.circleMarker(p, { radius: 8, fillColor: '#1565c0', fillOpacity: 1, color: '#fff', weight: 3 })
          .addTo(self.map).bindTooltip('Mi ubicación', { permanent: false });
      }, function () {
        if (self.callbacks.onError) self.callbacks.onError('No se pudo obtener la ubicación (permiso denegado o sin señal GPS).');
      }, { enableHighAccuracy: true, timeout: 10000 });
    }
  };

  global.MapMod = MapMod;
  global.CAT_COLOR = CAT_COLOR;
  global.treeIcon = treeIcon;
  global.treeDataUrl = treeDataUrl;
  global.shapeSvg = shapeSvg;
  global.MAX_ZOOM = MAX_ZOOM;
})(window);
