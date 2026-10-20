// Çerçevenin içinde koşan betikler (düz metin: çerçevede derleyici yok, eski sözdizimi bilerek). Uygulamanın kodu değişmez.
// Ayar, kabuğun sayfaya yazdığı `window.__TMI_KM` nesnesidir: { koken, kisi, yonetici, kisiler, onaylayabilir }.
export const VERI_KANALI = 'tmi-kalite-merkezi';

// 1. Uygulamadan ÖNCE: uygulamanın yerel sunucuya attığı `api/...` istekleri (sunucu.py sözleşmesi) iletiyle kabuğa gider;
//    kabuktaki köprü (kopru.ts) onları TMI uçlarına çevirir. Çerçeve hiçbir adrese istek atmaz (içerik politikası kapatır).
//    Çerçevenin adresi about:srcdoc'tur ve göreli adres ona göre çözülemez; yazı tanıma kitaplığı işçi dosya adlarını sayfa adresine
//    göre çözer (bu adlar istek olmaz, işçinin içinde karşılanır). Göreli adres yalnız bu durumda yer tutucu tabana göre çözülür.
export const ON_BETIK = String.raw`(function () {
  'use strict';
  var A = window.__TMI_KM || {};
  var UST = window.parent;
  var KANAL = 'tmi-kalite-merkezi';
  var sira = 0;
  var bekleyen = new Map();
  window.addEventListener('message', function (e) {
    if (e.source !== UST) return;
    var m = e.data;
    if (!m || m.kanal !== KANAL || m.yon !== 'yanit') return;
    var b = bekleyen.get(m.id);
    if (!b) return;
    bekleyen.delete(m.id);
    b(m);
  });
  function istek(veri) {
    return new Promise(function (ok) {
      var id = ++sira;
      bekleyen.set(id, ok);
      UST.postMessage({ kanal: KANAL, yon: 'istek', id: id, tip: 'api', veri: veri }, A.koken);
    });
  }
  var AsilURL = window.URL;
  var KmURL = function (adres, taban) {
    if (arguments.length < 2 || taban === undefined) return new AsilURL(adres);
    try { return new AsilURL(adres, taban); } catch (h) {
      if (String(taban).indexOf('about:') === 0) return new AsilURL(adres, 'http://km.invalid/');
      throw h;
    }
  };
  KmURL.prototype = AsilURL.prototype;
  ['createObjectURL', 'revokeObjectURL', 'canParse', 'parse'].forEach(function (ad) {
    if (typeof AsilURL[ad] === 'function') KmURL[ad] = AsilURL[ad].bind(AsilURL);
  });
  window.URL = KmURL;
  var asil = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (girdi, secenek) {
    var adres = typeof girdi === 'string' ? girdi : (girdi && girdi.url) || '';
    if (!/^api\//.test(adres)) return asil ? asil(girdi, secenek) : Promise.reject(new TypeError('fetch yok'));
    var s = secenek || {};
    var govde = s.body === undefined || s.body === null ? null : s.body;
    var yontem = String(s.method || 'GET').toUpperCase();
    // Kayıt formu açıldığındaki "guncelleme" değeri (sayfa.ts uygulamanın save'ine yazdırır) aynı kaydın yazmasına eklenir;
    // köprü onu bildiği son hâlle karşılaştırır. Değer bir kez kullanılır: başka bir yazmaya taşınmaz.
    var taban = window.__TMI_KM_TABAN;
    if (yontem === 'PUT') window.__TMI_KM_TABAN = undefined;
    if (yontem === 'PUT' && taban && typeof taban.t === 'string' &&
        adres === 'api/doc/' + encodeURIComponent(taban.c) + '/' + encodeURIComponent(taban.id)) {
      adres += '?taban=' + encodeURIComponent(taban.t);
    }
    return istek({ adres: adres, yontem: yontem, govde: govde }).then(function (c) {
      var ikili = c.blob instanceof Blob;
      return new Response(ikili ? c.blob : JSON.stringify(c.json === undefined ? null : c.json), {
        status: c.durum,
        headers: { 'Content-Type': ikili ? (c.blob.type || 'application/octet-stream') : 'application/json' }
      });
    });
  };
})();`;

