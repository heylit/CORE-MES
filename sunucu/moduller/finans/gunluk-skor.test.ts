import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import type { FinansHamVerisi } from '#paylasilan/finans-motor/donustur.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isler } from './isler.ts';
import { gunlukSkorHesapla } from './kurallar.ts';

// 1456 b: günlük sağlık skorunu sunucu zamanlayıcısı yazar. Tarihler bugünden geriye kurulur (sabit tarih ay dönünce kırılır).
// Firmalar ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const IS = isler.find((i) => i.ad === 'finans-gunluk-skor')!;
const gunOnce = (gun: string, n: number): string => { const d = new Date(`${gun}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

describe('finans günlük skor zamanlayıcısı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const BUGUN = tesisGunu(new Date());

  async function istek<T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
    const basliklar: Record<string, string> = { cookie: cerez };
    if (yontem === 'POST' && /\/ekle$/.test(yol)) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    assert.equal(c.statusCode, 200, `${yontem} ${yol}: ${c.body}`);
    return c.json() as T;
  }
  const skorSatirlari = () => vt().sorgu<{ gun: string; skor: number; nakit: string | null; guncelleyen_id: number | null; guncelleme: string }>(
    "SELECT to_char(gun, 'YYYY-MM-DD') AS gun, skor, nakit::text AS nakit, guncelleyen_id, guncelleme::text AS guncelleme FROM finans_skor ORDER BY gun");

  // Ekranın okuduğu gibi: uçlardan, JSON olarak (istemcideki finansVerisiOku ile aynı liste).
  async function ekraninGordugu(): Promise<FinansHamVerisi> {
    const liste = async (yol: string) => (await istek<{ satirlar: unknown[] }>('GET', `${yol}?sayfaBoyu=200`)).satirlar;
    const ad = ['belgeler', 'odemeler', 'dagitimlar', 'mahsuplar', 'cekler', 'hesaplar', 'virmanlar', 'kurlar', 'kdv-oranlari', 'faizler', 'duzenli-odemeler', 'butce',
      'bakiye-esitlemeleri', 'oneri-durumlari', 'kapanis', 'skorlar', 'sabit-kiymetler'] as const;
    const anahtar = ['belgeler', 'odemeler', 'dagitimlar', 'mahsuplar', 'cekler', 'hesaplar', 'virmanlar', 'kurlar', 'kdvOranlari', 'faizler', 'duzenliOdemeler', 'butce',
      'esitlemeler', 'oneriler', 'kapanis', 'skorlar', 'sabitKiymetler'] as const;
    const l: Record<string, unknown[]> = {};
    for (const [i, a] of ad.entries()) l[anahtar[i]!] = await liste(`/finans/${a}`);
    return {
      ...(l as unknown as Pick<FinansHamVerisi, (typeof anahtar)[number]>),
      firmalar: await liste('/musteri-tedarikci/firmalar') as FinansHamVerisi['firmalar'],
      ayar: (await istek<{ ayar: FinansHamVerisi['ayar'] }>('GET', '/finans/ayar')).ayar,
      amortisman: (await istek<{ aylar: FinansHamVerisi['amortisman'] }>('GET', '/finans/amortisman')).aylar,
      kurOzeti: await istek<FinansHamVerisi['kurOzeti']>('GET', '/finans/kur-ozeti'),
      beklenenOdemeler: (await istek<{ odemeler: FinansHamVerisi['beklenenOdemeler'] }>('GET', '/finans/beklenen-odemeler')).odemeler,
      sirketAdi: null,
    };
  }

  before(async () => {
    ortam = await testVeritabaniKur('finansskor');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_finans', 'gecici_finans') RETURNING id");
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    for (const i of ['sayfa.finans', 'finans.oku', 'finans.yaz', 'finans.yonet', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz']) {
      await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, i]);
    }
    await vt().tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme Muhasebe', kullaniciAdi: 'muhasebe', parola: PAROLA });
      await rolAta(db, yoneticiId, k, rol.id); await rolAl(db, yoneticiId, k, yr.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'muhasebe', parola: PAROLA } });
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  test('kayıt yokken skor hesaplanamaz: satır yazılmaz, iş beklemede döner', async () => {
    assert.equal(await isiBirKezCalistir(vt(), IS), 'bekliyor');
    assert.deepEqual(await skorSatirlari(), []);
  });

  test('bugünün skoru kişisiz yazılır, ekranın aynı veriden hesapladığına eşittir; ikinci tur satıra dokunmaz', async () => {
    const firma = (await istek<{ firma: { id: number } }>('POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Firma', tur: 'ikisi' })).firma.id;
    const hesap = (await istek<{ hesap: { id: number } }>('POST', '/finans/hesaplar/ekle',
      { ad: 'Deneme Banka', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 50000, acilisTarihi: gunOnce(BUGUN, 200) })).hesap.id;
    for (const [n, yon, kategori, tutar] of [[150, 'gelir', 'urun_satisi', 40000], [120, 'gider', 'mal_alimi', 15000], [90, 'gelir', 'urun_satisi', 45000],
      [60, 'gider', 'kira', 8000], [30, 'gelir', 'urun_satisi', 52000], [10, 'gider', 'mal_alimi', 21000]] as const) {
      const tarih = gunOnce(BUGUN, n);
      const b = (await istek<{ belge: { id: number; toplam: string } }>('POST', '/finans/belgeler/ekle',
        { yon, kategori, firmaId: firma, belgeTarihi: tarih, vade: gunOnce(BUGUN, n - 20), tutar, kdvOrani: 20 })).belge;
      if (n > 20) {
        await istek('POST', '/finans/odemeler/ekle', { yon, firmaId: firma, tarih: gunOnce(BUGUN, n - 15), yontem: 'banka', hesapId: hesap, tutar: Number(b.toplam),
          dagitimlar: [{ belgeId: b.id, belgeTutari: Number(b.toplam) }] });
      }
    }
    const beklenen = gunlukSkorHesapla(await ekraninGordugu(), BUGUN);
    assert.ok(beklenen, 'ekran tarafı skor hesaplamalı');

    assert.equal(await isiBirKezCalistir(vt(), IS), 'tamam');
    const [satir, ...fazla] = await skorSatirlari();
    assert.deepEqual(fazla, []);
    assert.equal(satir?.gun, BUGUN);
    assert.equal(satir?.guncelleyen_id, null);
    assert.equal(satir?.skor, beklenen.skor);
    assert.equal(satir?.nakit, beklenen.nakit);
    assert.ok(satir.skor >= 0 && satir.skor <= 100);

    assert.equal(await isiBirKezCalistir(vt(), IS), 'tamam');
    assert.deepEqual(await skorSatirlari(), [satir]);
    const okunan = (await istek<{ satirlar: { gun: string; skor: number }[] }>('GET', '/finans/skorlar')).satirlar;
    assert.deepEqual(okunan.map((s) => [s.gun, s.skor]), [[BUGUN, satir.skor]]);
  });
});
