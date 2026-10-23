// Çerçevenin içinde, uygulama paketinden sonra koşan açılış betiği. İki işi var:
// 1. Veri: uygulamanın depolama bağdaştırıcısı (load, saveRecord, ...) istekleri `tmi-ik-veri` kanalıyla kabuğa yollar;
//    kabuktaki köprü (kopru.ts) onları TMI uçlarına çevirir. Çerçeve hiçbir adrese istek atmaz (içerik politikası kapatır).
// 2. Görünüm: kabuğun ikinci menüsüyle `tmi-gorunum` sözleşmesi (istemci/src/ortak/rota/cerceve-iletisi.ts kuralları,
//    elle yazımı): hazır yinelemesi, gelen görünümün uygulanması, kullanıcının içerideki geçişinin bildirilmesi.
// 3. Ctrl K (karar 102 a): kabuğun ortak paletidir; çerçevede basılan tuş uygulamanın aramasına ulaşmadan kabuğa gider.
//    Uygulamanın araması "İK'da ara" komutuyla paletin "Bu sayfa" grubundan açılır (uygulama arama sonuçlarını dışa vermez).
// Ayar, kabuğun sayfaya yazdığı `window.__TMI_IK` nesnesidir: { koken, tema, kapali }. Sonraki tema değişikliği `tmi-ik-veri`
// kanalında `tema` iletisiyle gelir.
export const VERI_KANALI = 'tmi-ik-veri';

