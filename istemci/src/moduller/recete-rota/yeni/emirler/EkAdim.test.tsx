import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, ornekDurum, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 2530 a: emre özel ek operasyon, bölünmemiş emirde de. Kural (yer, başlamışlık, alt parti) Üretim Emirleri'nin ucundadır; burada ekranın
// gönderdiği gövde, ret iletisi ve ek adımın listedeki yeri sınanır. Veriler uydurmadır (test-ortak ornekDurum, UE-0001).
const adim = (id: string, seq: number, opNo: number) => ({
  id, seq, opNo, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10,
  proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
  digerAdaylar: [], ins: [], outs: [],
});
type Ek = NonNullable<NonNullable<ReturnType<typeof ornekDurum>['emirler']>['orders'][number]['ekAdimlar']>[number];
const durum = (ekAdimlar?: Ek[]) => {
  const d = ornekDurum();
  d.routes = { '11': { base: null, steps: [adim('s1', 1, 10), adim('s2', 2, 20)] } } as unknown as typeof d.routes;
  d.emirler = { ...d.emirler!, orders: d.emirler!.orders.map((o) => ({ ...o, status: 'serbest' as const, ...(ekAdimlar ? { ekAdimlar } : {}) })) };
  return d;
};
// Köprü op numarasını sahibinin güncel adımlarından önerir (GET /adimli-emirler/:id).
const isEmri = (sira: number, opNo: number) => ({
  id: 700 + sira, opNo, sira, tip: { id: 21, ad: 'Tornalama', kod: 'TOR' }, ad: 'Tornalama', kaynak: null, istasyon: null, ayarSuresiDk: '10', birimSureDk: '2',
  terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, durum: 'bekliyor', baslama: null, bitis: null, saglamAdet: null, bilesenler: [], adaylar: [], fason: null,
});
const sahip = { emir: { id: 61, isEmirleri: [isEmri(1, 10), isEmri(2, 20)] } };

