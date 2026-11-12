import { ADRES, expect, kesilenBasliklar, tasmaOlc, test, ustCubukCakisanlar } from './ortak.ts';
import type { Hesap } from './ortak.ts';

// Öncelikli modüllerin sayfaları her genişlikte açılır: doğru adrese varır, başlığı görünür, konsol ve API hatası vermez,
// yatay taşmaz, üst çubukta düğmeler üst üste binmez, 1280'de başlık kesilmez.
// Kaynak: /mnt/project-files/kayit/<modul>/akislar.md ve kayit/_tarama.
// tasma: kabul edilen en çok taşma (piksel); verilmezse 0. Kayıtta DEĞİŞECEK işaretli bir taşma ancak geçici olarak yazılır.
interface Sayfa {
  modul: string;
  yol: string;
  // Varılacak yol; verilmezse açılan yol. Reçete ve Rota çerçevesi kayıttaki son bölüme kendisi geçebiliyor (tarama: cam
  // /recete-rota/kanban -> /recete-rota/schema); bölüm adresinin tutması akış testinde (ikinci menü) sınanır.
  varis?: RegExp;
  hesap: Hesap;
  baslik: string | RegExp;
  // Kendi başlığı olmayan yeni ekran (Üretim Terminali): başlık kabuktadır, dar ekranda bölüm adıyla bulunur.
  bolum?: string;
  // Kabuk başlığı 1440 altında yalnız ekran okuyucudadır (2137-2 c): şerit üst çubuktayken istasyon adına yer kalır.
  // 1280'de görünürlük ve kesilme denetimi bu başlığı saymaz; başlık 1440'ta görünür ve kesilmez diye ayrıca sınanır (2137-3 a).
  kabukBasligiGizli?: true;
  tasma?: Partial<Record<'g360' | 'g768' | 'g1280', number>>;
}

const RECETE_ROTA = /^\/recete-rota(\/[a-z]+)?$/;
const RECETE_ROTA_BOLUMLERI = ['schema', 'plan', 'kanban', 'items', 'ops', 'res', 'stock', 'studio', 'sureler'] as const;
// Planlama plan modülünün sayfasıdır (658 b): bu eski adresler Planlama'ya yönlenir. Planlamacının reddi recete-rota.spec.ts'te sınanır.
const PLANLAMA_BOLUMLERI: readonly string[] = ['plan', 'kanban', 'studio'];
const PLANLAMA = /^\/plan(\/[a-z]+)?$/;
// Yeni ekranın başlığı bölümün adıdır (kabuğun başlığı dar ekranda görünmez). Ürün ve rotalar eski ekrandaki gibi başlıksızdır (805):
// bölümü bölgesinin adıyla bulunur, sayfa başlığı kabukta.
const YENI_BOLUM_BASLIGI: Readonly<Record<string, string>> = {
  items: 'Malzemeler', ops: 'Operasyonlar', res: 'Kaynaklar', stock: 'Stok', sureler: 'Süreler',
};
const yeniBolum = (b: string): Pick<Sayfa, 'baslik' | 'bolum'> =>
  (b === 'schema' ? { baslik: 'Reçete ve Rota', bolum: 'Ürün ve rotalar' } : { baslik: YENI_BOLUM_BASLIGI[b] ?? b });

// İstasyonlar ve Vardiya bölümleri (UYUM-BORCU istasyonlar 1, vardiya V-B9, V-B10, V-B14). İstasyonlar bölüm adını kartta yinelemez:
// başlık sayfanın adıdır; Vardiya'da bölümün ilk panel başlığıdır.
const ISTASYONLAR_BOLUMLERI = [
  '/istasyonlar', '/istasyonlar/is-merkezleri', '/istasyonlar/makineler', '/istasyonlar/personel', '/istasyonlar/yetkinlik', '/istasyonlar/vardiyalar', '/istasyonlar/operasyon-tipleri',
] as const;
const VARDIYA_BOLUMLERI = [
  ['/vardiya', 'Haftalık vardiya matrisi'], ['/vardiya/personel', 'Vardiya başına personel'], ['/vardiya/takvim', 'Çalışma takvimi'],
  ['/vardiya/fazla-mesai', 'Fazla mesai'], ['/vardiya/planli-duruslar', 'Planlı duruşlar'], ['/vardiya/mesai', /^Günlük mesai · /],
] as const;

