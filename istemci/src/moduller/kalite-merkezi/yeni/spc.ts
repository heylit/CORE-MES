import type { Muayene, OlcumSerisi } from './tipler.ts';
import type { KmTon } from './kurallar.ts';

export const sayiOku = (v: unknown): number | null => {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isNaN(x) ? null : x;
};

export const seriAnahtari = (pn: unknown, ad: unknown): string =>
  `${String(pn ?? '').trim().toLocaleUpperCase('tr')}|${String(ad ?? '').trim().toLocaleLowerCase('tr')}`;

export interface SeriNoktasi { v: number; t?: string; kaynak?: string }

export interface Istatistik {
  n: number; ort?: number; ss?: number; mrOrt?: number; sw?: number; cp: number | null; cpk: number | null; pp: number | null; ppk: number | null;
  ucl?: number; lcl?: number; mrUcl?: number; tolDisi?: number; r1: number[]; r2: number[]; durum: { metin: string; ton: KmTon }; mr?: number[]; kontrolde: boolean;
}

export interface Seri extends Istatistik {
  k: string; pn: string; pa: string; ad: string; nom: number; lo: number; hi: number; noktalar: SeriNoktasi[]; kimlikler: string[];
}

// Bireysel değer ve hareketli aralık (I-MR) kartı: kısa dönem sigma MR/1,128; Cp/Cpk kısa, Pp/Ppk uzun dönem. Kurallar: 3 sigma dışı,
// ortalamanın aynı tarafında 8 ardışık nokta.
export function istatistik(s: { noktalar: readonly SeriNoktasi[]; lo: number; hi: number }): Istatistik {
  const x = s.noktalar.map((p) => p.v);
  const n = x.length;
  if (!n) return { n: 0, cp: null, cpk: null, pp: null, ppk: null, r1: [], r2: [], durum: { metin: 'Veri yok', ton: '' }, kontrolde: true };
  const ort = x.reduce((a, b) => a + b, 0) / n;
  const ss = n > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - ort) ** 2, 0) / (n - 1)) : 0;
  const mr: number[] = [];
  for (let i = 1; i < n; i++) mr.push(Math.abs(x[i]! - x[i - 1]!));
  const mrOrt = mr.length ? mr.reduce((a, b) => a + b, 0) / mr.length : 0;
  const sw = mrOrt / 1.128;
  const tol = s.hi - s.lo;
  const cp = sw > 0 && tol > 0 ? tol / (6 * sw) : null;
  const cpk = sw > 0 && tol > 0 ? Math.min(s.hi - ort, ort - s.lo) / (3 * sw) : null;
  const pp = ss > 0 && tol > 0 ? tol / (6 * ss) : null;
  const ppk = ss > 0 && tol > 0 ? Math.min(s.hi - ort, ort - s.lo) / (3 * ss) : null;
  const ucl = ort + 3 * sw;
  const lcl = ort - 3 * sw;
  const mrUcl = 3.267 * mrOrt;
  const tolDisi = x.filter((v) => v < s.lo - 1e-12 || v > s.hi + 1e-12).length;
  const r1 = sw > 0 ? x.map((v, i) => (v > ucl || v < lcl ? i : -1)).filter((i) => i >= 0) : [];
  const r2: number[] = [];
  let seri = 0;
  let taraf = 0;
  x.forEach((v, i) => {
    const d = v > ort ? 1 : v < ort ? -1 : 0;
    if (d && d === taraf) seri++;
    else {
      seri = d ? 1 : 0;
      taraf = d;
    }
    if (seri >= 8) r2.push(i);
  });
  const kontrolde = !(r1.length || r2.length);
  const durum: Istatistik['durum'] = n < 10 ? { metin: 'Veri az', ton: '' }
    : !kontrolde ? { metin: 'Kontrol dışı', ton: 'kotu' }
    : cpk === null ? { metin: 'Hesaplanamadı', ton: '' }
    : cpk >= 1.33 ? { metin: 'Yetenekli', ton: 'iyi' }
    : cpk >= 1 ? { metin: 'Sınırda', ton: 'uyari' }
    : { metin: 'Yetersiz', ton: 'kotu' };
  return { n, ort, ss, mrOrt, sw, cp, cpk, pp, ppk, ucl, lcl, mrUcl, tolDisi, r1, r2, durum, mr, kontrolde };
}

