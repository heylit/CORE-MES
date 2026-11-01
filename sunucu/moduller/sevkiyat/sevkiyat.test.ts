// Akış testi: gerçek PostgreSQL (göçler uygulanmış boş şema) ve uydurma ızgara yol ağıyla servis katmanı.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { HaritaKaynagi } from './servis.ts';
import * as servis from './servis.ts';
import * as sorgu from './sorgular.ts';
import { izgaraKaynagi } from './test-agi.ts';
import { gunPlaniCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';

let ortam: TestVeritabani;
let vt: Veritabani;
const kaynak = izgaraKaynagi();
const yok: HaritaKaynagi = () => Promise.resolve(null);
const tx = <T>(is: (db: Db) => Promise<T>) => vt.tx(is);
const konum = (satir: number, sutun: number) => ({ enlem: 39.90 + satir * 0.01, boylam: 32.70 + sutun * 0.01 });
// 1264 a: müşteri, tedarikçi ve fason noktası firmaya bağlıdır; her nokta kendi adıyla açılmış deneme firmasını alır.
const firmaAc = (ad: string) => tx(async (db) => {
  const kisi = await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Firma Deneme') RETURNING id");
  return (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, 'ikisi', $2) RETURNING id", [ad, kisi?.id]))!.id;
});
const nokta = async (ad: string, satir: number, sutun: number, tur: 'fabrika' | 'musteri' | 'tedarikci' = 'musteri') => {
  const firmaId = tur === 'fabrika' ? null : await firmaAc(ad);
  return tx((db) => servis.noktaEkle(db, { ad, tur, ...konum(satir, sutun), adres: null, durakSuresiDakika: 10, firmaId }));
};
const ARAC = { tur: 'kamyonet' as const, plaka: null, kapasiteKilogram: 1500, kapasitePalet: 4, musaitBaslangic: '08:00', musaitBitis: '18:00', kilometreMaliyeti: null, saatMaliyeti: null, gunlukMaliyet: null };
const BOS_IS = { alisNoktasiId: null, birakisNoktasiId: null, agirlikKilogram: 100, paletSayisi: 1, durakSuresiDakika: null, alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null };
// Taslakta kaydedilmiş saat yoktur.
const taslakSaatleri = (p: { rotalar: { onaySaatleri: unknown }[] }) => p.rotalar.every((r) => r.onaySaatleri === null);
const hata = (kod: string) => (h: unknown) => h instanceof UygulamaHatasi && h.kod === kod;
const kisit = (ad: string) => (h: unknown) => (h as { constraint?: string }).constraint === ad;
// Güncelleme o anki sürümle gelir (kart #1323); sürüm çakışması ayrı testte.
const surumu = async (db: Db, tablo: 'sevkiyat_noktasi' | 'sevkiyat_araci' | 'sevkiyat_isi', id: number) =>
  (await db.tek<{ s: number }>(`SELECT surum AS s FROM ${tablo} WHERE id = $1`, [id]))!.s;
// Havuz günler arası ortaktır: önceki testlerin açık işleri bu testin listesine düşmesin diye iptal edilir.
const havuzuBosalt = () => tx((db) => db.sorgu("UPDATE sevkiyat_isi SET iptal_edildi = now() WHERE iptal_edildi IS NULL AND durum IN ('havuzda', 'planlandi')"));

let fabrikaId = 0, a = 0, b = 0, c = 0, k1 = 0, k2 = 0;

before(async () => {
  ortam = await testVeritabaniKur('sevkiyat');
  vt = ortam.vt;
  // Sistem Ayarları'nda konum girilmeden önce açılmış fabrika kaydı (930 a öncesi): rota kayıttaki konumla çıkar.
  fabrikaId = (await tx((db) => sorgu.noktaEkle(db, { ad: 'Deneme Fabrika', tur: 'fabrika', ...konum(0, 0), adres: null, durakSuresiDakika: 10, firmaId: null }))).id;
  a = (await nokta('Nokta A', 2, 9)).id; b = (await nokta('Nokta B', 9, 3)).id; c = (await nokta('Nokta C', 6, 6, 'tedarikci')).id;
  k1 = (await tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'Araç 1' }))).id;
  k2 = (await tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'Araç 2', tur: 'kamyon', kapasiteKilogram: 5000, kapasitePalet: 10 }))).id;
});
after(() => ortam.kaldir());

test('SVK-1: aktif fabrika tektir: servis çakışma verir, veritabanı da reddeder; pasifleşen nokta listede pasif görünür', async () => {
  await assert.rejects(nokta('İkinci Fabrika', 1, 1, 'fabrika'), hata('CAKISMA'));
  await assert.rejects(tx((db) => sorgu.noktaEkle(db, { ad: 'İkinci Fabrika', tur: 'fabrika', ...konum(1, 1), adres: null, durakSuresiDakika: 0, firmaId: null })), kisit('sevkiyat_noktasi_tek_fabrika'));
  const gecici = await nokta('Geçici Nokta', 1, 1);
  await tx((db) => servis.noktaPasiflestir(db, gecici.id));
  assert.equal((await tx((db) => servis.noktalariListele(db))).noktalar.find((n) => n.id === gecici.id)!.aktif, false);
});

test('SVK-2: aktif nokta ve araç adı tektir; aktif araçta plaka tektir (büyük/küçük harf duyarsız)', async () => {
  await assert.rejects(nokta('nokta a', 3, 3), kisit('sevkiyat_noktasi_ad'));
  await assert.rejects(tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'ARAÇ 1' })), kisit('sevkiyat_araci_ad'));
  const plakali = await tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'Plakalı', plaka: '06 DNM 01' }));
  await assert.rejects(tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'Plakalı 2', plaka: '06 dnm 01' })), kisit('sevkiyat_araci_plaka'));
  await tx((db) => servis.aracPasiflestir(db, plakali.id));
  const yeni = await tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'Plakalı 3', plaka: '06 DNM 01' }));
  await tx((db) => servis.aracPasiflestir(db, yeni.id)); // sonraki testlerin araç sayısı değişmesin
});

test('1264 a: müşteri, tedarikçi ve fason noktası firmasız yazılmaz; kargo ve diğer firmasız kalır; bağsız eski nokta düzeltilirken bağlanır', async () => {
  for (const tur of ['musteri', 'tedarikci', 'fason'] as const) {
    await assert.rejects(tx((db) => servis.noktaEkle(db, { ad: `Firmasız ${tur}`, tur, ...konum(5, 1), adres: null, durakSuresiDakika: 10, firmaId: null })),
      (h: unknown) => hata('GECERSIZ')(h) && (h as Error).message.includes('firmaya bağlanır'));
  }
  const kargo = await tx((db) => servis.noktaEkle(db, { ad: 'Firmasız Kargo', tur: 'kargo', ...konum(5, 2), adres: null, durakSuresiDakika: 10, firmaId: null }));
  assert.equal(kargo.firmaId, null);
  // Kuraldan önce açılmış bağsız nokta: listede kalır, firmasız düzeltilemez, firmaya bağlanarak düzeltilir.
  const eski = await tx((db) => sorgu.noktaEkle(db, { ad: 'Eski Müşteri', tur: 'musteri', ...konum(5, 3), adres: null, durakSuresiDakika: 10, firmaId: null }));
  assert.equal((await tx((db) => servis.noktalariListele(db))).noktalar.find((n) => n.id === eski.id)?.firmaId, null);
  const govde = { ad: 'Eski Müşteri', tur: 'musteri' as const, ...konum(5, 3), adres: null, durakSuresiDakika: 10 };
  await assert.rejects(tx((db) => servis.noktaGuncelle(db, eski.id, { ...govde, firmaId: null, surum: eski.surum })), hata('GECERSIZ'));
  assert.equal((await tx((db) => sorgu.noktaGetir(db, eski.id)))?.surum, eski.surum);
  const firmaId = await firmaAc('Eski Müşteri Firması');
  const bagli = await tx((db) => servis.noktaGuncelle(db, eski.id, { ...govde, firmaId, surum: eski.surum }));
  assert.equal(bagli.firmaId, firmaId);
  assert.equal((await tx((db) => servis.noktalariListele(db))).noktalar.find((x) => x.id === eski.id)?.ad, 'Eski Müşteri Firması');
});

