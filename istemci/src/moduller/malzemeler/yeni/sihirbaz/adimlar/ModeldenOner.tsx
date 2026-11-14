import { useDeferredValue, useState } from 'react';
import { Dugme, Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../../ortak/veri/api.ts';
import { fmt, kgFmt } from '../../bicim.ts';
import * as K from '../../kurallar/index.ts';
import { kesitYuvarlak, modelHamOnerileri, type ModelHamOnerisi, type ModelOlcusu, type OneriFormu } from '../../kurallar/model-onerisi.ts';
import type { KatalogKarti } from '../../tipler.ts';
import { useKartlar, useModelAnalizi, useModelListesi } from '../../veri.ts';
import { useSihirbaz } from '../baglam.ts';
import type { Taslak } from '../durum.ts';
import { aileler, formlar, sihirbazTaslagi } from '../turler.ts';
import { MetinAlani } from '../parcalar.tsx';

const KAYNAK = 'Kaynak model';
const VARSAYILAN_PAY = 2;
const VARSAYILAN_KESME = 3;

// Önerinin ölçüleriyle taslağın kopyası: ağırlık ve benzer kart sihirbazın kendi kurallarıyla hesaplanır. Ağırlık için boy kesim boyudur.
function aday(d: Taslak, o: ModelHamOnerisi, kesimle: boolean): Taslak {
  const dims: Record<string, number> = { ...o.dims };
  if (kesimle && o.kesimBoyuMm !== null) {
    if (o.form === 'levha') { dims['w'] = o.kesimEnMm ?? dims['w'] ?? 0; dims['l'] = o.kesimBoyuMm; } else dims['l'] = o.kesimBoyuMm;
  }
  return { ...d, form: o.form, dims, vmode: false, vsel: {} } as Taslak;
}

// Stokta aynı kesitte kart: boy (levhada plaka eni ve boyu) karttan karta değişir, kesit ve kalite aynıysa aynı malzemedir.
// Eşleme sihirbazın kendi "aynı kart" kuralıyla yapılır; ad eşlemesi dışarıda kalsın diye adaydaki ad boşaltılır.
const KESIT_DISI: Record<OneriFormu, readonly string[]> = { cubuk: ['l'], altigen: ['l'], lama: ['l'], levha: ['w', 'l'], blok: [] };
function stoktaKart(d: Taslak, o: ModelHamOnerisi, kartlar: readonly KatalogKarti[], b: Parameters<typeof K.benzerKartlar>[2]) {
  const temel = aday(d, o, false);
  temel.com = { ...temel.com, ad: '', eskiKod: '' };
  let benzer: ReturnType<typeof K.benzerKartlar>[number] | null = null;
  for (const x of kartlar) {
    if (x.kayit.form !== o.form || (x.kayit.tur ?? 'hammadde') !== 'hammadde') continue;
    const dims = { ...temel.dims };
    for (const k of KESIT_DISI[o.form]) { const v = x.kayit.dims?.[k]; if (typeof v === 'number') dims[k] = v; }
    const r = K.benzerKartlar({ ...temel, dims } as Taslak, [x.kayit], b)[0];
    if (r?.seviye === 'ayni') return r;
    if (r && benzer === null) benzer = r;
  }
  return benzer;
}

function olcuMetni(o: ModelHamOnerisi): string {
  const m = o.dims;
  const boy = o.kesimBoyuMm === null ? '' : ` × ${fmt(o.kesimBoyuMm)}`;
  if (o.form === 'cubuk') return `Ø${fmt(m['d'] ?? 0)}${boy}`;
  if (o.form === 'altigen') return `SW${fmt(m['s'] ?? 0)}${boy}`;
  if (o.form === 'lama') return `${fmt(m['a'] ?? 0)} × ${fmt(m['b'] ?? 0)}${boy}`;
  if (o.form === 'levha') return `t${fmt(m['t'] ?? 0)} · ${fmt(o.kesimEnMm ?? 0)} × ${fmt(o.kesimBoyuMm ?? 0)} kesim`;
  return `${fmt(m['a'] ?? 0)} × ${fmt(m['b'] ?? 0)} × ${fmt(m['h'] ?? 0)}`;
}

// Küçük kesit: dışta ham, içte parça (yuvarlak ya da dikdörtgen), arası taranmış talaş. Ölçek kutuya sığdırılır.
function KucukKesit({ m, o }: { m: ModelOlcusu; o: ModelHamOnerisi }) {
  const R = 28, d = o.dims;
  const enBuyuk = o.form === 'cubuk' ? d['d'] ?? 1 : o.form === 'altigen' ? (d['s'] ?? 1) / Math.cos(Math.PI / 6)
    : o.form === 'lama' ? Math.max(d['a'] ?? 1, d['b'] ?? 1) : o.form === 'levha' ? Math.max(o.kesimEnMm ?? 1, d['t'] ?? 1) : Math.max(d['b'] ?? 1, d['h'] ?? 1);
  const k = 44 / enBuyuk;
  const kutu = (g: number, y: number) => <rect x={R - (g * k) / 2} y={R - (y * k) / 2} width={g * k} height={y * k} />;
  const ham = o.form === 'cubuk' ? <circle cx={R} cy={R} r={((d['d'] ?? 0) / 2) * k} />
    : o.form === 'altigen' ? (
      <polygon points={[0, 1, 2, 3, 4, 5].map((i) => {
        const r = ((d['s'] ?? 0) / 2 / Math.cos(Math.PI / 6)) * k;
        return `${String(R + r * Math.cos((Math.PI / 3) * i))},${String(R + r * Math.sin((Math.PI / 3) * i))}`;
      }).join(' ')} />
    )
      : o.form === 'lama' ? kutu(d['a'] ?? 0, d['b'] ?? 0) : o.form === 'levha' ? kutu(o.kesimEnMm ?? 0, d['t'] ?? 0) : kutu(d['b'] ?? 0, d['h'] ?? 0);
  const parca = kesitYuvarlak(m) ? <circle cx={R} cy={R} r={(Math.max(m.b, m.c) / 2) * k} />
    : kutu(Math.max(m.b, m.c), Math.min(m.b, m.c));
  return (
    <svg className="tc-my-mo-kesit" viewBox={`0 0 ${String(2 * R)} ${String(2 * R)}`} aria-hidden="true">
      <defs><pattern id="tc-my-mo-tarama" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" className="tc-my-mo-tarama" /></pattern></defs>
      <g className="tc-my-mo-ham">{ham}</g>
      <g className="tc-my-mo-talas">{ham}</g>
      <g className="tc-my-mo-parca">{parca}</g>
    </svg>
  );
}

// 3243 a: "Form ve ölçüler" adımının başında 3B modelden öneri. Yalnız öneridir: seçilen ölçü forma yazılır, kart her zamanki
// kaydetmeyle oluşur. Stokta aynı ölçüde kart varsa önce o gösterilir (aynı kartı ikinci kez açmamak için).
export function ModeldenOner() {
  const { taslak: d, b, degistir, kartiAc } = useSihirbaz();
  const uygun = d.tur === 'hammadde' && !d.id && !d.vmode && !!d.fam;
  const [ara, araYaz] = useState('');
  const arananDeger = useDeferredValue(ara);
  const liste = useModelListesi(arananDeger, uygun);
  const [rev, revYaz] = useState<number | null>(null);
  const [pay, payYaz] = useState<number | string>(VARSAYILAN_PAY);
  const [kesme, kesmeYaz] = useState<number | string>(VARSAYILAN_KESME);
  const [secili, seciliYaz] = useState<number | null>(null);
  const [yazilan, yazilanYaz] = useState<string | null>(null);
  const satirlar = liste.data?.satirlar ?? [];
  const satir = satirlar.find((x) => x.revizyonId === rev) ?? null;
  const analiz = useModelAnalizi(uygun ? rev : null);
  const kartlar = useKartlar();
  if (!uygun) return null;
  // Yetkisi olmayan (geometri.oku) kullanıcıya şerit hiç görünmez.
  if (liste.error instanceof ApiHatasi && liste.error.durum === 403) return null;
  const f = d.fam ? aileler(b)[d.fam] : undefined;
  const payMm = typeof pay === 'number' ? pay : Number.NaN;
  const kesmeMm = typeof kesme === 'number' ? kesme : Number.NaN;
  const payHata = !(payMm >= 0) ? 'Sıfır ya da pozitif bir sayı yazın.' : null;
  const kesmeHata = !(kesmeMm >= 0) ? 'Sıfır ya da pozitif bir sayı yazın.' : null;
  const a = analiz.data?.analiz ?? null;
  const m: ModelOlcusu | null = a === null ? null : { a: a.obb.a, b: a.obb.b, c: a.obb.c, cap: a.obb.cap, hacimMm3: a.hacimMm3 ?? null };
  const gruplar = (form: OneriFormu) => K.presetGroups({ ...d, form, dims: {}, vmode: false } as Taslak, b);
  const oneriler = m === null || payHata || kesmeHata ? [] : modelHamOnerileri(m, payMm, kesmeMm, f?.forms ?? [], gruplar);
  const sec = secili === null ? null : oneriler[secili] ?? null;
  const benzer = (o: ModelHamOnerisi) => stoktaKart(d, o, kartlar.data ?? [], b);
  const secBenzer = sec === null ? null : benzer(sec);
  const kaynakMetni = satir === null ? '' : `${satir.malzemeKodu}${satir.revKodu ? ` Rev ${satir.revKodu}` : ''}, pay ${fmt(payMm)} mm`;

  const yaz = (o: ModelHamOnerisi) => {
    degistir((t) => {
      t.form = o.form;
      t.dims = { ...(formlar()[o.form]?.def ?? {}), ...o.dims };
      t.vsel = {};
      const ek = sihirbazTaslagi(t);
      ek.extra = [...(ek.extra ?? []).filter((x) => x.ad !== KAYNAK), { ad: KAYNAK, v: kaynakMetni, u: '' }];
    });
    yazilanYaz(`${formlar()[o.form]?.ad ?? o.form} ${olcuMetni(o)} forma yazıldı. Kaynak: ${kaynakMetni}.`);
  };

  return (
    <section className="tc-my-mo" aria-label="3B modelden öner">
      <div className="tc-my-mo-bas"><Simge ad="cube" /> <b>3B modelden öner</b><Rozet ton="pasif" gorunum="cizgi">yalnız öneri, kaydetmez</Rozet></div>
      <div className="tc-my-alanlar">
        <MetinAlani etiket="Model ara" tip="search" deger={ara} ipucu="Malzeme kodu ya da adı" yaz={(v) => { araYaz(String(v)); }} />
        <div className="tc-my-alan tc-my-alan-genis">
          <label htmlFor="tc-my-mo-model" className="tc-my-alan-etiket">Parçanın 3B modeli</label>
          <span className="tc-my-girdi">
            <select
              id="tc-my-mo-model" value={rev ?? ''}
              onChange={(e) => { const v = Number(e.target.value); revYaz(Number.isSafeInteger(v) && v > 0 ? v : null); seciliYaz(null); yazilanYaz(null); }}
            >
              <option value="">{liste.isPending ? 'Modeller okunuyor…' : satirlar.length === 0 ? 'Analizi bitmiş 3B model yok' : 'Model seçin'}</option>
              {satirlar.map((x) => (
                <option key={x.revizyonId} value={x.revizyonId}>{x.malzemeKodu} · {x.malzemeAdi ?? x.belgeAdi}{x.revKodu ? ` · Rev ${x.revKodu}` : ''}</option>
              ))}
            </select>
          </span>
        </div>
        <MetinAlani
          etiket="İşleme payı (her yüz)" sayi birim="mm" deger={pay} yaz={(v) => { payYaz(v); seciliYaz(null); yazilanYaz(null); }}
          alt={payHata ? <p className="tc-my-hata">{payHata}</p> : undefined}
        />
        <MetinAlani
          etiket="Kesme payı" sayi birim="mm" deger={kesme} yaz={(v) => { kesmeYaz(v); seciliYaz(null); yazilanYaz(null); }}
          alt={kesmeHata ? <p className="tc-my-hata">{kesmeHata}</p> : undefined}
        />
      </div>
      {liste.isError && !(liste.error instanceof ApiHatasi && liste.error.durum === 403) && <p className="tc-my-hata">{hataIletisi(liste.error, '3B modeller okunamadı.')}</p>}
      {rev !== null && analiz.isPending && <p className="tc-my-kucuk">Model ölçüsü okunuyor…</p>}
      {rev !== null && analiz.isError && <p className="tc-my-hata">{hataIletisi(analiz.error, 'Model ölçüsü okunamadı.')}</p>}
      {rev !== null && analiz.data && m === null && <p className="tc-my-kucuk">Bu modelin 3B analizi yok; öneri hesaplanamaz. 3D Atölyesi'nde bakın.</p>}
      {m !== null && (
        <p className="tc-my-mo-model">
          <Simge ad="ruler" /> Model ölçüsü <b>{fmt(m.a)} × {fmt(m.b)} × {fmt(m.c)} mm</b>
          {m.hacimMm3 !== null && <> · parça hacmi <b>{fmt(m.hacimMm3 / 1000)} cm³</b></>}
        </p>
      )}
      {m !== null && !payHata && !kesmeHata && oneriler.length === 0 && <p className="tc-my-kucuk">Bu ailenin formlarından öneri çıkmadı (çubuk, altıgen, lama, levha, blok).</p>}
      {oneriler.length > 0 && m !== null && (
        <div className="tc-my-mo-liste" role="group" aria-label="Ham önerileri">
          {oneriler.map((o, i) => {
            const w = K.weight(aday(d, o, true), b);
            const bz = benzer(o);
            return (
              <button key={o.form} type="button" className="tc-my-mo-oneri" aria-pressed={secili === i} onClick={() => { seciliYaz(i); yazilanYaz(null); }}>
                <span className="tc-my-mo-ust"><KucukKesit m={m} o={o} /><span><b>{formlar()[o.form]?.ad ?? o.form}</b><span className="tc-my-mo-olcu">{olcuMetni(o)}</span></span></span>
                <span className="tc-my-mo-rozetler">
                  {i === 0 && <Rozet ton="uyari">en az talaş</Rozet>}
                  {bz !== null ? <Rozet ton="tamam" gorunum="cizgi">{bz.seviye === 'ayni' ? 'kartı var' : 'benzer kart var'}</Rozet> : <Rozet ton="bilgi" gorunum="cizgi">yeni kart</Rozet>}
                  {o.standartDisi && <Rozet ton="pasif" gorunum="cizgi">standart dışı</Rozet>}
                </span>
                <span className="tc-my-mo-satir"><span>Ham ağırlık</span><b>{w ? kgFmt(w.kg, b.birim) : 'Yoğunluk gerekli'}</b></span>
                <span className="tc-my-mo-satir"><span>Talaş</span><b>{o.talas === null ? 'Hacim yok' : `%${fmt(Math.round(o.talas * 100))}`}</b></span>
                {o.talas !== null && <svg className="tc-my-mo-cubuk" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="4" /><rect className="tc-my-mo-cubuk-dolu" width={Math.round(o.talas * 100)} height="4" /></svg>}
                {bz !== null && <span className="tc-my-mo-satir"><span>Kart</span><b>{bz.x.com.kod}</b></span>}
              </button>
            );
          })}
        </div>
      )}
      {oneriler.length > 0 && (
        <div className="tc-my-mo-eylem">
          {sec !== null && secBenzer !== null && (
            <Dugme tur="birincil" simge="box" onClick={() => { kartiAc(String(secBenzer.x.id)); }}>{secBenzer.x.com.kod} kartını aç</Dugme>
          )}
          <Dugme tur={secBenzer !== null ? 'ikincil' : 'birincil'} simge="down" disabled={sec === null} onClick={() => { if (sec !== null) yaz(sec); }}>
            {secBenzer !== null ? 'Yine de yeni kart için yaz' : 'Ölçüleri forma yaz'}
          </Dugme>
          {sec === null && <span className="tc-my-kucuk">Bir öneri seçin.</span>}
          {sec !== null && secBenzer !== null && <span className="tc-my-kucuk">Bu ölçüde kart var; yeni kart açmak gerekmeyebilir.</span>}
        </div>
      )}
      {yazilan !== null && <p className="tc-my-tamam" role="status">{yazilan}</p>}
      <p className="tc-my-kucuk">Ölçü 3B analizin döndürülmüş kutusundan; kesit sihirbazın standart ölçülerine yukarı yuvarlanır. Bağlama ve alın payı ayrıca eklenmez.</p>
    </section>
  );
}
