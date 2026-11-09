import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { TOPLU_KAYDET_EN_COK } from '#paylasilan/sozlesme/istasyonlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { gelenAlanlar, topluSirasi } from './kurallar.ts';

// 2627 (1/2 b, 2/2 c): Excel'den toplu kaydet. Tek transaction: bir satır reddedilirse hiçbiri yazılmaz; satır tek kayıt ucunun kuralıyla yazılır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string; alan?: string; ayrinti?: { satir?: number } }

describe('toplu kaydet kuralları (saf)', () => {
  test('üst kayıt önce yazılır, aynı türde sıra korunur', () => {
    const satirlar = [{ kayit: 'makine' as const, n: 1 }, { kayit: 'istasyon' as const, n: 2 }, { kayit: 'is-merkezi' as const, n: 3 }, { kayit: 'istasyon' as const, n: 4 }];
    assert.deepEqual(topluSirasi(satirlar).map((x) => [x.satir.n, x.sira]), [[3, 2], [2, 1], [4, 3], [1, 0]]);
  });
  test('gönderilmeyen alan güncellemeye girmez', () => {
    assert.deepEqual(gelenAlanlar({ ad: 'Yeni', aciklama: undefined, aktif: false }), { ad: 'Yeni', aktif: false });
  });
});

