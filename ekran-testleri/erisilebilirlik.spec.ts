import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from './ortak.ts';

// Erişilebilirlik denetimi (karar 2197-8 a): ana menüdeki her sayfa her genişlikte axe ile taranır; kritik ihlal kalmaz.
// Ciddi ve daha hafif ihlaller testi düşürmez, sayısı test notuna yazılır: önce kritikler sıfırlanır, eşik sonra daraltılır.
// Liste yöneticinin ana menüsüdür (her modülün ana sayfası); kapalı modülün sayfası menüde yoktur.
const SAYFALAR = [
  '/', '/uretim-emirleri', '/uretim-terminali', '/arkon', '/kuyruk', '/cnc-kurulum', '/geometri', '/markalama', '/atolye', '/akis',
  '/oee', '/kaynak-izi', '/projeler', '/takvim', '/plan', '/vardiya', '/siparisler', '/sevkiyat', '/taleplerim', '/stok',
  '/malzemeler', '/malzeme-izi', '/etiket-merkezi', '/satin-alma', '/kalite-merkezi', '/kalibrasyon', '/denetim-hazirlik',
  '/degisiklik-yonetimi', '/recete-rota', '/istasyonlar', '/durus-nedenleri', '/personel', '/musteri-tedarikci', '/cizimler',
  '/profil', '/ik-islemlerim', '/denetim', '/finans', '/ik', '/guvenlik', '/idari-isler', '/nizamiye', '/ortak-dosyalar',
  '/geri-bildirim', '/smartes', '/ayarlar',
] as const;

// WCAG 2.1 A ve AA kuralları; deneysel ve en iyi uygulama kuralları sayılmaz.
const ETIKETLER = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.use({ hesap: 'ornek.yonetici' });

for (const yol of SAYFALAR) {
  test(`${yol} kritik erişilebilirlik ihlali yok`, async ({ page, ac }) => {
    await ac(yol);
    const sonuc = await new AxeBuilder({ page }).withTags(ETIKETLER).analyze();
    const kritik = sonuc.violations
      .filter((v) => v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    const diger = sonuc.violations.filter((v) => v.impact !== 'critical').map((v) => `${v.impact ?? '-'} ${v.id} (${String(v.nodes.length)})`);
    if (diger.length > 0) test.info().annotations.push({ type: 'erisilebilirlik', description: diger.join('; ') });
    expect(kritik).toEqual([]);
  });
}
