import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 2542 (kullanıcı b): çatallı rotada kol açma, birleştirme, kol çarpanı, çatal etiketi ve anlık denetim. Veri biçimi aynıdır: kayıt gövdesinde
// dal adım başına harf, birleşme birleşen listesidir. Kayıt 800 ms sonra gider. Veriler uydurmadır.
const BEKLE = { timeout: 4000 };
type Govde = { adimlar: { opNo: number | null; dal: string | null; birlesen: string[]; adetCarpani?: number | null }[] };
const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
  // 2558 b/5: sayfa görüntüleme kipinde açılır; yazma yetkisi olan test "Düzenle" ile düzenleme kipine geçer.
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  return bolge;
};
// Açık taslak (Rev B) düzenlenir; kayıt gövdesi yakalanır.
const kur = (adimlar = [adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [] }), adimOrnegi({ id: 'o30', seq: 30, opNo: 30, ins: [] })]) => {
  const k: { govde: Govde | null } = { govde: null };
  sunucuKur(YONETICI, {
    durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4, adimlar)]),
    yazmalar: { 'POST /rota/revizyonlar/72/kaydet': (g) => { k.govde = g as Govde; return json(200, { id: 72, durum: 'taslak', surum: 5 }); } },
  });
  return k;
};
const adimSec = async (bolge: HTMLElement, op: number) => {
  fireEvent.click(await within(bolge).findByRole('button', { name: `OP ${String(op)} Tornalama` }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};
const dallar = (g: Govde | null) => g?.adimlar.map((a) => [a.opNo, a.dal, a.birlesen.join('')]);

describe('2542 çatallı rota: izinli', () => {
  it('A: "Buradan kol aç" yeni harfle paleti açar; eklenen ilk adım o adımdan çatallanır, açık kol düzenlerken uyarılır (F)', async () => {
    const k = kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const panel = await adimSec(bolge, 20);
    fireEvent.click(within(panel).getByRole('button', { name: 'Buradan kol aç' }));
    expect(within(bolge).getByText('Yeni Dal A: OP 20 ardından çatallanır. Paletten ilk adımını seç; ardına eklenen adımlar da bu dala düşer.')).toBeTruthy();
    const palet = within(bolge).getByRole('complementary', { name: 'Operasyon paleti' });
    expect(within(palet).getByText('MM-0001: yeni Dal A, OP 20 Tornalama ardından çatallanır')).toBeTruthy();
    fireEvent.click(within(palet).getByRole('button', { name: /Tornalama/ }));
    // Yeni adım seçili kalır; ardına eklenecek adım Dal A'ya düşer (kural kurallar.test.ts kolaEkle'de).
    expect(within(bolge).getByRole('complementary', { name: 'Operasyon paleti' }).textContent).toContain('MM-0001: OP 30 Tornalama ardına');
    // F: kayıt gitmeden (800 ms) tabloda açık kol uyarısı ve çatal etiketi görünür.
    fireEvent.click(within(bolge).getByRole('button', { name: /Akış tablosu/ }));
    const tablo = await within(bolge).findByRole('region', { name: 'MM-0001 rotası' });
    expect(within(tablo).getByRole('alert').textContent).toBe('A dalı hiçbir adımda birleşmiyor; birleştirme adımında seçilmeli.');
    expect(within(tablo).getByText('Dal A: OP 20 ardından başlar, birleşmiyor.')).toBeTruthy();
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(dallar(k.govde)).toEqual([[10, null, ''], [20, null, ''], [null, 'A', ''], [30, null, '']]);
  }, 30000);

  it('B ve D: "Kolları burada birleştir" açık kolların hepsini işaretler; kol çarpanı dalın bütün adımlarına yazılır, etiket çatal ve birleşmeyi söyler', async () => {
    const k = kur([
      adimOrnegi(),
      adimOrnegi({ id: 'o20', seq: 20, opNo: 20, dal: 'A', ins: [] }), adimOrnegi({ id: 'o30', seq: 30, opNo: 30, dal: 'A', ins: [] }),
      adimOrnegi({ id: 'o40', seq: 40, opNo: 40, dal: 'B', ins: [] }), adimOrnegi({ id: 'o50', seq: 50, opNo: 50, ins: [] }),
    ]);
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    let panel = await adimSec(bolge, 10);
    expect(within(panel).getByText('Dal A: OP 10 ardından başlar, birleşmiyor.')).toBeTruthy();
    expect(within(panel).getByText('Dal B: OP 10 ardından başlar, birleşmiyor.')).toBeTruthy();
    panel = await adimSec(bolge, 50);
    fireEvent.click(within(panel).getByRole('button', { name: 'Kolları burada birleştir (Dal A, Dal B)' }));
    expect(within(panel).queryByRole('button', { name: /Kolları burada birleştir/ })).toBeNull();
    panel = await adimSec(bolge, 20);
    expect(within(panel).getByText('Dal A: OP 10 ardından başlar, OP 50 adımında birleşir.')).toBeTruthy();
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(k.govde?.adimlar.at(-1)?.birlesen).toEqual(['A', 'B']);
    expect(within(panel).queryByRole('button', { name: 'Buradan kol aç' })).toBeNull();
    const carpan = within(panel).getByLabelText('Dal A: 1 mamul için adet');
    fireEvent.change(carpan, { target: { value: '3' } });
    fireEvent.blur(carpan);
    await waitFor(() => { expect(k.govde?.adimlar.map((a) => a.adetCarpani ?? null)).toEqual([null, 3, 3, null, null]); }, BEKLE);
  }, 30000);

  it('E: taşıma dalın çatalını değiştirecekse önce sorar; vazgeçilirse sıra değişmez, onaylanırsa yeni yer yazılır', async () => {
    const k = kur([
      adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [] }),
      adimOrnegi({ id: 'o30', seq: 30, opNo: 30, dal: 'A', ins: [] }), adimOrnegi({ id: 'o40', seq: 40, opNo: 40, birlesen: ['A'], ins: [] }),
    ]);
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const panel = await adimSec(bolge, 20);
    fireEvent.click(within(panel).getByRole('button', { name: 'Yukarı' }));
    const pencere = await screen.findByRole('dialog', { name: 'Dalın yeri değişsin mi?' });
    expect(within(pencere).getByText('Dal A: OP 10 ardından başlar, OP 40 adımında birleşir.')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await new Promise((r) => { setTimeout(r, 1000); });
    expect(k.govde).toBeNull();

    fireEvent.click(within(panel).getByRole('button', { name: 'Yukarı' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Dalın yeri değişsin mi?' })).getByRole('button', { name: 'Taşı' }));
    await waitFor(() => { expect(k.govde?.adimlar.map((a) => a.opNo)).toEqual([20, 10, 30, 40]); }, BEKLE);
  }, 30000);
});

describe('2542 çatallı rota: okuyan', () => {
  it('okuyan etiketi görür; kol açma, birleştirme düğmeleri yok', async () => {
    sunucuKur(OKUYAN, { durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, [
      adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, dal: 'A', ins: [] }), adimOrnegi({ id: 'o30', seq: 30, opNo: 30, ins: [] }),
    ])]) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const panel = await adimSec(bolge, 20);
    expect(within(panel).getByText('Dal A: OP 10 ardından başlar, birleşmiyor.')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Buradan kol aç' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Kolları burada birleştir/ })).toBeNull();
  }, 30000);
});

// jsdom'da DataTransfer yok; sürükle-bırak verisi bu nesneyle taşınır.
const tasima = () => {
  const veri: Record<string, string> = {};
  return { dataTransfer: { effectAllowed: '', dropEffect: '', setData: (k: string, v: string) => { veri[k] = v; }, getData: (k: string) => veri[k] ?? '' } };
};

describe('2542 C ve 3188: dallar şemada yana açılır', () => {
  it('3188: dal ayrıldığı adımın altında yan hücrede açılır, ana hat tek sütunda kalır; etikette çarpan; adım başka dalın etiketine bırakılınca o dala geçer', async () => {
    const k = kur([
      adimOrnegi(),
      adimOrnegi({ id: 'o20', seq: 20, opNo: 20, dal: 'A', adetCarpani: 2, ins: [] }), adimOrnegi({ id: 'o30', seq: 30, opNo: 30, dal: 'B', ins: [] }),
      adimOrnegi({ id: 'o40', seq: 40, opNo: 40, birlesen: ['A', 'B'], ins: [] }),
    ]);
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const a = await within(bolge).findByRole('group', { name: 'Dal A kolu' });
    const b = within(bolge).getByRole('group', { name: 'Dal B kolu' });
    const hucre = (ad: string) => within(bolge).getByRole('button', { name: ad }).closest('.tc-rr1-dh');
    expect(hucre('OP 20 Tornalama')).toBe(a.closest('.tc-rr1-dh'));
    expect(hucre('OP 30 Tornalama')).toBe(b.closest('.tc-rr1-dh'));
    // Izgara: başlık satırı, OP 10, dalların satırı, OP 40; üç sütun (sol dal, ana hat, sağ dal). Ana hat adımları aynı sütundadır.
    const izgara = hucre('OP 10 Tornalama')?.parentElement;
    expect(izgara?.classList.contains('tc-rr1-dallar-3')).toBe(true);
    const sutun = (ad: string) => [...(izgara?.children ?? [])].indexOf(hucre(ad) as Element) % 3;
    expect([sutun('OP 10 Tornalama'), sutun('OP 40 Tornalama')]).toEqual([1, 1]);
    expect([sutun('OP 30 Tornalama'), sutun('OP 20 Tornalama')]).toEqual([0, 2]);
    // Nereden ayrılıp nerede birleştiğini çizgi gösterir: uzun açıklama şemada yazılmaz, birleştiren adım etiketini taşır.
    expect(within(bolge).queryByText(/ardından başlar/)).toBeNull();
    expect(within(hucre('OP 40 Tornalama') as HTMLElement).getByText('birleşir: A, B')).toBeTruthy();
    expect(within(a).getByText(/1 adım/)).toBeTruthy();
    expect((within(a).getByLabelText('Dal A: 1 mamul için adet') as HTMLInputElement).value).toBe('2');
    expect(within(bolge).queryByText('Birleşmiyor')).toBeNull();

    const t = tasima();
    fireEvent.dragStart(within(bolge).getByRole('button', { name: 'OP 30 Tornalama' }), t);
    fireEvent.drop(a, t);
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(k.govde?.adimlar.map((x) => [x.opNo, x.dal, x.adetCarpani ?? null])).toEqual([[10, null, null], [20, 'A', 2], [30, 'A', 2], [40, null, null]]);
    expect(k.govde?.adimlar.at(-1)?.birlesen).toEqual(['A']);
  }, 30000);
  it('3188: birleşmeyen dalın son adımının altında "Birleşmiyor" uyarısı durur', async () => {
    kur([adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, dal: 'A', ins: [] }), adimOrnegi({ id: 'o30', seq: 30, opNo: 30, ins: [] })]);
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const uyari = await within(bolge).findByText('Birleşmiyor');
    expect(uyari.closest('.tc-rr1-dh')).toBe(within(bolge).getByRole('button', { name: 'OP 20 Tornalama' }).closest('.tc-rr1-dh'));
  }, 30000);
});
