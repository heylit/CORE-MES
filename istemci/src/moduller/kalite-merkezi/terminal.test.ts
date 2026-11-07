import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { adimEksigi, bosIcerik, formAdimlari, kararEksigi, terminalFormKaydi, useKaliteKarari, useKaliteKuyrugu, useTerminalFormlari, type HataliBekleyeni, type TerminalFormu } from './terminal.ts';
import { dslCoz } from './yeni/formlar/dsl.ts';
import { formListesi } from './yeni/formlar/sablonlar.ts';
import { MUAYENECI, MUHENDIS, sunucuKur, type TestKayitlari, type TestKullanicisi } from './yeni/test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const DSL = '# Yüzey\nSertlik * | sayı\n? Çapak yok\n? Markalama okunur\n# Ölçü\n[Tablo: Ölçü, Değer]';
const sablon = (): TerminalFormu => {
  const form = formListesi([{ _id: 't9', kod: 'KF-40', ad: 'Son kontrol', rev: '02', dsl: DSL, terminal: true }], undefined).find((f) => f.kod === 'KF-40')!;
  return { kod: form.kod, ad: form.ad, rev: form.rev, std: form.std, dsl: form.dsl, bolumler: dslCoz(form.dsl), form };
};

function kanca<T>(k: TestKullanicisi, kayitlar: TestKayitlari, f: () => T) {
  const sunucu = sunucuKur(k, kayitlar);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sarmal = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: istemci }, children);
  return { ...sunucu, ...renderHook(f, { wrapper: sarmal }) };
}

describe('terminal form adımları', () => {
  it('her ekran tek alan, tek madde ya da tablo; sıra tasarım metnindeki sıradır', () => {
    const a = formAdimlari(dslCoz(DSL));
    expect(a.map((x) => x.tur)).toEqual(['alan', 'madde', 'madde', 'tablo']);
    expect(a[0]).toMatchObject({ tur: 'alan', anahtar: '0_0', baslik: 'Yüzey' });
    expect(a[2]).toMatchObject({ tur: 'madde', anahtar: '0_1', metin: 'Markalama okunur' });
  });

  it('zorunlu alan boşken, madde yanıtsızken ve "Hayır" açıklamasızken ileri gidilmez', () => {
    const [alan, madde] = formAdimlari(dslCoz(DSL));
    const ic = bosIcerik();
    expect(adimEksigi(alan!, ic)).toBe('Sertlik zorunlu.');
    expect(adimEksigi(madde!, ic)).toMatch(/Evet, Hayır ya da UD/);
    ic.liste['0_0'] = 'Hayır';
    expect(adimEksigi(madde!, ic)).toMatch(/açıklama/);
    ic.listeNot['0_0'] = 'Çapak var';
    ic.veri['0_0'] = '42,5';
    expect(adimEksigi(alan!, ic)).toBeNull();
    expect(adimEksigi(madde!, ic)).toBeNull();
  });

  it('kayıt gövdesi Kalite Merkezi doldurmasıyla aynı anahtarları taşır; boş tablo satırı atılır, "Hayır" sonucu uygunsuzluktur', () => {
    const ic = { veri: { '0_0': '42,5' }, liste: { '0_0': 'Hayır', '0_1': 'Evet' }, listeNot: { '0_0': 'Çapak var' }, tablo: { '1': [{ c0: 'Ø25', c1: '25,01' }, { c0: ' ', c1: '' }] } };
    const k = terminalFormKaydi(sablon(), ic, { dolduran: 'Deneme Mühendis', tarih: '2026-11-07', bolum: 'KAL-SON · OP40' }, 'Onay bekliyor');
    expect(k).toMatchObject({ kod: 'KF-40', rev: '02', dolduran: 'Deneme Mühendis', tarih: '2026-11-07', bolum: 'KAL-SON · OP40', durum: 'Onay bekliyor', sonuc: 'Uygunsuzluk var' });
    expect(k.veri).toEqual({ '0_0': '42,5' });
    expect((k as { tablo: Record<string, unknown[]> }).tablo['1']).toHaveLength(1);
  });

  it('yalnız şartlı kabul şart ister (sunucu kuralı); öteki kararlarda gerekçe isteğe bağlı', () => {
    expect(kararEksigi('sartli_kabul', ' ')).toMatch(/şart/);
    expect(kararEksigi('sartli_kabul', 'Montajda seçilerek')).toBeNull();
    expect(kararEksigi('red', '')).toBeNull();
    expect(kararEksigi('hurda', '')).toBeNull();
    expect(kararEksigi('kabul', '')).toBeNull();
    expect(kararEksigi('rework', '')).toBeNull();
  });
});

describe('terminal formları', () => {
  it('yalnız "terminalde doldurulur" işaretli şablon listelenir; alanı olmayan eski şablon listelenmez (göçsüz geriye uyum)', async () => {
    const { result } = kanca(MUAYENECI, { tpl: [
      { _id: 't1', kod: 'KF-40', ad: 'Son kontrol', rev: '01', dsl: DSL, terminal: true },
      { _id: 't2', kod: 'KF-41', ad: 'Eski şablon', rev: '00', dsl: DSL },
    ] }, () => useTerminalFormlari());
    await waitFor(() => expect(result.current.formlar.map((f) => f.kod)).toEqual(['KF-40']));
    expect(result.current.yazabilir).toBe(true);
    expect(result.current.dolduran).toBe('Deneme Muayeneci');
  });
});

describe('terminal karar kuyruğu', () => {
  it('onay işlemi olmayan kişide liste boştur ve bekleyenler istenmez', async () => {
    const { result, fetch } = kanca(MUAYENECI, {}, () => useKaliteKuyrugu());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.onaylayabilir).toBe(false);
    expect(fetch.mock.calls.some(([a]) => String(a).includes('/bekleyenler'))).toBe(false);
  });

  it('hatalı parça kararı Bugün\'deki uca NCR numarası ve ciddiyetle gider', async () => {
    const { result, yazmalar } = kanca(MUHENDIS, { ncr: [{ _id: 'n1', no: `NCR-${String(new Date().getFullYear())}-0004` }] }, () => useKaliteKarari());
    const kayit = { id: 7 } as unknown as HataliBekleyeni;
    await waitFor(() => expect(result.current).toBeTruthy());
    await act(async () => { await result.current.hatali(kayit, { karar: 'sartli_kabul', ciddiyet: 'Majör', not: 'Montajda seçilerek' }).catch(() => undefined); });
    const y = yazmalar.find((x) => x.yol === '/kalite-merkezi/hatali/7/karar');
    expect(y?.govde).toMatchObject({ karar: 'sartli_kabul', ciddiyet: 'Majör', not: 'Montajda seçilerek' });
    expect(String((y?.govde as { ncrNo: string }).ncrNo)).toMatch(/^NCR-\d{4}-\d{4}$/);
  });

  it('ilk parça kararı iş emri adımıyla gider (2196-1 a)', async () => {
    const { result, yazmalar } = kanca(MUHENDIS, {}, () => useKaliteKarari());
    await act(async () => {
      await result.current.ilkParca({ uretimEmriId: 3, isEmriId: 11, emirNo: 'E', parcaNo: 'P', parcaAd: 'A', opNo: 20, adet: 5, kararBekleyenAdet: 1 }, 'onay');
    });
    expect(yazmalar.find((x) => x.yol === '/kalite-merkezi/ilk-parca/3/karar')?.govde).toEqual({ karar: 'onay', isEmriId: 11 });
  });
});
