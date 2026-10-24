import { expect, test } from './ortak.ts';

// Planlama TS ekranı, P2: Siparişler, Terminler, Termin ve kâr (kart #532). Örnek veride çalışma ve plan olup olmaması sınanmaz; ısı haritası
// ve formlar birim testindedir (siparis.test.tsx). Açılış yalnız okur; değerlendirme ucu main'e girene kadar istenmez (357 b).
test.use({ hesap: 'ornek.yonetici' });

const GORUNUMLER = [['ysiparis', 'Siparişler'], ['terminler', 'Terminler'], ['denge', 'Termin ve kâr']] as const;

test.describe('P2 siparişler, terminler, termin ve kâr', () => {
  // Genişlik projeden gelir (playwright.config.ts: g360, g768, g1280).
  for (const [anahtar, ad] of GORUNUMLER) {
    test(`${ad} açılır, yazmaz, değerlendirme ucunu sormaz, yatay taşmaz`, async ({ page, ac, ag }) => {
      await ac(`/recete-rota/planlama-yeni/${anahtar}`);
      const kap = page.locator(`[data-parca="${anahtar}"]`);
      await expect(kap).toBeVisible();
      // Çalışma kaydı yoksa (boş örnek veri) Terminler ve Termin ve kâr yalnız "Planı kur"u gösterir; "Tüm satırlar" çalışmanın verisini ister.
      const tum = kap.locator('summary', { hasText: 'Tüm satırlar' });
      if (await tum.count()) {
        await tum.click();
        await expect(kap.locator('[data-kapali="motor"]').first()).toBeVisible();
      } else {
        await expect(kap.getByRole('button', { name: 'Planı kur' })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      expect(ag.yazmalar).toEqual([]);
      expect(ag.hatalar).toEqual([]);
    });
  }

  test('şeritten P2 görünümleri açılır', async ({ page, ac }) => {
    await ac('/recete-rota/planlama-yeni/plan');
    const serit = page.getByRole('tablist', { name: 'Planlama görünümleri' });
    for (const [anahtar, ad] of GORUNUMLER) {
      await serit.getByRole('tab', { name: ad, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/recete-rota/planlama-yeni/${anahtar}$`));
      await expect(page.locator(`[data-parca="${anahtar}"]`)).toBeVisible();
    }
  });

  // Isı haritası ve açılım dar ekranda da taşmamalı: çalışma okuması uydurma çalışmayla cevaplanır (veritabanına yazılmaz). Değerler uydurmadır.
  test('planlı çalışmada ısı haritası ve açılım yatay taşmaz', async ({ page, ac }) => {
    await page.route('**/api/recete-rota/planlama-calismasi', (r) => r.fulfill({ json: { calisma: CALISMA, surum: 1 } }));
    for (const [anahtar] of GORUNUMLER) {
      await ac(`/recete-rota/planlama-yeni/${anahtar}`);
      const kap = page.locator(`[data-parca="${anahtar}"]`);
      await expect(kap.locator('.tc-pys-tablo')).toBeVisible();
      await kap.locator('button.tc-pys-h').first().click();
      await expect(kap.locator('.tc-pys-ac')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });
});

const CALISMA = {
  surum: 2, dataVer: 3,
  D: {
    meta: { baslangic: '2026-10-19' },
    siparisler: [{ id: 'S1', urun: 'U1', adet: 10, termin: '2026-10-21 17:00' }, { id: 'S2', urun: 'U1', adet: 4, termin: '2026-10-30 17:00' }],
    urunler: [{ id: 'U1', ad: 'Deneme parca', rota: [{ k: 'a1' }, { k: 'a2', fason: 'F1', bag: [['a1', 'FS']] }, { k: 'a3', bag: [['a2', 'FS']] }] }],
    tezgahlar: [{ id: 'M1', ad: 'Deneme tezgah' }],
    fasoncular: [{ id: 'F1', ad: 'Deneme fason', sureGun: 2 }],
  },
  plan: {
    dataVer: 3,
    ops: {
      'S1.a1': { job: 'S1', m: 'M1', S: 8, C: 20 }, 'S1.a2': { job: 'S1', m: 'fF1', S: 20, C: 68, fas: 1 },
      'S1.a3': { job: 'S1', m: 'M1', S: 70, C: 80 }, 'S2.a1': { job: 'S2', m: 'M1', S: 20, C: 30 },
    },
    J: { S1: { C: 80, T: 15 }, S2: { C: 30, T: 0 } },
    warn: [],
  },
};
