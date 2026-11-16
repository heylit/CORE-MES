import { useEffect, useRef, useState } from 'react';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { adimCevabiUygula, adimYaz } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { useArkon, useArkonDurumu } from '../veri/baglam.ts';
import type { TmiAdim, TmiKanit, TmiKontrol } from '../veri/depo.ts';
import { YerelAdimlar } from './Adimlar.tsx';
import { MontajSahnesi } from './MontajSahnesi.tsx';
import type { Pkg } from './tipler.ts';

// 3338-4 a: operatör talimatları üç grupta. Ön hazırlık ve üretim hazırlığı "Başlamadan önce"dir (biri başka iş sürerken, öbürü ayarda;
// sunucu ikisini ayrı denetler). Açık grup işin durumundan gelir; öteki gruplar katlı durur, operatör açabilir.
export type TalimatGrubu = 'once' | 'sira' | 'son';
export const GRUPLAR: readonly { id: TalimatGrubu; ad: string; alt: string }[] = [
  { id: 'once', ad: 'Başlamadan önce', alt: 'Kurulum ve ilk kontrol' },
  { id: 'sira', ad: 'Üretim sırasında', alt: 'İş sürerken' },
  { id: 'son', ad: 'Bitince', alt: 'İş bittikten sonra' },
];
export const grubu = (a: Pick<TmiAdim, 'asama'>): TalimatGrubu =>
  a.asama === 'on_hazirlik' || a.asama === 'hazirlik' ? 'once' : a.asama === 'bitis' ? 'son' : 'sira';
// Sırada ve ayarda iş başlamamıştır; biten işte bitiş maddeleri kalır.
export const acikGrup = (durum: string): TalimatGrubu => (durum === 'queued' || durum === 'setup' ? 'once' : durum === 'done' ? 'son' : 'sira');
export const zorunluEksikler = (liste: readonly TmiAdim[], g: TalimatGrubu): TmiAdim[] => liste.filter((a) => a.zorunlu === true && !a.tamam && grubu(a) === g);

const TUR: Readonly<Record<TmiKontrol['tur'], { ad: string; simge: SimgeAdi }>> = {
  onay: { ad: 'Onay', simge: 'check' }, olcum: { ad: 'Ölçüm', simge: 'ruler' }, foto: { ad: 'Fotoğraf', simge: 'camera' }, secim: { ad: 'Seçim', simge: 'list' },
};
const sayiOku = (t: string): number | null => {
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
};
const sayiMetni = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
const kanitMetni = (a: TmiAdim): string | null => {
  const k = a.kanit;
  if (!a.tamam || !k) return null;
  if (k.olcum !== null) return `${sayiMetni(k.olcum)}${a.kontrol?.birim ? ` ${a.kontrol.birim}` : ''}`;
  return k.secim;
};
const sinirMetni = (k: TmiKontrol): string | null => {
  const b = k.birim ? ` ${k.birim}` : '';
  if (k.alt != null && k.ust != null) return `${sayiMetni(k.alt)}–${sayiMetni(k.ust)}${b}`;
  if (k.alt != null) return `en az ${sayiMetni(k.alt)}${b}`;
  if (k.ust != null) return `en çok ${sayiMetni(k.ust)}${b}`;
  return null;
};

// Liste Operator'da okunur: Başlat ve Bitir zorunlu eksikleri buradan sayar. Önizlemede ve yerel pakette sunucuya gidilmez.
export interface Talimatlar { liste: TmiAdim[] | null; hata: string | null; isaretle: (id: number, tamam: boolean, kanit?: TmiKanit) => void }
export function useTalimatlar(emirId: number | null, onizleme: boolean): Talimatlar {
  const { depo } = useArkon();
  const durum = useArkonDurumu();
  const sunucu = emirId !== null && !onizleme && durum.mode === 'server';
  const [liste, listeYaz] = useState<TmiAdim[] | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const suruyor = useRef(new Set<number>());
  useEffect(() => {
    listeYaz(null); hataYaz(null);
    if (!sunucu || emirId === null) return;
    let canli = true;
    depo.Server.tmiAdimlari(emirId).then((l) => { if (canli) listeYaz(l); }, () => { if (canli) { listeYaz([]); hataYaz('Talimatlar alınamadı'); } });
    return () => { canli = false; };
  }, [depo, emirId, sunucu]);
  const isaretle = (id: number, tamam: boolean, kanit?: TmiKanit) => {
    if (!sunucu || emirId === null || suruyor.current.has(id)) return;
    suruyor.current.add(id);
    hataYaz(null);
    listeYaz((l) => l && adimYaz(l, id, (x) => ({ ...x, tamam })));
    depo.Server.tmiAdimIsaretle(emirId, id, tamam, kanit)
      .then((c) => listeYaz((l) => l && adimCevabiUygula(l, id, c)))
      .catch((e: unknown) => {
        listeYaz((l) => l && adimYaz(l, id, (x) => ({ ...x, tamam: !tamam })));
        hataYaz(`Kaydedilmedi · ${(e instanceof Error && e.message) || 'CORE kabul etmedi'}`);
      })
      .finally(() => { suruyor.current.delete(id); });
  };
  return { liste: sunucu ? liste : null, hata, isaretle };
}

