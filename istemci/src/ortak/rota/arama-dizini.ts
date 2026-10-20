import { menudeGorunur, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { ikinciMenuyuSuz, type IkinciMenu } from './ikinci-menu.ts';

// Genel aramanın ilk adımı: sayfa ve ikinci menü maddeleri adla aranır, sunucuya gidilmez. Dizin kişinin gördüğü
// sayfalardan ve yetkisinin yettiği maddelerden kurulur; göremediği yer sonuçta çıkmaz.
export interface AramaSonucu {
  anahtar: string;
  baslik: string;
  // Maddenin sayfası; sayfanın kendisinde boş.
  ust: string | null;
  // Maddenin ikinci menüdeki grubu.
  grup: string | null;
  // Sayfanın kök maddesinin adı ("İş kutusu"): sayfa bu adla da bulunur, ayrı sonuç olarak çıkmaz.
  kokAdi: string | null;
  yol: string;
  simge: SimgeAdi;
}

export function aramaDizini(sayfalar: readonly Sayfa[], menuler: readonly IkinciMenu[], islemler: readonly string[]): AramaSonucu[] {
  const dizin: AramaSonucu[] = [];
  for (const s of sayfalar.filter(menudeGorunur)) {
    const tanim = menuler.find((m) => m.kok === s.yol);
    const menu = tanim === undefined ? null : ikinciMenuyuSuz(tanim, islemler);
    const maddeler = menu === null ? [] : menu.gruplar.flatMap((g) => g.maddeler.map((m) => ({ m, grup: g.baslik ?? null })));
    const kok = maddeler.find(({ m }) => m.yol === s.yol)?.m.baslik ?? null;
    dizin.push({ anahtar: s.yol, baslik: s.baslik, ust: null, grup: null, kokAdi: kok, yol: s.yol, simge: s.simge });
    for (const { m, grup } of maddeler) {
      if (m.yol === s.yol) continue;
      dizin.push({ anahtar: `${s.yol}#${m.anahtar}`, baslik: m.baslik, ust: s.baslik, grup, kokAdi: null, yol: m.yol, simge: m.simge });
    }
  }
  return dizin;
}

// Türkçe harfler ve büyük-küçük farkı yok sayılır: "cek" "Çek ve senet"i, "IS" "İş kutusu"nu bulur.
const HARF: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const sadelestir = (metin: string): string =>
  metin.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (h) => HARF[h] ?? h).replace(/\s+/g, ' ').trim();

const EN_COK_SONUC = 8;

// Her sözcük adda ya da sayfa adında geçmeli. Önce adı sözcükle başlayanlar, sonra sayfalar, sonra dizin sırası.
export function ara(dizin: readonly AramaSonucu[], sorgu: string): AramaSonucu[] {
  const sozcukler = sadelestir(sorgu).split(' ').filter((s) => s !== '');
  if (sozcukler.length === 0) return [];
  const puanli = dizin.flatMap((d, sira) => {
    const ad = sadelestir(d.baslik);
    const tum = [ad, d.ust, d.kokAdi].filter((p): p is string => p !== null).map(sadelestir).join(' ');
    if (!sozcukler.every((s) => tum.includes(s))) return [];
    const basta = ad.split(' ').some((p) => p.startsWith(sozcukler[0] ?? '')) ? 0 : 1;
    return [{ d, puan: basta * 2 + (d.ust === null ? 0 : 1), sira }];
  });
  return puanli.sort((a, b) => a.puan - b.puan || a.sira - b.sira).slice(0, EN_COK_SONUC).map((p) => p.d);
}