// Planlama'nın Veri grubu (B-2495-4): motor ayarları yalnız yöneticide, öteki dört sayfa planlama rolünde de (maliyetsiz) sınanır.
const PLAN_VERI_SAYFALARI = [
  ['/plan/veri-sagligi', 'Veri sağlığı'], ['/plan/plan-sagligi', 'Plan sağlığı'], ['/plan/analiz', 'Planlama analizi'], ['/plan/mrp', 'Malzeme ihtiyacı'],
] as const;

const SAYFALAR: Sayfa[] = [
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri', hesap: 'ornek.planlama', baslik: 'Üretim Emirleri' },
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri?gorunum=bitenler', hesap: 'ornek.planlama', baslik: 'Üretim Emirleri' },
  // 3039: emir sayfasının başlığı emir numarasıdır.
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri/2', hesap: 'ornek.planlama', baslik: /^MM-ORN-00002-/ },
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri', hesap: 'ornek.mudur', baslik: 'Üretim Emirleri' },
  // Reçete ve Rota bölümleri yeni ekrandadır (541; eski çerçeve 805 ile kalktı); planlama bölümleri Planlama'ya yönlenir.
  { modul: 'recete-rota', yol: '/recete-rota', varis: RECETE_ROTA, hesap: 'ornek.yonetici', baslik: 'Üretim emirleri' },
  ...RECETE_ROTA_BOLUMLERI.map((b): Sayfa => ({
    modul: 'recete-rota', yol: `/recete-rota/${b}`, ...(PLANLAMA_BOLUMLERI.includes(b)
      ? { varis: PLANLAMA, hesap: 'ornek.yonetici', baslik: 'Planlama' }
      : { varis: RECETE_ROTA, hesap: 'ornek.planlama', ...yeniBolum(b) }),
  })),
  // Üretim Terminali yeni ekrandadır (541; eski çerçeve 1392 a ile kalktı).
  { modul: 'uretim-terminali', yol: '/uretim-terminali', hesap: 'ornek.operator1', baslik: 'Üretim Terminali', bolum: 'Üretim Terminali', kabukBasligiGizli: true },
  { modul: 'uretim-terminali', yol: '/uretim-terminali', hesap: 'ornek.yonetici', baslik: 'Üretim Terminali', bolum: 'Üretim Terminali', kabukBasligiGizli: true },
  { modul: 'stok', yol: '/stok', hesap: 'ornek.depo', baslik: 'Stok Merkezi' },
  { modul: 'stok', yol: '/stok/malzemeler', hesap: 'ornek.depo', baslik: 'Malzemeler' },
  // 3068 a, 3078 b: Logo geçişi malzeme kartı açabilen rolde de görünür (planlama malzemeler.yaz taşır).
  { modul: 'malzemeler', yol: '/logo-gecisi', hesap: 'ornek.yonetici', baslik: 'Logo geçişi' },
  { modul: 'malzemeler', yol: '/logo-gecisi', hesap: 'ornek.planlama', baslik: 'Logo geçişi' },
  ...ISTASYONLAR_BOLUMLERI.map((yol): Sayfa => ({ modul: 'istasyonlar', yol, hesap: 'ornek.planlama', baslik: 'İstasyonlar' })),
  ...VARDIYA_BOLUMLERI.map(([yol, baslik]): Sayfa => ({ modul: 'vardiya', yol, hesap: 'ornek.planlama', baslik })),
  ...PLAN_VERI_SAYFALARI.flatMap(([yol, baslik]): Sayfa[] => (['ornek.yonetici', 'ornek.planlama'] as const).map((hesap) => ({ modul: 'plan', yol, hesap, baslik }))),
  { modul: 'plan', yol: '/plan/motor-ayarlari', hesap: 'ornek.yonetici', baslik: 'Motor ayarları' },
];

