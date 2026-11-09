/* =========================================================================
   AgroParcelas · files.js
   • Guardar/abrir el proyecto como archivo de texto (.txt con JSON dentro)
   • Exportar el mapa a KML (polígonos, colores, árboles y descripciones)
   • Exportar resumen de cultivos y árboles a XLSX (Excel) o CSV
   Sin cuentas, sin claves, sin permisos.
   ========================================================================= */
(function (global) {
  'use strict';
  var Geo = global.Geo, Store = global.Store;

  function _download(texto, nombre, tipo) {
    var blob = new Blob([texto], { type: tipo || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function escXml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  /* #rrggbb → aabbggrr (formato KML) */
  function kmlColor(hex, alpha) {
    var h = String(hex || '#2e7d32').replace('#', '');
    if (h.length !== 6) h = '2e7d32';
    var a = Math.round((alpha === undefined ? 0.8 : alpha) * 255).toString(16).padStart(2, '0');
    return a + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
  }

  function coords(vertices) {
    return (vertices || []).map(function (v) {
      return v.lng.toFixed(7) + ',' + v.lat.toFixed(7) + ',0';
    }).join(' ');
  }

  /* ------------------------------- KML ----------------------------------- */
  function buildKML() {
    var d = Store.data;
    var pm = [];

    if (d.terreno.vertices && d.terreno.vertices.length >= 3) {
      pm.push(
        '<Placemark><name>' + escXml(d.terreno.nombre || 'Terreno general') + '</name>' +
        '<description><![CDATA[Superficie: ' + Geo.areaFull(Geo.ringArea(d.terreno.vertices)) + ']]></description>' +
        '<Style><LineStyle><color>' + kmlColor('#f9a825') + '</color><width>3</width></LineStyle>' +
        '<PolyStyle><color>' + kmlColor('#f9a825', 0.15) + '</color></PolyStyle></Style>' +
        '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' +
        coords(d.terreno.vertices) + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>');
    }

    d.subparcelas.forEach(function (s) {
      var area = Geo.ringArea(s.vertices);
      var desc = 'Superficie: ' + Geo.areaFull(area) + '<br>Perímetro: ' + Geo.nfmt(Geo.perimeter(s.vertices)) + ' m';
      if (s.cultivos.length) {
        desc += '<br><br><b>Cultivos:</b>';
        s.cultivos.forEach(function (c) {
          desc += '<br>• ' + escXml(c.nombre) + (c.variedad ? ' (' + escXml(c.variedad) + ')' : '') +
            ' — ' + Geo.nfmt(c.cantidad) + ' ' + escXml(c.unidad || '') + ' · ' + Geo.nfmt(c.areaM2) + ' m²' +
            ' · ' + escXml(c.estado) + (c.fechaPlantacion ? ' · plantado ' + Geo.fmtDate(c.fechaPlantacion) : '');
        });
      }
      if (s.notas) desc += '<br><br>' + escXml(s.notas);
      pm.push(
        '<Placemark><name>' + escXml((s.codigo || 'SP') + (s.nombre ? ' · ' + s.nombre : '')) + '</name>' +
        '<description><![CDATA[' + desc + ']]></description>' +
        '<Style><LineStyle><color>' + kmlColor(s.color) + '</color><width>3</width></LineStyle>' +
        '<PolyStyle><color>' + kmlColor(s.color, 0.45) + '</color></PolyStyle></Style>' +
        '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' +
        coords(s.vertices) + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>');
    });

    d.arboles.forEach(function (a) {
      var desc = '<b>' + escXml(a.nombre || a.especie) + '</b><br>Especie: ' + escXml(a.especie) +
        (a.variedad ? '<br>Variedad: ' + escXml(a.variedad) : '') +
        '<br>Categoría: ' + escXml(a.categoria) +
        (a.fechaPlantacion ? '<br>Plantación: ' + Geo.fmtDate(a.fechaPlantacion) + ' (edad: ' + Geo.age(a.fechaPlantacion).text + ')' : '') +
        '<br>Estado: ' + escXml(a.estado) +
        (a.cantidad > 1 ? '<br>Cantidad: ' + Geo.nfmt(a.cantidad) + ' ejemplares' : '') +
        (a.observaciones ? '<br><br>' + escXml(a.observaciones) : '');
      pm.push(
        '<Placemark><name>' + escXml(a.nombre || a.especie) + '</name>' +
        '<description><![CDATA[' + desc + ']]></description>' +
        '<Style><IconStyle><color>' + kmlColor((a.etiqueta && a.etiqueta.color) || '#e53935') + '</color>' +
        '<Icon><href>http://maps.google.com/mapfiles/kml/shapes/tree.png</href></Icon></IconStyle></Style>' +
        '<Point><coordinates>' + a.pos.lng.toFixed(7) + ',' + a.pos.lat.toFixed(7) + ',0</coordinates></Point></Placemark>');
    });

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' +
      escXml(d.nombre || 'AgroParcelas') + '</name>' + pm.join('\n') +
      '</Document></kml>';
  }

  function exportKML() {
    if (!global.Store.data.subparcelas.length && !global.Store.data.arboles.length &&
      !(global.Store.data.terreno.vertices || []).length) {
      global.UI.toast('No hay nada que exportar todavía: dibuje parcelas o árboles.', 'warn');
      return false;
    }
    try {
      var kml = buildKML();
      _download(kml, 'AgroParcelas_' + Geo.slug(Store.data.nombre) + '_' + Geo.today() + '.kml',
        'application/vnd.google-earth.kml+xml;charset=utf-8');
      Store.log('exportación', 'Mapa exportado a KML');
      global.UI.toast('KML descargado: ábralo en Google Earth o importe en Google My Maps.');
      return true;
    } catch (e) {
      global.UI.toast('No se pudo generar el KML: ' + e.message, 'err');
      return false;
    }
  }

  /* ---------------------------- resumen XLSX/CSV ------------------------- */
  function resumenRows() {
    var cultivos = [], arboles = [];
    Store.data.subparcelas.forEach(function (s) {
      var area = Geo.ringArea(s.vertices);
      if (!s.cultivos.length) {
        cultivos.push({
          'Proyecto': Store.data.nombre, 'Subparcela': s.codigo || '', 'Nombre parcela': s.nombre || '',
          'Cultivo': '(sin cultivos)', 'Variedad': '', 'Fecha plantación': '', 'Fecha siembra': '',
          'Fecha cosecha': '', 'Cantidad': '', 'Unidad': '', 'Área cultivo (m²)': '',
          'Área parcela (m²)': Math.round(area), 'Área (ha)': +(Geo.ha(area).toFixed(4)),
          'Estado': '', 'Tamaño': '', 'Enfermedad/plaga': '', 'Severidad': '', 'Detalles': '',
          'Observaciones': s.notas || ''
        });
      }
      s.cultivos.forEach(function (c) {
        cultivos.push({
          'Proyecto': Store.data.nombre, 'Subparcela': s.codigo || '', 'Nombre parcela': s.nombre || '',
          'Cultivo': c.nombre, 'Variedad': c.variedad || '',
          'Fecha plantación': c.fechaPlantacion || '', 'Fecha siembra': c.fechaSiembra || '',
          'Fecha cosecha': c.fechaCosecha || '',
          'Cantidad': c.cantidad || 0, 'Unidad': c.unidad || '',
          'Área cultivo (m²)': Math.round(c.areaM2 || 0),
          'Área parcela (m²)': Math.round(area), 'Área (ha)': +(Geo.ha(area).toFixed(4)),
          'Estado': c.estado || '', 'Tamaño': c.tamano || '',
          'Enfermedad/plaga': c.enfermedad || '', 'Severidad': c.severidad || '',
          'Detalles': c.detalles || '', 'Observaciones': c.observaciones || ''
        });
      });
    });
    Store.data.arboles.forEach(function (a) {
      arboles.push({
        'Proyecto': Store.data.nombre, 'Nombre': a.nombre || a.especie || '',
        'Especie': a.especie || '', 'Variedad': a.variedad || '', 'Categoría': a.categoria || '',
        'Fecha plantación': a.fechaPlantacion || '', 'Edad': Geo.age(a.fechaPlantacion).text,
        'Cantidad': a.cantidad || 1, 'Estado': a.estado || '',
        'Latitud': +a.pos.lat.toFixed(7), 'Longitud': +a.pos.lng.toFixed(7),
        'Observaciones': a.observaciones || ''
      });
    });
    return { cultivos: cultivos, arboles: arboles };
  }

  function exportResumen() {
    var rows = resumenRows();
    if (!rows.cultivos.length && !rows.arboles.length) {
      global.UI.toast('No hay cultivos ni árboles para exportar todavía.', 'warn');
      return false;
    }
    var base = 'AgroParcelas_resumen_' + Geo.slug(Store.data.nombre) + '_' + Geo.today();

    /* Excel (XLSX) si SheetJS está disponible; CSV como alternativa */
    if (typeof global.XLSX !== 'undefined' && XLSX.utils && XLSX.writeFile) {
      try {
        var wb = XLSX.utils.book_new();
        var st = Store.stats();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          ['Resumen general — ' + Store.data.nombre],
          ['Generado', new Date().toLocaleString('es-AR')],
          [],
          ['Superficie total (m²)', st.areaTotal, 'Superficie total (ha)', +Geo.ha(st.areaTotal).toFixed(4)],
          ['Subparcelas', st.subparcelas],
          ['Cultivos', st.cultivos],
          ['Plantas totales', st.plantas],
          ['Árboles', st.arboles, 'Puntos registrados', st.arbolesRegistros],
          ['Superficie cultivada (m²)', Math.round(st.cultivada)],
          ['Superficie disponible (m²)', Math.round(st.disponible)],
          ['Ocupación (%)', +st.ocupacion.toFixed(1)]
        ]), 'Resumen');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.cultivos), 'Cultivos');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.arboles), 'Árboles');
        XLSX.writeFile(wb, base + '.xlsx');
        Store.log('exportación', 'Resumen exportado a Excel');
        global.UI.toast('Resumen Excel (.xlsx) descargado, con hojas Resumen, Cultivos y Árboles.');
        return true;
      } catch (e) {
        global.UI.toast('No se pudo generar el Excel; se descargó CSV. (' + e.message + ')', 'warn');
      }
    }

    var q = function (v) {
      var s = String(v == null ? '' : v).replace(/"/g, '""');
      return /[;"\n]/.test(s) ? '"' + s + '"' : s;
    };
    function table(arr) {
      if (!arr.length) return '';
      var head = Object.keys(arr[0]);
      return head.map(q).join(';') + '\r\n' +
        arr.map(function (r) { return head.map(function (k) { return q(r[k]); }).join(';'); }).join('\r\n');
    }
    var csv = table(rows.cultivos) + '\r\n\r\n' + table(rows.arboles);
    _download('\uFEFF' + csv, base + '.csv', 'text/csv;charset=utf-8;');
    Store.log('exportación', 'Resumen exportado a CSV');
    global.UI.toast('Resumen CSV descargado (compatible con Excel).');
    return true;
  }

  /* ------------------------- proyecto .txt / .json ----------------------- */
  function download() {
    try {
      var json = JSON.stringify(Store.data, null, 2);
      _download(json, 'AgroParcelas_' + Geo.slug(Store.data.nombre) + '_' + Geo.today() + '.txt',
        'text/plain;charset=utf-8');
      Store.log('guardado', 'Copia exportada a archivo de texto');
      global.UI.toast('Archivo de respaldo descargado. Guárdelo en un lugar seguro.');
      return true;
    } catch (e) {
      global.UI.toast('No se pudo generar el archivo: ' + e.message, 'err');
      return false;
    }
  }

  function openDialog() {
    var input = document.getElementById('file-open');
    if (!input) return;
    input.value = '';
    input.click();
  }

  function _read(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try { resolve(JSON.parse(String(reader.result))); }
        catch (e) { reject(new Error('El archivo no es un proyecto válido de AgroParcelas.')); }
      };
      reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      reader.readAsText(file);
    });
  }

  function load(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      global.UI.toast('El archivo supera 8 MB y no puede abrirse aquí.', 'err');
      return;
    }
    _read(file).then(function (data) {
      if (!data || !Array.isArray(data.subparcelas)) {
        throw new Error('El archivo no tiene el formato esperado.');
      }
      Store.init(data);
      document.getElementById('project-name').value = Store.data.nombre || 'Proyecto';
      global.App.selected = null;
      if (global.MapMod && MapMod.ready) { MapMod.selected = null; MapMod.render(); MapMod.fitAll(); }
      UI.renderAll();
      global.UI.toast('Proyecto «' + (Store.data.nombre || '') + '» cargado desde el archivo.');
    }).catch(function (e) {
      global.UI.toast(e.message, 'err');
    });
  }

  global.Files = {
    download: download, openDialog: openDialog, load: load,
    buildKML: buildKML, exportKML: exportKML,
    resumenRows: resumenRows, exportResumen: exportResumen, _download: _download
  };
})(window);