// 2. Uygulamadan SONRA: kabuğun ikinci menüsüyle `tmi-gorunum` sözleşmesi (istemci/src/ortak/rota/cerceve-iletisi.ts kuralları,
//    elle yazımı). Görünüm adı uygulamanın görünüm kimliğidir (UI.view); "ayarlar" uygulamanın ayar penceresini açar.
//    Uygulamanın kendi `render`'ı sarılır: kullanıcının içeride yaptığı geçiş her çizimden sonra bildirilir.
export const SON_BETIK = String.raw`(function () {
  'use strict';
  var A = window.__TMI_KM || {};
  var UST = window.parent;
  var GK = 'tmi-gorunum';
  var GS = 1;
  var alinan = 0;
  var uygulanan = 0;
  var son = null;
  var yineleyici = null;
  function gonder(m) { m.kanal = GK; m.surum = GS; UST.postMessage(m, A.koken); }
  function yinelemeyiBirak() { clearInterval(yineleyici); yineleyici = null; }
  function bildir() {
    if (uygulanan > 0 || typeof UI === 'undefined') return;
    if (UI.view === son) return;
    son = UI.view;
    gonder({ tip: 'gorunum-degisti', gorunum: son, sira: alinan });
  }
  var asilCiz = render;
  render = function () {
    var r = asilCiz.apply(this, arguments);
    bildir();
    return r;
  };
  // Ayarlar bir görünüm değil, penceredir: kapanınca altta duran görünüm bildirilir, yoksa kabuğun adresi "ayarlar"da kalır
  // ve aynı menü maddesi pencereyi yeniden açamaz. Kaydedilmemiş değişiklik sorusunda pencere açık kalır; o zaman bildirilmez.
  var asilKapat = closeModal;
  closeModal = function () {
    var r = asilKapat.apply(this, arguments);
    var p = document.getElementById('modal');
    if (!p || p.hidden) bildir();
    return r;
  };
  window.addEventListener('message', function (e) {
    if (e.source !== UST) return;
    var m = e.data;
    if (!m || m.kanal !== GK || m.surum !== GS || m.tip !== 'gorunum' || typeof m.gorunum !== 'string' || m.gorunum === ''
        || typeof m.sira !== 'number' || Math.floor(m.sira) !== m.sira || m.sira < 1) return;
    yinelemeyiBirak();
    alinan = m.sira;
    uygulanan += 1;
    try {
      if (m.gorunum === 'ayarlar') { openSettings(); son = 'ayarlar'; }
      else if (VIEWS.some(function (v) { return v.id === m.gorunum; })) { son = m.gorunum; go(m.gorunum); }
    } finally { uygulanan -= 1; }
  });
  gonder({ tip: 'hazir' });
  var kalan = 20;
  yineleyici = setInterval(function () { if (kalan-- <= 0) { yinelemeyiBirak(); return; } gonder({ tip: 'hazir' }); }, 250);
})();`;

// 258 a (19.10.2026): kapanmış NCR ve sonuçlanmış (Kabul, Ret) muayene sunucuda kilitlidir; uygulamanın kalite mühendisine açtığı
// "kilidi aç" yolu sunucuda reddedileceği için gösterilmez. Öteki kayıtların kilidi uygulamanındır.
export const KILIT_BETIGI = String.raw`(function () {
  var asilKilit = guardEdit;
  guardEdit = function (col, rec, cb) {
    var alan = function (a) { return rec && typeof rec[a] === 'string' ? rec[a].trim() : ''; };
    if ((col === 'ncr' && alan('durum') === 'Kapalı') || (col === 'insp' && (alan('sonuc') === 'Kabul' || alan('sonuc') === 'Ret'))) {
      toast('Kapanmış uygunsuzluk ve sonuçlanmış muayene değiştirilemez; düzeltme yeni kayıtla yapılır.', 'bad');
      return;
    }
    return asilKilit.apply(this, arguments);
  };
})();`;

