import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { EN_KISA_KOD, OKUYUCU_BASI, TUS_ARALIGI_MS, terminalOkutmasi, tusEkle, useElOkuyucu, type OkuyucuDurumu } from './el-okuyucu.ts';

afterEach(cleanup);

const yaz = (metin: string, aralik: number, bas = 1000): string | null => {
  let d: OkuyucuDurumu = OKUYUCU_BASI;
  let t = bas;
  for (const c of [...metin, 'Enter']) {
    const r = tusEkle(d, c, t);
    d = r.durum;
    t += aralik;
    if (r.kod !== null) return r.kod;
  }
  return null;
};

describe('1337 a el okuyucu', () => {
  it('hızlı yazılıp Enter ile biten metin koddur', () => {
    expect(yaz('RP:37', 10)).toBe('RP:37');
  });
  it('insan hızındaki yazı ve kısa metin kod sayılmaz (reddedilen)', () => {
    expect(yaz('RP:37', TUS_ARALIGI_MS + 40)).toBeNull();
    expect(yaz('R'.repeat(EN_KISA_KOD - 1), 10)).toBeNull();
    expect(tusEkle(OKUYUCU_BASI, 'Enter', 5).kod).toBeNull();
  });
  it('yavaş başlangıç sonrası hızlı okutma yalnız okutulanı verir; özel tuş biriktirileni siler', () => {
    let d = tusEkle(OKUYUCU_BASI, 'x', 0).durum;
    for (const [i, c] of [...'RP:5'].entries()) d = tusEkle(d, c, 500 + i * 5).durum;
    expect(tusEkle(d, 'Enter', 520).kod).toBe('RP:5');
    const s = tusEkle(tusEkle(tusEkle(OKUYUCU_BASI, 'R', 0).durum, 'P', 5).durum, 'Shift', 8).durum;
    expect(s).toEqual(OKUYUCU_BASI);
  });
  it('terminal yalnız refakat kartını tanır', () => {
    expect(terminalOkutmasi('rp:42')).toEqual({ tur: 'kart', kartId: 42 });
    expect(terminalOkutmasi('LOT:LT-9')).toEqual({ tur: 'baska', kod: 'LOT:LT-9' });
    // paylasilan/kod-sozlugu.test.ts ile aynı girdiler: boşluk ve küçük harf kart sayılır, bozuk gövde sayılmaz.
    expect(terminalOkutmasi(' rp : 7 ')).toEqual({ tur: 'kart', kartId: 7 });
    for (const ham of ['RP:abc', 'RP:', 'RP-12', 'RP:-3', 'RP:12a', 'UE:4', 'RP:1234567890']) expect(terminalOkutmasi(ham).tur).toBe('baska');
  });
});

function Deneme({ etkin, okundu }: { etkin: boolean; okundu: (k: string) => void }) {
  useElOkuyucu(etkin, okundu);
  return <><input aria-label="alan" /><button type="button">dugme</button></>;
}
const okut = (hedef: Element, metin: string) => { for (const c of [...metin, 'Enter']) fireEvent.keyDown(hedef, { key: c }); };

describe('useElOkuyucu', () => {
  it('odak düğmedeyken okutmayı alır; Enter düğmeyi tıklamaz', () => {
    const okundu = vi.fn();
    const tikla = vi.fn();
    const { getByRole } = render(<Deneme etkin okundu={okundu} />);
    const d = getByRole('button');
    d.addEventListener('keydown', tikla);
    d.focus();
    okut(d, 'RP:7');
    expect(okundu).toHaveBeenCalledWith('RP:7');
    expect(tikla).toHaveBeenCalledTimes(4);
  });
  it('yazı alanındaki tuşlar alanındır; kapalıyken dinlemez (reddedilen)', () => {
    const okundu = vi.fn();
    const { getByRole, rerender } = render(<Deneme etkin okundu={okundu} />);
    okut(getByRole('textbox'), 'RP:7');
    expect(okundu).not.toHaveBeenCalled();
    rerender(<Deneme etkin={false} okundu={okundu} />);
    okut(document.body, 'RP:7');
    expect(okundu).not.toHaveBeenCalled();
  });
});
