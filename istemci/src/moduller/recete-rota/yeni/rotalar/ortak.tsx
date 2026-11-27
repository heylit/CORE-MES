import { useEffect, useState, type ReactNode } from 'react';
import type { SekmeAnahtari } from '../sekmeler.ts';
import type { RrYetkisi } from '../yetki.ts';
import { sayi } from '../bicim.ts';
import { AramaliSecim, Simge, type AramaliSecenek } from '../../../../ortak/arayuz/index.ts';
import { sayiGirisi, type Adim, type Bagimlilik } from './kurallar.ts';
import type { Haritalar, RotaDuzeni } from './useRotaDuzeni.ts';

// Seçim düzenleme panelinin konusudur. Giren ve yan ürünün kimliği yoktur: adımdaki sırasıyla bulunur.
export type Secim =
  | { tur: 'urun'; urunId: string; nid: string; miktar: number }
  | { tur: 'adim'; urunId: string; adimId: string; seq: number; miktar: number }
  | { tur: 'giren' | 'yan'; urunId: string; adimId: string; sira: number; nid: string; miktar: number }
  // dal: "Buradan kol aç" (2542 A); eklenecek ilk adım bu yeni kola düşer. katilir: 3248-2 bağımsız dalın ana hatta katıldığı adım.
  | { tur: 'adimEkle'; urunId: string; sonraId: string | null; dal?: string; katilir?: string }
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
  // 2558 b/9: odak kipi. Odaktaki adım ortalanır ve yakınlaşır, öteki adımlar solar; Düzenleme paneli onun için açılır. null: odak yok.
  odak: { urunId: string; adimId: string } | null;
  odakla: (o: { urunId: string; adimId: string } | null) => void;
  // 2558 b/6: ara (statülü) kart kutuları varsayılan olarak gizli; operasyon kutusu "Statülü" rozetini taşır.
  araKartlar: boolean;
  // Sürükleme sürerken şemada bırakma şeritleri görünür.
  surukleniyor: boolean;
  // 3248-2: yatay hat görünümü açık; adım alanında şeritte "Öne / Geriye" düğmeleri bunun içindir.
  hatli: boolean;
  surukleBasla: () => void;
  surukleBitti: () => void;
}

export const BAG_ADI: Readonly<Record<Bagimlilik, string>> = { bagimli: 'Bağımlı', ortulu: 'Örtülü', bagimsiz: 'Bağımsız' };
export const bagMetni = (a: Adim): string => (a.dep === 'ortulu' ? `örtülü: ${sayi(a.depQty ?? 1)} adet çıkınca`
  : a.dep === 'bagimsiz' ? 'bağımsız: beklemez' : 'bağımlı: önceki bitince');

// İstasyon rengi: kimliğe göre altı tasarım renginden biri (sabit renk yazılmaz).
export const renkSinifi = (id: string | null): string => (id === null || !/^\d+$/.test(id) ? 'tc-rr1-renk-yok' : `tc-rr1-renk-${String(Number(id) % 6)}`);

export function fasonAdi(firmalar: readonly { id: string; code: string | null; name: string }[] | null | undefined, id: string | null): string {
  if (id === null) return 'firma seçilmedi';
  const f = (firmalar ?? []).find((x) => x.id === id);
  return f ? `${f.code ? `${f.code} ` : ''}${f.name}` : `Fason firma #${id ?? '?'}`;
}

// Sayı alanı: yazarken yerel kalır, alandan çıkınca ya da Enter ile işlenir (her tuşta taslak yazılmaz). Boş metin null'dır.
// Bu alanların hepsi süre, miktar ya da yüzdedir: eksi kabul edilmez. Geçersiz girdi silinmez ve yazılmaz; altında nedeni görünür.
export const SURE_EN_COK = 99_999;

// pozitif: alan boş ya da sıfır olamaz (sunucu miktarı sıfırdan büyük ister); boş bırakılan alana 0 yazılmaz (B-2484-6).
export function sayiAlaniHatasi(metin: string, enCok?: number, pozitif = false, tamSayi = false): string | null {
  if (metin.trim() === '') return pozitif ? 'Miktar zorunlu.' : null;
  const v = sayiGirisi(metin);
  if (v === null) return 'Sayı girin.';
  if (tamSayi && (!Number.isInteger(v) || v < 1)) return '1 ya da daha büyük tam sayı girin.';
  if (v < 0) return 'Eksi olamaz.';
  if (pozitif && v === 0) return 'Sıfırdan büyük olmalı.';
  if (enCok !== undefined && v > enCok) return `En çok ${sayi(enCok)} olabilir.`;
  return null;
}

