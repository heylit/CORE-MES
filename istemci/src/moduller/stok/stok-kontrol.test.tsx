import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ArtikParcalarCevabi, AyirmaIstekleriCevabi, IhtiyaclarCevabi, OlcuAramaCevabi } from '#paylasilan/sozlesme/stok-kontrol.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';

// Stok kontrol sayfası (3398 surum 4 a).
const SATIN_ALMA: Kullanici = { id: 8, ad: 'Deneme Satın Alma', islemler: ['satin-alma.yaz'] };
const KALITELER: OlcuAramaCevabi = { adaylar: [], karsilanan: null, gereken: null, olcusuzKart: 0, kaliteler: ['ORN-K1'] };
const SONUC: OlcuAramaCevabi = {
  adaylar: [
    { kaynak: 'artik', malzemeNo: 11, kod: 'ORN-HM-1', ad: 'Deneme çubuk', kalite: 'ORN-K1', form: 'cubuk', olcu: { d: 50, l: 1250 }, miktar: '1', birim: 'adet',
      konumlar: ['A-01-1'], artikId: 3, ilkGiris: '2026-11-01T10:00:00+03:00', durum: 'tam', fazla: {}, fireYuzde: 0, parcaSayisi: 6 },
    { kaynak: 'stok', malzemeNo: 12, kod: 'ORN-HM-2', ad: 'Deneme çubuk', kalite: 'ORN-K1', form: 'cubuk', olcu: { d: 55, l: 3000 }, miktar: '3', birim: 'adet',
      konumlar: ['A-02-1'], artikId: null, ilkGiris: '2026-10-01T10:00:00+03:00', durum: 'yakin', fazla: { d: 5 }, fireYuzde: 21, parcaSayisi: 48 },
  ],
  karsilanan: 40, gereken: 40, olcusuzKart: 1, kaliteler: ['ORN-K1'],
};
const ARTIKLAR: ArtikParcalarCevabi = {
  sinirli: false,
  satirlar: [{ id: 3, malzemeNo: 11, kod: 'ORN-HM-1', ad: 'Deneme çubuk', form: 'cubuk', konumId: 4, konumKod: 'A-01-1', partiId: null, olcu: { d: 50, l: 1250 },
    adet: 1, durum: 'acik', aciklama: null, kaydeden: 'Deneme Depocu', kayitZamani: '2026-11-01T10:00:00+03:00', surum: 1 }],
};

const IHTIYAC: IhtiyaclarCevabi = {
  sinirli: false,
  satirlar: [{ kaynak: 'satin-alma', talepId: 't1', talepNo: 'ST-2026-001', baslik: 'ORN talep', kalemId: 'k1', ad: 'ORN kalem', malzemeNo: 11, kod: 'ORN-HM-1',
    form: 'cubuk', kalite: 'ORN-K1', olcu: { d: 50, l: 3000 }, miktar: '3', birim: 'adet', uretimEmriId: null, ihtiyacTarihi: '2026-11-30',
    durum: 'kismen', karsilanan: 2, enIyi: SONUC.adaylar[1]!, adaySayisi: 1, engel: null }],
};

const AYIRMA: AyirmaIstekleriCevabi = {
  sinirli: false,
  satirlar: [{ id: 9, kaynak: 'satin-alma', talepId: 't1', kalemId: 'k1', siparisId: null, talepNo: 'ST-2026-001', kalemAd: 'ORN kalem', malzemeNo: 11, kod: 'ORN-HM-1', miktar: '2.0000', birim: 'adet',
    uretimEmriId: null, kaynaklar: [{ malzemeNo: 12, kod: 'ORN-HM-2', artikId: null, stokMiktari: 2, karsilanan: 2, konumlar: ['A-02-1'] }], durum: 'bekliyor',
    iptalNedeni: null, geriEklendi: null, isteyen: 'Deneme Satın Alma', istekZamani: '2026-11-17T10:00:00+03:00', karar: null, kararZamani: null, surum: 1 }],
};

