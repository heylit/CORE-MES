import { readFileSync } from 'node:fs';
import { test as temel, expect } from '@playwright/test';
import type { Frame, Page } from '@playwright/test';
import type { Hesap } from './hesaplar.ts';
import { oturumDosyasi } from './yollar.ts';

export { expect };
export type { Hesap };

export const ADRES = 'http://127.0.0.1:4101';

// Sayfa açılırken biriken sorunlar: konsol hatası, 4xx/5xx API cevabı ve GET dışı API isteği.
export interface Ag {
  hatalar: string[];
  yazmalar: string[];
  sifirla(): void;
}

type TestFixture = { hesap: Hesap; ag: Ag; ac: (yol: string) => Promise<void> };

export const test = temel.extend<TestFixture>({
  hesap: ['ornek.yonetici', { option: true }],
  // Oturum oturum.kurulum.ts'de bir kez açılır; her test o hesabın çerezini alır.
  storageState: async ({ hesap }, kullan) => { await kullan(oturumDosyasi(hesap)); },
  context: async ({ context, hesap }, kullan) => {
    const { kisiId } = JSON.parse(readFileSync(oturumDosyasi(hesap), 'utf8')) as { kisiId: number };
    // Karşılama, tanıtım ve açılış gösterisi ekranı örter; kişi onları görmüş sayılır (istemci/src/ortak/veri: karsilama, tanitim, gorunum).
    await context.addInitScript((id: number) => {
      try {
        localStorage.setItem('tmi-performans', 'acik');
        localStorage.setItem(`tmi:tanitim:${String(id)}`, '1');
        sessionStorage.setItem('tmi.karsilama', String(id));
      } catch { /* depo kapalıysa ekran yine açılır; örten pencereyi test görür */ }
    }, kisiId);
    await kullan(context);
  },
  ag: async ({ page }, kullan) => {
    const ag: Ag = {
      hatalar: [],
      yazmalar: [],
      sifirla() { this.hatalar.length = 0; this.yazmalar.length = 0; },
    };
    page.on('console', (m) => { if (m.type() === 'error') ag.hatalar.push(`konsol: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (h) => { ag.hatalar.push(`sayfa: ${h.message.slice(0, 200)}`); });
    page.on('response', (c) => {
      const yol = c.url().replace(ADRES, '');
      if (!yol.startsWith('/api/')) return;
      const yontem = c.request().method();
      if (c.status() >= 400) ag.hatalar.push(`${String(c.status())} ${yontem} ${yol}`);
      if (yontem !== 'GET') ag.yazmalar.push(`${yontem} ${yol.split('?')[0] ?? yol}`);
    });
    await kullan(ag);
  },
  ac: async ({ page }, kullan) => {
    await kullan(async (yol) => {
      await page.goto(ADRES + yol, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => { /* uzun yoklama yapan ekran networkidle'a varmaz */ });
      await expect(page.getByRole('navigation', { name: 'Ana menü' }).or(page.getByRole('button', { name: 'Tümü' })).first()).toBeAttached();
    });
  },
});

// Prototip ekranları (Reçete ve Rota, Üretim Terminali) kabuğun içindeki tek çerçevede çizilir.
export async function cerceve(page: Page): Promise<Frame> {
  const cerceveOgesi = page.locator('main iframe, iframe').first();
  await expect(cerceveOgesi).toBeAttached({ timeout: 15_000 });
  const f = await (await cerceveOgesi.elementHandle())?.contentFrame();
  if (!f) throw new Error('Prototip çerçevesi yüklenmedi');
  await f.waitForLoadState('domcontentloaded');
  await expect(f.locator('body')).not.toBeEmpty({ timeout: 15_000 });
  return f;
}

export interface Tasma { belge: number; cerceve: number | null }

// Yatay taşma piksel olarak: sayfa ve (varsa) prototip çerçevesinin belgesi görünür genişlikten ne kadar geniş.
export async function tasmaOlc(page: Page): Promise<Tasma> {
  const olc = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const belge = await page.evaluate(olc);
  const f = page.frames().find((x) => x !== page.mainFrame() && x.url() !== 'about:blank') ?? page.frames().find((x) => x !== page.mainFrame());
  const cerceveTasma = f === undefined ? null : await f.evaluate(olc).catch(() => null);
  return { belge, cerceve: cerceveTasma };
}

// Görünür başlıkların metni kesiliyor mu (üç nokta ya da gizlenen taşma): kesilenlerin metni döner.
export async function kesilenBasliklar(page: Page | Frame): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('h1, h2')]
    .filter((e) => e instanceof HTMLElement && e.offsetParent !== null && e.scrollWidth > e.clientWidth)
    .map((e) => (e.textContent ?? '').trim()));
}

// Kabuğun üst çubuğunda üst üste binen düğme çiftleri (görünür, boyutlu doğrudan çocuklar ve içlerindeki kısayol ipucu).
export async function ustCubukCakisanlar(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ust = document.querySelector('.tc-kabuk-ust');
    if (ust === null) return ['üst çubuk yok'];
    const ogeler = [...ust.querySelectorAll(':scope > *, :scope > * > *, :scope .tc-arama-tus')]
      .filter((e) => e instanceof HTMLElement && e.offsetParent !== null && getComputedStyle(e).display !== 'contents')
      .map((e) => ({ ad: (e.getAttribute('aria-label') ?? e.className.toString()).slice(0, 40), k: e.getBoundingClientRect(), e }))
      .filter((o) => o.k.width > 0 && o.k.height > 0);
    const cakisan: string[] = [];
    for (const [i, a] of ogeler.entries()) {
      for (const b of ogeler.slice(i + 1)) {
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const yatay = Math.min(a.k.right, b.k.right) - Math.max(a.k.left, b.k.left);
        const dikey = Math.min(a.k.bottom, b.k.bottom) - Math.max(a.k.top, b.k.top);
        if (yatay > 1 && dikey > 1) cakisan.push(`${a.ad} / ${b.ad}`);
      }
    }
    return cakisan;
  });
}
