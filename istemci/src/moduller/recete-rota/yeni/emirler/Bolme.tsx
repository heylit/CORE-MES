import { useId, useState } from 'react';
import { EMIR_TURU_ADLARI, PARTI_ROTASI_GECERSIZ } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Girdi, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi } from '../bicim.ts';
import { turAdi } from './gorunum.ts';
import {
  AZAMI_EK_ADIM, AZAMI_PARTI, bolmeHesapla, esitBol, kolAdimiSec, kolOlur, type BolmeGirdisi, type BolmeSecimi, type BolmeSonucu, type BolmeTurRotasi,
  type EmirAdimi,
} from './kurallar.ts';


// Bölme seçimi (parti ve kol) ve önizleme: bugünkü ekranın düzeni. Seçim üst bileşende tutulur (yeni emir formu ya da emir ayrıntısı);
// burası yalnız seçimi değiştirir ve önizlemeyi çizer. Geçerliliğe Üretim Emirleri'nin ucu karar verir.
export type BolmeTuru = 'tek' | 'parti' | 'kol';
export interface EkAdimSecimi { tur: 'rework' | 'tamir' | 'ek'; sonra: number | null; opId: string; ad: string; ayar: string; birim: string; aciklama: string }
// turler[i] Parti i+1'in emir türüdür, kolTuru kolun; boş metin ana emrin türünü alır (sunucu da türsüz bölmede üstün türünü yazar).
// rotalar[i] (3578) Parti i+1'in elle seçilen rotasının kimliğidir; boş metin türün (ya da ana emrin) rotasıdır. rotaHatasi sunucunun
// "seçilen rota geçerli değil" cevabıdır: Parti rotası alanının altında kalır, seçim değişince ya da "Türün rotasına dön" ile kalkar.
export interface BolmeDurumu {
  tur: BolmeTuru | null; partiler: string[]; turler: string[]; rotalar: string[]; n: number | null; m: number | null; kolMiktar: string; kolTuru: string;
  ekler: EkAdimSecimi[]; rotaHatasi: { parti: number; ileti: string } | null;
}
export const bosBolme = (yeni: boolean): BolmeDurumu => ({
  tur: yeni ? 'tek' : null, partiler: ['', ''], turler: ['', ''], rotalar: ['', ''], n: null, m: null, kolMiktar: '', kolTuru: '', ekler: [], rotaHatasi: null,
});
// Sunucunun parti rotası reddi (422): yeni parti için sorulan ileti bununla eşleşir.
export const partiRotasiReddi = (ileti: string): boolean => ileti === PARTI_ROTASI_GECERSIZ;
// Açılan alt emirlerin elle seçilen rotaları, bolmeSonucu().siralar sırasıyla; seçilmediyse undefined (kolda rota yoktur).
export function altEmirRotalari(b: BolmeDurumu, siralar: readonly number[]): (number | undefined)[] {
  return b.tur === 'kol' ? [undefined] : siralar.map((i) => { const r = b.rotalar[i] ?? ''; return r === '' ? undefined : Number(r); });
}
// Parti sıra numarasının -i/-yi eki ("Parti 2'yi"): sayı adının son ünlüsüne göre.
const PARTI_EKI: Record<number, string> = { 1: 'i', 2: 'yi', 3: 'ü', 4: 'ü', 5: 'i', 6: 'yı', 7: 'yi', 8: 'i', 9: 'u', 10: 'u', 11: 'i', 12: 'yi', 13: 'ü', 14: 'ü', 15: 'i', 16: 'yı', 17: 'yi', 18: 'i', 19: 'u', 20: 'yi' };
export const partiBelirtme = (n: number): string => `Parti ${String(n)}'${PARTI_EKI[n] ?? 'i'}`;

