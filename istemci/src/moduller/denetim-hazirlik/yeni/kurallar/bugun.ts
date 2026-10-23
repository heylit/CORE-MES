import { KYSB } from '../icerik/kys-yapi.ts';
import { PROGRAMLAR, PROGRAM_SIRASI } from '../icerik/programlar.ts';
import { gunFarki, tarihMetni } from '../tarih.ts';
import type { Cihaz, GorunumKodu, ProgramKodu } from '../tipler.ts';
import { siradakiDenetim } from './denetim-takvimi.ts';
import { WKT, haftalariKur } from './hafta.ts';
import { ayEtiketi, icVadesiGelenler, sahaAcikUygunsuzluklar, sahaVadesi, SAHA_SABLONLARI } from './ic-denetim.ts';
import { cihazDurumu, cihazVadesi } from './kalibrasyon.ts';
import { kysAcik, kysGecikti, kysSonrakiGozden } from './kys.ts';
import { ozSonrakiVade } from './oz.ts';
import { programKullaniliyor, programPuani, type KuralBaglami } from './puan.ts';

// Bugün: bütün bölümlerden tek iş listesi (prototip homeItems). Menüdeki gecikmiş sayısı da bundan gelir.

export type BugunGrubu = 'gec' | 'hafta' | 'yakin';
// Satır düğmesi: kalibrasyon kaydı Kalibrasyon modülünde yapılır (329 a); öbürleri kayda yazar.
export type BugunEylemi = { tur: 'kalibrasyon'; id: string } | { tur: 'gozden-gecirildi'; id: string } | { tur: 'ic-baslat'; id: string } | { tur: 'saha-baslat'; id: string };
export interface BugunMaddesi {
  g: BugunGrubu;
  src: string;
  // Program rozeti (programa ait maddede).
  prog?: ProgramKodu;
  ic: string;
  t: string;
  s: string;
  eylem?: BugunEylemi;
  go: GorunumKodu;
  gop?: ProgramKodu;
  sort: string;
}

