import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ISLEMLER } from '../paylasilan/islemler.ts';
import type { IkinciMenuTanimi } from '../paylasilan/sayfa-tanimi.ts';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '../paylasilan/sayfalar.ts';
import { testVeritabaniKur } from './cekirdek/test-vt.ts';
import type { TestVeritabani } from './cekirdek/test-vt.ts';
import type { UcYetkisi } from './cekirdek/uc.ts';
import { modulBasinaUclar } from './cekirdek/uygulama.ts';

// Menü kuralı (195 a): ikinci menü maddesini gören her rol, maddenin `okur` uçlarının hepsini geçer; menüde görünüp verisi 403
// veren sayfa olmaz. Roller göçlerden, uç yetkisi uç tanımından okunur: matris ya da uç değişince test kendiliğinden ölçer.
describe('menü okuma kuralı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testVeritabaniKur('menuokuma'); });
  after(async () => { await ortam?.kaldir(); });

  test('maddeyi gören her rol maddenin okuduğu uçları geçer; okunan her uç kayıtlı bir GET ucudur', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const roller = await ortam.vt.sorgu<{ kod: string; yonetici: boolean; islemler: string[] }>(
      `SELECT r.kod, r.yonetici, COALESCE(array_agg(ri.islem) FILTER (WHERE ri.islem IS NOT NULL), '{}') AS islemler
         FROM rol r LEFT JOIN rol_islemi ri ON ri.rol_id = r.id GROUP BY r.id ORDER BY r.kod`,
    );
    assert.equal(roller.length > 1, true);
    const okumaUclari = new Map<string, UcYetkisi>(
      (await modulBasinaUclar()).flatMap((m) => m.uclar.filter((u) => u.yontem === 'GET').map((u) => [u.yol, u.yetki] as const)),
    );
    const gecer = (yetki: UcYetkisi, islemler: readonly string[]): boolean =>
      yetki === 'acik' || yetki === 'oturum' || (typeof yetki === 'object' ? yetki.biri.some((i) => islemler.includes(i)) : islemler.includes(yetki));

    const ihlaller: string[] = [];
    let olculen = 0;
    const menuler: readonly IkinciMenuTanimi[] = IKINCI_MENULER;
    for (const menu of menuler) {
      const sayfaIslemi = SAYFALAR.find((s) => s.yol === menu.kok)?.islem;
      assert.ok(sayfaIslemi, `menünün sayfası yok: ${menu.kok}`);
      for (const madde of menu.gruplar.flatMap((g) => g.maddeler)) {
        for (const yol of madde.okur ?? []) {
          const yetki = okumaUclari.get(yol);
          if (yetki === undefined) { ihlaller.push(`${madde.yol}: okunan uç kayıtlı GET ucu değil: ${yol}`); continue; }
          for (const rol of roller) {
            const islemler = rol.yonetici ? ISLEMLER : rol.islemler;
            if (!islemler.includes(sayfaIslemi) || !maddeGorunurMu(madde, islemler)) continue;
            olculen += 1;
            if (!gecer(yetki, islemler)) ihlaller.push(`${rol.kod} ${madde.yol} maddesini görür, GET ${yol} reddedilir`);
          }
        }
      }
    }
    assert.deepEqual(ihlaller, []);
    // Hiçbir madde okur bildirmezse test boşa geçerdi.
    assert.equal(olculen > 0, true);
  });
});
