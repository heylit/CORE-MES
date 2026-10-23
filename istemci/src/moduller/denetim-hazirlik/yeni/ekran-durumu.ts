import { PROGRAM_SIRASI } from './icerik/programlar.ts';
import type { EkranDurumu, KysSekmesi, Profil, ProgramEkrani, ProgramKodu } from './tipler.ts';

// Ekran durumu (açık sekme, seçili soru, süzgeç, arama) kişinin tarayıcısında kalır, ortak kayda yazılmaz (204 a). İlk açılışta kayıttaki
// son değerden başlar ki eski çerçeveden geçen kişi kaldığı yerde açsın. Depolama kapalıysa (gizli pencere) ekran yine açılır.

const ANAHTAR_ONEKI = 'tmiv2:denetim-hazirlik:ekran:';
export const ekranAnahtari = (kisiId: number): string => `${ANAHTAR_ONEKI}${String(kisiId)}`;

const KYS_SEKMELERI: readonly KysSekmesi[] = ['nedir', 'yol', 'blok', 'surec', 'dosya', 'gorev', 'rutin', 'uret', 'sema'];

const programEkrani = (p: Profil, k: ProgramKodu): ProgramEkrani => {
  const w = p.pw[k];
  return {
    mode: w.mode, cur: w.cur, curQ: w.curQ, curF: w.curF, dept: w.dept, card: w.card, flipped: w.flipped, stage: w.stage, clause: w.clause,
    phase: w.phase, chainSel: w.chainSel, filter: w.filter, docq: w.docq, prepView: w.prepView,
  };
};

export function ilkEkranDurumu(p: Profil): EkranDurumu {
  return {
    program: p.prog,
    ux: p.ux,
    onbHide: p.onbHide,
    pw: { iso9001: programEkrani(p, 'iso9001'), as9100: programEkrani(p, 'as9100'), eydep: programEkrani(p, 'eydep') },
    kys: { tab: p.kys.tab, sv: p.kys.sv, fl: p.kys.fl, tp: p.kys.tp, filter: p.kys.filter, dok: '' },
    kal: { view: p.kal.view, filter: p.kal.filter, q: p.kal.q, month: p.kal.month },
    ic: { tab: p.ic.tab },
    takvim: { yeniDenetim: false },
  };
}

const nesneMi = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Saklanan değer güvenilmez (eski sürüm, elle değişmiş): yalnız türü tutan alanlar alınır, gerisi ilk değerden gelir.
function birlestir<T extends object>(ilk: T, saklanan: unknown): T {
  if (!nesneMi(saklanan)) return ilk;
  const sonuc = { ...ilk } as Record<string, unknown>;
  for (const [k, v] of Object.entries(ilk)) {
    const s = saklanan[k];
    if (nesneMi(v)) sonuc[k] = birlestir(v, s);
    else if (s !== undefined && typeof s === typeof v) sonuc[k] = s;
  }
  return sonuc as T;
}

export function ekranDurumuOku(kisiId: number, p: Profil): EkranDurumu {
  const ilk = ilkEkranDurumu(p);
  let ham: unknown = null;
  try {
    const metin = window.localStorage.getItem(ekranAnahtari(kisiId));
    ham = metin ? JSON.parse(metin) : null;
  } catch {
    ham = null;
  }
  const e = birlestir(ilk, ham);
  if (!PROGRAM_SIRASI.includes(e.program)) e.program = ilk.program;
  if (!KYS_SEKMELERI.includes(e.kys.tab)) e.kys.tab = ilk.kys.tab;
  if (e.ux !== 'rehber' && e.ux !== 'uzman') e.ux = ilk.ux;
  for (const k of PROGRAM_SIRASI) if (e.pw[k].prepView !== 'week' && e.pw[k].prepView !== 'phase') e.pw[k].prepView = ilk.pw[k].prepView;
  return e;
}

export function ekranDurumuYaz(kisiId: number, e: EkranDurumu): void {
  try {
    window.localStorage.setItem(ekranAnahtari(kisiId), JSON.stringify(e));
  } catch {
    // Depolama doluysa ya da kapalıysa ekran durumu yalnız bu oturumda kalır.
  }
}
