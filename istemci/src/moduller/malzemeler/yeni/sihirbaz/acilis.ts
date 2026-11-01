import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import * as S from '../sabitler/index.ts';
import type { KatalogKarti, Sablon } from '../tipler.ts';
import { kopyala, type Taslak } from './durum.ts';
import type { SablonAlanlari } from './turler.ts';

export interface Acilis { taslak: Taslak; adim: number; ileti: string | null }

export function baslangicTaslagi(b: KuralBaglami, tur: string | null): Acilis {
  const d = K.newDraft(b);
  if (tur !== null && tur in S.TURLER) d.tur = tur as Taslak['tur'];
  // Yarı mamul ve mamulde kategori yok: prototip türü seçince doğrudan ilk adıma geçer.
  const adim = d.tur === 'yarimamul' || d.tur === 'mamul' ? 1 : 0;
  void b;
  return { taslak: d, adim, ileti: null };
}

// Katalogdaki "Düzenle": bekleyen değişiklik talebi varsa talebin yeni hâli açılır; son adımdan başlanır.
export function duzenlemeTaslagi(kart: KatalogKarti, b: KuralBaglami): Acilis {
  const x = kart.kayit;
  const talepli = K.talepVar(x, b);
  const kaynak = talepli && x.talep ? { ...x.talep.yeni, id: kart.kimlik, rev: x.rev, onay: x.onay } : { ...x, id: kart.kimlik };
  const d: Taslak = { ...K.newDraft(b), ...kopyala(kaynak) };
  d.kodManual = true;
  d.adManual = x.adManual !== false && x.com.ad !== K.autoAd(d, b);
  const adim = K.isGen(d, b) ? K.turAdimlari(d, b).length : 6;
  return { taslak: d, adim, ileti: talepli ? 'Bekleyen değişiklik talebi üzerinden düzenliyorsun.' : null };
}

// "Kopyasını oluştur" ve "Şablon yap": kimlik, revizyon, onay, mükerrer onayı ve türetilen kod alanları kopyaya geçmez.
export function kopyaTaslagi(kart: KatalogKarti, b: KuralBaglami): Acilis {
  const d: Taslak = { ...K.newDraft(b), ...kopyala(kart.kayit) };
  delete d.id;
  delete d.updatedAt;
  delete d.rev;
  delete d.onay;
  delete d.mukerrerOnay;
  d.acManual = [false, false, false];
  delete d.com.tkod;
  delete d.com.ac1;
  delete d.com.ac2;
  delete d.com.ac3;
  d.kodManual = false;
  d.adManual = false;
  d.com.kod = '';
  d.com.ad = '';
  void b;
  return { taslak: d, adim: K.isGen(d, b) ? 1 : 2, ileti: 'Kopya oluşturuldu. Ölçüleri değiştirip yeni kod olarak kaydedebilirsin.' };
}

// Prototipte `applyTpl`: hazır ve kayıtlı şablonlar aynı biçimdedir.
export function sablonTaslagi(id: string, kayitli: readonly Sablon[], b: KuralBaglami): Acilis | null {
  const t = ([...kayitli, ...S.SYS_TPL] as SablonAlanlari[]).find((x) => x.id === id);
  if (!t) return null;
  if (t.tur && t.tur !== 'hammadde') {
    const d: Taslak = { ...K.newDraft(b), tur: t.tur, g: kopyala(t.g ?? {}), bom: kopyala(t.bom ?? []), ops: kopyala(t.ops ?? []) };
    d.com = { ...d.com, ...kopyala(t.com ?? {}) };
    return { taslak: d, adim: 1, ileti: `"${t.ad}" uygulandı.` };
  }
  const fam = t.fam;
  if (!fam || !b.t.FAMS[fam]) return null;
  const d: Taslak = { ...K.newDraft(b), fam, cls: t.cls ?? null, grade: t.grade ?? null, opts: kopyala(t.opts ?? {}), ov: kopyala(t.ov ?? {}) };
  if (t.custom) d.custom = kopyala(t.custom);
  d.com = { ...d.com, ...kopyala(t.com ?? {}) };
  const form = t.form ? S.FORMS[t.form] : undefined;
  if (t.form && form) {
    d.form = t.form;
    d.dims = { ...form.def, ...(t.dims ?? {}) };
  }
  d.stds = kopyala(t.stds ?? []);
  if (t.tol) d.tol = t.tol;
  return {
    taslak: d,
    adim: 2,
    ileti: `"${t.ad}" uygulandı. ${t.form ? 'Ölçüleri kontrol edip ilerle.' : 'Formu ve ölçüleri seç.'}`,
  };
}
