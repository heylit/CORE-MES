import { useEffect, useRef, useState } from 'react';
import type { ListeKanitiGirdisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Girdi, Pencere, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { listeFotografiUcu } from './adim-durumu.ts';
import { useAdimKomutu } from './adim-komutu.ts';
import { ASAMA_ADI, isaretKaydi, kaldirKomutu, kaldirilir, listeKomutu, type Adim, type ListeMaddesi } from './adim-tablosu.ts';
import {
  BOS_TASLAK, KanitGirisi, KanitHucresi, KontrolAlanlari, KontrolEtiketi, SablonSecenegi, kanitGerekir, taslaktanKontrol, type KontrolTaslagi,
} from './AdimListesi.tsx';

// Odak (Arayüz 3494-3): soru açılınca Vazgeç'e, Vazgeç ya da Escape sonrası Kaldır'a döner; kaldırınca satırdan sonraki ilk
// denetime (sonraki madde ya da Madde düğmesi) geçer, kaybolmaz.
function KaldirDugmesi({ m, mesgul, kaldir }: { m: ListeMaddesi; mesgul: boolean; kaldir: () => void }) {
  const [soruyor, soruyorYaz] = useState(false);
  const kap = useRef<HTMLSpanElement>(null);
  const donus = useRef(false);
  useEffect(() => {
    if (soruyor) kap.current?.querySelector<HTMLButtonElement>('[data-vazgec]')?.focus();
    else if (donus.current) { donus.current = false; kap.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
  }, [soruyor]);
  const vazgec = () => { donus.current = true; soruyorYaz(false); };
  // Escape yerel dinleyicide yakalanır: yan pencerenin Escape'i (katman) kutuya ulaşmadan durur, pencere kapanmaz.
  useEffect(() => {
    const el = kap.current;
    if (!soruyor || el === null) return undefined;
    const tus = (o: KeyboardEvent) => { if (o.key === 'Escape') { o.preventDefault(); o.stopPropagation(); donus.current = true; soruyorYaz(false); } };
    el.addEventListener('keydown', tus);
    return () => el.removeEventListener('keydown', tus);
  }, [soruyor]);
  const onayla = () => {
    const satir = kap.current?.closest('tr, li');
    let sonraki = satir?.nextElementSibling ?? null;
    let hedef: HTMLElement | null = null;
    while (sonraki !== null && hedef === null) {
      hedef = sonraki.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)');
      sonraki = sonraki.nextElementSibling;
    }
    soruyorYaz(false);
    kaldir();
    hedef?.focus();
  };
  return (
    <span ref={kap} className="tc-ad-kaldir" role={soruyor ? 'group' : undefined} aria-label={soruyor ? `${m.ad} kaldırılsın mı?` : undefined}>
      {soruyor ? (
        <>
          <span>Madde listeden, terminalden ve matristen kalkar. Geri alınmaz.</span>
          <span className="tc-ad-kaldir-dugmeler">
            <Dugme tur="tehlike" simge="trash" disabled={mesgul} onClick={onayla}>Kaldır</Dugme>
            <Dugme data-vazgec="" onClick={vazgec}>Vazgeç</Dugme>
          </span>
        </>
      ) : <Dugme simge="trash" disabled={mesgul} onClick={() => soruyorYaz(true)} aria-label={`Kaldır: ${m.ad}`}>Kaldır</Dugme>}
    </span>
  );
}

// Tik kutusu: tıklamak ve Boşluk aynı komutu gönderir. Okuyucu ve kapalı emirde kutu yalnız durumu gösterir.
function ListeKutusu({ adim, m, yaz, mesgul, degistir }: { adim: Adim; m: ListeMaddesi; yaz: boolean; mesgul: boolean; degistir: () => void }) {
  return (
    <label className="tc-ad-madde">
      <input type="checkbox" checked={m.tamam} disabled={!yaz || mesgul} onChange={degistir}
        aria-label={`OP ${String(adim.opNo)} ${m.ad}`} />
      <span>{m.ad}<small>{ASAMA_ADI[m.asama]}{m.kontrol !== null && m.kontrol.tur !== 'onay' ? ' · kontrol · ' : ''}<KontrolEtiketi k={m.kontrol} />{m.aciklama === null ? '' : ` · ${m.aciklama}`}</small></span>
    </label>
  );
}

// 3249 b: Adım Durumu'ndan emre madde ekleme; yalnız bu emrin bu adımına yazılır. Kontrol adımı hazırlık aşamasındadır (Risk K5) ve
// 3249-2 a ile türlüdür: onay, ölçüm, fotoğraf, seçim. "Şablona da ekle" seçilirse madde adımın tipinin emre gelen şablonuna da yeni
// sürümle eklenir; seçenek yalnız talimat yazma yetkisi de olana ve şablonu olan adımda görünür, varsayılan kapalıdır.
function MaddeEkle({ emirId, adim, kontrol, kapat, sablon }: {
  emirId: number; adim: Adim; kontrol: boolean; kapat: () => void; sablon: { kod: string; ad: string } | null;
}) {
  const [ad, adYaz] = useState('');
  const [asama, asamaYaz] = useState<ListeMaddesi['asama']>('hazirlik');
  const [taslak, taslakYaz] = useState<KontrolTaslagi>(BOS_TASLAK);
  const [sablonaEkle, sablonaEkleYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, kapat);
  const gonder = () => {
    if (ad.trim() === '') return;
    const sonuc = kontrol ? taslaktanKontrol(taslak, ad) : { kontrol: { tur: 'onay' as const } };
    if ('hata' in sonuc) { hataYaz(sonuc.hata); return; }
    hataYaz(null);
    yap({
      yol: 'liste-ekle', govde: { ad: ad.trim(), asama: kontrol ? 'hazirlik' : asama, kontrol: sonuc.kontrol, sablonaEkle: sablon !== null && sablonaEkle },
      mesaj: `Eklendi: ${ad.trim()}${sablon !== null && sablonaEkle ? ` · ${sablon.kod} şablonuna da` : ''}`,
    });
  };
  return (
    <div className="tc-ad-hucre-pencere">
      <Girdi etiket={kontrol ? 'Kontrol adımı' : 'Madde adı'} placeholder={kontrol ? 'Örn. İlk parça ölçüldü' : 'Örn. Bağlama aparatı hazır'} maxLength={120} value={ad} autoFocus
        onChange={(e) => adYaz(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') gonder(); }} />
      {kontrol
        ? (
          <>
            <KontrolAlanlari t={taslak} degistir={(t) => { taslakYaz(t); hataYaz(null); }} hata={hata} />
            <p className="tc-emir-not"><Simge ad="ruler" boyut="k" /> Aşama: Hazırlık · kontrol. Operatör terminalde de görür ve işaretler.</p>
          </>
        )
        : (
          <Secim etiket="Aşama" value={asama} onChange={(e) => asamaYaz(e.target.value as ListeMaddesi['asama'])}
            secenekler={(Object.keys(ASAMA_ADI) as ListeMaddesi['asama'][]).map((a) => ({ deger: a, baslik: ASAMA_ADI[a] }))} />
        )}
      {sablon !== null && <SablonSecenegi sablon={sablon} secili={sablonaEkle} degistir={sablonaEkleYaz} />}
      {!(sablon !== null && sablonaEkle) && <p className="tc-emir-not">Yalnız bu emrin bu adımına eklenir; şablon değişmez.</p>}
      <div className="tc-emir-ust">
        <Dugme tur="birincil" simge="plus" disabled={ad.trim() === '' || mesgul} onClick={gonder}>Ekle</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}

// Kontrol listesi (3249 b, 3581): adımın ön hazırlık ve hazırlık listesi, açılan satırın içinde. Tik kutusu, kanıt (ölçüm, fotoğraf, seçim),
// elle eklenen maddenin kaldırılması ve madde ekleme; hepsi eskisiyle aynı komutlardır. Yazma yalnız yetkilide ve açık emirde.
export function KontrolListesi({ emirId, adim, yazar, sablonVar }: { emirId: number; adim: Adim; yazar: boolean; sablonVar: boolean }) {
  const [kanitAcik, kanitAcikYaz] = useState<number | null>(null);
  const [ekleme, eklemeYaz] = useState<{ kontrol: boolean } | null>(null);
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, () => { kanitAcikYaz(null); });
  const degistir = (m: ListeMaddesi, kanit?: ListeKanitiGirdisi) => {
    const k = listeKomutu(adim, m, kanit);
    if (k === null) kanitAcikYaz(m.adimId); else yap(k);
  };
  return (
    <section className="tc-at-kutu" aria-label={`OP ${String(adim.opNo)} kontrol listesi`}>
      <header className="tc-at-kutu-bas">
        <h4><Simge ad="list" boyut="k" />Kontrol listesi</h4>
        {yazar && (
          <span className="tc-at-kutu-eylem">
            <Dugme simge="plus" onClick={() => eklemeYaz({ kontrol: false })}>Madde</Dugme>
            <Dugme simge="ruler" onClick={() => eklemeYaz({ kontrol: true })}>Kontrol adımı</Dugme>
          </span>
        )}
      </header>
      {adim.liste.length === 0 ? <p className="tc-emir-not">Liste yok.</p> : (
        <ul className="tc-ad-liste-maddeleri" aria-label={`OP ${String(adim.opNo)} hazırlık listesi`}>
          {adim.liste.map((m) => (
            <li key={m.adimId}>
              <ListeKutusu adim={adim} m={m} yaz={yazar} mesgul={mesgul} degistir={() => degistir(m)} />
              {kanitGerekir(m)
                ? <KanitHucresi m={m} yaz={yazar && !mesgul} ac={() => kanitAcikYaz(m.adimId)} secimYap={(x) => degistir(m, { secim: x })}
                    fotoAdresi={m.fotoOzet === null ? null : `/api${listeFotografiUcu(emirId, m.adimId, m.fotoOzet)}`} not={isaretKaydi(m, false)} />
                : <small>{isaretKaydi(m)}</small>}
              {yazar && kaldirilir(m) && <KaldirDugmesi m={m} mesgul={mesgul} kaldir={() => yap(kaldirKomutu(adim, m))} />}
              {kanitAcik === m.adimId && yazar && (
                <KanitGirisi m={m} mesgul={mesgul} gonder={(k) => degistir(m, k)} kapat={() => kanitAcikYaz(null)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <Pencere acik={ekleme !== null} kapat={() => eklemeYaz(null)} baslik={ekleme === null ? 'Madde' : `OP ${String(adim.opNo)} · ${ekleme.kontrol ? 'Kontrol adımı ekle' : 'Madde ekle'}`}>
        {ekleme !== null && (
          <MaddeEkle key={String(ekleme.kontrol)} emirId={emirId} adim={adim} kontrol={ekleme.kontrol} kapat={() => eklemeYaz(null)} sablon={sablonVar ? adim.sablon : null} />
        )}
      </Pencere>
    </section>
  );
}