export function bugunListesi(kb: KuralBaglami, cihazlar: readonly Cihaz[]): BugunMaddesi[] {
  const L: BugunMaddesi[] = [];
  const st = kb.profil;
  for (const d of cihazlar) {
    const s = cihazDurumu(d);
    if (s.k === 'pasif' || s.k === 'ok') continue;
    L.push({
      g: s.k === 'gec' || s.k === 'yok' ? 'gec' : (s.dd ?? 0) <= 7 ? 'hafta' : 'yakin', src: 'Kalibrasyon', ic: 'ruler', t: `${d.no} · ${d.ad}`,
      s: s.t + (d.yer ? ` · ${d.yer}` : ''), eylem: { tur: 'kalibrasyon', id: d.id }, go: 'kalib', sort: cihazVadesi(d) || '0000',
    });
  }
  for (const b of KYSB) {
    const it = st.kys.items[b.id];
    if (it && kysAcik(b, st, kb.program) && kysGecikti(b, it)) {
      L.push({ g: 'gec', src: 'KYS', ic: 'layers', t: b.n, s: `Gözden geçirme gecikti · son ${tarihMetni(it.date)}`, eylem: { tur: 'gozden-gecirildi', id: b.id }, go: 'kys', sort: kysSonrakiGozden(b, it) });
    }
  }
  for (const a of st.audits) {
    if (a.status !== 'plan') continue;
    const dd = gunFarki(a.date);
    if (dd > 30) continue;
    const g: BugunGrubu = dd < 0 ? 'gec' : dd <= 7 ? 'hafta' : 'yakin';
    const P = PROGRAMLAR[a.prog];
    if (a.kind === 'deadline') {
      L.push({ g, src: P.s, prog: a.prog, ic: 'flag', t: a.type, s: `${tarihMetni(a.date)} · ${dd < 0 ? `${String(-dd)} gün gecikti` : dd === 0 ? 'bugün' : `${String(dd)} gün kaldı`}`, go: 'takvim', sort: a.date });
    } else if (dd >= 0) {
      L.push({ g, src: P.s, prog: a.prog, ic: 'award', t: a.type || 'Denetim', s: `${tarihMetni(a.date)} · ${dd === 0 ? 'bugün' : `${String(dd)} gün kaldı`}`, go: 'dash', gop: a.prog, sort: a.date });
    } else {
      L.push({ g: 'gec', src: P.s, prog: a.prog, ic: 'award', t: `${a.type || 'Denetim'}: sonucu girilmedi`, s: tarihMetni(a.date), go: 'takvim', sort: a.date });
    }
  }
  for (const k of PROGRAM_SIRASI) {
    if (!programKullaniliyor(st, k, kb.program)) continue;
    const w = st.pw[k];
    const G = PROGRAMLAR[k];
    const r = programPuani(st, k);
    const acik = r.risks.filter((x) => x.lvl !== 'obs' && !w.done[x.q.id]);
    if (acik.length) {
      L.push({
        g: acik.some((x) => x.lvl === 'major') ? 'gec' : 'hafta', src: G.s, prog: k, ic: 'alert', t: `${String(acik.length)} öncelikli açık kapatılmayı bekliyor`,
        s: acik.slice(0, 3).map((x) => x.q.c).join(', ') + (acik.length > 3 ? ' …' : ''), go: 'rapor', gop: k, sort: '0001',
      });
    }
    const du = ozSonrakiVade(w.oz);
    if (w.oz.cur) {
      L.push({ g: 'hafta', src: G.s, prog: k, ic: 'repeat', t: 'Açık öz değerlendirme turu', s: `${String(w.oz.cur.qids.length)} soru`, go: 'kontrol', gop: k, sort: '0002' });
    } else if (du && gunFarki(du) <= 7) {
      const f = gunFarki(du);
      L.push({ g: f < 0 ? 'gec' : 'hafta', src: G.s, prog: k, ic: 'repeat', t: 'Öz değerlendirme turu zamanı', s: f < 0 ? `${String(-f)} gün gecikti` : f === 0 ? 'bugün' : `${String(f)} gün kaldı`, go: 'kontrol', gop: k, sort: du });
    }
    if (r.answered === 0 && siradakiDenetim(st, k)) {
      L.push({ g: 'hafta', src: G.s, prog: k, ic: 'clip', t: 'Hazırlığı ölçmeye başlayın', s: '10 soruluk hızlı tur yaklaşık 15 dakika', go: 'sim', gop: k, sort: '0003' });
    }
  }
  for (const d of icVadesiGelenler(st)) {
    L.push({
      g: d.late ? 'gec' : 'hafta', src: 'İç denetim', ic: 'clip', t: d.o.p.name, s: ayEtiketi(d.m) + (d.late ? ' · gecikti' : ' · bu ay') + (d.o.r.aud ? ` · ${d.o.r.aud}` : ''),
      eylem: { tur: 'ic-baslat', id: d.o.r.pid }, go: 'icd', sort: `${d.m}-01`,
    });
  }
  for (const t0 of SAHA_SABLONLARI) {
    const du = sahaVadesi(st, t0);
    if (du && du.dd <= 0) {
      L.push({ g: du.dd < 0 ? 'gec' : 'hafta', src: 'Saha kontrolü', ic: 'calcheck', t: t0.n, s: du.dd < 0 ? `${String(-du.dd)} gün gecikti` : 'bugün', eylem: { tur: 'saha-baslat', id: t0.id }, go: 'icd', sort: du.next });
    }
  }
  const acikSaha = sahaAcikUygunsuzluklar(st);
  if (acikSaha.n) L.push({ g: 'hafta', src: 'Saha kontrolü', ic: 'alert', t: `${String(acikSaha.n)} açık saha uygunsuzluğu`, s: 'Düzeltilmeyi bekliyor', go: 'icd', sort: '0005' });
  const plan = haftalariKur(kb);
  const buHafta = plan?.weeks.find((x) => x.cur);
  if (buHafta) {
    const kalan = buHafta.items.filter((it) => !it.done && it.k !== 'dl' && it.k !== 'audit').length;
    if (kalan) L.push({ g: 'hafta', src: kb.pg.s, prog: kb.program, ic: 'calcheck', t: `Bu hafta ${String(kalan)} hazırlık görevi`, s: WKT[kb.program][buHafta.ph] ?? '', go: 'hazirlik', gop: kb.program, sort: '0004' });
  }
  return L.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
}

// Menüde gösterilen gecikmiş iş sayısı.
export const gecikmisSayisi = (kb: KuralBaglami, cihazlar: readonly Cihaz[]): number => bugunListesi(kb, cihazlar).filter((x) => x.g === 'gec').length;

