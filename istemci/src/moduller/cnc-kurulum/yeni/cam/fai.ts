import { fmtN } from '../bicim.ts';
import { SC } from './durum.ts';
import type { Baglama, FaiKarakteristigi, FaiSonucu, FrezeIs, MtIs } from './tipler.ts';

/* FAI, ilk urun muayenesi (AS9102 mantigi). Karakteristikler plandan cikarilir; olcum aleti ve suresi toleransa gore secilir.
   Form 1 (parca), Form 2 (malzeme + ozel proses belgeleri), Form 3 (her karakteristik: balon no, nominal, olcum, sonuc). */
export const FAI_SRC: [string, string][] = [['1factory · FAI rehberi', 'https://www.1factory.com/quality-academy/guide-first-article.html'], ['Quality Magazine · AS9102 süreci', 'https://www.qualitymag.com/articles/96602-how-to-simplify-your-as9102-first-article-inspection-process']];
type Alet = [string, number] | [string, number, 1];
export const FAI_INST: Record<string, Record<string, Alet>> = {
  gen: { od: ['Kumpas', 0.5], len: ['Kumpas', 0.5], bore: ['Kumpas', 0.6], depth: ['Derinlik kumpası', 0.6], hole: ['Tampon mastar', 0.4], pos: ['Kumpas', 1.0], thread: ['Diş tampon mastarı', 1.0], flat: ['Mikrometre', 0.8], width: ['Kumpas', 0.5], cham: ['Pah mastarı', 0.5], ra: ['Pürüzlülük cihazı', 2.0], runout: ['Komparatör + V-blok', 2.0], groove: ['Kumpas', 0.6] },
  fine: { od: ['Mikrometre', 1.0], len: ['Yükseklik mihengiri', 1.2], bore: ['İç çap komparatörü', 1.5], depth: ['Derinlik mikrometresi', 1.0], hole: ['Tampon mastar (H7)', 0.5], pos: ['Yükseklik mihengiri', 2.0], thread: ['Diş tampon mastarı', 1.0], flat: ['Mikrometre', 1.0], width: ['Ayar bloğu / mastar', 0.8], cham: ['Optik / profil projektör', 0.8], ra: ['Pürüzlülük cihazı', 2.0], runout: ['Komparatör + V-blok', 2.0], groove: ['Kanal mikrometresi', 1.2] },
  tight: { od: ['Mikrometre', 1.0], len: ['CMM', 1.0, 1], bore: ['CMM', 1.0, 1], depth: ['CMM', 1.0, 1], hole: ['CMM', 1.0, 1], pos: ['CMM', 1.0, 1], thread: ['Diş tampon mastarı', 1.0], flat: ['CMM', 1.0, 1], width: ['CMM', 1.0, 1], cham: ['CMM', 0.8, 1], ra: ['Pürüzlülük cihazı', 2.0], runout: ['CMM', 1.0, 1], groove: ['CMM', 1.0, 1] },
};
export const FAI_KT: Record<string, string> = { od: 'Çap', len: 'Boy / konum', bore: 'Delik çapı', depth: 'Derinlik', hole: 'Delik çapı', pos: 'Delik konumu', thread: 'Diş', flat: 'Yüzey ölçüsü', width: 'Genişlik / boy', cham: 'Pah', ra: 'Yüzey pürüzlülüğü', runout: 'Salgı', groove: 'Kanal' };

