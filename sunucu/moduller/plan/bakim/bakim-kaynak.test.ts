import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { KAYNAK_OKUMA } from '../../recete-rota/disari.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';
import { DURUS_OKUMA_GUN, durusOkumaSonu } from '../../../../istemci/src/moduller/plan/planlama/tipler.ts';
import { kaynakOku } from '../planlama-servis.ts';
import { TAKVIM_GUN } from '../servis.ts';

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
  // Vardiya ekranında girilen planlı duruş makineye inmiş hâliyle ek.planliDuruslar alanında gelir (girdi.betik duruş satırı yapar).
  test('BK-K2: istasyonun planlı duruşu makinesinin duruşu olarak gelir (anahtar "vd:" ile başlar); kaldırılınca gelmez; makine okuması olmayana null', async () => {
    const { ortam, makineA, makineB, istasyonA, yoneticiId } = durum();
    const tam: Kullanici = { id: yoneticiId, ad: 'Deneme yonetici', islemler: [...ISLEMLER] };
    const makinesiz: Kullanici = { ...tam, islemler: ISLEMLER.filter((i) => !(KAYNAK_OKUMA.istasyon as readonly string[]).includes(i)) };
    const duruslar = (k: Kullanici) => vt().tx(async (db) => ((await kaynakOku(db, k)).ek as { planliDuruslar: { anahtar: string; m: string; bas: string; bit: string; baslik: string }[] | null }).planliDuruslar);
    const gun = tesisSaati(Date.now() + 2 * 86_400_000).slice(0, 10);
    const { id } = (await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO vardiya_planli_durus (baslik, kapsam, istasyon_id, baslangic, bitis, tekrar, gunler, aktif, yazan_id)
       VALUES ('Deneme bakım', 'istasyon', $1, ($2 || ' 08:00')::timestamp AT TIME ZONE current_setting('TimeZone'),
               ($2 || ' 10:00')::timestamp AT TIME ZONE current_setting('TimeZone'), 'yok', '{}', true, $3) RETURNING id`, [istasyonA, gun, yoneticiId]))!;
    try {
      const l = await duruslar(tam);
      assert.deepEqual(l?.filter((d) => d.anahtar.startsWith(`vd:${String(id)}|`)).map((d) => [d.m, d.bas, d.bit, d.baslik]), [[String(makineA), `${gun} 08:00`, `${gun} 10:00`, 'Deneme bakım']]);
      assert.equal(l?.some((d) => d.m === String(makineB) && d.anahtar.startsWith(`vd:${String(id)}|`)), false);
      assert.equal(await duruslar(makinesiz), null);
      await ortam!.sahip.sorgu('UPDATE vardiya_planli_durus SET aktif = false WHERE id = $1', [id]);
      assert.deepEqual((await duruslar(tam))?.filter((d) => d.anahtar.startsWith(`vd:${String(id)}|`)), []);
    } finally {
      await ortam!.sahip.sorgu('DELETE FROM vardiya_planli_durus WHERE id = $1', [id]);
    }
  });

  test('BK-K3: tesis geneli, her gün tekrarlayan ve ufkun ilerisindeki duruş her makineye ve her gerçekleşmesiyle gelir', async () => {
    const { ortam, makineA, makineB, yoneticiId } = durum();
    const tam: Kullanici = { id: yoneticiId, ad: 'Deneme yonetici', islemler: [...ISLEMLER] };
    const gun = (n: number) => tesisSaati(Date.now() + n * 86_400_000).slice(0, 10);
    const { id } = (await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO vardiya_planli_durus (baslik, kapsam, baslangic, bitis, tekrar, gunler, aktif, yazan_id)
       VALUES ('Deneme sayım', 'tesis', ($1 || ' 13:00')::timestamp AT TIME ZONE current_setting('TimeZone'),
               ($1 || ' 13:30')::timestamp AT TIME ZONE current_setting('TimeZone'), 'gunluk', '{}', true, $2) RETURNING id`, [gun(40), yoneticiId]))!;
    try {
      const l = (await vt().tx(async (db) => ((await kaynakOku(db, tam)).ek as { planliDuruslar: { anahtar: string; m: string; bas: string; bit: string }[] }).planliDuruslar))
        .filter((d) => d.anahtar.startsWith(`vd:${String(id)}|`));
      for (const m of [makineA, makineB]) {
        const baslar = l.filter((d) => d.m === String(m)).map((d) => d.bas);
        for (const n of [40, 41, 45]) assert.ok(baslar.includes(`${gun(n)} 13:00`), `makine ${String(m)} gün +${String(n)}: ${baslar.slice(0, 3).join(', ')}`);
        assert.equal(baslar.includes(`${gun(39)} 13:00`), false, 'ilk başlangıçtan önce gerçekleşme yok');
      }
      assert.equal(new Set(l.map((d) => d.anahtar)).size, l.length, 'anahtarlar tekil');
    } finally {
      await ortam!.sahip.sorgu('DELETE FROM vardiya_planli_durus WHERE id = $1', [id]);
    }
  });

  // 3509: takvime sığmayan iş planlama ufkunun (varsayılan 120 gün) ötesine yerleşir; duruş canlı planın takvim penceresi (365 gün) boyunca okunur.
  test('BK-K4: planlama ufkunun ötesindeki duruş da gelir, takvim penceresinin son gününe kadar; sonraki gün gelmez', async () => {
    const { ortam, makineA, istasyonA, yoneticiId } = durum();
    const tam: Kullanici = { id: yoneticiId, ad: 'Deneme yonetici', islemler: [...ISLEMLER] };
    const gun = (n: number) => tesisSaati(Date.now() + n * 86_400_000).slice(0, 10);
    const idler: number[] = [];
    try {
      for (const n of [200, 366, 367]) {
        idler.push((await ortam!.sahip.tek<{ id: number }>(
          `INSERT INTO vardiya_planli_durus (baslik, kapsam, istasyon_id, baslangic, bitis, tekrar, gunler, aktif, yazan_id)
           VALUES ('Deneme duruş', 'istasyon', $1, ($2 || ' 08:00')::timestamp AT TIME ZONE current_setting('TimeZone'),
                   ($2 || ' 10:00')::timestamp AT TIME ZONE current_setting('TimeZone'), 'yok', '{}', true, $3) RETURNING id`, [istasyonA, gun(n), yoneticiId]))!.id);
      }
      const l = (await vt().tx(async (db) => ((await kaynakOku(db, tam)).ek as { planliDuruslar: { anahtar: string; m: string; bas: string }[] }).planliDuruslar));
      const gelen = (id: number) => l.filter((d) => d.anahtar.startsWith(`vd:${String(id)}|`)).map((d) => [d.m, d.bas]);
      assert.deepEqual(idler.map(gelen), [[[String(makineA), `${gun(200)} 08:00`]], [[String(makineA), `${gun(366)} 08:00`]], []]);
    } finally {
      for (const id of idler) await ortam!.sahip.sorgu('DELETE FROM vardiya_planli_durus WHERE id = $1', [id]);
    }
  });

  // 3522: Kokpit bitişi bu pencerenin ötesindeki emirde "duruşlar hesaba katılmadı" der ve pencereyi kendi sabitinden hesaplar (istemci
  // sunucuyu ithal edemez). Biri değişip öbürü kalırsa not yanlış emirde çıkar: BK-K4'te gelen son gün (366) pencerenin içinde, gelmeyen ilk
  // gün (367) dışında kalmalıdır.
  test('istemcinin duruş okuma penceresi sunucununkiyle aynıdır', () => {
    assert.equal(DURUS_OKUMA_GUN, TAKVIM_GUN);
    assert.equal(durusOkumaSonu(10) / 24, 367);
  });
});
