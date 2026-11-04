import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { VergiBeyaniSatiri } from '#paylasilan/sozlesme/finans.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { vergiTakvimi } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('finans vergi beyanı (1846, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<'yonetici' | 'operator', string> = { yonetici: '', operator: '' };
  const bugun = tesisGunu(new Date());
  const gunEkle = (t: string, g: number): string => new Date(Date.parse(`${t}T00:00:00Z`) + g * 86_400_000).toISOString().slice(0, 10);
  // Geçmişte ve dönemi bitmemiş ileride birer gerçek son gün (kuraldan).
  const gecmis = vergiTakvimi(gunEkle(bugun, -60), gunEkle(bugun, -1))[0]!;
  const ileri = vergiTakvimi(gunEkle(bugun, 45), gunEkle(bugun, 100))[0]!;

  // Uç tekrar korumalıdır: her yazma kendi istek kimliğiyle gider (kimliksiz yazma VB-03'te reddedilir).
  async function istek<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, kimlik: string | null = randomUUID()): Promise<{ durum: number; govde: T }> {
    const headers: Record<string, string> = { cookie: cerez };
    if (yontem === 'POST' && kimlik !== null) headers[ISTEK_KIMLIGI_BASLIGI] = kimlik;
    const cevap = await app.inject({ method: yontem, url: `/api${url}`, headers, payload: payload as object | undefined });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  }
  const isaretle = (cerez: string, sonGun: string, kod: string, verildi: boolean) =>
    istek<unknown>(cerez, 'POST', '/finans/vergi-beyani/isaretle', { sonGun, kod, verildi });
  const oku = async (): Promise<VergiBeyaniSatiri[]> => {
    const r = await istek<{ satirlar: VergiBeyaniSatiri[] }>(c.yonetici, 'GET', `/finans/vergi-beyanlari?baslangic=${gunEkle(bugun, -60)}&bitis=${bugun}`);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return r.govde.satirlar;
  };
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('finans_vergi_beyani');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    const roller = (await istek<{ roller: { id: number; ad: string }[] }>(c.yonetici, 'GET', '/roller')).govde.roller;
    const operatorRolu = roller.find((r) => r.ad === 'Operatör')!.id;
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme operator', kullaniciAdi: 'operator', parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, operatorRolu);
      for (const r of kisi.roller) if (r.id !== operatorRolu) await rolAl(db, yoneticiId, id, r.id);
    });
    c.operator = await girisCerezi('operator');
  });
  after(async () => { await ortam?.kaldir(); });

  test('VB-01: finans.beyan-yaz olmayan işaretleyemez (403), okuyamaz da (finans.oku yok)', async () => {
    assert.equal((await isaretle(c.operator, gecmis.tarih, gecmis.kod, true)).durum, 403);
    assert.equal((await istek(c.operator, 'GET', `/finans/vergi-beyanlari?baslangic=${bugun}&bitis=${bugun}`)).durum, 403);
  });

  test('VB-02: geçmiş son gün işaretlenir; kişi ve zaman sunucudan; ikinci kez aynı sonuç; işaret kaldırılır', async () => {
    assert.ok((await oku()).every((s) => !s.verildi));
    assert.equal((await isaretle(c.yonetici, gecmis.tarih, gecmis.kod, true)).durum, 200);
    assert.equal((await isaretle(c.yonetici, gecmis.tarih, gecmis.kod, true)).durum, 200);
    const s = (await oku()).find((x) => x.sonGun === gecmis.tarih && x.kod === gecmis.kod)!;
    assert.deepEqual([s.verildi, s.isaretleyen], [true, 'Deneme Yönetici']);
    assert.ok(s.isaretleme !== null);
    assert.equal((await oku()).filter((x) => x.verildi).length, 1);
    assert.equal((await isaretle(c.yonetici, gecmis.tarih, gecmis.kod, false)).durum, 200);
    assert.ok((await oku()).every((x) => !x.verildi));
  });

  test('VB-03: kuralın son günü olmayan gün, bilinmeyen tür, dönemi bitmemiş beyan ve istek kimliksiz yazma reddedilir', async () => {
    const yanlisGun = gunEkle(gecmis.tarih, 1);
    assert.ok(!vergiTakvimi(yanlisGun, yanlisGun).some((v) => v.kod === gecmis.kod));
    assert.equal((await isaretle(c.yonetici, yanlisGun, gecmis.kod, true)).durum, 400);
    assert.equal((await isaretle(c.yonetici, gecmis.tarih, 'damga-vergisi', true)).durum, 400);
    assert.equal((await isaretle(c.yonetici, ileri.tarih, ileri.kod, true)).durum, 400);
    assert.equal((await istek(c.yonetici, 'POST', '/finans/vergi-beyani/isaretle', { sonGun: gecmis.tarih, kod: gecmis.kod, verildi: true }, null)).durum, 400);
    assert.ok((await oku()).every((x) => !x.verildi));
    assert.equal((await istek(c.yonetici, 'GET', `/finans/vergi-beyanlari?baslangic=${bugun}&bitis=${gunEkle(bugun, 401)}`)).durum, 400);
  });
});
