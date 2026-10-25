import { useState, type FormEvent } from 'react';
import { Dugme, Girdi, IsaretKutusu, Secim, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';

// Eski planlama yan sayfalarının "Veri gir" sihirbazı (zz24-sade.betik sdSihirbaz; tasarım koruma): sekmenin içinde açılır; adım şeridi,
// her adımda yalnız o adımın alanları, sonda "Kontrol et" özeti; Vazgeç, Geri, İleri, Kaydet. Değerler adımlar arasında korunur. Alan
// denetimi eski formOku iletileriyle yapılır. Dolu değerle ve belli bir adımdan açılabilir (eski isFormAc ve gvFormAc).

export type SihirbazDegeri = Record<string, string | boolean>;
export interface SihirbazAlani {
  k: string; ad: string; tur: 'secim' | 'sayi' | 'evet' | 'metin' | 'tarih';
  secenekler?: readonly (readonly [string, string])[]; zorunlu?: boolean; min?: number; max?: number; adim?: number; tam?: boolean; ipucu?: string;
}
export interface SihirbazAdimi { ad: string; ne?: string; k: readonly string[] }
// Dolu açılış: değerler ilk değerin üstüne yazılır; adım verilmezse değer varsa ilk adım atlanır. `geriSiniri` ile Geri başlangıç adımının altına
// inmez (eski ısı haritası formu, isBas).
export interface SihirbazAcilisi { deg?: SihirbazDegeri; adim?: number; geriSiniri?: boolean }
export interface SihirbazTanimi {
  id: string; ad: string; simge: SimgeAdi; ne: string;
  // Alanlar değerlere göre değişebilir (seçilen aileye göre ipucu gibi).
  alanlar: (d: SihirbazDegeri) => readonly SihirbazAlani[];
  adimlar: readonly SihirbazAdimi[];
  ilk: () => SihirbazDegeri;
  // Adım geçerliyse İleri'de çağrılır; sonraki adımın değerlerini doldurur (eski kaydın şimdiki değeri gibi).
  ileri?: (d: SihirbazDegeri, adim: number) => SihirbazDegeri | undefined;
  // Adım (0'dan) ya da kayıt (-1) için ek denetim: ileti ya da null.
  kontrol?: (d: SihirbazDegeri, adim: number) => string | null;
  // "Kaydet dediğinizde ..." cümlesinin sonu.
  sonuc: string;
  kaydet: (d: SihirbazDegeri) => void;
  bitti: (d: SihirbazDegeri) => string;
}

export function alanHatalari(alanlar: readonly SihirbazAlani[], d: SihirbazDegeri): string[] {
  const h: string[] = [];
  for (const a of alanlar) {
    if (a.tur === 'evet') continue;
    const ham = d[a.k];
    const v = typeof ham === 'string' ? ham.trim() : '';
    if (v === '') { if (a.zorunlu) h.push(`${a.ad} boş olamaz.`); continue; }
    if (a.tur !== 'sayi') continue;
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n)) { h.push(`${a.ad} sayı olmalı.`); continue; }
    if (a.min !== undefined && n < a.min) h.push(`${a.ad} en az ${a.min}.`);
    if (a.max !== undefined && n > a.max) h.push(`${a.ad} en çok ${a.max}.`);
    if (a.tam && !Number.isInteger(n)) h.push(`${a.ad} tam sayı olmalı.`);
  }
  return h;
}

function degerYaz(a: SihirbazAlani, v: string | boolean | undefined): string {
  if (a.tur === 'evet') return v === true ? 'Evet' : 'Hayır';
  if (typeof v !== 'string' || v.trim() === '') return '—';
  if (a.tur === 'secim') return a.secenekler?.find(([k]) => k === v)?.[1] ?? v;
  return v;
}

function acilisKur(tanim: SihirbazTanimi, acilis: SihirbazAcilisi | undefined): { adim: number; d: SihirbazDegeri } {
  const deg = acilis?.deg ?? {};
  const d = { ...tanim.ilk(), ...deg };
  const adim = Math.max(0, Math.min(acilis?.adim ?? (Object.keys(deg).length ? 1 : 0), tanim.adimlar.length));
  return { adim, d: adim >= 1 ? tanim.ileri?.(d, 0) ?? d : d };
}

