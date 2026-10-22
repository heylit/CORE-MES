import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ISTEK_KIMLIGI_BASLIGI, istekKimligiMi } from '#paylasilan/istek-kimligi.ts';
import type { BaskilarCevabi, CiktiCevabi, KayitCiktiCevabi, SablonlarCevabi, YazicilarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Baskilar } from './Baskilar.tsx';
import { HazirSablonlar, YaziciDenemesi } from './EtiketMerkezi.tsx';
import { Yazicilar } from './Yazicilar.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const SABLONLAR: SablonlarCevabi = {
  sablonlar: [
    { anahtar: 'lot-100x50', ad: 'Lot 100x50', tur: 'lot', genislik: 100, yukseklik: 50, ogeler: [] },
    { anahtar: 'konum-50x25', ad: 'Konum 50x25', tur: 'konum', genislik: 50, yukseklik: 25, ogeler: [] },
    { anahtar: 'deneme-50x25', ad: 'Yazıcı denemesi 50x25', tur: 'deneme', genislik: 50, yukseklik: 25, ogeler: [] },
    { anahtar: 'refakat-100x150', ad: 'Refakat kartı 100x150', tur: 'refakat', genislik: 100, yukseklik: 150, ogeler: [] },
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
    { id: 6, zaman: '2026-10-18T17:20:00.000Z', yazici: 'Zebra depo', sablonAnahtar: 'deneme-50x25', adet: 1, kisi: null, sonuc: 'hata', hata: 'Yazıcıya ulaşılamadı.', kayitSayisi: 0 },
  ],
};

const KONUMLAR: Record<number, string> = { 11: 'R1-01-1-1', 12: 'R1-01-1-2' };

interface Gonderilen { yol: string; govde: unknown; kimlik: string | null }

