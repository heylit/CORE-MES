import { useEffect, useMemo, useRef, useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { planaAlOnizle, type PlanaAlOnizlemesi } from './plana-al.ts';
import { adimSecimleri, baslamaSaatleri, fasonMu, sureYaz, tasimaSaati, type AdimSecimi, type KokpitEmri, type KokpitModeli, type TurAdayi } from './kurallar.ts';

// Plansız emrin adım adım plana alınması (3229 a): her adımın karşısında rotadaki tezgâhları ve başlama saati. Seçilmeyeni sistem doldurur;
// yerleri ve bitişi sunucu önizlemesi verir. İlk adımın tezgâhı seçilmediyse adayları sırayla denenir, emri en erken bitiren alınır.
export interface AdimAdimOzellikleri {
  m: KokpitModeli; e: KokpitEmri;
  zaman: (t: number) => string;
  // Yazamayan kişide ve komut sürerken null.
  uygula: ((a: TurAdayi, gecBirakir: boolean) => void) | null;
  surum: number | null;
  bekle?: boolean;
}
type Sonuc = { tezgah: string; oz: PlanaAlOnizlemesi } | 'okunamadi' | null;

export function AdimAdim({ m, e, zaman, uygula, surum, bekle = false }: AdimAdimOzellikleri) {
  const [sec, setSec] = useState<Record<string, AdimSecimi>>({});
  const [sonuc, setSonuc] = useState<Sonuc>(null);
  const ilk = e.adimlar[0];
  const saatler = useMemo(() => baslamaSaatleri(m), [m]);
  const ilkSaat = tasimaSaati(ilk ? sec[ilk.id]?.baslangic ?? m.simdi : m.simdi, m.simdi);
  const adimlar = useMemo(() => adimSecimleri(e, sec), [e, sec]);
  const anahtar = JSON.stringify([e.id, ilk ? sec[ilk.id]?.tezgah ?? null : null, ilkSaat, adimlar]);
  // Ayrıntı ekranın altına taşabilir (768'de matrisin yanında); "Plana al" görünmeden adım seçtirmemek için açılışta görünür alana alınır.
  const alt = useRef<HTMLDivElement>(null);
  useEffect(() => { alt.current?.scrollIntoView?.({ block: 'nearest' }); }, []);
  useEffect(() => {
    if (bekle || surum === null || !ilk) return undefined;
    let gecerli = true;
    setSonuc(null);
    void (async () => {
      const secilen = sec[ilk.id]?.tezgah;
      let en: { tezgah: string; oz: PlanaAlOnizlemesi } | null = null, okundu = false;
      for (const tezgah of secilen === undefined ? ilk.adaylar.filter((t) => !fasonMu(t)) : [secilen]) {
        const oz = await planaAlOnizle({ emirId: e.id, tezgah, baslangic: ilkSaat, ...(adimlar.length > 0 ? { adimlar } : {}) }, surum);
        if (!gecerli) return;
        if (oz === null) continue;
        okundu = true;
        const iyi = (x: PlanaAlOnizlemesi): number => (x.gecerli ? x.bitis ?? x.isler[0]?.C ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY);
        if (en === null || (!en.oz.gecerli && oz.gecerli) || iyi(oz) < iyi(en.oz) - 0.01) en = { tezgah, oz };
      }
      setSonuc(en ?? (okundu ? null : 'okunamadi'));
    })();
    return () => { gecerli = false; };
    // Seçimler ve emir anahtarda toplanır; nesneler her çizimde yenidir.
  }, [anahtar, surum, bekle]);

  if (!ilk) return <p className="tc-pyq-not">Emrin rotasında adım yok; plana alınamaz.</p>;
  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  // Bir haftadan uzak saat tarihiyle yazılır: yalnız gün adı yanıltır.
  const an = (t: number): string => (t - m.bas >= 7 * 24 ? zaman(t) : zaman(t).slice(6));
  const oz = sonuc !== null && sonuc !== 'okunamadi' ? sonuc.oz : null;
  const yer = new Map((oz?.gecerli ? oz.isler : []).map((i) => [i.isId, i]));
  const degistir = (id: string, ek: AdimSecimi): void => {
    setSec((s) => { const y = { ...s[id], ...ek }; const { [id]: _, ...kalan } = s; return y.tezgah === undefined && y.baslangic === undefined ? kalan : { ...kalan, [id]: y }; });
  };
  const bitis = oz?.gecerli ? oz.bitis : null;
  const gec = bitis !== null && e.termin !== null ? bitis - e.termin : null;
  const secili = Object.keys(sec).length > 0;
  return (
    <div className="tc-pyq-aa">
      <ol>
        {e.adimlar.map((a, k) => {
          const s = sec[a.id] ?? {}, y = yer.get(a.id), fason = a.adaylar.every(fasonMu), onceki = k > 0 ? yer.get(e.adimlar[k - 1]?.id ?? '') : undefined;
          return (
            <li key={a.id} data-adim={a.id}>
              <b>{k + 1}. {a.ad}{y && <small>{sureYaz(y.C - y.S)}</small>}</b>
              {fason ? <small>Fason adım; sistem yerleştirir.</small> : (
                <>
                  <span className="tc-pyq-aa-cipler" role="group" aria-label={`${String(k + 1)}. adımın tezgâhı`}>
                    <button type="button" aria-pressed={s.tezgah === undefined} onClick={() => { degistir(a.id, { tezgah: undefined }); }}>Sistem seçsin</button>
                    {a.adaylar.filter((t) => !fasonMu(t)).map((t) => <button type="button" key={t} data-tezgah={t} aria-pressed={s.tezgah === t} onClick={() => { degistir(a.id, { tezgah: t }); }}>{kod(t)}</button>)}
                  </span>
                  <select aria-label={`${String(k + 1)}. adımın başlama saati`} value={s.baslangic === undefined ? '' : String(s.baslangic)} onChange={(ev) => { degistir(a.id, { baslangic: ev.target.value === '' ? undefined : Number(ev.target.value) }); }}>
                    <option value="">İlk boşluk (sistem)</option>
                    {saatler.map((t) => <option key={t} value={String(t)}>{zaman(t).slice(6)}</option>)}
                  </select>
                  <small data-sonuc="">
                    {y ? <><b>{kod(y.tezgah)}</b> {an(y.S)} – {zaman(y.C).slice(-5)} <span className="tc-pyq-aa-rozet" data-siz={s.tezgah !== undefined || s.baslangic !== undefined ? '' : undefined}>{s.tezgah !== undefined && s.baslangic !== undefined ? 'tezgâhı ve saati siz seçtiniz' : s.tezgah !== undefined ? 'tezgâhı siz seçtiniz' : s.baslangic !== undefined ? 'saati siz seçtiniz' : 'sistem seçti'}</span></> : sonuc === null ? 'hesaplanıyor' : oz?.gecerli ? 'yeri plan dizilince belli olur' : ''}
                    {y && s.baslangic !== undefined && y.S > s.baslangic + 0.01 && <em> {(onceki?.C ?? Number.NEGATIVE_INFINITY) > s.baslangic + 0.01 ? 'İstediğiniz saatte önceki adım bitmemiş' : 'Seçtiğiniz saatte tezgâh dolu'}; en erken {an(y.S)}</em>}
                  </small>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <p className="tc-pyq-not">Yalnız adımın rotasında tanımlı tezgâhlar seçilebilir.</p>
      <div className="tc-pyq-aa-alt" ref={alt}>
        <p role="status" data-d={oz !== null && !oz.gecerli ? 'gec' : gec !== null && gec > 0.01 ? 'gec' : undefined}>
          {sonuc === 'okunamadi' ? 'Önizleme okunamadı; sunucu plana alırken denetler.'
            : oz === null ? 'Hesaplanıyor'
              : !oz.gecerli ? oz.ileti ?? 'Bu seçimle plana alınamıyor.'
                : bitis === null ? 'Bitişi plan dizilince belli olur.'
                  : `Biter ${an(bitis)}${gec === null ? '' : gec > 0.01 ? ` · termini ${sureYaz(gec)} geçer` : ' · termine yetişir'}`}
        </p>
        <span>
          <Dugme
            tur="birincil" simge="check" disabled={!uygula || sonuc === null || (oz !== null && !oz.gecerli)}
            onClick={() => {
              const tezgah = sonuc !== null && sonuc !== 'okunamadi' ? sonuc.tezgah : sec[ilk.id]?.tezgah ?? ilk.adaylar.find((t) => !fasonMu(t));
              if (tezgah !== undefined) uygula?.({ isId: ilk.id, tezgah, baslangic: ilkSaat, planaAl: e.id, ...(adimlar.length > 0 ? { adimlar } : {}) }, gec !== null && gec > 0.01);
            }}
          >Plana al</Dugme>
          {secili && <Dugme tur="ikincil" onClick={() => { setSec({}); }}>Hepsini sistem seçsin</Dugme>}
        </span>
      </div>
    </div>
  );
}
