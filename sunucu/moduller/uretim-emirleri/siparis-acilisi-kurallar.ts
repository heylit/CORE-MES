import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { SiparisAcilisiAtlamasi } from '#paylasilan/sozlesme/siparis-acilisi.ts';
import { PROJE_KODU_BICIMI, PROJE_KODU_EN_COK } from '#paylasilan/sozlesme/projeler.ts';

// 3272: sipariş onayında proje ve emirlerin kendiliğinden açılması. Saf kurallar; okuma ve yazma siparis-acilisi.ts'tedir.

// UE-SA-01: proje numarası sipariş numarasından türetilir; proje kodunda yalnız A-Z, rakam, nokta ve alt çizgi olur (PRJ-01), öteki
// karakterler alt çizgi olur. Numara kullanılıyorsa sonuna _2, _3 eklenir; uzunluk sınırı ekle birlikte korunur.
export function projeKoduOnerisi(siparisNo: string, kullaniliyor: (kod: string) => boolean): string {
  const kok = siparisNo.toLocaleUpperCase('tr').replaceAll('İ', 'I').replace(/[^A-Z0-9._]/g, '_').slice(0, PROJE_KODU_EN_COK) || 'SIPARIS';
  if (!kullaniliyor(kok)) return kok;
  for (let n = 2; ; n++) {
    const ek = `_${n}`;
    const aday = `${kok.slice(0, PROJE_KODU_EN_COK - ek.length)}${ek}`;
    if (!kullaniliyor(aday)) return aday;
  }
}

export const projeKoduGecerliMi = (kod: string): boolean => PROJE_KODU_BICIMI.test(kod);

// UE-SA-02: her kalem partisi bir emirdir (3244 b); partisiz kalem tek seri partidir. Üretilmeyen malzemenin (ticari mal, hammadde)
// ve tam sayı olmayan adedin emri açılmaz: adet uydurulmaz, yuvarlanmaz.
export interface AcilisKalemi {
  id: number; sira: number; malzemeNo: number; miktar: string; termin: string | null;
  partiler: readonly { id: number; emirTuru: EmirTuru; adet: string; rotaId?: number | null | undefined }[];
}
export interface AcilisPartisi {
  kalemId: number; kalemSira: number; partiId: number | null; malzemeNo: number; emirTuru: EmirTuru; adet: number | null; teslim: string | null;
  // 3296-3 a: partide elle seçilen rota; boşsa türün rotası.
  rotaId: number | null;
  atlama: SiparisAcilisiAtlamasi | null;
}
const tamSayi = (m: string): number | null => {
  const n = Number(m);
  return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : null;
};
export function acilacakPartiler(kalemler: readonly AcilisKalemi[], siparisTermini: string, uretilir: (malzemeNo: number) => boolean): AcilisPartisi[] {
  return [...kalemler].sort((a, b) => a.sira - b.sira).flatMap((k) => {
    const partiler = k.partiler.length === 0 ? [{ id: null, emirTuru: 'seri' as EmirTuru, adet: k.miktar, rotaId: null }] : k.partiler;
    return partiler.map((p) => {
      const adet = tamSayi(p.adet);
      const atlama: SiparisAcilisiAtlamasi | null = !uretilir(k.malzemeNo) ? 'uretilmez' : adet === null ? 'tam-sayi-degil' : null;
      return {
        kalemId: k.id, kalemSira: k.sira, partiId: p.id, malzemeNo: k.malzemeNo, emirTuru: p.emirTuru, adet, teslim: k.termin ?? siparisTermini,
        rotaId: p.rotaId ?? null, atlama,
      };
    });
  });
}

// UE-SA-03 (3272-3 a): kendiliğinden açılmış emir işi başlamadıkça siparişi kilitlemez. Ölçüt durum değil emrin üstündeki iştir
// (Atölye): taslak, arşivlenmemiş, satın alma siparişi ya da stok hareketi bağlanmamış emir dokunulmamıştır (talep kilitlemez). Satın alma ya da stok
// bağı olan emir bugünkü gibi kilitler (Risk K4).
export interface DokunmaBilgisi { acilisKaynagi: 'siparis_onayi' | null; durum: string; arsiv: boolean; tedarikVar: boolean; stokVar: boolean }
export const dokunulmamisMi = (e: DokunmaBilgisi): boolean =>
  e.acilisKaynagi === 'siparis_onayi' && e.durum === 'taslak' && !e.arsiv && !e.tedarikVar && !e.stokVar;

// UE-SA-04 (3272-2 a): rota bekleyen emrin adımı yoktur; planlanmaz, rota yürürlüğe girince dolar.
export const ROTA_BEKLIYOR_PLANLANMAZ = 'Bu emir rota bekliyor; adımı olmadan plana alınmaz. Rota yürürlüğe girince emre uygulanır.';
export const rotaBekliyorIhlali = (rotaBekliyor: boolean): string | null => (rotaBekliyor ? ROTA_BEKLIYOR_PLANLANMAZ : null);

// UE-SA-05 (3272-3 a): yeniden onayda siparişten çözülmüş dokunulmamış emirler eksik partilere yeniden bağlanır: aynı malzeme ve emir
// türü, açılış sırasıyla. Eşi kalmayan çözülmüş emir iptal olur, eşi olmayan parti yeni emir açar.
export interface CozulmusEmir { id: number; malzemeNo: number; emirTuru: EmirTuru }
export function yenidenEsle<P extends { malzemeNo: number; emirTuru: EmirTuru }>(
  eksikler: readonly P[], cozulmusler: readonly CozulmusEmir[],
): { bagla: { parti: P; emirId: number }[]; ac: P[]; iptal: number[] } {
  const bos = [...cozulmusler].sort((a, b) => a.id - b.id);
  const bagla: { parti: P; emirId: number }[] = [];
  const ac: P[] = [];
  for (const p of eksikler) {
    const i = bos.findIndex((e) => e.malzemeNo === p.malzemeNo && e.emirTuru === p.emirTuru);
    if (i < 0) { ac.push(p); continue; }
    bagla.push({ parti: p, emirId: bos[i]!.id });
    bos.splice(i, 1);
  }
  return { bagla, ac, iptal: bos.map((e) => e.id) };
}

// UE-SA-06 (3272-1 b): onaylayanda proje ve emir açma işlemi yoksa onay reddedilir; ileti eksik işlemi söyler.
export const ACMA_ISLEMLERI = { proje: 'projeler.yaz', emir: ['uretim-emirleri.emir-ac', 'rota.emre-kopyala'] } as const;
export function eksikAcmaIslemleri(varMi: (islem: string) => boolean): string[] {
  return [
    ...(varMi(ACMA_ISLEMLERI.proje) ? [] : [ACMA_ISLEMLERI.proje]),
    ...(ACMA_ISLEMLERI.emir.some(varMi) ? [] : [ACMA_ISLEMLERI.emir[0]]),
  ];
}
export const yetkiEksikIletisi = (eksik: readonly string[]): string =>
  `Sipariş onaylanınca proje ve üretim emri açılır; bunun için şu yetkiler gerekir: ${eksik.join(', ')}. Yetkili biri onaylamalı.`;
export const PROJE_KODU_GECERSIZ = 'Proje numarasında yalnız harf (A-Z), rakam, nokta ve alt çizgi olabilir; en çok 24 karakter.';
export const PROJE_KODU_KULLANILIYOR = 'Bu proje numarası kullanılıyor; başka bir numara yazın.';
