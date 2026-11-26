import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimDurumuCevabi, AdimMatrisiCevabi, HazirlikMaddeleriCevabi, HazirlikSablonuCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 3741: hücre panelinde "Bu OP'ye özel". Adlar uydurmadır.
const ZAMAN = '2026-11-26T08:00:00.000Z';
const MATRIS_ADIMI = (fark: number): AdimMatrisiCevabi['emirler'][number]['adimlar'][number] => ({
  isEmriId: 12, opNo: 20, ad: 'Tornalama', durum: 'bekliyor', hedef: 40, yapilan: 0, yuzde: 0, sistemStatusu: 'baslayabilir', elle: null, sablondanFark: fark,
  maddeler: [{ madde: 'cnc', hal: 'tamam', ham: 'tamam', elle: null }, { madde: 'aparat', hal: 'tamam', ham: 'tamam', elle: null }, { madde: 'olcu-aleti', hal: 'gerekmez', ham: 'gerekmez', elle: null }],
});
const matris = (fark: number): AdimMatrisiCevabi => ({
  yazabilir: true,
  emirler: [{ emirId: 1, emirNo: 'UE-1', urun: { kod: 'ORN-1', ad: 'Deneme ürün' }, durum: 'basladi', teslim: '2026-12-05', adimlar: [MATRIS_ADIMI(fark)] }],
});
const OZEL_MADDE = {
  adimId: 901, ad: 'Özel pabuç kontrolü', aciklama: null, asama: 'hazirlik', tamam: false, kisiAdi: null, zaman: null, kaynak: null, kanit: null, kontrol: null, olcum: null,
  secim: null, fotoOzet: null, sinirDisi: null, ekleyenAdi: 'ORN-Planlama', eklenme: ZAMAN,
} satisfies AdimDurumuCevabi['adimlar'][number]['liste'][number];
const SABLON_MADDESI = { ...OZEL_MADDE, adimId: 902, ad: 'Şablondan gelen madde', eklenme: null, ekleyenAdi: null } satisfies AdimDurumuCevabi['adimlar'][number]['liste'][number];
const durumCevabi = (liste: AdimDurumuCevabi['adimlar'][number]['liste'], farklar: AdimDurumuCevabi['adimlar'][number]['sablonFarklari']): AdimDurumuCevabi => ({
  emirId: 1, emirNo: 'UE-1', urun: { kod: 'ORN-1', ad: 'Deneme ürün' }, adet: 40, teslim: null, durum: 'basladi', rotaYuzde: 0,
  hazirlik: { maddeler: [], muafiyetler: [], isEmirleri: [] }, yetki: { sablon: false },
  adimlar: [{
    isEmriId: 12, opNo: 20, ad: 'Tornalama', durum: 'bekliyor', calisma: null, bagimlilik: 'bekleyen', fason: false, hedef: 40, yapilan: 0, yuzde: 0, sistemStatusu: 'baslayabilir',
    nedenler: [], maddeler: [], tedarik: [], elle: null, onaylar: [], elleEksikler: [], gecmis: [], liste, sablon: null, sablonFarklari: farklar,
  }],
});
const MADDELER: HazirlikMaddeleriCevabi = {
  yazabilir: false,
  maddeler: [
    { kod: 'cnc', ad: 'CNC programı', kisa: 'CNC', sira: 1, acik: true, sistem: true, durduran: true, sahip: 'CNC Kurulum', isEmriDuzeyi: true, surum: 1 },
    { kod: 'aparat', ad: 'Aparat', kisa: 'Aparat', sira: 2, acik: true, sistem: true, durduran: false, sahip: 'Takımhane', isEmriDuzeyi: true, surum: 1 },
    { kod: 'olcu-aleti', ad: 'Ölçü aleti', kisa: 'Ölçü', sira: 3, acik: true, sistem: true, durduran: false, sahip: 'Kalite', isEmriDuzeyi: true, surum: 1 },
  ],
};
const SABLON = (yazar: boolean): HazirlikSablonuCevabi => ({ turler: [], yazar, durduranAcabilir: false });
const YAZAR = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const, 'uretim-emirleri.adim-durumu-yaz' as const] };
const ekran = [{ yol: '/adim-durumu', ekran: AdimDurumu }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function kur(o: { fark?: number; sablonYazar?: boolean; durum?: AdimDurumuCevabi } = {}) {
  const durum = o.durum ?? durumCevabi([SABLON_MADDESI, OZEL_MADDE], [{ madde: 'aparat', gerekli: true, kisiAdi: 'ORN-Müdür', an: ZAMAN, gerekce: 'Bu OP aparatla çalışır' }]);
  const istekler = sunucuKur(YAZAR, {
    'GET /adimli-emirler/adim-matrisi': () => json(200, matris(o.fark ?? 2)),
    'GET /adimli-emirler/1/adim-durumu': () => json(200, durum),
    'GET /hazirlik-maddeleri': () => json(200, MADDELER),
    'GET /hazirlik-sablonu': () => json(200, SABLON(o.sablonYazar ?? true)),
    'POST /adimli-emirler/1/is-emirleri/12/liste-ekle': () => json(200, durum),
    'POST /adimli-emirler/1/is-emirleri/12/liste-kaldir': () => json(200, durumCevabi([SABLON_MADDESI], [])),
    'POST /adimli-emirler/1/is-emirleri/12/sablon-farki': () => json(200, { isEmriId: 12, farklar: [] }),
    'POST /adimli-emirler/1/is-emirleri/12/sablon-farki-kaldir': () => json(200, { isEmriId: 12, farklar: [] }),
  });
  ac(ekran, '/adim-durumu');
  return istekler;
}
async function panelAc() {
  fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
  const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
  return within(await within(panel).findByRole('region', { name: "Bu OP'ye özel" }));
}
const posts = (istekler: ReturnType<typeof sunucuKur>) => istekler.filter((i) => i.yontem === 'POST');

describe("Hücre paneli: Bu OP'ye özel (3741)", () => {
  it('hücre "şablondan N fark" der; fark yoksa hiçbir şey eklenmez', async () => {
    kur({ fark: 2 });
    expect(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama: .*şablondan 2 fark/ })).toBeTruthy();
    cleanup();
    kur({ fark: 0 });
    const hucre = await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ });
    expect(hucre.getAttribute('aria-label')).not.toMatch(/şablondan/);
  });

  it('özel madde yalnız şablon dışı olanı listeler, rozetle işaretler; şablon farkı gerekçe ve kişiyle görünür', async () => {
    kur();
    const bolum = await panelAc();
    const maddeler = bolum.getByRole('list', { name: 'Şablon dışı maddeler' });
    expect(within(maddeler).getAllByRole('listitem')).toHaveLength(1);
    expect(within(maddeler).getByText('Özel pabuç kontrolü')).toBeTruthy();
    expect(within(maddeler).getByText("Bu OP'ye özel")).toBeTruthy();
    expect(bolum.queryByText('Şablondan gelen madde')).toBeNull();
    const farklar = bolum.getByRole('list', { name: 'Şablondan farklar' });
    expect(within(farklar).getByText("Bu OP'de gerekli")).toBeTruthy();
    expect(within(farklar).getByText(/ORN-Müdür .* Bu OP aparatla çalışır/)).toBeTruthy();
  });

  it('madde ekle: yalnız bu OP\'ye, hazırlık aşamasında, tekrar korumalı istekle gider; çöp kutusu onaydan sonra kaldırır', async () => {
    const istekler = kur();
    const bolum = await panelAc();
    const ekle = bolum.getByRole('button', { name: 'Ekle' }) as HTMLButtonElement;
    expect(ekle.disabled).toBe(true);
    fireEvent.change(bolum.getByLabelText('Madde adı'), { target: { value: '  Bağlama aparatı hazır ' } });
    fireEvent.click(bolum.getByRole('button', { name: 'Ekle' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.yol).toBe('/adimli-emirler/1/is-emirleri/12/liste-ekle');
    expect(posts(istekler)[0]?.govde).toEqual({ ad: 'Bağlama aparatı hazır', asama: 'hazirlik', kontrol: { tur: 'onay' }, sablonaEkle: false });
    expect(posts(istekler)[0]?.kimlik).toMatch(/^[0-9a-f]{8}-/);
    fireEvent.click(bolum.getByRole('button', { name: 'Kaldır: Özel pabuç kontrolü' }));
    expect(posts(istekler)).toHaveLength(1);
    fireEvent.click(within(bolum.getByRole('group', { name: 'Özel pabuç kontrolü kaldırılsın mı?' })).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(2); });
    expect(posts(istekler)[1]?.yol).toBe('/adimli-emirler/1/is-emirleri/12/liste-kaldir');
    expect(posts(istekler)[1]?.govde).toEqual({ adimId: 901 });
  });

  it('şablon maddesi bu OP\'de gerekmez: gerekçe zorunlu, durduran ve zaten gerekmeyen madde "gerekmez" listesinde yok; Şablona dön farkı kaldırır', async () => {
    const istekler = kur();
    const bolum = await panelAc();
    const uygula = bolum.getByRole('button', { name: "Bu OP'de uygula" }) as HTMLButtonElement;
    const madde = bolum.getByLabelText('Şablon maddesi') as HTMLSelectElement;
    expect([...madde.options].map((x) => x.value)).toEqual(['', 'aparat']);
    fireEvent.change(madde, { target: { value: 'aparat' } });
    expect(uygula.disabled).toBe(true);
    fireEvent.change(bolum.getByLabelText(/^Gerekçe/), { target: { value: 'Bu iş aparatsız' } });
    expect(uygula.disabled).toBe(false);
    fireEvent.click(uygula);
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.yol).toBe('/adimli-emirler/1/is-emirleri/12/sablon-farki');
    expect(posts(istekler)[0]?.govde).toEqual({ madde: 'aparat', gerekli: false, gerekce: 'Bu iş aparatsız' });
    expect(posts(istekler)[0]?.kimlik).toMatch(/^[0-9a-f]{8}-/);
    // "Gerekli" yalnız bu OP'de şimdi gerekmeyen maddeyi sunar (zaten gerekli olana etkisiz seçenek yok).
    fireEvent.change(bolum.getByLabelText("Bu OP'de"), { target: { value: 'evet' } });
    expect([...(bolum.getByLabelText('Şablon maddesi') as HTMLSelectElement).options].map((x) => x.value)).toEqual(['', 'olcu-aleti']);
    fireEvent.click(bolum.getByRole('button', { name: 'Şablona dön' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(2); });
    expect(posts(istekler)[1]?.yol).toBe('/adimli-emirler/1/is-emirleri/12/sablon-farki-kaldir');
    expect(posts(istekler)[1]?.govde).toEqual({ madde: 'aparat' });
  });

  it('hücre rozeti simge ve sayı gösterir; lejantta "şablondan N fark" açıklaması vardır', async () => {
    kur({ fark: 2 });
    const hucre = await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ });
    expect(hucre.querySelector('.tc-am-fark')?.textContent).toBe('2');
    expect(screen.getByRole('list', { name: 'Statü simgeleri' }).textContent).toMatch(/şablondan N fark/);
    cleanup();
    kur({ fark: 0 });
    await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ });
    expect(screen.getByRole('list', { name: 'Statü simgeleri' }).textContent).not.toMatch(/şablondan N fark/);
  });

  it('aynı ad aynı OP\'ye ikinci kez eklenmez: uyarı çıkar, Ekle kapanır, istek gitmez', async () => {
    const istekler = kur();
    const bolum = await panelAc();
    fireEvent.change(bolum.getByLabelText('Madde adı'), { target: { value: '  özel PABUÇ kontrolü ' } });
    expect(bolum.getByText('Bu operasyonda aynı adlı madde zaten var.')).toBeTruthy();
    expect((bolum.getByRole('button', { name: 'Ekle' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(bolum.getByLabelText('Madde adı'), { key: 'Enter' });
    expect(posts(istekler)).toHaveLength(0);
    fireEvent.change(bolum.getByLabelText('Madde adı'), { target: { value: 'Başka madde' } });
    expect((bolum.getByRole('button', { name: 'Ekle' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('şablon yazma yetkisi yoksa fark formu ve Şablona dön görünmez; madde ekleme kalır', async () => {
    kur({ sablonYazar: false });
    const bolum = await panelAc();
    expect(bolum.queryByLabelText('Şablon maddesi')).toBeNull();
    expect(bolum.queryByRole('button', { name: 'Şablona dön' })).toBeNull();
    expect(bolum.getByLabelText('Madde adı')).toBeTruthy();
    expect(bolum.getByText(/şablon yazma yetkisi ister/)).toBeTruthy();
  });

  it('fark ve özel madde yokken şablonu aynen izlediğini söyler', async () => {
    kur({ fark: 0, durum: durumCevabi([SABLON_MADDESI], []) });
    const bolum = await panelAc();
    expect(bolum.getByText('Bu OP şablonu aynen izliyor; özel madde yok.')).toBeTruthy();
    expect(bolum.queryByRole('list', { name: 'Şablon dışı maddeler' })).toBeNull();
  });
});
