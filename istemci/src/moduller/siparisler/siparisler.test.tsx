import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ESKI_SURUM_NEDENI, type HataGovdesi } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { FirmaSecimCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { SiparisCarpaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { Proje, SiparisProjeleriCevabi } from '#paylasilan/sozlesme/projeler.ts';
import type { SiparisAcilisiCevabi } from '#paylasilan/sozlesme/siparis-acilisi.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  AdetDenemesiCevabi, AtolyeTaslaklariCevabi, BirimSecenekleriCevabi, MalzemeSecenekleriCevabi, PlanTaslaklariCevabi, Siparis, SiparisAyrintisi, SiparisListesiCevabi, SiparisDonusumCevabi, Teklif, TeklifAyrintiCevabi, TeklifAyrintisi,
  TeklifListesiCevabi, TerminDenemesiCevabi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';
import { ESKI_SURUM_ILETISI } from './yazma.ts';

const KOK: Islem[] = ['sayfa.siparisler', 'siparisler.oku'];
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: KOK };
const YAZAR: Kullanici = { id: 3, ad: 'Deneme Yazar', islemler: [...KOK, 'siparisler.yaz'] };
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: [...KOK, 'siparisler.yaz', 'siparisler.onayla', 'siparisler.fiyat-oku', 'finans.maliyet-oku'] };
// 180: fiyatı yalnız fiyat-oku olan görür ve girer; yetkisiz okuyana sunucu fiyat alanlarını boş döner.
const FIYAT_OKUYUCU: Kullanici = { ...OKUYUCU, islemler: [...KOK, 'siparisler.fiyat-oku'] };
const FIYATCI: Kullanici = { ...YAZAR, islemler: [...YAZAR.islemler, 'siparisler.fiyat-oku'] };

const SIPARIS_TASLAK = {
  id: 5, no: 'SS-2026-0005', durum: 'taslak', firmaId: 7, firmaAd: 'Deneme Musteri A', musteriSiparisNo: 'DM-100',
  siparisTarihi: '2026-10-01', termin: '2026-10-30', paraBirimi: 'TRY', kdvOrani: '20.00', odemeKosulu: '30 gün vadeli', aciklama: null, cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
  araToplam: '1250.00', kdvTutari: '250.00', genelToplam: '1500.00', iptalNedeni: null,
  olusturma: '2026-10-01T09:00:00+03:00', guncelleme: null, onayZamani: null, surum: 2,
} satisfies Siparis;
const SIPARIS_ONAYLI = { ...SIPARIS_TASLAK, id: 6, no: 'SS-2026-0006', durum: 'onayli', musteriSiparisNo: null, firmaAd: 'Deneme Musteri B', firmaId: 8, onayZamani: '2026-10-02T10:00:00+03:00' } satisfies Siparis;
const SIPARIS_LISTESI = { satirlar: [SIPARIS_TASLAK, SIPARIS_ONAYLI], toplam: 2, sayfa: 1, sayfaBoyu: 50 } satisfies SiparisListesiCevabi;
const SATIR = {
  id: 50, sira: 1, malzemeNo: 31, malzemeKodu: 'DNM-001', malzemeAdi: 'Deneme Braket', aciklamalar: ['Deneme aciklama 1', 'Deneme aciklama 2'], birim: 'adet', miktar: '100', birimFiyat: '12.5000',
  tutar: '1250.00', termin: null, aciklama: null, partiler: [], emreBagli: false,
};
const AYRINTI_TASLAK = { ...SIPARIS_TASLAK, satirlar: [SATIR] } satisfies SiparisAyrintisi;
const AYRINTI_ONAYLI = { ...AYRINTI_TASLAK, durum: 'onayli', onayZamani: '2026-10-02T10:00:00+03:00', surum: 3 } satisfies SiparisAyrintisi;

const TEKLIF_SATIR = { id: 11, sira: 1, malzemeNo: null, malzemeKodu: null, malzemeAdi: null, aciklamalar: [] as string[], tanim: 'Deneme Mil 20mm', birim: null, miktar: '40', yerlilikOrani: null };
const TEKLIF = {
  id: 21, no: 'TK-2026-0021', durum: 'verildi', firmaId: 7, firmaAd: 'Deneme Musteri A', baslik: 'Deneme braket ihtiyacı', paraBirimi: 'TRY',
  istenenTarih: '2026-11-15', aciklama: 'Deneme açıklaması', not: null, kabulSurumu: null, siparisId: null, sonSurumNo: 1,
  olusturma: '2026-10-01T09:00:00+03:00', guncelleme: null, surum: 4,
} satisfies Teklif;
const SURUM_1 = {
  surumNo: 1, iskontoOrani: '10.00', teslimGun: 14, terminTarihi: null, odemeKosulu: '30 gün', gecerlilik: '2099-01-01', aciklama: 'Kaplama dahil',
  olusturma: '2026-10-02T09:00:00+03:00',
  fiyatlar: [{ satirId: 11, birimFiyat: '10.0000', iskontoluFiyat: '9.0000', tutar: '360.00' }], toplam: '360.00',
  iskontoOnaylayan: null, iskontoOnayAni: null,
};
const TEKLIF_VERILDI = { ...TEKLIF, satirlar: [TEKLIF_SATIR], surumler: [SURUM_1] } satisfies TeklifAyrintisi;
const TEKLIF_YENI = { ...TEKLIF, durum: 'yeni', sonSurumNo: null, satirlar: [TEKLIF_SATIR], surumler: [] } satisfies TeklifAyrintisi;
const TEKLIF_KABUL = { ...TEKLIF_VERILDI, durum: 'kabul', kabulSurumu: 1, surum: 5 } satisfies TeklifAyrintisi;
// Sunucunun fiyat yetkisi olmayana döndüğü biçim.
const AYRINTI_FIYATSIZ = { ...AYRINTI_TASLAK, araToplam: null, kdvTutari: null, genelToplam: null, satirlar: [{ ...SATIR, birimFiyat: null, tutar: null }] } satisfies SiparisAyrintisi;
const TEKLIF_FIYATSIZ = {
  ...TEKLIF_VERILDI, surumler: [{ ...SURUM_1, iskontoOrani: null, toplam: null, fiyatlar: [{ satirId: 11, birimFiyat: null, iskontoluFiyat: null, tutar: null }] }],
} satisfies TeklifAyrintiCevabi;
const TEKLIF_LISTESI = { satirlar: [TEKLIF], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies TeklifListesiCevabi;

const FIRMALAR = {
  firmalar: [
    { id: 7, kod: 'M-7', ad: 'Deneme Musteri A', tur: 'musteri', paraBirimi: 'TRY', vadeGunu: 30 },
    { id: 8, kod: null, ad: 'Deneme Musteri B', tur: 'ikisi', paraBirimi: 'TRY', vadeGunu: null },
  ],
} satisfies FirmaSecimCevabi;
// Satılan türlerin süzgeci sunucudadır; seçici gelen satırları olduğu gibi gösterir.
const MALZEMELER = {
  satirlar: [{ no: 31, kod: 'DNM-001', ad: 'Deneme Braket', tur: 'mamul', birim: 'adet', aciklamalar: ['Deneme aciklama 1'], yerlilikOrani: '62.50' }, { no: 32, kod: 'DNM-002', ad: 'Deneme Mil', tur: 'mamul', birim: 'adet', aciklamalar: [], yerlilikOrani: null }],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
} satisfies MalzemeSecenekleriCevabi;

// 3400-2: Logo karşılığı olan birimler listelenir; karşılığı olmayan (mt) gösterilmez.
const BIRIMLER = { birimler: [{ kod: 'adet', logo: 'ADET' }, { kod: 'kg', logo: 'KG' }, { kod: 'mt', logo: null }] } satisfies BirimSecenekleriCevabi;

// 3272: onayda açılacak proje ve emirler (Üretim Emirleri'nin cevabı); bir kalem rotalı, biri rota bekler, biri üretilmez.
const ACILIS_SATIRI = {
  kalemId: 50, kalemSira: 1, partiId: null, malzemeNo: 31, malzemeKodu: 'DNM-001', malzemeAdi: 'Deneme Braket', emirTuru: 'seri', adet: 100,
  teslim: '2026-10-30', rota: { ad: 'Standart', harf: 'B' }, emir: null, atlama: null,
} satisfies SiparisAcilisiCevabi['satirlar'][number];
const ACILIS = {
  acik: true, proje: { id: null, kod: 'SS_2026_0005', ad: 'Deneme Musteri A SS-2026-0005', bitis: '2026-10-30' },
  satirlar: [
    ACILIS_SATIRI,
    { ...ACILIS_SATIRI, kalemId: 51, kalemSira: 2, malzemeNo: 32, malzemeKodu: 'DNM-002', malzemeAdi: 'Deneme Mil', adet: 5, rota: null },
    { ...ACILIS_SATIRI, kalemId: 52, kalemSira: 3, malzemeNo: 33, malzemeKodu: 'DNM-003', malzemeAdi: 'Deneme Civata', adet: 8, rota: null, atlama: 'uretilmez' },
  ],
  eksikIslemler: [],
  geriAlmaUyarilari: [],
} satisfies SiparisAcilisiCevabi;

// 195 a: elle çarpan Plan uçlarında; kayıt yoksa geçerli null.
const CARPAN_YOK = { siparisId: 5, gecerli: null, gecmis: [] } satisfies SiparisCarpaniCevabi;
const CARPAN_KAYDI = { carpan: 1.5, gerekce: 'Deneme gerekce', kisiId: 4, kisiAdi: 'Deneme Planlamaci', zaman: '2026-10-03T09:00:00+03:00' };
const CARPAN_VAR = {
  siparisId: 5, gecerli: CARPAN_KAYDI, gecmis: [CARPAN_KAYDI, { ...CARPAN_KAYDI, carpan: 1.2, gerekce: 'Ilk deneme', zaman: '2026-10-02T09:00:00+03:00' }],
} satisfies SiparisCarpaniCevabi;
const PLANLAMACI: Kullanici = { id: 4, ad: 'Deneme Planlamaci', islemler: [...KOK, 'plan.yaz', 'siparisler.termin-onayla', 'finans.maliyet-oku'] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const hata = (durum: number, govde: HataGovdesi) => json(durum, govde);

interface Istek { yontem: string; yol: string; govde: unknown; baslik: Record<string, string> }
type Ozel = (yontem: string, yol: string, govde: unknown) => Response | undefined;

function sunucuKur(kullanici: Kullanici, ozel: Ozel = () => undefined) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined;
    istekler.push({ yontem, yol, govde, baslik: (secenek?.headers ?? {}) as Record<string, string> });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    const oz = ozel(yontem, yol, govde);
    if (oz) return oz;
    if (yontem === 'GET') {
      if (yol.startsWith('/siparisler/teklifler?')) return json(200, TEKLIF_LISTESI);
      if (yol === '/siparisler/teklifler/21') return json(200, TEKLIF_VERILDI);
      if (yol.startsWith('/siparisler?')) return json(200, SIPARIS_LISTESI);
      if (yol === '/siparisler/5') return json(200, AYRINTI_TASLAK);
      if (yol === '/siparisler/6') return json(200, AYRINTI_ONAYLI);
      if (yol.startsWith('/musteri-tedarikci/firmalar/secim')) return json(200, FIRMALAR);
      if (yol.startsWith('/siparisler/malzeme-secenekleri')) return json(200, MALZEMELER);
      if (yol === '/siparisler/birim-secenekleri') return json(200, BIRIMLER);
      if (/^\/plan\/siparisler\/\d+\/carpan$/.test(yol)) return json(200, CARPAN_YOK);
      if (yol === '/uretim-emirleri/siparis-acilisi/5') return json(200, ACILIS);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
}

// 3400-1: müşteri kutusuna yazılır, açılan listeden seçilir.
async function musteriSec(ad = 'Deneme Musteri A') {
  const kutu = await screen.findByRole('combobox', { name: /^Müşteri/ });
  fireEvent.focus(kutu);
  fireEvent.change(kutu, { target: { value: 'Deneme' } });
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(ad) }));
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const oturumCozuldu = async (istekler: Istek[]) => {
  await waitFor(() => expect(istekler.map((i) => i.yol)).toContain('/oturum'));
  await new Promise((coz) => setTimeout(coz, 20));
};
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Satış siparişleri listesi', () => {
  it('sipariş no, firma, termin, tutar ve durum görünür; açık siparişte kalan gün yazılır', async () => {
    const istekler = sunucuKur(FIYAT_OKUYUCU);
    ac('/siparisler');
    await screen.findByText('SS-2026-0005');
    const satir = within(screen.getAllByRole('row').find((s) => s.textContent?.includes('SS-2026-0005'))!);
    expect(satir.getByText('Müşteri no: DM-100')).toBeTruthy();
    expect(satir.getByText('Deneme Musteri A')).toBeTruthy();
    expect(satir.getByText('30.10.2026')).toBeTruthy();
    expect(satir.getByText('1.500,00 TRY')).toBeTruthy();
    expect(satir.getByText('Taslak')).toBeTruthy();
    expect(satir.getByText(/gün (kaldı|gecikti)|bugün/)).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/siparisler?'))).toBe(true);
  });

  it('fiyat yetkisi olmayan listede tutar sütununu görmez (180)', async () => {
    sunucuKur(OKUYUCU, (yontem, yol) => (yontem === 'GET' && yol.startsWith('/siparisler?')
      ? json(200, { ...SIPARIS_LISTESI, satirlar: SIPARIS_LISTESI.satirlar.map((x) => ({ ...x, araToplam: null, kdvTutari: null, genelToplam: null })) })
      : undefined));
    ac('/siparisler');
    await screen.findByText('SS-2026-0005');
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Tutar/ })).toBeNull());
    expect(screen.getByText('Deneme Musteri A')).toBeTruthy();
  });

  it('durum sekmesi ve arama isteğe süzgeç olarak gider; Tümü durum göndermez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/siparisler');
    await screen.findByText('SS-2026-0005');
    fireEvent.click(screen.getByRole('tab', { name: 'Onaylı' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/siparisler?') && i.yol.includes('durum=onayli'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'dm-1' } });
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('ara=dm-1'))).toBe(true));
    fireEvent.click(screen.getByRole('tab', { name: 'Tümü' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/siparisler?')).at(-1)!.yol).not.toContain('durum='));
  });

  it('firma süzgeci seçilen firmanın kimliğini gönderir (adla eşleme yok)', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/siparisler');
    await screen.findByText('SS-2026-0005');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.change(screen.getByLabelText('Firma'), { target: { value: '7' } });
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/siparisler?') && i.yol.includes('firmaId=7'))).toBe(true));
    expect(istekler.some((i) => i.yol.startsWith('/musteri-tedarikci/firmalar/secim') && i.yol.includes('tur=musteri'))).toBe(true);
  });

  it('Yeni sipariş düğmesi yalnız siparisler.yaz olana görünür', async () => {
    const okuyucu = sunucuKur(OKUYUCU);
    ac('/siparisler');
    await screen.findByText('SS-2026-0005');
    await oturumCozuldu(okuyucu);
    expect(screen.queryByRole('button', { name: 'Yeni sipariş' })).toBeNull();
    cleanup();

    sunucuKur(YAZAR);
    ac('/siparisler');
    expect(await screen.findByRole('button', { name: 'Yeni sipariş' })).toBeTruthy();
  });
});

