import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { SATIN_ALMA_KAYNAKLARI, URETIM_EMRI_KAYNAKLARI } from '../../kablolama.ts';
import { satinAlmaSaglayicisi, uretimEmriSaglayicisi } from '../../kablolama.ts';

// Kart 3390-1 (Test T2-T4): gerçek sağlayıcıların grup süzmesi (Risk K1) sahte kaynak üstünde. Veritabanı yok; ORN- veri.
const db = {} as Db;
const kisi = (islemler: readonly Islem[]): Kullanici => ({ id: 1, ad: 'Deneme', islemler: [...islemler] }) as unknown as Kullanici;
const EMIR_OKUR: Islem[] = ['sayfa.uretim-emirleri'];

const emirKaynagi: typeof URETIM_EMRI_KAYNAKLARI = {
  liste: () => Promise.resolve({ emirler: [] }),
  emir: (_db, id) => Promise.resolve(id !== 7 ? null : {
    id: 7, emirNo: 'ORN-UE-0007', adet: 20, siparisSatiriId: 31, projeId: 5, urun: { id: 1042, kod: 'ORN-PRC-1042', ad: 'ORN Flanş' },
  } as unknown as Awaited<ReturnType<typeof URETIM_EMRI_KAYNAKLARI.emir>>),
  cizimler: () => Promise.resolve([
    { id: 5, ad: 'ORN-PRC-1042.pdf', dosyaTuru: 'pdf', revKodu: 'C', revizyonId: 9 },
    { id: 6, ad: 'ORN-taslak.pdf', dosyaTuru: 'pdf', revKodu: null, revizyonId: null },
  ] as unknown as Awaited<ReturnType<typeof URETIM_EMRI_KAYNAKLARI.cizimler>>),
  siparisSatirlari: () => Promise.resolve(new Map([[31, { siparisId: 77, siparisNo: 'ORN-SS-0077' }]]) as unknown as Awaited<ReturnType<typeof URETIM_EMRI_KAYNAKLARI.siparisSatirlari>>),
};

const satinAlmaKaynagi: typeof SATIN_ALMA_KAYNAKLARI = {
  satirlar: () => Promise.resolve([{ id: 41, siparisNo: 'ORN-SA-0041', tedarikciAdi: 'ORN Tedarik', kalemAdi: 'ORN Çubuk' }] as unknown as Awaited<ReturnType<typeof SATIN_ALMA_KAYNAKLARI.satirlar>>),
  belgeler: () => Promise.resolve(new Map([[41, [{ id: 3, ad: 'ORN-sertifika.pdf' }]]]) as unknown as Awaited<ReturnType<typeof SATIN_ALMA_KAYNAKLARI.belgeler>>),
  stokBelgeleri: () => Promise.resolve({
    irsaliyeler: [{ malKabulId: 11, malKabulNo: 'ORN-MK-0011', belgeId: 12, ad: 'ORN-irsaliye.pdf' }],
    partiBelgeleri: [{ partiId: 13, lotNo: 'ORN-LOT-1', belgeId: 14, ad: 'ORN-3.1.pdf', revKodu: null }],
  }),
};

describe('hazır liste sağlayıcıları: kaynak yetkisiyle süzme (kart 3390-1, Risk K1)', () => {
  test('HS-1 emri okuyup çizimi okuyamayana çizim grubu gelmez; okuyana yalnız yayındaki revizyon gelir', async () => {
    const sg = uretimEmriSaglayicisi(emirKaynagi);
    const yok = await sg.kayit(db, kisi(EMIR_OKUR), '7');
    assert.deepEqual(yok?.gruplar, []);
    const var_ = await sg.kayit(db, kisi([...EMIR_OKUR, 'belge-merkezi.oku']), '7');
    assert.deepEqual(var_?.gruplar.map((g) => [g.kaynak, g.dosyalar.map((d) => [d.indir, d.ac])]), [['cizim', [['/cizimler/5/revizyonlar/9/dosya', '/cizimler/belge/5']]]]);
    assert.equal(await sg.kayit(db, kisi(EMIR_OKUR), '8'), null);
    assert.equal(await sg.kayit(db, kisi(EMIR_OKUR), 'abc'), null);
  });

  test('HS-2 emrin sipariş ve proje klasörü kayda eklenir (görünürlüğü ortak katman süzer)', async () => {
    const r = await uretimEmriSaglayicisi(emirKaynagi).kayit(db, kisi(EMIR_OKUR), '7');
    assert.deepEqual(r?.klasorler, [{ tur: 'siparis', id: 77 }, { tur: 'proje', id: 5 }]);
    assert.equal(r?.kayit.alt, '20 adet · ORN-SS-0077');
  });

  test('HS-3 satın almayı okuyup stoğu okuyamayana parti ve irsaliye grubu gelmez', async () => {
    const sg = satinAlmaSaglayicisi(satinAlmaKaynagi);
    const sa = await sg.kayit(db, kisi(['satin-alma.oku']), 'ORN-SA-0041');
    assert.deepEqual(sa?.gruplar.map((g) => g.kaynak), ['satin-alma', 'irsaliye']);
    const stoklu = await sg.kayit(db, kisi(['satin-alma.oku', 'sayfa.stok']), 'ORN-SA-0041');
    assert.deepEqual(stoklu?.gruplar.map((g) => g.kaynak), ['satin-alma', 'irsaliye', 'parti']);
    assert.equal(stoklu?.gruplar[2]?.dosyalar[0]?.indir, '/stok/partiler/13/belgeler/14');
    assert.equal(await sg.kayit(db, kisi(['satin-alma.oku']), 'ORN-YOK'), null);
  });
});
