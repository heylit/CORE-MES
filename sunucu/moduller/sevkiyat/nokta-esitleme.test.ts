// 2133: firma ve fabrika ayarı kaydedilince sevkiyat noktası kendiliğinden açılır ya da eşitlenir (2133-1 b, 2133-4 a); konumu
// olmayan firma "konum eksik" listesinde kalır (2133-2 a). Gerçek PostgreSQL. Olayı veren modüllerin kendi testleri olayın
// verildiğini denetler; burada firma ve ayar satırı doğrudan yazılır, dinleyici olayla çağrılır.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import * as servis from './servis.ts';
import * as sorgu from './sorgular.ts';
import { DEPODAKI_PAKET } from './uclar.ts';

let ortam: TestVeritabani;
let vt: Veritabani;
let kisiId = 0;
const tx = <T>(is: (db: Db) => Promise<T>) => vt.tx(is);
const olay = (firmaId: number, kaldirilanAdresId: number | null = null) => tx((db) => servis.firmaDegistiYansit(db, { firmaId, kaldirilanAdresId }));

type FirmaGirdisi = { ad: string; kod?: string; tur?: 'musteri' | 'tedarikci' | 'ikisi'; fason?: boolean; enlem?: number; boylam?: number; adres?: string };
// Firma servisinin yazdığı gibi: satır yazılır, sonra olay verilir.
const firmaEkle = async (f: FirmaGirdisi) => {
  const id = await tx(async (db) => (await db.tek<{ id: number }>(
    `INSERT INTO musteri_tedarikci_firma (ad, kod, tur, fason, adres, ilce, il, enlem, boylam, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, 'Merkez', 'Ornek', $6, $7, $8) RETURNING id`,
    [f.ad, f.kod ?? null, f.tur ?? 'musteri', f.fason ?? false, f.adres ?? null, f.enlem ?? null, f.boylam ?? null, kisiId],
  ))!.id);
  await olay(id);
  return id;
};
const adresEkle = async (firmaId: number, a: { tur: 'fatura' | 'teslim' | 'sube'; ad: string; adres: string; enlem: number; boylam: number }) => {
  const id = await tx(async (db) => (await db.tek<{ id: number }>(
    'INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, adres, enlem, boylam, olusturan_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [firmaId, a.tur, a.ad, a.adres, a.enlem, a.boylam, kisiId],
  ))!.id);
  await olay(firmaId);
  return id;
};
// Firma servisi adres kaldırmada olayı silmeden önce verir; ikisi aynı işlemdedir.
const adresKaldir = (firmaId: number, adresId: number) => tx(async (db) => {
  await servis.firmaDegistiYansit(db, { firmaId, kaldirilanAdresId: adresId });
  await db.sorgu('DELETE FROM musteri_tedarikci_adres WHERE id = $1', [adresId]);
});
const ayarYaz = async (anahtar: string, deger: unknown) => {
  await tx((db) => db.sorgu(
    `INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger`, [anahtar, JSON.stringify(deger), kisiId],
  ));
  await tx((db) => servis.ayarDegistiYansit(db, { anahtar, kisiId }));
};
const firmaninNoktalari = (firmaId: number) => tx((db) => sorgu.firmaninButunNoktalari(db, firmaId));
const tekNokta = async (firmaId: number) => {
  const n = await firmaninNoktalari(firmaId);
  assert.equal(n.length, 1, `firma ${firmaId} nokta sayısı`);
  return n[0]!;
};

