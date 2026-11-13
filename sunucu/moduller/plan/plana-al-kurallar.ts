import type { BagTuru, TasimaYeri } from './tasima-kurallar.ts';

// Plana alma (3151): planda yeri olmayan emrin adımları sırayla yerleştirilir. İlk adım verilen tezgâhta, verilen saatten sonraki ilk boş
// yerde durur (kilitlenecek olan budur); öteki adımlar aday tezgâhlarından en erken bitirene, öncülünün arkasına oturur ve yalnız tahmindir:
// plan yeniden dizilince yerlerini motor verir. Başka emrin işi itilmez. Fason adımın süresini motor kurar; ondan sonrası hesaplanmaz ve
// bitiş bilinmez (null). Saf: takvim dışarıdan.

export interface PlanaAlAdimi { id: string; adaylar: readonly string[]; fas: boolean }
export interface PlanaAlGirdisi {
  // Emrin adımları rota sırasında.
  adimlar: readonly PlanaAlAdimi[];
  onculler: ReadonlyMap<string, readonly (readonly [string, BagTuru])[]>;
  // Tezgâhta dolu aralıklar: plandaki işler ve planı bekleyen kilitler.
  dolu: ReadonlyMap<string, readonly (readonly [number, number])[]>;
  simdi: number; ufuk: number; tasimaSaat: number;
  yer: (id: string, m: string, t: number) => TasimaYeri | null;
  saatMetni: (h: number) => string;
  tezgahAdi: (m: string) => string;
}
export interface PlanaAlSatiri { isId: string; tezgah: string; S: number; C: number }
export type PlanaAlSonucu =
  | { gecerli: true; ileti: string | null; isler: PlanaAlSatiri[]; bitis: number | null }
  | { gecerli: false; ileti: string; alan: 'emirId' | 'tezgah' | 'baslangic'; isler: []; bitis: null };

const E = 1e-6;
const ADIM = 0.25;
const red = (ileti: string, alan: 'emirId' | 'tezgah' | 'baslangic'): PlanaAlSonucu => ({ gecerli: false, ileti, alan, isler: [], bitis: null });

export function planaAlHesabi(g: PlanaAlGirdisi, tezgah: string, S0: number): PlanaAlSonucu {
  const ilk = g.adimlar[0];
  if (ilk === undefined) return red('Emrin rotasında adım yok; plana alınamaz.', 'emirId');
  if (ilk.fas) return red('Emrin ilk adımı fason; tezgâha alınamaz.', 'emirId');
  if (!ilk.adaylar.includes(tezgah)) return red(`${g.tezgahAdi(tezgah)} bu emrin ilk adımını yapamaz.`, 'tezgah');
  if (S0 < g.simdi - E) return red('Emir geçmiş bir saate alınamaz.', 'baslangic');
  const yerler = new Map<string, TasimaYeri & { m: string }>();
  const carpan = (m: string, y: TasimaYeri): number | null => {
    let son: number | null = null;
    for (const [a, b] of g.dolu.get(m) ?? []) if (a < y.C - E && b > y.S + E) son = Math.max(son ?? b, b);
    for (const q of yerler.values()) if (q.m === m && q.S < y.C - E && q.C > y.S + E) son = Math.max(son ?? q.C, q.C);
    return son;
  };
  // t'den sonra tezgâhtaki ilk boş yer; örtülü bağda öncülden önce bitmeyecek kadar geç başlar. Tezgâh uygun değilse ya da ufka sığmazsa null.
  const bosYer = (id: string, m: string, t: number, bitSiniri: number): TasimaYeri | null => {
    for (let n = 0; n < 2000; n++) {
      const y = g.yer(id, m, t);
      if (y === null || y.C > g.ufuk + E) return null;
      if (y.C < bitSiniri - E) { t = Math.max(t + ADIM, y.S + (bitSiniri - y.C)); continue; }
      const c = carpan(m, y);
      if (c === null) return y;
      t = Math.max(c, t + E);
    }
    return null;
  };
  let tam = true;
  for (const a of g.adimlar) {
    if (a.fas) { tam = false; break; }
    let bas = g.simdi, bit = Number.NEGATIVE_INFINITY;
    for (const [p, ty] of g.onculler.get(a.id) ?? []) {
      const q = yerler.get(p);
      if (q === undefined) continue;
      bas = Math.max(bas, (ty === 'o' ? q.lot1 : q.C) + g.tasimaSaat);
      if (ty === 'o') bit = Math.max(bit, q.C + g.tasimaSaat);
    }
    if (a === ilk) {
      const y = bosYer(a.id, tezgah, Math.max(S0, bas), bit);
      if (y === null) return red(`Emir ${g.tezgahAdi(tezgah)} tezgâhında planlama ufkuna sığmıyor.`, 'baslangic');
      yerler.set(a.id, { ...y, m: tezgah });
      continue;
    }
    let en: (TasimaYeri & { m: string }) | null = null;
    for (const m of a.adaylar) { const y = bosYer(a.id, m, bas, bit); if (y !== null && (en === null || y.C < en.C - E)) en = { ...y, m }; }
    // Sonraki adım ufka sığmıyorsa emir yine alınır: yerini motor arar, bitiş bilinmez.
    if (en === null) { tam = false; break; }
    yerler.set(a.id, en);
  }
  const isler = [...yerler].map(([isId, y]) => ({ isId, tezgah: y.m, S: y.S, C: y.C }));
  const y0 = yerler.get(ilk.id)!;
  const notlar: string[] = [];
  if (y0.S > S0 + E) notlar.push(`İlk adım ${g.saatMetni(y0.S)} saatine oturur`);
  if (!tam) notlar.push('bitişi plan dizilince belli olur');
  return { gecerli: true, ileti: notlar.length > 0 ? `${notlar.join('; ')}.` : null, isler, bitis: tam ? Math.max(...isler.map((i) => i.C)) : null };
}
