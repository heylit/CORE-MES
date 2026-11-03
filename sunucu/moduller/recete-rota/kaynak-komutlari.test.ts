import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BOS_ANLIK, KAYNAK_OKUMALARI, koleksiyonKur, takvimEki } from '../../../istemci/src/moduller/recete-rota/kaynak-komutlari.ts';
import type { KaynakAnlik, KaynakKoleksiyonu } from '../../../istemci/src/moduller/recete-rota/kaynak-komutlari.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { makineDurumlari, planAyarlari } from '../istasyonlar/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Kaynaklar sekmesi yalnız okur (1927 a: tek giriş yeri İstasyonlar, vardiya Vardiya'da). Veri sahibinin kendi ucundan yazılır; köprünün
// AYNI okuma tablosu ve çevirisi (istemci/src/moduller/recete-rota/kaynak-komutlari.ts) ve durum ucu onu gösterir.
const PAROLA = 'dogru-parola-1';

describe('Kaynaklar sahibinin yazdığını okur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let tam = '';
  let yoneticiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const al = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });

  // Köprünün okuduğu anlık: aynı okuma tablosu, aynı kurucu.
  async function anlikOku(cerez: string): Promise<KaynakAnlik> {
    const anlik: Record<string, KaynakKoleksiyonu | null> = { ...BOS_ANLIK };
    for (const o of KAYNAK_OKUMALARI) {
      const cevap = await al(cerez, o.yol);
      anlik[o.koleksiyon] = cevap.statusCode === 200 ? koleksiyonKur(cevap.json(), o.alan, o.anahtar) : null;
    }
    return anlik as unknown as KaynakAnlik;
  }

  // Okuma denemesinin verisi sahibinin kendi ucundan yazılır.
  const sahibineYaz = async (yol: string, govde: Record<string, unknown>) => {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: tam, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde });
    assert.ok(c.statusCode === 200 || c.statusCode === 201, `${yol}: ${String(c.statusCode)} ${c.body}`);
    return c.json() as Record<string, unknown>;
  };
  const kimlik = (c: Record<string, unknown>) => c['id'] as number;
  const durumOku = async (cerez: string): Promise<DurumCevabi> => (await al(cerez, '/recete-rota/durum')).json() as DurumCevabi;

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_kaynak');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
  });

  after(async () => { await ortam?.kaldir(); });

  test('KK-01: iş merkezi, istasyon, makine, kişi ve yetkinlik İstasyonlar ve Kişiler uçlarından yazılır; köprünün anlığı ve durum ucu aynı kaydı gösterir', async () => {
    const merkezId = kimlik(await sahibineYaz('/is-merkezleri', { kod: 'KK-IM', ad: 'Kaynak merkezi' }));
    const istasyonId = kimlik(await sahibineYaz('/istasyonlar', { kod: 'KK-IS', ad: 'Kaynak istasyonu', isMerkeziId: merkezId }));
    await sahibineYaz('/makineler', { kod: 'KK-MK', ad: 'Kaynak makinesi', istasyonId });
    const kisiId = kimlik(await sahibineYaz('/kisiler', { ad: 'Deneme Operatör', sicilNo: 'KK-001', gorev: 'Operatör' }));
    await sahibineYaz(`/kisi-yetkinlikleri/${String(kisiId)}/belirle`, { istasyonIdleri: [istasyonId] });

    const anlik = await anlikOku(tam);
    assert.equal(anlik.istasyonlar?.get(istasyonId)?.['ad'], 'Kaynak istasyonu');
    assert.equal(anlik.kisiler?.get(kisiId)?.['gorev'], 'Operatör');
    const d = await durumOku(tam);
    assert.equal(d.wcs?.find((w) => w.code === 'KK-IM')?.name, 'Kaynak merkezi');
    assert.equal(d.stations?.find((s) => s.code === 'KK-IS')?.wcId, String(merkezId));
    assert.equal(d.machines?.find((m) => m.code === 'KK-MK')?.stationId, String(istasyonId));
    assert.deepEqual(d.people?.find((p) => p.id === String(kisiId))?.skills, [String(istasyonId)]);
  });

  test('KK-02: verim, operatör ihtiyacı ve makine durumu sahibinin ucundan yazılanı durum ucu gösterir', async () => {
    const merkezId = kimlik(await sahibineYaz('/is-merkezleri', { kod: 'KK2-IM', ad: 'İkinci merkez' }));
    const istasyonId = kimlik(await sahibineYaz('/istasyonlar', { kod: 'KK2-IS', ad: 'İkinci istasyon', isMerkeziId: merkezId }));
    const makineId = kimlik(await sahibineYaz('/makineler', { kod: 'KK2-MK', ad: 'İkinci makine', istasyonId }));
    await sahibineYaz(`/istasyonlar/${String(istasyonId)}/plan-ayari`, { verimYuzde: 85, operatorIhtiyaci: 0.5, surum: 0 });
    await sahibineYaz(`/makineler/${String(makineId)}/durum`, { durum: 'bakim', aciklama: 'Yağ değişimi', surum: 0 });
    const ayar = (await vt().tx((db) => planAyarlari(db))).find((a) => a.istasyonId === istasyonId);
    assert.deepEqual([Number(ayar?.verimYuzde), Number(ayar?.operatorIhtiyaci)], [85, 0.5]);
    assert.equal((await vt().tx((db) => makineDurumlari(db))).find((x) => x.makineId === makineId)?.durum, 'bakim');
    const d = await durumOku(tam);
    const ist = d.stations?.find((x) => x.code === 'KK2-IS');
    assert.deepEqual({ eff: ist?.eff, opPer: ist?.opPer }, { eff: 85, opPer: 0.5 });
    assert.equal(d.machines?.find((m) => m.code === 'KK2-MK')?.status, 'bakim');
  });

  test('KK-04: Vardiya\'da yazılan vardiya ve İK\'daki tatil durum ucunda görünür', async () => {
    await sahibineYaz('/vardiyalar', { ad: 'KK sabah', baslangic: '07:00', bitis: '15:00', molalar: [{ baslangic: '11:00', bitis: '11:30' }], aktif: true });
    // Soru 142 b: tatilin sahibi İK'dır; Vardiya takvimi İK listesini okur (aralıksız okuma gelecek yılı da kapsar).
    const yil = new Date().getUTCFullYear() + 1;
    await vt().sorgu("INSERT INTO ik_genel_ayar (anahtar, guncelleyen_kisi_id) VALUES ('genel', $1) ON CONFLICT DO NOTHING", [yoneticiId]);
    await vt().sorgu("INSERT INTO ik_resmi_tatil (sira, yil, ay, gun, ad) VALUES (1, $1, 5, 1, 'KK emek')", [yil]);
    try {
      const d = await durumOku(tam);
      assert.deepEqual(d.cal.shifts.filter((v) => v.name === 'KK sabah').map((v) => [v.start, v.end]), [['07:00', '15:00']]);
      assert.equal(d.cal.holidays.includes(`${String(yil)}-05-01`), true);
    } finally {
      await vt().sorgu('DELETE FROM ik_resmi_tatil WHERE sira = 1');
    }
  });

  test('KK-10: Vardiya\'da yazılan iş merkezi haftası ve kişi vardiyası köprünün çevirisinde (gün 7 = pazar 0) aynı düzenle gelir', async () => {
    const merkezId = kimlik(await sahibineYaz('/is-merkezleri', { kod: 'KK10-A', ad: 'Hafta kaynağı' }));
    const vardiyaId = ((await sahibineYaz('/vardiyalar', { ad: 'KK10 vardiya', baslangic: '07:00', bitis: '15:00', molalar: [], aktif: true }))['vardiyalar'] as Array<{ id: number; ad: string }>).find((v) => v.ad === 'KK10 vardiya')?.id ?? 0;
    const kisiId = kimlik(await sahibineYaz('/kisiler', { ad: 'Hafta Kişisi' }));
    const takvim = async () => (await al(tam, '/vardiya-takvimi')).json() as TakvimCevabi;
    await sahibineYaz('/vardiya-matrisi/degistir', { isMerkeziId: merkezId, gun: 1, vardiyaId, acik: true });
    await sahibineYaz('/vardiya-matrisi/degistir', { isMerkeziId: merkezId, gun: 7, vardiyaId, acik: true });
    await sahibineYaz(`/kisi-vardiyalari/${String(kisiId)}/belirle`, { vardiyaId });
    const ek = takvimEki(await takvim());
    assert.deepEqual(ek?.hafta[String(merkezId)], { 1: [String(vardiyaId)], 0: [String(vardiyaId)] });
    assert.equal(ek?.kisiVardiyasi[String(kisiId)], String(vardiyaId));
  });
});
