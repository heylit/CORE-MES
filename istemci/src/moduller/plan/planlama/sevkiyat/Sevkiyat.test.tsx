import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MALIYETSIZ, PLANLAMASIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../veri.ts';

// Veri ve kişi adları uydurmadır. Görünüm yalnız okur (soru 355 cevabına kadar): hiçbir yazma isteği gitmez.
const calisma = {
  surum: 2, dataVer: 3,
  D: {
    meta: { baslangic: '2026-03-02' },
    musteriler: [{ id: 'm1', ad: 'Deneme Musteri' }],
    urunler: [{ id: 'u1', ad: 'Deneme Urun', rota: [{ k: 'a', ad: 'Torna' }, { k: 'b', ad: 'Son olcum' }] }],
    tezgahlar: [{ id: 't1' }],
    siparisler: [
      { id: 'S1', urun: 'u1', adet: 10, termin: '2026-03-03 12:00', musteri: 'm1' },
      { id: 'S2', urun: 'u1', adet: 5, termin: '2026-03-02 20:00' },
    ],
  },
  plan: { dataVer: 3, J: { S1: { C: 20, T: 0 }, S2: { C: 26, T: 6 } }, ops: { 'S1.b': { job: 'S1', C: 20, m: 't1' }, 'S2.a': { job: 'S2', C: 26, fas: 1 } } },
  sevkEdildi: { S1: { t: '2026-03-04', kim: 'Deneme' } },
  sevkIz: { S1: [{ C: 18, t: 1, kaynak: 'plan', kim: 'A' }, { C: 20, t: 5, kaynak: 'plan', kim: 'B' }] },
};
const kayitlar = (deger: unknown) => [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger, surum: 4 }];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* depo yok */ } });

const gorunum = (ad: string): void => { fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: ad })); };

