import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import type { IkinciMenuMaddesi } from '#paylasilan/sayfa-tanimi.ts';
import { BILDIRIM_TURLERI } from '#paylasilan/sozlesme/bildirim.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

// Bildirimin yolu, alıcı rollerin açabildiği bir ekran olmalı: alıcıyı alan işlemi seçer, ekranı sayfa ve ikinci menü işlemi
// açar. İkisi ayrı yerde tanımlandığı için ayrışabiliyordu (denetim 29: izin onayı müdüre İK sayfasını gösteriyordu).
// Rol satırları göçlerdedir; sayfa ve menü tanımları paylasilan'dadır, bu yüzden test araçlardadır.
const onekMi = (yol: string, kok: string): boolean => yol === kok || yol.startsWith(`${kok}/`);
const enUzun = <T extends { yol: string }>(ogeler: readonly T[], yol: string): T | undefined =>
  ogeler.filter((o) => onekMi(yol, o.yol)).sort((a, b) => b.yol.length - a.yol.length)[0];

describe('bildirim yolu alıcı rollerin açabildiği ekrandır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testVeritabaniKur('bildirimyol'); });
  after(async () => { await ortam?.kaldir(); });

  test('her türde alan işlemlerinden birini taşıyan her rol yolun sayfasını ve menü maddesini görür', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const roller = await ortam.vt.sorgu<{ kod: string; yonetici: boolean; islemler: string[] }>(
      `SELECT r.kod, r.yonetici, COALESCE(array_agg(ri.islem) FILTER (WHERE ri.islem IS NOT NULL), '{}') AS islemler
         FROM rol r LEFT JOIN rol_islemi ri ON ri.rol_id = r.id GROUP BY r.id`,
    );
    const maddeler: readonly IkinciMenuMaddesi[] = IKINCI_MENULER.flatMap((m) => m.gruplar.flatMap((g): readonly IkinciMenuMaddesi[] => g.maddeler));
    const acamayanlar: string[] = [];
    for (const [tur, tanim] of Object.entries(BILDIRIM_TURLERI)) {
      const sayfa = enUzun(SAYFALAR, tanim.yol);
      assert.ok(sayfa, `${tur}: ${tanim.yol} kayıtlı bir sayfanın altında değil`);
      const madde = enUzun(maddeler, tanim.yol);
      for (const rol of roller) {
        const islemler: readonly string[] = rol.yonetici ? ISLEMLER : rol.islemler;
        if (!tanim.alanIslemler.some((i) => islemler.includes(i))) continue;
        const acar = islemler.includes(sayfa.islem) && (madde === undefined || maddeGorunurMu(madde, islemler));
        if (!acar) acamayanlar.push(`${tur} -> ${tanim.yol}: ${rol.kod}`);
      }
    }
    assert.deepEqual(acamayanlar, []);
  });
});
