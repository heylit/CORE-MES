import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, KAPI, sunucuKur, yeniEmirAc } from '../test-ortak.tsx';
import { onizlemeOrnegi } from '../rotalar/onizleme-ornegi.ts';
import { rotaDurumu } from '../rotalar/test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3296-1: ürünün iki rotası var (Standart ve FAI'ye bağlı rota). Rota elle seçilmezse emrin türünün rotası açılışta bulunur; proje
// penceresinde sipariş partisi seçilince tür partiden gelir, rota da onun türünün rotası olur.
const kisi: Kullanici = { id: 9, ad: 'Deneme 9', islemler: [KAPI, 'sayfa.recete-rota', 'recete-rota.oku', 'rota.emre-kopyala'] as Kullanici['islemler'] };
const STANDART = '/rota/revizyonlar/71/emre-kopyala';
const FAI = '/rota/revizyonlar/72/emre-kopyala';
const ROTALAR = {
  revizyonlar: [{ id: 71, rotaId: 1, harf: 'A', durum: 'yururlukte' }, { id: 72, rotaId: 2, harf: 'A', durum: 'yururlukte' }],
  rotalar: [
    { id: 1, ad: 'Standart', standart: true, surum: 1, emirTurleri: [], taslakAcilabilir: false },
    { id: 2, ad: 'ORN FAI', standart: false, surum: 1, emirTurleri: ['fai'], taslakAcilabilir: false },
  ],
};
const PROJE = {
  projeZorunlu: true, rotasizAcik: false,
  projeler: [{ id: 5, kod: 'ORN_PRJ.01', ad: 'Örnek proje', satirlar: [{
    id: 51, siparisNo: 'ORN-SS-1', satirNo: 1, adet: '100.000', termin: null,
    partiler: [{ id: 8, emirTuru: 'fai', adet: '10.000' }, { id: 9, emirTuru: 'seri', adet: '90.000' }],
  }] }],
};
const sunucu = (secenek: unknown = { projeZorunlu: false, rotasizAcik: false, projeler: [] }) => sunucuKur(kisi, {
  durum: rotaDurumu(),
  yazmalar: {
    'GET /rota/urunler/11': () => json(200, ROTALAR),
    'GET /rota/revizyonlar/71/patlatma-onizleme': () => json(200, onizlemeOrnegi({ dugumler: onizlemeOrnegi().dugumler.slice(0, 1) })),
    'GET /rota/revizyonlar/72/patlatma-onizleme': () => json(200, onizlemeOrnegi({ dugumler: onizlemeOrnegi().dugumler.slice(0, 1) })),
    'GET /adimli-emirler/acilis-secenekleri': () => json(200, secenek),
    [`POST ${STANDART}`]: () => json(200, { uretimEmriId: 62, isEmriIdleri: [1] }),
    [`POST ${FAI}`]: () => json(200, { uretimEmriId: 63, isEmriIdleri: [1] }),
  },
});
const formAc = async () => {
  const p = await screen.findByRole('dialog', { name: 'Yeni üretim emri' });
  await within(p).findByRole('combobox', { name: 'Rota' });
  return p;
};
const kopya = (istekler: ReturnType<typeof sunucu>) => istekler.find((i) => i.yol === STANDART || i.yol === FAI);

