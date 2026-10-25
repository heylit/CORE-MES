import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Simge, useBildirim, type BildirimTonu } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { YETKI_ADLARI } from '../cekirdek/sabitler.ts';
import { bip } from '../cekirdek/ses.ts';
import { istasyonListesi } from '../cekirdek/tesis.ts';
import type { Perm } from '../cekirdek/tipler.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { useArkon } from '../veri/baglam.ts';
import type { ArkonDeposu } from '../veri/depo.ts';
import { SaatSeridi, type Kisayol } from '../ortak/SaatSeridi.tsx';
import { aktifIsMerkezleri, csvDosyaAdi, csvMetni, type CsvHucresi, type Renk } from './kurallar.ts';
import './pano.css';

// A3 ve A4 sayfalarının ortak parçaları (pano-planlama.ts PageShell, Segs, WcFilter, useToast, putDoc, csvDownload; ortak-ayarlar.ts
// audit, allowed). Renk tasarım değişkeninden seçilir (data-renk), durum her zaman metniyle yazılır.

// Sayfa başlığı: simge, ad, sayfanın araçları, kısayollar, saat ve vardiya (Arkon'un kendi tema düğmesi yok: TMI teması geçerli).
export function SayfaCercevesi({ simge, baslik, ek, kisayollar, saatAlt, children }: {
  simge: SimgeAdi; baslik: string; ek?: ReactNode; kisayollar?: readonly Kisayol[]; saatAlt?: string; children: ReactNode;
}) {
  return (
    <div className="tc-ay3-sayfa">
      <header className="tc-ay3-baslik">
        <h2 className="tc-ay3-ad"><Simge ad={simge} />{baslik}</h2>
        {ek}
        <span className="tc-ay3-bosluk" />
        <SaatSeridi {...(kisayollar ? { kisayollar } : {})} {...(saatAlt ? { alt: saatAlt } : {})} />
      </header>
      {children}
    </div>
  );
}

export function Cip({ renk, simge, baslik, children }: { renk: Renk; simge?: SimgeAdi; baslik?: string; children: ReactNode }) {
  return (
    <span className="tc-ay3-cip" data-renk={renk} title={baslik}>
      {simge ? <Simge ad={simge} boyut="k" /> : <i aria-hidden="true" />}
      {children}
    </span>
  );
}

export interface SecmeliSecenek<K extends string | number> { k: K; etiket: string; sayi?: number | null }
// Sayfa içi seçim düğmeleri (Segs): basılı olan aria-pressed ile okunur.
export function Secmeli<K extends string | number>({ deger, secenekler, degistir, etiket }: {
  deger: K; secenekler: readonly SecmeliSecenek<K>[]; degistir: (k: K) => void; etiket: string;
}) {
  return (
    <div className="tc-ay3-secmeli" role="group" aria-label={etiket}>
      {secenekler.map((s) => (
        <button key={String(s.k)} type="button" aria-pressed={deger === s.k} onClick={() => degistir(s.k)}>
          {s.etiket}{s.sayi ? <b className="tc-ay3-secmeli-sayi">{s.sayi}</b> : null}
        </button>
      ))}
    </div>
  );
}

// İş merkezi süzgeci (WcFilter): tek iş merkezi varken çizilmez. A4 de kullanır.
export function IsMerkeziSuzgeci({ deger, degistir }: { deger: string; degistir: (v: string) => void }) {
  const { ayarlar } = useArkon();
  const wcs = aktifIsMerkezleri(ayarlar);
  if (wcs.length < 2) return null;
  return (
    <Secmeli etiket="İş merkezi" deger={deger} degistir={degistir} secenekler={[{ k: '', etiket: 'Tümü' }, ...wcs.map((w) => ({ k: w.id, etiket: w.name }))]} />
  );
}

// İstasyon seçimi (StationSelect): iş merkezine göre gruplu, tanımsız kayıtlı değer de görünür.
export function IstasyonSecimi({ deger, degistir, etiket = 'İstasyon', hepsi = false }: { deger: string; degistir: (v: string) => void; etiket?: string; hepsi?: boolean }) {
  const { ayarlar } = useArkon();
  const liste = istasyonListesi(ayarlar.tesis, hepsi);
  const wcs = ayarlar.tesis.wcs.filter((w) => liste.some((m) => m.wc === w.id));
  const serbest = liste.filter((m) => !ayarlar.tesis.wcs.some((w) => w.id === m.wc));
  return (
    <select className="tc-ay3-secim" aria-label={etiket} value={deger || ''} onChange={(o) => degistir(o.target.value)}>
      {!liste.some((m) => m.id === deger) && <option value={deger || ''}>{deger ? `${deger} · tanımsız istasyon` : 'İstasyon seç'}</option>}
      {wcs.map((w) => (
        <optgroup key={w.id} label={w.name}>
          {liste.filter((m) => m.wc === w.id).map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
        </optgroup>
      ))}
      {serbest.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
    </select>
  );
}

// Eski ekranın bildirim renkleri: yeşil ve mavi tamam, kırmızı hata, öteki bilgi.
export type Soyle = (ileti: string, ton?: BildirimTonu) => void;
export function useSoyle(): Soyle {
  const { bildir } = useBildirim();
  return useCallback((ileti: string, ton: BildirimTonu = 'tamam') => bildir(ton, ileti), [bildir]);
}

// Yetkisiz işlemde ses ve "Yetkin yok" (allowed); art arda basışta bir kez söylenir. Düğmeler zaten yetkiye göre gizlidir.
export function useYetkiDenetimi(): (k: Perm) => boolean {
  const { yetkiVar } = useArkon();
  const soyle = useSoyle();
  const son = useRef(0);
  return useCallback((k: Perm) => {
    if (yetkiVar(k)) return true;
    if (Date.now() - son.current > 1500) {
      son.current = Date.now();
      bip('nok');
      soyle(`Yetkin yok: ${YETKI_ADLARI[k] ?? k}`, 'hata');
    }
    return false;
  }, [yetkiVar, soyle]);
}

// Değişiklik günlüğü (audit): kaydın kişisi ve zamanı veri katmanından, tabletin istasyonu cihazdan.
export function gunlugeYaz(depo: ArkonDeposu, alan: string, islem: string, hedef: unknown, ayrinti?: string | null): void {
  void depo.Log.add('audit', { area: alan, action: islem, target: hedef == null ? '' : String(hedef), detail: ayrinti || null, machine: yerel.oku<string>('station') || null })
    .catch(() => { /* günlük yazılamazsa işlem yine geçerli (eski ekranla aynı) */ });
}

export function dosyaIndir(ad: string, icerik: string, tur: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([icerik], { type: tur }));
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  const birak = URL.revokeObjectURL.bind(URL);
  setTimeout(() => { birak(a.href); a.remove(); }, 500);
}
export const csvIndir = (ad: string, satirlar: readonly (readonly CsvHucresi[])[]): void => dosyaIndir(csvDosyaAdi(ad), csvMetni(satirlar), 'text/csv');

// Cihazda saklanan seçim (LS): sayfa süzgeci, sekme, aralık.
export function useYerelSecim<T>(anahtar: string, ilk: T): [T, (v: T) => void] {
  const [v, yaz] = useState<T>(() => yerel.oku<T>(anahtar) ?? ilk);
  return [v, useCallback((y: T) => { yaz(y); yerel.yaz(anahtar, y); }, [anahtar])];
}
