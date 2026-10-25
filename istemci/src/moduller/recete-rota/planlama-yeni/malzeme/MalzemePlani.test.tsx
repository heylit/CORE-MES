import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PLANLAMA_ANAHTARI } from '../veri.ts';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { OneCekme, oneCekmeAdresi } from './OneCekme.tsx';

// Veri uydurmadır. Plan bugünden başlar; saatler bugünün 00:00'ından (UTC).
const bugun = new Date().toISOString().slice(0, 10);
const G = 24;

function calisma(plan: boolean) {
  return {
    surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, pref: {}, kapali: [], olaylar: [], senaryolar: [], canli: null, iz: [],
    D: {
      meta: { baslangic: bugun },
      siparisler: [{ id: 'E-1', urun: 'U1', adet: 10, termin: null, malzeme: [{ kod: 'M-1', miktar: 2 }] }],
      urunler: [{ id: 'U1' }], tezgahlar: [],
      malzemeler: [{ kod: 'M-1', ad: 'Deneme cubuk', birim: 'kg', stok: 5, birimFiyat: 10, tedarikGun: 2, muayeneGun: 0 }],
      satinalma: [{ kod: 'M-1', miktar: 3, gelis: '2099-01-01 08:00', tedarikci: 'T1' }],
      tedarikciler: [{ id: 'T1', ad: 'Deneme Tedarik' }],
    },
    plan: plan ? { dataVer: 1, ops: { 'E-1.10': { job: 'E-1', S: 5 * G, C: 6 * G, done: 0 } } } : null,
  };
}

const kayit = (plan = true) => [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: calisma(plan), surum: 4 }];
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Stok uçları: kart M-1 (malzeme 11), serbest 6; açık sipariş satırı 4 kg.
function stokSun(): void {
  const once = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    if (yol.startsWith('/stok/malzemeler?')) {
      return json(200, { satirlar: [{ malzemeId: 11, ad: 'Deneme cubuk', stokKodu: 'M-1', tur: null, birim: 'kg', toplam: '6', serbest: '6', statude: '0', rezerve: '0', kritikSeviye: null, durum: 'yeterli', konumSayisi: 1, konumlar: [] }], toplam: 1, sayfa: 1, sayfaBoyu: 200 });
    }
    if (yol === '/stok/acik-siparis-satirlari') {
      return json(200, { satirlar: [{ id: 1, siparisNo: 'S-1', talepNo: 'T-1', tedarikciAdi: 'Deneme Tedarik', malzemeId: 11, malzemeTur: null, kalemAdi: 'Deneme', miktar: '4', kalanMiktar: '4', birim: 'kg', beklenenTeslim: '2099-01-02' }] });
    }
    return once(adres, istek);
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Malzeme satın alma planı', () => {
  it('stok ve açık sipariş stoktan okunur; tutar maliyet görene çıkar; ekran yazmaz (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, kayit());
    stokSun();
    ac('/recete-rota/planlama-yeni/malzplan');
    expect(await screen.findByText(/Stok ve açık satın alma siparişleri stoktan okundu\./, {}, { timeout: 10000 })).toBeTruthy();
    // 20 kg gerekir: 6 stoktan, 4 açık siparişten, 10 yeni alım (10 TL/kg). Eksiğe tedarik süresinden tahmini satır kurulur; ihtiyacı
    // 7 gün içinde olduğu için "Sipariş verilmedi".
    const plan = screen.getByRole('table', { name: 'Verilecek siparişler' });
    expect(within(plan).getAllByRole('columnheader').map((h) => h.textContent)).toContain('Tutar');
    expect(within(plan).getByText('Sipariş verilmedi')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Açık siparişler' })).getByText('S-1')).toBeTruthy();
    expect(screen.getAllByText('100 TL').length).toBeGreaterThan(0);
    expect(screen.getByText('Plan motoru bağlanınca açılır.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Hesapla' }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('maliyet görmeyen kişide tutar yoktur, kalem sayısı vardır; stok okunamazsa planın kopyası kullanılır (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, kayit(), { ret: (y) => y.startsWith('/stok/') });
    ac('/recete-rota/planlama-yeni/malzplan');
    expect(await screen.findByText(/planın kendi kopyası kullanılıyor/, {}, { timeout: 10000 })).toBeTruthy();
    const plan = screen.getByRole('table', { name: 'Verilecek siparişler' });
    expect(within(plan).getAllByRole('columnheader').map((h) => h.textContent)).not.toContain('Tutar');
    expect(screen.queryByText(/ TL$/)).toBeNull();
    expect(screen.getAllByText(/kalem$/).length).toBeGreaterThan(0);
  }, 20000);

  it('kırılım ve dağılım düğmeleri görünümü değiştirir (eski düğme grupları)', async () => {
    sunucuKur(YONETICI, kayit());
    stokSun();
    ac('/recete-rota/planlama-yeni/malzplan');
    const kirilim = await screen.findByRole('group', { name: 'Kırılım' }, { timeout: 10000 });
    expect(screen.getByText('Günlük')).toBeTruthy();
    fireEvent.click(within(kirilim).getByRole('button', { name: 'Hafta' }));
    expect(within(kirilim).getByRole('button', { name: 'Hafta' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Haftalık')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Dağılım' })).getByRole('button', { name: 'Tedarikçi' }));
    const d = screen.getByRole('table', { name: 'Malzeme dağılımı' });
    expect(within(d).getAllByRole('columnheader')[0]?.textContent).toBe('Tedarikçi');
    expect(within(d).getByText('Tedarikçi seçilmedi')).toBeTruthy();
  }, 20000);

  it('ısı haritası katmanı: durum satırı, malzeme x gün ızgarası, hücre açılımı yazmaz (zz30-isi)', async () => {
    const istekler = sunucuKur(YONETICI, kayit());
    stokSun();
    ac('/recete-rota/planlama-yeni/malzplan');
    const durum = await screen.findByText(/^En sıcak satır/, { selector: '.tc-isi-durum span' }, { timeout: 10000 });
    // Açık sipariş (2099 termini) en geç gelişten sonra; eksik 10 kg'nin siparişi verilmedi. Açık alım: 4 kg x 10 TL (483/3).
    expect(durum.textContent).toMatch(/^En sıcak satır M-1: .*1 malzeme için sipariş verilmedi, 2 malzeme işi geciktirebilir; açık alım 40 TL\.$/);
    const izgara = screen.getByRole('group', { name: 'Malzeme × gün, stok yetiyor mu' });
    const son = within(izgara).getAllByRole('button').find((b) => /en geç sipariş günü/.test(b.getAttribute('aria-label') ?? ''));
    expect(son?.textContent).toBe('son');
    fireEvent.click(son as HTMLElement);
    const acilim = screen.getByRole('region', { name: 'M-1 · Sipariş verilmedi' });
    expect(within(acilim).getByText(/M-1 için sipariş verilmedi; plan .* günü 10 kg istiyor\./)).toBeTruthy();
    expect(within(acilim).getByText(/Bunu değiştirme yetkiniz yok\./)).toBeTruthy();
    expect((within(acilim).getByRole('button', { name: /E-1 çizelgede/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Tüm satırlar')).toBeTruthy();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('plan yoksa plan kurulmasını ister', async () => {
    sunucuKur(YONETICI, kayit(false));
    ac('/recete-rota/planlama-yeni/malzplan');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/Plan kurulunca malzemenin ne zaman gerektiği/)).toBeTruthy();
  }, 20000);

  it('çalışma kaydı hiç yoksa da plansız sayfa çizilir, boş ekran açılmaz', async () => {
    sunucuKur(YONETICI, []);
    ac('/recete-rota/planlama-yeni/malzplan');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/Plan kurulunca malzemenin ne zaman gerektiği/)).toBeTruthy();
    expect(screen.queryByText('Planlama çalışması yok.')).toBeNull();
  }, 20000);
});

