// Ekranda okunan zaman tesis saatiyle yazılır; tarayıcının saat dilimi ve dil kütüphanesinin ayırıcısı sonuca karışmaz.
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';

export const BOS_ZAMAN = '—';

// 'GGGG-AA-GG SS:DD' parçaları; okunamayan değer null döner, çağıran onu olduğu gibi yazar.
function parcalar(iso: string): { yil: string; ay: string; gun: string; saat: string } | null {
  const an = Date.parse(iso);
  if (Number.isNaN(an)) return null;
  const t = tesisSaati(an);
  return { yil: t.slice(0, 4), ay: t.slice(5, 7), gun: t.slice(8, 10), saat: t.slice(11, 16) };
}

const yaz = (iso: string | null, bicim: (p: NonNullable<ReturnType<typeof parcalar>>) => string): string => {
  if (iso === null) return BOS_ZAMAN;
  const p = parcalar(iso);
  return p === null ? iso : bicim(p);
};

// Liste ve kartlarda: '19.10 14:05'.
export const zamanMetni = (iso: string | null): string => yaz(iso, (p) => `${p.gun}.${p.ay} ${p.saat}`);

export const saatMetni = (iso: string | null): string => yaz(iso, (p) => p.saat);

// Belge ve ayrıntıda: '19.10.2026 14:05'.
export const tarihSaatMetni = (iso: string | null): string => yaz(iso, (p) => `${p.gun}.${p.ay}.${p.yil} ${p.saat}`);

// `date` sütunu ('GGGG-AA-GG') bir gündür, an değildir: saat dilimine çevrilmez.
export function tarihMetni(tarih: string | null): string {
  if (tarih === null) return BOS_ZAMAN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tarih);
  return m === null ? tarih : `${m[3]}.${m[2]}.${m[1]}`;
}
