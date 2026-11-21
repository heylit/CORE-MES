import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PLANLAMA_ANAHTARI } from '../veri.ts';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { MalzemePlani } from './MalzemePlani.tsx';
import { OneCekme, oneCekmeAdresi, SURUM_YOK } from './OneCekme.tsx';

// Veri uydurmadır. Plan bugünden başlar; saatler bugünün 00:00'ından (UTC).
const bugun = new Date().toISOString().slice(0, 10);
const G = 24;

function calisma(plan: boolean) {
  return {
    surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, pref: {}, kapali: [], olaylar: [], senaryolar: [], canli: null, iz: [],
    D: {
      meta: { baslangic: bugun },
      siparisler: [{ id: 'E-1', urun: 'U1', adet: 10, termin: null, malzeme: [{ kod: '11', miktar: 2 }] }],
      urunler: [{ id: 'U1' }], tezgahlar: [],
      malzemeler: [{ kod: '11', ad: 'Deneme cubuk', birim: 'kg', stok: 5, birimFiyat: 10, tedarikGun: 2, muayeneGun: 0 }],
      satinalma: [{ kod: '11', miktar: 3, gelis: '2099-01-01 08:00', tedarikci: 'T1' }],
      tedarikciler: [{ id: 'T1', ad: 'Deneme Tedarik' }],
    },
    plan: plan ? { dataVer: 1, ops: { 'E-1.10': { job: 'E-1', S: 5 * G, C: 6 * G, done: 0 } } } : null,
  };
}

const kayit = (plan = true) => [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: calisma(plan), surum: 4 }];
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Stok uçları: malzeme 11 (stok kodu M-1; planda kodu malzeme numarasıdır), serbest 6; açık sipariş satırı 4 kg.
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

// Açık talepler satın almanın termin takibinden okunur (3485 a); `talepte` verilirse 11 numaralı malzemede o kadar talep var.
function talepSun(talepte: number | null): void {
  const once = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    if (adres.replace(/^\/api/, '') === '/satin-alma-tedarik-terminleri') {
      if (talepte === null) return json(403, { kod: 'YETKI', mesaj: 'yok' });
      return json(200, { takip: [{ tur: 'malzeme', malzemeNo: 11, birim: 'kg', karsilayanlar: [{ tur: 'talep', miktar: String(talepte), birim: 'kg' }] }] });
    }
    return once(adres, istek);
  }));
}
const TALEPCI: Kullanici = { ...YONETICI, islemler: [...YONETICI.islemler, 'satin-alma.talep-ac'] };
const GORUNUM_ANAHTARI = 'tmi.malzplan.gorunum';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.removeItem(GORUNUM_ANAHTARI); });

