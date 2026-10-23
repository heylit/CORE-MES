import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import {
  emirBaslat, emirBitir, emirSayim, kaliteKarariDinle, kararliSayimiSonuclandir, kararSayaclari, saglamSayimDinle,
} from './disari.ts';
import type { KaliteKarariOlayi, SaglamSayimOlayi } from './disari.ts';
import { SAGLAM_EKSIYE_INER } from './kurallar.ts';
import { emirAc, emirAyrintisi, emirSayimAyarla } from './servis.ts';

// İlk parça kararı beklenirken sayılan parça (131 b, 136 a): sağlama katılmaz, kalite kararıyla sağlama döner ya da redde kalır.
describe('uretim-emirleri karar bekleyen sayım (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operator: Kullanici;
  let sayac = 0;
  const saglamOlaylari: SaglamSayimOlayi[] = [];
  const kararOlaylari: KaliteKarariOlayi[] = [];
  const birakilacaklar: (() => void)[] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function baslamisEmir(): Promise<number> {
    sayac += 1;
    const im = await ortam!.sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KB${sayac}`, 'Deneme Merkezi']);
    const ist = await ortam!.sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KBS${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    // UE20: başlatan istasyonda yetkin olmalı.
    await ortam!.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [operator.id, ist!.id]);
    const { emir } = await vt().tx((db) => emirAc(db, yoneticiId, { parcaNo: 'P-1', parcaAd: 'Deneme Parçası', adet: 100, istasyonId: ist!.id }));
    await vt().tx((db) => emirBaslat(db, operator, emir.id));
    return emir.id;
  }

  const sayaclar = (id: number) => vt().tx(async (db) => (await kararSayaclari(db, [id])).get(id));
  const saglam = async (id: number) => (await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 1 }))).emir.canli?.saglam;
  const satirlar = (id: number) => vt().sorgu<{ tur: string; adet: number; duzeltme: boolean }>(
    'SELECT tur, adet, duzeltme FROM uretim_sayimi WHERE emir_id = $1 ORDER BY id', [id],
  );

  before(async () => {
    ortam = await testVeritabaniKur('ue_karar_bekliyor');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    operator = (await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Operatör', kullaniciAdi: 'operator', parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return kullaniciYukle(db, yeni);
    }))!;
    birakilacaklar.push(saglamSayimDinle(async (_db, o) => { saglamOlaylari.push(o); }));
    birakilacaklar.push(kaliteKarariDinle(async (_db, o) => { kararOlaylari.push(o); }));
  });
  after(async () => {
    for (const b of birakilacaklar) b();
    await ortam?.kaldir();
  });

  test('karar bekleyen sayım sağlama katılmaz; olay kalite durumunu taşır; eksiye inmez; onaydan önce normal sayım da bekler (327 a)', async () => {
    const id = await baslamisEmir();
    saglamOlaylari.length = 0;
    const { emir } = await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 5 }, { kararBekliyor: true }));
    assert.equal(emir.canli?.saglam, 0);
    assert.deepEqual(await sayaclar(id), { kararBekliyor: 5, red: 0 });
    assert.deepEqual(saglamOlaylari.map((o) => [o.fark, o.kaliteDurumu]), [['5', 'karar_bekliyor']]);
    const hata = await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: -6 }, { kararBekliyor: true })).then(() => null, (h: unknown) => h);
    assert.ok(hata instanceof UygulamaHatasi);
    assert.equal(hata.message, SAGLAM_EKSIYE_INER);
    await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: -2 }, { kararBekliyor: true }));
    assert.equal(await saglam(id), 0);
    assert.deepEqual(saglamOlaylari.map((o) => [o.fark, o.kaliteDurumu]), [['5', 'karar_bekliyor'], ['-2', 'karar_bekliyor'], ['1', 'karar_bekliyor']]);
    assert.deepEqual(await satirlar(id), [
      { tur: 'karar_bekliyor', adet: 5, duzeltme: false },
      { tur: 'karar_bekliyor', adet: -2, duzeltme: true },
      { tur: 'karar_bekliyor', adet: 1, duzeltme: false },
    ]);
  });

  test('327 a: ilk parçası onaylanmamış emirde sağlam sayım, hangi yoldan gelirse gelsin, karar bekler; onaydan sonra sayım sağlamdır', async () => {
    const dogrudan = await baslamisEmir();
    const { emir } = await vt().tx((db) => emirSayim(db, operator, dogrudan, { tur: 'saglam', adet: 2 }));
    assert.equal(emir.canli?.saglam, 0, 'cihaz seçmeden gelen ilk sayım da sağlam sayılmaz');
    assert.deepEqual(await sayaclar(dogrudan), { kararBekliyor: 2, red: 0 });
    await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, dogrudan, 'onay'));
    assert.equal(await saglam(dogrudan), 3, 'karar verilmiş emirde sonraki sayım sağlamdır');

    const ayar = await baslamisEmir();
    const a = await vt().tx((db) => emirSayimAyarla(db, operator.id, ayar, 4));
    assert.equal(a.emir.canli?.saglam, 0);
    assert.deepEqual(await sayaclar(ayar), { kararBekliyor: 4, red: 0 });

    const ret = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, ret, { tur: 'saglam', adet: 1 }));
    await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, ret, 'ret'));
    assert.deepEqual(await sayaclar(ret), { kararBekliyor: 0, red: 1 });
    await vt().tx((db) => emirSayim(db, operator, ret, { tur: 'saglam', adet: 1 }));
    assert.deepEqual(await sayaclar(ret), { kararBekliyor: 1, red: 1 }, 'ret sonrası sayılan yeniden karar bekler (136 a)');
    await vt().tx((db) => emirSayim(db, operator, ret, { tur: 'saglam', adet: 2 }));
    assert.deepEqual(await sayaclar(ret), { kararBekliyor: 3, red: 1 }, 'onay gelene kadar her sağlam sayım bekler');
  });

  test('348 a: onayla sağlama geçen adet sayan kişiye yazılır; kalite olayı kararı verenindir', async () => {
    const id = await baslamisEmir();
    kararOlaylari.length = 0;
    await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 2 }));
    await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    const yazanlar = await vt().sorgu<{ tur: string; kisi_id: number; adet: number }>(
      'SELECT tur, kisi_id, adet FROM uretim_sayimi WHERE emir_id = $1 AND duzeltme ORDER BY id', [id],
    );
    assert.deepEqual(yazanlar.map((y) => [y.tur, y.kisi_id, y.adet]), [['karar_bekliyor', operator.id, -2], ['saglam', operator.id, 2]]);
    assert.deepEqual(kararOlaylari.map((o) => [o.karar, o.adet, o.kisiId]), [['onay', '2', yoneticiId]]);
  });

  test('327 a: onay beklerken adetli bitiş farkı karar bekleyene yazar; onay kapanışı verilen adede getirir, çift sayılmaz', async () => {
    const ayni = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, ayni, { tur: 'saglam', adet: 4 }));
    const b1 = await vt().tx((db) => emirBitir(db, operator, ayni, 4));
    assert.equal(b1.emir.saglamAdet, 0, 'karar bekleyen kapanışa onayla girer');
    assert.deepEqual(await sayaclar(ayni), { kararBekliyor: 4, red: 0 }, 'sayılanla aynı adet fark yazmaz');
    assert.equal((await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, ayni, 'onay'))).emir.saglamAdet, 4);

    const fazla = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, fazla, { tur: 'saglam', adet: 4 }));
    await vt().tx((db) => emirBitir(db, operator, fazla, 6));
    assert.deepEqual(await sayaclar(fazla), { kararBekliyor: 6, red: 0 });
    assert.equal((await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, fazla, 'onay'))).emir.saglamAdet, 6);

    const eksik = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, eksik, { tur: 'saglam', adet: 4 }));
    await vt().tx((db) => emirBitir(db, operator, eksik, 3));
    assert.equal((await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, eksik, 'onay'))).emir.saglamAdet, 3);

    const karisik = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, karisik, { tur: 'saglam', adet: 2 }));
    await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, karisik, 'onay'));
    await vt().tx((db) => emirSayim(db, operator, karisik, { tur: 'saglam', adet: 3 }, { kararBekliyor: true }));
    const b2 = await vt().tx((db) => emirBitir(db, operator, karisik, 1));
    assert.equal(b2.emir.saglamAdet, 1, 'eksi fark önce karar bekleyeni, sonra sağlamı düşer');
    assert.deepEqual(await sayaclar(karisik), { kararBekliyor: 0, red: 0 });
  });

  test('onay karar bekleyeni düzeltme satırıyla sağlama geçirir; stok için sağlam olayı değil karar olayı çıkar', async () => {
    const id = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 4 }, { kararBekliyor: true }));
    saglamOlaylari.length = 0;
    kararOlaylari.length = 0;
    const sonuc = await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    assert.equal(sonuc.adet, 4);
    assert.equal(sonuc.emir.canli?.saglam, 4);
    assert.deepEqual(await sayaclar(id), { kararBekliyor: 0, red: 0 });
    assert.deepEqual(saglamOlaylari, []);
    assert.deepEqual(kararOlaylari.map((o) => [o.uretimEmriId, o.karar, o.adet, o.kisiId]), [[id, 'onay', '4', yoneticiId]]);
    assert.deepEqual((await satirlar(id)).slice(1), [
      { tur: 'karar_bekliyor', adet: -4, duzeltme: true },
      { tur: 'saglam', adet: 4, duzeltme: true },
    ]);
  });

  test('ret karar bekleyeni redde bırakır; sonra sayılan yeniden karar bekler ve sonraki onay yalnız onu sağlama geçirir (136 a)', async () => {
    const id = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 3 }, { kararBekliyor: true }));
    kararOlaylari.length = 0;
    const ret = await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'ret'));
    assert.equal(ret.adet, 3);
    assert.equal(ret.emir.canli?.saglam, 0);
    assert.deepEqual(await sayaclar(id), { kararBekliyor: 0, red: 3 });
    await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 2 }, { kararBekliyor: true }));
    const onay = await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    assert.equal(onay.emir.canli?.saglam, 2);
    assert.deepEqual(await sayaclar(id), { kararBekliyor: 0, red: 3 });
    assert.deepEqual(kararOlaylari.map((o) => [o.karar, o.adet]), [['ret', '3'], ['onay', '2']]);
  });

  test('bitmiş emirde onay kapanış adedine eklenir; ret eklemez; kayıt geçmişi karar bekleyeni göstermez', async () => {
    const id = await baslamisEmir();
    await saglam(id);
    await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    await vt().tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 3 }, { kararBekliyor: true }));
    const bitti = await vt().tx((db) => emirBitir(db, operator, id));
    assert.equal(bitti.emir.saglamAdet, 1);
    const ret = await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'ret'));
    assert.equal(ret.emir.saglamAdet, 1);
    const id2 = await baslamisEmir();
    await vt().tx((db) => emirSayim(db, operator, id2, { tur: 'saglam', adet: 2 }, { kararBekliyor: true }));
    await vt().tx((db) => emirBitir(db, operator, id2));
    const onay = await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id2, 'onay'));
    assert.equal(onay.emir.saglamAdet, 2);
    assert.equal(onay.emir.canli?.saglam, 2);
    const { kayitlar } = await vt().tx((db) => emirAyrintisi(db, id));
    assert.deepEqual(kayitlar.filter((k) => k.olay === 'duzeltme').map((k) => k.adet), [1], 'yalnız ilk parça onayı görünür; redde geçen satır sağlam düzeltmesi görünmez');
  });

  test('karar bekleyen yoksa sonuçlandırma satır ve olay yazmaz; sayımı olmayan emrin sayacı sıfırdır', async () => {
    const id = await baslamisEmir();
    kararOlaylari.length = 0;
    assert.deepEqual(await sayaclar(id), { kararBekliyor: 0, red: 0 });
    assert.equal((await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'))).adet, 0);
    assert.deepEqual(await satirlar(id), []);
    assert.deepEqual(kararOlaylari, []);
  });
});
