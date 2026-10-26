import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import { ORNEK_AYAR, ORNEK_KARTLAR, ornekKayit } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, json, sunucuKur, yeniEkranAc, type Yanit } from '../test-ortak.tsx';

// Çizim merkezinin parçaları kendi testlerinde sınanır; burada hangi kart no'larıyla ve nerede çağrıldıkları ölçülür.
const resimIstekleri = vi.hoisted(() => [] as number[][]);
vi.mock('../../../cizimler/disari.ts', async (asil) => ({
  ...(await asil<Record<string, unknown>>()),
  ResimPaneli: ({ malzemeNo }: { malzemeNo: number }) => <div data-testid="resim-paneli">{malzemeNo}</div>,
  useKucukResimler: (_m: string, idler: readonly number[]) => {
    resimIstekleri.push([...idler]);
    return new Map(idler.map((id) => [id, { hedefId: id, belgeId: 1, revizyonId: 2, harf: 'B', kareSayisi: 1, revUyumu: false }]));
  },
  KucukResimKutusu: ({ ad, resim }: { ad: string; resim: { revUyumu: boolean | null } }) => <span data-testid="kucuk-resim" data-uyum={String(resim.revUyumu)}>{ad}</span>,
}));

const KOK = '/malzemeler';
// Onay yetkisi olan ama Etiket Merkezi'ni açamayan kullanıcı (ana veri sorumlusu).
const SORUMLU: Kullanici = { id: 5, ad: 'Deneme Sorumlu', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.malzemeler', 'malzemeler.yaz', 'malzemeler.onayla'] };

// Katalog rolü sunucudan (ayar cevabındaki `rol`) gelir; testte kullanıcının işlemleriyle uyumlu verilir.
const rolOf = (k: Kullanici) => (k.id === YONETICI.id ? 'yonetici' : k.islemler.includes('malzemeler.onayla') ? 'sorumlu' : k.islemler.includes('malzemeler.yaz') ? 'talep' : null);
const kur = (k: Kullanici, yollar: Record<string, Yanit> = {}) =>
  sunucuKur(k, { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, rol: rolOf(k) }), ...yollar });
const metni = (b: Blob) => new Promise<string>((tamam) => { const r = new FileReader(); r.onload = () => tamam(String(r.result)); r.readAsText(b); });

type Kayit = Record<string, unknown>;
const satir = (kimlik: string, no: number, kayit: Kayit, surum = 1) => ({ kimlik, no, kayit, surum });
function kartlar(...satirlar: ReturnType<typeof satir>[]): Record<string, Yanit> {
  return { 'GET /malzeme-katalogu-kartlari': () => json(200, { ...ORNEK_KARTLAR, satirlar, toplam: satirlar.length }) };
}
const kaydetYanit = (): Record<string, Yanit> => ({
  'POST /malzeme-katalogu-kartlari/mornek1/kaydet': () => json(200, { id: 'mornek1', stok_kodu: 'HM-MET-C45-0001', surum: 5 }),
});

const onayda = (kimlik: string, kod: string, by: number) => ({ ...ornekKayit(kimlik, kod, 'Bekleyen çubuk'), onay: { durum: 'onayda', talep: { by, byAd: 'Biri', t: 1 } } });
const pasif = (kimlik: string, kod: string) => ({ ...ornekKayit(kimlik, kod, 'Pasif çubuk'), onay: { durum: 'pasif', pasif: { by: 3, byAd: 'Biri', t: 1 } } });
const talepli = (kimlik: string, kod: string, by: number) => ({
  ...ornekKayit(kimlik, kod, 'Talepli çubuk'),
  talep: { id: 't1', durum: 'beklemede', yeni: ornekKayit(kimlik, kod, 'Yeni ad'), farklar: [{ f: 'Ad', a: 'Talepli çubuk', b: 'Yeni ad' }], by, byAd: 'Talep eden', t: 1 },
});

async function kartiAc(kod: string) {
  fireEvent.click(await screen.findByText(kod));
  return screen.findByRole('dialog');
}

