import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla } from './test-ekrani.ts';
import { setBasamakYazar } from './memory.ts';

const acilis = (): AcilisCevabi => ({
  kullanici: { id: 7, ad: 'Deneme Yönetici', islemler: ['satin-alma.ayar', 'ayarlar.yaz', 'satin-alma.fiyat-oku'] }, talepler: [] as Talep[], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [],
    onayLimitleri: [{ azamiTutar: '1000', seviye: 'Uzman', rolId: null, rolAdi: null, kisiler: [] }], dortGoz: true, onayKademesi: true, surum: 1,
  },
} as unknown as AcilisCevabi);

function sunucu(): { yol: string; govde: unknown }[] {
  const istekler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (yol: string, init?: RequestInit) => {
    const govde = init?.body ? JSON.parse(String(init.body)) : null;
    istekler.push({ yol: String(yol), govde });
    const y = String(yol);
    const cevap = y.includes('/satin-alma-onay-kisileri') ? { kisiler: [{ id: 21, ad: 'Deneme Onaylayan' }] }
      : y.includes('/roller') ? { roller: [{ id: 3, ad: 'Deneme uzman rolü' }] }
      : y.includes('/satin-alma-ayarlari/kaydet') ? { ...acilis().ayarlar, surum: 2 } : acilis();
    return new Response(JSON.stringify(cevap), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return istekler;
}
afterEach(() => { vi.unstubAllGlobals(); setBasamakYazar(false); document.body.innerHTML = ''; });

async function ac() {
  const istekler = sunucu();
  const bildirimler: string[] = [];
  const kok = document.createElement('div');
  document.body.append(kok);
  const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'settings', yol: '/ayarlar', git: () => {}, basamakYazar: true,
    bildirim: { bildir: (ton: string, m: string) => bildirimler.push(`${ton}: ${m}`), kaldir: () => {} } });
  // Roller ve kişiler ayrı yüklenir, gelince ekran yeniden çizilir; işaretler o çizimden sonra bakılsın.
  // Açılış yüklenene kadar ekran önceki testin ayarlarını çizer; yükleme bitip yeniden çizilince satırlar bu testindir.
  await vi.waitFor(() => expect(istekler.some((i) => i.yol.includes('/satin-alma-onayli-liste'))).toBe(true));
  await new Promise((r) => setTimeout(r, 20));
  await vi.waitFor(() => expect([kok.querySelectorAll('[data-apk="kisiSec"]').length, kok.querySelectorAll('[data-apk="rolId"] option').length]).toEqual([1, 2]));
  kok.querySelector<HTMLElement>('[data-act="add-ap"]')!.click();
  await vi.waitFor(() => expect(kok.querySelectorAll('#ap-rows tr')).toHaveLength(2));
  const satir = kok.querySelector<HTMLElement>('#ap-rows tr[data-ap="1"]')!;
  const kaydet = () => kok.querySelector<HTMLElement>('[data-act="save-settings"]')!.click();
  const kayitVar = () => istekler.some((i) => i.yol.includes('/satin-alma-ayarlari/kaydet'));
  return { kok, satir, kaydet, kayitVar, istekler, bildirimler, kapat };
}

