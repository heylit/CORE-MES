import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KmSurumCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
type Govde = Record<string, unknown>;

// Soru 228 a (23.10.2026): uygulamanın "Arşive al" komutu kapanmış, sonuçlanmış ve onaylı kaydı yalnız `arsiv` bayrağıyla yeniden
// yazar. Kilit içeriği korur, arşivlemeyi engellemez; arşivlemeyi yalnız yönetici yapar.
describe('Kalite Merkezi arşiv ve yetki (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c = { yon: '', kal: '' };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerez: string, url: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api/kalite-merkezi/kayitlar/${url}`, headers: { cookie: cerez }, payload: govde as object });
  async function tamam(cerez: string, url: string, govde: unknown): Promise<KmSurumCevabi> {
    const r = await istek(cerez, url, govde);
    assert.equal(r.statusCode, 200, `${url}: ${r.body}`);
    return r.json() as KmSurumCevabi;
  }
  async function ret(durum: number, cerez: string, url: string, govde: unknown): Promise<void> {
    const r = await istek(cerez, url, govde);
    assert.equal(r.statusCode, durum, `${url}: ${r.body}`);
  }
  const kayit = async (koleksiyon: string, kimlik: string): Promise<{ govde: Govde; surum: number } | null> => {
    const s = await vt().tek<{ govde: Govde; surum: string }>('SELECT govde, surum FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND kimlik = $2', [koleksiyon, kimlik]);
    return s === null ? null : { govde: s.govde, surum: Number(s.surum) };
  };
  async function girisYap(kullaniciAdi: string, rolKodu: string | null, aktor: number | null): Promise<{ id: number; cerez: string }> {
    const rol = async (kod: string) => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && aktor !== null) {
        await rolAta(db, aktor, yeni, await rol(rolKodu));
        await rolAl(db, aktor, yeni, await rol('yonetici'));
      }
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }

  // Kilitli kayıtlar uygulamanın yoluyla kurulur: kapanış ve form onayı onay ucundan, sonuç ve lot kararı kayıt yazmadan.
  async function kilitliKayitlar(on: string): Promise<[string, string, Govde, number][]> {
    const ncrAcik = { no: `${on}-NCR`, durum: 'Açık', mrb: 'Karar bekliyor', guncelleme: '2024-01-01T00:00:00.000Z' };
    const ncr1 = await tamam(c.yon, `ncr/${on}_ncr/yaz`, { govde: ncrAcik, surum: null });
    const ncr = { ...ncrAcik, durum: 'Kapalı', mrb: 'Hurda' };
    const ncr2 = await tamam(c.yon, `ncr/${on}_ncr/onayla`, { govde: ncr, surum: ncr1.surum });
    const capa1 = await tamam(c.yon, `capa/${on}_capa/yaz`, { govde: { no: `${on}-DOF`, durum: 'Açık', adim: 8 }, surum: null });
    const capa = { no: `${on}-DOF`, durum: 'Kapalı', adim: 8, acilis: '2024-01-01' };
    const capa2 = await tamam(c.yon, `capa/${on}_capa/onayla`, { govde: capa, surum: capa1.surum });
    const insp = { no: `${on}-MUA`, sonuc: 'Ret', tarih: '2024-01-01', chars: [{ ad: 'Çap', olcum: '10.02' }] };
    const insp1 = await tamam(c.kal, `insp/${on}_insp/yaz`, { govde: insp, surum: null });
    const lot = { no: `${on}-LOT`, karar: 'Kabul', tarih: '2024-01-01' };
    const lot1 = await tamam(c.kal, `lot/${on}_lot/yaz`, { govde: lot, surum: null });
    const frm1 = await tamam(c.kal, `frm/${on}_frm/yaz`, { govde: { kod: 'KF-01', durum: 'Onay bekliyor', cevaplar: { a: 1 } }, surum: null });
    await tamam(c.yon, `frm/${on}_frm/onayla`, { govde: { kod: 'KF-01', durum: 'Onaylandı', cevaplar: { a: 1 } }, surum: frm1.surum });
    const frm = await kayit('frm', `${on}_frm`);
    return [
      ['ncr', `${on}_ncr`, ncr, ncr2.surum], ['capa', `${on}_capa`, capa, capa2.surum], ['insp', `${on}_insp`, insp, insp1.surum],
      ['lot', `${on}_lot`, lot, lot1.surum], ['frm', `${on}_frm`, frm!.govde, frm!.surum],
    ];
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_arsiv_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yon = await girisYap('kma-yon', null, null);
    c.yon = yon.cerez;
    c.kal = (await girisYap('kma-kalite', 'kalite', yon.id)).cerez;
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('Soru 228 a: yönetici kapanmış NCR ve DÖF, sonuçlu muayene, kararlı lot ve onaylı formu arşive alır; içerik aynı kalır', async () => {
    for (const [koleksiyon, kimlik, govde, surum] of await kilitliKayitlar('a1')) {
      const arsivli = { ...govde, arsiv: true, guncelleme: '2026-10-23T10:00:00.000Z' };
      const yazilan = await tamam(c.yon, `${koleksiyon}/${kimlik}/yaz`, { govde: arsivli, surum });
      assert.deepEqual(await kayit(koleksiyon, kimlik), { govde: arsivli, surum: yazilan.surum }, koleksiyon);
    }
  });

  test('Soru 228 a: arşiv kilidi açmaz; arşivle birlikte ya da arşivden sonra içerik değişikliği ve silme 409, kayıt değişmez', async () => {
    for (const [koleksiyon, kimlik, govde, surum] of await kilitliKayitlar('a2')) {
      await ret(409, c.yon, `${koleksiyon}/${kimlik}/yaz`, { govde: { ...govde, arsiv: true, not: 'ek' }, surum });
      await ret(409, c.yon, `${koleksiyon}/${kimlik}/yaz`, { govde: { ...govde, arsiv: { not: 'ek' } }, surum });
      const arsivli = await tamam(c.yon, `${koleksiyon}/${kimlik}/yaz`, { govde: { ...govde, arsiv: true }, surum });
      await ret(409, c.yon, `${koleksiyon}/${kimlik}/yaz`, { govde: { ...govde, arsiv: true, not: 'ek' }, surum: arsivli.surum });
      await ret(409, c.yon, `${koleksiyon}/${kimlik}/sil`, { surum: arsivli.surum });
      assert.deepEqual(await kayit(koleksiyon, kimlik), { govde: { ...govde, arsiv: true }, surum: arsivli.surum }, koleksiyon);
    }
  });

  test('Soru 228 a: yönetici olmayan kalite personeli kilitli kaydı arşive alamaz (403), kayıt değişmez', async () => {
    for (const [koleksiyon, kimlik, govde, surum] of await kilitliKayitlar('a3')) {
      await ret(403, c.kal, `${koleksiyon}/${kimlik}/yaz`, { govde: { ...govde, arsiv: true }, surum });
      assert.deepEqual(await kayit(koleksiyon, kimlik), { govde, surum }, koleksiyon);
    }
  });
});
