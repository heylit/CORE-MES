import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { FirmaSecimCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { SiparisBandiCevabi, SiparisCarpaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { Proje, SiparisProjeleriCevabi } from '#paylasilan/sozlesme/projeler.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  AdetDenemesiCevabi, AtolyeTaslaklariCevabi, MalzemeSecenekleriCevabi, PlanTaslaklariCevabi, Siparis, SiparisAyrintisi, SiparisListesiCevabi, SiparisDonusumCevabi, Teklif, TeklifAyrintiCevabi, TeklifAyrintisi,
  TeklifListesiCevabi, TerminDenemesiCevabi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

const KOK: Islem[] = ['sayfa.siparisler', 'siparisler.oku'];
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: KOK };
const YAZAR: Kullanici = { id: 3, ad: 'Deneme Yazar', islemler: [...KOK, 'siparisler.yaz'] };
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: [...KOK, 'siparisler.yaz', 'siparisler.onayla', 'siparisler.fiyat-oku'] };
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
  id: 50, sira: 1, malzemeNo: 31, malzemeKodu: 'DNM-001', malzemeAdi: 'Deneme Braket', birim: 'adet', miktar: '100', birimFiyat: '12.5000',
  tutar: '1250.00', termin: null, aciklama: null,
};
const AYRINTI_TASLAK = { ...SIPARIS_TASLAK, satirlar: [SATIR] } satisfies SiparisAyrintisi;
const AYRINTI_ONAYLI = { ...AYRINTI_TASLAK, durum: 'onayli', onayZamani: '2026-10-02T10:00:00+03:00', surum: 3 } satisfies SiparisAyrintisi;

const TEKLIF_SATIR = { id: 11, sira: 1, malzemeNo: null, malzemeKodu: null, tanim: 'Deneme Mil 20mm', birim: null, miktar: '40' };
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
  satirlar: [{ no: 31, kod: 'DNM-001', ad: 'Deneme Braket', tur: 'mamul', birim: 'adet' }, { no: 32, kod: 'DNM-002', ad: 'Deneme Mil', tur: 'mamul', birim: 'adet' }],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
} satisfies MalzemeSecenekleriCevabi;

// 195 a: elle çarpan Plan uçlarında; kayıt yoksa geçerli null.
const CARPAN_YOK = { siparisId: 5, gecerli: null, gecmis: [] } satisfies SiparisCarpaniCevabi;
const CARPAN_KAYDI = { carpan: 1.5, gerekce: 'Deneme gerekce', kisiId: 4, kisiAdi: 'Deneme Planlamaci', zaman: '2026-10-03T09:00:00+03:00' };
const CARPAN_VAR = {
  siparisId: 5, gecerli: CARPAN_KAYDI, gecmis: [CARPAN_KAYDI, { ...CARPAN_KAYDI, carpan: 1.2, gerekce: 'Ilk deneme', zaman: '2026-10-02T09:00:00+03:00' }],
} satisfies SiparisCarpaniCevabi;
const PLANLAMACI: Kullanici = { id: 4, ad: 'Deneme Planlamaci', islemler: [...KOK, 'plan.yaz'] };

