import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import type { CikisOnerisiCevabi, LotBekleyenKartlarCevabi, MalzemeIstegi, TeslimKutusuCevabi, YerdekiStokCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ISTEK: MalzemeIstegi = {
  id: 31, no: 'MI-000031', kaynakKimligi: 'k', malzemeId: 901, malzemeAd: 'Deneme sac', miktar: '3.000', karsilanan: null, istasyonId: 4, istasyonAd: 'Torna 1',
  uretimEmriId: null, aciklama: null, durum: 'stok_yok', acilis: '2026-10-14T08:00:00+03:00', guncelleme: '2026-10-14T08:00:00+03:00', kisiAd: 'Deneme Operatör', kapatanKisiAd: null, surum: 2,
  toplamaId: null, toplamaNo: null,
};
const KISIYE: MalzemeIstegi = { ...ISTEK, id: 32, no: 'MI-000032', istasyonId: null, istasyonAd: null, durum: 'acik' };
const LISTEDE: MalzemeIstegi = { ...ISTEK, id: 33, no: 'MI-000033', durum: 'hazirlaniyor', toplamaId: 3, toplamaNo: 'TL-000003' };
const liste = (satirlar: MalzemeIstegi[]) => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });
const BOS_LISTELER = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 20 };
const KUTU: TeslimKutusuCevabi = { gelenler: [], gonderdiklerim: [], isteklerim: [], istasyonlar: [], hedefIstasyonlar: [{ id: 4, kod: 'T1', ad: 'Torna 1' }], depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: null, harita: null, zemin: null };
const KABUL_ARA = () => json(200, { sonuclar: [{ tur: 'konum', konumId: 5, kod: 'KABUL', ad: 'Mal kabul', satirSayisi: 2 }] });

async function konumSec(kap: HTMLElement, etiket: string, yaz: string, secenek: string) {
  fireEvent.change(within(kap).getByRole('combobox', { name: new RegExp(etiket) }), { target: { value: yaz } });
  fireEvent.click(await within(await within(kap).findByRole('listbox', { name: `${etiket} için bulunanlar` })).findByRole('option', { name: new RegExp(secenek) }));
}