describe('Malzeme satın alma planı: Liste (3537 a)', () => {
  it('malzeme başına tek satır, durum Kokpit dilinde; şeritte tek birincil talebi taslakla Taleplerim\'e götürür; ekran yazmaz', async () => {
    const istekler = sunucuKur(TALEPCI, kayit());
    stokSun();
    talepSun(0);
    ac('/plan/malzplan');
    const tablo = await screen.findByRole('table', { name: 'Malzemeler' }, { timeout: 10000 });
    // 20 kg gerekir: 6 stoktan, 4 açık siparişten (2099'da gelir, işi geciktirir), 10 yeni alım: durum Eksik.
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar).toHaveLength(1);
    expect(within(satirlar[0]!).getByText('Eksik')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('10 kg')).toBeTruthy();
    expect(within(satirlar[0]!).getByText(/^4 kg geliyor/)).toBeTruthy();
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toContain('Eksik (gelen düşülmüş)');
    // Bir ekranda tek birincil (Arayüz): satırdaki "Talep aç" ikincildir.
    const birincil = document.querySelectorAll('.tc-pyz .tc-dugme-birincil');
    expect(birincil).toHaveLength(1);
    expect(birincil[0]?.textContent).toBe('Talep aç: günü geçen ve eksik (1)');
    expect(within(screen.getByRole('group', { name: 'Durum süzgeci' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['1Eksik']);
    expect(screen.queryByText('Tüm satırlar')).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
    fireEvent.click(birincil[0] as HTMLElement);
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/taleplerim'); }, { timeout: 10000 });
  }, 20000);

  it('satır açılınca neden, günlük tüketim, açık sipariş ve termin; emir Kokpit\'te seçili açılır, kilit metni yok', async () => {
    sunucuKur(YONETICI, kayit());
    stokSun();
    talepSun(0);
    ac('/plan/malzplan');
    fireEvent.click(await screen.findByRole('button', { name: /^11 Deneme cubuk/ }, { timeout: 10000 }));
    const acilim = screen.getByRole('region', { name: '11 · Eksik' });
    expect(within(acilim).getByText(/Açık sipariş işin en geç başlayabileceği günden sonra geliyor/)).toBeTruthy();
    expect(within(acilim).getByRole('list', { name: '11 günlük tüketim' })).toBeTruthy();
    expect(within(acilim).getByText('S-1')).toBeTruthy();
    expect(within(acilim).getByLabelText('11 tedarik termini')).toBeTruthy();
    expect(within(acilim).queryByText(/yetkiniz yok/)).toBeNull();
    // Talep yetkisi yok: satırda Talep aç da şeritte birincil de yok.
    expect(screen.queryByRole('button', { name: /talep aç/i })).toBeNull();
    fireEvent.click(within(acilim).getByRole('button', { name: "Kokpit'te aç · E-1" }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); }, { timeout: 10000 });
  }, 20000);

  it('açık talep eksiği karşılıyorsa satır "Talepte" yazar, birincil gizlenir; talepler okunamazsa söylenir', async () => {
    sunucuKur(TALEPCI, kayit());
    stokSun();
    talepSun(10);
    ac('/plan/malzplan');
    expect(await screen.findByRole('link', { name: 'Talepte 10 kg' }, { timeout: 10000 })).toBeTruthy();
    expect(document.querySelectorAll('.tc-pyz .tc-dugme-birincil')).toHaveLength(0);
    cleanup();
    sunucuKur(TALEPCI, kayit());
    stokSun();
    talepSun(null);
    ac('/plan/malzplan');
    expect(await screen.findByText(/Açık talepler okunamadı/, {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);

  it('arama ve süzgeç; uyan yoksa "Süzgeci temizle"', async () => {
    sunucuKur(YONETICI, kayit());
    stokSun();
    talepSun(0);
    ac('/plan/malzplan');
    const ara = await screen.findByRole('searchbox', { name: 'Ara' }, { timeout: 10000 });
    fireEvent.change(ara, { target: { value: 'boru' } });
    expect(screen.getByText(/Süzgece uyan malzeme yok/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci temizle' }));
    expect(screen.getByRole('button', { name: /^11 Deneme cubuk/ })).toBeTruthy();
    fireEvent.change(ara, { target: { value: 'E-1' } });
    expect(screen.getByRole('button', { name: /^11 Deneme cubuk/ })).toBeTruthy();
  }, 20000);

  it('plan yoksa ya da çalışma kaydı yoksa plan kurulmasını ister, Kokpit\'e bağlantı verir', async () => {
    sunucuKur(YONETICI, kayit(false));
    ac('/plan/malzplan');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: "Kokpit'te planı kur" }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); }, { timeout: 10000 });
    cleanup();
    sunucuKur(YONETICI, []);
    ac('/plan/malzplan');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText('Planlama çalışması yok.')).toBeNull();
  }, 20000);

  it('plan eskiyse nabız söyler ve Kokpit\'te güncellemeye bağlar; liste son plana göre durur', async () => {
    const c = calisma(true);
    sunucuKur(YONETICI, [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: { ...c, dataVer: 2 }, surum: 4 }]);
    stokSun();
    talepSun(0);
    ac('/plan/malzplan');
    expect(await screen.findByText(/^Plan eski: /, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Kokpit'te planı güncelle" })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Malzemeler' })).toBeTruthy();
  }, 20000);
});

describe('Malzeme satın alma planı: Kokpit seçimi', () => {
  it('"Kokpit\'te aç" emri seçer ve Kokpit\'e gider (3537-1 Test T1)', async () => {
    sunucuKur(YONETICI, []);
    stokSun();
    talepSun(0);
    const sec = vi.fn();
    const git = vi.fn();
    const c = calisma(true);
    const oz = {
      depo: { receteRotaKaydi: null, durum: null, calismaSurumu: 4 }, calisma: c, yetki: { maliyetOku: true, planYaz: false }, yenile: () => undefined, sec, git,
    } as unknown as PlanlamaEkranOzellikleri;
    render(
      <QueryClientProvider client={new QueryClient()}><BildirimSaglayici><MemoryRouter><MalzemePlani {...oz} /></MemoryRouter></BildirimSaglayici></QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^11 Deneme cubuk/ }, { timeout: 10000 }));
    fireEvent.click(screen.getByRole('button', { name: "Kokpit'te aç · E-1" }));
    expect(sec).toHaveBeenCalledWith({ siparis: 'E-1', adim: null, tezgah: null });
    expect(git).toHaveBeenCalledWith('kokpit');
  }, 20000);
});

