import { emirKuyrugu } from '../ortak/emir-no.ts';
import type { KokpitEmri } from './kurallar.ts';
import { miktarYaz, type EmirMalzemeleri, type MalzemeSatiri } from './malzeme.ts';

// Tahtada "Malzeme" satırı (3369 a, ikinci adım): gelişi belli siparişi bekleyen emir için şimdiden malzemenin hazır olduğu ana kesik
// çerçeveli çubuk; üstünde emir, şirket ve tarih. Fason satırı gibi kapasitesi yoktur; aynı günlerde bekleyen emirler alt alta dizilir.
// Çubuk yalnız bilgidir (taşınmaz); basınca emri seçer. Stoktan karşılanan, termini girilmemiş ve eksik malzeme çubuk olmaz (tabloda yazar).

export interface MalzemeCubugu { anahtar: string; emir: string; no: string; a: number; b: number; sirket: string; ad: string }

const sirketYazisi = (x: MalzemeSatiri): string => {
  const adlar = [...new Set(x.siparisler.flatMap((s) => (s.tedarikci === null ? [] : [s.tedarikci])))];
  if (adlar.length > 0) return adlar.join(', ');
  const nolu = x.siparisler.find((s) => s.no !== null);
  return nolu ? `${nolu.talep ? 'talep' : 'sipariş'} ${nolu.no ?? ''}` : x.siparisler.some((s) => s.talep) ? 'onaylı talep' : 'sipariş';
};

export function malzemeCubuklari(malzeme: EmirMalzemeleri | null | undefined, m: { simdi: number; bas: number; emirler: readonly KokpitEmri[] }, zaman: (t: number) => string): MalzemeCubugu[] {
  if (!malzeme) return [];
  const l: MalzemeCubugu[] = [];
  for (const e of m.emirler) {
    (malzeme.satirlar[e.id] ?? []).forEach((x, i) => {
      if (x.durum !== 'geliyor' || x.an === null || x.an <= m.simdi) return;
      const sirket = sirketYazisi(x);
      l.push({ anahtar: `${e.id}:${x.kod}:${String(i)}`, emir: e.id, no: e.no, a: Math.max(m.simdi, m.bas), b: x.an, sirket, ad: `${e.no} · ${x.ad}: ${miktarYaz(x.siparisten, x.birim)} siparişten · ${sirket} · ${zaman(x.an)} geliyor` });
    });
  }
  return l.sort((p, q) => p.b - q.b || p.no.localeCompare(q.no, 'tr'));
}

// Yazısı sığsın diye çubuğun en az genişliği (px).
const EN_AZ = 96;
const yerYaz = (el: HTMLElement | null, x: number, w: number, serit: number): void => {
  if (!el) return;
  el.style.setProperty('--x', `${String(Math.round(x * 10) / 10)}px`);
  el.style.setProperty('--w', `${String(Math.round(w * 10) / 10)}px`);
  el.style.setProperty('--serit', String(serit));
};

export interface MalzemeSeridiOzellikleri {
  cubuklar: readonly MalzemeCubugu[];
  bas: number; px: number;
  zaman: (t: number) => string;
  secEmir: string | null;
  sec: (emir: string) => void;
  // Seçili kartın emirleri (verilince ötekiler soluk) ve süzgeç.
  yanan: ReadonlySet<string> | null;
  uyar: (emir: string) => boolean;
}

export function MalzemeSeridi({ cubuklar, bas, px, zaman, secEmir, sec, yanan, uyar }: MalzemeSeridiOzellikleri) {
  if (cubuklar.length === 0) return null;
  const sonlar: number[] = [];
  const yerler = cubuklar.map((c) => {
    const sol = (c.a - bas) * px, en = Math.max((c.b - c.a) * px, EN_AZ);
    let i = sonlar.findIndex((s) => s <= sol + 0.5);
    if (i < 0) { sonlar.push(0); i = sonlar.length - 1; }
    sonlar[i] = sol + en;
    return { sol, en, serit: i };
  });
  const emirSayisi = new Set(cubuklar.map((c) => c.emir)).size;
  return (
    <div className="tc-pyq-satir tc-pyq-malsatir" data-malzeme-satiri="" ref={(el) => { el?.style.setProperty('--seritler', String(sonlar.length)); }}>
      <div className="tc-pyq-bas" title="Gelişi beklenen malzeme: işin ilgili adımı bu tarihten önce başlamaz"><b>Malzeme</b><small>{emirSayisi} emir bekliyor</small></div>
      <div className="tc-pyq-alan">
        {cubuklar.map((c, k) => (
          <button
            type="button" key={c.anahtar} className="tc-pyq-malcubuk" data-malzeme-cubugu={c.emir} title={c.ad} aria-label={c.ad} aria-pressed={secEmir === c.emir}
            data-sonuk={uyar(c.emir) && (!yanan || yanan.has(c.emir)) ? undefined : ''}
            ref={(el) => { yerYaz(el, yerler[k]!.sol, yerler[k]!.en, yerler[k]!.serit); }} onClick={() => { sec(c.emir); }}
          ><b>{emirKuyrugu(c.no)}</b><span>{c.sirket} · {zaman(c.b)}</span></button>
        ))}
      </div>
    </div>
  );
}
