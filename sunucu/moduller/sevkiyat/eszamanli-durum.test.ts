// Y4 (IT incelemesi): aynı işe aynı anda gelen iki durum komutu. İkincisi ilkinin sonucunu kilit altında görür; tamamlanan iş ikinci kez
// tamamlanmaz (ürün sevki stoğa iki kez yansımaz) ve arada tamamlanan iş iptal edilmez. Gerçek PostgreSQL.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import * as servis from './servis.ts';

let ortam: TestVeritabani;
let vt: Veritabani;
let nokta = 0;
const T = '2026-10-07';
const BOS_IS = { alisNoktasiId: null, agirlikKilogram: 100, paletSayisi: 1, durakSuresiDakika: null, alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null };
const hata = (kod: string) => (h: unknown) => h instanceof UygulamaHatasi && h.kod === kod;

before(async () => {
  ortam = await testVeritabaniKur('sevkiyat_eszamanli');
  vt = ortam.vt;
  // Fabrikanın konumu Sistem Ayarları'ndan gelir (930 a).
  const kisi = (await vt.tx((db) => db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Konum Ayari') RETURNING id")))!.id;
  await vt.tx((db) => db.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('sevkiyat.fabrika-enlem', '39.9', $1), ('sevkiyat.fabrika-boylam', '32.7', $1)", [kisi]));
  await vt.tx((db) => servis.noktaEkle(db, { ad: 'Deneme Fabrika', tur: 'fabrika', enlem: 0, boylam: 0, adres: null, durakSuresiDakika: 10 }));
  nokta = (await vt.tx((db) => servis.noktaEkle(db, { ad: 'Deneme Nokta', tur: 'diger', enlem: 39.95, boylam: 32.75, adres: null, durakSuresiDakika: 10 }))).id;
});
after(() => ortam.kaldir());

// İlk komut transaction'ını açık tutar; ikinci komut ilk komutun bağlantısını beklemeye başlayınca ilk biter. Bekleme yalnız
// ilk bağlantının pid'iyle aranır: göç rolü uygulama oturumlarını göremez, başka şemadaki testler de karışmaz.
async function yaris<T>(ilk: (db: Db) => Promise<unknown>, ikinci: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  let birak!: () => void;
  const tutuluyor = new Promise<void>((r) => { birak = r; });
  let tuttu!: (pid: number) => void;
  const kilitte = new Promise<number>((r) => { tuttu = r; });
  const ilkIs = vt.tx(async (db) => {
    await ilk(db);
    tuttu((await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))!.pid);
    await tutuluyor;
  });
  // İlk komut düşerse bekleme sonsuza gitmez; hata aşağıdaki await'te görünür.
  const pid = await Promise.race([kilitte, ilkIs.then(() => 0)]);
  // Sonuç hemen yakalanır: ikinci komut ilk transaction kapanırken reddedilirse işlenmemiş red sayılıp test düşmesin.
  const ikinciSonuc = Promise.allSettled([ikinci()]);
  let bekliyor = false;
  for (const sinir = Date.now() + 8000; pid !== 0 && !bekliyor && Date.now() < sinir;) {
    const bekleyen = await vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [pid]);
    bekliyor = bekleyen!.n > 0;
    if (!bekliyor) await new Promise((r) => setTimeout(r, 20));
  }
  birak();
  await ilkIs;
  assert.ok(bekliyor, 'ikinci komut ilk komutun kilidini beklemedi; yarış sınanmadı');
  return (await ikinciSonuc)[0]!;
}

test('aynı iş aynı anda iki kez tamamlanamaz: ikinci istek "zaten tamamlandı" ile reddedilir', async () => {
  const is = await vt.tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: nokta }));
  const govde = { durum: 'tamamlandi' as const, tarih: T, not: null };
  const sonuc = await yaris((db) => servis.isDurumuDegistir(db, is.id, govde), () => vt.tx((db) => servis.isDurumuDegistir(db, is.id, govde)));
  assert.equal(sonuc.status, 'rejected');
  assert.ok(sonuc.status === 'rejected' && hata('GECERSIZ')(sonuc.reason), String(sonuc.status === 'rejected' ? sonuc.reason : ''));
  const satir = await vt.tek<{ durum: string; surum: number }>('SELECT durum, surum FROM sevkiyat_isi WHERE id = $1', [is.id]);
  assert.deepEqual(satir, { durum: 'tamamlandi', surum: is.surum + 1 }, 'iş bir kez yazıldı');
});

test('tamamlanırken gelen iptal reddedilir; iş iptal edilmeden tamamlanmış kalır', async () => {
  const is = await vt.tx((db) => servis.isEkle(db, { ...BOS_IS, tarih: T, tur: 'teslimat', birakisNoktasiId: nokta }));
  const sonuc = await yaris(
    (db) => servis.isDurumuDegistir(db, is.id, { durum: 'tamamlandi', tarih: T, not: null }),
    () => vt.tx((db) => servis.isIptalEt(db, is.id)),
  );
  assert.ok(sonuc.status === 'rejected' && hata('GECERSIZ')(sonuc.reason), String(sonuc.status === 'rejected' ? sonuc.reason : 'iptal edildi'));
  const satir = await vt.tek<{ durum: string; iptal: boolean }>('SELECT durum, iptal_edildi IS NOT NULL AS iptal FROM sevkiyat_isi WHERE id = $1', [is.id]);
  assert.deepEqual(satir, { durum: 'tamamlandi', iptal: false });
});