describe('Satış siparişi ayrıntısı', () => {
  it('kalemler, tutarlar ve taslak uyarısı görünür', async () => {
    sunucuKur(FIYAT_OKUYUCU);
    ac('/siparisler/5');
    await screen.findByText('Deneme Braket');
    expect(screen.getByText('DNM-001')).toBeTruthy();
    expect(screen.getByText('100 adet')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'No' })).toBeTruthy();
    expect(screen.getByText('12,50 TRY')).toBeTruthy();
    expect(screen.getByText('Genel toplam').closest('div')!.textContent).toContain('1.500,00 TRY');
    expect(screen.getByText('Taslak sipariş')).toBeTruthy();
  });

  it('3244 b: kalem termini tarihle ve işaretle görünür; partiler adet ve çeşitle, partisiz kalem Seri', async () => {
    const partili = { ...AYRINTI_TASLAK, satirlar: [
      { ...SATIR, partiler: [{ id: 1, emirTuru: 'fai', adet: '10.000', rotaId: null }, { id: 2, emirTuru: 'seri', adet: '90.000', rotaId: null }] },
      { ...SATIR, id: 12, sira: 2, termin: '2026-11-20' },
    ] } satisfies SiparisAyrintisi;
    sunucuKur(FIYAT_OKUYUCU, (yontem, yol) => (yontem === 'GET' && yol === '/siparisler/5' ? json(200, partili) : undefined));
    ac('/siparisler/5');
    await screen.findByText('10 FAI');
    expect(screen.getByText('90 Seri')).toBeTruthy();
    expect(screen.getByText('Sipariş termini')).toBeTruthy();
    expect(screen.getByText('Elle')).toBeTruthy();
    expect(screen.getByText('Seri')).toBeTruthy();
  });

  it('kalemde kartın adı ve Açıklama 1-3 görünür (2120)', async () => {
    sunucuKur(FIYAT_OKUYUCU);
    ac('/siparisler/5');
    await screen.findByText('Deneme Braket');
    expect(screen.getByText('Deneme aciklama 1 · Deneme aciklama 2')).toBeTruthy();
  });

  it('fiyat yetkisi olmayan kalem ve miktarı görür; fiyat, tutar ve toplamlar gizlenir (180)', async () => {
    const istekler = sunucuKur(OKUYUCU, (yontem, yol) => (yontem === 'GET' && yol === '/siparisler/5' ? json(200, AYRINTI_FIYATSIZ) : undefined));
    ac('/siparisler/5');
    await screen.findByText('Deneme Braket');
    await oturumCozuldu(istekler);
    expect(screen.getByText('100 adet')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Birim fiyat' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Tutar' })).toBeNull();
    // 3401-1 a: toplam, ceza ve vade yerinde kilitle çizilir; sayı yok, gereken yetki yazılı.
    const kilitler = screen.getAllByLabelText('Yetkiniz yok: Sipariş fiyatını görür');
    expect(kilitler).toHaveLength(4);
    expect(within(screen.getByText('Genel toplam').closest('div')!).getByLabelText('Yetkiniz yok: Sipariş fiyatını görür')).toBeTruthy();
    expect(screen.getByText(/Birim fiyat ve tutar sütunları yetkinizde değil/)).toBeTruthy();
  });

  it('fiyatı olmayan kalem varsa fiyatı gören taslakta onay öncesi uyarı görür (201 a)', async () => {
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/siparisler/5' ? json(200, AYRINTI_FIYATSIZ) : undefined));
    ac('/siparisler/5');
    expect(await screen.findByText('1 kalemin fiyatı yok')).toBeTruthy();
    expect(screen.getByText('Genel toplam').closest('div')!.textContent).toContain('—');
  });

  it('okuma yetkisi tek başına hiçbir işlem düğmesi göstermez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/siparisler/5');
    await screen.findByText('Deneme Braket');
    await oturumCozuldu(istekler);
    for (const ad of ['Düzenle', 'Onayla', 'Kapat', 'İptal et']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
  });

  it('yazan taslağı düzenler ama onay düğmesi görmez', async () => {
    sunucuKur(YAZAR);
    ac('/siparisler/5');
    expect(await screen.findByRole('button', { name: 'Düzenle' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  });

  it('onay penceresi sürümü gönderir; cevap ekrana işlenir ve taslak düğmeleri gider', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/5/onayla' ? json(200, AYRINTI_ONAYLI) : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi onayla' });
    fireEvent.click(await within(pencere).findByRole('button', { name: 'Onayla, proje ve 2 emri aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/5/onayla', govde: { surum: 2 } });
    await screen.findByText('Sipariş onaylandı');
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Kapat' })).toBeTruthy();
  });

  it('sunucunun ret iletisi pencerede gösterilir', async () => {
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/5/onayla'
      ? hata(409, { kod: 'CAKISMA', mesaj: 'Onaylı sipariş onaylanamaz.' })
      : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi onayla' });
    fireEvent.click(await within(pencere).findByRole('button', { name: 'Onayla, proje ve 2 emri aç' }));
    expect((await within(pencere).findByRole('alert')).textContent).toBe('Onaylı sipariş onaylanamaz.');
  });

  it('3296-3 a: onay penceresi partide elle seçilen rotayı ve yürürlükte olmadığı için türün rotasına düşeni söyler', async () => {
    const acilis = { ...ACILIS, satirlar: [
      { ...ACILIS_SATIRI, rota: { ad: 'ORN FAI', harf: 'A', elle: true } },
      { ...ACILIS_SATIRI, kalemId: 51, kalemSira: 2, rota: { ad: 'Standart', harf: 'B', elleDustu: true } },
    ] };
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/uretim-emirleri/siparis-acilisi/5' ? json(200, acilis) : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi onayla' });
    expect(await within(pencere).findByText('ORN FAI · Rev A · elle')).toBeTruthy();
    expect(within(pencere).getByText('Standart · Rev B · seçilen rota yürürlükte değil, türün rotası')).toBeTruthy();
  });

  it('3411 a: türünün yürürlükte rotası olmadığı için Seri rotasıyla açılacak emirler satırda ve özette sayıyla söylenir', async () => {
    const acilis = { ...ACILIS, satirlar: [
      ACILIS_SATIRI,
      { ...ACILIS_SATIRI, kalemId: 51, kalemSira: 2, emirTuru: 'numune' as const, rota: { ad: 'Seri', harf: 'B', seriyeDustu: true } },
    ] };
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/uretim-emirleri/siparis-acilisi/5' ? json(200, acilis) : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi onayla' });
    expect(await within(pencere).findByText('Seri · Rev B · Numune türünün yürürlükte rotası yok')).toBeTruthy();
    expect(within(pencere).getByText('1 emir Seri rotasıyla açılır')).toBeTruthy();
  });

  it('3272: onay penceresi açılacak projeyi, emirleri ve rota bekleyeni gösterir; proje no değişince gövdeye girer', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/5/onayla' ? json(200, AYRINTI_ONAYLI) : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi onayla' });
    const kod = await within(pencere).findByLabelText(/Proje no/);
    expect((kod as HTMLInputElement).value).toBe('SS_2026_0005');
    expect(within(pencere).getByText('1 proje açılır')).toBeTruthy();
    expect(within(pencere).getByText('1 emir dolu')).toBeTruthy();
    expect(within(pencere).getByText('1 emir rota bekliyor')).toBeTruthy();
    expect(within(pencere).getByText('Standart · Rev B')).toBeTruthy();
    expect(within(pencere).getByText('Üretilmez, emir açılmaz')).toBeTruthy();
    expect(within(pencere).getByText(/DNM-002 için yürürlükte rota yok/)).toBeTruthy();
    fireEvent.change(kod, { target: { value: 'ss_ozel.1' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla, proje ve 2 emri aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/5/onayla', govde: { surum: 2, projeKodu: 'SS_OZEL.1' } });
  });

  it('3272: onaylı siparişin "Proje ve emirler" kartı açılmış emirleri, rota bekleyeni ve atlananı gösterir; emir no sondan kısalır', async () => {
    const emirli = {
      ...ACILIS, proje: { id: 9, kod: 'SS_2026_0006', ad: 'Deneme', bitis: null },
      satirlar: [
        { ...ACILIS_SATIRI, emir: { id: 70, no: 'ORN-A-SS_2026_0006-DNM001-26-11-001', durum: 'taslak', rotaBekliyor: false } },
        { ...ACILIS.satirlar[1]!, emir: { id: 71, no: 'ORN-A-SS_2026_0006-DNM002-26-11-002', durum: 'taslak', rotaBekliyor: true } },
        ACILIS.satirlar[2]!,
      ],
    } satisfies SiparisAcilisiCevabi;
    // AYRINTI_ONAYLI taslağın onaylı hâlidir (id 5).
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/uretim-emirleri/siparis-acilisi/5' ? json(200, emirli) : undefined));
    ac('/siparisler/6');
    const tablo = await screen.findByRole('table', { name: 'Siparişin emirleri' });
    expect(within(tablo).getByText('Rota bekliyor')).toBeTruthy();
    expect(within(tablo).getByText('Taslak')).toBeTruthy();
    expect(within(tablo).getByText('Üretilmez, emir açılmaz')).toBeTruthy();
    expect(within(tablo).getByTitle('ORN-A-SS_2026_0006-DNM001-26-11-001').textContent).toBe('…0006-DNM001-26-11-001');
    expect(screen.queryByRole('button', { name: 'Proje ve emirleri aç' })).toBeNull();
  });

  it('3272-1 b: proje ve emir açma yetkisi eksikse pencere eksik yetkiyi söyler ve onay düğmesi pasiftir', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/uretim-emirleri/siparis-acilisi/5'
      ? json(200, { ...ACILIS, eksikIslemler: ['projeler.yaz'] } satisfies SiparisAcilisiCevabi)
      : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi onayla' });
    expect((await within(pencere).findByRole('alert')).textContent).toContain('projeler.yaz');
    const dugme = within(pencere).getByRole('button', { name: 'Onayla, proje ve 2 emri aç' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    fireEvent.click(dugme);
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('iptal nedeni olmadan istek gitmez; nedenle gövdede gider', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/6/iptal'
      ? json(200, { ...AYRINTI_ONAYLI, durum: 'iptal', iptalNedeni: 'Deneme neden' } satisfies SiparisAyrintisi)
      : undefined));
    ac('/siparisler/6');
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi iptal et' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İptal et' }));
    expect((await within(pencere).findByRole('alert')).textContent).toBe('İptal nedeni zorunlu.');
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText(/İptal nedeni/), { target: { value: 'Deneme neden' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]!.govde).toEqual({ surum: 3, neden: 'Deneme neden' });
    await screen.findByText('Sipariş iptal edildi');
  });

  it('onayı geri alma nedensiz gitmez; nedenle gövdede gider, yalnız onaylayana görünür (SIP-19)', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/6/onay-geri-al'
      ? json(200, { ...AYRINTI_ONAYLI, durum: 'taslak', onayZamani: null, surum: 4 } satisfies SiparisAyrintisi)
      : undefined));
    ac('/siparisler/6');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayı geri al' }));
    const pencere = await screen.findByRole('dialog', { name: 'Onayı geri al' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayı geri al' }));
    expect((await within(pencere).findByRole('alert')).textContent).toBe('Onayı geri alma nedeni zorunlu.');
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText(/Geri alma nedeni/), { target: { value: 'Deneme termin' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayı geri al' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/6/onay-geri-al', govde: { surum: 3, neden: 'Deneme termin' } });
    cleanup();
    sunucuKur(YAZAR);
    ac('/siparisler/6');
    await screen.findByText('SS-2026-0005');
    expect(screen.queryByRole('button', { name: 'Onayı geri al' })).toBeNull();
  });

  it('3272-2: talebi ya da tamamlanmış hazırlığı olan emir geri alma ve iptal penceresinde uyarıyla görünür; düğme açık kalır', async () => {
    const uyarili = {
      ...ACILIS, proje: { id: 9, kod: 'SS_2026_0006', ad: 'Deneme', bitis: null },
      geriAlmaUyarilari: [{ emirId: 70, emirNo: 'ORN-A-SS_2026_0006-DNM001-26-11-001', nedenler: ['talep', 'hazirlik'] }],
    } satisfies SiparisAcilisiCevabi;
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/uretim-emirleri/siparis-acilisi/5' ? json(200, uyarili) : undefined));
    ac('/siparisler/6');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayı geri al' }));
    let pencere = await screen.findByRole('dialog', { name: 'Onayı geri al' });
    const geriAl = await within(pencere).findByText(/malzeme talebi var, hazırlık maddesi tamamlanmış/);
    expect(geriAl.closest('[role="status"]')?.textContent).toMatch(/^Bu emirler kalemden çözülür/);
    expect((within(pencere).getByRole('button', { name: 'Onayı geri al' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
    pencere = await screen.findByRole('dialog', { name: 'Siparişi iptal et' });
    expect((await within(pencere).findByText(/satın almada açık kalır/)).closest('[role="status"]')?.textContent).toMatch(/^Bu emirler iptal olur/);
  });

  it('3272-2: yalnız hazırlık nedeninde iptal uyarısı talepten söz etmez', async () => {
    const hazirlik = {
      ...ACILIS, proje: { id: 9, kod: 'SS_2026_0006', ad: 'Deneme', bitis: null },
      geriAlmaUyarilari: [{ emirId: 70, emirNo: 'ORN-A-SS_2026_0006-DNM001-26-11-001', nedenler: ['hazirlik'] }],
    } satisfies SiparisAcilisiCevabi;
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/uretim-emirleri/siparis-acilisi/5' ? json(200, hazirlik) : undefined));
    ac('/siparisler/6');
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi iptal et' });
    const uyari = (await within(pencere).findByText(/hazırlık maddesi tamamlanmış/)).closest('[role="status"]');
    expect(uyari?.textContent).toMatch(/^Bu emirler iptal olur/);
    expect(uyari?.textContent).not.toMatch(/tale[pb]/i);
  });

  it('3272-3: geri alma uyarısı yalnız emirde olanı söyler (yalnız talep, yalnız hazırlık)', async () => {
    const cevap = (nedenler: ('talep' | 'hazirlik')[]) => ({
      ...ACILIS, proje: { id: 9, kod: 'SS_2026_0006', ad: 'Deneme', bitis: null },
      geriAlmaUyarilari: [{ emirId: 70, emirNo: 'ORN-A-SS_2026_0006-DNM001-26-11-001', nedenler }],
    } satisfies SiparisAcilisiCevabi);
    const uyari = async (nedenler: ('talep' | 'hazirlik')[]) => {
      cleanup();
      sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/uretim-emirleri/siparis-acilisi/5' ? json(200, cevap(nedenler)) : undefined));
      ac('/siparisler/6');
      fireEvent.click(await screen.findByRole('button', { name: 'Onayı geri al' }));
      const pencere = await screen.findByRole('dialog', { name: 'Onayı geri al' });
      return (await within(pencere).findByText(/Emir taslak kalır/)).textContent ?? '';
    };
    const talep = await uyari(['talep']);
    expect(talep).toMatch(/; talep emirde durur/);
    expect(talep).not.toMatch(/hazırlık/);
    const hazirlik = await uyari(['hazirlik']);
    expect(hazirlik).toMatch(/; hazırlık emirde durur/);
    expect(hazirlik).not.toMatch(/tale[pb]/i);
    expect(await uyari(['talep', 'hazirlik'])).toMatch(/; talep ve hazırlık emirde durur/);
  });

  it('onayı geri alınmış siparişte emre bağlı kalem işaretlenir ve uyarı görünür', async () => {
    const geriAlinmis = { ...AYRINTI_TASLAK, satirlar: [{ ...SATIR, emreBagli: true }] } satisfies SiparisAyrintisi;
    sunucuKur(YONETICI, (yontem, yol) => (yontem === 'GET' && yol === '/siparisler/5' ? json(200, geriAlinmis) : undefined));
    ac('/siparisler/5');
    expect(await screen.findByText('Onay geri alındı')).toBeTruthy();
    expect(screen.getAllByText('Emre bağlı').length).toBeGreaterThan(0);
  });

  it('onaylı siparişi kapatır', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/6/kapat'
      ? json(200, { ...AYRINTI_ONAYLI, durum: 'kapandi' } satisfies SiparisAyrintisi)
      : undefined));
    ac('/siparisler/6');
    fireEvent.click(await screen.findByRole('button', { name: 'Kapat' }));
    const pencere = await screen.findByRole('dialog', { name: 'Siparişi kapat' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Siparişi kapat' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/6/kapat', govde: { surum: 3 } });
    await screen.findByText('Sipariş kapandı');
  });
});