test('1289 a: bağlı noktanın adresi ve konumu seçilen firma adresinden, yoksa merkezden okunur; kart değişince nokta da değişir', async () => {
  const { firmaId, teslimId } = await tx(async (db) => {
    const kisi = (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Adres Deneme') RETURNING id"))!.id;
    const f = (await db.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, adres, enlem, boylam, olusturan_id) VALUES ('Adresli Firma', 'musteri', 'Merkez Cad. 1', 39.91, 32.71, $1) RETURNING id", [kisi]))!.id;
    const a = (await db.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, adres, enlem, boylam, olusturan_id) VALUES ($1, 'teslim', 'Depo', 'Depo Yolu 2', 39.97, 32.77, $2) RETURNING id", [f, kisi]))!.id;
    return { firmaId: f, teslimId: a };
  });
  const govde = { ad: 'Adresli Nokta', tur: 'musteri' as const, ...konum(9, 9), adres: 'elle yazılan', durakSuresiDakika: 10, firmaId };
  const merkezde = await tx((db) => servis.noktaEkle(db, govde));
  assert.deepEqual([merkezde.adresId, merkezde.enlem, merkezde.boylam, merkezde.adres], [null, 39.91, 32.71, 'Merkez Cad. 1']);
  const depoda = await tx((db) => servis.noktaGuncelle(db, merkezde.id, { ...govde, adresId: teslimId, surum: merkezde.surum }));
  assert.deepEqual([depoda.adresId, depoda.enlem, depoda.boylam, depoda.adres], [teslimId, 39.97, 32.77, 'Depo Yolu 2']);
  await tx((db) => db.sorgu('UPDATE musteri_tedarikci_adres SET enlem = 39.99, adres = $2 WHERE id = $1', [teslimId, 'Yeni Depo Yolu']));
  const okunan = (await tx((db) => servis.noktalariListele(db))).noktalar.find((n) => n.id === merkezde.id)!;
  assert.deepEqual([okunan.enlem, okunan.adres], [39.99, 'Yeni Depo Yolu']);
  assert.deepEqual(okunan.konumlar?.map((k) => k.adresId), [null, teslimId]);
  await tx((db) => servis.noktaPasiflestir(db, merkezde.id));
});

test('1289 a reddedilen: başka firmanın adresi, firmasız noktada adres ve kısıt; koordinatsız firmada nokta kendi konumunu tutar', async () => {
  const baskaFirma = await firmaAc('Başka Adresli');
  const baskaAdres = await tx(async (db) => (await db.tek<{ id: number }>(
    "INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, enlem, boylam, olusturan_id) VALUES ($1, 'teslim', 'Başka Depo', 39.5, 32.5, (SELECT min(id) FROM kisi)) RETURNING id", [baskaFirma]))!.id);
  const firmaId = await firmaAc('Koordinatsız Firma');
  const govde = { ad: 'Koordinatsız', tur: 'musteri' as const, ...konum(9, 8), adres: 'elle', durakSuresiDakika: 10, firmaId };
  await assert.rejects(tx((db) => servis.noktaEkle(db, { ...govde, adresId: baskaAdres })), (h: unknown) => hata('GECERSIZ')(h) && (h as Error).message.includes('bu firmanın değil'));
  await assert.rejects(tx((db) => servis.noktaEkle(db, { ...govde, tur: 'kargo', firmaId: null, adresId: baskaAdres })), hata('GECERSIZ'));
  await assert.rejects(tx((db) => db.sorgu("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, adres_id) VALUES ('Kısıt', 'kargo', 1, 1, $1)", [baskaAdres])), kisit('sevkiyat_noktasi_adres_firmali'));
  const n = await tx((db) => servis.noktaEkle(db, govde));
  assert.deepEqual([n.enlem, n.boylam, n.adres, n.adresId], [govde.enlem, govde.boylam, 'elle', null]);
  await tx((db) => servis.noktaPasiflestir(db, n.id));
});

test('nokta firmaya bağlanır: ad finanstan okunur, firma başına tek aktif nokta, kargo bağlanmaz (kart #836)', async () => {
  const firma = await tx(async (db) => {
    const kisi = await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Firma Deneme') RETURNING id");
    return (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, adres, ilce, il, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', 'Örnek Cad. 1', 'Örnek İlçe', 'Ankara', $1) RETURNING id", [kisi?.id]))!.id;
  });
  const govde = { ad: 'Deneme Müşteri', tur: 'musteri' as const, ...konum(3, 3), adres: null, durakSuresiDakika: 15, firmaId: firma };
  const n = await tx((db) => servis.noktaEkle(db, govde));
  assert.equal(n.firmaId, firma);
  await assert.rejects(tx((db) => servis.noktaEkle(db, { ...govde, ad: 'İkinci Şube' })), hata('CAKISMA'));
  await assert.rejects(tx((db) => sorgu.noktaEkle(db, { ...govde, ad: 'İkinci Şube' })), kisit('sevkiyat_noktasi_firma_tek'));
  await assert.rejects(tx((db) => servis.noktaEkle(db, { ...govde, ad: 'Kargo', tur: 'kargo' })), hata('GECERSIZ'));
  await assert.rejects(tx((db) => sorgu.noktaEkle(db, { ...govde, ad: 'Kargo', tur: 'kargo' })), kisit('sevkiyat_noktasi_firma_turu'));
  await assert.rejects(tx((db) => servis.noktaEkle(db, { ...govde, ad: 'Yok', firmaId: 999999 })), hata('GECERSIZ'));
  // Firma adı değişince nokta yeni adı gösterir; seçenekte firmanın noktası görünür.
  await tx((db) => db.sorgu("UPDATE musteri_tedarikci_firma SET ad = 'Yeni Ad Müşteri' WHERE id = $1", [firma]));
  assert.equal((await tx((db) => servis.noktalariListele(db))).noktalar.find((o) => o.id === n.id)?.ad, 'Yeni Ad Müşteri');
  assert.deepEqual(
    (await tx((db) => servis.firmaSecenekleri(db, 'yeni ad'))).map((f) => ({ ad: f.ad, adres: f.adres, ilce: f.ilce, il: f.il, noktaId: f.noktaId })),
    [{ ad: 'Yeni Ad Müşteri', adres: 'Örnek Cad. 1', ilce: 'Örnek İlçe', il: 'Ankara', noktaId: n.id }],
  );
  await tx((db) => servis.noktaPasiflestir(db, n.id));
  assert.equal((await tx((db) => servis.noktaEkle(db, { ...govde, ad: 'Yeni Ad Müşteri' }))).firmaId, firma);
});

test('Sistem Ayarları\'nda fabrika konumu varsa (enlem ve boylam) fabrika oradan çıkar; biri boşsa fabrika noktası geçerlidir (kart #836)', async () => {
  const fabrikaKonumu = async () => {
    const l = await tx((db) => servis.noktalariListele(db));
    const f = l.noktalar.find((n) => n.id === fabrikaId)!;
    return { ayardan: l.fabrikaAyardan, enlem: f.enlem, boylam: f.boylam };
  };
  const yonetici = await tx(async (db) => (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Ayar Deneme') RETURNING id"))!.id);
  const ayarYaz = (anahtar: string, deger: number) => tx((db) => db.sorgu('INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, $2, $3)', [anahtar, JSON.stringify(deger), yonetici]));
  try {
    await ayarYaz('sevkiyat.fabrika-enlem', 39.95);
    assert.deepEqual(await fabrikaKonumu(), { ayardan: false, ...konum(0, 0) });
    await ayarYaz('sevkiyat.fabrika-boylam', 32.75);
    assert.deepEqual(await fabrikaKonumu(), { ayardan: true, enlem: 39.95, boylam: 32.75 });
    const r = await tx((db) => servis.tekRota(db, {
      tarih: '2026-10-08', cikis: '08:30', arac: 'kamyonet', amac: 'sure', fabrikayaDon: true, siraKorunur: false,
      duraklar: [{ noktaId: a, rol: null, cift: null, durakSuresiDakika: null }],
    }, kaynak));
    assert.match(r.plan!.google, /origin=39\.950000%2C32\.750000/);
  } finally {
    await tx((db) => db.sorgu("DELETE FROM ayar WHERE anahtar LIKE 'sevkiyat.fabrika-%'"));
  }
});

test('930 a: fabrika noktasına elle konum yazılmaz; ayar doluysa konum ayardan yazılır, boşsa eski kayıt konumunu korur', async () => {
  await ileriOnaylariKaldir();
  const kayitli = async () => (await tx((db) => sorgu.noktaGetir(db, fabrikaId)))!;
  const guncelle = (k: { enlem: number; boylam: number }, ad = 'Deneme Fabrika') =>
    tx(async (db) => servis.noktaGuncelle(db, fabrikaId, { surum: await surumu(db, 'sevkiyat_noktasi', fabrikaId), ad, tur: 'fabrika', ...k, adres: null, durakSuresiDakika: 10 }));
  const ilk = await kayitli();
  const adDegisti = await guncelle(konum(5, 5), 'Deneme Fabrika 2');
  assert.deepEqual({ ad: adDegisti.ad, enlem: adDegisti.enlem, boylam: adDegisti.boylam }, { ad: 'Deneme Fabrika 2', enlem: Number(ilk.enlem), boylam: Number(ilk.boylam) });
  const yonetici = await tx(async (db) => (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Konum Ayari') RETURNING id"))!.id);
  try {
    await tx((db) => db.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('sevkiyat.fabrika-enlem', '39.95', $1), ('sevkiyat.fabrika-boylam', '32.75', $1)", [yonetici]));
    await guncelle(konum(7, 7));
    assert.deepEqual({ enlem: Number((await kayitli()).enlem), boylam: Number((await kayitli()).boylam) }, { enlem: 39.95, boylam: 32.75 });
  } finally {
    await tx((db) => db.sorgu("DELETE FROM ayar WHERE anahtar LIKE 'sevkiyat.fabrika-%'"));
    await tx((db) => db.sorgu('UPDATE sevkiyat_noktasi SET ad = $2, enlem = $3, boylam = $4 WHERE id = $1', [fabrikaId, 'Deneme Fabrika', ilk.enlem, ilk.boylam]));
  }
});

test('SVK-3: noktanın durak süresi 0-240 dakikadır (veritabanı)', async () => {
  await assert.rejects(tx((db) => sorgu.noktaEkle(db, { ad: 'Uzun Duraklı', tur: 'musteri', ...konum(2, 2), adres: null, durakSuresiDakika: 241, firmaId: null })), kisit('sevkiyat_noktasi_durak_suresi'));
  await tx((db) => sorgu.noktaEkle(db, { ad: 'Sınırda Duraklı', tur: 'musteri', ...konum(2, 2), adres: null, durakSuresiDakika: 240, firmaId: null }));
});

test('araç müsaitliği: bitiş başlangıçtan sonra; kural servis ve veritabanında', async () => {
  await assert.rejects(tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'Ters', musaitBaslangic: '18:00', musaitBitis: '08:00' })), hata('DOGRULAMA'));
  await assert.rejects(tx((db) => sorgu.aracEkle(db, { ...ARAC, ad: 'Ters', musaitBaslangic: '18:00', musaitBitis: '08:00' })), kisit('sevkiyat_araci_musaitlik'));
});

test('SVK-12: iş: fabrika nokta olarak seçilmez; tür ile nokta uyumu ve yük kuralı veritabanında da korunur', async () => {
  await assert.rejects(tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat', birakisNoktasiId: fabrikaId })), hata('DOGRULAMA'));
  await assert.rejects(tx((db) => sorgu.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat' })), kisit('sevkiyat_isi_noktalar'));
  await assert.rejects(tx((db) => sorgu.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat', birakisNoktasiId: a, agirlikKilogram: 0, paletSayisi: 0 })), kisit('sevkiyat_isi_yuk'));
  await assert.rejects(tx((db) => sorgu.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'aktarma', alisNoktasiId: a, birakisNoktasiId: a })), kisit('sevkiyat_isi_noktalar'));
  await assert.rejects(tx((db) => sorgu.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat', birakisNoktasiId: a, birakisEnErken: '12:00', birakisEnGec: '09:00' })), kisit('sevkiyat_isi_birakis_araligi'));
  await assert.rejects(tx((db) => sorgu.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat', birakisNoktasiId: a, alisEnErken: '09:00', alisEnGec: '10:00' })), kisit('sevkiyat_isi_alis_araligi_turu'));
  await assert.rejects(tx((db) => sorgu.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'alim', alisNoktasiId: c, birakisEnErken: '09:00', birakisEnGec: '10:00' })), kisit('sevkiyat_isi_birakis_araligi_turu'));
  await assert.rejects(tx((db) => sorgu.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat', birakisNoktasiId: fabrikaId })), kisit('sevkiyat_isi_fabrika_noktasi'));
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat', birakisNoktasiId: a, agirlikKilogram: 250.5 }));
  assert.equal(is.agirlikKilogram, '250.50');
});

test('sürüm (kart #1323): eski sürümle güncelleme 409 alır ve kaydı değiştirmez; her yazma sürümü artırır', async () => {
  const firmaId = await firmaAc('Sürüm Noktası');
  const nokta = await tx((db) => servis.noktaEkle(db, { ad: 'Sürüm Noktası', tur: 'musteri', ...konum(6, 2), adres: null, durakSuresiDakika: 10, firmaId }));
  assert.equal(nokta.surum, 1);
  const girdi = { ad: 'Sürüm Noktası 2', tur: 'musteri' as const, ...konum(6, 2), adres: null, durakSuresiDakika: 15, firmaId };
  const guncel = await tx((db) => servis.noktaGuncelle(db, nokta.id, { ...girdi, surum: 1 }));
  assert.equal(guncel.surum, 2);
  await assert.rejects(tx((db) => servis.noktaGuncelle(db, nokta.id, { ...girdi, ad: 'Üzerine Yazılan', surum: 1 })), (h: unknown) => hata('CAKISMA')(h) && (h as Error).message === servis.KAYIT_DEGISTI);
  assert.equal((await tx((db) => sorgu.noktaGetir(db, nokta.id)))?.ad, 'Sürüm Noktası 2');
  // Denetimle yazma arasında değişen kayıt: koşullu yazma satır döndürmez.
  assert.equal(await tx((db) => sorgu.noktaGuncelle(db, nokta.id, 1, girdi)), null);

  const arac = await tx((db) => servis.aracEkle(db, { ...ARAC, ad: 'Sürüm Aracı' }));
  await tx((db) => servis.aracGuncelle(db, arac.id, { ...ARAC, ad: 'Sürüm Aracı', kapasitePalet: 5, surum: arac.surum }));
  await assert.rejects(tx((db) => servis.aracGuncelle(db, arac.id, { ...ARAC, ad: 'Sürüm Aracı', surum: arac.surum })), hata('CAKISMA'));
  assert.equal((await tx((db) => servis.aracPasiflestir(db, arac.id))).surum, arac.surum + 2);

  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: '2026-11-20', tur: 'teslimat', birakisNoktasiId: nokta.id }));
  const is2 = await tx((db) => servis.isGuncelle(db, is.id, { ...BOS_IS, tarih: '2026-11-20', tur: 'teslimat', birakisNoktasiId: nokta.id, paletSayisi: 2, surum: is.surum }));
  assert.equal(is2.surum, is.surum + 1);
  await assert.rejects(tx((db) => servis.isGuncelle(db, is.id, { ...BOS_IS, tarih: '2026-11-20', tur: 'teslimat', birakisNoktasiId: nokta.id, surum: is.surum })), hata('CAKISMA'));
  assert.equal((await tx((db) => servis.isIptalEt(db, is.id))).surum, is2.surum + 1);
});

test('SVK-4: işte kullanılan nokta fabrika yapılamaz', async () => {
  await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: '2026-10-07', tur: 'teslimat', birakisNoktasiId: b }));
  await assert.rejects(tx(async (db) => servis.noktaGuncelle(db, b, { surum: await surumu(db, 'sevkiyat_noktasi', b), ad: 'Nokta B', tur: 'fabrika', ...konum(9, 3), adres: null, durakSuresiDakika: 10 })), hata('GECERSIZ'));
  await assert.rejects(tx((db) => sorgu.noktaGuncelle(db, b, 1, { ad: 'Nokta B', tur: 'fabrika', ...konum(9, 3), adres: null, durakSuresiDakika: 10, firmaId: null })), kisit('sevkiyat_noktasi_iste_kullaniliyor'));
});

test('SVK-17, SVK-34: gün planı: dağıt, sürüm denetimi, kaydet, onayla, onaylıda değişiklik reddi, onayı kaldır, iptal', async () => {
  const T = '2026-10-08';
  await havuzuBosalt();
  const t1 = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a }));
  const t2 = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'alim', alisNoktasiId: c }));
  const t3 = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'aktarma', alisNoktasiId: b, birakisNoktasiId: a }));

  const bos = await tx((db) => servis.gunPlani(db, T, kaynak));
  assert.equal(bos.surum, null);
  assert.deepEqual(bos.bekleyen, [t1.id, t2.id, t3.id]);
  assert.ok(bos.onayEngelleri.includes('Planda araca atanmış iş yok.'));

  const p1 = await tx((db) => servis.dagit(db, T, { amac: 'sure', kilitliAraclar: [], surum: null }, 'dagit', kaynak));
  assert.equal(p1.surum, 2);
  assert.deepEqual(p1.bekleyen, []);
  assert.deepEqual(p1.yerlesemeyen, []);
  assert.deepEqual(p1.onayEngelleri, []);
  assert.ok(p1.toplam && p1.toplam.kullanilanArac >= 1);
  assert.equal(p1.karsilastirma.length, 2);
  for (const r of p1.rotalar) if (r.ogeler.length) assert.equal(r.hesap!.duraklar.length, r.ogeler.length);

  // Başkası arada yazdıysa (sürüm farklı) komut reddedilir.
  await assert.rejects(tx((db) => servis.dagit(db, T, { amac: 'sure', kilitliAraclar: [], surum: null }, 'dagit', kaynak)), hata('CAKISMA'));
  await assert.rejects(tx((db) => servis.kaydet(db, T, { amac: 'sure', rotalar: [], surum: 1 }, kaynak)), hata('CAKISMA'));

  // Elle: al-bırak işinin tek ucu verilir, öteki tamamlanır; aynı uç iki araçta olamaz.
  await assert.rejects(tx((db) => servis.kaydet(db, T, { amac: 'mesafe', surum: p1.surum, rotalar: [
    { aracId: k1, kilitli: false, ogeler: [{ isId: t1.id, alis: false }] }, { aracId: k2, kilitli: false, ogeler: [{ isId: t1.id, alis: false }] },
  ] }, kaynak)), hata('DOGRULAMA'));
  const p2 = await tx((db) => servis.kaydet(db, T, { amac: 'mesafe', surum: p1.surum, rotalar: [
    { aracId: k1, kilitli: true, ogeler: [{ isId: t1.id, alis: false }, { araDonus: true }, { isId: t3.id, alis: false }] },
    { aracId: k2, kilitli: false, ogeler: [] },
  ] }, kaynak));
  assert.equal(p2.amac, 'mesafe');
  assert.deepEqual(p2.rotalar.find((r) => r.aracId === k1)!.ogeler, [{ isId: t1.id, alis: false }, { araDonus: true }, { isId: t3.id, alis: true }, { isId: t3.id, alis: false }]);
  assert.deepEqual(p2.bekleyen, [t2.id]);

  // Yerleştir yalnız bekleyeni ekler; kilitli araç iş almaz.
  const p3 = await tx((db) => servis.dagit(db, T, { amac: 'mesafe', kilitliAraclar: [k1], surum: p2.surum }, 'yerlestir', kaynak));
  assert.deepEqual(p3.bekleyen, []);
  assert.deepEqual(p3.rotalar.find((r) => r.aracId === k1)!.ogeler, p2.rotalar.find((r) => r.aracId === k1)!.ogeler);
  assert.deepEqual(p3.rotalar.find((r) => r.aracId === k2)!.ogeler, [{ isId: t2.id, alis: true }]);

  await assert.rejects(tx((db) => servis.onayla(db, T, p3.surum! - 1, kaynak)), hata('CAKISMA'));
  const onayli = await tx((db) => servis.onayla(db, T, p3.surum!, kaynak));
  assert.ok(onayli.onaylandi);
  assert.deepEqual(onayli.rotalar.map((r) => r.ogeler), p3.rotalar.map((r) => r.ogeler));
  // Onay anının saatleri kaydedilir ve geri okunur.
  for (const r of onayli.rotalar.filter((x) => x.ogeler.length)) {
    assert.deepEqual(r.onaySaatleri!.map((x) => [Math.round(x!.varis), Math.round(x!.ayrilis)]), r.hesap!.duraklar.map((d) => [Math.round(d.varis), Math.round(d.ayrilis)]));
  }
  assert.equal(taslakSaatleri(p3), true);
  // Onaylı planın satırı da değişmez ve silinmez.
  await assert.rejects(tx((db) => db.sorgu("UPDATE sevkiyat_plani SET amac = 'mesafe' WHERE tarih = $1", [T])), kisit('sevkiyat_onayli_plan_satiri_degismez'));
  await assert.rejects(tx((db) => db.sorgu('DELETE FROM sevkiyat_plani WHERE tarih = $1', [T])), kisit('sevkiyat_onayli_plan_satiri_degismez'));

  // Onaylı plan ve içindeki iş değişmez (servis ve veritabanı).
  await assert.rejects(tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: onayli.surum, rotalar: [] }, kaynak)), hata('GECERSIZ'));
  await assert.rejects(tx((db) => servis.isIptalEt(db, t1.id)), hata('GECERSIZ'));
  await assert.rejects(tx(async (db) => servis.isGuncelle(db, t1.id, { surum: await surumu(db, 'sevkiyat_isi', t1.id), ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a, agirlikKilogram: 5 })), hata('GECERSIZ'));
  const planId = (await tx((db) => sorgu.planGetir(db, T)))!.id;
  await assert.rejects(tx((db) => sorgu.planRotalariniYaz(db, planId, T, [])), kisit('sevkiyat_onayli_plan_degismez'));
  await assert.rejects(tx((db) => sorgu.isIptalEt(db, t1.id)), kisit('sevkiyat_onayli_plandaki_is_degismez'));

  await assert.rejects(tx((db) => servis.onayiKaldir(db, T, onayli.surum! - 1, kaynak)), hata('CAKISMA'));
  const taslak = await tx((db) => servis.onayiKaldir(db, T, onayli.surum!, kaynak));
  assert.equal(taslak.onaylandi, null);

  // Taslakta iptal edilen iş plandan çıkar; ara dönüş temizlenir ve plan yeniden onaylanabilir.
  await tx((db) => servis.isIptalEt(db, t3.id));
  const sonra = await tx((db) => servis.gunPlani(db, T, kaynak));
  assert.deepEqual(sonra.rotalar.find((r) => r.aracId === k1)!.ogeler, [{ isId: t1.id, alis: false }]);
  assert.equal(sonra.isler.some((i) => i.id === t3.id), false);
  const yeniden = await tx((db) => servis.onayla(db, T, sonra.surum!, kaynak));
  assert.ok(yeniden.onaylandi);
});

