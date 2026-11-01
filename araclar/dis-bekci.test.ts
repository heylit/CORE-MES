import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARIZA_ESIGI, ARIZA_OLAY_KIMLIGI, BOS_DURUM, DUZELDI_OLAY_KIMLIGI, HATIRLATMA_MS, durumOku, hedefleriKur, karar, olayArgumanlari, olayMetniTemizle, sonucCoz,
} from './dis-bekci.ts';
import type { Durum, Hedef, Sonuc } from './dis-bekci.ts';

const SUNUCU: Hedef = { ad: 'sunucu', adres: 'http://127.0.0.1:4100/api/saglik' };
const VEKIL: Hedef = { ad: 'vekil', adres: 'https://tmi:443/api/saglik' };
const OK: Sonuc = { tur: 'ok' };
const CEVAPSIZ: Sonuc = { tur: 'cevapsiz', neden: 'ECONNREFUSED' };
const DK = 60_000;

// Dakikada bir tur koşturur; her turun olayını döner.
function turlar(sonuclar: Array<Array<{ hedef: Hedef; sonuc: Sonuc }>>, baslangic = 0, durum: Durum = BOS_DURUM) {
  let d = durum;
  return sonuclar.map((s, i) => {
    const r = karar(d, s, baslangic + i * DK);
    d = r.durum;
    return r;
  });
}

describe('dış bekçi', () => {
  it('sağlık cevabını sınıflar', () => {
    assert.deepEqual(sonucCoz(200, null), { tur: 'ok' });
    assert.deepEqual(sonucCoz(503, null), { tur: 'vt-yok' });
    assert.deepEqual(sonucCoz(502, null), { tur: 'beklenmeyen', durum: 502 });
    assert.deepEqual(sonucCoz(null, 'ECONNREFUSED'), { tur: 'cevapsiz', neden: 'ECONNREFUSED' });
    assert.deepEqual(sonucCoz(null, null), { tur: 'cevapsiz', neden: 'bilinmiyor' });
  });

  it('sağlıklı turda olay yazmaz', () => {
    const r = karar(BOS_DURUM, [{ hedef: SUNUCU, sonuc: OK }], 0);
    assert.equal(r.olay, null);
    assert.deepEqual(r.durum, BOS_DURUM);
  });

  it('eşikten kısa arızada (bekçinin yeniden açması) olay yazmaz', () => {
    const r = turlar([[{ hedef: SUNUCU, sonuc: CEVAPSIZ }], [{ hedef: SUNUCU, sonuc: CEVAPSIZ }], [{ hedef: SUNUCU, sonuc: OK }]]);
    assert.ok(ARIZA_ESIGI > 2);
    assert.deepEqual(r.map((x) => x.olay), [null, null, null]);
    assert.deepEqual(r.at(-1)?.durum, BOS_DURUM);
  });

  it('eşikte bir kez hata, sürerken saatte bir hatırlatma, düzelince bilgi yazar', () => {
    const ariza = Array.from({ length: ARIZA_ESIGI + 60 }, () => [{ hedef: SUNUCU, sonuc: CEVAPSIZ }]);
    const r = turlar([...ariza, [{ hedef: SUNUCU, sonuc: OK }]]);
    const olaylar = r.map((x, i) => (x.olay === null ? null : { i, ...x.olay })).filter((x) => x !== null);
    assert.equal(olaylar.length, 3);
    assert.equal(olaylar[0]?.i, ARIZA_ESIGI - 1);
    assert.equal(olaylar[0]?.kimlik, ARIZA_OLAY_KIMLIGI);
    assert.match(olaylar[0]?.metin ?? '', /Sunucu cevap vermiyor \(ECONNREFUSED\)/);
    assert.equal(olaylar[1]?.i, ARIZA_ESIGI - 1 + HATIRLATMA_MS / DK);
    assert.match(olaylar[1]?.metin ?? '', /dk sürüyor/);
    assert.equal(olaylar[2]?.kimlik, DUZELDI_OLAY_KIMLIGI);
    assert.equal(olaylar[2]?.tur, 'INFORMATION');
    assert.match(olaylar[2]?.metin ?? '', /arıza yaklaşık 63 dk sürdü/);
  });

  it('neden değişince hemen yazar; vekil arızası ayrı söylenir', () => {
    const r = turlar([
      ...Array.from({ length: ARIZA_ESIGI }, () => [{ hedef: SUNUCU, sonuc: OK }, { hedef: VEKIL, sonuc: CEVAPSIZ }]),
      [{ hedef: SUNUCU, sonuc: { tur: 'vt-yok' } }, { hedef: VEKIL, sonuc: OK }],
    ]);
    assert.match(r[ARIZA_ESIGI - 1]?.olay?.metin ?? '', /^TMIV2 dış bekçi: Vekil üzerinden sunucu cevap vermiyor/);
    assert.match(r[ARIZA_ESIGI]?.olay?.metin ?? '', /veritabanına ulaşamıyor \(503\)/);
  });

  it('olay metni tırnak ve satır sonu taşımaz, argümanlar kaynak ve kimliği verir', () => {
    assert.equal(olayMetniTemizle('a "b"\r\nc'), 'a b c');
    assert.equal(olayMetniTemizle('x'.repeat(2000)).length, 800);
    assert.deepEqual(olayArgumanlari({ tur: 'ERROR', kimlik: '300', metin: 'm' }), ['/T', 'ERROR', '/ID', '300', '/L', 'APPLICATION', '/SO', 'TMIV2', '/D', 'm']);
  });

  it('hedefler: sunucu her zaman, vekil yalnız kurum içi ve yalın adresle', () => {
    assert.deepEqual(hedefleriKur({}), { hedefler: [SUNUCU] });
    assert.deepEqual(hedefleriKur({ TMIV2_PORT: '4200' }), { hedefler: [{ ad: 'sunucu', adres: 'http://127.0.0.1:4200/api/saglik' }] });
    assert.ok('hata' in hedefleriKur({ TMIV2_PORT: 'x' }));
    const vekil = hedefleriKur({ TMIV2_DIS_BEKCI_VEKIL: 'https://tmi' });
    assert.deepEqual(vekil, { hedefler: [SUNUCU, { ad: 'vekil', adres: 'https://tmi/api/saglik' }] });
    assert.ok(!('hata' in hedefleriKur({ TMIV2_DIS_BEKCI_VEKIL: 'https://tmi-sunucu:8443' })));
    for (const red of ['https://ornek.com', 'https://203.0.113.5', 'ftp://tmi', 'https://tmi/api', 'https://k:p@tmi', 'https://tmi?x=1', 'bozuk']) {
      assert.ok('hata' in hedefleriKur({ TMIV2_DIS_BEKCI_VEKIL: red }), red);
    }
  });

  it('bozuk ya da eksik durum dosyası boş durum sayılır', () => {
    assert.deepEqual(durumOku(null), BOS_DURUM);
    assert.deepEqual(durumOku('{bozuk'), BOS_DURUM);
    assert.deepEqual(durumOku('{"ardArda":-3,"sonOlay":"x"}'), BOS_DURUM);
    assert.deepEqual(durumOku('{"ardArda":4,"arizaBaslangici":10,"sonOlay":20,"sonNeden":"n"}'), { ardArda: 4, arizaBaslangici: 10, sonOlay: 20, sonNeden: 'n' });
  });
});
