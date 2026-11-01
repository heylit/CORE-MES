import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { kayitYazmalari, kmAc, kmAdresi, MUAYENECI, MUHENDIS, OKUYAN, YONETICI } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const kayit = (durum: string, ek: Record<string, unknown> = {}) => ({
  _id: 'f1', kod: 'KF-08', ad: 'FOD kontrol listesi', rev: '00', tarih: '2026-10-01', dolduran: 'Deneme Dolduran', durum, liste: { '1_0': 'Evet' }, ...ek,
});
const DEGISMIS = { _id: 't1', kod: 'KF-08', ad: 'FOD kontrol listesi', rev: '01', yurur: '2026-10-01', dsl: '# Bölüm\n? Madde' };

const kart = async (kod: string) => within((await screen.findByText(kod, { selector: '.tc-km3-kart-ust span' })).closest('article') as HTMLElement);
const satir = async () => within((await screen.findByText('Deneme Dolduran')).closest('tr') as HTMLElement);
const govde = (y: { govde: unknown }) => JSON.stringify(y.govde);

describe('Formlar yetkileri', () => {
  it('mühendis form tasarlar, doldurur ve şablonu düzenler', async () => {
    kmAc('formlar', MUHENDIS);
    expect(await screen.findByRole('button', { name: /Yeni form tasarla/ })).toBeTruthy();
    const k = await kart('KF-08');
    expect(k.getByRole('button', { name: /Doldur/ })).toBeTruthy();
    expect(k.getByRole('button', { name: /Düzenle/ })).toBeTruthy();
  });

  it('muayeneci doldurur ama şablon tasarlayamaz (229 a)', async () => {
    kmAc('formlar', MUAYENECI);
    const k = await kart('KF-08');
    expect(k.getByRole('button', { name: /Doldur/ })).toBeTruthy();
    expect(k.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Yeni form tasarla/ })).toBeNull();
  });

  it('yalnız okuyan yalnız boş form yazdırır', async () => {
    kmAc('formlar', OKUYAN);
    const k = await kart('KF-08');
    expect(k.queryByRole('button', { name: /Doldur/ })).toBeNull();
    expect(k.getByRole('button', { name: /Boş form/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yeni form tasarla/ })).toBeNull();
  });

  it('varsayılana dönme mühendis ve yöneticide, muayenecide yok (260 a)', async () => {
    kmAc('formlar', MUHENDIS, { tpl: [DEGISMIS] });
    expect((await kart('KF-08')).getByRole('button', { name: /Varsayılana dön/ })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    kmAc('formlar', YONETICI, { tpl: [DEGISMIS] });
    expect((await kart('KF-08')).getByRole('button', { name: /Varsayılana dön/ })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    kmAc('formlar', MUAYENECI, { tpl: [DEGISMIS] });
    expect((await kart('KF-08')).queryByRole('button', { name: /Varsayılana dön/ })).toBeNull();
  });

  it('onay bekleyen kaydı yalnız mühendis onaylar', async () => {
    kmAc('formlar', MUAYENECI, { frm: [kayit('Onay bekliyor')] });
    expect((await satir()).queryByRole('button', { name: /^Onayla/ })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    kmAc('formlar', MUHENDIS, { frm: [kayit('Onay bekliyor')] });
    expect((await satir()).getByRole('button', { name: /^Onayla/ })).toBeTruthy();
  });

  it('onaylı kayıt düzenlenmez; onayı yalnız mühendis geri alır, silme yalnız yöneticide', async () => {
    kmAc('formlar', MUAYENECI, { frm: [kayit('Onaylandı')] });
    let s = await satir();
    expect(s.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect(s.queryByRole('button', { name: /Onayı geri al/ })).toBeNull();
    expect(s.queryByRole('button', { name: /Sil/ })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    kmAc('formlar', MUHENDIS, { frm: [kayit('Onaylandı')] });
    s = await satir();
    expect(s.getByRole('button', { name: /Onayı geri al/ })).toBeTruthy();
    expect(s.queryByRole('button', { name: /Sil/ })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    kmAc('formlar', YONETICI, { frm: [kayit('Onaylandı')] });
    expect((await satir()).getByRole('button', { name: /Sil/ })).toBeTruthy();
  });
});

describe('Form kayıtları', () => {
  it('onaylama onaylayanı göndermez, durumu Onaylandı yapar', async () => {
    const { yazmalar } = kmAc('formlar', MUHENDIS, { frm: [kayit('Onay bekliyor', { onaylayan: 'Sahte', onayTarih: '2026-01-01' })] });
    fireEvent.click((await satir()).getByRole('button', { name: /^Onayla/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'frm')).toHaveLength(1));
    const g = govde(kayitYazmalari(yazmalar, 'frm')[0]!);
    expect(g).toContain('"durum":"Onaylandı"');
    expect(g).not.toContain('onaylayan');
    expect(g).not.toContain('onayTarih');
  });

  it('yanıtsız maddesi olan taslak onaya gönderilmez, tam olan gönderilir', async () => {
    const { yazmalar } = kmAc('formlar', MUAYENECI, { frm: [kayit('Taslak', { liste: { '1_0': '' } })] });
    fireEvent.click((await satir()).getByRole('button', { name: /Onaya gönder/ }));
    expect(await screen.findByText(/yanıtlanmamış/)).toBeTruthy();
    expect(kayitYazmalari(yazmalar, 'frm')).toHaveLength(0);
    cleanup(); vi.unstubAllGlobals();
    const ikinci = kmAc('formlar', MUAYENECI, { frm: [kayit('Taslak')] });
    fireEvent.click((await satir()).getByRole('button', { name: /Onaya gönder/ }));
    await waitFor(() => expect(kayitYazmalari(ikinci.yazmalar, 'frm')).toHaveLength(1));
    expect(govde(kayitYazmalari(ikinci.yazmalar, 'frm')[0]!)).toContain('"durum":"Onay bekliyor"');
  });

  it('doldurulan form dolduranla taslak olarak kaydedilir', async () => {
    const { yazmalar } = kmAc('formlar', MUAYENECI);
    fireEvent.click((await kart('KF-08')).getByRole('button', { name: /Doldur/ }));
    fireEvent.change(await screen.findByLabelText(/Dolduran/), { target: { value: 'Deneme Muayeneci' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak kaydet' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'frm')).toHaveLength(1));
    const g = govde(kayitYazmalari(yazmalar, 'frm')[0]!);
    expect(g).toContain('"kod":"KF-08"');
    expect(g).toContain('"durum":"Taslak"');
    expect(g).toContain('"dolduran":"Deneme Muayeneci"');
  });

  it('form "Tek tek sor" kipinde açılır; maddeler eksikken onaya gönderilmez, tamamlanınca gönderilir', async () => {
    const { yazmalar } = kmAc('formlar', MUAYENECI);
    fireEvent.click((await kart('KF-08')).getByRole('button', { name: /Doldur/ }));
    expect(await screen.findByRole('button', { name: 'Tüm alanları göster' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tüm alanları göster' }));
    fireEvent.change(screen.getByLabelText(/Dolduran/), { target: { value: 'Deneme Muayeneci' } });
    fireEvent.change(screen.getByLabelText(/Alan \/ hat/), { target: { value: 'Hat 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet ve onaya gönder' }));
    expect(await screen.findByText('Eksikleri tamamlayın ya da taslak olarak kaydedin.')).toBeTruthy();
    expect(kayitYazmalari(yazmalar, 'frm')).toHaveLength(0);
    screen.getAllByRole('button', { name: 'Yanıtsızları "Evet" yap', hidden: true }).forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet ve onaya gönder' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'frm')).toHaveLength(1));
    const g = govde(kayitYazmalari(yazmalar, 'frm')[0]!);
    expect(g).toContain('"durum":"Onay bekliyor"');
    expect(g).toContain('"0_0":"Hat 1"');
    expect(g).toContain('"1_0":"Evet"');
  });

  it('bağlı form Doldur ile kendi modülünde yeni kayıt açar', async () => {
    kmAc('formlar', MUHENDIS);
    fireEvent.click((await kart('KF-01')).getByRole('button', { name: /Doldur/ }));
    expect(await screen.findByRole('heading', { name: /Uygunsuzluk kaydet/ })).toBeTruthy();
  });
});

describe('Ürün durum etiketi Etiket Merkezi\'nden (1288, 1548)', () => {
  const ETIKET = {
    _id: 'e1', kod: 'KF-19', ad: 'Ürün durum etiketi', rev: '00', tarih: '2026-10-01', dolduran: 'Deneme Dolduran', durum: 'Taslak', etiket: true,
    dsl: '# Etiket\nDurum * | seçim: KABUL, RET\nParça no *\nLot / seri no', veri: { '0_0': 'RET', '0_1': 'ORN-1', '0_2': 'LT-000040' },
  };
  const ETIKETCI = { ...MUHENDIS, kullanici: { ...MUHENDIS.kullanici, islemler: [...MUHENDIS.kullanici.islemler, 'sayfa.etiket-merkezi' as const] } };
  const lotCoz = (f: ReturnType<typeof kmAc>['fetch'], bakiyeler: number[]) => {
    const onceki = f.getMockImplementation()!;
    f.mockImplementation(async (adres: string, istek?: RequestInit) => (adres.includes('/stok/kod-coz')
      ? new Response(JSON.stringify(bakiyeler.length ? { tur: 'lot', bakiyeler: bakiyeler.map((id) => ({ id })) } : { tur: 'bilinmiyor', kod: 'LOT:LT-000040' }), { status: 200 })
      : onceki(adres, istek)));
  };

  it('etiket formunun kaydı lotun stok satırlarını Etiket Merkezi\'nde kalite durum etiketi olarak açar', async () => {
    const { fetch } = kmAc('formlar', ETIKETCI, { frm: [ETIKET] });
    lotCoz(fetch, [31, 32]);
    fireEvent.click((await satir()).getByRole('button', { name: /Etiket Merkezi'nde bas/ }));
    await waitFor(() => expect(kmAdresi()).toBe('/etiket-merkezi'));
    expect(fetch.mock.calls.some(([a]) => String(a).includes(`/stok/kod-coz?kod=${encodeURIComponent('LOT:LT-000040')}`))).toBe(true);
  });

  it('stokta olmayan lot için bilgi verir, sayfa değişmez; Etiket Merkezi\'ni açamayan ve lotsuz kayıtta düğme yok', async () => {
    const { fetch } = kmAc('formlar', ETIKETCI, { frm: [ETIKET] });
    lotCoz(fetch, []);
    fireEvent.click((await satir()).getByRole('button', { name: /Etiket Merkezi'nde bas/ }));
    expect(await screen.findByText(/LT-000040 stokta yok/)).toBeTruthy();
    expect(kmAdresi()).toBe('/kalite-merkezi/formlar');
    cleanup(); vi.unstubAllGlobals();
    kmAc('formlar', MUHENDIS, { frm: [ETIKET] });
    expect((await satir()).queryByRole('button', { name: /Etiket Merkezi'nde bas/ })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    kmAc('formlar', ETIKETCI, { frm: [{ ...ETIKET, veri: { '0_0': 'RET' } }] });
    expect((await satir()).queryByRole('button', { name: /Etiket Merkezi'nde bas/ })).toBeNull();
  });
});