test('ileri tarihli iş bugünün planına konamaz; işin aynı ucu planda iki kez yer almaz (veritabanı)', async () => {
  const T = '2026-10-09';
  const baskaGun = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: '2026-10-10', tur: 'teslimat', birakisNoktasiId: a }));
  const bugun = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a }));
  const plan = (await tx((db) => sorgu.planOlustur(db, T, 'sure')))!;
  await assert.rejects(tx((db) => sorgu.planRotalariniYaz(db, plan.id, T, [
    { aracId: k1, kilitli: false, ogeler: [{ isId: bugun.id, alis: false }] }, { aracId: k2, kilitli: false, ogeler: [{ isId: bugun.id, alis: false }] },
  ])), kisit('sevkiyat_plan_duragi_tek_uc'));
  await assert.rejects(tx((db) => sorgu.planRotalariniYaz(db, plan.id, T, [{ aracId: k1, kilitli: false, ogeler: [{ isId: bugun.id, alis: true }] }])), kisit('sevkiyat_plan_duragi_uc_turu'));
  // Başka güne ait iş elle plana konamaz (servis).
  await assert.rejects(tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: plan.surum, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: baskaGun.id, alis: false }] }] }, kaynak)), hata('DOGRULAMA'));
});

test('havuz: geciken iş bugünün listesine düşer, plana alınınca o güne taşınır; onayla yola çıkar', async () => {
  // Geçmiş günler: ileri tarihli onaylı planları kaldıran testler bu planlara (sonuç girilmiş) dokunmaz.
  const [T0, T1, T2] = ['2026-09-01', '2026-09-02', '2026-09-03'];
  await havuzuBosalt();
  const x = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T0, tur: 'teslimat', birakisNoktasiId: a }));
  const y = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T1, tur: 'alim', alisNoktasiId: c }));
  const ileri = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T2, tur: 'teslimat', birakisNoktasiId: b }));
  const bos = await tx((db) => servis.gunPlani(db, T1, kaynak));
  assert.deepEqual(bos.bekleyen, [x.id, y.id], 'geciken dahil, ileri tarihli hariç');
  assert.deepEqual(bos.isler.map((i) => [i.id, i.durum, i.istenenTarih]), [[x.id, 'havuzda', T0], [y.id, 'havuzda', T1]]);

  const p = await tx((db) => servis.kaydet(db, T1, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: x.id, alis: false }, { isId: y.id, alis: true }] }] }, kaynak));
  assert.deepEqual(p.isler.map((i) => [i.id, i.durum, i.tarih, i.istenenTarih]), [[x.id, 'planlandi', T1, T0], [y.id, 'planlandi', T1, T1]]);
  // Plandan çıkan iş havuza döner ama plana alındığı günde kalır.
  const p2 = await tx((db) => servis.kaydet(db, T1, { amac: 'sure', surum: p.surum, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: x.id, alis: false }] }] }, kaynak));
  assert.equal(p2.isler.find((i) => i.id === y.id)!.durum, 'havuzda');
  const p3 = await tx((db) => servis.kaydet(db, T1, { amac: 'sure', surum: p2.surum, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: x.id, alis: false }, { isId: y.id, alis: true }] }] }, kaynak));
  const onayli = await tx((db) => servis.onayla(db, T1, p3.surum!, kaynak));
  assert.deepEqual(onayli.isler.map((i) => i.durum), ['yolda', 'yolda']);
  assert.deepEqual(onayli.sonuclar, []);

  // Yoldaki iş: biri yapılamadı (havuza döner), öteki tamamlandı; yanlış sonuç geri alınır.
  const xDondu = await tx((db) => servis.isDurumuDegistir(db, x.id, { durum: 'yapilamadi', tarih: T1, not: 'Müşteri kapalı' }));
  assert.equal(xDondu.is.durum, 'havuzda');
  await tx((db) => servis.isDurumuDegistir(db, y.id, { durum: 'tamamlandi', tarih: T1, not: null }));
  assert.equal((await tx((db) => servis.isDurumuDegistir(db, y.id, { durum: 'yolda', tarih: T1, not: null }))).is.durum, 'yolda');
  await tx((db) => servis.isDurumuDegistir(db, y.id, { durum: 'tamamlandi', tarih: T1, not: null }));
  const gunSonu = await tx((db) => servis.gunPlani(db, T1, kaynak));
  assert.deepEqual(gunSonu.sonuclar, [{ isId: x.id, sonuc: 'yapilamadi', not: 'Müşteri kapalı' }, { isId: y.id, sonuc: 'tamamlandi', not: null }]);
  assert.deepEqual(gunSonu.bekleyen, [], 'yapılamayan iş o günün rotasında görünür, bekleyen değildir');
  await assert.rejects(tx((db) => servis.onayiKaldir(db, T1, gunSonu.surum!, kaynak)), hata('GECERSIZ'));
  await assert.rejects(tx((db) => servis.isDurumuDegistir(db, ileri.id, { durum: 'yapilamadi', tarih: T1, not: null })), hata('GECERSIZ'));

  // Tamamlanan iş düzenlenmez, iptal edilmez (servis ve veritabanı).
  await assert.rejects(tx(async (db) => servis.isGuncelle(db, y.id, { surum: await surumu(db, 'sevkiyat_isi', y.id), ...BOS_IS, tarih: T1, tur: 'alim', alisNoktasiId: c, agirlikKilogram: 5 })), hata('GECERSIZ'));
  await assert.rejects(tx((db) => servis.isIptalEt(db, y.id)), hata('GECERSIZ'));
  await assert.rejects(tx((db) => sorgu.isIptalEt(db, y.id)), kisit('sevkiyat_onayli_plandaki_is_degismez'));

  // Yapılamayan iş düzenlenebilir (onaylı plandaki durağı geçmiştir, değişmez).
  await tx(async (db) => servis.isGuncelle(db, x.id, { surum: await surumu(db, 'sevkiyat_isi', x.id), ...BOS_IS, tarih: T0, tur: 'teslimat', birakisNoktasiId: a, belgeNo: 'DENEME-2' }));
  // Ertesi gün: yapılamayan iş havuzdadır, kaç kez yapılamadığı ve notuyla; yeniden planlanınca sonucu geri alınamaz.
  const ertesi = await tx((db) => servis.gunPlani(db, T2, kaynak));
  assert.deepEqual(ertesi.bekleyen, [x.id, ileri.id]);
  const xErtesi = ertesi.isler.find((i) => i.id === x.id)!;
  assert.deepEqual([xErtesi.yapilamadiSayisi, xErtesi.sonNot, xErtesi.istenenTarih], [1, 'Müşteri kapalı', T0]);
  await tx((db) => servis.kaydet(db, T2, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: x.id, alis: false }] }] }, kaynak));
  await assert.rejects(tx((db) => servis.isDurumuDegistir(db, x.id, { durum: 'yolda', tarih: T1, not: null })), hata('GECERSIZ'));
  await assert.rejects(tx((db) => servis.isDurumuDegistir(db, x.id, { durum: 'tamamlandi', tarih: T2, not: null })), hata('GECERSIZ'));

  // Tamamlanan iş yeniden açılınca havuza düşer; havuzdaki iş elle kapatılınca o günün listesinde kapalı görünür.
  assert.equal((await tx((db) => servis.isDurumuDegistir(db, y.id, { durum: 'havuzda', tarih: T2, not: null }))).is.durum, 'havuzda');
  assert.deepEqual((await tx((db) => servis.gunPlani(db, T1, kaynak))).sonuclar.map((s) => s.isId), [x.id]);
  assert.ok((await tx((db) => servis.gunPlani(db, T2, kaynak))).bekleyen.includes(y.id));
  await tx((db) => servis.isDurumuDegistir(db, y.id, { durum: 'tamamlandi', tarih: T2, not: null }));
  const kapali = await tx((db) => servis.gunPlani(db, T2, kaynak));
  assert.equal(kapali.isler.find((i) => i.id === y.id)!.durum, 'tamamlandi');
  assert.equal(kapali.bekleyen.includes(y.id), false);
});