// 148 a: çarpan plan taslağına yazılır; cevap planın kendisidir, burada yalnız taslak kimliği okunur.
const TASLAGA_YAZILDI = { taslak: { id: 9, surum: 1 } };
// 306 a: bant Plan ucundadır; örnekte eşik 337,5, 225 ve 315 ikisi de Normal.
const bantVerisi = (bedel: number, sinif: 'yuksek' | 'normal' | 'dusuk') => ({
  siparisId: 5, bant: { yuksekSiniri: 337.5, dusukSiniri: 100, emirler: [{ uretimEmriId: 9, emirNo: 'UE-DNM-9', bedel, sinif }] },
}) satisfies SiparisBandiCevabi;

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
      if (/^\/plan\/siparisler\/\d+\/carpan$/.test(yol)) return json(200, CARPAN_YOK);
      if (/^\/plan\/siparisler\/\d+\/bant$/.test(yol)) return json(200, bantVerisi(225, 'normal'));
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
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

  it('fiyat yetkisi olmayan kalem ve miktarı görür; fiyat, tutar ve toplamlar gizlenir (180)', async () => {
    const istekler = sunucuKur(OKUYUCU, (yontem, yol) => (yontem === 'GET' && yol === '/siparisler/5' ? json(200, AYRINTI_FIYATSIZ) : undefined));
    ac('/siparisler/5');
    await screen.findByText('Deneme Braket');
    await oturumCozuldu(istekler);
    expect(screen.getByText('100 adet')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Birim fiyat' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Tutar' })).toBeNull();
    expect(screen.queryByText('Genel toplam')).toBeNull();
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
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
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
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
    expect((await within(pencere).findByRole('alert')).textContent).toBe('Onaylı sipariş onaylanamaz.');
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
    baslangic: null, bitis: '2026-10-30', aciklama: null, olusturma: '2026-10-03T09:00:00+03:00', guncelleme: null, surum: 1,
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

