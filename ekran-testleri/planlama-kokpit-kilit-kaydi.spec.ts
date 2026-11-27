import type { Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3804 (3793-2 madde 7): tahtada sürüklenip sahada süren işin ortasına bırakılan adım sunucuda o işin bitişine alınır ve orada kilitlenir;
// Kokpit bunu bilgi satırıyla söyler (çakışan iş, yeni saat; Tamam, Kilidi kaldır, Geri al). Satır yalnız taşıma son değişiklikken durur:
// Geri al ya da Tamam onu kaldırır. Çalışma, taslak ve önizleme ağ katmanında uydurmadır (page.route, ORN- veri); veritabanına yazılmaz.
// 360'ta tahta ve sürükleme yoktur (taşıma operasyon listesinden, boş yere); bu akış 768 ve 1280'de ölçülür. Sayfa yatay taşmaz.
test.use({ hesap: 'ornek.yonetici' });

type Is = { job: string; m: string; S: number; C: number; act?: 1 };
type Komut = { tur: string } & Record<string, unknown>;
// Veri uydurmadır: M1'de S2 sahada sürüyor (08-20), S3 onun arkasında (22-28). S1 M2'de.
const ILK: Record<string, Is> = {
  'S1.a1': { job: 'S1', m: 'M2', S: 10, C: 16 }, 'S2.a1': { job: 'S2', m: 'M1', S: 8, C: 20, act: 1 }, 'S3.a1': { job: 'S3', m: 'M1', S: 22, C: 28 },
};
const plan = (ops: Record<string, Is>) => ({
  dataVer: 3, ops, warn: [], ozet: { wT: 0, T: 0, late: 0 },
  J: Object.fromEntries(['S1', 'S2', 'S3'].map((j) => [j, { C: Math.max(...Object.values(ops).filter((o) => o.job === j).map((o) => o.C)), T: 0 }])),
});
const calisma = (ops: Record<string, Is>, locks: Record<string, unknown>) => ({
  surum: 2, dataVer: 3, w: { dondurma: 4 }, locks, down: [], ekMesai: [],
  D: {
    meta: { baslangic: '2026-10-19' },
    siparisler: ['S1', 'S2', 'S3'].map((id) => ({ id, urun: 'U1', adet: 6, termin: '2026-10-23 17:00' })),
    urunler: [{ id: 'U1', ad: 'ORN-Deneme burc', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }, { id: 'M2', cevrim: 60 }] }] }],
    tezgahlar: [{ id: 'M1', kod: 'ORN-T1', ad: 'Deneme torna 1' }, { id: 'M2', kod: 'ORN-T2', ad: 'Deneme torna 2' }],
    vardiyalar: [{ id: '1', bas: '00:00', bit: '23:59', molalar: [] }],
    calismaGunleri: { pzt: ['1'], sal: ['1'], car: ['1'], per: ['1'], cum: ['1'], cmt: ['1'], paz: [] },
  },
  plan: plan(ops),
});
const json = (r: Route, v: unknown) => r.fulfill({ json: v });
// Sunucu esastır (3414-3): sahada süren işle üst üste gelen yer onun bitişine alınır.
function yer(ops: Record<string, Is>, id: string, m: string, istenen: number): number {
  const x = ops[id]!, sure = x.C - x.S;
  const engel = Object.entries(ops).find(([k, o]) => k !== id && o.m === m && o.act === 1 && o.S < istenen + sure && o.C > istenen);
  return engel ? engel[1].C : istenen;
}
function oynat(l: readonly Komut[]): { ops: Record<string, Is>; locks: Record<string, unknown> } {
  let ops = ILK, locks: Record<string, unknown> = {};
  for (const k of l) {
    if (k.tur !== 'tasi') continue;
    const id = String(k['isId']), m = String(k['tezgah']), x = ops[id]!, S = yer(ops, id, m, Number(k['baslangic']));
    ops = { ...ops, [id]: { ...x, m, S, C: S + (x.C - x.S) } };
    locks = { ...locks, [id]: { m, S } };
  }
  return { ops, locks };
}
const IS = '00000000-0000-4000-8000-0000000038a4';
async function sunucu(page: Page) {
  const s = { surum: 0, satirlar: [] as { komut: Komut; ne: string; t: number; hata: null }[], komutlar: [] as Komut[] };
  const gorunum = () => oynat(s.satirlar.map((x) => x.komut));
  const cevap = () => {
    const g = gorunum(), c = calisma(g.ops, g.locks);
    return s.satirlar.length === 0 ? { taslak: null, calisma: c, surum: 1 } : { taslak: { surum: s.surum, tabanSurum: 1, satirlar: s.satirlar }, calisma: c, surum: 1 };
  };
  await page.route('**/api/plan/planlama-calismasi/duzenleyen', (r) => json(r, { kisiId: null, kisi: null, zaman: null, surum: null }));
  await page.route('**/api/plan/planlama-calismasi/gonderme-onizlemesi', (r) => json(r, { kapali: [], kilitYetkisi: true, oneri: null, oneriNedeni: null, ihlaller: [] }));
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: calisma(ILK, {}), surum: 1 }));
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', m = q.get('tezgah') ?? '', g = gorunum(), x = g.ops[id];
    if (!x) return json(r, { calismaSurumu: 1, gecerli: false, ileti: 'yok', isler: [] });
    const S = yer(g.ops, id, m, Number(q.get('baslangic')));
    return json(r, { calismaSurumu: 1, gecerli: true, ileti: null, isler: [{ isId: id, tezgah: m, S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] });
  });
  await page.route('**/api/plan/taslagim', (r) => json(r, cevap()));
  await page.route('**/api/plan/taslagim/komut', (r) => {
    const k = (r.request().postDataJSON() as { komut: Komut }).komut;
    s.komutlar.push(k); s.satirlar.push({ komut: k, ne: `${k.tur} ${String(k['isId'] ?? '')}`, t: 0, hata: null }); s.surum += 1;
    return json(r, cevap());
  });
  // Geri son değişikliği ve ardından gelen dizmeyi birlikte alır.
  await page.route('**/api/plan/taslagim/geri-al', (r) => {
    while (s.satirlar.at(-1)?.komut.tur === 'diz') s.satirlar.pop();
    s.satirlar.pop(); s.surum += 1;
    return json(r, cevap());
  });
  await page.route('**/api/plan/taslagim/diz', (r) => { s.satirlar.push({ komut: { tur: 'diz', isler: ['*'] }, ne: 'Plan yeniden dizildi', t: 0, hata: null }); s.surum += 1; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/degerlendirme', (r) => json(r, { is: IS }));
  await page.route(`**/api/plan/planlama-degerlendirmesi/${IS}`, (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: 1, dataVer: 3, baslangic: '2026-10-19', simdi: 10, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: plan(gorunum().ops) } },
  }));
  return { s, tasinan: () => s.komutlar.filter((k) => k.tur === 'tasi') };
}