test('931 b: onay işe onaylayanı, sonuç sonucu yazanı yazar; onay kaldırma, geri alma ve yeniden açma kişiyi siler', async () => {
  const T = '2026-08-12';
  await havuzuBosalt();
  const [onaylayan, yazan] = await tx(async (db) => [
    (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Onaylayan') RETURNING id"))!.id,
    (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Sonuç') RETURNING id"))!.id,
  ]);
  const kisiler = (id: number) => tx((db) => db.tek<{ o: number | null; s: number | null }>(
    'SELECT onaylayan_kisi_id AS o, sonuc_kisi_id AS s FROM sevkiyat_isi WHERE id = $1', [id]));
  const x = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a }));
  const y = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: b }));
  const p = await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: x.id, alis: false }, { isId: y.id, alis: false }] }] }, kaynak));
  assert.deepEqual(await kisiler(x.id), { o: null, s: null }, 'taslak planda kişi yok');

  const onayli = await tx((db) => servis.onayla(db, T, p.surum!, kaynak, onaylayan));
  assert.deepEqual(await kisiler(x.id), { o: onaylayan, s: null });
  const taslak = await tx((db) => servis.onayiKaldir(db, T, onayli.surum!, kaynak, onaylayan));
  assert.deepEqual(await kisiler(x.id), { o: null, s: null }, 'onay kalkınca onaylayan silinir');
  await tx((db) => servis.onayla(db, T, taslak.surum!, kaynak, onaylayan));

  await tx((db) => servis.isDurumuDegistir(db, x.id, { durum: 'tamamlandi', tarih: T, not: null }, yazan));
  assert.deepEqual(await kisiler(x.id), { o: onaylayan, s: yazan });
  await tx((db) => servis.isDurumuDegistir(db, x.id, { durum: 'yolda', tarih: T, not: null }, onaylayan));
  assert.deepEqual(await kisiler(x.id), { o: onaylayan, s: null }, 'geri alınan sonucun yazanı silinir');
  await tx((db) => servis.isDurumuDegistir(db, x.id, { durum: 'tamamlandi', tarih: T, not: null }, yazan));
  await tx((db) => servis.isDurumuDegistir(db, x.id, { durum: 'havuzda', tarih: T, not: null }, onaylayan));
  assert.deepEqual(await kisiler(x.id), { o: null, s: null }, 'yeniden açılan iş onaylı planda değildir');

  await tx((db) => servis.isDurumuDegistir(db, y.id, { durum: 'yapilamadi', tarih: T, not: 'Deneme notu' }, yazan));
  assert.deepEqual(await kisiler(y.id), { o: null, s: yazan }, 'yapılamayan iş havuza döner, sonucu yazan kalır');
});