for (const s of SAYFALAR) {
  test.describe(`${s.modul} ${s.yol} (${s.hesap})`, () => {
    test.use({ hesap: s.hesap });

    test('açılır, başlığı görünür, hata vermez, taşmaz', async ({ page, ag, ac }, bilgi) => {
      await ac(s.yol);
      const hedef = new URL(ADRES + s.yol).pathname;
      await expect(page).toHaveURL((u) => (s.varis === undefined ? u.pathname === hedef : s.varis.test(u.pathname)));
      if (s.bolum !== undefined) {
        if (bilgi.project.name === 'g1280') {
          const baslik = page.getByRole('heading', { name: s.baslik, exact: true });
          await (s.kabukBasligiGizli ? expect(baslik).toBeAttached() : expect(baslik).toBeVisible());
        }
        await expect(page.getByRole('region', { name: s.bolum, exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: s.baslik, exact: true }).filter({ visible: true }).first()).toBeVisible();
      }
      expect(ag.hatalar, 'konsol ve API hataları').toEqual([]);
      const tasma = await tasmaOlc(page);
      const sinir = s.tasma?.[bilgi.project.name as 'g360'] ?? 0;
      expect(tasma.belge, `sayfa yatay taşması (en çok ${String(sinir)} px)`).toBeLessThanOrEqual(sinir);
      if (tasma.cerceve !== null) expect(tasma.cerceve, 'çerçeve yatay taşması').toBe(0);
      expect(await ustCubukCakisanlar(page), 'üst çubukta üst üste binen düğmeler').toEqual([]);
      if (bilgi.project.name === 'g1280') {
        const kesilen = await kesilenBasliklar(page);
        expect(s.kabukBasligiGizli ? kesilen.filter((b) => b !== s.baslik) : kesilen, 'kesilen başlıklar').toEqual([]);
      }
    });

    if (s.kabukBasligiGizli) {
      test('1440 genişlikte kabuk başlığı görünür ve kesilmez (2137-3 a)', async ({ page, ac }, bilgi) => {
        test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
        await page.setViewportSize({ width: 1440, height: 800 });
        await ac(s.yol);
        await expect(page.locator('h1.tc-kabuk-baslik')).toHaveText(s.baslik);
        await expect(async () => {
          const olcu = await page.locator('h1.tc-kabuk-baslik').evaluate((e) => ({ en: e.clientWidth, yatay: e.scrollWidth - e.clientWidth }));
          expect(olcu.en, 'başlığın genişliği').toBeGreaterThan(1);
          expect(olcu.yatay, 'başlık kesiliyor').toBeLessThanOrEqual(0);
          expect(await kesilenBasliklar(page), 'kesilen başlıklar').toEqual([]);
          expect(await ustCubukCakisanlar(page), 'üst çubukta üst üste binen düğmeler').toEqual([]);
        }).toPass({ timeout: 10_000 });
      });
    }
  });
}

// Planlama rolü maliyet görmez (200 a; B-2495-4): maliyet görünümleri ikinci menüde yoktur, adresle açılınca yetki iletisi çıkar.
const MALIYET_GORUNUMLERI = ['/plan/maliyet', '/plan/giderler', '/plan/denge'] as const;
test.describe('planlama rolünde maliyet görünümleri (ornek.planlama)', () => {
  test.use({ hesap: 'ornek.planlama' });

  test('menüde yok, adresle açılınca görme yetkisi yok der', async ({ page, ag, ac }) => {
    await ac('/plan');
    await expect(page.locator('.tc-py[data-gorunum]')).toBeVisible();
    for (const yol of MALIYET_GORUNUMLERI) await expect(page.locator(`a[href="${yol}"]`), `${yol} menüde`).toHaveCount(0);
    for (const yol of MALIYET_GORUNUMLERI) {
      await ac(yol);
      await expect(page.getByText(/görme yetkiniz yok\./).first()).toBeVisible();
    }
    expect(ag.hatalar, 'konsol ve API hataları').toEqual([]);
  });
});