function sunucuKur(secenek: { islemler?: Islem[]; yazicilar?: YazicilarCevabi } = {}) {
  const istekler: string[] = [];
  const gonderilenler: Gonderilen[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, init?: RequestInit) => {
    const url = new URL(adres, 'http://yerel');
    const yol = url.pathname.replace('/api', '');
    istekler.push(`${yol}?${url.searchParams.toString()}`);
    if (init?.method === 'POST') {
      const basliklar = (init.headers ?? {}) as Record<string, string>;
      gonderilenler.push({ yol, govde: JSON.parse(String(init.body)), kimlik: basliklar[ISTEK_KIMLIGI_BASLIGI] ?? null });
      if (yol.endsWith('/bas')) return json(200, { baskiId: 9, sonuc: 'gonderildi', ileti: null });
      if (yol.endsWith('/indir')) return json(200, { baskiId: 10, dosyaAdi: 'deneme-50x25-203.prn', komut: '\nN\nP1\n' });
      return json(200, { ...YAZICILAR.yazicilar[0], id: 3, ad: 'Yeni', surum: 1 });
    }
    if (yol === '/oturum') return json(200, { kullanici: { id: 1, ad: 'Örnek', islemler: secenek.islemler ?? [] } });
    if (yol === '/etiket-merkezi/sablonlar') return json(200, SABLONLAR);
    if (yol === '/etiket-merkezi/yazicilar') return json(200, secenek.yazicilar ?? YAZICILAR);
    if (yol === '/etiket-merkezi/baskilar') return json(200, BASKILAR);
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
  it('hazır şablonlarda deneme etiketi yoktur; ilk şablonun önizlemesi ve QR içeriği görünür', async () => {
    sunucuKur();
    ac(<HazirSablonlar />);
    expect(await screen.findByText('LT-000123')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Lot 100x50 önizleme' })).toBeTruthy();
    expect(screen.getByLabelText('QR: LOT:LT-000123')).toBeTruthy();
    expect(screen.queryByText('Yazıcı denemesi 50x25')).toBeNull();
    expect(screen.getByRole('button', { name: 'Önizleme için indir (lot-100x50-203.zpl, deftere yazılmaz)' })).toBeTruthy();
  });

  it('dil, çözünürlük, adet ve sadeleştirme çıktı isteğine gider', async () => {
    const istekler = sunucuKur();
    ac(<HazirSablonlar />);
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
    ac(<HazirSablonlar />);
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
    expect(screen.getAllByText('Örnek Kişi')).toHaveLength(2);
    expect(screen.getByText(/Yazıcıya ulaşılamadı/)).toBeTruthy();
    expect(screen.getByText('İndirildi')).toBeTruthy();
  });

  it('stoktan gelen adres seçili konumları açar: yalnız konum şablonları, kayıtlardan çıktı, bulunamayan uyarısı', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12,99');
    expect(await screen.findByText('R1-01-1-1')).toBeTruthy();
    expect(screen.getByText('Konum etiketleri')).toBeTruthy();
    expect(screen.getByText('R1-01-1-2')).toBeTruthy();
    expect(screen.getByText('1 kayıt bulunamadı')).toBeTruthy();
    expect(screen.queryByText('Lot 100x50')).toBeNull();
    expect(istekler).toContain('/etiket-merkezi/sablonlar/konum-50x25/kayit-cikti?dil=zpl&dpi=203&adet=1&sade=false&tur=konum&id=11%2C12%2C99');
    // Basma yetkisi olmayana gönderme bölümü çıkmaz.
    expect(screen.queryByLabelText('Yazıcı')).toBeNull();
  });

  it('seçimden çıkarılan konum adresten de düşer; seçim kaldırılınca örnek değerli sayfaya dönülür', async () => {
    sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,12');
    fireEvent.click(await screen.findByRole('button', { name: 'R1-01-1-1 çıkar' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('?tur=konum&id=12'));
    // Tek kayıt kalınca çıkarma düğmesi yoktur: boş seçim adresi bozmasın.
    expect(await screen.findByText('R1-01-1-2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /çıkar$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Seçimi kaldır' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe(''));
    expect(await screen.findByText('Hazır şablonlar')).toBeTruthy();
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

  it('refakat adresi yalnız refakat kartı şablonunu ve notunu gösterir', async () => {
    const istekler = sunucuKur({ islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.oku'] });
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=refakat&id=12');
    expect(await screen.findByText('Refakat kartları')).toBeTruthy();
    expect(await screen.findByText(/refakat kartı bilgisi basılır/)).toBeTruthy();
    expect(screen.queryByText('Lot 100x50')).toBeNull();
    await waitFor(() => expect(istekler).toContain('/etiket-merkezi/sablonlar/refakat-100x150/kayit-cikti?dil=zpl&dpi=203&adet=1&sade=false&tur=refakat&id=12'));
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

  it('bozuk adres seçim sayılmaz: hazır şablonlar örnek değerlerle açılır', async () => {
    const istekler = sunucuKur();
    ac(<HazirSablonlar />, '/etiket-merkezi?tur=konum&id=11,abc');
    expect(await screen.findByText('Hazır şablonlar')).toBeTruthy();
    await screen.findByText('LT-000123');
    expect(istekler.some((i) => i.includes('kayit-cikti'))).toBe(false);
  });
  it('konum ve raf seçimi (#116): bölümün rafları toplu seçilir, seçim adrese raf türüyle yazılır', async () => {
    const istekler = sunucuKur({ islemler: ['etiket-merkezi.oku'] });
    ac(<HazirSablonlar />);
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
    ac(<HazirSablonlar />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Konumlar' }));
    expect(await screen.findByText(/Konum listesi stok okuması ister/)).toBeTruthy();
    expect(istekler.some((i) => i.startsWith('/stok/'))).toBe(false);
    cleanup();
    sunucuKur({ islemler: ['etiket-merkezi.oku', 'stok.giris'] });
    ac(<HazirSablonlar />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Konumlar' }));
    fireEvent.click(await screen.findByLabelText('KABUL · Mal kabul · ANA'));
    fireEvent.click(screen.getByRole('button', { name: 'Etiketleri hazırla (1)' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('?tur=konum&id=12'));
  });

  it('kayıt okuması olmayan seçim kartını görmez', async () => {
    sunucuKur({ islemler: [] });
    ac(<HazirSablonlar />);
    await screen.findByText('LT-000123');
    expect(screen.queryByText('Konum ve raf etiketleri')).toBeNull();
  });
});
