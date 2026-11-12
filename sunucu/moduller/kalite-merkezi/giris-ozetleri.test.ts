import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kmGirisBekleyenCevabi, kmGirisCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { malKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { girisOzetleri } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 3148: malzeme etiketinin (3120) okuduğu GKK özeti; GKK'sız satır yok, kararı bekleyen ve hatalısız GKK'da karar null, red NCR'siyle.
describe('Kalite Merkezi GKK özetleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sira = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function giris(kullaniciAdi: string): Promise<void> {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerezler.set(kullaniciAdi, String(r.headers['set-cookie']).split(';')[0] ?? '');
  }

  const istek = (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    ...(govde === undefined ? {} : { payload: govde as object }),
  });

  async function kart(): Promise<number> {
    sira += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, 'hammadde', 'GKO-DNM-', $2, 'aktif', $3, $4, $4, true) RETURNING no`,
      [`gko-dnm-${sira}`, sira, JSON.stringify({ id: `gko-dnm-${sira}`, com: { ad: `Deneme hammadde ${sira}` } }), yoneticiId],
    ))!.no;
  }

  async function siparisSatiri(miktar: string): Promise<number> {
    sira += 1;
    const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')",
      [t, 81000 + sira, yoneticiId]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad) VALUES ($1, $2, 1, 'Deneme kalem')", [t, kl]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, 'Deneme Tedarikçi')", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id",
      [t, tk, kl, miktar]))!.id;
  }

  async function satir(miktar: string): Promise<number> {
    const r = await istek('yonetici', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: await kart(), miktar, siparisSatirId: await siparisSatiri(miktar) }] });
    assert.equal(r.statusCode, 200, r.body);
    const no = malKabulCevabi.parse(r.json()).belge.no;
    const b = await istek('kaliteci', 'GET', '/kalite-merkezi/giris/bekleyenler');
    const k = kmGirisBekleyenCevabi.parse(b.json()).kayitlar.find((x) => x.malKabulNo === no);
    assert.ok(k, 'GKK satırı bekleyenlerde');
    return k.malKabulSatirId;
  }

  async function gkk(id: number, g: object): Promise<string | null> {
    const r = await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/gkk`, g);
    assert.equal(r.statusCode, 200, r.body);
    return kmGirisCevabi.parse(r.json()).kayit.gkkNo;
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_giris_ozetleri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'kalite'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme kaliteci', kullaniciAdi: 'kaliteci', parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
    });
    await giris('kaliteci');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('GKO-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    await ortam.sahip.sorgu(`INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'KRN-GKO', 'karantina' FROM stok_depo
      WHERE kod = 'ANA' AND NOT EXISTS (SELECT 1 FROM stok_konum WHERE tur = 'karantina' AND aktif)`);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('GKK\'sız satır yok; hatalısız ve kararı bekleyen GKK\'da karar null; red kararı NCR no ve kararın notuyla; boş liste boş harita', async () => {
    const [bekleyen, temiz, kismi, redli] = [await satir('3'), await satir('2'), await satir('5'), await satir('4')];
    const temizNo = await gkk(temiz, { kabul: '2', hatali: '0' });
    const kismiNo = await gkk(kismi, { kabul: '3', hatali: '2', not: 'yüzey çizik' });
    const redNo = await gkk(redli, { kabul: '1', hatali: '3' });
    const r = await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${redli}/karar`, { karar: 'red', ncrKimlik: 'ncr-gko-1', ncrNo: 'NCR-GKO-1', ciddiyet: 'Majör', not: 'ölçü dışı' });
    assert.equal(r.statusCode, 200, r.body);

    const m = await o().vt.tx((db) => girisOzetleri(db, [bekleyen, temiz, kismi, redli, redli, 987654321]));
    assert.deepEqual([...m.keys()].sort((a, b) => a - b), [temiz, kismi, redli].sort((a, b) => a - b));
    assert.ok(temizNo && kismiNo && redNo && new Set([temizNo, kismiNo, redNo]).size === 3, 'her GKK kendi numarasıyla');
    const { gkkZaman, ...t } = m.get(temiz)!;
    assert.match(gkkZaman, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(t, { gkkNo: temizNo, kabulMiktar: '2.000', hataliMiktar: '0.000', karar: null, ncrNo: null, not: null });
    assert.deepEqual({ ...m.get(kismi)!, gkkZaman: '' }, { gkkNo: kismiNo, gkkZaman: '', kabulMiktar: '3.000', hataliMiktar: '2.000', karar: null, ncrNo: null, not: 'yüzey çizik' });
    assert.deepEqual({ ...m.get(redli)!, gkkZaman: '' }, { gkkNo: redNo, gkkZaman: '', kabulMiktar: '1.000', hataliMiktar: '3.000', karar: 'red', ncrNo: 'NCR-GKO-1', not: 'ölçü dışı' });
    assert.equal((await o().vt.tx((db) => girisOzetleri(db, []))).size, 0);
  });
});
