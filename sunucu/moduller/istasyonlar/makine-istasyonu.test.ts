import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 2902 (madde 6): istasyon seçilmeden eklenen makine, verilen iş merkezinde kendi kodu ve adıyla açılan istasyona bağlanır; ikisi tek işlemde.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Makine { id: number; kod: string; istasyonId: number | null }

describe('makine eklerken yeni istasyon (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let merkezId = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function istek<T = unknown>(yol: string, govde: unknown): Promise<Cevap<T>> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const istasyon = (kod: string) => o().vt.tek<{ id: number; ad: string; is_merkezi_id: number; kapasite_kaynagi: string; aktif: boolean }>(
    'SELECT id, ad, is_merkezi_id, kapasite_kaynagi, aktif FROM istasyon WHERE kod = $1', [kod]);
  const makineSayisi = async (kodlar: string[]) =>
    Number((await o().vt.tek<{ n: string }>('SELECT count(*)::text AS n FROM makine WHERE kod = ANY($1)', [kodlar]))?.n);

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_makine_istasyonu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Makine Yönetici', kullaniciAdi: 'mi-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'mi-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    const m = await istek<{ id: number }>('/is-merkezleri', { kod: 'MIM', ad: 'Deneme merkezi', aciklama: null });
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    merkezId = m.govde.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('tek makine: istasyon makinenin kodu ve adıyla açılır, makine ona bağlanır', async () => {
    const c = await istek<Makine>('/makineler', { kod: 'MIK-1', ad: 'Dik işleme', tur: null, istasyonId: null, yeniIstasyonIsMerkeziId: merkezId });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const ist = await istasyon('MIK-1');
    assert.ok(ist);
    assert.deepEqual({ ad: ist.ad, merkez: ist.is_merkezi_id, kaynak: ist.kapasite_kaynagi, aktif: ist.aktif },
      { ad: 'Dik işleme', merkez: merkezId, kaynak: 'makine', aktif: true });
    assert.equal(c.govde.istasyonId, ist.id);
    // Stok konumu istasyonla birlikte açılır (D3, karar 2903 a).
    assert.ok(await o().vt.tek('SELECT id FROM stok_konum WHERE istasyon_id = $1', [ist.id]));
  });

  test('istasyon ve yeni istasyon birlikte verilirse 400; hiçbir şey yazılmaz', async () => {
    const ist = await istasyon('MIK-1');
    const c = await istek('/makineler', { kod: 'MIK-2', ad: 'İki', tur: null, istasyonId: ist?.id, yeniIstasyonIsMerkeziId: merkezId });
    assert.equal(c.durum, 400);
    assert.equal(await makineSayisi(['MIK-2']), 0);
    assert.equal(await istasyon('MIK-2'), null);
  });

  test('istasyon kodu kullanılıyorsa 409; makine de yazılmaz', async () => {
    const i = await istek('/istasyonlar', {
      kod: 'MIK-3', ad: 'Var olan', isMerkeziId: merkezId, tip: 'talasli', sorumluKisiId: null, kapasiteKaynagi: 'makine', uretimAlani: false, aktif: true,
    });
    assert.equal(i.durum, 200, JSON.stringify(i.govde));
    const c = await istek('/makineler', { kod: 'MIK-3', ad: 'Çakışan', tur: null, istasyonId: null, yeniIstasyonIsMerkeziId: merkezId });
    assert.equal(c.durum, 409, JSON.stringify(c.govde));
    assert.equal(await makineSayisi(['MIK-3']), 0);
  });

  test('çoklu ekle: her makine kendi istasyonunu alır', async () => {
    const c = await istek<{ kod: string }[]>('/makineler/coklu-ekle', {
      kayitlar: [{ kod: 'MIC-1', ad: 'Torna 1' }, { kod: 'MIC-2', ad: 'Torna 2' }], tur: null, istasyonId: null, yeniIstasyonIsMerkeziId: merkezId,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const bagli = await o().vt.sorgu<{ mk: string; ik: string }>(
      'SELECT m.kod AS mk, i.kod AS ik FROM makine m JOIN istasyon i ON i.id = m.istasyon_id WHERE m.kod = ANY($1) ORDER BY m.kod', [['MIC-1', 'MIC-2']]);
    assert.deepEqual(bagli, [{ mk: 'MIC-1', ik: 'MIC-1' }, { mk: 'MIC-2', ik: 'MIC-2' }]);
  });

  test('Excel toplu kaydet: aynı dosyada açılan iş merkezi kodu yeni istasyona verilir', async () => {
    const c = await istek('/istasyonlar/toplu-kaydet', {
      satirlar: [
        { kayit: 'is-merkezi', islem: 'ekle', satir: 2, kod: 'MIM2', ad: 'Excel merkezi' },
        { kayit: 'makine', islem: 'ekle', satir: 3, kod: 'MIX-1', ad: 'Excel makinesi', yeniIstasyonIsMerkeziKodu: 'MIM2' },
      ],
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const ist = await istasyon('MIX-1');
    const merkez = await o().vt.tek<{ id: number }>("SELECT id FROM is_merkezi WHERE kod = 'MIM2'");
    assert.equal(ist?.is_merkezi_id, merkez?.id);
    assert.equal((await o().vt.tek<{ istasyon_id: number }>("SELECT istasyon_id FROM makine WHERE kod = 'MIX-1'"))?.istasyon_id, ist?.id);
  });
});
