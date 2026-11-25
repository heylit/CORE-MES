import { expect, tasmaOlc, test } from './ortak.ts';

// Tezgâh geçmişi doluluk göstergesi (kart 3680, Karma): her genişlikte taşmaz; normalde tek satır, uyarı ve kritikte cümle ve dört karo.
// Durum ucu sahte cevapla (ORN- uydurma değerler); tezgâh okuması kapalıyken de gösterge görünür.
test.use({ hesap: 'ornek.yonetici' });

const once = (sn: number): string => new Date(Date.now() - sn * 1000).toISOString();
const doluluk = {
  normal: { satirSayisi: 412_300, yuzde: 20.6, seviye: 'normal', diskBayt: 118_000_000, enEskiKayit: once(86_040), yazilan: 520, atlanan: 2800 },
  uyari: { satirSayisi: 1_680_000, yuzde: 84, seviye: 'uyari', diskBayt: 485_000_000, enEskiKayit: once(22_320), yazilan: 1840, atlanan: 9200 },
  kritik: { satirSayisi: 1_944_000, yuzde: 97.2, seviye: 'kritik', diskBayt: 561_800_000, enEskiKayit: once(9_090), yazilan: 2600, atlanan: 13_100 },
} as const;

for (const seviye of ['normal', 'uyari', 'kritik'] as const) {
  test(`doluluk göstergesi (${seviye}): taşmaz, yazılar görünür`, async ({ page, ag, ac }) => {
    const d = doluluk[seviye];
    await page.route('**/api/tezgah-baglantisi/durum', (r) => r.fulfill({ json: {
      baglanti: 'acik', aralikSaniye: 5, varlikDurumu: 'okundu', sonDeneme: once(3), sonOkuma: once(3), sonHata: null, tezgahlar: [],
      doluluk: {
        satirSayisi: d.satirSayisi, satirSiniri: 2_000_000, yuzde: d.yuzde, seviye: d.seviye, diskBayt: d.diskBayt, enEskiKayit: d.enEskiKayit,
        olcum: { pencereDakika: 60, yazilan: d.yazilan * 60, atlanan: d.atlanan * 60, yazilanDakikada: d.yazilan, atlananDakikada: d.atlanan },
      },
    } }));
    await ac('/tezgah-baglantisi');
    const kutu = page.getByRole('region', { name: 'Geçmiş doluluğu' });
    await expect(kutu).toBeVisible();
    await expect(kutu.getByRole('progressbar')).toBeVisible();
    if (seviye === 'normal') {
      await expect(kutu.getByText('412.300 / 2.000.000 satır · 520 satır/dk yazılıyor')).toBeVisible();
      await expect(kutu.getByText('Tablo boyutu')).toHaveCount(0);
    } else {
      await expect(kutu.getByText(/Dolunca en eski kayıtlar silinir/)).toBeVisible();
      await expect(kutu.getByRole('link', { name: 'Sistem Ayarları' })).toBeVisible();
      for (const ad of ['Yazılan (son 60 dk)', 'Atlanan (eşik altı değişim)', 'Tablo boyutu', 'En eski kayıt (yaşı)']) await expect(kutu.getByText(ad)).toBeVisible();
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    const kutuTasma = await kutu.evaluate((e) => e.scrollWidth - e.clientWidth);
    expect(kutuTasma, 'gösterge kutusu taşmaz').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`doluluk-${seviye}.png`), fullPage: true });
    expect(ag.hatalar).toEqual([]);
  });
}
