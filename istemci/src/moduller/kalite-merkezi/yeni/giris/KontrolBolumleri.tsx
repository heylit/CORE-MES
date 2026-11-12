import { useState } from 'react';
import type { KmGirisAyrintisi, KmGkkKontrolu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { DslAlani } from '#paylasilan/form-dsl.ts';
import { CokSatir, Dugme, Girdi, IsaretKutusu, Kart, Rozet, Secim } from '../../../../ortak/arayuz/index.ts';
import { YOK } from '../bicim.ts';

export type MaddeSonucu = KmGkkKontrolu['islemler'][number]['sonuc'];
export interface Seri { no: string; hatali: boolean }

const UCLU: { deger: MaddeSonucu; baslik: string }[] = [
  { deger: 'uygun', baslik: 'Uygun' }, { deger: 'uygun_degil', baslik: 'Uygun değil' }, { deger: 'bakilmadi', baslik: 'Bakılmadı' },
];
const SONUC_ADI: Record<MaddeSonucu, string> = { uygun: 'Uygun', uygun_degil: 'Uygun değil', bakilmadi: 'Bakılmadı' };
const SONUC_TONU = { uygun: 'tamam', uygun_degil: 'hata', bakilmadi: 'bilgi' } as const;

// Üç düğmeli seçim: dokunmatikte tek dokunuş; seçili düğme aria-pressed taşır.
function UcluSecim({ etiket, deger, sec, kilitli }: { etiket: string; deger: MaddeSonucu; sec: (d: MaddeSonucu) => void; kilitli: boolean }) {
  if (kilitli) return <Rozet ton={SONUC_TONU[deger]}>{SONUC_ADI[deger]}</Rozet>;
  return (
    <div className="tc-km-gkk-uclu" role="group" aria-label={etiket}>
      {UCLU.map((s) => (
        <button
          key={s.deger} type="button" aria-pressed={s.deger === deger}
          className={`tc-km-gkk-uclu-dugme tc-km-gkk-uclu-${s.deger}${s.deger === deger ? ' tc-km-gkk-uclu-secili' : ''}`}
          onClick={() => { sec(s.deger); }}
        >{s.baslik}</button>
      ))}
    </div>
  );
}

// Kartta olmayan alan yazılmaz (boş satır kalabalık yapar); hiç alan yoksa kart bunu söyler.
export const Bilgi = ({ ad, deger, mono = false }: { ad: string; deger: string | null; mono?: boolean }) => (deger === null ? null : (
  <div><dt>{ad}</dt><dd className={mono ? 'tc-km-gkk-mono' : undefined}>{deger}</dd></div>
));
const liste = (d: readonly string[]): string | null => (d.length === 0 ? null : d.join(', '));

// Malzeme kartının GKK'da bakılan ayrıntısı; kartta olmayan alan çizgiyle görünür, uydurulmaz.
export function MalzemeKarti({ a, parca }: { a: KmGirisAyrintisi; parca: boolean }) {
  return (
    <Kart baslik="Malzeme" simge="layers">
      <dl className="tc-km-gkk-bilgi">
        <Bilgi ad="Tür" deger={a.kartTuru} />
        <Bilgi ad="Cinsi" deger={a.cinsi} />
        <Bilgi ad="Kalite" deger={a.kalite} />
        <Bilgi ad="Form" deger={a.form} />
        <Bilgi ad="Durum" deger={a.durum} />
        <Bilgi ad="Yüzey / işlem" deger={a.yuzey} />
        <Bilgi ad="Standart" deger={liste(a.standartlar)} />
        <Bilgi ad="Tolerans" deger={a.tolerans} />
        <Bilgi ad="İstenen sertifika" deger={liste(a.istenenSertifikalar)} />
        <Bilgi ad="Menşe" deger={a.mensei} />
        {parca && <Bilgi ad="Resim no" deger={a.resimNo} mono />}
        {parca && <Bilgi ad="Revizyon" deger={a.revizyon} mono />}
      </dl>
    </Kart>
  );
}

interface Olcumler { olculer: KmGirisAyrintisi['olculer']; olculen: Record<string, string>; yaz: (ad: string, d: string) => void; kilitli: boolean }
export function OlcuKarti({ olculer, olculen, yaz, kilitli }: Olcumler) {
  return (
    <Kart baslik="Ölçüler" simge="ruler">
      {olculer.length === 0
        ? <p className="tc-km-gkk-soluk">Kartta ölçü yazılı değil.</p>
        : (
          <div className="tc-km-gkk-olculer">
            {olculer.map((o) => (
              <div key={o.ad} className="tc-km-gkk-olcu">
                <span className="tc-km-gkk-hucre"><b>{o.ad}</b><small>Kart: {o.deger}</small></span>
                {kilitli
                  ? <span className="tc-km-gkk-mono">{olculen[o.ad] ?? YOK}</span>
                  : <Girdi etiket={`${o.ad} ölçülen`} inputMode="decimal" value={olculen[o.ad] ?? ''} onChange={(e) => { yaz(o.ad, e.target.value); }} />}
              </div>
            ))}
          </div>
        )}
    </Kart>
  );
}

interface Maddeler { baslik: string; simge: 'list' | 'wrench'; anahtarlar: readonly string[]; baslikOf: (a: string) => string; secim: Record<string, MaddeSonucu>; sec: (a: string, d: MaddeSonucu) => void; kilitli: boolean; bos?: string }
export function MaddeKarti({ baslik, simge, anahtarlar, baslikOf, secim, sec, kilitli, bos }: Maddeler) {
  const degil = anahtarlar.filter((a) => secim[a] === 'uygun_degil').length;
  return (
    <Kart baslik={baslik} simge={simge}>
      {anahtarlar.length === 0 && bos ? <p className="tc-km-gkk-soluk">{bos}</p> : (
        <ul className="tc-km-gkk-maddeler">
          {anahtarlar.map((a) => (
            <li key={a} className="tc-km-gkk-madde">
              <span>{baslikOf(a)}</span>
              <UcluSecim etiket={baslikOf(a)} deger={secim[a] ?? 'bakilmadi'} sec={(d) => { sec(a, d); }} kilitli={kilitli} />
            </li>
          ))}
        </ul>
      )}
      {degil > 0 && <p className="tc-km-gkk-soluk">{String(degil)} madde uygun değil.</p>}
    </Kart>
  );
}

// 3118 v3: şablonun bir bölümü. Açık formda madde üç düğmeyle, alan şablondaki türüyle girilir; kapalı kayıtta kaydın içindeki
// şablon kopyası okunur (şablon sonra değişse de kayıt aynı görünür).
export interface GorunenBolum {
  baslik: string;
  maddeler: { metin: string; sonuc: MaddeSonucu }[];
  alanlar: { etiket: string; deger: string; tanim: DslAlani | null }[];
}
interface BolumOzellikleri {
  b: GorunenBolum;
  kilitli: boolean;
  madde: (sira: number, d: MaddeSonucu) => void;
  alan: (sira: number, d: string) => void;
  eksik: (sira: number) => boolean;
}
export function SablonBolumu({ b, kilitli, madde, alan, eksik }: BolumOzellikleri) {
  const degil = b.maddeler.filter((m) => m.sonuc === 'uygun_degil').length;
  return (
    <Kart baslik={b.baslik || 'Kontrol maddeleri'} simge="list">
      {b.maddeler.length > 0 && (
        <ul className="tc-km-gkk-maddeler">
          {b.maddeler.map((m, i) => (
            <li key={`${String(i)}-${m.metin}`} className="tc-km-gkk-madde">
              <span>{m.metin}</span>
              <UcluSecim etiket={m.metin} deger={m.sonuc} sec={(d) => { madde(i, d); }} kilitli={kilitli} />
            </li>
          ))}
        </ul>
      )}
      {b.alanlar.length > 0 && (kilitli
        ? <dl className="tc-km-gkk-bilgi">{b.alanlar.map((x) => <div key={x.etiket}><dt>{x.etiket}</dt><dd>{x.deger || YOK}</dd></div>)}</dl>
        : (
          <div className="tc-km-gkk-alanlar">
            {b.alanlar.map((x, i) => <SablonAlani key={x.etiket} x={x} yaz={(d) => { alan(i, d); }} eksik={eksik(i)} />)}
          </div>
        ))}
      {degil > 0 && <p className="tc-km-gkk-soluk">{String(degil)} madde uygun değil.</p>}
    </Kart>
  );
}

function SablonAlani({ x, yaz, eksik }: { x: GorunenBolum['alanlar'][number]; yaz: (d: string) => void; eksik: boolean }) {
  const t = x.tanim;
  const zorunlu = t?.zorunlu ?? false;
  const hata = eksik ? 'Bu alan zorunlu.' : undefined;
  if (t?.tur === 'cokSatir') return <CokSatir etiket={x.etiket} required={zorunlu} hata={hata} maxLength={2000} value={x.deger} onChange={(e) => { yaz(e.target.value); }} />;
  if (t?.tur === 'secim') {
    return (
      <Secim etiket={x.etiket} required={zorunlu} hata={hata} value={x.deger} bosSecenek="Seçiniz" onChange={(e) => { yaz(e.target.value); }}
        secenekler={(t.secenekler ?? []).filter((d) => d !== '').map((d) => ({ deger: d, baslik: d }))} />
    );
  }
  if (t?.tur === 'isaretler') {
    const secili = x.deger === '' ? [] : x.deger.split(', ');
    return (
      <fieldset className="tc-km-gkk-isaretler">
        <legend>{x.etiket}{zorunlu ? ' *' : ''}</legend>
        {(t.secenekler ?? []).map((d) => (
          <IsaretKutusu key={d} etiket={d} checked={secili.includes(d)}
            onChange={(e) => { yaz((t.secenekler ?? []).filter((y) => (y === d ? e.target.checked : secili.includes(y))).join(', ')); }} />
        ))}
        {hata && <p className="tc-km-gkk-hata" role="alert">{hata}</p>}
      </fieldset>
    );
  }
  return (
    <Girdi etiket={x.etiket} required={zorunlu} hata={hata} maxLength={2000} value={x.deger} onChange={(e) => { yaz(e.target.value); }}
      {...(t?.tur === 'tarih' ? { type: 'date' } : t?.tur === 'sayi' ? { inputMode: 'decimal' as const } : {})} />
  );
}

// Seri listesi: okutucu ya da elle; yapıştırılan çok satır ayrı seri olur, tekrar eden eklenmez.
export function SeriKarti({ seriler, yaz, kilitli }: { seriler: Seri[]; yaz: (s: Seri[]) => void; kilitli: boolean }) {
  const [metin, metinYaz] = useState('');
  const ekle = () => {
    const yeni = metin.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => x !== '' && !seriler.some((s) => s.no === x));
    if (yeni.length > 0) yaz([...seriler, ...[...new Set(yeni)].map((no) => ({ no, hatali: false }))]);
    metinYaz('');
  };
  const hatali = seriler.filter((s) => s.hatali).length;
  return (
    <Kart baslik={`Seri numaraları (${String(seriler.length)})`} simge="list">
      {!kilitli && (
        <div className="tc-km-gkk-seri-ekle">
          <Girdi
            etiket="Seri no" value={metin} onChange={(e) => { metinYaz(e.target.value); }} ipucu="Okutun ya da yazın; birden çok seri boşlukla ayrılır."
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ekle(); } }}
          />
          <Dugme tur="ikincil" simge="plus" onClick={ekle} disabled={metin.trim() === ''}>Ekle</Dugme>
        </div>
      )}
      {seriler.length === 0
        ? <p className="tc-km-gkk-soluk">{kilitli ? 'Seri girilmedi.' : 'Seri listesi isteğe bağlıdır.'}</p>
        : (
          <ul className="tc-km-gkk-seriler">
            {seriler.map((s) => (
              <li key={s.no} className={s.hatali ? 'tc-km-gkk-seri tc-km-gkk-seri-hatali' : 'tc-km-gkk-seri'}>
                <span className="tc-km-gkk-mono">{s.no}</span>
                {kilitli
                  ? <Rozet ton={s.hatali ? 'hata' : 'tamam'}>{s.hatali ? 'Hatalı' : 'Uygun'}</Rozet>
                  : (
                    <>
                      <button type="button" className={s.hatali ? 'tc-km-gkk-uclu-dugme tc-km-gkk-uclu-uygun_degil' : 'tc-km-gkk-uclu-dugme'} aria-pressed={s.hatali} aria-label={`${s.no} hatalı`}
                        onClick={() => { yaz(seriler.map((x) => (x.no === s.no ? { ...x, hatali: !x.hatali } : x))); }}>
                        {s.hatali ? 'Hatalı' : 'Uygun'}
                      </button>
                      <Dugme tur="ikincil" simge="x" aria-label={`${s.no} çıkar`} onClick={() => { yaz(seriler.filter((x) => x.no !== s.no)); }} />
                    </>
                  )}
              </li>
            ))}
          </ul>
        )}
      {hatali > 0 && <p className="tc-km-gkk-soluk">{String(hatali)} seri hatalı; sonuçta hatalı miktar olarak önerilir.</p>}
    </Kart>
  );
}