describe('Stok kontrol (3398)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('açılışta teklif öncesi talepler: istenen, stoktan karşılanan, durum ve en uygun aday', async () => {
    sunucuKur(SATIN_ALMA, { 'GET /stok/kontrol-ihtiyaclari': () => json(200, IHTIYAC) });
    ac('/stok/kontrol');
    const tablo = await screen.findByRole('table', { name: 'Teklif öncesi talepler' });
    const satir = within(tablo).getAllByRole('row')[1]!;
    expect(within(satir).getByText('ST-2026-001')).toBeTruthy();
    expect(within(satir).getByText('2 / 3 adet')).toBeTruthy();
    expect(within(satir).getByText('Ø50 × 3.000 mm')).toBeTruthy();
    expect(within(satir).getByText('Kısmen')).toBeTruthy();
    expect(within(satir).getByText('Yakın +5 mm')).toBeTruthy();
  });

  it('ölçüyle arar: seçilen pay ve ölçü sorguya gider, artık önce, yakın fazla mm ile, karşılanan başlıkta', async () => {
    const istekler = sunucuKur(SATIN_ALMA, {
      'GET /stok/olcu-arama': () => json(200, istekler.some((i) => i.yol.includes('d=50')) ? SONUC : KALITELER),
    });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Ölçüyle ara' }));
    const form = await screen.findByRole('form', { name: 'Ölçüyle ara' });
    const ara = within(form).getByRole('button', { name: 'Ara' }) as HTMLButtonElement;
    expect(ara.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Çap (mm)'), { target: { value: '50' } });
    fireEvent.change(within(form).getByLabelText('Parça boyu (mm)'), { target: { value: '180' } });
    fireEvent.change(within(form).getByLabelText('Adet'), { target: { value: '40' } });
    fireEvent.change(within(form).getByLabelText('Fazla pay'), { target: { value: 'mm-5' } });
    fireEvent.click(ara);
    const tablo = await screen.findByRole('table', { name: 'Uygun stok' });
    const yol = istekler.filter((i) => i.yol.startsWith('/stok/olcu-arama') && i.yol.includes('d=50')).at(-1)!.yol;
    const p = new URLSearchParams(yol.split('?')[1]);
    expect([p.get('form'), p.get('d'), p.get('parcaBoyu'), p.get('adet'), p.get('pay'), p.get('payDeger'), p.get('artik')]).toEqual(['cubuk', '50', '180', '40', 'mm', '5', 'evet']);
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[0]!).getByText('Artık')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Yakın +5 mm')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('%21')).toBeTruthy();
    expect(screen.getByText('Stokta karşılanan 40 / 40 parça')).toBeTruthy();
    expect(screen.getByText('Stoktan karşılanır')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('1 kart aranamadı');
  });

  it('elle fazla pay mm olarak gider', async () => {
    const istekler = sunucuKur(SATIN_ALMA, { 'GET /stok/olcu-arama': () => json(200, KALITELER) });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Ölçüyle ara' }));
    const form = await screen.findByRole('form', { name: 'Ölçüyle ara' });
    fireEvent.change(within(form).getByLabelText('Çap (mm)'), { target: { value: '50' } });
    fireEvent.change(within(form).getByLabelText('Fazla pay'), { target: { value: 'elle' } });
    fireEvent.change(within(form).getByLabelText('Fazla pay (mm)'), { target: { value: '7,5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Ara' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('d=50'))).toBe(true));
    const p = new URLSearchParams(istekler.find((i) => i.yol.includes('d=50'))!.yol.split('?')[1]);
    expect([p.get('pay'), p.get('payDeger')]).toEqual(['mm', '7.5']);
  });

  it('artık parçalar: depocu onaylayıp kullanıldı der, sürümle gider; satın almada işlem düğmesi yok', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/olcu-arama': () => json(200, KALITELER),
      'GET /stok/artik-parcalar': () => json(200, ARTIKLAR),
      'POST /stok/artik-parcalar/3/kapat': () => json(200, { id: 3, surum: 2 }),
    });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Artık parçalar' }));
    const tablo = await screen.findByRole('table', { name: 'Artık parçalar' });
    expect(within(tablo).getByText('Ø50 × 1.250 mm')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Kullanıldı' }));
    // Tek tıkla kapanmaz: onay penceresi geri alınamaz der.
    const onay = await screen.findByRole('dialog', { name: 'Artık kullanıldı' });
    expect(onay.textContent).toContain('geri alınamaz');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(within(onay).getByRole('button', { name: 'Kullanıldı' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ durum: 'kullanildi', surum: 1 }));
    cleanup();
    sunucuKur(SATIN_ALMA, { 'GET /stok/olcu-arama': () => json(200, KALITELER), 'GET /stok/artik-parcalar': () => json(200, ARTIKLAR) });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Artık parçalar' }));
    const t2 = await screen.findByRole('table', { name: 'Artık parçalar' });
    expect(within(t2).getByText('ORN-HM-1')).toBeTruthy();
    expect(within(t2).queryByRole('button', { name: 'Kullanıldı' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kalan parça kaydet' })).toBeNull();
  });

  it('stoktan karşıla (3398-2 a): satın alma karşılanabilen kadar ister; fazlası gönderilmez; depo kalemi görmez düğmesiz', async () => {
    const bagli = { ...IHTIYAC.satirlar[0]!, talepId: 't2', talepNo: 'ST-2026-002', engel: 'logo' as const };
    const istekler = sunucuKur(SATIN_ALMA, {
      'GET /stok/kontrol-ihtiyaclari': () => json(200, { ...IHTIYAC, satirlar: [...IHTIYAC.satirlar, bagli] }),
      'POST /stok/kontrol-ihtiyaclari/karsila': () => json(200, { id: 9, surum: 1, durum: 'bekliyor', geriEklendi: null }),
    });
    ac('/stok/kontrol');
    const tablo = await screen.findByRole('table', { name: 'Teklif öncesi talepler' });
    // Bağlı kalemde düğme yerine neden yazılır.
    const bagliSatir = within(tablo).getAllByRole('row')[2]!;
    expect(within(bagliSatir).getByText("Logo'ya bağlı")).toBeTruthy();
    expect(within(bagliSatir).queryByRole('button', { name: 'Stoktan karşıla' })).toBeNull();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Stoktan karşıla' }));
    const p = await screen.findByRole('dialog', { name: 'Stoktan karşıla' });
    const girdi = within(p).getByLabelText(/^Stoktan karşılanacak \(adet\)/) as HTMLInputElement;
    expect(girdi.value).toBe('2');
    const iste = within(p).getByRole('button', { name: 'Depodan iste' }) as HTMLButtonElement;
    fireEvent.change(girdi, { target: { value: '3' } });
    expect(iste.disabled).toBe(true);
    fireEvent.change(girdi, { target: { value: '1' } });
    fireEvent.click(iste);
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ talepId: 't1', kalemId: 'k1', miktar: '1' }));
    cleanup();
    sunucuKur(DEPOCU, { 'GET /stok/kontrol-ihtiyaclari': () => json(200, IHTIYAC), 'GET /stok/ayirma-istekleri': () => json(200, AYIRMA) });
    ac('/stok/kontrol');
    // Depo ayırma isteklerinden başlar.
    await screen.findByRole('table', { name: 'Ayırma istekleri' });
    fireEvent.click(screen.getByRole('tab', { name: 'Talepler' }));
    const t2 = await screen.findByRole('table', { name: 'Teklif öncesi talepler' });
    expect(within(t2).getByText('ST-2026-001')).toBeTruthy();
    expect(within(t2).queryByRole('button', { name: 'Stoktan karşıla' })).toBeNull();
  });

  it('ayırma istekleri: depo ayırır; iptal nedenle ve onayla gider; satın almada Ayrıldı yok', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/kontrol-ihtiyaclari': () => json(200, IHTIYAC),
      'GET /stok/ayirma-istekleri': () => json(200, AYIRMA),
      'POST /stok/ayirma-istekleri/9/ilerlet': () => json(200, { id: 9, surum: 2, durum: 'ayrildi', geriEklendi: null }),
      'POST /stok/ayirma-istekleri/9/iptal': () => json(200, { id: 9, surum: 2, durum: 'iptal', geriEklendi: true }),
    });
    ac('/stok/kontrol');
    const tablo = await screen.findByRole('table', { name: 'Ayırma istekleri' });
    expect(within(tablo).getByText('ORN-HM-2 · A-02-1')).toBeTruthy();
    expect(within(tablo).getByText('Depoda bekliyor')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Ayrıldı' }));
    await waitFor(() => expect(istekler.find((i) => i.yol.endsWith('/ilerlet'))?.govde).toEqual({ durum: 'ayrildi', surum: 1 }));
    fireEvent.click(within(tablo).getByRole('button', { name: 'İptal' }));
    const onay = await screen.findByRole('dialog', { name: 'Ayırma isteğini iptal et' });
    fireEvent.click(within(onay).getByRole('button', { name: 'İptal et' }));
    expect(istekler.some((i) => i.yol.endsWith('/iptal'))).toBe(false);
    fireEvent.change(within(onay).getByLabelText(/^İptal nedeni/), { target: { value: 'ORN vazgeçildi' } });
    fireEvent.click(within(onay).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => expect(istekler.find((i) => i.yol.endsWith('/iptal'))?.govde).toEqual({ neden: 'ORN vazgeçildi', surum: 1 }));
    cleanup();
    sunucuKur(SATIN_ALMA, { 'GET /stok/kontrol-ihtiyaclari': () => json(200, IHTIYAC), 'GET /stok/ayirma-istekleri': () => json(200, AYIRMA) });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Ayırma istekleri' }));
    const t2 = await screen.findByRole('table', { name: 'Ayırma istekleri' });
    expect(within(t2).getByText('ORN kalem')).toBeTruthy();
    expect(within(t2).queryByRole('button', { name: 'Ayrıldı' })).toBeNull();
    expect(within(t2).getByRole('button', { name: 'İptal' })).toBeTruthy();
  });

  it('3429-3 F2: satış siparişinden gelen istek belgeyi "Sipariş" diye yazar; iptal penceresi talebe geri eklemeyi anmaz', async () => {
    const siparisten: AyirmaIstekleriCevabi = { sinirli: false, satirlar: [{ ...AYIRMA.satirlar[0]!, kaynak: 'siparis', talepId: null, kalemId: null, siparisId: 5, talepNo: 'SS-ORN-005' }] };
    sunucuKur(DEPOCU, { 'GET /stok/kontrol-ihtiyaclari': () => json(200, IHTIYAC), 'GET /stok/ayirma-istekleri': () => json(200, siparisten) });
    ac('/stok/kontrol');
    const tablo = await screen.findByRole('table', { name: 'Ayırma istekleri' });
    expect(within(tablo).getByText('Sipariş SS-ORN-005')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'İptal' }));
    const onay = await screen.findByRole('dialog', { name: 'Ayırma isteğini iptal et' });
    expect(within(onay).getByText(/sipariş kalemi değişmez/)).toBeTruthy();
  });
});
