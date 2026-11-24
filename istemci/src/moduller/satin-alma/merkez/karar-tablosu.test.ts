import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep, Teklif } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri } from './test-ekrani.ts';

const K1 = '00000000-0000-4000-8000-0000000000c1';
const K2 = '00000000-0000-4000-8000-0000000000c2';
const QA = '00000000-0000-4000-8000-0000000000a1';
const QB = '00000000-0000-4000-8000-0000000000b1';
const teklif = (id: string, firmaId: number, ad: string, fiyat: string): Teklif => ({
  id, firmaId, tedarikciAdi: ad, teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
  nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: 12,
  teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId: K1, birimFiyat: fiyat }, { kalemId: K2, birimFiyat: fiyat }],
});
const t: Talep = {
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'degerlendirme', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: K1, katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '10', birim: 'adet', kategori: '' }, { id: K2, katalogId: null, ad: 'Deneme kalem 2', ozellik: '', miktar: '5', birim: 'adet', kategori: '' }],
  teklifIstekleri: [], teklifler: [teklif(QA, 3, 'Deneme A', '100'), teklif(QB, 4, 'Deneme B', '150')],
  karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [t], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

async function ac(istekler: { yol: string; govde: unknown }[]): Promise<{ kok: HTMLElement; kapat: () => void }> {
  vi.stubGlobal('fetch', vi.fn(async (yol: string, init?: RequestInit) => {
    istekler.push({ yol: String(yol), govde: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  const kok = document.createElement('div');
  document.body.append(kok);
  const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
  await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
  talepSatiri(kok, t.id)!.click();
  await vi.waitFor(() => expect(kok.querySelector('[data-sa-karar-matrisi]')).not.toBeNull());
  return { kok, kapat };
}
const hucre = (kok: HTMLElement, kalem: string, qid: string) => kok.querySelector<HTMLButtonElement>(`.sa-kr-genis [data-act="kr-ata"][data-item="${kalem}"][data-qid="${qid}"]`)!;
const gonderDugmesi = (kok: HTMLElement) => kok.querySelector<HTMLButtonElement>('[data-kr-cubuk] [data-act="kr-gonder"]')!;

describe('karşılaştır ve karar tek tabloda (3590 D)', () => {
  it('önerilen tedarikçi her kalemde seçili gelir; başka hücre seçilince gerekçe istenir, gerekçesiz onaya gitmez', async () => {
    const istekler: { yol: string; govde: unknown }[] = [];
    const { kok, kapat } = await ac(istekler);
    expect(kok.querySelector('.sa-adim-govde')?.getAttribute('data-sec')).toBe('compare');
    // Ayrı bölme, ağırlık sürgüsü ve şartlar tablosu yok: tek tablo, tek çubuk.
    expect(kok.querySelector('details.sa-detay')).toBeNull();
    expect(kok.querySelectorAll('[data-kr-cubuk]')).toHaveLength(1);
    expect(kok.querySelector('[data-kr-agirlik]')).not.toBeNull();
    expect(kok.querySelector('.sa-kr-t tfoot')?.textContent).toContain('Ödeme');
    expect(hucre(kok, K1, QA).getAttribute('aria-pressed')).toBe('true');
    expect(hucre(kok, K2, QA).getAttribute('aria-pressed')).toBe('true');
    expect(gonderDugmesi(kok).getAttribute('aria-disabled')).toBeNull();
    expect(gonderDugmesi(kok).textContent).toContain('Onaya gönder');

    hucre(kok, K1, QB).click();
    expect(hucre(kok, K1, QB).getAttribute('aria-pressed')).toBe('true');
    expect(hucre(kok, K1, QA).getAttribute('aria-pressed')).toBe('false');
    expect(gonderDugmesi(kok).getAttribute('aria-disabled')).toBe('true');
    const once = istekler.length;
    gonderDugmesi(kok).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(istekler.slice(once).filter((y) => !y.yol.includes('/acilis'))).toEqual([]);
    expect(document.activeElement?.hasAttribute('data-kr-gerekce')).toBe(true);

    // Sütunun "Tümünü ver"i önerilene döndürür; gerekçe gerekmez.
    kok.querySelector<HTMLElement>(`.sa-kr-genis [data-act="kr-tek"][data-qid="${QA}"]`)!.click();
    expect(gonderDugmesi(kok).getAttribute('aria-disabled')).toBeNull();
    kapat();
  });

  it('parçalı karar: işaretsiz kalem ayrılır; önce geri alınamaz uyarısı, sonra tek komut', async () => {
    const istekler: { yol: string; govde: unknown }[] = [];
    const { kok, kapat } = await ac(istekler);
    const kutu = kok.querySelector<HTMLInputElement>(`.sa-kr-genis [data-kr-dahil="${K2}"]`)!;
    kutu.checked = false;
    kutu.dispatchEvent(new Event('change', { bubbles: true }));
    expect(gonderDugmesi(kok).textContent).toContain('Seçilenleri onaya gönder (1/2)');
    expect(kok.querySelector('.sa-kr-serit')?.textContent).toContain('Deneme kalem 2');

    const once = istekler.length;
    gonderDugmesi(kok).click();
    const pencere = document.querySelector('[data-kr-pencere]');
    expect(pencere?.textContent).toContain('geri alınamaz');
    expect(document.activeElement?.hasAttribute('data-kr-ilk')).toBe(true);
    expect(istekler.length).toBe(once);
    document.querySelector<HTMLElement>('[data-act="kr-gonder-evet"]')!.click();
    await vi.waitFor(() => expect(istekler.some((y) => y.yol.includes('/parcali-onaya-gonder'))).toBe(true));
    const g = istekler.find((y) => y.yol.includes('/parcali-onaya-gonder'))!.govde as { kalanKalemIdleri: string[]; karar: { teklifId: string | null }; surum: number };
    expect(g.kalanKalemIdleri).toEqual([K2]);
    expect(g.surum).toBe(1);
    kapat();
  });
});
