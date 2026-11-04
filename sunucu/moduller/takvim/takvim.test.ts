import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { GECIKEN_GERI_GUN } from '#paylasilan/sozlesme/takvim.ts';
import type { TakvimCevabi, TakvimGecikenCevabi } from '#paylasilan/sozlesme/takvim.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
// Gelecekte, başka testin kaydı düşmeyen bir ay: vergi tarihleri kuraldan gelir, veri gerekmez.
const MART = { baslangic: '2031-03-01', bitis: '2031-03-31' };

interface Rol { id: number; ad: string }
interface Cevap<T> { durum: number; govde: T }

describe('takvim (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<'yonetici' | 'operator' | 'izleyici', string> = { yonetici: '', operator: '', izleyici: '' };
  const kisiler: Record<string, number> = {};

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function istek<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, ek: Record<string, string> = {}): Promise<Cevap<T>> {
    const cevap = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez, ...ek }, payload: payload as object | undefined });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  }
  const tamam = async <T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, ek: Record<string, string> = {}): Promise<T> => {
    const cevap = await istek<T>(cerez, yontem, url, payload, ek);
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  };
  const oku = (cerez: string, a = MART) => istek<TakvimCevabi>(cerez, 'GET', `/takvim?baslangic=${a.baslangic}&bitis=${a.bitis}`);
  // Bugünden en az `gun` gün önceki ilk iş günü: İK hafta sonu izni reddeder. `dolu` verilirse oradaki günler de atlanır;
  // hafta sonu kayması iki yakın günü aynı iş gününe düşürebilir, aynı kişinin iki izni o zaman çakışır.
  const gunOnce = (gun: number, dolu: ReadonlySet<string> = new Set()): string => {
    let an = Date.parse(`${tesisGunu(Date.now())}T00:00:00Z`) - gun * 86_400_000;
    const tarih = () => new Date(an).toISOString().slice(0, 10);
    while ([0, 6].includes(new Date(an).getUTCDay()) || dolu.has(tarih())) an -= 86_400_000;
    return tarih();
  };
  const gecikenOku = (cerez: string) => istek<TakvimGecikenCevabi>(cerez, 'GET', '/takvim/gecikenler');
  const islemVer = (ad: string, islem: string) => tamam(c.yonetici, 'POST', `/kisiler/${kisiler[ad]!}/ek-islem-degistir`, { islem, verildi: true });

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('takvim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    const roller = (await tamam<{ roller: Rol[] }>(c.yonetici, 'GET', '/roller')).roller;
    const operatorRolu = roller.find((r) => r.ad === 'Operatör')!.id;
    for (const ad of ['operator', 'izleyici'] as const) {
      kisiler[ad] = await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, operatorRolu);
        for (const r of kisi.roller) if (r.id !== operatorRolu) await rolAl(db, yoneticiId, id, r.id);
        return id;
      });
      c[ad] = await girisCerezi(ad);
    }
    await islemVer('izleyici', 'takvim.oku');
    // İzin kaynağı için iki personel: biri izleyiciye, biri operatöre bağlı.
    const merkez = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'TK-M', ad: 'Deneme merkez', aciklama: null })).id;
    for (const ad of ['izleyici', 'operator'] as const) {
      await tamam(c.yonetici, 'POST', `/ik/personel/emp_${ad}/kaydet`, {
        govde: { id: `emp_${ad}`, kind: 'emp', ad: `Deneme ${ad}`, soyad: 'Deneme', isMerkeziId: merkez, kisiId: kisiler[ad]! }, surum: null,
      });
      await tamam(c.yonetici, 'POST', `/ik/izinler/leave_${ad}/kaydet`, {
        govde: { id: `leave_${ad}`, kind: 'leave', empId: `emp_${ad}`, tur: 'Yıllık izin', baslangic: '2031-03-10', bitis: '2031-03-11', gun: 2, durum: 'Onaylandı' }, surum: null,
      });
    }
    // Geciken taraması (1816): 200 gün önce bekleyen (geciken), 200 gün önce onaylanmış (kapanmış), taramanın dışında bekleyen ve bugünden önceki son iş günü bekleyen izin.
    const gecmis: [string, number, string][] = [['eski_bekleyen', -200, 'Beklemede'], ['eski_onayli', -201, 'Onaylandı'], ['cok_eski', -GECIKEN_GERI_GUN - 5, 'Beklemede'], ['dun', -1, 'Beklemede']];
    const dolu = new Set<string>();
    for (const [ad, gun, durum] of gecmis) {
      const t = gunOnce(-gun, dolu);
      dolu.add(t);
      await tamam(c.yonetici, 'POST', `/ik/izinler/leave_${ad}/kaydet`, {
        govde: { id: `leave_${ad}`, kind: 'leave', empId: 'emp_operator', tur: 'Mazeret izni', baslangic: t, bitis: t, gun: 1, durum }, surum: null,
      });
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('TK-01: takvim.oku olmayan 403 alır; ters ya da uzun aralık 400', async () => {
    assert.equal((await oku(c.operator)).durum, 403);
    assert.equal((await oku(c.yonetici, { baslangic: '2031-03-02', bitis: '2031-03-01' })).durum, 400);
    assert.equal((await oku(c.yonetici, { baslangic: '2031-01-01', bitis: '2031-06-01' })).durum, 400);
  });

  test('TK-02: yönetici bütün kaynakları okur, bekleyen kaynak kalmadı; vergi tarihleri sıralı gelir', async () => {
    const g = (await oku(c.yonetici)).govde;
    assert.deepEqual(g.kaynaklar, ['siparis', 'emir-plan', 'emir-bitis', 'sevk', 'satin-alma', 'kalibrasyon', 'denetim', 'izin', 'vergi', 'planli-durus']);
    assert.deepEqual(g.bekleyenler, []);
    const vergi = g.kayitlar.filter((k) => k.kaynak === 'vergi');
    assert.deepEqual(vergi.map((k) => k.tarih), ['2031-03-25', '2031-03-26', '2031-03-28', '2031-03-31']);
    assert.ok(vergi.every((k) => !k.bitti));
    assert.deepEqual(g.kayitlar.map((k) => k.tarih), [...g.kayitlar.map((k) => k.tarih)].sort());
  });

  test('TK-03 (1163 a): yalnız takvim.oku olan kaynak yetkisi kadar görür; yetki verilince kaynak eklenir', async () => {
    const once = (await oku(c.izleyici)).govde;
    assert.deepEqual([once.kaynaklar, once.bekleyenler], [['izin', 'planli-durus'], []]);
    assert.ok(once.kayitlar.every((k) => k.kaynak === 'planli-durus' || k.kaynak === 'izin'));
    await islemVer('izleyici', 'finans.oku');
    const sonra = (await oku(c.izleyici)).govde;
    assert.deepEqual(sonra.kaynaklar, ['izin', 'vergi', 'planli-durus']);
    assert.equal(sonra.kayitlar.filter((k) => k.kaynak === 'vergi').length, 4);
  });

  test('TK-04 (1191 a): İK yetkisi olmayan yalnız kendi iznini görür; ik.izin-oku verilince bütün izinler', async () => {
    const izinler = async () => (await oku(c.izleyici)).govde.kayitlar.filter((k) => k.kaynak === 'izin').map((k) => k.kimlik).sort();
    assert.deepEqual(await izinler(), ['leave_izleyici']);
    await islemVer('izleyici', 'ik.izin-oku');
    assert.deepEqual(await izinler(), ['leave_izleyici', 'leave_operator']);
    const y = (await oku(c.yonetici)).govde.kayitlar.filter((k) => k.kaynak === 'izin');
    assert.equal(y.length, 2);
  });

  test('TK-05 (1816): geciken okuması pencereden eski kapanmamış kaydı verir; kapanmışı, bugünü ve taramadan eskiyi vermez', async () => {
    assert.equal((await gecikenOku(c.operator)).durum, 403);
    const y = (await gecikenOku(c.yonetici)).govde;
    const izin = y.kayitlar.filter((k) => k.kaynak === 'izin').map((k) => [k.kimlik, k.tarih]);
    assert.deepEqual(izin, [['leave_eski_bekleyen', gunOnce(200)], ['leave_dun', gunOnce(1)]]);
    assert.ok(y.kayitlar.every((k) => !k.bitti && k.tarih < tesisGunu(Date.now())));
    assert.deepEqual(y.kayitlar.map((k) => k.tarih), [...y.kayitlar.map((k) => k.tarih)].sort());
  });

  test('TK-06 (1816): geciken okuması kaynak yetkisine uyar (izleyici TK-03 ve TK-04 sonrası finans.oku ve ik.izin-oku taşır)', async () => {
    const z = (await gecikenOku(c.izleyici)).govde;
    assert.ok(z.kayitlar.every((k) => ['izin', 'vergi', 'planli-durus'].includes(k.kaynak)));
    assert.deepEqual(z.kayitlar.filter((k) => k.kaynak === 'izin').map((k) => k.kimlik).sort(), ['leave_dun', 'leave_eski_bekleyen']);
  });

  test('TK-07 (1846, TKV-2 a): işaretsiz geçmiş vergi günü geciken ve "Kaçırıldı"; "verildi" işaretlenince kapanır ve gecikenden düşer', async () => {
    const vergiler = async () => (await gecikenOku(c.yonetici)).govde.kayitlar.filter((k) => k.kaynak === 'vergi');
    const ilk = (await vergiler())[0]!;
    assert.equal(ilk.durum, 'Kaçırıldı');
    const [sonGun, kod] = [ilk.tarih, ilk.kimlik.slice(11)];
    // Finans ucu tekrar korumalıdır; istek kimliği ister.
    await tamam(c.yonetici, 'POST', '/finans/vergi-beyani/isaretle', { sonGun, kod, verildi: true }, { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() });
    assert.ok(!(await vergiler()).some((k) => k.kimlik === ilk.kimlik));
    const gun = (await oku(c.yonetici, { baslangic: sonGun, bitis: sonGun })).govde.kayitlar.find((k) => k.kimlik === ilk.kimlik)!;
    assert.deepEqual([gun.durum, gun.bitti], ['Verildi', true]);
  });
});
