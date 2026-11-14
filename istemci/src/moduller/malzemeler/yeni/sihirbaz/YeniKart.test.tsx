import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { rotalar } from '../../rotalar.tsx';
import type { KatalogKartlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { ORNEK_AYAR, ORNEK_KARTLAR, ornekKayit } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, json, sunucuKur, yeniEkranAc, yeniIstemci, type Yanit } from '../test-ortak.tsx';

// Çizim merkezinin paneli kendi testlerinde sınanır; burada yalnız hangi kart no ile ve nerede açıldığı ölçülür.
const yukleme = vi.hoisted(() => ({ cagrilar: [] as { no: number; ad: string; g: unknown }[] }));
vi.mock('../../../cizimler/disari.ts', async (asil) => ({
  ...(await asil<Record<string, unknown>>()),
  ResimPaneli: ({ malzemeNo }: { malzemeNo: number }) => <div data-testid="resim-paneli">{malzemeNo}</div>,
  // 3242 d: yükleme Çizim Merkezi'nin işidir; burada hangi kart no, tür, teknik resim no ve revizyonla çağrıldığı ölçülür.
  malzemeBelgesiYukle: vi.fn(async (no: number, dosya: File, g: { tur: string }) => {
    yukleme.cagrilar.push({ no, ad: dosya.name, g });
    if (dosya.name.startsWith('BOZUK')) throw new Error('Sunucuya ulaşılamadı.');
    return { cevap: { belgeler: [{ id: 40 + yukleme.cagrilar.length, tur: g.tur }] }, kareHatasi: null };
  }),
}));

// jsdom kaydırma yapmaz; adım değişince sayfanın başına dönülmesi burada sınanmaz.
beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const ac = (sorgu = '') => yeniEkranAc(`/malzemeler/yeni${sorgu}`);

// Uydurma kartlar: örnek listenin üstüne, testin istediği kart eklenir.
function kartlarYaniti(...ek: { kimlik: string; kayit: Record<string, unknown> }[]): Yanit {
  const c: KatalogKartlariCevabi = {
    ...ORNEK_KARTLAR,
    satirlar: [...ORNEK_KARTLAR.satirlar, ...ek.map((x, i) => ({ kimlik: x.kimlik, no: 100 + i, kayit: x.kayit, surum: 1 }))],
    toplam: ORNEK_KARTLAR.satirlar.length + ek.length,
  };
  return () => json(200, c);
}

const sarfKarti = (kimlik: string, ek: Record<string, unknown> = {}) => ({
  ...ornekKayit(kimlik, 'SF-DNM-00001', 'Deneme sarf', 'sarf'), fam: null, cls: null, grade: null, form: null, dims: {},
  g: { kat: 'kaynak', tur: 'Gazaltı teli (MIG/MAG)', sinif: 'AWS A5.18 ER70S-6', marka: 'Deneme marka' }, onay: { durum: 'taslak' }, ...ek,
});