describe('3296-1 emir açılışında rota ve tür', () => {
  it('rota elle seçilmezse gövdede rota yoktur; türün rotası açılır', async () => {
    const istekler = sunucu();
    yeniEmirAc();
    const form = await formAc();
    fireEvent.change(within(form).getByRole('combobox', { name: 'Emir türü' }), { target: { value: 'fai' } });
    await waitFor(() => expect((within(form).getByRole('combobox', { name: 'Rota' }) as HTMLSelectElement).value).toBe('2'));
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(kopya(istekler)).toBeDefined());
    expect(kopya(istekler)?.yol).toBe(FAI);
    expect(kopya(istekler)?.govde).toMatchObject({ emirTuru: 'fai' });
    expect(kopya(istekler)?.govde).not.toHaveProperty('rotaElle');
  });

  it('elle seçilen rota türden bağımsız gider', async () => {
    const istekler = sunucu();
    yeniEmirAc();
    const form = await formAc();
    fireEvent.change(within(form).getByRole('combobox', { name: 'Rota' }), { target: { value: '2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(kopya(istekler)).toBeDefined());
    expect(kopya(istekler)?.yol).toBe(FAI);
    expect(kopya(istekler)?.govde).toMatchObject({ emirTuru: 'seri', rotaElle: true });
  });

  it('proje penceresinde FAI partisi seçilince form Seri olsa da FAI rotası açılır', async () => {
    const istekler = sunucu(PROJE);
    yeniEmirAc();
    const form = await formAc();
    expect((within(form).getByRole('combobox', { name: 'Rota' }) as HTMLSelectElement).value).toBe('1');
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    const pencere = await screen.findByRole('dialog', { name: 'Üretim emri için proje' });
    fireEvent.click(within(pencere).getByRole('radio', { name: /10 FAI/ }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Emri aç' }));
    await waitFor(() => expect(kopya(istekler)).toBeDefined());
    expect(kopya(istekler)?.yol).toBe(FAI);
    expect(kopya(istekler)?.govde).toMatchObject({ emirTuru: 'fai', projeId: 5, siparisSatiriId: 51, siparisPartiId: 8 });
  });

  it('3411 a: türün rotası yoksa emir Seri rotasıyla açılır ve formda bu söylenir', async () => {
    const istekler = sunucu();
    yeniEmirAc();
    const form = await formAc();
    fireEvent.change(within(form).getByRole('combobox', { name: 'Emir türü' }), { target: { value: 'numune' } });
    const not = await within(form).findByRole('status');
    expect(not.textContent).toBe('Numune türünün rotası yok. Emir Standart rotası Rev A ile açılır; emir ayrıntısında bu not kalır.');
    expect((within(form).getByRole('combobox', { name: 'Rota' }) as HTMLSelectElement).value).toBe('1');
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(kopya(istekler)).toBeDefined());
    expect(kopya(istekler)?.yol).toBe(STANDART);
    expect(kopya(istekler)?.govde).toMatchObject({ emirTuru: 'numune' });
  });

  // 3578: açılan emrin bölünmesi ana emrin rotasından ve parti rotasından ayrı seçilir; Rota alanı ana emri, Parti rotası alt emri belirler.
  it('3578: yeni emir formunda Parti rotası seçilir; emir açılınca bölme gövdesine rotaId girer, boş seçimde girmez', async () => {
    const durum = rotaDurumu();
    const ornek = durum.emirler!.orders[0]!;
    durum.emirler = { ...durum.emirler!, orders: [...durum.emirler!.orders, { ...ornek, id: '62', kayitNo: 62, no: 'UE-0062', surum: 4 }] };
    const emir62 = { id: 62, parti: { ustEmirId: null, bolunmeSira: null, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null }, isEmirleri: [{ id: 701, opNo: 10, sira: 1, durum: 'bekliyor' }], surum: 4 };
    const istekler = sunucuKur(kisi, {
      durum,
      yazmalar: {
        'GET /rota/urunler/11': () => json(200, ROTALAR),
        'GET /rota/revizyonlar/71/patlatma-onizleme': () => json(200, onizlemeOrnegi({ dugumler: onizlemeOrnegi().dugumler.slice(0, 1) })),
        'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, rotasizAcik: false, projeler: [] }),
        'GET /adimli-emirler/62': () => json(200, { emir: emir62 }),
        [`POST ${STANDART}`]: () => json(200, { uretimEmriId: 62, isEmriIdleri: [1] }),
        'POST /adimli-emirler/62/bol': () => json(200, { emir: emir62, altEmirId: 63, ayriEmir: true }),
      },
    });
    yeniEmirAc();
    const form = await formAc();
    fireEvent.click(within(form).getByRole('button', { name: 'Partilere böl' }));
    const p1 = within(form).getByRole('group', { name: 'Parti 1 adet, tür ve rota' });
    const p2 = within(form).getByRole('group', { name: 'Parti 2 adet, tür ve rota' });
    fireEvent.change(within(p1).getByLabelText('Parti 1', { selector: 'input' }), { target: { value: '10' } });
    fireEvent.change(within(p2).getByLabelText('Parti 2', { selector: 'input' }), { target: { value: '5' } });
    await waitFor(() => { expect((within(p1).getByRole('combobox', { name: 'Parti rotası' }) as HTMLSelectElement).disabled).toBe(false); });
    const alan = within(p1).getByRole('combobox', { name: 'Parti rotası' }) as HTMLSelectElement;
    expect(within(alan).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ana emirle aynı (Standart · Rev A)', 'ORN FAI · Rev A']);
    fireEvent.change(alan, { target: { value: '2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/adimli-emirler/62/bol')).toHaveLength(2));
    const [ilk, ikinci] = istekler.filter((i) => i.yol === '/adimli-emirler/62/bol');
    expect(ilk?.govde).toMatchObject({ adet: 10, rotaId: 2 });
    expect(ikinci?.govde).toMatchObject({ adet: 5 });
    expect(ikinci?.govde).not.toHaveProperty('rotaId');
  });

  it('tek rotalı üründe Rota satırı salt okunur görünür', async () => {
    sunucuKur(kisi, {
      durum: rotaDurumu(),
      yazmalar: {
        'GET /rota/urunler/11': () => json(200, { revizyonlar: [ROTALAR.revizyonlar[0]], rotalar: [ROTALAR.rotalar[0]] }),
        'GET /rota/revizyonlar/71/patlatma-onizleme': () => json(200, onizlemeOrnegi({ dugumler: onizlemeOrnegi().dugumler.slice(0, 1) })),
        'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, rotasizAcik: false, projeler: [] }),
      },
    });
    yeniEmirAc();
    const p = await screen.findByRole('dialog', { name: 'Yeni üretim emri' });
    const rota = await within(p).findByRole('textbox', { name: 'Rota' }) as HTMLInputElement;
    expect([rota.value, rota.readOnly]).toEqual(['Standart · Rev A', true]);
    expect(within(p).queryByRole('combobox', { name: 'Rota' })).toBeNull();
  });
});

