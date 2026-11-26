import { useEffect, useState } from 'react';
import { Dugme, DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { useArkon, useArkonDurumu } from '../veri/baglam.ts';
import type { TmiAdim } from '../veri/depo.ts';
import { GRUPLAR, TUR, grubu, sinirMetni } from '../operator/Talimatlar.tsx';
import { ADIM_SABLONLARI, yeniKimlik } from './kurallar.ts';
import type { Pkg, Step } from './tipler.ts';

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


export const talimatSayisi = (d: TalimatDurumu): number | null => (d.tur === 'liste' && d.liste.length > 0 ? d.liste.length : null);

// Adımın "zorunlu" alanı kayıtta eskisi gibi true/false yazılır (modelde sayı tiplidir, okuyan ekranlar doğruluğuna bakar).
const zorunluYaz = (v: boolean): Step['r'] => v as unknown as Step['r'];

// Terminalin talimatı (Reçete ve Rota) üç evrede; evresi olmayan paket adımları listenin sonunda kendi başlığında (operatör Adımlar sekmesinde görür).
function RotaGruplari({ liste }: { liste: readonly TmiAdim[] }) {
  return (
    <>
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
                      <span className="tc-ay2-talimat-etiket">
                        <em data-kaynak="rota">Rota</em>
                        {a.zorunlu === true ? <em data-zorunlu="">Zorunlu</em> : null}
                        {k !== null && k.tur !== 'onay' ? <em><Simge ad={TUR[k.tur].simge} boyut="k" />{TUR[k.tur].ad}{k.tur === 'olcum' && k.ad ? ` · ${k.ad}` : ''}{sinir ? ` · ${sinir}` : ''}</em> : null}
                        {k !== null ? <em data-kontrol="operator">Operatör kontrolü (kalite onayı değil)</em> : null}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </>
  );
}

function RotaDurumu({ d }: { d: TalimatDurumu }) {
  if (d.tur === 'yukleniyor') return <DurumKutusu durum="yukleniyor" mesaj="Talimatlar yükleniyor" />;
  if (d.tur === 'yetki') return <p className="tc-ay2-bilgi" role="status"><Simge ad="lock" /><span>Talimatı görme yetkin yok. Terminaldeki listeyi gören roller buradan da görür.</span></p>;
  if (d.tur === 'hata') return <p className="tc-ay2-bilgi" role="alert"><Simge ad="alert" /><span>Talimatlar alınamadı. Sayfayı yenileyip yeniden dene.</span></p>;
  if (d.tur === 'bilinmiyor') return <p className="tc-ay2-bilgi" role="status"><Simge ad="flag" /><span>Talimat CORE'dan okunur; bu paket CORE emrine bağlı değil ya da sunucu bağlı değil, o yüzden talimat bilinmiyor.</span></p>;
  if (d.liste.length === 0) return <p className="tc-ay2-bilgi" role="status"><Simge ad="flag" /><span>Bu işin talimatı yok. Operatör ekranında Talimatlar sekmesi boş görünür.</span></p>;
  return <RotaGruplari liste={d.liste} />;
}

// 3688 d4 (seçenek B): Talimatlar ve Adımlar tek sekmede, tek listede; her satır kaynağını rozetle söyler. Rota satırları burada yalnız
// okunur; paket adımı satırında "Düzenle" satırı yerinde açar. Talimatı görmek paketi düzenleme yetkisi istemez.
export function TalimatVeAdimlar({ paket, d, duzenler, yama }: { paket: Pkg; d: TalimatDurumu; duzenler: boolean; yama: (ch: Partial<Pkg>) => void }) {
  const adimlar = paket.steps;
  const { tmiyeGit } = useArkon();
  const yazar = useOturum().data?.islemler.includes('rota.talimat-yaz') === true;
  const [acik, acikYaz] = useState<string | null>(null);
  const adimYaz = (id: string, ch: Partial<Step>) => yama({ steps: adimlar.map((x) => (x.id === id ? { ...x, ...ch } : x)) });
  const ekle = (yeni: Step[]) => { yama({ steps: [...adimlar, ...yeni] }); if (yeni.length === 1 && yeni[0]) acikYaz(yeni[0].id); };
  const zorunluN = adimlar.filter((s) => s.r).length;
  return (
    <section className="tc-ay2-kart tc-ay2-talimat" aria-label="Talimat ve adımlar">
      <div className="tc-ay2-kb">
        <b>Operatörün göreceği liste</b>
        <span className="tc-ay2-ust-yazi">{d.tur === 'liste' ? `${String(d.liste.length)} talimat · ` : ''}{String(adimlar.length)} paket adımı</span>
        <span className="tc-ay2-sag tc-ay2-satir">
          {yazar ? <Dugme tur="ikincil" simge="tool" onClick={() => tmiyeGit('recete-rota')}>Reçete ve Rota'da aç</Dugme> : null}
          {duzenler ? <Dugme tur="ikincil" simge="plus" onClick={() => ekle([{ id: yeniKimlik(), t: '', d: '', r: zorunluYaz(false) }])}>Paket adımı ekle</Dugme> : null}
        </span>
      </div>
      <p className="tc-ay2-bilgi tc-ay2-kaynak-notu">
        <Simge ad="lock" />
        <span>
          <em data-kaynak="rota">Rota</em> satırları burada değiştirilmez; {yazar ? "Reçete ve Rota'da düzenlenir" : "Reçete ve Rota'da talimat yazma yetkisi olan kişi değiştirir"}.{' '}
          {duzenler ? <><em data-kaynak="paket">Paket</em> satırları bu pakete özeldir, burada düzenlenir.</> : 'Paketi düzenleme yetkin yok; paket satırları da yalnız görüntülenir.'}
        </span>
      </p>
      <RotaDurumu d={d} />
      <div className="tc-ay2-talimat-grup">
        <h3><b>Pakete özel adımlar</b><small>Operatör ekranında Adımlar sekmesinde · {String(zorunluN)} zorunlu</small><span className="tc-ay2-mono">{String(adimlar.length)}</span></h3>
        {adimlar.length === 0 ? <p className="tc-ay2-soluk">Bu pakette özel adım yok.</p> : (
          <ol className="tc-ay2-talimat-liste" aria-label="Paket adımları">
            {adimlar.map((s, i) => (duzenler && acik === s.id ? (
              <li key={s.id} className="tc-ay2-paket-adimi" data-acik="">
                <span className="tc-ay2-talimat-no">P{String(i + 1)}</span>
                <span className="tc-ay2-talimat-metin">
                  <span className="tc-ay2-talimat-etiket"><em data-kaynak="paket">Paket</em><span className="tc-ay2-soluk">Düzenleniyor</span></span>
                  <span className="tc-ay2-adim">
                    <span className="tc-ay2-adim-alan">
                      <input className="tc-ay2-kalin" value={s.t} placeholder="Adım başlığı" aria-label="Adım başlığı" onChange={(e) => adimYaz(s.id, { t: e.target.value })} />
                      <input value={s.d || ''} placeholder="Açıklama / değer" aria-label="Açıklama" onChange={(e) => adimYaz(s.id, { d: e.target.value })} />
                    </span>
                    <button type="button" className="tc-ay2-onay" aria-pressed={!!s.r} onClick={() => adimYaz(s.id, { r: zorunluYaz(!s.r) })}>Zorunlu</button>
                    <button
                      type="button" className="tc-ay2-arac" disabled={i === 0} aria-label="Yukarı"
                      onClick={() => { const a = adimlar.slice(); const u = a[i - 1]; const o = a[i]; if (u && o) { a[i - 1] = o; a[i] = u; yama({ steps: a }); } }}
                    ><Simge ad="up" /></button>
                    <button type="button" className="tc-ay2-arac" aria-label="Sil" onClick={() => { yama({ steps: adimlar.filter((x) => x.id !== s.id) }); acikYaz(null); }}><Simge ad="trash" /></button>
                  </span>
                  <span><Dugme tur="ikincil" simge="check" onClick={() => acikYaz(null)}>Bitti</Dugme></span>
                </span>
              </li>
            ) : (
              <li key={s.id} className="tc-ay2-paket-adimi">
                <span className="tc-ay2-talimat-no">P{String(i + 1)}</span>
                <span className="tc-ay2-talimat-metin">
                  <span className="tc-ay2-talimat-ad">{s.t || 'Başlıksız adım'}</span>
                  {s.d ? <small>{s.d}</small> : null}
                  <span className="tc-ay2-talimat-etiket">
                    <em data-kaynak="paket">Paket</em>
                    {s.r ? <em data-zorunlu="">Zorunlu</em> : null}
                    {duzenler ? <button type="button" className="tc-ay2-bag" aria-label={`${s.t || 'Başlıksız adım'} düzenle`} onClick={() => acikYaz(s.id)}><Simge ad="edit" boyut="k" />Düzenle</button> : null}
                  </span>
                </span>
              </li>
            )))}
          </ol>
        )}
      </div>
      {duzenler ? (
        <div className="tc-ay2-satir">
          {Object.keys(ADIM_SABLONLARI).map((k) => (
            <Dugme key={k} tur="ikincil" simge="plus" onClick={() => ekle((ADIM_SABLONLARI[k] || []).map((x): Step => ({ id: yeniKimlik(), ...x, r: zorunluYaz(x.r) })))}>{k}</Dugme>
          ))}
        </div>
      ) : null}
      <p className="tc-ay2-soluk">Resim ve video terminalde gösterilmez; operatör madde metnini, zorunluluğu ve ölçüm sınırını görür.</p>
    </section>
  );
}
