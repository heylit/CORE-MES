import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import type { DisOperasyon, DisOperasyonlarCevabi, FasonSureleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { DisOperasyonlar, disOperasyonSuz, malKabulAdresi } from './DisOperasyonlar.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
const satir = (ek: Partial<DisOperasyon>): DisOperasyon => ({
  isEmriId: 1, uretimEmriId: 11, emirNo: 'UE-2026-001', urun: 'Deneme flanş', opNo: 30, adim: 'Kaplama', firmaId: 3, firmaAdi: 'Deneme Kaplama', planlananGidis: '2026-10-05',
  gerceklesenGidis: '2026-10-05T08:00:00Z', termin: '2026-10-09', ilkDonus: null, sonDonus: null, gonderilen: 40, donen: null, hurda: null, gecikmeGun: 2, gecikmeSonDonus: 2,
  gecikmeAgirlikli: 2, siparisSatirId: null, fasonKonumId: null, sirada: true, ...ek,
});

function MalKabulSahte() {
  const [adres] = useSearchParams();
  return <p>{`Mal kabul sayfası, fason iş emri ${adres.get('fasonIsEmri') ?? 'yok'}`}</p>;
}

interface Istek { yontem: string; yol: string; govde: unknown; kimlik: string | null }
// Kişi ve emirler uydurmadır.
function ac(liste: () => Response, islemler: string[] = ['satin-alma.yaz'], komut: () => Response = () => json(200, {})) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const baslik = new Headers(i?.headers);
    istekler.push({ yontem: i?.method ?? 'GET', yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined, kimlik: baslik.get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Alıcı', islemler } });
    if (yol === '/satin-alma-dis-operasyonlar') return liste();
    if (yol.startsWith('/satin-alma-fason-sureleri')) return json(200, { sureler: [], terminUyumu: [] } satisfies FasonSureleriCevabi);
    return komut();
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/satin-alma/dis-operasyonlar']}>
        <BildirimSaglayici><Routes>
          <Route path="/satin-alma/dis-operasyonlar" element={<DisOperasyonlar />} />
          <Route path="/stok/mal-kabul" element={<MalKabulSahte />} />
        </Routes></BildirimSaglayici>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return istekler;
}
const liste = (...operasyonlar: DisOperasyon[]) => () => json(200, { hazir: true, operasyonlar } satisfies DisOperasyonlarCevabi);
const satirOf = (emirNo: string) => screen.getByText(emirNo).closest('tr') as HTMLElement;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Dış operasyonlar (#542)', () => {
  it('üretim emirleri bağlı değilken liste yerine bağlantının olmadığını söyler', async () => {
    ac(() => json(200, { hazir: false, operasyonlar: [] } satisfies DisOperasyonlarCevabi));
    expect(await screen.findByText(/bağlantı henüz kurulmadı/)).toBeTruthy();
  });

  it('satırda emir, firma, termin ve gecikme görünür; firması olmayan "Seçilmedi", zamanında olan rozet taşır', async () => {
    ac(liste(satir({}), satir({ isEmriId: 2, emirNo: 'UE-2026-002', firmaId: null, firmaAdi: null, gecikmeGun: 0, gecikmeSonDonus: 0 })));
    expect(await screen.findByText('UE-2026-001')).toBeTruthy();
    expect(screen.getByText('Deneme Kaplama')).toBeTruthy();
    expect(screen.getAllByText('09.10.2026').length).toBe(2);
    expect(screen.getByText('2 gün')).toBeTruthy();
    expect(screen.getByText('Seçilmedi')).toBeTruthy();
    expect(screen.getByText('Zamanında')).toBeTruthy();
  });

  it('uç hata verirse yeniden dene düğmesiyle hata gösterir', async () => {
    ac(() => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    expect(await screen.findByText('Yeniden dene')).toBeTruthy();
  });
});

describe('Dış operasyonlarda gidiş ve tamamla (#995); dönüş mal kabulde', () => {
  it('fason yetkisi olmayan düğme görmez', async () => {
    ac(liste(satir({})), ['satin-alma.oku']);
    await screen.findByText('UE-2026-001');
    expect(screen.queryByRole('button', { name: /Gönder/ })).toBeNull();
  });

  it('satırda yalnız sıradaki işlem düğmedir: gidiş yoksa Gönder, dışarıda adet varsa Mal kabul, hepsi dönünce Tamamla; öbürleri menüde', async () => {
    ac(liste(
      satir({}),
      satir({ isEmriId: 2, emirNo: 'UE-2026-002', donen: 38, hurda: 2 }),
      satir({ isEmriId: 3, emirNo: 'UE-2026-003', gonderilen: null, gerceklesenGidis: null }),
    ), ['uretim-emirleri.fason']);
    await waitFor(() => satirOf('UE-2026-001'));
    expect(within(satirOf('UE-2026-001')).getByRole('button', { name: 'UE-2026-001 Op 30: Mal kabulde gir' }).textContent).toBe('Mal kabul');
    expect(within(satirOf('UE-2026-002')).getByRole('button', { name: 'UE-2026-002 Op 30: Tamamla' })).toBeTruthy();
    expect(within(satirOf('UE-2026-003')).getByRole('button', { name: 'UE-2026-003 Op 30: Gönder' })).toBeTruthy();
    expect(within(satirOf('UE-2026-002')).getByText('38 / 40')).toBeTruthy();
    expect(within(satirOf('UE-2026-002')).getByText('2 hurda')).toBeTruthy();
    expect(within(satirOf('UE-2026-001')).getByText('Deneme flanş · Op 30 Kaplama')).toBeTruthy();
    fireEvent.click(within(satirOf('UE-2026-001')).getByRole('button', { name: 'UE-2026-001 Op 30 için işlemler' }));
    const menu = await screen.findByRole('menu');
    const ogeler = within(menu).getAllByRole('menuitem');
    expect(ogeler.map((o) => [o.textContent?.startsWith('Gönder') ? 'Gönder' : 'Tamamla', o.getAttribute('aria-disabled')])).toEqual([['Gönder', null], ['Tamamla', 'true']]);
    expect(within(menu).getByText('Bütün adet dönünce tamamlanır.')).toBeTruthy();
  });

  it('1849 (C17): sırası gelmemiş fason adımında Gönder satırda düğme olmaz; menüde kapalıdır ve nedenini söyler', async () => {
    ac(liste(satir({ isEmriId: 4, emirNo: 'UE-2026-004', sirada: false, gonderilen: null, gerceklesenGidis: null })), ['uretim-emirleri.fason']);
    await waitFor(() => satirOf('UE-2026-004'));
    expect(within(satirOf('UE-2026-004')).queryByRole('button', { name: /: Gönder/ })).toBeNull();
    fireEvent.click(within(satirOf('UE-2026-004')).getByRole('button', { name: 'UE-2026-004 Op 30 için işlemler' }));
    const menu = await screen.findByRole('menu');
    const gonder = within(menu).getAllByRole('menuitem').find((o) => o.textContent?.startsWith('Gönder'));
    expect(gonder?.getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByText('Önceki iş emirleri bitmeden fasona gönderilmez.')).toBeTruthy();
  });

  it('gönder, emir ve iş emri kimliğiyle üretim emirlerinin ucuna adedi istek kimliğiyle yazar; yeniden basış aynı kimlikle gider', async () => {
    let cevap = () => json(409, { kod: 'CAKISMA', mesaj: 'Gönderilen adet planlananı aşıyor.' });
    const istekler = ac(liste(satir({ gonderilen: null, gerceklesenGidis: null })), ['uretim-emirleri.fason'], () => cevap());
    fireEvent.click(await within(await waitFor(() => satirOf('UE-2026-001'))).findByRole('button', { name: 'UE-2026-001 Op 30: Gönder' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    expect(await within(pencere).findByRole('alert')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(0);

    fireEvent.change(within(pencere).getByLabelText(/Gönderilen adet/), { target: { value: '15' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    expect(await within(pencere).findByText('Gönderilen adet planlananı aşıyor.')).toBeTruthy();
    cevap = () => json(200, {});
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const yazilar = istekler.filter((i) => i.yontem === 'POST');
    expect(yazilar.map((i) => [i.yol, i.govde])).toEqual([
      ['/adimli-emirler/11/is-emirleri/1/fason-gidis', { adet: 15 }],
      ['/adimli-emirler/11/is-emirleri/1/fason-gidis', { adet: 15 }],
    ]);
    expect(yazilar[0]!.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(yazilar[1]!.kimlik).toBe(yazilar[0]!.kimlik);
  });

  it('tamamla gövdesiz komutu yazar; dönüş burada yazılmaz, mal kabule götürür (karar 15.10 B)', async () => {
    const istekler = ac(liste(satir({ donen: 10 }), satir({ isEmriId: 2, emirNo: 'UE-2026-002', donen: 40 })), ['uretim-emirleri.fason']);
    fireEvent.click(await within(await waitFor(() => satirOf('UE-2026-002'))).findByRole('button', { name: /Tamamla/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(satirOf('UE-2026-001')).getByRole('button', { name: /Mal kabulde gir/ }));
    // 2424: mal kabul fason iş emriyle açılır.
    expect(await screen.findByText('Mal kabul sayfası, fason iş emri 1')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([['/adimli-emirler/11/is-emirleri/2/fason-tamamla', undefined]]);
  });
});

// 2424: arama, durum süzgeci ve sıra; varsayılan sırada geciken önde, sonra termini yakın olan.
describe('dış operasyonlar süzgeci ve sırası (2424)', () => {
  const l = [
    satir({ isEmriId: 1, emirNo: 'UE-1', gecikmeGun: 0, gecikmeSonDonus: 0, termin: '2026-10-20', firmaAdi: 'Deneme Kaplama' }),
    satir({ isEmriId: 2, emirNo: 'UE-2', gecikmeGun: 3, gecikmeSonDonus: 3, termin: '2026-10-25', firmaAdi: 'Deneme Taşlama' }),
    satir({ isEmriId: 3, emirNo: 'UE-3', gecikmeGun: 7, gecikmeSonDonus: 7, termin: '2026-10-30' }),
    satir({ isEmriId: 4, emirNo: 'UE-4', gecikmeGun: null, gecikmeSonDonus: null, termin: '2026-10-10', gonderilen: null }),
    satir({ isEmriId: 5, emirNo: 'UE-5', gecikmeGun: 0, gecikmeSonDonus: 0, termin: '2026-10-12', gonderilen: 10, donen: 10 }),
  ];
  const no = (x: { emirNo: string }[]) => x.map((y) => y.emirNo);
  it('varsayılan sıra: çok geciken önce, sonra termini yakın', () => {
    expect(no(disOperasyonSuz(l, '', 'hepsi', null))).toEqual(['UE-3', 'UE-2', 'UE-4', 'UE-5', 'UE-1']);
  });
  it('durum süzgeci ve arama', () => {
    expect(no(disOperasyonSuz(l, '', 'geciken', null))).toEqual(['UE-3', 'UE-2']);
    expect(no(disOperasyonSuz(l, '', 'gonderilecek', null))).toEqual(['UE-4']);
    expect(no(disOperasyonSuz(l, '', 'donen', null))).toEqual(['UE-5']);
    expect(no(disOperasyonSuz(l, '', 'disarida', null))).toEqual(['UE-3', 'UE-2', 'UE-1']);
    expect(no(disOperasyonSuz(l, 'TAŞLAMA', 'hepsi', null))).toEqual(['UE-2']);
  });
  it('sütun sırası varsayılanı ezer', () => {
    expect(no(disOperasyonSuz(l, '', 'hepsi', { alan: 'termin', yon: 'artan' }))).toEqual(['UE-4', 'UE-5', 'UE-1', 'UE-2', 'UE-3']);
    expect(no(disOperasyonSuz(l, '', 'hepsi', { alan: 'emir', yon: 'azalan' }))).toEqual(['UE-5', 'UE-4', 'UE-3', 'UE-2', 'UE-1']);
  });
});

describe('2424-a c ve 2426: iki gecikme ölçüsü, mal kabul adresi', () => {
  it('gecikme son dönüşe göredir, altında adet ağırlıklı; ilk dönüş gecikmesi süzgeci ve sırayı belirlemez', async () => {
    ac(liste(satir({ gecikmeGun: 0, gecikmeSonDonus: 6, gecikmeAgirlikli: 2.5 }), satir({ isEmriId: 3, emirNo: 'UE-2026-003', gecikmeSonDonus: 4, gecikmeAgirlikli: 4 }), satir({ isEmriId: 2, emirNo: 'UE-2026-002', gecikmeGun: 4, gecikmeSonDonus: 0, gecikmeAgirlikli: 0 })));
    const tablo = await screen.findByRole('table');
    expect(within(tablo).getByText('6 gün')).toBeTruthy();
    expect(within(tablo).getByText('adet ağırlıklı 2,5 gün')).toBeTruthy();
    expect(within(tablo).queryAllByText(/adet ağırlıklı/)).toHaveLength(1);
    expect(disOperasyonSuz([satir({ gecikmeGun: 4, gecikmeSonDonus: 0 })], '', 'geciken', null)).toEqual([]);
  });
  it('mal kabul adresi bilinen sipariş satırı ve fason kutusunu taşır, bilinmeyeni göndermez', () => {
    expect(malKabulAdresi(satir({ isEmriId: 7, siparisSatirId: 41, fasonKonumId: 9 }))).toBe('/stok/mal-kabul?fasonIsEmri=7&siparisSatiri=41&konum=9');
    expect(malKabulAdresi(satir({ isEmriId: 7 }))).toBe('/stok/mal-kabul?fasonIsEmri=7');
  });
});
