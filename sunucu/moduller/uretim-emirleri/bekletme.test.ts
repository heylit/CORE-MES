import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirAyar, emirBaslat, emirDevam, emirDuraklat, makineDevral } from './disari.ts';
import { BEKLETME_VAR, BEKLETME_YOK, EMIR_BEKLEMEDE } from './kurallar.ts';
import { emirAc, emirAyrintisi, emirBeklet, emirBekletmeKaldir, izlemeListesi } from './servis.ts';

// 3050 a: bekletme emrin durumunu değiştirmez; beklemedeki emirde adım başlamaz, duraklamış adım sürmez, çalışan adım duraklatılır.
describe('uretim-emirleri bekletme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operator: Kullanici;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function kisiEkle(kullaniciAdi: string): Promise<Kullanici> {
    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const kullanici = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (kullanici === null) throw new Error('kullanıcı yüklenemedi');
    return kullanici;
  }

  async function planliEmir(istasyonId?: number): Promise<number> {
    const ist = istasyonId ?? await istasyonAc();
    const { emir } = await vt().tx((db) => emirAc(db, yoneticiId, { parcaNo: 'ORN-1', parcaAd: 'Deneme Parçası', adet: 10, istasyonId: ist }));
    return emir.id;
  }

  async function istasyonAc(): Promise<number> {
    sayac += 1;
    const im = await ortam!.sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`BKM${sayac}`, 'Deneme Merkezi']);
    const ist = await ortam!.sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`BKS${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    if (!im || !ist) throw new Error('istasyon kurulamadı');
    await ortam!.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist.id]);
    return ist.id;
  }

  const emirIstasyonu = async (id: number): Promise<number> =>
    (await ortam!.sahip.tek<{ istasyon_id: number }>('SELECT istasyon_id FROM uretim_emri WHERE id = $1', [id]))!.istasyon_id;
  const acikKullanim = async (emirId: number): Promise<number | null> =>
    (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND bitis IS NULL', [emirId]))?.id ?? null;

  const once = (dk: number): string => new Date(Date.now() - dk * 60_000).toISOString();
  const reddi = async (is: Promise<unknown>): Promise<UygulamaHatasi> => {
    const hata: unknown = await is.then(() => null, (h: unknown) => h);
    assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
    return hata;
  };

  before(async () => {
    ortam = await testVeritabaniKur('ue_bekletme');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    operator = await kisiEkle('operator');
  });
  after(async () => { await ortam?.kaldir(); });

  test('bekletilen planlı emir başlamaz; durum ve liste değişmez; devam ettirilince başlar', async () => {
    const id = await planliEmir();
    const cevap = await vt().tx((db) => emirBeklet(db, yoneticiId, id, { neden: 'malzeme', not: 'Deneme notu' }));
    assert.equal(cevap.emir.durum, 'planli', 'durum değişmez');
    assert.equal(cevap.emir.bekletme?.neden, 'malzeme');
    assert.equal(cevap.emir.bekletme?.not, 'Deneme notu');
    assert.equal(cevap.emir.bekletme?.kisi.id, yoneticiId);
    assert.deepEqual(cevap.bekletmeler?.map((b) => b.olay), ['beklet']);
    const liste = await vt().tx((db) => izlemeListesi(db, undefined, true));
    assert.equal(liste.emirler.find((e) => e.id === id)?.bekletme?.neden, 'malzeme', 'liste de işareti taşır');

    assert.equal((await reddi(vt().tx((db) => emirBeklet(db, yoneticiId, id, { neden: 'diger' })))).message, BEKLETME_VAR);
    assert.equal((await reddi(vt().tx((db) => emirBaslat(db, operator, id)))).message, EMIR_BEKLEMEDE);

    const kalkti = await vt().tx((db) => emirBekletmeKaldir(db, yoneticiId, id));
    assert.equal(kalkti.emir.bekletme, null);
    assert.deepEqual(kalkti.bekletmeler?.map((b) => b.olay), ['beklet', 'devam']);
    assert.equal((await reddi(vt().tx((db) => emirBekletmeKaldir(db, yoneticiId, id)))).message, BEKLETME_YOK);
    await vt().tx((db) => emirBaslat(db, operator, id));
    assert.equal((await vt().tx((db) => emirAyrintisi(db, id))).emir.durum, 'basladi');
  });

  test('çalışan adım beklemede duraklatılır, devam etmez; bekletmeden önceki çevrimdışı devam kabul edilir', async () => {
    const id = await planliEmir();
    await vt().tx((db) => emirBaslat(db, operator, id, undefined, once(30)));
    await vt().tx((db) => emirBeklet(db, yoneticiId, id, { neden: 'kalite' }));
    await vt().tx((db) => emirDuraklat(db, operator, id));
    assert.equal((await reddi(vt().tx((db) => emirDevam(db, operator, id)))).message, EMIR_BEKLEMEDE);
    const ayrinti = await vt().tx((db) => emirAyrintisi(db, id));
    assert.equal(ayrinti.emir.durum, 'basladi', 'başlamış emir başlamış sayılır');
    assert.equal(ayrinti.emir.bekletme?.neden, 'kalite');
  });

  test('çevrimdışı kuyruk: anı bekletmeden önce olan başlatma kabul, sonra olan red', async () => {
    const id = await planliEmir();
    await vt().tx((db) => emirBeklet(db, yoneticiId, id, { neden: 'musteri' }));
    assert.equal((await reddi(vt().tx((db) => emirBaslat(db, operator, id, undefined, new Date().toISOString())))).message, EMIR_BEKLEMEDE);
    await vt().tx((db) => emirBaslat(db, operator, id, undefined, once(5)));
    assert.equal((await vt().tx((db) => emirAyrintisi(db, id))).emir.durum, 'basladi');
  });

  test('hazırlık (ayar) beklemedeki emirde reddedilir; bekletme kalkınca yazılır', async () => {
    const id = await planliEmir();
    await vt().tx((db) => emirBeklet(db, yoneticiId, id, { neden: 'takim' }));
    assert.equal((await reddi(vt().tx((db) => emirAyar(db, operator, id)))).message, EMIR_BEKLEMEDE);
    await vt().tx((db) => emirBekletmeKaldir(db, yoneticiId, id));
    await vt().tx((db) => emirAyar(db, operator, id));
    const olaylar = await ortam!.sahip.sorgu<{ olay: string }>('SELECT olay FROM uretim_olayi WHERE emir_id = $1', [id]);
    assert.deepEqual(olaylar.map((o) => o.olay), ['ayar']);
  });

  test('makine devralma beklemedeki emirde reddedilir ve öteki işi durdurmaz; bekletme kalkınca devralır', async () => {
    const ilk = await planliEmir();
    await vt().tx((db) => emirBaslat(db, operator, ilk));
    const kullanim = await acikKullanim(ilk);
    assert.ok(kullanim !== null, 'ilk iş istasyonun yerini tutar');
    const ikinci = await planliEmir(await emirIstasyonu(ilk));
    await vt().tx((db) => emirBeklet(db, yoneticiId, ikinci, { neden: 'malzeme' }));
    assert.equal((await reddi(vt().tx((db) => makineDevral(db, operator, ikinci, kullanim)))).message, EMIR_BEKLEMEDE);
    // Bekletme öbür devralma denetimlerinden önce söylenir: gösterilen kullanım değişmiş olsa da kişi asıl nedeni görür.
    assert.equal((await reddi(vt().tx((db) => makineDevral(db, operator, ikinci, kullanim + 1000)))).message, EMIR_BEKLEMEDE);
    assert.equal(await acikKullanim(ilk), kullanim, 'reddedilen devralma öteki işi durdurmaz');
    await vt().tx((db) => emirBekletmeKaldir(db, yoneticiId, ikinci));
    const devral = await vt().tx((db) => makineDevral(db, operator, ikinci, kullanim));
    assert.equal(devral.emir.durum, 'basladi');
    assert.equal(await acikKullanim(ilk), null);
  });

  test('defter yalnız eklenir: satır değiştirilemez ve silinemez; neden bekletmede zorunlu', async () => {
    const id = await planliEmir();
    await vt().tx((db) => emirBeklet(db, yoneticiId, id, { neden: 'takim' }));
    await assert.rejects(ortam!.sahip.sorgu("UPDATE uretim_emirleri_bekletme SET neden = 'diger' WHERE uretim_emri_id = $1", [id]));
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM uretim_emirleri_bekletme WHERE uretim_emri_id = $1', [id]));
    await assert.rejects(ortam!.sahip.sorgu(
      "INSERT INTO uretim_emirleri_bekletme (uretim_emri_id, olay, neden, kisi_id) VALUES ($1, 'beklet', NULL, $2)", [id, yoneticiId],
    ));
    await assert.rejects(ortam!.sahip.sorgu(
      "INSERT INTO uretim_emirleri_bekletme (uretim_emri_id, olay, neden, kisi_id) VALUES ($1, 'devam', 'malzeme', $2)", [id, yoneticiId],
    ));
  });
});