describe('Hazırlık: malzeme istekleri', () => {
  it('istasyona giden istek konum aranarak teslim edilir', async () => {
    const yerdeki: YerdekiStokCevabi = { satirlar: [
      { malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 8, partiEtiketi: 'TP-8', statuId: null, miktar: '5' },
      { malzemeId: 902, kod: 'HM-2', ad: 'Başka', partiId: null, partiEtiketi: null, statuId: null, miktar: '1' },
    ] };
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([ISTEK, KISIYE])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
      'GET /stok/ara': KABUL_ARA,
      'GET /stok/teslim-kutusu/yerdeki-stok': () => json(200, yerdeki),
      'POST /stok/teslimler/gonder': () => json(200, {}),
    });
    ac('/stok/hazirlik');
    const satir = (await screen.findByText('MI-000031')).closest('tr')!;
    expect(within(satir).getByText('Stokta yok')).toBeTruthy();
    fireEvent.click(within(satir).getByRole('button', { name: 'Teslim et' }));
    const pencere = await screen.findByRole('dialog');
    await konumSec(pencere, 'Hangi konumdan', 'KAB', 'KABUL');
    const parti = await within(pencere).findByRole('combobox', { name: /Parti ve statü/ });
    expect(within(parti).queryAllByRole('option')).toHaveLength(2);
    fireEvent.change(parti, { target: { value: '8:-' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({
      malzemeId: 901, miktar: '3', partiId: 8, statuId: null, kaynak: { konumId: 5 }, hedef: { istasyonId: 4 }, istekId: 31,
    }));
  });

  it('Akış A provası D1: yolda teslimi olan istek "Yolda" görünür, yeniden teslim edilemez', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([{ ...KISIYE, istasyonId: 4, istasyonAd: 'Torna 1', yoldaTeslim: { id: 7, no: 'TS-000007' } }, ISTEK])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
    });
    ac('/stok/hazirlik');
    const yolda = (await screen.findByText('MI-000032')).closest('tr')!;
    expect(within(yolda).getByText('Yolda · TS-000007')).toBeTruthy();
    expect(within(yolda).queryByRole('button', { name: 'Teslim et' })).toBeNull();
    expect(within(screen.getByText('MI-000031').closest('tr')!).getByRole('button', { name: 'Teslim et' })).toBeTruthy();
  });

  it('çıkış önerisi konumu kendiliğinden seçer; tek parti satırı seçili gelir ve eksiksiz teslim gider', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([ISTEK])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
      'GET /stok/malzemeler/901/cikis-onerisi': () => json(200, { veriYetersiz: false, yeterli: true, mevcut: '83', oneriler: [
        { bakiyeId: 2, konumId: 5, konumKod: 'KABUL', partiId: 8, partiEtiketi: 'TP-8', miktar: '3' },
      ] } satisfies CikisOnerisiCevabi),
      'GET /stok/teslim-kutusu/yerdeki-stok': () => json(200, { satirlar: [{ malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 8, partiEtiketi: 'TP-8', statuId: null, miktar: '28' }] }),
      'POST /stok/teslimler/gonder': () => json(200, {}),
    });
    ac('/stok/hazirlik');
    fireEvent.click(within((await screen.findByText('MI-000031')).closest('tr')!).getByRole('button', { name: 'Teslim et' }));
    const pencere = await screen.findByRole('dialog');
    await waitFor(() => expect((within(pencere).getByRole('combobox', { name: /Hangi konumdan/ }) as HTMLInputElement).value).toBe('KABUL'));
    await waitFor(() => expect((within(pencere).getByRole('combobox', { name: /Parti ve statü/ }) as HTMLSelectElement).value).toBe('8:-'));
    expect(istekler.some((i) => i.yol === '/stok/malzemeler/901/cikis-onerisi?miktar=3.000')).toBe(true);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ partiId: 8, kaynak: { konumId: 5 }, istekId: 31 }));
  });

  it('birden çok konumda en eski girişli konum önerilir; birden çok parti satırında seçim boş kalır ve eksik seçim alan hatası verir', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([ISTEK])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
      'GET /stok/malzemeler/901/cikis-onerisi': () => json(200, { veriYetersiz: false, yeterli: true, mevcut: '83', oneriler: [
        { bakiyeId: 9, konumId: 7, konumKod: 'KS-01-1-1', partiId: 8, partiEtiketi: 'TP-8', miktar: '2' },
        { bakiyeId: 2, konumId: 5, konumKod: 'KABUL', partiId: 9, partiEtiketi: 'TP-9', miktar: '1' },
      ] } satisfies CikisOnerisiCevabi),
      'GET /stok/teslim-kutusu/yerdeki-stok': () => json(200, { satirlar: [
        { malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 8, partiEtiketi: 'TP-8', statuId: null, miktar: '5' },
        { malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 9, partiEtiketi: 'TP-9', statuId: null, miktar: '5' },
      ] }),
      'POST /stok/teslimler/gonder': () => json(200, {}),
    });
    ac('/stok/hazirlik');
    fireEvent.click(within((await screen.findByText('MI-000031')).closest('tr')!).getByRole('button', { name: 'Teslim et' }));
    const pencere = await screen.findByRole('dialog');
    await waitFor(() => expect((within(pencere).getByRole('combobox', { name: /Hangi konumdan/ }) as HTMLInputElement).value).toBe('KS-01-1-1'));
    const parti = await within(pencere).findByRole('combobox', { name: /Parti ve statü/ });
    expect((parti as HTMLSelectElement).value).toBe('');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Teslim et' }));
    expect((await within(pencere).findAllByRole('alert')).map((a) => a.textContent)).toContain('Parti ve statüyü seçin.');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('parti seçimi kimlikle tutulur: liste yeniden gelip sırası değişse de seçilen parti gönderilir', async () => {
    const tp8 = { malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 8, partiEtiketi: 'TP-8', statuId: null, miktar: '5' };
    const tp9 = { ...tp8, partiId: 9, partiEtiketi: 'TP-9' };
    let cagri = 0;
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([ISTEK])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
      'GET /stok/ara': KABUL_ARA,
      'GET /stok/teslim-kutusu/yerdeki-stok': () => json(200, { satirlar: cagri++ === 0 ? [tp8, tp9] : [tp9, tp8] }),
      'POST /stok/teslimler/gonder': () => json(200, {}),
    });
    ac('/stok/hazirlik');
    fireEvent.click(within((await screen.findByText('MI-000031')).closest('tr')!).getByRole('button', { name: 'Teslim et' }));
    const pencere = await screen.findByRole('dialog');
    await konumSec(pencere, 'Hangi konumdan', 'KAB', 'KABUL');
    const parti = await within(pencere).findByRole('combobox', { name: /Parti ve statü/ }) as HTMLSelectElement;
    fireEvent.change(parti, { target: { value: within(parti).getByRole('option', { name: /TP-9/ }).getAttribute('value') } });
    const once = cagri;
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await waitFor(() => expect(cagri).toBeGreaterThan(once));
    await waitFor(() => expect(parti.selectedOptions[0]?.textContent).toMatch(/TP-9/));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ partiId: 9, kaynak: { konumId: 5 }, istekId: 31 }));
    focusManager.setFocused(undefined);
  });

  it('istasyonsuz istek seçilen konumdan kişinin istasyonuna taşınarak kapanır; istasyon seçilmezse sunucu bulur', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([KISIYE])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
      'GET /stok/ara': KABUL_ARA,
      'GET /stok/teslim-kutusu': () => json(200, KUTU),
      'GET /stok/teslim-kutusu/yerdeki-stok': () => json(200, { satirlar: [{ malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 8, partiEtiketi: 'TP-8', statuId: null, miktar: '5' }] }),
      'POST /stok/malzeme-istekleri/32/teslim-et': () => json(200, {}),
    });
    ac('/stok/hazirlik');
    const satir = (await screen.findByText('MI-000032')).closest('tr')!;
    expect(within(satir).getByText(/kişiye/)).toBeTruthy();
    fireEvent.click(within(satir).getByRole('button', { name: 'Teslim et' }));
    const pencere = await screen.findByRole('dialog');
    const dugme = within(pencere).getByRole('button', { name: 'Teslim edildi' });
    fireEvent.click(dugme);
    expect((await within(pencere).findAllByRole('alert')).map((a) => a.textContent)).toContain('Teslimin çıkacağı konumu seçin.');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    await konumSec(pencere, 'Hangi konumdan', 'KAB', 'KABUL');
    fireEvent.change(await within(pencere).findByRole('combobox', { name: /Parti ve statü/ }), { target: { value: '8:-' } });
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({
      surum: 2, karsilanan: '3', kaynakKonumId: 5, partiId: 8, statuId: null, istasyonId: null,
    }));
  });

  it('seçilen istekler tek listede açılır; tek istasyonun istekleri o istasyona hedeflenir', async () => {
    const AYRINTI = {
      toplama: { id: 3, no: 'TL-000003', ad: 'Torna 1 hazırlığı', durum: 'topluyor', acilis: '2026-10-14T09:00:00+03:00', kapanis: null, kisiAd: 'D', kapatanKisiAd: null, adimSayisi: 0, toplanan: 0, eksikVar: false, surum: 1 },
      kalemler: [], adimlar: [], hedef: { konumId: 20, kod: 'IST-4', ad: 'Torna 1', istasyonId: 4 }, istekler: [],
    };
    const ikinci = { ...ISTEK, id: 34, no: 'MI-000034', malzemeId: 902, durum: 'acik' as const };
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([ISTEK, ikinci, LISTEDE])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
      'GET /stok/teslim-kutusu': () => json(200, KUTU),
      'POST /stok/toplamalar': () => json(200, AYRINTI),
      'GET /stok/toplamalar/3': () => json(200, AYRINTI),
    });
    ac('/stok/hazirlik');
    await screen.findByText('MI-000031');
    expect(screen.queryByRole('checkbox', { name: 'MI-000033 seç' })).toBeNull();
    expect(within(screen.getByText('MI-000033').closest('tr')!).getByRole('link', { name: 'TL-000003' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'MI-000031 seç' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'MI-000034 seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Liste aç' }));
    const pencere = await screen.findByRole('dialog', { name: '2 istek için liste' });
    await waitFor(() => expect((within(pencere).getByRole('combobox', { name: /İstasyon/ }) as HTMLSelectElement).value).toBe('4'));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Listeyi aç' }));
    expect(await screen.findByRole('heading', { name: 'Hazırlık TL-000003' })).toBeTruthy();
    expect(istekler.find((i) => i.yol === '/stok/toplamalar' && i.yontem === 'POST')!.govde).toEqual({ ad: 'Torna 1 hazırlığı', istekIdler: [31, 34], hedef: { istasyonId: 4 } });
  });

  it('depo işlemi olmayan listeyi görür, düğme ve seçim görmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzeme-istekleri': () => json(200, liste([ISTEK])), 'GET /stok/toplamalar': () => json(200, BOS_LISTELER) });
    ac('/stok/hazirlik');
    expect(await screen.findByText('MI-000031')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Teslim et' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeni liste' })).toBeNull();
  });

  it('eski malzeme istekleri adresi hazırlığa yönlenir', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzeme-istekleri': () => json(200, liste([])), 'GET /stok/toplamalar': () => json(200, BOS_LISTELER) });
    ac('/stok/istekler');
    expect(await screen.findByRole('heading', { name: 'Hazırlık' })).toBeTruthy();
  });
});

