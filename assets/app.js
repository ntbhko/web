/* =================================================================
   Web HKO Kanwil BPN NTB — logika tampilan
   Isi web diambil dari Google Sheet (lihat assets/config.js).
   Bila Sheet tidak bisa dimuat, dipakai salinan terakhir yang
   tersimpan di browser, lalu data cadangan (assets/data-cadangan.js).
   ================================================================= */
(function () {
  'use strict';

  var CFG = window.HKO_CONFIG || {};
  var CACHE_KEY = 'hko_konten_v1';
  var FALLBACK_ICON = 'file-text';

  /* ---------------- Utilitas ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
  function norm(v) {
    return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function clean(v) { return String(v == null ? '' : v).trim(); }
  function yes(v) { return /^(ya|y|yes|true|1|v|✓)$/i.test(clean(v)); }
  function slugId(v) { return clean(v).toLowerCase(); }
  function icon(name, cls) {
    return '<i data-lucide="' + esc(clean(name) || FALLBACK_ICON) + '" class="' + (cls || 'w-5 h-5') + '"></i>';
  }
  /** Ganti elemen <i data-lucide> menjadi SVG; nama ikon yang salah diganti ikon bawaan. */
  function drawIcons() {
    if (!window.lucide) return;
    try { lucide.createIcons(); } catch (e) { }
    var left = document.querySelectorAll('i[data-lucide]');
    if (left.length) {
      left.forEach(function (el) { el.setAttribute('data-lucide', FALLBACK_ICON); });
      try { lucide.createIcons(); } catch (e) { }
    }
  }
  /** Hanya izinkan alamat yang aman. */
  function safeUrl(u) {
    u = clean(u);
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^(www\.|s\.id\/|bit\.ly\/|shorturl\.at\/|linktr\.ee\/)/i.test(u)) return 'https://' + u;
    return '';
  }
  function track(name, params) {
    if (typeof window.gtag === 'function') { try { window.gtag('event', name, params || {}); } catch (e) { } }
  }
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------- Pembaca CSV ---------------- */
  function parseCSV(text) {
    var rows = [], row = [], field = '', i = 0, q = false, c;
    text = String(text || '').replace(/^﻿/, '');
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
      i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return norm(h).trim().replace(/\s+/g, '_'); });
    return rows.slice(1)
      .filter(function (r) { return r.some(function (x) { return clean(x) !== ''; }); })
      .map(function (r) { var o = {}; head.forEach(function (h, k) { if (h) o[h] = r[k] == null ? '' : r[k]; }); return o; });
  }

  /* ---------------- Mengambil data ---------------- */
  function fetchTab(tab) {
    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(CFG.SHEET_ID) +
      '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(tab) + '&_=' + Date.now();
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.TIMEOUT_MS || 8000);
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('Tab "' + tab + '" gagal dimuat (' + r.status + ')');
        return r.text();
      })
      .then(function (t) {
        if (/^\s*</.test(t)) throw new Error('Spreadsheet belum dibagikan untuk umum');
        return parseCSV(t);
      });
  }
  function loadFromSheet() {
    var tabs = CFG.TABS || ['pengaturan', 'kategori', 'layanan', 'isi'];
    return Promise.all(tabs.map(fetchTab)).then(function (res) {
      var raw = {}; tabs.forEach(function (t, i) { raw[t] = res[i]; });
      if (!raw.layanan || !raw.layanan.length) throw new Error('Tab layanan kosong');
      return raw;
    });
  }
  function readCache() {
    try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.raw ? c : null; } catch (e) { return null; }
  }
  function writeCache(raw) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), raw: raw })); } catch (e) { }
  }

  /* ---------------- Menyusun model data ---------------- */
  var M = { set: {}, cats: [], catMap: {}, svcs: [], svcMap: {}, isi: {} };

  function buildModel(raw) {
    var m = { set: {}, cats: [], catMap: {}, svcs: [], svcMap: {}, isi: {} };
    (raw.pengaturan || []).forEach(function (r) { var k = slugId(r.kunci); if (k) m.set[k] = clean(r.nilai); });
    (raw.kategori || []).forEach(function (r) {
      var id = slugId(r.id); if (!id || m.catMap[id]) return;
      var c = { id: id, name: clean(r.nama) || id, menu: clean(r.nama_menu) || clean(r.nama) || id, desc: clean(r.deskripsi), icon: clean(r.ikon) || 'folder' };
      m.cats.push(c); m.catMap[id] = c;
    });
    (raw.layanan || []).forEach(function (r) {
      var id = slugId(r.id); if (!id || m.svcMap[id]) return;
      var s = {
        id: id, title: clean(r.judul) || id, cat: slugId(r.kategori), icon: clean(r.ikon) || FALLBACK_ICON,
        desc: clean(r.deskripsi), summary: clean(r.ringkasan) || clean(r.deskripsi),
        popular: yes(r.populer), visible: clean(r.tampil) === '' ? true : yes(r.tampil), keywords: clean(r.kata_kunci), text: ''
      };
      m.svcs.push(s); m.svcMap[id] = s;
    });
    // Isi: baris berurutan dengan layanan + judul_bagian + jenis yang sama = satu bagian
    var last = {};
    (raw.isi || []).forEach(function (r) {
      var sid = slugId(r.layanan_id); if (!sid) return;
      var jenis = norm(r.jenis).trim() || 'daftar';
      var title = clean(r.judul_bagian), isi = clean(r.isi);
      var list = m.isi[sid] || (m.isi[sid] = []);
      var prev = last[sid];
      var single = (jenis === 'teks' || jenis === 'catatan');
      var sec;
      if (!single && prev && prev.type === jenis && prev.title === title && list[list.length - 1] === prev) sec = prev;
      else { sec = { type: jenis, title: title, color: norm(r.warna).trim(), items: [], body: '' }; list.push(sec); last[sid] = sec; }
      if (!sec.color && r.warna) sec.color = norm(r.warna).trim();
      if (single) sec.body = isi;
      else if (jenis === 'tautan') sec.items.push({ label: isi || clean(r.tautan), url: clean(r.tautan) });
      else if (jenis === 'angka') sec.items.push({ label: isi, value: clean(r.angka) });
      else sec.items.push(isi);
      if (m.svcMap[sid]) m.svcMap[sid].text += ' ' + title + ' ' + isi;
    });
    return m;
  }

  /* ---------------- Tampilan: teks umum ---------------- */
  function setText(id, v) { var el = $(id); if (el && v) el.textContent = v; }
  function renderSettings() {
    var s = M.set;
    if (s.judul_situs) { setText('siteTitle', s.judul_situs); document.title = s.judul_situs.replace(/kanwil/i, 'Kanwil BPN'); }
    setText('siteSubtitle', s.subjudul_situs);
    setText('heroLabel', s.hero_label);
    if (s.hero_judul) $('heroTitle').innerHTML = esc(s.hero_judul).replace(/\*([^*]+)\*/g, '<span class="text-gold">$1</span>');
    setText('heroDesc', s.hero_deskripsi);
    setText('footerUnit', s.footer_unit);
    setText('footerOffice', s.footer_kantor);
    setText('footerSlogan', s.slogan);
    if (s.whatsapp) $('waLink').href = 'https://wa.me/' + s.whatsapp.replace(/[^0-9]/g, '');
    if (s.email) $('emailLink').href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(s.email);
    var a = $('announcement');
    if (s.pengumuman) {
      var link = safeUrl(s.pengumuman_tautan);
      var inner = '<span class="mt-0.5 text-gold shrink-0">' + icon('megaphone', 'w-4 h-4') + '</span><span class="flex-1">' + esc(s.pengumuman) + '</span>' +
        (link ? '<span class="shrink-0 text-gold">' + icon('arrow-up-right', 'w-4 h-4') + '</span>' : '');
      a.innerHTML = link ? '<a class="announce" href="' + esc(link) + '" target="_blank" rel="noopener">' + inner + '</a>' : '<div class="announce">' + inner + '</div>';
      a.classList.remove('hidden');
    } else { a.classList.add('hidden'); a.innerHTML = ''; }
  }

  /* ---------------- Tampilan: menu ---------------- */
  function visibleIn(catId) { return M.svcs.filter(function (s) { return s.visible && s.cat === catId; }); }
  function renderNav() {
    var nav = $('desktopNav');
    nav.innerHTML = '<a href="#/" class="nav-top px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-navy" data-nav="home">Beranda</a>' +
      M.cats.map(function (c) {
        var list = visibleIn(c.id);
        return '<div class="nav-dd"><a href="#/kategori/' + esc(c.id) + '" data-nav="' + esc(c.id) + '" class="nav-top px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-navy inline-flex items-center gap-1">' + esc(c.menu) + ' ' + icon('chevron-down', 'w-3.5 h-3.5') + '</a>' +
          '<div class="nav-dd-panel"><div class="px-2 pt-1 pb-2"><div class="text-[10px] uppercase tracking-wider font-bold text-slate-400">' + esc(c.name) + '</div><div class="text-xs text-slate-500 mt-1">' + list.length + ' layanan</div></div>' +
          list.map(function (s) {
            return '<a href="#/layanan/' + esc(s.id) + '" class="nav-dd-item"><span class="w-8 h-8 rounded-lg bg-slate-100 text-blue flex items-center justify-center shrink-0">' + icon(s.icon, 'w-4 h-4') + '</span><span class="text-sm font-semibold text-slate-700">' + esc(s.title) + '</span><span class="ml-auto text-slate-400">' + icon('chevron-right', 'w-3.5 h-3.5') + '</span></a>';
          }).join('') + '</div></div>';
      }).join('');
    $('mobileNavList').innerHTML = '<a href="#/" class="mobile-nav-link">' + icon('home', 'w-4 h-4 text-slate-400') + 'Beranda</a>' +
      M.cats.map(function (c) { return '<a href="#/kategori/' + esc(c.id) + '" class="mobile-nav-link">' + icon(c.icon, 'w-4 h-4 text-slate-400') + esc(c.name) + '</a>'; }).join('');
  }

  /* ---------------- Tampilan: beranda & kategori ---------------- */
  function renderPopular() {
    var pop = M.svcs.filter(function (s) { return s.popular; }).slice(0, 6);
    $('popularServices').innerHTML = pop.map(function (s) {
      var c = M.catMap[s.cat];
      return '<a href="#/layanan/' + esc(s.id) + '" class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left"><span class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-blue shrink-0">' + icon(s.icon, 'w-4 h-4') + '</span><span class="flex-1 min-w-0"><span class="block text-sm font-bold text-slate-800">' + esc(s.title) + '</span><span class="text-[11px] text-slate-500">' + esc(c ? c.name : '') + '</span></span><span class="text-slate-400">' + icon('chevron-right', 'w-4 h-4') + '</span></a>';
    }).join('') || '<p class="text-sm text-slate-500">Belum ada layanan populer.</p>';
  }
  var currentCat = null;
  function renderServices(list) {
    $('servicesGrid').innerHTML = list.map(function (s) {
      var c = M.catMap[s.cat];
      return '<a href="#/layanan/' + esc(s.id) + '" class="service-card bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:border-blue/30 flex flex-col">' +
        '<div class="flex items-start justify-between gap-4"><span class="w-11 h-11 rounded-xl bg-slate-100 text-blue flex items-center justify-center shrink-0">' + icon(s.icon) + '</span><span class="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-right">' + esc(c ? c.name : '') + '</span></div>' +
        '<h3 class="text-lg font-extrabold text-navy mt-5">' + esc(s.title) + '</h3>' +
        '<p class="text-sm text-slate-500 leading-6 mt-2 flex-1">' + esc(s.desc) + '</p>' +
        '<span class="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-blue">Lihat detail ' + icon('arrow-right', 'w-4 h-4') + '</span></a>';
    }).join('');
    $('noResults').classList.toggle('hidden', list.length > 0);
    drawIcons();
  }
  function filterCategory() {
    var q = norm($('categorySearch').value.trim());
    renderServices(visibleIn(currentCat).filter(function (s) { return norm(s.title + ' ' + s.desc + ' ' + s.keywords).indexOf(q) > -1; }));
  }

  /* ---------------- Tampilan: detail layanan ---------------- */
  function sectionWrap(sec, inner) {
    var cls = { biru: 'sec-biru', hijau: 'sec-hijau', kuning: 'sec-kuning' }[sec.color] || '';
    return '<section class="mb-6 ' + cls + '">' + (sec.title ? '<h4 class="font-bold text-slate-800 mb-3">' + esc(sec.title) + '</h4>' : '') + inner + '</section>';
  }
  function renderSection(sec) {
    if (sec.type === 'catatan') {
      return '<div class="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 leading-6 flex gap-3"><span class="shrink-0 mt-0.5">' + icon('info', 'w-4 h-4') + '</span><span>' + (sec.title ? '<b>' + esc(sec.title) + '.</b> ' : '') + esc(sec.body) + '</span></div>';
    }
    if (sec.type === 'teks') return sectionWrap(sec, '<p class="text-sm text-slate-600 leading-6 whitespace-pre-line">' + esc(sec.body) + '</p>');
    if (sec.type === 'tautan') {
      return sectionWrap(sec, '<div class="grid md:grid-cols-2 gap-2">' + sec.items.map(function (x) {
        var t = clean(x.url);
        if (/^layanan:/i.test(t)) {
          return '<a href="#/layanan/' + esc(slugId(t.slice(8))) + '" class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition text-left"><span class="text-sm font-medium text-slate-700">' + esc(x.label) + '</span><span class="text-slate-400 shrink-0">' + icon('chevron-right', 'w-4 h-4') + '</span></a>';
        }
        var u = safeUrl(t);
        if (!u) return '<div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-dashed border-slate-300 bg-white/60"><span class="text-sm font-medium text-slate-500">' + esc(x.label) + '</span><span class="text-[11px] text-slate-400 shrink-0">Link belum tersedia</span></div>';
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener" data-out="' + esc(x.label) + '" class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition"><span class="text-sm font-medium text-slate-700">' + esc(x.label) + '</span><span class="text-slate-400 shrink-0">' + icon('external-link', 'w-4 h-4') + '</span></a>';
      }).join('') + '</div>');
    }
    if (sec.type === 'angka') {
      return sectionWrap(sec, '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">' + sec.items.map(function (x) {
        return '<div class="rounded-xl bg-white border border-slate-200 p-3"><div class="text-[11px] text-slate-500">' + esc(x.label) + '</div><div class="text-lg font-bold text-slate-800 mt-1">' + esc(x.value) + '</div></div>';
      }).join('') + '</div>');
    }
    // daftar (default)
    return sectionWrap(sec, '<ol class="space-y-2">' + sec.items.map(function (x, i) {
      return '<li class="flex gap-3 text-sm text-slate-600 leading-6"><span class="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-bold flex items-center justify-center">' + (i + 1) + '</span><span>' + esc(x) + '</span></li>';
    }).join('') + '</ol>');
  }
  function openService(id) {
    var s = M.svcMap[id], d = $('serviceDrawer');
    if (!s) { toast('Layanan tidak ditemukan'); location.hash = '#/'; return; }
    var c = M.catMap[s.cat];
    $('drawerCategory').textContent = c ? c.name : '';
    $('drawerTitle').textContent = s.title;
    $('drawerSummary').textContent = s.summary;
    var secs = M.isi[id] || [];
    $('drawerBody').innerHTML = '<div class="drawer-inner">' + (secs.length ? secs.map(renderSection).join('')
      : '<div class="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Belum ada informasi tambahan pada layanan ini. Silakan hubungi admin HKO.</div>') + '</div>';
    $('drawerBody').scrollTop = 0;
    d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
    document.title = s.title + ' — ' + (M.set.judul_situs || 'HKO Kanwil NTB');
    drawIcons();
    if (openedId !== id) track('service_open', { service_id: id, service_name: s.title });
    openedId = id;
  }
  var openedId = null;
  function closeServiceView() {
    var d = $('serviceDrawer');
    openedId = null;
    d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    document.title = (M.set.judul_situs || 'HKO Kanwil NTB').replace(/kanwil/i, 'Kanwil BPN');
  }

  /* ---------------- Navigasi (alamat #/...) ---------------- */
  var backTo = '#/';
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    closeMobileNav();
    if (parts[0] === 'layanan' && parts[1]) {
      var sid = decodeURIComponent(parts[1]);
      // tampilkan halaman induknya di belakang
      if ($('homeSection').classList.contains('hidden') && $('servicesSection').classList.contains('hidden')) showHome();
      openService(sid);
      markNav(M.svcMap[sid] ? M.svcMap[sid].cat : null);
      return;
    }
    closeServiceView();
    if (parts[0] === 'kategori' && parts[1] && M.catMap[decodeURIComponent(parts[1])]) {
      showCategory(decodeURIComponent(parts[1]));
      backTo = location.hash;
    } else { showHome(); backTo = '#/'; }
  }
  function markNav(key) {
    document.querySelectorAll('.nav-top').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-nav') === key); });
  }
  function showHome() {
    $('servicesSection').classList.add('hidden'); $('homeSection').classList.remove('hidden');
    markNav('home'); window.scrollTo(0, 0);
  }
  function showCategory(cat) {
    currentCat = cat; var c = M.catMap[cat];
    $('homeSection').classList.add('hidden'); $('servicesSection').classList.remove('hidden');
    $('categoryTitle').textContent = c.name; $('categoryDesc').textContent = c.desc;
    $('categorySearch').value = '';
    renderServices(visibleIn(cat));
    markNav(cat); window.scrollTo(0, 0);
  }

  /* ---------------- Pencarian ---------------- */
  var sItems = [], sActive = 0, lastFocus = null;
  function searchIndex() {
    return M.svcs.map(function (s) {
      var c = M.catMap[s.cat];
      return { type: 'service', id: s.id, title: s.title, subtitle: c ? c.name : '', desc: s.desc + ' ' + s.keywords, body: s.text, icon: s.icon };
    }).concat(M.cats.map(function (c) { return { type: 'category', id: c.id, title: c.name, subtitle: c.desc, desc: '', body: '', icon: c.icon }; }));
  }
  function score(it, q) {
    var t = norm(it.title), sub = norm(it.subtitle), d = norm(it.desc), b = norm(it.body);
    if (t === q) return 100; if (t.indexOf(q) === 0) return 80; if (t.indexOf(q) > -1) return 60;
    if (d.indexOf(q) > -1) return 40; if (sub.indexOf(q) > -1) return 30;
    var words = q.split(/\s+/).filter(Boolean);
    if (words.length && words.every(function (w) { return (t + ' ' + d + ' ' + b).indexOf(w) > -1; })) return b.indexOf(q) > -1 ? 15 : 10;
    return -1;
  }
  function renderSearch() {
    var q = norm($('searchDialogInput').value.trim()), all = searchIndex();
    if (!q) {
      sItems = all.filter(function (x) { return x.type === 'service' && M.svcMap[x.id].popular; }).concat(all.filter(function (x) { return x.type === 'category'; })).slice(0, 10);
    } else {
      sItems = all.map(function (x) { return { it: x, s: score(x, q) }; }).filter(function (x) { return x.s >= 0; })
        .sort(function (a, b) { return b.s - a.s || a.it.title.localeCompare(b.it.title); }).slice(0, 12).map(function (x) { return x.it; });
    }
    if (sActive >= sItems.length) sActive = 0;
    $('searchDialogHint').textContent = q ? sItems.length + ' hasil ditemukan. Enter membuka pilihan aktif.' : 'Layanan populer dan kategori ditampilkan untuk akses cepat.';
    var el = $('searchDialogResults');
    if (!sItems.length) {
      el.innerHTML = '<div class="search-empty"><div class="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('search-x', 'w-5 h-5 text-slate-400') + '</div><div class="font-bold text-slate-700">Tidak ada layanan yang cocok</div><div class="text-xs mt-1">Coba kata kunci yang lebih singkat.</div></div>';
    } else {
      el.innerHTML = sItems.map(function (x, i) {
        return '<button type="button" class="search-result ' + (i === sActive ? 'active' : '') + '" data-i="' + i + '" role="option" aria-selected="' + (i === sActive) + '">' +
          '<span class="search-result-icon">' + icon(x.icon, 'w-4 h-4') + '</span><span class="search-result-main"><span class="search-result-title">' + esc(x.title) + '</span><span class="search-result-meta">' + esc(x.subtitle) + '</span></span>' +
          '<span class="search-result-type">' + (x.type === 'service' ? 'Layanan' : 'Kategori') + '</span></button>';
      }).join('');
    }
    drawIcons();
  }
  function updateActive() {
    var nodes = $('searchDialogResults').querySelectorAll('[data-i]');
    nodes.forEach(function (n, i) { n.classList.toggle('active', i === sActive); n.setAttribute('aria-selected', i === sActive); });
    if (nodes[sActive]) nodes[sActive].scrollIntoView({ block: 'nearest' });
  }
  function chooseActive() {
    var it = sItems[sActive]; if (!it) return;
    closeSearch(false);
    if (it.type === 'service') track('search_select', { service_id: it.id, query: $('searchDialogInput').value });
    location.hash = it.type === 'service' ? '#/layanan/' + it.id : '#/kategori/' + it.id;
  }
  function openSearch() {
    var d = $('searchDialog'); if (d.classList.contains('open')) return;
    lastFocus = document.activeElement;
    d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
    $('searchDialogInput').value = ''; sActive = 0; renderSearch();
    requestAnimationFrame(function () { $('searchDialogInput').focus(); });
  }
  function closeSearch(restore) {
    var d = $('searchDialog');
    d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
    if (restore !== false && lastFocus && lastFocus.focus) setTimeout(function () { lastFocus.focus(); }, 0);
  }

  /* ---------------- Menu HP ---------------- */
  function closeMobileNav() {
    var p = $('mobileNavPanel'), t = $('mobileNavToggle'); if (!p || p.classList.contains('hidden')) return;
    p.classList.add('hidden'); t.setAttribute('aria-expanded', 'false'); t.innerHTML = icon('menu'); drawIcons();
  }

  /* ---------------- Pasang event (sekali) ---------------- */
  function wire() {
    window.addEventListener('hashchange', route);
    $('drawerClose').addEventListener('click', function () { location.hash = backTo; });
    $('drawerShare').addEventListener('click', function () {
      var url = location.href;
      var done = function () { toast('Link halaman disalin'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Salin link ini:', url); });
      else prompt('Salin link ini:', url);
    });
    $('categorySearch').addEventListener('input', filterCategory);
    $('searchInput').addEventListener('click', openSearch);
    $('searchInput').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSearch(); } });
    $('searchDialogInput').addEventListener('input', function () { sActive = 0; renderSearch(); });
    $('searchDialogInput').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (sItems.length) { sActive = (sActive + 1) % sItems.length; updateActive(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (sItems.length) { sActive = (sActive - 1 + sItems.length) % sItems.length; updateActive(); } }
      else if (e.key === 'Enter') { e.preventDefault(); chooseActive(); }
    });
    $('searchDialogResults').addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]'); if (!b) return; sActive = +b.getAttribute('data-i'); chooseActive();
    });
    $('searchDialogResults').addEventListener('mousemove', function (e) {
      var b = e.target.closest('[data-i]'); if (!b || +b.getAttribute('data-i') === sActive) return; sActive = +b.getAttribute('data-i'); updateActive();
    });
    $('searchDialogBackdrop').addEventListener('click', function () { closeSearch(); });
    $('searchDialogClose').addEventListener('click', function () { closeSearch(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($('searchDialog').classList.contains('open')) closeSearch();
        else if ($('serviceDrawer').classList.contains('open')) location.hash = backTo;
      }
      // Ctrl/⌘ + K membuka pencarian
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    });
    // Tutup dropdown setelah salah satu menu diklik
    $('desktopNav').addEventListener('click', function (e) {
      var dd = e.target.closest('.nav-dd'); if (!dd) return;
      dd.classList.add('suppress'); if (document.activeElement) document.activeElement.blur();
    });
    $('desktopNav').addEventListener('mouseover', function (e) {
      document.querySelectorAll('.nav-dd.suppress').forEach(function (dd) { if (!dd.contains(e.target)) dd.classList.remove('suppress'); });
    });
    $('desktopNav').addEventListener('mouseleave', function () {
      document.querySelectorAll('.nav-dd.suppress').forEach(function (dd) { dd.classList.remove('suppress'); });
    });
    // Menu HP
    $('mobileNavToggle').addEventListener('click', function () {
      var p = $('mobileNavPanel'), opening = p.classList.contains('hidden');
      p.classList.toggle('hidden'); this.setAttribute('aria-expanded', opening);
      this.innerHTML = icon(opening ? 'x' : 'menu'); drawIcons();
    });
    document.addEventListener('pointerdown', function (e) {
      var p = $('mobileNavPanel');
      if (!p.classList.contains('hidden') && !p.contains(e.target) && !$('mobileNavToggle').contains(e.target)) closeMobileNav();
    });
    window.addEventListener('resize', function () { if (window.innerWidth >= 1024) closeMobileNav(); });
    // Statistik klik
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-track],a[data-out]'); if (!a) return;
      if (a.hasAttribute('data-track')) track('contact_click', { channel: a.getAttribute('data-track') });
      else track('link_click', { link_text: a.getAttribute('data-out'), link_url: a.href });
    });
  }

  /* ---------------- Logo ---------------- */
  function setupLogo() {
    var img = $('siteLogo');
    img.onerror = function () { img.onerror = null; img.src = CFG.LOGO_CADANGAN; };
    var test = new Image();
    test.onload = function () { $('favicon').href = CFG.LOGO_LOKAL; };
    test.src = CFG.LOGO_LOKAL;
  }

  /* ---------------- Mulai ---------------- */
  var appliedJSON = '';
  function apply(raw, source) {
    var json = JSON.stringify(raw);
    if (json === appliedJSON) return false;
    appliedJSON = json;
    M = buildModel(raw);
    renderSettings(); renderNav(); renderPopular();
    route();
    drawIcons();
    var st = $('dataStatus');
    if (st) st.textContent = source;
    return true;
  }
  function start() {
    $('currentYear').textContent = new Date().getFullYear();
    setupLogo();
    wire();
    var cache = CFG.SHEET_ID ? readCache() : null;
    if (cache) apply(cache.raw, 'Data tersimpan ' + new Date(cache.t).toLocaleString('id-ID'));
    else apply(window.HKO_CADANGAN || {}, CFG.SHEET_ID ? 'Memuat data terbaru…' : 'Data cadangan');
    if (!CFG.SHEET_ID) return;
    loadFromSheet().then(function (raw) {
      writeCache(raw);
      apply(raw, 'Data terbaru dari spreadsheet');
      var st = $('dataStatus'); if (st) st.textContent = 'Data terbaru dari spreadsheet';
    }).catch(function (err) {
      console.warn('[HKO] Spreadsheet tidak bisa dimuat, memakai data cadangan:', err && err.message);
      var st = $('dataStatus'); if (st) st.textContent = cache ? 'Data tersimpan (spreadsheet tidak terjangkau)' : 'Data cadangan (spreadsheet tidak terjangkau)';
    });
  }

  // fungsi yang bisa dipanggil dari konsol bila perlu
  window.HKO = { reload: function () { try { localStorage.removeItem(CACHE_KEY); } catch (e) { } location.reload(); }, model: function () { return M; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