let indirilen: Blob[] = [];
beforeEach(() => {
  indirilen = [];
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn((b: Blob) => { indirilen.push(b); return 'blob:deneme'; }),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('M2 Katalog: liste ve arama', () => {
  test('kartlar listelenir, iptal kart listede yoktur; sayaç kart sayısını yazar', async () => {
    kur(YONETICI);
    yeniEkranAc(KOK);
    expect(await screen.findByText('HM-MET-C45-0001')).toBeTruthy();
    expect(screen.getByText('SF-GEN-00001')).toBeTruthy();
    expect(screen.getAllByText('2 kart').length).toBeGreaterThan(0);
  });

  test('eski düzen: katlanır süzgeç kutusu, üst baştaki birim düğmesi listeyi çevirir; liste 50 satırlık sayfalarla (465/3)', async () => {
    kur(YONETICI, kartlar(...Array.from({ length: 55 }, (_, i) => satir(`m${String(i)}`, i + 1, ornekKayit(`m${String(i)}`, `HM-T-${String(i)}`, `Çubuk ${String(i)}`)))));
    yeniEkranAc(KOK);
    expect(await screen.findAllByText(/^HM-T-\d+$/)).toHaveLength(50);
    const kutu = screen.getByText('Süzgeçler').closest('details') as HTMLDetailsElement;
    expect(kutu.open).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'Malzemeler ve Hizmetler' })).toBeTruthy();
    const imp = screen.getByRole('button', { name: 'in, lb' });
    fireEvent.click(imp);
    expect(imp.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByText(/ lb$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'mm, kg' }));
  });

  test('arama kod, ad ve tedarikçide arar; eşleşme yoksa ileti çıkar', async () => {
    kur(YONETICI);
    yeniEkranAc(KOK);
    await screen.findByText('HM-MET-C45-0001');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Katalogda ara' }), { target: { value: 'sarf' } });
    expect(screen.queryByText('HM-MET-C45-0001')).toBeNull();
    expect(screen.getByText('SF-GEN-00001')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Katalogda ara' }), { target: { value: 'yok-boyle-bir-sey' } });
    expect(screen.getByText('Arama ve süzgeçlerle eşleşen kart yok.')).toBeTruthy();
  });

  // Bölüm geçişi kabuğun şeridindedir (553 1 a); "Yeni kart" maddesinin görünürlüğü şeritte (malzemeler.yaz), burada adresi sınanır.
  test('yazan "Yeni kart" adresinde sihirbazı açar; okuyan açamaz (reddedilen)', async () => {
    kur(YAZAN);
    yeniEkranAc(`${KOK}/yeni`);
    expect(await screen.findByRole('heading', { name: 'Malzemeler ve Hizmetler' })).toBeTruthy();
    expect(screen.queryByText('Bu bölümü görme yetkin yok.')).toBeNull();
    cleanup();
    kur(OKUYAN);
    yeniEkranAc(`${KOK}/yeni`);
    expect(await screen.findByText('Bu bölümü görme yetkin yok.')).toBeTruthy();
  });

  test('boş katalog "Katalog boş." der; yazana yeni malzeme düğmesi', async () => {
    kur(YAZAN, kartlar());
    yeniEkranAc(KOK);
    expect(await screen.findByText('Katalog boş.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeni malzeme' })).toBeTruthy();
  });

  test('CSV ve JSON listede görünen kartları prototipin başlıklarıyla indirir', async () => {
    kur(YONETICI);
    yeniEkranAc(KOK);
    await screen.findByText('HM-MET-C45-0001');
    fireEvent.click(screen.getByRole('button', { name: 'CSV dışa aktar' }));
    const csv = await metni(indirilen[0]!);
    expect(csv.split('\r\n')[0]).toMatch(/^﻿?Tür;Kod;Ad;Aile;Sınıf;Kalite;Standart/);
    expect(csv).toContain('HM-MET-C45-0001');
    expect(csv).not.toMatch(/Fiyat;|Para birimi/);
    fireEvent.click(screen.getByRole('button', { name: 'JSON dışa aktar' }));
    // Hammadde `kod`, öteki türler `stok_kodu` taşır (prototipin JSON biçimi).
    const j = JSON.parse(await metni(indirilen[1]!)) as { kod?: string; stok_kodu?: string; onay_durumu: string }[];
    expect(j.map((x) => x.kod ?? x.stok_kodu).sort()).toEqual(['HM-MET-C45-0001', 'SF-GEN-00001']);
    expect(j.every((x) => typeof x.onay_durumu === 'string')).toBe(true);
  });
  test('sunucudan eksik alanla gelen hammadde kartı (opts, dims yok) tamamlanır: CSV iner, pencere açılır', async () => {
    const eksik = ornekKayit('m9', 'HM-EKSIK-1', 'Eksik alanlı çubuk');
    delete eksik['opts']; delete eksik['dims']; delete eksik['ov'];
    kur(YONETICI, kartlar(satir('m9', 1, eksik)));
    yeniEkranAc(KOK);
    await screen.findByText('HM-EKSIK-1');
    fireEvent.click(screen.getByRole('button', { name: 'CSV dışa aktar' }));
    expect(await metni(indirilen[0]!)).toContain('HM-EKSIK-1');
    expect(await kartiAc('HM-EKSIK-1')).toBeTruthy();
  });
});