before(async () => {
  ortam = await testVeritabaniKur('sevkiyat_esitleme');
  vt = ortam.vt;
  kisiId = await tx(async (db) => (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Esitleme Deneme') RETURNING id"))!.id);
});
after(() => ortam.kaldir());

test('2133-1 b: koordinatlı firma kaydedilince nokta açılır; tür firmadan, ikinci olay ikinci nokta açmaz', async () => {
  const musteri = await firmaEkle({ ad: 'Esit Musteri', enlem: 39.91, boylam: 32.81, adres: 'Ornek Mah. 1' });
  const fason = await firmaEkle({ ad: 'Esit Fason', tur: 'ikisi', fason: true, enlem: 39.92, boylam: 32.82 });
  const ikiYonlu = await firmaEkle({ ad: 'Esit Iki Yonlu', tur: 'ikisi', enlem: 39.93, boylam: 32.83 });
  const tedarikci = await firmaEkle({ ad: 'Esit Tedarikci', tur: 'tedarikci', enlem: 39.94, boylam: 32.84 });
  const n = await tekNokta(musteri);
  assert.deepEqual(
    { ad: n.ad, tur: n.tur, enlem: Number(n.enlem), boylam: Number(n.boylam), adres: n.adres, adresId: n.adresId, aktif: n.aktif, durak: n.durakSuresiDakika },
    { ad: 'Esit Musteri', tur: 'musteri', enlem: 39.91, boylam: 32.81, adres: 'Ornek Mah. 1', adresId: null, aktif: true, durak: 20 },
  );
  assert.equal((await tekNokta(fason)).tur, 'fason');
  assert.equal((await tekNokta(ikiYonlu)).tur, 'musteri');
  assert.equal((await tekNokta(tedarikci)).tur, 'tedarikci');
  await olay(musteri);
  const yine = await tekNokta(musteri);
  assert.equal(yine.surum, n.surum, 'değişmeyen konum sürümü artırmaz');
});

test('2133-2 a: koordinatsız firmaya nokta açılmaz, konum eksik listesinde görünür; koordinatlı adres eklenince nokta o adrese bağlanır', async () => {
  const firma = await firmaEkle({ ad: 'Esit Konumsuz', adres: 'Ornek Cad. 2' });
  assert.equal((await firmaninNoktalari(firma)).length, 0);
  const liste = await tx((db) => servis.noktalariListele(db));
  const eksik = liste.konumsuzFirmalar.find((f) => f.id === firma);
  assert.deepEqual(eksik && { ad: eksik.ad, adres: eksik.adres, noktaId: eksik.noktaId }, { ad: 'Esit Konumsuz', adres: 'Ornek Cad. 2', noktaId: null });
  assert.equal(liste.konumsuzFirmalar.some((f) => liste.noktalar.some((x) => x.aktif && x.firmaId === f.id)), false, 'noktası olan firma listede yok');

  const fatura = await adresEkle(firma, { tur: 'fatura', ad: 'Fatura', adres: 'Fatura adresi', enlem: 39.70, boylam: 32.60 });
  const n = await tekNokta(firma);
  assert.deepEqual({ adresId: n.adresId, enlem: Number(n.enlem), adres: n.adres }, { adresId: fatura, enlem: 39.7, adres: 'Fatura adresi' });
  assert.equal((await tx((db) => servis.noktalariListele(db))).konumsuzFirmalar.some((f) => f.id === firma), false);

  // Bağlı adres kalkınca nokta başka koordinatlı adrese taşınır; kalmazsa bağ çözülür, son konum kalır. Silme engellenmez.
  const teslim = await adresEkle(firma, { tur: 'teslim', ad: 'Teslim', adres: 'Teslim adresi', enlem: 39.75, boylam: 32.65 });
  assert.equal((await tekNokta(firma)).adresId, fatura, 'bağı çözülebilen nokta seçili adresinde kalır');
  await adresKaldir(firma, fatura);
  const tasinan = await tekNokta(firma);
  assert.deepEqual({ adresId: tasinan.adresId, adres: tasinan.adres }, { adresId: teslim, adres: 'Teslim adresi' });
  await adresKaldir(firma, teslim);
  const bagsiz = await tekNokta(firma);
  assert.deepEqual({ adresId: bagsiz.adresId, enlem: Number(bagsiz.enlem), aktif: bagsiz.aktif }, { adresId: null, enlem: 39.75, aktif: true });
  // Pasif noktanın adres bağı da silmeyi engellemez.
  const pasifAdres = await adresEkle(firma, { tur: 'sube', ad: 'Sube', adres: 'Sube adresi', enlem: 39.76, boylam: 32.66 });
  await tx((db) => db.sorgu('UPDATE sevkiyat_noktasi SET adres_id = $2, aktif = false WHERE firma_id = $1', [firma, pasifAdres]));
  await adresKaldir(firma, pasifAdres);
  assert.equal((await firmaninNoktalari(firma)).every((x) => x.adresId === null), true);
});

test('2133-1 b: firma konumu değişince nokta kopyası eşitlenir; elle verilen tür ve durak süresi korunur', async () => {
  const firma = await firmaEkle({ ad: 'Esit Tasinan', enlem: 39.80, boylam: 32.70 });
  const n = await tekNokta(firma);
  await tx((db) => db.sorgu("UPDATE sevkiyat_noktasi SET tur = 'tedarikci', durak_suresi_dakika = 45 WHERE id = $1", [n.id]));
  await tx((db) => db.sorgu('UPDATE musteri_tedarikci_firma SET enlem = 39.85, boylam = 32.75 WHERE id = $1', [firma]));
  await olay(firma);
  const yeni = await tekNokta(firma);
  assert.deepEqual(
    { enlem: Number(yeni.enlem), boylam: Number(yeni.boylam), tur: yeni.tur, durak: yeni.durakSuresiDakika, surum: yeni.surum },
    { enlem: 39.85, boylam: 32.75, tur: 'tedarikci', durak: 45, surum: n.surum + 1 },
  );
});

test('2133-1 b: pasif firmaya nokta açılmaz; aynı adlı aktif nokta varsa ada firma kodu eklenir', async () => {
  const pasif = await firmaEkle({ ad: 'Esit Pasif' });
  await tx((db) => db.sorgu('UPDATE musteri_tedarikci_firma SET aktif = false, enlem = 39.9, boylam = 32.8 WHERE id = $1', [pasif]));
  await olay(pasif);
  assert.equal((await firmaninNoktalari(pasif)).length, 0);
  await tx((db) => db.sorgu('UPDATE musteri_tedarikci_firma SET aktif = true WHERE id = $1', [pasif]));
  await olay(pasif);
  assert.equal((await tekNokta(pasif)).ad, 'Esit Pasif', 'aktife dönen konumlu firma noktasını alır');

  await tx((db) => db.sorgu("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Esit Ayni Ad', 'kargo', 39.9, 32.8)"));
  const ayni = await firmaEkle({ ad: 'Esit Ayni Ad', kod: 'EAA-1', enlem: 39.95, boylam: 32.85 });
  assert.equal((await tekNokta(ayni)).ad, 'Esit Ayni Ad (EAA-1)');
});

test('2133-4 a: fabrika ayarında konum dolunca fabrika noktası adresiyle açılır; adres değişince eşitlenir, ikinci fabrika açılmaz', async () => {
  const fabrikalar = () => tx((db) => db.sorgu<{ id: number; ad: string; enlem: string; adres: string | null }>(
    "SELECT id, ad, enlem::text, adres FROM sevkiyat_noktasi WHERE tur = 'fabrika' AND aktif",
  ));
  await ayarYaz('sevkiyat.fabrika-adres', 'Fabrika Cad. 1');
  await ayarYaz('sevkiyat.fabrika-enlem', 39.95);
  assert.equal((await fabrikalar()).length, 0, 'boylam yokken fabrika açılmaz');
  await ayarYaz('sevkiyat.fabrika-boylam', 32.75);
  assert.deepEqual((await fabrikalar()).map((f) => ({ ad: f.ad, enlem: Number(f.enlem), adres: f.adres })), [{ ad: 'Fabrika', enlem: 39.95, adres: 'Fabrika Cad. 1' }]);
  await ayarYaz('sevkiyat.fabrika-adres', 'Fabrika Cad. 2');
  await tx((db) => servis.fabrikaNoktasiniEsitle(db));
  assert.deepEqual((await fabrikalar()).map((f) => f.adres), ['Fabrika Cad. 2']);
  const liste = await tx((db) => servis.noktalariListele(db));
  assert.equal(liste.noktalar.find((n) => n.tur === 'fabrika' && n.aktif)?.adres, 'Fabrika Cad. 2');
  // Başka anahtar fabrika noktasına dokunmaz.
  await tx((db) => servis.ayarDegistiYansit(db, { anahtar: 'kabuk.karsilama', kisiId }));
  assert.equal((await fabrikalar()).length, 1);
});

test('2133-3 a: konum önerisi yalnız okur; dizin yoksa sonuç boş, ilk arama metni döner', async () => {
  const firma = await firmaEkle({ ad: 'Esit Oneri', adres: 'Ornek Mah. Cumhuriyet Bulvari No: 5' });
  const cevap = await tx((db) => servis.konumOnerisi(db, firma, () => Promise.resolve(null)));
  assert.deepEqual(cevap, { aramaMetni: 'ornek cumhuriyet merkez', sonuclar: [], dizinVar: false });
  assert.equal((await firmaninNoktalari(firma)).length, 0);
  // Depodaki çevrimdışı dizin: kapı numarası ve ekler atılır, kaba aramaya inilir; sonuçlar yalnız öneridir, nokta açılmaz.
  const dizinli = await firmaEkle({ ad: 'Esit Dizinli', adres: 'Gazi Mah. 9999. Sok. No: 3' });
  const oneri = await tx((db) => servis.konumOnerisi(db, dizinli, servis.dosyadanHaritaKaynagi(DEPODAKI_PAKET)));
  assert.equal(oneri.dizinVar, true);
  assert.ok(oneri.sonuclar.length > 0, `öneri yok: ${oneri.aramaMetni}`);
  assert.ok(oneri.sonuclar.every((x) => Number.isFinite(x.enlem) && Number.isFinite(x.boylam)));
  assert.equal((await firmaninNoktalari(dizinli)).length, 0);
});
