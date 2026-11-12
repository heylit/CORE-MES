import { useEffect, useState } from 'react';
import type { AdimDurumuTerminalCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { tarihMetni } from '../../../../ortak/veri/zaman-metni.ts';
import { ADIM_STATUSU, type RotaAkisiAdimi } from '../../../uretim-emirleri/disari.ts';

// Emrin adımları (2893-3 b): operatör emrin bütün adımlarının son durumunu okur; ilk adım üstte, kendi adımı işaretli. Elle yazılan
// statü "Elle" işaretiyle görünür; kişi, gerekçe ve geçmiş terminale gelmez. Operatör statü yazmaz. Okunamazsa bunu söyleyen tek satır
// çizilir (3126); son okunan liste varken yenileme hatası onu silmez.
export function useEmrinAdimlari(emirId: number | null, yenidenSor: unknown): { v: AdimDurumuTerminalCevabi | null; hata: boolean } {
  const [v, vYaz] = useState<AdimDurumuTerminalCevabi | null>(null);
  const [hata, hataYaz] = useState(false);
  useEffect(() => { vYaz(null); hataYaz(false); }, [emirId]);
  useEffect(() => {
    if (emirId === null) return;
    let canli = true;
    api.get<AdimDurumuTerminalCevabi>(`/adimli-emirler/${String(emirId)}/adim-durumu/terminal`)
      .then((c) => { if (canli) { vYaz(c); hataYaz(false); } })
      .catch(() => { if (canli) hataYaz(true); });
    return () => { canli = false; };
  }, [emirId, yenidenSor]);
  return { v, hata: hata && v === null };
}

type Adim = AdimDurumuTerminalCevabi['adimlar'][number];
const tamamSayisi = (l: readonly Adim[]): number => l.filter((a) => a.statu === 'bitti').length;
const ilerlemeMetni = (l: readonly Adim[]): string => `${String(tamamSayisi(l))}/${String(l.length)} adım tamamlandı`;
const kisaIlerleme = (l: readonly Adim[]): string => `${String(tamamSayisi(l))}/${String(l.length)}`;
const OKUNAMADI = 'Rota adımları okunamadı';
export const adimCizgisiKimligi = (isEmriId: number): string => `tc-ay1-emrin-adimi-${String(isEmriId)}`;

// 3126: emrin bütün adımları iş kimliğinin altında tek şerit; renk ve simge Adım Durumu statüsünündür, bu adım çerçevelidir.
// Dokununca Adımlar görünümü o adımda açılır. TMI dışı ya da adımsız emirde çizilmez.
// Terminal cevabındaki adımlar rota akışının satırları; ekrandaki işin iş emri "bu adım"dır.
export function rotaAkisiAdimlari(v: AdimDurumuTerminalCevabi, isEmriId: number | null): RotaAkisiAdimi[] {
  return v.adimlar.map((a) => ({ anahtar: `${String(a.isEmriId)}-${String(a.opNo)}`, opNo: a.opNo, ad: a.ad, statu: a.statu, yuzde: a.yuzde, bu: a.isEmriId === isEmriId }));
}

export function RotaSeridi({ v, hata, isEmriId, ac }: { v: AdimDurumuTerminalCevabi | null; hata: boolean; isEmriId: number | null; ac: () => void }) {
  if (hata) return <p className="tc-ay1-rota-seridi tc-ay1-soluk" role="status"><Simge ad="alert" boyut="k" />{OKUNAMADI}</p>;
  if (v === null || v.adimlar.length === 0) return null;
  const bu = v.adimlar.find((a) => a.isEmriId === isEmriId);
  // 3126 Ek 2: dar ve alçak ekranda dilimde yalnız simge ve OP no kalır; ekrandaki adımın durum adı başlıkta yazar.
  const buMetni = bu ? `Bu adım: ${ADIM_STATUSU[bu.statu].ad}` : null;
  return (
    <button type="button" className="tc-ay1-rota-seridi" onClick={ac} aria-label={`Rota: ${[ilerlemeMetni(v.adimlar), buMetni].filter(Boolean).join(' · ')} · adımları aç`}>
      <span className="tc-ay1-rota-ust"><Simge ad="route" boyut="k" />Rota · {kisaIlerleme(v.adimlar)}{buMetni ? <b> · {buMetni}</b> : null}</span>
      <ol>
        {v.adimlar.map((a) => {
          const g = ADIM_STATUSU[a.statu];
          const bu = a.isEmriId === isEmriId;
          return (
            <li key={a.isEmriId} data-ton={g.ton} aria-current={bu ? 'step' : undefined} title={`OP ${String(a.opNo)} · ${a.ad} · ${g.ad}`}>
              <Simge ad={g.simge} boyut="k" /><span><em>OP </em>{a.opNo}</span><small>{g.ad}</small>
            </li>
          );
        })}
      </ol>
    </button>
  );
}

// Termin bir gündür ('GGGG-AA-GG'); bugünden önceyse gecikmiştir (Atölye N2). Bugün tarayıcının yerel günüdür.
const bugun = (): string => {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const terminMetni = (termin: string | null): string => (termin === null ? '' : ` · termin ${tarihMetni(termin)}${termin < bugun() ? ' · gecikti' : ''}`);
// 2893-3 b: adımı bekleten talep ve sipariş numarası ile beklenen teslim; fiyat ve tedarikçi gelmez.
const tedarikMetni = (t: AdimDurumuTerminalCevabi['adimlar'][number]['tedarik'][number]): string => t.asama === 'talep'
  ? `${t.fason ? 'Fason talebi' : 'Talep'} ${t.talepNo}`
  : `Sipariş ${t.siparisNo ?? t.talepNo}${terminMetni(t.termin)}`;

export function EmrinAdimlari({ v, hata = false, isEmriId }: { v: AdimDurumuTerminalCevabi | null; hata?: boolean; isEmriId: number | null }) {
  if (hata) return <p className="tc-ay1-adim-durumu tc-ay1-soluk" role="status"><Simge ad="alert" boyut="k" />{OKUNAMADI}</p>;
  if (v === null || v.adimlar.length === 0) return null;
  const tamam = tamamSayisi(v.adimlar);
  return (
    <section className="tc-ay1-adim-durumu" aria-label="Emrin adımları">
      <h3><Simge ad="route" boyut="k" />Emrin adımları · son durum · {ilerlemeMetni(v.adimlar)}</h3>
      <progress className="tc-ay1-adim-toplam" max={v.adimlar.length} value={tamam} aria-label={ilerlemeMetni(v.adimlar)} />
      <ol>
        {v.adimlar.map((a) => {
          const g = ADIM_STATUSU[a.statu];
          return (
            <li key={a.isEmriId} id={adimCizgisiKimligi(a.isEmriId)} aria-current={a.isEmriId === isEmriId ? 'step' : undefined}>
              <span className="tc-ay1-adim-op">OP {a.opNo}</span>
              <span className="tc-ay1-adim-ad">
                {a.ad}{a.isEmriId === isEmriId ? ' · bu adım' : ''}{a.elle ? <em>Elle</em> : null}
                {a.tedarik.length > 0 ? <small>{a.tedarik.map(tedarikMetni).join(' · ')}</small> : null}
              </span>
              <span className="tc-ay1-hz-cip" data-ton={g.ton === 'bilgi' ? 'tamam' : g.ton} data-sakin="" title={a.nedenler.join(', ') || undefined}>
                <Simge ad={g.simge} boyut="k" /><span>{g.ad}</span>
              </span>
              <span className="tc-ay1-adim-yuzde">
                <progress max={100} value={a.yuzde} aria-label={`OP ${String(a.opNo)} ilerleme`} /><small className="tc-ay1-mono">%{a.yuzde}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