test('onaylı planda yalnız durağın sonucu yazılır (veritabanı)', async () => {
  const durak = await tx((db) => db.tek<{ planId: number; aracId: number; sira: number }>(
    `SELECT d.plan_id AS "planId", d.arac_id AS "aracId", d.sira FROM sevkiyat_plan_duragi d JOIN sevkiyat_plani p ON p.id = d.plan_id
      WHERE p.onaylandi IS NOT NULL AND d.is_id IS NOT NULL LIMIT 1`));
  assert.ok(durak);
  const kosul = 'WHERE plan_id = $1 AND arac_id = $2 AND sira = $3';
  await tx((db) => db.sorgu(`UPDATE sevkiyat_plan_duragi SET sonuc = 'tamamlandi', sonuc_zamani = now() ${kosul}`, [durak.planId, durak.aracId, durak.sira]));
  await assert.rejects(tx((db) => db.sorgu(`UPDATE sevkiyat_plan_duragi SET alis = NOT alis ${kosul}`, [durak.planId, durak.aracId, durak.sira])), kisit('sevkiyat_onayli_plan_degismez'));
  await assert.rejects(tx((db) => db.sorgu(`UPDATE sevkiyat_plan_duragi SET sonuc_zamani = NULL ${kosul}`, [durak.planId, durak.aracId, durak.sira])), kisit('sevkiyat_plan_duragi_sonuc_butun'));
  await tx((db) => db.sorgu(`UPDATE sevkiyat_plan_duragi SET sonuc = NULL, sonuc_zamani = NULL ${kosul}`, [durak.planId, durak.aracId, durak.sira]));
});