// KM-K90: NCR kapanışı karantinadaki partiyi serbest bırakırken partinin önceki konumu bilinmiyorsa sunucu 422 döner. Uygulamanın
// kaydetmesi beklerken konum küçük pencerede seçilir ve aynı yazma seçilen konumla bir kez daha gider; vazgeçilirse ilk cevap döner
// (uygulama kaydedemedi der, form açık kalır). Pencere uygulamanın onay penceresidir (#modal2); kayıt formu altta açık kalır.
// Kapanış partiyi serbest bırakamadıysa (NCR dışı red, başka açık NCR) sunucunun tek satırlık nedeni bildirim olarak gösterilir.
export const KARANTINA_HEDEF_BETIGI = String.raw`(function () {
  var oncekiFetch = window.fetch;
  var ILETI = 'önceki konumu bilinmiyor';
  function konumSor(ileti) {
    return oncekiFetch('api/karantina-konumlari').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var konumlar = j && Array.isArray(j.konumlar) ? j.konumlar : [];
      return new Promise(function (ok) {
        var c = document.getElementById('modal2');
        var secenek = konumlar.map(function (k) {
          return '<option value="' + k.id + '">' + esc(k.kod + (k.ad ? ' ' + k.ad : '')) + '</option>';
        }).join('');
        c.innerHTML = '<div class="mcard narrow" role="dialog" aria-modal="true"><div class="mhead"><h3>Serbest bırakılacak konum</h3></div>' +
          '<div class="mbody"><p>' + esc(ileti) + '</p><label class="fld"><span>Konum *</span><select id="tmiKarantinaHedef">' +
          '<option value="">Seçin</option>' + secenek + '</select></label></div>' +
          '<div class="mfoot"><button class="btn gh" data-no>Vazgeç</button><button class="btn" data-yes>Serbest bırak</button></div></div>';
        c.hidden = false;
        c.querySelector('[data-no]').onclick = function () { closeConfirm(); ok(null); };
        c.querySelector('[data-yes]').onclick = function () {
          var id = Number(c.querySelector('#tmiKarantinaHedef').value);
          if (!(id > 0)) { toast('Konum seçin.', 'bad'); return; }
          closeConfirm();
          ok(id);
        };
      });
    });
  }
  function uyariGoster(c) {
    if (!c.ok) return c;
    return c.clone().json().then(function (j) {
      if (j && typeof j.uyari === 'string' && j.uyari !== '') toast(j.uyari, 'bad');
      return c;
    }, function () { return c; });
  }
  window.fetch = function (girdi, secenek) {
    var cevap = oncekiFetch(girdi, secenek);
    var adres = typeof girdi === 'string' ? girdi : '';
    if (String((secenek && secenek.method) || '').toUpperCase() !== 'PUT' || adres.indexOf('api/doc/ncr/') !== 0) return cevap;
    return cevap.then(function (c) {
      if (c.status !== 422) return uyariGoster(c);
      return c.clone().json().then(function (j) {
        if (!j || typeof j.hata !== 'string' || j.hata.indexOf(ILETI) < 0) return c;
        return konumSor(j.hata).then(function (id) {
          if (id === null) return c;
          return oncekiFetch(adres + (adres.indexOf('?') < 0 ? '?' : '&') + 'karantinaHedef=' + id, secenek).then(uyariGoster);
        });
      }, function () { return c; });
    });
  };
})();`;

