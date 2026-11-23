import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { alternatifOzeti, olcuEtiketi } from '#paylasilan/malzeme-alternatif-ozeti.ts';
import type {
  AlternatifSeti, KullanimYeri, MuadilTuru, SetNiteligi, SetNiteligiYazimi,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { FORM_OLCULERI, OLCULU_FORMLAR, type OlculuForm } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';
import { CokSatir, Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import type { KatalogKarti } from '../tipler.ts';
import { TUR_ADI, YERLER, YER_ADI, anaListeMetni, anaOzetKarti, formAdi, islemleri } from './tablo.ts';
import { useSetKaldir, useSetKaydet, useSetOnizleme } from './veri.ts';

// 3572 a, 3593: alternatif kartı penceresi (veride set). Her alanın kipi var: Birebir ana kartın değerini izler, Bunlardan biri işaretli
// değerlerden birini, Serbest hepsini kabul eder; ölçüde Pay ana ölçünün altı ve üstü, Aralık en az ve en çok. "Ana karttan başlat"
// her alanı Birebir açar; kullanıcı yalnız gevşeteceğini değiştirir. Uyan kartlar sunucuda canlı sayılır; kayıt aynı kuralla yeniden sayar.
type ListeAlani = 'form' | 'kalite' | 'durum' | 'islem' | 'standart' | 'yuzey';
type ListeKipi = 'birebir' | 'biri' | 'serbest';
type OlcuKipi = 'birebir' | 'pay' | 'aralik' | 'serbest';
const LISTE_ALANLARI: readonly { alan: ListeAlani; ad: string }[] = [
  { alan: 'form', ad: 'Form' }, { alan: 'kalite', ad: 'Kalite' }, { alan: 'durum', ad: 'Durum' }, { alan: 'islem', ad: 'İşlem' },
  { alan: 'standart', ad: 'Standart' }, { alan: 'yuzey', ad: 'Yüzey' },
];
const LISTE_KIPLERI: readonly { kip: ListeKipi; ad: string }[] = [{ kip: 'birebir', ad: 'Birebir' }, { kip: 'biri', ad: 'Bunlardan biri' }, { kip: 'serbest', ad: 'Serbest' }];
const OLCU_KIPLERI: readonly { kip: OlcuKipi; ad: string }[] = [
  { kip: 'birebir', ad: 'Birebir' }, { kip: 'pay', ad: 'Pay' }, { kip: 'aralik', ad: 'Aralık' }, { kip: 'serbest', ad: 'Serbest' },
];
// Sette taşınan ölçüler (sözleşmedeki OLCU_NITELIKLERI; istemci sözleşmeyi yalnız tip olarak ithal eder).
const OLCU_SET = new Set<string>(['d', 's', 'a', 'b', 't', 'D', 'h', 'l']);
const ILK_GOSTERILEN = 5;
const sayiOku = (x: string): number | null => (x.trim() === '' ? null : Number(x.replace(',', '.')));
const metin = (v: number | null) => (v === null ? '' : String(v));
interface ListeDurumu { kip: ListeKipi; degerler: string[] }
interface OlcuDurumu { kip: OlcuKipi; alt: string; ust: string; payAlt: string; payUst: string }
const BOS_OLCU: OlcuDurumu = { kip: 'serbest', alt: '', ust: '', payAlt: '', payUst: '' };

function katalogDegerleri(kartlar: readonly KatalogKarti[]): Record<ListeAlani, string[]> {
  const kume = (f: (k: KatalogKarti) => readonly (string | null | undefined)[]) =>
    [...new Set(kartlar.filter((k) => k.kayit.tur === 'hammadde').flatMap(f).filter((x): x is string => typeof x === 'string' && x.trim() !== ''))]
      .sort((a, b) => a.localeCompare(b, 'tr'));
  const secenek = (k: KatalogKarti, ad: string) => { const v = (k.kayit.opts as Record<string, unknown> | undefined)?.[ad]; return typeof v === 'string' ? v : null; };
  return {
    form: kume((k) => [k.kayit.form]), kalite: kume((k) => [k.kayit.grade]), durum: kume((k) => [secenek(k, 'durum')]),
    islem: kume((k) => islemleri(k)),
    standart: kume((k) => (k.kayit.stds as string[] | undefined) ?? []), yuzey: kume((k) => [secenek(k, 'yuzey')]),
  };
}

// Gösterilen ölçü alanları: seçili formların (yoksa kartın formunun) kesit ve boy ölçüleri, yalnız sette taşınanlar.
function olcuAlanlari(formlar: readonly string[], anaForm: string | null): SetNiteligi[] {
  const l = (formlar.length > 0 ? formlar : anaForm ? [anaForm] : []).filter((f): f is OlculuForm => (OLCULU_FORMLAR as readonly string[]).includes(f));
  const anahtarlar: string[] = l.flatMap((f) => [...FORM_OLCULERI[f].kesit, ...(FORM_OLCULERI[f].boy ? [FORM_OLCULERI[f].boy] : [])]);
  return [...new Set(anahtarlar)].filter((a): a is SetNiteligi => OLCU_SET.has(a));
}

function ilkListe(kayit: AlternatifSeti | null, anadan: boolean): Record<ListeAlani, ListeDurumu> {
  return Object.fromEntries(LISTE_ALANLARI.map(({ alan }) => {
    if (anadan) return [alan, { kip: 'birebir', degerler: [] }];
    const x = kayit?.nitelikler.find((n) => n.nitelik === alan);
    if (!x) return [alan, { kip: 'serbest', degerler: [] }];
    return [alan, x.kip === 'birebir' ? { kip: 'birebir', degerler: [] } : { kip: 'biri', degerler: x.degerler ?? [] }];
  })) as Record<ListeAlani, ListeDurumu>;
}
function ilkOlcu(kayit: AlternatifSeti | null, anadan: boolean, anaOlculeri: readonly string[]): Record<string, OlcuDurumu> {
  if (anadan) return Object.fromEntries(anaOlculeri.map((a) => [a, { ...BOS_OLCU, kip: 'birebir' }]));
  return Object.fromEntries((kayit?.nitelikler ?? []).filter((x) => OLCU_SET.has(x.nitelik)).map((x) => [x.nitelik, {
    kip: x.kip === 'birebir' || x.kip === 'pay' ? x.kip : 'aralik', alt: metin(x.alt), ust: metin(x.ust), payAlt: metin(x.payAlt), payUst: metin(x.payUst),
  }]));
}

export function SetPenceresi({ ana, kartlar, kayit, anadan = false, esik, kapat }: {
  ana: KatalogKarti; kartlar: readonly KatalogKarti[]; kayit: AlternatifSeti | null; anadan?: boolean; esik: number; kapat: () => void;
}) {
  const kaydet = useSetKaydet();
  const kaldir = useSetKaldir();
  const { bildir } = useBildirim();
  const secenekler = useMemo(() => katalogDegerleri(kartlar), [kartlar]);
  const anaOzet = useMemo(() => anaOzetKarti(ana), [ana]);
  const anaForm = ana.kayit.form;
  const [ad, adYaz] = useState(kayit?.ad ?? '');
  const [notu, notuYaz] = useState(kayit?.notu ?? '');
  const [tur, turYaz] = useState<MuadilTuru>(kayit?.tur ?? 'tam');
  const [yerler, yerlerYaz] = useState<KullanimYeri[]>(kayit?.kullanimYerleri ?? [...YERLER]);
  const [liste, listeYaz] = useState<Record<ListeAlani, ListeDurumu>>(() => ilkListe(kayit, anadan));
  const [olcu, olcuYaz] = useState<Record<string, OlcuDurumu>>(() => ilkOlcu(kayit, anadan, olcuAlanlari([], anaForm)));
  const [elle, elleYaz] = useState('');
  const [genis, genisYaz] = useState(kayit?.genisOnay ?? false);
  const [hepsi, hepsiYaz] = useState(false);
  const [sor, sorYaz] = useState(false);
  const [hata, hataYaz] = useState<Record<string, string>>({});
  const formlar = liste.form.kip === 'biri' ? liste.form.degerler : [];
  const olculer = olcuAlanlari(formlar, anaForm);

  const nitelikler: SetNiteligiYazimi[] = [
    ...LISTE_ALANLARI.flatMap(({ alan }): SetNiteligiYazimi[] => {
      const x = liste[alan];
      if (x.kip === 'birebir') return [{ nitelik: alan, kip: 'birebir', degerler: null, alt: null, ust: null, payAlt: null, payUst: null }];
      return x.kip === 'biri' && x.degerler.length > 0 ? [{ nitelik: alan, kip: null, degerler: x.degerler, alt: null, ust: null, payAlt: null, payUst: null }] : [];
    }),
    ...olculer.flatMap((a): SetNiteligiYazimi[] => {
      const x = olcu[a] ?? BOS_OLCU;
      if (x.kip === 'birebir') return [{ nitelik: a, kip: 'birebir', degerler: null, alt: null, ust: null, payAlt: null, payUst: null }];
      if (x.kip === 'pay') return [{ nitelik: a, kip: 'pay', degerler: null, alt: null, ust: null, payAlt: sayiOku(x.payAlt) ?? 0, payUst: sayiOku(x.payUst) ?? 0 }];
      const alt = sayiOku(x.alt), ust = sayiOku(x.ust);
      return x.kip === 'serbest' || (alt === null && ust === null) ? [] : [{ nitelik: a, kip: 'aralik', degerler: null, alt, ust, payAlt: null, payUst: null }];
    }),
  ];
  const yerelHata = (a: string): string | undefined => {
    const x = olcu[a];
    if (!x) return undefined;
    const sayilar = x.kip === 'pay' ? [sayiOku(x.payAlt), sayiOku(x.payUst)] : x.kip === 'aralik' ? [sayiOku(x.alt), sayiOku(x.ust)] : [];
    if (sayilar.some((v) => v !== null && !Number.isFinite(v))) return 'Sayı girin.';
    if (sayilar.some((v) => v !== null && v < 0)) return x.kip === 'pay' ? 'Pay eksi olamaz; aşağı payı "−" kutusuna pozitif yazın.' : 'Ölçü eksi olamaz.';
    if (x.kip === 'aralik' && sayilar[0] != null && sayilar[1] != null && sayilar[0] > sayilar[1]) return 'En az en çoktan büyük olamaz.';
    return undefined;
  };
  const olcuUyarisi = (a: string): string | undefined => {
    const x = olcu[a];
    if (x?.kip === 'pay' && (sayiOku(x.payAlt) ?? 0) === 0 && (sayiOku(x.payUst) ?? 0) === 0) return '−0/+0 birebir demektir.';
    if (x?.kip === 'aralik' && sayiOku(x.alt) === null && sayiOku(x.ust) === null) return 'İki uç da boş: bu ölçüde sınır yok (Serbest).';
    return undefined;
  };
  const olcuHatasi = (a: string) => yerelHata(a) ?? hata[`nitelikler.${a}`];
  const gecerli = olculer.every((a) => yerelHata(a) === undefined);
  const onizleme = useSetOnizleme(ana.no, nitelikler, gecerli);
  const sayi = nitelikler.length === 0 ? null : onizleme.data?.uyanSayisi ?? null;
  const sartli = onizleme.data?.sartli === true && nitelikler.length > 0;
  useEffect(() => { if (sartli) turYaz('sartli'); }, [sartli]);
  const ozet = alternatifOzeti(nitelikler, anaOzet, formAdi).join(' · ');

  const listeKipi = (alan: ListeAlani, kip: ListeKipi) => listeYaz((l) => ({ ...l, [alan]: { ...l[alan], kip } }));
  const degistir = (alan: ListeAlani, deger: string) => listeYaz((l) => {
    const d = l[alan].degerler.includes(deger) ? l[alan].degerler.filter((x) => x !== deger) : [...l[alan].degerler, deger];
    return { ...l, [alan]: { kip: d.length > 0 ? 'biri' : l[alan].kip === 'birebir' ? 'birebir' : 'serbest', degerler: d } };
  });
  const olcuDegistir = (a: string, ek: Partial<OlcuDurumu>) => olcuYaz((o) => ({ ...o, [a]: { ...(o[a] ?? BOS_OLCU), ...ek } }));
  const gonder = () => {
    const h: Record<string, string> = {};
    if (ad.trim() === '') h.ad = 'Alternatif kartının adını yazın.';
    if (nitelikler.length === 0) h.nitelikler = 'En az bir alanı Birebir ya da sınırlı yapın.';
    if (yerler.length === 0) h.kullanimYerleri = 'En az bir yer seçin.';
    if (sayi !== null && sayi > esik && !genis) h.genisOnay = 'Geniş kart için işaret gerekir.';
    hataYaz(h);
    if (Object.keys(h).length > 0 || !gecerli) return;
    kaydet.mutate({
      anaNo: ana.no, ...(kayit ? { id: kayit.id, surum: kayit.surum } : {}), ad: ad.trim(), tur, kullanimYerleri: yerler,
      notu: notu.trim() === '' ? null : notu.trim(), nitelikler, genisOnay: genis,
    }, {
      onSuccess: (c) => { bildir('tamam', `Alternatif kartı kaydedildi · ${c.uyanSayisi > 0 ? `${String(c.uyanSayisi)} kart uyuyor` : 'uyan kart yok'}`); kapat(); },
      onError: (e) => {
        const alan = e instanceof ApiHatasi ? e.govde.alan : undefined;
        if (alan) hataYaz({ [alan]: hataIletisi(e, 'Alternatif kartı kaydedilemedi') });
        bildir('hata', hataIletisi(e, 'Alternatif kartı kaydedilemedi'));
      },
    });
  };
  const sil = () => {
    if (!kayit) return;
    kaldir.mutate({ id: kayit.id, surum: kayit.surum }, {
      onSuccess: () => { bildir('tamam', 'Alternatif kartı kaldırıldı'); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Alternatif kartı kaldırılamadı')),
      onSettled: () => sorYaz(false),
    });
  };
  const uyanlar = onizleme.data?.uyanlar ?? [];
  const listeAlani = ({ alan, ad: baslik }: { alan: ListeAlani; ad: string }) => {
    const x = liste[alan];
    const anaDegeri = anaListeMetni(anaOzet, alan);
    return (
      <div key={alan} className="tc-kalt-nit">
        <div className="tc-kalt-nit-bas"><b>{baslik}</b><span className="tc-alt-soluk">{`ana: ${anaDegeri}`}</span></div>
        <KipSecici ad={baslik} kipler={LISTE_KIPLERI} deger={x.kip} degistir={(k) => listeKipi(alan, k)} />
        {x.kip === 'birebir' && <span className="tc-alt-soluk">{`${anaDegeri} · ana kart değişirse izler`}</span>}
        {x.kip === 'biri' && (
          <CipAlani baslik={`${baslik} değerleri`} degerler={[...new Set([...secenekler[alan], ...x.degerler])]} secili={x.degerler}
            {...(alan === 'form' ? { ad: formAdi } : {})} degistir={(d) => degistir(alan, d)} />
        )}
        {alan === 'kalite' && x.kip === 'biri' && (
          <div className="tc-kalt-bagla">
            <Girdi etiket="Katalogda olmayan kaliteyi elle yaz" maxLength={60} value={elle} onChange={(e) => elleYaz(e.target.value)} />
            <Dugme simge="plus" disabled={!elle.trim() || x.degerler.includes(elle.trim())} onClick={() => { degistir('kalite', elle.trim()); elleYaz(''); }}>Ekle</Dugme>
          </div>
        )}
        {alan === 'islem' && x.kip === 'biri' && <span className="tc-alt-soluk">İşaretli işlemlerin hepsi kartta olmalı.</span>}
        {hata[`nitelikler.${alan}`] && <p className="tc-kalt-hata" role="alert">{hata[`nitelikler.${alan}`]}</p>}
      </div>
    );
  };
  return (
    <Pencere
      acik
      genis
      kapat={kapat}
      baslik={kayit ? 'Alternatif kartını düzenle' : anadan ? 'Ana karttan alternatif kartı' : 'Alternatif kartı ekle'}
      alt={(
        <div className="tc-mk-pencere-alt">
          {kayit && <Dugme simge="trash" onClick={() => sorYaz(true)}>Alternatif kartını kaldır</Dugme>}
          <span className="tc-kalt-sag">
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" yukleniyor={kaydet.isPending} onClick={gonder}>Kaydet</Dugme>
          </span>
        </div>
      )}
    >
      <div className="tc-alt-form">
        <Girdi etiket="Ad" maxLength={80} value={ad} hata={hata.ad} onChange={(e) => adYaz(e.target.value)} placeholder="ör. 6061 de olur" />
        <p className="tc-kalt-ozet" aria-live="polite"><b>Özet</b> {ozet || 'Bütün alanlar serbest'}</p>
        {anadan && <p className="tc-alt-not">Ana kartın değerleriyle başladı; yalnız gevşettiğiniz alanı değiştirin.</p>}
        {hata.nitelikler && <p className="tc-kalt-hata" role="alert">{hata.nitelikler}</p>}
        {LISTE_ALANLARI.slice(0, 1).map(listeAlani)}
        {olculer.map((a) => {
          const x = olcu[a] ?? BOS_OLCU;
          const e = olcuEtiketi(a);
          const anaDeger = anaOzet.olcu[a];
          const anaMetni = anaDeger === undefined ? 'yok' : `${String(anaDeger)} mm`;
          return (
            <div key={a} className="tc-kalt-nit">
              <div className="tc-kalt-nit-bas"><b>{e === a ? a : `${e} (${a})`}</b><span className="tc-alt-soluk">{`ana: ${anaMetni}`}</span></div>
              <KipSecici ad={e} kipler={OLCU_KIPLERI} deger={x.kip} degistir={(k) => olcuDegistir(a, { kip: k })} />
              {x.kip === 'birebir' && <span className="tc-alt-soluk">{`${anaMetni} · ana kart değişirse izler`}</span>}
              {x.kip === 'pay' && (
                <div className="tc-kalt-bagla tc-kalt-aralik">
                  <Girdi etiket={`${e} aşağı pay (mm)`} inputMode="decimal" placeholder="0" value={x.payAlt} hata={olcuHatasi(a)}
                    onChange={(ev) => olcuDegistir(a, { payAlt: ev.target.value })} />
                  <Girdi etiket={`${e} yukarı pay (mm)`} inputMode="decimal" placeholder="0" value={x.payUst}
                    onChange={(ev) => olcuDegistir(a, { payUst: ev.target.value })} />
                </div>
              )}
              {x.kip === 'aralik' && (
                <div className="tc-kalt-bagla tc-kalt-aralik">
                  <Girdi etiket={`${e} en az (mm)`} inputMode="decimal" placeholder="sınırsız" value={x.alt} hata={olcuHatasi(a)}
                    onChange={(ev) => olcuDegistir(a, { alt: ev.target.value })} />
                  <Girdi etiket={`${e} en çok (mm)`} inputMode="decimal" placeholder="sınırsız" value={x.ust}
                    onChange={(ev) => olcuDegistir(a, { ust: ev.target.value })} />
                </div>
              )}
              {!olcuHatasi(a) && olcuUyarisi(a) && <p className="tc-alt-soluk" role="note">{olcuUyarisi(a)}</p>}
            </div>
          );
        })}
        {LISTE_ALANLARI.slice(1).map(listeAlani)}
        <fieldset className="tc-kalt-cipler">
          <legend>Tür</legend>
          {(['tam', 'ust', 'sartli'] as const).map((t) => (
            <button key={t} type="button" className="tc-kalt-cip" aria-pressed={tur === t} disabled={sartli && t !== 'sartli'} onClick={() => turYaz(t)}>{TUR_ADI[t]}</button>
          ))}
        </fieldset>
        {sartli && <p className="tc-alt-kapali" role="note">Şartlı muadil bir değer işaretli: alternatif kartı Şartlı kaydedilir.</p>}
        <fieldset className="tc-kalt-cipler">
          <legend>Nerede geçerli</legend>
          {YERLER.map((y) => (
            <button key={y} type="button" className="tc-kalt-cip" aria-pressed={yerler.includes(y)}
              onClick={() => yerlerYaz((l) => (l.includes(y) ? l.filter((x) => x !== y) : [...l, y]))}>{YER_ADI[y]}</button>
          ))}
          {hata.kullanimYerleri && <span className="tc-kalt-hata" role="alert">{hata.kullanimYerleri}</span>}
        </fieldset>
        <CokSatir etiket="Not" maxLength={300} rows={2} value={notu} onChange={(e) => notuYaz(e.target.value)} />
        <section className="tc-alt-bolum tc-kalt-uyan" aria-label="Bu alternatif kartına uyan kartlar" aria-live="polite">
          <h4 className="tc-alt-alt-baslik">
            {sayi === null ? 'Uyan kartlar: bir alanı Birebir ya da sınırlı yapın' : sayi === 0 ? 'Uyan kart yok' : `Uyan kart: ${String(sayi)}`}
            {onizleme.isFetching ? <span className="tc-alt-soluk"> · hesaplanıyor</span> : sayi !== null && <span className="tc-alt-soluk"> · şimdi hesaplandı</span>}
          </h4>
          {onizleme.isError && <p className="tc-kalt-hata">{hataIletisi(onizleme.error, 'Uyan kartlar okunamadı')}</p>}
          {uyanlar.length > 0 && (
            <ul className="tc-kalt-liste">
              {(hepsi ? uyanlar : uyanlar.slice(0, ILK_GOSTERILEN)).map((u) => (
                <li key={u.no} className="tc-kalt-satir">
                  <span className={u.durum === 'onerilmez' ? 'mono tc-kalt-cizili' : 'mono'}>{u.kod ?? `#${String(u.no)}`}</span>
                  <span className="tc-kalt-ad-metin">{u.ad ?? ''} · {u.neden}</span>
                  {u.yeni && <Rozet ton="bilgi">yeni</Rozet>}
                  {u.durum === 'tekil' && <Rozet ton="pasif">tekil satır geçer</Rozet>}
                  {u.durum === 'onerilmez' && <Rozet ton="hata">Önerilmiyor</Rozet>}
                </li>
              ))}
            </ul>
          )}
          {uyanlar.length > ILK_GOSTERILEN && (
            <Dugme onClick={() => hepsiYaz(!hepsi)}>{hepsi ? 'Daha az göster' : `İlk ${String(ILK_GOSTERILEN)} gösteriliyor · Hepsini göster`}</Dugme>
          )}
          {sayi !== null && sayi > uyanlar.length && hepsi && <p className="tc-alt-soluk">{`İlk ${String(uyanlar.length)} kart gösterilir; daraltmak için alanları doldurun.`}</p>}
          {sayi === 0 && <p className="tc-alt-kapali" role="note">Uyan kart yok; yine de kaydedilebilir. Teklif ve siparişe sınır olarak gider; sonradan açılan uyan kart kendiliğinden girer.</p>}
          {sayi !== null && sayi > esik && (
            <div className="tc-alt-kapali" role="note">
              <span>{`Bu alternatif kartı ${String(sayi)} kartı kabul eder ve sonradan açılan uyan kartlar da girer.`}</span>
              <IsaretKutusu etiket="Bu kadar geniş olduğunu biliyorum" checked={genis} onChange={(e) => genisYaz(e.target.checked)} />
              {hata.genisOnay && <span className="tc-kalt-hata" role="alert">{hata.genisOnay}</span>}
            </div>
          )}
        </section>
      </div>
      <OnayPenceresi acik={sor} baslik="Alternatif kartı kaldırılsın mı?" onayMetni="Kaldır" tehlikeli yukleniyor={kaldir.isPending} onayla={sil} vazgec={() => sorYaz(false)}>
        <p>Alternatif kartı bu malzemenin alternatiflerinden çıkar; Geçmiş'e yazılır. Açık talep, sipariş ve emirdeki seçimler değişmez.</p>
      </OnayPenceresi>
    </Pencere>
  );
}

// Kip seçimi tek seçimli düğme grubu; ok tuşları grupta dolaşır.
function KipSecici<K extends string>({ ad, kipler, deger, degistir }: {
  ad: string; kipler: readonly { kip: K; ad: string }[]; deger: K; degistir: (k: K) => void;
}) {
  const tus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = kipler.findIndex((k) => k.kip === deger);
    const j = (i + (e.key === 'ArrowRight' ? 1 : kipler.length - 1)) % kipler.length;
    degistir(kipler[j]!.kip);
    (e.currentTarget.children[j] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="tc-kalt-kip" role="radiogroup" aria-label={`${ad} kipi`} onKeyDown={tus}>
      {kipler.map((k) => (
        <button key={k.kip} type="button" role="radio" aria-checked={deger === k.kip} tabIndex={deger === k.kip ? 0 : -1} onClick={() => degistir(k.kip)}>{k.ad}</button>
      ))}
    </div>
  );
}

function CipAlani({ baslik, degerler, secili, ad = (x: string) => x, degistir }: {
  baslik: string; degerler: readonly string[]; secili: readonly string[]; ad?: (x: string) => string; degistir: (d: string) => void;
}) {
  return (
    <fieldset className="tc-kalt-cipler">
      <legend>{baslik}</legend>
      {degerler.length === 0 ? <span className="tc-alt-soluk">Katalogda değer yok</span> : degerler.map((d) => (
        <button key={d} type="button" className="tc-kalt-cip" aria-pressed={secili.includes(d)} onClick={() => degistir(d)}>{ad(d)}</button>
      ))}
    </fieldset>
  );
}
