import type { Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3751: Kokpit'te bölünmüş adımın payları birleşir. 1280 ve 768: Emirler görünümünde pay kardeşinin (çubuğu ya da sol listedeki satırı)
// üstüne bırakılır, sağ tık menüsünde "Şununla birleştir" vardır; bırakınca ya da seçince onay çubuğu açılır, Esc vazgeçer, Uygula taslağa yazar.
// 360: sürükleme ve sağ tık yok; pay kartındaki Birleştir alt sayfası açılır. Çalışma ve taslak ağ katmanında uydurmadır (page.route, ORN- veri);
// veritabanına yazılmaz. Sayfa hiçbir adımda yatay taşmaz.
test.use({ hesap: 'ornek.yonetici' });

type Pay = { no: number; n: number; asil: string; adet: number; elle: 1 };
type Is = { job: string; m: string; S: number; C: number; pay?: Pay };
type Komut = { tur: string } & Record<string, unknown>;
const ADIM = 'S1.a1';
// S1'in tek adımı 40 adet; üç paya elle bölünmüş: M1 20, M2 10, M3 10. S2 bölünmemiştir.
function paylar(l: readonly { adet: number; m: string }[]): Record<string, Is> {
  if (l.length < 2) return { [ADIM]: { job: 'S1', m: l[0]?.m ?? 'M1', S: 8, C: 16 } };
  return Object.fromEntries(l.map((p, i) => [i === 0 ? ADIM : `${ADIM}~${String(i + 1)}`, { job: 'S1', m: p.m, S: 8, C: 8 + p.adet / 5, pay: { no: i + 1, n: l.length, asil: ADIM, adet: p.adet, elle: 1 } }]));
}
const ILK_BOLME = [{ adet: 20, m: 'M1' }, { adet: 10, m: 'M2' }, { adet: 10, m: 'M3' }];
const calisma = (bolme: readonly { adet: number; m: string }[] | null) => {
  const ops: Record<string, Is> = { ...paylar(bolme ?? [{ adet: 40, m: 'M1' }]), 'S2.a1': { job: 'S2', m: 'M1', S: 20, C: 24 } };
  return {
    surum: 2, dataVer: 3, w: { dondurma: 4 }, locks: {}, down: [], ekMesai: [], ...(bolme ? { elleBol: { [ADIM]: bolme } } : {}),
    D: {
      meta: { baslangic: '2026-10-19' },
      siparisler: [{ id: 'S1', urun: 'U1', adet: 40, termin: '2026-10-23 17:00' }, { id: 'S2', urun: 'U1', adet: 8, termin: '2026-10-23 17:00' }],
      urunler: [{ id: 'U1', ad: 'ORN-Deneme burc', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 6 }, { id: 'M2', cevrim: 6 }, { id: 'M3', cevrim: 6 }] }] }],
      tezgahlar: [{ id: 'M1', kod: 'ORN-T1', ad: 'Deneme torna 1' }, { id: 'M2', kod: 'ORN-T2', ad: 'Deneme torna 2' }, { id: 'M3', kod: 'ORN-T3', ad: 'Deneme torna 3' }],
      vardiyalar: [{ id: '1', bas: '08:00', bit: '16:00', molalar: [] }, { id: '2', bas: '16:00', bit: '00:00', molalar: [] }],
      calismaGunleri: { pzt: ['1', '2'], sal: ['1', '2'], car: ['1', '2'], per: ['1', '2'], cum: ['1', '2'], cmt: ['1'], paz: [] },
    },
    plan: { dataVer: 3, ops, warn: [], ozet: { wT: 0, T: 0, late: 0 }, J: { S1: { C: 16, T: 0 }, S2: { C: 24, T: 0 } } },
  };
};
const json = (r: Route, v: unknown) => r.fulfill({ json: v });

// Taslak uydurmadır: elle-bol payları yeniden kurar, elle-bol-sil adımı tek parça yapar; dizme planı olduğu gibi bırakır.
async function sunucu(page: Page) {
  const s = { komutlar: [] as Komut[], satirlar: [] as { komut: Komut; ne: string; t: number; hata: null }[], surum: 0 };
  const bolme = (): readonly { adet: number; m: string }[] | null => {
    let b: readonly { adet: number; m: string }[] | null = ILK_BOLME;
    for (const { komut: k } of s.satirlar) {
      if (k.tur === 'elle-bol') b = (k['paylar'] as { adet: number; tezgah: string }[]).map((p) => ({ adet: p.adet, m: p.tezgah }));
      if (k.tur === 'elle-bol-sil') b = null;
    }
    return b;
  };
  const cevap = () => (s.satirlar.length === 0 ? { taslak: null, calisma: calisma(ILK_BOLME), surum: 1 } : { taslak: { surum: s.surum, tabanSurum: 1, satirlar: s.satirlar }, calisma: calisma(bolme()), surum: 1 });
  await page.route('**/api/plan/planlama-calismasi/duzenleyen', (r) => json(r, { kisiId: null, kisi: null, zaman: null, surum: null }));
  await page.route('**/api/plan/planlama-calismasi/gonderme-onizlemesi', (r) => json(r, { kapali: [], kilitYetkisi: true, oneri: null, oneriNedeni: null, ihlaller: [] }));
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: calisma(ILK_BOLME), surum: 1 }));
  await page.route('**/api/plan/taslagim', (r) => json(r, cevap()));
  await page.route('**/api/plan/taslagim/komut', (r) => {
    const k = (r.request().postDataJSON() as { komut: Komut }).komut;
    s.komutlar.push(k); s.satirlar.push({ komut: k, ne: `${k.tur} ${String(k['isId'] ?? '')}`, t: 0, hata: null }); s.surum += 1;
    return json(r, cevap());
  });
  await page.route('**/api/plan/taslagim/diz', (r) => { s.satirlar.push({ komut: { tur: 'diz', isler: ['*'] }, ne: 'Plan yeniden dizildi', t: 0, hata: null }); s.surum += 1; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/degerlendirme', (r) => json(r, { is: '00000000-0000-4000-8000-0000000003a1' }));
  await page.route('**/api/plan/planlama-degerlendirmesi/*', (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: 1, dataVer: 3, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: calisma(bolme()).plan } },
  }));
  return s;
}

