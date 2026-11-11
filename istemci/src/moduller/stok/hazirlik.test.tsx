import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import type { CikisOnerisiCevabi, LotBekleyenKartlarCevabi, MalzemeIstegi, TeslimKutusuCevabi, YerdekiStokCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
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
    expect(await screen.findByRole('heading', { name: 'Toplama listesi TL-000003' })).toBeTruthy();
    expect(istekler.find((i) => i.yol === '/stok/toplamalar' && i.yontem === 'POST')!.govde).toEqual({ ad: 'Torna 1 hazırlığı', istekIdler: [31, 34], hedef: { istasyonId: 4 } });
  });

  it('depo işlemi olmayan listeyi görür, düğme ve seçim görmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzeme-istekleri': () => json(200, liste([ISTEK])), 'GET /stok/toplamalar': () => json(200, BOS_LISTELER) });
    ac('/stok/hazirlik');
    expect(await screen.findByText('MI-000031')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Teslim et' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'İsteksiz liste' })).toBeNull();
  });

  it('istekler ve toplama listeleri tek satırlı kayan tablo: seçim kutusu ilk sütunda, kimlik solda, eylemler sağda yapışık', async () => {
    const TOPLAMA = { id: 3, no: 'TL-000003', ad: 'Sabah turu', acilis: '2026-10-14T08:10:00+03:00', kisiAd: 'Deneme Depocu', durum: 'topluyor', toplanan: 1, adimSayisi: 2, eksikVar: false, surum: 1, hedefKonumId: null, hedefKonumKod: null };
    sunucuKur(DEPOCU, {
      'GET /stok/malzeme-istekleri': () => json(200, liste([{ ...ISTEK, aciklama: 'Yarın ilk iş', karsilanan: '1.000' }, LISTEDE])),
      'GET /stok/toplamalar': () => json(200, { ...BOS_LISTELER, satirlar: [TOPLAMA], toplam: 1 }),
    });
    ac('/stok/hazirlik');
    const tablo = await screen.findByRole('table', { name: 'Malzeme istekleri' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual(
      ['', 'İstek', 'Malzeme', 'Miktar', 'Karşılanan', 'Durum', 'Nereye', 'İsteyen', 'Açılış', 'Açıklama', 'Toplama listesi', '']);
    const [, ilk, ikinci] = within(tablo).getAllByRole('row');
    const h = within(ilk!).getAllByRole('cell');
    expect(within(h[0]!).getByRole('checkbox', { name: 'MI-000031 seç' })).toBeTruthy();
    expect(h[1]!.classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(h[1]!.textContent).toBe('MI-000031');
    expect(h[2]!.querySelector('.tc-tablo-kes')?.getAttribute('title')).toBe('Deneme sac');
    expect(h[3]!.textContent).toBe('3');
    expect(h[4]!.textContent).toBe('1');
    expect(h[5]!.textContent).toBe('Stokta yok');
    expect(h[9]!.textContent).toBe('Yarın ilk iş');
    expect(h[11]!.classList.contains('tc-tablo-sabit-sag')).toBe(true);
    expect(within(h[11]!).queryByRole('checkbox')).toBeNull();
    expect(within(h[11]!).getByRole('button', { name: 'Teslim et' })).toBeTruthy();
    const h2 = within(ikinci!).getAllByRole('cell');
    expect(within(h2[0]!).queryByRole('checkbox')).toBeNull();
    expect(h2[4]!.textContent).toBe('—');
    expect(within(h2[10]!).getByRole('link', { name: 'TL-000003' })).toBeTruthy();
    const listeler = await screen.findByRole('table', { name: 'Toplama listeleri' });
    expect(listeler.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(listeler).getByRole('columnheader', { name: 'Liste' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
  });

  it('eski malzeme istekleri adresi hazırlığa yönlenir', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzeme-istekleri': () => json(200, liste([])), 'GET /stok/toplamalar': () => json(200, BOS_LISTELER) });
    ac('/stok/istekler');
    expect(await screen.findByRole('heading', { name: 'Malzeme istekleri' })).toBeTruthy();
  });
});

// 2931 a, 2944 (kullanıcı yazılı yanıtı): kart sunucuda açılır; kâğıt kendiliğinden basılmaz, bildirim Etiket Merkezi'ne götürür.
describe('Hazırlık: emre giden teslimde refakat kartı bildirimi', () => {
  const EMRIN: MalzemeIstegi = { ...ISTEK, uretimEmriId: 77 };
  const KART: RefakatPartisi = {
    id: 51, qr: 'RP:51', etiket: 'UE-000077-P1', uretimEmriId: 77, emirNo: 'UE-000077', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'adet',
    partiId: 8, lotNo: 'LT-8', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, lotaBaglanmaZamani: null, verilen: '3', durum: 'acik', surum: 1,
    kayitZamani: '2026-11-11T08:00:00Z', ust: null, birlestigi: null, birlesmeZamani: null,
  };
  const MERKEZLI: Kullanici = { ...DEPOCU, islemler: [...DEPOCU.islemler, 'sayfa.etiket-merkezi'] };
  const kur = (kullanici: Kullanici, istek: MalzemeIstegi, kartlar = () => json(200, { partiler: [{ ...KART, id: 50, partiId: 9 }, KART] })) => sunucuKur(kullanici, {
    'GET /stok/malzeme-istekleri': () => json(200, liste([istek])),
    'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
    'GET /stok/ara': KABUL_ARA,
    'GET /stok/teslim-kutusu': () => json(200, KUTU),
    'GET /stok/teslim-kutusu/yerdeki-stok': () => json(200, { satirlar: [{ malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 8, partiEtiketi: 'TP-8', statuId: null, miktar: '5' }] }),
    'POST /stok/teslimler/gonder': () => json(200, {}),
    'POST /stok/malzeme-istekleri/32/teslim-et': () => json(200, {}),
    'GET /stok/uretim-emirleri/77/refakat-partileri': kartlar,
  });
  const teslimEt = async () => {
    fireEvent.click(within((await screen.findByText('MI-000031')).closest('tr')!).getByRole('button', { name: 'Teslim et' }));
    const pencere = await screen.findByRole('dialog');
    await konumSec(pencere, 'Hangi konumdan', 'KAB', 'KABUL');
    await waitFor(() => expect((within(pencere).getByRole('combobox', { name: /Parti ve statü/ }) as HTMLSelectElement).value).toBe('8:-'));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Teslim et' }));
  };
  const ILETI = "Refakat kartı UE-000077-P1 bu teslimle gidiyor; kâğıdı Etiket Merkezi'nden basın.";

  it('teslimden sonra kart söylenir, kâğıt kendiliğinden basılmaz; düğme Etiket Merkezi\'ni açar', async () => {
    const istekler = kur(MERKEZLI, EMRIN);
    ac('/stok/hazirlik');
    await teslimEt();
    expect(await screen.findByText(ILETI)).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/etiket-merkezi/'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Etiketlere git' }));
    await waitFor(() => expect(screen.queryByText('MI-000031')).toBeNull());
  });

  it('Etiket Merkezi\'ni açamayan depocuya düğme gösterilmez, kâğıdı yetkilinin bastığı söylenir (yasak)', async () => {
    kur(DEPOCU, EMRIN);
    ac('/stok/hazirlik');
    await teslimEt();
    expect(await screen.findByText('Refakat kartı UE-000077-P1 bu teslimle gidiyor; kâğıdı Depo ya da Vardiya Sorumlusu basar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Etiketlere git' })).toBeNull();
  });

  it('iptal ve birleşmiş kart seçilmez; emrin bu lottaki açık kartı söylenir', async () => {
    kur(MERKEZLI, EMRIN, () => json(200, { partiler: [
      { ...KART, id: 52, etiket: 'UE-000077-P2', durum: 'iptal' }, { ...KART, id: 53, etiket: 'UE-000077-P3', birlestigi: { id: 51, etiket: 'UE-000077-P1' } }, KART,
    ] }));
    ac('/stok/hazirlik');
    await teslimEt();
    expect(await screen.findByText(ILETI)).toBeTruthy();
  });

  it('kişiye teslimde de kart söylenir', async () => {
    const istekler = kur(MERKEZLI, { ...KISIYE, uretimEmriId: 77 });
    ac('/stok/hazirlik');
    fireEvent.click(within((await screen.findByText('MI-000032')).closest('tr')!).getByRole('button', { name: 'Teslim et' }));
    const pencere = await screen.findByRole('dialog');
    await konumSec(pencere, 'Hangi konumdan', 'KAB', 'KABUL');
    fireEvent.change(await within(pencere).findByRole('combobox', { name: /Parti ve statü/ }), { target: { value: '8:-' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Teslim edildi' }));
    expect(await screen.findByText(ILETI)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/stok/malzeme-istekleri/32/teslim-et')).toBe(true);
  });

  it('kart okunamazsa depocuya söylenir (reddedilen)', async () => {
    kur(MERKEZLI, EMRIN, () => json(500, { kod: 'SUNUCU', mesaj: 'Hata.' }));
    ac('/stok/hazirlik');
    await teslimEt();
    expect(await screen.findByText("Refakat kartı okunamadı; kâğıdı Etiket Merkezi'nin bekleyenlerinden basın.")).toBeTruthy();
  });

  it('emirsiz istekte kart aranmaz', async () => {
    const istekler = kur(MERKEZLI, ISTEK);
    ac('/stok/hazirlik');
    await teslimEt();
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/teslimler/gonder')).toBe(true));
    await new Promise((r) => setTimeout(r, 200));
    expect(istekler.some((i) => i.yol.includes('refakat-partileri'))).toBe(false);
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
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    const satir = within(tablo).getByText('UE-000001-P2').closest('tr')!;
    const hucreler = within(satir).getAllByRole('cell');
    expect(hucreler[0]!.classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(hucreler[1]!.querySelector('.tc-tablo-kes')?.getAttribute('title')).toBe('Deneme sac');
    expect(hucreler[4]!.classList.contains('tc-tablo-sabit-sag')).toBe(true);
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
    await screen.findByText(/Üretimin istediği malzemeyi/);
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Lot bekleyen kartlar' })).toBeNull());
  });
});

// 3033 a: iptal satırda değil "diğer işlemler" menüsünde ve onay sorar; sekmeler bekleyen sayıyı söyler; akış anlatımı kapalı gelir.
describe('Malzeme istekleri sade düzen (3033)', () => {
  const ACIK: MalzemeIstegi = { ...ISTEK, id: 40, no: 'MI-000040', durum: 'acik', surum: 3 };
  const kur = () => sunucuKur(DEPOCU, {
    'GET /stok/malzeme-istekleri': () => json(200, liste([ACIK])),
    'GET /stok/malzeme-istekleri?durum=acik&sayfaBoyu=1': () => json(200, { ...liste([ACIK]), toplam: 3 }),
    'GET /stok/malzeme-istekleri?durum=stok_yok&sayfaBoyu=1': () => json(200, { ...liste([]), toplam: 2 }),
    'GET /stok/malzeme-istekleri?durum=hazirlaniyor&sayfaBoyu=1': () => json(200, { ...liste([]), toplam: 0 }),
    'GET /stok/toplamalar': () => json(200, BOS_LISTELER),
    'POST /stok/malzeme-istekleri/40/iptal-et': () => json(200, {}),
  });

  it('satırda kırmızı İptal yok; menüden seçilince onay sorar, Vazgeç bir şey göndermez, onay sürümle gönderir', async () => {
    const istekler = kur();
    ac('/stok/hazirlik');
    const tablo = await screen.findByRole('table', { name: 'Malzeme istekleri' });
    expect(within(tablo).queryByRole('button', { name: 'İptal' })).toBeNull();
    fireEvent.click(within(tablo).getByRole('button', { name: 'MI-000040: diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'İsteği iptal et' }));
    const pencere = await screen.findByRole('dialog', { name: 'MI-000040 iptal edilsin mi?' });
    expect(pencere.textContent).toContain('Deneme sac');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'MI-000040 iptal edilsin mi?' })).toBeNull());
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(within(tablo).getByRole('button', { name: 'MI-000040: diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'İsteği iptal et' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'MI-000040 iptal edilsin mi?' })).getByRole('button', { name: 'İsteği iptal et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({ yol: '/stok/malzeme-istekleri/40/iptal-et', govde: { surum: 3 } }));
  });

  it('bekleyen sekmeler sayıyı söyler; sıfır sayı rozet çizmez', async () => {
    kur();
    ac('/stok/hazirlik');
    const sekmeler = await screen.findByRole('tablist', { name: 'Durum' });
    await waitFor(() => expect(within(sekmeler).getByRole('tab', { name: /^Açık/ }).textContent).toContain('3'));
    expect(within(sekmeler).getByRole('tab', { name: /^Stokta yok/ }).textContent).toContain('2');
    expect(within(sekmeler).getByRole('tab', { name: /^Hazırlanıyor/ }).querySelector('.tc-sekme-sayi')).toBeNull();
  });

  it('"Nasıl çalışır" kapalı gelir, düğmeyle açılır', async () => {
    kur();
    ac('/stok/hazirlik');
    const dugme = await screen.findByRole('button', { name: 'Nasıl çalışır' });
    expect(screen.queryByRole('list', { name: 'Nasıl çalışır' })).toBeNull();
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(dugme);
    expect(within(screen.getByRole('list', { name: 'Nasıl çalışır' })).getAllByRole('listitem')).toHaveLength(4);
  });
});
