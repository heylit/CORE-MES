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
// 3229 a: ilk adımdan sonraki adım için kullanıcının seçtiği tezgâh ve / veya en erken saat.
export interface PlanaAlSecimi { isId: string; tezgah?: string | undefined; baslangic?: number | undefined }
type Alan = 'emirId' | 'tezgah' | 'baslangic' | 'adimlar';
// kilit: kilitlenecek adımlar (ilk adım ve seçilenler); `isler` içindeki yerleriyle.
export type PlanaAlSonucu =
  | { gecerli: true; ileti: string | null; isler: PlanaAlSatiri[]; bitis: number | null; kilit: string[] }
  | { gecerli: false; ileti: string; alan: Alan; isler: []; bitis: null };

const E = 1e-6;
const ADIM = 0.25;
const red = (ileti: string, alan: Alan): PlanaAlSonucu => ({ gecerli: false, ileti, alan, isler: [], bitis: null });

export function planaAlHesabi(g: PlanaAlGirdisi, tezgah: string, S0: number, secimler: readonly PlanaAlSecimi[] = []): PlanaAlSonucu {
  const ilk = g.adimlar[0];
  if (ilk === undefined) return red('Emrin rotasında adım yok; plana alınamaz.', 'emirId');
  if (ilk.fas) return red('Emrin ilk adımı fason; tezgâha alınamaz.', 'emirId');
  if (!ilk.adaylar.includes(tezgah)) return red(`${g.tezgahAdi(tezgah)} bu emrin ilk adımını yapamaz.`, 'tezgah');
  if (S0 < g.simdi - E) return red('Emir geçmiş bir saate alınamaz.', 'baslangic');
  const secim = new Map<string, PlanaAlSecimi>();
  for (const s of secimler) {
    const k = g.adimlar.findIndex((a) => a.id === s.isId), a = g.adimlar[k];
    if (a === undefined) return red('Seçilen adım bu emrin rotasında yok.', 'adimlar');
    if (secim.has(s.isId)) return red('Aynı adım iki kez verilemez.', 'adimlar');
    if (k === 0) return red('İlk adımın tezgâhı ve saati ayrıca verilir.', 'adimlar');
    if (a.fas) return red(`${String(k + 1)}. adım fason; tezgâha alınamaz.`, 'adimlar');
    if (s.tezgah !== undefined && !a.adaylar.includes(s.tezgah)) return red(`${g.tezgahAdi(s.tezgah)} bu emrin ${String(k + 1)}. adımını yapamaz.`, 'adimlar');
    if (s.baslangic !== undefined && s.baslangic < g.simdi - E) return red(`${String(k + 1)}. adım geçmiş bir saate alınamaz.`, 'adimlar');
    secim.set(s.isId, s);
  }
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
    const s = secim.get(a.id);
    let en: (TasimaYeri & { m: string }) | null = null;
    for (const m of s?.tezgah === undefined ? a.adaylar : [s.tezgah]) { const y = bosYer(a.id, m, Math.max(bas, s?.baslangic ?? bas), bit); if (y !== null && (en === null || y.C < en.C - E)) en = { ...y, m }; }
    // Seçilen adım ufka sığmıyorsa komut reddedilir (kilitlenecek yer yok). Seçilmeyen sığmıyorsa emir yine alınır: yerini motor arar, bitiş bilinmez.
    if (en === null && s !== undefined) return red(`${String(g.adimlar.indexOf(a) + 1)}. adım seçilen yerde planlama ufkuna sığmıyor.`, 'adimlar');
    if (en === null) { tam = false; break; }
    yerler.set(a.id, en);
  }
  // Fason ya da ufka sığmayan adımdan sonrası hesaplanmaz; orada seçim varsa kilitlenecek yer bilinmez.
  const yersiz = g.adimlar.findIndex((a) => secim.has(a.id) && !yerler.has(a.id));
  if (yersiz >= 0) return red(`${String(yersiz + 1)}. adımın yeri önceki adım yüzünden hesaplanamıyor; o adımı sisteme bırakın.`, 'adimlar');
  const isler = [...yerler].map(([isId, y]) => ({ isId, tezgah: y.m, S: y.S, C: y.C }));
  const y0 = yerler.get(ilk.id)!;
  const notlar: string[] = [];
  if (y0.S > S0 + E) notlar.push(`İlk adım ${g.saatMetni(y0.S)} saatine oturur`);
  if (!tam) notlar.push('bitişi plan dizilince belli olur');
  return { gecerli: true, ileti: notlar.length > 0 ? `${notlar.join('; ')}.` : null, isler, bitis: tam ? Math.max(...isler.map((i) => i.C)) : null, kilit: [ilk.id, ...secim.keys()] };
}