test('noktası pasifleşen iş onayı engeller', async () => {
  const T = '2026-10-12';
  const gecici = await nokta('Geçici Müşteri', 5, 5);
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: gecici.id }));
  const p = await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, kaynak));
  assert.deepEqual(p.onayEngelleri, []);
  await tx((db) => servis.noktaPasiflestir(db, gecici.id));
  const q = await tx((db) => servis.gunPlani(db, T, kaynak));
  assert.deepEqual(q.atanamayan.map((x) => x.isId), [is.id]);
  assert.ok(q.onayEngelleri.some((e) => e.includes('pasifleştirilmiş')));
  await assert.rejects(tx((db) => servis.onayla(db, T, q.surum!, kaynak)), hata('GECERSIZ'));
});

test('yerleşemeyen iş nedeniyle döner, bekleyende kalır; okuma cevabında bu liste boştur', async () => {
  const T = '2026-10-14';
  await havuzuBosalt();
  const agir = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a, agirlikKilogram: 90000 }));
  const p = await tx((db) => servis.dagit(db, T, { amac: 'sure', kilitliAraclar: [], surum: null }, 'dagit', kaynak));
  assert.deepEqual(p.bekleyen, [agir.id]);
  assert.deepEqual(p.yerlesemeyen, [{ isId: agir.id, neden: 'Hiçbir aracın kapasitesi yetmiyor' }]);
  assert.deepEqual((await tx((db) => servis.gunPlani(db, T, kaynak))).yerlesemeyen, []);
});

test('yol ağı yoksa plan kaydedilir ama saat hesaplanmaz, dağıtma ve onay yapılamaz', async () => {
  const T = '2026-10-13';
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a }));
  await assert.rejects(tx((db) => servis.dagit(db, T, { amac: 'sure', kilitliAraclar: [], surum: null }, 'dagit', yok)), hata('GECERSIZ'));
  const p = await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, yok));
  assert.equal(p.haritaVar, false);
  assert.equal(p.toplam, null);
  assert.equal(p.rotalar.find((r) => r.aracId === k1)!.hesap, null);
  assert.ok(p.onayEngelleri.some((e) => e.includes('Harita paketi')));
  assert.ok(!p.onayEngelleri.includes('Planda araca atanmış iş yok.'), 'araçta iş varken "iş yok" denmez');
  await assert.rejects(tx((db) => servis.onayla(db, T, p.surum!, yok)), hata('GECERSIZ'));
});

test('tek rota: kayıtlı noktalarla sıra, saatler ve al-bırak önceliği; pasif nokta reddedilir', async () => {
  const sorgula = (duraklar: { noktaId: number; rol: 'al' | 'birak' | null; cift: number | null }[]) => tx((db) => servis.tekRota(db, {
    tarih: '2026-10-08', cikis: '08:30', arac: 'kamyonet', amac: 'sure', fabrikayaDon: true, siraKorunur: false,
    duraklar: duraklar.map((d) => ({ ...d, durakSuresiDakika: null })),
  }, kaynak));
  const r = await sorgula([{ noktaId: a, rol: 'birak', cift: 1 }, { noktaId: b, rol: 'al', cift: 1 }, { noktaId: c, rol: null, cift: null }]);
  assert.equal(r.neden, null);
  const sira = r.plan!.duraklar.map((d) => d.noktaId);
  assert.ok(sira.indexOf(b) < sira.indexOf(a));
  assert.ok(r.plan!.donus! > r.plan!.duraklar[r.plan!.duraklar.length - 1]!.ayrilis);
  assert.equal(r.plan!.karsilastirma.length, 2);
  const gecici = await nokta('Pasif Nokta', 4, 4);
  await tx((db) => servis.noktaPasiflestir(db, gecici.id));
  await assert.rejects(sorgula([{ noktaId: gecici.id, rol: null, cift: null }]), hata('DOGRULAMA'));
  await assert.rejects(sorgula([{ noktaId: a, rol: 'al', cift: 1 }]), hata('DOGRULAMA'));
});

