import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  Arac, AracGorevi, AracGorevleriCevabi, AraclarCevabi, Demirbas, DemirbaslarCevabi, Masraf, MasraflarCevabi, Zimmet, ZimmetlerCevabi, BugunCevabi, Kontrol, KontrollerCevabi, Talep, TalepPanosuCevabi, TaleplerimCevabi, YemekGunuCevabi,
} from '#paylasilan/sozlesme/idari-isler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

const SAYFA: Islem = 'sayfa.idari-isler';
const PERSONEL: Kullanici = { id: 4, ad: 'Deneme Personel', islemler: [SAYFA, 'idari-isler.talep-ac'] };
const MUDUR: Kullanici = { id: 3, ad: 'Deneme Mudur', islemler: [SAYFA, 'idari-isler.oku'] };
const IDARI: Kullanici = {
  id: 2, ad: 'Deneme Idari', islemler: [SAYFA, 'idari-isler.oku', 'idari-isler.talep-ac', 'idari-isler.talep-yonet', 'idari-isler.kontrol-yaz'],
};

const YENI = {
  id: 1, no: 'TT-2026-001', kategori: 'elektrik', yer: 'Salon 1', aciklama: 'Lamba yanmıyor', aciliyet: 'acil', durum: 'yeni',
  acanKisiId: 4, acanAd: 'Deneme Personel', acilma: '2026-10-19T08:00:00.000+03:00', ustlenenKisiId: null, ustlenenAd: null, ustlenme: null,
  kapatanAd: null, kapanma: null, sonucNotu: null, surum: 1,
} satisfies Talep;
const YAPILIYOR = { ...YENI, id: 2, no: 'TT-2026-002', kategori: 'klima', aciliyet: 'normal', durum: 'yapiliyor', ustlenenKisiId: 2, ustlenenAd: 'Deneme Idari', surum: 2 } satisfies Talep;
const TUPLER = {
  id: 11, ad: 'Yangın tüpleri (24 adet)', tur: 'yasal', siklikDeger: 6, siklikBirim: 'ay', sonrakiTarih: '2026-10-17', grup: 'gecti', kalanGun: -2,
  firmaId: 5, firmaAd: 'Deneme Servis Firmasi', aciklama: null, aktif: true, surum: 3,
} satisfies Kontrol;
const TALAS = {
  ...TUPLER, id: 12, ad: 'Talaş ve kesme yağı teslimi', tur: 'atik', siklikDeger: 2, siklikBirim: 'hafta', sonrakiTarih: '2026-10-24', grup: 'yakin', kalanGun: 5,
  surum: 1,
} satisfies Kontrol;
const SIGORTA = {
  ...TUPLER, id: 13, ad: 'Bina sigortası', tur: 'sozlesme', siklikDeger: null, siklikBirim: null, sonrakiTarih: '2027-03-01', grup: 'sonra', kalanGun: 133,
  firmaId: null, firmaAd: null, surum: 1,
} satisfies Kontrol;
const KAMYON = {
  id: 21, plaka: '34 DNM 101', tur: 'kamyon', markaModel: null, sahiplik: 'sirket', durum: 'musait', km: 89_160, sonrakiBakimKm: 90_000,
  muayeneTarihi: null, sigortaTarihi: '2026-10-15', sevkiyatta: true, aciklama: null,
  uyarilar: [{ tur: 'sigorta', gecti: true, kalanGun: -4, kalanKm: null }, { tur: 'bakim', gecti: false, kalanGun: null, kalanKm: 840 }], surum: 2,
} satisfies Arac;
const BINEK = { ...KAMYON, id: 22, plaka: '34 DNM 102', tur: 'binek', markaModel: 'Deneme binek', sahiplik: 'kiralik', sigortaTarihi: null, uyarilar: [], surum: 1 } satisfies Arac;
const KONTROLLER = { kontroller: [TUPLER, TALAS, SIGORTA] } satisfies KontrollerCevabi;
const BUGUN = {
  isler: [{ tur: 'talep', talep: YENI }, { tur: 'kontrol', kontrol: TUPLER }, { tur: 'arac', arac: KAMYON }, { tur: 'talep', talep: YAPILIYOR }],
  sayilar: { acikTalep: 2, acilTalep: 1, bugunAcilan: 2, bugunKapanan: 0, gecenKontrol: 1, yakinKontrol: 1, aracUyarisi: 1 },
} satisfies BugunCevabi;
const PANO = {
  yeni: { talepler: [YENI], toplam: 1 }, yapiliyor: { talepler: [YAPILIYOR], toplam: 1 }, kapanan: { talepler: [], toplam: 0 },
} satisfies TalepPanosuCevabi;
const YEMEK = {
  tarih: '2026-10-19', bugun: '2026-10-19', kadro: 86, izinli: 7, fazlaMesai: 4, son: null, gecmis: [{ tarih: '2026-10-17', hesaplanan: 84, sayi: 85 }],
} satisfies YemekGunuCevabi;
const FILOCU: Kullanici = { ...IDARI, islemler: [...IDARI.islemler, 'idari-isler.filo-yaz'] };
const YEMEKCI: Kullanici = { ...IDARI, islemler: [...IDARI.islemler, 'idari-isler.yemek-yaz'] };
const TALEPLERIM = { satirlar: [YENI], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies TaleplerimCevabi;
const GOREV = {
  id: 41, talepEdenKisiId: 4, talepEdenAd: 'Deneme Personel', amac: 'Deneme tedarikçi ziyareti', varis: 'Deneme OSB', tarih: '2026-10-20',
  donusTarihi: '2026-10-20', aciklama: null, durum: 'bekliyor', talep: '2026-10-19T08:00:00.000+03:00', aracId: null, plaka: null, onaylayanAd: null,
  onay: null, redNedeni: null, cikisKm: null, cikis: null, donusKm: null, donus: null, kapanma: null, surum: 1,
} satisfies AracGorevi;
const YOLDA = {
  ...GOREV, id: 42, varis: 'Deneme liman', durum: 'yolda', aracId: 22, plaka: '34 DNM 102', onaylayanAd: 'Deneme Idari',
  onay: '2026-10-19T09:00:00.000+03:00', cikisKm: 89_160, cikis: '2026-10-19T09:30:00.000+03:00', surum: 3,
} satisfies AracGorevi;
const ARACCI: Kullanici = { ...PERSONEL, islemler: [...PERSONEL.islemler, 'idari-isler.arac-talebi-ac'] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Istek { yontem: string; yol: string; govde: unknown; baslik: Record<string, string> }

function sunucuKur(kullanici: Kullanici, ozel: (yontem: string, yol: string, govde: unknown) => Response | undefined = () => undefined) {
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
      if (yol === '/idari-isler/bugun') return json(200, BUGUN);
      if (yol === '/idari-isler/talepler/pano') return json(200, PANO);
      if (yol.startsWith('/idari-isler/taleplerim/son-yerler')) return json(200, { yerler: ['Salon 1', 'Kompresör odası'] });
      if (yol.startsWith('/idari-isler/taleplerim')) return json(200, TALEPLERIM);
      if (yol === '/idari-isler/kisi-secenekleri') return json(200, { kisiler: [{ id: 9, ad: 'Deneme Teknisyen' }] });
      if (yol === '/idari-isler/kontroller') return json(200, KONTROLLER);
      if (/^\/idari-isler\/kontroller\/\d+\/kayitlar$/.test(yol)) return json(200, { kayitlar: [] });
      if (yol.startsWith('/idari-isler/yemek?')) return json(200, YEMEK);
      if (yol === '/idari-isler/demirbaslar') return json(200, { demirbaslar: [LAPTOP, ANAHTAR, MONITOR] } satisfies DemirbaslarCevabi);
      if (/^\/idari-isler\/demirbaslar\/\d+\/zimmetler$/.test(yol)) return json(200, { zimmetler: [ESKI] } satisfies ZimmetlerCevabi);
      if (yol === '/idari-isler/araclar') return json(200, { araclar: [KAMYON, BINEK] } satisfies AraclarCevabi);
      if (yol === '/idari-isler/arac-gorevleri') return json(200, { gorevler: [GOREV, YOLDA] } satisfies AracGorevleriCevabi);
      if (yol === '/idari-isler/arac-taleplerim') return json(200, { gorevler: [GOREV] } satisfies AracGorevleriCevabi);
      if (yol.startsWith('/idari-isler/firma-secenekleri')) return json(200, { firmalar: [{ id: 5, ad: 'Deneme Servis Firmasi' }] });
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

const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Bugün', () => {
  it('bütün talepleri okumayan personel kökte kendi taleplerini görür', async () => {
    const istekler = sunucuKur(PERSONEL);
    ac('/idari-isler');
    await screen.findByRole('heading', { name: 'Taleplerim' });
    expect(istekler.some((i) => i.yol.startsWith('/idari-isler/taleplerim'))).toBe(true);
    expect(istekler.some((i) => i.yol === '/idari-isler/bugun')).toBe(false);
  });

  it('günün sayıları ve işler görünür; müdür hızlı işlem düğmesi görmez', async () => {
    sunucuKur(MUDUR);
    ac('/idari-isler');
    await screen.findByText('TT-2026-001');
    expect(screen.getByText('TT-2026-002')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Üstlen' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Talep aç/ })).toBeNull();
  });

  it('idari işler yeni talebi tek dokunuşla üstlenir ve geri alabilir (bırak)', async () => {
    const istekler = sunucuKur(IDARI, (yontem, yol) => {
      if (yontem === 'POST' && yol === '/idari-isler/talepler/1/ustlen') return json(200, { talep: { ...YENI, durum: 'yapiliyor', ustlenenKisiId: 2, surum: 2 } });
      if (yontem === 'POST' && yol === '/idari-isler/talepler/1/birak') return json(200, { talep: { ...YENI, surum: 3 } });
      return undefined;
    });
    ac('/idari-isler');
    await screen.findByText('TT-2026-001');
    fireEvent.click(screen.getByRole('button', { name: 'Üstlen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(yazmalar(istekler).map((i) => i.yol)).toEqual(['/idari-isler/talepler/1/ustlen', '/idari-isler/talepler/1/birak']));
    expect(yazmalar(istekler).map((i) => i.govde)).toEqual([{ surum: 1 }, { surum: 2 }]);
  });
});

describe('Tesis talepleri panosu', () => {
  it('reddetmek neden ister; neden sürümle gider', async () => {
    const istekler = sunucuKur(IDARI, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/talepler/1/reddet'
      ? json(200, { talep: { ...YENI, durum: 'reddedildi', sonucNotu: 'Kapsam dışı', surum: 2 } })
      : undefined));
    ac('/idari-isler/talepler');
    fireEvent.click(await screen.findByRole('button', { name: /TT-2026-001/ }));
    const pencere = within(await screen.findByRole('dialog'));
    fireEvent.click(pencere.getByRole('button', { name: 'Reddet' }));
    const reddet = pencere.getByRole('button', { name: 'Reddet' });
    expect((reddet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(pencere.getByLabelText(/Red nedeni/), { target: { value: 'Kapsam dışı' } });
    fireEvent.click(reddet);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toEqual({ surum: 1, neden: 'Kapsam dışı' });
  });

  it('müdür talebi görür ama işlem düğmesi görmez', async () => {
    sunucuKur(MUDUR);
    ac('/idari-isler/talepler');
    fireEvent.click(await screen.findByRole('button', { name: /TT-2026-001/ }));
    const pencere = within(await screen.findByRole('dialog'));
    expect(pencere.getByText('Lamba yanmıyor')).toBeTruthy();
    expect(pencere.queryByRole('button', { name: 'Üstlen' })).toBeNull();
  });
});

describe('Talep aç', () => {
  it('konu, son yer ve aciliyetle talep tekrar korumalı gider; numara gösterilir', async () => {
    const istekler = sunucuKur(PERSONEL, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/talepler/ac'
      ? json(200, { talep: { ...YENI, no: 'TT-2026-007' } })
      : undefined));
    ac('/idari-isler/talep-ac');
    fireEvent.click(await screen.findByRole('button', { name: 'Elektrik' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kompresör odası' }));
    fireEvent.click(screen.getByRole('radio', { name: /Acil/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await screen.findByText('TT-2026-007');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({ kategori: 'elektrik', yer: 'Kompresör odası', aciliyet: 'acil' });
    expect(yazma?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
  });

  it('yer elle yazılabilir', async () => {
    const istekler = sunucuKur(PERSONEL, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/talepler/ac' ? json(200, { talep: YENI }) : undefined));
    ac('/idari-isler/talep-ac');
    fireEvent.click(await screen.findByRole('button', { name: 'Diğer' }));
    fireEvent.change(screen.getByLabelText('Ya da yer yaz'), { target: { value: 'Depo kapısı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam' }));
    fireEvent.change(screen.getByLabelText(/Açıklama/), { target: { value: 'Menteşe gevşek' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toEqual({ kategori: 'diger', yer: 'Depo kapısı', aciliyet: 'normal', aciklama: 'Menteşe gevşek' });
  });
});

describe('Taleplerim', () => {
  it('yeni talep geri çekilir', async () => {
    const istekler = sunucuKur(PERSONEL, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/talepler/1/geri-cek'
      ? json(200, { talep: { ...YENI, durum: 'geri_cekildi', surum: 2 } })
      : undefined));
    ac('/idari-isler/taleplerim');
    fireEvent.click(await screen.findByRole('button', { name: 'Geri çek' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/idari-isler/talepler/1/geri-cek', govde: { surum: 1 } });
  });
});

describe('Periyodik kontroller', () => {
  it('kalemler üç grupta; tür süzgeci daraltır; okuyan eylem düğmesi görmez', async () => {
    sunucuKur(MUDUR);
    ac('/idari-isler/periyodik');
    const gecti = within(await screen.findByRole('region', { name: 'Süresi geçti' }));
    expect(gecti.getByText('Yangın tüpleri (24 adet)')).toBeTruthy();
    expect(gecti.getByText('2 gün geçti')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '30 gün içinde' })).getByText('Talaş ve kesme yağı teslimi')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Daha sonra' })).getByText('Bina sigortası')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yapıldı' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Kalem ekle/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Atık/ }));
    expect(screen.queryByText('Bina sigortası')).toBeNull();
    expect(screen.getByText('Talaş ve kesme yağı teslimi')).toBeTruthy();
  });

  it('atık teslimi miktar ve birim ister; sürümle gider', async () => {
    const istekler = sunucuKur(IDARI, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/kontroller/12/yapildi'
      ? json(200, { kontrol: { ...TALAS, surum: 2 } })
      : undefined));
    ac('/idari-isler/periyodik');
    fireEvent.click(await screen.findByRole('button', { name: 'Teslim edildi' }));
    const pencere = within(await screen.findByRole('dialog'));
    const kaydet = pencere.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(pencere.getByLabelText(/Miktar/), { target: { value: '120,5' } });
    fireEvent.change(pencere.getByLabelText(/Form no/), { target: { value: 'AT-7' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toMatchObject({ surum: 1, miktar: '120.5', birim: 'kg', belgeNo: 'AT-7' });
  });

  it('sözleşme yenilemede yeni bitiş tarihi zorunlu', async () => {
    sunucuKur(IDARI);
    ac('/idari-isler/periyodik');
    fireEvent.click(await screen.findByRole('button', { name: 'Yenilendi' }));
    const pencere = within(await screen.findByRole('dialog'));
    const kaydet = pencere.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(pencere.getByLabelText(/Yeni bitiş tarihi/), { target: { value: '2028-03-01' } });
    expect(kaydet.disabled).toBe(false);
  });

  it('kalem ekleme tekrar korumalı gider; sıklık sayı ve birimle birlikte', async () => {
    const istekler = sunucuKur(IDARI, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/kontroller/ekle'
      ? json(200, { kontrol: { ...TUPLER, id: 20 } })
      : undefined));
    ac('/idari-isler/periyodik');
    fireEvent.click(await screen.findByRole('button', { name: /Kalem ekle/ }));
    const pencere = within(await screen.findByRole('dialog'));
    fireEvent.change(pencere.getByLabelText(/^Ad/), { target: { value: 'Topraklama ölçümü' } });
    fireEvent.change(pencere.getByLabelText(/Sonraki tarih/), { target: { value: '2027-01-14' } });
    fireEvent.change(pencere.getByLabelText(/^Sıklık/), { target: { value: '1' } });
    const kaydet = pencere.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(pencere.getByLabelText(/^Birim/), { target: { value: 'yil' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toEqual({
      tur: 'yasal', ad: 'Topraklama ölçümü', sonrakiTarih: '2027-01-14', firmaId: null, aciklama: null, siklikDeger: 1, siklikBirim: 'yil',
    });
    expect(yazmalar(istekler)[0]?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
  });

  it('Bugün süresi geçen kalemi gösterir; kontrol-yaz olan oradan kaydeder', async () => {
    sunucuKur(IDARI);
    ac('/idari-isler');
    await screen.findByText('Yangın tüpleri (24 adet)');
    fireEvent.click(screen.getByRole('tab', { name: /Periyodik/ }));
    expect(screen.queryByText('TT-2026-001')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yapıldı' }));
    expect(await screen.findByRole('dialog', { name: /Yangın tüpleri/ })).toBeTruthy();
  });
});

describe('Yemek sayısı', () => {
  it('kadro, izinli ve fazla mesai sistemden gelir; eksik alan söylenir; sayı hesaplanıp tekrar korumalı bildirilir', async () => {
    const istekler = sunucuKur(YEMEKCI, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/yemek/bildir'
      ? json(200, {
        ...YEMEK,
        son: {
          id: 1, tarih: '2026-10-19', kadro: 86, izinli: 7, fazlaMesai: 4, ziyaretci: 3, duzeltme: 2, duzeltmeNedeni: 'Deneme eğitmen', sayi: 88,
          bildirenAd: 'Deneme Idari', bildirim: '2026-10-19T10:00:00.000+03:00',
        },
      } satisfies YemekGunuCevabi)
      : undefined));
    ac('/idari-isler/yemek');
    expect(await screen.findByText('86')).toBeTruthy();
    expect(screen.getByText('Henüz bildirilmedi')).toBeTruthy();
    expect(screen.getByText('+ 4')).toBeTruthy();
    expect(await screen.findByText(/Eksik: ziyaretçi/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Yemeğe kalacak ziyaretçi'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Elle düzeltme'), { target: { value: '2' } });
    expect(screen.getByText(/Eksik: düzeltme gerekçesi/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Düzeltme gerekçesi'), { target: { value: 'Deneme eğitmen' } });
    fireEvent.click(screen.getByRole('button', { name: '88 bildirildi olarak kaydet' }));
    await screen.findByText('88 bildirildi olarak kaydedildi');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({
      tarih: '2026-10-19', kadro: 86, izinli: 7, fazlaMesai: 4, ziyaretci: 3, duzeltme: 2, duzeltmeNedeni: 'Deneme eğitmen',
    });
    expect(yazma?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
  });

  it('müdür sayıyı ve son günleri görür, bildirim düğmesi görmez', async () => {
    sunucuKur(MUDUR);
    ac('/idari-isler/yemek');
    expect(await screen.findByText('84')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /bildirildi olarak kaydet/ })).toBeNull();
    expect((screen.getByLabelText('Yemeğe kalacak ziyaretçi') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('Filo', () => {
  it('uyarı şeridi ve tablo; okuyan araç ekleyemez ve düzenleyemez', async () => {
    sunucuKur(MUDUR);
    ac('/idari-isler/filo');
    expect(await screen.findByText('34 DNM 102')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('sigorta 4 gün geçti, bakıma 840 km kaldı');
    expect(screen.getByText('Deneme binek')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Araç ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: '34 DNM 101' })).toBeNull();
  });

  it('araç ekleme tekrar korumalı gider; boş alanlar null', async () => {
    const istekler = sunucuKur(FILOCU, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/araclar/ekle'
      ? json(200, { arac: { ...BINEK, id: 30, plaka: '34 DNM 103' } })
      : undefined));
    ac('/idari-isler/filo');
    fireEvent.click(await screen.findByRole('button', { name: 'Araç ekle' }));
    fireEvent.change(screen.getByLabelText(/Plaka/), { target: { value: '34dnm103' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Kiralık' }));
    fireEvent.change(screen.getByLabelText('Km'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('34 DNM 103 eklendi');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({
      plaka: '34dnm103', tur: 'binek', sahiplik: 'kiralik', durum: 'musait', km: 1200, sonrakiBakimKm: null,
      muayeneTarihi: null, sigortaTarihi: null, sevkiyatta: false, markaModel: null, aciklama: null,
    });
    expect(yazma?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
  });

  it('düzenleme sürümle gider', async () => {
    const istekler = sunucuKur(FILOCU, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/araclar/21/guncelle'
      ? json(200, { arac: { ...KAMYON, km: 89_500, surum: 3 } })
      : undefined));
    ac('/idari-isler/filo');
    fireEvent.click(await screen.findByRole('button', { name: '34 DNM 101' }));
    fireEvent.change(screen.getByLabelText('Km'), { target: { value: '89500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('34 DNM 101 güncellendi');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toMatchObject({ surum: 2, plaka: '34 DNM 101', km: 89_500, sonrakiBakimKm: 90_000, sevkiyatta: true });
  });
});

const YAKIT = {
  id: 41, aracId: 21, tarih: '2026-10-18', tur: 'yakit', tutar: '1250.50', km: 89_100, belgeNo: 'DNM-1', aciklama: null, kaydedenAd: 'Deneme Idari',
  kayit: '2026-10-18T10:00:00.000+03:00', iptal: null, iptalNedeni: null, surum: 1,
} satisfies Masraf;
const IPTALLI = { ...YAKIT, id: 42, tur: 'bakim', tutar: '300.00', iptal: '2026-10-18T11:00:00.000+03:00', iptalNedeni: 'Deneme yanlış araç', surum: 2 } satisfies Masraf;
const MASRAFLAR = { masraflar: [YAKIT, IPTALLI], yilToplami: '1250.50' } satisfies MasraflarCevabi;
const masrafSunucusu = (ek: (yontem: string, yol: string) => Response | undefined = () => undefined) =>
  (yontem: string, yol: string) => (yontem === 'GET' && yol === '/idari-isler/araclar/21/masraflar' ? json(200, MASRAFLAR) : ek(yontem, yol));

describe('Araç masrafları', () => {
  it('okuyan listeyi ve yıl toplamını görür; iptalli kayıt rozetle kalır; giriş ve iptal düğmesi görmez', async () => {
    sunucuKur(MUDUR, masrafSunucusu());
    ac('/idari-isler/filo');
    fireEvent.click(await screen.findByRole('button', { name: '34 DNM 101 masrafları' }));
    const pencere = await screen.findByRole('dialog', { name: '34 DNM 101 masrafları' });
    await within(pencere).findByText('Deneme yanlış araç', { exact: false });
    expect(within(pencere).getByText('İptal')).toBeTruthy();
    expect(within(pencere).getAllByText(/1\.250,50 TL/).length).toBeGreaterThan(0);
    expect(within(pencere).queryByRole('button', { name: 'Masrafı kaydet' })).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'İptal et' })).toBeNull();
  });

  it('masraf girişi tekrar korumalı gider; virgüllü tutar noktaya çevrilir, boş alanlar gönderilmez', async () => {
    const istekler = sunucuKur(FILOCU, masrafSunucusu((yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/araclar/21/masraf-ekle'
      ? json(200, { masraf: { ...YAKIT, id: 43 } })
      : undefined)));
    ac('/idari-isler/filo');
    fireEvent.click(await screen.findByRole('button', { name: '34 DNM 101 masrafları' }));
    const pencere = await screen.findByRole('dialog', { name: '34 DNM 101 masrafları' });
    fireEvent.change(within(pencere).getByLabelText(/Tutar/), { target: { value: '980,5' } });
    fireEvent.change(within(pencere).getByLabelText(/Tarih/), { target: { value: '2026-10-17' } });
    fireEvent.change(within(pencere).getByLabelText(/Km/), { target: { value: '89150' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Masrafı kaydet' }));
    await screen.findByText('Masraf kaydedildi');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({ tarih: '2026-10-17', tur: 'yakit', tutar: '980.5', km: 89_150 });
    expect(yazma?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
  });

  it('iptal neden ister ve sürümle gider', async () => {
    const istekler = sunucuKur(FILOCU, masrafSunucusu((yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/masraflar/41/iptal'
      ? json(200, { masraf: { ...YAKIT, iptal: '2026-10-19T09:00:00.000+03:00', iptalNedeni: 'Deneme mükerrer', surum: 2 } })
      : undefined)));
    ac('/idari-isler/filo');
    fireEvent.click(await screen.findByRole('button', { name: '34 DNM 101 masrafları' }));
    const pencere = await screen.findByRole('dialog', { name: '34 DNM 101 masrafları' });
    fireEvent.click(await within(pencere).findByRole('button', { name: 'İptal et' }));
    const iptal = await screen.findByRole('dialog', { name: /iptal$/ });
    const dugme = within(iptal).getByRole('button', { name: 'İptal et' });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(iptal).getByLabelText(/İptal nedeni/), { target: { value: 'Deneme mükerrer' } });
    fireEvent.click(dugme);
    await screen.findByText('Masraf iptal edildi');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({ surum: 1, neden: 'Deneme mükerrer' });
  });
});

const ACIK = {
  id: 61, demirbasId: 51, kisiId: 7, kisiAd: 'Deneme Operator', personelAdi: null, verilis: '2026-09-01', iade: null, iadeDurumu: null, iadeNotu: null,
  aciklama: null, verenAd: 'Deneme Idari', iadeAlanAd: null, ikdenTasindi: false, surum: 1,
} satisfies Zimmet;
const KISISIZ = { ...ACIK, id: 62, demirbasId: 52, kisiId: null, kisiAd: null, personelAdi: 'Deneme Eski Personel', verilis: null, ikdenTasindi: true } satisfies Zimmet;
const ESKI = { ...ACIK, id: 60, kisiAd: 'Deneme Planlama', verilis: '2026-01-10', iade: '2026-08-30', iadeDurumu: 'saglam', iadeAlanAd: 'Deneme Idari' } satisfies Zimmet;
const LAPTOP = {
  id: 51, no: 'DB-00051', tur: 'dizustu', markaModel: 'Deneme dizüstü', seriNo: 'DNM-SN-1', deger: '30000.00', durum: 'zimmetli', aciklama: null,
  acikZimmet: ACIK, surum: 3,
} satisfies Demirbas;
const ANAHTAR = { ...LAPTOP, id: 52, no: 'DB-00052', tur: 'anahtar', markaModel: null, seriNo: null, deger: null, acikZimmet: KISISIZ, surum: 1 } satisfies Demirbas;
const MONITOR = { ...LAPTOP, id: 53, no: 'DB-00053', tur: 'monitor', markaModel: 'Deneme monitör', seriNo: 'DNM-MN-1', durum: 'bosta', acikZimmet: null, surum: 2 } satisfies Demirbas;
const ZIMMETCI: Kullanici = { ...IDARI, islemler: [...IDARI.islemler, 'idari-isler.zimmet-yaz'] };

describe('Demirbaş ve zimmet', () => {
  it('okuyan listeyi, kişisiz zimmet uyarısını ve geçmişi görür; düğme görmez; arama süzer', async () => {
    sunucuKur(MUDUR);
    ac('/idari-isler/zimmet');
    expect(await screen.findByText('Deneme Operator')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('1 zimmet');
    expect(screen.getByText('Kişiye bağlanmamış')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Demirbaş ekle' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'dnm-mn' } });
    expect(screen.queryByText('Deneme Operator')).toBeNull();
    expect(screen.getByText('DB-00053')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'DB-00053' }));
    const pencere = await screen.findByRole('dialog', { name: /DB-00053/ });
    expect(await within(pencere).findByText('Deneme Planlama')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Zimmetle' })).toBeNull();
  });

  it('boştaki demirbaş kişi ve verilişle, sürümüyle zimmetlenir', async () => {
    const istekler = sunucuKur(ZIMMETCI, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/demirbaslar/53/zimmetle'
      ? json(200, { demirbas: { ...MONITOR, durum: 'zimmetli', acikZimmet: { ...ACIK, demirbasId: 53 }, surum: 3 } })
      : undefined));
    ac('/idari-isler/zimmet');
    fireEvent.click(await screen.findByRole('button', { name: 'DB-00053' }));
    const pencere = await screen.findByRole('dialog', { name: /DB-00053/ });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Zimmetle' }));
    const kisi = await within(pencere).findByRole('option', { name: 'Deneme Teknisyen' });
    fireEvent.change(within(pencere).getByLabelText('Kişi'), { target: { value: (kisi as HTMLOptionElement).value } });
    fireEvent.change(within(pencere).getByLabelText(/Veriliş/), { target: { value: '2026-10-18' } });
    fireEvent.click(within(pencere).getAllByRole('button', { name: 'Zimmetle' }).at(-1)!);
    await screen.findByText('DB-00053 zimmetlendi');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({ surum: 2, kisiId: 9, verilis: '2026-10-18', aciklama: null });
  });

  it('iade durumu ve tarihle, zimmetin sürümüyle gider', async () => {
    const istekler = sunucuKur(ZIMMETCI, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/zimmetler/61/iade'
      ? json(200, { zimmet: { ...ACIK, iade: '2026-10-19', iadeDurumu: 'hasarli', surum: 2 } })
      : undefined));
    ac('/idari-isler/zimmet');
    fireEvent.click(await screen.findByRole('button', { name: 'DB-00051' }));
    const pencere = await screen.findByRole('dialog', { name: /DB-00051/ });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İade al' }));
    fireEvent.click(within(pencere).getByRole('radio', { name: 'Hasarlı' }));
    fireEvent.change(within(pencere).getByLabelText(/İade tarihi/), { target: { value: '2026-10-19' } });
    fireEvent.change(within(pencere).getByLabelText(/İade notu/), { target: { value: 'Deneme ekran çatlak' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İadeyi kaydet' }));
    await screen.findByText('DB-00051 iade alındı');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({ surum: 1, iade: '2026-10-19', iadeDurumu: 'hasarli', iadeNotu: 'Deneme ekran çatlak' });
  });

  it('kişisiz zimmet kişiye bağlanır; yeni demirbaş tekrar korumalı, virgüllü değerle gider', async () => {
    const istekler = sunucuKur(ZIMMETCI, (yontem, yol) => {
      if (yontem === 'POST' && yol === '/idari-isler/zimmetler/62/kisiye-bagla') return json(200, { zimmet: { ...KISISIZ, kisiId: 9, kisiAd: 'Deneme Teknisyen', surum: 2 } });
      if (yontem === 'POST' && yol === '/idari-isler/demirbaslar/ekle') return json(200, { demirbas: { ...MONITOR, id: 54, no: 'DB-00054' } });
      return undefined;
    });
    ac('/idari-isler/zimmet');
    fireEvent.click(await screen.findByRole('button', { name: 'DB-00052' }));
    const pencere = await screen.findByRole('dialog', { name: /DB-00052/ });
    expect(within(pencere).getAllByText('Deneme Eski Personel').length).toBeGreaterThan(0);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kişiye bağla' }));
    const kisi = await within(pencere).findByRole('option', { name: 'Deneme Teknisyen' });
    fireEvent.change(within(pencere).getByLabelText('Kişi'), { target: { value: (kisi as HTMLOptionElement).value } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bağla' }));
    await screen.findByText('DB-00052 zimmeti kişiye bağlandı');
    fireEvent.click(within(pencere).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Demirbaş ekle' }));
    const form = await screen.findByRole('dialog', { name: 'Demirbaş ekle' });
    fireEvent.change(within(form).getByLabelText(/Seri no/), { target: { value: 'DNM-MN-2' } });
    fireEvent.change(within(form).getByLabelText(/Değer/), { target: { value: '4500,5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('DB-00054 eklendi');
    const [bag, ekle] = yazmalar(istekler);
    expect(bag?.govde).toEqual({ surum: 1, kisiId: 9 });
    expect(ekle?.govde).toEqual({ tur: 'dizustu', markaModel: null, seriNo: 'DNM-MN-2', deger: '4500.5', aciklama: null });
    expect(ekle?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
  });
});

describe('Araç görevleri', () => {
  it('çalışan araç talebini tekrar korumalı gönderir ve bekleyen talebini geri çekebilir', async () => {
    const istekler = sunucuKur(ARACCI, (yontem, yol) => (yontem === 'POST' && yol === '/idari-isler/arac-gorevleri/ac'
      ? json(200, { gorev: { ...GOREV, id: 43 } })
      : undefined));
    ac('/idari-isler/arac-taleplerim');
    expect(await screen.findByText('Deneme OSB')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Geri çek' })).toBeTruthy();
    expect(screen.getByText(/Eksik: gidilecek yer, amaç/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Gidilecek yer/), { target: { value: 'Deneme depo' } });
    fireEvent.change(screen.getByLabelText(/Amaç/), { target: { value: 'Deneme numune teslimi' } });
    fireEvent.change(screen.getByLabelText(/Gidiş/), { target: { value: '2026-10-21' } });
    fireEvent.change(screen.getByLabelText(/Dönüş/), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talep gönder' }));
    await screen.findByText('Araç talebin iletildi');
    const [yazma] = yazmalar(istekler);
    expect(yazma?.govde).toEqual({ amac: 'Deneme numune teslimi', varis: 'Deneme depo', tarih: '2026-10-21', donusTarihi: '2026-10-22' });
    expect(yazma?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
  });

  it('idari işler uygun araçla onaylar, yoldaki göreve dönüş km yazar', async () => {
    const istekler = sunucuKur(FILOCU, (yontem, yol) => {
      if (yontem === 'POST' && yol === '/idari-isler/arac-gorevleri/41/onayla') return json(200, { gorev: { ...GOREV, durum: 'onaylandi', surum: 2 } });
      if (yontem === 'POST' && yol === '/idari-isler/arac-gorevleri/42/donus') return json(200, { gorev: { ...YOLDA, durum: 'tamamlandi', surum: 4 } });
      return undefined;
    });
    ac('/idari-isler/arac-gorevleri');
    expect(await screen.findByText('Onay bekleyen (1)')).toBeTruthy();
    expect(screen.getByText('Yolda (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: /Deneme OSB/ });
    const secim = await within(pencere).findByLabelText('Verilecek araç');
    await waitFor(() => expect(within(secim).getAllByRole('option')).toHaveLength(3));
    fireEvent.change(secim, { target: { value: '22' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
    await screen.findByText('Araç görevi onaylandı');
    fireEvent.click(screen.getByRole('button', { name: 'Dönüş' }));
    const donus = await screen.findByRole('dialog', { name: /Deneme liman/ });
    fireEvent.change(within(donus).getByLabelText('Dönüş km'), { target: { value: '89310' } });
    fireEvent.click(within(donus).getByRole('button', { name: 'Dönüşü yaz' }));
    await screen.findByText('Dönüş yazıldı');
    const [onay, donusYazma] = yazmalar(istekler);
    expect(onay?.govde).toEqual({ surum: 1, aracId: 22 });
    expect(donusYazma?.govde).toEqual({ surum: 3, km: 89_310 });
  });

  it('müdür görevleri görür, işlem düğmesi görmez', async () => {
    sunucuKur(MUDUR);
    ac('/idari-isler/arac-gorevleri');
    expect(await screen.findByText('Deneme OSB')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dönüş' })).toBeNull();
  });
});
