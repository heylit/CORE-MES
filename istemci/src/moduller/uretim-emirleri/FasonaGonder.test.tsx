import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SiradakiFasonCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { FasonaGonder } from './FasonaGonder.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const FASON = {
  uretimEmriId: 3, emirNo: 'EM-3', isEmriId: 31, opNo: 20, ad: 'Deneme kaplama', firma: 'Deneme Fason',
  gonderilen: 2, donenSaglam: 0, donenHurda: 0, gonderilebilir: 9,
} satisfies NonNullable<SiradakiFasonCevabi['fason']>;
const FASONCU = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'uretim-emirleri.fason' as const] };
const ekran = [{ yol: '/', ekran: () => <FasonaGonder uretimEmriId={3} /> }];
const siradaki = (fason: SiradakiFasonCevabi['fason']) => ({ 'GET /adimli-emirler/3/siradaki-fason': () => json(200, { fason } satisfies SiradakiFasonCevabi) });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Fasona gönder bölümü', () => {
  it('fason yetkisi olmayan kişide bölüm görünmez ve uç sorulmaz', async () => {
    const istekler = sunucuKur(OKUYUCU, siradaki(FASON));
    ac(ekran, '/');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(screen.queryByRole('button', { name: 'Fasona gönder' })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/adimli-emirler/'))).toBe(false);
  });

  it('kalan adet önerilir; gidiş tekrar korumalı komutla gönderilen adetle yazılır', async () => {
    const istekler = sunucuKur(FASONCU, { ...siradaki(FASON), 'POST /adimli-emirler/3/is-emirleri/31/fason-gidis': () => json(200, { hareketId: 1 }) });
    ac(ekran, '/');
    const girdi = await screen.findByLabelText<HTMLInputElement>(/Gönderilen adet/);
    expect(girdi.value).toBe('7');
    fireEvent.change(girdi, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fasona gönder' }));
    expect((await screen.findByRole('status')).textContent).toBe('EM-3: 4 adet fasona gönderildi.');
    const gidis = istekler.find((i) => i.yontem === 'POST');
    expect(gidis?.govde).toEqual({ adet: 4 });
    expect(gidis?.kimlik).toBeTruthy();
  });

  it('sunucunun reddi iletisiyle gösterilir; sıfır adet gönderilmez', async () => {
    const istekler = sunucuKur(FASONCU, {
      ...siradaki(FASON),
      'POST /adimli-emirler/3/is-emirleri/31/fason-gidis': () => json(409, { kod: 'CAKISMA', mesaj: 'Gönderilen adet adıma girenden fazla.' }),
    });
    ac(ekran, '/');
    const girdi = await screen.findByLabelText(/Gönderilen adet/);
    fireEvent.change(girdi, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fasona gönder' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/sıfırdan büyük/);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.change(girdi, { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fasona gönder' }));
    expect(await screen.findByText('Gönderilen adet adıma girenden fazla.')).toBeTruthy();
  });

  it('sıradaki adım fason değilse gönderim formu çıkmaz', async () => {
    sunucuKur(FASONCU, siradaki(null));
    ac(ekran, '/');
    expect(await screen.findByText('Bu emrin sıradaki adımı fason değil.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fasona gönder' })).toBeNull();
  });
});
