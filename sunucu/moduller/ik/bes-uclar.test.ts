import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { IkBesCevabi, IkBesYazCevabi } from '#paylasilan/sozlesme/ik-bes.ts';
import type { IkVeriCevabi, IkYazCevabi } from '#paylasilan/sozlesme/ik.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';

// BES uçları (kart 1939, 1940 a): okuma ik.oku ve İK kapsamı, yazma ik.ucret-yaz; hareket bordrodaki BES işaretini aynı işlemde yazar.
// Sınama kendi rol dağılımını kurar: bordro uzmanı ücret yazar (Merkez 1), İK uzmanı yalnız okur, operatör hiçbirini.
const ROL_ISLEMLERI: [string, string[]][] = [
  ['insan_kaynaklari', ['ik.oku', 'ik.personel-yaz', 'ik.ucret-yaz']],
  ['mudur', ['ik.oku', 'ik.personel-yaz']],
  ['operator', ['ik.izin-talep']],
];
const PAROLA = 'dogru-parola-1';
type Govde = Record<string, unknown>;
type Anahtar = 'yon' | 'bor' | 'oku' | 'opr';
const gunOnce = (n: number): string => tesisGunu(Date.now() - n * 86_400_000);
interface Girdi { personel: string; tur: string; tarih: string; oran: number | null; sirket: string | null; aciklama: string | null }
const hareket = (personel: string, tur: string, tarih: string, ek: Partial<Girdi> = {}): Girdi =>
  ({ personel, tur, tarih, oran: null, sirket: null, aciklama: null, ...ek });

