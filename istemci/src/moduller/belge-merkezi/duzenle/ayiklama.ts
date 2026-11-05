// Temizlenen alandaki nesneleri PDF içerik akışından çıkarır (kart 2123b, karar 2123-5 c). Saf: bayt alır, bayt verir;
// yazı tipi ve dış nesne bilgisi çağırandan gelir (ayiklama-pdf.ts). Kural:
// - Yazı harf harf ele alınır: alana değen harf silinir, yerine aynı genişlikte boşluk konur; satırın kalanı yerinde kalır.
//   Harf genişliği bilinmeyen yazı tipinde alana değen gösterimin tamamı silinir; aynı satırda arkasından yazı gelirse
//   yeri korunamayacağı için iş durur (sessizce bozuk sayfa üretilmez).
// - Resim (Do, satır içi BI) kapladığı yerin en az yarısı alandaysa silinir; daha azıysa (ör. bütün sayfayı kaplayan tarama)
//   yalnız örtülür ve sayılır.
// - Çizim yolu yalnız bütün noktaları alanın içindeyse silinir; alandan geçip dışarı uzanan çizgi (çerçeve) kalır.
//   Kırpma yolu ve gölgelendirme dokunulmaz.
// - İçinde silme olan işaretli içeriğin (BDC) özellikleri düşer, etiketi BMC olarak kalır: ActualText, Alt ve E silinen yazının
//   kopyasını taşıyabilir. İsteğe bağlı içerik (OC, katman) dokunulmaz; düşerse gizli katman görünür olur.

export type Matris = [number, number, number, number, number, number];
export interface Alan { x: number; y: number; en: number; boy: number }

export interface YaziTipi {
  // Kod başına bayt: Identity-H/V gibi CID yazı tiplerinde 2, öbürlerinde 1.
  ikiBayt: boolean;
  // Kodun genişliği, yazı boyunun katı olarak (1000 birim = 1). Bilinmiyorsa null.
  genislik(kod: number): number | null;
}

export type DisNesne =
  | { tur: 'resim' }
  // Değişen form yeni nesne olarak yazılır (aynı form sayfada başka yerde değişmeden kullanılabilir); dönen ad içerikte kullanılır.
  | { tur: 'form'; matris: Matris; icerik: Uint8Array; kaynaklar: Kaynaklar; yaz: (sonuc: AyiklamaSonucu) => string }
  | { tur: 'diger' };

export interface Kaynaklar {
  yaziTipi(ad: string): YaziTipi | null;
  disNesne(ad: string): DisNesne | null;
}

// yazi: harfi silinen gösterim; ortulenResim: alana değen ama silinmeyen (çoğu dışarıda) resim.
export interface Sayac { yazi: number; resim: number; cizim: number; ortulenResim: number }

export class AyiklamaHatasi extends Error {}