// 320 a: Olduğu gibi kullan ya da Tamir kararıyla kapanan NCR'nin bırakacağı partiler varsa kapanış yazılmadan önce parti
// başına serbest bırakılan miktar sorulur; varsayılan partinin bütün red miktarıdır. Bütünü bırakılan parti gönderilmez, kalan red ve
// yerinde kalır. Pencere uygulamanın onay penceresidir (#modal2); vazgeçilirse kapanış gitmez ve form açık kalır.
export const SERBEST_MIKTAR_BETIGI = String.raw`(function () {
  var oncekiFetch = window.fetch;
  var BIRAKAN = ['Olduğu gibi kullan', 'Tamir'];
  var MIKTAR = /^\d{1,11}(\.\d{1,3})?$/;
  function kapanisMi(secenek) {
    try {
      var g = JSON.parse(String(secenek && secenek.body));
      var metin = function (a) { return g && typeof g[a] === 'string' ? g[a].trim() : ''; };
      return metin('durum') === 'Kapalı' && BIRAKAN.some(function (k) { return metin('mrb').indexOf(k) === 0; });
    } catch (e) { return false; }
  }
  function sor(partiler) {
    return new Promise(function (ok) {
      var c = document.getElementById('modal2');
      var satirlar = partiler.map(function (p, i) {
        return '<label class="fld"><span>' + esc('Lot ' + (p.lotNo || p.partiId) + ' (red: ' + p.redMiktar + ')') + '</span>' +
          '<input id="tmiSerbest' + i + '" inputmode="decimal" value="' + esc(p.redMiktar) + '"></label>';
      }).join('');
      c.innerHTML = '<div class="mcard narrow" role="dialog" aria-modal="true"><div class="mhead"><h3>Serbest bırakılan adet</h3></div>' +
        '<div class="mbody"><p>Kalan miktar karantinada kalır.</p>' + satirlar + '</div>' +
        '<div class="mfoot"><button class="btn gh" data-no>Vazgeç</button><button class="btn" data-yes>Kapat</button></div></div>';
      c.hidden = false;
      c.querySelector('[data-no]').onclick = function () { closeConfirm(); ok(null); };
      c.querySelector('[data-yes]').onclick = function () {
        var secilen = [];
        for (var i = 0; i < partiler.length; i++) {
          var v = String(c.querySelector('#tmiSerbest' + i).value).trim().replace(',', '.');
          if (!MIKTAR.test(v) || !(Number(v) > 0) || Number(v) > Number(partiler[i].redMiktar)) { toast('Miktar sıfırdan büyük ve red miktarından az ya da eşit olmalı.', 'bad'); return; }
          if (Number(v) !== Number(partiler[i].redMiktar)) secilen.push({ partiId: partiler[i].partiId, miktar: v });
        }
        closeConfirm();
        ok(secilen);
      };
    });
  }
  window.fetch = function (girdi, secenek) {
    var adres = typeof girdi === 'string' ? girdi : '';
    if (String((secenek && secenek.method) || '').toUpperCase() !== 'PUT' || adres.indexOf('api/doc/ncr/') !== 0 || !kapanisMi(secenek)) {
      return oncekiFetch(girdi, secenek);
    }
    var kimlik = adres.slice('api/doc/ncr/'.length).split('?')[0];
    return oncekiFetch('api/karantina-partileri/' + kimlik).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }).then(function (j) {
      var partiler = j && Array.isArray(j.partiler) ? j.partiler.filter(function (p) { return Number(p.redMiktar) > 0; }) : [];
      if (partiler.length === 0) return oncekiFetch(girdi, secenek);
      return sor(partiler).then(function (secilen) {
        if (secilen === null) return new Response(JSON.stringify({ hata: 'Kapanış gönderilmedi.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        if (secilen.length === 0) return oncekiFetch(girdi, secenek);
        return oncekiFetch(adres + (adres.indexOf('?') < 0 ? '?' : '&') + 'serbest=' + encodeURIComponent(JSON.stringify(secilen)), secenek);
      });
    });
  };
})();`;

// Giriş TMI oturumudur, ayrı PIN yoktur (yazılı onay 2026-10-16). Uygulamanın kullanıcısı oturumdaki kişidir; rolü uygulamanın
// kullanıcı kaydından (kimliği "tmi-<kişi>") gelir, kaydı olmayan ya da pasif kişi Muayeneci, TMI yöneticisi Kalite yöneticisidir.
// Uygulamanın giriş kapısı (sayfa.ts) bunu çağırır; uygulamadan önce tanımlanır, uygulamanın değişkenlerini çağrıldığında okur.
export const KIMLIK_BETIGI = String.raw`function tmiKullanici() {
  var A = window.__TMI_KM, T = A.kisi, uid = 'tmi-' + T.id;
  var r = (S.kullanici || []).find(function (x) { return x._id === uid && x.aktif !== false; });
  var rol = A.yonetici ? 'Kalite yöneticisi' : (r && ROLLER.indexOf(r.rol) >= 0 ? r.rol : 'Muayeneci');
  if (!USER || USER._id !== uid) { ME.dolduran = T.ad; ME.muayeneci = T.ad; }
  USER = { _id: uid, ad: T.ad, rol: rol };
}`;

