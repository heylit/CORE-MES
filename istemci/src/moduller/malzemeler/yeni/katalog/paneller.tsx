// Kart penceresinin bölümleri: onay, değişiklik talebi, muadiller ve revizyon geçmişi (prototipin onayPanelHTML, talepPanelHTML,
// muadilOverlayHTML ve revHTML'i). Yazma düğmeleri yetkiye göre gizlenir; denetim uçtadır.
import { useState } from 'react';
import { Dugme, Girdi, Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import { MTIP, ONAY } from '../sabitler/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { MalzemeYetkisi } from '../yetki.ts';
import type { KartKaydi, Kisi, OnayBilgisi } from '../tipler.ts';
import { kimlikOf } from './liste.ts';

export type OnayIslemi = 'onayla' | 'reddet' | 'gonder' | 'pasif' | 'aktif';
export type TalepIslemi = 'onayla' | 'reddet' | 'geri';

const DURUM_TONU: Record<string, RozetTonu> = { taslak: 'pasif', onayda: 'uyari', aktif: 'tamam', pasif: 'pasif' };

export function OnayRozeti({ x, b }: { x: KartKaydi; b: KuralBaglami }) {
  const k = K.onayDurum(x, b);
  return <Rozet ton={DURUM_TONU[k] ?? 'bilgi'}>{ONAY[k].ad}</Rozet>;
}

export const tarihSaat = (t?: number | null): string => (t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const kimMetni = (v?: { byAd?: string; by?: unknown; t?: number } | null): string => (v ? `${v.byAd || (v.by ? 'Bir kullanıcı' : 'Bu tarayıcı')}, ${tarihSaat(v.t)}` : '');

export function onayBilgisi(x: KartKaydi, b: KuralBaglami): string {
  const k = K.onayDurum(x, b);
  const o: Partial<OnayBilgisi> = x.onay ?? {};
  const pasif = o['pasif'] as (Kisi & { neden?: string }) | undefined;
  if (k === 'onayda') return `${o.degisiklik ? 'Değişiklik onayı bekliyor' : 'Onay bekliyor'}${o.talep ? ` (gönderen: ${kimMetni(o.talep)})` : ''}`;
  if (k === 'aktif' && o.onay) return `Onaylayan: ${kimMetni(o.onay)}`;
  if (k === 'taslak' && o.red) return `Reddedildi (${kimMetni(o.red)})${o.red.neden ? `: ${o.red.neden}` : ''}`;
  if (k === 'pasif' && pasif) return `Pasife alındı (${kimMetni(pasif)})${pasif.neden ? `: ${pasif.neden}` : ''}`;
  return '';
}

// Neden kutusu: red için zorunlu, pasife alma için isteğe bağlı (prototip).
function NedenKutusu({ red, mesgul, gonder }: { red: boolean; mesgul: boolean; gonder: (neden: string) => void }) {
  const [neden, nedenYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>();
  return (
    <form
      className="tc-mk-neden" noValidate
      onSubmit={(o) => {
        o.preventDefault();
        if (red && !neden.trim()) { hataYaz('Red nedenini yaz.'); return; }
        gonder(neden.trim());
      }}
    >
      <Girdi
        etiket={red ? 'Red nedeni' : 'Pasife alma nedeni'} required={red} value={neden} autoFocus hata={hata}
        placeholder={red ? 'ör. ölçü yanlış, mükerrer kart' : 'İsteğe bağlı'} onChange={(o) => { nedenYaz(o.target.value); hataYaz(undefined); }}
      />
      <Dugme type="submit" tur={red ? 'tehlike' : 'ikincil'} yukleniyor={mesgul}>{red ? 'Reddet' : 'Pasife al'}</Dugme>
    </form>
  );
}

export function OnayPaneli({ x, yetki, b, mesgul, islem }: {
  x: KartKaydi; yetki: MalzemeYetkisi; b: KuralBaglami; mesgul: boolean; islem: (i: OnayIslemi, neden?: string) => void;
}) {
  const [neden, nedenYaz] = useState<'reddet' | 'pasif' | null>(null);
  const k = K.onayDurum(x, b);
  const yetkili = K.onayYetkili(x, b);
  return (
    <section className="tc-mk-onay" data-durum={k} aria-label="Onay durumu">
      <div className="tc-mk-onay-satir">
        <OnayRozeti x={x} b={b} />
        <span className="tc-mk-onay-bilgi">{onayBilgisi(x, b)}</span>
        {yetki.yaz && (
          <span className="tc-mk-eylemler">
            {k === 'onayda' && yetkili && (
              <>
                <Dugme tur="birincil" simge="check" yukleniyor={mesgul} onClick={() => islem('onayla')}>Onayla</Dugme>
                <Dugme onClick={() => nedenYaz('reddet')}>Reddet</Dugme>
              </>
            )}
            {k === 'onayda' && !yetkili && (
              <span className="tc-mk-ipucu">
                {!yetki.onayla ? 'Onay ana veri sorumlusu ya da yöneticidedir.' : b.genel.dortGoz ? 'Kendi gönderdiğin kartı onaylayamazsın.' : 'Onay yetkin yok.'}
              </span>
            )}
            {k === 'taslak' && <Dugme tur="birincil" yukleniyor={mesgul} onClick={() => islem('gonder')}>{b.genel.onayAkisi ? 'Onaya gönder' : 'Aktifleştir'}</Dugme>}
            {k === 'aktif' && yetki.onayla && <Dugme onClick={() => nedenYaz('pasif')}>Pasife al</Dugme>}
            {k === 'pasif' && yetki.onayla && <Dugme yukleniyor={mesgul} onClick={() => islem('aktif')}>Yeniden aktifleştir</Dugme>}
          </span>
        )}
      </div>
      {neden && <NedenKutusu red={neden === 'reddet'} mesgul={mesgul} gonder={(n) => { islem(neden, n); nedenYaz(null); }} />}
    </section>
  );
}

export function TalepPaneli({ x, yetki, b, mesgul, islem }: {
  x: KartKaydi; yetki: MalzemeYetkisi; b: KuralBaglami; mesgul: boolean; islem: (i: TalepIslemi, neden?: string) => void;
}) {
  const [red, redYaz] = useState(false);
  if (!K.talepVar(x, b)) return null;
  const t = x.talep!;
  const ben = t.by !== undefined && t.by !== null && t.by === b.kisi.id;
  const yetkili = K.talepYetkili(x, b);
  const farklar = (t.farklar ?? []).slice(0, 30) as { f: string; a: string; b: string }[];
  return (
    <section className="tc-mk-talep" aria-label="Değişiklik talebi">
      <div className="tc-mk-onay-satir">
        <Rozet ton="uyari">Değişiklik talebi</Rozet>
        <span className="tc-mk-onay-bilgi">{t.byAd || (t.by ? 'Bir kullanıcı' : 'Bu tarayıcı')}, {tarihSaat(t.t)} · Kart onaylanana kadar mevcut hâliyle kullanımda.</span>
      </div>
      <div className="tc-mk-tablo-kap">
        <table className="tc-mk-tablo">
          <thead><tr><th scope="col">Alan</th><th scope="col">Mevcut</th><th scope="col">Önerilen</th></tr></thead>
          <tbody>{farklar.map((f, i) => <tr key={i}><td>{f.f}</td><td className="tc-mk-soluk">{f.a}</td><td><b>{f.b}</b></td></tr>)}</tbody>
        </table>
      </div>
      {yetki.yaz && (
        <div className="tc-mk-eylemler">
          {yetkili && (
            <>
              <Dugme tur="birincil" simge="check" yukleniyor={mesgul} onClick={() => islem('onayla')}>Değişikliği onayla</Dugme>
              <Dugme onClick={() => redYaz(true)}>Reddet</Dugme>
            </>
          )}
          {!yetkili && yetki.onayla && b.genel.dortGoz && ben && <span className="tc-mk-ipucu">Kendi talebini onaylayamazsın (dört göz kuralı).</span>}
          {(ben || yetki.onayla) && <Dugme yukleniyor={mesgul} onClick={() => islem('geri')}>Talebi geri çek</Dugme>}
        </div>
      )}
      {red && <NedenKutusu red mesgul={mesgul} gonder={(n) => { islem('reddet', n); redYaz(false); }} />}
    </section>
  );
}

const MUADIL_TONU: Record<string, RozetTonu> = { tam: 'tamam', ust: 'bilgi', sartli: 'uyari' };

export function Muadiller({ x, kayitlar, b, ac }: { x: KartKaydi; kayitlar: readonly KartKaydi[]; b: KuralBaglami; ac: (kimlik: string) => void }) {
  if ((x.tur ?? 'hammadde') !== 'hammadde') return null;
  const kart = K.muadilKartlar(x, kayitlar, b);
  const kal = K.muadilKaliteler(x, b);
  if (!kart.length && !kal.length) return null;
  return (
    <details className="tc-mk-acilir" open={kart.length > 0}>
      <summary>Muadiller{kart.length ? ` (katalogda ${kart.length} kart)` : ''}</summary>
      {kart.length > 0 && (
        <>
          <p className="tc-mk-ipucu">Aynı form ve ölçüde katalogda bulunan muadil kartlar:</p>
          <ul className="tc-mk-liste">
            {kart.map((m) => (
              <li key={kimlikOf(m.x)}>
                <Rozet ton={MUADIL_TONU[m.tip] ?? 'bilgi'}>{MTIP[m.tip].ad}</Rozet>
                <button type="button" className="tc-mk-bag" onClick={() => ac(kimlikOf(m.x))}>{m.x.com.kod}</button> {m.x.com.ad}
                <small>{m.not}</small>
              </li>
            ))}
          </ul>
        </>
      )}
      {kal.length > 0 && (
        <>
          <p className="tc-mk-ipucu">Muadil kaliteler:</p>
          <ul className="tc-mk-liste">
            {kal.map((m) => (
              <li key={m.kod}><Rozet ton={MUADIL_TONU[m.tip] ?? 'bilgi'}>{MTIP[m.tip].ad}</Rozet><b>{m.ad}</b><small>{m.not}</small></li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

interface RevizyonGirdisi { t: number; by?: unknown; byAd?: string; yeni?: boolean; ch?: { f: string; a: string; b: string }[]; not?: string }

export function Revizyonlar({ x }: { x: KartKaydi }) {
  const r = [...((x.rev ?? []) as RevizyonGirdisi[])].reverse();
  if (!r.length) return null;
  return (
    <details className="tc-mk-acilir">
      <summary>Revizyon geçmişi ({r.length})</summary>
      <ol className="tc-mk-revler">
        {r.map((e, i) => (
          <li key={i}>
            <span className="tc-mk-soluk">{tarihSaat(e.t)}</span> <span>{e.byAd || (e.by ? 'Bir kullanıcı' : 'Bu tarayıcı')}</span>{' '}
            <span>{e.yeni ? 'Kaydı oluşturdu' : e.ch?.length ? `${e.ch.length} alanı değiştirdi` : 'Değişiklik olmadan kaydetti'}</span>
            {e.ch && e.ch.length > 0 && (
              <ul>
                {e.ch.slice(0, 12).map((c, j) => <li key={j}><b>{c.f}:</b> <s>{c.a}</s> → {c.b}</li>)}
                {e.not && <li><i>Not: {e.not}</i></li>}
                {e.ch.length > 12 && <li>ve {e.ch.length - 12} alan daha</li>}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
