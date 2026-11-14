import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import type { OlayTuru } from './akislar.ts';
import { KayitCekmecesi } from './KayitFormu.tsx';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { json, sunucuKur, YAZAN } from './test-ortak.tsx';
import { finansiKur } from './veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const finans = finansiKur(ornekHamVeri(), '2026-10-15');

function Cekmece({ ilkTur = null }: { ilkTur?: OlayTuru | null }) {
  const [tur, turYaz] = useState<OlayTuru | null>(ilkTur);
  const [acik, acikYaz] = useState(true);
  return <KayitCekmecesi acik={acik} tur={tur} finans={finans} kapat={() => acikYaz(false)} sec={turYaz} />;
}
function ac(ilkTur: OlayTuru | null = null) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Cekmece ilkTur={ilkTur} /></BildirimSaglayici></QueryClientProvider>);
  return screen.getByRole('dialog');
}

describe('KayitCekmecesi', () => {
  it('olay seçilince form gelir, "Olay seç" seçiciye döner', () => {
    fireEvent.click(within(ac()).getByRole('button', { name: /Banka \/ kasa bakiyemi düzelt/ }));
    const form = screen.getByRole('dialog');
    expect(within(form).getByRole('form', { name: 'Banka / kasa bakiyemi düzelt' })).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Olay seç' }));
    expect(within(screen.getByRole('dialog')).getByRole('group', { name: 'Ne oldu?' })).toBeTruthy();
  });

  it('bakiye eşitleme hesabın eşitleme ucuna gider, pencere kapanır', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/hesaplar/1/esitle': () => json(200, {}) });
    const p = ac('banka');
    fireEvent.change(within(p).getByLabelText(/^Hesap/), { target: { value: '1' } });
    fireEvent.change(within(p).getByLabelText(/gerçek bakiyesi/), { target: { value: '150100' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Bakiyeyi eşitle' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/finans/hesaplar/1/esitle', govde: { tarih: '2026-10-15', gercekBakiye: 150100 } },
    ]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sunucunun alan hatası ilgili alanın altına düşer, pencere açık kalır', async () => {
    sunucuKur(YAZAN, { 'POST /finans/virmanlar/ekle': () => json(400, { kod: 'GECERSIZ', mesaj: 'Tutar sıfırdan büyük olmalı.', alan: 'tutar' }) });
    const p = ac('virman');
    fireEvent.change(within(p).getByLabelText(/Çıkan hesap/), { target: { value: '1' } });
    fireEvent.change(within(p).getByLabelText(/Giren hesap/), { target: { value: '2' } });
    fireEvent.change(within(p).getByLabelText(/^Tutar/), { target: { value: '5' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Aktarımı kaydet' }));
    await within(p).findByText('Tutar sıfırdan büyük olmalı.');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  const cekDugmeleriOku = (p: HTMLElement) => {
    const satirlar = within(p).getAllByText(/vade/).map((e) => e.closest('.tc-fy-cek') as HTMLElement);
    return { satirlar, dugmeler: satirlar.map((s) => within(s).getAllByRole('button').map((b) => b.textContent)) };
  };

  it('çekin durumu: finans.cek-yonet olana portföydeki çekte "Karşılıksız çıktı" da görünür', async () => {
    // 3165 a: yalnız çek eylemi (öteki yedi yönetim eylemi yok).
    sunucuKur({ ...YAZAN, id: 31, islemler: [...YAZAN.islemler, 'finans.cek-yonet'] });
    const p = ac('cekdurum');
    await waitFor(() => expect(cekDugmeleriOku(p).dugmeler).toContainEqual(['Bankaya tahsile verdim', 'Tahsil edildi', 'Ciro ettim', 'Karşılıksız çıktı']));
  });

  it('3165 a: çek eylemi dışındaki yedi yönetim eylemi "Karşılıksız çıktı" düğmesini açmaz', async () => {
    const yedi = ['finans.iptal', 'finans.hesap-yonet', 'finans.oran-yaz', 'finans.sabit-kiymet', 'finans.maliyet-yaz', 'finans.duzenli-odeme', 'finans.ayar'] as const;
    const istekler = sunucuKur({ ...YAZAN, id: 32, islemler: [...YAZAN.islemler, ...yedi] });
    const p = ac('cekdurum');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    await new Promise((r) => setTimeout(r, 40));
    expect(cekDugmeleriOku(p).dugmeler).toContainEqual(['Bankaya tahsile verdim', 'Tahsil edildi', 'Ciro ettim']);
    expect(cekDugmeleriOku(p).dugmeler.flat()).not.toContain('Karşılıksız çıktı');
  });

  it('çekin durumu: yalnız yazana üç düğme (karşılıksız uç finans.cek-yonet ister), verilende "Ödendi"; tahsile verme doğrudan gider', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/cekler/1/tahsile-ver': () => json(200, {}) });
    const p = ac('cekdurum');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    const { satirlar, dugmeler } = cekDugmeleriOku(p);
    expect(dugmeler).toContainEqual(['Bankaya tahsile verdim', 'Tahsil edildi', 'Ciro ettim']);
    expect(dugmeler.flat()).not.toContain('Karşılıksız çıktı');
    expect(dugmeler).toContainEqual(['Ödendi']);
    const portfoy = satirlar.find((s) => within(s).queryByRole('button', { name: 'Bankaya tahsile verdim' }) && s.textContent?.includes('5.000'))!;
    fireEvent.click(within(portfoy).getByRole('button', { name: 'Bankaya tahsile verdim' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/finans/cekler/1/tahsile-ver', govde: { surum: 1 } },
    ]));
  });

  // 2132-3 teyit: vade varsayılanı firmanın vadesidir; vadesi yoksa peşin. Kullanıcının seçimi korunur.
  const firmaCevabi = (vadeGunu: number | null) => () => json(200, { firma: { id: 1, vadeGunu }, adresler: [] });
  const firmaSec = (p: HTMLElement) => fireEvent.change(within(p).getByLabelText(/^Müşteri/), { target: { value: finans.V.etiket.get(1) } });
  const secili = (p: HTMLElement) => within(within(p).getByRole('group', { name: 'Para ne zaman geliyor?' })).getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent;

  it('2132-3: satışta firma seçilince vade firmanın vade günüyle dolar; fatura tarihi değişince kayar', async () => {
    sunucuKur(YAZAN, { 'GET /musteri-tedarikci/firmalar/1': firmaCevabi(45) });
    const p = ac('satis');
    fireEvent.change(within(p).getByLabelText(/^Fatura tarihi/), { target: { value: '2026-10-01' } });
    firmaSec(p);
    await waitFor(() => expect((within(p).getByLabelText(/^Vade tarihi/) as HTMLInputElement).value).toBe('2026-11-15'));
    expect(secili(p)).toBe('Vadeli, sonra gelecek');
    fireEvent.change(within(p).getByLabelText(/^Fatura tarihi/), { target: { value: '2026-10-10' } });
    await waitFor(() => expect((within(p).getByLabelText(/^Vade tarihi/) as HTMLInputElement).value).toBe('2026-11-24'));
  });

  it('2132-3: firmanın vadesi yoksa ödeme şekli peşin gelir; kullanıcı değiştirince varsayılan geri yazılmaz', async () => {
    sunucuKur(YAZAN, { 'GET /musteri-tedarikci/firmalar/1': firmaCevabi(null) });
    const p = ac('satis');
    firmaSec(p);
    await waitFor(() => expect(secili(p)).toBe('Peşin, para geldi'));
    fireEvent.click(within(p).getByRole('button', { name: 'Vadeli, sonra gelecek' }));
    fireEvent.change(within(p).getByLabelText(/^Vade tarihi/), { target: { value: '2026-12-31' } });
    fireEvent.change(within(p).getByLabelText(/^Fatura tarihi/), { target: { value: '2026-10-12' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(secili(p)).toBe('Vadeli, sonra gelecek');
    expect((within(p).getByLabelText(/^Vade tarihi/) as HTMLInputElement).value).toBe('2026-12-31');
  });

  it('2132-3: firma kartı okunamazsa (yetki yok) form eski varsayılanla kalır: vadeli, bugün + 30', async () => {
    sunucuKur(YAZAN, { 'GET /musteri-tedarikci/firmalar/1': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }) });
    const p = ac('satis');
    firmaSec(p);
    await new Promise((r) => setTimeout(r, 20));
    expect(secili(p)).toBe('Vadeli, sonra gelecek');
    expect((within(p).getByLabelText(/^Vade tarihi/) as HTMLInputElement).value).toBe('2026-11-14');
  });
});
