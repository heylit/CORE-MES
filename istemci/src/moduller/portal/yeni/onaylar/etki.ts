import { gecmisEkle } from '../kurallar.ts';
import type { Firma, Onay, OnayTuru, Odeme, Siparis, Sozlesme } from '../tipler.ts';

// Onay kararından sonra bağlı kayda yazılan sonuç (prototip apEffect). Sunucu karar ucunda yalnız onay kaydını yazar; bağlı kaydın
// durumunu, verilmiş karara uyuyorsa ayrı yazmada kabul eder (onayGeregi). Bu yüzden karar sonrası yazma ekranda kalır.

// Teklif iskontosunun sonucu Siparişler'in iskonto ucuna bağlanacak (H2); fiyat artışı soru 263'ü bekliyor. Bu iki türün kararı
// sonucu yazılamadan verilirse onay ile kayıt ayrışır: karar o türlerde eski ekranda kalır.
export const KARAR_VERILEN_TURLER: ReadonlySet<OnayTuru> = new Set(['po', 'payment', 'iban', 'contract']);

export const kararBuradaMi = (a: Pick<Onay, 'kind'>): boolean => KARAR_VERILEN_TURLER.has(a.kind);

export type OnayEtkisi =
  | { koleksiyon: 'orders'; kayit: Siparis }
  | { koleksiyon: 'payments'; kayit: Odeme }
  | { koleksiyon: 'parties'; kayit: Firma }
  | { koleksiyon: 'contracts'; kayit: Sozlesme };

export const ETKI_KOLEKSIYONLARI: Readonly<Partial<Record<OnayTuru, OnayEtkisi['koleksiyon']>>> = {
  po: 'orders', payment: 'payments', iban: 'parties', contract: 'contracts',
};

export interface EtkiBaglami { kullaniciKimligi: string; simdi: number; kurumAdi: string }

const redNotu = (a: Onay): string => a.steps.find((s) => s.status === 'rejected')?.note ?? '';

function yeniHesap(payload: unknown): { bank: string; iban: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { bank, iban } = payload as Record<string, unknown>;
  return typeof iban === 'string' && iban !== '' ? { bank: typeof bank === 'string' ? bank : '', iban } : null;
}

// Karara bağlanmış onayın bağlı kayda sonucu. Onay hâlâ bekliyorsa (ara adım), kayıt yoksa ya da tür burada karara
// bağlanmıyorsa null.
export function onayEtkisi(a: Onay, kayit: unknown, b: EtkiBaglami): OnayEtkisi | null {
  if (a.status === 'pending' || kayit === undefined || kayit === null) return null;
  const ok = a.status === 'approved';
  const not = redNotu(a);
  const an = new Date(b.simdi).toISOString();
  const gecmis = <T extends { history?: Onay['history'] }>(k: T, metin: string) => gecmisEkle(k, metin, b.kullaniciKimligi, b.simdi);
  switch (a.kind) {
    case 'po': {
      const o = kayit as Siparis;
      return {
        koleksiyon: 'orders',
        kayit: { ...o, approvalState: ok ? 'approved' : 'rejected', history: gecmis(o, ok ? 'Onaylandı, tedarikçiye gönderildi' : `Onay reddedildi${not ? `: ${not}` : ''}`) },
      };
    }
    case 'payment': {
      const p = kayit as Odeme;
      // rejectNote tipte yok; belgede prototipin alanı olarak kalır.
      const yeni = { ...p, status: ok ? 'sent' : 'rejected', rejectNote: ok ? '' : not, history: gecmis(p, ok ? 'Onaylandı, ödeme gönderildi' : 'Ödeme onayı reddedildi') } as const;
      return { koleksiyon: 'payments', kayit: yeni };
    }
    case 'iban': {
      const f = kayit as Firma;
      const hesap = yeniHesap(a.payload);
      if (ok && hesap === null) return null;
      const banka = ok && hesap ? { ...f.bank, bank: hesap.bank, iban: hesap.iban, verifiedAt: an, prev: f.bank?.iban } : f.bank;
      const degisiklik = { ...(f.bankChange ?? {}), status: ok ? 'approved' : 'rejected', decidedAt: an, note: not } as const;
      return {
        koleksiyon: 'parties',
        kayit: { ...f, bank: banka, bankChange: degisiklik, history: gecmis(f, ok ? 'Yeni IBAN onaylandı ve geçerli' : 'IBAN değişikliği reddedildi') },
      };
    }
    case 'contract': {
      const c = kayit as Sozlesme;
      return {
        koleksiyon: 'contracts',
        kayit: {
          ...c, approval: ok ? 'approved' : 'rejected', signed: { ...(c.signed ?? {}), firm: ok ? { u: b.kullaniciKimligi, at: an } : null },
          history: gecmis(c, ok ? `İç onay tamamlandı, ${b.kurumAdi} imzaladı` : 'Sözleşme onayı reddedildi'),
        },
      };
    }
    default:
      return null;
  }
}

// Karar bildirimi (prototip apdecide toast).
export function kararIletisi(a: Onay): string {
  if (a.status === 'rejected') return 'Reddedildi';
  if (a.status === 'approved') return 'Onaylandı; işlem tamamlandı';
  const sira = a.steps.find((s) => s.status === 'pending');
  return `Onaylandı; sıradaki onaycı: ${sira?.role ?? ''}`;
}