describe('Malzeme satın alma planı: Takvim ve Bütçe', () => {
  it('Bütçe: stok ve açık sipariş stoktan okunur; tutar maliyet görene çıkar; kırılım ve dağılım düğmeleri; görünüm hatırlanır', async () => {
    sunucuKur(YONETICI, kayit());
    stokSun();
    talepSun(0);
    ac('/plan/malzplan');
    fireEvent.click(within(await screen.findByRole('group', { name: 'Görünüm' }, { timeout: 10000 })).getByRole('button', { name: 'Bütçe' }));
    expect(screen.getByText(/Stok ve açık satın alma siparişleri stoktan okundu\./)).toBeTruthy();
    expect(screen.getAllByText('100 TL').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Hesapla' }) as HTMLButtonElement).disabled).toBe(false);
    const kirilim = screen.getByRole('group', { name: 'Kırılım' });
    fireEvent.click(within(kirilim).getByRole('button', { name: 'Hafta' }));
    expect(screen.getByText('Haftalık', { selector: 'b' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Dağılım' })).getByRole('button', { name: 'Tedarikçi' }));
    expect(within(screen.getByRole('table', { name: 'Malzeme dağılımı' })).getByText('Tedarikçi seçilmedi')).toBeTruthy();
    expect(screen.getByText('Günlük tüketim ve toplu plan')).toBeTruthy();
    cleanup();
    sunucuKur(YONETICI, kayit());
    stokSun();
    talepSun(0);
    ac('/plan/malzplan');
    expect(await screen.findByRole('table', { name: 'Malzeme dağılımı' }, { timeout: 10000 })).toBeTruthy();
  }, 20000);

  it('Bütçe: maliyet görmeyen kişide tutar yoktur, kalem sayısı vardır; stok okunamazsa planın kopyası kullanılır', async () => {
    localStorage.setItem(GORUNUM_ANAHTARI, 'butce');
    sunucuKur(MALIYETSIZ, kayit(), { ret: (y) => y.startsWith('/stok/') });
    ac('/plan/malzplan');
    expect(await screen.findByText(/planın kendi kopyası kullanılıyor/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText(/ TL$/)).toBeNull();
    expect(screen.getAllByText(/kalem$/).length).toBeGreaterThan(0);
  }, 20000);

  it('Takvim: nabız, malzeme x gün ızgarası; hücre açılımı yazmaz, kilit metni yok, emir Kokpit\'te açılır (zz30-isi, 3537 a)', async () => {
    localStorage.setItem(GORUNUM_ANAHTARI, 'takvim');
    const istekler = sunucuKur(YONETICI, kayit());
    stokSun();
    talepSun(0);
    ac('/plan/malzplan');
    const durum = await screen.findByText(/^En sıcak satır/, { selector: '.tc-pyz-nabiz span' }, { timeout: 10000 });
    expect(durum.textContent).toMatch(/^En sıcak satır 11: .*1 malzeme için sipariş verilmedi, 1 malzeme işi geciktirebilir; açık alım 40 TL\.$/);
    const izgara = screen.getByRole('group', { name: 'Malzeme × gün, stok yetiyor mu' });
    const son = within(izgara).getAllByRole('button').find((b) => /en geç sipariş günü/.test(b.getAttribute('aria-label') ?? ''));
    expect(son?.textContent).toBe('son');
    fireEvent.click(son as HTMLElement);
    const acilim = screen.getByRole('region', { name: '11 · Termin bekleniyor' });
    expect(within(acilim).getByText(/11 için sipariş verilmedi; plan .* günü 10 kg istiyor\./)).toBeTruthy();
    expect(within(acilim).queryByText(/yetkiniz yok/)).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
    fireEvent.click(within(acilim).getByRole('button', { name: /Kokpit'te aç · E-1/ }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); }, { timeout: 10000 });
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
          satirlar: [{ satinalmaSira: 0, kod: '11', tedarikci: 'Deneme Tedarik', soz: 48, isler: ['E-1'], kazanc: [
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

  it('sürüm yokken (kayıtsız çalışma, Satın Alma görünümü) düğme yerinde pasif, uca gitmez', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<OneCekme surum={null} malzemeAdi={() => ''} />);
    expect(screen.getByText(SURUM_YOK)).toBeTruthy();
    const d = screen.getByRole('button', { name: 'Hesapla' }) as HTMLButtonElement;
    expect(d.disabled).toBe(true);
    fireEvent.click(d);
    expect(f).not.toHaveBeenCalled();
  });
});