type HamKarakteristik = Pick<FaiKarakteristigi, 'k' | 'name' | 'nom' | 'grp'>;
export function faiChars(J: MtIs | FrezeIs, kind: 'mt' | 'mill'): HamKarakteristik[] {
  const C: HamKarakteristik[] = [];
  function add(k: string, name: string, nom: string, grp: string): void { C.push({ k, name, nom, grp }); }
  let setups: Baglama[];
  if (kind === 'mt') {
    const M = J as MtIs, pr = M.P.prof, seg: { r: number; z0: number; z1: number }[] = [];
    let cur: { r: number; z0: number; z1: number } | null = null;
    pr.forEach((p) => { if (cur && Math.abs(p.r - cur.r) < 0.02) { cur.z1 = -p.z; } else { cur = { r: p.r, z0: -p.z, z1: -p.z }; seg.push(cur); } });
    const dia = seg.filter((s) => s.z1 - s.z0 >= 1 && s.r > 0.5), cham = seg.filter((s) => s.z1 - s.z0 < 1).length;
    add('len', 'Toplam boy', fmtN(M.Lp, 2), 'Torna');
    let big: { r: number; z0: number; z1: number } | null = null;
    dia.forEach((s, k) => { add('od', 'Dış çap', 'Ø' + fmtN(2 * s.r, 2), 'Torna'); if (k < dia.length - 1) add('len', 'Omuz konumu (ön alından)', fmtN(s.z1 + 0.125, 1), 'Torna'); if (!big || s.z1 - s.z0 > big.z1 - big.z0) big = s; });
    if (M.L1.bore > 0) { add('bore', 'Eksenel delik', 'Ø' + fmtN(2 * M.L1.bore, 2), 'Torna'); add('depth', 'Delik derinliği', fmtN(M.L1.Lb, 1), 'Torna'); }
    (M.L1.grooves || []).concat(M.L2.grooves || []).forEach(() => { add('groove', 'Kanal çapı ve genişliği', '', 'Torna'); });
    const nc = Math.min(6, Math.round(cham / 3)); for (let c = 0; c < nc; c++) add('cham', 'Pah', '', 'Torna');
    const b = big as { r: number } | null;
    if (b) add('ra', 'Pürüzlülük (finiş çap)', 'Ø' + fmtN(2 * b.r, 0), 'Torna');
    if (dia.length > 1 && SC().tol !== 'gen') add('runout', 'Salgı (referans çapa göre)', '', 'Torna');
    setups = M.AS.setups;
  } else {
    const st = J.G.stock; add('len', 'Dış ölçü X', fmtN(st.Lx, 1), 'Freze'); add('len', 'Dış ölçü Y', fmtN(st.Ly, 1), 'Freze'); add('len', 'Dış ölçü Z', fmtN(st.Lz, 1), 'Freze');
    setups = (J as FrezeIs).setups;
  }
  (J.res || []).forEach((r, i) => {
    if (!r || !r.ops || !r.ops.length) return;
    const s = setups[i]!, g = kind === 'mt' ? (s.dir.axial ? s.dir.name.split(' ·')[0]! : 'C' + s.dir.C + '°') : s.dir.name, prm = J.prm || {};
    const fin = r.ops.some((o) => o.kind === 'finish');
    if (fin) (r.floors || []).forEach((f) => { if (f.z > r.zHi! + 0.05 || f.z < r.zLo! - 0.1) return; const nom = kind === 'mt' && !s.dir.axial ? 'eksenden ' + fmtN((J as MtIs).R + f.z, 2) : 'derinlik ' + fmtN(-f.z, 2); add('flat', 'Frezelenmiş yüzey', nom, g); add('width', 'Yüzey genişliği / boyu', '', g); });
    (r.holes || []).forEach((hh) => {
      if (hh.how === 'none') return;
      add('hole', 'Delik çapı', 'Ø' + fmtN(hh.d, 2), g); add('pos', 'Delik konumu (2 eksen)', '', g);
      if (!hh.through) add('depth', 'Delik derinliği', fmtN(hh.depth! - 0.25, 1), g);
      if (hh.tapM && prm.tap && prm.tap[hh.tapKey!]) add('thread', 'Diş', 'M' + hh.tapM, g);
    });
  });
  return C;
}
export function camFAI(J: MtIs | FrezeIs, kind: 'mt' | 'mill'): FaiSonucu {
  const tol = SC().tol, T = FAI_INST[tol]!, rec = 1.0;
  let meas = 0, cmmN = 0;
  const C: FaiKarakteristigi[] = faiChars(J, kind).map((c, i) => { const it = T[c.k]!; const x = { ...c, no: i + 1, inst: it[0], tm: it[1], cmm: !!it[2] }; meas += x.tm; if (x.cmm) cmmN++; return x; });
  const fixed: [string, number][] = [['Balonlu resim hazırlığı', 15], ['Form 1 + Form 2 (parça, malzeme sertifikası, özel proses belgeleri)', 30], ['Gözden geçirme ve onay', 15]];
  if (cmmN) fixed.push(['CMM programı (' + cmmN + ' karakteristik)', 30 + cmmN * 1.0]);
  const fixT = fixed.reduce((a, x) => a + x[1], 0), recT = C.length * rec;
  return { chars: C, meas, rec: recT, fixed, fixT, labor: meas + recT + fixT, cmmN, wait: SC().faiw === 'run' ? 5 : meas };
}