describe('Sipariş ayrıntısında elle çarpan (195 a)', () => {
  const carpanVar: Ozel = (yontem, yol) => (yontem === 'GET' && yol === '/plan/siparisler/5/carpan' ? json(200, CARPAN_VAR) : undefined);

  it('geçerli çarpan ve geçmiş gerekçe ve kişiyle görünür; fiyatı gören ama çarpan veremeyen değiştirme düğmesi görmez', async () => {
    const istekler = sunucuKur(FIYAT_OKUYUCU, carpanVar);
    ac('/siparisler/5');
    const kart = (await screen.findByRole('heading', { name: 'Öncelik çarpanı' })).closest('section')!;
    expect(await within(kart).findByText('Ilk deneme')).toBeTruthy();
    expect(within(kart).getAllByText('Deneme gerekce').length).toBeGreaterThan(0);
    expect(within(kart).getByText('×1,5', { selector: 'strong' })).toBeTruthy();
    expect(within(kart).getByText('×1,2')).toBeTruthy();
    await oturumCozuldu(istekler);
    expect(within(kart).queryByRole('button', { name: 'Çarpan ver' })).toBeNull();
  });

  it('çarpan okuma yetkisi olmayana kart çizilmez, istek gitmez (237 a)', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/siparisler/5');
    await screen.findByText('Deneme Braket');
    await oturumCozuldu(istekler);
    expect(screen.queryByRole('heading', { name: 'Öncelik çarpanı' })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/plan/'))).toBe(false);
  });

  it('kayıt yoksa çarpanın 1 sayıldığı yazılır', async () => {
    sunucuKur(FIYAT_OKUYUCU);
    ac('/siparisler/5');
    expect(await screen.findByText('Elle çarpan verilmedi; plan çarpanı 1 sayar.')).toBeTruthy();
  });

  it('planlamacı 2 üstünde uyarı görür; gerekçesiz istek gitmez; çarpan ve gerekçe yeni plan taslağına gider (148 a)', async () => {
    const istekler = sunucuKur(PLANLAMACI, (yontem, yol) => (yontem === 'POST' && yol === '/plan/siparisler/5/carpan' ? json(200, TASLAGA_YAZILDI) : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Çarpan ver' }));
    const pencere = await screen.findByRole('dialog', { name: 'Öncelik çarpanı ver' });
    fireEvent.change(within(pencere).getByLabelText(/Çarpan/), { target: { value: '2,5' } });
    expect(within(pencere).getByText('Planlama en çok 2 verebilir; üstü müdür onayıyla girer.')).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/Çarpan/), { target: { value: '1,5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Gerekçe yaz.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Deneme gerekce' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/plan/siparisler/5/carpan', govde: { carpan: 1.5, gerekce: 'Deneme gerekce', taslak: null } });
    expect(yazmalar(istekler)[0]!.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/Yeni çarpan plan taslağında; taslak onaylanıp canlıya alınınca geçerli olur\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Plan stüdyosu' }).getAttribute('href')).toBe('/recete-rota/studio');
    expect(screen.getByText('Elle çarpan verilmedi; plan çarpanı 1 sayar.')).toBeTruthy();
  });

  it('306 a: bant görünür; kayıttan sonra canlı bant taslağınkiyle karşılaştırılır: aşmazsa "değişmez" ve eşik, aşarsa değişim yazılır', async () => {
    const kaydet = async (taslakBandi: SiparisBandiCevabi) => {
      sunucuKur(PLANLAMACI, (yontem, yol) => {
        if (yontem === 'POST' && yol === '/plan/siparisler/5/carpan') return json(200, TASLAGA_YAZILDI);
        if (yontem === 'GET' && yol === '/plan/siparisler/5/bant?taslak=9') return json(200, taslakBandi);
        return undefined;
      });
      ac('/siparisler/5');
      expect(await screen.findByText('Bant: UE-DNM-9 Normal (225 TL/saat).')).toBeTruthy();
      fireEvent.click(await screen.findByRole('button', { name: 'Çarpan ver' }));
      const pencere = await screen.findByRole('dialog', { name: 'Öncelik çarpanı ver' });
      fireEvent.change(within(pencere).getByLabelText(/Çarpan/), { target: { value: '1,4' } });
      fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Deneme gerekce' } });
      fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    };
    await kaydet(bantVerisi(315, 'normal'));
    expect(await screen.findByText('Taslakta bant değişmez: UE-DNM-9 Normal (315 TL/saat). Yüksek için bedel 337,5 TL/saat ve üstü, Düşük için 100 TL/saat ve altı olmalı.')).toBeTruthy();
    cleanup();
    await kaydet(bantVerisi(450, 'yuksek'));
    expect(await screen.findByText('Taslakta bant değişir: UE-DNM-9 Normal → Yüksek.')).toBeTruthy();
  });

  it('planda emri olmayan siparişte bant hesaplanmadığı yazılır', async () => {
    sunucuKur(FIYAT_OKUYUCU, (yontem, yol) => (yontem === 'GET' && yol === '/plan/siparisler/5/bant' ? json(200, { siparisId: 5, bant: null }) : undefined));
    ac('/siparisler/5');
    expect(await screen.findByText('Planda bu siparişin emri yok; bant hesaplanmadı.')).toBeTruthy();
  });

  it('sunucunun yetki reddi pencerede yazılır', async () => {
    sunucuKur(PLANLAMACI, (yontem, yol) => (yontem === 'POST' && yol === '/plan/siparisler/5/carpan'
      ? hata(403, { kod: 'YETKI_YOK', mesaj: 'Çarpanı en çok 2 verebilirsiniz; üstü müdür onayıyla girer.' })
      : undefined));
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Çarpan ver' }));
    const pencere = await screen.findByRole('dialog', { name: 'Öncelik çarpanı ver' });
    fireEvent.change(within(pencere).getByLabelText(/Çarpan/), { target: { value: '2,5' } });
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Deneme gerekce' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect((await within(pencere).findByRole('alert', {}, { timeout: 3000 })).textContent).toBe('Çarpanı en çok 2 verebilirsiniz; üstü müdür onayıyla girer.');
  });

  it('müdür 3e kadar uyarısız girer; 3 üstü ve üç ondalık reddedilir', async () => {
    const istekler = sunucuKur(YONETICI);
    ac('/siparisler/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Çarpan ver' }));
    const pencere = await screen.findByRole('dialog', { name: 'Öncelik çarpanı ver' });
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Deneme gerekce' } });
    fireEvent.change(within(pencere).getByLabelText(/Çarpan/), { target: { value: '2,5' } });
    expect(within(pencere).queryByText(/müdür onayıyla/)).toBeNull();
    fireEvent.change(within(pencere).getByLabelText(/Çarpan/), { target: { value: '3,5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Çarpan 0,5-3 olmalı.')).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/Çarpan/), { target: { value: '1,255' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Çarpan en çok iki ondalık olmalı.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
  });
});

describe('Yeni satış siparişi', () => {
  it('firma ve kart kimlikle seçilir; gövde tekrar korumalı gider ve ayrıntıya geçilir', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/ekle' ? json(200, AYRINTI_TASLAK) : undefined));
    ac('/siparisler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.change(screen.getByLabelText(/^Müşteri( \*)?$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Termin/), { target: { value: '2026-12-31' } });
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
    fireEvent.change(screen.getByLabelText(/^Termin/), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme kartı seç' }));
    fireEvent.click(await screen.findByText('Deneme Braket'));
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ satirlar: [{ malzemeNo: 31, miktar: '3', birimFiyat: null }] });
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
    fireEvent.change(screen.getByLabelText(/^Termin/), { target: { value: '2026-12-31' } });
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

  it('ödeme vadesi gün olarak gider; boşsa null, kesirli değer istemcide yakalanır (205 a)', async () => {
    const vadeli = { ...AYRINTI_TASLAK, odemeVadesiGun: 60 } satisfies SiparisAyrintisi;
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/5') return json(200, vadeli);
      return yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, vadeli) : undefined;
    });
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    const vade = screen.getByLabelText(/^Ödeme vadesi/) as HTMLInputElement;
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
    const istekler = sunucuKur(YAZAR, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/5') return json(200, cezali);
      return yontem === 'POST' && yol === '/siparisler/5/guncelle' ? json(200, cezali) : undefined;
    });
    ac('/siparisler/5/duzenle');
    await screen.findByText('Düzenle: SS-2026-0005');
    expect((screen.getByLabelText(/^Gecikme cezası/) as HTMLInputElement).value).toBe('0,1');
    fireEvent.change(screen.getByLabelText(/^Ceza tavanı/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ cezaOraniGun: '0.1', cezaTavaniOrani: null });
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
  });

  it('okuyan teklifte işlem düğmesi ve sürüm formu görmez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/siparisler/teklifler/21');
    await screen.findAllByText('Deneme Mil 20mm');
    await oturumCozuldu(istekler);
    for (const ad of ['Müşteri kabulünü kaydet', 'Revizyon iste', 'Reddet']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Sürüm formu' })).toBeNull();
  });

  it('yeni teklifte ilk sürüm: virgüllü fiyat noktalı gider, önceki sürüm yokken form boş açılır', async () => {
    const istekler = sunucuKur(FIYATCI, (yontem, yol) => {
      if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, TEKLIF_YENI);
      if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return json(200, TEKLIF_VERILDI);
      return undefined;
    });
    ac('/siparisler/teklifler/21');
    const birim = await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/);
    expect((birim as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    expect(await screen.findByText('Birim fiyat zorunlu.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(birim, { target: { value: '10,5' } });
    fireEvent.change(screen.getByLabelText('Teslim süresi (gün)'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({
      yol: '/siparisler/teklifler/21/surum-ver',
      govde: { surum: 4, fiyatlar: [{ satirId: 11, birimFiyat: '10.5' }], iskontoOrani: '0', teslimGun: 14, odemeKosulu: null, gecerlilik: null, aciklama: null },
    });
    await screen.findByText('Teklif müşteride');
  });

  it('verilmiş teklifte yeni sürüm formu önceki değerlerle dolu açılır', async () => {
    sunucuKur(FIYATCI);
    ac('/siparisler/teklifler/21');
    const birim = await screen.findByLabelText(/^Deneme Mil 20mm birim fiyat/);
    expect((birim as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Teslim süresi (gün)') as HTMLInputElement).value).toBe('14');
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
        return json(200, { ...TEKLIF_KABUL, satirlar: [{ ...TEKLIF_SATIR, malzemeNo: 31, malzemeKodu: 'DNM-001' }] } satisfies TeklifAyrintisi);
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
  });

  it('yeni teklif talebi: firma kimlikle, kartsız satır tanımla gider; istek kimliği taşır', async () => {
    const istekler = sunucuKur(YAZAR, (yontem, yol) => (yontem === 'POST' && yol === '/siparisler/teklifler/ekle' ? json(200, TEKLIF_YENI) : undefined));
    ac('/siparisler/teklifler/yeni');
    await screen.findByRole('option', { name: 'M-7 · Deneme Musteri A' });
    fireEvent.change(screen.getByLabelText(/^Müşteri( \*)?$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme braket ihtiyacı' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 tanım/), { target: { value: 'Deneme Mil 20mm' } });
    fireEvent.change(screen.getByLabelText(/^Kalem 1 miktar/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi aç' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const istek = yazmalar(istekler)[0]!;
    expect(istek.yol).toBe('/siparisler/teklifler/ekle');
    expect(istek.govde).toEqual({
      firmaId: 7, baslik: 'Deneme braket ihtiyacı', paraBirimi: 'TRY', istenenTarih: null, aciklama: null,
      satirlar: [{ malzemeNo: null, tanim: 'Deneme Mil 20mm', miktar: '40' }],
    });
    expect(Object.keys(istek.baslik).map((k) => k.toLowerCase())).toContain(ISTEK_KIMLIGI_BASLIGI.toLowerCase());
    await screen.findByText('Teklif müşteride');
  });

  it('teklif kalemi malzemeden seçilir: tanım kart adıyla dolar, kart değişince güncellenir, elle yazılan tanım korunur', async () => {
    sunucuKur(YAZAR);
    ac('/siparisler/teklifler/yeni');
    const tanim = await screen.findByLabelText(/^Kalem 1 tanım/);
    const sec = async (ad: string) => {
      fireEvent.click(screen.getByRole('button', { name: /^Malzeme(den seç|yi değiştir)$/ }));
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

  it('ilk sürümden sonra talep düzenlenmez', async () => {
    sunucuKur(YAZAR);
    ac('/siparisler/teklifler/21/duzenle');
    expect(await screen.findByText('Talep yalnız ilk sürüm verilmeden düzenlenir.')).toBeTruthy();
  });
});

describe('Teklif termin ve fiyat (44)', () => {
  // 65 a: satış rolü dener, fiyat ve maliyet toplamını görür; döküm maliyet okuyanda.
  const SATISCI: Kullanici = { id: 9, ad: 'Deneme Satisci', islemler: [...KOK, 'siparisler.yaz', 'siparisler.fiyat-oku', 'siparisler.termin-dene'] };
  const MUDUR: Kullanici = { ...SATISCI, islemler: [...SATISCI.islemler, 'siparisler.maliyet-oku'] };
  const KARTLI_SATIR = { ...TEKLIF_SATIR, malzemeNo: 31, malzemeKodu: 'DNM-001', birim: 'adet' };
  const TEKLIF_KARTLI = { ...TEKLIF_YENI, satirlar: [KARTLI_SATIR] } satisfies TeklifAyrintisi;
  const DENEME = {
    durum: 'hazir', planSurumu: '412', gecerlilik: '2099-06-30', istenenTermin: null, planTermini: '2099-07-14', termin: '2099-07-14', terminGun: 14,
    yetisir: null, onayGerekli: false, satinalmaGerekli: true,
    kalemler: [{
      satirId: 11, sira: 1, tanim: 'Deneme Mil 20mm', malzemeNo: 31, adet: '40', plansiz: false, yerlesti: true, bitis: '2099-07-10T16:00:00+03:00',
      planTermini: '2099-07-14', malzemeGelisi: '2099-07-03T08:00:00+03:00', satinalma: [{ kod: 'HM-DNM', miktar: '12.5', birim: 'kg', gelis: '2099-07-03T08:00:00+03:00' }],
      birimMaliyet: '10.0000', toplamMaliyet: '400.00', dokum: null, eksikVeri: [],
    }],
    maliyetToplami: '400.00', genelGiderSaatBasi: null, kayanlar: [], plan: null,
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
  const KAYAN = { ...DENEME, istenenTermin: '2099-07-05', termin: '2099-07-05', yetisir: false, onayGerekli: true,
    kayanlar: [{ siparis: 'SS-DNM-1', once: '2099-07-01T10:00:00+03:00', sonra: '2099-07-04T10:00:00+03:00', termin: '2099-07-02', gecikir: true }] } satisfies TerminDenemesiCevabi;

  const kur = (kullanici: Kullanici, deneme: (yol: string) => TerminDenemesiCevabi = () => DENEME, teklif: TeklifAyrintisi = TEKLIF_KARTLI) => sunucuKur(kullanici, (yontem, yol) => {
    if (yontem === 'GET' && yol === '/siparisler/teklifler/21') return json(200, teklif);
    if (yontem === 'GET' && yol.startsWith('/siparisler/teklifler/21/termin-denemesi')) return json(200, deneme(yol));
    if (yontem === 'GET' && yol === '/siparisler/teklifler/21/plan-taslaklari') return json(200, { taslaklar: [] } satisfies PlanTaslaklariCevabi);
    if (yontem === 'POST' && yol === '/siparisler/teklifler/21/surum-ver') return json(200, TEKLIF_VERILDI);
    if (yontem === 'POST' && yol === '/siparisler/teklifler/21/deneme-taslagi') return json(200, { taslaklar: [] } satisfies PlanTaslaklariCevabi);
    if (yontem === 'GET' && yol.startsWith('/siparisler/teklifler/21/adet-denemesi')) return json(200, ADET);
    if (yontem === 'GET' && yol === '/siparisler/satis-taslaklari') return json(200, ATOLYE);
    return undefined;
  });

  it('plan denemesi şeridi: tezgâh başına sipariş, satış taslağı ve bu teklif çizilir; fason yalnız işi varsa; plan verisi yoksa not', async () => {
    kur(SATISCI, () => SERITLI);
    ac('/siparisler/teklifler/21');
    const serit = await screen.findByRole('region', { name: 'Plan denemesi' });
    expect(within(serit).getByRole('img', { name: 'Deneme Torna: S-DNM-1, TK-2099-007, Bu teklif' })).toBeTruthy();
    expect(within(serit).queryByText('Deneme Fasoncu')).toBeNull();
    expect(within(serit).getByText('Gecikiyor')).toBeTruthy();
    cleanup();
    kur(SATISCI);
    ac('/siparisler/teklifler/21');
    expect(await screen.findByText('Planlama motoru plan verisi vermedi; şerit çizilmez.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Plan denemesi' })).toBeNull();
  });

  it('adet değişirse: yarım, aynı, iki, dört kat; birim fiyat maliyet artı seçili kâr; kâr değişince tablo da değişir', async () => {
    const istekler = kur(SATISCI);
    ac('/siparisler/teklifler/21');
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

  it('arkaya ekleme: termin plandan ve geçerlilikten gün olarak yazılır; fiyat maliyet artı kârla önerilir; sürüm plan taslağıyla gider', async () => {
    const istekler = kur(SATISCI);
    ac('/siparisler/teklifler/21');
    expect(await screen.findByText('14.07.2099')).toBeTruthy();
    expect(screen.getByText('Geçerlilik tarihinden itibaren 14 gün')).toBeTruthy();
    expect(screen.getByText('Malzeme satın alma ister')).toBeTruthy();
    const birim = screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/) as HTMLInputElement;
    await waitFor(() => expect(birim.value).toBe('12,50'));
    fireEvent.click(screen.getByRole('button', { name: '%40' }));
    await waitFor(() => expect(birim.value).toBe('14,00'));
    expect(screen.queryByRole('table', { name: 'Maliyet dökümü' })).toBeNull();
    expect(screen.queryByLabelText('Teslim süresi (gün)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    expect(await screen.findByText(/geçerlilik tarihi zorunlu/)).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Geçerlilik tarihi'), { target: { value: '2099-06-30' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/siparisler/teklifler/21/termin-denemesi?gecerlilik=2099-06-30')).toBe(true));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Teklifi ver' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({
      yol: '/siparisler/teklifler/21/surum-ver',
      govde: { surum: 4, fiyatlar: [{ satirId: 11, birimFiyat: '14.00' }], gecerlilik: '2099-06-30', teslimGun: null, terminTarihi: null, planTaslagi: { karOrani: '40', istenenTermin: null } },
    });
  });

  it('başka termin: istenen termin sorguya gider; geciken sipariş ve plancı onayı yazılır; sürüm istenen terminle gider', async () => {
    const istekler = kur(SATISCI, (yol) => (yol.includes('istenenTermin=2099-07-05') ? KAYAN : DENEME));
    ac('/siparisler/teklifler/21');
    await screen.findByText('14.07.2099');
    fireEvent.change(screen.getByLabelText('Geçerlilik tarihi'), { target: { value: '2099-06-30' } });
    fireEvent.click(screen.getByLabelText(/Başka termin/));
    fireEvent.change(screen.getByLabelText('İstenen termin'), { target: { value: '2099-07-05' } });
    expect(await screen.findByText('1 sipariş terminini kaçırır')).toBeTruthy();
    expect(screen.getByText('Plancı onayı gerekir')).toBeTruthy();
    expect(screen.getByText('Plan bu termine yetişmiyor')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Bitişi değişen siparişler' })).getByText('Gecikir')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Teklifi ver' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ planTaslagi: { karOrani: '25', istenenTermin: '2099-07-05' } });
  });

  it('maliyet dökümü yalnız maliyet okuyana görünür; deneme taslağı kârla kaydedilir', async () => {
    const istekler = kur(MUDUR, () => DOKUMLU);
    ac('/siparisler/teklifler/21');
    const dokum = await screen.findByRole('table', { name: 'Maliyet dökümü' });
    expect(within(dokum).getByText('300,00 TRY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deneme taslağı kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/siparisler/teklifler/21/deneme-taslagi', govde: { karOrani: '25', istenenTermin: null } });
  });

  it('motor bağlı değilse elle: termin tarihi ve fiyat elle girilir, plan taslağı gitmez', async () => {
    const istekler = kur(SATISCI, () => ({ ...DENEME, durum: 'cozucu-yok', planSurumu: null, planTermini: null, termin: null, terminGun: null, maliyetToplami: null, kalemler: [] }));
    ac('/siparisler/teklifler/21');
    expect(await screen.findByText('Termin denemesi kullanılamıyor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Deneme Mil 20mm birim fiyat/), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Termin tarihi'), { target: { value: '2099-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi ver' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ fiyatlar: [{ satirId: 11, birimFiyat: '11' }], terminTarihi: '2099-08-01', planTaslagi: null });
  });

  it('63 b: termin onayı bekleyen teklifte plancı termini onaylar; plan taslakları görünür', async () => {
    const bekleyen = { ...TEKLIF_VERILDI, durum: 'onay-bekliyor', surumler: [{ ...SURUM_1, iskontoOrani: '5.00', terminTarihi: '2099-07-05' }] } satisfies TeklifAyrintisi;
    const TASLAK = {
      id: 3, teklifId: 21, surumNo: 1, tur: 'satis', gorunum: 'onay-bekliyor', planSurumu: '412', gecerlilik: '2099-06-30', istenenTermin: '2099-07-05', planTermini: '2099-07-14',
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