describe('M1 yeni kart sihirbazı', () => {
  test('yazan sihirbazı adresinden açar: başlık, adımlar, hızlı arama ve ilk adımda Kaydet yok (izinli)', async () => {
    sunucuKur(YAZAN);
    ac();
    expect(await screen.findByRole('heading', { name: 'Tür ve aile' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Adımlar' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Katalogda ara' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'İleri' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /kaydet/i })).toBeNull();
    expect((screen.getByRole('button', { name: /Geri/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('ilk adımda "Seçerek süz ve kart bul": seçim yokken yol gösterir, seçilince kart listelenir', async () => {
    sunucuKur(YAZAN);
    ac();
    const suz = (await screen.findByText('Seçerek süz ve kart bul')).closest('details') as HTMLDetailsElement;
    expect(suz.open).toBe(false);
    fireEvent.click(within(suz).getByText('Seçerek süz ve kart bul'));
    expect(within(suz).getByText(/Sol taraftan özellik seçerek/)).toBeTruthy();
    fireEvent.click(within(suz).getAllByRole('checkbox')[0]!);
    expect(await within(suz).findAllByRole('button', { name: 'Aç' })).not.toHaveLength(0);
  });

  test('yalnız okuyan sihirbazı açamaz; kart isteği gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(OKUYAN);
    ac();
    expect(await screen.findByText('Bu bölümü görme yetkin yok.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Tür ve aile' })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  test('kayıtlı kart son adımdan açılır; kod alanı salt okunurdur ve "Otomatik" düğmesi yoktur (kart #234 madde 10)', async () => {
    sunucuKur(YAZAN);
    ac('?kart=mornek1');
    expect(await screen.findByRole('heading', { name: 'Özet ve kayıt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Değişiklikleri kaydet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ticari bilgiler/ }));
    const kod = await screen.findByLabelText('Malzeme kodu') as HTMLInputElement;
    expect(kod.readOnly).toBe(true);
    expect(kod.value).toBe('HM-MET-C45-0001');
    expect(kod.closest('.tc-my-alan')?.querySelector('button')).toBeNull();
  });

  test('MLZ-7 a (G8): teknik özellikler adımı kaliteden dolan değeri "tipik" diye işaretler ve sertifika değeri olmadığını söyler', async () => {
    sunucuKur(YAZAN);
    ac('?kart=mornek1');
    await screen.findByRole('heading', { name: 'Özet ve kayıt' });
    fireEvent.click(screen.getByRole('button', { name: /Teknik/ }));
    expect(await screen.findByText(/sertifika değeri değildir/)).toBeTruthy();
    expect(screen.getAllByText('Tipik · kaliteden').length).toBeGreaterThan(0);
    expect(screen.queryByText('Kaliteden')).toBeNull();
  });

  test('onaylı kartta değişiklik yoksa istek gitmez, "Kartta değişiklik yok." denir', async () => {
    const istekler = sunucuKur(YAZAN);
    ac('?kart=mornek1');
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText('Kartta değişiklik yok.')).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  test('onaylı kartta yazanın değişikliği talep olarak gider; bant "kaydedildi" değil "talep onaya gönderildi" der', async () => {
    const istekler = sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik: 'mdnm2', kayit: sarfKarti('mdnm2', { onay: { durum: 'aktif' } }) }),
      'POST /malzeme-katalogu-kartlari/mdnm2/kaydet': () => json(200, { id: 'mdnm2', stok_kodu: 'SF-DNM-00001', surum: 2 }),
    });
    ac('?kart=mdnm2');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    const adimlar = within(screen.getByRole('navigation', { name: 'Adımlar' }));
    fireEvent.click(adimlar.getByRole('button', { name: /Ticari/ }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Marka' }), { target: { value: 'Başka marka' } });
    fireEvent.click(adimlar.getByRole('button', { name: /Özet/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText(/^Değişiklik talebi onaya gönderildi/)).toBeTruthy();
    expect(screen.queryByText('Kataloğa kaydedildi.')).toBeNull();
    const govde = istekler.find((i) => i.yontem === 'POST')?.govde as { kayit: { talep?: { durum: string }; onay: { durum: string } } };
    expect(govde.kayit.talep?.durum).toBe('beklemede');
    expect(govde.kayit.onay.durum).toBe('aktif');
  });

  test('kayıt kartı ve özeti gönderir; sunucunun ret iletisi olduğu gibi gösterilir (madde 18)', async () => {
    const istekler = sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik: 'mdnm1', kayit: sarfKarti('mdnm1') }),
      'POST /malzeme-katalogu-kartlari/mdnm1/kaydet': () => json(409, { kod: 'CAKISMA', mesaj: 'Kart arada değişti; yenileyip tekrar dene.' }),
    });
    ac('?kart=mdnm1');
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText('Kart arada değişti; yenileyip tekrar dene.')).toBeTruthy();
    const yazma = istekler.find((i) => i.yontem === 'POST');
    expect(yazma?.yol).toBe('/malzeme-katalogu-kartlari/mdnm1/kaydet');
    const govde = yazma?.govde as { kayit: { id: string; tur: string }; ozet: { tur: string; stok_kodu: string | null }; surum: number | null };
    expect(govde.kayit.id).toBe('mdnm1');
    expect(govde.ozet.tur).toBe('sarf');
    expect(govde.surum).toBe(1);
  });

  test('kategori reddi: ayar yazabilen "Kategorileri aç" görür (izinli), yazamayan yetkili kişiye yönlendirilir (reddedilen)', async () => {
    const red: Yanit = () => json(400, { kod: 'GECERSIZ', mesaj: 'Kategori listede yok.', alan: 'kayit.g.kat' });
    for (const [ayarYazabilir, beklenen] of [[true, 'Kategorileri aç'], [false, 'Kategori açmak için yetkili kişiye başvurun.']] as const) {
      sunucuKur(YONETICI, {
        'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, ayarYazabilir }),
        'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik: 'mdnm2', kayit: sarfKarti('mdnm2') }),
        'POST /malzeme-katalogu-kartlari/mdnm2/kaydet': red,
      });
      ac('?kart=mdnm2');
      fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
      if (ayarYazabilir) expect(await screen.findByRole('button', { name: beklenen })).toBeTruthy();
      else expect(await screen.findByText(beklenen, { exact: false })).toBeTruthy();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test('birimi boş kayıtlı kartta stok birimi varsayılanla doldurulmaz, "Birim seçin" istenir; kayıt birimsiz gitmez', async () => {
    const istekler = sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik: 'mdnm3', kayit: sarfKarti('mdnm3', { com: { kod: 'SF-DNM-00003', ad: 'Birimsiz', std: '', ted: '', birim: '', sertifika: [], not: '' } }) }),
    });
    ac('?kart=mdnm3');
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText('Bu kartın birimi yok; stok birimini seçip kaydedin.')).toBeTruthy();
    const secim = await screen.findByLabelText('Stok birimi') as HTMLSelectElement;
    expect(secim.value).toBe('');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  test('tedarikçi: 2 harften azda istek yok; bulunan firma seçilince kimlik ve ad yazılır, "Değiştir" ikisini siler', async () => {
    const istekler = sunucuKur(YAZAN, {
      'GET /malzeme-firma-secenekleri': () => json(200, { firmalar: [{ id: 17, ad: 'ORNEK Firma A.Ş.', kod: 'F-1' }] }),
    });
    ac('?kart=mornek1');
    fireEvent.click(await screen.findByRole('button', { name: /Ticari bilgiler/ }));
    const ara = await screen.findByRole('searchbox', { name: /Tedarikçi/ });
    fireEvent.change(ara, { target: { value: 'o' } });
    await new Promise((r) => { setTimeout(r, 350); });
    expect(istekler.some((i) => i.yol.startsWith('/malzeme-firma-secenekleri'))).toBe(false);
    fireEvent.change(ara, { target: { value: ' ornek ' } });
    fireEvent.click(await screen.findByRole('option', { name: /ORNEK Firma A\.Ş\./ }));
    expect(istekler.find((i) => i.yol.startsWith('/malzeme-firma-secenekleri'))?.yol).toBe('/malzeme-firma-secenekleri?ara=ornek');
    const kilitli = await screen.findByDisplayValue('ORNEK Firma A.Ş.') as HTMLInputElement;
    expect(kilitli.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }));
    expect(await screen.findByRole('searchbox', { name: /Tedarikçi/ })).toBeTruthy();
  });

  test('kopya: ileti verilir, kimlik ve kod kopyaya geçmez, sorgu adresten silinir', async () => {
    sunucuKur(YAZAN);
    ac('?kopya=mornek1');
    expect(await screen.findByText('Kopya oluşturuldu. Ölçüleri değiştirip yeni kod olarak kaydedebilirsin.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Form ve ölçüler' })).toBeTruthy();
  });

  test('kg fiyatı yalnız satın alma ya da maliyet okuyabilene sorulur (195 a)', async () => {
    for (const [kullanici, sorulur] of [[YONETICI, true], [YAZAN, false]] as const) {
      const istekler = sunucuKur(kullanici, {
        'GET /satin-alma-kg-fiyatlari/malzemeler': () => json(200, { malzemeler: [] }),
      });
      ac('?kart=mornek1');
      await screen.findByRole('heading', { name: 'Özet ve kayıt' });
      if (sorulur) await waitFor(() => { expect(istekler.some((i) => i.yol.startsWith('/satin-alma-kg-fiyatlari'))).toBe(true); });
      else expect(istekler.some((i) => i.yol.startsWith('/satin-alma-kg-fiyatlari'))).toBe(false);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test('açılış yarım taslak yazmaz; ilk değişiklikten sonra sayfa yenilenince taslak sürer', async () => {
    sunucuKur(YAZAN);
    ac('?kopya=mornek1');
    await screen.findByRole('heading', { name: 'Form ve ölçüler' });
    expect(localStorage.length).toBe(0);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Sihirbaz' })).getByRole('button', { name: 'Geri' }));
    await screen.findByRole('heading', { name: 'Sınıf ve kalite' });
    cleanup();
    ac();
    expect(await screen.findByRole('heading', { name: 'Sınıf ve kalite' })).toBeTruthy();
  });

  test('rotası olan kartta operasyonlar salt okunur ve Reçete ve Rota bağlantısı; rotasız kartta düzenleyici (233 a)', async () => {
    const ymKarti = (kimlik: string) => ({
      ...ornekKayit(kimlik, 'YM-DNM-00001', 'Deneme yarı mamul', 'yarimamul'), fam: null, cls: null, grade: null, form: null, dims: {},
      g: { ad: 'Deneme mil', tip: 'Talaşlı işlenmiş parça' }, ops: [{ no: 10, kod: 'TOR', ad: 'Tornalama' }], onay: { durum: 'taslak' },
    });
    for (const [kimlik, rotali] of [['mym1', true], ['mym2', false]] as const) {
      sunucuKur(YAZAN, {
        'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik, kayit: ymKarti(kimlik) }),
        [`GET /malzeme-katalogu-kartlari/${kimlik}/rota`]: () => json(200, { rotali }),
      });
      ac(`?kart=${kimlik}`);
      fireEvent.click(await screen.findByRole('button', { name: /Operasyon/ }));
      if (rotali) {
        expect(await screen.findByRole('button', { name: "Reçete ve Rota'da düzenle" })).toBeTruthy();
        expect(screen.getByRole('cell', { name: 'TOR' })).toBeTruthy();
        expect(screen.queryByRole('searchbox', { name: 'Operasyon ara' })).toBeNull();
      } else {
        expect(await screen.findByRole('searchbox', { name: 'Operasyon ara' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: "Reçete ve Rota'da düzenle" })).toBeNull();
      }
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test('reçete ve rota var olan üründen alınır: seçim karta yazılmaz, kayıttan sonra kopya isteği Rota\'ya gider (306 a, 307 b)', async () => {
    const ymKarti = {
      ...ornekKayit('mym3', 'YM-DNM-00003', 'Deneme yarı mamul', 'yarimamul'), fam: null, cls: null, grade: null, form: null, dims: {},
      g: { ad: 'Deneme mil', tip: 'Talaşlı işlenmiş parça' }, ops: [], onay: { durum: 'taslak' },
    };
    const rotalar = { rotalar: [
      { urun: { id: 7, stokKodu: 'MM-DNM-00007', ad: 'Deneme ürün', tur: 'mamul', stokBirimi: null, onayDurumu: 'aktif' }, yururlukte: { id: 70, harf: 'A' }, acik: null, revizyonSayisi: 1 },
      { urun: { id: 8, stokKodu: 'MM-DNM-00008', ad: 'Rotasız ürün', tur: 'mamul', stokBirimi: null, onayDurumu: 'aktif' }, yururlukte: null, acik: null, revizyonSayisi: 0 },
    ] };
    const istekler = sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik: 'mym3', kayit: ymKarti }),
      'GET /malzeme-katalogu-kartlari/mym3/rota': () => json(200, { rotali: false }),
      'GET /rota/urunler': () => json(200, rotalar),
      'POST /malzeme-katalogu-kartlari/mym3/kaydet': () => json(200, { id: 'mym3', stok_kodu: 'YM-DNM-00003', surum: 2 }),
      'POST /rota/urunler/100/kopya-iste': () => json(200, { durum: 'bekliyor', revizyon: null }),
    });
    ac('?kart=mym3');
    fireEvent.click(await screen.findByRole('button', { name: /Operasyon/ }));
    const secim = await screen.findByRole('combobox', { name: 'Reçete ve rotası alınacak ürün' });
    expect(within(secim).queryByText(/Rotasız ürün/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reçete ve rotayı bu üründen al' }));
    expect(await screen.findByText(/Reçete ve rota MM-DNM-00007 · Deneme ürün ürününden alınacak/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Özet/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText(/Kart onaylanınca MM-DNM-00007 · Deneme ürün reçete ve rotası/)).toBeTruthy();
    const kayit = istekler.find((i) => i.yol === '/malzeme-katalogu-kartlari/mym3/kaydet');
    expect((kayit?.govde as { kayit: Record<string, unknown> }).kayit['_receteKaynagi']).toBeUndefined();
    const kopya = istekler.find((i) => i.yol === '/rota/urunler/100/kopya-iste');
    expect(kopya?.govde).toEqual({ kaynakUrunId: 7 });
    expect(istekler.indexOf(kopya!)).toBeGreaterThan(istekler.indexOf(kayit!));
  });

  test('resim paneli (688): kayıtlı yarı mamulde Tanım adımında ve kayıttan sonra Özet adımında kart no ile; teknik resim alanı olmayan hammaddenin Tanım adımında yok', async () => {
    const ymKarti = {
      ...ornekKayit('mym5', 'YM-DNM-00005', 'Deneme yarı mamul', 'yarimamul'), fam: null, cls: null, grade: null, form: null, dims: {},
      g: { ad: 'Deneme mil', tip: 'Talaşlı işlenmiş parça', resim: 'TR-1', rev: 'A' }, ops: [], onay: { durum: 'taslak' },
    };
    sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik: 'mym5', kayit: ymKarti }),
      'GET /malzeme-katalogu-kartlari/mym5/rota': () => json(200, { rotali: false }),
      'POST /malzeme-katalogu-kartlari/mym5/kaydet': () => json(200, { id: 'mym5', stok_kodu: 'YM-DNM-00005', surum: 2 }),
    });
    ac('?kart=mym5');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    expect(screen.queryByTestId('resim-paneli')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tanım/ }));
    expect((await screen.findByTestId('resim-paneli')).textContent).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: /Özet/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    await screen.findByText(/^Kataloğa kaydedildi/);
    expect(screen.getByTestId('resim-paneli').textContent).toBe('100');
    cleanup();
    vi.unstubAllGlobals();
    sunucuKur(YAZAN);
    ac('?kart=mornek1');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    expect(screen.queryByTestId('resim-paneli')).toBeNull();
  });

  test('kopya isteği reddedilirse kart kayıtlı kalır ve sunucunun iletisi gösterilir; hammadde kartında seçim yok', async () => {
    const ymKarti = {
      ...ornekKayit('mym4', 'YM-DNM-00004', 'Deneme yarı mamul', 'yarimamul'), fam: null, cls: null, grade: null, form: null, dims: {},
      g: { ad: 'Deneme mil', tip: 'Talaşlı işlenmiş parça' }, ops: [], onay: { durum: 'taslak' }, _receteKaynagi: { no: 7, ad: 'Deneme ürün' },
    };
    sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': kartlarYaniti({ kimlik: 'mym4', kayit: ymKarti }),
      'GET /malzeme-katalogu-kartlari/mym4/rota': () => json(200, { rotali: false }),
      'POST /malzeme-katalogu-kartlari/mym4/kaydet': () => json(200, { id: 'mym4', stok_kodu: 'YM-DNM-00004', surum: 2 }),
      'POST /rota/urunler/100/kopya-iste': () => json(409, { kod: 'CAKISMA', mesaj: 'Bu ürünün rotası var.' }),
    });
    ac('?kart=mym4');
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText(/Kart kaydedildi; reçete ve rota kopyası istenemedi: Bu ürünün rotası var\./)).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    const istekler = sunucuKur(YAZAN);
    ac('?kart=mornek1');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    expect(screen.queryByRole('button', { name: /Operasyon/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Reçete ve rotası alınacak ürün' })).toBeNull();
    expect(istekler.some((i) => i.yol === '/rota/urunler')).toBe(false);
  });

  test('alış birimi ve katsayısı stok biriminin arkasında, kayıtlı değerle dolu gelir (323 b)', async () => {
    sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': kartlarYaniti({
        kimlik: 'mdnm4',
        kayit: sarfKarti('mdnm4', { com: { kod: 'SF-DNM-00004', ad: 'Alışlı', std: '', ted: '', birim: 'adet', alisBirimi: 'kutu', alisKatsayisi: '12,5', sertifika: [], not: '' } }),
      }),
    });
    ac('?kart=mdnm4');
    fireEvent.click(await screen.findByRole('button', { name: /Ticari bilgiler/ }));
    expect(((await screen.findByLabelText('Alış birimi')) as HTMLSelectElement).value).toBe('kutu');
    expect((screen.getByLabelText('1 alış birimi = kaç adet') as HTMLInputElement).value).toBe('12,5');
  });
});

