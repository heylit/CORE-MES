import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { DurusNedenleriCevabi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type {
  CalismaTakvimiCevabi, FazlaMesaiCevabi, FazlaMesaiListeCevabi, GunlukMesaiCevabi, PlanliDurusCevabi, PlanliDurusListeCevabi, TakvimCevabi, VardiyaPersoneliCevabi,
} from '#paylasilan/sozlesme/vardiya.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { basladigiGunTakvimi, basladigiGunTakvimleri, calisirMakineSayilari, calismaSuresi, calismaTakvimleri, gunYaz, kisiVardiyalari, vardiyaMatrisi, planliDuruslarinHepsi, planliDurusSilArkon, planliDurusYaz, takvimKayitlari } from './disari.ts';
import type { ArkonDurusSonucu, PlanliDurusKaydi } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const OLMAYAN_ID = 2147483647;
// Testin tarihleri bugünden bağımsızdır: geçmiş 2000, gelecek 2099 yılındadır.
const CARSAMBA = '2099-10-07';
// Testin İK listesine yazdığı her yıl 29 Ekim; 2098'de çarşamba.
const IK_TATILI = '2098-10-29';

interface Rol { id: number; ad: string }
interface Cevap<T> { durum: number; govde: T }

describe('vardiya (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c: Record<'yonetici' | 'planlama' | 'operator' | 'kisitli', string> = { yonetici: '', planlama: '', operator: '', kisitli: '' };
  const kisiler: Record<string, number> = {};
  let merkezA = 0;
  let merkezB = 0;
  let merkezPasif = 0;
  let istasyonA = 0;
  let istasyonB = 0;
  let makineA = 0;
  let makineBos = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function istek<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, baslik: Record<string, string> = {}): Promise<Cevap<T>> {
    const cevap = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez, ...baslik }, payload: payload as object | undefined });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  }
  const tamam = async <T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, baslik?: Record<string, string>): Promise<T> => {
    const cevap = await istek<T>(cerez, yontem, url, payload, baslik);
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  };
  const takvim = (cerez = c.operator) => tamam<TakvimCevabi>(cerez, 'GET', '/vardiya-takvimi');
  const kimlikli = () => ({ [ISTEK_KIMLIGI_BASLIGI]: randomUUID() });
  const vardiyaAc = async (alanlar: Record<string, unknown> = {}) => {
    const ad = `V-${String(++sayac)}`;
    const t = await tamam<TakvimCevabi>(c.planlama, 'POST', '/vardiyalar', { ad, baslangic: '08:00', bitis: '16:00', molalar: [], ...alanlar }, kimlikli());
    return t.vardiyalar.find((v) => v.ad === ad)!;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('vardiya');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    const roller = (await tamam<{ roller: Rol[] }>(c.yonetici, 'GET', '/roller')).roller;
    for (const [ad, rolAdi] of [['planlama', 'Planlama ve Proje'], ['operator', 'Operatör'], ['kisitli', 'Planlama ve Proje'], ['personel', 'Operatör'], ['bosta', 'Operatör']] as const) {
      const rol = roller.find((r) => r.ad === rolAdi)!.id;
      kisiler[ad] = await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, rol);
        for (const r of kisi.roller) if (r.id !== rol) await rolAl(db, yoneticiId, id, r.id);
        return id;
      });
      if (ad in c) c[ad as keyof typeof c] = await girisCerezi(ad);
    }
    merkezA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'VR-A', ad: 'Deneme merkez A', aciklama: null })).id;
    merkezB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'VR-B', ad: 'Deneme merkez B', aciklama: null })).id;
    merkezPasif = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'VR-P', ad: 'Deneme pasif', aciklama: null, aktif: false })).id;
    istasyonA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'VR-IA', ad: 'Deneme istasyon A', isMerkeziId: merkezA })).id;
    istasyonB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'VR-IB', ad: 'Deneme istasyon B', isMerkeziId: merkezB })).id;
    makineA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'VR-MA', ad: 'Deneme makine A', istasyonId: istasyonA })).id;
    makineBos = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'VR-MB', ad: 'Deneme makine boşta' })).id;
    // Kısıtlı planlamacı yalnız A merkezinde yazar; personel A'da %30, B'de %70 çalışır (iş merkezi B'dir).
    await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${kisiler['kisitli']!}/belirle`, { isMerkeziIdleri: [merkezA] });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${istasyonA}/kisiler/ata`, { kisiId: kisiler['personel']!, yuzde: '30.00' });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${istasyonB}/kisiler/ata`, { kisiId: kisiler['personel']!, yuzde: '70.00' });
  });
  after(async () => { await ortam?.kaldir(); });

  test('VR-01, VR-05: vardiya molasıyla açılır, net süre molasız sayılır; yetkisiz rol, çakışan mola, aynı ad ve kimliksiz istek reddedilir', async () => {
    const govde = { ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', molalar: [{ baslangic: '12:00', bitis: '12:30' }] };
    assert.equal((await istek(c.operator, 'POST', '/vardiyalar', govde, kimlikli())).durum, 403);
    assert.equal((await istek(c.planlama, 'POST', '/vardiyalar', govde)).durum, 400);
    const hatali = { ...govde, ad: 'Hatalı', molalar: [{ baslangic: '12:00', bitis: '12:30' }, { baslangic: '12:10', bitis: '12:40' }] };
    assert.equal((await istek(c.planlama, 'POST', '/vardiyalar', hatali, kimlikli())).durum, 400);
    assert.equal((await istek(c.planlama, 'POST', '/vardiyalar', { ...govde, bitis: '08:00' }, kimlikli())).durum, 400);
    const baslik = kimlikli();
    const t = await tamam<TakvimCevabi>(c.planlama, 'POST', '/vardiyalar', govde, baslik);
    const v = t.vardiyalar.find((x) => x.ad === 'Gündüz')!;
    assert.equal(v.netDakika, 450);
    assert.equal(v.surum, 1);
    // Aynı kimlikle yinelenen komut ikinci vardiya açmaz; başka kimlikle aynı ad 409'dur.
    await tamam<TakvimCevabi>(c.planlama, 'POST', '/vardiyalar', govde, baslik);
    assert.equal((await takvim()).vardiyalar.filter((x) => x.ad === 'Gündüz').length, 1);
    assert.equal((await istek(c.planlama, 'POST', '/vardiyalar', govde, kimlikli())).durum, 409);
  });

  test('Sürüm: güncelleme okunan sürümle geçer, eski sürüm 409, olmayan vardiya 404 alır; molalar yeniden yazılır', async () => {
    const v = await vardiyaAc({ molalar: [{ baslangic: '10:00', bitis: '10:15' }] });
    const govde = { ad: v.ad, baslangic: '07:00', bitis: '15:00', molalar: [{ baslangic: '11:00', bitis: '11:45' }], aktif: true };
    assert.equal((await istek(c.operator, 'POST', `/vardiyalar/${v.id}/guncelle`, { ...govde, surum: v.surum })).durum, 403);
    const t = await tamam<TakvimCevabi>(c.planlama, 'POST', `/vardiyalar/${v.id}/guncelle`, { ...govde, surum: v.surum });
    const yeni = t.vardiyalar.find((x) => x.id === v.id)!;
    assert.deepEqual([yeni.baslangic, yeni.bitis, yeni.netDakika, yeni.surum, yeni.molalar], ['07:00', '15:00', 435, 2, [{ baslangic: '11:00', bitis: '11:45' }]]);
    const eski = await istek<{ ayrinti?: { neden?: string } }>(c.planlama, 'POST', `/vardiyalar/${v.id}/guncelle`, { ...govde, ad: `${v.ad}-x`, surum: v.surum });
    assert.equal(eski.durum, 409);
    assert.equal(eski.govde.ayrinti?.neden, 'eski-surum');
    assert.equal((await takvim()).vardiyalar.find((x) => x.id === v.id)?.ad, v.ad);
    assert.equal((await istek(c.planlama, 'POST', `/vardiyalar/${OLMAYAN_ID}/guncelle`, { ...govde, surum: 1 })).durum, 404);
  });

  test('VR-01, VR-04, VR-09: matris hücresi açılır ve kapanır; haftalık ve günlük süre net dakikadır; kapsam dışı iş merkezi ve tesis geneli yazma kısıtlıya kapalı', async () => {
    const v = await vardiyaAc({ molalar: [{ baslangic: '12:00', bitis: '12:30' }] });
    assert.equal((await istek(c.operator, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 1, vardiyaId: v.id, acik: true })).durum, 403);
    for (const gun of [1, 2, 3, 4, 5]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun, vardiyaId: v.id, acik: true });
    let t = await takvim();
    assert.equal(t.isMerkezleri.find((m) => m.id === merkezA)?.haftalikDakika, 2250);
    assert.equal(await vt().tx((db) => calismaSuresi(db, merkezA, CARSAMBA)), 450);
    assert.equal(await vt().tx((db) => calismaSuresi(db, merkezA, '2099-10-10')), 0);
    // Aynı hücreyi ikinci kez açmak değiştirmez; kapatmak satırı kaldırır.
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 5, vardiyaId: v.id, acik: true });
    t = await tamam<TakvimCevabi>(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 5, vardiyaId: v.id, acik: false });
    assert.equal(t.isMerkezleri.find((m) => m.id === merkezA)?.haftalikDakika, 1800);
    assert.deepEqual(await vt().tx((db) => vardiyaMatrisi(db)), t.matris, 'dışarıya açılan okuma takvimin matrisidir');
    assert.equal((await istek(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: OLMAYAN_ID, gun: 1, vardiyaId: v.id, acik: true })).durum, 409);
    // Kısıtlı planlamacı kendi merkezine yazar, başkasına ve tesis geneline yazamaz.
    assert.equal((await istek(c.kisitli, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 6, vardiyaId: v.id, acik: true })).durum, 200);
    assert.equal((await istek(c.kisitli, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezB, gun: 6, vardiyaId: v.id, acik: true })).durum, 403);
    assert.equal((await istek(c.kisitli, 'POST', '/vardiyalar', { ad: 'Kısıtlı', baslangic: '08:00', bitis: '16:00', molalar: [] }, kimlikli())).durum, 403);
    assert.equal((await istek(c.kisitli, 'POST', '/takvim-gunleri', { tarih: '2099-05-05', tur: 'kapali' })).durum, 403);
    assert.equal((await istek(c.kisitli, 'POST', '/vardiya-matrisi/hafta-uygula', { kaynakIsMerkeziId: merkezA })).durum, 403);
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 6, vardiyaId: v.id, acik: false });
    for (const gun of [1, 2, 3, 4]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun, vardiyaId: v.id, acik: false });
  });

  test('VR-06: haftayı uygula kaynağın düzenini öbür aktif iş merkezlerine yazar, eskisini siler; pasif merkez ve kaynak değişmez', async () => {
    const v1 = await vardiyaAc();
    const v2 = await vardiyaAc({ baslangic: '16:00', bitis: '00:00' });
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 1, vardiyaId: v1.id, acik: true });
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 2, vardiyaId: v2.id, acik: true });
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezB, gun: 7, vardiyaId: v1.id, acik: true });
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezPasif, gun: 7, vardiyaId: v1.id, acik: true });
    assert.equal((await istek(c.operator, 'POST', '/vardiya-matrisi/hafta-uygula', { kaynakIsMerkeziId: merkezA })).durum, 403);
    assert.equal((await istek(c.planlama, 'POST', '/vardiya-matrisi/hafta-uygula', { kaynakIsMerkeziId: OLMAYAN_ID })).durum, 404);
    const t = await tamam<TakvimCevabi>(c.planlama, 'POST', '/vardiya-matrisi/hafta-uygula', { kaynakIsMerkeziId: merkezA });
    const satirlar = (im: number) => t.matris.filter((m) => m.isMerkeziId === im).map((m) => `${m.gun}:${m.vardiyaId}`).sort();
    assert.deepEqual(satirlar(merkezA), [`1:${v1.id}`, `2:${v2.id}`]);
    assert.deepEqual(satirlar(merkezB), [`1:${v1.id}`, `2:${v2.id}`]);
    assert.deepEqual(satirlar(merkezPasif), [`7:${v1.id}`]);
    for (const im of [merkezA, merkezB]) {
      await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 1, vardiyaId: v1.id, acik: false });
      await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 2, vardiyaId: v2.id, acik: false });
    }
  });

  test('VR-18: toplu yazım seçilen merkez ve günlere ekler, kaldırır, ayarlar; kapsam dışı merkez varsa hiçbiri yazılmaz', async () => {
    const v1 = await vardiyaAc();
    const v2 = await vardiyaAc({ baslangic: '16:00', bitis: '00:00' });
    const satirlar = (t: TakvimCevabi, im: number) => t.matris.filter((m) => m.isMerkeziId === im).map((m) => `${m.gun}:${m.vardiyaId}`).sort();
    const yaz = (cerez: string, govde: Record<string, unknown>) => istek<TakvimCevabi & { ayrinti?: unknown }>(cerez, 'POST', '/vardiya-matrisi/toplu-yaz', govde);
    const hafta = [1, 2, 3, 4, 5];
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/toplu-yaz', { isMerkeziIdleri: [merkezA, merkezB], gunler: [1, 2, 3, 4, 5, 6, 7], vardiyaIdleri: [], kip: 'ayarla' });
    assert.equal((await yaz(c.operator, { isMerkeziIdleri: [merkezA], gunler: hafta, vardiyaIdleri: [v1.id], kip: 'ekle' })).durum, 403);
    assert.equal((await yaz(c.planlama, { isMerkeziIdleri: [merkezA], gunler: hafta, vardiyaIdleri: [], kip: 'ekle' })).durum, 400);
    assert.equal((await yaz(c.planlama, { isMerkeziIdleri: [merkezA, merkezA], gunler: hafta, vardiyaIdleri: [v1.id], kip: 'ekle' })).durum, 400);
    assert.equal((await yaz(c.planlama, { isMerkeziIdleri: [OLMAYAN_ID], gunler: hafta, vardiyaIdleri: [v1.id], kip: 'ekle' })).durum, 400);
    assert.equal((await yaz(c.planlama, { isMerkeziIdleri: [merkezA], gunler: hafta, vardiyaIdleri: [OLMAYAN_ID], kip: 'ekle' })).durum, 409);

    let t = (await yaz(c.planlama, { isMerkeziIdleri: [merkezA, merkezB], gunler: hafta, vardiyaIdleri: [v1.id, v2.id], kip: 'ekle' })).govde;
    for (const im of [merkezA, merkezB]) assert.deepEqual(satirlar(t, im), hafta.flatMap((g) => [`${g}:${v1.id}`, `${g}:${v2.id}`]).sort());
    t = (await yaz(c.planlama, { isMerkeziIdleri: [merkezB], gunler: [5], vardiyaIdleri: [v2.id], kip: 'kaldir' })).govde;
    assert.equal(satirlar(t, merkezB).includes(`5:${v2.id}`), false);
    assert.equal(satirlar(t, merkezB).includes(`5:${v1.id}`), true);
    t = (await yaz(c.planlama, { isMerkeziIdleri: [merkezA], gunler: [1, 2], vardiyaIdleri: [v2.id], kip: 'ayarla' })).govde;
    assert.deepEqual(satirlar(t, merkezA).filter((s) => s.startsWith('1:') || s.startsWith('2:')), [`1:${v2.id}`, `2:${v2.id}`]);
    assert.equal(satirlar(t, merkezA).includes(`3:${v1.id}`), true, 'seçilmeyen gün değişmez');

    // Kısıtlı kişi kendi merkezine yazar; listede kapsam dışı merkez varsa 403 ve hiçbiri yazılmaz, reddedilen merkez ayrıntıda.
    await tamam(c.kisitli, 'POST', '/vardiya-matrisi/toplu-yaz', { isMerkeziIdleri: [merkezA], gunler: [6], vardiyaIdleri: [v1.id], kip: 'ekle' });
    const ret = await yaz(c.kisitli, { isMerkeziIdleri: [merkezA, merkezB], gunler: [7], vardiyaIdleri: [v1.id], kip: 'ekle' });
    assert.equal(ret.durum, 403);
    assert.deepEqual(ret.govde.ayrinti, { isMerkeziIdleri: [merkezB] });
    assert.equal((await takvim()).matris.some((m) => m.gun === 7 && m.vardiyaId === v1.id), false);

    await tamam(c.planlama, 'POST', '/vardiya-matrisi/toplu-yaz', { isMerkeziIdleri: [merkezA, merkezB], gunler: [1, 2, 3, 4, 5, 6, 7], vardiyaIdleri: [], kip: 'ayarla' });
    assert.deepEqual((await takvim()).matris.filter((m) => m.isMerkeziId === merkezA || m.isMerkeziId === merkezB), []);
  });

  test('VR-19: kopyala kaynağın haftasını yalnız seçilen merkezlere yazar; kaynak hedefte olamaz; kısıtlı yalnız kendi kapsamına', async () => {
    const v = await vardiyaAc();
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 2, vardiyaId: v.id, acik: true });
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezPasif, gun: 6, vardiyaId: v.id, acik: true });
    const kopyala = (cerez: string, govde: Record<string, unknown>) => istek<TakvimCevabi & { ayrinti?: unknown }>(cerez, 'POST', '/vardiya-matrisi/kopyala', govde);
    assert.equal((await kopyala(c.operator, { kaynakIsMerkeziId: merkezA, hedefIsMerkeziIdleri: [merkezB] })).durum, 403);
    assert.equal((await kopyala(c.planlama, { kaynakIsMerkeziId: merkezA, hedefIsMerkeziIdleri: [merkezA] })).durum, 400);
    assert.equal((await kopyala(c.planlama, { kaynakIsMerkeziId: OLMAYAN_ID, hedefIsMerkeziIdleri: [merkezB] })).durum, 404);
    const ret = await kopyala(c.kisitli, { kaynakIsMerkeziId: merkezA, hedefIsMerkeziIdleri: [merkezB] });
    assert.equal(ret.durum, 403);
    assert.deepEqual(ret.govde.ayrinti, { isMerkeziIdleri: [merkezB] });
    const t = (await kopyala(c.planlama, { kaynakIsMerkeziId: merkezA, hedefIsMerkeziIdleri: [merkezB] })).govde;
    assert.deepEqual(t.matris.filter((m) => m.isMerkeziId === merkezB).map((m) => `${m.gun}:${m.vardiyaId}`), [`2:${v.id}`]);
    assert.deepEqual(t.matris.filter((m) => m.isMerkeziId === merkezPasif && m.vardiyaId === v.id).map((m) => `${m.gun}:${m.vardiyaId}`), [`6:${v.id}`], 'seçilmeyen merkez değişmez');
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/toplu-yaz', { isMerkeziIdleri: [merkezA, merkezB, merkezPasif], gunler: [1, 2, 3, 4, 5, 6, 7], vardiyaIdleri: [], kip: 'ayarla' });
  });

  test('VR-20: kişi vardiyası toplu belirlenir ve kaldırılır; kapsam dışı kişi varsa hiçbiri yazılmaz', async () => {
    const v = await vardiyaAc();
    const personel = kisiler['personel']!;
    const bosta = kisiler['bosta']!;
    const belirle = (cerez: string, govde: Record<string, unknown>) => istek<TakvimCevabi & { ayrinti?: unknown }>(cerez, 'POST', '/kisi-vardiyalari/toplu-belirle', govde);
    const vardiyasi = (t: TakvimCevabi, k: number) => t.kisiVardiyalari.find((x) => x.kisiId === k)?.vardiyaId ?? null;
    assert.equal((await belirle(c.operator, { kisiIdleri: [personel], vardiyaId: v.id })).durum, 403);
    assert.equal((await belirle(c.planlama, { kisiIdleri: [], vardiyaId: v.id })).durum, 400);
    assert.equal((await belirle(c.planlama, { kisiIdleri: [OLMAYAN_ID], vardiyaId: v.id })).durum, 409);
    // Kısıtlı (yalnız A): personel B'de, bosta iş merkezsiz. İkisi birlikte reddedilir, bosta da yazılmaz.
    const ret = await belirle(c.kisitli, { kisiIdleri: [bosta, personel], vardiyaId: v.id });
    assert.equal(ret.durum, 403);
    assert.deepEqual(ret.govde.ayrinti, { kisiIdleri: [personel] });
    assert.equal(vardiyasi(await takvim(), bosta), null);
    assert.equal(vardiyasi((await belirle(c.kisitli, { kisiIdleri: [bosta], vardiyaId: v.id })).govde, bosta), v.id);
    let t = (await belirle(c.planlama, { kisiIdleri: [bosta, personel], vardiyaId: v.id })).govde;
    assert.equal(vardiyasi(t, personel), v.id);
    t = (await belirle(c.planlama, { kisiIdleri: [bosta, personel], vardiyaId: null })).govde;
    assert.equal(vardiyasi(t, personel), null);
    assert.equal(vardiyasi(t, bosta), null);
  });

  test('kisiVardiyalari (dışarı): takvim ekranının okumasıyla aynı; reddedilen yazım okumaya yansımaz; vardiyası kaldırılan kişi listede yok', async () => {
    const v = await vardiyaAc();
    const personel = kisiler['personel']!;
    const okunan = () => vt().tx((db) => kisiVardiyalari(db));
    assert.equal((await istek(c.operator, 'POST', `/kisi-vardiyalari/${personel}/belirle`, { vardiyaId: v.id })).durum, 403);
    assert.equal((await okunan()).find((k) => k.kisiId === personel), undefined);
    const t = await tamam<TakvimCevabi>(c.planlama, 'POST', `/kisi-vardiyalari/${personel}/belirle`, { vardiyaId: v.id });
    assert.deepEqual(await okunan(), t.kisiVardiyalari);
    assert.deepEqual((await okunan()).find((k) => k.kisiId === personel), { kisiId: personel, vardiyaId: v.id });
    await tamam(c.planlama, 'POST', `/kisi-vardiyalari/${personel}/belirle`, { vardiyaId: null });
    assert.equal((await okunan()).find((k) => k.kisiId === personel), undefined);
  });

  test('VR-02, VR-03, VR-10, VR-28: kapalı gün o günü kapatır; geçmiş tarih ayrı yetki ister; temizle geçmişi yalnız yetkiliyle siler; tatil İK\'dan gelir', async () => {
    const v = await vardiyaAc();
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 3, vardiyaId: v.id, acik: true });
    assert.equal(await vt().tx((db) => calismaSuresi(db, merkezA, CARSAMBA)), 480);
    const t = await tamam<TakvimCevabi>(c.planlama, 'POST', '/takvim-gunleri', { tarih: CARSAMBA, tur: 'kapali', ad: 'Deneme' });
    assert.deepEqual(t.gunler.find((g) => g.tarih === CARSAMBA), { tarih: CARSAMBA, tur: 'kapali', ad: 'Deneme' });
    assert.equal(await vt().tx((db) => calismaSuresi(db, merkezA, CARSAMBA)), 0);
    // VR-28: Vardiya tatil yazamaz; İK'nın tatili (her yıl 29 Ekim) takvimde tatildir, buradan kaldırılmaz.
    await vt().tx(async (db) => {
      await db.sorgu("INSERT INTO ik_genel_ayar (anahtar, guncelleyen_kisi_id) VALUES ('genel', $1)", [yoneticiId]);
      await db.sorgu("INSERT INTO ik_resmi_tatil (sira, yil, ay, gun, ad) VALUES (1, NULL, 10, 29, 'Cumhuriyet Bayramı')");
    });
    assert.equal((await istek(c.planlama, 'POST', '/takvim-gunleri', { tarih: '2099-10-09', tur: 'tatil', ad: 'Deneme' })).durum, 400);
    assert.equal((await istek(c.planlama, 'POST', '/takvim-gunleri/resmi-tatiller', { yil: 2099 })).durum, 404);
    assert.equal(await vt().tx((db) => calismaSuresi(db, merkezA, IK_TATILI)), 0, 'İK tatili (çarşamba) o günü kapatır');
    const takvim = await vt().tx((db) => calismaTakvimleri(db, [{ tur: 'is-merkezi', id: merkezA }], { baslangic: IK_TATILI, bitis: IK_TATILI }));
    assert.deepEqual(takvim.get(`is-merkezi:${merkezA}`)?.gunler, [{ tarih: IK_TATILI, dakika: 0, kapali: { tur: 'tatil', ad: 'Cumhuriyet Bayramı' } }]);
    assert.equal((await istek(c.planlama, 'POST', `/takvim-gunleri/${IK_TATILI}/kaldir`)).durum, 404);
    assert.equal((await istek(c.operator, 'POST', '/takvim-gunleri', { tarih: '2099-10-08', tur: 'kapali' })).durum, 403);
    assert.equal((await istek(c.planlama, 'POST', '/takvim-gunleri', { tarih: '2000-01-03', tur: 'kapali' })).durum, 403);
    assert.equal((await istek(c.yonetici, 'POST', '/takvim-gunleri', { tarih: '2000-01-03', tur: 'kapali' })).durum, 200);
    assert.equal((await istek(c.planlama, 'POST', '/takvim-gunleri/2000-01-03/kaldir')).durum, 403);
    assert.equal((await istek(c.planlama, 'POST', '/takvim-gunleri/2099-12-30/kaldir')).durum, 404);
    assert.equal((await istek(c.planlama, 'POST', `/takvim-gunleri/${CARSAMBA}/kaldir`)).durum, 200);
    await tamam(c.planlama, 'POST', '/takvim-gunleri', { tarih: '2099-10-14', tur: 'kapali' });
    assert.equal((await istek(c.operator, 'POST', '/takvim-gunleri/temizle')).durum, 403);
    const kapalilar = (r: TakvimCevabi): string[] => r.gunler.filter((g) => g.kaynak !== 'ik').map((g) => g.tarih);
    const p = await tamam<TakvimCevabi>(c.planlama, 'POST', '/takvim-gunleri/temizle');
    assert.deepEqual(kapalilar(p), ['2000-01-03']);
    const y = await tamam<TakvimCevabi>(c.yonetici, 'POST', '/takvim-gunleri/temizle');
    assert.deepEqual(kapalilar(y), []);
    assert.ok(y.gunler.length > 0 && y.gunler.every((g) => g.kaynak === 'ik'), 'İK tatilleri temizlenmez');
    // 142'den önce Vardiya'ya girilmiş tatil satırı tatil kalır (planlama yalnız tatili tatil sayar) ve Vardiya'dan silinir.
    await vt().tx(async (db) => { await db.sorgu("INSERT INTO vardiya_takvim_gunu (tarih, tur, ad) VALUES ('2099-10-21', 'tatil', 'Eski')"); });
    assert.deepEqual((await tamam<TakvimCevabi>(c.planlama, 'GET', '/vardiya-takvimi')).gunler.find((g) => g.tarih === '2099-10-21'), { tarih: '2099-10-21', tur: 'tatil', ad: 'Eski' });
    const eski = await vt().tx((db) => calismaTakvimleri(db, [{ tur: 'is-merkezi', id: merkezA }], { baslangic: '2099-10-21', bitis: '2099-10-21' }));
    assert.deepEqual(eski.get(`is-merkezi:${merkezA}`)?.gunler, [{ tarih: '2099-10-21', dakika: 0, kapali: { tur: 'tatil', ad: 'Eski' } }]);
    assert.equal((await istek(c.planlama, 'POST', '/takvim-gunleri/2099-10-21/kaldir')).durum, 200);
    await vt().tx(async (db) => { await db.sorgu('DELETE FROM ik_resmi_tatil'); await db.sorgu('DELETE FROM ik_genel_ayar'); });
    // Stüdyonun canlıya alması aynı kuralla yazar (disari).
    await vt().tx(async (db) => {
      await assert.rejects(gunYaz(db, { id: kisiler['planlama']!, ad: 'Deneme', islemler: ['vardiya.yaz'] }, { tarih: '2000-02-01', tur: 'kapali' }), /yetkin yok/);
    });
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 3, vardiyaId: v.id, acik: false });
  });

  test('VR-07, VR-08 (K3): kaynak takvimi iş merkezinden okunur; kişi yalnız kendi vardiyasında; bağlanamayan kaynak null', async () => {
    const gunduz = await vardiyaAc({ molalar: [{ baslangic: '12:00', bitis: '12:30' }] });
    const gece = await vardiyaAc({ baslangic: '22:00', bitis: '06:00' });
    for (const [im, v] of [[merkezA, gunduz], [merkezB, gunduz], [merkezB, gece]] as const) {
      await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 3, vardiyaId: v.id, acik: true });
    }
    const oku = (tur: string, id: number, baslangic = CARSAMBA, bitis = CARSAMBA) =>
      istek<CalismaTakvimiCevabi>(c.planlama, 'GET', `/calisma-takvimi?tur=${tur}&id=${id}&baslangic=${baslangic}&bitis=${bitis}`);
    const sureler = (a: { baslangic: string; bitis: string }[]) => a.map((x) => (Date.parse(x.bitis) - Date.parse(x.baslangic)) / 60_000);

    const makine = (await oku('makine', makineA)).govde.takvim!;
    assert.equal(makine.isMerkeziId, merkezA);
    assert.deepEqual(makine.gunler, [{ tarih: CARSAMBA, dakika: 450, kapali: null }]);
    assert.deepEqual(sureler(makine.araliklar), [240, 210]);
    assert.match(makine.araliklar[0]!.baslangic, /T08:00:00/);
    assert.equal(Date.parse(makine.araliklar[1]!.baslangic) - Date.parse(makine.araliklar[0]!.bitis), 30 * 60_000);

    // Kişi B merkezindedir (en büyük yüzde); vardiyası yokken iki vardiya, gece vardiyası seçilince yalnız o.
    let kisi = (await oku('kisi', kisiler['personel']!)).govde.takvim!;
    assert.equal(kisi.isMerkeziId, merkezB);
    assert.equal(kisi.gunler[0]!.dakika, 450 + 480);
    assert.equal((await istek(c.operator, 'POST', `/kisi-vardiyalari/${kisiler['personel']!}/belirle`, { vardiyaId: gece.id })).durum, 403);
    assert.equal((await istek(c.kisitli, 'POST', `/kisi-vardiyalari/${kisiler['personel']!}/belirle`, { vardiyaId: gece.id })).durum, 403);
    assert.equal((await istek(c.planlama, 'POST', `/kisi-vardiyalari/${OLMAYAN_ID}/belirle`, { vardiyaId: gece.id })).durum, 409);
    const t = await tamam<TakvimCevabi>(c.planlama, 'POST', `/kisi-vardiyalari/${kisiler['personel']!}/belirle`, { vardiyaId: gece.id });
    assert.deepEqual(t.kisiVardiyalari, [{ kisiId: kisiler['personel']!, vardiyaId: gece.id }]);
    // Tek tanım: kişi atandığı her iş merkezinde (A %30, B %70) yalnız kendi vardiyasında sayılır; çalışan makine arızada ya da bakımda olmayandır.
    assert.deepEqual(t.kadro.filter((k) => k.kisiIdleri.includes(kisiler['personel']!)).map((k) => [k.isMerkeziId, k.vardiyaId]), [[merkezA, gece.id], [merkezB, gece.id]]);
    assert.equal((await vt().tx((db) => calisirMakineSayilari(db))).get(merkezA), 1);
    // Vardiya başına personel: atanmış kişi iş merkezi ve vardiyasıyla görünür; ataması olmayan görünmez; sayfası olmayan okuyamaz.
    const p = await tamam<VardiyaPersoneliCevabi>(c.planlama, 'GET', '/vardiya-personeli');
    assert.deepEqual(p.personel, [{ kisiId: kisiler['personel']!, ad: 'Deneme personel', istasyonId: istasyonB, isMerkeziId: merkezB, vardiyaId: gece.id }]);
    assert.equal((await istek(c.operator, 'GET', '/vardiya-personeli')).durum, 403);
    // Günlük mesai: aynı kişiler, o gün başlayan vardiya; gece vardiyası ertesi sabaha taşar, ertesi günün satırına girmez.
    // Mesai sayfası olmayan okuyamaz.
    const mesai = await tamam<GunlukMesaiCevabi>(c.planlama, 'GET', `/gunluk-mesai?tarih=${CARSAMBA}`);
    assert.equal(mesai.tarih, CARSAMBA);
    assert.deepEqual(mesai.satirlar.map((m) => [m.kisiId, m.isMerkeziId, m.vardiyaId, m.plan?.dakika, m.plan?.kapali]), [[kisiler['personel']!, merkezB, gece.id, 480, null]]);
    assert.deepEqual(sureler(mesai.satirlar[0]!.plan!.araliklar), [480]);
    assert.match(mesai.satirlar[0]!.plan!.araliklar[0]!.baslangic, /T22:00:00/);
    const ertesi = await tamam<GunlukMesaiCevabi>(c.planlama, 'GET', '/gunluk-mesai?tarih=2099-10-08');
    assert.deepEqual(ertesi.satirlar.map((m) => m.plan), [{ dakika: 0, kapali: null, araliklar: [] }]);
    assert.equal((await istek(c.operator, 'GET', `/gunluk-mesai?tarih=${CARSAMBA}`)).durum, 403);
    assert.equal((await istek(c.planlama, 'GET', '/gunluk-mesai?tarih=2099-13-40')).durum, 400);
    kisi = (await oku('kisi', kisiler['personel']!)).govde.takvim!;
    assert.equal(kisi.vardiyaId, gece.id);
    assert.equal(kisi.gunler[0]!.dakika, 480);
    // Tek günlük okumada gece vardiyası gün sonunda kesilir (22:00-24:00); iki günlükte ertesi sabaha taşar.
    assert.deepEqual(sureler(kisi.araliklar), [120]);
    assert.deepEqual(sureler((await oku('kisi', kisiler['personel']!, CARSAMBA, '2099-10-08')).govde.takvim!.araliklar), [480]);
    // Arkon gün kaydı: gece vardiyası başladığı günün kaydıdır (ertesi sabaha kadar tek parça, bitiş ertesi gün 06:00); ertesi günün
    // kaydına önceki günden taşan kısım girmez.
    const basladigi = (k: { tur: 'kisi' | 'makine' | 'istasyon'; id: number }, tarih: string) => vt().tx((db) => basladigiGunTakvimi(db, k, tarih));
    const geceGunu = (await basladigi({ tur: 'kisi', id: kisiler['personel']! }, CARSAMBA))!;
    assert.deepEqual(sureler(geceGunu.araliklar), [480]);
    assert.match(geceGunu.araliklar[0]!.baslangic, /^2099-10-07T22:00:00/);
    assert.equal(geceGunu.bitis, geceGunu.araliklar[0]!.bitis);
    assert.match(geceGunu.bitis!, /^2099-10-08T06:00:00/);
    assert.deepEqual(await basladigi({ tur: 'kisi', id: kisiler['personel']! }, '2099-10-08'), { araliklar: [], molalar: [], bitis: null });
    // İki vardiyalı istasyon: gündüzün molası düşülür, bitiş son vardiyanın bitişidir.
    const ikiVardiya = (await basladigi({ tur: 'istasyon', id: istasyonB }, CARSAMBA))!;
    assert.deepEqual(sureler(ikiVardiya.araliklar), [240, 210, 480]);
    assert.match(ikiVardiya.bitis!, /^2099-10-08T06:00:00/);
    assert.equal(await basladigi({ tur: 'makine', id: makineBos }, CARSAMBA), null);
    // Toplu okuma tekliyle aynı: kaynak x gün, tek turda; bağlanamayan kaynak null.
    const toplu = await vt().tx((db) => basladigiGunTakvimleri(db, [{ tur: 'kisi', id: kisiler['personel']! }, { tur: 'istasyon', id: istasyonB }, { tur: 'makine', id: makineBos }],
      { baslangic: '2099-10-06', bitis: '2099-10-08' }));
    const kisiGunleri = toplu.get(`kisi:${kisiler['personel']!}`)!;
    assert.deepEqual([...kisiGunleri.keys()], ['2099-10-06', CARSAMBA, '2099-10-08']);
    assert.deepEqual(kisiGunleri.get(CARSAMBA), geceGunu);
    assert.deepEqual(kisiGunleri.get('2099-10-08'), { araliklar: [], molalar: [], bitis: null });
    assert.deepEqual(toplu.get(`istasyon:${istasyonB}`)!.get(CARSAMBA), ikiVardiya);
    assert.equal(toplu.get(`makine:${makineBos}`), null);

    // Tatil o gün başlayan vardiyayı kaldırır ve günü işaretler.
    await tamam(c.planlama, 'POST', '/takvim-gunleri', { tarih: CARSAMBA, tur: 'kapali', ad: null });
    const kapali = (await oku('istasyon', istasyonA)).govde.takvim!;
    assert.deepEqual(kapali.gunler, [{ tarih: CARSAMBA, dakika: 0, kapali: { tur: 'kapali', ad: null } }]);
    assert.deepEqual(kapali.araliklar, []);
    assert.deepEqual(await vt().tx((db) => basladigiGunTakvimi(db, { tur: 'istasyon', id: istasyonA }, CARSAMBA)), { araliklar: [], molalar: [], bitis: null });
    await tamam(c.planlama, 'POST', `/takvim-gunleri/${CARSAMBA}/kaldir`);

    assert.equal((await oku('makine', makineBos)).govde.takvim, null);
    assert.equal((await oku('kisi', kisiler['bosta']!)).govde.takvim, null);
    assert.equal((await oku('is-merkezi', OLMAYAN_ID)).govde.takvim, null);
    assert.equal((await oku('makine', makineA, '2099-10-08', CARSAMBA)).durum, 400);
    assert.equal((await oku('makine', makineA, '2099-01-01', '2100-01-05')).durum, 400);

    // Plan tek okumada birden çok kaynağı alır; yinelenen kaynak tek kayıttır.
    const harita = await vt().tx((db) => calismaTakvimleri(db, [{ tur: 'makine', id: makineA }, { tur: 'makine', id: makineA }, { tur: 'makine', id: makineBos }],
      { baslangic: CARSAMBA, bitis: CARSAMBA }));
    assert.deepEqual([...harita.keys()], [`makine:${makineA}`, `makine:${makineBos}`]);
    assert.equal(harita.get(`makine:${makineBos}`), null);

    await tamam(c.planlama, 'POST', `/kisi-vardiyalari/${kisiler['personel']!}/belirle`, { vardiyaId: null });
    for (const [im, v] of [[merkezA, gunduz], [merkezB, gunduz], [merkezB, gece]] as const) {
      await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 3, vardiyaId: v.id, acik: false });
    }
  });

  test('soru 30: istasyon ataması olmayan kişi takvimi makine ya da ekip atamasının istasyonundan alır; istasyon ataması öncelikli', async () => {
    const kisi = async (ad: string) => vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA }));
    const [makineci, ekipci, karma] = [await kisi('vr-makineci'), await kisi('vr-ekipci'), await kisi('vr-karma')];
    const ekip = (await tamam<{ id: number }>(c.yonetici, 'POST', '/ekipler', { kod: 'VR-EK', ad: 'Deneme ekip', istasyonId: istasyonB })).id;
    await tamam(c.yonetici, 'POST', `/makineler/${makineA}/kisiler/ata`, { kisiId: makineci, yuzde: '60.00' });
    await tamam(c.yonetici, 'POST', `/ekipler/${ekip}/uyeler/ata`, { kisiId: ekipci, yuzde: '100.00' });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${istasyonA}/kisiler/ata`, { kisiId: karma, yuzde: '40.00' });
    await tamam(c.yonetici, 'POST', `/ekipler/${ekip}/uyeler/ata`, { kisiId: karma, yuzde: '60.00' });

    const harita = await vt().tx((db) => calismaTakvimleri(db, [makineci, ekipci, karma].map((id) => ({ tur: 'kisi' as const, id })),
      { baslangic: CARSAMBA, bitis: CARSAMBA }));
    const ozet = (id: number) => { const t = harita.get(`kisi:${id}`); return t ? [t.isMerkeziId, t.yuzde] : null; };
    assert.deepEqual(ozet(makineci), [merkezA, 0.6], 'makine ataması: makinenin istasyonunun merkezi, pay atamadan');
    assert.deepEqual(ozet(ekipci), [merkezB, 1], 'ekip ataması: ekibin istasyonunun merkezi');
    assert.deepEqual(ozet(karma), [merkezA, 0.4], 'istasyon ataması olan kişide bugünkü davranış değişmez');
    assert.equal(harita.get(`kisi:${kisiler['bosta']!}`) ?? null, null);
    assert.equal((await vt().tx((db) => calismaTakvimleri(db, [{ tur: 'kisi', id: kisiler['bosta']! }], { baslangic: CARSAMBA, bitis: CARSAMBA }))).get(`kisi:${kisiler['bosta']!}`), null,
      'hiç ataması olmayan kişi null kalır');
  });

  test('toplu takvim okuması tek tek okumayla aynıdır; sorgu sayısı makine, istasyon, iş merkezi ve kişi sayısıyla büyümez', async (t) => {
    const v = await vardiyaAc({ baslangic: '22:00', bitis: '06:00', molalar: [{ baslangic: '02:00', bitis: '02:30' }] });
    await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 3, vardiyaId: v.id, acik: true });
    t.after(() => tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 3, vardiyaId: v.id, acik: false }));
    const makineB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'VR-MC', ad: 'Deneme makine C', istasyonId: istasyonB })).id;
    // Pasif makine de takvimini istasyonundan alır.
    const pasif = await tamam<{ id: number; surum: number }>(c.yonetici, 'POST', '/makineler', { kod: 'VR-MP', ad: 'Deneme pasif makine', istasyonId: istasyonA });
    await tamam(c.yonetici, 'POST', `/makineler/${pasif.id}/guncelle`, { kod: 'VR-MP', ad: 'Deneme pasif makine', istasyonId: istasyonA, aktif: false, surum: pasif.surum });
    const aralik = { baslangic: CARSAMBA, bitis: '2099-10-08' };
    const kaynaklar = [
      { tur: 'makine', id: makineA }, { tur: 'makine', id: makineB }, { tur: 'makine', id: pasif.id }, { tur: 'makine', id: makineBos },
      { tur: 'istasyon', id: istasyonA }, { tur: 'istasyon', id: istasyonB }, { tur: 'is-merkezi', id: merkezA }, { tur: 'is-merkezi', id: merkezB },
      { tur: 'kisi', id: kisiler['personel']! }, { tur: 'makine', id: OLMAYAN_ID },
    ] as const;
    const toplu = await vt().tx((db) => calismaTakvimleri(db, kaynaklar, aralik));
    for (const k of kaynaklar) {
      const anahtar = `${k.tur}:${k.id}`;
      assert.deepEqual(toplu.get(anahtar), (await vt().tx((db) => calismaTakvimleri(db, [k], aralik))).get(anahtar), anahtar);
    }
    assert.equal(toplu.get(`makine:${pasif.id}`)?.gunler[0]?.dakika, 480 - 30);
    assert.equal(toplu.get(`makine:${OLMAYAN_ID}`), null);

    const sorguSayisi = async (liste: readonly { tur: 'makine' | 'istasyon' | 'is-merkezi' | 'kisi'; id: number }[]): Promise<number> => {
      let n = 0;
      await vt().tx((db) => calismaTakvimleri({
        sorgu: (sql, p) => { n += 1; return db.sorgu(sql, p); },
        tek: (sql, p) => { n += 1; return db.tek(sql, p); },
      }, liste, aralik));
      return n;
    };
    assert.equal(
      await sorguSayisi([{ tur: 'makine', id: makineA }, { tur: 'istasyon', id: istasyonA }]),
      await sorguSayisi([
        { tur: 'makine', id: makineA }, { tur: 'makine', id: makineB }, { tur: 'makine', id: makineBos }, { tur: 'istasyon', id: istasyonA },
        { tur: 'istasyon', id: istasyonB }, { tur: 'is-merkezi', id: merkezA }, { tur: 'is-merkezi', id: merkezB },
      ]),
    );
    // Kişinin izinleri İK'dan bütün kişiler için tek okumada gelir (yük testi 2026-10-18; önceden kişi başına iki sorgu).
    const kisiKaynaklari = Object.values(kisiler).map((id) => ({ tur: 'kisi' as const, id }));
    assert.ok(kisiKaynaklari.length >= 3);
    assert.equal(await sorguSayisi(kisiKaynaklari.slice(0, 1)), await sorguSayisi(kisiKaynaklari));
  });

  describe('planlı duruş (kart #519)', () => {
    let planliNeden = 0;
    let plansizNeden = 0;
    const PERSEMBE = '2099-10-08';
    const zaman = (tarih: string, saat: string) => `${tarih}T${saat}:00+03:00`;
    const govde = (alanlar: Record<string, unknown> = {}) => ({
      baslik: 'Bakım', durusNedeniId: planliNeden, kapsam: 'istasyon', istasyonId: istasyonA,
      baslangic: zaman(PERSEMBE, '10:00'), bitis: zaman(PERSEMBE, '11:00'), ...alanlar,
    });
    const ac = async (cerez: string, alanlar: Record<string, unknown> = {}) =>
      istek<PlanliDurusCevabi & { kod?: string; alan?: string }>(cerez, 'POST', '/planli-duruslar', govde(alanlar), kimlikli());
    const kaldir = async (id: number) => {
      const liste = await tamam<PlanliDurusListeCevabi>(c.operator, 'GET', '/planli-duruslar?sayfaBoyu=200');
      const d = liste.satirlar.find((x) => x.id === id)!;
      await tamam(c.planlama, 'POST', `/planli-duruslar/${id}/kaldir`, { surum: d.surum });
    };

    before(async () => {
      const nedenler = (await tamam<DurusNedenleriCevabi>(c.yonetici, 'GET', '/durus-nedenleri')).nedenler;
      planliNeden = nedenler.find((n) => n.kategori === 'planli' && n.aktif)!.id;
      plansizNeden = nedenler.find((n) => n.kategori === 'plansiz')!.id;
    });

    test('VR-11, VR-12, VR-14: planlama açar, operatör açamaz; hedef, süre, tekrar ve neden kuralları sunucuda; yazan ve zaman sunucudan', async () => {
      assert.equal((await ac(c.operator)).durum, 403);
      assert.equal((await istek(c.planlama, 'POST', '/planli-duruslar', govde())).durum, 400);
      for (const [alanlar, alan] of [
        [{ istasyonId: null }, 'istasyonId'],
        [{ kapsam: 'tesis' }, 'kapsam'],
        [{ bitis: zaman(PERSEMBE, '09:00') }, 'bitis'],
        [{ tekrar: 'gunluk', bitis: zaman('2099-10-09', '10:00') }, 'bitis'],
        [{ tekrar: 'haftalik', gunler: [] }, 'gunler'],
        [{ durusNedeniId: plansizNeden }, 'durusNedeniId'],
        [{ durusNedeniId: OLMAYAN_ID }, 'durusNedeniId'],
      ] as const) {
        const cevap = await ac(c.planlama, alanlar);
        assert.equal(cevap.durum, 400, JSON.stringify(alanlar));
        assert.equal(cevap.govde.alan, alan, JSON.stringify(cevap.govde));
      }
      assert.equal((await ac(c.planlama, { istasyonId: OLMAYAN_ID })).durum, 400);
      const cevap = await ac(c.planlama, { aciklama: '  Yağ değişimi  ' });
      assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
      const d = cevap.govde.durus;
      assert.deepEqual([d.kapsam, d.istasyonId, d.isMerkeziId, d.tekrar, d.gunler, d.aciklama, d.surum, d.yazan], ['istasyon', istasyonA, null, 'yok', [], 'Yağ değişimi', 1, 'Deneme planlama']);
      assert.equal(Date.parse(d.baslangic), Date.parse(zaman(PERSEMBE, '10:00')));
      // Okuma oturumla açıktır.
      const liste = await tamam<PlanliDurusListeCevabi>(c.operator, 'GET', '/planli-duruslar');
      assert.ok(liste.satirlar.some((x) => x.id === d.id));
      await kaldir(d.id);
    });

    test('VR-13: kısıtlı kişi kendi iş merkezinde yazar; başka merkez ve tesis geneli reddedilir; sürüm ve kaldırma', async () => {
      assert.equal((await ac(c.kisitli, { istasyonId: istasyonB })).durum, 403);
      assert.equal((await ac(c.kisitli, { kapsam: 'is-merkezi', istasyonId: null, isMerkeziId: merkezB })).durum, 403);
      assert.equal((await ac(c.kisitli, { kapsam: 'tesis', istasyonId: null })).durum, 403);
      const d = (await ac(c.kisitli)).govde.durus;
      assert.equal(d.istasyonId, istasyonA);
      // Kısıtlı kişi kendi kaydını başka merkeze taşıyamaz; kendi merkezinde değiştirir.
      assert.equal((await istek(c.kisitli, 'POST', `/planli-duruslar/${d.id}/guncelle`, { ...govde({ istasyonId: istasyonB }), surum: d.surum })).durum, 403);
      const yeni = (await tamam<PlanliDurusCevabi>(c.kisitli, 'POST', `/planli-duruslar/${d.id}/guncelle`, { ...govde({ baslik: 'Toplantı' }), surum: d.surum })).durus;
      assert.deepEqual([yeni.baslik, yeni.surum], ['Toplantı', 2]);
      const eski = await istek<{ ayrinti?: { neden?: string } }>(c.planlama, 'POST', `/planli-duruslar/${d.id}/guncelle`, { ...govde(), surum: d.surum });
      assert.equal(eski.durum, 409);
      assert.equal(eski.govde.ayrinti?.neden, 'eski-surum');
      assert.equal((await istek(c.planlama, 'POST', `/planli-duruslar/${d.id}/kaldir`, { surum: d.surum })).durum, 409);
      assert.equal((await istek(c.operator, 'POST', `/planli-duruslar/${d.id}/kaldir`, { surum: yeni.surum })).durum, 403);
      await tamam(c.planlama, 'POST', `/planli-duruslar/${d.id}/kaldir`, { surum: yeni.surum });
      assert.equal((await istek(c.planlama, 'POST', `/planli-duruslar/${d.id}/kaldir`, { surum: yeni.surum })).durum, 404);
      assert.equal((await istek(c.planlama, 'POST', `/planli-duruslar/${OLMAYAN_ID}/guncelle`, { ...govde(), surum: 1 })).durum, 404);
    });

    test('VR-15: duruş kaynağın çalışma aralığından ve gün dakikasından düşer; istasyon duruşu merkezi ve kişiyi etkilemez', async () => {
      const v = await vardiyaAc({ molalar: [{ baslangic: '12:00', bitis: '12:30' }] });
      for (const im of [merkezA, merkezB]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 4, vardiyaId: v.id, acik: true });
      const oku = async (tur: string, id: number) =>
        (await tamam<CalismaTakvimiCevabi>(c.planlama, 'GET', `/calisma-takvimi?tur=${tur}&id=${id}&baslangic=${PERSEMBE}&bitis=${PERSEMBE}`)).takvim!;
      const sureler = (a: { baslangic: string; bitis: string }[]) => a.map((x) => (Date.parse(x.bitis) - Date.parse(x.baslangic)) / 60_000);
      assert.deepEqual(sureler((await oku('makine', makineA)).araliklar), [240, 210]);

      const istasyonDurusu = (await ac(c.planlama)).govde.durus;
      let makine = await oku('makine', makineA);
      assert.deepEqual(sureler(makine.araliklar), [120, 60, 210]);
      assert.equal(makine.gunler[0]!.dakika, 390);
      assert.equal((await oku('istasyon', istasyonA)).gunler[0]!.dakika, 390);
      assert.equal((await oku('is-merkezi', merkezA)).gunler[0]!.dakika, 450);
      assert.equal(await vt().tx((db) => calismaSuresi(db, merkezA, PERSEMBE)), 450);
      assert.equal((await oku('kisi', kisiler['personel']!)).gunler[0]!.dakika, 450);

      // Tesis geneli günlük tekrar (15:00-15:30) her kaynakta düşer; pasif duruş düşmez.
      const tesis = (await ac(c.planlama, {
        kapsam: 'tesis', istasyonId: null, baslangic: zaman(CARSAMBA, '15:00'), bitis: zaman(CARSAMBA, '15:30'), tekrar: 'gunluk',
      })).govde.durus;
      makine = await oku('makine', makineA);
      assert.equal(makine.gunler[0]!.dakika, 360);
      assert.equal((await oku('is-merkezi', merkezB)).gunler[0]!.dakika, 420);
      assert.equal(await vt().tx((db) => calismaSuresi(db, merkezB, PERSEMBE)), 420);
      await tamam(c.planlama, 'POST', `/planli-duruslar/${tesis.id}/guncelle`, { ...govde({
        kapsam: 'tesis', istasyonId: null, baslangic: zaman(CARSAMBA, '15:00'), bitis: zaman(CARSAMBA, '15:30'), tekrar: 'gunluk', aktif: false,
      }), surum: tesis.surum });
      assert.equal((await oku('is-merkezi', merkezB)).gunler[0]!.dakika, 450);

      await kaldir(istasyonDurusu.id);
      await kaldir(tesis.id);
      for (const im of [merkezA, merkezB]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 4, vardiyaId: v.id, acik: false });
    });

    test('VR-16: Arkon yazımı işlem ister; kaynak kimliğiyle yinelenen yazım tek kayıttır; Arkon sürümü kilitten sonra denetlenir', async () => {
      const kullanici = async (ad: string) => (await vt().tx((db) => kullaniciYukle(db, kisiler[ad] ?? yoneticiId)))!;
      const planlama = await kullanici('planlama');
      const operator = await kullanici('operator');
      const g = { ...govde(), baslangic: zaman(PERSEMBE, '10:00'), bitis: zaman(PERSEMBE, '11:00') };
      const girdi = {
        baslik: 'Arkon', durusNedeniId: planliNeden, kapsam: 'istasyon' as const, isMerkeziId: null, istasyonId: istasyonA, baslangic: g.baslangic,
        bitis: g.bitis, tekrar: 'yok' as const, gunler: [], tekrarBitis: null, aciklama: null, aktif: true,
      };
      const hep = { guncelMi: () => true };
      const yazilan = (s: ArkonDurusSonucu) => (s.sonuc === 'yazildi' && s.kayit !== null ? s.kayit : assert.fail(`yazılmadı: ${s.sonuc}`));
      await assert.rejects(vt().tx((db) => planliDurusYaz(db, operator, { id: null, kaynakKimligi: 'dn-1', ...hep }, girdi)), { kod: 'YETKI_YOK' });
      const ilk = yazilan(await vt().tx((db) => planliDurusYaz(db, planlama, { id: null, kaynakKimligi: 'dn-1', ...hep }, girdi)));
      const ikinci = yazilan(await vt().tx((db) => planliDurusYaz(db, planlama, { id: null, kaynakKimligi: 'dn-1', ...hep }, { ...girdi, baslik: 'Arkon 2' })));
      assert.deepEqual([ikinci.id, ikinci.baslik, ikinci.surum, ikinci.kaynakKimligi], [ilk.id, 'Arkon 2', 2, 'dn-1']);
      const ucuncu = yazilan(await vt().tx((db) => planliDurusYaz(db, planlama, { id: ilk.id, kaynakKimligi: 'baska', ...hep }, { ...girdi, baslik: 'Arkon 3' })));
      assert.deepEqual([ucuncu.id, ucuncu.surum, ucuncu.kaynakKimligi], [ilk.id, 3, 'dn-1']);
      // Arkon'un gördüğü sürüm eskiyse yazım ve silme yapılmaz, güncel kayıt döner.
      const eski = { id: null, kaynakKimligi: 'dn-1', guncelMi: (k: PlanliDurusKaydi | null) => k?.surum === 2 };
      const cakisan = await vt().tx((db) => planliDurusYaz(db, planlama, eski, { ...girdi, baslik: 'Arkon eski' }));
      assert.deepEqual(cakisan.sonuc === 'cakisma' ? [cakisan.guncel?.baslik, cakisan.guncel?.surum] : null, ['Arkon 3', 3]);
      assert.equal((await vt().tx((db) => planliDurusSilArkon(db, planlama, eski))).sonuc, 'cakisma');
      assert.equal((await vt().tx((db) => planliDuruslarinHepsi(db))).filter((d) => d.kaynakKimligi === 'dn-1').length, 1);
      await assert.rejects(vt().tx((db) => planliDurusSilArkon(db, operator, { id: null, kaynakKimligi: 'dn-1', ...hep })), { kod: 'YETKI_YOK' });
      assert.equal(yazilan(await vt().tx((db) => planliDurusSilArkon(db, planlama, { id: null, kaynakKimligi: 'dn-1', ...hep }))).id, ilk.id);
      assert.deepEqual(await vt().tx((db) => planliDurusSilArkon(db, planlama, { id: null, kaynakKimligi: 'dn-1', ...hep })), { sonuc: 'yazildi', kayit: null });
      // Kimlikle anılan silinmiş kayıt Arkon'dan yeniden açılmaz.
      await assert.rejects(vt().tx((db) => planliDurusYaz(db, planlama, { id: ilk.id, kaynakKimligi: `tmi-pd-${ilk.id}`, ...hep }, girdi)), { kod: 'BULUNAMADI' });
    });

    test('takvim (891): aralıkta başlayan tek seferlik etkin duruş istasyon adıyla gelir; tekrarlı, kaldırılmış ve aralık dışı gelmez', async () => {
      const GUN = '2098-03-03';
      const tek = (await ac(c.planlama, { baslik: 'Takvim bakımı', baslangic: zaman(GUN, '08:00'), bitis: zaman(GUN, '12:00') })).govde.durus;
      const tesis = (await ac(c.planlama, {
        baslik: 'Takvim genel bakım', kapsam: 'tesis', istasyonId: null, baslangic: zaman('2098-03-20', '08:00'), bitis: zaman('2098-03-20', '09:00'),
      })).govde.durus;
      const tekrarli = (await ac(c.planlama, {
        baslik: 'Takvim molası', baslangic: zaman(GUN, '15:00'), bitis: zaman(GUN, '15:30'), tekrar: 'gunluk',
      })).govde.durus;
      const kaldirilan = (await ac(c.planlama, { baslik: 'Takvim iptal', baslangic: zaman(GUN, '13:00'), bitis: zaman(GUN, '14:00') })).govde.durus;
      await kaldir(kaldirilan.id);
      const disarida = (await ac(c.planlama, { baslik: 'Takvim nisan', baslangic: zaman('2098-04-01', '08:00'), bitis: zaman('2098-04-01', '09:00') })).govde.durus;

      const bizim = new Set([tek.id, tesis.id, tekrarli.id, kaldirilan.id, disarida.id].map(String));
      const kayitlar = (await vt().tx((db) => takvimKayitlari(db, '2098-03-01', '2098-03-31'))).filter((k) => bizim.has(k.kimlik));
      assert.deepEqual(kayitlar, [
        { kaynak: 'planli-durus', kimlik: String(tek.id), tarih: GUN, no: null, baslik: 'Takvim bakımı', ilgili: 'Deneme istasyon A', durum: 'Planlı', bitti: false },
        { kaynak: 'planli-durus', kimlik: String(tesis.id), tarih: '2098-03-20', no: null, baslik: 'Takvim genel bakım', ilgili: 'Bütün atölye', durum: 'Planlı', bitti: false },
      ]);
      // Sonraki testlerin kapasite hesabı bu duruşları görmesin.
      for (const d of [tek, tesis, tekrarli, disarida]) await kaldir(d.id);
    });
  });
  describe('fazla mesai planı (kart #1324)', () => {
    // Gün kapalıdır: vardiyalar düşer, takvimde yalnız fazla mesai kalır (fazla mesai kapalı günde de çalışılır).
    const GUN = '2099-11-04';
    const oku = (tur: string, id: number) =>
      tamam<CalismaTakvimiCevabi>(c.planlama, 'GET', `/calisma-takvimi?tur=${tur}&id=${id}&baslangic=${GUN}&bitis=${GUN}`).then((x) => x.takvim!);
    const sureler = (a: { baslangic: string; bitis: string }[]) => a.map((x) => (Date.parse(x.bitis) - Date.parse(x.baslangic)) / 60_000);
    const ac = (cerez: string, govde: Record<string, unknown>) => istek<FazlaMesaiCevabi>(cerez, 'POST', '/fazla-mesai', { tarih: GUN, ...govde }, kimlikli());
    // Kimlikler `before` içinde verilir: govdeler testte kurulur.
    let istasyonMesaisi: Record<string, unknown> = {};
    let merkezMesaisi: Record<string, unknown> = {};


    before(async () => {
      istasyonMesaisi = { baslangic: '18:00', bitis: '22:00', kapsam: 'istasyon', istasyonId: istasyonA };
      merkezMesaisi = { baslangic: '20:00', bitis: '23:00', kapsam: 'is-merkezi', isMerkeziId: merkezB };
      await tamam(c.planlama, 'POST', '/takvim-gunleri', { tarih: GUN, tur: 'kapali', ad: null });
    });
    after(async () => { await tamam(c.planlama, 'POST', `/takvim-gunleri/${GUN}/kaldir`); });

    test('VR-21, VR-22, VR-23: vardiya yazanı açar; hedef ve süre kuralı, kapsam (hedef ve kişi), geçmiş tarih ve tekrar koruması sunucuda', async () => {
      assert.equal((await ac(c.operator, istasyonMesaisi)).durum, 403);
      assert.equal((await istek(c.planlama, 'POST', '/fazla-mesai', { tarih: GUN, ...istasyonMesaisi })).durum, 400);
      assert.equal((await ac(c.planlama, { ...istasyonMesaisi, istasyonId: null })).durum, 400);
      assert.equal((await ac(c.planlama, { ...istasyonMesaisi, isMerkeziId: merkezA })).durum, 400);
      assert.equal((await ac(c.planlama, { ...istasyonMesaisi, bitis: '18:00' })).durum, 400);
      assert.equal((await ac(c.planlama, { ...istasyonMesaisi, istasyonId: OLMAYAN_ID })).durum, 400);
      assert.equal((await ac(c.planlama, { ...istasyonMesaisi, kisiIdleri: [OLMAYAN_ID] })).durum, 409);
      // Kısıtlı (yalnız A): B merkezi ve B'deki kişi reddedilir; kapsam dışı kişi ayrıntıda döner.
      assert.equal((await ac(c.kisitli, merkezMesaisi)).durum, 403);
      const kisiDisi = await istek<{ ayrinti?: unknown }>(c.kisitli, 'POST', '/fazla-mesai',
        { tarih: GUN, ...istasyonMesaisi, kisiIdleri: [kisiler['personel']!] }, kimlikli());
      assert.equal(kisiDisi.durum, 403);
      assert.deepEqual(kisiDisi.govde.ayrinti, { kisiIdleri: [kisiler['personel']!] });
      assert.equal((await istek(c.planlama, 'POST', '/fazla-mesai', { ...istasyonMesaisi, tarih: '2000-01-05' }, kimlikli())).durum, 403);
      assert.equal((await istek(c.yonetici, 'POST', '/fazla-mesai', { ...istasyonMesaisi, tarih: '2000-01-05' }, kimlikli())).durum, 200);
      const liste = await tamam<FazlaMesaiListeCevabi>(c.planlama, 'GET', '/fazla-mesai?baslangic=2000-01-01&bitis=2000-01-31');
      assert.equal(liste.fazlaMesailer.length, 1);
      assert.equal((await istek(c.operator, 'GET', '/fazla-mesai?baslangic=2000-01-01&bitis=2000-01-31')).durum, 403);
      assert.equal((await istek(c.planlama, 'GET', '/fazla-mesai?baslangic=2000-01-31&bitis=2000-01-01')).durum, 400);
      assert.equal((await istek(c.planlama, 'GET', '/fazla-mesai?baslangic=2099-01-01&bitis=2100-01-05')).durum, 400);
    });

    test('VR-24, VR-25, VR-26: fazla mesai kapsamındaki makine, istasyon ve iş merkezine, kişiye yalnız listedeyse eklenir; onaylı izinli kişi 0; pay yüzdesi', async () => {
      const f1 = await ac(c.planlama, { ...istasyonMesaisi, kisiIdleri: [kisiler['personel']!], aciklama: '  Acil iş  ' });
      assert.equal(f1.durum, 200, JSON.stringify(f1.govde));
      const k1 = f1.govde.fazlaMesai;
      assert.deepEqual([k1.dakika, k1.surum, k1.iptal, k1.yazan, k1.aciklama, k1.kisiIdleri], [240, 1, false, 'Deneme planlama', 'Acil iş', [kisiler['personel']!]]);
      const f2 = (await ac(c.planlama, merkezMesaisi)).govde.fazlaMesai;

      const makine = await oku('makine', makineA);
      assert.deepEqual(makine.gunler, [{ tarih: GUN, dakika: 240, kapali: { tur: 'kapali', ad: null }, fazlaMesaiDakika: 240 }]);
      assert.deepEqual(sureler(makine.araliklar), [240]);
      assert.match(makine.araliklar[0]!.baslangic, /T18:00:00/);
      // İstasyon kaydı yalnız o istasyonun; iş merkezi kaydı merkezin istasyonlarına da girer, öbür merkeze girmez.
      assert.equal((await oku('istasyon', istasyonA)).gunler[0]!.dakika, 240);
      assert.equal((await oku('is-merkezi', merkezA)).gunler[0]!.dakika, 0);
      assert.equal((await oku('istasyon', istasyonB)).gunler[0]!.dakika, 180);
      assert.equal((await oku('is-merkezi', merkezB)).gunler[0]!.dakika, 180);
      // Kişi B merkezindedir ama B kaydının listesinde değildir: yalnız listesinde olduğu A kaydı (240) gelir. Pay A %30 + B %70.
      let kisi = await oku('kisi', kisiler['personel']!);
      assert.deepEqual([kisi.gunler[0]!.dakika, kisi.gunler[0]!.izinli, kisi.yuzde], [240, undefined, 1]);
      assert.equal(makine.yuzde, undefined);

      // Onaylı izin (İK) o gün kişinin bütün çalışmasını kaldırır; makine etkilenmez. Gün kapalıdır: takvim günüyle sayılan izin türü.
      await tamam(c.yonetici, 'POST', '/ik/personel/emp_vr/kaydet',
        { govde: { id: 'emp_vr', kind: 'emp', ad: 'Deneme', soyad: 'Personel', isMerkeziId: merkezB, kisiId: kisiler['personel']! }, surum: null });
      await tamam(c.yonetici, 'POST', '/ik/izinler/leave_vr/kaydet',
        { govde: { id: 'leave_vr', kind: 'leave', empId: 'emp_vr', tur: 'Ücretsiz izin', baslangic: GUN, bitis: GUN, gun: 1, durum: 'Onaylandı' }, surum: null });
      kisi = await oku('kisi', kisiler['personel']!);
      assert.deepEqual([kisi.gunler[0]!.dakika, kisi.gunler[0]!.izinli, kisi.gunler[0]!.fazlaMesaiDakika, kisi.araliklar], [0, true, undefined, []]);
      assert.equal((await oku('makine', makineA)).gunler[0]!.dakika, 240);

      // Sürüm: güncel sürümle geçer, eski sürüm 409; kısıtlı B kaydına dokunamaz; iptal takvimden düşer, iptal edilen değişmez.
      const guncel = await tamam<FazlaMesaiCevabi>(c.planlama, 'POST', `/fazla-mesai/${k1.id}/guncelle`, { tarih: GUN, ...istasyonMesaisi, bitis: '21:00', surum: 1 });
      assert.deepEqual([guncel.fazlaMesai.dakika, guncel.fazlaMesai.surum, guncel.fazlaMesai.kisiIdleri], [180, 2, []]);
      assert.equal((await istek(c.planlama, 'POST', `/fazla-mesai/${k1.id}/guncelle`, { tarih: GUN, ...istasyonMesaisi, surum: 1 })).durum, 409);
      assert.equal((await istek(c.kisitli, 'POST', `/fazla-mesai/${f2.id}/iptal`, { surum: f2.surum })).durum, 403);
      assert.equal((await istek(c.kisitli, 'POST', `/fazla-mesai/${k1.id}/guncelle`, { tarih: GUN, ...merkezMesaisi, surum: 2 })).durum, 403);
      assert.equal((await istek(c.planlama, 'POST', `/fazla-mesai/${OLMAYAN_ID}/iptal`, { surum: 1 })).durum, 404);
      const iptal = await tamam<FazlaMesaiCevabi>(c.planlama, 'POST', `/fazla-mesai/${f2.id}/iptal`, { surum: f2.surum });
      assert.deepEqual([iptal.fazlaMesai.iptal, iptal.fazlaMesai.surum], [true, 2]);
      assert.equal((await oku('istasyon', istasyonB)).gunler[0]!.dakika, 0);
      assert.equal((await istek(c.planlama, 'POST', `/fazla-mesai/${f2.id}/iptal`, { surum: 2 })).durum, 409);
      assert.equal((await istek(c.planlama, 'POST', `/fazla-mesai/${f2.id}/guncelle`, { tarih: GUN, ...merkezMesaisi, surum: 2 })).durum, 409);
      const liste = await tamam<FazlaMesaiListeCevabi>(c.planlama, 'GET', `/fazla-mesai?baslangic=${GUN}&bitis=${GUN}`);
      assert.deepEqual(liste.fazlaMesailer.map((f) => [f.id, f.iptal]), [[k1.id, false], [f2.id, true]]);
      await tamam(c.planlama, 'POST', `/fazla-mesai/${k1.id}/iptal`, { surum: 2 });
    });

    test('soru 54: yarım gün izin oranlı düşer; yalnız izinli saatler (günün sonundan) vardiyadan çıkar', async () => {
      // Kişi ve İK kaydı (emp_vr) önceki testte kurulur. Perşembe vardiyası 08:00-16:00, mola 12:00-12:30: net 450 dakika.
      const IZIN_GUNU = '2099-11-05';
      const v = await vardiyaAc({ molalar: [{ baslangic: '12:00', bitis: '12:30' }] });
      for (const im of [merkezA, merkezB]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 4, vardiyaId: v.id, acik: true });
      const kisiGunu = async () => (await tamam<CalismaTakvimiCevabi>(c.planlama, 'GET',
        `/calisma-takvimi?tur=kisi&id=${kisiler['personel']!}&baslangic=${IZIN_GUNU}&bitis=${IZIN_GUNU}`)).takvim!;
      assert.equal((await kisiGunu()).gunler[0]!.dakika, 450);
      await tamam(c.yonetici, 'POST', '/ik/izinler/leave_yarim/kaydet',
        { govde: { id: 'leave_yarim', kind: 'leave', empId: 'emp_vr', tur: 'Yıllık izin', baslangic: IZIN_GUNU, bitis: IZIN_GUNU, gun: 0.5, durum: 'Onaylandı' }, surum: null });
      const kisi = await kisiGunu();
      assert.deepEqual([kisi.gunler[0]!.dakika, kisi.gunler[0]!.izinli], [225, undefined]);
      // 12:30-16:00 (210) ve sabahın son 15 dakikası izinlidir: çalışma 08:00-11:45 kalır.
      assert.deepEqual(sureler(kisi.araliklar), [225]);
      assert.match(kisi.araliklar[0]!.bitis, /T11:45:00/);
      assert.equal((await tamam<CalismaTakvimiCevabi>(c.operator, 'GET', `/calisma-takvimi?tur=makine&id=${makineA}&baslangic=${IZIN_GUNU}&bitis=${IZIN_GUNU}`)).takvim!.gunler[0]!.dakika, 450, 'izin makineyi etkilemez');
      for (const im of [merkezA, merkezB]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: im, gun: 4, vardiyaId: v.id, acik: false });
    });

    test('VR-27 (karar 140 a): kişi takvimini kendisi, İK, kapsamındaki amir ve planlama görür; başkası 403 alır, kişisiz kaynak açıktır', async () => {
      const roller = (await tamam<{ roller: Rol[] }>(c.yonetici, 'GET', '/roller')).roller;
      const kullaniciAc = async (ad: string, rolAdi: string): Promise<string> => {
        const rol = roller.find((r) => r.ad === rolAdi)!.id;
        await vt().tx(async (db) => {
          const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
          const kisi = await rolAta(db, yoneticiId, id, rol);
          for (const r of kisi.roller) if (r.id !== rol) await rolAl(db, yoneticiId, id, r.id);
          kisiler[ad] = id;
        });
        return girisCerezi(ad);
      };
      const ik = await kullaniciAc('vr27-ik', 'İnsan Kaynakları');
      const amirB = await kullaniciAc('vr27-amir-b', 'Vardiya Sorumlusu');
      const amirA = await kullaniciAc('vr27-amir-a', 'Vardiya Sorumlusu');
      await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${kisiler['vr27-amir-b']!}/belirle`, { isMerkeziIdleri: [merkezB] });
      await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${kisiler['vr27-amir-a']!}/belirle`, { isMerkeziIdleri: [merkezA] });
      const kendisi = await girisCerezi('personel');
      // Personelin iş merkezi B'dir (en büyük yüzde).
      const durum = async (cerez: string, tur = 'kisi', id = kisiler['personel']!) =>
        (await istek(cerez, 'GET', `/calisma-takvimi?tur=${tur}&id=${id}&baslangic=${CARSAMBA}&bitis=${CARSAMBA}`)).durum;
      for (const cerez of [kendisi, ik, amirB, c.planlama, c.yonetici]) assert.equal(await durum(cerez), 200);
      for (const cerez of [c.operator, amirA, c.kisitli]) assert.equal(await durum(cerez), 403);
      for (const cerez of [c.operator, amirA]) assert.equal(await durum(cerez, 'makine', makineA), 200);
      assert.equal(await durum(c.operator, 'is-merkezi', merkezB), 200);
    });

    test('VR-29 (W8, 18.1): İK çıkış gününden sonra kişi takvimi 0 ve "ayrıldı", günlük mesaide yok, fazla mesai reddedilir; pasif kişi bugünden itibaren aynı, geçmişi değişmez', async () => {
      // 2099-11-10 salı (çıkış günü, çalışır), 11-11 çarşamba (ayrıldı). Vardiya 08:00-16:00 molasız: 480 dakika.
      const CIKIS = '2099-11-10';
      const SONRA = '2099-11-11';
      const v = await vardiyaAc();
      for (const gun of [2, 3]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun, vardiyaId: v.id, acik: true });
      const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme ayrılan', kullaniciAdi: 'vr29-ayrilan', parola: PAROLA }));
      await tamam(c.yonetici, 'POST', `/istasyonlar/${istasyonA}/kisiler/ata`, { kisiId: id, yuzde: '100.00' });
      await tamam(c.yonetici, 'POST', '/ik/personel/emp_vr29/kaydet',
        { govde: { id: 'emp_vr29', kind: 'emp', ad: 'Deneme', soyad: 'Ayrılan', isMerkeziId: merkezA, kisiId: id, cikisTarihi: CIKIS }, surum: null });
      const kisiTakvimi = async (bas: string, bit: string) =>
        (await tamam<CalismaTakvimiCevabi>(c.planlama, 'GET', `/calisma-takvimi?tur=kisi&id=${id}&baslangic=${bas}&bitis=${bit}`)).takvim!;
      const mesaidekiler = async (tarih: string) =>
        (await tamam<GunlukMesaiCevabi>(c.yonetici, 'GET', `/gunluk-mesai?tarih=${tarih}`)).satirlar.map((x) => x.kisiId);
      const personelde = async () => (await tamam<VardiyaPersoneliCevabi>(c.planlama, 'GET', '/vardiya-personeli')).personel.some((p) => p.kisiId === id);
      const mesai = (tarih: string) => istek<FazlaMesaiCevabi>(c.planlama, 'POST', '/fazla-mesai',
        { tarih, baslangic: '18:00', bitis: '20:00', kapsam: 'istasyon', istasyonId: istasyonA, kisiIdleri: [id] }, kimlikli());

      let t = await kisiTakvimi(CIKIS, SONRA);
      assert.deepEqual(t.gunler.map((g) => [g.tarih, g.dakika, g.ayrildi]), [[CIKIS, 480, undefined], [SONRA, 0, true]]);
      assert.deepEqual(sureler(t.araliklar), [480]);
      const istasyonGunu = await tamam<CalismaTakvimiCevabi>(c.planlama, 'GET', `/calisma-takvimi?tur=istasyon&id=${istasyonA}&baslangic=${SONRA}&bitis=${SONRA}`);
      assert.equal(istasyonGunu.takvim!.gunler[0]!.dakika, 480, 'istasyon etkilenmez');
      assert.ok((await mesaidekiler(CIKIS)).includes(id));
      assert.ok(!(await mesaidekiler(SONRA)).includes(id));
      assert.ok(await personelde(), 'çıkışı ileri tarihli kişi bugün listede');
      // Çıkıştan sonraki güne fazla mesai yazılmaz; çıkış günü yazılır. Kuralın ötesinde kayıt kalmaz.
      const red = await mesai(SONRA);
      assert.equal(red.durum, 400, JSON.stringify(red.govde));
      const kabul = await mesai(CIKIS);
      assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
      assert.deepEqual((await kisiTakvimi(SONRA, SONRA)).gunler[0]!.fazlaMesaiDakika, undefined);
      await tamam(c.planlama, 'POST', `/fazla-mesai/${kabul.govde.fazlaMesai.id}/iptal`, { surum: kabul.govde.fazlaMesai.surum });

      // Pasif kişi: bugünden itibaren ayrılmış; geçmiş gün (2000) değişmez, vardiya personelinde yok, gelecek güne fazla mesai yok.
      const ESKI = '2000-01-04';
      const eskiDakika = (await kisiTakvimi(ESKI, ESKI)).gunler[0]!.dakika;
      const kayit = (await tamam<{ kisiler: { id: number; surum: number }[] }>(c.yonetici, 'GET', '/kisiler')).kisiler.find((k) => k.id === id)!;
      await tamam(c.yonetici, 'POST', `/kisiler/${id}/pasife-al`, { surum: kayit.surum });
      t = await kisiTakvimi(CIKIS, CIKIS);
      assert.deepEqual([t.gunler[0]!.dakika, t.gunler[0]!.ayrildi, t.araliklar], [0, true, []]);
      assert.deepEqual((await kisiTakvimi(ESKI, ESKI)).gunler[0], { tarih: ESKI, dakika: eskiDakika, kapali: null });
      assert.equal(eskiDakika, 480);
      assert.equal(await personelde(), false);
      assert.ok(!(await mesaidekiler(CIKIS)).includes(id));
      assert.equal((await mesai(CIKIS)).durum, 400);
      for (const gun of [2, 3]) await tamam(c.planlama, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun, vardiyaId: v.id, acik: false });
    });
  });
});
