import type { Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3792: Planda böl > Etkisini gör, bölünmüş planı tahtada taslak olarak gösterir (altta onay çubuğu, üstte tek şerit); Vazgeç komutu geri alır ve
// girilen adetler panelde durur, Uygula dizmeyi taslağa yazar, canlı plan yazılmaz. 1280 ve 768: işin sağ tık menüsünden Planda böl. 360: telefonda tahta
// yoktur; önizleme sürerken açılır ("Yalnız etkilenen tezgâhlar"), bölme pay kartındaki "Bölmeyi yönet" ile başlar. Çalışma ve taslak ağ katmanında
// uydurmadır (page.route, ORN- veri); veritabanına yazılmaz. Sayfa hiçbir adımda yatay taşmaz.
test.use({ hesap: 'ornek.yonetici' });

type Pay = { no: number; n: number; asil: string; adet: number; elle: 1 };
type Is = { job: string; m: string; S: number; C: number; pay?: Pay };
type Komut = { tur: string } & Record<string, unknown>;
type Bolme = readonly { adet: number; m: string }[] | null;
const ADIM = 'S1.a1';
// S1: Torna adımı 40 adet (saatte 5 adet), ardından Taşlama (M4, 4 saat). S2 öteki işi taşır.
function ops(b: Bolme): Record<string, Is> {
  const paylar: Record<string, Is> = b === null || b.length < 2
    ? { [ADIM]: { job: 'S1', m: b?.[0]?.m ?? 'M1', S: 8, C: 16 } }
    : Object.fromEntries(b.map((p, i) => [i === 0 ? ADIM : `${ADIM}~${String(i + 1)}`, { job: 'S1', m: p.m, S: 8, C: 8 + p.adet / 5, pay: { no: i + 1, n: b.length, asil: ADIM, adet: p.adet, elle: 1 } }]));
  const bitis = Math.max(...Object.values(paylar).map((x) => x.C));
  return { ...paylar, 'S1.a2': { job: 'S1', m: 'M4', S: bitis, C: bitis + 4 }, 'S2.a1': { job: 'S2', m: 'M1', S: 20, C: 24 } };
}
const calisma = (bolme: Bolme, planBolmesi: Bolme) => ({
  surum: 2, dataVer: 3, w: { dondurma: 4 }, locks: {}, down: [], ekMesai: [], ...(bolme && bolme.length > 1 ? { elleBol: { [ADIM]: bolme } } : {}),
  D: {
    meta: { baslangic: '2026-10-19' },
    siparisler: [{ id: 'S1', urun: 'U1', adet: 40, termin: '2026-10-23 17:00' }, { id: 'S2', urun: 'U2', adet: 8, termin: '2026-10-23 17:00' }],
    urunler: [
      { id: 'U1', ad: 'ORN-Deneme burc', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 6 }, { id: 'M2', cevrim: 6 }, { id: 'M3', cevrim: 6 }] }, { k: 'a2', ad: 'Taşlama', tezgahlar: [{ id: 'M4', cevrim: 6 }] }] },
      { id: 'U2', ad: 'ORN-Deneme mil', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 6 }] }] },
    ],
    tezgahlar: [{ id: 'M1', kod: 'ORN-T1', ad: 'Deneme torna 1' }, { id: 'M2', kod: 'ORN-T2', ad: 'Deneme torna 2' }, { id: 'M3', kod: 'ORN-T3', ad: 'Deneme torna 3' }, { id: 'M4', kod: 'ORN-T4', ad: 'Deneme taşlama' }],
    vardiyalar: [{ id: '1', bas: '08:00', bit: '16:00', molalar: [] }, { id: '2', bas: '16:00', bit: '00:00', molalar: [] }],
    calismaGunleri: { pzt: ['1', '2'], sal: ['1', '2'], car: ['1', '2'], per: ['1', '2'], cum: ['1', '2'], cmt: ['1'], paz: [] },
  },
  plan: { dataVer: 3, ops: ops(planBolmesi), warn: [], ozet: { wT: 0, T: 0, late: 0 }, J: { S1: { C: 20, T: 0 }, S2: { C: 24, T: 0 } } },
});
const json = (r: Route, v: unknown) => r.fulfill({ json: v });