describe('Sipariş ayrıntısında projeler (176 a)', () => {
  const PROJECI: Kullanici = { ...YONETICI, islemler: [...YONETICI.islemler, 'sayfa.projeler', 'projeler.yaz'] };
  const PROJE = {
    id: 90, kod: 'PRJ.90', ad: 'Deneme proje', durum: 'aktif', firmaId: 7, firmaAd: 'Deneme Musteri A', siparisId: 5,
    baslangic: null, bitis: '2026-10-30', bitisBagli: true, aciklama: null, olusturma: '2026-10-03T09:00:00+03:00', guncelleme: null, surum: 1,
    statu: null, ilerleme: null,
  } satisfies Proje;
  const projeler = (yontem: string, yol: string) => {
    // AYRINTI_ONAYLI taslağın kimliğini (5) taşır; /siparisler/6 onu döndürür.
    if (yontem === 'GET' && yol === '/projeler/siparis/5') return json(200, { projeler: [PROJE] } satisfies SiparisProjeleriCevabi);
    if (yontem === 'POST' && yol === '/projeler/siparisten/5/ac') return json(200, { ...PROJE, id: 91, kod: 'PRJ.91' });
    return undefined;
  };

  it('proje okuma yetkisi olmayana bölüm görünmez ve projeler sorulmaz', async () => {
    const istekler = sunucuKur(YONETICI, projeler);
    ac('/siparisler/6');
    await screen.findByText('Kalemler');
    await oturumCozuldu(istekler);
    expect(screen.queryByText('Projeler')).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/projeler'))).toBe(false);
  });

  it('onaylı siparişin projeleri listelenir; siparişten proje açma firmasız gövdeyle gider', async () => {
    const istekler = sunucuKur(PROJECI, projeler);
    ac('/siparisler/6');
    await screen.findByText('PRJ.90');
    fireEvent.click(screen.getByRole('button', { name: 'Siparişten proje aç' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/^Proje no/), { target: { value: 'prj.91' } });
    fireEvent.change(within(pencere).getByLabelText(/^Ad/), { target: { value: 'Deneme proje 2' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Projeyi aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const istek = yazmalar(istekler)[0]!;
    expect(istek.yol).toBe('/projeler/siparisten/5/ac');
    expect(istek.govde).toEqual({ kod: 'PRJ.91', ad: 'Deneme proje 2', baslangic: null, bitis: '2026-10-30', aciklama: null });
  });

  it('taslak siparişte proje açma düğmesi yoktur', async () => {
    sunucuKur(PROJECI, (yontem, yol) => (yontem === 'GET' && yol === '/projeler/siparis/5' ? json(200, { projeler: [] }) : undefined));
    ac('/siparisler/5');
    await screen.findByText('Proje onaylı siparişten açılır.');
    expect(screen.queryByRole('button', { name: 'Siparişten proje aç' })).toBeNull();
  });
});

// 815 (699/3 a): plana yalnız emrin önceliği girer; çarpan verilmez, eski kayıtlar yalnız geçmiş olarak okunur.
describe('Sipariş ayrıntısında çarpan geçmişi (815)', () => {
  const carpanVar: Ozel = (yontem, yol) => (yontem === 'GET' && yol === '/plan/siparisler/5/carpan' ? json(200, CARPAN_VAR) : undefined);

  it('geçmiş gerekçe ve kişiyle salt okunur görünür; planlamacı da müdür de çarpan veremez, yazma ve bant isteği gitmez', async () => {
    for (const kisi of [PLANLAMACI, YONETICI]) {
      const istekler = sunucuKur(kisi, carpanVar);
      ac('/siparisler/5');
      const kart = (await screen.findByRole('heading', { name: 'Öncelik çarpanı geçmişi' })).closest('section')!;
      expect(await within(kart).findByText('Ilk deneme')).toBeTruthy();
      expect(within(kart).getByText('Deneme gerekce')).toBeTruthy();
      expect(within(kart).getByText('×1,2')).toBeTruthy();
      expect(within(kart).getByText(/yalnız üretim emrinin önceliği girer/)).toBeTruthy();
      await oturumCozuldu(istekler);
      expect(screen.queryByRole('button', { name: 'Çarpan ver' })).toBeNull();
      expect(yazmalar(istekler)).toHaveLength(0);
      expect(istekler.some((i) => i.yol.includes('/bant'))).toBe(false);
      cleanup();
    }
  });

  it('çarpan okuma yetkisi olmayana kart çizilmez, istek gitmez (237 a); fiyat görmek ve plan yazmak tek başına yetmez (3401-1 a)', async () => {
    for (const kisi of [OKUYUCU, FIYAT_OKUYUCU, { ...OKUYUCU, islemler: [...KOK, 'plan.yaz'] } satisfies Kullanici]) {
      const istekler = sunucuKur(kisi);
      ac('/siparisler/5');
      await screen.findByText('Deneme Braket');
      await oturumCozuldu(istekler);
      expect(screen.queryByRole('heading', { name: 'Öncelik çarpanı geçmişi' })).toBeNull();
      expect(istekler.some((i) => i.yol.startsWith('/plan/'))).toBe(false);
      cleanup();
    }
  });

  it('geçmişi olmayan siparişte kart çizilmez', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...KOK, 'siparisler.fiyat-oku', 'finans.maliyet-oku'] });
    ac('/siparisler/5');
    await screen.findByText('Deneme Braket');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/plan/siparisler/5/carpan')).toBe(true));
    expect(screen.queryByRole('heading', { name: 'Öncelik çarpanı geçmişi' })).toBeNull();
  });
});

describe('Yeni satış siparişi', () => {
  it('firma ve kart kimlikle seçilir; gövde tekrar korumalı gider ve ayrıntıya geçilir', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/ekle' ? json(200, AYRINTI_TASLAK) : undefined));
    ac('/siparisler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.change(screen.getByLabelText(/^Müşteri( \*)?$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Termin( \*)?$/), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme kartı seç' }));
    const secici = await screen.findByRole('dialog', { name: 'Malzeme kartı seç' });
    await within(secici).findByText('Deneme Braket');
    fireEvent.click(within(secici).getByText('Deneme Braket'));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '1,5' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 birim fiyat/), { target: { value: '12,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));

    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const istek = yazmalar(istekler)[0]!;
    expect(istek.yol).toBe('/siparisler/ekle');
    expect(istek.govde).toMatchObject({
      firmaId: 7, termin: '2026-12-31', paraBirimi: 'TRY', kdvOrani: '20',
      satirlar: [{ malzemeNo: 31, miktar: '1.5', birimFiyat: '12.5', termin: null, aciklama: null }],
    });
    expect(Object.keys(istek.baslik).map((k) => k.toLowerCase())).toContain(ISTEK_KIMLIGI_BASLIGI.toLowerCase());
    await screen.findByText('Taslak sipariş');
  });

  it('fiyat yetkisi olmayan fiyat alanını görmez; kalem fiyatsız gider (201 a)', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/ekle' ? json(200, AYRINTI_FIYATSIZ) : undefined));
    ac('/siparisler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    await oturumCozuldu(istekler);
    expect(screen.queryByLabelText(/^Kalem 1 birim fiyat/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Müşteri( \*)?$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Termin( \*)?$/), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme kartı seç' }));
    fireEvent.click(await screen.findByText('Deneme Braket'));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ satirlar: [{ malzemeNo: 31, miktar: '3', birimFiyat: null }] });
  });

  it('3244 b: termin gün yazılınca tarih, tarih yazılınca gün hesaplanır; kalem termini siparişten dolu gelir, partiler gövdede gider', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/ekle' ? json(200, AYRINTI_TASLAK) : undefined));
    ac('/siparisler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.change(screen.getByLabelText(/^Müşteri( \*)?$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Sipariş tarihi/), { target: { value: '2026-11-14' } });
    fireEvent.change(screen.getByLabelText(/^Termin \(gün\)/), { target: { value: '45' } });
    expect((screen.getByLabelText(/^Termin( \*)?$/) as HTMLInputElement).value).toBe('2026-12-29');
    fireEvent.change(screen.getByLabelText(/^Termin( \*)?$/), { target: { value: '2027-01-13' } });
    expect((screen.getByLabelText(/^Termin \(gün\)/) as HTMLInputElement).value).toBe('60');
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme kartı seç' }));
    fireEvent.click(await screen.findByText('Deneme Braket'));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '100' } });
    expect((screen.getByLabelText(/^Kalem 1 termin/) as HTMLInputElement).value).toBe('2027-01-13');
    expect(screen.getByText('Sipariş termini')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Parti ekle' }));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 parti 1 adet/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 parti 2 adet/), { target: { value: '90' } });
    expect(screen.getByText('Toplam 100 / 100')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({
      siparisTarihi: '2026-11-14', termin: '2027-01-13',
      satirlar: [{ termin: null, partiler: [{ emirTuru: 'fai', adet: '10' }, { emirTuru: 'seri', adet: '90' }] }],
    });
  });

  it('3296-3 a: aynı türden ikinci parti eklenir; ürünün iki yürürlükte rotası varsa partiye rota seçilir ve gövdede gider', async () => {
    const ROTALAR = {
      revizyonlar: [{ id: 71, rotaId: 1, harf: 'A', durum: 'yururlukte' }, { id: 72, rotaId: 2, harf: 'A', durum: 'yururlukte' }],
      rotalar: [{ id: 1, ad: 'Standart', standart: true, surum: 1, emirTurleri: [], taslakAcilabilir: false }, { id: 2, ad: 'ORN FAI', standart: false, surum: 1, emirTurleri: ['fai'], taslakAcilabilir: false }],
    };
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/ekle' ? json(200, AYRINTI_TASLAK)
      : yontem === 'GET' && yol === '/rota/urunler/31' ? json(200, ROTALAR) : undefined));
    ac('/siparisler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.change(screen.getByLabelText(/^Müşteri( \*)?$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Sipariş tarihi/), { target: { value: '2026-11-14' } });
    fireEvent.change(screen.getByLabelText(/^Termin \(gün\)/), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme kartı seç' }));
    fireEvent.click(await screen.findByText('Deneme Braket'));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Parti ekle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Parti ekle' }));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 parti 1 adet/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 parti 2 adet/), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 parti 3 adet/), { target: { value: '30' } });
    const rota = await screen.findByLabelText(/^Kalem 1 parti 3 rota/);
    fireEvent.change(rota, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({
      satirlar: [{ partiler: [{ emirTuru: 'fai', adet: '10', rotaId: null }, { emirTuru: 'seri', adet: '60', rotaId: null }, { emirTuru: 'seri', adet: '30', rotaId: 2 }] }],
    });
  });

  it('3296-3 a: Reçete ve Rota okunamıyorsa partide rota seçimi görünmez', async () => {
    sunucuKur(FIYATCI);
    ac('/siparisler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme kartı seç' }));
    fireEvent.click(await screen.findByText('Deneme Braket'));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Parti ekle' }));
    await screen.findByLabelText(/^Kalem 1 parti 1 adet/);
    expect(screen.queryByLabelText(/^Kalem 1 parti 1 rota/)).toBeNull();
  });

  it('3244 b: kalem termini elle değişince "Elle" olur ve gövdede gider; "Siparişe bağla" geri bağlar', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, AYRINTI_TASLAK) : undefined));
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    fireEvent.change(screen.getByLabelText(/^Kalem 1 termin/), { target: { value: '2026-10-20' } });
    expect(screen.getByText('Elle')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siparişe bağla' }));
    expect(screen.getByText('Sipariş termini')).toBeTruthy();
    expect((screen.getByLabelText(/^Kalem 1 termin/) as HTMLInputElement).value).toBe('2026-10-30');
    fireEvent.change(screen.getByLabelText(/^Kalem 1 termin/), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ satirlar: [{ termin: '2026-10-20' }] });
  });

  it('boş zorunlu alanlar istemcide yakalanır; istek gitmez', async () => {
    const istekler = sunucuKur(YAZAR);
    ac('/siparisler/yeni');
    fireEvent.click(await screen.findByRole('button', { name: 'Taslak aç' }));
    expect(await screen.findByText('Firma seçin.')).toBeTruthy();
    expect(screen.getByText('Malzeme kartı seçin.')).toBeTruthy();
    expect(screen.getByText('Termin zorunlu.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('sunucunun alan hatası ilgili alanda görünür', async () => {
    sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/ekle'
      ? hata(422, { kod: 'GECERSIZ', mesaj: 'Firma müşteri değil.', alan: 'firmaId' })
      : undefined));
    ac('/siparisler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.change(screen.getByLabelText(/^Müşteri( \*)?$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Termin( \*)?$/), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme kartı seç' }));
    fireEvent.click(await screen.findByText('Deneme Braket'));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    expect(await screen.findByText('Firma müşteri değil.')).toBeTruthy();
  });

  it('taslak düzenlemede kayıt dolu açılır ve güncelleme açılış sürümünü taşır', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, AYRINTI_TASLAK) : undefined));
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    expect((screen.getByLabelText(/^Müşteri sipariş no/) as HTMLInputElement).value).toBe('DM-100');
    expect((screen.getByLabelText(/^Kalem 1 miktar/) as HTMLInputElement).value).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({
      yol: '/siparisler/5/guncelle', govde: { surum: 2, firmaId: 7, musteriSiparisNo: 'DM-100', satirlar: [{ malzemeNo: 31, miktar: '100', birimFiyat: '12.5' }] },
    });
  });

  it('emre bağlı kalemde miktar ve kart kilitli, silinemez; kimliğiyle gider (SIP-19)', async () => {
    const ikinci = { ...SATIR, id: 51, sira: 2, miktar: '20' };
    const geriAlinmis = { ...AYRINTI_TASLAK, satirlar: [{ ...SATIR, emreBagli: true }, ikinci] } satisfies SiparisAyrintisi;
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/5') return json(200, geriAlinmis);
      return yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, geriAlinmis) : undefined;
    });
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    expect((screen.getByLabelText(/^Kalem 1 miktar/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^Kalem 2 miktar/) as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Kalem 1 sil' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Kalem 2 sil' })).toBeTruthy();
    expect(screen.getByText('Üretim emri açıldı; yalnız termin değişir.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ satirlar: [{ id: 50, miktar: '100' }, { id: 51, miktar: '20' }] });
  });

  it('ödeme vadesi gün olarak gider; boşsa null, kesirli değer istemcide yakalanır (205 a)', async () => {
    const vadeli = { ...AYRINTI_TASLAK, odemeVadesiGun: 60 } satisfies SiparisAyrintisi;
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/5') return json(200, vadeli);
      return yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, vadeli) : undefined;
    });
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    const vade = (await screen.findByLabelText(/^Ödeme vadesi/)) as HTMLInputElement;
    expect(vade.value).toBe('60');
    // E-9: plan sırası vadeyi henüz okumaz; ipucu bunu söyler, yalnız proje maliyeti kullanır.
    expect(screen.getByText('Proje maliyeti finansmanı bu vadeden hesaplar; plan sırası henüz okumaz.')).toBeTruthy();
    fireEvent.change(vade, { target: { value: '30,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Ödeme vadesi tam gün olmalı.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(vade, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ odemeVadesiGun: 90 });
  });

  it('düzenleme ceza alanlarını korur; boşaltılan alan null gider', async () => {
    // Sunucu numeric metni "1.000" biçiminde verir; belirsiz sayı sanılıp düzenleme kilitlenmemeli.
    const cezali = { ...AYRINTI_TASLAK, cezaOraniGun: '0.100', cezaTavaniOrani: '10.00', satirlar: [{ ...SATIR, miktar: '1.000' }] } satisfies SiparisAyrintisi;
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/5') return json(200, cezali);
      return yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, cezali) : undefined;
    });
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    expect(((await screen.findByLabelText(/^Gecikme cezası/)) as HTMLInputElement).value).toBe('0,1');
    fireEvent.change(screen.getByLabelText(/^Ceza tavanı/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ cezaOraniGun: '0.1', cezaTavaniOrani: null });
  });
});