// Açılacak alt emirlerin türleri, bolmeSonucu().partiler sırasıyla (boş bırakılan parti açılmaz); ana emrin türüyle aynıysa undefined.
export function altEmirTurleri(b: BolmeDurumu, siralar: readonly number[], anaTur: string): (string | undefined)[] {
  const sec = (t: string | undefined) => (t === undefined || t === '' || t === anaTur ? undefined : t);
  return b.tur === 'kol' ? [sec(b.kolTuru)] : siralar.map((i) => sec(b.turler[i]));
}
const TUR_SECENEKLERI = Object.entries(EMIR_TURU_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

export const EK_TURLERI = [{ deger: 'rework', baslik: 'Rework' }, { deger: 'tamir', baslik: 'Tamir' }, { deger: 'ek', baslik: 'Ek adım' }] as const;

export const bolmeSecimi = (b: BolmeDurumu): BolmeSecimi | null =>
  (b.tur === 'parti' ? { tur: 'parti', partiler: b.partiler } : b.tur === 'kol' ? { tur: 'kol', n: b.n, m: b.m, miktar: b.kolMiktar } : null);

export function bolmeSonucu(g: BolmeGirdisi, b: BolmeDurumu): BolmeSonucu | null {
  const s = bolmeSecimi(b);
  return s === null ? null : bolmeHesapla(g, s);
}

interface Ozellikler {
  yeni: boolean;
  // Ana emrin türü: parti ve kol türü seçilmezse bu tür kalır.
  anaTur: string;
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
  // 3578: partinin rotası (Parti rotası alanı); verilmezse alan, ayrı emir uyarısı ve sonuç tablosu çizilmez.
  rota?: PartiRotaKaynagi;
  // Adımı başlamış emirden ayrılamayan farklı rotalı parti için yeni emir formunu tür, adet ve rota dolu açar.
  yeniEmirAc?: (tur: string, adet: string, rotaId: number | null) => void;
}
// durum: ürünün rotaları (yeni emir formundaki ve ayrıntıdaki aynı sorgu). tekRota: ürünün tek rotası varsa salt okunur metin.
// ana: ana emrin rotası ve revizyonu (sonuç tablosunun ilk satırı). coz: partinin türü ve elle seçimi için sunucunun kuralıyla çözülmüş rota.
export interface PartiRotaKaynagi {
  durum: 'yukleniyor' | 'okunamadi' | 'hazir';
  yenile: () => void;
  tekRota: string | null;
  ana: string | null;
  coz: (tur: string, secilen: string) => BolmeTurRotasi | null;
}
const rotaMetni = (t: { ad: string; harf: string | null }) => `${t.ad} · ${t.harf === null ? 'yürürlükte değil' : `Rota ${t.harf}`}`;

const adimKisaltmasi = (opdefs: DurumCevabi['opdefs'], a: EmirAdimi | undefined): string =>
  (a ? opdefs?.find((d) => d.id === a.opId)?.abbr ?? a.ad : '?');

export function BolmePaneli({
  yeni, anaTur, girdi, adimlar, baslamis, opdefs, istasyonlar, deger: b, degistir, gonder, vazgec, mesgul = false, rota, yeniEmirAc,
}: Ozellikler) {
  const nedenKimligi = useId();
  // Tür değişince rotası boşa dönen partiler: satırda canlı not (sessiz sıfırlama olmaz).
  const [sifirlanan, setSifirlanan] = useState<ReadonlySet<number>>(new Set());
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
  const anaGibi = `Ana emirle aynı (${turAdi(anaTur)})`;
  // 3578: partinin rotası ve ayrı emir mi olacağı. Türü boş ya da ana emirle aynı olan parti da elle seçilen rotayla ayrı emir olabilir.
  const partiTuru = (i: number) => (b.turler[i] ?? '') === '' ? anaTur : b.turler[i]!;
  const rotaHazir = rota !== undefined && rota.durum === 'hazir' && rota.tekRota === null;
  const cozulen = (i: number) => (rotaHazir ? rota.coz(partiTuru(i), b.rotalar[i] ?? '') : null);
  const farkliPartiler = b.tur !== 'parti' ? [] : b.partiler.flatMap((p, i) => (p.trim() !== '' && cozulen(i)?.farkli ? [i] : []));
  const ayrilamaz = farkliPartiler.length > 0 && baslamis.length > 0;
  const ilkFarkli = farkliPartiler[0];
  const ilkFarkliAdet = ilkFarkli === undefined ? '' : b.partiler[ilkFarkli] ?? '';
  const yeniEmirNedeni = ilkFarkli === undefined ? '' : `Parti ${String(ilkFarkli + 1)} yeni emir olarak açılmalı`;
  const turSecimi = (etiket: string, deger: string, sec: (t: string) => void, ad?: string) => (
    <Secim etiket={etiket} aria-label={ad} value={deger} bosSecenek={anaGibi} secenekler={TUR_SECENEKLERI.filter((t) => t.deger !== anaTur)} onChange={(o) => { sec(o.target.value); }} />
  );

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
            {turSecimi('Kolun emir türü', b.kolTuru, (t) => { degistir({ ...b, kolTuru: t }); })}
            {kalan}
          </div>
          <p className="tc-rr3-ipucu">Kolda rota seçimi yoktur; kol ana emre birleşir, ana emrin rotasında kalır.</p>
        </>
      )}
      {b.tur === 'parti' && (
        <>
          <div className="tc-rr3-satir">{kalan}</div>
          <div className="tc-rr3-partiler">
            {b.partiler.map((t, i) => {
              const n = String(i + 1);
              const c = cozulen(i);
              const engel = ayrilamaz && t.trim() !== '' && c?.farkli === true;
              const hata = b.rotaHatasi?.parti === i ? b.rotaHatasi.ileti
                : engel && c ? `Parti ${n}: ${c.ad} rotası bu emrinkinden farklı ve bu emirde adım başladı; parti yeni emir olarak açılmalı. Yanlış adımlarla üretilmez.` : undefined;
              const rotaDegistir = (rotaId: string) => {
                setSifirlanan((s) => { const y = new Set(s); y.delete(i); return y; });
                degistir({ ...b, rotalar: b.partiler.map((_, k) => (k === i ? rotaId : b.rotalar[k] ?? '')), rotaHatasi: b.rotaHatasi?.parti === i ? null : b.rotaHatasi });
              };
              return (
                <div key={i} className="tc-rr3-parti" role="group" aria-label={`Parti ${n} adet, tür ve rota`} data-engel={engel ? '' : undefined}>
                  <Girdi
                    etiket={`Parti ${n}`} inputMode="decimal" value={t}
                    onChange={(o) => { degistir({ ...b, partiler: b.partiler.map((x, k) => (k === i ? o.target.value : x)) }); }}
                  />
                  {turSecimi('Emir türü', b.turler[i] ?? '', (tur) => {
                    if ((b.rotalar[i] ?? '') !== '') setSifirlanan((s) => new Set(s).add(i));
                    degistir({
                      ...b, turler: b.partiler.map((_, k) => (k === i ? tur : b.turler[k] ?? '')),
                      rotalar: b.partiler.map((_, k) => (k === i ? '' : b.rotalar[k] ?? '')), rotaHatasi: b.rotaHatasi?.parti === i ? null : b.rotaHatasi,
                    });
                  }, `Parti ${n} emir türü`)}
                  {rota !== undefined && rota.durum === 'yukleniyor' && (
                    <Secim etiket="Parti rotası" disabled value="" bosSecenek="Rotalar yükleniyor" secenekler={[]} />
                  )}
                  {rota !== undefined && rota.durum === 'okunamadi' && (
                    <>
                      <Secim etiket="Parti rotası" disabled value="" bosSecenek="Türün rotası" secenekler={[]} hata="Rotalar okunamadı; parti türün rotasıyla bölünür." />
                      {i === 0 && <Dugme simge="rotate" onClick={rota.yenile}>Yenile</Dugme>}
                    </>
                  )}
                  {rota !== undefined && rota.durum === 'hazir' && rota.tekRota !== null && (
                    <Girdi etiket="Parti rotası" readOnly tabIndex={-1} value={rota.tekRota} ipucu="Ürünün tek rotası; bütün partiler bunu kullanır" />
                  )}
                  {c !== null && (
                    <Secim
                      etiket="Parti rotası" value={c.secilenId === null ? '' : String(c.secilenId)} bosSecenek={c.bosBaslik}
                      secenekler={c.secenekler} hata={hata}
                      onChange={(o) => { rotaDegistir(o.target.value); }}
                    />
                  )}
                  {b.rotaHatasi?.parti === i && (
                    <Dugme onClick={() => { rotaDegistir(''); }}>Türün rotasına dön</Dugme>
                  )}
                  <p className="tc-rr3-parti-not" aria-live="polite">{sifirlanan.has(i) ? 'Emir türü değişti; parti rotası türün rotasına döndü.' : ''}</p>
                </div>
              );
            })}
          </div>
          <div className="tc-rr3-satir">
            <Dugme
              simge="plus" disabled={b.partiler.length >= AZAMI_PARTI}
              onClick={() => { degistir({ ...b, partiler: [...b.partiler, ''], turler: [...b.partiler.map((_, k) => b.turler[k] ?? ''), ''], rotalar: [...b.partiler.map((_, k) => b.rotalar[k] ?? ''), ''] }); }}
            >
              Parti ekle
            </Dugme>
            <Dugme
              simge="minus" disabled={b.partiler.length <= 1}
              onClick={() => {
                degistir({
                  ...b, partiler: b.partiler.slice(0, -1), turler: b.turler.slice(0, b.partiler.length - 1), rotalar: b.rotalar.slice(0, b.partiler.length - 1),
                  rotaHatasi: b.rotaHatasi?.parti === b.partiler.length - 1 ? null : b.rotaHatasi,
                });
              }}
            >
              Son partiyi çıkar
            </Dugme>
            <Dugme
              onClick={() => {
                const pay = esitBol(girdi.miktar, b.partiler.length);
                if (pay !== null) degistir({ ...b, partiler: b.partiler.map(() => String(pay)) });
              }}
            >
              Eşit böl
            </Dugme>
          </div>
          <div aria-live="polite">
            {ayrilamaz ? (
              <p className="tc-rr3-ipucu">{`Önce ${partiBelirtme((ilkFarkli ?? 0) + 1)} yeni emir olarak açın; kalan partiler sonra bugünkü gibi bölünür. Yeni emir sayfası açılınca bu paneldeki adetler kalmaz, kalan partileri yeniden girin.`}</p>
            ) : farkliPartiler.length > 0 ? (
              <p className="tc-rr3-ipucu">
                {`${farkliPartiler.map((i) => `Parti ${String(i + 1)}`).join(', ')}: rotası ana emrinkinden farklı; parti kendi rotasıyla ayrı emir olarak açılır, ana emre geri birleştirilmez. Ana emirde hiçbir adım başlamadığı için ayrılabilir.`}
              </p>
            ) : (
              <p className="tc-rr3-ipucu">Ana emirde kalan = emir miktarı − partiler. Boş bırakılan parti açılmaz. Türü seçilmeyen parti ana emrin türüyle açılır.</p>
            )}
          </div>
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
      {r && !ayrilamaz && b.tur === 'parti' && r.hazir && rotaHazir && (
        <PartiSonucu
          sonuc={r} girdi={girdi} anaTur={anaTur} ana={rota.ana}
          partiler={r.siralar.map((i, k) => ({ sira: i + 1, adet: r.partiler[k] ?? 0, tur: partiTuru(i), rota: cozulen(i) }))}
        />
      )}
      {r && !ayrilamaz && (
        <BolmeOnizleme
          sonuc={r} adimlar={adimlar} opdefs={opdefs} yeni={yeni} turler={[anaTur, ...altEmirTurleri(b, r.siralar, anaTur).map((t) => t ?? anaTur)]}
          ayri={(k) => (b.tur === 'parti' && k > 0 && farkliPartiler.includes(r.siralar[k - 1] ?? -1) ? cozulen(r.siralar[k - 1]!) : null)}
        />
      )}
      {!yeni && (b.tur === 'parti' || b.tur === 'kol') && (
        <div className="tc-rr3-satir">
          <Dugme
            tur="birincil" simge={b.tur === 'kol' ? 'route' : 'layers'} yukleniyor={mesgul} aria-disabled={ayrilamaz ? true : undefined}
            aria-describedby={ayrilamaz ? nedenKimligi : undefined} onClick={ayrilamaz ? undefined : gonder}
          >
            {b.tur === 'kol' ? 'Kolu ayır ve onaya gönder' : 'Partilere böl ve onaya gönder'}
          </Dugme>
          {ayrilamaz && ilkFarkli !== undefined && yeniEmirAc && (
            <Dugme simge="plus" onClick={() => { yeniEmirAc(partiTuru(ilkFarkli), ilkFarkliAdet, b.rotalar[ilkFarkli] === '' ? null : Number(b.rotalar[ilkFarkli])); }}>
              {`${partiBelirtme(ilkFarkli + 1)} yeni emir olarak aç`}
            </Dugme>
          )}
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
          {ayrilamaz && <span id={nedenKimligi} className="tc-rr3-neden">{yeniEmirNedeni}</span>}
        </div>
      )}
    </div>
  );
}