// Ölçüm ve seçim maddesi kutuya dokununca değer ister; fotoğraf terminalde çekilmez, madde onay gibi işaretlenir.
function Madde({ a, kapali, isaretle }: { a: TmiAdim; kapali: boolean; isaretle: Talimatlar['isaretle'] }) {
  const [acik, acikYaz] = useState(false);
  const [deger, degerYaz] = useState('');
  const k = a.kontrol ?? null;
  const degerli = k !== null && (k.tur === 'olcum' || k.tur === 'secim');
  const sinir = k?.tur === 'olcum' ? sinirMetni(k) : null;
  const sayi = sayiOku(deger);
  // Sınır dışı değer de kaydedilir (sunucu işaretler); operatör yazarken görür.
  const disarida = k?.tur === 'olcum' && sayi !== null && ((k.alt != null && sayi < k.alt) || (k.ust != null && sayi > k.ust));
  const dokun = () => {
    if (kapali) return;
    if (a.tamam) { isaretle(a.id, false); return; }
    if (degerli) { acikYaz((x) => !x); return; }
    isaretle(a.id, true);
  };
  const ad = `${a.ad}${a.zorunlu ? ' · zorunlu' : ''}`;
  return (
    <li className="tc-ay1-tl-madde" data-tamam={a.tamam ? '' : undefined}>
      <button type="button" className="tc-ay1-tl-kutu" aria-pressed={a.tamam} aria-label={a.tamam ? `${ad} · işareti kaldır` : ad} disabled={kapali} onClick={dokun}>
        {a.tamam ? <Simge ad="check" /> : null}
      </button>
      <span className="tc-ay1-tl-metin">
        <span className="tc-ay1-tl-ad">{a.ad}</span>
        {a.aciklama ? <small>{a.aciklama}</small> : null}
        <span className="tc-ay1-tl-etiketler">
          {a.zorunlu ? <em data-zorunlu="">Zorunlu</em> : null}
          {k !== null && k.tur !== 'onay' ? <em><Simge ad={TUR[k.tur].simge} boyut="k" />{TUR[k.tur].ad}{k.tur === 'olcum' && k.ad ? ` · ${k.ad}` : ''}{sinir ? ` · ${sinir}` : ''}</em> : null}
          {kanitMetni(a) ? <b className="tc-ay1-mono">{kanitMetni(a)}</b> : null}
        </span>
        {acik && !a.tamam && k?.tur === 'olcum' ? (
          <span className="tc-ay1-tl-deger">
            <label>{k.ad || 'Ölçüm'}<input inputMode="decimal" value={deger} onChange={(e) => degerYaz(e.target.value)} aria-label={`${a.ad} · ${k.ad || 'ölçüm'}`} />{k.birim ? <small>{k.birim}</small> : null}</label>
            {disarida ? <small className="tc-ay1-tl-disarida" role="status"><Simge ad="alert" boyut="k" />Sınır dışı{sinir ? ` · ${sinir}` : ''}</small> : null}
            <button type="button" className="tc-ay1-tl-tamam" disabled={sayi === null} onClick={() => { if (sayi !== null) { isaretle(a.id, true, { olcum: sayi }); acikYaz(false); degerYaz(''); } }}>Tamam</button>
          </span>
        ) : null}
        {acik && !a.tamam && k?.tur === 'secim' ? (
          <span className="tc-ay1-tl-deger" role="group" aria-label={`${a.ad} · seçim`}>
            {(k.secenekler ?? []).map((s) => <button key={s} type="button" className="tc-ay1-tl-tamam" onClick={() => { isaretle(a.id, true, { secim: s }); acikYaz(false); }}>{s}</button>)}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function TalimatListesi({ t, durum, kapali, adimlar, isEmriId }: {
  t: Talimatlar; durum: string; kapali: boolean; adimlar: Pkg['steps'] | undefined; isEmriId: number | null;
}) {
  const [secili, seciliYaz] = useState<Partial<Record<TalimatGrubu, boolean>>>({});
  const acilan = acikGrup(durum);
  // Sunucuya bağlı değilse (önizleme, yerel paket) paketin adımları düz liste kalır.
  if (t.liste === null && t.hata === null) return adimlar ? <YerelAdimlar adimlar={adimlar} /> : <DurumKutusu durum="yukleniyor" mesaj="Talimatlar yükleniyor" />;
  const liste = t.liste ?? [];
  return (
    <div className="tc-ay1-talimatlar">
      {t.hata ? <p className="tc-ay1-hata" role="alert">{t.hata}</p> : null}
      {isEmriId !== null && liste.length > 0 ? <MontajSahnesi isEmriId={isEmriId} adimlar={liste} /> : null}
      {liste.length === 0 && !t.hata ? <p className="tc-ay1-soluk">Bu işin talimatı yok</p> : null}
      {liste.length === 0 ? null : GRUPLAR.map((g) => {
        const l = liste.filter((a) => grubu(a) === g.id);
        if (l.length === 0) return null;
        const acik = secili[g.id] ?? g.id === acilan;
        const eksik = zorunluEksikler(l, g.id).length;
        return (
          <section key={g.id} className="tc-ay1-tl-grup" data-acik={acik ? '' : undefined} data-simdi={g.id === acilan ? '' : undefined}>
            <h3>
              <button type="button" aria-expanded={acik} onClick={() => seciliYaz((x) => ({ ...x, [g.id]: !acik }))}>
                <Simge ad={acik ? 'down' : 'chev-right'} boyut="k" /><b>{g.ad}</b><small>{g.alt}</small>
                {eksik > 0 ? <em>{eksik} zorunlu eksik</em> : null}
                <span className="tc-ay1-mono">{l.filter((a) => a.tamam).length}/{l.length}</span>
              </button>
            </h3>
            {acik ? <ol>{l.map((a) => <Madde key={a.id} a={a} kapali={kapali} isaretle={t.isaretle} />)}</ol> : null}
          </section>
        );
      })}
    </div>
  );
}
