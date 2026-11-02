import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { useBildirim } from '../arayuz/Bildirim.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { api, hataIletisi } from './api.ts';
import { karsilamaSifirla } from './karsilama.ts';
import { cikisKancalariniCalistir, type Kullanici } from './oturum.ts';

// 1898 a: istasyonda oturum açıkken başka kişinin kartı okutulunca kişi hemen değişir. Yarım form ve açık pencere kaybolur (kabul
// edildi); kayıtlar yanlış kişinin adına düşmesin diye. Kartı klavye gibi yazan okuyucuyu insan yazısından ayıran hızdır.
export const TUS_ARALIGI_MS = 60;
export const EN_KISA_KART = 4;

// Kart numarası sunucunun kuralıyla aynı biçimdedir (rakam ve A-F). Okuyucu aynı zamanda malzeme barkodu da okutabilir: geçerli denetim
// haneli 12-14 haneli EAN/UPC/GTIN kart sayılmaz. 8 haneli EAN dışarıda bırakılmaz; 8 haneli kart numaraları yaygın.
const KART_BICIMI = /^[0-9A-F]{4,32}$/;
function gtinMi(k: string): boolean {
  if (!/^\d{12,14}$/.test(k)) return false;
  const rakam = [...k].map(Number);
  const denetim = rakam.pop() ?? -1;
  const toplam = rakam.reverse().reduce((t, r, i) => t + r * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (toplam % 10)) % 10 === denetim;
}
export function kartNumarasiGibi(ham: string): boolean {
  const k = ham.replace(/\s+/g, '').toUpperCase();
  return KART_BICIMI.test(k) && !gtinMi(k);
}

const DEGISTIRICI = new Set(['Shift', 'CapsLock', 'AltGraph']);

export interface OkuyucuDurumu { metin: string; son: number }
export const OKUYUCU_BASI: OkuyucuDurumu = { metin: '', son: 0 };

// Saf: bir tuşu ekler; Enter'da biriken hızlı yazı kart biçimindeyse döner.
export function kartTusu(d: OkuyucuDurumu, tus: string, zaman: number): { durum: OkuyucuDurumu; kart: string | null } {
  const hizli = d.metin !== '' && zaman - d.son <= TUS_ARALIGI_MS;
  if (tus === 'Enter') {
    const kart = hizli && d.metin.length >= EN_KISA_KART && kartNumarasiGibi(d.metin) ? d.metin : null;
    return { durum: OKUYUCU_BASI, kart };
  }
  // Okuyucu büyük harf için Shift basar (A-F); değiştirici tuş biriktirileni silmez, karakter getirmez.
  if (DEGISTIRICI.has(tus)) return { durum: d, kart: null };
  if (tus.length !== 1) return { durum: OKUYUCU_BASI, kart: null };
  return { durum: { metin: hizli ? d.metin + tus : tus, son: zaman }, kart: null };
}

// Kanca yönlendiricinin dışında (App) durur: ana sayfaya tarayıcı geçmişiyle dönülür, yönlendirici popstate ile izler. Yeni kişi
// öncekinin açık sayfasında kalmasın.
function anaSayfayaDon(): void {
  if (window.location.pathname === '/') return;
  window.history.pushState(null, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const yaziAlani = (h: EventTarget | null): boolean =>
  h instanceof HTMLElement && (h.isContentEditable || h.tagName === 'INPUT' || h.tagName === 'TEXTAREA' || h.tagName === 'SELECT');

// Kabarcık aşamasında dinlenir: kendi okutmasını yakalayan ekran (Arkon terminali, okut penceresi) Enter'ı durdurursa buraya gelmez.
export function useKartlaKisiDegistir(etkin: boolean): void {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const durum = useRef(OKUYUCU_BASI);
  const bekliyor = useRef(false);
  const baglam = useRef({ istemci, bildir });
  baglam.current = { istemci, bildir };

  useEffect(() => {
    if (!etkin) return undefined;
    const degistir = async (kart: string) => {
      const { istemci: q, bildir: haber } = baglam.current;
      const onceki = q.getQueryData<Kullanici | null>(anahtarlar.oturum) ?? null;
      bekliyor.current = true;
      try {
        const { kullanici } = await api.post<OturumCevabi>('/oturum/kart-giris', { kart }, { oturumBitirmez: true });
        if (kullanici === null || kullanici.id === onceki?.id) return;
        cikisKancalariniCalistir();
        karsilamaSifirla();
        q.clear();
        q.setQueryData(anahtarlar.oturum, kullanici);
        anaSayfayaDon();
        haber('bilgi', onceki ? `${onceki.ad} çıktı, ${kullanici.ad} girdi.` : `${kullanici.ad} girdi.`);
      } catch (hata) {
        haber('hata', hataIletisi(hata, 'Kart okunamadı.'));
      } finally {
        bekliyor.current = false;
      }
    };
    const tus = (o: KeyboardEvent) => {
      if (o.ctrlKey || o.altKey || o.metaKey || yaziAlani(o.target)) { durum.current = OKUYUCU_BASI; return; }
      const r = kartTusu(durum.current, o.key, o.timeStamp);
      durum.current = r.durum;
      if (r.kart === null || bekliyor.current || o.defaultPrevented) return;
      o.preventDefault();
      void degistir(r.kart.toUpperCase());
    };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); durum.current = OKUYUCU_BASI; };
  }, [etkin]);
}
