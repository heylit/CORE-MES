/* STEP/IGES okuyucu (occt-import-js) ayrı çalışanda (#199 TBw). Kütüphanenin bağlama kodu çalışma anında Function yapıcısı kullanır;
   bu dosyanın cevabı kendi içerik ilkesini taşır (arkon/sun.ts CALISAN_ILKESI), ana sayfanın ilkesi gevşemez. Dosya URL ile yüklenmelidir:
   blob: ya da data: ile kurulan çalışan ana sayfanın ilkesini miras alır. Wasm ikilisi mesajla gelir; çalışan ağa çıkmaz. */
'use strict';
importScripts('occt-import-js.js');
var occt = null;
self.onmessage = function (e) {
  var d = e.data || {};
  var bitir = function (sonuc) { self.postMessage({ no: d.no, tamam: true, sonuc: sonuc }); };
  var hata = function (h) { self.postMessage({ no: d.no, tamam: false, hata: String((h && h.message) || h) }); };
  try {
    if (d.tur === 'kur') {
      if (occt) { bitir(null); return; }
      self.occtimportjs({ wasmBinary: d.wasm }).then(function (m) { occt = m; bitir(null); }, hata);
      return;
    }
    if (!occt) throw new Error('STEP okuyucu kurulmadı.');
    bitir(d.tur === 'iges' ? occt.ReadIgesFile(d.bytes, null) : occt.ReadStepFile(d.bytes, d.ayar));
  } catch (h) { hata(h); }
};