describe('istasyonlar toplu kaydet (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let yoneticiId = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function istek<T = unknown>(cerez: string, yol: string, govde: unknown, kimlik: string | null = randomUUID()): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: 'POST', url: `/api${yol}`, payload: govde as object,
      headers: { cookie: cerez, ...(kimlik === null ? {} : { 'istek-kimligi': kimlik }) },
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const toplu = <T = unknown>(satirlar: unknown[], kimlik?: string | null, cerez = yonetici) =>
    istek<T>(cerez, '/istasyonlar/toplu-kaydet', { satirlar }, kimlik);
  const tekYaz = async <T>(yol: string, govde: unknown): Promise<T> => {
    const c = await istek<T>(yonetici, yol, govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde;
  };
  let sayac = 0;
  const kod = (onek: string): string => `${onek}-T${(sayac += 1)}`;
  const say = async (tablo: 'is_merkezi' | 'istasyon' | 'makine', kodlar: string[]): Promise<number> =>
    Number((await o().vt.tek<{ n: string }>(`SELECT count(*)::text AS n FROM ${tablo} WHERE kod = ANY($1)`, [kodlar]))?.n);

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_toplu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Toplu Yönetici', kullaniciAdi: 'toplu-yonetici', parola: PAROLA }));
    const operatorRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!operatorRolu || !yoneticiRolu) throw new Error('rol yok');
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Toplu Operatör', kullaniciAdi: 'toplu-operator', parola: PAROLA });
      await rolAta(db, yoneticiId, id, operatorRolu.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
    });
    yonetici = await girisCerezi('toplu-yonetici');
    operator = await girisCerezi('toplu-operator');
  });
  after(async () => { await ortam?.kaldir(); });

  test('aynı istekte açılan iş merkezine istasyon, istasyona makine kodla bağlanır; kod büyük/küçük harf ve baş/son boşluktan bağımsızdır', async () => {
    const [im, is, mk] = [kod('IM'), kod('IS'), kod('MK')];
    const c = await toplu<{ eklenen: number; guncellenen: number }>([
      { kayit: 'makine', islem: 'ekle', satir: 4, kod: mk, ad: 'Deneme makine', istasyonKodu: ` ${is.toLowerCase()} ` },
      { kayit: 'istasyon', islem: 'ekle', satir: 3, kod: is, ad: 'Deneme istasyon', isMerkeziKodu: im, kapasiteKaynagi: 'makine' },
      { kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: im, ad: 'Deneme merkez' },
    ]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde, { eklenen: 3, guncellenen: 0 });
    const bag = await o().vt.tek<{ merkez: string; istasyon: string }>(
      `SELECT m.kod AS merkez, i.kod AS istasyon FROM makine k JOIN istasyon i ON i.id = k.istasyon_id JOIN is_merkezi m ON m.id = i.is_merkezi_id WHERE k.kod = $1`, [mk],
    );
    assert.deepEqual(bag, { merkez: im, istasyon: is });
  });

  test('güncellemede gönderilmeyen alan değişmez; sürüm okunan sürümdür', async () => {
    const m = await tekYaz<{ id: number; surum: number }>('/is-merkezleri', { kod: kod('IM'), ad: 'Eski ad', aciklama: 'Kalan açıklama' });
    const c = await toplu([{ kayit: 'is-merkezi', islem: 'guncelle', satir: 2, id: m.id, surum: m.surum, ad: 'Yeni ad' }]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(await o().vt.tek('SELECT ad, aciklama, aktif FROM is_merkezi WHERE id = $1', [m.id]), { ad: 'Yeni ad', aciklama: 'Kalan açıklama', aktif: true });
  });

  test('tek hatalı satır bütün isteği reddeder; hata satırın yerini ve numarasını taşır', async () => {
    const [im, is] = [kod('IM'), kod('IS')];
    const c = await toplu<Hata>([
      { kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: im, ad: 'Yazılmayacak' },
      { kayit: 'istasyon', islem: 'ekle', satir: 3, kod: is, ad: 'Bağsız', isMerkeziKodu: 'YOK-BOYLE-KOD' },
    ]);
    assert.equal(c.durum, 400, JSON.stringify(c.govde));
    assert.equal(c.govde.alan, 'satirlar.1.isMerkeziKodu');
    assert.equal(c.govde.ayrinti?.satir, 3);
    assert.match(c.govde.mesaj, /^Satır 3: /);
    assert.equal(await say('is_merkezi', [im]), 0);
    assert.equal(await say('istasyon', [is]), 0);
  });

  test('eski sürüm (409), olmayan kayıt (404) ve tek kayıt ucunun kuralı bütün dosyayı reddeder', async () => {
    const m = await tekYaz<{ id: number; surum: number }>('/is-merkezleri', { kod: kod('IM'), ad: 'Sürüm' });
    await tekYaz('/is-merkezleri/' + String(m.id) + '/guncelle', { kod: `${kod('IM')}`, ad: 'Arada değişti', surum: m.surum });
    const yeni = kod('IM');
    const eski = await toplu<Hata>([
      { kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: yeni, ad: 'Yazılmayacak' },
      { kayit: 'is-merkezi', islem: 'guncelle', satir: 3, id: m.id, surum: m.surum, ad: 'Ezmeye çalışan' },
    ]);
    assert.equal(eski.durum, 409, JSON.stringify(eski.govde));
    assert.equal(eski.govde.ayrinti?.satir, 3);
    assert.equal(await say('is_merkezi', [yeni]), 0);

    const yok = await toplu<Hata>([{ kayit: 'makine', islem: 'guncelle', satir: 5, id: 999_999, surum: 1, ad: 'Yok' }]);
    assert.equal(yok.durum, 404, JSON.stringify(yok.govde));
    assert.deepEqual([yok.govde.alan, yok.govde.ayrinti?.satir], ['satirlar.0', 5]);

    // Pasif iş merkezine istasyon açılmaz (tek kayıt ucunun kuralı).
    const pasif = await tekYaz<{ id: number; kod: string }>('/is-merkezleri', { kod: kod('IM'), ad: 'Pasif', aktif: false });
    const kural = await toplu<Hata>([{ kayit: 'istasyon', islem: 'ekle', satir: 2, kod: kod('IS'), ad: 'Pasife', isMerkeziKodu: pasif.kod }]);
    assert.equal(kural.durum, 400, JSON.stringify(kural.govde));
  });

  test('ret iletisi yalnız satırın kendi iletisidir; başka kaydın adı geçmez (Güvenlik T4)', async () => {
    const var_ = await tekYaz<{ kod: string }>('/is-merkezleri', { kod: kod('IM'), ad: 'Gizli Kalacak Ad' });
    const c = await toplu<Hata>([{ kayit: 'is-merkezi', islem: 'ekle', satir: 7, kod: var_.kod, ad: 'Çakışan' }]);
    assert.equal(c.durum, 409, JSON.stringify(c.govde));
    assert.equal(c.govde.mesaj, 'Satır 7: Bu kod kullanılıyor.');
    assert.doesNotMatch(JSON.stringify(c.govde), /Gizli Kalacak Ad/);
  });

  test('yazma yetkisi olmayan reddedilir; hiçbir satır yazılmaz', async () => {
    const im = kod('IM');
    const c = await toplu([{ kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: im, ad: 'Yetkisiz' }], undefined, operator);
    assert.equal(c.durum, 403, JSON.stringify(c.govde));
    assert.equal(await say('is_merkezi', [im]), 0);
  });

  test('gövde sıkıdır: bilinmeyen alan, boş dizi, sınır üstü satır ve aynı kod iki kez reddedilir', async () => {
    const bilinmeyen = await toplu([{ kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: kod('IM'), ad: 'X', rolId: 1 }]);
    assert.equal(bilinmeyen.durum, 400);
    assert.equal((await toplu([])).durum, 400);
    const cok = Array.from({ length: TOPLU_KAYDET_EN_COK + 1 }, (_, i) => ({ kayit: 'is-merkezi', islem: 'ekle', satir: i + 2, kod: `C-${i}`, ad: 'Çok' }));
    assert.equal((await toplu(cok)).durum, 400);
    const ayni = kod('IM');
    const iki = await toplu([
      { kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: ayni, ad: 'Bir' },
      { kayit: 'is-merkezi', islem: 'ekle', satir: 3, kod: ayni.toLowerCase(), ad: 'İki' },
    ]);
    assert.equal(iki.durum, 400);
    // Güncellemede boş değer gönderilemez: alan toplu girişle boşaltılmaz.
    const bos = await toplu([{ kayit: 'makine', islem: 'guncelle', satir: 2, id: 1, surum: 1, seriNo: null }]);
    assert.equal(bos.durum, 400);
  });

  test('istek kimliği zorunludur; aynı kimlik ikinci kez yazmaz, ilk cevabı döner (Güvenlik T3)', async () => {
    const im = kod('IM');
    const satirlar = [{ kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: im, ad: 'Bir kez' }];
    assert.notEqual((await toplu(satirlar, null)).durum, 200);
    const kimlik = randomUUID();
    const ilk = await toplu(satirlar, kimlik);
    const ikinci = await toplu(satirlar, kimlik);
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.deepEqual(ikinci, ilk);
    assert.equal(await say('is_merkezi', [im]), 1);
  });

  test('değişiklik defteri her satırı ayrı ve yazan kişiyle tutar (Güvenlik T5)', async () => {
    const a = await tekYaz<{ id: number; surum: number }>('/makineler', { kod: kod('MK'), ad: 'Defter A' });
    const b = await tekYaz<{ id: number; surum: number }>('/makineler', { kod: kod('MK'), ad: 'Defter B' });
    const c = await toplu([
      { kayit: 'makine', islem: 'guncelle', satir: 2, id: a.id, surum: a.surum, markaModel: 'Yeni model' },
      { kayit: 'makine', islem: 'guncelle', satir: 3, id: b.id, surum: b.surum, seriNo: 'S-1' },
    ]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const defter = await o().sahip.sorgu<{ id: number; kisi_id: number }>(
      "SELECT (anahtar->>'id')::int AS id, kisi_id FROM denetim_degisiklik WHERE tablo = 'makine' AND islem = 'guncelle' AND (anahtar->>'id')::int = ANY($1) ORDER BY id",
      [[a.id, b.id]],
    );
    assert.deepEqual(defter.map((d) => d.id).sort(), [a.id, b.id].sort());
    assert.ok(defter.every((d) => d.kisi_id === yoneticiId));
  });
});