describe('Hazırlık: lot bekleyen kartlar (kart #154)', () => {
  it('lotsuz düşülen kartlar listelenir, Aç kartı açar; liste boşken bölüm görünmez', async () => {
    const kart = {
      id: 12, qr: 'RP:12', etiket: 'UE-000001-P2', uretimEmriId: 1, emirNo: 'UE-000001', sira: 2, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
      partiId: null, lotNo: null, tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '0', durum: 'acik' as const, surum: 1, kayitZamani: '2026-10-23T08:00:00+03:00',
      lotaBaglanmaZamani: null, ust: null, birlestigi: null, birlesmeZamani: null,
    };
    const cevap: LotBekleyenKartlarCevabi = { kartlar: [{ refakat: kart, bekleyen: '4' }] };
    sunucuKur(DEPOCU, {
      'GET /stok/lot-bekleyen-kartlar': () => json(200, cevap),
      'GET /stok/malzeme-istekleri': () => json(200, liste([])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: kart, kart: { emirId: 1, qr: 'UE:1', emirNo: 'UE-000001', urun: { kod: 'P-1', ad: 'Deneme parça' }, adet: 10, teslim: null, parti: { ustEmirNo: null, bolunmeSira: null }, adimlar: [] } }),
    });
    ac('/stok/hazirlik');
    const tablo = await screen.findByRole('table', { name: 'Lot bekleyen kartlar' });
    const satir = within(tablo).getByText('UE-000001-P2').closest('tr')!;
    expect(within(satir).getByText(/4/)).toBeTruthy();
    fireEvent.click(within(satir).getByRole('button', { name: 'Aç' }));
    expect(await screen.findByRole('region', { name: 'Lota bağla' })).toBeTruthy();
    cleanup();
    sunucuKur(DEPOCU, {
      'GET /stok/lot-bekleyen-kartlar': () => json(200, { kartlar: [] }),
      'GET /stok/malzeme-istekleri': () => json(200, liste([])),
      'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
    });
    ac('/stok/hazirlik');
    await screen.findByText(/Üretimden gelen istekler/);
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Lot bekleyen kartlar' })).toBeNull());
  });
});
