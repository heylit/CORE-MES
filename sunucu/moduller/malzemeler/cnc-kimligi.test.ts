import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { cncKimligiBagla, cncKimlikliMalzemeler } from './disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';
const ONEK: Record<string, string> = { sarf: 'SF', demirbas: 'DB', hammadde: 'HM' };

describe('163 b: CNC kütüphane kimliği malzeme kartına bağlanır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  let sayac = 0;
  const govde = (kimlik: string, tur: string, ad: string, surum: number | null) => ({
    kayit: {
      id: kimlik, tur, ...(tur === 'hammadde' ? { fam: 'metal' } : {}),
      com: { kod: `${ONEK[tur] ?? 'SF'}-CNC-00001`, ad, birim: 'adet' }, ...(tur === 'hammadde' ? {} : { g: { kat: tur === 'sarf' ? 'takim' : 'elaleti' } }), onay: { durum: 'aktif' },
    },
    ozet: { benzersiz_anahtar: `${tur}|cnc|${kimlik}`, mukerrer_gerekcesi: null },
    surum,
  });
  async function kaydet(kimlik: string, tur: string, ad: string, surum: number | null): Promise<number> {
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const c = await app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: yonetici }, payload: (await surumlu(vt(), url, govde(kimlik, tur, ad, surum))) as object });
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as KatalogKartiKaydetCevabi).surum;
  }
  async function kartAc(tur = 'sarf'): Promise<{ kimlik: string; no: number; surum: number }> {
    const kimlik = `cnc${++sayac}`;
    const surum = await kaydet(kimlik, tur, `Takım ${kimlik}`, null);
    return { kimlik, no: (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no, surum };
  }
  const bagla = (no: number, kimlik: string | null) => vt().tx((db) => cncKimligiBagla(db, no, kimlik));
  const okut = (kimlikler: string[]) => vt().tx((db) => cncKimlikliMalzemeler(db, kimlikler));
  const hata = async (p: Promise<unknown>): Promise<string> => p.then(() => 'hata yok', (e: unknown) => (e as { kod?: string }).kod ?? String(e));

  before(async () => {
    ortam = await testVeritabaniKur('malzemecnckimligi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme CNC', kullaniciAdi: 'cnc-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'cnc-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const a = await app.inject({ method: 'POST', url: '/api/malzeme-katalogu-ayarlari/genel/kaydet', headers: { cookie: yonetici }, payload: (await surumlu(vt(), '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })) as object });
    assert.equal(a.statusCode, 200, a.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('bağ yazılır ve kimlikle okunur; bağsız kimlik haritada yok; kart kaydı bağı silmez', async () => {
    const k = await kartAc();
    assert.deepEqual(await bagla(k.no, 'em10'), { oncekiMalzemeId: null });
    const harita = await okut(['em10', 'yok1', 'em10']);
    assert.deepEqual([...harita.keys()], ['em10']);
    assert.deepEqual(harita.get('em10'), { malzemeId: k.no, kod: harita.get('em10')?.kod, ad: `Takım ${k.kimlik}`, birim: 'adet', onayDurumu: 'aktif' });
    assert.equal((await okut([])).size, 0);
    // Ekranın kart kaydı yalnız kendi alanlarını yazar; bağ kalır.
    await kaydet(k.kimlik, 'sarf', 'Takım yeni ad', k.surum);
    assert.equal((await okut(['em10'])).get('em10')?.ad, 'Takım yeni ad');
  });

  test('kimlik tekildir: başka karta bağlanınca öncekinden kalkar; null bağı kaldırır; demirbaş bağlanır', async () => {
    const a = await kartAc(), b = await kartAc('demirbas');
    await bagla(a.no, 'h40');
    assert.deepEqual(await bagla(b.no, 'h40'), { oncekiMalzemeId: a.no });
    assert.equal((await okut(['h40'])).get('h40')?.malzemeId, b.no);
    assert.equal((await vt().tek<{ k: string | null }>('SELECT cnc_kutuphane_kimligi AS k FROM malzeme_katalog_karti WHERE no = $1', [a.no]))?.k, null);
    // Kartın kimliği değişince eski kimlik boşa çıkar (kart başına tek kimlik).
    await bagla(b.no, 'h41');
    assert.deepEqual([...(await okut(['h40', 'h41'])).keys()], ['h41']);
    assert.deepEqual(await bagla(b.no, null), { oncekiMalzemeId: null });
    assert.equal((await okut(['h41'])).size, 0);
  });

  test('olmayan kart 404, hammadde 422; biçime uymayan kimlik kısıtta durur; kayıt değişmez', async () => {
    const h = await kartAc('hammadde');
    assert.equal(await hata(bagla(999999, 'em20')), 'BULUNAMADI');
    assert.equal(await hata(bagla(h.no, 'em20')), 'GECERSIZ');
    const s = await kartAc();
    for (const k of ['', 'a b', 'x'.repeat(65), 'ş1']) assert.notEqual(await hata(bagla(s.no, k)), 'hata yok', k);
    assert.equal((await okut(['em20'])).size, 0);
    assert.equal((await vt().tek<{ k: string | null }>('SELECT cnc_kutuphane_kimligi AS k FROM malzeme_katalog_karti WHERE no = $1', [s.no]))?.k, null);
  });
});
