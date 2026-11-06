import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { okumaListesiCevabi } from '#paylasilan/sozlesme/denetim.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { denetimYaz } from './disari.ts';
import { isler } from './isler.ts';

// Kart 2158 (2158-4 a, 2158-8 a): sınırlı hesabın okuma kaydı uçtan uca. Kişi adları ve numaralar uydurmadır.
const PAROLA = 'dogru-parola-1';
const ARAMA = 'Deneme Aranan 12345678901';

describe('sınırlı hesabın okuma kaydı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let ipSayaci = 0;
  let denetciId = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function iste(kisi: string, yol: string) {
    ipSayaci += 1;
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerezler.get(kisi) ?? '' }, remoteAddress: `10.8.0.${ipSayaci & 255}` });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as unknown };
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    ipSayaci += 1;
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA }, remoteAddress: `10.8.1.${ipSayaci & 255}` });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  const satirlar = () => o().vt.sorgu<{ kisi_id: number; modul: string | null; yol: string; metin: string }>(
    'SELECT kisi_id, modul, yol, row_to_json(k)::text AS metin FROM okuma_kaydi k ORDER BY id',
  );

  before(async () => {
    ortam = await testVeritabaniKur('denetim_okuma_kaydi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const roller = await ortam.vt.sorgu<{ id: number; kod: string }>("SELECT id, kod FROM rol WHERE kod IN ('yonetici', 'planlama_proje')");
    const rol = (kod: string): number => roller.find((r) => r.kod === kod)?.id ?? 0;
    await ortam.vt.tx(async (db) => {
      const yonetici = await yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA });
      denetciId = await yoneticiOlustur(db, { ad: 'Deneme Denetci', kullaniciAdi: 'denetci', parola: PAROLA });
      await rolAta(db, yonetici, denetciId, rol('planlama_proje'));
      await rolAl(db, yonetici, denetciId, rol('yonetici'));
      await db.sorgu(
        "UPDATE kisi SET hesap_turu = 'sinirli', sinirli_bitis = CURRENT_DATE + 30, sinirli_sorumlu_id = $2, gizlilik_taahhudu = now() WHERE id = $1",
        [denetciId, yonetici],
      );
    });
    await giris('yonetici');
    await giris('denetci');
  });
  after(async () => { await ortam?.kaldir(); });

  test('sınırlı hesabın okuması yol ve modülle yazılır; arama metni kayda girmez; oturum ve iç hesap okuması yazılmaz', async () => {
    assert.equal((await iste('denetci', '/oturum')).durum, 200);
    assert.equal((await iste('yonetici', '/kisiler')).durum, 200);
    assert.deepEqual(await satirlar(), []);

    assert.equal((await iste('denetci', `/kisiler/secim-ara?q=${encodeURIComponent(ARAMA)}`)).durum, 200);
    const yazilan = await satirlar();
    assert.equal(yazilan.length, 1);
    assert.equal(yazilan[0]?.kisi_id, denetciId);
    assert.equal(yazilan[0]?.yol, '/kisiler/secim-ara');
    assert.equal(yazilan[0]?.modul, 'kisiler');
    const metin = yazilan[0]?.metin ?? '';
    for (const parca of ['Deneme', 'Aranan', '12345678901']) assert.equal(metin.includes(parca), false, `${parca}: ${metin}`);
    assert.match(metin, /"q": ?"\[gizli\]"/);
  });

  test('denetim.oku olan okuma listesini kişi süzgeciyle görür; sınırlı hesap göremez (403)', async () => {
    const liste = await iste('yonetici', `/denetim-okumalari?kisi=${String(denetciId)}`);
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    const cevap = okumaListesiCevabi.parse(liste.govde);
    assert.ok(cevap.satirlar.length >= 1);
    assert.ok(cevap.satirlar.every((s) => s.kisiId === denetciId && s.kisiAd === 'Deneme Denetci'));
    assert.ok(cevap.satirlar.some((s) => s.yol === '/kisiler/secim-ara'));
    assert.equal((await iste('denetci', '/denetim-okumalari')).durum, 403);
  });

  test('kayıt değiştirilemez, boşaltılamaz, süresi dolmadan silinemez; günlük iş yalnız 730 günü geçeni siler', async () => {
    const vt = o().vt;
    await assert.rejects(vt.sorgu("UPDATE okuma_kaydi SET yol = '/x'"));
    await assert.rejects(vt.sorgu('DELETE FROM okuma_kaydi'), /saklama süresi dolmadan/);
    await assert.rejects(o().sahip.sorgu('TRUNCATE okuma_kaydi'));
    await vt.sorgu(
      "INSERT INTO okuma_kaydi (zaman, kisi_id, yol) VALUES (now() - interval '731 days', $1, '/eski'), (now() - interval '729 days', $1, '/sinirda')",
      [denetciId],
    );
    const is = isler.find((i) => i.ad === 'denetim-okuma-saklama');
    assert.ok(is?.calis);
    await vt.tx((db) => is.calis!(db, { uyar: () => undefined, hata: () => undefined }));
    const yollar = (await satirlar()).map((s) => s.yol);
    assert.equal(yollar.includes('/eski'), false);
    assert.equal(yollar.includes('/sinirda'), true);
    assert.equal(yollar.includes('/kisiler/secim-ara'), true);
  });
});
