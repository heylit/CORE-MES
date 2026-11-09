import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { KAYNAK_OKUMA } from '../../recete-rota/disari.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';
import { kaynakOku } from '../planlama-servis.ts';

// 2319 (2311 S10): kaynak okumasının ek.bakimlar alanı yalnız bayrak (plan.bakim-girdisi) açık ve kişi makineleri okuyabiliyorsa dolar;
// kapalıyken null (girdi.betik bakım satırına dokunmaz). 2512 a: bayrak varsayılan açık. Gerçek PostgreSQL, uydurma veri.
describe('plan (gerçek PostgreSQL): periyodik bakım kaynak okumasında', () => {
  const { vt, durum } = planTestOrtami();
  const bakimlar = (k: Kullanici) => vt().tx(async (db) => ((await kaynakOku(db, k)).ek as { bakimlar: unknown[] | null }).bakimlar);

  test('BK-K1: bayrak kapalıyken null; açıkken makinenin bakımı gelir; makine okuması olmayana null', async () => {
    const { ortam, makineA, yoneticiId } = durum();
    const tam: Kullanici = { id: yoneticiId, ad: 'Deneme yonetici', islemler: [...ISLEMLER] };
    const makinesiz: Kullanici = { ...tam, islemler: ISLEMLER.filter((i) => !(KAYNAK_OKUMA.istasyon as readonly string[]).includes(i)) };
    const kod = (await vt().tx((db) => db.tek<{ kod: string }>('SELECT kod FROM makine WHERE id = $1', [makineA])))!.kod;
    await vt().tx((db) => db.sorgu(`INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('maint', 'pl-bk-1', $1, 1, $2)`,
      [JSON.stringify({ id: 'pl-bk-1', type: 'plan', mc: kod, title: 'Yağ', everyDays: 7, durMin: 30, lastAt: Date.now() - 10 * 86_400_000 }), yoneticiId]));
    const l = (await bakimlar(tam)) as { anahtar: string; m: string }[] | null;
    assert.ok(l !== null && l.length > 0 && l.every((b) => b.m === String(makineA) && b.anahtar.startsWith('pl-bk-1|')), `varsayılan açık: ${JSON.stringify(l)}`);
    assert.equal(await bakimlar(makinesiz), null, 'makine okuması yok');
    await ortam!.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('plan.bakim-girdisi', 'false', $1)", [yoneticiId]);
    try {
      assert.equal(await bakimlar(tam), null, 'bayrak kapalı');
    } finally {
      await ortam!.sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'plan.bakim-girdisi'");
    }
  });
});
