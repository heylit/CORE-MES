import type { Page } from '@playwright/test';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3050 a madde 7: bekleyen emir planda yerinde kalır, tezgâhı tutar ve "Beklemede" işaretiyle görünür; Bugün'de kart çıkar, geciken sayısının
// yanına "N'i beklemede" yazılır. Çalışma ve emir dilimi sentetiktir (ORN-); öteki uçlar gerçektir. Projeler 360, 768 ve 1280'de koşar.
test.use({ hesap: 'ornek.yonetici' });

// Taban bugünün günüdür (gün katmanı bugünden açılır); işler yarın 09:00-15:00, ORN-S2 termini yarın 10:00 olduğu için gecikir.
// Gün tesisin günüdür: UTC günü tesiste gece yarısından sonraki saatlerde bir gün geridedir ve gün katmanı başka güne açılırdı.
const bugun = tesisGunu(Date.now());
const yarin = tesisGunu(tesisGunBasi(bugun) + 36 * 3_600_000);
const HER_GUN = Object.fromEntries(['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'].map((g) => [g, ['V1']]));
const CALISMA = {
  surum: 2, dataVer: 3,
  D: {
    meta: { baslangic: bugun },
    vardiyalar: [{ id: 'V1', bas: '00:00', bit: '23:59' }],
    calismaGunleri: HER_GUN,
    musteriler: [{ id: 'm1', ad: 'Deneme Musteri' }],
    urunler: [{ id: 'u1', ad: 'Deneme Urun', rota: [{ k: 'a', ad: 'Torna' }, { k: 'b', ad: 'Son olcum' }] }],
    tezgahlar: [{ id: 't1' }],
    siparisler: [
      { id: 'ORN-S1', urun: 'u1', adet: 10, termin: `${yarin} 20:00`, musteri: 'm1' },
      { id: 'ORN-S2', urun: 'u1', adet: 5, termin: `${yarin} 10:00` },
    ],
  },
  plan: {
    dataVer: 3,
    J: { 'ORN-S1': { C: 36, T: 0 }, 'ORN-S2': { C: 39, T: 5 } },
    ops: {
      'ORN-S1.b': { job: 'ORN-S1', S: 33, C: 36, m: 't1' },
      'ORN-S2.b': { job: 'ORN-S2', S: 36, C: 39, m: 't1' },
    },
    ozet: { late: 1, n: 2, wT: 5 },
  },
};
const emir = (id: string, bekletme?: string) => ({
  id, kayitNo: 1, no: id, itemId: 'u1', qty: 5, start: null, due: null, priority: 2, note: null, rev: null, status: 'serbest',
  ...(bekletme ? { bekletme } : {}), created: 0, doneAt: null, tur: 'seri', parentId: null, kol: null, birlestigiId: null, surum: 1,
});

const kur = async (page: Page) => {
  await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ calisma: CALISMA, surum: 1 }),
  }));
  await page.route(/\/api\/plan\/planlama-kaynagi(\?|$)/, async (r) => {
    const cevap = await r.fetch();
    const govde = await cevap.json() as Record<string, unknown>;
    govde.emirler = { orders: [emir('ORN-S1'), emir('ORN-S2', 'Malzeme bekleniyor')], opStatus: {}, opProg: {} };
    await r.fulfill({ response: cevap, json: govde });
  });
};

test.describe('3050 Bekleyen emir planda', () => {
  test('Bugün kartı ve durum cümlesi; plan çubuğunda geciken yanında beklemede; yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await kur(page);
    await ac('/plan?ekran=bugun');
    const kok = page.locator('[data-parca="bugun"]');
    await expect(kok).toBeVisible({ timeout: 15_000 });
    await expect(kok.getByText('ORN-S2 beklemede')).toBeVisible();
    await expect(kok.getByText('Malzeme bekleniyor. Planda yerinde kalıyor, t1 tezgâhını tutuyor. Taşımak sizin kararınız.')).toBeVisible();
    await expect(kok.getByText(/terminin gerisinde \(1'i beklemede\)/).first()).toBeVisible();
    await expect(kok.getByText('ORN-S1 beklemede')).toHaveCount(0);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await expect(page.getByRole('toolbar', { name: 'Plan çubuğu' }).getByText(/geciken, 1'i beklemede/)).toBeVisible();
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Çizelge gününde ve haftasında bekleyen işin bloğu desenli, ipucu "Beklemede" ile başlar, lejantta yazar; öteki iş desensiz', async ({ page, ag, ac }) => {
    await kur(page);
    await ac('/plan');
    await page.getByRole('button', { name: 'Çizelge', exact: true }).click();
    await page.getByRole('toolbar', { name: 'Plan araçları' }).getByRole('button', { name: 'Gün', exact: true }).click();
    const gun = page.getByRole('region', { name: /^Gün katmanı: / });
    await expect(gun).toBeVisible({ timeout: 15_000 });
    await gun.getByRole('button', { name: 'Sonraki gün' }).click();
    const bekleyen = gun.locator('.tc-pym-gy-blok[data-bekle]');
    await expect(bekleyen).toHaveCount(1);
    await expect(bekleyen).toHaveAttribute('title', /^Beklemede: Malzeme bekleniyor\. /);
    expect(await bekleyen.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('repeating-linear-gradient');
    await expect(gun.locator('.tc-pym-gy-blok:not([data-bekle])')).toHaveCount(1);
    await expect(gun.locator('.tc-pym-gy-lejant')).toContainText('beklemede');
    const lejant = gun.locator('.tc-pym-gy-lejant');
    if (await lejant.isVisible()) {
      const ogeler = await lejant.locator(':scope > span').evaluateAll((l) => l.map((e) => e.getClientRects().length));
      expect(ogeler.length).toBe(5);
      expect(ogeler.every((n) => n === 1)).toBe(true);
    }
    await page.getByRole('toolbar', { name: 'Plan araçları' }).getByRole('button', { name: 'Hafta', exact: true }).click();
    const hafta = page.getByRole('region', { name: 'Çizelge, hafta' });
    await expect(hafta.locator('.tc-pym-ol-is[data-bekle]')).toHaveCount(1);
    await expect(hafta.locator('.tc-pym-ol-is[data-bekle]')).toHaveAttribute('title', /^Beklemede: Malzeme bekleniyor\. /);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
