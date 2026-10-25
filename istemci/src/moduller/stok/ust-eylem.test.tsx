import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GelecekSepetCevabi, IsMalzemeleriCevabi, IstasyonSepetiCevabi, IstekMalzemeleriCevabi, MalzemeIstegi, Teslim, TeslimKutusuCevabi, YerdekiStokCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { json, sunucuKur } from './test-ortak.tsx';
import { MALZEME_TESLIM_AC } from './disari.ts';
import { ustEylemler } from './ust-eylem.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const uc = (konumId: number, kod: string, ad: string, istasyonId: number | null) => ({ konumId, kod, ad, istasyonId });
const GELEN: Teslim = {
  id: 41, no: 'TS-000041', malzemeId: 901, malzemeAd: 'Deneme mil', miktar: '3.000', partiId: 4, statuId: 7,
  kaynak: uc(20, 'IST-1', 'Torna 1', 1), hedef: uc(21, 'IST-2', 'Freze 2', 2), uretimEmriId: null, istekId: null, aciklama: null,
  durum: 'yolda', alinan: null, redNedeni: null, gonderenAd: 'Deneme Kişi', kapatanAd: null, aliciAd: null, gonderim: '2026-10-14T08:00:00+03:00', kapanis: null, surum: 1,
};
const KUTU: TeslimKutusuCevabi = {
  gelenler: [GELEN], gonderdiklerim: [], isteklerim: [],
  istasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }],
  hedefIstasyonlar: [{ id: 1, kod: 'T1', ad: 'Torna 1' }, { id: 2, kod: 'F2', ad: 'Freze 2' }],
  depoKonumlari: [{ id: 5, kod: 'KABUL', ad: 'Mal kabul' }],
  araAlanlar: [],
  buradakiIstasyonId: null,
  harita: null,
  zemin: null,
};

const KISI_KODU = `KSI-9-TRO8W0-${'ab'.repeat(16)}`;

function ciz(yollar: Record<string, (govde: unknown) => Response>, kutu: TeslimKutusuCevabi = KUTU) {
  const istekler = sunucuKur(OPERATOR, {
    'GET /stok/teslim-kutusu/sayac': () => json(200, { gelen: 1 }),
    'GET /stok/teslim-kutusu': () => json(200, kutu),
    'GET /stok/teslim-kutusu/kisi-kodu': () => json(200, { kod: KISI_KODU, gecerlilikSonu: '2026-10-20T10:02:00+03:00' }),
    ...yollar,
  });
  const Dugme = ustEylemler[0]!.dugme;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Dugme /></BildirimSaglayici></QueryClientProvider>);
  return istekler;
}

