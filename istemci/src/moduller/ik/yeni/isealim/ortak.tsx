import { useMemo, type ReactNode } from 'react';
import { DurumKutusu, Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { MOTOR_HAZIRLANIYOR, ikSabitleri, type IkMotoru, type IkSabitleri } from '../motor.ts';
import { puanMetni, type Ton } from './kurallar.ts';
import { iseAlimMotoru, type IseAlimMotoru } from './motor-yuzu.ts';

// P4 ekranlarının küçük ortak parçaları.

const ROZET: Readonly<Record<Ton, RozetTonu>> = { ok: 'tamam', info: 'bilgi', warn: 'uyari', bad: 'hata' };
export const rozetTonu = (t: Ton | null): RozetTonu => (t === null ? 'pasif' : ROZET[t]);

export function TonluRozet({ ton, children }: { ton: Ton | null; children: ReactNode }) {
  return <Rozet ton={rozetTonu(ton)}>{children}</Rozet>;
}

export interface Hazirlik { m: IseAlimMotoru; s: IkSabitleri }

// Seçenek listeleri (aşamalar, eğitim türleri), etkin personel ve ilan metni motordandır (ikinci kopya yazılmaz); motor
// gelene kadar ekran "hazırlanıyor" der.
export function MotorlaCiz({ motor, children }: { motor: IkMotoru | null; children: (h: Hazirlik) => ReactNode }) {
  const m = useMemo(() => (motor ? iseAlimMotoru(motor) : null), [motor]);
  const s = ikSabitleri();
  return m === null || s === null ? <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} /> : <>{children({ m, s })}</>;
}

// 1-5 puan göstergesi: beş nokta ve sayı; puan yoksa çizgi.
export function Puan({ deger }: { deger: number | null }) {
  const metin = puanMetni(deger);
  if (metin === null) return <span className="tc-ika-puan-yok">—</span>;
  return (
    <span className="tc-ika-puan" aria-label={`${metin} / 5`}>
      <span className="tc-ika-puan-nokta" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => <i key={i} data-dolu={(deger ?? 0) >= i - 0.25 ? '' : undefined} />)}
      </span>
      <b>{metin}</b>
    </span>
  );
}

export function Bolum({ baslik, eylem, children }: { baslik: string; eylem?: ReactNode; children: ReactNode }) {
  return (
    <section className="tc-ika-bolum">
      <header><h3>{baslik}</h3>{eylem}</header>
      {children}
    </section>
  );
}

// Tanım listesi: değeri olmayan satır "—" ile kalır (sıfır uydurulmaz).
export function Tanimlar({ satirlar }: { satirlar: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="tc-ika-tanim">
      {satirlar.map(([etiket, deger]) => (
        <div key={etiket}><dt>{etiket}</dt><dd>{deger ?? '—'}</dd></div>
      ))}
    </dl>
  );
}

export const Not = ({ children }: { children: ReactNode }) => <p className="tc-ika-not">{children}</p>;

export function bugun(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const secenekler = (liste: readonly string[]) => liste.map((s) => ({ deger: s, baslik: s }));

// Panoya kopyalama; izin yoksa false döner ve ekran metni seçili bırakır.
export async function panoyaKopyala(metin: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch {
    return false;
  }
}

export function dosyaIndir(ad: string, icerik: string, tur: string): void {
  const adres = URL.createObjectURL(new Blob([icerik], { type: tur }));
  const a = document.createElement('a');
  a.href = adres;
  a.download = ad;
  a.click();
  URL.revokeObjectURL(adres);
}
