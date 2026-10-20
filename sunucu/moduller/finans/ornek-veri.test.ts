import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { firmaNoKoddan, ORNEK_FIRMA_ANAHTARLARI, ornekFirmaNo } from '../musteri-tedarikci/disari.ts';

const AN = new Date('2026-10-13T09:00:00Z');

describe('finans örnek verisi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const secenek = { ortam: 'test' as const, an: AN, bildir: () => undefined, parolaUret: () => 'ornek-parola-123' };

  before(async () => { ortam = await testVeritabaniKur('finansornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('kisiler zinciriyle yüklenir; ikinci koşu hiçbir şey yazmaz', async () => {
    // Başka modülün ornek-veri.ts'i ithal edilmez (sınır kuralı); çekirdek keşfiyle bulunur.
    const liste = (await modulOrnekVerileriniKesfet()).filter((t) => ['kisiler', 'musteri-tedarikci', 'finans'].includes(t.modul));
    assert.deepEqual(await ornekVeriYukle(vt(), liste, secenek), { durum: 'yuklendi', moduller: ['kisiler', 'musteri-tedarikci', 'finans'] });

    const sayilar = await vt().tx((db) => db.tek<{ firma: number; fason: number; belge: number; kapanan: number; cek: number; duzenli: number; hesap: number }>(`
      SELECT (SELECT count(*)::int FROM musteri_tedarikci_firma WHERE kod LIKE 'ORN-%') AS firma,
             (SELECT count(*)::int FROM musteri_tedarikci_firma WHERE kod LIKE 'ORN-%' AND fason) AS fason,
             (SELECT count(*)::int FROM finans_belge) AS belge,
             (SELECT count(*)::int FROM finans_belge WHERE durum = 'kapandi') AS kapanan,
             (SELECT count(*)::int FROM finans_cek) AS cek,
             (SELECT count(*)::int FROM finans_duzenli_odeme) AS duzenli,
             (SELECT count(*)::int FROM finans_hesap) AS hesap`));
    assert.deepEqual(sayilar, { firma: 5, fason: 1, belge: 4, kapanan: 2, cek: 1, duzenli: 2, hesap: 2 });

    const acik = await vt().tx((db) => db.tek<{ kalan: string }>(
      "SELECT (toplam - finans_belge_kapanan(id))::numeric(18,2)::text AS kalan FROM finans_belge WHERE belge_no = 'ORN-S-0002'"));
    assert.equal(acik?.kalan, '65200.00', 'çek ikinci faturanın bir kısmını kapatır');

    // KD-066: ortak ayar, kur ve faiz yazılmaz.
    const ayar = await vt().tx((db) => db.tek<{ kurulum_tamam: boolean; sirket_adi: string }>('SELECT kurulum_tamam, sirket_adi FROM finans_ayar WHERE id = 1'));
    assert.deepEqual(ayar, { kurulum_tamam: false, sirket_adi: 'Şirketim' });
    const kurFaiz = await vt().tx((db) => db.tek<{ n: number }>('SELECT (SELECT count(*) FROM finans_kur) + (SELECT count(*) FROM finans_faiz) AS n'));
    assert.equal(Number(kurFaiz?.n), 0);

    assert.equal(typeof (await vt().tx((db) => firmaNoKoddan(db, 'ORN-MUS-01'))), 'number');
    assert.equal(await vt().tx((db) => firmaNoKoddan(db, 'ORN-YOK')), null);
    const nolar = await vt().tx(async (db) => Promise.all(ORNEK_FIRMA_ANAHTARLARI.map((a) => ornekFirmaNo(db, a))));
    assert.equal(new Set(nolar.filter((n) => typeof n === 'number')).size, 5);

    assert.deepEqual(await ornekVeriYukle(vt(), liste, secenek), { durum: 'yuklu', moduller: ['kisiler', 'musteri-tedarikci', 'finans'] });
    const ikinci = await vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM musteri_tedarikci_firma WHERE kod LIKE 'ORN-%'"));
    assert.equal(ikinci?.n, 5);
  });
});
