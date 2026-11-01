import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { semaliKilitAnahtariSql } from '#cekirdek/kilit.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { IstasyonlarCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ekipler, ekipUyeleri, istasyonKisiAtamalari, istasyondakiKisiler, kisininIzinliIsMerkezleri, makineKisiAtamalari } from './disari.ts';
import { gunBicimi } from './kurallar.ts';
import * as servis from './servis.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

// Sorumlu, kapasite kaynağı, kişi atamaları ve ekipler (kart #105). Kişiler kisiler modülünün uçlarıyla açılır ve pasife alınır.
describe('istasyonlar: ekip ve kapasite (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function istek<T = unknown>(
    cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, basliklar: Record<string, string> = {},
  ): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem,
      url: `/api${yol}`,
      headers: { ...basliklar, ...(cerez ? { cookie: cerez } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const yaz = <T = unknown>(yol: string, govde?: unknown) => istek<T>(yonetici, 'POST', yol, govde);
  const oku = <T = unknown>(yol: string) => istek<T>(yonetici, 'GET', yol);
  const hataKodu = (c: Cevap): unknown => (c.govde as { kod?: unknown }).kod;
  const yeniKod = (onek: string): string => `${onek}-${(sayac += 1)}`;

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function girisliKisiEkle(kullaniciAdi: string, rolKodu: string): Promise<number> {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
  }

  // Girişsiz personel kisiler modülünün ucuyla açılır; pasife alma da uçtandır (okunan sürümle).
  async function kisiEkle(ad: string, { pasif = false } = {}): Promise<number> {
    const acildi = await istek<{ id: number; surum: number }>(yonetici, 'POST', '/kisiler', { ad }, { 'istek-kimligi': randomUUID() });
    assert.equal(acildi.durum, 200, JSON.stringify(acildi.govde));
    if (pasif) {
      const kapandi = await yaz(`/kisiler/${acildi.govde.id}/pasife-al`, { surum: acildi.govde.surum });
      assert.equal(kapandi.durum, 200, JSON.stringify(kapandi.govde));
    }
    return acildi.govde.id;
  }

  async function isMerkeziKur(): Promise<number> {
    const c = await yaz<{ id: number }>('/is-merkezleri', { kod: yeniKod('EM'), ad: 'Ekip Merkezi' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.id;
  }
  async function istasyonKur(ek: Record<string, unknown> = {}): Promise<{ id: number; kod: string; isMerkeziId: number }> {
    const isMerkeziId = await isMerkeziKur();
    const c = await yaz<{ id: number; kod: string }>('/istasyonlar', { kod: yeniKod('EI'), ad: 'Ekip İstasyonu', isMerkeziId, ...ek });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return { ...c.govde, isMerkeziId };
  }
  async function makineKur(): Promise<number> {
    const c = await yaz<{ id: number }>('/makineler', { kod: yeniKod('EK'), ad: 'Ekip Makinesi' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_ekip');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisiEkle('operator1', 'operator');
    yonetici = await girisCerezi('yonetici');
    operator = await girisCerezi('operator1');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('IS14: sorumlu bilgi alanıdır; yalnız var olan aktif kişi yeni atanır, listede adıyla döner; kayıtta duran pasif kişi korunur', async () => {
    const sorumlu = await kisiEkle('Deneme Sorumlu');
    const ist = await istasyonKur({ sorumluKisiId: sorumlu });
    const satir = async () => (await oku<IstasyonlarCevabi>('/istasyonlar?pasifler=true')).govde.istasyonlar.find((i) => i.id === ist.id);
    assert.deepEqual([(await satir())?.sorumluKisiId, (await satir())?.sorumluAd], [sorumlu, 'Deneme Sorumlu']);

    const pasif = await kisiEkle('Deneme Pasif', { pasif: true });
    for (const sorumluKisiId of [pasif, 999999]) {
      const red = await yaz('/istasyonlar', { kod: yeniKod('EI'), ad: 'Red', isMerkeziId: ist.isMerkeziId, sorumluKisiId });
      assert.deepEqual([red.durum, hataKodu(red)], [400, 'DOGRULAMA'], String(sorumluKisiId));
    }
    const guncelle = (sorumluKisiId: number | null, surum: number) =>
      yaz(`/istasyonlar/${ist.id}/guncelle`, { kod: ist.kod, ad: 'Ekip İstasyonu', isMerkeziId: ist.isMerkeziId, sorumluKisiId, surum });
    assert.equal((await guncelle(pasif, 1)).durum, 400);
    // Sorumlu sonradan pasife alınırsa kayıt bozulmaz: aynı kişiyle güncelleme kabul edilir.
    const kayit = (await oku<{ kisiler: { id: number; surum: number }[] }>('/kisiler')).govde.kisiler.find((k) => k.id === sorumlu);
    assert.equal((await yaz(`/kisiler/${sorumlu}/pasife-al`, { surum: kayit?.surum })).durum, 200);
    assert.equal((await guncelle(sorumlu, 1)).durum, 200);
    assert.equal((await guncelle(null, 2)).durum, 200);
    assert.equal((await satir())?.sorumluAd, null);
  });

  test('IS15: kapasite kaynağı makine ya da insandır; başka değer reddedilir; boş bugün kabul edilir (E2z, zorunluluğu ekran tutar)', async () => {
    const insan = await istasyonKur({ kapasiteKaynagi: 'insan' });
    const bos = await istasyonKur();
    const liste = (await oku<IstasyonlarCevabi>('/istasyonlar?pasifler=true')).govde.istasyonlar;
    assert.equal(liste.find((i) => i.id === insan.id)?.kapasiteKaynagi, 'insan');
    assert.equal(liste.find((i) => i.id === bos.id)?.kapasiteKaynagi, null);
    const red = await yaz('/istasyonlar', { kod: yeniKod('EI'), ad: 'Red', isMerkeziId: insan.isMerkeziId, kapasiteKaynagi: 'vardiya' });
    assert.deepEqual([red.durum, hataKodu(red)], [400, 'DOGRULAMA']);
    await assert.rejects(
      vt().sorgu("UPDATE istasyon SET kapasite_kaynagi = 'vardiya' WHERE id = $1", [insan.id]),
      (h: { constraint?: string }) => h.constraint === 'istasyon_kapasite_kaynagi_degeri',
    );
    const okuyamaz = await istek(operator, 'GET', '/istasyonlar');
    assert.equal(okuyamaz.durum, 403);
  });

  type Tur = 'istasyon' | 'makine' | 'ekip';
  interface AtamaCevabi { kisiler: { kisiId: number; yuzde: string; baslangic: string; baslayacak: boolean }[]; mesaj?: string }
  const YOLLAR: Record<Tur, { yaz: string; oku: string; sorgu: string }> = {
    istasyon: { yaz: 'istasyonlar/{id}/kisiler', oku: '/istasyon-kisileri', sorgu: 'istasyonId' },
    makine: { yaz: 'makineler/{id}/kisiler', oku: '/makine-kisileri', sorgu: 'makineId' },
    ekip: { yaz: 'ekipler/{id}/uyeler', oku: '/ekip-uyeleri', sorgu: 'ekipId' },
  };
  async function ekipKur(ek: Record<string, unknown> = {}): Promise<{ id: number; kod: string; surum: number }> {
    const c = await yaz<{ id: number; kod: string; surum: number }>('/ekipler', { kod: yeniKod('ET'), ad: 'Deneme Ekibi', ...ek });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde;
  }
  const sqlGun = async (fark: number): Promise<string> =>
    (await vt().tek<{ g: string }>('SELECT (current_date + $1::int)::text AS g', [fark]))?.g ?? '';
  const ata = (tur: Tur, hedefId: number, kisiId: number, yuzde: unknown, baslangic?: string) =>
    yaz<AtamaCevabi>(`/${YOLLAR[tur].yaz.replace('{id}', String(hedefId))}/ata`, { kisiId, yuzde, ...(baslangic === undefined ? {} : { baslangic }) });
  const cikar = (tur: Tur, hedefId: number, kisiId: number, baslangic?: string) =>
    yaz<AtamaCevabi>(`/${YOLLAR[tur].yaz.replace('{id}', String(hedefId))}/${kisiId}/cikar`, baslangic === undefined ? undefined : { baslangic });
  const tumListe = async (tur: Tur, hedefId: number, tarih?: string): Promise<AtamaCevabi['kisiler']> => {
    const yol = `${YOLLAR[tur].oku}?${YOLLAR[tur].sorgu}=${hedefId}${tarih === undefined ? '' : `&tarih=${tarih}`}`;
    const c = await oku<AtamaCevabi>(yol);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.kisiler;
  };
  // O tarihte geçerli atamalar; ileride başlayacaklar ayrı ölçülür.
  const liste = async (tur: Tur, hedefId: number, tarih?: string): Promise<[number, string][]> =>
    (await tumListe(tur, hedefId, tarih)).filter((k) => !k.baslayacak).map((k) => [k.kisiId, k.yuzde]);
  const hedefKur = async () => ({
    istasyon: (await istasyonKur({ kapasiteKaynagi: 'insan' })).id,
    istasyon2: (await istasyonKur()).id,
    istasyon3: (await istasyonKur()).id,
    makine: await makineKur(),
    makine2: await makineKur(),
    ekip: (await ekipKur()).id,
    ekip2: (await ekipKur()).id,
  });

  test('IK1: kişi birden çok istasyona ve makineye yüzdeyle atanır; yüzdeler tek toplamdır, 100\'ü geçen atama reddedilir', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Çok Hedefli');
    assert.equal((await ata('istasyon', h.istasyon, kisi, '30.5')).durum, 200);
    assert.equal((await ata('istasyon', h.istasyon2, kisi, '20')).durum, 200);
    assert.equal((await ata('makine', h.makine, kisi, '49.5')).durum, 200);
    assert.equal((await ata('istasyon', h.istasyon3, kisi, '0.01')).durum, 409);
    const red = await ata('makine', h.makine2, kisi, '1');
    assert.deepEqual([red.durum, hataKodu(red), red.govde.mesaj], [409, 'CAKISMA', "Kişinin toplam yüzdesi 100'ü geçemez; bu atama için en çok %0 verilebilir."]);
    assert.deepEqual(await liste('istasyon', h.istasyon), [[kisi, '30.50']]);
    assert.deepEqual(await liste('makine', h.makine2), []);
  });

  test('IK1: aşımda iletide kalan yüzde yazar; aynı hedefe yeniden atama eski yüzdeyi toplamdan düşer', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Kalan');
    await ata('istasyon', h.istasyon, kisi, '70');
    const red = await ata('makine', h.makine, kisi, '40');
    assert.deepEqual([red.durum, red.govde.mesaj], [409, "Kişinin toplam yüzdesi 100'ü geçemez; bu atama için en çok %30 verilebilir."]);
    assert.equal((await ata('makine', h.makine, kisi, '30')).durum, 200);
    assert.equal((await ata('istasyon', h.istasyon, kisi, '70')).durum, 200);
    assert.equal((await ata('istasyon', h.istasyon, kisi, '71')).durum, 409);
    assert.equal((await ata('istasyon', h.istasyon, kisi, '40')).durum, 200);
    assert.deepEqual(await liste('istasyon', h.istasyon), [[kisi, '40.00']]);
  });

  test('IK3: yüzde iki ondalıklıdır, toplam ondalık hatasızdır; 0, 100\'ü aşan ve ikiden çok ondalıklı değer reddedilir; tablo da tutar', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Üçe Bölünen');
    assert.equal((await ata('istasyon', h.istasyon, kisi, '33.33')).durum, 200);
    assert.equal((await ata('makine', h.makine, kisi, '33.33')).durum, 200);
    assert.equal((await ata('istasyon', h.istasyon2, kisi, '33.34')).durum, 200);
    assert.equal((await ata('istasyon', h.istasyon3, kisi, '0.01')).durum, 409);
    const tam = await kisiEkle('Deneme Geçersiz');
    for (const gecersiz of ['0', '0.00', '100.01', '12.345', 'abc', '', '-5', 12.5, null, undefined]) {
      const red = await ata('istasyon', h.istasyon3, tam, gecersiz);
      assert.deepEqual([red.durum, hataKodu(red)], [400, 'DOGRULAMA'], String(gecersiz));
    }
    assert.equal((await ata('istasyon', h.istasyon3, tam, '100')).durum, 200);
    for (const [tablo, sutun, hedef] of [['istasyon_kisi', 'istasyon_id', h.istasyon], ['makine_kisi', 'makine_id', h.makine]] as const) {
      await assert.rejects(
        vt().sorgu(`INSERT INTO ${tablo} (${sutun}, kisi_id, baslangic, yuzde) VALUES ($1, $2, current_date + 1, 100.5)`, [hedef, kisi]),
        (e: { constraint?: string }) => e.constraint === `${tablo}_yuzde_araligi`,
        tablo,
      );
    }
  });

  test('IK1: pasif ya da olmayan kişi atanamaz; olmayan hedef 404; yetkisiz rol atayamaz ve okuyamaz', async () => {
    const h = await hedefKur();
    const pasif = await kisiEkle('Deneme Pasif Atanan', { pasif: true });
    for (const kisiId of [pasif, 999999]) {
      const red = await ata('makine', h.makine, kisiId, '10');
      assert.deepEqual([red.durum, hataKodu(red)], [400, 'DOGRULAMA'], String(kisiId));
    }
    const kisi = await kisiEkle('Deneme Hedefsiz');
    assert.equal((await ata('istasyon', 999999, kisi, '10')).durum, 404);
    assert.equal((await ata('makine', 999999, kisi, '10')).durum, 404);
    const yetkisiz = await istek(operator, 'POST', `/istasyonlar/${h.istasyon}/kisiler/ata`, { kisiId: kisi, yuzde: '10' });
    assert.equal(yetkisiz.durum, 403);
    for (const yol of ['/istasyon-kisileri', '/makine-kisileri', '/kisi-secenekleri']) {
      assert.equal((await istek(operator, 'GET', yol)).durum, 403, yol);
    }
    assert.deepEqual(await liste('istasyon', h.istasyon), []);
  });

  // Birinci işlem yazdıktan sonra kilidi tutarak açık bekler; ikincisi başlar. Kilit varsa ikincisi pg_locks'ta verilmemiş
  // kişi kilidi olarak görünür (sabit bekleme yok); kilit yoksa beklemeden biter ve beklendi=false olur. Sonra birincisi
  // tamamlanır ve ikincisi birincinin yazdığını görerek karar verir. Kilit satırı kaldırılınca test kırmızıya döner (denetim bulgusu 1).
  const kilitSinamasi = async (
    kisiId: number,
    birinci: (db: Db) => Promise<unknown>,
    ikinci: (db: Db) => Promise<unknown>,
  ): Promise<{ beklendi: boolean; birinci: { kod?: string }; ikinci: { kod?: string } }> => {
    let birak: () => void = () => undefined;
    const tutulur = new Promise<void>((coz) => { birak = coz; });
    let yazildi: () => void = () => undefined;
    const birinciYazdi = new Promise<void>((coz) => { yazildi = coz; });
    const sonuc = (hata: unknown): { kod?: string } => ({ kod: (hata as { kod?: string }).kod ?? String(hata) });
    const a = vt().tx(async (db) => { await birinci(db); yazildi(); await tutulur; }).then(() => ({}), sonuc);
    await birinciYazdi;
    let ikinciBitti = false;
    const b = vt().tx(ikinci).then(() => ({}), sonuc).finally(() => { ikinciBitti = true; });
    const bekleyen = async (): Promise<boolean> => {
      const satir = await vt().tek<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND classid = (${semaliKilitAnahtariSql("'kisi_atama'")}::bigint & 4294967295)::oid AND objid = $1::oid`,
        [kisiId],
      );
      return (satir?.n ?? 0) > 0;
    };
    const son = Date.now() + 5000;
    let beklendi = await bekleyen();
    while (!beklendi && !ikinciBitti && Date.now() < son) {
      await new Promise((coz) => setImmediate(coz));
      beklendi = await bekleyen();
    }
    birak();
    return { beklendi, birinci: await a, ikinci: await b };
  };

  test('IK1: aynı kişiye iki işlemin ataması kişi kilidinde sıralanır; farklı türlerde toplam birlikte aşılamaz', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Yarış');
    const o = await kilitSinamasi(
      kisi,
      (db) => servis.atamaYap(db, 'istasyon', h.istasyon, { kisiId: kisi, yuzde: '60' }),
      (db) => servis.atamaYap(db, 'makine', h.makine, { kisiId: kisi, yuzde: '60' }),
    );
    assert.equal(o.beklendi, true);
    assert.deepEqual([o.birinci, o.ikinci], [{}, { kod: 'CAKISMA' }]);
    assert.deepEqual(await liste('istasyon', h.istasyon), [[kisi, '60.00']]);
    assert.deepEqual(await liste('makine', h.makine), []);
  });

  test('IK2: yalnız bugün ve ileri tarih kabul edilir; geçmiş ve geçersiz tarih reddedilir; verilmezse bugün', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Tarihli');
    const dun = await sqlGun(-1);
    const gecmis = await ata('istasyon', h.istasyon, kisi, '10', dun);
    assert.deepEqual([gecmis.durum, hataKodu(gecmis)], [400, 'DOGRULAMA']);
    for (const bozuk of ['2026-13-01', '2026-02-30', '01.02.2026', 'yarın']) {
      assert.equal((await ata('istasyon', h.istasyon, kisi, '10', bozuk)).durum, 400, bozuk);
    }
    assert.deepEqual(await liste('istasyon', h.istasyon), []);
    const verilmedi = await ata('istasyon', h.istasyon, kisi, '10');
    assert.deepEqual([verilmedi.durum, verilmedi.govde.kisiler[0]?.baslangic], [200, await sqlGun(0)]);
    assert.equal((await cikar('istasyon', h.istasyon, kisi, dun)).durum, 400);
    assert.equal((await ata('makine', h.makine, kisi, '10', await sqlGun(30))).durum, 200);
  });

  test('IK2: değişiklik ileriye işler; her tarihte o tarihte geçerli atama okunur, çıkarma geçmişi değiştirmez', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Geçerlilik');
    const [g10, g20] = [await sqlGun(10), await sqlGun(20)];
    await ata('makine', h.makine, kisi, '50');
    await ata('makine', h.makine, kisi, '20', g10);
    await cikar('makine', h.makine, kisi, g20);
    assert.deepEqual(await liste('makine', h.makine), [[kisi, '50.00']]);
    assert.deepEqual(await liste('makine', h.makine, await sqlGun(9)), [[kisi, '50.00']]);
    assert.deepEqual(await liste('makine', h.makine, g10), [[kisi, '20.00']]);
    assert.deepEqual(await liste('makine', h.makine, await sqlGun(19)), [[kisi, '20.00']]);
    assert.deepEqual(await liste('makine', h.makine, g20), []);
    assert.deepEqual(await liste('makine', h.makine, await sqlGun(-5)), []);
  });

  test('IS20: ileri tarihli atama listede "başlayacak" diye görünür; geçerli ataması olan kişi tek satırdır; iptal ve planlı çıkarma görünmez', async () => {
    const h = await hedefKur();
    const [ileri, simdi, cikan] = [await kisiEkle('Deneme Başlayacak'), await kisiEkle('Deneme Şimdiki'), await kisiEkle('Deneme Çıkacak')];
    const [bugun, g5, g10] = [await sqlGun(0), await sqlGun(5), await sqlGun(10)];
    for (const tur of ['istasyon', 'makine', 'ekip'] as const) {
      const hedef = tur === 'istasyon' ? h.istasyon : tur === 'makine' ? h.makine : h.ekip;
      const yanit = await ata(tur, hedef, ileri, '20', g10);
      assert.equal(yanit.durum, 200, tur);
      const ozet = (l: AtamaCevabi['kisiler']) => l.map((k) => [k.kisiId, k.yuzde, k.baslangic, k.baslayacak]);
      assert.deepEqual(ozet(yanit.govde.kisiler), [[ileri, '20.00', g10, false]], tur);
      assert.deepEqual(ozet(await tumListe(tur, hedef)), [[ileri, '20.00', g10, true]], tur);
      assert.deepEqual((await tumListe(tur, hedef, g10)).map((k) => [k.kisiId, k.baslayacak]), [[ileri, false]], tur);
      assert.equal((await cikar(tur, hedef, ileri)).durum, 200, tur);
      assert.deepEqual(await tumListe(tur, hedef), [], tur);
    }
    await ata('makine', h.makine2, simdi, '10');
    await ata('makine', h.makine2, simdi, '30', g10);
    await ata('makine', h.makine2, cikan, '10');
    await cikar('makine', h.makine2, cikan, g5);
    const satirlar2 = await tumListe('makine', h.makine2);
    assert.deepEqual(satirlar2.map((k) => [k.kisiId, k.yuzde, k.baslangic, k.baslayacak]), [[simdi, '10.00', bugun, false], [cikan, '10.00', bugun, false]]);
    assert.deepEqual(await tumListe('makine', h.makine2, g5).then((l) => l.map((k) => k.kisiId)), [simdi]);
  });

  test('IK2: aynı gün ikinci değişiklik o günün satırının üstüne yazar (gün içi geçmiş tutulmaz)', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Gün İçi');
    const satirSayisi = async () => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM istasyon_kisi WHERE kisi_id = $1', [kisi]))?.n;
    await ata('istasyon', h.istasyon, kisi, '50');
    await ata('istasyon', h.istasyon, kisi, '25');
    assert.equal(await satirSayisi(), 1);
    assert.deepEqual(await liste('istasyon', h.istasyon), [[kisi, '25.00']]);
    await cikar('istasyon', h.istasyon, kisi);
    assert.deepEqual(await liste('istasyon', h.istasyon), []);
    assert.equal(await satirSayisi(), 1);
  });

  test('IK2: toplam kontrolü ileri günleri de kapsar; çıkarılmış atamanın yüzdesi o günden sonra serbesttir', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme İleri Yük');
    const g20 = await sqlGun(20);
    await ata('makine', h.makine, kisi, '60', await sqlGun(10));
    const red = await ata('istasyon', h.istasyon, kisi, '50');
    assert.deepEqual([red.durum, red.govde.mesaj], [
      409, `Kişinin toplam yüzdesi 100'ü geçemez; bu atama için en çok %40 verilebilir (${gunBicimi(await sqlGun(10))} tarihinde başlayan atama nedeniyle; atamanın bitiş tarihi yoktur).`,
    ]);
    assert.equal((await ata('istasyon', h.istasyon, kisi, '40')).durum, 200);
    assert.equal((await ata('istasyon', h.istasyon2, kisi, '50', g20)).durum, 409);
    await cikar('makine', h.makine, kisi, g20);
    assert.equal((await ata('istasyon', h.istasyon2, kisi, '50', g20)).durum, 200);
  });

  test('IK1: çıkarılan atamanın yüzdesi serbest kalır; olmayan atama çıkarılamaz (404)', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Serbest');
    await ata('makine', h.makine, kisi, '100');
    assert.equal((await ata('istasyon', h.istasyon, kisi, '10')).durum, 409);
    const cikti = await cikar('makine', h.makine, kisi);
    assert.deepEqual([cikti.durum, cikti.govde.kisiler], [200, []]);
    assert.equal((await ata('istasyon', h.istasyon, kisi, '10')).durum, 200);
    assert.equal((await cikar('makine', h.makine, kisi)).durum, 404);
    assert.equal((await cikar('makine', h.makine2, kisi)).durum, 404);
  });

  test('ataması olan istasyon ve makine silinmez (409, pasife alınır); kişi seçenekleri pasifleri de işaretli getirir', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Silinmez');
    await ata('istasyon', h.istasyon, kisi, '10');
    await ata('makine', h.makine, kisi, '10');
    for (const yol of [`/istasyonlar/${h.istasyon}/sil`, `/makineler/${h.makine}/sil`]) {
      const red = await yaz(yol);
      assert.equal(red.durum, 409, yol);
    }
    // Bulgu 4b: kişi çıkarılsa da atama satırı kalır (geçmiş günler), kayıt yine silinmez.
    await cikar('istasyon', h.istasyon, kisi);
    await cikar('makine', h.makine, kisi);
    for (const yol of [`/istasyonlar/${h.istasyon}/sil`, `/makineler/${h.makine}/sil`]) assert.equal((await yaz(yol)).durum, 409, yol);
    assert.equal((await yaz(`/makineler/${h.makine2}/sil`)).durum, 204);
    const pasif = await kisiEkle('Deneme Seçenek Pasif', { pasif: true });
    const secenekler = (await oku<{ kisiler: { id: number; aktif: boolean }[] }>('/kisi-secenekleri')).govde.kisiler;
    assert.deepEqual(secenekler.filter((k) => k.id === kisi || k.id === pasif).map((k) => [k.id, k.aktif]).sort(), [[kisi, true], [pasif, false]]);
  });

  test('IK7: ekip kodu benzersiz, istasyona bağlanabilir ya da boş kalır; sürüm eskiyse güncelleme 409; silme ucu yok, pasife alınır', async () => {
    const ist = await istasyonKur();
    const ekip = await ekipKur({ istasyonId: ist.id });
    assert.equal((await yaz('/ekipler', { kod: ekip.kod, ad: 'Aynı Kod' })).durum, 409);
    assert.equal(hataKodu(await yaz('/ekipler', { kod: yeniKod('ET'), ad: ' ' })), 'DOGRULAMA');
    assert.equal((await yaz('/ekipler', { kod: yeniKod('ET'), ad: 'Hayalet', istasyonId: 999999 })).durum, 409);
    const pasife = await yaz<{ aktif: boolean; surum: number; istasyonId: number | null }>(
      `/ekipler/${ekip.id}/guncelle`, { kod: ekip.kod, ad: 'Deneme Ekibi', istasyonId: null, aktif: false, surum: ekip.surum },
    );
    assert.deepEqual([pasife.durum, pasife.govde.aktif, pasife.govde.surum, pasife.govde.istasyonId], [200, false, ekip.surum + 1, null]);
    const eski = await yaz(`/ekipler/${ekip.id}/guncelle`, { kod: ekip.kod, ad: 'Ezen', aktif: true, surum: ekip.surum });
    assert.deepEqual([eski.durum, hataKodu(eski)], [409, 'CAKISMA']);
    assert.equal((await yaz('/ekipler/999999/guncelle', { kod: yeniKod('ET'), ad: 'Yok', surum: 1 })).durum, 404);
    const kodlar = async (yol: string) => (await oku<{ ekipler: { id: number }[] }>(yol)).govde.ekipler.map((e) => e.id);
    assert.equal((await kodlar('/ekipler')).includes(ekip.id), false);
    assert.equal((await kodlar('/ekipler?pasifler=true')).includes(ekip.id), true);
    assert.equal((await ekipler(vt())).some((e) => e.id === ekip.id), false);
    assert.equal((await ekipler(vt(), { pasiflerDahil: true })).some((e) => e.id === ekip.id), true);
    assert.equal((await yaz(`/ekipler/${ekip.id}/sil`)).durum, 404);
    assert.equal((await istek(operator, 'GET', '/ekipler')).durum, 403);
  });

  test('IK6: ekip üyeliği de yüzdedir ve kişinin toplamına girer; pasif ekibin üyeliği toplamdan düşmez', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Üye Toplam');
    assert.equal((await ata('istasyon', h.istasyon, kisi, '30')).durum, 200);
    assert.equal((await ata('ekip', h.ekip, kisi, '60')).durum, 200);
    const red = await ata('makine', h.makine, kisi, '20');
    assert.deepEqual([red.durum, red.govde.mesaj], [409, "Kişinin toplam yüzdesi 100'ü geçemez; bu atama için en çok %10 verilebilir."]);
    const ekip = (await oku<{ ekipler: { id: number; kod: string; surum: number }[] }>('/ekipler')).govde.ekipler.find((e) => e.id === h.ekip);
    assert.equal((await yaz(`/ekipler/${h.ekip}/guncelle`, { kod: ekip?.kod, ad: 'Pasif Ekip', aktif: false, surum: ekip?.surum })).durum, 200);
    assert.equal((await ata('makine', h.makine, kisi, '20')).durum, 409);
    assert.deepEqual(await liste('ekip', h.ekip), [[kisi, '60.00']]);
  });

  test('IK6: kişi aynı anda tek ekibin üyesidir; başka ekipteyse reddedilir, çıkarılınca eklenir; tarihli çıkış ileri günleri açar', async () => {
    const bir = await ekipKur({ ad: 'Birinci Ekip' });
    const iki = await ekipKur({ ad: 'İkinci Ekip' });
    const kisi = await kisiEkle('Deneme Gezgin');
    await ata('ekip', bir.id, kisi, '50');
    const red = await ata('ekip', iki.id, kisi, '50');
    assert.deepEqual([red.durum, red.govde.mesaj], [409, `Kişi ${gunBicimi(await sqlGun(0))} tarihinden itibaren başka bir ekibin üyesi (Birinci Ekip); önce oradan çıkarılmalı.`]);
    assert.deepEqual([await liste('ekip', bir.id), await liste('ekip', iki.id)], [[[kisi, '50.00']], []]);
    const g10 = await sqlGun(10);
    await cikar('ekip', bir.id, kisi, g10);
    assert.equal((await ata('ekip', iki.id, kisi, '50')).durum, 409);
    assert.equal((await ata('ekip', iki.id, kisi, '50', g10)).durum, 200);
    assert.deepEqual([await liste('ekip', bir.id, g10), await liste('ekip', iki.id, g10)], [[], [[kisi, '50.00']]]);
    assert.deepEqual(await liste('ekip', bir.id), [[kisi, '50.00']]);
  });

  test('IK6: aynı kişiyi iki ekibe ekleyen iki işlem kişi kilidinde sıralanır; yalnız biri geçer', async () => {
    const bir = await ekipKur();
    const iki = await ekipKur();
    const kisi = await kisiEkle('Deneme Yarış Üyesi');
    const o = await kilitSinamasi(
      kisi,
      (db) => servis.atamaYap(db, 'ekip', bir.id, { kisiId: kisi, yuzde: '10' }),
      (db) => servis.atamaYap(db, 'ekip', iki.id, { kisiId: kisi, yuzde: '10' }),
    );
    assert.equal(o.beklendi, true);
    assert.deepEqual([o.birinci, o.ikinci], [{}, { kod: 'CAKISMA' }]);
    assert.deepEqual([await liste('ekip', bir.id), await liste('ekip', iki.id)], [[[kisi, '10.00']], []]);
  });

  // Kullanıcı kararı: başka iş merkezindeki istasyona yetkinlik, kısıtlı kişiye o iş merkezinde çalışma izni de verir.
  test('yetkin olunan aktif istasyonun iş merkezi kısıtlı kişiye izinlidir; kısıtsız kişi kısıtsız kalır, pasif istasyon izin vermez', async () => {
    const im = await isMerkeziKur();
    const yetkin = await istasyonKur();
    const kisi = await kisiEkle('Deneme Yetkin Operatör');
    assert.equal((await yaz(`/kisi-yetkinlikleri/${kisi}/belirle`, { istasyonIdleri: [yetkin.id] })).durum, 200);
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), kisi), [], 'kısıtsız kişiye yetkinlik kısıt koymaz');
    assert.equal((await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [im] })).durum, 200);
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), kisi), [im, yetkin.isMerkeziId].sort((a, b) => a - b));
    await vt().sorgu('UPDATE istasyon SET aktif = false WHERE id = $1', [yetkin.id]);
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), kisi), [im]);
  });

  test('K4: ekip üyeliği kişinin iş merkezi kısıtını değiştirmez; üye sayısı bugün geçerli üyelerdir', async () => {
    const im = await isMerkeziKur();
    const kisi = await kisiEkle('Deneme Kapsamlı Üye');
    assert.equal((await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [im] })).durum, 200);
    const ekip = await ekipKur();
    assert.equal((await ata('ekip', ekip.id, kisi, '20')).durum, 200);
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), kisi), [im]);
    const sayi = async () =>
      (await oku<{ ekipler: { id: number; uyeSayisi: number }[] }>('/ekipler?pasifler=true')).govde.ekipler.find((e) => e.id === ekip.id)?.uyeSayisi;
    assert.equal(await sayi(), 1);
    const gelecek = await kisiEkle('Deneme Gelecek Üye');
    await ata('ekip', ekip.id, gelecek, '20', await sqlGun(5));
    assert.equal(await sayi(), 1);
    await cikar('ekip', ekip.id, kisi);
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), kisi), [im]);
    assert.equal(await sayi(), 0);
    assert.deepEqual(await ekipUyeleri(vt(), ekip.id, await sqlGun(5)), [{ kisiId: gelecek, yuzde: '20.00' }]);
  });

  test('dışarı: başka modül atamaları o tarihte geçerli haliyle okur; tarih verilmezse bugün', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Dışarı');
    const g10 = await sqlGun(10);
    await ata('makine', h.makine, kisi, '50');
    await ata('makine', h.makine, kisi, '20', g10);
    await ata('istasyon', h.istasyon, kisi, '10');
    assert.deepEqual(await istasyondakiKisiler(vt(), h.istasyon), [{ kisiId: kisi, yuzde: '10.00' }]);
    assert.deepEqual(await makineKisiAtamalari(vt(), { makineId: h.makine }), [{ makineId: h.makine, kisiId: kisi, yuzde: '50.00' }]);
    assert.deepEqual(await makineKisiAtamalari(vt(), { kisiId: kisi, tarih: g10 }), [{ makineId: h.makine, kisiId: kisi, yuzde: '20.00' }]);
    assert.deepEqual(await istasyondakiKisiler(vt(), h.istasyon, await sqlGun(-1)), []);
    // Bütün istasyon atamaları tek sorguda; kişiye tek istasyon seçimini okuyan modül yapar (IR5 b).
    await ata('istasyon', h.istasyon2, kisi, '15', g10);
    assert.deepEqual(await istasyonKisiAtamalari(vt(), { kisiId: kisi }), [{ istasyonId: h.istasyon, kisiId: kisi, yuzde: '10.00' }]);
    assert.deepEqual(await istasyonKisiAtamalari(vt(), { kisiId: kisi, tarih: g10 }), [
      { istasyonId: h.istasyon, kisiId: kisi, yuzde: '10.00' },
      { istasyonId: h.istasyon2, kisiId: kisi, yuzde: '15.00' },
    ]);
    assert.deepEqual(await istasyonKisiAtamalari(vt(), { istasyonId: h.istasyon2, tarih: g10 }), [{ istasyonId: h.istasyon2, kisiId: kisi, yuzde: '15.00' }]);
    assert.ok((await istasyonKisiAtamalari(vt())).some((a) => a.istasyonId === h.istasyon && a.kisiId === kisi));
  });

  test('Bulgu 3: atama açık uçludur; ileride başlayan üyelik varken bugüne başka ekip reddedilir, iletide engelleyen kayıt ve tarihi var', async () => {
    const bir = await ekipKur({ ad: 'Bugünkü Ekip' });
    const iki = await ekipKur({ ad: 'İlerideki Ekip' });
    const kisi = await kisiEkle('Deneme Araya Giren');
    const g5 = await sqlGun(5);
    assert.equal((await ata('ekip', iki.id, kisi, '50', g5)).durum, 200);
    const red = await ata('ekip', bir.id, kisi, '50');
    assert.deepEqual([red.durum, red.govde.mesaj], [409, `Kişi ${gunBicimi(g5)} tarihinden itibaren başka bir ekibin üyesi (İlerideki Ekip); önce oradan çıkarılmalı.`]);
    assert.deepEqual(await liste('ekip', bir.id), []);
  });

  test('Bulgu 3: ilerideki kayıt çıkarılınca aynı atama kabul edilir', async () => {
    const bir = await ekipKur();
    const iki = await ekipKur();
    const kisi = await kisiEkle('Deneme Yer Açan');
    const g5 = await sqlGun(5);
    await ata('ekip', iki.id, kisi, '50', g5);
    assert.equal((await ata('ekip', bir.id, kisi, '50')).durum, 409);
    assert.equal((await cikar('ekip', iki.id, kisi)).durum, 200);
    assert.equal((await ata('ekip', bir.id, kisi, '50')).durum, 200);
    assert.deepEqual([await liste('ekip', bir.id, g5), await liste('ekip', iki.id, g5)], [[[kisi, '50.00']], []]);
  });

  const pasifeAl = async (ekipId: number) => {
    const ekip = (await oku<{ ekipler: { id: number; kod: string; ad: string; surum: number }[] }>('/ekipler')).govde.ekipler.find((e) => e.id === ekipId);
    const c = await yaz(`/ekipler/${ekipId}/guncelle`, { kod: ekip?.kod, ad: ekip?.ad, aktif: false, surum: ekip?.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };

  test('Bulgu 5 (IK7): pasif ekibin üyeleri dışarıya varsayılan okumada dönmez, istenince döner; ekranın listesi göstermeye devam eder', async () => {
    const ekip = await ekipKur();
    const kisi = await kisiEkle('Deneme Pasif Ekip Üyesi');
    await ata('ekip', ekip.id, kisi, '40');
    assert.deepEqual(await ekipUyeleri(vt(), ekip.id), [{ kisiId: kisi, yuzde: '40.00' }]);
    await pasifeAl(ekip.id);
    assert.deepEqual(await ekipUyeleri(vt(), ekip.id), []);
    assert.deepEqual(await ekipUyeleri(vt(), ekip.id, undefined, { pasiflerDahil: true }), [{ kisiId: kisi, yuzde: '40.00' }]);
    assert.deepEqual(await ekipUyeleri(vt(), 999999, undefined, { pasiflerDahil: true }), []);
    assert.deepEqual(await liste('ekip', ekip.id), [[kisi, '40.00']]);
  });

  test('Bulgu 5: pasif ekip üyeliği yüzde toplamında sayılır; pasif ekipteki kişi başka ekibe eklenince ret, iletide ekip adı', async () => {
    const h = await hedefKur();
    const pasif = await ekipKur({ ad: 'Kapanan Ekip' });
    const kisi = await kisiEkle('Deneme Pasifte Kalan');
    await ata('ekip', pasif.id, kisi, '70');
    await pasifeAl(pasif.id);
    const asim = await ata('makine', h.makine, kisi, '40');
    assert.deepEqual([asim.durum, asim.govde.mesaj], [409, "Kişinin toplam yüzdesi 100'ü geçemez; bu atama için en çok %30 verilebilir."]);
    const red = await ata('ekip', h.ekip, kisi, '20');
    assert.deepEqual([red.durum, red.govde.mesaj], [409, `Kişi ${gunBicimi(await sqlGun(0))} tarihinden itibaren pasif bir ekibin üyesi (Kapanan Ekip); önce oradan çıkarılmalı.`]);
    assert.equal((await cikar('ekip', pasif.id, kisi)).durum, 200);
    assert.equal((await ata('ekip', h.ekip, kisi, '20')).durum, 200);
  });

  const onizleme = async (tur: Tur, hedefId: number, kisiId: number, baslangic?: string) => {
    const c = await oku<{ satirlar: { baslangic: string; yuzde: string | null }[] }>(
      `/atama-iptalleri?tur=${tur}&hedefId=${hedefId}&kisiId=${kisiId}${baslangic === undefined ? '' : `&baslangic=${baslangic}`}`,
    );
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.satirlar;
  };
  const satirlar = async (kisiId: number) =>
    vt().sorgu<{ baslangic: string; yuzde: string | null; iptal: boolean }>(
      'SELECT baslangic::text AS baslangic, yuzde::text AS yuzde, iptal_zamani IS NOT NULL AS iptal FROM makine_kisi WHERE kisi_id = $1 ORDER BY baslangic, id',
      [kisiId],
    );

  test('E3k: ileri tarihten çıkarılan kişi sessizce geri gelmez; aynı hedefteki daha ileri planlı atamalar iptal olur, satırlar silinmez', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Geri Gelmez');
    const [bugun, g5, g10, g20] = [await sqlGun(0), await sqlGun(5), await sqlGun(10), await sqlGun(20)];
    await ata('makine', h.makine, kisi, '50');
    await ata('makine', h.makine, kisi, '30', g10);
    await ata('makine', h.makine2, kisi, '20', g10);
    assert.deepEqual(await onizleme('makine', h.makine, kisi, g5), [{ baslangic: g10, yuzde: '30.00' }]);
    assert.equal((await cikar('makine', h.makine, kisi, g5)).durum, 200);
    assert.deepEqual(await liste('makine', h.makine, bugun), [[kisi, '50.00']]);
    for (const gun of [g5, g10, g20]) assert.deepEqual(await liste('makine', h.makine, gun), [], gun);
    // Başka hedefin ileri ataması dokunulmadan kalır.
    assert.deepEqual(await liste('makine', h.makine2, g10), [[kisi, '20.00']]);
    assert.deepEqual(await satirlar(kisi), [
      { baslangic: bugun, yuzde: '50.00', iptal: false },
      { baslangic: g5, yuzde: null, iptal: false },
      { baslangic: g10, yuzde: '30.00', iptal: true },
      { baslangic: g10, yuzde: '20.00', iptal: false },
    ]);
    assert.deepEqual(await onizleme('makine', h.makine, kisi, g5), []);
    // İptal satırı toplamı tutmaz: aynı güne yeni atama yeni satır açar, iptal satırı yerinde kalır.
    assert.equal((await ata('makine', h.makine, kisi, '80', g10)).durum, 200);
    assert.deepEqual(await liste('makine', h.makine, g10), [[kisi, '80.00']]);
    assert.equal((await satirlar(kisi)).filter((r) => r.baslangic === g10).length, 3);
  });

  test('E3k: yalnız ileride planlı ataması olan kişi bugünden çıkarılabilir (iptal yazılır); hiç ataması yoksa 404; önizleme yalnız yazana açık', async () => {
    const h = await hedefKur();
    const kisi = await kisiEkle('Deneme Yalnız Planlı');
    const g10 = await sqlGun(10);
    await ata('ekip', h.ekip, kisi, '40', g10);
    assert.deepEqual(await onizleme('ekip', h.ekip, kisi), [{ baslangic: g10, yuzde: '40.00' }]);
    assert.equal((await cikar('ekip', h.ekip, kisi)).durum, 200);
    assert.deepEqual(await liste('ekip', h.ekip, g10), []);
    assert.equal((await cikar('ekip', h.ekip, kisi)).durum, 404);
    // İptal edilen üyelik tek ekip kuralını da tutmaz.
    assert.equal((await ata('ekip', h.ekip2, kisi, '40', g10)).durum, 200);
    const yol = `/atama-iptalleri?tur=ekip&hedefId=${h.ekip}&kisiId=${kisi}`;
    assert.equal((await istek(operator, 'GET', yol)).durum, 403);
    assert.equal((await oku(`/atama-iptalleri?tur=vardiya&hedefId=${h.ekip}&kisiId=${kisi}`)).durum, 400);
    assert.equal((await oku(`${yol}&baslangic=${await sqlGun(-1)}`)).durum, 400);
  });
});
