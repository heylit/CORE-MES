import { ADRES, cerceve, expect, kesilenBasliklar, tasmaOlc, test, ustCubukCakisanlar } from './ortak.ts';
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
  cerceve?: boolean;
  tasma?: Partial<Record<'g360' | 'g768' | 'g1280', number>>;
}

const RECETE_ROTA = /^\/recete-rota(\/[a-z]+)?$/;
const RECETE_ROTA_BOLUMLERI = ['schema', 'plan', 'kanban', 'items', 'ops', 'res', 'stock', 'studio', 'sureler'] as const;
// Bu bölümler planlama çerçevesinde açılır ve planlama işlemini ister; Aşama 1'de yalnız yöneticide (353 a). Planlamacının
// reddi recete-rota.spec.ts'te sınanır.
const PLANLAMA_BOLUMLERI: readonly string[] = ['plan', 'kanban', 'studio'];

// İstasyonlar ve Vardiya bölümleri (UYUM-BORCU istasyonlar 1, vardiya V-B9, V-B10, V-B14). İstasyonlar bölüm adını kartta yinelemez:
// başlık sayfanın adıdır; Vardiya'da bölümün ilk panel başlığıdır.
const ISTASYONLAR_BOLUMLERI = [
  '/istasyonlar', '/istasyonlar/is-merkezleri', '/istasyonlar/makineler', '/istasyonlar/personel', '/istasyonlar/vardiyalar', '/istasyonlar/operasyon-tipleri',
] as const;
const VARDIYA_BOLUMLERI = [
  ['/vardiya', 'Haftalık vardiya matrisi'], ['/vardiya/personel', 'Vardiya başına personel'], ['/vardiya/takvim', 'Çalışma takvimi'],
  ['/vardiya/fazla-mesai', 'Fazla mesai'], ['/vardiya/planli-duruslar', 'Planlı duruşlar'], ['/vardiya/mesai', /^Günlük mesai · /],
] as const;

const SAYFALAR: Sayfa[] = [
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri', hesap: 'ornek.planlama', baslik: 'Üretim Emirleri' },
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri?gorunum=bitenler', hesap: 'ornek.planlama', baslik: 'Üretim Emirleri' },
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri/2', hesap: 'ornek.planlama', baslik: 'Üretim emri' },
  { modul: 'uretim-emirleri', yol: '/uretim-emirleri', hesap: 'ornek.mudur', baslik: 'Üretim Emirleri' },
  { modul: 'plan', yol: '/cizelge', hesap: 'ornek.planlama', baslik: 'Plan Çizelgesi' },
  { modul: 'plan', yol: '/matris', hesap: 'ornek.planlama', baslik: 'Plan Matrisi' },
  { modul: 'recete-rota', yol: '/recete-rota', varis: RECETE_ROTA, hesap: 'ornek.yonetici', baslik: 'Reçete ve Rota', cerceve: true },
  ...RECETE_ROTA_BOLUMLERI.map((b): Sayfa => ({
    modul: 'recete-rota', yol: `/recete-rota/${b}`, varis: RECETE_ROTA, hesap: PLANLAMA_BOLUMLERI.includes(b) ? 'ornek.yonetici' : 'ornek.planlama', baslik: 'Reçete ve Rota',
    cerceve: true,
  })),
  { modul: 'uretim-terminali', yol: '/uretim-terminali', hesap: 'ornek.operator1', baslik: 'Üretim Terminali', cerceve: true },
  { modul: 'uretim-terminali', yol: '/uretim-terminali', hesap: 'ornek.yonetici', baslik: 'Üretim Terminali', cerceve: true },
  { modul: 'stok', yol: '/stok', hesap: 'ornek.depo', baslik: 'Stok Merkezi' },
  { modul: 'stok', yol: '/stok/malzemeler', hesap: 'ornek.depo', baslik: 'Malzemeler' },
  ...ISTASYONLAR_BOLUMLERI.map((yol): Sayfa => ({ modul: 'istasyonlar', yol, hesap: 'ornek.planlama', baslik: 'İstasyonlar' })),
  ...VARDIYA_BOLUMLERI.map(([yol, baslik]): Sayfa => ({ modul: 'vardiya', yol, hesap: 'ornek.planlama', baslik })),
];

for (const s of SAYFALAR) {
  test.describe(`${s.modul} ${s.yol} (${s.hesap})`, () => {
    test.use({ hesap: s.hesap });

    test('açılır, başlığı görünür, hata vermez, taşmaz', async ({ page, ag, ac }, bilgi) => {
      await ac(s.yol);
      const hedef = new URL(ADRES + s.yol).pathname;
      await expect(page).toHaveURL((u) => (s.varis === undefined ? u.pathname === hedef : s.varis.test(u.pathname)));
      if (s.cerceve === true) {
        // Çerçeveli sayfanın başlığı kabuğun üst çubuğundadır; dar ekranda üst çubuk başlığı göstermez.
        if (bilgi.project.name === 'g1280') await expect(page.getByRole('heading', { name: s.baslik, exact: true })).toBeVisible();
        const f = await cerceve(page);
        await expect(f.locator('main, header, [role=banner]').filter({ visible: true }).first()).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: s.baslik, exact: true }).filter({ visible: true }).first()).toBeVisible();
      }
      expect(ag.hatalar, 'konsol ve API hataları').toEqual([]);
      const tasma = await tasmaOlc(page);
      const sinir = s.tasma?.[bilgi.project.name as 'g360'] ?? 0;
      expect(tasma.belge, `sayfa yatay taşması (en çok ${String(sinir)} px)`).toBeLessThanOrEqual(sinir);
      if (tasma.cerceve !== null) expect(tasma.cerceve, 'çerçeve yatay taşması').toBe(0);
      expect(await ustCubukCakisanlar(page), 'üst çubukta üst üste binen düğmeler').toEqual([]);
      if (bilgi.project.name === 'g1280') expect(await kesilenBasliklar(page), 'kesilen başlıklar').toEqual([]);
    });
  });
}
