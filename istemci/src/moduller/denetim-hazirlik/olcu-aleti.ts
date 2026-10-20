import type { OlcuAletleriCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';

// 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon modülüdür. Prototipin "Kalibrasyon" sekmesindeki cihaz listesi (`kal.devs`) buradan
// salt okunur gelir; prototip dosyası değişmez. Betik çerçevede prototipten ÖNCE koşar (düz metin: çerçevede derleyici yok):
//  - Prototipin durumu yerel depoda (localStorage) bir bütün olarak durur. Okunurken her profilin `kal.devs` listesi Kalibrasyondan
//    gelen cihazlarla değiştirilir; yazılırken kayıtta daha önce duran liste aynen geri konur. Böylece eski kayıtlar silinmez,
//    Kalibrasyon kopyaları kaydedilmez.
//  - Ekleme, içe aktarma, düzenleme, kalibrasyon kaydı ve silme düğmeleri gizlenir; tıklanırsa kullanıcı Kalibrasyon sayfasına gider.
//  - Liste en çok `yoklamaMs`de bir kabuktan yeniden okunur; değiştiyse ve Kalibrasyon sekmesi açıkken prototipe "storage" olayıyla
//    bildirilir (başka bir ekranda yarım kalan formu bozmamak için sekme açık değilse beklenir).
export const OLCU_ALETI_YOLU = '/kalibrasyon';
export type OlcuAletiKaydi = OlcuAletleriCevabi['aletler'][number];

export interface OlcuAletiAyari {
  kanal: string;
  depoAnahtari: string;
  yoklamaMs: number;
  aletler: readonly OlcuAletiKaydi[];
}

export const OLCU_ALETI_BETIGI = String.raw`(function () {
  var A = window.__TMI_OLCU_ALETI;
  var UST = window.parent;
  var HAM = window.localStorage;
  var KEY = A.depoAnahtari;
  var ESKI = ['iso9001-denetim-v3', 'iso9001-denetim-v2', 'iso9001-denetim-v1'];
  var aletler = A.aletler;
  var bekleyen = null;
  var orijinal = {};
  var sira = 1000000000;
  var istekId = 0;

  // Prototipin cihaz kaydı: Kalibrasyonda karşılığı olmayan alanlar boş metindir (marka, seri, çözünürlük, sorumlu, laboratuvar, kabul).
  function cihazlar() {
    return aletler.map(function (a) {
      return {
        id: a.id, no: a.no, ad: a.ad, marka: '', seri: '', aralik: a.aralik, coz: '', yer: a.yer, sorumlu: '', lab: '', cert: a.cert, kabul: '', note: '',
        st: a.st, res: a.res, per: a.per, last: a.last, nx: a.nx, hist: a.hist
      };
    });
  }
  function ayir(metin) {
    try {
      var j = JSON.parse(metin);
      return j && typeof j === 'object' && j.data && typeof j.data === 'object' ? j : null;
    } catch (e) { return null; }
  }
  function oku(anahtar) {
    var v = HAM.getItem(anahtar);
    if (anahtar !== KEY) return v;
    if (v === null) {
      // Eski sürüm anahtarlarından aktarım prototipindir; onlar varsa sentetik kayıt kurulmaz.
      for (var i = 0; i < ESKI.length; i++) if (HAM.getItem(ESKI[i]) !== null) return v;
      v = JSON.stringify({ active: 'p0', order: ['p0'], data: { p0: {} }, lastBackup: 0 });
    }
    var j = ayir(v);
    if (j === null) return v;
    Object.keys(j.data).forEach(function (id) {
      var s = j.data[id];
      if (!s || typeof s !== 'object') return;
      if (!s.kal || typeof s.kal !== 'object') s.kal = {};
      if (!(id in orijinal)) orijinal[id] = Array.isArray(s.kal.devs) ? s.kal.devs : undefined;
      s.kal.devs = cihazlar();
    });
    return JSON.stringify(j);
  }
  function yaz(anahtar, deger) {
    if (anahtar === KEY) {
      var j = ayir(String(deger));
      if (j !== null) {
        Object.keys(j.data).forEach(function (id) {
          var s = j.data[id];
          if (!s || typeof s !== 'object' || !s.kal || typeof s.kal !== 'object') return;
          if (orijinal[id] === undefined) delete s.kal.devs; else s.kal.devs = orijinal[id];
        });
        deger = JSON.stringify(j);
      }
    }
    HAM.setItem(anahtar, deger);
  }
  var depo = {
    getItem: function (k) { return oku(String(k)); },
    setItem: function (k, v) { yaz(String(k), String(v)); },
    removeItem: function (k) { HAM.removeItem(k); },
    clear: function () { HAM.clear(); },
    key: function (i) { return HAM.key(i); }
  };
  Object.defineProperty(depo, 'length', { get: function () { return HAM.length; } });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: depo });

  function git() {
    sira += 1;
    UST.postMessage({ kanal: A.kanal, yon: 'istek', id: sira, tip: 'kalibrasyona-git', veri: {} }, '*');
  }

  // Yazma yolları: tıklama prototipe ulaşmadan yakalanır (yakalama aşaması).
  var KAPALI = '[data-knew],[data-kimp],[data-kedit],[data-krec],[data-ksave],[data-kdel],[data-kdelyes],[data-kimpok]';
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (t === null) return;
    var kal = t.closest('[data-tmi-kalibrasyon]');
    var kapali = kal === null ? t.closest(KAPALI) : null;
    if (kal === null && kapali === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    git();
  }, true);

  var stil = document.createElement('style');
  stil.textContent = '[data-knew],[data-kimp],[data-krec],.kact [data-kedit]{display:none!important}';
  document.head.appendChild(stil);

  function kalibrasyonSekmesi() { return document.querySelector('.ktool') !== null; }
  // Bilgi satırı ve periyot metni: prototip her çizimde bölümü yeniden yazar, bu yüzden yeniden uygulanır.
  function duzelt() {
    var arac = document.querySelector('.ktool');
    if (arac === null) return;
    var kart = arac.parentNode;
    if (kart && kart.parentNode && !kart.parentNode.querySelector('#tmiKalibrasyonNotu')) {
      var not = document.createElement('div');
      not.id = 'tmiKalibrasyonNotu';
      not.className = 'card';
      not.setAttribute('role', 'note');
      var metin = document.createElement('span');
      metin.textContent = 'Ölçü aletleri Kalibrasyon modülünden gelir ve burada yalnız görüntülenir. Ekleme, düzenleme ve kalibrasyon kaydı Kalibrasyon sayfasında yapılır. ';
      var dugme = document.createElement('button');
      dugme.type = 'button';
      dugme.className = 'btn';
      dugme.setAttribute('data-tmi-kalibrasyon', '1');
      dugme.textContent = 'Kalibrasyon sayfasına git';
      not.appendChild(metin);
      not.appendChild(dugme);
      kart.parentNode.insertBefore(not, kart);
    }
    var gunler = {};
    aletler.forEach(function (a) { gunler[a.id] = a.periyotGun; });
    document.querySelectorAll('.ktab tbody tr').forEach(function (satir) {
      var d = satir.querySelector('[data-kedit]');
      var id = d ? d.getAttribute('data-kedit') : null;
      var hucre = satir.cells[5];
      var kucuk = hucre ? hucre.querySelector('small') : null;
      // Prototip periyodu tam ay sayısına yuvarlar ve vadeyi "elle girildi" diye yazar; Kalibrasyonun gerçek gün sayısı gösterilir.
      if (id !== null && kucuk && gunler[id] !== undefined && (kucuk.textContent === 'elle girildi' || /^\d+ ay · /.test(kucuk.textContent || ''))) kucuk.textContent = gunler[id] + ' gün';
    });
  }
  var cizimBekliyor = false;
  new MutationObserver(function () {
    if (cizimBekliyor) return;
    cizimBekliyor = true;
    window.setTimeout(function () { cizimBekliyor = false; duzelt(); }, 0);
  }).observe(document, { childList: true, subtree: true });

  // Yenileme: kabuktan liste istenir; değiştiyse Kalibrasyon sekmesi açıkken uygulanır.
  window.addEventListener('message', function (e) {
    if (e.source !== UST) return;
    var m = e.data;
    if (!m || m.kanal !== A.kanal || m.yon !== 'yanit' || m.id !== istekId) return;
    istekId = 0;
    if (m.ok !== true || !m.veri || !Array.isArray(m.veri.aletler)) return;
    if (JSON.stringify(m.veri.aletler) !== JSON.stringify(aletler)) bekleyen = m.veri.aletler;
  });
  function uygula() {
    if (bekleyen === null || !kalibrasyonSekmesi()) return;
    aletler = bekleyen;
    bekleyen = null;
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
  }
  window.setInterval(function () {
    if (istekId !== 0 || document.hidden) return;
    sira += 1;
    istekId = sira;
    UST.postMessage({ kanal: A.kanal, yon: 'istek', id: sira, tip: 'olcu-aletleri', veri: {} }, '*');
  }, A.yoklamaMs);
  window.setInterval(uygula, 1000);
})();`;

// Betik sayfaya satır içi gömülür: ayar JSON'u betik etiketini kapatamaz.
export function olcuAletiBetigi(ayar: OlcuAletiAyari): string {
  const json = JSON.stringify(ayar).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script>window.__TMI_OLCU_ALETI=${json};</script><script>${OLCU_ALETI_BETIGI.replace(/<\/script/gi, '<\\/script')}</script>`;
}
