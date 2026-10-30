import { useEffect, useId, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, hataIletisi } from '../veri/api.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './kayit-secici.css';

// Sahip modülün seçim arama ucunun ortak cevabı (kart #1317): her `*/secim-ara` ucu bu biçimde döner. `ust` gruplamadır
// (makinede istasyon, istasyonda iş merkezi).
export interface SecimKaydi {
  id: number;
  kod: string;
  ad: string;
  aktif: boolean;
  ust: { id: number; kod: string; ad: string } | null;
}
export interface SecimAramaCevabi { sonuclar: SecimKaydi[]; dahaVar: boolean }

// Seçili kayıt dışarıda tutulur; seçici yalnız başlığını gösterir (kayıt listesini önceden indirmez).
export interface SeciliKayit { id: number; kod: string; ad: string }

export interface KayitSeciciOzellikleri {
  etiket: string;
  deger: SeciliKayit | null;
  sec: (kayit: SecimKaydi | null) => void;
  disabled?: boolean;
  // Seçim kaldırılabilir mi ("Seçimi kaldır" satırı).
  bosaltilabilir?: boolean;
  pasifler?: boolean;
  yerTutucu?: string;
}

const BEKLEME_MS = 250;

const sorguMetni = (s: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(Object.entries(s).filter(([, d]) => d !== undefined && d !== '' && d !== false).map(([a, d]) => [a, String(d)])).toString();

// Sunucuda arayan seçici (kart #1317, RAPOR V3): kayıtlar sahibin arama ucundan sayfa sayfa gelir, yazdıkça yeniden aranır.
// Ok tuşları gezer, Enter seçer, Escape kapatır; seçim değişmezse `sec` çağrılmaz.
export function KayitSecici({ etiket, deger, sec, disabled, bosaltilabilir, pasifler, yerTutucu = 'Seçiniz', yol, suzgec = {}, simge }: KayitSeciciOzellikleri & {
  yol: string;
  suzgec?: Record<string, string | number | undefined>;
  simge: SimgeAdi;
}) {
  const [acik, acikYaz] = useState(false);
  const [ara, araYaz] = useState('');
  const [aranan, arananYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const [etkin, etkinYaz] = useState(0);
  const kok = useRef<HTMLDivElement>(null);
  const kimlik = useId();

  useEffect(() => {
    const zaman = window.setTimeout(() => { arananYaz(ara.trim()); sayfaYaz(1); }, BEKLEME_MS);
    return () => window.clearTimeout(zaman);
  }, [ara]);
  useEffect(() => {
    if (!acik) return undefined;
    const disari = (o: MouseEvent) => { if (!kok.current?.contains(o.target as Node)) acikYaz(false); };
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, [acik]);

  const adres = `${yol}?${sorguMetni({ ...suzgec, q: aranan, pasifler, sayfa })}`;
  const sonuc = useQuery({
    queryKey: ['kayit-secici', adres],
    queryFn: () => api.get<SecimAramaCevabi>(adres),
    enabled: acik,
    placeholderData: keepPreviousData,
  });
  const liste = sonuc.data?.sonuclar ?? [];

  const kapat = () => { acikYaz(false); araYaz(''); arananYaz(''); sayfaYaz(1); etkinYaz(0); };
  const sonucSec = (k: SecimKaydi | null) => {
    kapat();
    if ((k?.id ?? null) !== (deger?.id ?? null)) sec(k);
  };

  return (
    <div className="tc-ksecici" ref={kok}>
      <button
        type="button" className="tc-alan-kutu tc-ksecici-dugme" aria-label={etiket} aria-haspopup="listbox" aria-expanded={acik}
        disabled={disabled} onClick={() => (acik ? kapat() : acikYaz(true))}
      >
        <Simge ad={simge} boyut="k" />
        <span className="tc-ksecici-metin">{deger ? `${deger.kod} ${deger.ad}` : yerTutucu}</span>
        <Simge ad="down" boyut="k" />
      </button>
      {acik && (
        <div className="tc-ksecici-acilir">
          <input
            className="tc-alan-kutu" type="search" role="combobox" aria-label={`${etiket} ara`} aria-controls={kimlik} aria-expanded="true"
            aria-activedescendant={liste[etkin] ? `${kimlik}-${etkin}` : undefined} placeholder="Kod ya da ad yazın" value={ara} autoFocus
            onChange={(o) => { araYaz(o.target.value); etkinYaz(0); }}
            onKeyDown={(o) => {
              if (o.key === 'ArrowDown') { o.preventDefault(); etkinYaz((e) => Math.min(e + 1, liste.length - 1)); }
              if (o.key === 'ArrowUp') { o.preventDefault(); etkinYaz((e) => Math.max(e - 1, 0)); }
              if (o.key === 'Enter') { o.preventDefault(); const k = liste[etkin]; if (k) sonucSec(k); }
              if (o.key === 'Escape') { o.stopPropagation(); kapat(); }
            }}
          />
          {bosaltilabilir && deger && (
            <button type="button" className="tc-ksecici-bosalt" onClick={() => sonucSec(null)}>
              <Simge ad="x" boyut="k" /> Seçimi kaldır
            </button>
          )}
          <ul id={kimlik} role="listbox" aria-label={etiket} aria-busy={sonuc.isFetching} className="tc-ksecici-liste">
            {liste.map((k, sira) => {
              const grupBasi = k.ust?.id !== liste[sira - 1]?.ust?.id || sira === 0;
              return [
                grupBasi && k.ust && <li key={`g${sira}`} role="presentation" className="tc-ksecici-grup">{k.ust.kod} {k.ust.ad}</li>,
                <li
                  key={k.id} id={`${kimlik}-${sira}`} role="option" aria-selected={k.id === deger?.id}
                  className="tc-ksecici-secenek" data-etkin={sira === etkin}
                  onMouseDown={(o) => o.preventDefault()} onClick={() => sonucSec(k)} onMouseEnter={() => etkinYaz(sira)}
                >
                  <span><span className="tc-ksecici-kod">{k.kod}</span> {k.ad}</span>
                  {!k.aktif && <small className="tc-ksecici-ipucu">pasif</small>}
                </li>,
              ];
            })}
          </ul>
          {sonuc.isError && <p className="tc-ksecici-ipucu" role="alert">{hataIletisi(sonuc.error, 'Arama yapılamadı.')}</p>}
          {sonuc.isSuccess && liste.length === 0 && <p className="tc-ksecici-ipucu">Aramaya uyan yok.</p>}
          {(sayfa > 1 || sonuc.data?.dahaVar) && (
            <div className="tc-ksecici-sayfa">
              <button type="button" aria-label="Önceki sayfa" disabled={sayfa === 1 || sonuc.isFetching} onClick={() => { sayfaYaz(sayfa - 1); etkinYaz(0); }}>
                <Simge ad="back" boyut="k" />
              </button>
              <small className="tc-ksecici-ipucu">Sayfa {sayfa}; aramayı daraltın.</small>
              <button type="button" aria-label="Sonraki sayfa" disabled={!sonuc.data?.dahaVar || sonuc.isFetching} onClick={() => { sayfaYaz(sayfa + 1); etkinYaz(0); }}>
                <Simge ad="next" boyut="k" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// İstasyonlar modülünün ucu (kart #1318). Grup başlığı iş merkezidir.
export function IstasyonSecici(o: KayitSeciciOzellikleri) {
  return <KayitSecici {...o} yol="/istasyonlar/secim-ara" suzgec={{ tur: 'istasyon' }} simge="grid" />;
}

// İstasyonlar modülünün ucu (kart #1318). `istasyonId` verilirse yalnız o istasyonun makineleri; grup başlığı istasyondur.
export function MakineSecici({ istasyonId, ...o }: KayitSeciciOzellikleri & { istasyonId?: number }) {
  return <KayitSecici {...o} yol="/istasyonlar/secim-ara" suzgec={{ tur: 'makine', istasyonId }} simge="cpu" />;
}

// Malzemeler modülünün ucu (kart #1319; uç birleşmeden kullanılmaz). `tur` kart türüyle daraltır.
export function MalzemeSecici({ tur, ...o }: KayitSeciciOzellikleri & { tur?: string }) {
  return <KayitSecici {...o} yol="/malzemeler/secim-ara" suzgec={{ tur }} simge="box" />;
}

// Kişiler modülünün ucu (kart #1320; uç birleşmeden kullanılmaz). Yalnız kimlik ve ad döner; sicil `kod` alanındadır.
export function KisiSecici(o: KayitSeciciOzellikleri) {
  return <KayitSecici {...o} yol="/kisiler/secim-ara" simge="user" />;
}