describe('Fiyat görmeyen yazarda ceza ve vade (3401-2 a)', () => {
  it('ceza ve vade alanları yerine kilit çizilir; kayıtta gönderilmez (null), zorunlu denetimine takılmaz', async () => {
    const cezali = { ...AYRINTI_TASLAK, cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null } satisfies SiparisAyrintisi;
    const istekler = sunucuKur(YAZAR, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/5') return json(200, cezali);
      return yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, cezali) : undefined;
    });
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    await oturumCozuldu(istekler);
    expect(screen.queryByLabelText(/^Gecikme cezası/)).toBeNull();
    expect(screen.queryByLabelText(/^Ceza tavanı/)).toBeNull();
    expect(screen.queryByLabelText(/^Ödeme vadesi/)).toBeNull();
    expect(screen.getAllByLabelText('Yetkiniz yok: Sipariş fiyatını görür').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null });
  });
});

describe('Teklifler', () => {
  it('liste firma, istenen teslim, son sürüm ve durumu gösterir; sekme süzgeç gönderir', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/siparisler/teklifler');
    await screen.findByText('Deneme braket ihtiyacı');
    const satir = within(screen.getAllByRole('row').find((s) => s.textContent?.includes('TK-2026-0021'))!);
    expect(satir.getByText('Deneme Musteri A')).toBeTruthy();
    expect(satir.getByText('15.11.2026')).toBeTruthy();
    expect(satir.getByText('Sürüm 1')).toBeTruthy();
    expect(satir.getByText('Müşteride')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Kabul edildi' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/siparisler/teklifler?') && i.yol.includes('durum=kabul'))).toBe(true));
  });

  it('föy sürüm fiyatlarını, toplamı ve koşulları sunucudan gösterir; geçmişte sürüm listelenir', async () => {
    sunucuKur(FIYAT_OKUYUCU);
    ac('/siparisler/teklifler/21');
    await screen.findAllByText('Deneme Mil 20mm');
    expect(screen.getAllByText('10,00 TRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9,00 TRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('360,00 TRY').length).toBeGreaterThan(0);
    expect(screen.getByText('14 gün')).toBeTruthy();
    expect(screen.getByText('Kaplama dahil')).toBeTruthy();
    expect(screen.getByText('Teklif müşteride')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sürüm geçmişi' })).toBeTruthy();
  });

  it('fiyat yetkisi olmayan sürümün koşullarını görür, fiyatlarını ve sürüm formunu görmez (180, 201 a)', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'GET' && yol === '/siparisler/teklifler/21' ? json(200, TEKLIF_FIYATSIZ) : undefined));
    ac('/siparisler/teklifler/21');
    await screen.findAllByText('Deneme Mil 20mm');
    await oturumCozuldu(istekler);
    expect(screen.getByText('14 gün')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Birim fiyat' })).toBeNull();
    expect(screen.queryByText('Toplam (KDV hariç)')).toBeNull();
    expect(screen.queryByLabelText(/^Deneme Mil 20mm birim fiyat/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Müşteri kabulünü kaydet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeni sürüm ver' })).toBeNull();
    // 3245 d: teklif formu fiyat basar; fiyat yetkisi olmayana düğme yoktur.
    expect(screen.queryByRole('button', { name: 'Teklif formu' })).toBeNull();
  });

  it('fiyatı gören okuyucu teklif formunu açar (3245 d)', async () => {
    sunucuKur(FIYAT_OKUYUCU);
    ac('/siparisler/teklifler/21');
    fireEvent.click(await screen.findByRole('button', { name: 'Teklif formu' }));
    expect(await screen.findByRole('dialog', { name: /Teklif formu · TK-2026-0021 · Sürüm 1/ })).toBeTruthy();
  });

  it('okuyan teklifte işlem düğmesi ve sürüm formu görmez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/siparisler/teklifler/21');
    await screen.findAllByText('Deneme Mil 20mm');
    await oturumCozuldu(istekler);
    for (const ad of ['Müşteri kabulünü kaydet', 'Revizyon iste', 'Reddet', 'Teklif formu', 'Teklif ver', 'Yeni sürüm ver']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
  });

  it('yeni teklifte ilk sürüm: virgüllü fiyat noktalı gider, önceki sürüm yokken form boş açılır', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return json(200, TEKLIF_VERILDI);
      return undefined;
    });
    ac('/siparisler/teklifler/21');
    // 3301: ayrıntıda "Teklif hazırla" kartı yok; "Teklif ver" kademeli sayfayı termin ve fiyatta açar.
    fireEvent.click(await screen.findByRole('button', { name: 'Teklif ver' }));
    const birim = await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/);
    expect(screen.getByRole('tab', { name: '3 Termin ve fiyat', selected: true })).toBeTruthy();
    expect((birim as HTMLInputElement).value).toBe('');
    // Fiyatsız kalem varken kademeden geçilmez; nedeni alt çubukta yazar.
    expect((screen.getByRole('button', { name: 'Devam' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('1 kalemin birim fiyatı yok; fiyat girilince devam edilir.')).toBeTruthy();
    fireEvent.change(birim, { target: { value: '1.250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    // Alanın altında ve düğmenin üstündeki özette (3301): uzun formda hata ekran dışında kalmaz.
    expect(await screen.findByText(/^Deneme Mil 20mm: Noktanın binlik/)).toBeTruthy();
    expect(screen.getByText(/Kaydedilmedi: \d+ alanda eksik/)).toBeTruthy();
    fireEvent.change(birim, { target: { value: '10,5' } });
    // Alt çubuk: teklif tutarı ve iskontolu tutar (iskonto yokken ikisi aynı).
    expect(within(screen.getByLabelText('Tutar')).getAllByText('420,00 TRY')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText('Teslim süresi (gün)'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({
      yol: '/siparisler/teklifler/21/surum-ver',
      govde: { surum: 4, fiyatlar: [{ satirId: 11, birimFiyat: '10.5' }], iskontoOrani: '0', teslimGun: 14, odemeKosulu: null, gecerlilik: null, aciklama: null },
    });
    // Sürüm verilince teklif formu aynı sayfada açılır; "Teklife git" ayrıntıya döner.
    expect(await screen.findByRole('dialog', { name: /Teklif formu · TK-2026-0021 · Sürüm 1/ })).toBeTruthy();
    expect(screen.getByText('Sürüm 1 verildi')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Kapat' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Teklife git' }));
    await screen.findByText('Teklif müşteride');
  });

  it('ödeme koşulu seçilir: vadede süre ve gün ya da ay; süre hatalıysa gitmez, metin olarak gider', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return json(200, TEKLIF_VERILDI);
      return undefined;
    });
    ac('/siparisler/teklifler/21/teklif-ver');
    fireEvent.change(await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText('Teslim süresi (gün)'), { target: { value: '14' } });
    const odeme = screen.getByLabelText('Ödeme koşulu') as HTMLSelectElement;
    expect([...odeme.options].map((o) => o.text)).toEqual(['Belirtilmedi', 'Şimdi peşin', 'Terminde peşin', 'Terminde vade', 'Şimdiden vade', 'Diğer (elle yazılır)']);
    expect(screen.queryByLabelText('Vade')).toBeNull();
    fireEvent.change(odeme, { target: { value: 'termin-vade' } });
    fireEvent.change(screen.getByLabelText('Vade'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    expect((await screen.findAllByText('Vade süresi 1 ile 999 arasında tam sayı olmalı.')).length).toBeGreaterThan(0);
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Vade'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Vade birimi'), { target: { value: 'ay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ odemeKosulu: 'Terminden itibaren 2 ay vadeli' });
  });

  it('3327 önceki sürümün ödeme koşulu seçime geri dolar; düz metin "Diğer" olur ve elle yazılan metin gider', async () => {
    const vadeli = { ...TEKLIF_VERILDI, surumler: [{ ...SURUM_1, odemeKosulu: 'Terminden itibaren 45 gün vadeli' }] } satisfies TeklifAyrintisi;
    sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'GET' && yol === '/siparisler/teklifler/21' ? json(200, vadeli) : undefined));
    ac('/siparisler/teklifler/21/teklif-ver');
    await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/);
    fireEvent.click(screen.getByRole('tab', { name: '4 Koşullar ve gönder' }));
    expect((await screen.findByLabelText<HTMLSelectElement>('Ödeme koşulu')).value).toBe('termin-vade');
    expect(screen.getByLabelText<HTMLInputElement>('Vade').value).toBe('45');
    expect(screen.getByLabelText<HTMLSelectElement>('Vade birimi').value).toBe('gun');
    cleanup();
    // SURUM_1'in koşulu bu biçimde değil ("30 gün"): Diğer ve metniyle gelir; metin değişince gönderimde o gider.
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver' ? json(200, TEKLIF_VERILDI) : undefined));
    ac('/siparisler/teklifler/21/teklif-ver');
    await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/);
    fireEvent.click(screen.getByRole('tab', { name: '4 Koşullar ve gönder' }));
    expect((await screen.findByLabelText<HTMLSelectElement>('Ödeme koşulu')).value).toBe('diger');
    const metin = screen.getByLabelText<HTMLInputElement>('Ödeme koşulu metni');
    expect(metin.value).toBe('30 gün');
    fireEvent.change(metin, { target: { value: '%50 avans, kalan teslimde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sürüm 2 olarak ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ odemeKosulu: '%50 avans, kalan teslimde' });
  });

  it('3400-4: ödeme yöntemi koşul metnine eklenir, formda nasıl yazacağı görünür; önceki sürümün yöntemi geri dolar', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return json(200, TEKLIF_VERILDI);
      return undefined;
    });
    ac('/siparisler/teklifler/21/teklif-ver');
    fireEvent.change(await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText('Teslim süresi (gün)'), { target: { value: '14' } });
    const yontem = screen.getByLabelText('Ödeme yöntemi') as HTMLSelectElement;
    expect([...yontem.options].map((o) => o.text)).toEqual(['Belirtilmedi', 'Açık hesap', 'Çek', 'Nakit', 'Havale / EFT']);
    fireEvent.change(screen.getByLabelText('Ödeme koşulu'), { target: { value: 'termin-vade' } });
    fireEvent.change(screen.getByLabelText('Vade'), { target: { value: '60' } });
    fireEvent.change(yontem, { target: { value: 'cek' } });
    expect(screen.getByText('Formda: Terminden itibaren 60 gün vadeli, çek ile')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ odemeKosulu: 'Terminden itibaren 60 gün vadeli, çek ile' });
    cleanup();
    const cekli = { ...TEKLIF_VERILDI, surumler: [{ ...SURUM_1, odemeKosulu: 'Terminden itibaren 60 gün vadeli, çek ile' }] } satisfies TeklifAyrintisi;
    sunucuKur(FIYATCI, (y, yol) => (y === 'GET' && yol === '/siparisler/teklifler/21' ? json(200, cekli) : undefined));
    ac('/siparisler/teklifler/21/teklif-ver');
    await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/);
    fireEvent.click(screen.getByRole('tab', { name: '4 Koşullar ve gönder' }));
    expect((await screen.findByLabelText<HTMLSelectElement>('Ödeme yöntemi')).value).toBe('cek');
    expect(screen.getByLabelText<HTMLSelectElement>('Ödeme koşulu').value).toBe('termin-vade');
    expect(screen.getByLabelText<HTMLInputElement>('Vade').value).toBe('60');
  });

  it('verilmiş teklifte yeni sürüm formu önceki değerlerle dolu açılır', async () => {
    sunucuKur(FIYATCI);
    ac('/siparisler/teklifler/21/teklif-ver');
    const birim = await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/);
    expect((birim as HTMLInputElement).value).toBe('10');
    // Verilmiş teklifte talep kilitlidir: kademe 1-2 nedenini ve kalemleri gösterir.
    fireEvent.click(screen.getByRole('tab', { name: '2 Kalemler' }));
    expect(screen.getByText(/Talep ilk sürüm verildikten sonra değişmez/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Kalem 1 tanım/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '4 Koşullar ve gönder' }));
    expect((await screen.findByLabelText('Teslim süresi (gün)') as HTMLInputElement).value).toBe('14');
    expect((screen.getByLabelText('İskonto (%)') as HTMLInputElement).value).toBe('10');
    expect(screen.getByRole('button', { name: 'Sürüm 2 olarak ver' })).toBeTruthy();
  });

  it('müşteri kabulü son sürüm numarasıyla kaydedilir', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/teklifler/21/kabul' ? json(200, TEKLIF_KABUL) : undefined));
    ac('/siparisler/teklifler/21');
    fireEvent.click(await screen.findByRole('button', { name: 'Müşteri kabulünü kaydet' }));
    const pencere = await screen.findByRole('dialog', { name: 'Müşteri kabulünü kaydet' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kabulü kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/teklifler/21/kabul', govde: { surum: 4, surumNo: 1 } });
    expect(await screen.findByRole('button', { name: 'Satış siparişine dönüştür' })).toBeTruthy();
    expect(screen.getByText('Müşteri sürüm 1 teklifini kabul etti')).toBeTruthy();
  });

  it('291 a: iskonto onayı bekleyen teklifte yazar onaylayamaz; müdür onaylar, teklif müşteriye gider', async () => {
    const bekleyen = { ...TEKLIF_VERILDI, durum: 'onay-bekliyor', surumler: [{ ...SURUM_1, iskontoOrani: '15.00' }] } satisfies TeklifAyrintisi;
    const onayli = {
      ...bekleyen, durum: 'verildi', surum: 5, surumler: [{ ...bekleyen.surumler[0]!, iskontoOnaylayan: 'Deneme Mudur', iskontoOnayAni: '2026-10-20T09:00:00+03:00' }],
    } satisfies TeklifAyrintisi;
    const yaniti = (yontem: string, yol: string) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, bekleyen);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/iskonto-onayla') return json(200, onayli);
      return undefined;
    };
    sunucuKur(YAZAR, yaniti);
    ac('/siparisler/teklifler/21');
    expect(await screen.findByText('İskonto onayı bekliyor', { selector: 'strong' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İskontoyu onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Müşteri kabulünü kaydet' })).toBeNull();
    cleanup();
    const MUDUR: Kullanici = { id: 5, ad: 'Deneme Mudur', islemler: [...KOK, 'siparisler.iskonto-onayla'] };
    const istekler = sunucuKur(MUDUR, yaniti);
    ac('/siparisler/teklifler/21');
    fireEvent.click(await screen.findByRole('button', { name: 'İskontoyu onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'İskontoyu onayla' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/teklifler/21/iskonto-onayla', govde: { surum: 4 } });
    expect(await screen.findByText('İskonto onayı: Deneme Mudur')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İskontoyu onayla' })).toBeNull();
  });

  it('revizyon ve red notsuz gitmez; notla gövdede gider', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/teklifler/21/reddet'
      ? json(200, { ...TEKLIF_VERILDI, durum: 'red', not: 'Fiyat yüksek' } satisfies TeklifAyrintisi)
      : undefined));
    ac('/siparisler/teklifler/21');
    fireEvent.click(await screen.findByRole('button', { name: 'Reddet' }));
    const pencere = await screen.findByRole('dialog', { name: 'Teklifi reddet' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    expect((await within(pencere).findByRole('alert')).textContent).toBe('Not zorunlu.');
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText(/Red gerekçesi/), { target: { value: 'Fiyat yüksek' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/teklifler/21/reddet', govde: { surum: 4, not: 'Fiyat yüksek' } });
    await screen.findByText('Teklif reddedildi');
  });

  it('kabul edilen teklif siparişe dönüşür: gövde tekrar korumalı gider, açılan taslak siparişe geçilir', async () => {
    const donus = { teklif: { ...TEKLIF_KABUL, durum: 'siparis', siparisId: 5, surum: 6 }, siparisId: 5 } satisfies SiparisDonusumCevabi;
    const istekler = sunucuKur(YAZAR, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_KABUL);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/siparise-donustur') return json(200, donus);
      return undefined;
    });
    ac('/siparisler/teklifler/21');
    fireEvent.click(await screen.findByRole('button', { name: 'Satış siparişine dönüştür' }));
    const pencere = await screen.findByRole('dialog', { name: 'Satış siparişine dönüştür' });
    // İstenen teslim tarihi terminin başlangıç önerisidir.
    expect((within(pencere).getByLabelText(/^Termin/) as HTMLInputElement).value).toBe('2026-11-15');
    fireEvent.change(within(pencere).getByLabelText(/^Sipariş tarihi/), { target: { value: '2026-10-20' } });
    fireEvent.change(within(pencere).getByLabelText('Müşteri sipariş no'), { target: { value: 'DM-9' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Taslak sipariş aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const istek = yazmalar(istekler)[0]!;
    expect(istek.yol).toBe('/siparisler/teklifler/21/siparise-donustur');
    expect(istek.govde).toEqual({ surum: 5, musteriSiparisNo: 'DM-9', siparisTarihi: '2026-10-20', termin: '2026-11-15', kdvOrani: '20' });
    expect(Object.keys(istek.baslik).map((k) => k.toLowerCase())).toContain(ISTEK_KIMLIGI_BASLIGI.toLowerCase());
    await screen.findByText('Taslak sipariş');
    expect(screen.getByText('SS-2026-0005')).toBeTruthy();
  });

  it('kartsız satır için uyarı yazılır ve kart bağlama kimlikle gider', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_KABUL);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/satirlar/11/kart-bagla') {
        return json(200, { ...TEKLIF_KABUL, satirlar: [{ ...TEKLIF_SATIR, malzemeNo: 31, malzemeKodu: 'DNM-001', malzemeAdi: 'Deneme Braket', aciklamalar: ['Deneme aciklama 1'] }] } satisfies TeklifAyrintisi);
      }
      return undefined;
    });
    ac('/siparisler/teklifler/21');
    expect((await screen.findByText(/1 satırda malzeme seçilmedi/))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deneme Mil 20mm için malzeme seç' }));
    const secici = await screen.findByRole('dialog', { name: 'Malzeme kartı seç' });
    fireEvent.click(await within(secici).findByText('Deneme Braket'));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/teklifler/21/satirlar/11/kart-bagla', govde: { surum: 5, malzemeNo: 31 } });
    await waitFor(() => expect(screen.queryByText(/satırda malzeme seçilmedi/)).toBeNull());
    // 2120: bağlanan kartın kodu, adı ve açıklaması satırda görünür.
    const satir = screen.getByText('DNM-001').closest('tr')!;
    expect(within(satir).getByText('Deneme Braket')).toBeTruthy();
    expect(within(satir).getByText('Deneme aciklama 1')).toBeTruthy();
  });

  it('yeni teklif talebi: firma kimlikle, kartsız satır tanımla gider; istek kimliği taşır', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/teklifler/ekle' ? json(200, TEKLIF_YENI) : undefined));
    ac('/siparisler/teklifler/yeni');
    await musteriSec();
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme braket ihtiyacı' } });
    // Kademe 1 kayıt yapmaz: yalnız talep bilgileri denetlenir, kalemlere geçilir.
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText(/^Kalem 1 tanım/), { target: { value: 'Deneme Mil 20mm' } });
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '40' } });
    // 3400-2: kartsız kalemde birim Logo karşılığı olan birimlerden seçilir.
    const birim = screen.getByLabelText(/^Kalem 1 birim/) as HTMLSelectElement;
    await waitFor(() => expect(within(birim).queryByRole('option', { name: 'kg' })).toBeTruthy());
    expect(within(birim).queryByRole('option', { name: 'mt' })).toBeNull();
    fireEvent.change(birim, { target: { value: 'kg' } });
    expect(screen.getByText('Logo: KG')).toBeTruthy();
    // 3400-3: kartsız kalemde yerlilik elle girilir; aralık dışı reddedilir.
    fireEvent.change(screen.getByLabelText(/^Kalem 1 yerlilik/), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi aç' }));
    expect((await screen.findAllByText(/Yerlilik oranı 0 ile 100 arasında/)).length).toBeGreaterThan(0);
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/^Kalem 1 yerlilik/), { target: { value: '40,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const istek = yazmalar(istekler)[0]!;
    expect(istek.yol).toBe('/siparisler/teklifler/ekle');
    expect(istek.govde).toEqual({
      firmaId: 7, baslik: 'Deneme braket ihtiyacı', paraBirimi: 'TRY', istenenTarih: null, aciklama: null,
      satirlar: [{ malzemeNo: null, tanim: 'Deneme Mil 20mm', miktar: '40', birim: 'kg', yerlilikOrani: '40.5' }],
    });
    expect(Object.keys(istek.baslik).map((k) => k.toLowerCase())).toContain(ISTEK_KIMLIGI_BASLIGI.toLowerCase());
    await screen.findByText('Teklif müşteride');
  });

  it('3301-2: sürüm verilirken sunucu reddi düğmenin üstünde yazar; eski sürümde yeniden yükleme iletisi, genel retde sunucunun iletisi', async () => {
    const dene = async (cevap: Response, beklenen: string) => {
      sunucuKur(FIYATCI, (yontem, yol) => {
        if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
        if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return cevap;
        return undefined;
      });
      ac('/siparisler/teklifler/21/teklif-ver');
      fireEvent.change(await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Teklifi ver' }));
      const uyari = await screen.findByText(beklenen);
      expect(uyari.closest('[role="alert"]')).toBeTruthy();
      cleanup();
    };
    await dene(hata(409, { kod: 'CAKISMA', mesaj: 'Kayıt değişti.', ayrinti: { neden: ESKI_SURUM_NEDENI } }), ESKI_SURUM_ILETISI);
    await dene(hata(400, { kod: 'GECERSIZ', mesaj: 'Deneme sunucu reddi.' }), 'Deneme sunucu reddi.');
  });

  it('3301-2: yeni teklif talebinde eksik alan düğmenin üstündeki listede kalem numarasıyla yazar', async () => {
    const istekler = sunucuKur(YAZAR);
    ac('/siparisler/teklifler/yeni');
    await musteriSec();
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme braket ihtiyacı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText(/^Kalem 1 tanım/), { target: { value: 'Deneme Mil 20mm' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kalem ekle' }));
    fireEvent.change(await screen.findByLabelText(/^Kalem 2 tanım/), { target: { value: 'Deneme Flans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi aç' }));
    const ozet = (await screen.findByText(/Kaydedilmedi: 1 alanda eksik/)).closest('[role="alert"]')!;
    expect(within(ozet as HTMLElement).getByText('Kalem 2: Miktar zorunlu.')).toBeTruthy();
    expect(within(ozet as HTMLElement).queryByText(/^Kalem 1:/)).toBeNull();
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('3301: fiyat yetkisi olan kalemlerde "Kaydet ve devam" ile talebi açar; sayfa termin ve fiyat kademesinde sürer', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'POST' && yol === '/siparisler/teklifler/ekle') return json(200, TEKLIF_YENI);
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
      return undefined;
    });
    ac('/siparisler/teklifler/yeni');
    await screen.findByRole('combobox', { name: /^Müşteri/ });
    // Kaydedilmemiş talepte termin ve fiyat açılmaz; nedeni yazar.
    fireEvent.click(screen.getByRole('tab', { name: '3 Termin ve fiyat' }));
    expect(screen.getByText(/Önce kalemleri kaydedin/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '1 Müşteri ve konu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devam' }));
    expect(await screen.findAllByText('Firma seçin.')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: '1 Müşteri ve konu', selected: true })).toBeTruthy();
    await musteriSec();
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme braket ihtiyacı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText(/^Kalem 1 tanım/), { target: { value: 'Deneme Mil 20mm' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet ve devam' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.yol).toBe('/siparisler/teklifler/ekle');
    expect(await screen.findByRole('heading', { name: 'Teklif ver: TK-2026-0021' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '3 Termin ve fiyat', selected: true })).toBeTruthy();
    expect(screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/)).toBeTruthy();
    // Biten kademeler tik taşır; henüz başlamayan kademe 4 taşımaz (ön izleme D).
    const tik = (ad: string) => screen.getByRole('tab', { name: ad }).querySelector('svg') !== null;
    expect([tik('1 Müşteri ve konu'), tik('2 Kalemler'), tik('3 Termin ve fiyat'), tik('4 Koşullar ve gönder')]).toEqual([true, true, false, false]);
    // Kademe 3'te Geri kalemlere döner; kayıtlı talep düzenlenebilir.
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(await screen.findByRole('tab', { name: '2 Kalemler', selected: true })).toBeTruthy();
    expect((await screen.findByLabelText(/^Kalem 1 tanım/) as HTMLInputElement).value).toBe('Deneme Mil 20mm');
  });

  it('3301: kademe 4 iskontolu tutarı çubukta yazar; Geri kademe 3\'e döner; sunucu termin ya da fiyat alanını reddedince kademe 3 açılır', async () => {
    sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return hata(400, { kod: 'GECERSIZ', mesaj: 'Deneme termin reddi.', alan: 'istenenTermin' });
      return undefined;
    });
    ac('/siparisler/teklifler/21/teklif-ver');
    fireEvent.change(await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText('İskonto (%)'), { target: { value: '10' } });
    const tutar = screen.getByLabelText('Tutar');
    expect(within(tutar).getByText('İskontolu (%10)')).toBeTruthy();
    expect(within(tutar).getByText('400,00 TRY')).toBeTruthy();
    expect(within(tutar).getByText('360,00 TRY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(await screen.findByRole('tab', { name: '3 Termin ve fiyat', selected: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText('Teslim süresi (gün)'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    expect(await screen.findByRole('tab', { name: '3 Termin ve fiyat', selected: true })).toBeTruthy();
    expect(screen.getAllByText(/Deneme termin reddi\./).length).toBeGreaterThan(0);
  });

  it('3301: onay bekleyen sürümde sonuç nedenini yazar; teklif formu açılmaz', async () => {
    sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return json(200, { ...TEKLIF_VERILDI, durum: 'onay-bekliyor' } satisfies TeklifAyrintisi);
      return undefined;
    });
    ac('/siparisler/teklifler/21/teklif-ver');
    fireEvent.change(await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText('Teslim süresi (gün)'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    expect(await screen.findByText('Sürüm 1 onay bekliyor')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Teklif formu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yazdır / PDF' })).toBeNull();
  });

  it('teklif kalemi malzemeden seçilir: tanım kart adıyla dolar, kart değişince güncellenir, elle yazılan tanım korunur', async () => {
    sunucuKur(YAZAR);
    ac('/siparisler/teklifler/yeni');
    fireEvent.click(await screen.findByRole('tab', { name: '2 Kalemler' }));
    const tanim = await screen.findByLabelText(/^Kalem 1 tanım/);
    const sec = async (ad: string) => {
      fireEvent.click(screen.getByRole('button', { name: /^(Listeden seç|Malzemeyi değiştir)$/ }));
      const secici = await screen.findByRole('dialog', { name: 'Malzeme kartı seç' });
      fireEvent.click(await within(secici).findByText(ad));
    };
    await sec('Deneme Braket');
    expect((tanim as HTMLInputElement).value).toBe('Deneme Braket');
    await sec('Deneme Mil');
    expect((tanim as HTMLInputElement).value).toBe('Deneme Mil');
    fireEvent.change(tanim, { target: { value: 'Deneme özel ölçü' } });
    await sec('Deneme Braket');
    expect((tanim as HTMLInputElement).value).toBe('Deneme özel ölçü');
  });

  it('malzemeden seçilen kalemde tanım istenmez: boş tanımla talep açılır, kartın adı gider; malzemesiz kalemde tanım zorunlu', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/teklifler/ekle' ? json(200, TEKLIF_YENI) : undefined));
    ac('/siparisler/teklifler/yeni');
    await musteriSec();
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme braket ihtiyacı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText(/^Kalem 1 miktar/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi aç' }));
    expect((await screen.findAllByText('Malzeme seçin ya da tanımı yazın.')).length).toBeGreaterThan(0);
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Listeden seç' }));
    fireEvent.click(await within(await screen.findByRole('dialog', { name: 'Malzeme kartı seç' })).findByText('Deneme Braket'));
    const tanim = screen.getByLabelText(/^Kalem 1 tanım \(isteğe bağlı\)/) as HTMLInputElement;
    expect(tanim.required).toBe(false);
    fireEvent.change(tanim, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ satirlar: [{ malzemeNo: 31, tanim: 'Deneme Braket', miktar: '40' }] });
  });

  it('3400-1: kalem tanımına yazınca kartlar listelenir; seçilen kartın birimi ve yerliliği karttan gelir, kart birimsiz gider', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/teklifler/ekle' ? json(200, TEKLIF_YENI) : undefined));
    ac('/siparisler/teklifler/yeni');
    await musteriSec();
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme braket ihtiyacı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    const tanim = await screen.findByRole('combobox', { name: /^Kalem 1 tanım/ });
    // Kartsızken elle girilen oran, oranlı kart seçilince gövdeye gitmez (kartın oranı sunucuda yazılır).
    fireEvent.change(screen.getByLabelText(/^Kalem 1 yerlilik/), { target: { value: '30' } });
    // Tek harfte arama yapılmaz.
    fireEvent.focus(tanim);
    fireEvent.change(tanim, { target: { value: 'D' } });
    await new Promise((r) => { setTimeout(r, 400); });
    expect(istekler.some((i) => i.yol.startsWith('/siparisler/malzeme-secenekleri'))).toBe(false);
    fireEvent.change(tanim, { target: { value: 'Deneme' } });
    const secenek = await screen.findByRole('option', { name: /Deneme Braket/ });
    expect(secenek.textContent).toMatch(/%62,5 yerli/);
    expect(istekler.some((i) => i.yol.startsWith('/siparisler/malzeme-secenekleri') && i.yol.includes('ara=Deneme'))).toBe(true);
    fireEvent.click(secenek);
    expect((tanim as HTMLInputElement).value).toBe('Deneme Braket');
    expect((screen.getByLabelText(/^Kalem 1 birim/) as HTMLInputElement).value).toBe('adet');
    expect((screen.getByLabelText(/^Kalem 1 yerlilik/) as HTMLInputElement).value).toBe('62,5');
    expect(screen.getByText('Karttan')).toBeTruthy();
    // Kartlı kalemde tanım değişince arama yapılmaz.
    const once = istekler.filter((i) => i.yol.startsWith('/siparisler/malzeme-secenekleri')).length;
    fireEvent.change(tanim, { target: { value: 'Deneme Braket özel' } });
    await new Promise((r) => { setTimeout(r, 400); });
    expect(istekler.filter((i) => i.yol.startsWith('/siparisler/malzeme-secenekleri')).length).toBe(once);
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ satirlar: [{ malzemeNo: 31, tanim: 'Deneme Braket özel', miktar: '40', birim: null, yerlilikOrani: null }] });
  });

  it('3400-2: Logo karşılığı hiç yoksa bütün aktif birimler listelenir; listede olmayan kayıtlı birim düzenlemede seçili kalır', async () => {
    const LOGOSUZ = { birimler: [{ kod: 'adet', logo: null }, { kod: 'kg', logo: null }] } satisfies BirimSecenekleriCevabi;
    const KUTULU = { ...TEKLIF_YENI, satirlar: [{ ...TEKLIF_SATIR, birim: 'kutu' }] } satisfies TeklifAyrintisi;
    sunucuKur(YAZAR, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/birim-secenekleri') return json(200, LOGOSUZ);
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, KUTULU);
      return undefined;
    });
    ac('/siparisler/teklifler/21/duzenle');
    fireEvent.click(await screen.findByRole('tab', { name: '2 Kalemler' }));
    const birim = await screen.findByLabelText(/^Kalem 1 birim/) as HTMLSelectElement;
    await waitFor(() => expect(within(birim).queryByRole('option', { name: 'kg' })).toBeTruthy());
    expect([...birim.options].map((o) => o.value)).toEqual(['', 'kutu', 'adet', 'kg']);
    expect(birim.value).toBe('kutu');
  });

  it('3400-1: müşteri kutusuna yazmak seçimi bırakır; seçilmeyen müşteriyle Devam reddedilir', async () => {
    const istekler = sunucuKur(YAZAR);
    ac('/siparisler/teklifler/yeni');
    await musteriSec();
    const kutu = screen.getByRole('combobox', { name: /^Müşteri/ }) as HTMLInputElement;
    expect(kutu.value).toBe('M-7 · Deneme Musteri A');
    expect(screen.getByText('Seçili müşteri')).toBeTruthy();
    fireEvent.change(kutu, { target: { value: 'Deneme Musteri' } });
    expect(screen.getByText('Listeden seçin; yazılan metin kaydedilmez.')).toBeTruthy();
    // Liste açıkken Escape yalnız listeyi kapatır: tarayıcının arama kutusunu silmesi engellenir.
    await screen.findByRole('listbox');
    expect(fireEvent.keyDown(kutu, { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(kutu.value).toBe('Deneme Musteri');
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme braket ihtiyacı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    expect((await screen.findAllByText('Firma seçin.')).length).toBeGreaterThan(0);
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/musteri-tedarikci/firmalar/secim') && i.yol.includes('ara=Deneme') && i.yol.includes('tur=musteri'))).toBe(true));
  });

  it('ilk sürümden sonra talep düzenlenmez', async () => {
    sunucuKur(YAZAR);
    ac('/siparisler/teklifler/21/duzenle');
    expect(await screen.findByText('Talep yalnız ilk sürüm verilmeden düzenlenir.')).toBeTruthy();
  });
});

describe('Teklif termin ve fiyat (44)', () => {
  // 3401-1 a: maliyet toplamı, birim maliyet ve kâr finans.maliyet-oku ister; satış fiyatını görmek tek başına yetmez. Döküm siparisler.maliyet-oku'da.
  const SATISCI: Kullanici = { id: 9, ad: 'Deneme Satisci', islemler: [...KOK, 'siparisler.yaz', 'siparisler.fiyat-oku', 'siparisler.termin-dene', 'finans.maliyet-oku'] };
  const SATISCI_KILITLI: Kullanici = { ...SATISCI, islemler: SATISCI.islemler.filter((i) => i !== 'finans.maliyet-oku') };
  const MUDUR: Kullanici = { ...SATISCI, islemler: [...SATISCI.islemler, 'siparisler.maliyet-oku'] };
  const KARTLI_SATIR = { ...TEKLIF_SATIR, malzemeNo: 31, malzemeKodu: 'DNM-001', malzemeAdi: 'Deneme Braket', aciklamalar: ['Deneme aciklama 1'], birim: 'adet' };
  const TEKLIF_KARTLI = { ...TEKLIF_YENI, satirlar: [KARTLI_SATIR] } satisfies TeklifAyrintisi;
  const DENEME = {
    durum: 'hazir', planSurumu: '412', gecerlilik: '2099-06-30', istenenTermin: null, yerlesim: 'arkaya', baslangic: null, planTermini: '2099-07-14', termin: '2099-07-14', terminGun: 14,
    yetisir: null, onayGerekli: false, satinalmaGerekli: true,
    kalemler: [{
      satirId: 11, sira: 1, tanim: 'Deneme Mil 20mm', malzemeNo: 31, adet: '40', plansiz: false, yerlesti: true, bitis: '2099-07-10T16:00:00+03:00',
      planTermini: '2099-07-14', malzemeGelisi: '2099-07-03T08:00:00+03:00', satinalma: [{ kod: 'HM-DNM', miktar: '12.5', birim: 'kg', gelis: '2099-07-03T08:00:00+03:00' }],
      birimMaliyet: '10.0000', toplamMaliyet: '400.00', dokum: null, eksikVeri: [],
    }],
    maliyetToplami: '400.00', genelGiderSaatBasi: null, genelGiderGizli: false, kayanlar: [], plan: null,
  } satisfies TerminDenemesiCevabi;
  const SERITLI = {
    ...DENEME,
    plan: {
      baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-20T00:00:00+03:00', kapaliGunler: ['2099-07-05'],
      hatlar: [{ makineId: 'T1', ad: 'Deneme Torna', fason: false }, { makineId: 'F1', ad: 'Deneme Fasoncu', fason: true }],
      bloklar: [
        { makineId: 'T1', tur: 'siparis', etiket: 'S-DNM-1', kalem: null, adim: '10', baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-02T08:00:00+03:00', gecikir: true },
        { makineId: 'T1', tur: 'satis-taslagi', etiket: 'TK-2099-007', kalem: 1, adim: '10', baslangic: '2099-07-03T08:00:00+03:00', bitis: '2099-07-04T08:00:00+03:00', gecikir: false },
        { makineId: 'T1', tur: 'teklif', etiket: 'Bu teklif', kalem: 1, adim: '10', baslangic: '2099-07-08T08:00:00+03:00', bitis: '2099-07-10T16:00:00+03:00', gecikir: false },
      ],
    },
  } satisfies TerminDenemesiCevabi;
  const ADET = {
    durum: 'hazir',
    satirlar: (['0.5', '1', '2', '4'] as const).map((carpan, i) => ({
      carpan, termin: ['2099-07-12', '2099-07-14', '2099-07-18', '2099-07-25'][i] ?? null, maliyetToplami: ['260.00', '400.00', '640.00', '1120.00'][i] ?? null,
      kalemler: [{ satirId: 11, adet: ['20.000', '40.000', '80.000', '160.000'][i] ?? '0', birimMaliyet: ['13.0000', '10.0000', '8.0000', '7.0000'][i] ?? null }],
    })),
    genelGiderGizli: false,
  } satisfies AdetDenemesiCevabi;
  const ATOLYE = {
    taslaklar: [{
      id: 5, teklifId: 7, teklifNo: 'TK-2099-007', firmaAd: 'Deneme Firma B', paraBirimi: 'TRY', gorunum: 'satis', kalemler: [{ tanim: 'Deneme Flans', adet: '12.000' }],
      termin: '2099-07-09', gecerlilik: '2099-06-30', karOrani: '20.00', tutar: '1500.00', olusturan: 'Deneme Satisci', olusturma: '2026-10-21T09:00:00+03:00',
    }],
  } satisfies AtolyeTaslaklariCevabi;
  const DOKUMLU = {
    ...DENEME, genelGiderSaatBasi: '10.00',
    kalemler: [{ ...DENEME.kalemler[0]!, dokum: [{ tur: 'malzeme', ad: 'Malzeme', tezgah: null, saat: null, tutar: '100.00' }, { tur: 'isleme', ad: '10', tezgah: 'T1', saat: '2.00', tutar: '300.00' }] }],
  } satisfies TerminDenemesiCevabi;
  const KAYAN = { ...DENEME, istenenTermin: '2099-07-05', yerlesim: 'geriye', termin: '2099-07-05', yetisir: false, onayGerekli: true,
    kayanlar: [{ siparis: 'SS-DNM-1', once: '2099-07-01T10:00:00+03:00', sonra: '2099-07-04T10:00:00+03:00', termin: '2099-07-02', gecikir: true }] } satisfies TerminDenemesiCevabi;

  const kur = (kullanici: Kullanici, deneme: (yol: string) => TerminDenemesiCevabi = () => DENEME, teklif: TeklifAyrintisi = TEKLIF_KARTLI, adet: AdetDenemesiCevabi = ADET) => sunucuKur(kullanici, (yontem, yol) => {
    if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, teklif);
    if (yontem === 'GET' && yol.startsWith('/siparisler/teklifler/21/termin-denemesi')) return json(200, deneme(yol));
    if (yontem === 'GET' && yol === '/siparisler/teklifler/21/plan-taslaklari') return json(200, { taslaklar: [] } satisfies PlanTaslaklariCevabi);
    if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return json(200, TEKLIF_VERILDI);
    if (yontem === 'POST' && yol === '/siparisler/teklifler/21/deneme-taslagi') return json(200, { taslaklar: [] } satisfies PlanTaslaklariCevabi);
    if (yontem === 'GET' && yol.startsWith('/siparisler/teklifler/21/adet-denemesi')) return json(200, adet);
    if (yontem === 'GET' && yol === '/siparisler/satis-taslaklari') return json(200, ATOLYE);
    return undefined;
  });

  it('plan denemesi şeridi: tezgâh başına sipariş, satış taslağı ve bu teklif çizilir; fason yalnız işi varsa; plan verisi yoksa not', async () => {
    kur(SATISCI, () => SERITLI);
    ac('/siparisler/teklifler/21/teklif-ver');
    const serit = await screen.findByRole('region', { name: 'Plan denemesi' });
    expect(within(serit).getByRole('img', { name: 'Deneme Torna: S-DNM-1, TK-2099-007, Bu teklif' })).toBeTruthy();
    expect(within(serit).queryByText('Deneme Fasoncu')).toBeNull();
    expect(within(serit).getByText('Gecikiyor')).toBeTruthy();
    cleanup();
    kur(SATISCI);
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText('Planlama motoru plan verisi vermedi; şerit çizilmez.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Plan denemesi' })).toBeNull();
  });

  it('3347: kalem yerleşmezse termin yok ama şerit çizilir; sebep kalem adıyla yazılır, genel gider notu termin sebebi gibi görünmez', async () => {
    const neden = 'OP 10 Deneme Freze: işi yapabilecek tezgâh ya da fasoncu yok (İstasyonlar > Makineler)';
    kur(SATISCI, () => ({
      ...SERITLI, planTermini: null, termin: null, terminGun: null, maliyetToplami: null, plan: { ...SERITLI.plan, bloklar: SERITLI.plan.bloklar.filter((b) => b.tur !== 'teklif') },
      kalemler: [
        { ...DENEME.kalemler[0]!, yerlesti: false, bitis: null, planTermini: null, birimMaliyet: null, toplamMaliyet: null, eksikVeri: [neden] },
        { ...DENEME.kalemler[0]!, satirId: 12, sira: 2, tanim: 'Deneme kartsiz hizmet', malzemeNo: null, plansiz: true, yerlesti: false, bitis: null, planTermini: null, birimMaliyet: null, toplamMaliyet: null, eksikVeri: [] },
      ],
    }));
    ac('/siparisler/teklifler/21/teklif-ver');
    const not = await screen.findByText('Termin hesaplanamadı');
    const liste = within(not.parentElement!).getByRole('list', { name: 'Yerleşmeyen kalemler' });
    expect(within(liste).getByText('1. Deneme Mil 20mm')).toBeTruthy();
    expect(within(liste).queryByText(/Deneme kartsiz hizmet/)).toBeNull();
    expect(within(within(liste).getByRole('list', { name: 'Deneme Mil 20mm sebepleri' })).getByText(neden)).toBeTruthy();
    expect(screen.queryByText(/Genel gider oranı tanımlı değil/)).toBeNull();
    expect(await screen.findByRole('region', { name: 'Plan denemesi' })).toBeTruthy();
    expect(screen.getByText('Bu teklifin yerleşen adımı yok; şeritte yalnız plandaki işler görünür.')).toBeTruthy();
  });

  it('adet değişirse: yarım, aynı, iki, dört kat; birim fiyat maliyet artı seçili kâr; kâr değişince tablo da değişir', async () => {
    const istekler = kur(SATISCI);
    ac('/siparisler/teklifler/21/teklif-ver');
    const tablo = await screen.findByRole('table', { name: 'Adet değişirse' });
    expect(within(tablo).getByText('160')).toBeTruthy();
    expect(within(tablo).getByText('25.07.2099')).toBeTruthy();
    // %25 kâr: 13 TL birim maliyet 16,25 TL; 400 TL maliyet 500 TL toplam.
    expect(within(tablo).getByText('16,25 TRY')).toBeTruthy();
    expect(within(tablo).getByText('500,00 TRY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '%40' }));
    await waitFor(() => expect(within(tablo).getByText('560,00 TRY')).toBeTruthy());
    expect(istekler.filter((i) => i.yol.startsWith('/siparisler/teklifler/21/adet-denemesi'))).toHaveLength(1);
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('atölyedeki satış taslakları: bütün tekliflerin taslakları teklif, firma, termin ve tutarla; satırdan teklife gidilir', async () => {
    kur(SATISCI);
    ac('/siparisler/teklifler/21');
    const tablo = await screen.findByRole('table', { name: 'Atölyedeki satış taslakları' });
    expect(within(tablo).getByText('TK-2099-007')).toBeTruthy();
    expect(within(tablo).getByText('Deneme Firma B')).toBeTruthy();
    expect(within(tablo).getByText('Deneme Flans × 12')).toBeTruthy();
    expect(within(tablo).getByText('1.500,00 TRY')).toBeTruthy();
  });

  it('3301 (Risk K-ek): arkaya eklemede istenen termine yetişmeyince termin plandandır ve uyarı yazar; istenen tarih ayrıca görünür', async () => {
    kur(SATISCI, () => ({ ...DENEME, istenenTermin: '2099-07-05', yerlesim: 'arkaya', yetisir: false } satisfies TerminDenemesiCevabi));
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText('İstenen termine yetişmiyor; teklife plan termini yazılır')).toBeTruthy();
    const dl = screen.getByLabelText('Termin sonucu');
    expect(within(dl).getByText('Termin (plandan)')).toBeTruthy();
    expect(within(dl).getByText('14.07.2099')).toBeTruthy();
    expect(within(dl).getByText('İstenen')).toBeTruthy();
    expect(within(dl).getByText('05.07.2099')).toBeTruthy();
    expect(screen.queryByText('Plancı onayı gerekir')).toBeNull();
  });

  it('3355: firması belirlenmemiş fason adımlı kalemde termin tahminidir; adım notu ve uyarı yazılır, termin yine hesaplanır', async () => {
    const not = 'OP 90 Kaplama: firma belirlenmedi; 7 gün ile (Motor ayarları > Fason süresi) hesaplandı';
    kur(SATISCI, () => ({ ...DENEME, kalemler: [{ ...DENEME.kalemler[0]!, fasonNotu: [not] }] } satisfies TerminDenemesiCevabi));
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText('Fason firması belirlenmedi')).toBeTruthy();
    const dl = screen.getByLabelText('Termin sonucu');
    expect(within(dl).getByText('Termin (plandan, tahmini)')).toBeTruthy();
    expect(within(dl).getByText('14.07.2099')).toBeTruthy();
    const liste = screen.getByRole('list', { name: 'Firması belirlenmemiş fason adımlar' });
    expect(within(liste).getByText(`1. Deneme Mil 20mm · ${not}`)).toBeTruthy();
    cleanup();
    kur(SATISCI);
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(within(await screen.findByLabelText('Termin sonucu')).getByText('Termin (plandan)')).toBeTruthy();
    expect(screen.queryByText('Fason firması belirlenmedi')).toBeNull();
  });

  it('arkaya ekleme: termin plandan ve geçerlilikten gün olarak yazılır; fiyat maliyet artı kârla önerilir; sürüm plan taslağıyla gider', async () => {
    const istekler = kur(SATISCI);
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText('14.07.2099')).toBeTruthy();
    expect(screen.getByText('Geçerlilik tarihinden itibaren 14 gün')).toBeTruthy();
    expect(screen.getByText('Malzeme satın alma ister')).toBeTruthy();
    const birim = screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/) as HTMLInputElement;
    await waitFor(() => expect(birim.value).toBe('12,50'));
    fireEvent.click(screen.getByRole('button', { name: '%40' }));
    await waitFor(() => expect(birim.value).toBe('14,00'));
    expect(screen.queryByRole('table', { name: 'Maliyet dökümü' })).toBeNull();
    // Alt çubukta teklif ve iskontolu tutar sürekli görünür.
    expect(within(screen.getByLabelText('Tutar')).getAllByText('560,00 TRY')).toHaveLength(2);
    // Varsayılan yerleşim planın arkasına ekle; istenen termin isteğe bağlıdır.
    expect((screen.getByLabelText('Planın arkasına ekle') as HTMLInputElement).checked).toBe(true);
    expect(istekler.some((i) => i.yol === '/siparisler/teklifler/21/termin-denemesi?yerlesim=arkaya')).toBe(true);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Devam' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    expect(await screen.findAllByText(/geçerlilik tarihi zorunlu/)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Geçerlilik tarihi'), { target: { value: '2099-06-30' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/siparisler/teklifler/21/termin-denemesi?gecerlilik=2099-06-30&yerlesim=arkaya')).toBe(true));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Devam' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    expect(await screen.findByRole('tab', { name: '4 Koşullar ve gönder', selected: true })).toBeTruthy();
    expect(screen.queryByLabelText('Teslim süresi (gün)')).toBeNull();
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({
      yol: '/siparisler/teklifler/21/surum-ver',
      govde: { surum: 4, fiyatlar: [{ satirId: 11, birimFiyat: '14.00' }], gecerlilik: '2099-06-30', teslimGun: null, terminTarihi: null, planTaslagi: { karOrani: '40', istenenTermin: null, yerlesim: 'arkaya' } },
    });
  });

  it('terminden geriye: istenen termin ve yerleşim sorguya gider; geciken sipariş ve plancı onayı yazılır; sürüm yerleşimle gider', async () => {
    const istekler = kur(SATISCI, (yol) => (yol.includes('istenenTermin=2099-07-05') ? KAYAN : DENEME));
    ac('/siparisler/teklifler/21/teklif-ver');
    await screen.findByText('14.07.2099');
    fireEvent.change(screen.getByLabelText('Geçerlilik tarihi'), { target: { value: '2099-06-30' } });
    fireEvent.click(screen.getByLabelText('Terminden geriye'));
    // Talepteki istenen teslim tarihi başlangıç önerisidir.
    expect((screen.getByLabelText(/^İstenen termin/) as HTMLInputElement).value).toBe('2026-11-15');
    fireEvent.change(screen.getByLabelText(/^İstenen termin/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    expect(await screen.findAllByText('Terminden geriye yerleşimde istenen termin zorunlu.')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText(/^İstenen termin/), { target: { value: '2099-07-05' } });
    expect(await screen.findByText('1 sipariş terminini kaçırır')).toBeTruthy();
    expect(screen.getByText('Plancı onayı gerekir')).toBeTruthy();
    expect(screen.getByText('Plan bu termine yetişmiyor')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Bitişi değişen siparişler' })).getByText('Gecikir')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/siparisler/teklifler/21/termin-denemesi?gecerlilik=2099-06-30&istenenTermin=2099-07-05&yerlesim=geriye')).toBe(true);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Devam' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ planTaslagi: { karOrani: '25', istenenTermin: '2099-07-05', yerlesim: 'geriye' } });
  });

  it('3326 plandan gün seçilir: arkaya eklemede istenen termin, seçilen günde başlatmada başlangıç günü olur; sürüm başlangıçla gider', async () => {
    const istekler = kur(SATISCI, (yol) => (yol.includes('yerlesim=baslat')
      ? { ...SERITLI, yerlesim: 'baslat', baslangic: '2099-07-06', termin: '2099-07-16', planTermini: '2099-07-16', kayanlar: KAYAN.kayanlar } satisfies TerminDenemesiCevabi
      : SERITLI));
    ac('/siparisler/teklifler/21/teklif-ver');
    fireEvent.change(await screen.findByLabelText('Geçerlilik tarihi'), { target: { value: '2099-06-30' } });
    const girdi = (ad: RegExp) => screen.getAllByLabelText(ad).find((e): e is HTMLInputElement => e instanceof HTMLInputElement)!;
    const gun = async (etiket: string, tarih: RegExp) => within(await screen.findByRole('group', { name: etiket })).getByRole('button', { name: tarih });
    fireEvent.click(await gun('İstenen termin seç', /^03\.07\.2099/));
    expect(girdi(/^İstenen termin/).value).toBe('2099-07-03');
    await waitFor(() => expect(istekler.some((i) => i.yol.endsWith('istenenTermin=2099-07-03&yerlesim=arkaya'))).toBe(true));
    // Aynı güne yeniden tıklama arkaya eklemede seçimi kaldırır.
    fireEvent.click(await gun('İstenen termin seç', /^03\.07\.2099/));
    expect(girdi(/^İstenen termin/).value).toBe('');
    fireEvent.click(screen.getByLabelText('Seçilen günde başlat'));
    expect(girdi(/^Başlangıç günü/).value).toBe('');
    expect(istekler.some((i) => i.yol.includes('yerlesim=baslat'))).toBe(false);
    fireEvent.click(await gun('Başlangıç', /^06\.07\.2099/));
    expect(girdi(/^Başlangıç günü/).value).toBe('2099-07-06');
    await waitFor(() => expect(istekler.some((i) => i.yol.endsWith('gecerlilik=2099-06-30&yerlesim=baslat&baslangic=2099-07-06'))).toBe(true));
    await waitFor(() => expect(within(screen.getByLabelText('Termin sonucu')).getByText('Başlangıç')).toBeTruthy());
    // Kapalı gün adıyla söylenir; seçilen günde başlatmada kayan listesi ve onay kutusu yoktur.
    expect(within(screen.getByRole('group', { name: 'Başlangıç' })).getByRole('button', { name: /^05\.07\.2099 .*kapalı gün$/ })).toBeTruthy();
    expect(screen.queryByText(/terminini kaçırır/)).toBeNull();
    expect(screen.queryByRole('table', { name: 'Bitişi değişen siparişler' })).toBeNull();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Devam' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    // Teslim süresi yazılamıyorsa nedeni yazılır (uydurma termin 2099, bir yıldan uzak).
    expect(within(await screen.findByLabelText('Termin ve teslim süresi')).getByText('Termin bir yıldan uzak; gün yazılmaz')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ planTaslagi: { istenenTermin: null, yerlesim: 'baslat', baslangic: '2099-07-06' } });
  });

  it('3326 seçilen günde başlatmada istenen termine yetişmeyince teklife plan termini yazılır; "Plan bu termine yetişmiyor" yazılmaz', async () => {
    kur(SATISCI, () => ({ ...DENEME, istenenTermin: '2099-07-05', yerlesim: 'baslat', baslangic: '2099-07-06', yetisir: false } satisfies TerminDenemesiCevabi));
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText('İstenen termine yetişmiyor; teklife plan termini yazılır')).toBeTruthy();
    expect(screen.queryByText('Plan bu termine yetişmiyor')).toBeNull();
  });

  // Teslim süresi bugünden termine takvim günüdür; bugün sabitlenir (2099-06-20, İstanbul).
  const bugunSabit = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-06-20T09:00:00Z')); };
  const TALEPLI = { ...TEKLIF_KARTLI, istenenTarih: '2099-07-20' } satisfies TeklifAyrintisi;

  it('3326 koşullar ve gönder, planlı: termin ve teslim süresi plandan, talepte istenen ayrıca; sürüm teslim süresiyle gider', async () => {
    bugunSabit();
    try {
      const istekler = kur(SATISCI, () => DENEME, TALEPLI);
      ac('/siparisler/teklifler/21/teklif-ver');
      fireEvent.change(await screen.findByLabelText('Geçerlilik tarihi'), { target: { value: '2099-06-30' } });
      await waitFor(() => expect((screen.getByRole('button', { name: 'Devam' }) as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
      const kutu = await screen.findByLabelText('Termin ve teslim süresi');
      expect(within(kutu).getByText('14.07.2099')).toBeTruthy();
      expect(within(kutu).getByText('Plandan')).toBeTruthy();
      expect(within(kutu).getByText('24 gün')).toBeTruthy();
      expect(within(kutu).getByText('Talepte istenen')).toBeTruthy();
      expect(within(kutu).getByText('20.07.2099')).toBeTruthy();
      expect(screen.queryByLabelText('Teslim süresi (gün)')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
      await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
      expect(yazmalar(istekler)[0]?.govde).toMatchObject({ teslimGun: 24, planTaslagi: { yerlesim: 'arkaya' } });
    } finally { vi.useRealTimers(); }
  });

  it('3326 koşullar ve gönder, plansız: ilk sürümde termin talepteki tarihten başlar; süre termini, termin süreyi doldurur', async () => {
    bugunSabit();
    try {
      const istekler = kur(SATISCI, () => ({ ...DENEME, durum: 'cozucu-yok', planSurumu: null, planTermini: null, termin: null, terminGun: null, maliyetToplami: null, kalemler: [] }), TALEPLI);
      ac('/siparisler/teklifler/21/teklif-ver');
      expect(await screen.findByText('Termin denemesi kullanılamıyor')).toBeTruthy();
      fireEvent.change(screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '11' } });
      fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
      const termin = await screen.findByLabelText<HTMLInputElement>('Termin tarihi');
      const sure = screen.getByLabelText<HTMLInputElement>('Teslim süresi (gün)');
      expect(termin.value).toBe('2099-07-20');
      expect(sure.value).toBe('30');
      fireEvent.change(sure, { target: { value: '10' } });
      expect(termin.value).toBe('2099-06-30');
      fireEvent.change(termin, { target: { value: '2099-07-05' } });
      expect(sure.value).toBe('15');
      fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
      await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
      expect(yazmalar(istekler)[0]?.govde).toMatchObject({ teslimGun: 15, terminTarihi: '2099-07-05', planTaslagi: null });
    } finally { vi.useRealTimers(); }
  });

  it('seçilen günde başlatmada başlangıç günü zorunlu', async () => {
    kur(SATISCI, () => DENEME);
    ac('/siparisler/teklifler/21/teklif-ver');
    fireEvent.change(await screen.findByLabelText('Geçerlilik tarihi'), { target: { value: '2099-06-30' } });
    fireEvent.click(screen.getByLabelText('Seçilen günde başlat'));
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    expect(await screen.findAllByText('Seçilen günde başlatmada başlangıç günü zorunlu.')).toHaveLength(2);
  });

  it('maliyet dökümü yalnız maliyet okuyana görünür; deneme taslağı kârla kaydedilir', async () => {
    const istekler = kur(MUDUR, () => DOKUMLU);
    ac('/siparisler/teklifler/21/teklif-ver');
    const dokum = await screen.findByRole('table', { name: 'Maliyet dökümü' });
    expect(within(dokum).getByText('300,00 TRY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deneme taslağı kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/teklifler/21/deneme-taslagi', govde: { karOrani: '25', istenenTermin: null, yerlesim: 'arkaya' } });
  });

  it('2661 a, 2669 b: gizli oranlı ayda maliyet ve genel gider "Gizli", fiyat önerilmez ve neden yazılır', async () => {
    const gizli = {
      ...DENEME, genelGiderGizli: true, genelGiderSaatBasi: null, maliyetToplami: null,
      kalemler: [{
        ...DENEME.kalemler[0]!, birimMaliyet: null, toplamMaliyet: null,
        dokum: [{ tur: 'isleme', ad: '10', tezgah: 'T1', saat: '2.00', tutar: null }, { tur: 'genel-gider', ad: 'Genel gider', tezgah: null, saat: '2.00', tutar: null }],
      }],
    } satisfies TerminDenemesiCevabi;
    const adet = { ...ADET, genelGiderGizli: true, satirlar: ADET.satirlar.map((r) => ({ ...r, maliyetToplami: null, kalemler: r.kalemler.map((k) => ({ ...k, birimMaliyet: null })) })) };
    kur(MUDUR, () => gizli, TEKLIF_KARTLI, adet);
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText(/Fiyat önerisi yok: genel gider oranı gizli/)).toBeTruthy();
    const dokum = screen.getByRole('table', { name: 'Maliyet dökümü' });
    expect(within(within(dokum).getByText(/Genel gider/).closest('tr')!).getByText('Gizli')).toBeTruthy();
    expect(within(dokum).queryByText(/TRY/)).toBeNull();
    expect(within(dokum).getAllByText('Gizli')).toHaveLength(2);
    const ozet = screen.getByLabelText('Fiyat özeti');
    expect(within(ozet).getAllByText('Gizli').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Maliyeti bilinmeyen kalem var/)).toBeNull();
    const adetTablosu = await screen.findByRole('table', { name: 'Adet değişirse' });
    expect(within(adetTablosu).getAllByText('Gizli').length).toBeGreaterThan(0);
  });

  it('3301: maliyeti hesaplanamayan kalemde kâr fiyata eklenmez ve bu, kalemde ve kâr seçiminin altında eksiğiyle yazılır', async () => {
    const eksik = {
      ...DENEME, maliyetToplami: null,
      kalemler: [{ ...DENEME.kalemler[0]!, birimMaliyet: null, toplamMaliyet: null, eksikVeri: ['T1 saat ücreti'] }],
    } satisfies TerminDenemesiCevabi;
    kur(SATISCI, () => eksik);
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText('Kâr 1 kalemin fiyatına eklenmedi')).toBeTruthy();
    expect(screen.getByText(/eksik: T1 saat ücreti/)).toBeTruthy();
    expect(screen.getByText('Maliyet yok: kâr eklenmez, elle fiyat')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '%40' }));
    expect((screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/) as HTMLInputElement).value).toBe('');
  });

  it('3401-1 a: maliyet görmeyen satışçıda maliyet toplamı, kâr oranı ve maliyet sütunları kilitli; fiyat elle girilir, sürüm gider', async () => {
    const kilitli = {
      ...DENEME, maliyetToplami: null,
      kalemler: [{ ...DENEME.kalemler[0]!, birimMaliyet: null, toplamMaliyet: null }],
    } satisfies TerminDenemesiCevabi;
    const adet = { ...ADET, satirlar: ADET.satirlar.map((r) => ({ ...r, maliyetToplami: null, kalemler: r.kalemler.map((k) => ({ ...k, birimMaliyet: null })) })) };
    const istekler = kur(SATISCI_KILITLI, () => kilitli, TEKLIF_KARTLI, adet);
    ac('/siparisler/teklifler/21/teklif-ver');
    const ozet = await screen.findByLabelText('Fiyat özeti');
    const kilit = 'Yetkiniz yok: Maliyet görür';
    expect(within(within(ozet).getByText('Maliyet toplamı').closest('div')!).getByLabelText(kilit)).toBeTruthy();
    expect(within(within(ozet).getByText('Net kâr (iskontosuz)').closest('div')!).getByLabelText(kilit)).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Kâr oranı' })).getByLabelText(kilit)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '%40' })).toBeNull();
    expect(screen.queryByLabelText(/^Başka oran/)).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Birim maliyet' })).toBeNull();
    expect(screen.queryByText(/Maliyet yok: kâr eklenmez/)).toBeNull();
    expect(screen.queryByText(/Kâr \d+ kalemin fiyatına eklenmedi/)).toBeNull();
    const adetTablosu = await screen.findByRole('table', { name: 'Adet değişirse' });
    expect(within(adetTablosu).queryByRole('columnheader', { name: /maliyet|fiyat/i })).toBeNull();
    expect(screen.getByText(/Birim maliyet, fiyat önerisi ve toplam sütunları yetkinizde değil/)).toBeTruthy();
    // Fiyat önerilmez; satışçı elle yazar ve sürüm gider (kâr alanı doğrulamaya girmez).
    const fiyat = screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/) as HTMLInputElement;
    expect(fiyat.value).toBe('');
    fireEvent.change(fiyat, { target: { value: '15,5' } });
    expect(screen.queryByText('Kâr en çok iki ondalıklı bir yüzde olmalı.')).toBeNull();
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('motor bağlı değilse elle: termin tarihi ve fiyat elle girilir, plan taslağı gitmez', async () => {
    const istekler = kur(SATISCI, () => ({ ...DENEME, durum: 'cozucu-yok', planSurumu: null, planTermini: null, termin: null, terminGun: null, maliyetToplami: null, kalemler: [] }));
    ac('/siparisler/teklifler/21/teklif-ver');
    expect(await screen.findByText('Termin denemesi kullanılamıyor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(await screen.findByLabelText('Termin tarihi'), { target: { value: '2099-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ fiyatlar: [{ satirId: 11, birimFiyat: '11' }], terminTarihi: '2099-08-01', planTaslagi: null });
  });

  it('63 b: termin onayı bekleyen teklifte plancı termini onaylar; plan taslakları görünür', async () => {
    const bekleyen = { ...TEKLIF_VERILDI, durum: 'onay-bekliyor', surumler: [{ ...SURUM_1, iskontoOrani: '5.00', terminTarihi: '2099-07-05' }] } satisfies TeklifAyrintisi;
    const TASLAK = {
      id: 3, teklifId: 21, surumNo: 1, tur: 'satis', gorunum: 'onay-bekliyor', planSurumu: '412', gecerlilik: '2099-06-30', istenenTermin: '2099-07-05', yerlesim: 'geriye', baslangic: null, planTermini: '2099-07-14',
      termin: '2099-07-05', karOrani: null, maliyetToplami: null, kayanSayisi: 1, gecikenSayisi: 1, onayGerekli: true, onaylayan: null, onayAni: null,
      olusturan: 'Deneme Satisci', olusturma: '2026-10-21T09:00:00+03:00',
    } satisfies PlanTaslaklariCevabi['taslaklar'][number];
    const istekler = sunucuKur(PLANLAMACI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, bekleyen);
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21/plan-taslaklari') return json(200, { taslaklar: [TASLAK] } satisfies PlanTaslaklariCevabi);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/termin-onayla') return json(200, TEKLIF_VERILDI);
      if (yontem === 'GET' && yol === '/siparisler/satis-taslaklari') return json(200, { taslaklar: [] } satisfies AtolyeTaslaklariCevabi);
      return undefined;
    });
    ac('/siparisler/teklifler/21');
    expect(await screen.findByText('Termin onayı bekliyor')).toBeTruthy();
    expect(screen.queryByText('İskonto onayı bekliyor')).toBeNull();
    expect(screen.getByText('Plancı onayı bekliyor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Termini onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Termini onayla' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/teklifler/21/termin-onayla', govde: { surum: 4 } });
  });
});