export function Sihirbaz({ tanim, acilis, vazgec, bitti }: {
  tanim: SihirbazTanimi; acilis?: SihirbazAcilisi; vazgec: () => void; bitti: (metin: string) => void;
}) {
  const [ilk] = useState(() => acilisKur(tanim, acilis));
  const [adim, adimYaz] = useState(ilk.adim);
  const [d, dYaz] = useState<SihirbazDegeri>(ilk.d);
  const taban = acilis?.geriSiniri ? ilk.adim : 0;
  const [hata, hataYaz] = useState<string[]>([]);
  const { adimlar } = tanim;
  const alanlar = tanim.alanlar(d);
  const n = adimlar.length;
  const gorunen = new Set(adimlar.flatMap((g) => g.k));
  const degistir = (k: string, v: string | boolean): void => { dYaz((x) => ({ ...x, [k]: v })); hataYaz([]); };

  const ileri = (): void => {
    const g = adimlar[adim];
    if (!g) return;
    const h = alanHatalari(alanlar.filter((a) => g.k.includes(a.k)), d);
    const ek = tanim.kontrol?.(d, adim);
    if (ek) h.push(ek);
    if (h.length) { hataYaz(h); return; }
    const yeni = tanim.ileri?.(d, adim);
    if (yeni) dYaz(yeni);
    hataYaz([]);
    adimYaz(Math.min(n, adim + 1));
  };
  const gonder = (o: FormEvent): void => {
    o.preventDefault();
    if (adim < n) { ileri(); return; }
    const h = alanHatalari(alanlar.filter((a) => gorunen.has(a.k)), d);
    const ek = tanim.kontrol?.(d, -1);
    if (ek) h.push(ek);
    if (h.length) { hataYaz(h); return; }
    tanim.kaydet(d);
    bitti(tanim.bitti(d));
  };

  const alan = (a: SihirbazAlani) => {
    const v = d[a.k];
    if (a.tur === 'evet') return <IsaretKutusu key={a.k} etiket={a.ad} checked={v === true} onChange={(o) => { degistir(a.k, o.target.checked); }} />;
    if (a.tur === 'secim') {
      return (
        <Secim key={a.k} etiket={a.ad} ipucu={a.ipucu} required={a.zorunlu} bosSecenek="Seçiniz" value={typeof v === 'string' ? v : ''}
          secenekler={(a.secenekler ?? []).map(([k, ad]) => ({ deger: k, baslik: ad }))} onChange={(o) => { degistir(a.k, o.target.value); }} />
      );
    }
    if (a.tur === 'metin' || a.tur === 'tarih') {
      return (
        <Girdi key={a.k} etiket={a.ad} ipucu={a.ipucu} required={a.zorunlu} type={a.tur === 'tarih' ? 'date' : 'text'}
          placeholder={a.tur === 'metin' ? a.ipucu : undefined} value={typeof v === 'string' ? v : ''} onChange={(o) => { degistir(a.k, o.target.value); }} />
      );
    }
    return (
      <Girdi key={a.k} etiket={a.ad} ipucu={a.ipucu} required={a.zorunlu} type="number" inputMode="decimal" min={a.min} max={a.max}
        step={a.adim ?? (a.tam ? 1 : 'any')} value={typeof v === 'string' ? v : ''} onChange={(o) => { degistir(a.k, o.target.value); }} />
    );
  };

  const serit = [...adimlar.map((g) => g.ad), 'Kontrol et'];
  return (
    <section className="tc-sade-bolum tc-sade-sihir" aria-label={tanim.ad}>
      <h3 className="tc-sade-bas"><Simge ad={tanim.simge} boyut="k" />{tanim.ad}</h3>
      <ol className="tc-sade-adimlar">
        {serit.map((ad, i) => (
          <li key={ad} aria-current={i === adim ? 'step' : undefined} data-bitti={i < adim ? '' : undefined}>
            <span>{i < adim ? <Simge ad="check" boyut="k" /> : i + 1}</span>{ad}
          </li>
        ))}
      </ol>
      <form onSubmit={gonder} noValidate aria-label={tanim.ad}>
        {adimlar.map((g, i) => i === adim && (
          <fieldset key={g.ad} className="tc-sade-adim">
            <legend className="tc-gizli-etiket">{g.ad}</legend>
            {g.ne && <p className="tc-sade-adim-ne">{g.ne}</p>}
            <div className="tc-form">{alanlar.filter((a) => g.k.includes(a.k)).map(alan)}</div>
          </fieldset>
        ))}
        {adim === n && (
          <div className="tc-sade-adim">
            <p className="tc-sade-adim-ne">Kontrol edin. Kaydet dediğinizde {tanim.sonuc}</p>
            <dl className="tc-sade-ozet">
              {alanlar.filter((a) => gorunen.has(a.k)).map((a) => <div key={a.k}><dt>{a.ad}</dt><dd>{degerYaz(a, d[a.k])}</dd></div>)}
            </dl>
          </div>
        )}
        {hata.length > 0 && <p className="tc-sade-hata" role="alert">{hata.join(' ')}</p>}
        <div className="tc-sade-alt">
          <Dugme simge="x" onClick={vazgec}>Vazgeç</Dugme>
          <span className="tc-sade-ara" />
          {adim > taban && <Dugme simge="up" onClick={() => { hataYaz([]); adimYaz(adim - 1); }}>Geri</Dugme>}
          {/* Ayrı anahtar: aynı düğme öğesi tıklama içinde submit'e dönerse tarayıcı formu hemen gönderir (son adımda Kaydet'e basılmadan kayıt). */}
          {adim < n
            ? <Dugme key="ileri" tur="birincil" simge="next" onClick={ileri}>İleri</Dugme>
            : <Dugme key="kaydet" tur="birincil" simge="check" type="submit">Kaydet</Dugme>}
        </div>
      </form>
    </section>
  );
}
