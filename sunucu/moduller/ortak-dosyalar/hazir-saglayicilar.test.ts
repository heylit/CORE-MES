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

type K = typeof URETIM_EMRI_KAYNAKLARI;
const EMIR7 = { id: 7, emirNo: 'ORN-UE-0007', adet: 20, durum: 'bitti', siparisSatiriId: 31, projeId: 5, urun: { id: 1042, kod: 'ORN-PRC-1042', ad: 'ORN Flanş' } };
const EMIR8 = { ...EMIR7, id: 8, emirNo: 'ORN-UE-0008', durum: 'calisiyor', siparisSatiriId: null, projeId: null, urun: { id: 1043, kod: 'ORN-PRC-1043', ad: 'ORN Mil' } };
const EMIR10 = { ...EMIR8, id: 10, emirNo: 'ORN-UE-0010' };
const EMIRLER = new Map<number, unknown>([[7, EMIR7], [8, EMIR8], [10, EMIR10]]);
// Canlı plan: emir 8 bugün, emir 7 (siparişli, projeli) cuma, emir 10 pencerenin dışında (8. gün). Sahte kaynak aralığı gerçekten süzer.
const YERLESIMLER = [
  { isEmriId: 80, makineId: 3, baslangic: '2026-11-17T06:00:00.000Z', bitis: '2026-11-17T09:00:00.000Z' },
  { isEmriId: 70, makineId: 3, baslangic: '2026-11-20T07:00:00.000Z', bitis: '2026-11-20T10:00:00.000Z' },
  { isEmriId: 100, makineId: 3, baslangic: '2026-11-24T06:00:00.000Z', bitis: '2026-11-24T08:00:00.000Z' },
];
const pencereler: [string, string][] = [];
const emirKaynagi: K = {
  liste: () => Promise.resolve({ emirler: [...EMIRLER.values()] } as unknown as Awaited<ReturnType<K['liste']>>),
  bitenler: () => Promise.resolve({ satirlar: [EMIR7], toplam: 1, sayfa: 1, sayfaBoyu: 50 } as unknown as Awaited<ReturnType<K['bitenler']>>),
  planAraligi: (_db, bas, bit) => {
    pencereler.push([bas.toISOString(), bit.toISOString()]);
    return Promise.resolve(YERLESIMLER.filter((y) => Date.parse(y.baslangic) < bit.getTime() && Date.parse(y.bitis) > bas.getTime()).map(({ bitis: _b, ...y }) => y));
  },
  isEmriBilgileri: () => Promise.resolve(new Map([[80, { uretimEmriId: 8 }], [70, { uretimEmriId: 7 }], [100, { uretimEmriId: 10 }]]) as unknown as Awaited<ReturnType<K['isEmriBilgileri']>>),
  emir: (_db, id) => Promise.resolve((EMIRLER.get(id) ?? null) as unknown as Awaited<ReturnType<K['emir']>>),
  talimatKunyeleri: () => Promise.resolve([{ isEmriId: 70, malzemeNo: 1042, opNo: 10, surum: 2 }]),
  talimatAdimlari: () => Promise.resolve([
    { medya: [{ ozet: 'a'.repeat(64), ad: 'ORN-baglama.jpg', tur: 'resim', boyut: 10 }] },
    { medya: [{ ozet: 'a'.repeat(64), ad: 'ORN-baglama.jpg', tur: 'resim', boyut: 10 }] },
  ] as unknown as Awaited<ReturnType<K['talimatAdimlari']>>),
  listeFotograflari: () => Promise.resolve([{ adimId: 71, ad: 'Ilk parca', ozet: 'b'.repeat(64), zaman: null }]),
  partiBelgeleri: () => Promise.resolve([{ partiId: 13, lotNo: 'ORN-LOT-1', belgeId: 14, ad: 'ORN-3.1.pdf', revKodu: null }]),
  cizimler: () => Promise.resolve([
    { id: 5, ad: 'ORN-PRC-1042.pdf', dosyaTuru: 'pdf', revKodu: 'C', revizyonId: 9 },
    { id: 6, ad: 'ORN-taslak.pdf', dosyaTuru: 'pdf', revKodu: null, revizyonId: null },
  ] as unknown as Awaited<ReturnType<K['cizimler']>>),
  siparisSatirlari: () => Promise.resolve(new Map([[31, { siparisId: 77, siparisNo: 'ORN-SS-0077' }]]) as unknown as Awaited<ReturnType<K['siparisSatirlari']>>),
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
    assert.equal(yok?.gruplar.some((g) => g.kaynak === 'cizim'), false);
    const var_ = await sg.kayit(db, kisi([...EMIR_OKUR, 'belge-merkezi.oku']), '7');
    assert.deepEqual(var_?.gruplar.filter((g) => g.kaynak === 'cizim').map((g) => [g.kaynak, g.dosyalar.map((d) => [d.indir, d.ac])]), [['cizim', [['/cizimler/5/revizyonlar/9/dosya', '/cizimler/belge/5']]]]);
    assert.equal(await sg.kayit(db, kisi(EMIR_OKUR), '9'), null);
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

  test('HS-4 talimat, adım fotoğrafı ve parti grupları kendi uçlarının okuma işlemiyle gelir (3390-2)', async () => {
    const sg = uretimEmriSaglayicisi(emirKaynagi);
    assert.deepEqual((await sg.kayit(db, kisi(EMIR_OKUR), '7'))?.gruplar.map((g) => g.kaynak), ['adim-foto']);
    const hepsi = await sg.kayit(db, kisi([...EMIR_OKUR, 'belge-merkezi.oku', 'recete-rota.oku', 'sayfa.stok']), '7');
    assert.deepEqual(hepsi?.gruplar.map((g) => [g.kaynak, g.dosyalar.map((d) => d.indir)]), [
      ['cizim', ['/cizimler/5/revizyonlar/9/dosya']],
      ['talimat', [`/rota/talimat-medyasi/${'a'.repeat(64)}`]],
      ['adim-foto', [`/adimli-emirler/7/liste-fotografi/71/${'b'.repeat(64)}`]],
      ['parti', ['/stok/partiler/13/belgeler/14']],
    ]);
    // Adım durumunu okuyamayan (yalnız rota okuyan) fotoğraf grubunu görmez; yalnız Adım Durumu sayfasını okuyan görür (T3).
    assert.deepEqual((await sg.kayit(db, kisi(['recete-rota.oku']), '7'))?.gruplar.map((g) => g.kaynak), ['talimat']);
    assert.deepEqual((await sg.kayit(db, kisi(['sayfa.adim-durumu']), '7'))?.gruplar.map((g) => g.kaynak), ['adim-foto']);
  });

  test('HS-5 üretim kayıtları yalnız biten emri açar; plan yalnız penceredeki emri, yalnız çizim ve talimatla (K2)', async () => {
    const kayit = uretimEmriSaglayicisi(emirKaynagi, 'uretim-kaydi');
    assert.deepEqual((await kayit.kayitlar(db, null, 50)).map((x) => x.no), ['ORN-UE-0007']);
    assert.notEqual(await kayit.kayit(db, kisi(EMIR_OKUR), '7'), null);
    assert.equal(await kayit.kayit(db, kisi(EMIR_OKUR), '8'), null);
    const plan = uretimEmriSaglayicisi(emirKaynagi, 'plan', () => new Date('2026-11-17T08:00:00Z'));
    assert.deepEqual(plan.okuma, ['plan.oku', 'plan.yaz']);
    pencereler.length = 0;
    assert.deepEqual((await plan.kayitlar(db, null, 50)).map((x) => [x.no, x.alt]), [
      ['ORN-UE-0008', '20 adet · plan Sal 17.11 09:00'], ['ORN-UE-0007', '20 adet · plan Cum 20.11 10:00'],
    ]);
    // Pencere tesis gününün başından (İstanbul 00:00 = 21:00Z) tam 7 gündür (T1).
    assert.deepEqual(pencereler, [['2026-11-16T21:00:00.000Z', '2026-11-23T21:00:00.000Z']]);
    assert.equal(await plan.kayit(db, kisi(['plan.oku']), '10'), null, 'pencere dışındaki emir açılmaz');
    const tum = ['plan.oku', 'belge-merkezi.oku', 'recete-rota.oku', 'sayfa.stok', 'sayfa.adim-durumu'] as const;
    const r = await plan.kayit(db, kisi(tum), '8');
    assert.deepEqual(r?.gruplar.map((g) => g.kaynak), ['cizim', 'talimat']);
    assert.deepEqual(r?.klasorler, []);
    // Siparişli ve projeli emir planda da klasörsüz ve yalnız çizim + talimatla açılır (K2, T2).
    const s7 = await plan.kayit(db, kisi(tum), '7');
    assert.deepEqual([s7?.gruplar.map((g) => g.kaynak), s7?.klasorler], [['cizim', 'talimat'], []]);
  });
});