// 3359-1: başlıktaki cari hazırlığı, belgenin Logo durumu (belge-durumlari) gelmeden ya da hata dönmeden sorulmaz;
// Logo'daki belge için boşuna sorulmasın. Cevaplar uydurmadır.
describe('Başlıkta cari Logo hazırlığı belgenin Logo durumunu bekler (3359-1)', () => {
  function logoKur(): { istekler: Istek[]; coz: (r: Response) => void } {
    const istekler = sunucuKur(FIYAT_OKUYUCU);
    const onceki = globalThis.fetch;
    let coz: (r: Response) => void = () => undefined;
    const bekleyen = new Promise<Response>((c) => { coz = c; });
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      if (yol.startsWith('/logo/belge-durumlari?')) { istekler.push({ yontem: 'GET', yol, govde: undefined, baslik: {} }); return bekleyen; }
      if (yol.startsWith('/logo/cari-hazirligi?')) { istekler.push({ yontem: 'GET', yol, govde: undefined, baslik: {} }); return json(200, { durum: 'cari-yok', neden: null }); }
      return onceki(adres, secenek);
    }));
    return { istekler, coz };
  }
  const hazirlikSorulan = (istekler: Istek[]) => istekler.filter((i) => i.yol.startsWith('/logo/cari-hazirligi?')).map((i) => i.yol);

  for (const [ad, adres, belge] of [['satış siparişi', '/siparisler/5', 5], ['teklif', '/siparisler/teklifler/21', 21]] as const) {
    it(`${ad}: Logo durumu beklenirken sorulmaz; "Sırada" gelince sorulur`, async () => {
      const { istekler, coz } = logoKur();
      ac(adres);
      await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/logo/belge-durumlari?'))).toBe(true));
      await screen.findAllByText(/Deneme/);
      await new Promise((r) => setTimeout(r, 30));
      expect(hazirlikSorulan(istekler)).toEqual([]);
      coz(json(200, { durumlar: [{ id: belge, durum: 'sirada', kayitNo: null, neden: null }] }));
      await waitFor(() => expect(hazirlikSorulan(istekler)).toEqual(['/logo/cari-hazirligi?firma=7']));
      expect(await screen.findByText('Logo cari yok')).toBeTruthy();
    });

    it(`${ad}: Logo durumu okunamazsa yine sorulur`, async () => {
      const { istekler, coz } = logoKur();
      ac(adres);
      coz(json(500, { kod: 'IC_HATA', mesaj: 'Deneme hata' }));
      await waitFor(() => expect(hazirlikSorulan(istekler)).toEqual(['/logo/cari-hazirligi?firma=7']));
    });
  }
});