describe('3492 onay limiti kaydı sessizce düşmez', () => {
  it('limiti ve rolü girilmiş ama adı boş basamak kaydı durdurur, ada odaklanır ve "kaydedildi" demez', async () => {
    const e = await ac();
    e.satir.querySelector<HTMLInputElement>('[data-apk="max"]')!.value = '250.000';
    e.satir.querySelector<HTMLSelectElement>('[data-apk="rolId"]')!.value = '3';
    e.kaydet();
    await new Promise((r) => setTimeout(r, 50));
    expect(e.kayitVar()).toBe(false);
    expect(e.bildirimler).toEqual(['hata: 2. basamağın adı boş. Basamak sütununa bir ad yazıp yeniden kaydedin.']);
    const ad = e.satir.querySelector('[data-apk="role"]')!;
    expect(document.activeElement).toBe(ad);
    // Bildirim kapansa da eksik alan satırda işaretli kalır.
    expect([ad.getAttribute('aria-invalid'), document.getElementById(ad.getAttribute('aria-describedby')!)?.textContent]).toEqual(['true', 'Basamak adı gerekli.']);
    // Ad yazılınca basamak kaydedilir.
    e.satir.querySelector<HTMLInputElement>('[data-apk="role"]')!.value = 'Müdür';
    e.kaydet();
    await vi.waitFor(() => expect(e.kayitVar()).toBe(true));
    const g = e.istekler.find((i) => i.yol.includes('/satin-alma-ayarlari/kaydet'))!.govde as { onayLimitleri: { azamiTutar: string | null; seviye: string; rolId: number | null }[] };
    expect(g.onayLimitleri.map((l) => [l.azamiTutar, l.seviye, l.rolId])).toEqual([['1000', 'Uzman', null], ['250000', 'Müdür', 3]]);
    // Kaydın cevabı ekranı yeniden çizer; sonraki teste taşmasın diye beklenir.
    await vi.waitFor(() => expect(e.kok.querySelectorAll('#ap-rows tr')).toHaveLength(1));
    e.kapat();
  });

  it('"Ekle"ye basılmadan seçili bırakılan kişi kaydı durdurur', async () => {
    const e = await ac();
    e.satir.querySelector<HTMLInputElement>('[data-apk="role"]')!.value = 'Müdür';
    const sec = e.kok.querySelector<HTMLSelectElement>('#ap-rows tr[data-ap="0"] [data-apk="kisiSec"]')!;
    sec.value = '21';
    e.kaydet();
    expect([sec.getAttribute('aria-invalid'), sec.parentElement?.querySelector('[data-ap-eksik]')?.textContent]).toEqual(['true', 'Seçilen kişi eklenmedi.']);
    await new Promise((r) => setTimeout(r, 50));
    expect(e.kayitVar()).toBe(false);
    expect(e.bildirimler).toEqual(['hata: 1. basamakta seçilen kişi eklenmedi. Önce "Ekle"ye basın ya da seçimi kaldırın.']);
    e.kapat();
  });

  // Test bakışı T1: "dolu" koşulunun her parçası tek başına kaydı durdurur; boşluktan oluşan ad boş sayılır.
  it('yalnız limiti, yalnız rolü ya da yalnız kişisi girili ya da adı boşluktan oluşan basamak da kaydı durdurur', async () => {
    const durur = async (doldur: (e: Awaited<ReturnType<typeof ac>>) => Promise<void>) => {
      const e = await ac();
      await doldur(e);
      e.kaydet();
      await new Promise((r) => setTimeout(r, 50));
      expect(e.kayitVar()).toBe(false);
      expect(e.bildirimler).toEqual(['hata: 2. basamağın adı boş. Basamak sütununa bir ad yazıp yeniden kaydedin.']);
      e.kapat();
      document.body.innerHTML = '';
    };
    await durur(async (e) => { e.satir.querySelector<HTMLInputElement>('[data-apk="max"]')!.value = '5000'; });
    await durur(async (e) => { e.satir.querySelector<HTMLSelectElement>('[data-apk="rolId"]')!.value = '3'; });
    await durur(async (e) => {
      const satir = () => e.kok.querySelector<HTMLElement>('#ap-rows tr[data-ap="1"]')!;
      satir().querySelector<HTMLSelectElement>('[data-apk="kisiSec"]')!.value = '21';
      satir().querySelector<HTMLElement>('[data-act="ap-kisi-ekle"]')!.click();
      await vi.waitFor(() => expect(satir().querySelectorAll('[data-apk-kisi]')).toHaveLength(1));
    });
    await durur(async (e) => {
      e.satir.querySelector<HTMLInputElement>('[data-apk="max"]')!.value = '5000';
      e.satir.querySelector<HTMLInputElement>('[data-apk="role"]')!.value = '   ';
    });
  });

  it('tamamen boş eklenen satır kaydı durdurmaz, düşer', async () => {
    const e = await ac();
    e.kaydet();
    await vi.waitFor(() => expect(e.kayitVar()).toBe(true));
    const g = e.istekler.find((i) => i.yol.includes('/satin-alma-ayarlari/kaydet'))!.govde as { onayLimitleri: unknown[] };
    expect(g.onayLimitleri).toHaveLength(1);
    e.kapat();
  });
});
