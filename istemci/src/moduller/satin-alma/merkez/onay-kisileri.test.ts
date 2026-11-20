import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla } from './test-ekrani.ts';
import { onayLimitleriEkrana, onayLimitleriGovdesi } from './tasiyici.ts';
import { onaylayabilecekler } from './onaylayan.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { S, bump } from './store.ts';
import { setBasamakYazar, viewSettings } from './memory.ts';

const LIMITLER = [
  { azamiTutar: '1000', seviye: 'Uzman', rolId: 3, rolAdi: 'Deneme uzman rolü', kisiler: [] },
  { azamiTutar: null, seviye: 'Müdür', rolId: null, rolAdi: null, kisiler: [{ id: 21, ad: 'Deneme Onaylayan' }] },
];
const acilis = (): AcilisCevabi => ({
  kullanici: { id: 7, ad: 'Deneme Yönetici', islemler: ['satin-alma.ayar', 'ayarlar.yaz', 'satin-alma.fiyat-oku'] }, talepler: [] as Talep[], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: LIMITLER, dortGoz: true, onayKademesi: true, surum: 1,
  },
} as unknown as AcilisCevabi);

function sunucu(): { yol: string; govde: unknown }[] {
  const istekler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (yol: string, init?: RequestInit) => {
    const govde = init?.body ? JSON.parse(String(init.body)) : null;
    istekler.push({ yol: String(yol), govde });
    const y = String(yol);
    const cevap = y.includes('/satin-alma-onay-kisileri') ? { kisiler: [{ id: 21, ad: 'Deneme Onaylayan' }, { id: 22, ad: 'Deneme İkinci' }] }
      : y.includes('/roller') ? { roller: [{ id: 3, ad: 'Deneme uzman rolü' }] }
      : y.includes('/satin-alma-ayarlari/kaydet') ? { ...acilis().ayarlar, surum: 2 } : acilis();
    return new Response(JSON.stringify(cevap), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return istekler;
}
afterEach(() => { vi.unstubAllGlobals(); setBasamakYazar(false); document.body.innerHTML = ''; });

describe('3442-7b onay basamağına kişi', () => {
  it('kişiler sunucudan gelir ve kayıtta kimlikleriyle gider; kişisi bilinmeyen basamak kişi göndermez', () => {
    const ekran = onayLimitleriEkrana(LIMITLER);
    expect(ekran[1]!.kisiler).toEqual([{ id: 21, ad: 'Deneme Onaylayan' }]);
    expect(onayLimitleriGovdesi(ekran)).toEqual([
      { azamiTutar: '1000', seviye: 'Uzman', rolId: 3, kisiIdleri: [] },
      { azamiTutar: null, seviye: 'Müdür', rolId: null, kisiIdleri: [21] },
    ]);
    expect(onayLimitleriGovdesi([{ max: 10, role: 'Eski', rolId: null }])).toEqual([{ azamiTutar: '10', seviye: 'Eski', rolId: null }]);
  });

  it('onay ekranında basamağın ve üst basamağın kişileri adıyla sayılır; rolsüz ama kişili basamak denetimlidir', () => {
    const L = onayLimitleriEkrana(LIMITLER);
    expect(onaylayabilecekler({ approvalLimits: L, onayKademesi: true }, L[0]!)).toBe('Onaylayabilir: Deneme uzman rolü; kişi olarak Deneme Onaylayan');
    expect(onaylayabilecekler({ approvalLimits: L, onayKademesi: true }, L[1]!)).toBe('Onaylayabilir: kişi olarak Deneme Onaylayan');
  });

  it('denetim kapalıyken kişili basamak kişinin şimdilik kısıtlamadığını söyler; açıkken söylemez', () => {
    setBasamakYazar(true);
    for (const [kademe, beklenen] of [[false, 1], [true, 0]] as const) {
      S.settings = { ...DEFAULT_SETTINGS, approvalLimits: onayLimitleriEkrana(LIMITLER), onayKademesi: kademe };
      bump();
      document.body.innerHTML = `<div id="settings-form">${viewSettings()}</div>`;
      expect(document.querySelectorAll('[data-ap-kisi-kapali]')).toHaveLength(beklenen);
    }
    expect(document.body.textContent).not.toContain('onay yetkisi yeter');
  });

  it('yönetici ayarlarda kişi ekler ve çıkarır; kayıt kişi kimliklerini gönderir', async () => {
    const istekler = sunucu();
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'settings', yol: '/ayarlar', git: () => {}, basamakYazar: true });
    await vi.waitFor(() => expect(kok.querySelectorAll('[data-apk="kisiSec"]').length).toBe(2));
    const satir = (i: number) => kok.querySelector<HTMLElement>(`#ap-rows tr[data-ap="${i}"]`)!;
    expect([...satir(1).querySelectorAll('[data-apk-kisi]')].map((c) => c.textContent?.trim())).toEqual(['Deneme Onaylayan']);
    // Zaten yazılı kişi seçeneklerde yok.
    expect([...satir(1).querySelectorAll('[data-apk="kisiSec"] option')].map((o) => o.textContent)).toEqual(['Kişi seç', 'Deneme İkinci']);
    const sec = satir(0).querySelector<HTMLSelectElement>('[data-apk="kisiSec"]')!;
    sec.value = '22';
    satir(0).querySelector<HTMLElement>('[data-act="ap-kisi-ekle"]')!.click();
    await vi.waitFor(() => expect(satir(0).querySelectorAll('[data-apk-kisi]')).toHaveLength(1));
    satir(1).querySelector<HTMLElement>('[data-act="ap-kisi-cikar"]')!.click();
    await vi.waitFor(() => expect(satir(1).querySelectorAll('[data-apk-kisi]')).toHaveLength(0));
    kok.querySelector<HTMLElement>('[data-act="save-settings"]')!.click();
    await vi.waitFor(() => expect(istekler.some((i) => i.yol.includes('/satin-alma-ayarlari/kaydet'))).toBe(true));
    const g = istekler.find((i) => i.yol.includes('/satin-alma-ayarlari/kaydet'))!.govde as { onayLimitleri: { kisiIdleri?: number[] }[] };
    expect(g.onayLimitleri.map((l) => l.kisiIdleri)).toEqual([[22], []]);
    kapat();
  });
});
