import { Dugme, Pencere } from '../../../../ortak/arayuz/index.ts';
import type { KartSecimNedeni } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import { durumAdi, durumRengi } from './Parcalar.tsx';
import type { Is } from './tipler.ts';

// 2928 a: kart okutulunca iş belirsizse operatör seçer; üstteki "Önerilen"dir. Atölye N2: aynı emrin işlerinde en küçük operasyon
// numaralı bitmemiş adım üstte. Montaj girdisinde (2933 a, Atölye D5 notu) önce çalışan iş, sonra en erken termin. Bilinmeyen değer sona,
// eşitte ekrandaki sıra korunur. Termin ISO tarihtir (YYYY-AA-GG), metin sırası tarih sırasıdır.
type Aday = Pick<Is, 'pkg' | 'state' | 'due'>;
export function adayDizisi(adaylar: readonly number[], isler: readonly Aday[], neden: KartSecimNedeni): number[] {
  const op = (i: number): number => {
    const n = (isler[i]?.pkg as { tmi?: { opNo?: unknown } } | undefined)?.tmi?.opNo;
    return typeof n === 'number' ? n : Number.POSITIVE_INFINITY;
  };
  const termin = (i: number): string => (typeof isler[i]?.due === 'string' && isler[i]!.due !== '' ? isler[i]!.due : '\uffff');
  const calisan = (i: number): number => (isler[i]?.state === 'running' ? 0 : 1);
  const kiyas = neden === 'montaj-girdisi'
    ? (a: number, b: number) => calisan(a) - calisan(b) || termin(a).localeCompare(termin(b)) || a - b
    : (a: number, b: number) => op(a) - op(b) || a - b;
  return [...adaylar].sort(kiyas);
}

const NEDEN_METNI: Readonly<Record<KartSecimNedeni, string>> = {
  'cok-is': 'Bu emrin burada birden çok işi var.',
  'calisan-is': 'Başka bir iş çalışıyor; hangi işin açılacağını onayla.',
  insanli: 'Montaj istasyonu: açılacak işi onayla.',
  'montaj-girdisi': 'Bu parça buradaki işlerin girdisi. Parçayı kullanacak işi seç; iş açılır, başlatılmaz.',
};

export function KartSecimi({ kart, alinan, neden, adaylar, isler, sec, kapat }: {
  kart: string; alinan: string | null; neden: KartSecimNedeni; adaylar: readonly number[]; isler: readonly Is[];
  sec: (i: number) => void; kapat: () => void;
}) {
  const dizi = adayDizisi(adaylar, isler, neden);
  const baslik = neden === 'montaj-girdisi' ? 'Montaj işini aç' : 'Hangi iş açılsın?';
  return (
    <Pencere acik kapat={kapat} baslik={baslik} alt={<Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>}>
      <p>{kart}{alinan !== null ? ` · ${alinan} alındı` : ''}</p>
      <p className="tc-ay1-soluk">{NEDEN_METNI[neden]}</p>
      <div role="list" aria-label="Açılabilecek işler">
        {dizi.map((i, sira) => {
          const o = isler[i]!;
          return (
            <div key={i} role="listitem">
              <button type="button" className="tc-ay1-is" data-durum={durumRengi(o.state)} onClick={() => sec(i)} aria-label={`${o.no} işini aç`}>
                <span className="tc-ay1-is-govde">
                  <span className="tc-ay1-is-no">{o.no}</span>
                  <span className="tc-ay1-is-parca">{o.part}</span>
                  <span className="tc-ay1-is-ayrinti"><span>{o.op}</span>{o.due ? <span>Termin {o.due}</span> : null}</span>
                  <span className="tc-ay1-is-rozetler">
                    <span className="tc-ay1-cip" data-durum={durumRengi(o.state)}><i aria-hidden="true" />{durumAdi(o.state)}</span>
                    {sira === 0 && dizi.length > 1 ? <span className="tc-ay1-cip" data-durum="bitti"><i aria-hidden="true" />Önerilen</span> : null}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </Pencere>
  );
}
