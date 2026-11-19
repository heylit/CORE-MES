import type { Db } from '#cekirdek/db.ts';
import { dogrulama } from '#cekirdek/hata.ts';
import { SECIM_SAYFA_BOYU } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { SecimCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { ILETILER, secimReddi } from './kurallar.ts';

// Dosyanın müşterisi ve projesi (kart 3443, 3443 a). Ortak Dosyalar firma ve proje modüllerini ithal etmez (alt kattadır); okuyan
// karşılıklar sunucu/kablolama.ts'te kaynakların `disari.ts`'inden bağlanır. Bağlı değilse adlar gelmez, seçim listesi boş döner.
export interface MusteriProjeKaynagi {
  firmalar(db: Db, idler: readonly number[]): Promise<Map<number, { ad: string; tur: string }>>;
  projeler(db: Db, idler: readonly number[]): Promise<Map<number, { kod: string; ad: string; firmaId: number | null }>>;
  // Etkin müşteri ve ikisi türündeki firmalar; `sinir` satıra kadar.
  musteriAra(db: Db, metin: string, sinir: number): Promise<{ id: number; kod: string | null; ad: string }[]>;
  // Etkin projeler; firma verilirse yalnız onun.
  projeAra(db: Db, metin: string, firmaId: number | null, sinir: number): Promise<{ id: number; kod: string; ad: string; firmaId: number | null }[]>;
}
let kaynak: MusteriProjeKaynagi | null = null;
export function musteriProjeKaynagiKaydet(k: MusteriProjeKaynagi | null): void { kaynak = k; }

export interface FirmaAdi { id: number; ad: string }
export interface ProjeAdi { id: number; kod: string; ad: string }

export async function adlariOku(
  db: Db, satirlar: readonly { firmaId: number | null; projeId: number | null }[],
): Promise<{ firma: (id: number | null) => FirmaAdi | null; proje: (id: number | null) => ProjeAdi | null }> {
  const firmaIdleri = [...new Set(satirlar.flatMap((d) => (d.firmaId === null ? [] : [d.firmaId])))];
  const projeIdleri = [...new Set(satirlar.flatMap((d) => (d.projeId === null ? [] : [d.projeId])))];
  const firmalar = kaynak === null || firmaIdleri.length === 0 ? new Map() : await kaynak.firmalar(db, firmaIdleri);
  const projeler = kaynak === null || projeIdleri.length === 0 ? new Map() : await kaynak.projeler(db, projeIdleri);
  return {
    firma: (id) => {
      const f = id === null ? undefined : firmalar.get(id);
      return id === null || f === undefined ? null : { id, ad: f.ad };
    },
    proje: (id) => {
      const p = id === null ? undefined : projeler.get(id);
      return id === null || p === undefined ? null : { id, kod: p.kod, ad: p.ad };
    },
  };
}

// Yükleyenin seçimi doğrulanır (OD-30): firma müşteri olmalı, proje o müşterinin olmalı; müşteri boş, proje seçiliyse projenin
// müşterisi yazılır. Bağlı kaynak yoksa seçim kabul edilmez (yazılan kimliğin varlığı denetlenemez).
export async function secimDogrula(
  db: Db, g: { firmaId: number | null; projeId: number | null },
): Promise<{ firmaId: number | null; projeId: number | null }> {
  if (g.firmaId === null && g.projeId === null) return g;
  if (kaynak === null) throw dogrulama(ILETILER.musteriYok, 'firmaId');
  const firma = g.firmaId === null ? null : (await kaynak.firmalar(db, [g.firmaId])).get(g.firmaId) ?? null;
  if (g.firmaId !== null && firma === null) throw dogrulama(ILETILER.musteriYok, 'firmaId');
  const proje = g.projeId === null ? null : (await kaynak.projeler(db, [g.projeId])).get(g.projeId) ?? null;
  if (g.projeId !== null && proje === null) throw dogrulama(ILETILER.projeYok, 'projeId');
  const ret = secimReddi({ firmaTuru: firma?.tur ?? null, firmaId: g.firmaId, projeFirmaId: proje === null ? undefined : proje.firmaId });
  if (ret === 'musteriDegil') throw dogrulama(ILETILER.musteriDegil, 'firmaId');
  if (ret === 'projeMusteriUyusmuyor') throw dogrulama(ILETILER.projeMusteriUyusmuyor, 'projeId');
  return { firmaId: g.firmaId ?? proje?.firmaId ?? null, projeId: g.projeId };
}

// Kayda bağlı klasörün kimlikleri klasörün kaynağındandır; kaynakta bulunmayan (bağlı olmayan kaynak dahil) boş yazılır: yükleme
// klasör adının kaydına takılmaz.
export async function kayitKimlikleri(
  db: Db, c: { firmaId: number | null; projeId: number | null },
): Promise<{ firmaId: number | null; projeId: number | null }> {
  const adlar = await adlariOku(db, [c]);
  return { firmaId: adlar.firma(c.firmaId)?.id ?? null, projeId: adlar.proje(c.projeId)?.id ?? null };
}

// Seçici sayfaları: kaynak en çok bir sayfa fazlasını verir; daha fazlası aranarak daraltılır (müşteri araması 50 satırla sınırlı).
// Projenin `ust` alanı müşterisidir: önce proje seçilirse ekran müşteriyi doldurur (3443 a, 1).
type Ust = { id: number; kod: string; ad: string } | null;
const sayfala = (satirlar: readonly { id: number; kod: string | null; ad: string; ust?: Ust }[], sayfa: number): SecimCevabi => {
  const bas = (sayfa - 1) * SECIM_SAYFA_BOYU;
  return {
    sonuclar: satirlar.slice(bas, bas + SECIM_SAYFA_BOYU).map((k) => ({ id: k.id, kod: k.kod ?? '', ad: k.ad, aktif: true, ust: k.ust ?? null })),
    dahaVar: satirlar.length > bas + SECIM_SAYFA_BOYU,
  };
};

export async function musteriSecimi(db: Db, g: { q: string; sayfa: number }): Promise<SecimCevabi> {
  if (kaynak === null) return { sonuclar: [], dahaVar: false };
  return sayfala(await kaynak.musteriAra(db, g.q, g.sayfa * SECIM_SAYFA_BOYU + 1), g.sayfa);
}

export async function projeSecimi(db: Db, g: { q: string; sayfa: number; firmaId?: number | undefined }): Promise<SecimCevabi> {
  if (kaynak === null) return { sonuclar: [], dahaVar: false };
  const projeler = await kaynak.projeAra(db, g.q, g.firmaId ?? null, g.sayfa * SECIM_SAYFA_BOYU + 1);
  const firmaIdleri = [...new Set(projeler.flatMap((p) => (p.firmaId === null ? [] : [p.firmaId])))];
  const firmalar = firmaIdleri.length === 0 ? new Map<number, { ad: string; tur: string }>() : await kaynak.firmalar(db, firmaIdleri);
  return sayfala(projeler.map((p) => {
    const f = p.firmaId === null ? undefined : firmalar.get(p.firmaId);
    return { ...p, ust: p.firmaId === null || f === undefined ? null : { id: p.firmaId, kod: '', ad: f.ad } };
  }), g.sayfa);
}
