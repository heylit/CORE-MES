import { useEffect, useState, type ReactNode } from 'react';
import type { SekmeAnahtari } from '../sekmeler.ts';
import type { RrYetkisi } from '../yetki.ts';
import { sayi } from '../bicim.ts';
import { sayiGirisi, type Adim, type Bagimlilik } from './kurallar.ts';
import type { RotaDuzeni } from './useRotaDuzeni.ts';

// Seçim düzenleme panelinin konusudur. Giren ve yan ürünün kimliği yoktur: adımdaki sırasıyla bulunur.
export type Secim =
  | { tur: 'urun'; urunId: string; nid: string; miktar: number }
  | { tur: 'adim'; urunId: string; adimId: string; seq: number; miktar: number }
  | { tur: 'giren' | 'yan'; urunId: string; adimId: string; sira: number; nid: string; miktar: number }
  | { tur: 'adimEkle'; urunId: string; sonraId: string | null }
  | { tur: 'girenEkle' | 'yanEkle'; urunId: string; adimId: string; yerine: number | null }
  | { tur: 'yeniRota' };

export interface RotaEkrani {
  duzen: RotaDuzeni;
  yetki: RrYetkisi;
  secim: Secim | null;
  sec: (s: Secim | null) => void;
  git: (anahtar: SekmeAnahtari, kimlik?: string) => void;
  kokSec: (urunId: string) => void;
  kapali: ReadonlySet<string>;
  kapaliDegistir: (nid: string) => void;
  // İş merkezinin ortalama günlük net saati (vardiya takviminden; okunamazsa 8).
  gunSaati: (wcId: string | null) => number;
  // Operasyon paletini açar; eklenecek yer seçimden gelir (seçili adımın ardı ya da adimEkle seçiminin sonraId'si).
  paletAc: () => void;
  // Sürükleme sürerken şemada bırakma şeritleri görünür.
  surukleniyor: boolean;
  surukleBasla: () => void;
  surukleBitti: () => void;
}

export const BAG_ADI: Readonly<Record<Bagimlilik, string>> = { bagimli: 'Bağımlı', ortulu: 'Örtülü', bagimsiz: 'Bağımsız' };
export const bagMetni = (a: Adim): string => (a.dep === 'ortulu' ? `örtülü: ${sayi(a.depQty ?? 1)} adet çıkınca`
  : a.dep === 'bagimsiz' ? 'bağımsız: beklemez' : 'bağımlı: önceki bitince');

// İstasyon rengi: kimliğe göre altı tasarım renginden biri (sabit renk yazılmaz).
export const renkSinifi = (id: string | null): string => (id === null || !/^\d+$/.test(id) ? 'tc-rr1-renk-yok' : `tc-rr1-renk-${String(Number(id) % 6)}`);

export function fasonAdi(firmalar: readonly { id: string; code: string | null; name: string }[] | null | undefined, id: string | null): string {
  const f = (firmalar ?? []).find((x) => x.id === id);
  return f ? `${f.code ? `${f.code} ` : ''}${f.name}` : `Fason firma #${id ?? '?'}`;
}

// Sayı alanı: yazarken yerel kalır, alandan çıkınca ya da Enter ile işlenir (her tuşta taslak yazılmaz). Boş metin null'dır.
export function SayiAlani({ etiket, deger, yaz, kapali, yerTutucu, birim, ipucu }: {
  etiket: string; deger: number | null; yaz: (v: number | null) => void; kapali?: boolean; yerTutucu?: string; birim?: string; ipucu?: string;
}) {
  const metin = deger === null ? '' : String(deger).replace('.', ',');
  const [yerel, setYerel] = useState(metin);
  useEffect(() => { setYerel(metin); }, [metin]);
  const isle = () => {
    if (yerel === metin) return;
    const v = sayiGirisi(yerel);
    if (yerel.trim() !== '' && v === null) { setYerel(metin); return; }
    yaz(v);
  };
  return (
    <label className="tc-rr1-alan">
      <span>{etiket}</span>
      <span className="tc-rr1-alan-ic">
        <input
          className="tc-rr1-sayi" inputMode="decimal" value={yerel} disabled={kapali} placeholder={yerTutucu} aria-label={etiket}
          onChange={(e) => { setYerel(e.target.value); }} onBlur={isle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); isle(); } }}
        />
        {birim && <small>{birim}</small>}
      </span>
      {ipucu && <small className="tc-rr1-ipucu">{ipucu}</small>}
    </label>
  );
}

export function MetinAlani({ etiket, deger, yaz, kapali, yerTutucu, enCok }: {
  etiket: string; deger: string; yaz: (v: string) => void; kapali?: boolean; yerTutucu?: string; enCok?: number;
}) {
  const [yerel, setYerel] = useState(deger);
  useEffect(() => { setYerel(deger); }, [deger]);
  const isle = () => { if (yerel !== deger) yaz(yerel); };
  return (
    <label className="tc-rr1-alan">
      <span>{etiket}</span>
      <input
        className="tc-rr1-metin" value={yerel} disabled={kapali} placeholder={yerTutucu} maxLength={enCok} aria-label={etiket}
        onChange={(e) => { setYerel(e.target.value); }} onBlur={isle}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); isle(); } }}
      />
    </label>
  );
}

export function SecimAlani({ etiket, deger, secenekler, yaz, kapali, bos }: {
  etiket: string; deger: string; secenekler: readonly { deger: string; baslik: string }[]; yaz: (v: string) => void; kapali?: boolean; bos?: string;
}) {
  return (
    <label className="tc-rr1-alan">
      <span>{etiket}</span>
      <select className="tc-rr1-secim" value={deger} disabled={kapali} aria-label={etiket} onChange={(e) => { yaz(e.target.value); }}>
        {bos !== undefined && <option value="">{bos}</option>}
        {secenekler.map((s) => <option key={s.deger} value={s.deger}>{s.baslik}</option>)}
      </select>
    </label>
  );
}

export function Bolme({ baslik, children, ek }: { baslik: ReactNode; children: ReactNode; ek?: string }) {
  return (
    <section className={`tc-rr1-isec${ek ? ` ${ek}` : ''}`}>
      <h4>{baslik}</h4>
      {children}
    </section>
  );
}

// Cihaz tercihi yalnız tarayıcıda; okunamazsa varsayılan.
export function tercihOku(anahtar: string, varsayilan: string): string {
  try { return localStorage.getItem(`tc-rr1-${anahtar}`) ?? varsayilan; } catch { return varsayilan; }
}
export function tercihYaz(anahtar: string, deger: string): void {
  try { localStorage.setItem(`tc-rr1-${anahtar}`, deger); } catch { /* tarayıcı depoyu kapattıysa tercih yalnız bu oturumda kalır */ }
}
