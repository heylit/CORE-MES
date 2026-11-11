import type { Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3030 a: "Yeniden hesapla" CAM ve Kalite'de, boya ve maske kaydı yalnız CAM'da, Müdür yalnız okur. Örnek veride CAM hesabı yoktur;
// yönetici düğmelerin bu sabit cevaplarla göründüğünü gösterir, Müdür ve Kalite gerçek rolle girer. Sunucu tarafı yuzey.test.ts GEO-YZ-A5.
const LISTE = {
  satirlar: [{
    malzemeNo: 1, malzemeKodu: 'MM-ORN-00001', malzemeAdi: 'Örnek mil', belgeId: 1, belgeAdi: 'Model kutu', revizyonId: 8, harf: 'A', revKodu: '00',
    dosyaTuru: 'step', durum: 'bitti', hataMetni: null,
  }],
  toplam: 1, sayfa: 1, sayfaBoyu: 50,
};
const ANALIZ = {
  revizyonId: 8, belgeId: 1, dosyaTuru: 'step', durum: 'bitti',
  is: { durum: 'bitti', denemeSayisi: 1, hataMetni: null, olusturma: '2026-11-01T20:00:00+03:00', baslama: '2026-11-01T20:00:01+03:00', bitis: '2026-11-01T20:00:02+03:00', surum: 3 },
  analiz: {
    motor: 'occt-import-js@0.0.23', kutu: { x: 45, y: 20, z: 10 }, obb: { a: 45, b: 20, c: 10, cap: 22.3607, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    hacimMm3: 9000, alanMm2: 3100, govdeSayisi: 1, kapali: true, ucgenSayisi: 12, hesapSuresiMs: 20, hesapZamani: '2026-11-01T20:00:02+03:00',
  },
};
const HAM = { revizyonId: 8, payMm: 0, payKaynagi: 'yok', enAz: { a: 45, b: 20, c: 10 }, oneriler: [], kaliteler: [], neden: 'stok-listesi-yok' };
const YUZEY = {
  revizyonId: 8, oneri: true, neden: null,
  yuzler: [{ sira: 1, tur: 'duzlem', ters: false, alanMm2: 450 }, { sira: 2, tur: 'duzlem', ters: false, alanMm2: 450 }],
  rota: { durum: 'bagli', adimlar: [] }, isaretler: [], alanlar: [], isaretsizMm2: 900, toplamMm2: 900, surum: null, guncelleyen: null, guncelleme: null, tasima: null,
};

async function sunucu(page: Page): Promise<void> {
  await page.route('**/api/geometri/**', async (r: Route) => {
    const yol = new URL(r.request().url()).pathname.replace('/api', '');
    const json = (status: number, govde: unknown) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(govde) });
    if (yol === '/geometri/modeller') return json(200, LISTE);
    if (yol === '/geometri/analizler/8') return json(200, ANALIZ);
    if (yol.startsWith('/geometri/ham-onerisi/8')) return json(200, HAM);
    if (yol === '/geometri/yuzey/8') return json(200, YUZEY);
    if (yol === '/geometri/modeller/8/dosya') return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.alloc(0) });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Önizlemede yok.' });
  });
}

const beklenmeyen = (hatalar: readonly string[]) => hatalar.filter((h) => !h.includes('404'));

async function bak(page: Page, ac: (yol: string) => Promise<void>): Promise<{ hesapla: number; kaydet: number; salt: number }> {
  await sunucu(page);
  await ac('/geometri?rev=8');
  await expect(page.getByText('9.000 mm³')).toBeVisible();
  const hesapla = await page.getByRole('button', { name: /Yeniden hesapla/ }).count();
  await ac('/geometri/yuzey?rev=8');
  await expect(page.getByText(/Yüz listesi/)).toBeVisible();
  const kaydet = await page.getByRole('button', { name: /^Kaydet/ }).count();
  const salt = await page.getByText('Yalnız okuma: işaretleri değiştirme yetkiniz yok.').count();
  expect((await tasmaOlc(page)).belge).toBe(0);
  return { hesapla, kaydet, salt };
}

test.describe('3D Atölyesi rolleri (3030 a): yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });
  test('yetkili kişi "Yeniden hesapla" ve boya "Kaydet" düğmelerini görür (sabit cevapların düğmeyi gösterdiğinin kanıtı)', async ({ page, ac, ag }) => {
    expect(await bak(page, ac)).toEqual({ hesapla: 1, kaydet: 1, salt: 0 });
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });
});

test.describe('3D Atölyesi rolleri (3030 a): Kalite', () => {
  test.use({ hesap: 'ornek.kalite' });
  test('Kalite "Yeniden hesapla"yı görür; boya kaydı yok, yalnız okuma yazılı', async ({ page, ac, ag }) => {
    expect(await bak(page, ac)).toEqual({ hesapla: 1, kaydet: 0, salt: 1 });
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });
});

test.describe('3D Atölyesi rolleri (3030 a): Müdür', () => {
  test.use({ hesap: 'ornek.mudur' });
  test('Müdür 3D Atölyesi\'ni açar ve ölçüleri görür; "Yeniden hesapla" ve boya kaydı yok', async ({ page, ac, ag }) => {
    expect(await bak(page, ac)).toEqual({ hesapla: 0, kaydet: 0, salt: 1 });
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });
});
