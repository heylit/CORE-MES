import { expect, tasmaOlc, test } from './ortak.ts';

// Planlama TS ekranı P3: Maliyetler, Genel gider, Ek mesai planı, Fason planı (kart #538). Düzen bugünkü ısı haritasıdır (zz30-isi):
// başlık, durum satırı, ızgara ya da boş durum, "Tüm satırlar". Örnek veride çözülmüş plan olmayabilir; test ikisini de kabul eder,
// ızgara varsa ilk hücrenin açılımını dener. Hiçbir adım yazma göndermez; sayfa 360, 768 ve 1280'de yatay taşmaz.
test.use({ hesap: 'ornek.yonetici' });

const GORUNUMLER = [
  { yol: 'maliyet', baslik: 'Maliyetler' },
  { yol: 'giderler', baslik: 'Genel gider' },
  { yol: 'mesaiplan', baslik: 'Ek mesai planı' },
  { yol: 'fasonplan', baslik: 'Fason planı' },
] as const;

// Uydurma çalışma: bir torna, bir freze, bir sipariş (tornalama ve fason kaplama); maliyet kalemi ve amortisman girili. Veri uydurmadır.
const UYDURMA = {
  surum: 2, dataVer: 1, ekMesai: [{ m: 'T1', gun: 5, vardiya: 'V1' }],
  D: {
    meta: { baslangic: '2026-01-05' },
    vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00', molalar: [] }],
    calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'], cmt: [], paz: [] },
    tezgahlar: [{ id: 'T1', ad: 'Deneme torna', grup: 'TORNA', ucret: 100, verim: 1 }, { id: 'T2', ad: 'Deneme freze', grup: 'FREZE', ucret: null, verim: 1 }],
    urunler: [{ id: 'U1', ad: 'Deneme mil', netKg: 1, rota: [{ k: '10', ad: 'Tornalama', tezgahlar: [{ id: 'T1', cevrim: 60 }] }, { k: '20', ad: 'Kaplama', fason: 'F1', bag: [['10']] }] }],
    siparisler: [{ id: 'S1', urun: 'U1', adet: 2, termin: '2026-01-09 16:00', gelir: 1000, malzeme: [{ kod: 'M1', miktar: 1.5 }] }],
    malzemeler: [{ kod: 'M1', ad: 'Deneme çubuk', birim: 'kg', birimFiyat: 10, kalite: 'K1', form: 'Çubuk', stok: 100 }],
    fasoncular: [{ id: 'F1', ad: 'Deneme kaplama', fiyat: 5, sureGun: 2, kapasite: 1 }],
    personel: [{ id: 'P1', ad: 'Deneme Kisi', vardiya: 'V1', gruplar: ['TORNA'] }],
    maliyetSis: { kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 3000, anahtar: 'esit', kapsam: '' }], tez: { T1: { bedel: 120000, omur: 10, hurda: 0 } } },
  },
  plan: {
    dataVer: 1,
    ops: { 'S1.10': { id: 'S1.10', job: 'S1', m: 'T1', S: 8, C: 10, su: 0, run: 2 }, 'S1.20': { id: 'S1.20', job: 'S1', m: '@F1', S: 10, C: 58, su: 0, run: 0, fas: true } },
    J: { S1: { C: 58, T: 0 } },
  },
};

test.describe('P3 maliyet, genel gider, ek mesai ve fason', () => {
  for (const g of GORUNUMLER) {
    test(`${g.baslik}: başlık, ızgara ya da boş durum; hücre açılımı; yatay taşma yok, yazma gitmez`, async ({ page, ag, ac }) => {
      await ac(`/plan/${g.yol}`);
      const kap = page.locator(`[data-gorunum="${g.yol}"]`);
      await expect(kap.getByRole('heading', { name: g.baslik, level: 2 })).toBeVisible({ timeout: 20_000 });
      const izgara = kap.locator('.tc-pyk-tablo');
      const bos = kap.locator('.tc-pyk-bos');
      await expect(izgara.or(bos).first()).toBeVisible();
      if (await izgara.count()) {
        const hucre = izgara.locator('button[data-hucre]').first();
        if (await hucre.count()) {
          await hucre.click();
          await expect(kap.locator('.tc-pyk-ac').first()).toBeVisible();
          expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
          await kap.locator('.tc-pyk-ac').first().getByRole('button', { name: 'Kapat' }).first().click();
        }
      }
      const tum = kap.getByText('Tüm satırlar');
      if (await tum.count()) await tum.click();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
      expect(ag.yazmalar.filter((y) => y !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
      expect(ag.hatalar).toEqual([]);
    });
  }

  // Örnek veride çözülmüş plan yoksa ızgara çizilmez; çalışma okuması uydurma bir çalışmayla cevaplanır (yalnız bu sayfada, veritabanına
  // yazılmaz) ve ızgara, açılım ve form dar ekranda sınanır.
  for (const g of GORUNUMLER) {
    test(`${g.baslik}: uydurma planla ızgara ve açılım taşmadan çizilir`, async ({ page, ag, ac }) => {
      await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({ json: { calisma: UYDURMA, surum: null } }));
      await ac(`/plan/${g.yol}`);
      const kap = page.locator(`[data-gorunum="${g.yol}"]`);
      const izgara = kap.locator('.tc-pyk-tablo');
      await expect(izgara).toBeVisible({ timeout: 20_000 });
      const gizli = kap.getByRole('button', { name: /satır daha göster/ });
      if (await gizli.count()) await gizli.click();
      await izgara.locator('button[data-hucre]').first().click();
      await expect(kap.locator('.tc-pyk-ac').first()).toBeVisible();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
      await kap.getByText('Tüm satırlar').click();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
      expect(ag.yazmalar.filter((y) => y !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
      expect(ag.hatalar).toEqual([]);
    });
  }

  test('Ek mesai planı: plan motoru gerektiren öneri durum satırında kapalı gelir; başlıkta işlem menüsü yok', async ({ page, ag, ac }) => {
    await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({ json: { calisma: UYDURMA, surum: null } }));
    await ac('/plan/mesaiplan');
    const kap = page.locator('[data-gorunum="mesaiplan"]');
    await expect(kap.getByRole('heading', { name: 'Ek mesai planı', level: 2 })).toBeVisible({ timeout: 20_000 });
    await expect(kap.locator('.tc-pyk-durum').getByRole('button', { name: 'Önerileri hesapla' })).toBeDisabled();
    await expect(kap.getByRole('button', { name: /diğer işlemler/ })).toHaveCount(0);
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
  });
});
