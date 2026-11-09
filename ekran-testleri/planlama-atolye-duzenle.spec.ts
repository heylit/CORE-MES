import type { Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// 2531 a: atölyede (Tezgâh stüdyosu) Düzenle ve Yapılacaklar, motor hamlesi akışı; 2539 a: Kilit ve dondurma paneli. Genişlik projeden gelir
// (360, 768, 1280). Çalışma okuması, sunucu komutları ve motor ağ katmanında uydurma cevaplarla verilir (page.route); veritabanına yazılmaz.
// Akış: iş seçilir, E ile Düzenle açılır, "1 saat sonraya" taşı komutunu gönderir; siparişte Öne al motoru sorar, sonuç önizlenir, Uygula
// çalışmaya yazar, Geri al geri getirir. Sayfa hiçbir adımda yatay taşmaz.
test.use({ hesap: 'ornek.yonetici' });

const PLAN = {
  dataVer: 3,
  ops: {
    'S1.a1': { job: 'S1', m: 'M1', S: 8, C: 20 }, 'S1.a2': { job: 'S1', m: '@F1', S: 20, C: 68, fas: 1 },
    'S1.a3': { job: 'S1', m: 'M1', S: 70, C: 80 }, 'S2.a1': { job: 'S2', m: 'M1', S: 20, C: 30 },
  },
  J: { S1: { C: 80, T: 15 }, S2: { C: 30, T: 0 } },
  warn: [], ozet: { wT: 15, T: 15, late: 1 },
};
// Veri uydurmadır: bir tezgâh, bir fasoncu, iki sipariş; S1 gecikmede.
const CALISMA = {
  surum: 2, dataVer: 3, w: { dondurma: 4 },
  D: {
    meta: { baslangic: '2026-10-19' },
    siparisler: [{ id: 'S1', urun: 'U1', adet: 10, termin: '2026-10-21 17:00' }, { id: 'S2', urun: 'U1', adet: 4, termin: '2026-10-30 17:00' }],
    urunler: [{ id: 'U1', ad: 'Deneme parca', rota: [{ k: 'a1', tezgahlar: [{ id: 'M1', cevrim: 60 }] }, { k: 'a2', fason: 'F1', bag: [['a1', 'FS']] }, { k: 'a3', bag: [['a2', 'FS']], tezgahlar: [{ id: 'M1', cevrim: 60 }] }] }],
    tezgahlar: [{ id: 'M1', ad: 'Deneme tezgah' }],
    fasoncular: [{ id: 'F1', ad: 'Deneme fason', sureGun: 2, kapasite: 1 }],
  },
  plan: PLAN,
};
const ONE_AL = {
  tur: 'one-al', siparisId: 'S1', yol: 'sıra', neden: null, bitisOnce: 80, bitisSonra: 60, gecikmeOnce: 15, gecikmeSonra: 0,
  degisen: [{ siparisId: 'S1', once: 80, sonra: 60, durum: 'zamanina-girdi' }],
  plan: { ...PLAN, ops: { ...PLAN.ops, 'S1.a3': { job: 'S1', m: 'M1', S: 50, C: 60 } }, J: { S1: { C: 60, T: 0 }, S2: { C: 30, T: 0 } } },
};

const json = (r: Route, v: unknown) => r.fulfill({ json: v });

test('atölyede Düzenle ile taşı, Öne al önizlenir, Uygula yazar, Geri al döner; Kilit ve dondurma paneli; yatay taşma yok', async ({ page, ac, ag }) => {
  let surum = 1;
  const govdeler: Record<string, unknown[]> = {};
  const kaydet = (yol: string, g: unknown) => { (govdeler[yol] ??= []).push(g); };
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: CALISMA, surum }));
  await page.route('**/api/plan/planlama-calismasi/is-tasi', (r) => { kaydet('is-tasi', r.request().postDataJSON()); return json(r, { calismaSurumu: surum, oncekiSurum: surum }); });
  await page.route('**/api/plan/planlama-kayitlari/yaz', (r) => {
    const g = r.request().postDataJSON() as { anahtar: string; deger: unknown };
    kaydet('yaz', g); surum += 1;
    return json(r, { kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum } });
  });
  await page.route('**/api/plan/planlama-degerlendirmesi', (r) => { kaydet('degerlendirme', r.request().postDataJSON()); return json(r, { is: 'one-al' }); });
  await page.route('**/api/plan/planlama-degerlendirmesi/one-al', (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: surum, dataVer: 3, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: false, sonuc: ONE_AL },
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/studio');
  await expect(page.locator('.tc-pym-tp-govde')).toBeVisible({ timeout: 20_000 });
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };

  // Yapılacaklar köşesi panoda; Y açar, Esc kapatır.
  await expect(page.getByRole('button', { name: /^Yapılacaklar: / })).toBeVisible();
  await page.keyboard.press('y');
  await expect(page.getByRole('dialog', { name: 'Yapılacaklar' })).toBeVisible();
  await tasma();
  await page.keyboard.press('Escape');

  // İş seçilir, E Düzenle'yi açar; "1 saat sonraya" atölyenin taşı komutudur.
  await page.locator('[data-id="S1.a3"]').first().click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  const dz = page.getByRole('dialog', { name: 'Düzenle' });
  await expect(dz).toBeVisible();
  await tasma();
  await dz.getByRole('button', { name: /1 saat sonraya/ }).click();
  await expect.poll(() => govdeler['is-tasi']?.length ?? 0).toBe(1);
  expect(govdeler['is-tasi']?.[0]).toMatchObject({ isId: 'S1.a3', tezgah: 'M1' });

  // Bugün'de geciken siparişin Öne al'ı: motor sorulur, sonuç önizlenir, Uygula çalışmaya yazar, Geri al geri getirir (raydaki aynı düğme birim testinde).
  await expect(page.locator('.tc-pym-tp-govde')).toBeVisible();
  const bugun = page.getByRole('region', { name: 'Bugün' });
  await bugun.getByRole('button', { name: /^Bugün/ }).click();
  await bugun.getByRole('button', { name: 'S1 öne al' }).click();
  await expect.poll(() => govdeler['degerlendirme']?.length ?? 0).toBe(1);
  expect(govdeler['degerlendirme']?.[0]).toMatchObject({ istek: { tur: 'one-al', siparisId: 'S1' } });
  // Dar ekranda açık Bugün önizlemeyi örter; kişi önce şeridi kapatır.
  await bugun.getByRole('button', { name: /^Bugün/ }).click();
  const uygula = page.getByRole('button', { name: 'Uygula' });
  await expect(uygula).toBeVisible();
  await tasma();
  await uygula.click();
  await expect.poll(() => govdeler['yaz']?.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
  const geri = page.locator('.tc-pym-tp-ust').getByRole('button', { name: 'Geri al', exact: true });
  await expect(geri).not.toHaveAttribute('aria-disabled', 'true');
  await geri.click();
  await expect(geri).toHaveAttribute('aria-disabled', 'true');

  // 2539 a: Kilit ve dondurma paneli üst çubuktan açılır; donuk bölge, sabitler, dondurulmuş günler ve başlamış iş notu.
  await page.getByRole('button', { name: 'Kilit ve dondurma' }).click();
  const kp = page.getByRole('dialog', { name: 'Kilit ve dondurma' });
  await expect(kp).toBeVisible();
  await expect(kp.getByRole('button', { name: 'Sabitleri kaldır' })).toBeVisible();
  await expect(kp.getByRole('button', { name: /Günü dondur|Dondurmayı kaldır/ }).first()).toBeVisible();
  await expect(kp.getByText(/Başlamış iş bu ayarlardan bağımsızdır/)).toBeVisible();
  await tasma();
  expect(ag.yazmalar.every((y) => /planlama-calismasi\/is-tasi|planlama-kayitlari\/yaz|planlama-degerlendirmesi|duzenleyen/.test(y))).toBe(true);
});