describe('M2 Katalog: kart penceresi ve yetki', () => {
  test('satıra dokununca pencere açılır ve adres ?kart= taşır; yönetici bütün eylemleri görür (izinli)', async () => {
    kur(YONETICI);
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-MET-C45-0001'));
    for (const ad of ['Düzenle', 'Kopyasını oluştur', 'Şablon yap', 'Etiket', "Etiket Merkezi'nde bas", 'Sil', 'Saha görünümü']) {
      expect(p.getByRole('button', { name: ad })).toBeTruthy();
    }
  });

  test('derin bağlantı: ?kart= ile açılan adres kartı pencerede açar', async () => {
    kur(YONETICI);
    yeniEkranAc(`${KOK}?kart=mornek1`);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  test('okuyan yalnız görür: düzenleme, kopya, şablon, silme ve onay düğmesi yok (reddedilen)', async () => {
    kur(OKUYAN, kartlar(satir('m1', 1, onayda('m1', 'HM-A', 3))));
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-A'));
    for (const ad of ['Düzenle', 'Kopyasını oluştur', 'Şablon yap', 'Sil', 'Onayla', "Etiket Merkezi'nde bas"]) expect(p.queryByRole('button', { name: ad })).toBeNull();
    expect(p.getByRole('button', { name: 'Etiket' })).toBeTruthy();
  });

  test('onay yetkisi olmayan yazan onay bekleyen kartta ileti görür; Sil görünmez', async () => {
    kur(YAZAN, kartlar(satir('m1', 1, onayda('m1', 'HM-A', 3))));
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-A'));
    expect(p.getByText('Onay ana veri sorumlusu ya da yöneticidedir.')).toBeTruthy();
    expect(p.queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(p.queryByRole('button', { name: 'Sil' })).toBeNull();
  });

  test('sorumlu onaylar: kart aktif durumla ve özetle kaydet ucuna gider', async () => {
    const istekler = kur(SORUMLU, {
      ...kartlar(satir('m1', 1, onayda('m1', 'HM-A', 3))),
      'POST /malzeme-katalogu-kartlari/m1/kaydet': () => json(200, { id: 'm1', stok_kodu: 'HM-A', surum: 2 }),
    });
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-A'));
    fireEvent.click(p.getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-katalogu-kartlari/m1/kaydet')).toBe(true));
    const g = istekler.find((i) => i.yol === '/malzeme-katalogu-kartlari/m1/kaydet')!.govde as { kayit: Kayit; ozet: Kayit; surum: number };
    expect((g.kayit['onay'] as { durum: string }).durum).toBe('aktif');
    expect(g.ozet['onay_durumu']).toBe('aktif');
    expect(g.surum).toBe(1);
  });

  test('red nedeni zorunludur; nedenle reddedilen kart taslağa döner', async () => {
    const istekler = kur(SORUMLU, {
      ...kartlar(satir('m1', 1, onayda('m1', 'HM-A', 3))),
      'POST /malzeme-katalogu-kartlari/m1/kaydet': () => json(200, { id: 'm1', stok_kodu: 'HM-A', surum: 2 }),
    });
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-A'));
    fireEvent.click(p.getByRole('button', { name: 'Reddet' }));
    fireEvent.click(p.getAllByRole('button', { name: 'Reddet' }).at(-1)!);
    expect(p.getByText('Red nedenini yaz.')).toBeTruthy();
    fireEvent.change(p.getByLabelText(/Red nedeni/), { target: { value: 'ölçü yanlış' } });
    fireEvent.click(p.getAllByRole('button', { name: 'Reddet' }).at(-1)!);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-katalogu-kartlari/m1/kaydet')).toBe(true));
    const g = istekler.find((i) => i.yol === '/malzeme-katalogu-kartlari/m1/kaydet')!.govde as { kayit: { onay: { durum: string; red: { neden: string } } } };
    expect(g.kayit.onay.durum).toBe('taslak');
    expect(g.kayit.onay.red.neden).toBe('ölçü yanlış');
  });

  test('dört göz: kartı gönderen sorumlu kendi kartını onaylayamaz', async () => {
    kur(SORUMLU, {
      ...kartlar(satir('m1', 1, onayda('m1', 'HM-A', SORUMLU.id))),
      'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, dortGoz: true, rol: 'sorumlu' }),
    });
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-A'));
    expect(p.getByText('Kendi gönderdiğin kartı onaylayamazsın.')).toBeTruthy();
    expect(p.queryByRole('button', { name: 'Onayla' })).toBeNull();
  });

  test('291: pasif kart onay yetkisi olmayana Düzenle göstermez; onay yetkilisine gösterir', async () => {
    // Pasif kart listede varsayılan olarak gizlidir (prototip); pencere derin bağlantıyla açılır.
    kur(YAZAN, kartlar(satir('m1', 1, pasif('m1', 'HM-P'))));
    yeniEkranAc(`${KOK}?kart=m1`);
    let p = within(await screen.findByRole('dialog'));
    expect(p.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(p.getByRole('button', { name: 'Kopyasını oluştur' })).toBeTruthy();
    cleanup();
    kur(YONETICI, kartlar(satir('m1', 1, pasif('m1', 'HM-P'))));
    yeniEkranAc(`${KOK}?kart=m1`);
    p = within(await screen.findByRole('dialog'));
    expect(p.getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    expect(p.getByRole('button', { name: 'Yeniden aktifleştir' })).toBeTruthy();
  });

  test('290: "Talebi geri çek" talebin sahibine ve onay yetkilisine görünür, başka yazara görünmez', async () => {
    const kart = kartlar(satir('m1', 1, talepli('m1', 'HM-T', YAZAN.id)));
    kur(YAZAN, kart);
    yeniEkranAc(KOK);
    expect(within(await kartiAc('HM-T')).getByRole('button', { name: 'Talebi geri çek' })).toBeTruthy();
    cleanup();
    kur({ ...YAZAN, id: 99 }, kart);
    yeniEkranAc(KOK);
    expect(within(await kartiAc('HM-T')).queryByRole('button', { name: 'Talebi geri çek' })).toBeNull();
    cleanup();
    kur(SORUMLU, kart);
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-T'));
    expect(p.getByRole('button', { name: 'Talebi geri çek' })).toBeTruthy();
    expect(p.getByRole('button', { name: 'Değişikliği onayla' })).toBeTruthy();
  });

  test('Düzenle, Kopya ve Şablon yap sihirbazı adresle açar', async () => {
    kur(YONETICI);
    yeniEkranAc(KOK);
    fireEvent.click(within(await kartiAc('HM-MET-C45-0001')).getByRole('button', { name: 'Şablon yap' }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/malzemeler/yeni'); });
  });

  test('Sil onay sorar; onaylanınca iptal ucuna gider ve pencere kapanır', async () => {
    const istekler = kur(YONETICI, { 'POST /malzeme-katalogu-kartlari/mornek1/iptal': () => json(200, {}) });
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HM-MET-C45-0001'));
    fireEvent.click(p.getByRole('button', { name: 'Sil' }));
    const soru = await screen.findByRole('dialog', { name: /silinsin mi/ });
    fireEvent.click(within(soru).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-katalogu-kartlari/mornek1/iptal')).toBe(true));
  });

  test('sunucunun ret iletisi olduğu gibi gösterilir', async () => {
    kur(SORUMLU, {
      ...kartlar(satir('m1', 1, onayda('m1', 'HM-A', 3))),
      'POST /malzeme-katalogu-kartlari/m1/kaydet': () => json(409, { kod: 'CAKISMA', mesaj: 'Kart arada değişti.' }),
    });
    yeniEkranAc(KOK);
    fireEvent.click(within(await kartiAc('HM-A')).getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('Kart arada değişti.')).toBeTruthy();
  });
});

describe('M2 Katalog: etiket, saha ve seçim', () => {
  test('hizmet kartına etiket basılmaz: kart penceresinde ve saha görünümünde Etiket düğmesi yok', async () => {
    kur(YONETICI, kartlar(satir('h1', 1, ornekKayit('h1', 'HZ-ISL-00001', 'Örnek hizmet', 'hizmet'))));
    yeniEkranAc(KOK);
    const p = within(await kartiAc('HZ-ISL-00001'));
    expect(p.queryByRole('button', { name: 'Etiket' })).toBeNull();
    expect(p.queryByRole('button', { name: "Etiket Merkezi'nde bas" })).toBeNull();
    fireEvent.click(p.getByRole('button', { name: 'Saha görünümü' }));
    const s = within(await screen.findByRole('dialog'));
    expect(s.getByRole('button', { name: 'Tam föy' })).toBeTruthy();
    expect(s.queryByRole('button', { name: 'Etiket' })).toBeNull();
  });

  test('yalnız hizmet seçilip etiket istenince ileti çıkar, pencere açılmaz', async () => {
    kur(YONETICI, kartlar(satir('h1', 1, ornekKayit('h1', 'HZ-ISL-00001', 'Örnek hizmet', 'hizmet'))));
    yeniEkranAc(KOK);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'HZ-ISL-00001 seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Etiket yazdır' }));
    expect(await screen.findByText('Hizmet kartına etiket basılmaz.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('etiket penceresi seçilen boyutta önizler; tek kart SVG olarak iner', async () => {
    kur(YONETICI);
    yeniEkranAc(KOK);
    fireEvent.click(within(await kartiAc('HM-MET-C45-0001')).getByRole('button', { name: 'Etiket' }));
    const p = within(await screen.findByRole('dialog', { name: 'Etiket' }));
    expect(p.getByRole('img', { name: 'HM-MET-C45-0001 etiketi' })).toBeTruthy();
    fireEvent.click(p.getByRole('radio', { name: '70 × 37 mm' }));
    expect(p.getByRole('radio', { name: '70 × 37 mm' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(p.getByRole('button', { name: 'Etiketi indir (.svg)' }));
    expect(await metni(indirilen[0]!)).toContain('<svg');
  });

  test("Etiket Merkezi'nde bas yalnız merkezi açabilene; tıklanınca kartın no'suyla merkeze gider", async () => {
    kur(SORUMLU);
    yeniEkranAc(KOK);
    expect(within(await kartiAc('HM-MET-C45-0001')).queryByRole('button', { name: "Etiket Merkezi'nde bas" })).toBeNull();
    cleanup();
    kur(YONETICI);
    yeniEkranAc(KOK);
    fireEvent.click(within(await kartiAc('HM-MET-C45-0001')).getByRole('button', { name: "Etiket Merkezi'nde bas" }));
    expect(await screen.findByText('Başka sayfa')).toBeTruthy();
  });

  test('seçim: 2-4 kartta karşılaştırma açılır; toplu onay yalnız onaylanabilir kart sayısını yazar', async () => {
    kur(SORUMLU, kartlar(
      satir('m1', 1, onayda('m1', 'HM-A', 3)), satir('m2', 2, ornekKayit('m2', 'HM-B', 'Aktif çubuk')),
    ));
    yeniEkranAc(KOK);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'HM-A seç' }));
    expect(screen.getByText('1 kayıt seçili')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Karşılaştır' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'HM-B seç' }));
    expect(screen.getByRole('button', { name: 'Seçilenleri onayla (1)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Karşılaştır' }));
    expect(await screen.findByRole('dialog', { name: 'Karşılaştırma' })).toBeTruthy();
  });

  test('QR okut: kodla aranan kart saha görünümünde açılır; eşleşmeyen kod ileti verir', async () => {
    kur(YONETICI);
    yeniEkranAc(KOK);
    await screen.findByText('HM-MET-C45-0001');
    fireEvent.click(screen.getByRole('button', { name: 'QR okut' }));
    const qr = within(await screen.findByRole('dialog', { name: 'QR okut' }));
    fireEvent.change(qr.getByLabelText('Kod'), { target: { value: 'YOK-000' } });
    fireEvent.click(qr.getByRole('button', { name: 'Bul' }));
    expect(await qr.findByText(/Bu QR bir kartla eşleşmedi/)).toBeTruthy();
    fireEvent.change(qr.getByLabelText('Kod'), { target: { value: 'HM-MET-C45-0001' } });
    fireEvent.click(qr.getByRole('button', { name: 'Bul' }));
    expect(await screen.findByRole('button', { name: 'Tam föy' })).toBeTruthy();
  });
});

describe('M2 Katalog: kayıt yanıtı', () => {
  test('kaydet yanıtı örnek kimlikle eşleşir (test ortamı)', () => {
    expect(Object.keys(kaydetYanit())).toEqual(['POST /malzeme-katalogu-kartlari/mornek1/kaydet']);
  });
});

describe('688: çizim merkezinin resmi katalogda', () => {
  const ym = (kimlik: string, kod: string) => ({
    ...ornekKayit(kimlik, kod, 'Deneme braket', 'yarimamul'), fam: null, cls: null, grade: null, form: null, dims: {},
    g: { ad: 'Deneme braket', tip: 'Talaşlı işlenmiş parça', resim: 'TR-1', rev: 'A' },
  });

  test('liste küçük resmi yalnız görünen yarı mamul ve mamul kartları için ister; resimli satırda küçük resim, hammaddede simge', async () => {
    resimIstekleri.length = 0;
    kur(OKUYAN, kartlar(satir('mym', 21, ym('mym', 'YM-DNM-00021')), satir('mhm', 22, ornekKayit('mhm', 'HM-DNM-00022', 'Çubuk'))));
    yeniEkranAc(KOK);
    await screen.findByText('YM-DNM-00021');
    expect(resimIstekleri.at(-1)).toEqual([21]);
    expect(screen.getAllByTestId('kucuk-resim').map((e) => [e.textContent, e.dataset['uyum']])).toEqual([['YM-DNM-00021 Deneme braket', 'false']]);
  });

  test('kart penceresinde panel yarı mamulde kart no ile açılır (okuyan da görür, yazmayı panel denetler); hammadde kartında yok', async () => {
    kur(OKUYAN, kartlar(satir('mym', 21, ym('mym', 'YM-DNM-00021')), satir('mhm', 22, ornekKayit('mhm', 'HM-DNM-00022', 'Çubuk'))));
    yeniEkranAc(KOK);
    const pencere = await kartiAc('YM-DNM-00021');
    expect(within(pencere).getByTestId('resim-paneli').textContent).toBe('21');
    cleanup();
    vi.unstubAllGlobals();
    kur(OKUYAN, kartlar(satir('mym', 21, ym('mym', 'YM-DNM-00021')), satir('mhm', 22, ornekKayit('mhm', 'HM-DNM-00022', 'Çubuk'))));
    yeniEkranAc(KOK);
    const ikinci = await kartiAc('HM-DNM-00022');
    expect(within(ikinci).queryByTestId('resim-paneli')).toBeNull();
  });
});
