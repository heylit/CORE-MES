import { useEffect, useRef } from 'react';

// 1337 a: el okuyucu klavye gibi yazar ve Enter ile bitirir. Terminal kod alanı odakta olmasa da onu dinler; dokunmatik ekranda
// odaksız kalan alana yazılan okutma kaybolmasın. Okuyucuyu insan yazısından ayıran hızdır: tuşlar arası kısa, kod en az üç karakter.
export const TUS_ARALIGI_MS = 60;
export const EN_KISA_KOD = 3;

export interface OkuyucuDurumu { metin: string; son: number }
export const OKUYUCU_BASI: OkuyucuDurumu = { metin: '', son: 0 };

// Saf: bir tuşu ekler. Enter geldiğinde biriken hızlı yazı kod olarak döner; yavaş yazı ve kısa metin yok sayılır.
export function tusEkle(d: OkuyucuDurumu, tus: string, zaman: number): { durum: OkuyucuDurumu; kod: string | null } {
  const hizli = d.metin !== '' && zaman - d.son <= TUS_ARALIGI_MS;
  if (tus === 'Enter') return { durum: OKUYUCU_BASI, kod: hizli && d.metin.length >= EN_KISA_KOD ? d.metin : null };
  if (tus.length !== 1) return { durum: OKUYUCU_BASI, kod: null };
  return { durum: { metin: hizli ? d.metin + tus : tus, son: zaman }, kod: null };
}

// Terminalin anladığı tek okutma refakat kartıdır (RP:<kimlik>); malzeme ve lot üst çubuktaki Malzeme · Teslim panelinde okutulur.
// Önek ve biçim paylasilan/kod-sozlugu.ts ile aynıdır (test eşliği sabitler); sözlük istemciye değer olarak ithal edilmez.
export type TerminalOkutmasi = { tur: 'kart'; kartId: number } | { tur: 'baska'; kod: string };
export function terminalOkutmasi(ham: string): TerminalOkutmasi {
  const k = /^RP:(\d{1,9})$/.exec(ham.replace(/\s+/g, '').toUpperCase());
  return k ? { tur: 'kart', kartId: Number(k[1]) } : { tur: 'baska', kod: ham.trim() };
}
export const KART_DEGIL_ILETISI = 'Refakat kartı değil; malzeme ve lot üst çubuktaki Malzeme · Teslim panelinde okutulur';
export const KART_YOK_ILETISI = 'Bu kart bu istasyondaki işlerin kartı değil';

const yaziAlani = (h: EventTarget | null): boolean =>
  h instanceof HTMLElement && (h.isContentEditable || h.tagName === 'INPUT' || h.tagName === 'TEXTAREA' || h.tagName === 'SELECT');

// Yazı alanındaki tuşlar alanındır (pencere içi kod alanı kendi okuyucusudur). Yakalama aşamasında dinlenir: odaktaki düğme
// okutmanın Enter'ıyla tıklanmasın.
export function useElOkuyucu(etkin: boolean, okundu: (kod: string) => void): void {
  const durum = useRef(OKUYUCU_BASI);
  const okunduRef = useRef(okundu);
  okunduRef.current = okundu;
  useEffect(() => {
    if (!etkin) return undefined;
    const f = (o: KeyboardEvent) => {
      if (o.ctrlKey || o.altKey || o.metaKey || yaziAlani(o.target)) { durum.current = OKUYUCU_BASI; return; }
      const r = tusEkle(durum.current, o.key, o.timeStamp);
      durum.current = r.durum;
      if (r.kod === null) return;
      o.preventDefault();
      o.stopPropagation();
      okunduRef.current(r.kod);
    };
    window.addEventListener('keydown', f, true);
    return () => { window.removeEventListener('keydown', f, true); durum.current = OKUYUCU_BASI; };
  }, [etkin]);
}
