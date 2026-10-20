import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MakineDurumlariCevabi, PlanAyarlariCevabi, YetkinliklerCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  calisirMakineler, isMerkeziPersonelSayilari, istasyonKapasitesi, istasyonKisileri, istasyonYetkinlikleri, kisilerinIzinliIsMerkezleri, makineDurumuYaz, planAyarlari, yetkinMi,
} from './disari.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

describe('istasyonlar T2: plan ayarı, makine durumu, yetkinlik, kişinin istasyonu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let sayac = 0;
  const yeniKod = (onek: string): string => `${onek}-${(sayac += 1)}`;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown, basliklar: Record<string, string> = {}): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { ...basliklar, cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const yaz = <T = unknown>(yol: string, govde?: unknown) => istek<T>('POST', yol, govde);
  const oku = <T = unknown>(yol: string) => istek<T>('GET', yol);
  const kimlik = async (yol: string, govde: unknown): Promise<number> => {
    const c = await yaz<{ id: number }>(yol, govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.id;
  };
  const isMerkeziKur = (): Promise<number> => kimlik('/is-merkezleri', { kod: yeniKod('PG-IM'), ad: 'Deneme Merkezi' });
  const istasyonKur = (isMerkeziId: number, kod = yeniKod('PG-IS')): Promise<number> =>
    kimlik('/istasyonlar', { kod, ad: 'Deneme İstasyonu', isMerkeziId });
  const makineKur = (istasyonId: number | null): Promise<number> => kimlik('/makineler', { kod: yeniKod('PG-MK'), ad: 'Deneme Tezgahı', istasyonId });
  async function kisiEkle(ad: string, { pasif = false } = {}): Promise<number> {
    const acildi = await istek<{ id: number; surum: number }>('POST', '/kisiler', { ad }, { 'istek-kimligi': randomUUID() });
    assert.equal(acildi.durum, 200, JSON.stringify(acildi.govde));
    if (pasif) assert.equal((await yaz(`/kisiler/${acildi.govde.id}/pasife-al`, { surum: acildi.govde.surum })).durum, 200);
    return acildi.govde.id;
  }
  const istasyonuPasifeAl = async (id: number, isMerkeziId: number, kod: string): Promise<void> => {
    const satir = await vt().tek<{ surum: number }>('SELECT surum FROM istasyon WHERE id = $1', [id]);
    assert.equal((await yaz(`/istasyonlar/${id}/guncelle`, { kod, ad: 'Deneme İstasyonu', isMerkeziId, aktif: false, surum: satir?.surum })).durum, 200);
  };
  const durumlar = async () => (await oku<MakineDurumlariCevabi>('/makine-durumlari')).govde.durumlar;
  const ayarlar = async () => (await oku<PlanAyarlariCevabi>('/istasyon-plan-ayarlari')).govde.ayarlar;

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_plan_girdileri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('IS-01, IS-05: arızalı ya da bakımdaki makine çalışabilir sayılmaz; durum kişi ve zamanla yazılır, çalışıra dönünce yine sayılır', async () => {
    const istasyon = await istasyonKur(await isMerkeziKur());
    const [m1, m2, m3] = [await makineKur(istasyon), await makineKur(istasyon), await makineKur(istasyon)];
    assert.deepEqual(await vt().tx((db) => calisirMakineler(db, istasyon)), [m1, m2, m3]);

    const ariza = await yaz<MakineDurumlariCevabi>(`/makineler/${m2}/durum`, { durum: 'ariza', aciklama: '  Mil sesi  ' });
    assert.equal(ariza.durum, 200, JSON.stringify(ariza.govde));
    const satir = ariza.govde.durumlar.find((d) => d.makineId === m2);
    assert.deepEqual([satir?.durum, satir?.aciklama, satir?.degistiren, satir?.surum], ['ariza', 'Mil sesi', { id: yoneticiId, ad: 'Deneme Yönetici' }, 1]);
    assert.match(satir?.degisme ?? '', /^\d{4}-\d{2}-\d{2}T/);
    assert.equal((await yaz(`/makineler/${m3}/durum`, { durum: 'bakim' })).durum, 200);
    assert.deepEqual(await vt().tx((db) => calisirMakineler(db, istasyon)), [m1]);

    assert.equal((await yaz(`/makineler/${m2}/durum`, { durum: 'calisir' })).durum, 200);
    assert.deepEqual(await vt().tx((db) => calisirMakineler(db, istasyon)), [m1, m2]);
    assert.equal((await durumlar()).find((d) => d.makineId === m2)?.aciklama, null);
  });

  test('dışa açık makineDurumuYaz uçla aynı işlemi kendisi arar: işlemsiz kişi reddedilir ve satır değişmez; makine-durumu işlemi yazar', async () => {
    const istasyon = await istasyonKur(await isMerkeziKur());
    const mk = await makineKur(istasyon);
    const kisi = (islemler: string[]) => ({ id: yoneticiId, ad: 'Deneme Yönetici', islemler }) as Parameters<typeof makineDurumuYaz>[1];
    await assert.rejects(vt().tx((db) => makineDurumuYaz(db, kisi(['plan.studyo']), mk, { durum: 'ariza' })), { kod: 'YETKI_YOK' });
    assert.equal((await durumlar()).find((d) => d.makineId === mk)?.durum ?? 'calisir', 'calisir');
    const yazilan = await vt().tx((db) => makineDurumuYaz(db, kisi(['istasyonlar.makine-durumu']), mk, { durum: 'ariza', aciklama: 'Deneme' }));
    assert.deepEqual(yazilan.filter((d) => d.makineId === mk).map((d) => [d.durum, d.aciklama]), [['ariza', 'Deneme']]);
    assert.deepEqual(await vt().tx((db) => calisirMakineler(db, istasyon)), []);
  });

  test('makine arızaya geçince bakım ve amir işlemi olana bildirim gider; arıza sürerken yinelenmez, yazan kendisi almaz', async () => {
    const bakimRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'bakim'");
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!bakimRolu || !yoneticiRolu) throw new Error('rol yok');
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Bakımcı', kullaniciAdi: 'bakimci', parola: PAROLA });
      await rolAta(db, yoneticiId, id, bakimRolu.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
    });
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'bakimci', parola: PAROLA } });
    const bakimciCerezi = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    type Liste = { satirlar: { id: number; tur: string; baslik: string; metin: string | null; yol: string | null }[] };
    const gelen = async (c: string) =>
      (await app.inject({ method: 'GET', url: '/api/bildirimler?durum=gelen', headers: { cookie: c } })).json<Liste>().satirlar.filter((b) => b.tur === 'istasyonlar.makine-durdu');
    const istasyon = await istasyonKur(await isMerkeziKur());
    const [m1, m2] = [await makineKur(istasyon), await makineKur(istasyon)];
    const kod = (await vt().tek<{ kod: string }>('SELECT kod FROM makine WHERE id = $1', [m1]))?.kod;

    assert.equal((await yaz(`/makineler/${m1}/durum`, { durum: 'ariza', aciklama: 'Mil sesi' })).durum, 200);
    const ilk = await gelen(bakimciCerezi);
    assert.deepEqual(ilk.map((b) => [b.baslik, b.metin, b.yol]), [[`Makine durdu: ${kod}`, 'Mil sesi', '/istasyonlar/makineler']]);
    assert.deepEqual(await gelen(cerez), [], 'yazan kendi eylemi için almaz');

    assert.equal((await yaz(`/makineler/${m1}/durum`, { durum: 'ariza', aciklama: 'Hâlâ arızalı' })).durum, 200);
    assert.equal((await yaz(`/makineler/${m1}/durum`, { durum: 'bakim' })).durum, 200);
    assert.equal((await gelen(bakimciCerezi)).length, 1, 'arıza sürerken ve bakıma geçince yeni bildirim yok');

    const okundu = await app.inject({ method: 'POST', url: `/api/bildirimler/${ilk[0]?.id}/okundu`, headers: { cookie: bakimciCerezi } });
    assert.equal(okundu.statusCode, 200, okundu.body);
    const durum = await vt().tek<{ surum: number }>('SELECT surum FROM istasyonlar_makine_durumu WHERE makine_id = $1', [m2]);
    assert.equal(durum, null);
    const toplu = await yaz('/makineler/toplu-durum', { kayitlar: [{ id: m1, surum: 3 }, { id: m2, surum: 0 }], durum: 'ariza' });
    assert.equal(toplu.durum, 200, JSON.stringify(toplu.govde));
    const sonra = await gelen(bakimciCerezi);
    assert.equal(sonra.length, 3, 'okunan kalır; bakımdan arızaya dönen ve ilk durumu arıza olan makine yeniden bildirilir');
    assert.deepEqual(sonra.filter((b) => b.id !== ilk[0]?.id).map((b) => b.metin), [null, null]);
  });

  test('makine durumu: geçersiz durum ve uzun açıklama 400, olmayan makine 404; veritabanı da başka değeri reddeder', async () => {
    const makine = await makineKur(null);
    assert.equal((await yaz(`/makineler/${makine}/durum`, { durum: 'kirik' })).durum, 400);
    assert.equal((await yaz(`/makineler/${makine}/durum`, { durum: 'ariza', aciklama: 'x'.repeat(201) })).durum, 400);
    assert.equal((await yaz('/makineler/999999/durum', { durum: 'ariza' })).durum, 404);
    assert.equal((await durumlar()).some((d) => d.makineId === makine), false);
    await assert.rejects(
      vt().sorgu("INSERT INTO istasyonlar_makine_durumu (makine_id, durum, degistiren_kisi_id) VALUES ($1, 'kirik', $2)", [makine, yoneticiId]),
      (h: { constraint?: string }) => h.constraint === 'istasyonlar_makine_durumu_degeri',
    );
  });

  test('makine durumu sürümü: okunan sürüm verilirse eski sürüm 409 alır ve satır değişmez; satır yokken 0 geçer', async () => {
    const makine = await makineKur(null);
    assert.equal((await yaz(`/makineler/${makine}/durum`, { durum: 'ariza', surum: 3 })).durum, 409);
    assert.equal((await durumlar()).some((d) => d.makineId === makine), false);
    assert.equal((await yaz(`/makineler/${makine}/durum`, { durum: 'ariza', surum: 0 })).durum, 200);
    assert.equal((await yaz(`/makineler/${makine}/durum`, { durum: 'bakim', surum: 0 })).durum, 409);
    const iki = await yaz<MakineDurumlariCevabi>(`/makineler/${makine}/durum`, { durum: 'bakim', surum: 1 });
    assert.equal(iki.govde.durumlar.find((d) => d.makineId === makine)?.surum, 2);
    assert.equal((await yaz(`/makineler/${makine}/durum`, { durum: 'calisir', surum: 1 })).durum, 409);
    assert.equal((await durumlar()).find((d) => d.makineId === makine)?.durum, 'bakim');
  });

  test('plan ayarı verim ve operatör ihtiyacı tutar; sınır dışı 400, olmayan istasyon 404; sürüm verilirse denetlenir', async () => {
    const istasyon = await istasyonKur(await isMerkeziKur());
    const ilk = await yaz<PlanAyarlariCevabi>(`/istasyonlar/${istasyon}/plan-ayari`, { verimYuzde: 85, operatorIhtiyaci: 0.5 });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const satir = ilk.govde.ayarlar.find((a) => a.istasyonId === istasyon);
    assert.deepEqual([satir?.verimYuzde, satir?.operatorIhtiyaci, satir?.degistiren.id, satir?.surum], ['85.00', '0.50', yoneticiId, 1]);
    for (const govde of [{ verimYuzde: 0, operatorIhtiyaci: 1 }, { verimYuzde: 201, operatorIhtiyaci: 1 }, { verimYuzde: 90, operatorIhtiyaci: 11 }, { verimYuzde: 90, operatorIhtiyaci: -1 }]) {
      assert.equal((await yaz(`/istasyonlar/${istasyon}/plan-ayari`, govde)).durum, 400, JSON.stringify(govde));
    }
    assert.equal((await yaz('/istasyonlar/999999/plan-ayari', { verimYuzde: 90, operatorIhtiyaci: 1 })).durum, 404);
    assert.equal((await yaz(`/istasyonlar/${istasyon}/plan-ayari`, { verimYuzde: 70, operatorIhtiyaci: 2, surum: 0 })).durum, 409);
    assert.equal((await yaz(`/istasyonlar/${istasyon}/plan-ayari`, { verimYuzde: 70, operatorIhtiyaci: 2, surum: 2 })).durum, 409);
    assert.equal((await ayarlar()).find((a) => a.istasyonId === istasyon)?.verimYuzde, '85.00');
    assert.equal((await yaz(`/istasyonlar/${istasyon}/plan-ayari`, { verimYuzde: 70, operatorIhtiyaci: 0, surum: 1 })).durum, 200);
    const son = (await vt().tx((db) => planAyarlari(db))).find((a) => a.istasyonId === istasyon);
    assert.deepEqual([son?.verimYuzde, son?.operatorIhtiyaci, son?.surum], ['70.00', '0.00', 2]);
  });

  test('yetkinlik: liste tümden yazılır, yinelenen tek; yeni istasyon var ve aktif olmalı, listede duran pasif kalır; olmayan kişi 404', async () => {
    const im = await isMerkeziKur();
    const kodA = yeniKod('PG-YA');
    const [a, b, c] = [await istasyonKur(im, kodA), await istasyonKur(im), await istasyonKur(im)];
    const kisi = await kisiEkle('Yetkin Kişi');
    const ilk = await yaz<{ istasyonIdleri: number[] }>(`/kisi-yetkinlikleri/${kisi}/belirle`, { istasyonIdleri: [b, a, a] });
    assert.deepEqual([ilk.durum, ilk.govde.istasyonIdleri], [200, [a, b].sort((x, y) => x - y)]);

    await istasyonuPasifeAl(a, im, kodA);
    assert.equal((await yaz(`/kisi-yetkinlikleri/${kisi}/belirle`, { istasyonIdleri: [a, c] })).durum, 200);
    assert.equal((await yaz(`/kisi-yetkinlikleri/${kisi}/belirle`, { istasyonIdleri: [a, c, 999999] })).durum, 400);
    const yeniKisi = await kisiEkle('Yeni Kişi');
    assert.equal((await yaz(`/kisi-yetkinlikleri/${yeniKisi}/belirle`, { istasyonIdleri: [a] })).durum, 400);
    assert.equal((await yaz('/kisi-yetkinlikleri/999999/belirle', { istasyonIdleri: [] })).durum, 404);

    const liste = (await oku<YetkinliklerCevabi>('/kisi-yetkinlikleri')).govde.yetkinlikler;
    assert.deepEqual(liste.find((y) => y.kisiId === kisi)?.istasyonIdleri, [a, c].sort((x, y) => x - y));
    assert.equal(liste.some((y) => y.kisiId === yeniKisi), false);
    assert.equal(await vt().tx((db) => yetkinMi(db, kisi, c)), true);
    assert.equal(await vt().tx((db) => yetkinMi(db, kisi, b)), false);
    assert.deepEqual((await vt().tx((db) => istasyonYetkinlikleri(db))).filter((y) => y.kisiId === kisi).map((y) => y.istasyonId), [a, c].sort((x, y) => x - y));

    assert.equal((await yaz(`/istasyonlar/${c}/sil`)).durum, 204);
    assert.equal(await vt().tx((db) => yetkinMi(db, kisi, c)), false);
  });

  test('IS29 (karar 146 a): yetkinlik veren, verilme, geçerlilik bitişi ve dayanak taşır; liste farkla yazılır, her değişiklik deftere girer; süresi dolan yetkinlik sayılmaz', async () => {
    const im = await isMerkeziKur();
    const [a, b] = [await istasyonKur(im), await istasyonKur(im)];
    const kisi = await kisiEkle('Defterli Kişi');
    const ilk = await yaz<{ ayrintilar: { istasyonId: number; verenKisiId: number | null; verilme: string | null; surum: number; gecerli: boolean }[] }>(
      `/kisi-yetkinlikleri/${kisi}/belirle`, { istasyonIdleri: [a] });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const ia = ilk.govde.ayrintilar.find((y) => y.istasyonId === a)!;
    assert.equal(ia.verenKisiId, yoneticiId, 'veren oturumdan');
    assert.ok(ia.verilme !== null, 'verilme sunucudan');
    assert.equal(ia.gecerli, true);

    // Bitiş ve dayanak okunan sürümle; eski sürüm 409, olmayan yetkinlik 404.
    const ayrinti = (istasyon: number, govde: unknown) => yaz<{ ayrintilar: { istasyonId: number; gecerlilikBitis: string | null; dayanak: string | null; gecerli: boolean; surum: number }[] }>(
      `/kisi-yetkinlikleri/${kisi}/istasyonlar/${istasyon}/ayrinti`, govde);
    const gecmisTarih = await ayrinti(a, { gecerlilikBitis: '2020-01-31', dayanak: ' Torna eğitimi ', surum: ia.surum });
    assert.equal(gecmisTarih.durum, 200, JSON.stringify(gecmisTarih.govde));
    assert.deepEqual(gecmisTarih.govde.ayrintilar.find((y) => y.istasyonId === a), { ...gecmisTarih.govde.ayrintilar.find((y) => y.istasyonId === a)!, gecerlilikBitis: '2020-01-31', dayanak: 'Torna eğitimi', gecerli: false });
    assert.equal((await ayrinti(a, { gecerlilikBitis: null, dayanak: null, surum: ia.surum })).durum, 409);
    assert.equal((await ayrinti(b, { gecerlilikBitis: null, dayanak: null, surum: 1 })).durum, 404);

    // Süresi dolan yetkinlik listede kalır, iş başlatmaya ve plana sayılmaz.
    assert.equal(await vt().tx((db) => yetkinMi(db, kisi, a)), false);
    assert.equal((await vt().tx((db) => istasyonYetkinlikleri(db))).some((y) => y.kisiId === kisi), false);
    assert.deepEqual((await oku<YetkinliklerCevabi>('/kisi-yetkinlikleri')).govde.yetkinlikler.find((y) => y.kisiId === kisi)?.istasyonIdleri, [a]);
    const uzat = await ayrinti(a, { gecerlilikBitis: '2999-12-31', dayanak: 'Yenilendi', surum: gecmisTarih.govde.ayrintilar.find((y) => y.istasyonId === a)!.surum });
    assert.equal(uzat.durum, 200);
    assert.equal(await vt().tx((db) => yetkinMi(db, kisi, a)), true);

    // Liste yazımı kalan yetkinliğin ayrıntısını korur.
    const ikinci = await yaz<{ ayrintilar: { istasyonId: number; gecerlilikBitis: string | null; dayanak: string | null }[] }>(`/kisi-yetkinlikleri/${kisi}/belirle`, { istasyonIdleri: [a, b] });
    assert.deepEqual(ikinci.govde.ayrintilar.find((y) => y.istasyonId === a), { ...ikinci.govde.ayrintilar.find((y) => y.istasyonId === a)!, gecerlilikBitis: '2999-12-31', dayanak: 'Yenilendi' });
    assert.equal((await yaz(`/kisi-yetkinlikleri/${kisi}/belirle`, { istasyonIdleri: [b] })).durum, 200);

    const gecmis = (await oku<{ gecmis: { istasyonId: number; islem: string; dayanak: string | null; degistirenKisiId: number }[] }>(`/kisi-yetkinlikleri/${kisi}/gecmis`)).govde.gecmis;
    assert.deepEqual(gecmis.map((g) => [g.istasyonId, g.islem, g.dayanak]).reverse(), [
      [a, 'ver', null], [a, 'degistir', 'Torna eğitimi'], [a, 'degistir', 'Yenilendi'], [b, 'ver', null], [a, 'kaldir', 'Yenilendi'],
    ]);
    assert.ok(gecmis.every((g) => g.degistirenKisiId === yoneticiId));
    await assert.rejects(vt().sorgu('UPDATE istasyonlar_yetkinlik_gecmisi SET dayanak = NULL'), /yalnız ekleme/);
    await assert.rejects(vt().sorgu('DELETE FROM istasyonlar_yetkinlik_gecmisi'), /yalnız ekleme/);
    assert.equal((await oku('/kisi-yetkinlikleri/999999/gecmis')).durum, 404);
  });

  test('istasyonKisileri: kişi başına bugün geçerli en büyük yüzdeli aktif istasyon; eşitlikte kodu önce gelen; ileri tarihli atama sayılmaz', async () => {
    const im = await isMerkeziKur();
    const kodPasif = yeniKod('PG-KP');
    const [kucuk, buyuk, esitA, esitB, pasif] = [
      await istasyonKur(im), await istasyonKur(im), await istasyonKur(im, 'PG-EA'), await istasyonKur(im, 'PG-EB'), await istasyonKur(im, kodPasif),
    ];
    const [birinci, ikinci, ucuncu] = [await kisiEkle('Birinci'), await kisiEkle('İkinci'), await kisiEkle('Üçüncü')];
    const ata = async (istasyon: number, kisiId: number, yuzde: string, baslangic?: string) =>
      assert.equal((await yaz(`/istasyonlar/${istasyon}/kisiler/ata`, { kisiId, yuzde, ...(baslangic ? { baslangic } : {}) })).durum, 200);
    await ata(kucuk, birinci, '30');
    await ata(buyuk, birinci, '50');
    await ata(esitB, ikinci, '40');
    await ata(esitA, ikinci, '40');
    await ata(pasif, ucuncu, '90');
    await ata(kucuk, ucuncu, '5');
    await istasyonuPasifeAl(pasif, im, kodPasif);
    const ileri = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await ata(buyuk, ucuncu, '5', ileri);

    const harita = new Map((await vt().tx((db) => istasyonKisileri(db))).map((s) => [s.kisiId, s.istasyonId]));
    assert.deepEqual([harita.get(birinci), harita.get(ikinci), harita.get(ucuncu)], [buyuk, esitA, kucuk]);
  });

  test('isMerkeziPersonelSayilari: kısıtla iş merkezine bağlı aktif kişiler sayılır, pasif kişi sayılmaz', async () => {
    const [im1, im2] = [await isMerkeziKur(), await isMerkeziKur()];
    const [aktif1, aktif2, pasif] = [await kisiEkle('Aktif Bir'), await kisiEkle('Aktif İki'), await kisiEkle('Pasif', { pasif: true })];
    for (const [kisi, idler] of [[aktif1, [im1, im2]], [aktif2, [im1]], [pasif, [im1, im2]]] as const) {
      assert.equal((await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: idler })).durum, 200);
    }
    const sayilar = new Map((await vt().tx((db) => isMerkeziPersonelSayilari(db))).map((s) => [s.isMerkeziId, s.sayi]));
    assert.deepEqual([sayilar.get(im1), sayilar.get(im2)], [2, 1]);
  });

  test('KD-008: kisilerinIzinliIsMerkezleri bütün kısıtlı kişileri verir; kısıtsız ve bütün işlemleri taşıyan rolü olan kişi haritada yok', async () => {
    const [im1, im2] = [await isMerkeziKur(), await isMerkeziKur()];
    const [kisitli, kisitsiz] = [await kisiEkle('Kısıtlı'), await kisiEkle('Kısıtsız')];
    assert.equal((await yaz(`/kisi-is-merkezleri/${kisitli}/belirle`, { isMerkeziIdleri: [im2, im1] })).durum, 200);
    assert.equal((await yaz(`/kisi-is-merkezleri/${yoneticiId}/belirle`, { isMerkeziIdleri: [im1] })).durum, 200);
    const harita = await vt().tx((db) => kisilerinIzinliIsMerkezleri(db));
    assert.deepEqual(harita.get(kisitli), [im1, im2].sort((x, y) => x - y));
    assert.equal(harita.has(kisitsiz), false);
    assert.equal(harita.has(yoneticiId), false);
    assert.equal((await yaz(`/kisi-is-merkezleri/${yoneticiId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
  });

  test('kart #1146: istasyon kapasitesi kaynağı, çalışır makineyi ve kişi ile bağlı aktif ekip üyelerinin yüzdesini verir', async () => {
    const merkez = await isMerkeziKur();
    const makineli = await istasyonKur(merkez);
    const [m1] = [await makineKur(makineli), await makineKur(makineli)];
    assert.equal((await yaz(`/makineler/${m1}/durum`, { durum: 'ariza', aciklama: null, surum: 0 })).durum, 200);
    assert.deepEqual(await vt().tx((db) => istasyonKapasitesi(db, makineli)), {
      istasyonId: makineli, kaynak: 'makine', kaynakVarsayilan: true, calisirMakineSayisi: 1, kisiYuzdeToplami: '0.00',
    });

    const insanli = await kimlik('/istasyonlar', { kod: yeniKod('PG-IS'), ad: 'Deneme Montaj', isMerkeziId: merkez, kapasiteKaynagi: 'insan' });
    const [k1, k2, k3] = [await kisiEkle('Deneme Bir'), await kisiEkle('Deneme İki'), await kisiEkle('Deneme Üç')];
    assert.equal((await yaz(`/istasyonlar/${insanli}/kisiler/ata`, { kisiId: k1, yuzde: '100' })).durum, 200);
    const ekip = await kimlik('/ekipler', { kod: yeniKod('PG-EK'), ad: 'Deneme Ekibi', istasyonId: insanli });
    assert.equal((await yaz(`/ekipler/${ekip}/uyeler/ata`, { kisiId: k2, yuzde: '50' })).durum, 200);
    // Başka istasyonun ekibi sayılmaz.
    const baskaEkip = await kimlik('/ekipler', { kod: yeniKod('PG-EK'), ad: 'Başka Ekip', istasyonId: makineli });
    assert.equal((await yaz(`/ekipler/${baskaEkip}/uyeler/ata`, { kisiId: k3, yuzde: '25.5' })).durum, 200);
    assert.deepEqual(await vt().tx((db) => istasyonKapasitesi(db, insanli)), {
      istasyonId: insanli, kaynak: 'insan', kaynakVarsayilan: false, calisirMakineSayisi: 0, kisiYuzdeToplami: '150.00',
    });
    // Geçmiş tarihte atama yoktu.
    assert.equal((await vt().tx((db) => istasyonKapasitesi(db, insanli, '2000-01-01')))?.kisiYuzdeToplami, '0.00');
    assert.equal(await vt().tx((db) => istasyonKapasitesi(db, 2147483000)), null);
  });
});
