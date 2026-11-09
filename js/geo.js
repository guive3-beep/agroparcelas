/* =========================================================================
   AgroParcelas · geo.js
   Cálculos geográficos y formateo. Sin dependencias.
   Área esférica: fórmula de Chamberlain & Duquette (equivalente a la
   fórmula computeArea usada por Google Maps) con R = 6378137 m.
   ========================================================================= */
(function (global) {
  'use strict';

  var R = 6378137;
  var rad = function (d) { return d * Math.PI / 180; };

  function ringArea(points, radius) {
    radius = radius || R;
    var n = points ? points.length : 0;
    if (n < 3) return 0;
    var total = 0;
    for (var i = 0; i < n; i++) {
      var p1 = points[i], p2 = points[(i + 1) % n];
      total += rad(p2.lng - p1.lng) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)));
    }
    return Math.abs(total * radius * radius / 2);
  }

  function perimeter(points) {
    if (!points || points.length < 2) return 0;
    var d = 0;
    for (var i = 0; i < points.length; i++) {
      d += distance(points[i], points[(i + 1) % points.length]);
    }
    return d;
  }

  function distance(a, b) {
    var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function centroid(points) {
    if (!points || !points.length) return null;
    if (points.length < 3) {
      var s = { lat: 0, lng: 0 };
      points.forEach(function (p) { s.lat += p.lat; s.lng += p.lng; });
      return { lat: s.lat / points.length, lng: s.lng / points.length };
    }
    var cx = 0, cy = 0, a = 0;
    for (var i = 0; i < points.length; i++) {
      var p1 = points[i], p2 = points[(i + 1) % points.length];
      var f2 = p1.lat * p2.lng - p2.lat * p1.lng;
      a += f2; cx += (p1.lat + p2.lat) * f2; cy += (p1.lng + p2.lng) * f2;
    }
    if (Math.abs(a) < 1e-12) {
      var m = { lat: 0, lng: 0 };
      points.forEach(function (p) { m.lat += p.lat; m.lng += p.lng; });
      return { lat: m.lat / points.length, lng: m.lng / points.length };
    }
    a *= 3;
    return { lat: cx / a, lng: cy / a };
  }

  function bounds(rings) {
    var b = null;
    (rings || []).forEach(function (ring) {
      (ring || []).forEach(function (p) {
        if (!b) b = { minLat: p.lat, maxLat: p.lat, minLng: p.lng, maxLng: p.lng };
        b.minLat = Math.min(b.minLat, p.lat); b.maxLat = Math.max(b.maxLat, p.lat);
        b.minLng = Math.min(b.minLng, p.lng); b.maxLng = Math.max(b.maxLng, p.lng);
      });
    });
    return b;
  }

  function pointInRing(pt, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i].lat, yi = ring[i].lng, xj = ring[j].lat, yj = ring[j].lng;
      var hit = ((yi > pt.lng) !== (yj > pt.lng)) &&
        (pt.lat < (xj - xi) * (pt.lng - yi) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function nfmt(n, dec) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
    dec = dec === undefined ? 0 : dec;
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function ha(m2) { return (Number(m2) || 0) / 10000; }

  function areaFull(m2) {
    m2 = Number(m2) || 0;
    return nfmt(m2, 0) + ' m² · ' + nfmt(ha(m2), ha(m2) < 1 ? 4 : 2) + ' ha';
  }

  function areaShort(m2) {
    m2 = Number(m2) || 0;
    return (m2 >= 10000) ? nfmt(ha(m2), 2) + ' ha' : nfmt(m2, 0) + ' m²';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return String(iso);
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function age(iso) {
    if (!iso) return { years: 0, months: 0, days: 0, text: '—' };
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return { years: 0, months: 0, days: 0, text: '—' };
    var y = +p[0], m = +p[1], d = +p[2];
    var now = new Date();
    var years = now.getFullYear() - y;
    var months = now.getMonth() + 1 - m;
    var days = now.getDate() - d;
    if (days < 0) {
      months--;
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) { years--; months += 12; }
    if (years < 0) return { years: 0, months: 0, days: 0, text: 'fecha futura' };
    var text;
    if (years >= 1) text = years + (years === 1 ? ' año' : ' años') + (months ? ', ' + months + (months === 1 ? ' mes' : ' meses') : '');
    else if (months >= 1) text = months + (months === 1 ? ' mes' : ' meses');
    else text = days + (days === 1 ? ' día' : ' días');
    return { years: years, months: months, days: days, text: text };
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function slug(s) {
    return String(s || 'proyecto').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proyecto';
  }

  global.Geo = {
    R: R, rad: rad, ringArea: ringArea, perimeter: perimeter, distance: distance,
    centroid: centroid, bounds: bounds, pointInRing: pointInRing,
    nfmt: nfmt, ha: ha, areaFull: areaFull, areaShort: areaShort,
    fmtDate: fmtDate, today: today, age: age, uid: uid, slug: slug
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Geo;
})(typeof window !== 'undefined' ? window : globalThis);
