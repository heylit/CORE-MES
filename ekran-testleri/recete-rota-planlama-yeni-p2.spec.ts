import { expect, test } from './ortak.ts';

// Planlama TS ekranı, P2: Siparişler, Terminler, Termin ve kâr (kart #532). Örnek veride çalışma ve plan olup olmaması sınanmaz; ısı haritası
// ve formlar birim testindedir (siparis.test.tsx). Açılış kayıt yazmaz; planlı çalışmada motor kartları sunucudaki değerlendirme ucunu sorar
// (576: başlatma POST'tur ama hesaptır, kayıt yazmaz).
test.use({ hesap: 'ornek.yonetici' });

const GORUNUMLER = [['ysiparis', 'Siparişler'], ['terminler', 'Terminler'], ['denge', 'Termin ve kâr']] as const;

test.describe('P2 siparişler, terminler, termin ve kâr', () => {
  // Genişlik projeden gelir (playwright.config.ts: g360, g768, g1280).
  for (const [anahtar, ad] of GORUNUMLER) {
    test(`${ad} açılır, kayıt yazmaz, yatay taşmaz`, async ({ page, ac, ag }) => {
      await ac(`/plan/${anahtar}`);
      const kap = page.locator(`[data-parca="${anahtar}"]`);
      await expect(kap).toBeVisible();
      // Çalışma kaydı yoksa (boş örnek veri) Terminler ve Termin ve kâr yalnız "Planı kur"u gösterir; "Tüm satırlar" çalışmanın verisini ister.
      const tum = kap.locator('summary', { hasText: 'Tüm satırlar' });
      if (await tum.count()) {
        await tum.click();
        // Plansız çalışmada motor kartları eski sayfadaki gibi "Önce plan kurulmalı" der; planlıda sunucudaki motorla açılır (576).
        await expect(kap.locator('[data-kapali="motor"]').or(kap.getByText(/Önce plan kurulmalı/))
          .or(kap.getByRole('heading', { name: /^(Plan seçenekleri|Malzeme: termin bekleyenler)$/ })).first()).toBeVisible();
      } else {
        await expect(kap.getByRole('button', { name: 'Planı kur' })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      expect(ag.yazmalar.filter((x) => x !== 'POST /api/plan/planlama-degerlendirmesi' && x !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
      expect(ag.hatalar).toEqual([]);
    });
  }

  test('şeritten P2 görünümleri açılır', async ({ page, ac }) => {
    await ac('/plan');
    const serit = page.getByRole('navigation', { name: 'Planlama menüsü' });
    for (const [anahtar, ad] of GORUNUMLER) {
      await serit.getByRole('link', { name: new RegExp(`^${ad}`) }).click();
      await expect(page).toHaveURL(new RegExp(`/plan/${anahtar}$`));
      await expect(page.locator(`[data-parca="${anahtar}"]`)).toBeVisible();
    }
  });

  // Isı haritası ve açılım dar ekranda da taşmamalı: çalışma okuması uydurma çalışmayla cevaplanır (veritabanına yazılmaz). Değerler uydurmadır.
  test('planlı çalışmada ısı haritası ve açılım yatay taşmaz', async ({ page, ac }) => {
    await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({ json: { calisma: CALISMA, surum: 1 } }));
    for (const [anahtar] of GORUNUMLER) {
      await ac(`/plan/${anahtar}`);
      const kap = page.locator(`[data-parca="${anahtar}"]`);
      await expect(kap.locator('.tc-pys-tablo')).toBeVisible();
      await kap.locator('button.tc-pys-h').first().click();
      await expect(kap.locator('.tc-pys-ac')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // Tüm satırlar: kâr tablosu, parti formu ve motor kartları yerinde; dar ekranda da taşmaz. Değerlendirme kartları sunucudaki motora
      // bağlıdır (576); Terminler'de termin bekleyen malzeme kartı Malzeme satın alma planından dolar (518 a), motoru bekleyen kart notunu gösterir.
      await kap.locator('summary', { hasText: 'Tüm satırlar' }).click();
      await expect(kap.locator('[data-kapali="motor"]').or(kap.getByRole('heading', { name: 'Malzeme: termin bekleyenler' }))
        .or(kap.getByRole('heading', { name: 'Plan seçenekleri' })).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
    // Siparişler açılımında yazılan form kalmadı (815, 699/3 a: elle çarpan ve tutar formları kalktı; "Termini değiştir" yerinde pasif).
    // Açılım dar ekranda da taşmaz; Esc açılımı kapatır, odak hücreye döner.
    await ac('/plan/ysiparis');
    const hucre = page.locator('[data-parca="ysiparis"] button.tc-pys-h').first();
    await hucre.click();
    const acilim = page.locator('.tc-pys-ac');
    await expect(acilim).toBeVisible();
    await expect(acilim.locator('form')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(acilim).toHaveCount(0);
    await expect(hucre).toBeFocused();
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
