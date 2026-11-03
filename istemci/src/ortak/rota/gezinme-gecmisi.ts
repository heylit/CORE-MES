import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { IKINCI_MENU_TANIMLARI, etkinMadde, menuMaddeleri, type IkinciMenu } from './ikinci-menu.ts';
import { rotaninSayfasi } from './sayfa.ts';

// Tarayıcının geçmişi tek kaynaktır: kabuk yalnız bu sekmede uygulamanın içinde atılan adımları sayar ki "Geri"
// uygulamanın dışına (giriş öncesine, başka siteye) gitmesin ve hedefin adı yazılabilsin.
export interface Adim {
  // Yönlendiricinin adım kimliği: tarayıcının geri ve ileri tuşunda hangi adıma dönüldüğü bununla bulunur.
  anahtar: string;
  yol: string;
}

export interface Gecmis {
  adimlar: readonly Adim[];
  konum: number;
}

export type GezinmeTuru = 'PUSH' | 'REPLACE' | 'POP';

// Yeni adres: eklenen adım ileri adımları siler, değiştirilen adım yerinde kalır. Geri ya da ileri dönülen adım
// listede yoksa (kabuktan önceki adım, silinmiş depo) sayım bu adımdan yeniden başlar: geri gidilecek yer bilinmez.
export function gecmisiIlerlet(g: Gecmis, tur: GezinmeTuru, adim: Adim): Gecmis {
  if (g.adimlar[g.konum]?.anahtar === adim.anahtar) {
    if (g.adimlar[g.konum]?.yol === adim.yol) return g;
    return { adimlar: g.adimlar.map((a, i) => (i === g.konum ? adim : a)), konum: g.konum };
  }
  if (tur === 'PUSH') return { adimlar: [...g.adimlar.slice(0, g.konum + 1), adim], konum: g.konum + 1 };
  if (tur === 'REPLACE') return { adimlar: g.adimlar.map((a, i) => (i === g.konum ? adim : a)), konum: g.konum };
  const bulunan = g.adimlar.findIndex((a) => a.anahtar === adim.anahtar);
  if (bulunan === -1) return { adimlar: [adim], konum: 0 };
  return { adimlar: g.adimlar.map((a, i) => (i === bulunan ? adim : a)), konum: bulunan };
}

// Kullanıcının okuyacağı ad: ikinci menü maddesi varsa "Sayfa › Madde", yoksa sayfa adı.
export function yerAdi(yol: string, menuler: readonly IkinciMenu[] = IKINCI_MENU_TANIMLARI): string {
  const yolAdi = yol.split(/[?#]/, 1)[0] ?? yol;
  if (yolAdi === '/') return 'Ana sayfa';
  const sayfaYolu = rotaninSayfasi(yolAdi);
  const sayfa = SAYFALAR.find((s) => s.yol === sayfaYolu);
  if (sayfa === undefined) return 'TMI CORE';
  const menu = menuler.find((m) => m.kok === sayfaYolu);
  const madde = menu === undefined ? null : etkinMadde(menuMaddeleri(menu), yolAdi);
  return madde === null ? sayfa.baslik : `${sayfa.baslik} › ${madde.baslik}`;
}

const SON_YER_SAYISI = 10;

// Geri yönde son yerler, en yakını başta; her biri kaç adım geride olduğuyla. Aynı yer üst üste yazılmaz.
export function sonYerler(g: Gecmis): { yol: string; adim: number }[] {
  const yerler: { yol: string; adim: number }[] = [];
  const simdiki = g.adimlar[g.konum]?.yol;
  for (let i = g.konum - 1; i >= 0 && yerler.length < SON_YER_SAYISI; i -= 1) {
    const yol = g.adimlar[i]?.yol;
    if (yol === undefined || yol === simdiki || yerler.some((y) => y.yol === yol)) continue;
    yerler.push({ yol, adim: i - g.konum });
  }
  return yerler;
}

// Sekme yeniden yüklenince sayım sürsün diye; depo kapalıysa yalnız bellekte kalır.
const DEPO_ANAHTARI = 'tmi:gezinme';
const EN_COK_ADIM = 100;

function depodanOku(): Gecmis | null {
  try {
    const ham = sessionStorage.getItem(DEPO_ANAHTARI);
    if (ham === null) return null;
    const g = JSON.parse(ham) as Partial<Gecmis>;
    if (!Array.isArray(g.adimlar) || typeof g.konum !== 'number') return null;
    const adimlar = g.adimlar.filter((a): a is Adim => typeof a?.anahtar === 'string' && typeof a.yol === 'string');
    return adimlar.length === g.adimlar.length && g.konum >= 0 && g.konum < adimlar.length ? { adimlar, konum: g.konum } : null;
  } catch { return null; }
}

function depoyaYaz(g: Gecmis) {
  // Çok uzun oturumda baştaki adımlar düşer; konum aynı adımı göstermeye devam eder.
  const fazla = Math.max(0, g.adimlar.length - EN_COK_ADIM);
  const kirpik = fazla === 0 ? g : { adimlar: g.adimlar.slice(fazla), konum: Math.max(0, g.konum - fazla) };
  try { sessionStorage.setItem(DEPO_ANAHTARI, JSON.stringify(kirpik)); } catch { /* depo kapalı olabilir; bellekte kalır */ }
}

export function useGezinmeGecmisi(): Gecmis {
  const konum = useLocation();
  const tur = useNavigationType();
  const adim: Adim = { anahtar: konum.key, yol: `${konum.pathname}${konum.search}` };
  const [gecmis, gecmisYaz] = useState<Gecmis>(() => {
    const kayitli = depodanOku();
    return kayitli === null ? { adimlar: [adim], konum: 0 } : gecmisiIlerlet(kayitli, 'POP', adim);
  });
  const ilk = useRef(true);

  useEffect(() => {
    if (ilk.current) { ilk.current = false; return; }
    gecmisYaz((g) => gecmisiIlerlet(g, tur, { anahtar: konum.key, yol: `${konum.pathname}${konum.search}` }));
  }, [konum.key, konum.pathname, konum.search, tur]);

  useEffect(() => { depoyaYaz(gecmis); }, [gecmis]);

  return gecmis;
}

// Çıkışta sayım silinir: aynı sekmede giren sonraki kişi öncekinin adımlarına dönemesin.
export function gecmisiSil() {
  try { sessionStorage.removeItem(DEPO_ANAHTARI); } catch { /* depo kapalı olabilir */ }
}