describe('P6 Sevk takvimi', () => {
  it('Liste açılır: sipariş başına tek satır, geç satır üstte ve işaretli, sevk edilen en altta; çipler süzer, arama müşteride de arar; yalnız okur (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    const tablo = await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    expect(screen.getByRole('heading', { name: 'Sevk takvimi', level: 2 })).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Liste' }).getAttribute('aria-pressed')).toBe('true');
    // Geç satır "Geç kalanlar" grubunda üstte, sevk edilen en altta; tablo hücreleri dar ekran kartı için başlığını taşır.
    const satirlar = within(tablo).getAllByRole('row').map((r) => r.textContent ?? '');
    expect(satirlar.findIndex((t) => t.startsWith('Geç kalanlar'))).toBeLessThan(satirlar.findIndex((t) => t.startsWith('Sevk edildi')));
    const gecSatir = screen.getByText('+6 sa').closest('tr');
    expect(gecSatir?.getAttribute('data-ton')).toBe('hata');
    expect(gecSatir?.textContent).toContain('S2');
    expect(gecSatir?.querySelector('td')?.getAttribute('data-baslik')).toBe('Durum');
    expect(within(gecSatir as HTMLElement).getByText('Geç')).toBeTruthy();
    // Çipler sayı taşır; basınca listeyi süzer, tekrar basınca kalkar.
    const cipler = screen.getByRole('group', { name: 'Durum süzgeci' });
    expect(within(cipler).getAllByRole('button').map((b) => b.textContent)).toEqual(['1Geç', '1Sevk edildi']);
    fireEvent.click(within(cipler).getByRole('button', { name: /Sevk edildi/ }));
    expect(screen.queryByText('+6 sa')).toBeNull();
    expect(within(tablo).getAllByRole('button', { name: /ayrıntısı/ })).toHaveLength(1);
    fireEvent.click(within(cipler).getByRole('button', { name: /Sevk edildi/ }));
    // Arama müşteri adında da arar; uyan yoksa süzgeci temizleme yolu çıkar.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'deneme musteri' } });
    expect(within(tablo).getAllByRole('button', { name: /ayrıntısı/ })).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'yok boyle' } });
    expect(screen.getByText(/Süzgece uyan sipariş yok/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci temizle' }));
    expect(within(tablo).getAllByRole('button', { name: /ayrıntısı/ })).toHaveLength(2);
    expect(screen.getByText(/1 sipariş ilk planına göre ertelendi/)).toBeTruthy();
    // Görünüm salt okunur: sevk tarihi girdisi yok, yazma isteği yok.
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('satır açılımı: bitiş akışı (plan geçmişi), sevk kaydı ve son adım; ikinci basış kapatır; "Kokpit\'te gör" siparişi seçip Kokpit sayfasını açar (3537 a)', async () => {
    const istekler = sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    const s1 = screen.getByRole('button', { name: /^S1 ayrıntısı$/ });
    fireEvent.click(s1);
    expect(s1.getAttribute('aria-expanded')).toBe('true');
    const ac1 = screen.getByRole('region', { name: /^S1 · Sevk edildi/ });
    expect(within(ac1).getByText('Ertelenmiş plan 1')).toBeTruthy();
    expect(within(ac1).getByText('sevk edildi 04.03')).toBeTruthy();
    expect(within(ac1).getByText(/1 .* plan|2 plan/)).toBeTruthy();
    expect(within(ac1).getByText(/Son adım/)).toBeTruthy();
    // Planı değişmemiş sipariş bunu yazar.
    fireEvent.click(screen.getByRole('button', { name: /^S2 ayrıntısı$/ }));
    expect(within(screen.getByRole('region', { name: /^S2 · Geç/ })).getByText('Plan bu siparişte değişmedi.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /^S2 · Geç/ })).getByText('Sevk kaydı yok.')).toBeTruthy();
    fireEvent.click(s1);
    expect(screen.getByRole('region', { name: /^S1 · Sevk edildi/ })).toBeTruthy();
    fireEvent.click(s1);
    expect(screen.queryByRole('region', { name: /^S1 · / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "S2 Kokpit'te gör" }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); }, { timeout: 10000 });
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('Sipariş × gün görünümü bugünkü ısı haritasıdır: durum satırı, sipariş × gün ızgarası; hücre açılımı neden ve bilgiyle açılır (kilit metni yok), Esc kapatır; Kokpit seçeneği Kokpit\'i açar', async () => {
    const istekler = sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    gorunum('Sipariş × gün');
    expect(localStorage.getItem('tmi.sevkiyat.gorunum')).toBe('takvim');
    const izgara = screen.getByRole('group', { name: 'Sipariş × gün, termine kalan süre' });
    expect(document.querySelector('.tc-pyv-nabiz')?.textContent).toContain('En sıcak satır S2');
    // "Tüm satırlar" katı kalktı: liste ve özet burada yok.
    expect(screen.queryByText('Tüm satırlar')).toBeNull();
    expect(screen.queryByRole('table', { name: 'Siparişler' })).toBeNull();
    const hucre = within(izgara).getByRole('button', { name: /^S2, 03\.03 Sal: .*6 sa geç/ });
    fireEvent.click(hucre);
    const acilim = screen.getByRole('region', { name: 'S2 · —' });
    expect(within(acilim).getByText('S2 termini 02.03 Pzt, plan 03.03 Sal sevke hazır diyor: 6 sa geç.')).toBeTruthy();
    expect(within(acilim).queryByText(/yetkiniz yok/)).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'S2 · —' })).toBeNull();
    fireEvent.click(hucre);
    fireEvent.click(within(screen.getByRole('region', { name: 'S2 · —' })).getByRole('button', { name: /S2 Kokpit'te/ }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); }, { timeout: 10000 });
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('Grafik görünümü dönem özeti ve bitiş akışıdır; dönem, ölçü ve gösterim seçimi özeti değiştirir; son görünüm hatırlanır', async () => {
    sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    gorunum('Grafik');
    expect(screen.getByRole('heading', { name: 'Sevkiyat özeti' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bitiş tarihi akışı' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Dönem başına sevkiyat' })).toBeTruthy();
    expect(screen.getAllByText('Ertelenmiş plan 1').length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByRole('group', { name: 'Ölçü' })).getByRole('button', { name: 'Adet' }));
    expect(screen.getByText(/Birim: adet\./)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Gösterim' })).getByRole('button', { name: 'Tablo' }));
    expect(screen.queryByRole('img', { name: 'Dönem başına sevkiyat' })).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Dönem' })).getByRole('button', { name: 'Ay' }));
    expect(screen.getAllByText('Mart 2026').length).toBeGreaterThan(0);
    expect(localStorage.getItem('tmi.sevkiyat.gorunum')).toBe('grafik');
    expect(localStorage.getItem('tmi.sevkiyat.donem')).toBe('ay');
    // Yeniden açılışta son görünüm ve dönem gelir.
    cleanup();
    ac('/plan/sevkiyat');
    expect(await screen.findByRole('heading', { name: 'Sevkiyat özeti' }, { timeout: 10000 })).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Dönem' })).getByRole('button', { name: 'Ay' }).getAttribute('aria-pressed')).toBe('true');
  }, 20000);

  it('dönem seçici liste başlıklarını belirler', async () => {
    sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    fireEvent.click(within(screen.getByRole('group', { name: 'Dönem' })).getByRole('button', { name: 'Ay' }));
    expect(screen.getByText('Sevk edildi', { selector: 'b' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Dönem' })).getByRole('button', { name: 'Gün' }));
    expect(screen.getByRole('table', { name: 'Siparişler' })).toBeTruthy();
  }, 20000);

  it('telefonda Takvim yoktur: kayıtlı görünüm takvimse Liste açılır, satır kart kipindedir ve Kokpit düğmesi açılımdadır', async () => {
    localStorage.setItem('tmi.sevkiyat.gorunum', 'takvim');
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('767') || q.includes('1023'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    const tablo = await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    expect(tablo.closest('.tc-tablo-kap')?.getAttribute('data-kip')).toBe('kart');
    expect(within(screen.getByRole('group', { name: 'Görünüm' })).queryByRole('button', { name: 'Sipariş × gün' })).toBeNull();
    expect(screen.queryByRole('button', { name: "S2 Kokpit'te gör" })).toBeNull();
    // Kartta Adet ve Termin satırda görünür (CSS ile gizlenmez): Fark termin olmadan okunmaz.
    expect(tablo.querySelectorAll('td[data-kart-gizli]').length).toBeGreaterThan(0);
    expect([...tablo.querySelectorAll('td[data-kart-gizli]')].some((td) => ['Adet', 'Termin'].includes(td.getAttribute('data-baslik') ?? ''))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^S2 ayrıntısı$/ }));
    expect(within(screen.getByRole('region', { name: /^S2 · Geç/ })).getByRole('button', { name: "Kokpit'te gör" })).toBeTruthy();
  }, 20000);

  it('tablette (1024 altı, 768 üstü) Yer ve Adet açılıma iner, satır eylemi simge düğmedir ve kap odaklanabilir bölgedir; Termin Plan bitişinin altında, Fark satırda kalır', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('1023'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    const tablo = await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    const basliklar = [...tablo.querySelectorAll('th')].map((th) => th.textContent);
    expect(basliklar).not.toContain('Termin');
    expect(basliklar).toContain('Plan bitişi ve termin');
    expect(screen.getByText(/^termin 02\.03 Pzt 20:00$/)).toBeTruthy();
    expect(basliklar).toContain('Fark');
    expect(basliklar).not.toContain('Adet');
    expect(basliklar).not.toContain('Yer (son adım)');
    const eylem = screen.getByRole('button', { name: "S2 Kokpit'te gör" });
    expect(eylem.textContent).toBe('');
    expect(screen.getByRole('region', { name: 'Siparişler, yana kaydırılabilir' }).getAttribute('tabindex')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /^S2 ayrıntısı$/ }));
    expect(within(screen.getByRole('region', { name: /^S2 · Geç/ })).getByText('Adet: 5')).toBeTruthy();
  }, 20000);

  it('plan kurulmamışsa ya da çalışma yoksa yalnız uyarı çıkar; çip, arama ve görünüm seçici çizilmez', async () => {
    sunucuKur(MALIYETSIZ, kayitlar({ ...calisma, plan: null }) as never);
    ac('/plan/sevkiyat');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Durum süzgeci' })).toBeNull();
    expect(screen.queryByRole('searchbox', { name: 'Ara' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Görünüm' })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI);
    ac('/plan/sevkiyat');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);

  it('planlama okuması olmayan kişi görünümü açamaz (reddedilen)', async () => {
    sunucuKur(PLANLAMASIZ, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    expect(await screen.findByText('Planlama sayfalarını görme yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText('S1')).toBeNull();
  }, 20000);

  it('Dağılım görünümü: takvim günü ve matris hücresi siparişleri açar; termini o gün olan da listelenir; yalnız okur', async () => {
    const istekler = sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/plan/sevkiyat');
    await screen.findByRole('table', { name: 'Siparişler' }, { timeout: 10000 });
    gorunum('Dağılım');
    expect(localStorage.getItem('tmi.sevkiyat.gorunum')).toBe('dagilim');
    expect(screen.getByRole('button', { name: /^Gecikmiş \(0\)$/ })).toBeTruthy();
    const izgara = screen.getByRole('group', { name: 'Takvim' });
    // 02.03: S2'nin termini bugün, bitişi ertesi gün: bitecek yok, termin var; seçilince termin listede çıkar.
    fireEvent.click(within(izgara).getByRole('button', { name: /^02\.03 Pzt: 0 bitecek, 0 aşan, 1 termin, bugün$/ }));
    const liste = screen.getByRole('region', { name: 'Seçilen günün siparişleri' });
    expect(within(liste).getByText('02.03 Pzt 20:00')).toBeTruthy();
    expect(within(liste).getByText('03.03 Sal 02:00')).toBeTruthy();
    // Plan terminden sonra ve planın aşımı varsa "Aşıyor" işareti ve fark satırda görünür.
    expect(within(liste).getByText(/Aşıyor \+6 sa/)).toBeTruthy();
    expect(within(liste).getByText('6 sa geç')).toBeTruthy();
    // Takvimde sipariş olmayan ve plandan sonraki günler ayrı söylenir.
    expect(within(izgara).getAllByText('plan yok').length).toBeGreaterThan(0);
    fireEvent.click(within(liste).getByRole('button', { name: 'Bitecek' }));
    expect(within(liste).getByText('Bu seçim için sipariş yok.')).toBeTruthy();
    // 03.03: S2 bitecek ve termini aştığı için aşan.
    fireEvent.click(within(izgara).getByRole('button', { name: /^03\.03 Sal: 1 bitecek, 1 aşan, 0 termin$/ }));
    expect(within(screen.getByRole('region', { name: 'Seçilen günün siparişleri' })).getByText(/Aşıyor \+6 sa/)).toBeTruthy();
    // Matris: hücre seçilince liste müşteriye ve güne süzülür; süzgeç kaldırılır.
    fireEvent.click(within(screen.getByRole('group', { name: 'Biçim' })).getByRole('button', { name: 'Matris' }));
    expect(localStorage.getItem('tmi.sevkiyat.dagilim')).toBe('matris');
    const tablo = screen.getByRole('table', { name: 'Müşteri ve gün matrisi' });
    expect(within(tablo).getByRole('columnheader', { name: 'Gecikmiş' })).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: /^—, 03\.03 Sal: 1 bitecek, 1 aşan$/ }));
    expect(within(screen.getByRole('region', { name: 'Seçilen günün siparişleri' })).getByText('Süzgeci kaldır')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci kaldır' }));
    expect(screen.queryByRole('button', { name: 'Süzgeci kaldır' })).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);
});
