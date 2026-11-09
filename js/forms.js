/* =========================================================================
   AgroParcelas · forms.js
   Formularios modales con validación. Fotografías comprimidas dentro de los
   propios datos. Árboles con nombre y estilo de etiqueta (forma + color).
   ========================================================================= */
(function (global) {
  'use strict';
  var Geo = global.Geo, Store = global.Store, UI = global.UI;

  function f(label, inputHtml, hint, cls) {
    return '<label class="field ' + (cls || '') + '"><span>' + label + '</span>' + inputHtml +
      (hint ? '<small class="hint">' + hint + '</small>' : '') + '</label>';
  }
  function opt(list, sel) {
    return list.map(function (v) {
      var val = typeof v === 'object' ? v.v : v, txt = typeof v === 'object' ? v.t : v;
      return '<option value="' + UI.esc(val) + '"' + (String(val) === String(sel) ? ' selected' : '') + '>' + UI.esc(txt) + '</option>';
    }).join('');
  }
  function num(v, def) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? (def || 0) : n; }

  /* --------------------- widget de fotos (data URLs) --------------------- */
  function resizeImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.onerror = function () { reject(new Error('Formato de imagen no reconocido.')); };
        img.src = String(reader.result);
      };
      reader.onerror = function () { reject(new Error('No se pudo leer la imagen.')); };
      reader.readAsDataURL(file);
    });
  }

  function photoWidget(fotos) {
    var list = (fotos || []).slice();
    var wrap = document.createElement('div');
    wrap.className = 'full';
    wrap.innerHTML = '<div class="photo-grid"></div>' +
      '<button type="button" class="btn btn-ghost sm mt8" data-add>' +
      '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Añadir foto</button>' +
      '<input type="file" accept="image/*" hidden>' +
      '<small class="hint" style="display:block;margin-top:4px">Máximo 6 por ficha. Se comprimen automáticamente para ocupar poco espacio.</small>';

    var grid = wrap.querySelector('.photo-grid');
    var input = wrap.querySelector('input[type=file]');
    var btn = wrap.querySelector('[data-add]');

    function paint() {
      grid.innerHTML = '';
      list.forEach(function (src, i) {
        var d = document.createElement('div');
        d.style.position = 'relative';
        d.innerHTML = '<img alt="foto" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:1px solid #e2e8e4;background:#f0f3f1">' +
          '<button type="button" title="Quitar" style="position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;font-size:12px;line-height:1">✕</button>';
        d.querySelector('img').src = src;
        d.querySelector('button').onclick = function () { list.splice(i, 1); paint(); };
        d.querySelector('img').onclick = function () {
          UI.openModal({
            title: 'Fotografía',
            body: '<img src="' + src + '" style="width:100%;border-radius:10px">',
            submitLabel: ''
          });
        };
        grid.appendChild(d);
      });
    }

    btn.onclick = function () {
      if (list.length >= 6) { UI.toast('Máximo 6 fotos por ficha.', 'warn'); return; }
      input.click();
    };
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 12 * 1024 * 1024) { UI.toast('La imagen es demasiado grande (máx. 12 MB).', 'err'); return; }
      btn.disabled = true;
      resizeImage(file, 1024, 0.72).then(function (dataUrl) {
        list.push(dataUrl);
        paint();
      }).catch(function (e) {
        UI.toast(e.message, 'err');
      }).finally(function () {
        btn.disabled = false;
        input.value = '';
      });
    };

    paint();
    return { el: wrap, get: function () { return list; } };
  }

  /* ============================== SUBPARCELA ============================= */
  function subparcela(sub, vertices) {
    var isNew = !sub;
    var v = vertices || (sub ? sub.vertices : []);
    var area = Geo.ringArea(v);
    var idx = Store.data.subparcelas.length;
    var color = sub ? sub.color : Store.PALETTE[idx % Store.PALETTE.length];

    var body =
      '<div class="form-grid">' +
      f('Código', '<input name="codigo" maxlength="16" required value="' + UI.esc(sub ? sub.codigo : 'SP-' + String(idx + 1).padStart(2, '0')) + '">') +
      f('Nombre / descripción', '<input name="nombre" maxlength="80" placeholder="Ej.: Lote norte, Almendros viejos…" value="' + UI.esc(sub ? sub.nombre : '') + '">') +
      '<div class="form-sep"></div>' +
      '<div class="field full"><span>Color identificador</span><div class="swatches" data-swatches>' +
      Store.PALETTE.map(function (c) {
        return '<button type="button" class="swatch' + (c === color ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '" aria-label="Color ' + c + '"></button>';
      }).join('') + '</div></div>' +
      f('Superficie calculada', '<input readonly value="' + (v.length >= 3 ? Geo.nfmt(area) + ' m² · ' + Geo.nfmt(Geo.ha(area), 4) + ' ha' : 'Sin polígono dibujado') + '">',
        'Se recalcula al mover los vértices en el mapa.', 'full') +
      f('Observaciones', '<textarea name="notas" maxlength="500" placeholder="Suelo, riego, pendiente…">' + UI.esc(sub ? sub.notas : '') + '</textarea>', '', 'full') +
      '</div>';

    UI.openModal({
      title: isNew ? 'Nueva subparcela' : 'Editar subparcela ' + (sub.codigo || ''),
      body: body,
      submitLabel: isNew ? 'Crear subparcela' : 'Guardar cambios',
      onMount: function (root) {
        root.querySelectorAll('[data-swatches] .swatch').forEach(function (b) {
          b.onclick = function () {
            root.querySelectorAll('[data-swatches] .swatch').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            color = b.dataset.c;
          };
        });
      },
      onSubmit: function (root) {
        var get = function (n) { var el = root.querySelector('[name=' + n + ']'); return el ? el.value.trim() : ''; };
        var codigo = get('codigo');
        if (!codigo) { UI.toast('El código es obligatorio.', 'err'); return false; }
        var dup = Store.data.subparcelas.filter(function (s) {
          return s.codigo.toLowerCase() === codigo.toLowerCase() && (!sub || s.id !== sub.id);
        });
        if (dup.length) { UI.toast('Ya existe una subparcela con ese código.', 'err'); return false; }

        var campos = { codigo: codigo, nombre: get('nombre'), notas: get('notas'), color: color };
        if (isNew) {
          campos.vertices = v;
          var r = Store.addSubparcela(campos);
          global.App.afterChange('new-sub', r.id);
        } else {
          Store.updateSubparcela(sub.id, campos);
          global.App.afterChange('edit-sub', sub.id);
        }
        return true;
      }
    });
  }

  /* ================================ CULTIVO ============================== */
  function cultivo(subId, culId) {
    var sub = Store.getSub(subId);
    if (!sub) return;
    var cul = culId ? Store.getCultivo(subId, culId) : null;
    var isNew = !cul;
    var subArea = Geo.ringArea(sub.vertices);
    var otros = sub.cultivos.filter(function (c) { return !cul || c.id !== cul.id; })
      .reduce(function (t, c) { return t + (Number(c.areaM2) || 0); }, 0);
    var libre = Math.max(0, subArea - otros);

    var body =
      '<div class="form-grid">' +
      f('Nombre del cultivo *', '<input name="nombre" required maxlength="60" placeholder="Ej.: Tomate, Olivo, Vid" value="' + UI.esc(cul ? cul.nombre : '') + '">') +
      f('Variedad / especie', '<input name="variedad" maxlength="60" placeholder="Ej.: Roma, Arbequina" value="' + UI.esc(cul ? cul.variedad : '') + '">') +
      f('Fecha de plantación', '<input type="date" name="fechaPlantacion" value="' + UI.esc(cul ? cul.fechaPlantacion : Geo.today()) + '">') +
      f('Estado', '<select name="estado">' + opt(Store.ESTADOS_CULTIVO, cul ? cul.estado : 'sembrado') + '</select>') +
      f('Cantidad sembrada', '<input type="number" name="cantidad" min="0" step="any" value="' + (cul ? cul.cantidad : '') + '" placeholder="0">') +
      f('Unidad', '<select name="unidad">' + opt(Store.UNIDADES, cul ? cul.unidad : 'plantas') + '</select>') +
      f('Área ocupada (m²)', '<input type="number" name="areaM2" min="0" step="any" value="' + (cul && cul.areaM2 ? cul.areaM2 : '') + '" placeholder="' + Geo.nfmt(Math.round(libre)) + '">',
        'Disponible en esta parcela: ' + Geo.nfmt(libre) + ' m²') +
      f('Distancia entre plantas', '<input name="distPlantas" maxlength="20" placeholder="Ej.: 0,5 m" value="' + UI.esc(cul ? cul.distPlantas : '') + '">') +
      f('Distancia entre surcos', '<input name="distSurcos" maxlength="20" placeholder="Ej.: 0,8 m" value="' + UI.esc(cul ? cul.distSurcos : '') + '">') +
      '<div class="form-sep"></div>' +
      f('Fecha de siembra', '<input type="date" name="fechaSiembra" value="' + UI.esc(cul ? cul.fechaSiembra || '' : '') + '">') +
      f('Fecha de cosecha', '<input type="date" name="fechaCosecha" value="' + UI.esc(cul ? cul.fechaCosecha || '' : '') + '">', 'Prevista o real; edítela cuando ocurra.') +
      f('Tamaño / dimensiones', '<input name="tamano" maxlength="80" placeholder="Ej.: planta 0,8 m · fruto 5–7 cm" value="' + UI.esc(cul ? cul.tamano || '' : '') + '">') +
      f('Enfermedad / plaga', '<input name="enfermedad" maxlength="80" placeholder="Ej.: Tuta absoluta, mildiu…" value="' + UI.esc(cul ? cul.enfermedad || '' : '') + '">') +
      f('Severidad', '<select name="severidad">' + opt([{ v: '', t: 'sin datos' }, { v: 'ninguna', t: 'ninguna' }, { v: 'leve', t: 'leve' }, { v: 'moderada', t: 'moderada' }, { v: 'grave', t: 'grave' }], cul ? cul.severidad || '' : '') + '</select>') +
      f('Detalles (diagnóstico, tratamiento…)', '<textarea name="detalles" maxlength="500">' + UI.esc(cul ? cul.detalles || '' : '') + '</textarea>', '', 'full') +
      '<div class="form-sep"></div>' +
      '<div class="sec-title" style="margin:0">Campos personalizados</div>' +
      '<div data-custom class="full" style="display:flex;flex-direction:column;gap:6px"></div>' +
      '<div class="full"><button type="button" class="btn btn-ghost sm" data-add-custom>+ Agregar campo personalizado</button></div>' +
      '</div>' +
      '<div class="form-grid">' +
      f('Observaciones', '<textarea name="observaciones" maxlength="500" placeholder="Tratamientos, incidencias, riego…">' + UI.esc(cul ? cul.observaciones : '') + '</textarea>', '', 'full') +
      '<div data-photos class="full"></div>' +
      '</div>';

    var pw;
    UI.openModal({
      title: isNew ? 'Nuevo cultivo en ' + (sub.codigo || sub.nombre) : 'Editar cultivo',
      body: body,
      submitLabel: isNew ? 'Registrar cultivo' : 'Guardar cambios',
      onMount: function (root) {
        pw = photoWidget(cul ? cul.fotos : []);
        root.querySelector('[data-photos]').appendChild(pw.el);

        var host = root.querySelector('[data-custom]');
        function addRow(etiqueta, valor) {
          var row = document.createElement('div');
          row.className = 'custom-row';
          row.style.cssText = 'display:grid;grid-template-columns:1fr 1.4fr auto;gap:6px;align-items:center';
          row.innerHTML = '<input class="cr-k" maxlength="40" placeholder="Etiqueta (Ej.: Riego)">' +
            '<input class="cr-v" maxlength="200" placeholder="Valor">' +
            '<button type="button" class="icon-btn sm" title="Quitar">✕</button>';
          row.querySelector('.cr-k').value = etiqueta || '';
          row.querySelector('.cr-v').value = valor || '';
          row.querySelector('button').onclick = function () { row.remove(); };
          host.appendChild(row);
        }
        (cul && cul.campos ? cul.campos : []).forEach(function (c) { addRow(c.etiqueta, c.valor); });
        root.querySelector('[data-add-custom]').onclick = function () { addRow('', ''); };
      },
      onSubmit: function (root) {
        var get = function (n) { var el = root.querySelector('[name=' + n + ']'); return el ? el.value.trim() : ''; };
        var nombre = get('nombre');
        if (!nombre) { UI.toast('Indique el nombre del cultivo.', 'err'); return false; }
        var area = num(get('areaM2'), 0);
        if (area < 0) area = 0;
        if (subArea > 0 && area > subArea + 1) {
          UI.toast('El área del cultivo no puede superar la de la parcela (' + Geo.nfmt(subArea) + ' m²).', 'err');
          return false;
        }
        if (subArea > 0 && otros + area > subArea + 1) {
          UI.toast('La suma de cultivos (' + Geo.nfmt(otros + area) + ' m²) supera la superficie de la parcela (' + Geo.nfmt(subArea) + ' m²).', 'err');
          return false;
        }
        var campos = {
          nombre: nombre, variedad: get('variedad'), fechaPlantacion: get('fechaPlantacion'),
          cantidad: num(get('cantidad'), 0), unidad: get('unidad'), areaM2: area,
          distPlantas: get('distPlantas'), distSurcos: get('distSurcos'),
          estado: get('estado'), observaciones: get('observaciones'), fotos: pw.get(),
          fechaSiembra: get('fechaSiembra'), fechaCosecha: get('fechaCosecha'),
          tamano: get('tamano'), enfermedad: get('enfermedad'), severidad: get('severidad'),
          detalles: get('detalles'),
          campos: Array.prototype.slice.call(root.querySelectorAll('[data-custom] .custom-row'))
            .map(function (row) {
              return { etiqueta: row.querySelector('.cr-k').value.trim(), valor: row.querySelector('.cr-v').value.trim() };
            })
            .filter(function (c) { return c.etiqueta; })
        };
        if (isNew) {
          var c = Store.addCultivo(subId, campos);
          global.App.afterChange('new-cul', subId, c.id);
        } else {
          Store.updateCultivo(subId, cul.id, campos);
          global.App.afterChange('edit-cul', subId, cul.id);
        }
        return true;
      }
    });
  }

  /* ================================= ÁRBOL =============================== */
  function arbol(id, pos) {
    var a = id ? Store.getArbol(id) : null;
    var isNew = !a;
    var p = a ? a.pos : (pos || (global.MapMod && MapMod.map
      ? { lat: MapMod.map.getCenter().lat, lng: MapMod.map.getCenter().lng }
      : { lat: CONFIG.CENTER.lat, lng: CONFIG.CENTER.lng }));
    var et = a ? (a.etiqueta || {}) : { forma: 'none', color: '#e53935' };
    var labelColor = et.color || '#e53935';
    var mostrarEt = a ? (a.mostrarEtiqueta !== false) : true;

    var body =
      '<div class="form-grid">' +
      f('Nombre en el mapa *', '<input name="nombre" required maxlength="60" placeholder="Ej.: Olivo 1, Higuera del portón" value="' + UI.esc(a ? (a.nombre || a.especie) : '') + '">',
        'Es el texto que aparece etiquetado junto al icono.') +
      f('Especie', '<input name="especie" maxlength="60" placeholder="Ej.: Olivo, Limonero, Nogal" value="' + UI.esc(a ? a.especie : '') + '">') +
      f('Variedad', '<input name="variedad" maxlength="60" placeholder="Ej.: Arbequina, Eureka" value="' + UI.esc(a ? a.variedad : '') + '">') +
      f('Categoría', '<select name="categoria">' + opt(Store.CATEGORIAS_ARBOL, a ? a.categoria : 'frutal') + '</select>',
        'Cambia el color del copete del icono.') +
      f('Fecha de plantación', '<input type="date" name="fechaPlantacion" value="' + UI.esc(a ? a.fechaPlantacion : Geo.today()) + '">') +
      f('Cantidad', '<input type="number" name="cantidad" min="1" step="1" value="' + (a ? a.cantidad : 1) + '">',
        'Use > 1 si es un grupo de árboles en este punto.') +
      f('Estado', '<select name="estado">' + opt(Store.ESTADOS_ARBOL, a ? a.estado : 'sano') + '</select>') +
      '<div class="form-sep"></div>' +
      f('Forma de la etiqueta', '<select name="forma">' + opt(Store.FORMAS_ETIQUETA, et.forma || 'none') + '</select>',
        'Se dibuja como insignia en el icono y junto al nombre.') +
      '<div class="field"><span>Color de la etiqueta</span><div class="swatches" data-et-color>' +
      Store.COLORES_ETIQUETA.map(function (c) {
        return '<button type="button" class="swatch' + (c === labelColor ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '" aria-label="Color ' + c + '"></button>';
      }).join('') + '</div></div>' +
      '<label class="field full" style="flex-direction:row;align-items:center;gap:8px">' +
      '<input type="checkbox" name="mostrarEtiqueta"' + (mostrarEt ? ' checked' : '') + ' style="width:auto">' +
      '<span style="font-weight:600">Mostrar el nombre sobre el mapa</span></label>' +
      '<div class="form-sep"></div>' +
      f('Latitud', '<input name="lat" type="number" step="any" value="' + p.lat.toFixed(7) + '">') +
      f('Longitud', '<input name="lng" type="number" step="any" value="' + p.lng.toFixed(7) + '">') +
      f('Observaciones', '<textarea name="observaciones" maxlength="500">' + UI.esc(a ? a.observaciones : '') + '</textarea>', '', 'full') +
      '<div data-photos class="full"></div>' +
      '</div>';

    var pw;
    UI.openModal({
      title: isNew ? 'Nuevo árbol' : 'Editar árbol',
      body: body,
      submitLabel: isNew ? 'Registrar árbol' : 'Guardar cambios',
      onMount: function (root) {
        pw = photoWidget(a ? a.fotos : []);
        root.querySelector('[data-photos]').appendChild(pw.el);
        root.querySelectorAll('[data-et-color] .swatch').forEach(function (b) {
          b.onclick = function () {
            root.querySelectorAll('[data-et-color] .swatch').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            labelColor = b.dataset.c;
          };
        });
        var lat = root.querySelector('[name=lat]'), lng = root.querySelector('[name=lng]');
        [lat, lng].forEach(function (el) {
          el.addEventListener('change', function () {
            var la = parseFloat(lat.value), ln = parseFloat(lng.value);
            if (!isNaN(la) && !isNaN(ln) && global.MapMod && MapMod.map) MapMod.map.panTo([la, ln]);
          });
        });
      },
      onSubmit: function (root) {
        var get = function (n) { var el = root.querySelector('[name=' + n + ']'); return el ? el.value.trim() : ''; };
        var nombre = get('nombre');
        if (!nombre) { UI.toast('Indique el nombre del árbol.', 'err'); return false; }
        var lat = parseFloat(get('lat')), lng = parseFloat(get('lng'));
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          UI.toast('Coordenadas inválidas.', 'err'); return false;
        }
        var campos = {
          nombre: nombre, especie: get('especie') || nombre, variedad: get('variedad'),
          categoria: get('categoria'), fechaPlantacion: get('fechaPlantacion'),
          cantidad: Math.max(1, num(get('cantidad'), 1)), estado: get('estado'),
          observaciones: get('observaciones'), fotos: pw.get(),
          etiqueta: { forma: get('forma'), color: labelColor },
          mostrarEtiqueta: root.querySelector('[name=mostrarEtiqueta]').checked,
          pos: { lat: lat, lng: lng }
        };
        if (isNew) { var r = Store.addArbol(campos); global.App.afterChange('new-arbol', r.id); }
        else { Store.updateArbol(a.id, campos); global.App.afterChange('edit-arbol', a.id); }
        return true;
      }
    });
  }

  global.Forms = {
    subparcela: subparcela, cultivo: cultivo, arbol: arbol,
    photoWidget: photoWidget, resizeImage: resizeImage, num: num
  };
})(window);