describe('Malzeme öne çekme', () => {
  it('uç açılınca sunucunun değerlendirmesini okur ve kazancı sıralar', async () => {
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      istekler.push(adres);
      return json(200, {
        calismaSurumu: 4, dataVer: 1, baslangic: '2026-01-05', simdi: 10, maliyetGorunur: true,
        sonuc: {
          gunler: [1, 3, 5], taban: { tl: 1000, gecikmeSaat: 5, geciken: 1, yerlesmeyen: 0 },
          satirlar: [{ satinalmaSira: 0, kod: 'M-1', tedarikci: 'Deneme Tedarik', soz: 48, isler: ['E-1'], kazanc: [
            { gun: 1, tl: 100, saat: 0, geciken: 0, kurtulan: [] }, { gun: 3, tl: 900, saat: 4, geciken: 1, kurtulan: ['E-1'] }, { gun: 5, tl: 900, saat: 4, geciken: 1, kurtulan: ['E-1'] },
          ] }],
        },
      });
    }));
    render(<OneCekme surum={4} acik malzemeAdi={() => 'Deneme cubuk'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hesapla' }));
    expect(await screen.findByText(/3 gün önce gelirse 900 TL kazanılır/)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Malzeme öne çekme' })).toBeTruthy();
    expect(istekler).toEqual([`/api${oneCekmeAdresi(4)}`]);
    expect(screen.getAllByText('fark yok').length).toBe(1);
  });

  it('çalışma değiştiyse (409) yeniden hesaplamaya çağırır', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { kod: 'SURUM', mesaj: 'Eski sürüm.' })));
    render(<OneCekme surum={4} acik malzemeAdi={() => ''} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hesapla' }));
    expect(await screen.findByText(/Hesap tamamlanamadı: Çalışma değişti; sayfayı yenileyip yeniden hesaplayın\./)).toBeTruthy();
  });

  it('kapalıyken düğme görünür ama pasif (357 b), uca gitmez', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<OneCekme surum={4} malzemeAdi={() => ''} />);
    expect(screen.getByText('Plan motoru bağlanınca açılır.')).toBeTruthy();
    const d = screen.getByRole('button', { name: 'Hesapla' }) as HTMLButtonElement;
    expect(d.disabled).toBe(true);
    fireEvent.click(d);
    expect(f).not.toHaveBeenCalled();
  });
});
