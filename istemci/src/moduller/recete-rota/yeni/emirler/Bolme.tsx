import type { DurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { Dugme, Girdi, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi } from '../bicim.ts';
import {
  AZAMI_EK_ADIM, AZAMI_PARTI, bolmeHesapla, esitBol, kolAdimiSec, kolOlur, type BolmeGirdisi, type BolmeSecimi, type BolmeSonucu, type EmirAdimi,
} from './kurallar.ts';

// Bölme seçimi (parti ve kol) ve önizleme: bugünkü ekranın düzeni. Seçim üst bileşende tutulur (yeni emir formu ya da emir ayrıntısı);
// burası yalnız seçimi değiştirir ve önizlemeyi çizer. Geçerliliğe Üretim Emirleri'nin ucu karar verir.
export type BolmeTuru = 'tek' | 'parti' | 'kol';
export interface EkAdimSecimi { tur: 'rework' | 'tamir' | 'ek'; sonra: number | null; opId: string; ad: string; ayar: string; birim: string; aciklama: string }
export interface BolmeDurumu { tur: BolmeTuru | null; partiler: string[]; n: number | null; m: number | null; kolMiktar: string; ekler: EkAdimSecimi[] }
export const bosBolme = (yeni: boolean): BolmeDurumu => ({ tur: yeni ? 'tek' : null, partiler: ['', ''], n: null, m: null, kolMiktar: '', ekler: [] });

const EK_TURLERI = [{ deger: 'rework', baslik: 'Rework' }, { deger: 'tamir', baslik: 'Tamir' }, { deger: 'ek', baslik: 'Ek adım' }] as const;

export const bolmeSecimi = (b: BolmeDurumu): BolmeSecimi | null =>
  (b.tur === 'parti' ? { tur: 'parti', partiler: b.partiler } : b.tur === 'kol' ? { tur: 'kol', n: b.n, m: b.m, miktar: b.kolMiktar } : null);

export function bolmeSonucu(g: BolmeGirdisi, b: BolmeDurumu): BolmeSonucu | null {
  const s = bolmeSecimi(b);
  return s === null ? null : bolmeHesapla(g, s);
}

interface Ozellikler {
  yeni: boolean;
  girdi: BolmeGirdisi;
  adimlar: readonly EmirAdimi[];
  baslamis: readonly number[];
  opdefs: DurumCevabi['opdefs'];
  istasyonlar: DurumCevabi['stations'];
  deger: BolmeDurumu;
  degistir: (b: BolmeDurumu) => void;
  // Mevcut emirde gönder ve vazgeç düğmeleri (yeni emirde emir açılırken gönderilir).
  gonder?: () => void;
  vazgec?: () => void;
  mesgul?: boolean;
}

const adimKisaltmasi = (opdefs: DurumCevabi['opdefs'], a: EmirAdimi | undefined): string =>
  (a ? opdefs?.find((d) => d.id === a.opId)?.abbr ?? a.ad : '?');

export function BolmePaneli({ yeni, girdi, adimlar, baslamis, opdefs, istasyonlar, deger: b, degistir, gonder, vazgec, mesgul = false }: Ozellikler) {
  const az = !kolOlur(adimlar.length);
  const r = bolmeSonucu(girdi, b);
  const ad = (j: number) => `${String(j)} ${adimKisaltmasi(opdefs, adimlar[j - 1])}`;
  const turler: { k: BolmeTuru; baslik: string; simge?: 'layers' | 'route' }[] = [
    ...(yeni ? [{ k: 'tek' as const, baslik: 'Tek emir' }] : []), { k: 'parti', baslik: 'Partilere böl', simge: 'layers' }, { k: 'kol', baslik: 'Kol ayır', simge: 'route' },
  ];
  const kalan = (
    <Girdi etiket="Ana emirde kalan" readOnly tabIndex={-1} value={r?.kalan === null || r?.kalan === undefined ? '' : sayi(r.kalan)} />
  );
  const yerler = b.tur === 'kol'
    ? (b.n !== null && b.m !== null ? adimlar.map((a) => a.sira).filter((j) => j > b.n! && j < b.m!) : [])
    : adimlar.map((a) => a.sira).filter((j) => j >= girdi.aralik.ilk && j <= girdi.aralik.son && !baslamis.includes(j));
  const ekGorunur = !yeni && (b.tur === 'parti' || (b.tur === 'kol' && b.n !== null && b.m !== null));
  const ekDegistir = (i: number, alan: Partial<EkAdimSecimi>) => { degistir({ ...b, ekler: b.ekler.map((e, k) => (k === i ? { ...e, ...alan } : e)) }); };

  return (
    <div className="tc-rr3-bolme" role="group" aria-label={yeni ? 'Bölme' : 'Böl'}>
      <div className="tc-rr3-secici" role="group" aria-label={yeni ? 'Bölme' : 'Bölme türü'}>
        {turler.map((t) => (
          <Dugme
            key={t.k} simge={t.simge} aria-pressed={b.tur === t.k} disabled={t.k === 'kol' && az}
            title={t.k === 'kol' && az ? 'Kol için rotada en az 3 adım olmalı' : undefined}
            onClick={() => { degistir({ ...b, tur: t.k }); }}
          >
            {t.baslik}
          </Dugme>
        ))}
      </div>
      {b.tur === null && (
        <p className="tc-rr3-ipucu">
          <b>Partilere böl:</b> miktar ayrı emirlere ayrılır, her parti bütün adımları yapar. <b>Kol ayır:</b> miktarın bir kısmı seçtiğiniz
          adımları ayrı bir emirde yapar, sonra ana emre katılır.{az ? ' Bu rotada kol için en az 3 adım gerekir.' : ''}
        </p>
      )}
      {b.tur === 'kol' && (
        <>
          <p className="tc-rr3-ipucu">Önce kolun ayrılacağı adımı, sonra ana emre birleşeceği adımı seçin. Aradaki adımları kol yapar.</p>
          <div className="tc-rr3-satir">
            <span className="tc-rr3-cip">Ayrılma: {b.n === null ? 'seçilmedi' : `${ad(b.n)} sonrası`}</span>
            <span className="tc-rr3-cip">Birleşme: {b.m === null ? 'seçilmedi' : ad(b.m)}</span>
            <Dugme onClick={() => { degistir({ ...b, n: null, m: null }); }}>Seçimi temizle</Dugme>
          </div>
          <AdimSeridi
            etiket="Rota adımları" adimlar={adimlar} opdefs={opdefs} istasyonlar={istasyonlar} baslamis={baslamis}
            durum={(j) => (b.n === j ? ['ayril', 'Kol bu adımdan sonra ayrılır'] : b.m === j ? ['birles', 'Ana emre birleşir']
              : b.n !== null && b.m !== null && j > b.n && j < b.m ? ['kol', 'Kol yapar'] : ['', baslamis.includes(j) ? 'Başlamış' : ''])}
            secili={(j) => b.n === j || b.m === j}
            sec={(j) => { degistir({ ...b, ...kolAdimiSec(b.n, b.m, j, adimlar.length) }); }}
          />
          <div className="tc-rr3-satir">
            <Girdi etiket="Kol miktarı" inputMode="decimal" value={b.kolMiktar} onChange={(o) => { degistir({ ...b, kolMiktar: o.target.value }); }} />
            {kalan}
          </div>
        </>
      )}
      {b.tur === 'parti' && (
        <>
          <div className="tc-rr3-satir">
            {kalan}
            {b.partiler.map((t, i) => (
              <Girdi
                key={i} etiket={`Parti ${String(i + 1)}`} inputMode="decimal" value={t}
                onChange={(o) => { degistir({ ...b, partiler: b.partiler.map((x, k) => (k === i ? o.target.value : x)) }); }}
              />
            ))}
          </div>
          <div className="tc-rr3-satir">
            <Dugme simge="plus" disabled={b.partiler.length >= AZAMI_PARTI} onClick={() => { degistir({ ...b, partiler: [...b.partiler, ''] }); }}>Parti ekle</Dugme>
            <Dugme simge="minus" disabled={b.partiler.length <= 1} onClick={() => { degistir({ ...b, partiler: b.partiler.slice(0, -1) }); }}>Son partiyi çıkar</Dugme>
            <Dugme
              onClick={() => {
                const pay = esitBol(girdi.miktar, b.partiler.length);
                if (pay !== null) degistir({ ...b, partiler: b.partiler.map(() => String(pay)) });
              }}
            >
              Eşit böl
            </Dugme>
          </div>
          <p className="tc-rr3-ipucu">Ana emirde kalan = emir miktarı − partiler. Boş bırakılan parti açılmaz.</p>
        </>
      )}
      {ekGorunur && (
        <div className="tc-rr3-ek" role="group" aria-label="Rework, tamir ya da ek adım">
          <h4>Rework, tamir ya da ek adım</h4>
          {b.ekler.length === 0 && (
            <p className="tc-rr3-ipucu">
              {b.tur === 'kol' ? 'Kol' : 'Ayrılan parti'} rotada olmayan bir adım yapacaksa buradan ekleyin; adı boşsa operasyonun adı kullanılır,
              açıklamayı operatör görür.{b.tur === 'parti' ? ' Yalnız tek parti ayrılırken eklenir.' : ''}
            </p>
          )}
          {b.ekler.map((e, i) => {
            const no = String(i + 1);
            return (
              <div key={i} className="tc-rr3-satir" role="group" aria-label={`Ek adım ${no}`}>
                <Secim etiket="Tür" secenekler={EK_TURLERI} value={e.tur} onChange={(o) => { ekDegistir(i, { tur: o.target.value as EkAdimSecimi['tur'] }); }} />
                <Secim
                  etiket="Yeri" value={e.sonra === null || !yerler.includes(e.sonra) ? '' : String(e.sonra)}
                  bosSecenek={b.tur === 'kol' ? 'Kolun başına' : 'Partinin başına'}
                  secenekler={yerler.map((j) => ({ deger: String(j), baslik: `${ad(j)} sonrasına` }))}
                  onChange={(o) => { ekDegistir(i, { sonra: o.target.value === '' ? null : Number(o.target.value) }); }}
                />
                <Secim
                  etiket="Operasyon" value={e.opId} bosSecenek="Seçin"
                  secenekler={(opdefs ?? []).filter((d) => d.aktif || d.id === e.opId).map((d) => ({ deger: d.id, baslik: `${d.abbr ?? d.code} ${d.name}` }))}
                  onChange={(o) => { ekDegistir(i, { opId: o.target.value }); }}
                />
                <Girdi etiket="Adı" value={e.ad} onChange={(o) => { ekDegistir(i, { ad: o.target.value }); }} />
                <Girdi etiket="Hazırlık dk" inputMode="decimal" value={e.ayar} onChange={(o) => { ekDegistir(i, { ayar: o.target.value }); }} />
                <Girdi etiket="Birim dk" inputMode="decimal" value={e.birim} onChange={(o) => { ekDegistir(i, { birim: o.target.value }); }} />
                <Girdi etiket="Açıklama" value={e.aciklama} onChange={(o) => { ekDegistir(i, { aciklama: o.target.value }); }} />
                <Dugme simge="trash" aria-label={`Ek adım ${no} kaldır`} onClick={() => { degistir({ ...b, ekler: b.ekler.filter((_, k) => k !== i) }); }}>Kaldır</Dugme>
              </div>
            );
          })}
          <div className="tc-rr3-satir">
            <Dugme
              simge="plus" disabled={b.ekler.length >= AZAMI_EK_ADIM}
              onClick={() => { degistir({ ...b, ekler: [...b.ekler, { tur: 'rework', sonra: null, opId: '', ad: '', ayar: '', birim: '', aciklama: '' }] }); }}
            >
              Rework, tamir ya da ek adım
            </Dugme>
          </div>
        </div>
      )}
      {r && <BolmeOnizleme sonuc={r} adimlar={adimlar} opdefs={opdefs} yeni={yeni} />}
      {!yeni && (b.tur === 'parti' || b.tur === 'kol') && (
        <div className="tc-rr3-satir">
          <Dugme tur="birincil" simge={b.tur === 'kol' ? 'route' : 'layers'} yukleniyor={mesgul} onClick={gonder}>
            {b.tur === 'kol' ? 'Kolu ayır ve onaya gönder' : 'Partilere böl ve onaya gönder'}
          </Dugme>
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
        </div>
      )}
    </div>
  );
}

function BolmeOnizleme({ sonuc: r, adimlar, opdefs, yeni }: { sonuc: BolmeSonucu; adimlar: readonly EmirAdimi[]; opdefs: DurumCevabi['opdefs']; yeni: boolean }) {
  return (
    <>
      {r.ipucu && <p className="tc-rr3-ipucu">{r.ipucu}</p>}
      {r.ileti && (
        <p className="tc-rr3-uyari" role="status" data-bilgi={r.bilgi ? '' : undefined}><Simge ad="alert" boyut="k" />{r.ileti}</p>
      )}
      {r.hazir && (
        <div className="tc-rr3-onizleme">
          <h4>Bölünce ne olacak</h4>
          <div className="tc-rr3-kaydir">
            <table className="tc-rr3-bltablo" aria-label="Bölme önizlemesi">
              <thead>
                <tr><th scope="col">Emir</th>{adimlar.map((a) => <th key={a.sira} scope="col">{a.sira} {adimKisaltmasi(opdefs, a)}</th>)}</tr>
              </thead>
              <tbody>
                {r.satirlar.map((s) => (
                  <tr key={s.ad}>
                    <th scope="row">{s.ad}</th>
                    {s.hucreler.map((c, i) => (
                      <td key={i}>
                        <span className="tc-rr3-bar" data-tur={c ? s.tur : 'bos'}>
                          {c ? `${sayi(c.miktar)}${c.bitti ? ' ✓' : ''}` : s.bos?.[i] ?? ''}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tc-rr3-ipucu">
            Her hücre, o emrin o adımda yapacağı miktardır; boş hücre emrin o adımı yapmadığını gösterir.
            {yeni ? ' Emir bu şekilde bölünmüş olarak açılır.' : ' Değişiklik Plan stüdyosuna taslak olarak gider; onaylanınca canlı plana geçer.'}
          </p>
        </div>
      )}
    </>
  );
}

// Adım şeridi (kol seçimi ve katılma adımı): her adım bir düğme; durum sınıfı ve kısa yazı seçimin anlamını söyler.
export function AdimSeridi({ etiket, adimlar, opdefs, istasyonlar, baslamis = [], durum, secili, sec }: {
  etiket: string;
  adimlar: readonly EmirAdimi[];
  opdefs: DurumCevabi['opdefs'];
  istasyonlar: DurumCevabi['stations'];
  baslamis?: readonly number[];
  durum: (j: number) => [string, string];
  secili: (j: number) => boolean;
  sec: (j: number) => void;
}) {
  return (
    <div className="tc-rr3-serit" role="group" aria-label={etiket}>
      {adimlar.map((a) => {
        const [sinif, yazi] = durum(a.sira);
        const kisa = adimKisaltmasi(opdefs, a);
        const istasyon = istasyonlar?.find((x) => x.id === a.stationId)?.name ?? '';
        return (
          <button
            key={a.sira} type="button" className="tc-rr3-adim" data-durum={sinif || undefined} data-basladi={baslamis.includes(a.sira) ? '' : undefined}
            aria-pressed={secili(a.sira)} aria-label={`${String(a.sira)}. adım ${kisa}${yazi ? `: ${yazi}` : ''}`}
            onClick={() => { sec(a.sira); }}
          >
            <small>{a.sira}</small><b>{kisa}</b><small>{istasyon}</small><span>{yazi}</span>
          </button>
        );
      })}
    </div>
  );
}
