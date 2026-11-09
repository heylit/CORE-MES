import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { KISI_TOPLU_EN_COK } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';
import { ILETILER } from './kurallar.ts';

// 2627 (1/2 b, 2/2 c): Personel sayfasına Excel'den toplu giriş. Tek transaction; satır tek kişi ekleme/düzenleme kuralıyla yazılır.
// Sentetik veri: gerçek ad ya da sicil yok.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string; alan?: string; ayrinti?: { satir?: number } }
interface KisiSatiri { id: number; ad: string; sicil_no: string | null; gorev: string | null; surum: number }

describe('kişiler toplu kaydet (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let ik = '';
  let yoneticiId = 0;
  let ikId = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function toplu<T = unknown>(satirlar: unknown, kimlik: string | null = randomUUID(), cerez = yonetici): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: 'POST', url: '/api/kisiler/toplu-kaydet', payload: { satirlar } as object,
      headers: { cookie: cerez, ...(kimlik === null ? {} : { 'istek-kimligi': kimlik }) },
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  let sayac = 0;
  const sicil = (): string => `TS-${(sayac += 1)}`;
  const kisiAc = async (ad: string, s: string | null = sicil(), gorev: string | null = 'Deneme görevi'): Promise<KisiSatiri> =>
    (await o().vt.tek<KisiSatiri>('INSERT INTO kisi (ad, sicil_no, gorev) VALUES ($1, $2, $3) RETURNING id, ad, sicil_no, gorev, surum', [ad, s, gorev]))!;
  const satir = (id: number) => o().vt.tek<KisiSatiri>('SELECT id, ad, sicil_no, gorev, surum FROM kisi WHERE id = $1', [id]);
  const sicilliSay = async (siciller: string[]) =>
    Number((await o().vt.tek<{ n: string }>('SELECT count(*)::text AS n FROM kisi WHERE sicil_no = ANY($1)', [siciller]))?.n);

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_toplu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Toplu Yönetici', kullaniciAdi: 'toplu-yonetici', parola: PAROLA }));
    const operatorRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const ikRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'insan_kaynaklari'");
    if (!operatorRolu || !yoneticiRolu || !ikRolu) throw new Error('rol yok');
    // Bayraksız yazar: kisiler.yaz taşır ama bütün işlemleri veren rolü yoktur.
    ikId = await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Toplu İK', kullaniciAdi: 'toplu-ik', parola: PAROLA });
      await rolAta(db, yoneticiId, id, ikRolu.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Toplu Operatör', kullaniciAdi: 'toplu-operator', parola: PAROLA });
      await rolAta(db, yoneticiId, id, operatorRolu.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
    });
    yonetici = await girisCerezi('toplu-yonetici');
    operator = await girisCerezi('toplu-operator');
    ik = await girisCerezi('toplu-ik');
  });
  after(async () => { await ortam?.kaldir(); });

  test('ekleme ve güncelleme tek istekte; güncellemede gönderilmeyen alan değişmez', async () => {
    const k = await kisiAc('Eski Ad');
    const yeniSicil = sicil();
    const c = await toplu<{ eklenen: number; guncellenen: number }>([
      { islem: 'ekle', satir: 2, ad: 'Yeni Kişi', sicilNo: yeniSicil, gorev: 'Tornacı' },
      { islem: 'guncelle', satir: 3, id: k.id, surum: k.surum, ad: 'Yeni Ad' },
    ]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde, { eklenen: 1, guncellenen: 1 });
    assert.equal(await sicilliSay([yeniSicil]), 1);
    const sonra = await satir(k.id);
    assert.deepEqual({ ad: sonra?.ad, sicil: sonra?.sicil_no, gorev: sonra?.gorev }, { ad: 'Yeni Ad', sicil: k.sicil_no, gorev: 'Deneme görevi' });
  });

  test('tek hatalı satır bütün isteği reddeder; ret satır numarasını ve yerini taşır, başka kişinin adı geçmez', async () => {
    const var1 = await kisiAc('Sicil Sahibi');
    const yeni = sicil();
    const c = await toplu<Hata>([
      { islem: 'ekle', satir: 2, ad: 'Yazılmayacak', sicilNo: yeni },
      { islem: 'ekle', satir: 5, ad: 'Çakışan', sicilNo: var1.sicil_no?.toLowerCase() },
    ]);
    assert.equal(c.durum, 409, JSON.stringify(c.govde));
    assert.equal(c.govde.mesaj, `Satır 5: ${ILETILER.sicilVar}`);
    assert.equal(c.govde.ayrinti?.satir, 5);
    assert.equal(await sicilliSay([yeni]), 0);
  });

  test('eski sürüm 409, olmayan kişi 404; özlüğü İK\'da olan kişi düzenlenmez', async () => {
    const k = await kisiAc('Sürümlü');
    assert.equal((await toplu([{ islem: 'guncelle', satir: 2, id: k.id, surum: k.surum + 1, ad: 'X' }])).durum, 409);
    const yok = await toplu<Hata>([{ islem: 'guncelle', satir: 4, id: 2147483000, surum: 1, ad: 'X' }]);
    assert.equal(yok.durum, 404);
    assert.equal(yok.govde.ayrinti?.satir, 4);
    const ik = await kisiAc('İK Kişisi');
    await o().vt.sorgu('UPDATE kisi SET ozluk_ik = true WHERE id = $1', [ik.id]);
    const ikSurum = (await satir(ik.id))!.surum;
    const red = await toplu<Hata>([{ islem: 'guncelle', satir: 3, id: ik.id, surum: ikSurum, gorev: 'Değişmez' }]);
    assert.equal(red.durum, 422, JSON.stringify(red.govde));
    assert.equal(red.govde.mesaj, `Satır 3: ${ILETILER.ozlukIkte}`);
    assert.equal((await satir(ik.id))?.gorev, 'Deneme görevi');
  });

  test('kisiler.yaz olmayan reddedilir; hiçbir satır yazılmaz', async () => {
    const s = sicil();
    const c = await toplu<Hata>([{ islem: 'ekle', satir: 2, ad: 'Yetkisiz', sicilNo: s }], randomUUID(), operator);
    assert.equal(c.durum, 403);
    assert.equal(await sicilliSay([s]), 0);
  });

  test('gövde sıkıdır: rol, hesap ya da parola alanı, boş dizi, sınır üstü satır, aynı kişi iki kez ve güncellemede null reddedilir', async () => {
    const k = await kisiAc('Sıkı');
    for (const satirlar of [
      [{ islem: 'ekle', satir: 2, ad: 'Rollü', rolId: 1 }],
      [{ islem: 'ekle', satir: 2, ad: 'Hesaplı', kullaniciAdi: 'x', parola: 'y' }],
      [],
      Array.from({ length: KISI_TOPLU_EN_COK + 1 }, (_, i) => ({ islem: 'ekle', satir: i + 2, ad: 'Çok' })),
      [{ islem: 'guncelle', satir: 2, id: k.id, surum: k.surum, ad: 'A' }, { islem: 'guncelle', satir: 3, id: k.id, surum: k.surum, ad: 'B' }],
      [{ islem: 'guncelle', satir: 2, id: k.id, surum: k.surum, sicilNo: null }],
      [{ islem: 'ekle', satir: 2, ad: 'Bir', sicilNo: 'TS-AYNI' }, { islem: 'ekle', satir: 3, ad: 'İki', sicilNo: ' ts-ayni ' }],
    ]) assert.equal((await toplu(satirlar)).durum, 400, JSON.stringify(satirlar).slice(0, 120));
    assert.equal((await satir(k.id))?.ad, 'Sıkı');
  });

  test('istek kimliği zorunludur; aynı kimlik ikinci kez kişi açmaz', async () => {
    const s = sicil();
    const satirlar = [{ islem: 'ekle', satir: 2, ad: 'Tek Kez', sicilNo: s }];
    assert.equal((await toplu(satirlar, null)).durum, 400);
    const kimlik = randomUUID();
    const ilk = await toplu(satirlar, kimlik);
    assert.equal(ilk.durum, 200);
    assert.deepEqual(await toplu(satirlar, kimlik), ilk);
    assert.equal(await sicilliSay([s]), 1);
  });

  test('bayraksız yazar bayraklı kişinin kaydını toplu girişle de değiştiremez; aynı istekteki diğer satır da yazılmaz', async () => {
    const diger = await kisiAc('Bayraksız Hedef');
    const hedef = (await satir(yoneticiId))!;
    const red = await toplu<Hata>([
      { islem: 'guncelle', satir: 2, id: diger.id, surum: diger.surum, gorev: 'Yazılmayacak' },
      { islem: 'guncelle', satir: 3, id: hedef.id, surum: hedef.surum, gorev: 'Değişmez' },
    ], randomUUID(), ik);
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    assert.equal(red.govde.mesaj, `Satır 3: ${ILETILER.bayrakliKaydiYetkisiz}`);
    assert.equal((await satir(diger.id))?.gorev, 'Deneme görevi');
    assert.equal((await satir(yoneticiId))?.gorev, hedef.gorev);
  });

  test('toplu güncelleme kişi değişiklik defterine satır başına, eski ve yeni değerle ve yazan kişiyle düşer', async () => {
    const a = await kisiAc('Defter A');
    const b = await kisiAc('Defter B');
    const c = await toplu([
      { islem: 'guncelle', satir: 2, id: a.id, surum: a.surum, gorev: 'Freze' },
      { islem: 'guncelle', satir: 3, id: b.id, surum: b.surum, ad: 'Defter B2' },
    ], randomUUID(), ik);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const defter = (id: number) => o().sahip.sorgu<{ islem: string; kisi_id: number | null; alanlar: Record<string, { eski: unknown; yeni: unknown }> }>(
      "SELECT islem, kisi_id, alanlar FROM denetim_degisiklik WHERE tablo = 'kisi' AND anahtar = $1::jsonb ORDER BY id", [JSON.stringify({ id })]);
    assert.deepEqual(await defter(a.id), [{ islem: 'guncelle', kisi_id: ikId, alanlar: { gorev: { eski: 'Deneme görevi', yeni: 'Freze' } } }]);
    assert.deepEqual(await defter(b.id), [{ islem: 'guncelle', kisi_id: ikId, alanlar: { ad: { eski: 'Defter B', yeni: 'Defter B2' } } }]);
  });
});