// Taslak uydurmadır: elle-bol payları kurar; plan yalnız dizmeden sonra yeni bölmeyi gösterir (komuttan sonra taslağın planı eski kalır).
async function sunucu(page: Page, ilk: Bolme) {
  const s = { komutlar: [] as Komut[], satirlar: [] as { komut: Komut; ne: string; t: number; hata: null }[], surum: 0, geriAlinan: 0, dizilen: 0 };
  const bolme = (): Bolme => { let b = ilk; for (const { komut: k } of s.satirlar) { if (k.tur === 'elle-bol') b = (k['paylar'] as { adet: number; tezgah: string }[]).map((p) => ({ adet: p.adet, m: p.tezgah })); } return b; };
  const planBolmesi = (): Bolme => { let b = ilk, bekleyen = ilk; for (const { komut: k } of s.satirlar) { if (k.tur === 'elle-bol') bekleyen = (k['paylar'] as { adet: number; tezgah: string }[]).map((p) => ({ adet: p.adet, m: p.tezgah })); if (k.tur === 'diz') b = bekleyen; } return b; };
  const cevap = () => (s.satirlar.length === 0 ? { taslak: null, calisma: calisma(ilk, ilk), surum: 1 } : { taslak: { surum: s.surum, tabanSurum: 1, satirlar: s.satirlar }, calisma: calisma(bolme(), planBolmesi()), surum: 1 });
  await page.route('**/api/plan/planlama-calismasi/duzenleyen', (r) => json(r, { kisiId: null, kisi: null, zaman: null, surum: null }));
  await page.route('**/api/plan/planlama-calismasi/gonderme-onizlemesi', (r) => json(r, { kapali: [], kilitYetkisi: true, oneri: null, oneriNedeni: null, ihlaller: [] }));
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: calisma(ilk, ilk), surum: 1 }));
  await page.route('**/api/plan/taslagim', (r) => json(r, cevap()));
  await page.route('**/api/plan/taslagim/komut', (r) => {
    const k = (r.request().postDataJSON() as { komut: Komut }).komut;
    s.komutlar.push(k); s.satirlar.push({ komut: k, ne: `${k.tur} ${String(k['isId'] ?? '')}`, t: 0, hata: null }); s.surum += 1;
    return json(r, cevap());
  });
  await page.route('**/api/plan/taslagim/geri-al', (r) => { s.satirlar.pop(); s.surum += 1; s.geriAlinan += 1; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/diz', (r) => { s.satirlar.push({ komut: { tur: 'diz', isler: ['S1'] }, ne: 'Plan yeniden dizildi', t: 0, hata: null }); s.surum += 1; s.dizilen += 1; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/degerlendirme', (r) => json(r, { is: '00000000-0000-4000-8000-0000000003a1' }));
  await page.route('**/api/plan/planlama-degerlendirmesi/*', (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: 1, dataVer: 3, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: calisma(bolme(), bolme()).plan } },
  }));
  return s;
}