describe('İK BES uçları (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<Anahtar, string> = { yon: '', bor: '', oku: '', opr: '' };
  let im1 = 0;
  let im2 = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const r = await istek(cerezi, yontem, url, govde);
    assert.equal(r.statusCode, 200, `${yontem} ${url}: ${r.body}`);
    return r.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<void> {
    const r = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: r.statusCode, kod: (r.json() as { kod?: string }).kod }, { durum, kod }, `${yontem} ${url}: ${r.body}`);
  }
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedef = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedef !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedef);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }
  const personel = (id: string, ek: Govde = {}): Govde => ({ id, kind: 'emp', ad: `Ad ${id}`, soyad: 'Deneme', iseGiris: '2024-01-01', isMerkeziId: im1, ...ek });
  const isaret = async (kimlik: string): Promise<{ bes: boolean | null; surum: number }> =>
    (await vt().tek<{ bes: boolean | null; surum: number }>('SELECT bes_katilim AS bes, surum FROM ik_personel WHERE kimlik = $1', [kimlik]))!;
  const ekle = (cerezi: string, g: Girdi): Promise<IkBesYazCevabi> => tamam<IkBesYazCevabi>(cerezi, 'POST', '/ik/bes/hareket', g);
  const iptal = (cerezi: string, h: { id: number; surum: number }): Promise<IkBesYazCevabi> =>
    tamam<IkBesYazCevabi>(cerezi, 'POST', `/ik/bes/hareket/${String(h.id)}/iptal`, { surum: h.surum });

  before(async () => {
    ortam = await testVeritabaniKur('ik_bes_uc');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.sorgu("DELETE FROM rol_islemi WHERE islem LIKE 'ik.%'");
    for (const [rol, islemler] of ROL_ISLEMLERI) {
      for (const islem of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ((SELECT id FROM rol WHERE kod = $1), $2)', [rol, islem]);
    }
    const merkezler = await ortam.vt.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('BEM1', 'Merkez 1'), ('BEM2', 'Merkez 2') RETURNING id");
    im1 = merkezler[0]!.id; im2 = merkezler[1]!.id;
    const yon = await girisYap('bes-yon', 'yonetici');
    c.yon = yon.cerez;
    const bor = await girisYap('bes-bor', 'insan_kaynaklari', yon.id);
    c.bor = bor.cerez;
    c.oku = (await girisYap('bes-oku', 'mudur', yon.id)).cerez;
    c.opr = (await girisYap('bes-opr', 'operator', yon.id)).cerez;
    // Bordro uzmanı yalnız Merkez 1'de yetkili; yönetici kısıtsız.
    await ortam.vt.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [bor.id, im1]);
    for (const p of [personel('emp_a', { sicilNo: '7001' }), personel('emp_b', { sicilNo: '7002' }), personel('emp_c', { sicilNo: '7003', isMerkeziId: im2 })]) {
      await tamam<IkYazCevabi>(c.yon, 'POST', `/ik/personel/${String(p['id'])}/kaydet`, { govde: p, surum: null });
    }
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('giriş işareti açar, çıkış kapatır; işaret personelin sürümünü ilerletir ve geçmişe düşer; okuma yazanı verir', async () => {
    const once = await isaret('emp_a');
    assert.equal(once.bes, null);
    const giris = await ekle(c.bor, hareket('emp_a', 'otomatik_katilim', gunOnce(20), { oran: 3, sirket: 'Deneme Emeklilik' }));
    assert.deepEqual({ ...giris.hareket, id: 0 }, {
      id: 0, personel: 'emp_a', tur: 'otomatik_katilim', tarih: gunOnce(20), oran: 3, sirket: 'Deneme Emeklilik', aciklama: null, iptal: false, surum: 1, yazan: 'Deneme bes-bor',
    });
    const acik = await isaret('emp_a');
    assert.deepEqual([acik.bes, acik.surum], [true, once.surum + 1]);
    const gecmis = await vt().tek<{ sayi: number }>(
      "SELECT count(*)::int AS sayi FROM ik_kayit_gecmisi g JOIN ik_kayit_gecmisi_alani a ON a.gecmis_no = g.no WHERE g.kimlik = 'emp_a' AND a.alan = 'besKatilim'",
    );
    assert.equal(gecmis!.sayi, 1);
    const cayma = await ekle(c.bor, hareket('emp_a', 'cayma', gunOnce(5)));
    assert.equal((await isaret('emp_a')).bes, false);
    const okunan = await tamam<IkBesCevabi>(c.oku, 'GET', '/ik/bes');
    assert.deepEqual(okunan.hareketler.filter((h) => h.personel === 'emp_a').map((h) => [h.id, h.tur]), [[giris.hareket.id, 'otomatik_katilim'], [cayma.hareket.id, 'cayma']]);
  });

  test('iptal işareti kalan son harekete, hiç kalmazsa ilk hareketten önceki değere döndürür; iptal geri açılmaz', async () => {
    const giris = await ekle(c.bor, hareket('emp_b', 'gonullu_katilim', gunOnce(30)));
    const cikis = await ekle(c.bor, hareket('emp_b', 'ayrilma', gunOnce(10)));
    assert.equal((await isaret('emp_b')).bes, false);
    const iptalEdilen = await iptal(c.bor, cikis.hareket);
    assert.deepEqual([iptalEdilen.hareket.iptal, iptalEdilen.hareket.surum], [true, 2]);
    assert.equal((await isaret('emp_b')).bes, true);
    await iptal(c.bor, giris.hareket);
    assert.equal((await isaret('emp_b')).bes, null);
    await ret(404, 'BULUNAMADI', c.bor, 'POST', `/ik/bes/hareket/${String(cikis.hareket.id)}/iptal`, { surum: 2 });
    await ret(404, 'BULUNAMADI', c.bor, 'POST', '/ik/bes/hareket/999999/iptal', { surum: 1 });
  });

  test('durumla çelişen hareket, ileri tarih ve eski sürüm reddedilir', async () => {
    const g = await ekle(c.bor, hareket('emp_b', 'otomatik_katilim', gunOnce(100)));
    await ret(400, 'DOGRULAMA', c.bor, 'POST', '/ik/bes/hareket', hareket('emp_b', 'gonullu_katilim', gunOnce(1)));
    await ret(400, 'DOGRULAMA', c.bor, 'POST', '/ik/bes/hareket', hareket('emp_b', 'cayma', gunOnce(1)));
    await ret(400, 'DOGRULAMA', c.bor, 'POST', '/ik/bes/hareket', hareket('emp_b', 'ayrilma', gunOnce(101)));
    await ret(400, 'DOGRULAMA', c.bor, 'POST', '/ik/bes/hareket', hareket('emp_b', 'ayrilma', gunOnce(1), { oran: 2 }));
    await ret(400, 'DOGRULAMA', c.bor, 'POST', '/ik/bes/hareket', hareket('emp_b', 'ayrilma', gunOnce(-1)));
    await ret(409, 'CAKISMA', c.bor, 'POST', `/ik/bes/hareket/${String(g.hareket.id)}/iptal`, { surum: 7 });
    await ret(404, 'BULUNAMADI', c.bor, 'POST', '/ik/bes/hareket', hareket('emp_yok', 'gonullu_katilim', gunOnce(1)));
  });

  test('yetki: okuma ik.oku, yazma ik.ucret-yaz; İK kapsamı dışındaki personel görünmez ve yazılmaz', async () => {
    await ret(403, 'YETKI_YOK', c.opr, 'GET', '/ik/bes');
    await ret(403, 'YETKI_YOK', c.oku, 'POST', '/ik/bes/hareket', hareket('emp_a', 'gonullu_katilim', gunOnce(1)));
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/bes/hareket', hareket('emp_a', 'gonullu_katilim', gunOnce(1)));
    await ret(403, 'YETKI_YOK', c.bor, 'POST', '/ik/bes/hareket', hareket('emp_c', 'gonullu_katilim', gunOnce(1)));
    const yon = await ekle(c.yon, hareket('emp_c', 'gonullu_katilim', gunOnce(1)));
    assert.ok(!(await tamam<IkBesCevabi>(c.bor, 'GET', '/ik/bes')).hareketler.some((h) => h.personel === 'emp_c'));
    assert.ok((await tamam<IkBesCevabi>(c.yon, 'GET', '/ik/bes')).hareketler.some((h) => h.id === yon.hareket.id));
    await ret(403, 'YETKI_YOK', c.bor, 'POST', `/ik/bes/hareket/${String(yon.hareket.id)}/iptal`, { surum: 1 });
  });

  test('1940 a: personel kaydı BES işaretini değiştirmez; yeni kayıtta işaret yoktur', async () => {
    const veri = await tamam<IkVeriCevabi>(c.yon, 'GET', '/ik/veri');
    const a = veri.kayitlar.find((k) => k.kimlik === 'emp_a')!;
    assert.equal(a.govde['besKatilim'], false);
    const yaz = await tamam<IkYazCevabi>(c.yon, 'POST', '/ik/personel/emp_a/kaydet', { govde: { ...a.govde, besKatilim: true, pozisyon: 'Usta' }, surum: a.surum });
    assert.deepEqual([yaz.kayit.govde['besKatilim'], yaz.kayit.govde['pozisyon']], [false, 'Usta']);
    const yeni = await tamam<IkYazCevabi>(c.yon, 'POST', '/ik/personel/emp_d/kaydet', { govde: personel('emp_d', { sicilNo: '7004', besKatilim: true }), surum: null });
    assert.equal(yeni.kayit.govde['besKatilim'] ?? null, null);
  });
});