// Uygulamadan SONRA: kullanıcı formu PIN yerine TMI kişisini seçtirir (uygulamanınkinin yerine geçer; sunucu kullanıcı kaydını
// yalnız yöneticiden alır ve PIN alanını saklamaz). Ad, rol ve durum alanları uygulamanınkiyle aynıdır.
export const KULLANICI_BETIGI = String.raw`function openUser(id) {
  if (!need('kullanici')) return;
  var u = id ? (S.kullanici || []).find(function (x) { return x._id === id; }) : null;
  var K = window.__TMI_KM.kisiler || [];
  var atanan = (S.kullanici || []).map(function (x) { return x._id; });
  var secenek = [['', 'Seçin']].concat(K.filter(function (k) { return atanan.indexOf('tmi-' + k.id) < 0; })
    .map(function (k) { return [String(k.id), k.ad]; }));
  var F = [u ? { k: 'ad', label: 'Ad soyad', req: 1, w: 'h' } : { k: 'kisi', label: 'Kişi', type: 'select', req: 1, w: 'h', options: secenek },
    { k: 'rol', label: 'Rol', type: 'select', options: ROLLER, def: 'Muayeneci' },
    { k: 'aktif', label: 'Durum', type: 'bool', boolLabel: 'Aktif', def: true }];
  formModal(u ? u.ad + ' düzenle' : 'Kullanıcı ekle', F, u ? Object.assign({}, u) : null, async function (d) {
    var k = u ? null : K.find(function (x) { return String(x.id) === d.kisi; });
    if (!u && !k) { toast('Kişi seçin.', 'bad'); return; }
    var rec = Object.assign({}, u || {}, { ad: u ? d.ad : k.ad, rol: d.rol, aktif: d.aktif, _id: u ? u._id : 'tmi-' + k.id });
    delete rec.pin;
    await save('kullanici', rec);
    closeModal(true);
    toast('Kullanıcı kaydedildi');
  }, '<div class="note mt">Giriş TMI oturumuyla yapılır. TMI yöneticisi her zaman Kalite yöneticisidir; burada rolü verilmeyen kişi Muayeneci sayılır.</div>');
}`;

// Onaylı formun onayını geri alma (kullanıcı kararı 17.10.2026, "Eklensin"): form listesindeki düğme yalnız onay işlemi olana
// görünür (sayfa.ts). Onay sunucuda geri alınır; form taslağa döner, geri alan ve saat sunucudan yazılır, liste akışla yenilenir.
export const ONAY_GERI_BETIGI = String.raw`function tmiOnayGeriAl(id) {
  var r = (S.frm || []).find(function (x) { return x._id === id; });
  if (!r || r.durum !== 'Onaylandı' || !window.__TMI_KM.onaylayabilir) return;
  var m = formModal(r.kod + ' onayını geri al', [], null, async function () {
    var c = await fetch('api/onay-geri-al/frm/' + encodeURIComponent(id), { method: 'POST' });
    if (!c.ok) {
      var j = null;
      try { j = await c.json(); } catch (h) { j = null; }
      toast((j && j.hata) || 'Onay geri alınamadı.', 'bad');
      return;
    }
    closeModal(true);
    toast('Onay geri alındı; form taslağa döndü');
  }, '<div class="note mt">Form taslağa döner ve yeniden düzenlenebilir. Onayı geri alan kişi ve saat kayda yazılır.</div>');
  // Uygulamanın penceresi tek düğme adı bilir ("Kaydet"); bu pencerenin işi onayı geri almaktır (kullanıcı kararı 17.10.2026).
  var dugme = m && m.querySelector ? m.querySelector('[data-save]') : null;
  if (dugme) dugme.textContent = 'Onayı geri al';
}`;