// Seriler muayene karakteristiklerinden (nicel) ve ölçüm serilerinden birleşir; kötü olan, sonra düşük Cpk, sonra çok ölçümlü önce.
export function seriler(v: { insp: readonly Muayene[]; spc: readonly OlcumSerisi[] }): Seri[] {
  const m = new Map<string, Omit<Seri, keyof Istatistik>>();
  const al = (pn: unknown, pa: unknown, ad: unknown, nom: number, alt: unknown, ust: unknown) => {
    const k = seriAnahtari(pn, ad);
    let s = m.get(k);
    if (!s) {
      s = { k, pn: String(pn ?? ''), pa: String(pa ?? ''), ad: String(ad ?? ''), nom, lo: nom - Math.abs(sayiOku(alt) || 0), hi: nom + Math.abs(sayiOku(ust) || 0), noktalar: [], kimlikler: [] };
      m.set(k, s);
    }
    return s;
  };
  [...v.insp].sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '')).forEach((i) => (i.chars || []).forEach((c) => {
    if (c.tip === 'Nitel') return;
    const d = sayiOku(c.olcum);
    const n = sayiOku(c.nominal);
    if (d === null || n === null) return;
    al(i.parcaNo, i.parcaAdi, c.ad, n, c.alt, c.ust).noktalar.push({ v: d, t: i.tarih, kaynak: i.no });
  }));
  [...v.spc].sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '')).forEach((r) => {
    const n = sayiOku(r.nominal);
    if (n === null) return;
    const s = al(r.parcaNo, r.parcaAdi, r.ad, n, r.alt, r.ust);
    s.nom = n;
    s.lo = n - Math.abs(sayiOku(r.alt) || 0);
    s.hi = n + Math.abs(sayiOku(r.ust) || 0);
    (r.degerler || []).forEach((d) => {
      const x = sayiOku(d);
      if (x !== null) s.noktalar.push({ v: x, t: r.tarih, kaynak: r.no });
    });
    s.kimlikler.push(r._id);
  });
  const sira: Record<KmTon, number> = { kotu: 0, uyari: 1, iyi: 2, bilgi: 3, '': 3 };
  return [...m.values()].map((s) => {
    s.noktalar.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
    return { ...s, ...istatistik(s) };
  }).sort((a, b) => sira[a.durum.ton] - sira[b.durum.ton] || (a.cpk ?? 9) - (b.cpk ?? 9) || b.n - a.n);
}

const iki = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dort = (v: number) => (Number.isFinite(v) ? v.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—');

export function oneriler(s: Seri): string[] {
  const o: string[] = [];
  const merkez = (s.hi + s.lo) / 2;
  const kayma = (s.ort ?? 0) - merkez;
  if (s.n < 25) o.push(`Güvenilir bir yetenek değerlendirmesi için en az 25, tercihen 30 ve üzeri ölçüm gerekir; şu an ${s.n} ölçüm var.`);
  if (!s.kontrolde) {
    const nedenler = [s.r1.length ? `${s.r1.length} nokta kontrol sınırlarının dışında` : '', s.r2.length ? '8 veya daha fazla ardışık nokta ortalamanın aynı tarafında (kayma)' : '']
      .filter(Boolean).join(', ');
    o.push(`Süreç istatistiksel kontrol dışında: ${nedenler}. Önce özel nedeni (takım değişimi, malzeme partisi, operatör, ayar) bulun; kontrol dışı süreçte Cpk yanıltıcıdır.`);
  }
  if (s.tolDisi) o.push(`${s.tolDisi} ölçüm tolerans dışında. Bu parçalar için NCR açıldığından emin olun.`);
  if (s.n >= 10 && s.cp !== null && s.kontrolde) {
    if ((s.cpk ?? 0) >= 1.33) o.push(`Süreç yetenekli (Cpk ${iki(s.cpk)}). Kontrol planında bu karakteristiğin muayene sıklığını azaltmayı değerlendirebilirsiniz.`);
    else if (s.cp >= 1.33) {
      o.push(`Dağılım yeterince dar (Cp ${iki(s.cp)}) ancak ortalama tolerans merkezinden ${kayma > 0 ? '+' : ''}${dort(kayma)} kaymış. Süreci merkezlemek Cpk'yı yaklaşık ${iki(s.cp)} seviyesine çıkarır.`);
    } else {
      o.push(`Dağılım toleransa göre geniş (Cp ${iki(s.cp)}). Merkezleme tek başına yetmez: fikstür, takım aşınması ve ölçüm sistemi kaynaklı değişkenliği azaltın ya da toleransı tasarımla birlikte gözden geçirin. Bu sürede %100 muayene uygulayın.`);
    }
  }
  return o;
}

// CMM ya da tablodan yapıştırılan değerler: boşluk, satır ya da noktalı virgülle ayrılır; tek parça ve ondalık noktalıysa virgül de ayırıcıdır.
export function degerleriAyir(metin: unknown): number[] {
  const t = String(metin ?? '').trim();
  if (!t) return [];
  let parca = t.split(/[\s;]+/).filter(Boolean);
  if (parca.length === 1 && /\d\.\d/.test(t) && t.includes(',')) parca = t.split(',');
  return parca.map(sayiOku).filter((x): x is number => x !== null);
}
