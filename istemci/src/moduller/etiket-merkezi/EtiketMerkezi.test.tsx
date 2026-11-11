import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ISTEK_KIMLIGI_BASLIGI, istekKimligiMi } from '#paylasilan/istek-kimligi.ts';
import type { BaskilarCevabi, BekleyenlerCevabi, CiktiCevabi, EtiketlerCevabi, KayitCiktiCevabi, SablonlarCevabi, YazdirCevabi, YazicilarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Baskilar } from './Baskilar.tsx';
import { cihazYazicilari, cihazYazicisiKaydet } from './cihaz-yazicisi.ts';
import { Etiketler, yerGrubu } from './Etiketler.tsx';
import { KAYIT_BASLIKLARI } from './kayit-secimi.ts';
import { HazirSablonlar, SablonKatalogu, YaziciDenemesi } from './EtiketMerkezi.tsx';
import { Yazicilar } from './Yazicilar.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const SABLONLAR: SablonlarCevabi = {
  sablonlar: [
    { anahtar: 'lot-100x50', ad: 'Lot 100x50', tur: 'lot', genislik: 100, yukseklik: 50, ogeler: [] },
    { anahtar: 'konum-50x25', ad: 'Konum 50x25', tur: 'konum', genislik: 50, yukseklik: 25, ogeler: [] },
    { anahtar: 'deneme-50x25', ad: 'Yazıcı denemesi 50x25', tur: 'deneme', genislik: 50, yukseklik: 25, ogeler: [] },
    { anahtar: 'refakat-100x150', ad: 'Refakat kartı 100x150', tur: 'refakat', genislik: 100, yukseklik: 150, ogeler: [] },
    { anahtar: 'sevk-koli-100x75', ad: 'Sevk kolisi 100x75', tur: 'sevk-koli', genislik: 100, yukseklik: 75, ogeler: [] },
  ],
  alanlar: {},
  secenekler: {
    diller: [{ deger: 'zpl', ad: 'Zebra (ZPL)' }, { deger: 'pplb', ad: 'Argox (PPLB)' }],
    cozunurlukler: [203, 300],
    enCokAdet: 500,
    turAdlari: { lot: 'Lot', konum: 'Konum ve harita kutusu', deneme: 'Yazıcı denemesi' },
  },
};

const cikti = (anahtar: string, sorgu: URLSearchParams): CiktiCevabi => {
  const dil = sorgu.get('dil') === 'pplb' ? 'pplb' : 'zpl';
  const s = SABLONLAR.sablonlar.find((x) => x.anahtar === anahtar) ?? SABLONLAR.sablonlar[0]!;
  return {
    sablon: { anahtar: s.anahtar, ad: s.ad, genislik: s.genislik, yukseklik: s.yukseklik },
    dil, dpi: Number(sorgu.get('dpi')), adet: Number(sorgu.get('adet')),
    dosyaAdi: `${s.anahtar}-${sorgu.get('dpi')}.${dil === 'zpl' ? 'zpl' : 'prn'}`,
    komut: dil === 'zpl' ? '^XA\n^XZ\n' : '\nN\nP1\n',
    onizleme: [
      { tur: 'metin', x: 1, y: 1, genislik: 40, yaziMm: 4, kalin: true, satirlar: ['LT-000123'] },
      { tur: 'qr', x: 50, y: 1, boyut: 20, veri: 'LOT:LT-000123', kareler: [[true, false], [false, true]] },
      { tur: 'kutu', x: 0, y: 30, genislik: 60, yukseklik: 8, kalinlik: 8 },
      { tur: 'metin', x: 2, y: 31, genislik: 56, yaziMm: 5, kalin: true, satirlar: ['ÖRNEK BAŞLIK'], ters: true },
      { tur: 'simge', x: 80, y: 1, boyut: 12, ad: 'lot', karo: 'cizgili' },
    ],
  };
};

const YAZICILAR: YazicilarCevabi = {
  yazicilar: [
    { id: 1, ad: 'Zebra depo', dil: 'zpl', dpi: 203, baglanti: 'ag', adres: '10.0.5.20', sade: false, aktif: true, surum: 1 },
    { id: 2, ad: 'Argox masa', dil: 'pplb', dpi: 203, baglanti: 'dosya', adres: null, sade: true, aktif: true, surum: 3 },
  ],
  dogrudanBaski: { acik: true, neden: null },
};

const BASKILAR: BaskilarCevabi = {
  baskilar: [
    { id: 7, zaman: '2026-10-18T17:30:00.000Z', yazici: 'Zebra depo', sablonAnahtar: 'deneme-50x25', adet: 2, kisi: 'Örnek Kişi', sonuc: 'gonderildi', hata: null, kayitSayisi: 3 },
    { id: 8, zaman: '2026-10-18T17:40:00.000Z', yazici: 'Argox masa', sablonAnahtar: 'deneme-50x25', adet: 1, kisi: 'Örnek Kişi', sonuc: 'indirildi', hata: null, kayitSayisi: 0 },
    { id: 5, zaman: '2026-10-18T17:10:00.000Z', yazici: null, sablonAnahtar: 'konum-50x25', adet: 1, kisi: 'Örnek Kişi', sonuc: 'yazdirildi', hata: null, kayitSayisi: 1 },
    { id: 6, zaman: '2026-10-18T17:20:00.000Z', yazici: 'Zebra depo', sablonAnahtar: 'deneme-50x25', adet: 1, kisi: null, sonuc: 'hata', hata: 'Yazıcıya ulaşılamadı.', kayitSayisi: 0 },
  ],
};

const ETIKETLER: EtiketlerCevabi = {
  etiketler: [
    {
      kod: 'lot', ad: 'Lot etiketi', sahipModul: 'stok', tetik: 'Mal kabulde lot açılınca', alanlar: 'QR (LOT), lot no', sablonTuru: 'lot',
      kayitTurleri: ['lot', 'mal-kabul'], durum: 'hazir', disaridakiYol: 'Stok Merkezi · Lot etiketi penceresi', sablonlar: [{ anahtar: 'lot-100x50', ad: 'Lot 100x50' }],
    },
    {
      kod: 'sevk-koli', ad: 'Sevk koli etiketi', sahipModul: 'sevkiyat', tetik: 'Ürün sevke hazırlanınca', alanlar: 'QR, müşteri, adet', sablonTuru: null,
      kayitTurleri: [], durum: 'ilk-tur', disaridakiYol: null, sablonlar: [],
    },
  ],
};

