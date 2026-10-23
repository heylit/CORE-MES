// Excel ile toplu giriş ve çıkış. Kitaplık depodaki exceljs'tir (package.json, 4.4.0) ve yalnız Excel penceresi kullanılınca yüklenir;
// dış adrese gidilmez. Satır denetimi ve plan kurallar/'dadır (xlSatirlariOku, xlPlan); burada dosya okunur, yazılır ve plan uygulanır.
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi, KartOzeti } from '../tipler.ts';
import type * as ExcelJsModulu from 'exceljs';

type ExcelJs = typeof ExcelJsModulu;
type Hucre = string | number | boolean | Date | null;

let yukleniyor: Promise<ExcelJs> | null = null;
export function exceljsYukle(): Promise<ExcelJs> {
  yukleniyor ??= import('exceljs').then((m) => ((m as { default?: ExcelJs }).default ?? m)).catch((e: unknown) => { yukleniyor = null; throw e; });
  return yukleniyor;
}

// Okuyucu prototipteki biçimi verir: sayfa adı -> satırlar (başlık dahil); boş hücre null, sondaki boşlar ve boş satırlar atlanır.
export function hucreDegeri(v: unknown): Hucre {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v as Hucre;
  const o = v as { richText?: { text?: string }[]; result?: unknown; text?: unknown };
  if (Array.isArray(o.richText)) return o.richText.map((p) => p.text ?? '').join('');
  if ('result' in o) return hucreDegeri(o.result);
  if ('text' in o) return hucreDegeri(o.text);
  return null;
}

export async function sayfalariOku(buf: ArrayBuffer): Promise<Record<string, Hucre[][]>> {
  const E = await exceljsYukle();
  const wb = new E.Workbook();
  await wb.xlsx.load(buf);
  const sayfalar: Record<string, Hucre[][]> = {};
  wb.eachSheet((ws) => {
    const satirlar: Hucre[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const d: Hucre[] = [];
      for (let c = 1; c <= row.cellCount; c++) d.push(hucreDegeri(row.getCell(c).value));
      while (d.length && d[d.length - 1] === null) d.pop();
      if (d.some((x) => x !== null && x !== '')) satirlar.push(d);
    });
    sayfalar[ws.name] = satirlar;
  });
  return sayfalar;
}

// kayitlar null: boş şablon (açılır listeler ve örnek satırla); dolu: aynı şablon biçiminde dışa aktarma.
export async function calismaKitabi(kayitlar: readonly KartKaydi[] | null, b: KuralBaglami): Promise<ArrayBuffer> {
  const ExcelJS = await exceljsYukle();
  const wb = K.xlCalismaKitabi(K.newDraft(b), ExcelJS, { kayitlar }, b);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export interface PlanSatiri {
  sayfa: string;
  satir: number;
  islem: 'ekle' | 'guncelle' | 'ayni' | 'atla';
  kayit: KartKaydi | null;
  eslesen: KartKaydi | null;
  hatalar: string[];
  uyarilar: string[];
  mukerrer: string[];
  farklar?: { f: string; a: string; b: string }[];
  r: Record<string, unknown>;
}

export type SatirDurumu = 'ekle' | 'guncelle' | 'ayni' | 'mukerrer' | 'hata' | 'atla';

export const satirDurumu = (p: PlanSatiri, mukerrerEkle: boolean): SatirDurumu => {
  if (p.islem === 'atla' || p.islem === 'ayni') return p.islem;
  if (p.hatalar.length) return 'hata';
  if (p.mukerrer.length && !mukerrerEkle) return 'mukerrer';
  return p.islem;
};

export function planKur(sayfalar: Record<string, Hucre[][]>, kayitlar: readonly KartKaydi[], b: KuralBaglami): PlanSatiri[] {
  const sat = K.xlSatirlariOku(sayfalar, b);
  return sat.length ? K.xlPlan(sat, kayitlar, b) : [];
}

export const uygulanacaklar = (plan: readonly PlanSatiri[], mukerrerEkle: boolean): PlanSatiri[] => plan.filter(
  (p) => p.islem !== 'atla' && p.islem !== 'ayni' && !p.hatalar.length && (!p.mukerrer.length || mukerrerEkle || p.islem === 'guncelle'),
);

const yeniKimlik = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Plan satırından kaydedilecek kartı kurar (prototipin excelUygula adımları). Aktif kartın güncellemesi onay akışı açıksa değişiklik talebidir.
export function satirKaydi(p: PlanSatiri, verilenKodlar: string[], mukerrerNedeni: string, b: KuralBaglami): KartKaydi {
  let it: KartKaydi = structuredClone(p.kayit!);
  const onceki = p.islem === 'guncelle' ? p.eslesen : null;
  it.id = onceki ? onceki.id : yeniKimlik();
  if (!it.kodManual || !it.com.kod) {
    it.com.kod = b.genel.kodYapisi === 'teknik' ? K.teknikKod(it, b) : K.siradakiKod(it, verilenKodlar, b);
    it.kodManual = true;
  }
  verilenKodlar.push(it.com.kod);
  if (!it.adManual) it.com.ad = K.finalAd(it, b);
  it.com.birim = K.finalBirim(it, b);
  it.updatedAt = Date.now();
  it = K.kodlariSabitle(it, b);
  if (onceki && b.genel.onayAkisi && K.onayDurum(onceki, b) === 'aktif') {
    const tq = K.talepOlustur(onceki, it, b);
    const son = tq.rev?.at(-1);
    if (son) son.not = `${son.not ?? ''} (Excel)`;
    return tq;
  }
  it = K.withRev(it, onceki, b);
  const son = it.rev?.[it.rev.length - 1];
  if (son) son.not = (son.not ? `${son.not}; ` : '') + 'Excel içe aktarımı';
  it = K.onayAta(it, onceki, b);
  if (p.mukerrer.length && !onceki) it.mukerrerOnay = { ...K.kim(b), kartlar: p.mukerrer, neden: mukerrerNedeni.trim() };
  return it;
}

export interface UygulamaSonucu { ok: number; hata: number; ilkHata: unknown }

// Kartlar sırayla yazılır (sunucu sırayı ve sürümü denetler); dört hatadan sonra durulur (prototip).
export async function planiUygula(
  yap: readonly PlanSatiri[], mukerrerNedeni: string, b: KuralBaglami,
  kaydet: (g: { kayit: KartKaydi; ozet: KartOzeti }) => Promise<unknown>, ilerleme: (n: number) => void,
): Promise<UygulamaSonucu> {
  const verilen: string[] = [];
  let ok = 0; let hata = 0; let ilkHata: unknown = null;
  for (const p of yap) {
    const kayit = satirKaydi(p, verilen, mukerrerNedeni, b);
    try {
      await kaydet({ kayit, ozet: K.kartOzeti(kayit, b) });
      ok++;
      ilerleme(ok);
    } catch (e) {
      hata++;
      if (hata === 1) ilkHata = e;
      if (hata > 3) break;
    }
  }
  return { ok, hata, ilkHata };
}
