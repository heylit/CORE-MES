import type { Page } from '@playwright/test';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3050 a madde 7: bekleyen emir planda yerinde kalır, tezgâhı tutar ve "Beklemede" işaretiyle görünür; Bugün'de kart çıkar, geciken sayısının
// yanına "N'i beklemede" yazılır. Çalışma ve emir dilimi sentetiktir (ORN-); öteki uçlar gerçektir. Projeler 360, 768 ve 1280'de koşar.
test.use({ hesap: 'ornek.yonetici' });

// Sayfanın saati sabittir: gün katmanı "bugün"den açılır ve işler yarına konur; gerçek saatle test koşarken tesis günü
// değişirse (gece yarısı) dosya yüklenirken hesaplanan gün ile sayfanın günü ayrılır.
const SIMDI = new Date('2026-10-19T07:00:00+03:00');
const bugun = tesisGunu(SIMDI.getTime());
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
  await page.clock.setSystemTime(SIMDI);
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
  test('Plan şeridinde geciken yanında beklemede yazar; yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await kur(page);
    await ac('/plan/plan');
    await expect(page.getByRole('toolbar', { name: 'Plan çubuğu' }).getByText(/geciken, 1'i beklemede/)).toBeVisible({ timeout: 15_000 });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