test('arama kayıtlı noktayı bulur; trafik ve harita yol ağı yoksa null döner', async () => {
  const s = await tx((db) => servis.adresAra(db, 'nokta a', kaynak));
  assert.equal(s.sonuclar[0]!.noktaId, a);
  assert.equal(s.dizinVar, false);
  assert.equal((await servis.trafik(yok, '2026-10-08', 480)).seviyeler, null);
  assert.equal(await servis.harita(yok), null);
  const t = await servis.trafik(kaynak, '2026-10-08', 487);
  assert.equal(t.dakika, 480);
  assert.ok(t.seviyeler!.length > 0);
});

test('SVK-18: iş başka güne taşınınca plandan çıkar ve planın sürümü artar', async () => {
  const T = '2026-10-15';
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a }));
  const p = await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, kaynak));
  await tx(async (db) => servis.isGuncelle(db, is.id, { surum: await surumu(db, 'sevkiyat_isi', is.id), ...BOS_IS, tarih: '2026-10-16', tur: 'teslimat', birakisNoktasiId: a }));
  const sonra = await tx((db) => servis.gunPlani(db, T, kaynak));
  assert.deepEqual(sonra.rotalar.find((r) => r.aracId === k1)!.ogeler, []);
  assert.equal(sonra.surum, p.surum! + 1);
});

test('aynı anda iki ilk kayıt: biri yazılır, öteki çakışma alır', async () => {
  const T = '2026-10-17';
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a }));
  const kayit = (aracId: number) => tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, yok));
  const sonuc = await Promise.allSettled([kayit(k1), kayit(k2)]);
  assert.equal(sonuc.filter((x) => x.status === 'fulfilled').length, 1);
  assert.ok(sonuc.some((x) => x.status === 'rejected' && hata('CAKISMA')(x.reason)));
});

test('iki gün aynı anda kaydedilince ortak iş tek taslakta kalır (KD-030)', async () => {
  for (let tur = 0; tur < 5; tur++) {
    const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: '2027-03-01', tur: 'teslimat', birakisNoktasiId: a }));
    const kayit = (tarih: string, aracId: number) => tx((db) => servis.kaydet(db, tarih, { amac: 'sure', surum: null, rotalar: [{ aracId, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, yok));
    const gun = (n: number) => `2027-03-${String(n).padStart(2, '0')}`;
    // Sıraya giren ikinci kayıt işi öteki günde planlanmış bulur: ya iş artık bu güne ait değildir ya da sürüm değişmiştir.
    const sonuc = await Promise.allSettled([kayit(gun(2 + tur * 2), k1), kayit(gun(3 + tur * 2), k2)]);
    assert.equal(sonuc.filter((x) => x.status === 'fulfilled').length, 1);
    assert.ok(sonuc.every((x) => x.status === 'fulfilled' || hata('DOGRULAMA')(x.reason) || hata('CAKISMA')(x.reason)));
    const taslaklar = await tx((db) => db.sorgu<{ n: number }>(
      `SELECT count(DISTINCT d.plan_id)::int AS n FROM sevkiyat_plan_duragi d JOIN sevkiyat_plani p ON p.id = d.plan_id
        WHERE d.is_id = $1 AND p.onaylandi IS NULL`, [is.id]));
    assert.equal(taslaklar[0]!.n, 1);
  }
});

test('iptal ile onay aynı anda: iptal edilen iş onaylı planda kalmaz', async () => {
  const T = '2026-10-19';
  const t1 = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: a }));
  const t2 = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: b }));
  const p = await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: t1.id, alis: false }, { isId: t2.id, alis: false }] }] }, kaynak));
  await Promise.allSettled([tx((db) => servis.isIptalEt(db, t2.id)), tx((db) => servis.onayla(db, T, p.surum!, kaynak))]);
  const son = await tx((db) => servis.gunPlani(db, T, kaynak));
  const iptalEdildi = !son.isler.some((i) => i.id === t2.id), plandaki = son.rotalar.flatMap((r) => r.ogeler.flatMap((o) => ('isId' in o ? [o.isId] : [])));
  assert.equal(son.onaylandi !== null && iptalEdildi, false, 'onaylı plan ile iptal birlikte olamaz');
  if (iptalEdildi) assert.equal(plandaki.includes(t2.id), false);
});

test('noktanın durak süresi değişince plan saatleri yeni süreyle hesaplanır (önbellekteki matris eski süreyi taşımaz)', async () => {
  const T = '2026-10-20';
  const n = await nokta('Süresi Değişen', 7, 7);
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: n.id }));
  await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, kaynak));
  const sure = async () => { const d = (await tx((db) => servis.gunPlani(db, T, kaynak))).rotalar.find((r) => r.aracId === k1)!.hesap!.duraklar[0]!; return d.ayrilis - d.baslama; };
  assert.equal(await sure(), 10);
  await tx(async (db) => servis.noktaGuncelle(db, n.id, { surum: await surumu(db, 'sevkiyat_noktasi', n.id), ad: 'Süresi Değişen', tur: 'musteri', ...konum(7, 7), adres: null, durakSuresiDakika: 90, firmaId: n.firmaId }));
  assert.equal(await sure(), 90);
});

test('SVK-40: gece yarısını aşan elle rota uyarıyla döner; cevap sözleşmeye uyar', async () => {
  const T = '2026-10-21';
  const uzun = await nokta('Uzun Duraklı Müşteri', 8, 8);
  await tx(async (db) => servis.noktaGuncelle(db, uzun.id, { surum: await surumu(db, 'sevkiyat_noktasi', uzun.id), ad: 'Uzun Duraklı Müşteri', tur: 'musteri', ...konum(8, 8), adres: null, durakSuresiDakika: 240, firmaId: uzun.firmaId }));
  const isler: { id: number }[] = [];
  for (let i = 0; i < 12; i++) isler.push(await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: uzun.id })));
  const p = await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k2, kilitli: false, ogeler: isler.map((i) => ({ isId: i.id, alis: false })) }] }, kaynak));
  const r = p.rotalar.find((x) => x.aracId === k2)!;
  assert.ok(r.hesap!.donus > 2880);
  assert.equal(r.hesap!.kurallaraUygun, false);
  assert.equal(gunPlaniCevabi.safeParse(p).success, true);
});

// Önceki testlerin bıraktığı bugün ve ileri tarihli onaylar kaldırılır: koruma kuralı test sırasından bağımsız sınansın.
async function ileriOnaylariKaldir() {
  const planlar = await vt.sorgu<{ tarih: string }>('SELECT tarih FROM sevkiyat_plani WHERE onaylandi IS NOT NULL AND tarih >= current_date');
  for (const { tarih } of planlar) {
    const p = await tx((db) => servis.gunPlani(db, tarih, kaynak));
    await tx((db) => servis.onayiKaldir(db, tarih, p.surum!, kaynak));
  }
}