for (const buyukYazi of [false, true]) {
  test(`Kokpit 3751: bölünmüş adımın payları sürükle-bırak, sağ tık menüsü ve telefonda alt sayfa ile birleşir${buyukYazi ? ' (büyük yazı)' : ''}; yatay taşma yok`, async ({ page, ac, ag }, bilgi) => {
    const proje = bilgi.project.name;
    if (buyukYazi && proje !== 'g360') return;
    if (buyukYazi) await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--yazi-xs:15.6px;--yazi-s:18.2px;--yazi-m:20.8px;--yazi-l:23.4px}'; document.head.append(st); }); });
    const s = await sunucu(page);
    await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
    await ac('/plan/kokpit');
    const kokpit = page.locator('.tc-pyq');
    await expect(kokpit).toBeVisible({ timeout: 20_000 });
    const karsilama = page.getByRole('button', { name: 'Başlayalım' });
    if (await karsilama.isVisible()) await karsilama.click();
    const ad = `${proje}${buyukYazi ? '-yazi130' : ''}`;
    const cek = async (adim: string) => { await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/tmiv2-ekran/3751-${adim}-${ad}.png` }); };
    const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
    const onay = page.getByRole('group', { name: 'Birleştirmeyi onayla' });
    // Onay çubuğu yan menünün üstüne binmez.
    const tahtaIcinde = async () => {
      const r = await page.getByRole('menu').evaluate((el) => {
        const m = el.getBoundingClientRect(), t = el.closest('.tc-pyq-tahta')!, k = t.getBoundingClientRect();
        return { sol: m.left, sag: m.right, alt: m.bottom, tSol: k.left + t.clientLeft, tSag: k.left + t.clientLeft + t.clientWidth, tAlt: k.top + t.clientTop + t.clientHeight };
      });
      expect(r.sol).toBeGreaterThanOrEqual(r.tSol);
      expect(r.sag).toBeLessThanOrEqual(r.tSag);
      expect(r.alt).toBeLessThanOrEqual(r.tAlt);
    };
    const menudenAyri = async () => {
      const menu = await page.getByRole('navigation', { name: 'Ana menü' }).boundingBox(), k = await onay.boundingBox();
      if (menu && k && menu.width > 0) expect(k.x).toBeGreaterThanOrEqual(menu.x + menu.width);
    };

    if (proje === 'g360') {
      // Telefon: pay kartından Birleştir alt sayfası; pay ve kardeşi seçilir, onay bölümünde Uygula taslağa yazar.
      // Telefonda tahta yoktur: Tezgâhlar listesinde payın satırına basılır, pay kartı alttan açılır.
      await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Tezgâhlar' }).click();
      await kokpit.locator('[data-liste-satir="S1.a1~2"] button').first().click();
      const kart = page.locator('.tc-pyq-pano[data-kip="sayfa"]');
      await expect(kart).toBeVisible();
      await kart.getByRole('button', { name: 'Birleştir' }).click();
      const sayfa = page.getByRole('complementary', { name: 'Payları birleştir' });
      await expect(sayfa).toBeVisible();
      await expect(sayfa.getByRole('list', { name: 'Şununla birleştir' }).getByRole('button')).toHaveCount(3);
      await tasma();
      await cek('1-alt-sayfa');
      await sayfa.locator(`[data-birles-ile="${ADIM}"]`).click();
      const sOnay = sayfa.getByRole('group', { name: 'Birleştirmeyi onayla' });
      await expect(sOnay).toContainText('10 + 20 = 30 adet · ORN-T1 tezgâhında kalır · 2 pay kalır');
      await sOnay.scrollIntoViewIfNeeded();
      await tasma();
      await cek('2-alt-sayfa-onay');
      // Esc önce onayı kapatır.
      await page.keyboard.press('Escape');
      await expect(sOnay).toHaveCount(0);
      await sayfa.locator(`[data-birles-ile="${ADIM}"]`).click();
      await sOnay.getByRole('button', { name: 'Uygula' }).click();
      await expect(sayfa).toHaveCount(0);
      expect(s.komutlar).toEqual([{ tur: 'elle-bol', isId: ADIM, paylar: [{ adet: 30, tezgah: 'M1' }, { adet: 10, tezgah: 'M3' }] }]);
      await tasma();
      expect(ag.hatalar).toEqual([]);
      return;
    }

    // Emirler görünümü: S1 açılır, adımın payları satır satır görünür.
    await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Emirler' }).click();
    const bolum = kokpit.getByRole('region', { name: 'Emirler' });
    await bolum.locator('button[data-agac="S1"]').click();
    await bolum.locator(`[data-adim-satiri="${ADIM}"]`).click();
    const p3 = bolum.locator(`.tc-pyq-is[data-is="${ADIM}~3"]`);
    await expect(p3).toBeVisible();
    await expect(p3).toHaveCSS('cursor', 'grab');

    // Sağ tık menüsü: kardeş paylar sonuç adediyle, "Bütün payları birleştir" birleştirme simgesiyle.
    await p3.click({ button: 'right' });
    const grup = page.getByRole('menu').getByRole('group', { name: 'Şununla birleştir' });
    await expect(grup.getByRole('menuitem')).toHaveText([/Pay 1\/3 · ORN-T1 · 20 adet\s*birleşince 30 adet/, /Pay 2\/3 · ORN-T2 · 10 adet\s*birleşince 20 adet/, /Bütün payları birleştir/]);
    await tahtaIcinde();
    await tasma();
    await cek('1-menu');
    await grup.getByRole('menuitem', { name: /Pay 1\/3/ }).click();
    await expect(onay).toBeVisible();
    await expect(onay.locator('[data-onay-tur="birlestir"]')).toHaveText('Birleştir');
    await expect(onay.getByRole('status')).toContainText('10 + 20 = 30 adet · ORN-T1 tezgâhında kalır · 2 pay kalır');
    await menudenAyri();
    await cek('2-menu-onay');
    // Esc vazgeçer: taslağa yazılmaz.
    await page.keyboard.press('Escape');
    await expect(onay).toHaveCount(0);
    expect(s.komutlar).toEqual([]);

    // Sürükle-bırak: pay tutulunca ipucu birleştirmeyi söyler; hedef sol listedeki kardeş satırının tamamıdır.
    const kutu = await p3.boundingBox();
    if (!kutu) throw new Error('pay çubuğu yok');
    // Dar payın sol ucu sol bölmenin altında kalabilir: çubuğun sağ ucundan tutulur.
    const x0 = kutu.x + kutu.width - 4, y0 = kutu.y + kutu.height / 2;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + 20, y0, { steps: 4 });
    await expect(kokpit.locator('[data-birles-ipucu]')).toContainText('Birleştirmek için kardeş payın üstüne bırakın');
    await expect(bolum.locator('.tc-pyq-is[data-birles-aday]')).toHaveCount(2);
    const satir2 = bolum.locator(`[data-pay-satir="${ADIM}~2"]`);
    const bas = await satir2.locator('.tc-pyq-bas').boundingBox();
    if (!bas) throw new Error('pay satırı yok');
    await page.mouse.move(bas.x + bas.width / 2, bas.y + bas.height / 2, { steps: 6 });
    await expect(satir2).toHaveAttribute('data-birles-hedef', '');
    await expect(kokpit.locator('[data-birles-ipucu]')).toContainText('Birleştir: 10 + 10 = 20 adet · ORN-T2 tezgâhında kalır · 2 pay kalır');
    await tasma();
    await cek('3-surukle');
    await page.mouse.up();
    await expect(onay).toBeVisible();
    await expect(onay.getByRole('status')).toContainText('10 + 10 = 20 adet · ORN-T2 tezgâhında kalır');
    await menudenAyri();
    await cek('4-birak-onay');
    await onay.getByRole('button', { name: 'Uygula' }).click();
    await expect(onay).toHaveCount(0);
    await expect.poll(() => s.komutlar).toEqual([{ tur: 'elle-bol', isId: ADIM, paylar: [{ adet: 20, tezgah: 'M1' }, { adet: 20, tezgah: 'M2' }] }]);
    // Taslağa yazıldı: plan iki paylı çizilir; Geri ile alınır (taslak çubuğu).
    await expect(bolum.locator(`.tc-pyq-is[data-is="${ADIM}~3"]`)).toHaveCount(0);
    await tasma();
    await cek('5-uygulandi');

    // Tezgâhlar görünümünde pay sürüklenmez; menüde birleştirme vardır.
    await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Tezgâhlar' }).click();
    const tz = kokpit.getByRole('region', { name: 'Tezgâhlar' });
    await tz.locator(`.tc-pyq-is[data-is="${ADIM}~2"]`).click({ button: 'right' });
    await expect(page.getByRole('menu').getByRole('group', { name: 'Şununla birleştir' }).getByRole('menuitem')).toHaveCount(1);
    await tahtaIcinde();
    await page.keyboard.press('Escape');
    expect(ag.hatalar).toEqual([]);
  });
}