const BIRIM: Matris = [1, 0, 0, 1, 0, 0];
export function carp(m: Matris, n: Matris): Matris {
  return [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}
const uygula = (m: Matris, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// ---- Belirteçler ----
type Belirtec =
  | { t: 'sayi'; v: number }
  | { t: 'ad'; v: string }
  | { t: 'metin'; v: number[] }
  | { t: 'dizi'; v: Belirtec[] }
  | { t: 'sozluk' }
  | { t: 'anahtar'; v: string };

export interface Islem { op: string; arg: Belirtec[]; bas: number; son: number }

const BOSLUK = new Set([0, 9, 10, 12, 13, 32]);
const AYRAC = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

export function islemler(v: Uint8Array): Islem[] {
  let i = 0;
  const n = v.length;
  const sonuc: Islem[] = [];
  const bosAtla = () => {
    for (;;) {
      while (i < n && BOSLUK.has(v[i]!)) i++;
      if (i < n && v[i] === 37) { while (i < n && v[i] !== 10 && v[i] !== 13) i++; continue; }
      return;
    }
  };
  const kelime = (): string => {
    const b = i;
    while (i < n && !BOSLUK.has(v[i]!) && !AYRAC.has(v[i]!)) i++;
    return String.fromCharCode(...v.subarray(b, i));
  };
  const metinOku = (): number[] => {
    const cikti: number[] = [];
    let derinlik = 1;
    i++;
    while (i < n) {
      const c = v[i++]!;
      if (c === 92) {
        const d = v[i++];
        if (d === undefined) break;
        const kac: Record<number, number> = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12, 40: 40, 41: 41, 92: 92 };
        if (d >= 48 && d <= 55) {
          let s = d - 48;
          for (let k = 0; k < 2 && i < n && v[i]! >= 48 && v[i]! <= 55; k++) s = s * 8 + (v[i++]! - 48);
          cikti.push(s & 255);
        } else if (d === 13) { if (v[i] === 10) i++; }
        else if (d === 10) { /* satır devamı */ }
        else cikti.push(kac[d] ?? d);
        continue;
      }
      if (c === 40) derinlik++;
      if (c === 41 && --derinlik === 0) return cikti;
      cikti.push(c);
    }
    throw new AyiklamaHatasi('Kapanmayan metin.');
  };
  const onaltiOku = (): number[] => {
    i++;
    let s = '';
    while (i < n && v[i] !== 62) { const c = v[i++]!; if (!BOSLUK.has(c)) s += String.fromCharCode(c); }
    if (i >= n) throw new AyiklamaHatasi('Kapanmayan onaltılık metin.');
    i++;
    if (s.length % 2) s += '0';
    const b: number[] = [];
    for (let k = 0; k < s.length; k += 2) {
      const x = Number.parseInt(s.slice(k, k + 2), 16);
      if (Number.isNaN(x)) throw new AyiklamaHatasi('Bozuk onaltılık metin.');
      b.push(x);
    }
    return b;
  };
  const deger = (): Belirtec | null => {
    bosAtla();
    if (i >= n) return null;
    const c = v[i]!;
    if (c === 40) return { t: 'metin', v: metinOku() };
    if (c === 60 && v[i + 1] === 60) {
      i += 2;
      let derinlik = 1;
      while (i < n && derinlik > 0) {
        const d = deger();
        if (d === null) break;
        if (d.t === 'anahtar' && d.v === '>>') derinlik--;
      }
      return { t: 'sozluk' };
    }
    if (c === 62 && v[i + 1] === 62) { i += 2; return { t: 'anahtar', v: '>>' }; }
    if (c === 60) return { t: 'metin', v: onaltiOku() };
    if (c === 91) {
      i++;
      const ogeler: Belirtec[] = [];
      for (;;) {
        bosAtla();
        if (i >= n) throw new AyiklamaHatasi('Kapanmayan dizi.');
        if (v[i] === 93) { i++; return { t: 'dizi', v: ogeler }; }
        const d = deger();
        if (d === null) throw new AyiklamaHatasi('Kapanmayan dizi.');
        ogeler.push(d);
      }
    }
    if (c === 47) { i++; return { t: 'ad', v: kelime() }; }
    if (c === 93 || c === 41 || c === 123 || c === 125) { i++; return { t: 'anahtar', v: String.fromCharCode(c) }; }
    const k = kelime();
    if (k === '') { i++; return { t: 'anahtar', v: String.fromCharCode(c) }; }
    const sayi = Number(k);
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(k) && Number.isFinite(sayi) ? { t: 'sayi', v: sayi } : { t: 'anahtar', v: k };
  };

  let arg: Belirtec[] = [];
  let bas = -1;
  for (;;) {
    bosAtla();
    if (i >= n) break;
    const b = i;
    const d = deger();
    if (d === null) break;
    if (bas < 0) bas = b;
    if (d.t !== 'anahtar') { arg.push(d); continue; }
    if (d.v === 'BI') {
      // Satır içi resim: ID'den sonra ikili veri gelir; EI boşlukla çevrili aranır.
      for (;;) {
        bosAtla();
        const k = deger();
        if (k === null) throw new AyiklamaHatasi('Kapanmayan satır içi resim.');
        if (k.t === 'anahtar' && k.v === 'ID') break;
      }
      i++;
      let son = -1;
      for (let k = i; k + 1 < n; k++) {
        if (v[k] === 69 && v[k + 1] === 73 && (k === 0 || BOSLUK.has(v[k - 1]!)) && (k + 2 >= n || BOSLUK.has(v[k + 2]!))) { son = k + 2; break; }
      }
      if (son < 0) throw new AyiklamaHatasi('Kapanmayan satır içi resim.');
      i = son;
      sonuc.push({ op: 'BI', arg: [], bas, son });
    } else {
      sonuc.push({ op: d.v, arg, bas, son: i });
    }
    arg = [];
    bas = -1;
  }
  if (arg.length > 0) throw new AyiklamaHatasi('İşlemsiz değer.');
  return sonuc;
}

// ---- Yorumlama ----
interface GrafikDurumu {
  ctm: Matris; tc: number; tw: number; th: number; tl: number; ts: number; boy: number; yaziTipi: YaziTipi | null;
}

const sayiArg = (a: Belirtec[], k: number): number => {
  const b = a[k];
  if (b?.t !== 'sayi') throw new AyiklamaHatasi('Sayı bekleniyordu.');
  return b.v;
};
const matrisArg = (a: Belirtec[]): Matris => [sayiArg(a, 0), sayiArg(a, 1), sayiArg(a, 2), sayiArg(a, 3), sayiArg(a, 4), sayiArg(a, 5)];

interface Sinir { x0: number; y0: number; x1: number; y1: number }
const sinir = (koseler: [number, number][]): Sinir => {
  const xs = koseler.map((k) => k[0]), ys = koseler.map((k) => k[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const kesisim = (s: Sinir, a: Alan): number =>
  Math.max(0, Math.min(s.x1, a.x + a.en) - Math.max(s.x0, a.x)) * Math.max(0, Math.min(s.y1, a.y + a.boy) - Math.max(s.y0, a.y));
const degiyor = (s: Sinir, alanlar: readonly Alan[]): boolean =>
  alanlar.some((a) => s.x0 <= a.x + a.en && s.x1 >= a.x && s.y0 <= a.y + a.boy && s.y1 >= a.y);
const alanIcinde = (p: [number, number], alanlar: readonly Alan[]): boolean =>
  alanlar.some((a) => p[0] >= a.x - 0.01 && p[0] <= a.x + a.en + 0.01 && p[1] >= a.y - 0.01 && p[1] <= a.y + a.boy + 0.01);
// Alanlar üst üste gelebilir; toplam kesişim resmin alanıyla sınırlanır (yaklaşık, silme kararında yeterli).
function cogunluguIcinde(s: Sinir, alanlar: readonly Alan[]): boolean {
  const toplam = (s.x1 - s.x0) * (s.y1 - s.y0);
  if (toplam <= 1e-9) return degiyor(s, alanlar);
  return Math.min(toplam, alanlar.reduce((t, a) => t + kesisim(s, a), 0)) >= toplam / 2;
}

const YOL_KURAN = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're']);
const YOL_BOYAYAN = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n']);
const YAZI_GOSTEREN = new Set(['Tj', 'TJ', "'", '"']);
const YAZI_KONUMLAYAN = new Set(['Td', 'TD', 'Tm', 'T*', 'BT', 'ET']);
const sayiYaz = (x: number): string => (Math.abs(x) < 0.0005 ? '0' : (Math.round(x * 1000) / 1000).toString());
const onalti = (b: readonly number[]): string => `<${b.map((x) => x.toString(16).padStart(2, '0')).join('')}>`;
const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

type Parca = { kod: number; bayt: number[] } | { kayma: number };

export interface AyiklamaSonucu { icerik: Uint8Array; sayac: Sayac; kullanilanNesneler: Set<string>; degisti: boolean }

export function ayikla(icerik: Uint8Array, kaynaklar: Kaynaklar, alanlar: readonly Alan[], ilkCtm: Matris = BIRIM, derinlik = 0): AyiklamaSonucu {
  if (derinlik > 8) throw new AyiklamaHatasi('İç içe form çok derin.');
  const liste = islemler(icerik);
  const sayac: Sayac = { yazi: 0, resim: 0, cizim: 0, ortulenResim: 0 };
  const kullanilan = new Set<string>();
  let gs: GrafikDurumu = { ctm: ilkCtm, tc: 0, tw: 0, th: 1, tl: 0, ts: 0, boy: 0, yaziTipi: null };
  const yigin: GrafikDurumu[] = [];
  let tm: Matris = BIRIM, tlm: Matris = BIRIM;
  // Genişliği bilinmeyen yazı silindi; satır konumlanmadan yeni yazı gelirse yeri kayar.
  let bilinmeyenSilindi = false;
  let yol: { islemler: number[]; noktalar: [number, number][]; kirp: boolean } = { islemler: [], noktalar: [], kirp: false };
  const atla = new Set<number>();
  const yerine = new Map<number, string>();
  const isaretler: { no: number; etiket: string; ozellikli: boolean; sildi: boolean }[] = [];
  const sil = (no: number, yeni = '') => {
    atla.add(no);
    if (yeni) yerine.set(no, yeni);
    for (const i of isaretler) i.sildi = true;
  };

  const satirAt = (tx: number, ty: number) => { tlm = carp([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  const parcalar = (b: Belirtec | undefined): Parca[] => {
    const ogeler = b?.t === 'dizi' ? b.v : b ? [b] : [];
    const sonuc: Parca[] = [];
    for (const o of ogeler) {
      if (o.t === 'sayi') sonuc.push({ kayma: o.v });
      else if (o.t === 'metin') {
        if (gs.yaziTipi?.ikiBayt) for (let j = 0; j + 1 < o.v.length; j += 2) sonuc.push({ kod: (o.v[j]! << 8) | o.v[j + 1]!, bayt: [o.v[j]!, o.v[j + 1]!] });
        else for (const x of o.v) sonuc.push({ kod: x, bayt: [x] });
      }
    }
    return sonuc;
  };

  for (const [no, is] of liste.entries()) {
    const { op, arg } = is;
    if (YAZI_GOSTEREN.has(op)) {
      let onEk = '';
      if (op === "'" || op === '"') {
        if (op === '"') { gs.tw = sayiArg(arg, 0); gs.tc = sayiArg(arg, 1); onEk = `${sayiYaz(gs.tw)} Tw ${sayiYaz(gs.tc)} Tc `; }
        satirAt(0, -gs.tl);
        onEk += 'T*\n';
        bilinmeyenSilindi = false;
      }
      const liste2 = parcalar(op === '"' ? arg[2] : arg[0]);
      const trm = carp(tm, gs.ctm);
      const asagi = gs.ts - 0.25 * gs.boy, yukari = gs.ts + 0.9 * gs.boy;
      let x = 0, kesin = gs.boy !== 0 && gs.th !== 0;
      const degen: boolean[] = [];
      const ilerlemeler: number[] = [];
      for (const p of liste2) {
        if ('kayma' in p) { x += (-p.kayma / 1000) * gs.boy * gs.th; degen.push(false); ilerlemeler.push(0); continue; }
        const w = gs.yaziTipi?.genislik(p.kod) ?? null;
        if (w === null) kesin = false;
        const harf = (w ?? 0.6) * gs.boy * gs.th;
        const bosluk = !gs.yaziTipi?.ikiBayt && p.kod === 32 ? gs.tw : 0;
        const ilerleme = ((w ?? 0.6) * gs.boy + gs.tc + bosluk) * gs.th;
        const k = sinir(([[x, asagi], [x + harf, asagi], [x + harf, yukari], [x, yukari]] as [number, number][]).map(([a, b]) => uygula(trm, a, b)));
        degen.push(degiyor(k, alanlar));
        ilerlemeler.push(ilerleme);
        x += ilerleme;
      }
      if (degen.some(Boolean)) {
        sayac.yazi++;
        if (kesin) {
          // Kalan harfler kendi baytlarıyla, silinenler TJ kaymasıyla yazılır; satırın geri kalanı yerinde kalır.
          const dizi: string[] = [];
          let bayt: number[] = [];
          const bosalt = () => { if (bayt.length) { dizi.push(onalti(bayt)); bayt = []; } };
          for (const [j, p] of liste2.entries()) {
            if ('kayma' in p) { bosalt(); dizi.push(sayiYaz(p.kayma)); }
            else if (degen[j]) { bosalt(); dizi.push(sayiYaz((-ilerlemeler[j]! * 1000) / (gs.boy * gs.th))); }
            else bayt.push(...p.bayt);
          }
          bosalt();
          sil(no, `${onEk}[${dizi.join(' ')}] TJ\n`);
        } else {
          sil(no, onEk);
          bilinmeyenSilindi = true;
        }
      } else if (bilinmeyenSilindi && liste2.length > 0) {
        throw new AyiklamaHatasi('Silinen yazının genişliği bilinmiyor; aynı satırdaki yazının yeri korunamaz.');
      }
      tm = carp([1, 0, 0, 1, x, 0], tm);
      continue;
    }
    if (YAZI_KONUMLAYAN.has(op)) bilinmeyenSilindi = false;
    switch (op) {
      case 'q': yigin.push({ ...gs }); break;
      case 'Q': gs = yigin.pop() ?? gs; break;
      case 'cm': gs.ctm = carp(matrisArg(arg), gs.ctm); break;
      case 'BT': tm = BIRIM; tlm = BIRIM; break;
      case 'Tm': tlm = matrisArg(arg); tm = tlm; break;
      case 'Td': satirAt(sayiArg(arg, 0), sayiArg(arg, 1)); break;
      case 'TD': gs.tl = -sayiArg(arg, 1); satirAt(sayiArg(arg, 0), sayiArg(arg, 1)); break;
      case 'T*': satirAt(0, -gs.tl); break;
      case 'Tc': gs.tc = sayiArg(arg, 0); break;
      case 'Tw': gs.tw = sayiArg(arg, 0); break;
      case 'Tz': gs.th = sayiArg(arg, 0) / 100; break;
      case 'TL': gs.tl = sayiArg(arg, 0); break;
      case 'Ts': gs.ts = sayiArg(arg, 0); break;
      case 'Tf': {
        const ad = arg[0];
        gs.yaziTipi = ad?.t === 'ad' ? kaynaklar.yaziTipi(ad.v) : null;
        gs.boy = sayiArg(arg, 1);
        break;
      }
      case 'Do': {
        const ad = arg[0];
        if (ad?.t !== 'ad') break;
        const nesne = kaynaklar.disNesne(ad.v);
        if (nesne?.tur === 'resim') {
          const s = sinir(([[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]).map(([a, b]) => uygula(gs.ctm, a, b)));
          if (cogunluguIcinde(s, alanlar)) { sil(no); sayac.resim++; break; }
          if (degiyor(s, alanlar)) sayac.ortulenResim++;
        }
        if (nesne?.tur === 'form') {
          const ic = ayikla(nesne.icerik, nesne.kaynaklar, alanlar, carp(nesne.matris, gs.ctm), derinlik + 1);
          sayac.yazi += ic.sayac.yazi; sayac.resim += ic.sayac.resim; sayac.cizim += ic.sayac.cizim; sayac.ortulenResim += ic.sayac.ortulenResim;
          if (ic.degisti) {
            const yeniAd = nesne.yaz(ic);
            sil(no, `/${yeniAd} Do\n`);
            kullanilan.add(yeniAd);
            break;
          }
        }
        kullanilan.add(ad.v);
        break;
      }
      case 'BI': {
        const s = sinir(([[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]).map(([a, b]) => uygula(gs.ctm, a, b)));
        if (cogunluguIcinde(s, alanlar)) { sil(no); sayac.resim++; }
        else if (degiyor(s, alanlar)) sayac.ortulenResim++;
        break;
      }
      case 'BMC': case 'BDC': {
        const e = arg[0];
        isaretler.push({ no, etiket: e?.t === 'ad' ? e.v : '', ozellikli: op === 'BDC', sildi: false });
        break;
      }
      case 'EMC': {
        const i = isaretler.pop();
        if (i?.sildi && i.ozellikli && i.etiket !== '' && i.etiket !== 'OC') { atla.add(i.no); yerine.set(i.no, `/${i.etiket} BMC\n`); }
        break;
      }
      case 'W': case 'W*': yol.kirp = true; break;
      default:
        if (YOL_KURAN.has(op)) {
          yol.islemler.push(no);
          const s = arg.flatMap((a) => (a.t === 'sayi' ? [a.v] : []));
          if (op === 're' && s.length === 4) {
            const [rx, ry, rw, rh] = s as [number, number, number, number];
            yol.noktalar.push(uygula(gs.ctm, rx, ry), uygula(gs.ctm, rx + rw, ry), uygula(gs.ctm, rx + rw, ry + rh), uygula(gs.ctm, rx, ry + rh));
          } else for (let k = 0; k + 1 < s.length; k += 2) yol.noktalar.push(uygula(gs.ctm, s[k]!, s[k + 1]!));
        } else if (YOL_BOYAYAN.has(op)) {
          if (!yol.kirp && op !== 'n' && yol.noktalar.length > 0 && yol.noktalar.every((p) => alanIcinde(p, alanlar))) {
            for (const k of yol.islemler) sil(k);
            sil(no);
            sayac.cizim++;
          }
          yol = { islemler: [], noktalar: [], kirp: false };
        }
    }
  }
  const degisti = atla.size > 0;
  if (!degisti) return { icerik, sayac, kullanilanNesneler: kullanilan, degisti };
  const cikti: Uint8Array[] = [];
  const satirSonu = latin1('\n');
  for (const [no, is] of liste.entries()) {
    const y = yerine.get(no);
    if (y) cikti.push(latin1(y));
    if (!atla.has(no)) cikti.push(icerik.subarray(is.bas, is.son), satirSonu);
  }
  const uzunluk = cikti.reduce((t, c) => t + c.length, 0);
  const sonuc = new Uint8Array(uzunluk);
  let k = 0;
  for (const c of cikti) { sonuc.set(c, k); k += c.length; }
  return { icerik: sonuc, sayac, kullanilanNesneler: kullanilan, degisti };
}