export const CERCEVE_ACILISI = String.raw`(function () {
  'use strict';
  var A = window.__TMI_IK || {};
  var TEMA = A.tema === 'dark' ? 'dark' : 'light';
  var KOKEN = A.koken;
  var UST = window.parent;
  var VERI = 'tmi-ik-veri';
  var GK = 'tmi-gorunum';
  var GS = 1;
  var sira = 0;
  var bekleyen = new Map();
  function istek(tip, veri) {
    return new Promise(function (ok, red) {
      var id = ++sira;
      var t = setTimeout(function () { bekleyen.delete(id); red(new Error('TMI yanıt vermedi.')); }, 120000);
      bekleyen.set(id, { ok: function (v) { clearTimeout(t); ok(v); }, red: function (v) { clearTimeout(t); red(v); } });
      UST.postMessage({ kanal: VERI, yon: 'istek', id: id, tip: tip, veri: veri }, KOKEN);
    });
  }

  var degisti = null;
  var ayna = new Map();
  var ayarlar = null;
  function yamaUygula(v) {
    if (!v) return;
    if (v.tam) ayna = new Map();
    (v.kayitlar || []).forEach(function (r) { ayna.set(r.id, r); });
    (v.silinen || []).forEach(function (id) { ayna.delete(id); });
    if (v.ayarlar !== undefined) ayarlar = v.ayarlar;
    if (degisti) degisti({ records: Array.from(ayna.values()), settings: ayarlar });
  }

  var depo = {
    kind: 'tmi',
    label: 'Kayıtlar TMI veritabanında.',
    description: 'Kayıtlar TMI sunucusunda tutulur; kim neyi görür ve değiştirir, TMI yetkileriyle belirlenir. Yedekleme TMI sunucusunda yapılır.',
    load: function () {
      return istek('yukle').then(function (v) {
        ayna = new Map(v.records.map(function (r) { return [r.id, r]; }));
        ayarlar = v.settings;
        return { records: v.records, settings: v.settings };
      });
    },
    saveRecord: function (r) { return istek('kaydet', r); },
    saveRecords: function (rs) { return istek('toplu-kaydet', rs); },
    deleteRecord: function (id) { return istek('sil', id); },
    saveSettings: function (s) { return istek('ayar-kaydet', s); },
    // Çalışanın kendi kesinleşmiş bordrosuna "gördüm" onayı (İK v3; uygulama yaması bu işlevi çağırır).
    bordroGordum: function (id) { return istek('bordro-gordum', id); },
    // Puantaj (kart #1571): ay ay okunur ({ ay, personel }), günler okunan sürümle yazılır; uygulama yaması bu işlevleri çağırır.
    puantajOku: function (sorgu) { return istek('puantaj-oku', sorgu); },
    puantajYaz: function (gunler) { return istek('puantaj-yaz', gunler); },
    // Soru 74: izin gün önerisi ({ personel, baslangic, bitis }) sunucunun iş günü hesabından.
    izinGunu: function (sorgu) { return istek('izin-gunu', sorgu); },
    // Soru 75: kişinin vardiyası ({ personel }), salt okunur.
    kisiVardiyasi: function (sorgu) { return istek('kisi-vardiyasi', sorgu); },
    subscribe: function (fn) { degisti = fn; return function () { degisti = null; }; }
  };

  var el = null;
  var alinan = 0;
  var uygulanan = 0;
  var yineleyici = null;
  function gonder(m) { m.kanal = GK; m.surum = GS; UST.postMessage(m, KOKEN); }
  function yinelemeyiBirak() { clearInterval(yineleyici); yineleyici = null; }
  // Komut listesi her hazır iletisiyle gider: kabuğun dinleyicisi kurulmadan yollanan ilk ileti kaybolabilir.
  function hazirBildir() {
    yinelemeyiBirak();
    gonder({ tip: 'hazir' });
    komutlariBildir();
    var kalan = 20;
    yineleyici = setInterval(function () { if (kalan-- <= 0) { yinelemeyiBirak(); return; } gonder({ tip: 'hazir' }); komutlariBildir(); }, 250);
  }

  window.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLocaleLowerCase('tr') !== 'k') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    UST.postMessage({ kanal: VERI, yon: 'kisayol', tus: 'arama' }, KOKEN);
  }, true);
  var KOMUTLAR = [{ anahtar: 'ik-ara', baslik: 'İK\'da ara', aciklama: 'Personel, izin, bordro; düz Türkçe komut', sozcukler: ['personel', 'izin', 'bordro', 'kıdem', 'brüt'] }];
  function komutlariBildir() { gonder({ tip: 'komutlar', komutlar: el ? KOMUTLAR : [] }); }
  function komutCalistir(anahtar) {
    if (anahtar !== 'ik-ara' || !el || !el.shadowRoot) return;
    var d = el.shadowRoot.querySelector('[data-act="search"]');
    if (d) d.click();
  }

  window.addEventListener('message', function (e) {
    if (e.source !== UST || e.origin !== KOKEN) return;
    var m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.kanal === VERI && m.yon === 'yanit') {
      var b = bekleyen.get(m.id);
      if (!b) return;
      bekleyen.delete(m.id);
      if (m.ok) b.ok(m.veri);
      else { var h = new Error(m.hata || 'İşlem yapılamadı.'); h.kod = m.kod; b.red(h); }
      return;
    }
    if (m.kanal === VERI && m.yon === 'degisti') { yamaUygula(m.veri); return; }
    if (m.kanal === GK && m.surum === GS && m.tip === 'komut-calistir') { komutCalistir(m.anahtar); return; }
    // Tema değişince çerçeve yeniden kurulmaz (açık form kaybolmasın); yalnız uygulamanın tema niteliği değişir.
    if (m.kanal === VERI && m.yon === 'tema' && (m.tema === 'dark' || m.tema === 'light')) {
      TEMA = m.tema;
      if (el) el.setAttribute('data-theme', TEMA);
      return;
    }
    if (m.kanal === GK && m.surum === GS && m.tip === 'gorunum' && typeof m.gorunum === 'string' && m.gorunum !== ''
        && typeof m.sira === 'number' && Math.floor(m.sira) === m.sira && m.sira >= 1 && el && el.api) {
      yinelemeyiBirak();
      alinan = m.sira;
      uygulanan += 1;
      try { el.api.navigate(m.gorunum); } finally { uygulanan -= 1; }
      // Uygulama isteği yönlendirdiyse (ör. çalışana İK panosu açılmaz) gösterdiği görünüm bildirilir.
      var simdi = el.api.view().gorunum;
      if (simdi !== m.gorunum) gonder({ tip: 'gorunum-degisti', gorunum: simdi, sira: alinan });
    }
  });

  istek('ben').then(function (ben) {
    el = window.IKModulu.mountIKModulu(document.getElementById('ik'), {
      gomulu: true,
      fullPage: true,
      setTitle: false,
      fontHref: null,
      audit: false,
      theme: TEMA,
      kapali: A.kapali || [],
      readOnly: !!ben.saltOkunur,
      user: { id: String(ben.kisi.id), name: ben.kisi.ad, role: ben.rol, empId: ben.personelKimlik || undefined },
      // TMI kullanıcısı ve iş merkezi seçimleri (personel ve pozisyon formunda; Excel aktarımında iş merkezi).
      secenekler: ben.secenekler,
      initialView: ben.rol === 'ik' ? 'pano' : 'benim',
      storage: depo
    });
    el.addEventListener('ik-gorunum', function (e) {
      if (uygulanan > 0) return;
      gonder({ tip: 'gorunum-degisti', gorunum: e.detail.gorunum, sira: alinan });
    });
    hazirBildir();
  }, function (h) {
    var k = document.getElementById('ik');
    if (k) k.textContent = 'İnsan Kaynakları açılamadı: ' + (h && h.message ? h.message : 'bilinmeyen hata');
  });
})();`;