// 325 a: Bugün görünümünün başına, ilk parça kararı bekleyen emirlerin listesi (Onayla / Reddet). Liste ve karar kabuktaki köprüden
// gider (api/ilk-parca/...); bölüm yalnız onay işlemi olana çizilir, sunucu ayrıca denetler. Boş listede bölüm görünmez. Liste en çok
// 15 saniyede bir yenilenir (her çizim sunucuya gitmez); karardan sonra hemen yenilenir. Ret, geri alınamadığı için önce sorulur.
export const ILK_PARCA_BETIGI = String.raw`(function () {
  var A = window.__TMI_KM || {};
  var durum = { liste: null, an: 0, bekliyor: false };
  var gonderilen = {};
  var asilHtml = vToday.html;
  var asilMount = vToday.mount;
  function yukle() {
    if (!A.onaylayabilir || durum.bekliyor) return;
    if (durum.an > 0 && Date.now() - durum.an < 15000) return;
    durum.bekliyor = true;
    window.fetch('api/ilk-parca/bekleyenler').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      durum.bekliyor = false;
      durum.an = Date.now();
      var yeni = j && Array.isArray(j.emirler) ? j.emirler : null;
      if (yeni === null) return;
      var degisti = JSON.stringify(yeni) !== JSON.stringify(durum.liste);
      durum.liste = yeni;
      if (degisti && UI.view === 'today') render();
    }, function () { durum.bekliyor = false; durum.an = Date.now(); });
  }
  function bolum() {
    var L = durum.liste;
    if (!L || L.length === 0) return '';
    return '<section class="tgroup" id="tmiIlkParca"><h2>' + sico('check') + ' İlk parça kararı <span class="muted">' + L.length + '</span></h2><ul class="tlist">' +
      L.map(function (e) {
        return '<li class="p1"><div class="tl-t"><b>' + esc(e.emirNo) + ' | ' + esc(e.parcaNo) + '</b><small>' + esc(e.parcaAd) + ' | emir ' + e.adet +
          ' adet | karar bekleyen ' + e.kararBekleyenAdet + ' adet</small></div><span class="tl-b"><button class="btn sm" data-ip-onay="' + e.uretimEmriId +
          '">Onayla</button> <button class="btn gh sm" data-ip-ret="' + e.uretimEmriId + '">Reddet</button></span></li>';
      }).join('') + '</ul></section>';
  }
  function karar(id, secim) {
    if (gonderilen[id]) return Promise.resolve();
    gonderilen[id] = true;
    return window.fetch('api/ilk-parca/' + id + '/karar', { method: 'POST', body: JSON.stringify({ karar: secim }) }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: r.ok, j: null }; });
    }, function () { return { ok: false, j: null }; }).then(function (s) {
      delete gonderilen[id];
      if (!s.ok) { toast((s.j && s.j.hata) || 'Karar verilemedi.', 'bad'); return; }
      toast((secim === 'onay' ? 'İlk parça onaylandı' : 'İlk parça reddedildi') + (s.j && typeof s.j.adet === 'number' ? ': ' + s.j.adet + ' adet' : ''));
      durum.liste = (durum.liste || []).filter(function (e) { return e.uretimEmriId !== id; });
      durum.an = 0;
      if (UI.view === 'today') render();
      yukle();
    });
  }
  vToday.html = function () {
    var h = asilHtml.apply(this, arguments);
    if (!A.onaylayabilir) return h;
    yukle();
    var b = bolum();
    var yer = h.indexOf('<section class="tiles">');
    return b === '' ? h : (yer < 0 ? b + h : h.slice(0, yer) + b + h.slice(yer));
  };
  vToday.mount = function () {
    if (asilMount) asilMount.apply(this, arguments);
    document.querySelectorAll('#tmiIlkParca [data-ip-onay]').forEach(function (d) {
      d.onclick = function () { karar(Number(d.getAttribute('data-ip-onay')), 'onay'); };
    });
    document.querySelectorAll('#tmiIlkParca [data-ip-ret]').forEach(function (d) {
      d.onclick = function () {
        var id = Number(d.getAttribute('data-ip-ret'));
        var e = (durum.liste || []).filter(function (x) { return x.uretimEmriId === id; })[0];
        if (!e) return;
        confirmBox('İlk parça reddi', esc(e.emirNo) + ' emrinin karar bekleyen ' + e.kararBekleyenAdet + ' adedi reddedilir ve red olarak ayrılır. Bu işlem geri alınamaz.',
          'Reddet', function () { karar(id, 'ret'); }, true);
      };
    });
  };
})();`;

