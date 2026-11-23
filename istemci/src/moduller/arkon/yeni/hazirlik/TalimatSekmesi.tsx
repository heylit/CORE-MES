import { useEffect, useState } from 'react';
import { Dugme, DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { useArkon, useArkonDurumu } from '../veri/baglam.ts';
import type { TmiAdim } from '../veri/depo.ts';
import { GRUPLAR, TUR, grubu, sinirMetni } from '../operator/Talimatlar.tsx';
import type { Pkg } from './tipler.ts';

// 3614: Hazırlık'ta işin talimatı, terminalin gördüğü listeyle aynı kaynaktan ve aynı üç grupla, yalnız okunur. Terminal emri
// `/tmi-adimlar/:emir` ile okur; hazırlık da onu kullanır, yani okuma yetkisi terminaldekiyle aynıdır ve genişletilmez.
export type TalimatDurumu = { tur: 'yukleniyor' } | { tur: 'liste'; liste: TmiAdim[] } | { tur: 'yetki' } | { tur: 'hata' } | { tur: 'bilinmiyor' };
const yetkiHatasi = (e: unknown): boolean => {
  const d = typeof e === 'object' && e !== null && 'status' in e ? (e as { status?: unknown }).status : undefined;
  return d === 401 || d === 403;
};

export function useTalimatOkuma(p: Pkg | null): TalimatDurumu {
  const { depo } = useArkon();
  const durum = useArkonDurumu();
  const emirId = p ? tmiEmirId(p) : null;
  const [d, dYaz] = useState<TalimatDurumu>({ tur: 'yukleniyor' });
  const sunucuda = durum.mode === 'server';
  useEffect(() => {
    dYaz({ tur: 'yukleniyor' });
    if (emirId === null || !sunucuda) return;
    let canli = true;
    depo.Server.tmiAdimlari(emirId).then(
      (liste) => { if (canli) dYaz({ tur: 'liste', liste }); },
      (e: unknown) => { if (canli) dYaz(yetkiHatasi(e) ? { tur: 'yetki' } : { tur: 'hata' }); },
    );
    return () => { canli = false; };
  }, [depo, emirId, sunucuda]);
  return emirId === null || !sunucuda ? { tur: 'bilinmiyor' } : d;
}

const ozet = (l: readonly TmiAdim[]): string => {
  const zorunlu = l.filter((a) => a.zorunlu === true).length;
  const gruplu = GRUPLAR.map((g) => ({ g, n: l.filter((a) => grubu(a) === g.id).length })).filter((x) => x.n > 0).map((x) => `${x.g.ad} ${String(x.n)}`);
  return `${String(l.length)} madde · ${String(zorunlu)} zorunlu · ${gruplu.join(' · ')}`;
};

export const talimatSayisi = (d: TalimatDurumu): number | null => (d.tur === 'liste' && d.liste.length > 0 ? d.liste.length : null);

export function TalimatSekmesi({ paket, d, baslik = true }: { paket: Pkg; d: TalimatDurumu; baslik?: boolean }) {
  const yerel = paket.steps;
  const { tmiyeGit } = useArkon();
  const yazar = useOturum().data?.islemler.includes('rota.talimat-yaz') === true;
  if (d.tur === 'yukleniyor') return <DurumKutusu durum="yukleniyor" mesaj="Talimatlar yükleniyor" />;
  if (d.tur === 'yetki') return <p className="tc-ay2-bilgi" role="status"><Simge ad="lock" /><span>Talimatı görme yetkin yok. Terminaldeki listeyi gören roller buradan da görür.</span></p>;
  if (d.tur === 'hata') return <p className="tc-ay2-bilgi" role="alert"><Simge ad="alert" /><span>Talimatlar alınamadı. Sayfayı yenileyip yeniden dene.</span></p>;
  if (d.tur === 'bilinmiyor') return <p className="tc-ay2-bilgi" role="status"><Simge ad="flag" /><span>Talimat CORE'dan okunur; bu paket CORE emrine bağlı değil ya da sunucu bağlı değil, o yüzden talimat bilinmiyor.</span></p>;
  const liste = d.liste;
  if (liste.length === 0) {
    return (
      <section className="tc-ay2-kart tc-ay2-talimat" aria-label="Talimatlar">
        <p className="tc-ay2-bilgi"><Simge ad="flag" /><span>Bu işin talimatı yok. Operatör ekranında Talimatlar sekmesi boş görünür.</span></p>
        {yazar ? <div><Dugme tur="ikincil" simge="tool" onClick={() => tmiyeGit('recete-rota')}>Reçete ve Rota'da aç</Dugme></div> : <p className="tc-ay2-soluk">Talimatı Reçete ve Rota'da talimat yazma yetkisi olan kişi ekler.</p>}
        {yerel.length > 0 ? (
          <div>
            <b className="tc-ay2-talimat-baslik">Pakette tanımlı adımlar</b>
            <ol className="tc-ay2-talimat-liste">
              {yerel.map((s) => <li key={s.id}><span className="tc-ay2-talimat-ad">{s.t}</span>{s.d ? <small>{s.d}</small> : null}{s.r ? <em data-zorunlu="">Zorunlu</em> : null}</li>)}
            </ol>
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <section className="tc-ay2-kart tc-ay2-talimat" aria-label="Talimatlar">
      {baslik ? <div className="tc-ay2-kb"><b>Operatörün göreceği talimat</b><span className="tc-ay2-ust-yazi">{ozet(liste)}</span></div> : <span className="tc-ay2-ust-yazi">{ozet(liste)}</span>}
      {GRUPLAR.map((g) => {
        const l = liste.filter((a) => grubu(a) === g.id);
        if (l.length === 0) return null;
        return (
          <div key={g.id} className="tc-ay2-talimat-grup">
            <h3><b>{g.ad}</b><small>{g.alt}</small><span className="tc-ay2-mono">{String(l.length)}</span></h3>
            <ol className="tc-ay2-talimat-liste">
              {l.map((a) => {
                const k = a.kontrol ?? null;
                const sinir = k?.tur === 'olcum' ? sinirMetni(k) : null;
                return (
                  <li key={a.id}>
                    <span className="tc-ay2-talimat-no">{String(a.sira)}</span>
                    <span className="tc-ay2-talimat-metin">
                      <span className="tc-ay2-talimat-ad">{a.ad}</span>
                      {a.aciklama ? <small>{a.aciklama}</small> : null}
                      {a.zorunlu === true || (k !== null && k.tur !== 'onay') ? (
                        <span className="tc-ay2-talimat-etiket">
                          {a.zorunlu === true ? <em data-zorunlu="">Zorunlu</em> : null}
                          {k !== null && k.tur !== 'onay' ? <em><Simge ad={TUR[k.tur].simge} boyut="k" />{TUR[k.tur].ad}{k.tur === 'olcum' && k.ad ? ` · ${k.ad}` : ''}{sinir ? ` · ${sinir}` : ''}</em> : null}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      {baslik ? <p className="tc-ay2-soluk">Resim ve video terminalde gösterilmez; operatör yalnız madde metnini, zorunluluğu ve ölçüm sınırını görür.</p> : null}
    </section>
  );
}

// Matris hücresinden açılan yan panel (3614 seçenek C): aynı liste, paket seçilmeden.
