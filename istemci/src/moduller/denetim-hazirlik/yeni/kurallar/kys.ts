import { KYSB, ROAD, ROLES, RT, RTN, type Donem, type YapiTasi, type YolAdimi } from '../icerik/kys-yapi.ts';
import { ayEkle, bugunTarihi, gunEkle, haftaAraligi, pazartesi } from '../tarih.ts';
import type { KysMaddesi, Profil, ProgramKodu, Surec } from '../tipler.ts';
import { programKullaniliyor } from './puan.ts';

// KYS kuralları: yapı taşı durumu ve gözden geçirme vadesi, olgunluk yüzdesi, süreç göstergeleri, yol haritası ve rutin görev uyumu.

export const BOS_KYS_MADDESI: Readonly<KysMaddesi> = { st: 0, date: '', code: '', rev: '', owner: '', note: '' };
export const kysMaddesi = (profil: Profil, id: string): KysMaddesi => profil.kys.items[id] ?? { ...BOS_KYS_MADDESI };

export const kysSonrakiGozden = (b: YapiTasi, it: KysMaddesi): string => (it.date ? ayEkle(it.date, b.rv) : '');
export function kysGecikti(b: YapiTasi, it: KysMaddesi): boolean {
  const n = kysSonrakiGozden(b, it);
  return it.st === 2 && !!n && n < bugunTarihi();
}
// AS9100 ve EYDEP yapı taşları yalnız o program kullanılıyorsa sayılır.
export const kysAcik = (b: YapiTasi, profil: Profil, acikProgram: ProgramKodu): boolean =>
  !b.tag || programKullaniliyor(profil, b.tag === 'AS9100' ? 'as9100' : 'eydep', acikProgram);

export interface KysIstatistigi { n: number; miss: number; draft: number; live: number; late: number; nodate: number; zmiss: number; pct: number }

// Olgunluk: (yürürlükte + 0,4 x taslak - 0,5 x geciken) / n.
export function kysIstatistigi(profil: Profil, acikProgram: ProgramKodu): KysIstatistigi {
  const K = profil.kys.items;
  const B = KYSB.filter((b) => kysAcik(b, profil, acikProgram));
  const s = { n: B.length, miss: 0, draft: 0, live: 0, late: 0, nodate: 0, zmiss: 0, pct: 0 };
  for (const b of B) {
    const it = K[b.id] ?? BOS_KYS_MADDESI;
    if (it.st === 0) {
      s.miss++;
      if (b.z) s.zmiss++;
    } else if (it.st === 1) s.draft++;
    else {
      s.live++;
      if (!it.date) s.nodate++;
      else if (kysGecikti(b, it)) s.late++;
    }
  }
  s.pct = Math.max(0, Math.round(((s.live + s.draft * 0.4 - s.late * 0.5) / s.n) * 100));
  return s;
}