test('Kokpit 3792: Etkisini gör bölünmüş planı tahtada taslak olarak gösterir; Vazgeç geri alır ve değerler durur, Uygula taslağa yazar; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const proje = bilgi.project.name, telefon = proje === 'g360';
  const ilk: Bolme = telefon ? [{ adet: 20, m: 'M1' }, { adet: 20, m: 'M2' }] : null;
  const s = await sunucu(page, ilk);
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const cek = async (adim: string) => { await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/tmiv2-ekran/3792-${adim}-${proje}.png` }); };
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };

  // Paneli aç.
  if (telefon) {
    await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Tezgâhlar' }).click();
    await kokpit.locator(`[data-liste-satir="${ADIM}~2"] button`).first().click();
    await page.locator('.tc-pyq-pano[data-kip="sayfa"]').locator('[data-bol-yonet]').click();
  } else {
    await kokpit.locator(`.tc-pyq-tahta .tc-pyq-is[data-is="${ADIM}"]`).click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: /Planda böl/ }).click();
  }
  const panel = page.getByRole('complementary', { name: 'Planda böl' });
  await expect(panel).toBeVisible();
  // Telefonda adetler 30 / 10 olur: eski yer iki paydır.
  const adetler = panel.getByLabel('Adet');
  if (telefon) { await adetler.nth(0).fill('30'); await adetler.nth(1).fill('10'); }
  const girilen = await adetler.evaluateAll((l) => l.map((x) => (x as HTMLInputElement).value));
  await tasma();
  await cek('1-panel');
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();

  // Önizleme: panel gizli, tahtada taslak paylar ve eski yer, üstte tek şerit, altta onay çubuğu.
  const onay = page.getByRole('group', { name: 'Bölmeyi onayla' });
  await expect(onay).toBeVisible();
  await expect(panel).toBeHidden();
  const taslak = kokpit.locator('.tc-pyq-tahta [data-taslak]');
  await expect(taslak).toHaveCount(2);
  await expect(taslak.first().locator('[data-taslak-rozet]')).toHaveText('taslak');
  const eski = kokpit.locator('.tc-pyq-tahta [data-bol-eski]');
  await expect(eski.first()).toContainText('eski yer');
  // Eski yerden paylara ve kayan işin eski yerinden yeni yerine kesik ok (data- özniteliğiyle sayılır); 360'ta da.
  await expect(kokpit.locator('.tc-pyq-tahta [data-bol-ok-tur="pay"]')).toHaveCount(2);
  await expect(kokpit.locator('.tc-pyq-tahta [data-bol-ok-tur="kayan"]')).not.toHaveCount(0);
  for (const d of await kokpit.locator('.tc-pyq-tahta [data-bol-ok] path:first-child').evaluateAll((l) => l.map((p) => p.getAttribute('d') ?? ''))) expect(d).toMatch(/^M-?[\d.]+,-?[\d.]+ L-?[\d.]+,-?[\d.]+$/);
  const serit = page.getByRole('region', { name: 'Değişiklikleriniz' });
  await expect(serit).toContainText('Önizleme: bölmenin taslağı · plan değişmedi');
  await expect(serit).toContainText('Canlıya al, bölme uygulanınca ya da vazgeçilince açılır');
  await expect(serit.getByRole('button', { name: /Canlıya al|Onaya gönder/ })).toBeDisabled();
  await expect(onay.getByRole('button')).toHaveText(['Düzenle', 'Vazgeç', 'Uygula']);
  await expect(onay.locator('[data-bol-not]')).toHaveText('Uygula taslağa yazar; plan Canlıya al ile değişir.');
  expect(s.dizilen).toBe(0);
  await cek('2-onizleme');
  await tasma();
  // Onay çubuğu yan menünün üstüne binmez; dokunma hedefleri en az 44 px.
  const anaMenu = page.getByRole('navigation', { name: 'Ana menü' });
  const menu = (await anaMenu.count()) > 0 ? await anaMenu.first().boundingBox() : null, kutu = await onay.boundingBox();
  if (menu && kutu && menu.width > 0 && menu.x < 10) expect(kutu.x).toBeGreaterThanOrEqual(menu.x + menu.width - 1);
  if (telefon) {
    for (const d of await onay.getByRole('button').all()) expect((await d.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await expect(onay.locator('[data-bol-cumle="kisa"]')).toBeVisible();
    // Açılışta paylar ve kayan iş (Taşlama) birlikte görünür: tahtanın yatay görünümü içindedir.
    const alan = await kokpit.locator('.tc-pyq-tahta').boundingBox();
    for (const sec of ['[data-taslak]', `.tc-pyq-is[data-is="S1.a2"]`]) {
      const b = await kokpit.locator(`.tc-pyq-tahta ${sec}`).first().boundingBox();
      expect(b!.x + b!.width).toBeGreaterThan(alan!.x);
      expect(b!.x).toBeLessThan(alan!.x + alan!.width);
    }
    await expect(page.getByRole('button', { name: /Yalnız etkilenen \d+ tezgâh/ })).toBeVisible();
  }
  // Önizlemede sürükleme kapalı: çift tık işi tutmaz.
  await kokpit.locator('.tc-pyq-tahta .tc-pyq-is[data-is="S2.a1"]').first().dispatchEvent('dblclick');
  await expect(page.getByText('Bırakmak için tıklayın')).toHaveCount(0);

  // Vazgeç: komut geri alınır, önizleme kalkar, panel girilen adetlerle döner.
  await onay.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(onay).toHaveCount(0);
  await expect(taslak).toHaveCount(0);
  await expect(panel).toBeVisible();
  expect(s.geriAlinan).toBe(1);
  expect(await adetler.evaluateAll((l) => l.map((x) => (x as HTMLInputElement).value))).toEqual(girilen);

  // Esc de aynısını yapar.
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();
  await expect(onay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(onay).toHaveCount(0);
  expect(s.geriAlinan).toBe(2);

  // Uygula: dizme taslağa yazılır.
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();
  await onay.getByRole('button', { name: 'Uygula' }).click();
  await expect(onay).toHaveCount(0);
  expect(s.dizilen).toBe(1);
  await expect(panel).toHaveCount(0);
  await tasma();
  expect(ag.hatalar).toEqual([]);
});
