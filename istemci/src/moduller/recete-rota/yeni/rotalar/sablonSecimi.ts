import type { Sablon } from '#paylasilan/sozlesme/rota.ts';
import { adimDali, kolaEkle, sirali, sureSayisi, yeniAdim, yenidenNumarala, type Adim, type Malzeme, type Operasyon } from './kurallar.ts';

// 3273 a (D): hazır rota şablonu seçimi. Öneri sırası: ürün adında öneri sözcüğü geçen önce, sonra çok kullanılan, sonra varsayılan.
// Karşılaştırma büyük-küçük harf ve Türkçe harf farkına bakmaz: atölyede "MIL" ve "Mil" aynı yazılır. Kullanımdan kalkan şablon önerilmez.

export type RotaSablonu = Sablon;
export type EklemeKonumu = 'basa' | 'sonra' | 'sona' | 'yerine';
export const KONUM_ADI: Readonly<Record<EklemeKonumu, string>> = {
  basa: 'Başa', sonra: 'Seçili adımdan sonra', sona: 'Sona (ana hat)', yerine: 'Var olan adımların yerine',
};

const ASCII: Readonly<Record<string, string>> = { İ: 'I', I: 'I', Ş: 'S', Ğ: 'G', Ü: 'U', Ö: 'O', Ç: 'C', Â: 'A', Î: 'I', Û: 'U' };
export const sade = (m: string): string => m.toLocaleUpperCase('tr-TR').replace(/[İIŞĞÜÖÇÂÎÛ]/g, (h) => ASCII[h] ?? h).replace(/\s+/g, ' ').trim();

// Ürün adında bir sözcüğün başında geçen ilk öneri sözcüğü; yoksa null ("MİL" "MİLLİ"yi bulur, "EMİLİM"i bulmaz).
export function eslesenSozcuk(s: Pick<RotaSablonu, 'oneriSozcukleri'>, urunAdi: string): string | null {
  const ad = ` ${sade(urunAdi).replace(/[^A-Z0-9]+/g, ' ')} `;
  return s.oneriSozcukleri.find((x) => { const z = sade(x); return z !== '' && ad.includes(` ${z}`); }) ?? null;
}

export interface Oneri { sablon: RotaSablonu; neden: string }
export function onerilenler(sablonlar: readonly RotaSablonu[], urunAdi: string, adet = 2): Oneri[] {
  return sablonlar.filter((s) => s.aktif)
    .map((s) => ({ s, z: eslesenSozcuk(s, urunAdi) }))
    .sort((a, b) => Number(b.z !== null) - Number(a.z !== null) || b.s.kullanim.revizyon - a.s.kullanim.revizyon
      || Number(b.s.varsayilan) - Number(a.s.varsayilan) || a.s.ad.localeCompare(b.s.ad, 'tr'))
    .slice(0, adet)
    .map(({ s, z }) => ({
      sablon: s,
      neden: z !== null ? `adında "${z}" geçiyor` : s.kullanim.revizyon > 0 ? `${String(s.kullanim.revizyon)} rotada kullanıldı` : s.varsayilan ? 'varsayılan şablon' : 'henüz kullanılmadı',
    }));
}

// Benzer ürün: rotası olan ürünlerden adı en çok ortak sözcük taşıyan (3 harften kısa sözcük sayılmaz). Ortak sözcük yoksa null.
const sozcukler = (ad: string): Set<string> => new Set(sade(ad).split(/[^A-Z0-9]+/).filter((x) => x.length >= 3));
export function benzerUrun(hedef: Malzeme, adaylar: readonly Malzeme[], adimSayisi: (id: string) => number): { urun: Malzeme; ortak: number } | null {
  const h = sozcukler(hedef.name);
  let en: { urun: Malzeme; ortak: number } | null = null;
  for (const m of adaylar) {
    if (m.id === hedef.id || adimSayisi(m.id) === 0) continue;
    const ortak = [...sozcukler(m.name)].filter((x) => h.has(x)).length;
    if (ortak > 0 && (en === null || ortak > en.ortak || (ortak === en.ortak && m.code.localeCompare(en.urun.code, 'tr') < 0))) en = { urun: m, ortak };
  }
  return en;
}

// Şablon adımı katalogdaki operasyon tipiyle adım olur: istasyon, hazırlık ve süre katalogdandır (sunucunun taslak açmasıyla aynı).
// Katalogda bulunmayan (kullanımdan kalkmış) tip eklenmez, adı döner.
export function sablonAdimlari(s: RotaSablonu, opBul: (id: string) => Operasyon | undefined, kimlik: () => string): { adimlar: Adim[]; eksik: string[] } {
  const adimlar: Adim[] = [];
  const eksik: string[] = [];
  for (const x of [...s.adimlar].sort((a, b) => a.sira - b.sira)) {
    const op = opBul(String(x.operasyonTipi.id));
    if (!op) { eksik.push(x.ad); continue; }
    adimlar.push({ ...yeniAdim(op, kimlik()), name: x.ad });
  }
  return { adimlar, eksik };
}

// Dolu taslağa ekleme: "sona" ana hattın son adımından sonradır (dalın ucuna değil); "sonra" seçili adımın hattında kalır.
export function sablonuYerlestir(var_: readonly Adim[], yeni: readonly Adim[], konum: EklemeKonumu, seciliId: string | null): Adim[] {
  if (konum === 'yerine' || var_.length === 0) return yenidenNumarala(yeni.map((a) => ({ ...a, dal: null })));
  const l = sirali(var_);
  let sonra: string | null;
  if (konum === 'basa') sonra = null;
  else if (konum === 'sonra' && seciliId !== null && l.some((x) => x.id === seciliId)) sonra = seciliId;
  else sonra = l.filter((x) => adimDali(x) === null).at(-1)?.id ?? l.at(-1)?.id ?? null;
  let sonuc = l;
  for (const a of yeni) {
    sonuc = kolaEkle(sonuc, sonra, sonra === null ? { ...a, dal: null } : a);
    sonra = a.id;
  }
  return sonuc;
}

// Ön izlemede adımın süresi: katalog değeri tahminidir; değer yoksa sıfır gösterilmez.
export function katalogSuresi(op: Operasyon | undefined): string {
  const islem = sureSayisi(op?.cycle ?? null);
  const ayar = sureSayisi(op?.setup ?? null);
  if (islem === null && ayar === null) return 'katalogda süre yok';
  const p = [ayar === null ? null : `hazırlık ${String(ayar)} dk`, islem === null ? null : `işlem ${String(islem)} dk`].filter((x) => x !== null);
  return `${p.join(', ')} (katalogdan, tahmini)`;
}