// Son n ay ('YYYY-AA'), en eskisi önce.
export function gostergeAylari(n: number, bugun: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(bugun.getFullYear(), bugun.getMonth() - i, 1);
    out.push(`${String(x.getFullYear())}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
// Hedef yoksa ya da değer yoksa karar yok (null).
export function gostergeTuttu(p: Surec, v: number | null | undefined): boolean | null {
  if (v == null || p.target === '') return null;
  return p.dir === 'le' ? v <= p.target : v >= p.target;
}
export function gostergeSon(p: Surec): { m: string; v: number } | null {
  const ms = Object.keys(p.vals).sort();
  const m = ms[ms.length - 1];
  return m === undefined ? null : { m, v: p.vals[m] as number };
}

// Yol haritası adımı: yapı taşına bağlıysa onların durumundan (hepsi yürürlükte 2, biri başlamış 1), değilse işaretten.
export function yolAdimiDurumu(s: YolAdimi, profil: Profil): 0 | 1 | 2 {
  if (s.bl.length) {
    const sts = s.bl.map((id) => (profil.kys.items[id] ?? BOS_KYS_MADDESI).st);
    if (sts.every((x) => x === 2)) return 2;
    if (sts.some((x) => x > 0)) return 1;
    return 0;
  }
  return profil.kys.road[s.id] ? 2 : 0;
}
export function yolIstatistigi(profil: Profil): { n: number; k: number; p: number } {
  let n = 0, k = 0, p = 0;
  for (const f of ROAD) {
    for (const s of f.steps) {
      n++;
      const v = yolAdimiDurumu(s, profil);
      if (v === 2) k++;
      else if (v === 1) p++;
    }
  }
  return { n, k, p };
}

export const rolAdi = (k: string): string => {
  const r = ROLES.find((x) => x.k === k);
  return r ? r.n.replace(/ \(.*\)$/, '') : k;
};

// Rutin görev dönemi: başlangıç günü, kayıt anahtarı ve son dönemlerin listesi (günlükte hafta sonu atlanır).
export function donemBasi(f: Donem, d: string): string {
  if (f === 'g') return d;
  if (f === 'h') return pazartesi(d);
  if (f === 'a') return `${d.slice(0, 8)}01`;
  if (f === 'c') {
    const m = Number(d.slice(5, 7));
    const q = Math.floor((m - 1) / 3) * 3 + 1;
    return `${d.slice(0, 4)}-${String(q).padStart(2, '0')}-01`;
  }
  return `${d.slice(0, 4)}-01-01`;
}
export function donemAnahtari(f: Donem, d: string = bugunTarihi()): string {
  const s = donemBasi(f, d);
  if (f === 'h') return `W${s}`;
  if (f === 'a') return s.slice(0, 7);
  if (f === 'c') return `${s.slice(0, 4)}-Q${String(Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1)}`;
  if (f === 'y') return s.slice(0, 4);
  return s;
}
export function donemListesi(f: Donem, n: number): { k: string; s: string }[] {
  const out: { k: string; s: string }[] = [];
  const d = bugunTarihi();
  if (f === 'g') {
    for (let i = 0; out.length < n && i < 60; i++) {
      const dd = gunEkle(d, -i);
      const hg = new Date(`${dd}T00:00:00`).getDay();
      if (hg !== 0 && hg !== 6) out.push({ k: donemAnahtari('g', dd), s: dd });
    }
    return out;
  }
  const st = donemBasi(f, d);
  for (let i = 0; i < n; i++) {
    const s2 = f === 'h' ? gunEkle(st, -7 * i) : f === 'a' ? ayEkle(st, -i) : f === 'c' ? ayEkle(st, -3 * i) : ayEkle(st, -12 * i);
    out.push({ k: donemAnahtari(f, s2), s: s2 });
  }
  return out;
}
export function donemEtiketi(f: Donem): string {
  const t = bugunTarihi();
  const s = donemBasi(f, t);
  if (f === 'g') return new Date(`${t}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (f === 'h') return haftaAraligi(s);
  if (f === 'a') return new Date(`${s}T00:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  if (f === 'c') return `${s.slice(0, 4)} · ${String(Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1)}. çeyrek`;
  return s.slice(0, 4);
}

export const rutinYapildi = (profil: Profil, id: string, anahtar: string): boolean => (profil.kys.rt[id] ?? []).includes(anahtar);

// Bu dönemde yapılan ve başlangıçtan sonraki önceki dönemlerde uyum yüzdesi.
export function rutinIstatistigi(profil: Profil, f: Donem): { n: number; k: number; uyum: number | null; per: number } {
  const ts = RT.filter((x) => x.f === f);
  const cur = donemAnahtari(f);
  const k = ts.filter((x) => rutinYapildi(profil, x.id, cur)).length;
  const bas = profil.kys.rtStart;
  const onceki = donemListesi(f, RTN[f] + 1).slice(1).filter((p) => bas && p.s >= donemBasi(f, bas));
  let tot = 0, ok = 0;
  for (const p of onceki) {
    for (const x of ts) {
      tot++;
      if (rutinYapildi(profil, x.id, p.k)) ok++;
    }
  }
  return { n: ts.length, k, uyum: tot ? Math.round((ok / tot) * 100) : null, per: onceki.length };
}
