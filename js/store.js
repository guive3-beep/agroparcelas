/* =========================================================================
   AgroParcelas · store.js
   Modelo de datos + mutaciones + historial. Emite cambios a la interfaz.
   ========================================================================= */
(function (global) {
  'use strict';
  var Geo = global.Geo;

  var PALETTE = ['#2e7d32', '#1565c0', '#c62828', '#6a1b9a', '#ef6c00', '#00838f',
    '#558b2f', '#ad1457', '#4527a0', '#00695c', '#9e9d24', '#4e342e'];

  var ESTADOS_CULTIVO = ['preparación', 'sembrado', 'crecimiento', 'producción', 'cosechado', 'finalizado'];
  var ESTADOS_ARBOL = ['sano', 'en crecimiento', 'en producción', 'enfermo', 'seco', 'talado'];
  var UNIDADES = ['plantas', 'semillas', 'esquejes', 'unidades', 'bandejas', 'kg'];
  var CATEGORIAS_ARBOL = ['frutal', 'cítrico', 'olivo', 'vid', 'forestal', 'palmera', 'otro'];
  var FORMAS_ETIQUETA = [
    { v: 'none', t: 'Sin forma' }, { v: 'circle', t: 'Círculo' },
    { v: 'square', t: 'Cuadrado' }, { v: 'triangle', t: 'Triángulo' }, { v: 'star', t: 'Estrella' }
  ];
  var COLORES_ETIQUETA = ['#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab',
    '#1e88e5', '#00897b', '#43a047', '#fdd835', '#fb8c00', '#6d4c41', '#546e7a'];

  var ESTADO_COLOR = {
    'preparación': '#8d6e63', 'sembrado': '#42a5f5', 'crecimiento': '#66bb6a',
    'producción': '#2e7d32', 'cosechado': '#f9a825', 'finalizado': '#757575',
    'sano': '#2e7d32', 'en crecimiento': '#66bb6a', 'en producción': '#1b5e20',
    'enfermo': '#e53935', 'seco': '#a1887f', 'talado': '#616161'
  };

  var Store = {
    data: null, dirty: false, listeners: [],
    PALETTE: PALETTE, ESTADOS_CULTIVO: ESTADOS_CULTIVO, ESTADOS_ARBOL: ESTADOS_ARBOL,
    UNIDADES: UNIDADES, CATEGORIAS_ARBOL: CATEGORIAS_ARBOL,
    FORMAS_ETIQUETA: FORMAS_ETIQUETA, COLORES_ETIQUETA: COLORES_ETIQUETA,
    ESTADO_COLOR: ESTADO_COLOR,

    onChange: function (fn) { this.listeners.push(fn); },
    emit: function (reason) {
      var self = this;
      this.listeners.forEach(function (fn) { try { fn(self.data, reason); } catch (e) { console.error(e); } });
    },

    nuevoProyecto: function (nombre) {
      return {
        schema: 3, id: Geo.uid('proj'), nombre: nombre || 'Mi proyecto agrícola',
        descripcion: '', creado: new Date().toISOString(), actualizado: new Date().toISOString(),
        terreno: { nombre: 'Terreno general', vertices: [] },
        subparcelas: [], arboles: [], historial: []
      };
    },

    init: function (data) {
      this.data = this._normalize(data || this.nuevoProyecto());
      this.dirty = false;
      this.emit('init');
      return this.data;
    },

    _normalize: function (d) {
      d.schema = 3;
      d.subparcelas = Array.isArray(d.subparcelas) ? d.subparcelas : [];
      d.arboles = Array.isArray(d.arboles) ? d.arboles : [];
      d.historial = Array.isArray(d.historial) ? d.historial : [];
      d.terreno = d.terreno || { nombre: 'Terreno general', vertices: [] };
      d.terreno.vertices = d.terreno.vertices || [];
      d.subparcelas.forEach(function (s, i) {
        s.id = s.id || Geo.uid('sub');
        s.color = s.color || PALETTE[i % PALETTE.length];
        s.vertices = s.vertices || [];
        s.cultivos = Array.isArray(s.cultivos) ? s.cultivos : [];
        s.cultivos.forEach(function (c) {
          c.id = c.id || Geo.uid('cul');
          c.fotos = c.fotos || [];
          c.cantidad = Number(c.cantidad) || 0;
          c.areaM2 = Number(c.areaM2) || 0;
          c.campos = Array.isArray(c.campos) ? c.campos : [];
          c.fechaSiembra = c.fechaSiembra || '';
          c.fechaCosecha = c.fechaCosecha || '';
          c.tamano = c.tamano || '';
          c.enfermedad = c.enfermedad || '';
          c.severidad = c.severidad || '';
          c.detalles = c.detalles || '';
        });
      });
      d.arboles.forEach(function (a) {
        a.id = a.id || Geo.uid('arb');
        a.fotos = a.fotos || [];
        a.cantidad = Number(a.cantidad) || 1;
        a.pos = a.pos || { lat: 0, lng: 0 };
        a.nombre = a.nombre || a.especie || 'Árbol';
        a.etiqueta = a.etiqueta || { forma: 'none', color: '#e53935' };
        if (typeof a.etiqueta !== 'object' || !a.etiqueta) a.etiqueta = { forma: 'none', color: '#e53935' };
        if (!a.etiqueta.forma) a.etiqueta.forma = 'none';
        if (!a.etiqueta.color) a.etiqueta.color = '#e53935';
        a.mostrarEtiqueta = a.mostrarEtiqueta !== false;
      });
      return d;
    },

    log: function (tipo, detalle) {
      this.data.historial.unshift({ ts: new Date().toISOString(), tipo: tipo, detalle: detalle });
      if (this.data.historial.length > 400) this.data.historial.length = 400;
    },

    _commit: function (motivo, silent) {
      this.data.actualizado = new Date().toISOString();
      this.dirty = true;
      if (!silent) { this.log('edición', motivo); this.emit('change'); }
    },

    getSub: function (id) {
      return (this.data.subparcelas || []).filter(function (s) { return s.id === id; })[0] || null;
    },
    getCultivo: function (subId, culId) {
      var s = this.getSub(subId);
      return s ? (s.cultivos.filter(function (c) { return c.id === culId; })[0] || null) : null;
    },
    getArbol: function (id) {
      return (this.data.arboles || []).filter(function (a) { return a.id === id; })[0] || null;
    },

    addSubparcela: function (campos) {
      var n = this.data.subparcelas.length;
      var sub = {
        id: Geo.uid('sub'),
        codigo: campos.codigo || ('SP-' + String(n + 1).padStart(2, '0')),
        nombre: campos.nombre || '',
        color: campos.color || PALETTE[n % PALETTE.length],
        notas: campos.notas || '',
        vertices: campos.vertices || [],
        cultivos: []
      };
      this.data.subparcelas.push(sub);
      this._commit('Subparcela creada: ' + sub.codigo);
      return sub;
    },

    updateSubparcela: function (id, campos) {
      var s = this.getSub(id);
      if (!s) return null;
      Object.keys(campos).forEach(function (k) { if (k !== 'id' && k !== 'cultivos') s[k] = campos[k]; });
      this._commit('Subparcela modificada: ' + (s.codigo || s.nombre));
      return s;
    },

    setGeometria: function (kind, id, vertices, silent) {
      if (kind === 'terreno') {
        this.data.terreno.vertices = vertices;
      } else {
        var s = this.getSub(id);
        if (!s) return;
        s.vertices = vertices;
      }
      this._commit(kind === 'terreno' ? 'Límites del terreno modificados' : 'Límites de subparcela modificados', silent);
    },

    deleteSubparcela: function (id) {
      var s = this.getSub(id);
      if (!s) return;
      this.data.subparcelas = this.data.subparcelas.filter(function (x) { return x.id !== id; });
      this._commit('Subparcela eliminada: ' + (s.codigo || s.nombre));
    },

    addCultivo: function (subId, campos) {
      var s = this.getSub(subId);
      if (!s) return null;
      var c = {
        id: Geo.uid('cul'), nombre: campos.nombre || 'Cultivo', variedad: campos.variedad || '',
        fechaPlantacion: campos.fechaPlantacion || '', cantidad: Number(campos.cantidad) || 0,
        unidad: campos.unidad || 'plantas', areaM2: Number(campos.areaM2) || 0,
        distPlantas: campos.distPlantas || '', distSurcos: campos.distSurcos || '',
        estado: campos.estado || 'sembrado', observaciones: campos.observaciones || '',
        fechaSiembra: campos.fechaSiembra || '', fechaCosecha: campos.fechaCosecha || '',
        tamano: campos.tamano || '', enfermedad: campos.enfermedad || '',
        severidad: campos.severidad || '', detalles: campos.detalles || '',
        campos: Array.isArray(campos.campos) ? campos.campos : [],
        fotos: campos.fotos || [], creado: new Date().toISOString()
      };
      s.cultivos.push(c);
      this._commit('Cultivo registrado: ' + c.nombre + ' en ' + (s.codigo || s.nombre));
      return c;
    },

    updateCultivo: function (subId, culId, campos) {
      var c = this.getCultivo(subId, culId);
      if (!c) return null;
      Object.keys(campos).forEach(function (k) { if (k !== 'id') c[k] = campos[k]; });
      c.cantidad = Number(c.cantidad) || 0;
      c.areaM2 = Number(c.areaM2) || 0;
      if (!Array.isArray(c.campos)) c.campos = [];
      this._commit('Cultivo actualizado: ' + c.nombre);
      return c;
    },

    deleteCultivo: function (subId, culId) {
      var s = this.getSub(subId);
      if (!s) return;
      var c = this.getCultivo(subId, culId);
      s.cultivos = s.cultivos.filter(function (x) { return x.id !== culId; });
      this._commit('Cultivo eliminado: ' + (c ? c.nombre : ''));
    },

    addArbol: function (campos) {
      var a = {
        id: Geo.uid('arb'), especie: campos.especie || 'Árbol', variedad: campos.variedad || '',
        nombre: campos.nombre || campos.especie || 'Árbol',
        categoria: campos.categoria || 'frutal', fechaPlantacion: campos.fechaPlantacion || '',
        cantidad: Number(campos.cantidad) || 1, estado: campos.estado || 'sano',
        observaciones: campos.observaciones || '', fotos: campos.fotos || [],
        etiqueta: campos.etiqueta || { forma: 'none', color: '#e53935' },
        mostrarEtiqueta: campos.mostrarEtiqueta !== false,
        pos: { lat: Number(campos.pos.lat), lng: Number(campos.pos.lng) },
        creado: new Date().toISOString()
      };
      this.data.arboles.push(a);
      this._commit('Árbol registrado: ' + (a.nombre || a.especie));
      return a;
    },

    updateArbol: function (id, campos) {
      var a = this.getArbol(id);
      if (!a) return null;
      Object.keys(campos).forEach(function (k) { if (k !== 'id') a[k] = campos[k]; });
      a.cantidad = Number(a.cantidad) || 1;
      if (!a.nombre) a.nombre = a.especie;
      this._commit('Árbol actualizado: ' + (a.nombre || a.especie));
      return a;
    },

    deleteArbol: function (id) {
      var a = this.getArbol(id);
      this.data.arboles = this.data.arboles.filter(function (x) { return x.id !== id; });
      this._commit('Árbol eliminado: ' + (a ? (a.nombre || a.especie) : ''));
    },

    stats: function () {
      var d = this.data;
      var totalArea = Geo.ringArea(d.terreno.vertices || []);
      var subArea = d.subparcelas.reduce(function (t, s) { return t + Geo.ringArea(s.vertices); }, 0);
      var base = totalArea > 0 ? totalArea : subArea;
      var cultivos = 0, plantas = 0, superficieCultivada = 0;
      d.subparcelas.forEach(function (s) {
        var sa = Geo.ringArea(s.vertices);
        s.cultivos.forEach(function (c) { cultivos++; plantas += Number(c.cantidad) || 0; });
        var asignado = s.cultivos.reduce(function (t, c) { return t + (Number(c.areaM2) || 0); }, 0);
        superficieCultivada += Math.min(asignado, sa || asignado);
      });
      return {
        areaTotal: base, areaSubparcelas: subArea, subparcelas: d.subparcelas.length,
        cultivos: cultivos, plantas: plantas,
        arboles: d.arboles.reduce(function (t, a) { return t + (Number(a.cantidad) || 1); }, 0),
        arbolesRegistros: d.arboles.length,
        cultivada: superficieCultivada,
        disponible: Math.max(0, base - superficieCultivada),
        ocupacion: base > 0 ? (superficieCultivada / base) * 100 : 0
      };
    }
  };

  global.Store = Store;
})(window);
