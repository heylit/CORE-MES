import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { grupSaatMaliyetleri } from './grup-saat-maliyeti.ts';
import { grupSaatEkrani, varsayilanMaliyetAyi } from './kurallar.ts';

// 2618 (2602-a, 2603 a): planlamanın departman saat maliyeti ucu. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/api/plan/grup-saat-maliyetleri';

describe('2618 kuralları', () => {
  test('varsayılan ay son tam aydır; ocakta önceki yılın aralığı', () => {
    assert.equal(varsayilanMaliyetAyi('2026-11-09'), '2026-10');
    assert.equal(varsayilanMaliyetAyi('2026-01-01'), '2025-12');
    assert.equal(varsayilanMaliyetAyi('2026-10-31'), '2026-09');
  });
  test('2603 a: küçük grubun değeri gizlenir, kişi sayısı çıkmaz, adla sıralanır', () => {
    const g = grupSaatEkrani([
      { departmanNo: 2, departmanAd: 'Üretim', saatMaliyeti: 150, kucuk: false, kisiSayisi: 5 } as never,
      { departmanNo: 1, departmanAd: 'Kalite', saatMaliyeti: 99, kucuk: true },
    ]);
    assert.deepEqual(g, [
      { departmanNo: 1, departmanAd: 'Kalite', saatMaliyeti: null, kucuk: true },
      { departmanNo: 2, departmanAd: 'Üretim', saatMaliyeti: 150, kucuk: false },
    ]);
  });
});

describe('2618 grup saat maliyeti ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let uretim = 0;
  let kucuk = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const oku = (cerez: string, ay?: string) =>
    app.inject({ method: 'GET', url: ay === undefined ? YOL : `${YOL}?ay=${ay}`, headers: { cookie: cerez } });

  before(async () => {
    ortam = await testVeritabaniKur('plan_grup_saat');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx(async (db) => {
      yoneticiId = await yoneticiOlustur(db, { ad: 'Deneme yönetici', kullaniciAdi: 'gsm-yon', parola: PAROLA });
      const kisi: number[] = [];
      for (let i = 0; i < 5; i++) kisi.push(await yoneticiOlustur(db, { ad: `Deneme ${i}`, kullaniciAdi: `gsm-${i}`, parola: PAROLA }));
      const [im] = await db.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('GSM', 'Merkez') RETURNING id");
      const dep = async (kimlik: string, ad: string) => (await db.tek<{ no: number }>(
        'INSERT INTO ik_departman (kimlik, ad, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $3) RETURNING no', [kimlik, ad, yoneticiId]))!.no;
      uretim = await dep('dep_uretim', 'Üretim');
      kucuk = await dep('dep_kucuk', 'Kalite');
      await db.sorgu("INSERT INTO ik_parametre_donemi (kod, ad, baslangic, sgk_isveren_orani, issizlik_isveren_orani, sgk_tavani, aylik_saat) VALUES ('p2026', '2026', '2026-01-01', 20, 2, 150000, 220)");
      const personel = async (i: number, departman: number, kisiId: number) => (await db.tek<{ no: number }>(
        `INSERT INTO ik_personel (kimlik, ad, soyad, is_merkezi_id, departman_no, brut_maas, kisi_id, olusturan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $1, 'Deneme', $2, $3, 22000, $4, $5, $5) RETURNING no`, [`emp_${i}`, im!.id, departman, kisiId, yoneticiId]))!.no;
      const gun = (no: number) => db.sorgu(
        "INSERT INTO ik_puantaj (personel_no, tarih, durum, giris, cikis, yazan_kisi_id) VALUES ($1, '2026-01-05', 'calisti', '08:00', '18:00', $2)", [no, yoneticiId]);
      // Üretim üç kişi (değer görünür), Kalite iki kişi (küçük grup).
      for (let i = 0; i < 3; i++) await gun(await personel(i, uretim, kisi[i]!));
      for (let i = 3; i < 5; i++) await gun(await personel(i, kucuk, kisi[i]!));
    });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('departman değeri son tam aydan; küçük grup null (servis, 2026-02 tesis günüyle)', async () => {
    const c = await vt().tx((db) => grupSaatMaliyetleri(db, new Date('2026-02-10T09:00:00Z')));
    // 22.000 x 1,22 / 220 = 122 (IK-85); üç kişi eşit saatle.
    assert.deepEqual(c, {
      ay: '2026-01',
      gruplar: [
        { departmanNo: kucuk, departmanAd: 'Kalite', saatMaliyeti: null, kucuk: true },
        { departmanNo: uretim, departmanAd: 'Üretim', saatMaliyeti: 122, kucuk: false },
      ],
    });
  });

  test('2626 1/2 b: uç her zaman son tam ayı verir, ay seçilmez; kişi alanı yok', async () => {
    const cerez = await islemliKisi('gsm_maliyet', ['finans.maliyet-oku']);
    const beklenen = varsayilanMaliyetAyi(tesisGunu(new Date()));
    for (const ay of [undefined, '2026-01']) {
      const cevap = await oku(cerez, ay);
      assert.equal(cevap.statusCode, 200);
      const govde = cevap.json() as { ay: string; gruplar: Record<string, unknown>[] };
      assert.equal(govde.ay, beklenen, 'verilen ay okunmaz');
      for (const g of govde.gruplar) assert.deepEqual(Object.keys(g).sort(), ['departmanAd', 'departmanNo', 'kucuk', 'saatMaliyeti']);
      assert.doesNotMatch(cevap.body, /kisi|brut|22000/i);
    }
  });

  test('maliyet görünümü olmayan (planlama okuyucu) 403', async () => {
    const cerez = await islemliKisi('gsm_plan', ['plan.planlama-oku', 'plan.yaz']);
    assert.equal((await oku(cerez, '2026-01')).statusCode, 403);
  });
});