const ayrintiAc = async () => {
  const b = await screen.findByRole('region', { name: 'Üretim emirleri' });
  fireEvent.click(await within(b).findByRole('button', { name: /UE-0001/ }));
  return within(b).getByLabelText('UE-0001 ayrıntısı');
};
const panelAc = (a: HTMLElement) => {
  fireEvent.click(within(a).getByRole('button', { name: 'UE-0001 için diğer işlemler' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ek operasyon (rework, tamir, ek)' }));
  return within(a).getByRole('group', { name: 'Ek operasyon' });
};

describe('R3 Üretim emirleri: emre özel ek operasyon (2530 a)', () => {
  it('bölünmemiş emre ek adım: seçilen adımın arkasına, op numarası komşuların ortasından, emrin ekrandaki sürümüyle gider (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, {
      durum: durum(),
      yazmalar: { 'GET /adimli-emirler/61': () => json(200, sahip), 'POST /adimli-emirler/61/ek-adim': () => json(200, sahip) },
    });
    rrAc();
    const a = await ayrintiAc();
    const p = panelAc(a);
    fireEvent.change(within(p).getByLabelText('Tür'), { target: { value: 'tamir' } });
    fireEvent.change(within(p).getByLabelText('Yeri'), { target: { value: '10' } });
    fireEvent.change(within(p).getByLabelText('Operasyon'), { target: { value: '21' } });
    fireEvent.change(within(p).getByLabelText('Açıklama'), { target: { value: 'Çapak al' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Ek operasyonu ekle' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/adimli-emirler/61/ek-adim')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/adimli-emirler/61/ek-adim')?.govde).toEqual({
      oncekiOpNo: 10, opNo: 15, tur: 'tamir', ad: 'Tornalama', operasyonTipiId: 21, kaynak: null, ayarSuresiDk: null, birimSureDk: null, terminGun: null,
      aciklama: 'Çapak al', surum: 1,
    });
  });

  it('emrin başına konan adım ilk adımdan önceki numarayı, sona konan son adımdan 10 sonrasını alır', async () => {
    for (const [yer, beklenen] of [['', { oncekiOpNo: null, opNo: 5 }], ['20', { oncekiOpNo: 20, opNo: 30 }]] as const) {
      const istekler = sunucuKur(YONETICI, {
        durum: durum(),
        yazmalar: { 'GET /adimli-emirler/61': () => json(200, sahip), 'POST /adimli-emirler/61/ek-adim': () => json(200, sahip) },
      });
      rrAc();
      const p = panelAc(await ayrintiAc());
      fireEvent.change(within(p).getByLabelText('Yeri'), { target: { value: yer } });
      fireEvent.change(within(p).getByLabelText('Operasyon'), { target: { value: '21' } });
      fireEvent.click(within(p).getByRole('button', { name: 'Ek operasyonu ekle' }));
      await waitFor(() => { expect(istekler.find((i) => i.yol === '/adimli-emirler/61/ek-adim')?.govde).toMatchObject(beklenen); });
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('açık alt partisi olan emirde sahibinin reddi iletisiyle görünür, panel açık kalır (reddedilen)', async () => {
    const ileti = 'Alt partisi olan kolun adımları ve birleşme planı değişmez; önce alt partileri birleştirin.';
    sunucuKur(YONETICI, {
      durum: durum(),
      yazmalar: { 'GET /adimli-emirler/61': () => json(200, sahip), 'POST /adimli-emirler/61/ek-adim': () => json(409, { kod: 'CAKISMA', mesaj: ileti }) },
    });
    rrAc();
    const p = panelAc(await ayrintiAc());
    fireEvent.change(within(p).getByLabelText('Operasyon'), { target: { value: '21' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Ek operasyonu ekle' }));
    expect((await screen.findAllByText(ileti)).length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Ek operasyon' })).toBeTruthy();
  });

  it('ek adım op sırasıyla rota adımlarının arasında türüyle görünür; başlamamış olan onayla kaldırılır, okuyan kaldıramaz', async () => {
    const ekler: Ek[] = [{ opNo: 15, tur: 'rework', ad: 'Tekrar tornalama', opId: '21', durum: 'bekliyor', saglam: null }];
    const istekler = sunucuKur(YONETICI, { durum: durum(ekler), yazmalar: { 'POST /adimli-emirler/61/ek-adim-kaldir': () => json(200, sahip) } });
    rrAc();
    await ayrintiAc();
    const liste = await screen.findByRole('list', { name: 'UE-0001 operasyonları' });
    const satirlar = within(liste).getAllByRole('listitem');
    expect(satirlar.map((li) => li.querySelector('.tc-rr3-op')?.textContent)).toEqual(['10', '15', '20']);
    expect(satirlar[1]?.textContent).toContain('Rework · rotada yok');
    const cop = within(liste).getByRole('button', { name: 'OP 15 ek adımını kaldır' });
    expect(cop.getAttribute('title')).toBe('Başlamamış ek adımı emirden kaldır');
    // Satırın ızgarası dört hücredir (op, ad, sağlam, durum); düğme durum hücresindedir, dar panelde yeni satıra düşmez.
    expect(satirlar[1]?.children.length).toBe(4);
    expect(cop.closest('li > *')).toBe(within(satirlar[1]!).getByText('Bekliyor').closest('li > *'));
    fireEvent.click(cop);
    fireEvent.click(await screen.findByRole('button', { name: 'Kaldır' }));
    await waitFor(() => { expect(istekler.find((i) => i.yol === '/adimli-emirler/61/ek-adim-kaldir')?.govde).toEqual({ opNo: 15, surum: 1 }); });

    cleanup();
    vi.unstubAllGlobals();
    sunucuKur(OKUYAN, { durum: durum(ekler) });
    rrAc();
    const okuyan = await ayrintiAc();
    await screen.findByRole('list', { name: 'UE-0001 operasyonları' });
    expect(within(okuyan).queryByRole('button', { name: 'OP 15 ek adımını kaldır' })).toBeNull();
    expect(within(okuyan).queryByRole('button', { name: 'UE-0001 için diğer işlemler' })).toBeNull();
  });
});