// 3578: partilerin sonucu; ilk satır ana emir (soluk). Dar ekranda satır kartı olur (başlıklar hücrelerin önünde yazılı, yatay kayma yok).
interface SonucPartisi { sira: number; adet: number; tur: string; rota: BolmeTurRotasi | null }
function PartiSonucu({ sonuc: r, girdi, anaTur, ana, partiler }: {
  sonuc: BolmeSonucu; girdi: BolmeGirdisi; anaTur: string; ana: string | null; partiler: SonucPartisi[];
}) {
  return (
    <div className="tc-rr3-sonuc-kap">
      <table className="tc-rr3-sonuc">
        <caption>Bölme sonucu</caption>
        <thead><tr><th scope="col">Emir</th><th scope="col">Tür</th><th scope="col">Rota</th><th scope="col">Adet</th><th scope="col">Sonuç</th></tr></thead>
        <tbody>
          <tr data-soluk="">
            <th scope="row">{girdi.anaAd}</th>
            <td data-l="Tür">{turAdi(anaTur)}</td>
            <td data-l="Rota">{ana ?? '-'}</td>
            <td data-l="Adet" className="tc-rr3-sonuc-adet">{r.kalan === null ? '-' : sayi(r.kalan)}</td>
            <td data-l="Sonuç">Ana emirde kalır</td>
          </tr>
          {partiler.map((p) => (
            <tr key={p.sira}>
              <th scope="row">{`Parti ${String(p.sira)}`}</th>
              <td data-l="Tür">{turAdi(p.tur)}</td>
              <td data-l="Rota">{p.rota === null ? '-' : rotaMetni(p.rota)}</td>
              <td data-l="Adet" className="tc-rr3-sonuc-adet">{sayi(p.adet)}</td>
              <td data-l="Sonuç" data-tur={p.rota?.farkli ? 'ayri' : 'alt'}>{p.rota?.farkli ? 'Ayrı emir; ana emre birleşmez' : 'Alt emir; ana emre bağlı'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// turler: satırların emir türü, satirlar sırasıyla (ilk satır ana emir). ayri: türün rotası farklıysa o rota; satır ayrı emir olur ve
// kendi rotasının adımlarını yazar (3296-2 a).
function BolmeOnizleme({ sonuc: r, adimlar, opdefs, yeni, turler, ayri }: {
  sonuc: BolmeSonucu; adimlar: readonly EmirAdimi[]; opdefs: DurumCevabi['opdefs']; yeni: boolean; turler: readonly string[];
  ayri: (satir: number) => BolmeTurRotasi | null;
}) {
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
                {r.satirlar.map((s, k) => {
                  const a = k > 0 ? ayri(k) : null;
                  if (a !== null) {
                    return (
                      <tr key={s.ad}>
                        <th scope="row">Yeni emir<small className="tc-rr3-bltur">{turAdi(turler[k]!)}</small></th>
                        <td colSpan={adimlar.length}>{`${rotaMetni(a)}, ayrı emir`}</td>
                      </tr>
                    );
                  }
                  return (
                  <tr key={s.ad}>
                    <th scope="row">{s.ad}{turler[k] !== undefined && <small className="tc-rr3-bltur">{turAdi(turler[k])}</small>}</th>
                    {s.hucreler.map((c, i) => (
                      <td key={i}>
                        <span className="tc-rr3-bar" data-tur={c ? s.tur : 'bos'}>
                          {c ? `${sayi(c.miktar)}${c.bitti ? ' ✓' : ''}` : s.bos?.[i] ?? ''}
                        </span>
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Dar ekranda tablo yatay kayar; ayrı emrin adımları tablonun dışında da okunur. */}
          {r.satirlar.flatMap((s, k) => {
            const t = turler[k];
            const a = k > 0 ? ayri(k) : null;
            return a === null || t === undefined ? [] : [(
              <p key={s.ad} className="tc-rr3-ipucu" data-ayri-emir="">
                {`Yeni emir (${turAdi(t)}, ${sayi(s.hucreler.find((c) => c)?.miktar ?? 0)} adet): ${rotaMetni(a)}: ${a.adimlar.map((x) => `${String(x.opNo ?? x.sira)} ${adimKisaltmasi(opdefs, x)}`).join(' · ')}`}
              </p>
            )];
          })}
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