const BEKLEYENLER: BekleyenlerCevabi = {
  gun: 30,
  bekleyenler: [
    { tur: 'kalite-durum', id: 41, baslik: 'LT-000041 KAR', ayrinti: 'RED · Örnek mil', zaman: '2026-11-07T09:00:00.000Z', etiketSayisi: 1 },
    { tur: 'mal-kabul', id: 12, baslik: 'MK-000012', ayrinti: '2/2 lot etiketi basılmadı', zaman: '2026-11-07T08:00:00.000Z', etiketSayisi: 2 },
    { tur: 'kalite-durum', id: 40, baslik: 'LT-000040 KAR', ayrinti: 'ŞARTLI KABUL', zaman: '2026-11-06T08:00:00.000Z', etiketSayisi: 1 },
    { tur: 'refakat-partisi', id: 7, baslik: 'UE-000120-P1', ayrinti: 'Lot LT-000009', zaman: '2026-11-05T08:00:00.000Z', etiketSayisi: 1 },
    { tur: 'hatali-parca', id: 3, baslik: 'UE-000121 OP 20', ayrinti: 'RED · 1 adet · Çapak', zaman: '2026-11-04T08:00:00.000Z', etiketSayisi: 1 },
  ],
};

const KONUMLAR: Record<number, string> = { 11: 'R1-01-1-1', 12: 'R1-01-1-2' };

interface Gonderilen { yol: string; govde: unknown; kimlik: string | null }