test('aktif fabrika pasifleştirilmez ve başka türe çevrilmez; konumu güncellenebilir (açık soru 8)', async () => {
  await ileriOnaylariKaldir();
  await assert.rejects(tx((db) => servis.noktaPasiflestir(db, fabrikaId)), hata('GECERSIZ'));
  await assert.rejects(tx(async (db) => servis.noktaGuncelle(db, fabrikaId, { surum: await surumu(db, 'sevkiyat_noktasi', fabrikaId), ad: 'Deneme Fabrika', tur: 'musteri', ...konum(0, 0), adres: null, durakSuresiDakika: 10 })), hata('GECERSIZ'));
  const tasindi = await tx(async (db) => servis.noktaGuncelle(db, fabrikaId, { surum: await surumu(db, 'sevkiyat_noktasi', fabrikaId), ad: 'Deneme Fabrika', tur: 'fabrika', ...konum(0, 1), adres: null, durakSuresiDakika: 10 }));
  assert.equal(tasindi.aktif, true);
  await tx(async (db) => servis.noktaGuncelle(db, fabrikaId, { surum: await surumu(db, 'sevkiyat_noktasi', fabrikaId), ad: 'Deneme Fabrika', tur: 'fabrika', ...konum(0, 0), adres: null, durakSuresiDakika: 10 }));
});

test('bugün ya da ileri tarihli onaylı plandaki araç ve nokta, onay kaldırılmadan değişmez ve pasifleşmez (açık soru 12)', async () => {
  await ileriOnaylariKaldir();
  const T = '2099-03-02';
  const musteri = await nokta('Onaylı Müşteri', 4, 7);
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: musteri.id }));
  const p = await tx((db) => servis.kaydet(db, T, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, kaynak));
  const onayli = await tx((db) => servis.onayla(db, T, p.surum!, kaynak));
  const aracGovdesi = { ...ARAC, ad: 'Araç 1', saatMaliyeti: 400 };
  for (const komut of [
    () => tx(async (db) => servis.aracGuncelle(db, k1, { ...aracGovdesi, surum: await surumu(db, 'sevkiyat_araci', k1) })),
    () => tx((db) => servis.aracPasiflestir(db, k1)),
    () => tx(async (db) => servis.noktaGuncelle(db, musteri.id, { surum: await surumu(db, 'sevkiyat_noktasi', musteri.id), ad: 'Onaylı Müşteri', tur: 'musteri', ...konum(4, 8), adres: null, durakSuresiDakika: 10, firmaId: musteri.firmaId })),
    () => tx((db) => servis.noktaPasiflestir(db, musteri.id)),
    // Fabrika her onaylı rotanın başıdır.
    () => tx(async (db) => servis.noktaGuncelle(db, fabrikaId, { surum: await surumu(db, 'sevkiyat_noktasi', fabrikaId), ad: 'Deneme Fabrika', tur: 'fabrika', ...konum(0, 1), adres: null, durakSuresiDakika: 10 })),
  ]) {
    await assert.rejects(komut(), (h: unknown) => hata('GECERSIZ')(h) && (h as Error).message.includes(T) && (h as Error).message.includes('onayını kaldırın'));
  }
  // Plana girmeyen araç değişir.
  await tx(async (db) => servis.aracGuncelle(db, k2, { surum: await surumu(db, 'sevkiyat_araci', k2), ...ARAC, ad: 'Araç 2', tur: 'kamyon', kapasiteKilogram: 5000, kapasitePalet: 10 }));
  await tx((db) => servis.onayiKaldir(db, T, onayli.surum!, kaynak));
  assert.equal((await tx(async (db) => servis.aracGuncelle(db, k1, { ...aracGovdesi, surum: await surumu(db, 'sevkiyat_araci', k1) }))).saatMaliyeti, '400.00');
  await tx(async (db) => servis.aracGuncelle(db, k1, { ...ARAC_GERI, surum: await surumu(db, 'sevkiyat_araci', k1) }));
  await tx((db) => servis.noktaPasiflestir(db, musteri.id));
});
const ARAC_GERI = { ...ARAC, ad: 'Araç 1' };

test('rol x işlem (açık soru 3): planlamacı iş ve plan yazar; depo ve sevkiyat eş yetkide, ayrıca onaylar ve tanımlar; öbür roller okur', async () => {
  const satirlar = await vt.sorgu<{ kod: string; islemler: string[] }>(
    `SELECT r.kod, array_agg(ri.islem ORDER BY ri.islem) AS islemler FROM rol r JOIN rol_islemi ri ON ri.rol_id = r.id
      WHERE ri.islem LIKE 'sevkiyat.%' OR ri.islem = 'sayfa.sevkiyat' GROUP BY r.kod`,
  );
  const m = new Map(satirlar.map((s) => [s.kod, s.islemler]));
  assert.deepEqual(m.get('planlama_proje'), ['sayfa.sevkiyat', 'sevkiyat.is-yaz', 'sevkiyat.oku', 'sevkiyat.plan-yaz']);
  assert.deepEqual(m.get('depo'), ['sayfa.sevkiyat', 'sevkiyat.is-yaz', 'sevkiyat.oku', 'sevkiyat.onayla', 'sevkiyat.plan-yaz', 'sevkiyat.tanim-yaz']);
  assert.deepEqual(m.get('sevkiyat'), m.get('depo'));
  const stok = await vt.sorgu<{ kod: string }>("SELECT r.kod FROM rol r JOIN rol_islemi ri ON ri.rol_id = r.id WHERE ri.islem = 'sayfa.stok' AND r.kod IN ('depo', 'sevkiyat') ORDER BY r.kod");
  assert.deepEqual(stok.map((x) => x.kod), ['depo', 'sevkiyat'], 'sevkiyat rolü depo ile eş: stok sayfasını da açar');
  for (const kod of ['mudur', 'kalite', 'insan_kaynaklari', 'satin_alma', 'muhasebe_finans', 'idari_isler', 'cam']) {
    assert.deepEqual(m.get(kod), ['sayfa.sevkiyat', 'sevkiyat.oku'], kod);
  }
  assert.equal(m.has('operator'), false, 'operatör sevkiyatı görmez (kart #713)');
  assert.equal(m.has('yonetici'), false, 'yönetici bütün işlemleri bayrakla alır, satır gerekmez');
});

test('özet: bekleyen bugüne kadarki havuzu, gecikmiş istenen günü geçmiş açık işi sayar; ileri tarihli ve iptal sayılmaz', async () => {
  await havuzuBosalt();
  const { bugun, dun, yarin } = (await tx((db) => db.tek<{ bugun: string; dun: string; yarin: string }>(
    "SELECT current_date::text AS bugun, (current_date - 1)::text AS dun, (current_date + 1)::text AS yarin",
  )))!;
  await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: dun, tur: 'teslimat', birakisNoktasiId: a }));
  await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: bugun, tur: 'teslimat', birakisNoktasiId: b }));
  await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: yarin, tur: 'teslimat', birakisNoktasiId: a }));
  const iptal = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: dun, tur: 'teslimat', birakisNoktasiId: b }));
  await tx((db) => db.sorgu('UPDATE sevkiyat_isi SET iptal_edildi = now() WHERE id = $1', [iptal.id]));
  assert.deepEqual(await tx((db) => servis.ozet(db)), { bekleyen: 2, gecikmis: 1 });
});

test('ileri tarihli onaylı planın teslim ve yapılamadı sonucu girilmez', async () => {
  await havuzuBosalt();
  // Öbür testlerin sabit günleriyle çakışmasın diye uzak bir gün.
  const { ileri } = (await tx((db) => db.tek<{ ileri: string }>("SELECT (current_date + 40)::text AS ileri")))!;
  const is = await tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: ileri, tur: 'teslimat', birakisNoktasiId: a }));
  const p = await tx((db) => servis.kaydet(db, ileri, { amac: 'sure', surum: null, rotalar: [{ aracId: k1, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, kaynak));
  await tx((db) => servis.onayla(db, ileri, p.surum!, kaynak));
  for (const durum of ['tamamlandi', 'yapilamadi'] as const) {
    await assert.rejects(tx((db) => servis.isDurumuDegistir(db, is.id, { durum, tarih: ileri, not: null })), hata('GECERSIZ'), durum);
  }
  // Onay kaldırılıp plan yeniden kurulmadan iş yolda kalır; geçmiş ve bugünkü planda sonuç girişi öbür testlerde.
  assert.equal((await tx((db) => sorgu.isGetir(db, is.id)))!.durum, 'yolda');
});