export function SayiAlani({ etiket, deger, yaz, kapali, yerTutucu, birim, ipucu, enCok, pozitif = false, tamSayi = false }: {
  etiket: string; deger: number | null; yaz: (v: number | null) => void; kapali?: boolean; yerTutucu?: string; birim?: string; ipucu?: string; enCok?: number;
  pozitif?: boolean; tamSayi?: boolean;
}) {
  const metin = deger === null ? '' : String(deger).replace('.', ',');
  const [yerel, setYerel] = useState(metin);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => { setYerel(metin); setHata(null); }, [metin]);
  const isle = () => {
    if (yerel === metin) { setHata(null); return; }
    const h = sayiAlaniHatasi(yerel, enCok, pozitif, tamSayi);
    setHata(h);
    if (h === null) yaz(sayiGirisi(yerel));
  };
  return (
    <label className="tc-rr1-alan">
      <span>{etiket}</span>
      <span className="tc-rr1-alan-ic">
        <input
          className="tc-rr1-sayi" inputMode={tamSayi ? 'numeric' : 'decimal'} value={yerel} disabled={kapali} placeholder={yerTutucu} aria-label={etiket} aria-invalid={hata !== null || undefined}
          onChange={(e) => { setYerel(e.target.value); }} onBlur={isle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); isle(); } }}
        />
        {birim && <small>{birim}</small>}
      </span>
      {hata && <small className="tc-rr1-hata" role="alert">{hata}</small>}
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

// Pasif operasyon yalnız adımda seçiliyse listede kalır. Kod ve istasyon da aranır (palet araması gibi).
export function operasyonSecenekleri(h: Haritalar, seciliId: string): AramaliSecenek[] {
  return [...h.op.values()].filter((o) => o.aktif || o.id === seciliId).map((o) => {
    const ist = o.stationId ? h.istasyon.get(o.stationId) : undefined;
    const alt = [o.abbr ? o.code : null, ist ? `${ist.code} ${ist.name}` : null].filter((x) => x !== null).join(' · ');
    return { deger: o.id, baslik: `${o.abbr ?? o.code} ${o.name}`, ...(alt ? { alt } : {}) };
  });
}

// Seçenek çoksa (operasyon) yazarak aranır; düz listede kaydırarak aranıyordu.
export function AramaliSecimAlani({ etiket, deger, secenekler, yaz, kapali, bos }: {
  etiket: string; deger: string; secenekler: readonly AramaliSecenek[]; yaz: (v: string) => void; kapali?: boolean; bos?: string;
}) {
  return (
    <div className="tc-rr1-alan">
      <span>{etiket}</span>
      <AramaliSecim etiket={etiket} deger={deger} secenekler={secenekler} sec={yaz} disabled={kapali} bos={bos} />
    </div>
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

// Adım panelinin katlanır bölümü (3320-2 a): kapalıyken başlıkta tek satır özet görünür; içerik DOM'da kalır (yerel girişler kaybolmaz)
// ama gizlidir. Açık ya da kapalı olması kullanıcının tarayıcısında bölüm başına saklanır.
export type KatAnahtari = 'op' | 'mz' | 'ak' | 'ay' | 'bg';
const KAT_VARSAYILAN: Record<KatAnahtari, boolean> = { op: true, mz: true, ak: false, ay: false, bg: false };
export function useKatlar() {
  const [acik, setAcik] = useState<Record<KatAnahtari, boolean>>(() => {
    const k = Object.keys(KAT_VARSAYILAN) as KatAnahtari[];
    return Object.fromEntries(k.map((x) => [x, tercihOku(`kat-${x}`, KAT_VARSAYILAN[x] ? '1' : '0') === '1'])) as Record<KatAnahtari, boolean>;
  });
  const ayarla = (k: KatAnahtari, v: boolean) => { setAcik((o) => ({ ...o, [k]: v })); tercihYaz(`kat-${k}`, v ? '1' : '0'); };
  return { acik, ayarla };
}
export function KatBolme({ k, baslik, ozet, rozet, acik, ayarla, children }: {
  k: KatAnahtari; baslik: string; ozet: string; rozet?: string | null; acik: boolean; ayarla: (k: KatAnahtari, v: boolean) => void; children: ReactNode;
}) {
  const icId = `tc-rr1-kat-${k}`;
  return (
    <section className={`tc-rr1-kat${acik ? ' tc-rr1-kat-acik' : ''}`} data-kat={k}>
      <button type="button" className="tc-rr1-kat-bas" aria-expanded={acik} aria-controls={icId} onClick={() => { ayarla(k, !acik); }}>
        <span className="tc-rr1-kat-ad"><h3>{baslik}</h3>{rozet && <span className="tc-rr1-kat-rozet">{rozet}</span>}</span>
        {!acik && <span className="tc-rr1-kat-oz">{ozet}</span>}
        <Simge ad="chev-right" boyut="k" />
      </button>
      <div id={icId} className="tc-rr1-kat-ic" hidden={!acik}>{children}</div>
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