// 326 a: kayıt formundaki "Geçmiş" penceresine, uygulamanın kendi izinin altına sunucudaki önceki sürümler eklenir (salt okunur): her
// sürümün değiştiren kişisi ve zamanı, önceki hâlinden farklı olan alanlar (önceki ve sonraki değer). Sunucu kaydın her değişikliğinde
// önceki gövdeyi silinemez geçmişe yazar; uygulamanın izi eksik kalabilir, sunucudaki geçmiş eksiksizdir.
export const GECMIS_BETIGI = String.raw`(function () {
  var asilGecmis = historyFor;
  var YOK_SAY = { _id: true, guncelleme: true };
  function kisa(v) {
    if (v === null || v === undefined || v === '') return '—';
    var m = typeof v === 'string' ? v : JSON.stringify(v);
    if (/^data:/.test(m)) return '(dosya)';
    return m.length > 80 ? m.slice(0, 80) + '…' : m;
  }
  function an(iso) {
    var t = new Date(iso);
    return isNaN(t.getTime()) ? '—' : t.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function farklar(onceki, sonraki) {
    var anahtarlar = {};
    Object.keys(onceki).forEach(function (k) { anahtarlar[k] = true; });
    Object.keys(sonraki).forEach(function (k) { anahtarlar[k] = true; });
    return Object.keys(anahtarlar).filter(function (k) {
      return !YOK_SAY[k] && JSON.stringify(onceki[k]) !== JSON.stringify(sonraki[k]);
    }).map(function (k) { return { alan: k, onceki: onceki[k], sonraki: sonraki[k] }; });
  }
  function satirlar(surumler, col, id) {
    var simdiki = (S[col] || []).filter(function (x) { return x._id === id; })[0] || null;
    return surumler.map(function (s, i) {
      var sonraki = i === 0 ? simdiki : surumler[i - 1].govde;
      var ust = '<b>' + esc(an(s.degisti)) + '</b> | ' + esc(s.degistiren || 'Bilinmiyor') +
        '<span class="two">Önceki hâli: ' + esc(an(s.yazildi)) + ' | ' + esc(s.yazan || 'Bilinmiyor') + ' | sürüm ' + s.surum + '</span>';
      if (sonraki === null) return '<tr><td>' + ust + '</td><td colspan="3">Kayıt silindi.</td></tr>';
      var f = farklar(s.govde, sonraki);
      if (f.length === 0) return '<tr><td>' + ust + '</td><td colspan="3" class="muted">Yalnız kayıt zamanı değişti.</td></tr>';
      var goster = f.slice(0, 12);
      return goster.map(function (x, j) {
        return '<tr>' + (j === 0 ? '<td rowspan="' + (goster.length + (f.length > 12 ? 1 : 0)) + '">' + ust + '</td>' : '') +
          '<td>' + esc(x.alan) + '</td><td>' + esc(kisa(x.onceki)) + '</td><td>' + esc(kisa(x.sonraki)) + '</td></tr>';
      }).join('') + (f.length > 12 ? '<tr><td colspan="3" class="muted">+' + (f.length - 12) + ' alan daha</td></tr>' : '');
    }).join('');
  }
  historyFor = function (col, id) {
    var r = asilGecmis.apply(this, arguments);
    var kap = document.querySelector('#modal2 .mbody');
    if (!kap) return r;
    var b = document.createElement('div');
    b.id = 'tmiGecmis';
    b.innerHTML = '<h3 class="wq mt">Önceki sürümler</h3><p class="muted">Yükleniyor…</p>';
    kap.appendChild(b);
    var yaz = function (html) { if (b.isConnected) b.innerHTML = '<h3 class="wq mt">Önceki sürümler</h3>' + html; };
    window.fetch('api/gecmis/' + encodeURIComponent(col) + '/' + encodeURIComponent(id)).then(function (c) { return c.ok ? c.json() : null; }).then(function (j) {
      if (!j || !Array.isArray(j.surumler)) { yaz('<p class="muted">Önceki sürümler okunamadı.</p>'); return; }
      if (j.surumler.length === 0) { yaz('<p class="muted">Bu kaydın önceki sürümü yok (sunucu geçmişi bu kayıt değişince başlar).</p>'); return; }
      yaz('<div class="tblw"><table><thead><tr><th>Değişiklik</th><th>Alan</th><th>Önceki</th><th>Sonraki</th></tr></thead><tbody>' + satirlar(j.surumler, col, id) + '</tbody></table></div>');
    }, function () { yaz('<p class="muted">Önceki sürümler okunamadı.</p>'); });
    return r;
  };
})();`;