describe('Malzeme · Teslim üst çubuk düğmesi', () => {
  it('yalniz stok.istek ile gorunur; gelen teslim sayisini rozetle gosterir', async () => {
    expect(ustEylemler.map((e) => [e.anahtar, e.islem])).toEqual([['malzeme-teslim', 'stok.istek']]);
    ciz({});
    expect(await screen.findByRole('button', { name: /1 gelen teslim/ })).toBeTruthy();
  });

  it('gelen teslimi alinan miktarla teslim alir; red nedensiz gonderilemez', async () => {
    const istekler = ciz({ 'POST /stok/teslimler/41/teslim-al': () => json(200, { teslim: { ...GELEN, durum: 'teslim' } }) });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    const satir = (await screen.findByText(/Deneme mil/)).closest('li')!;
    expect(within(satir).getByText(/Torna 1 \(IST-1\) → Freze 2 \(IST-2\)/)).toBeTruthy();
    fireEvent.click(within(satir).getByRole('button', { name: 'Reddet' }));
    expect((within(satir).getByRole('button', { name: 'Reddi gönder' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(satir).queryByLabelText('Alınan miktar')).toBeNull();
    fireEvent.click(within(satir).getByRole('button', { name: 'Eksik geldi' }));
    fireEvent.change(within(satir).getByLabelText('Alınan miktar'), { target: { value: '2,5' } });
    fireEvent.click(within(satir).getByRole('button', { name: 'Bu miktarı al' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ surum: 1, alinan: '2.5' }));
  });

  it('545 T2 ve T4: sekme bekleyen sayisini tasir; tek dokunus gonderilen miktari alir', async () => {
    const istekler = ciz({ 'POST /stok/teslimler/41/teslim-al': () => json(200, { teslim: { ...GELEN, durum: 'teslim' } }) });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    expect(await screen.findByRole('tab', { name: 'Teslim al (1)' })).toBeTruthy();
    const satir = (await screen.findByText(/Deneme mil/)).closest('li')!;
    fireEvent.click(within(satir).getByRole('button', { name: 'Teslim al, 3' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ surum: 1, alinan: '3.000' }));
  });

  it('545 T4: Hepsini al her gelen teslimi kendi miktariyla ayri alir; alinamayan soylenir', async () => {
    const ikinci = { ...GELEN, id: 42, no: 'TS-000042', miktar: '5.000', surum: 3 };
    const istekler = ciz({
      'POST /stok/teslimler/41/teslim-al': () => json(200, { teslim: { ...GELEN, durum: 'teslim' } }),
      'POST /stok/teslimler/42/teslim-al': () => json(409, { kod: 'CAKISMA', mesaj: 'Teslim kapandı.' }),
    }, { ...KUTU, gelenler: [GELEN, ikinci] });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hepsini al' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([
      ['/stok/teslimler/41/teslim-al', { surum: 1, alinan: '3.000' }], ['/stok/teslimler/42/teslim-al', { surum: 3, alinan: '5.000' }],
    ]));
    expect(await screen.findByText(/1 teslim alındı; 1 alınamadı\. TS-000042/)).toBeTruthy();
  });

  it('545 T3 ve T5: gonderdiklerim Teslim et sekmesinde; istasyonuma elden gelen Teslim al da itiraz edilir', async () => {
    const elden: Teslim = { ...GELEN, id: 50, no: 'TS-000050', malzemeAd: 'Deneme burç', durum: 'teslim', okutarak: true, itirazSonu: '2026-10-14T16:00:00+03:00', itiraz: null, aliciAd: 'Deneme Operatör' };
    ciz({}, { ...KUTU, gelenler: [], gonderdiklerim: [{ ...GELEN, id: 60, no: 'TS-000060', malzemeAd: 'Deneme flanş' }], okutarakAlinanlar: [elden], bendenIstenenler: [] });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    const liste = await screen.findByRole('list', { name: 'Elden alınanlar' });
    expect(within(liste).getByRole('button', { name: 'İtiraz et' })).toBeTruthy();
    expect(screen.queryByText(/Deneme flanş/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Teslim et' }));
    expect(within(await screen.findByRole('list', { name: 'Gönderdiklerim' })).getByText(/Deneme flanş/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Okutarak alınanlar' })).toBeNull();
  });

  it('teslim et: yerdeki stoktan secilen satir partisi ve statusuyla gonderilir', async () => {
    const yerdeki: IstasyonSepetiCevabi = { istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [], satirlar: [{ malzemeId: 901, kod: 'YM-1', ad: 'Deneme mil', partiId: 4,
      partiEtiketi: 'TP-4', statuId: 7, miktar: '5', yolda: '0', uretimEmriId: null, getiren: null, gelis: null, sonraki: null, sonrakiYok: 'rota-disi' }] };
    const istekler = ciz({
      'GET /stok/teslim-kutusu/sepet': () => json(200, yerdeki),
      'POST /stok/teslimler/gonder': () => json(200, { teslim: GELEN }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    // Depo konumu yalnız stok.transfer olana kaynaktır; operatöre yalnız kendi istasyonu.
    const nereden = await screen.findByLabelText(/Nereden/);
    expect(within(nereden).queryByText(/Depo/)).toBeNull();
    fireEvent.change(nereden, { target: { value: 'i:2' } });
    fireEvent.change(await screen.findByRole('combobox', { name: /^Malzeme/ }), { target: { value: '0' } });
    expect(within(screen.getByLabelText(/Nereye/)).queryByText(/Freze 2/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Miktar/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Nereye/), { target: { value: 'k:5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({
      malzemeId: 901, miktar: '2', partiId: 4, statuId: 7, kaynak: { istasyonId: 2 }, hedef: { konumId: 5 }, not: null,
    }));
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/sepet?istasyonId=2')).toBe(true);
  });

  it('teslim et: taşıma yolu istasyonun karesinden hedef karesine çizilir; gönderilince etiket değişir (#1304)', async () => {
    const yerdeki: IstasyonSepetiCevabi = { istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [], satirlar: [{ malzemeId: 901, kod: 'YM-1', ad: 'Deneme mil', partiId: 4,
      partiEtiketi: 'TP-4', statuId: 7, miktar: '5', yolda: '0', uretimEmriId: null, getiren: null, gelis: null, sonraki: null, sonrakiYok: 'rota-disi' }] };
    const zemin = {
      bolumler: [{ salonId: 1, kod: 'S1', sutunlar: ['A', 'B', 'C'], satirlar: ['1', '2', '3'] }],
      istasyonlar: [{ istasyonId: 2, salonId: 1, hucre: 'A1' }, { istasyonId: 1, salonId: 1, hucre: 'C3' }],
      konumlar: [{ konumId: 5, salonId: 9, hucre: 'B2' }],
    };
    ciz({ 'GET /stok/teslim-kutusu/sepet': () => json(200, yerdeki), 'POST /stok/teslimler/gonder': () => json(200, { teslim: GELEN }) }, { ...KUTU, buradakiIstasyonId: 2, zemin });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    fireEvent.change(await screen.findByRole('combobox', { name: /^Malzeme/ }), { target: { value: '0' } });
    // Başka bölümdeki konuma yol çizilmez.
    fireEvent.change(screen.getByLabelText(/Nereye/), { target: { value: 'k:5' } });
    expect(screen.queryByRole('img', { name: /taşıma yolu/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Nereye/), { target: { value: 'i:1' } });
    const yol = await screen.findByRole('img', { name: 'S1 A1 karesinden C3 karesine taşıma yolu' });
    expect(yol.querySelector('path')?.getAttribute('d')).toBe('M 15 15 L 15 25 L 35 25 L 35 35');
    expect(screen.getByText(/Freze 2 \(A1\) → Torna 1 \(C3\) · taşıma yolu/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Miktar/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim et' }));
    expect(await screen.findByText(/Torna 1 \(C3\) · gönderildi; teslim alınınca sepette görünür/)).toBeTruthy();
  });

  it('teslim et: nereden bulunulan istasyonla kendiliginden dolar', async () => {
    const yerdeki: IstasyonSepetiCevabi = { istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [], satirlar: [] };
    ciz({ 'GET /stok/teslim-kutusu/sepet': () => json(200, yerdeki) }, { ...KUTU, istasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }, { id: 3, kod: 'T3', ad: 'Torna 3' }], buradakiIstasyonId: 3 });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    expect((await screen.findByLabelText(/Nereden/) as HTMLSelectElement).value).toBe('i:3');
  });

  const SEPET: IstasyonSepetiCevabi = {
    istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [{ id: 70, emirNo: 'UE-70' }],
    satirlar: [
      { malzemeId: 901, kod: 'YM-1', ad: 'Deneme mil', partiId: 4, partiEtiketi: 'TP-4', statuId: 7, miktar: '5.000', yolda: '0', uretimEmriId: 70,
        getiren: 'Deneme Usta', gelis: '2026-10-14T08:00:00+03:00', sonraki: { istasyonId: 1, kod: 'T1', ad: 'Torna 1', opNo: 30 }, sonrakiYok: null },
      { malzemeId: 902, kod: 'HM-2', ad: 'Deneme cubuk', partiId: 8, partiEtiketi: 'LT-8', statuId: null, miktar: '6.000', yolda: '2.000', uretimEmriId: null,
        getiren: 'Deneme Depocu', gelis: '2026-10-14T07:00:00+03:00', sonraki: null, sonrakiYok: 'rota-disi' },
    ],
  };
  const KUTU_ISTASYONLU: TeslimKutusuCevabi = { ...KUTU, buradakiIstasyonId: 2 };

  it('545 T9: teslim et rotadaki sonraki istasyonu one cikarir; hedef degisince tek dokunusla geri alinir', async () => {
    ciz({ 'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET) }, KUTU_ISTASYONLU);
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    fireEvent.change(await screen.findByRole('combobox', { name: /^Malzeme/ }), { target: { value: '0' } });
    expect(screen.getByText(/Rotada sonraki: Torna 1 \(OP 30\)/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hedef yap' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: /^Nereye/ }), { target: { value: 'k:5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hedef yap' }));
    expect((screen.getByRole('combobox', { name: /^Nereye/ }) as HTMLSelectElement).value).toBe('i:1');
  });

  it('sepet: istasyondaki malzeme getirenle gorunur; sonraki istasyona tek dokunusla gider', async () => {
    const istekler = ciz({ 'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET), 'POST /stok/teslimler/gonder': () => json(200, { teslim: GELEN }) }, KUTU_ISTASYONLU);
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Sepet' }));
    const liste = await screen.findByRole('list', { name: 'Freze 2 sepeti' });
    expect(within(liste).getByText(/Deneme Usta/)).toBeTruthy();
    expect(within(liste).getByText(/Deneme Depocu/)).toBeTruthy();
    expect(within(liste).getByText(/2 yolda/)).toBeTruthy();
    expect(within(liste).getAllByRole('button', { name: /Sonraki istasyona/ })).toHaveLength(1);
    fireEvent.click(within(liste).getByRole('button', { name: 'Sonraki istasyona: Torna 1 (OP 30)' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({
      malzemeId: 901, miktar: '5.000', partiId: 4, statuId: 7, kaynak: { istasyonId: 2 }, hedef: { istasyonId: 1 },
    }));
  });

  it('teslim al: onceki istasyonda bekleyen parca miktarla cekilir (kart #1289)', async () => {
    const gelecek: GelecekSepetCevabi = { satirlar: [{ ...SEPET.satirlar[0]!, sonraki: { istasyonId: 2, kod: 'F2', ad: 'Freze 2', opNo: 20 }, kaynak: { id: 1, kod: 'T1', ad: 'Torna 1' } }] };
    const istekler = ciz({
      'GET /stok/teslim-kutusu/sepet/gelecek': () => json(200, gelecek),
      'POST /stok/teslim-kutusu/sepet/cek': () => json(200, { teslim: { ...GELEN, durum: 'teslim' } }),
    }, { ...KUTU_ISTASYONLU, gelenler: [] });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    const liste = await screen.findByRole('list', { name: 'Önceki istasyonda bekleyenler' });
    expect(within(liste).getByText(/Torna 1 \(T1\)/)).toBeTruthy();
    fireEvent.change(within(liste).getByLabelText('Alınan miktar'), { target: { value: '3' } });
    fireEvent.click(within(liste).getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({
      istasyonId: 2, kaynakIstasyonId: 1, malzemeId: 901, partiId: 4, statuId: 7, miktar: '3',
    }));
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/sepet/gelecek?istasyonId=2')).toBe(true);
  });

  it('teslim al: istasyondaki islerin malzemeleri; terminalden gelince eksik malzeme isaretlenir (kart #1289)', async () => {
    const liste: IsMalzemeleriCevabi = { isler: [{
      uretimEmriId: 70, emirNo: 'UE-70', opNo: 10, adimAd: 'Tornalama', calisiyor: false, kalanAdet: 10,
      malzemeler: [
        { malzemeId: 902, kod: 'HM-2', ad: 'Deneme cubuk', birim: 'kg', birAdet: '2.500', gereken: '25.000', istasyonda: '0.000', eksik: true,
          yerler: [{ konum: 'R-01', miktar: '40.000', konumId: 11, istasyonId: null, buEmrin: false }, { konum: 'T1', miktar: '5.000', konumId: 12, istasyonId: 1, buEmrin: false }], istek: { id: 3, no: 'IST-3', durum: 'acik' } },
        { malzemeId: 904, kod: 'HM-4', ad: 'Deneme boru', birim: null, birAdet: '1.000', gereken: '10.000', istasyonda: '0.000', eksik: true, yerler: [],
          istek: { id: 4, no: 'IST-4', durum: 'acik', yoldaTeslim: { id: 8, no: 'TS-000008' } } },
        { malzemeId: 903, kod: 'HM-3', ad: 'Deneme pul', birim: null, birAdet: '1.000', gereken: '10.000', istasyonda: '12.000', eksik: false, yerler: [], istek: null },
      ],
    }] };
    const istekler = ciz({ 'GET /stok/teslim-kutusu/is-malzemeleri': () => json(200, liste) }, { ...KUTU_ISTASYONLU, gelenler: [] });
    window.dispatchEvent(new CustomEvent(MALZEME_TESLIM_AC, { detail: { istasyonId: 2, uretimEmriId: 70, malzemeId: 902 } }));
    const l = await screen.findByRole('list', { name: 'İşlerin malzemeleri' });
    const [eksik, yolda, tamam] = within(l).getAllByRole('listitem');
    expect(eksik!.getAttribute('aria-current')).toBe('true');
    expect(within(eksik!).getByText(/UE-70 · OP 10/)).toBeTruthy();
    expect(within(eksik!).getByText(/Bulunduğu yer: R-01 depo/)).toBeTruthy();
    expect(within(eksik!).getByText(/Kalan 10 adet için 25 kg · istasyonda 0 kg/)).toBeTruthy();
    expect(within(tamam!).getByText(/Kalan 10 adet için 10 · istasyonda 12$/)).toBeTruthy();
    expect(within(eksik!).getByText(/İstek IST-3 · Açık/)).toBeTruthy();
    // Akış A provası 2 Y2: depo "Yolda" gösterdiği isteği operatör de yolda görür.
    expect(within(yolda!).getByText('İstek IST-4 · Yolda · TS-000008')).toBeTruthy();
    expect(within(eksik!).queryByRole('button', { name: /Depodan iste/ })).toBeNull();
    expect(within(tamam!).queryByRole('group', { name: 'Malzemeyi iste' })).toBeNull();
    expect(within(eksik!).getByText('Eksik')).toBeTruthy();
    expect(tamam!.getAttribute('aria-current')).toBeNull();
    expect(within(tamam!).getByText('İstasyonda')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/is-malzemeleri?istasyonId=2')).toBe(true);
  });

  it('teslim al: eksik malzeme depodan istenir ya da rotadaki istasyondan alinir (kart #1418)', async () => {
    const liste: IsMalzemeleriCevabi = { isler: [{
      uretimEmriId: 70, emirNo: 'UE-70', opNo: 20, adimAd: 'Frezeleme', calisiyor: false, kalanAdet: 10,
      malzemeler: [{ malzemeId: 902, kod: 'HM-2', ad: 'Deneme cubuk', birim: null, birAdet: '1.000', gereken: '10.000', istasyonda: '0.000', eksik: true,
        yerler: [{ konum: 'R-01', miktar: '40.000', konumId: 11, istasyonId: null, buEmrin: false }, { konum: 'T1', miktar: '5.000', konumId: 12, istasyonId: 1, buEmrin: true },
          { konum: 'T1', miktar: '2.000', konumId: 12, istasyonId: 1, buEmrin: false }], istek: null }],
    }] };
    const istekler = ciz({ 'GET /stok/teslim-kutusu/is-malzemeleri': () => json(200, liste), 'POST /stok/teslim-kutusu/is-malzemeleri/iste': () => json(200, liste) }, { ...KUTU_ISTASYONLU, gelenler: [] });
    window.dispatchEvent(new CustomEvent(MALZEME_TESLIM_AC, { detail: { istasyonId: 2, uretimEmriId: 70, malzemeId: 902 } }));
    const satir = within(await screen.findByRole('list', { name: 'İşlerin malzemeleri' })).getAllByRole('listitem')[0]!;
    expect(within(satir).getByText(/R-01 depo · emirsiz \(40\).*T1 istasyon · bu emrin \(5\).*T1 istasyon · emirsiz \(2\)/)).toBeTruthy();
    expect(within(satir).getByRole('button', { name: /T1 istasyonundan al · emirsiz/ })).toBeTruthy();
    fireEvent.click(within(satir).getByRole('button', { name: /T1 istasyonundan al · bu emrin/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ istasyonId: 2, uretimEmriId: 70, opNo: 20, malzemeId: 902, kaynakKonumId: 12, buEmrin: true }));
    fireEvent.click(within(satir).getByRole('button', { name: /Depodan iste/ }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')[1]?.govde).toMatchObject({ malzemeId: 902, kaynakKonumId: 11 }));
  });

  it('sepet: uretimde kullan secilen emre miktarla sarf yazar', async () => {
    const istekler = ciz({ 'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET), 'POST /stok/teslim-kutusu/sepet/kullan': () => json(200, { hareketIdler: [5], onayliEksi: false }) }, KUTU_ISTASYONLU);
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Sepet' }));
    const satir = (await screen.findByText(/Deneme cubuk/)).closest('li')!;
    fireEvent.click(within(satir).getByRole('button', { name: 'Üretimde kullan' }));
    fireEvent.change(within(satir).getByLabelText('Kullanılan miktar'), { target: { value: '2,5' } });
    fireEvent.click(within(satir).getByRole('button', { name: 'Kullan' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({
      istasyonId: 2, malzemeId: 902, partiId: 8, statuId: null, miktar: '2.5', uretimEmriId: 70,
    }));
  });

  it('teslim et: satir secilince rotadaki sonraki istasyon hedefe yazilir; haritadan kare konumu secilir', async () => {
    const harita = { bina: { x0: 0, x1: 20, z0: 0, z1: 10 }, kareBoyu: 10 };
    ciz({ 'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET) }, { ...KUTU_ISTASYONLU, depoKonumlari: [{ id: 5, kod: 'KABUL', ad: 'Mal kabul' }, { id: 6, kod: 'D-B1', ad: null }], harita });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    fireEvent.change(await screen.findByRole('combobox', { name: /^Malzeme/ }), { target: { value: '0' } });
    expect((screen.getByLabelText(/Nereye/) as HTMLSelectElement).value).toBe('i:1');
    expect(screen.getByText('Rotada sonraki: Torna 1 (OP 30)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Haritadan seç' }));
    expect((screen.getByRole('button', { name: /Kare A1, konum değil/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kare B1' }));
    expect((screen.getByLabelText(/Nereye/) as HTMLSelectElement).value).toBe('k:6');
  });

  it('teslim et: nereye QR okutularak secilir; listede olmayan yer secilmez', async () => {
    const istekler = ciz({
      'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET),
      'GET /stok/teslim-kutusu/kod-coz': () => json(200, { tur: 'yer', yer: { konumId: 20, kod: 'IST-1', ad: 'Torna 1', tur: 'istasyon', istasyonId: 1 }, satirlar: [] }),
    }, KUTU_ISTASYONLU);
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nereye: QR okut' }));
    const pencere = await screen.findByRole('dialog', { name: 'Nereye: QR okut' });
    fireEvent.change(within(pencere).getByLabelText(/Kod/), { target: { value: 'LOC-IST-1' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bul' }));
    await waitFor(() => expect((screen.getByLabelText(/Nereye/) as HTMLSelectElement).value).toBe('i:1'));
    expect(screen.queryByRole('dialog', { name: 'Nereye: QR okut' })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'GET' && i.yol === '/stok/teslim-kutusu/kod-coz?kod=LOC-IST-1')).toBe(true);
  });

  it('teslim et: okutulan yer gonderilebilecek hedeflerde yoksa soylenir, hedef degismez', async () => {
    ciz({
      'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET),
      'GET /stok/teslim-kutusu/kod-coz': () => json(200, { tur: 'yer', yer: { konumId: 77, kod: 'R-9', ad: null, tur: 'raf_gozu', istasyonId: null }, satirlar: null }),
    }, KUTU_ISTASYONLU);
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nereye: QR okut' }));
    const pencere = await screen.findByRole('dialog', { name: 'Nereye: QR okut' });
    fireEvent.change(within(pencere).getByLabelText(/Kod/), { target: { value: 'LOC-R-9' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bul' }));
    expect(await within(pencere).findByText('R-9 buradan teslim edilebilecek yerlerde yok; listeden bir hedef seçin.')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: /^Nereye/ }) as HTMLSelectElement).value).toBe('');
  });

  it('teslim al: istasyondaki kisinin imzali kodu QR olarak gorunur; kisiye gelen teslim aliciyla yazilir', async () => {
    ciz({}, { ...KUTU, istasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }], buradakiIstasyonId: 2, gelenler: [{ ...GELEN, aliciAd: 'Deneme Operatör' }] });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    expect(await screen.findByRole('img', { name: `QR: ${KISI_KODU}` })).toBeTruthy();
    expect(screen.getByText(/Teslim eden bu kodu okutunca malzeme hemen Freze 2 istasyonuna geçer/)).toBeTruthy();
    expect(screen.getByText('Alıcı: Deneme Operatör')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /Kod \d+ saniye daha geçerli/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Büyük göster' }));
    const buyuk = await screen.findByRole('dialog', { name: 'Elden teslim için kodum' });
    expect(within(buyuk).getByRole('img', { name: `QR: ${KISI_KODU}` })).toBeTruthy();
  });

  it('teslim al (537 a): istasyonda olmayan kisiye QR yerine etiket okutma yolu gosterilir, kod istenmez', async () => {
    const istekler = ciz({}, KUTU);
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    expect(await screen.findByText(/İstasyonda açık oturumunuz yok/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^QR:/ })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/stok/teslim-kutusu/kisi-kodu'))).toBe(false);
  });

  it('teslim et: kisinin kodu okutulunca hedef kisinin istasyonu olur, gonderim kodu tasir; hedef degisince kisi duser', async () => {
    const istekler = ciz({
      'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET),
      'GET /stok/teslim-kutusu/kod-coz': () => json(200, { tur: 'kisi', kod: KISI_KODU, kisi: { id: 9, ad: 'Deneme Alıcı' }, istasyon: { id: 1, kod: 'T1', ad: 'Torna 1' } }),
      'POST /stok/teslimler/gonder': () => json(200, { teslim: GELEN }),
    }, KUTU_ISTASYONLU);
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Teslim et' }));
    fireEvent.change(await screen.findByRole('combobox', { name: /^Malzeme/ }), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Miktar/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nereye: QR okut' }));
    const pencere = await screen.findByRole('dialog', { name: 'Nereye: QR okut' });
    fireEvent.change(within(pencere).getByLabelText(/Kod/), { target: { value: KISI_KODU } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bul' }));
    await waitFor(() => expect((screen.getByRole('combobox', { name: /^Nereye/ }) as HTMLSelectElement).value).toBe('i:1'));
    expect(screen.getByText('Alıcı: Deneme Alıcı. Teslim edince hemen kapanır; alıcı vardiya sonuna kadar itiraz edebilir.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ hedef: { istasyonId: 1 }, aliciKodu: KISI_KODU }));
    fireEvent.change(screen.getByRole('combobox', { name: /^Nereye/ }), { target: { value: 'k:5' } });
    expect(screen.queryByText(/Alıcı: Deneme Alıcı/)).toBeNull();
  });

  it('malzeme iste: secilince liste kapanir, yalniz secilen kalir; Degistir listeyi geri acar', async () => {
    const malzemeler: IstekMalzemeleriCevabi = { malzemeler: [
      { id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'kg', kullanilabilir: '0', statuler: [] },
      { id: 902, kod: 'HM-2', ad: 'Deneme cubuk', birim: 'kg', kullanilabilir: '5', statuler: [] },
    ] };
    ciz({ 'GET /stok/istek-malzemeleri': () => json(200, malzemeler) });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Malzeme iste' }));
    fireEvent.change(screen.getByLabelText('Malzeme ara'), { target: { value: 'deneme' } });
    fireEvent.click(await screen.findByRole('button', { name: /Deneme sac/ }));
    expect(screen.queryByRole('button', { name: /Deneme cubuk/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }));
    expect(await screen.findByRole('button', { name: /Deneme cubuk/ })).toBeTruthy();
  });

  it('malzeme iste: katalogdan secilir, stokta yoksa soylenir, istasyonsuz istek kisiye acilir', async () => {
    const malzemeler: IstekMalzemeleriCevabi = {
      malzemeler: [{ id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'kg', kullanilabilir: '0', statuler: [] }],
    };
    const istekler = ciz({
      'GET /stok/istek-malzemeleri': () => json(200, malzemeler),
      'POST /stok/malzeme-istekleri/ac': () => json(200, {}),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Malzeme iste' }));
    fireEvent.change(screen.getByLabelText('Malzeme ara'), { target: { value: 'sac' } });
    fireEvent.click(await screen.findByRole('button', { name: /Deneme sac/ }));
    expect(screen.getAllByText('Stokta yok').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Miktar/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'İste' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ malzemeId: 901, miktar: '4', istasyonId: null, not: null }));
  });

  it('isteklerim: kapanan istek karsilanan / istenen ile gorunur, acik istek istenen miktarla', async () => {
    const istek = (id: number, durum: MalzemeIstegi['durum'], karsilanan: string | null): MalzemeIstegi => ({
      id, no: `MI-00000${id}`, kaynakKimligi: `k${id}`, malzemeId: 901, malzemeAd: 'Deneme sac', miktar: '30.000', karsilanan, istasyonId: 2, istasyonAd: 'Freze 2',
      uretimEmriId: null, aciklama: null, durum, acilis: '2026-10-14T08:00:00+03:00', guncelleme: '2026-10-14T08:00:00+03:00', kisiAd: 'Deneme Operatör', kapatanKisiAd: null, surum: 1,
      toplamaId: null, toplamaNo: null,
    });
    ciz({ 'GET /stok/istek-malzemeleri': () => json(200, { malzemeler: [] }) }, {
      ...KUTU, isteklerim: [istek(1, 'teslim', '12.000'), istek(2, 'acik', null), { ...istek(3, 'acik', null), yoldaTeslim: { id: 9, no: 'TS-000009' } }],
    });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Malzeme iste' }));
    expect(await screen.findByText('Deneme sac · 12 / 30 teslim')).toBeTruthy();
    expect(screen.getAllByText('Deneme sac · 30')).toHaveLength(2);
    expect(screen.getByText('Yolda · TS-000009')).toBeTruthy();
    expect(screen.getAllByText('Açık')).toHaveLength(1);
  });
});