function sunucuKur(secenek: { islemler?: Islem[]; yazicilar?: YazicilarCevabi; bekleyenler?: BekleyenlerCevabi; etiketler?: EtiketlerCevabi } = {}) {
  const istekler: string[] = [];
  const gonderilenler: Gonderilen[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, init?: RequestInit) => {
    const url = new URL(adres, 'http://yerel');
    const yol = url.pathname.replace('/api', '');
    istekler.push(`${yol}?${url.searchParams.toString()}`);
    if (init?.method === 'POST') {
      const basliklar = (init.headers ?? {}) as Record<string, string>;
      gonderilenler.push({ yol, govde: JSON.parse(String(init.body)), kimlik: basliklar[ISTEK_KIMLIGI_BASLIGI] ?? null });
      if (yol.endsWith('/atla')) return json(200, { atlanan: 1 });
      if (yol.endsWith('/bas')) return json(200, { baskiId: 9, sonuc: 'gonderildi', ileti: null });
      const yazdirEslesme = /^\/etiket-merkezi\/sablonlar\/([a-z0-9-]+)\/yazdir$/.exec(yol);
      if (yazdirEslesme?.[1]) {
        const g = JSON.parse(String(init.body)) as { adet: number; kayit?: { idler: number[] } };
        const c = cikti(yazdirEslesme[1], new URLSearchParams());
        const bulunan = g.kayit ? g.kayit.idler.filter((id) => KONUMLAR[id]) : [0];
        const cevap: YazdirCevabi = {
          baskiId: 11, sablon: c.sablon, adet: g.adet, sayfalar: bulunan.map(() => c.onizleme),
          kayitlar: g.kayit ? bulunan.map((id) => ({ id, baslik: KONUMLAR[id]! })) : null, eksikler: [],
        };
        return json(200, cevap);
      }
      if (yol.endsWith('/indir')) return json(200, { baskiId: 10, dosyaAdi: 'deneme-50x25-203.prn', komut: '\nN\nP1\n' });
      return json(200, { ...YAZICILAR.yazicilar[0], id: 3, ad: 'Yeni', surum: 1 });
    }
    if (yol === '/oturum') return json(200, { kullanici: { id: 1, ad: 'Örnek', islemler: secenek.islemler ?? [] } });
    if (yol === '/etiket-merkezi/sablonlar') return json(200, SABLONLAR);
    if (yol === '/etiket-merkezi/yazicilar') return json(200, secenek.yazicilar ?? YAZICILAR);
    if (yol === '/etiket-merkezi/baskilar') return json(200, BASKILAR);
    if (yol === '/etiket-merkezi/etiketler') return json(200, secenek.etiketler ?? ETIKETLER);
    if (yol === '/etiket-merkezi/bekleyenler') return json(200, secenek.bekleyenler ?? BEKLEYENLER);
    if (yol === '/etiket-merkezi/raflar') {
      return json(200, { raflar: [{ id: 21, kod: 'A1', ad: 'Palet rafı', salonKodu: 'DEPO' }, { id: 22, kod: 'A2', ad: 'A2', salonKodu: 'DEPO' }, { id: 23, kod: 'B1', ad: 'Konsol', salonKodu: 'URETIM' }] });
    }
    if (yol === '/stok/konumlar') {
      return json(200, { satirlar: [{ id: 11, kod: 'R1-01-1-1', ad: null, depoKod: 'ANA' }, { id: 12, kod: 'KABUL', ad: 'Mal kabul', depoKod: 'ANA' }], toplam: 2, sayfa: 1, sayfaBoyu: 500 });
    }
    const kayitEslesme = /^\/etiket-merkezi\/sablonlar\/([a-z0-9-]+)\/kayit-cikti$/.exec(yol);
    if (kayitEslesme?.[1]) {
      const idler = (url.searchParams.get('id') ?? '').split(',').map(Number);
      // Mal kabul kimliği değil, ondan açılan lotlar döner.
      const malKabul = url.searchParams.get('tur') === 'mal-kabul';
      // Sunucu sınırı basılacak lot sayısıyla (burada 5) denetler; ekran yalnız kabul sayısını bilir.
      if (malKabul && Number(url.searchParams.get('adet')) * 5 > 500) {
        return json(400, { kod: 'DOGRULAMA', mesaj: 'Bir baskıda en çok 500 etiket basılır (5 kayıt x 120 adet).', alan: 'adet' } satisfies HataGovdesi);
      }
      const govde: KayitCiktiCevabi = {
        ...cikti(kayitEslesme[1], url.searchParams),
        kayitlar: malKabul ? [{ id: 501, baslik: 'LT-000501' }, { id: 502, baslik: 'LT-000502' }] : idler.filter((id) => KONUMLAR[id]).map((id) => ({ id, baslik: KONUMLAR[id]! })),
        eksikler: malKabul ? [] : idler.filter((id) => !KONUMLAR[id]),
      };
      return json(200, govde);
    }
    const eslesme = /^\/etiket-merkezi\/sablonlar\/([a-z0-9-]+)\/cikti$/.exec(yol);
    if (eslesme?.[1]) return json(200, cikti(eslesme[1], url.searchParams));
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return Object.assign(istekler, { gonderilenler });
}

function AdresGoster() {
  return <output data-testid="adres">{useLocation().search}</output>;
}

function ac(ekran: JSX.Element, adres = '/etiket-merkezi') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}<AdresGoster /></BildirimSaglayici></QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('EtiketMerkezi', () => {
  it('2223: gerçek boyut açılınca etiket mm ölçüsüyle çizilir; ekran ayarı ölçeği çarpar ve tarayıcıda kalır', async () => {
    localStorage.clear();
    sunucuKur();
    ac(<SablonKatalogu />);
    const svg = await screen.findByRole('img', { name: 'Lot 100x50 önizleme' });
    expect(svg.getAttribute('width')).toBeNull();
    fireEvent.click(screen.getByLabelText('Gerçek boyut (1:1)'));
    const gercek = screen.getByRole('img', { name: 'Lot 100x50 önizleme' });
    expect(gercek.getAttribute('width')).toBe('100mm');
    expect(gercek.getAttribute('height')).toBe('50mm');
    expect(screen.getByText('Ekran ayarlanmadı; ölçü yaklaşık')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ekranı ayarla' }));
    fireEvent.change(screen.getByLabelText(/Ölçek/), { target: { value: '112.5' } });
    expect(screen.getByRole('img', { name: 'Kart ölçüsü' }).getAttribute('width')).toBe('96.3mm');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(screen.getByRole('img', { name: 'Lot 100x50 önizleme' }).getAttribute('width')).toBe('112.5mm');
    expect(screen.getByText('Ekran ayarlı (%113)')).toBeTruthy();
    cleanup();
    sunucuKur();
    ac(<SablonKatalogu />);
    expect((await screen.findByRole('img', { name: 'Lot 100x50 önizleme' })).getAttribute('height')).toBe('56.25mm');
    localStorage.clear();
  });

  it('şablon kataloğunda deneme etiketi yoktur; ilk şablonun önizlemesi ve QR içeriği görünür', async () => {
    sunucuKur();
    ac(<SablonKatalogu />);
    expect(await screen.findByText('LT-000123')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Lot 100x50 önizleme' })).toBeTruthy();
    expect(screen.getByLabelText('QR: LOT:LT-000123')).toBeTruthy();
    // EM-25, EM-26: ters yazı kâğıt rengiyle, piktogram sunucunun verdiği yer ve boyutta, çizgili karo kırpılmış şeritle çizilir.
    expect(screen.getByText('ÖRNEK BAŞLIK').getAttribute('class')).toContain('tc-etk-ters');
    const simge = document.querySelector('.tc-etk-onizleme g[transform="translate(80 1) scale(0.25)"]');
    expect(simge?.querySelector('clipPath')).toBeTruthy();
    expect(simge?.querySelectorAll('polygon').length).toBeGreaterThan(3);
    expect(screen.queryByText('Yazıcı denemesi 50x25')).toBeNull();
    expect(screen.getByRole('button', { name: 'Önizleme için indir (lot-100x50-203.zpl, deftere yazılmaz)' })).toBeTruthy();
  });

  it('dil, çözünürlük, adet ve sadeleştirme çıktı isteğine gider', async () => {
    const istekler = sunucuKur();
    ac(<SablonKatalogu />);
    await screen.findByText('LT-000123');
    fireEvent.click(screen.getByRole('button', { name: /Konum 50x25/ }));
    fireEvent.change(screen.getByLabelText('Yazıcı dili'), { target: { value: 'pplb' } });
    fireEvent.change(screen.getByLabelText('Çözünürlük'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Adet'), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('Türkçe harfleri sadeleştir (ş -> s)'));
    await waitFor(() => expect(istekler).toContain('/etiket-merkezi/sablonlar/konum-50x25/cikti?dil=pplb&dpi=300&adet=4&sade=true'));
    expect(await screen.findByRole('button', { name: /konum-50x25-300\.prn/ })).toBeTruthy();
  });

  it('sınır dışı adette uyarı görünür ve indirme kapanır', async () => {
    sunucuKur();
    ac(<SablonKatalogu />);
    await screen.findByText('LT-000123');
    fireEvent.change(screen.getByLabelText('Adet'), { target: { value: '501' } });
    expect(screen.getByText('Adet 1 ile 500 arasında olur.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Önizleme için indir \(.*, deftere yazılmaz\)$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('yazıcı denemesi yalnız deneme şablonlarını gösterir', async () => {
    sunucuKur();
    ac(<YaziciDenemesi />);
    expect(await screen.findByText('Yazıcı denemesi 50x25')).toBeTruthy();
    expect(screen.queryByText('Lot 100x50')).toBeNull();
  });

  it('basma yetkisi olan, deneme etiketini seçtiği ağ yazıcısına tekrar kimliğiyle gönderir', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] });
    ac(<YaziciDenemesi />);
    const secim = await screen.findByLabelText('Yazıcı');
    const gonder = screen.getByRole('button', { name: 'Yazıcıya gönder' }) as HTMLButtonElement;
    expect(gonder.disabled).toBe(true);
    fireEvent.change(secim, { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Adet'), { target: { value: '2' } });
    fireEvent.click(gonder);
    expect(await screen.findByText(/Gönderildi\. Etiketin çıktığını/)).toBeTruthy();
    const [g] = istekler.gonderilenler;
    expect(g?.yol).toBe('/etiket-merkezi/sablonlar/deneme-50x25/bas');
    expect(g?.govde).toEqual({ yaziciId: 1, adet: 2 });
    expect(istekKimligiMi(g?.kimlik)).toBe(true);
  });

  it('dosya yazıcısı seçilince komut dosyası yazıcının ayarıyla iner ve deftere yazılır', async () => {
    const indirilen = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:yerel', revokeObjectURL: () => undefined }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { indirilen(this.download); });
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] });
    ac(<YaziciDenemesi />);
    fireEvent.change(await screen.findByLabelText('Yazıcı'), { target: { value: '2' } });
    expect(screen.queryByRole('button', { name: 'Yazıcıya gönder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yazıcı için indir' }));
    expect(await screen.findByText(/İndirildi ve deftere yazıldı/)).toBeTruthy();
    const [g] = istekler.gonderilenler;
    expect(g?.yol).toBe('/etiket-merkezi/sablonlar/deneme-50x25/indir');
    expect(g?.govde).toEqual({ yaziciId: 2, adet: 1 });
    expect(istekKimligiMi(g?.kimlik)).toBe(true);
    expect(indirilen).toHaveBeenCalledWith('deneme-50x25-203.prn');
  });

  it('doğrudan baskı kapalıysa nedeni yazar ve ağ yazıcısı listede yoktur; dosya yazıcısı kalır; yetkisiz kullanıcıda bölüm hiç yoktur', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'], yazicilar: { ...YAZICILAR, dogrudanBaski: { acik: false, neden: 'Ayar kapalı.' } } });
    ac(<YaziciDenemesi />);
    expect(await screen.findByText('Ayar kapalı.')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Zebra depo/ })).toBeNull();
    expect(screen.getByRole('option', { name: /Argox masa/ })).toBeTruthy();
    cleanup();
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi'] });
    ac(<YaziciDenemesi />);
    await screen.findByText('Yazıcı denemesi 50x25');
    expect(screen.queryByLabelText('Yazıcı')).toBeNull();
    expect(istekler.some((i) => i.startsWith('/etiket-merkezi/yazicilar'))).toBe(false);
  });

  it('yazıcılar listesi okuyana düzenleme düğmesi göstermez; yazabilen yeni ağ yazıcısını adresiyle ekler', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<Yazicilar />);
    expect(await screen.findByText('Zebra depo')).toBeTruthy();
    expect(screen.getByText('10.0.5.20')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yazıcı ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    cleanup();
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.yazici-yaz'] });
    ac(<Yazicilar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yazıcı ekle' }));
    fireEvent.change(screen.getByLabelText(/^Ad/), { target: { value: 'Zebra sevkiyat' } });
    fireEvent.change(screen.getByLabelText(/IP adresi/), { target: { value: '10.0.5.21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.gonderilenler).toHaveLength(1));
    expect(istekler.gonderilenler[0]).toMatchObject({
      yol: '/etiket-merkezi/yazicilar/ac',
      govde: { ad: 'Zebra sevkiyat', dil: 'zpl', dpi: 203, baglanti: 'ag', adres: '10.0.5.21', sade: false },
    });
  });

  it('dosya yazıcısı düzenlenirken adres alanı yoktur ve sürümle gönderilir', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.yazici-yaz'] });
    ac(<Yazicilar />);
    await screen.findByText('Argox masa');
    fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[1]!);
    expect(screen.queryByLabelText(/IP adresi/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Kullanımda'));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.gonderilenler).toHaveLength(1));
    expect(istekler.gonderilenler[0]).toMatchObject({
      yol: '/etiket-merkezi/yazicilar/2/guncelle',
      govde: { ad: 'Argox masa', baglanti: 'dosya', adres: null, sade: true, aktif: false, surum: 3 },
    });
  });

  it('baskı geçmişi tesis saatini, basanı, hatayı ve indirilen dosyayı gösterir', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<Baskilar />);
    expect(await screen.findByText('2026-10-18 20:30')).toBeTruthy();
    expect(screen.getAllByText('Örnek Kişi')).toHaveLength(3);
    expect(screen.getByText(/Yazıcıya ulaşılamadı/)).toBeTruthy();
    expect(screen.getByText('İndirildi')).toBeTruthy();
    // Kart 2904: tarayıcıdan yazdırmada yazıcı tanımı yoktur; rozet basıldı demez, pencerenin açıldığını söyler.
    expect(screen.getByText('Yazdırma açıldı')).toBeTruthy();
    expect(screen.getByText('Bu bilgisayar (tarayıcı)')).toBeTruthy();
  });

  it('oku yetkisi olmayan etiket listesinde yalnız türleri görür: sahip modülün menü adı, durum ve ölçüler', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi'] });
    ac(<Etiketler />);
    expect(await screen.findByText('Lot etiketi')).toBeTruthy();
    expect(screen.getByText('Stok Merkezi')).toBeTruthy();
    expect(screen.getByText('Sevkiyat')).toBeTruthy();
    expect(screen.getByText('Basılıyor')).toBeTruthy();
    expect(screen.getByText('Yapılacak')).toBeTruthy();
    expect(screen.getByText('Lot 100x50')).toBeTruthy();
    expect(screen.queryByText('Stok Merkezi · Lot etiketi penceresi')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Basılacaklar' })).toBeNull();
    // Her satırda türün piktogramı görünür; ekran okuyucuya yalnız ad gider.
    expect(document.querySelectorAll('svg.tc-etk-tur-simge[aria-hidden="true"]')).toHaveLength(2);
  });

  it('2223: basılacaklar sekmesi bekleyen etiketleri listeler; Bas ve hepsini bas seçili kayıtlarla etiket sayfasına gider; türler sekmesi adreste', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<Etiketler />, '/etiket-merkezi/etiketler');
    expect(await screen.findByText('MK-000012')).toBeTruthy();
    expect(istekler.some((i) => i.startsWith('/etiket-merkezi/bekleyenler'))).toBe(true);
    expect(screen.getByText('2/2 lot etiketi basılmadı')).toBeTruthy();
    expect(screen.getByText('RED · Örnek mil')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'MK-000012 bas' }).getAttribute('href')).toBe('/etiket-merkezi?tur=mal-kabul&id=12');
    expect(screen.getByRole('link', { name: 'Kalite durum etiketleri: hepsini bas (2)' }).getAttribute('href')).toBe('/etiket-merkezi?tur=kalite-durum&id=41%2C40');
    // 2223-2 a: depodan emre veriliş refakat kartıyla, hatalı parça kendi etiketiyle basılır.
    expect(screen.getByRole('link', { name: 'UE-000120-P1 bas' }).getAttribute('href')).toBe('/etiket-merkezi?tur=refakat-partisi&id=7');
    expect(screen.getByRole('link', { name: 'UE-000121 OP 20 bas' }).getAttribute('href')).toBe('/etiket-merkezi?tur=hatali-parca&id=3');
    fireEvent.click(screen.getByRole('tab', { name: 'Etiket türleri' }));
    expect(await screen.findByText('Lot etiketi')).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('?sekme=turler');
  });

  it('2223-4: basılmayacak düğmesi yalnız basma yetkisinde çıkar; satırın türü ve kimliği istek kimliğiyle gider, liste yenilenir', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] });
    ac(<Etiketler />, '/etiket-merkezi/etiketler');
    fireEvent.click(await screen.findByRole('button', { name: 'MK-000012 basılmayacak' }));
    await waitFor(() => expect(istekler.gonderilenler).toHaveLength(1));
    const g = istekler.gonderilenler[0]!;
    expect(g.yol).toBe('/etiket-merkezi/bekleyenler/atla');
    expect(g.govde).toEqual({ tur: 'mal-kabul', idler: [12] });
    expect(g.kimlik).toBeTruthy();
    await waitFor(() => expect(istekler.filter((i) => i.startsWith('/etiket-merkezi/bekleyenler?')).length).toBeGreaterThan(1));
  });

  it('2223-4: yalnız okuyan basılmayacak düğmesini görmez', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<Etiketler />, '/etiket-merkezi/etiketler');
    expect(await screen.findByText('MK-000012')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /basılmayacak$/ })).toBeNull();
  });

  it('stoktan gelen adres seçili konumları açar: yalnız konum şablonları, kayıtlardan çıktı, bulunamayan uyarısı', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12,99');
    expect(await screen.findByText('R1-01-1-1')).toBeTruthy();
    expect(screen.getByText('Yer etiketleri')).toBeTruthy();
    expect(screen.getByText('R1-01-1-2')).toBeTruthy();
    expect(screen.getByText('1 kayıt bulunamadı')).toBeTruthy();
    expect(screen.queryByText('Lot 100x50')).toBeNull();
    expect(istekler).toContain('/etiket-merkezi/sablonlar/konum-50x25/kayit-cikti?dil=zpl&dpi=203&adet=1&sade=false&tur=konum&id=11%2C12%2C99');
    // Basma yetkisi olmayana gönderme bölümü çıkmaz.
    expect(screen.queryByLabelText('Yazıcı')).toBeNull();
  });

  it('seçimden çıkarılan konum adresten de düşer; seçim kaldırılınca tür kalır ve kayıt seçimi açılır', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12');
    fireEvent.click(await screen.findByRole('button', { name: 'R1-01-1-1 çıkar' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('?tur=konum&id=12'));
    // Tek kayıt kalınca çıkarma düğmesi yoktur: boş seçim adresi bozmasın.
    expect(await screen.findByText('R1-01-1-2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /çıkar$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Seçimi kaldır' }));
    // 2223-3 a: tür seçili kalır, kayıt seçimi yeniden açılır.
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('?tur=konum'));
    expect(await screen.findByText('Konum ve raf etiketleri')).toBeTruthy();
  });

  it('kayıt sayısı x adet sınırı aşınca uyarı çıkar ve indirme kapanır', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12');
    await screen.findByText('R1-01-1-1');
    fireEvent.change(screen.getByLabelText('Kayıt başına adet'), { target: { value: '251' } });
    expect(screen.getByText('Bir baskıda en çok 500 etiket (2 kayıt x 251).')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Önizleme için indir \(.*, deftere yazılmaz\)$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('basma yetkisi olan seçili konumları ağ yazıcısına kayıt seçimiyle gönderir', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12');
    fireEvent.change(await screen.findByLabelText('Yazıcı'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yazıcıya gönder' }));
    await waitFor(() => expect(istekler.gonderilenler).toHaveLength(1));
    expect(istekler.gonderilenler[0]).toMatchObject({
      yol: '/etiket-merkezi/sablonlar/konum-50x25/bas',
      govde: { yaziciId: 1, adet: 1, kayit: { tur: 'konum', idler: [11, 12] } },
    });
  });

  it('lot adresi yalnız lot şablonlarını ve lot notunu gösterir', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=lot&id=11');
    expect(await screen.findByText('Lot etiketleri')).toBeTruthy();
    expect(await screen.findByText(/stoktaki lot bilgisi basılır/)).toBeTruthy();
    expect(screen.queryByText('Konum 50x25')).toBeNull();
    await waitFor(() => expect(istekler).toContain('/etiket-merkezi/sablonlar/lot-100x50/kayit-cikti?dil=zpl&dpi=203&adet=1&sade=false&tur=lot&id=11'));
  });

  it('refakat kartı adresi yalnız refakat kartı şablonunu ve notunu gösterir, iki kopyayla açılır', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=refakat-partisi&id=12');
    expect(await screen.findByText('Refakat kartları')).toBeTruthy();
    expect(await screen.findByText(/depodan verilen lot basılır/)).toBeTruthy();
    expect(screen.queryByText('Lot 100x50')).toBeNull();
    await waitFor(() => expect(istekler).toContain('/etiket-merkezi/sablonlar/refakat-100x150/kayit-cikti?dil=zpl&dpi=203&adet=2&sade=false&tur=refakat-partisi&id=12'));
  });

  it('mal kabul adresi lot şablonlarını açar, kabulün lotlarını çip olarak gösterir ve tek lot çıkarılamaz', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=mal-kabul&id=7');
    expect(await screen.findByText('Mal kabul lot etiketleri')).toBeTruthy();
    expect(screen.queryByText('Konum 50x25')).toBeNull();
    expect(await screen.findByText('LT-000502')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /çıkar/ })).toBeNull();
    expect(istekler).toContain('/etiket-merkezi/sablonlar/lot-100x50/kayit-cikti?dil=zpl&dpi=203&adet=1&sade=false&tur=mal-kabul&id=7');
  });

  it('EM-2: önizleme 400 dönünce sunucu iletisi görünür, yeniden deneme sunulmaz ve basma kapanır', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=mal-kabul&id=1,2');
    await screen.findByText('LT-000501');
    fireEvent.change(screen.getByLabelText('Kayıt başına adet'), { target: { value: '120' } });
    expect(await screen.findByText('Bir baskıda en çok 500 etiket basılır (5 kayıt x 120 adet).')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Yazıcı'), { target: { value: '2' } });
    expect((screen.getByRole('button', { name: 'Yazıcı için indir' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sevk koli adresinde koli sayısı ve koli içi adet çıktı isteğine ve baskı gövdesine gider; koli sayısı sınırı denetlenir', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=sevk-koli&id=11');
    expect(await screen.findByText('Sevk koli etiketleri')).toBeTruthy();
    expect(screen.queryByText('Lot 100x50')).toBeNull();
    fireEvent.change(await screen.findByLabelText('Koli sayısı'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/^Koli içi adet/), { target: { value: '12,5' } });
    await waitFor(() => expect(istekler).toContain('/etiket-merkezi/sablonlar/sevk-koli-100x75/kayit-cikti?dil=zpl&dpi=203&adet=1&sade=false&tur=sevk-koli&id=11&koliSayisi=4&koliIci=12.5'));
    fireEvent.change(await screen.findByLabelText('Yazıcı'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yazıcıya gönder' }));
    await waitFor(() => expect(istekler.gonderilenler).toHaveLength(1));
    expect(istekler.gonderilenler[0]).toMatchObject({ govde: { yaziciId: 1, adet: 1, kayit: { tur: 'sevk-koli', idler: [11], koli: { sayi: 4, ici: 12.5 } } } });
    fireEvent.change(screen.getByLabelText('Koli sayısı'), { target: { value: '0' } });
    expect(screen.getByText('Koli sayısı 1 ile 500 arasında olur.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Yazıcıya gönder' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('bozuk adres seçim sayılmaz: tür seçili, ölçü örnek değerlerle açılır', async () => {
    const istekler = sunucuKur();
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,abc');
    expect(await screen.findByRole('heading', { name: '3. Ölçü' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yer etiketleri' }).getAttribute('aria-pressed')).toBe('true');
    await screen.findByText('LT-000123');
    expect(istekler.some((i) => i.includes('kayit-cikti'))).toBe(false);
  });
  it('konum ve raf seçimi (#116): bölümün rafları toplu seçilir, seçim adrese raf türüyle yazılır', async () => {
    const istekler = sunucuKur({ islemler: ['etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=raf');
    expect(await screen.findByLabelText('A1 · Palet rafı · DEPO')).toBeTruthy();
    expect(screen.getByLabelText('A2 · DEPO')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Bölüm'), { target: { value: 'DEPO' } });
    expect(screen.queryByLabelText('B1 · Konsol · URETIM')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Görünenleri seç (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Etiketleri hazırla (2)' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('?tur=raf&id=21%2C22'));
    expect(await screen.findByText('Raf etiketleri')).toBeTruthy();
    expect(istekler.some((i) => i.startsWith('/stok/'))).toBe(false);
  });

  it('konum listesi stok okuması ister; okuyan tek konumu seçip hazırlar, okumayan stoğa istek atmaz', async () => {
    const istekler = sunucuKur({ islemler: ['etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=raf');
    fireEvent.click(await screen.findByRole('tab', { name: 'Konumlar' }));
    expect(await screen.findByText(/Konum listesi stok okuması ister/)).toBeTruthy();
    expect(istekler.some((i) => i.startsWith('/stok/'))).toBe(false);
    cleanup();
    // EM-1: stok.istek (malzeme isteme) stok okuması açmaz; vardiya sorumlusu hata kutusu değil açıklamayı görür.
    const istekci = sunucuKur({ islemler: ['etiket-merkezi.oku', 'stok.istek'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=raf');
    fireEvent.click(await screen.findByRole('tab', { name: 'Konumlar' }));
    expect(await screen.findByText(/Konum listesi stok okuması ister/)).toBeTruthy();
    expect(istekci.some((i) => i.startsWith('/stok/'))).toBe(false);
    cleanup();
    sunucuKur({ islemler: ['etiket-merkezi.oku', 'stok.giris'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=raf');
    fireEvent.click(await screen.findByRole('tab', { name: 'Konumlar' }));
    fireEvent.click(await screen.findByLabelText('KABUL · Mal kabul · ANA'));
    fireEvent.click(screen.getByRole('button', { name: 'Etiketleri hazırla (1)' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('?tur=konum&id=12'));
  });

  it('kayıt okuması olmayan seçim kartını görmez', async () => {
    sunucuKur({ islemler: [] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum');
    await screen.findByText('LT-000123');
    expect(screen.queryByText('Konum ve raf etiketleri')).toBeNull();
  });

  it('2223-3 a: Etiket bas dört adımlıdır; tür seçilmeden ölçü yoktur; tür seçimi adrese yazılır; kaydı başka ekrandan gelen türde sahip ekran ve Basılacaklar bağlantısı; dil ve dpi Gelişmiş altında', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />);
    expect(await screen.findByRole('heading', { name: '1. Ne basılacak' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '3. Ölçü' })).toBeNull();
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThanOrEqual(10);
    fireEvent.click(screen.getByRole('button', { name: 'Lot etiketleri' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('?tur=lot'));
    expect(await screen.findByText('LT-000123')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Stok Merkezi' }).getAttribute('href')).toBe('/stok');
    expect(screen.getByRole('link', { name: 'Basılacaklar' }).getAttribute('href')).toBe('/etiket-merkezi/etiketler');
    expect(screen.getByRole('button', { name: /100x50 mm/ })).toBeTruthy();
    expect(screen.getByText('Gelişmiş').closest('details')?.contains(screen.getByLabelText('Yazıcı dili'))).toBe(true);
    // Kayıt seçilmeden basılmaz.
    expect(screen.queryByLabelText('Yazıcı')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lot etiketleri' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe(''));
  });

  it('şablon kataloğu bütün ölçüleri örnek değerle gösterir, basma bölümü yoktur', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] });
    ac(<SablonKatalogu />);
    expect(await screen.findByText('Konum 50x25')).toBeTruthy();
    expect(screen.getByText('Sevk kolisi 100x75')).toBeTruthy();
    expect(screen.queryByLabelText('Yazıcı')).toBeNull();
  });
});

// Kart 2904: tarayıcıdan vektörel yazdırma. Baskı sayfası gövdenin doğrudan çocuğudur; yazdırma süresince gövde sınıfı ve şablon ölçülü
// @page stili takılır, pencere kapanınca kalkar.
describe('EtiketMerkezi vektörel yazdırma', () => {
  const BAS = ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'] satisfies Islem[];

  it('yazıcı tanımı yokken de düğme vardır; seçili kayıtlar adet kadar mm ölçülü, vektör sayfa olarak basılır ve deftere yazılır', async () => {
    let baskida: { sinif: boolean; stil: string | null; sayfalar: Element[] } | null = null;
    const yazdir = vi.fn(() => {
      baskida = {
        sinif: document.body.classList.contains('tc-etk-baskida'),
        stil: document.getElementById('tc-etk-sayfa')?.textContent ?? null,
        sayfalar: [...document.querySelectorAll('body > .tc-etk-baski > .tc-etk-baski-sayfa')],
      };
    });
    vi.stubGlobal('print', yazdir);
    const istekler = sunucuKur({ islemler: BAS, yazicilar: { yazicilar: [], dogrudanBaski: { acik: false, neden: 'Kapalı.' } } });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12');
    fireEvent.change(await screen.findByLabelText('Kayıt başına adet'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Vektörel yazdır' }));
    expect(await screen.findByText(/Yazdırma penceresi açıldı ve deftere yazıldı/)).toBeTruthy();
    await waitFor(() => expect(yazdir).toHaveBeenCalledTimes(1));
    const g = istekler.gonderilenler.find((x) => x.yol.endsWith('/yazdir'));
    expect(g?.yol).toBe('/etiket-merkezi/sablonlar/konum-50x25/yazdir');
    expect(g?.govde).toEqual({ adet: 3, kayit: { tur: 'konum', idler: [11, 12] } });
    expect(istekKimligiMi(g?.kimlik)).toBe(true);
    const b = baskida as { sinif: boolean; stil: string | null; sayfalar: Element[] } | null;
    expect(b?.sinif).toBe(true);
    expect(b?.stil).toBe('@page { size: 50mm 25mm; margin: 0; }');
    expect(b?.sayfalar).toHaveLength(6);
    for (const sayfa of b?.sayfalar ?? []) {
      const svg = sayfa.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('50mm');
      expect(svg?.getAttribute('height')).toBe('25mm');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 50 25');
      // QR kareleri yol olarak çizilir; görüntü ya da tuval yoktur.
      expect(svg?.querySelector('path[aria-label="QR: LOT:LT-000123"]')?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+h/);
      expect(sayfa.querySelector('image, canvas, img')).toBeNull();
    }
    fireEvent(window, new Event('afterprint'));
    await waitFor(() => expect(document.querySelector('.tc-etk-baski')).toBeNull());
    expect(document.body.classList.contains('tc-etk-baskida')).toBe(false);
    expect(document.getElementById('tc-etk-sayfa')).toBeNull();
  });

  it('ekran ölçeği baskıya uygulanmaz; deneme etiketi yazıcısız basılır', async () => {
    localStorage.setItem('tc-etk-mm-olcek', '1.5');
    const sayfa: { genislik: string | null }[] = [];
    vi.stubGlobal('print', vi.fn(() => { sayfa.push({ genislik: document.querySelector('.tc-etk-baski svg')?.getAttribute('width') ?? null }); }));
    const istekler = sunucuKur({ islemler: BAS });
    ac(<YaziciDenemesi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vektörel yazdır' }));
    await waitFor(() => expect(sayfa).toHaveLength(1));
    expect(sayfa[0]?.genislik).toBe('50mm');
    expect(istekler.gonderilenler.find((x) => x.yol.endsWith('/yazdir'))?.govde).toEqual({ adet: 1 });
    localStorage.removeItem('tc-etk-mm-olcek');
  });

  it('basma yetkisi olmayan düğmeyi görmez', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12');
    expect(await screen.findByText(/2 etiket, önizleme ilk kayıt/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vektörel yazdır' })).toBeNull();
  });
});

// 2916 a: olay ekranındaki etiket düğmesi bu cihazın varsayılan yazıcısına basar; varsayılan Etiket bas'ta seçilir, bekleyenlerde
// türün hepsi Etiket Merkezi'ne gitmeden oraya gider.
describe('EtiketMerkezi cihaz varsayılanı', () => {
  afterEach(() => { localStorage.clear(); });
  const BASAN: Islem[] = ['sayfa.etiket-merkezi', 'etiket-merkezi.oku', 'etiket-merkezi.bas'];

  it('ağ yazıcısı seçilince bu cihazda varsayılan yapılır; sonraki açılışta seçili gelir; kaldırılınca düşer', async () => {
    sunucuKur({ islemler: BASAN });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11');
    fireEvent.change(await screen.findByLabelText('Yazıcı'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bu cihazda varsayılan yap' }));
    expect(cihazYazicilari().konum).toEqual({ yaziciId: 1, yaziciAd: 'Zebra depo', sablonAnahtar: 'konum-50x25', sablonAd: 'Konum 50x25' });
    expect(screen.getByText(/doğrudan Zebra depo yazıcısına, Konum 50x25 ölçüsünde basar/)).toBeTruthy();
    cleanup();
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11');
    expect(((await screen.findByLabelText('Yazıcı')) as HTMLSelectElement).value).toBe('1');
    const kutu = screen.getByRole('checkbox', { name: 'Bu cihazda varsayılan yap' }) as HTMLInputElement;
    expect(kutu.checked).toBe(true);
    fireEvent.click(kutu);
    expect(cihazYazicilari().konum).toBeUndefined();
  });

  it('dosya yazıcısında ve kayıtsız yazıcı denemesinde varsayılan seçeneği yoktur (yasak)', async () => {
    sunucuKur({ islemler: BASAN });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11');
    fireEvent.change(await screen.findByLabelText('Yazıcı'), { target: { value: '2' } });
    expect(screen.queryByRole('checkbox', { name: 'Bu cihazda varsayılan yap' })).toBeNull();
    cleanup();
    ac(<YaziciDenemesi />, '/etiket-merkezi/yazici-denemesi');
    fireEvent.change(await screen.findByLabelText('Yazıcı'), { target: { value: '1' } });
    expect(screen.queryByRole('checkbox', { name: 'Bu cihazda varsayılan yap' })).toBeNull();
  });

  it('bekleyenlerde varsayılanı olan türün hepsi o yazıcıya kayıtlarla basılır; varsayılanı olmayan tür Etiket bas sayfasını açar', async () => {
    cihazYazicisiKaydet('lot', { yaziciId: 1, yaziciAd: 'Zebra depo', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50' });
    const istekler = sunucuKur({ islemler: BASAN });
    ac(<Etiketler />, '/etiket-merkezi/etiketler');
    fireEvent.click(await screen.findByRole('button', { name: /hepsini bas \(1\) · Zebra depo$/ }));
    await waitFor(() => expect(istekler.gonderilenler).toHaveLength(1));
    expect(istekler.gonderilenler[0]).toMatchObject({ yol: '/etiket-merkezi/sablonlar/lot-100x50/bas', govde: { yaziciId: 1, adet: 1, kayit: { tur: 'mal-kabul', idler: [12] } } });
    expect(istekler.gonderilenler[0]!.kimlik).not.toBeNull();
    expect(await screen.findByText('Etiketler gönderildi: Zebra depo.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kalite durum etiketleri: hepsini bas (2)' }).getAttribute('href')).toBe('/etiket-merkezi?tur=kalite-durum&id=41%2C40');
  });

  it('başka ölçüde kayıtlı varsayılan bu şablonda işaretli görünmez; şu anki varsayılan yazılır', async () => {
    cihazYazicisiKaydet('konum', { yaziciId: 1, yaziciAd: 'Zebra depo', sablonAnahtar: 'konum-100x50', sablonAd: 'Konum 100x50' });
    sunucuKur({ islemler: BASAN });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11');
    fireEvent.change(await screen.findByLabelText('Yazıcı'), { target: { value: '1' } });
    expect((screen.getByRole('checkbox', { name: 'Bu cihazda varsayılan yap' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Bu cihazda şu an varsayılan: Zebra depo · Konum 100x50.')).toBeTruthy();
  });

  it('yazıcı adı düğmede görünür; 10 etiketten çoğu tek onayla basılır, vazgeçilirse istek gitmez; tek basım en çok 200 kayıttır', async () => {
    cihazYazicisiKaydet('lot', { yaziciId: 1, yaziciAd: 'Zebra depo', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50' });
    const cok: BekleyenlerCevabi = {
      gun: 30,
      bekleyenler: Array.from({ length: 205 }, (_, i) => ({ tur: 'mal-kabul' as const, id: i + 1, baslik: `MK-${String(i + 1)}`, ayrinti: '', zaman: '2026-11-07T08:00:00.000Z', etiketSayisi: 1 })),
    };
    const istekler = sunucuKur({ islemler: BASAN, bekleyenler: cok });
    ac(<Etiketler />, '/etiket-merkezi/etiketler');
    const dugme = await screen.findByRole('button', { name: /hepsini bas \(200\) · Zebra depo$/ });
    expect(dugme.textContent).toContain('· Zebra depo');
    fireEvent.click(dugme);
    expect(await screen.findByText('200 etiket Zebra depo yazıcısına basılsın mı?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(istekler.gonderilenler).toHaveLength(0);
    fireEvent.click(dugme);
    fireEvent.click(await screen.findByRole('button', { name: 'Evet, bas' }));
    await waitFor(() => expect(istekler.gonderilenler).toHaveLength(1));
    const govde = istekler.gonderilenler[0]!.govde as { kayit: { idler: number[] } };
    expect(govde.kayit.idler).toHaveLength(200);
  });

  it('basma yetkisi olmayan varsayılan olsa da hepsini bas ile Etiket bas sayfasına gider, baskı isteği gitmez (yasak)', async () => {
    cihazYazicisiKaydet('lot', { yaziciId: 1, yaziciAd: 'Zebra depo', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50' });
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<Etiketler />, '/etiket-merkezi/etiketler');
    expect(await screen.findByText('MK-000012')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /· Zebra depo$/ })).toBeNull();
    expect(istekler.gonderilenler).toHaveLength(0);
  });
});

// 2922 a: konum ve istasyon etiketi tek "Yer etiketi"; istasyon onun teslim yeri boyu. Katalog satırları değişmez.
describe('Yer etiketi grubu', () => {
  const satir = (kod: string, ad: string, sablon: { anahtar: string; ad: string }): EtiketlerCevabi['etiketler'][number] => ({
    kod, ad, sahipModul: 'stok', tetik: `${ad} açılınca`, alanlar: 'QR (LOC)', sablonTuru: kod === 'istasyon' ? 'istasyon' : 'konum',
    kayitTurleri: [kod === 'istasyon' ? 'istasyon' : 'konum'], durum: 'hazir', disaridakiYol: null, sablonlar: [sablon],
  });
  const KONUM = satir('konum', 'Konum etiketi', { anahtar: 'konum-50x25', ad: 'Yer 50x25' });
  const ISTASYON = satir('istasyon', 'İstasyon etiketi', { anahtar: 'istasyon-100x50', ad: 'Yer 100x50 · Teslim yeri' });
  const LOT = ETIKETLER.etiketler[0]!;

  it('konum ve istasyon tek satırdır; istasyon ölçüsü yer etiketinin boyudur, öteki türler aynen kalır', () => {
    const g = yerGrubu([LOT, KONUM, ISTASYON]);
    expect(g.map((e) => e.kod)).toEqual(['lot', 'konum']);
    expect(g[1]).toMatchObject({ ad: 'Yer etiketi', kayitTurleri: ['konum', 'istasyon'] });
    expect(g[1]!.sablonlar.map((s) => s.ad)).toEqual(['Yer 50x25', 'Yer 100x50 · Teslim yeri']);
    expect(g[1]!.tetik).toContain('teslim yeri boyu');
  });

  it('kayıt seçiminde iki tür de yer etiketi başlığıyla görünür', () => {
    expect([KAYIT_BASLIKLARI.konum, KAYIT_BASLIKLARI.istasyon]).toEqual(['Yer etiketleri', 'Yer etiketleri · teslim yeri']);
  });

  it('ikisinden biri yoksa liste değişmez', () => {
    expect(yerGrubu([LOT, KONUM])).toEqual([LOT, KONUM]);
    expect(yerGrubu([ISTASYON])).toEqual([ISTASYON]);
  });

  it('Etiket türleri sekmesinde tek "Yer etiketi" satırı görünür', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'], etiketler: { etiketler: [LOT, KONUM, ISTASYON] } });
    ac(<Etiketler />, '/etiket-merkezi/etiketler?sekme=turler');
    expect(await screen.findByText('Yer etiketi')).toBeTruthy();
    expect(screen.queryByText('İstasyon etiketi')).toBeNull();
    expect(screen.getByText('Yer 50x25, Yer 100x50 · Teslim yeri')).toBeTruthy();
  });
});
