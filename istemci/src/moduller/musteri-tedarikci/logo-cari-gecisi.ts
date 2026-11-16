import { LOGO_CARI_TOPLU_SINIRI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type { LogoCariSatiri, LogoCariTopluGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';

// Logo geçişi cariler sekmesi (3343): satırın durumu aramadaki eşleşmeden çıkar; sunucu aynı kuralları komutta yeniden uygular.
export type CariDurumu = 'bagli' | 'baglanabilir' | 'yeni' | 'eslesik' | 'alinamaz' | 'pasif';

// Sıra önemlidir: kodu CORE'a sığmayan cari hiçbir şekilde işlenmez; Logo kaydıyla bağlı olan pasif olsa da bağlı görünür.
// Logo'da kullanım dışı cari toplu işe girmez; gerekiyorsa Müşteriler ve Tedarikçiler'den tek tek alınır.
export function cariDurumu(c: LogoCariSatiri): CariDurumu {
  if (c.alinamaz !== null) return 'alinamaz';
  const e = c.eslesme;
  if (e?.neden === 'kayit-no') return 'bagli';
  if (!c.aktif) return 'pasif';
  if (e === null) return 'yeni';
  return e.baglanabilir ? 'baglanabilir' : 'eslesik';
}

export const ATLAMA_NEDENI: Record<Exclude<CariDurumu, 'baglanabilir' | 'yeni'>, string> = {
  bagli: 'Zaten bağlı',
  eslesik: 'CORE firması başka cariye bağlı ya da Logo cari kodu farklı',
  alinamaz: 'Kodu CORE\'a sığmıyor',
  pasif: 'Logo\'da kullanım dışı',
};

export interface TopluPlan {
  govde: LogoCariTopluGovdesi;
  // Seçimde olup işlenmeyen satırlar, nedenine göre sayılı.
  atlanan: ReadonlyMap<string, number>;
  // Sınırı aşan uygun satır sayısı; sonra yeniden seçilir.
  fazla: number;
}

export function topluPlan(secili: readonly LogoCariSatiri[]): TopluPlan {
  const bagla: LogoCariTopluGovdesi['bagla'] = [];
  const al: LogoCariTopluGovdesi['al'] = [];
  const atlanan = new Map<string, number>();
  let fazla = 0;
  for (const c of secili) {
    const d = cariDurumu(c);
    if (d !== 'baglanabilir' && d !== 'yeni') {
      atlanan.set(ATLAMA_NEDENI[d], (atlanan.get(ATLAMA_NEDENI[d]) ?? 0) + 1);
      continue;
    }
    if (bagla.length + al.length >= LOGO_CARI_TOPLU_SINIRI) {
      fazla += 1;
      continue;
    }
    if (d === 'baglanabilir' && c.eslesme) bagla.push({ logoKodu: c.kod, firmaId: c.eslesme.firmaId, surum: c.eslesme.surum });
    else al.push({ logoKodu: c.kod });
  }
  return { govde: { bagla, al }, atlanan, fazla };
}