test('Kokpit 3804: sahada süren işin üstüne bırakılan adım onun arkasına alınır; bilgi satırı çıkar, Geri al ve Tamam kaldırır; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  test.skip(bilgi.project.name === 'g360', '360: tahta ve sürükleme yok');
  const t = await sunucu(page);
  await page.clock.setSystemTime(new Date('2026-10-19T10:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const satir = page.getByRole('status').filter({ hasText: 'bırakılan saatte' });

  const tahta = kokpit.locator('.tc-pyq-tahta');
  await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
  const surukle = async () => {
    const is = tahta.locator('[data-is="S3.a1"]');
    await is.scrollIntoViewIfNeeded();
    const kutu = await is.boundingBox();
    if (!kutu) throw new Error('iş görünmüyor');
    // S3.a1 (M1, 22-28) 14. saate, sahada süren S2.a1'in (08-20) ortasına bırakılır; sunucu 20. saate alır.
    const px = kutu.width / 6, y = kutu.y + kutu.height / 2, x0 = kutu.x + 6;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + (14 - 22) * px, y, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('group', { name: 'Taşımayı onayla' }).getByRole('button', { name: 'Uygula' }).click();
  };

  await surukle();
  await expect.poll(() => t.tasinan().length).toBe(1);
  expect(t.tasinan()[0]).toMatchObject({ isId: 'S3.a1', tezgah: 'M1' });
  await expect(satir).toBeVisible({ timeout: 10_000 });
  await expect(satir).toContainText('ORN-T1 üzerinde sahada süren');
  await expect(satir).toContainText('saatine alındı ve orada kilitli');
  for (const ad of ['Tamam', 'Kilidi kaldır', 'Geri al']) await expect(satir.getByRole('button', { name: ad })).toBeVisible();
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3804-satir-${bilgi.project.name}.png` });

  // Kokpit'in genel Geri'si (Ctrl+Z) taşımayı alır: taşıma artık son değişiklik değildir, satır kendiliğinden kalkar.
  await tahta.click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Control+z');
  await expect.poll(() => t.s.satirlar.filter((x) => x.komut.tur !== 'diz').length).toBe(0);
  await expect(satir).toHaveCount(0);

  // Satırdaki Geri al da taşımayı alır ve satırı kapatır.
  await surukle();
  await expect(satir).toBeVisible({ timeout: 10_000 });
  await satir.getByRole('button', { name: 'Geri al' }).click();
  await expect(satir).toHaveCount(0);
  expect(t.s.satirlar.filter((x) => x.komut.tur !== 'diz')).toHaveLength(0);

  // Yeniden taşınır; Tamam satırı kapatır, taşıma taslakta kalır.
  await surukle();
  await expect(satir).toBeVisible({ timeout: 10_000 });
  await satir.getByRole('button', { name: 'Tamam' }).click();
  await expect(satir).toHaveCount(0);
  expect(t.tasinan()).toHaveLength(3);
  expect(t.s.satirlar.filter((x) => x.komut.tur !== 'diz')).toHaveLength(1);
  await tasma();
  expect(ag.hatalar).toEqual([]);
});
