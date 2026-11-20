import type { KademeAyarSatiri } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { KADEME_ADLARI, type Kademe } from '#paylasilan/sozlesme/kademe-sabitleri.ts';

// 3478-1 a: kademeli uyarı kaynağı tek satırdır; K1-K5 o satırın "iş yapılmazsa" basamaklarıdır. Satırda küçük, panelde dikey
// merdiven aynı hesaptan çizilir. Renk basamağın sertliğini söyler; kaynak kapalıysa bütün basamaklar soluk, basamak yoksa kesik.
export type BasamakTonu = 'acik' | 'gecikti' | 'yonetici' | 'kapali' | 'yok';
export interface Basamak { no: Kademe; ad: string; ton: BasamakTonu; metin: string | null }

type MerdivenAyari = Pick<KademeAyarSatiri, 'acik' | 'sayac' | 'k2Gun' | 'k3Gun' | 'k3Birim' | 'k4Gun' | 'k5Gun'>;

const SERTLIK: Record<Kademe, Exclude<BasamakTonu, 'kapali' | 'yok'>> = { 1: 'acik', 2: 'acik', 3: 'gecikti', 4: 'yonetici', 5: 'yonetici' };

export function kademeMerdiveni(s: MerdivenAyari): Basamak[] {
  const sonGun = s.sayac === 'son-gun';
  const k3Metni = sonGun ? 'son gün geçince' : s.k3Gun === null ? null : `${String(s.k3Gun)} ${s.k3Birim === 'saat' ? 'saat' : 'iş günü'} bekleyince`;
  const metinler: Record<Kademe, string | null> = {
    1: 'İş açılınca',
    2: sonGun && s.k2Gun !== null ? `son güne ${String(s.k2Gun)} iş günü kala` : null,
    3: k3Metni,
    4: s.k4Gun === null ? null : `gecikmenin ${String(s.k4Gun)}. iş günü`,
    5: s.k5Gun === null ? null : `gecikmenin ${String(s.k5Gun)}. iş günü`,
  };
  return ([1, 2, 3, 4, 5] as const).map((no) => {
    const metin = metinler[no];
    const ton: BasamakTonu = metin === null ? 'yok' : s.acik ? SERTLIK[no] : 'kapali';
    return { no, ad: KADEME_ADLARI[no], ton, metin };
  });
}

// Kısa gün yazısı: "K2 2 · K3 · +2 · +5" (K2 son güne kalan, K3 gecikme, + gecikmeden sonraki gün).
export function merdivenOzeti(s: MerdivenAyari): string {
  const p: string[] = [];
  if (s.sayac === 'son-gun') { if (s.k2Gun !== null) p.push(`K2 ${String(s.k2Gun)}`); p.push('K3'); }
  else if (s.k3Gun !== null) p.push(`K3 ${String(s.k3Gun)}${s.k3Birim === 'saat' ? ' sa' : ''}`);
  if (s.k4Gun !== null) p.push(`+${String(s.k4Gun)}`);
  if (s.k5Gun !== null) p.push(`+${String(s.k5Gun)}`);
  return p.join(' · ');
}

export function MiniMerdiven({ ayar, etiket }: { ayar: MerdivenAyari; etiket: string }) {
  const b = kademeMerdiveni(ayar);
  const okunur = b.filter((x) => x.metin !== null).map((x) => `K${String(x.no)} ${x.ad}: ${x.metin ?? ''}`).join('; ');
  return (
    <span className="tc-merdiven" role="img" aria-label={`${etiket} merdiveni${ayar.acik ? '' : ' (kapalı)'}: ${okunur}`}>
      <span className="tc-merdiven-basamaklar" aria-hidden="true">
        {b.map((x) => <span key={x.no} className={`tc-merdiven-basamak tc-merdiven-${x.ton}`} />)}
      </span>
      <span className="tc-merdiven-gun" aria-hidden="true">{merdivenOzeti(ayar)}</span>
    </span>
  );
}

export function DikeyMerdiven({ ayar }: { ayar: MerdivenAyari }) {
  return (
    <ol className="tc-merdiven-dikey" aria-label="Merdiven">
      {kademeMerdiveni(ayar).map((x) => (
        <li key={x.no} className={`tc-merdiven-dikey-adim tc-merdiven-${x.ton}`}>
          <span className="tc-merdiven-no" aria-hidden="true">{x.no}</span>
          <span className="tc-merdiven-dikey-metin">
            <b>{x.ad}</b>
            <span>{x.metin ?? 'Bu kaynakta yok'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
