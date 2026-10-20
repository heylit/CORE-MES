import { useState, type ReactNode } from 'react';
import type { SurumluIsMerkezi, SurumluIstasyon } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Girdi, Simge } from '../../ortak/arayuz/index.ts';
import { aramayaUyar } from './ListeAraclari.tsx';
import { merkezRengi } from './tesis.ts';

export type AgacSecimi = { tur: 'tum' } | { tur: 'merkez'; id: number } | { tur: 'istasyon'; id: number } | { tur: 'istasyonsuz' };
export const TUMU: AgacSecimi = { tur: 'tum' };

export interface AgacSayisi { toplam: number; uyari: number }

const ayni = (a: AgacSecimi, b: AgacSecimi) => a.tur === b.tur && ('id' in a ? a.id : 0) === ('id' in b ? b.id : 0);

// Sol ağaç (kart #1296): iş merkezi > istasyon, her dalda kayıt ve uyarı (arızalı) sayısı. Dal seçilince liste o dala daralır;
// iş merkezi katlanır. Yüzlerce istasyonda ağacın kendi araması vardır.
export function TesisAgaci({ merkezler, istasyonlar, pasifler, say, secim, sec, istasyonsuzVar, uyariAdi }: {
  merkezler: readonly SurumluIsMerkezi[];
  istasyonlar: readonly SurumluIstasyon[];
  pasifler: boolean;
  say: (istasyonId: number | null) => AgacSayisi;
  secim: AgacSecimi;
  sec: (s: AgacSecimi) => void;
  // Verilirse ağacın sonunda "İstasyonsuz" dalı durur (makineler).
  istasyonsuzVar?: boolean;
  uyariAdi: string;
}) {
  const [acik, acikYaz] = useState<ReadonlySet<number>>(new Set());
  const [ara, araYaz] = useState('');
  const gorunur = <T extends { aktif: boolean }>(k: T) => pasifler || k.aktif;
  const altlari = (m: SurumluIsMerkezi) => istasyonlar.filter((i) => i.isMerkeziId === m.id && gorunur(i));
  const topla = (sayilar: AgacSayisi[]): AgacSayisi => sayilar.reduce((t, s) => ({ toplam: t.toplam + s.toplam, uyari: t.uyari + s.uyari }), { toplam: 0, uyari: 0 });
  const tumSayi = topla([...istasyonlar.filter(gorunur).map((i) => say(i.id)), ...(istasyonsuzVar ? [say(null)] : [])]);

  const dal = (s: AgacSecimi, metin: ReactNode, sayi: AgacSayisi, etiket: string, ek = '') => (
    <button type="button" className={`tc-ist-dal ${ek}`} aria-pressed={ayni(s, secim)} aria-label={etiket} onClick={() => sec(s)}>
      <span className="tc-ist-dal-ad">{metin}</span>
      {sayi.uyari > 0 && <span className="tc-ist-dal-uyari" title={`${sayi.uyari} ${uyariAdi}`}>{sayi.uyari}</span>}
      <span className="tc-ist-calc">{sayi.toplam}</span>
    </button>
  );

  return (
    <nav className="tc-ist-agac" aria-label="İş merkezleri ve istasyonlar">
      <Girdi etiket="Ağaçta ara" type="search" placeholder="İş merkezi ya da istasyon" value={ara} onChange={(o) => araYaz(o.target.value)} />
      <div className="tc-ist-agac-liste">
        {dal(TUMU, 'Tümü', tumSayi, 'Tümü')}
        {merkezler.filter(gorunur).map((m) => {
          const merkezUyar = aramayaUyar(ara, [m.kod, m.ad]);
          const alt = altlari(m).filter((i) => merkezUyar || aramayaUyar(ara, [i.kod, i.ad]));
          if (!merkezUyar && alt.length === 0) return null;
          const acikMi = acik.has(m.id) || ara.trim() !== '' || (secim.tur === 'istasyon' && alt.some((i) => i.id === secim.id));
          return (
            <div key={m.id} className={`tc-ist-agac-grup ${merkezRengi(m.id)}`}>
              <div className="tc-ist-agac-satir">
                <button type="button" className="tc-ist-dal-ac" aria-expanded={acikMi} aria-label={`${m.kod} istasyonlarını ${acikMi ? 'gizle' : 'göster'}`}
                  onClick={() => acikYaz((a) => { const y = new Set(a); if (y.has(m.id)) y.delete(m.id); else y.add(m.id); return y; })}>
                  <Simge ad={acikMi ? 'down' : 'chev-right'} boyut="k" />
                </button>
                {dal({ tur: 'merkez', id: m.id }, <><span className="tc-ist-mono">{m.kod}</span> {m.ad}</>, topla(altlari(m).map((i) => say(i.id))), `${m.kod} ${m.ad}`)}
              </div>
              {acikMi && alt.map((i) => (
                <div key={i.id} className="tc-ist-agac-satir tc-ist-agac-alt">
                  {dal({ tur: 'istasyon', id: i.id }, <><span className="tc-ist-mono">{i.kod}</span> {i.ad}</>, say(i.id), `${i.kod} ${i.ad}`, i.aktif ? '' : 'tc-ist-soluk')}
                </div>
              ))}
            </div>
          );
        })}
        {istasyonsuzVar && ara.trim() === '' && dal({ tur: 'istasyonsuz' }, 'İstasyonsuz', say(null), 'İstasyonsuz')}
      </div>
    </nav>
  );
}
