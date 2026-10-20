import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Veritabani } from '#cekirdek/db.ts';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { ORNEK_PROFIL, ORNEK_YOL } from './ornek-veri.ts';

interface Satir { veri: { deger: string }; olusturan_kisi_id: number | null }

describe('denetim-hazirlik örnek verisi', { timeout: 60_000 }, () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  let zincir: OrnekVeriTanimi[] = [];
  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı.');
    return vt;
  };
  const secenek = { ortam: 'test' as const, an: new Date('2026-10-13T09:00:00Z'), parolaUret: () => 'ornek-parola-uzun-1', bildir: () => undefined };

  before(async () => {
    ({ vt, kaldir } = await testVeritabaniKur('denetim_hazirlik_ornek'));
    // Gerekir zinciri klasörden bulunur: kişiler önce, sonra bu modül.
    zincir = (await modulOrnekVerileriniKesfet()).filter((t) => ['kisiler', 'denetim-hazirlik'].includes(t.modul));
  });
  after(async () => { await kaldir?.(); });

  test('kişilerden sonra örnek profil ortak kayda örnek kaliteci adına girer; prototipin okuduğu biçimdedir', async () => {
    assert.deepEqual(await ornekVeriYukle(acik(), zincir, secenek), { durum: 'yuklendi', moduller: ['kisiler', 'denetim-hazirlik'] });
    const satir = await acik().tek<Satir>('SELECT veri, olusturan_kisi_id FROM denetim_hazirlik_belge WHERE yol = $1', [ORNEK_YOL]);
    assert.ok(satir);
    assert.equal(satir.olusturan_kisi_id, await kisiNoKullaniciAdindan(acik(), 'ornek.kalite'));
    const durum = JSON.parse(satir.veri.deger) as { active: string; order: string[]; data: Record<string, { profile: { firma: string }; audits: { date: string; status: string }[] }> };
    assert.deepEqual([durum.active, durum.order], [ORNEK_PROFIL, [ORNEK_PROFIL]]);
    const profil = durum.data[ORNEK_PROFIL]!;
    assert.equal(profil.profile.firma, 'TMI');
    assert.deepEqual(profil.audits.map((a) => [a.date, a.status]), [['2026-09-13', 'done'], ['2026-11-27', 'plan']]);
  });

  test('ikinci koşu bir şey yazmaz', async () => {
    const once = await acik().tek<{ surum: number }>('SELECT surum FROM denetim_hazirlik_belge WHERE yol = $1', [ORNEK_YOL]);
    assert.deepEqual(await ornekVeriYukle(acik(), zincir, secenek), { durum: 'yuklu', moduller: ['kisiler', 'denetim-hazirlik'] });
    assert.deepEqual(await acik().tek('SELECT surum FROM denetim_hazirlik_belge WHERE yol = $1', [ORNEK_YOL]), once);
  });
});