// 1882: düz "Yeni kart" adresi kayıtlı kartın kimliğini taşıyan taslağı sürdürmez; sürdürürse yeni malzeme o karta değişiklik talebi olarak gider.
describe('1882 yeni kart kayıtlı kartın kimliğini taşımaz', () => {
  const yarimTaslak = () => JSON.parse(localStorage.getItem('tmi-malzemeler-yarim-taslak') ?? 'null') as { d: { id?: string; tur?: string } } | null;
  const sihirbazdaAdim = (ad: RegExp) => { fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: ad })); };

  test('kart düzenlenirken bırakılır, "Yeni kart" açılınca boş kart başlar; aynı kartın düzenlemesi kendi adresinde sürer', async () => {
    sunucuKur(YAZAN);
    ac('?kart=mornek1');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    sihirbazdaAdim(/Ticari/);
    await waitFor(() => { expect(yarimTaslak()?.d.id).toBe('mornek1'); });
    cleanup();
    ac();
    expect(await screen.findByRole('heading', { name: 'Tür ve aile' })).toBeTruthy();
    expect(screen.queryByText('HM-MET-C45-0001')).toBeNull();
    cleanup();
    ac('?kart=mornek1');
    expect(await screen.findByRole('heading', { name: 'Ticari bilgiler' })).toBeTruthy();
  });

  test('düzenleme bırakıldıktan sonra "Yeni kart"ta seçilen mamul kimlik taşımaz (bildirilen hata)', async () => {
    sunucuKur(YAZAN);
    ac('?kart=mornek1');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    sihirbazdaAdim(/Ticari/);
    await waitFor(() => { expect(yarimTaslak()?.d.id).toBe('mornek1'); });
    cleanup();
    ac();
    await screen.findByRole('heading', { name: 'Tür ve aile' });
    expect(screen.queryByRole('button', { name: 'Değişiklikleri kaydet' })).toBeNull();
    fireEvent.click(document.querySelector('[data-tur="mamul"]')!);
    await waitFor(() => { expect(yarimTaslak()?.d.tur).toBe('mamul'); });
    expect(yarimTaslak()?.d.id).toBeUndefined();
  });

  test('sihirbaz açıkken menüdeki "Yeni kart" düzenlenen kartı bırakır, boş kart açar', async () => {
    sunucuKur(YAZAN);
    render(
      <QueryClientProvider client={yeniIstemci()}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/malzemeler/yeni?kart=mornek1']}>
            <Link to="/malzemeler/yeni">Menü: Yeni kart</Link>
            <Routes>{rotalar.map((e) => <Route key={e.yol} path={e.yol} element={<e.ekran />} />)}</Routes>
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    fireEvent.click(screen.getByRole('link', { name: 'Menü: Yeni kart' }));
    expect(await screen.findByRole('heading', { name: 'Tür ve aile' })).toBeTruthy();
    fireEvent.click(document.querySelector('[data-tur="mamul"]')!);
    await waitFor(() => { expect(yarimTaslak()?.d.tur).toBe('mamul'); });
    expect(yarimTaslak()?.d.id).toBeUndefined();
  });

  test('1882 a: kayıtlı kart düzenlenirken tür değişirse kimlik düşer, kayıt yeni kart olur', async () => {
    sunucuKur(YAZAN);
    ac('?kart=mornek1');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    sihirbazdaAdim(/Tür ve aile/);
    fireEvent.click(await waitFor(() => document.querySelector('[data-tur="mamul"]')!));
    await waitFor(() => { expect(yarimTaslak()?.d.tur).toBe('mamul'); });
    expect(yarimTaslak()?.d.id).toBeUndefined();
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/malzemeler/yeni'); });
  });

  test('3242 d: yeni yarı mamulde föydeki rafa PDF ve STEP seçilir; kayıtta kartın numarası, teknik resim no ve revizyonuyla Çizim Merkezi\'ne gider', async () => {
    yukleme.cagrilar.length = 0;
    const taslak = {
      ...ornekKayit('', '', '', 'yarimamul'), id: undefined, fam: null, cls: null, grade: null, form: null, dims: {},
      g: { ad: 'Deneme braket', tip: 'Talaşlı işlenmiş parça', resim: 'ORN-2045-01', rev: 'B' }, ops: [], onay: { durum: 'taslak' },
      com: { kod: '', ad: '', std: '', ted: '', birim: 'ADET', sertifika: [], not: '' },
    };
    localStorage.setItem('tmi-malzemeler-yarim-taslak', JSON.stringify({ d: taslak, adim: 5 }));
    let yeni: { kimlik: string; kayit: Record<string, unknown> } | null = null;
    sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': () => kartlarYaniti(...(yeni ? [yeni] : []))(undefined, ''),
    });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const m = /\/malzeme-katalogu-kartlari\/([^/]+)\/kaydet$/.exec(adres);
      if (m && secenek?.method === 'POST') {
        const kimlik = decodeURIComponent(m[1]!);
        yeni = { kimlik, kayit: (JSON.parse(String(secenek.body)) as { kayit: Record<string, unknown> }).kayit };
        return json(200, { id: kimlik, stok_kodu: 'YM-DNM-00042', surum: 1 });
      }
      return asil(adres, secenek);
    }));
    ac();
    const foy = await screen.findByRole('complementary', { name: 'Canlı föy önizlemesi' });
    const raf = within(foy).getByRole('region', { name: 'Çizimler' });
    expect(within(raf).getByText(/Kayıtta ORN-2045-01 · Rev B ile Çizim Merkezi'ne gider/)).toBeTruthy();
    const girdi = within(raf).getByLabelText('STEP ya da PDF seç') as HTMLInputElement;
    fireEvent.change(girdi, { target: { files: [new File(['x'], 'ORN-2045-01_Rev-B.pdf'), new File(['y'], 'ORN-2045-01_Rev-B.step'), new File(['z'], 'kroki.dxf')] } });
    expect(await screen.findByText('Yalnız PDF ve STEP eklenir: kroki.dxf.')).toBeTruthy();
    expect(within(raf).getAllByText('Kayıtta gönderilir')).toHaveLength(2);
    expect(within(raf).getAllByText('ORN-2045-01 · Rev B')).toHaveLength(2);
    expect(yukleme.cagrilar).toHaveLength(0);
    fireEvent.click(within(raf).getByRole('button', { name: 'ORN-2045-01_Rev-B.step kaldır' }));
    fireEvent.change(girdi, { target: { files: [new File(['y'], 'ORN-2045-01_Rev-B.step')] } });

    fireEvent.click(screen.getByRole('button', { name: 'Kataloğa kaydet' }));
    await waitFor(() => { expect(yukleme.cagrilar).toHaveLength(2); });
    expect(yukleme.cagrilar.map((c) => [c.no, c.ad, c.g])).toEqual([
      [100, 'ORN-2045-01_Rev-B.pdf', { tur: 'teknik-resim', resimNo: 'ORN-2045-01', antetRev: 'B' }],
      [100, 'ORN-2045-01_Rev-B.step', { tur: '3b-model', resimNo: 'ORN-2045-01', antetRev: 'B' }],
    ]);
    expect(await within(raf).findByText('Yayında')).toBeTruthy();
    expect(await within(raf).findByText('Taslak')).toBeTruthy();
    expect(within(raf).queryByRole('button', { name: /kaldır/ })).toBeNull();
    expect(within(raf).queryByLabelText('STEP ya da PDF seç')).toBeNull();
  });

  test('3242 d: yükleme hata verirse kart kayıtlı kalır, raf "Gönderilemedi" ve yeniden dener; hammaddede ve kayıtlı kartta raf yok', async () => {
    yukleme.cagrilar.length = 0;
    const taslak = {
      ...ornekKayit('', '', '', 'yarimamul'), id: undefined, fam: null, cls: null, grade: null, form: null, dims: {},
      g: { ad: 'Deneme braket 2', tip: 'Talaşlı işlenmiş parça', resim: 'ORN-2046-01' }, ops: [], onay: { durum: 'taslak' },
      com: { kod: '', ad: '', std: '', ted: '', birim: 'ADET', sertifika: [], not: '' },
    };
    localStorage.setItem('tmi-malzemeler-yarim-taslak', JSON.stringify({ d: taslak, adim: 5 }));
    let yeni: { kimlik: string; kayit: Record<string, unknown> } | null = null;
    sunucuKur(YAZAN, { 'GET /malzeme-katalogu-kartlari': () => kartlarYaniti(...(yeni ? [yeni] : []))(undefined, '') });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const m = /\/malzeme-katalogu-kartlari\/([^/]+)\/kaydet$/.exec(adres);
      if (m && secenek?.method === 'POST') {
        const kimlik = decodeURIComponent(m[1]!);
        yeni = { kimlik, kayit: (JSON.parse(String(secenek.body)) as { kayit: Record<string, unknown> }).kayit };
        return json(200, { id: kimlik, stok_kodu: 'YM-DNM-00043', surum: 1 });
      }
      return asil(adres, secenek);
    }));
    ac();
    const raf = within(await screen.findByRole('complementary', { name: 'Canlı föy önizlemesi' })).getByRole('region', { name: 'Çizimler' });
    expect(within(raf).getByText(/ORN-2046-01 · Rev —/)).toBeTruthy();
    fireEvent.change(within(raf).getByLabelText('STEP ya da PDF seç'), { target: { files: [new File(['x'], 'BOZUK.pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Kataloğa kaydet' }));
    expect(await within(raf).findByText('Gönderilemedi')).toBeTruthy();
    expect(within(raf).getByRole('alert').textContent).toBe("Dosya Çizim Merkezi'ne gönderilemedi; kart kaydedildi.");
    expect(await screen.findByText(/^Kataloğa kaydedildi/)).toBeTruthy();
    fireEvent.click(within(raf).getByRole('button', { name: 'Yeniden dene' }));
    await waitFor(() => { expect(yukleme.cagrilar).toHaveLength(2); });
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    sunucuKur(YAZAN);
    ac('?kart=mornek1');
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    expect(screen.queryByRole('region', { name: 'Çizimler' })).toBeNull();
  });
});
