import { useEffect, useMemo, useState } from 'react';
import type {
  AlternatifSeti, KullanimYeri, MuadilTuru, SetNiteligi, SetNiteligiYazimi,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { FORM_OLCULERI, OLCULU_FORMLAR, type OlculuForm } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';
import { CokSatir, Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import type { KatalogKarti } from '../tipler.ts';
import { TUR_ADI, YERLER, YER_ADI, formAdi } from './tablo.ts';
import { useSetKaldir, useSetKaydet, useSetOnizleme } from './veri.ts';

// 3572 a: alternatif seti penceresi. Alanda seçili değerlerden biri yeter, dolu alanların hepsi tutmalı; seçili değer yoksa alan
// serbesttir. Uyan kartlar sunucuda canlı sayılır; kayıt aynı kuralla yeniden sayar ve eşiği denetler.
type ListeAlani = 'form' | 'kalite' | 'durum' | 'standart' | 'yuzey';
const LISTE_ALANLARI: readonly { alan: ListeAlani; ad: string }[] = [
  { alan: 'form', ad: 'Form' }, { alan: 'kalite', ad: 'Kalite' }, { alan: 'durum', ad: 'Durum' }, { alan: 'standart', ad: 'Standart' }, { alan: 'yuzey', ad: 'Yüzey' },
];
// Sette taşınan ölçüler (sözleşmedeki OLCU_NITELIKLERI; istemci sözleşmeyi yalnız tip olarak ithal eder).
const OLCU_SET = new Set<string>(['d', 's', 'a', 'b', 't', 'D', 'h', 'l']);
const ILK_GOSTERILEN = 5;
const sayiOku = (x: string): number | null => (x.trim() === '' ? null : Number(x.replace(',', '.')));
const metin = (v: number | null) => (v === null ? '' : String(v));

function katalogDegerleri(kartlar: readonly KatalogKarti[]): Record<ListeAlani, string[]> {
  const kume = (f: (k: KatalogKarti) => readonly (string | null | undefined)[]) =>
    [...new Set(kartlar.filter((k) => k.kayit.tur === 'hammadde').flatMap(f).filter((x): x is string => typeof x === 'string' && x.trim() !== ''))]
      .sort((a, b) => a.localeCompare(b, 'tr'));
  const secenek = (k: KatalogKarti, ad: string) => { const v = (k.kayit.opts as Record<string, unknown> | undefined)?.[ad]; return typeof v === 'string' ? v : null; };
  return {
    form: kume((k) => [k.kayit.form]), kalite: kume((k) => [k.kayit.grade]), durum: kume((k) => [secenek(k, 'durum')]),
    standart: kume((k) => (k.kayit.stds as string[] | undefined) ?? []), yuzey: kume((k) => [secenek(k, 'yuzey')]),
  };
}

// Gösterilen ölçü alanları: seçili formların (yoksa kartın formunun) kesit ve boy ölçüleri, yalnız sette taşınanlar.
function olcuAlanlari(formlar: readonly string[], anaForm: string | null): SetNiteligi[] {
  const l = (formlar.length > 0 ? formlar : anaForm ? [anaForm] : []).filter((f): f is OlculuForm => (OLCULU_FORMLAR as readonly string[]).includes(f));
  const anahtarlar: string[] = l.flatMap((f) => [...FORM_OLCULERI[f].kesit, ...(FORM_OLCULERI[f].boy ? [FORM_OLCULERI[f].boy] : [])]);
  return [...new Set(anahtarlar)].filter((a): a is SetNiteligi => OLCU_SET.has(a));
}

export function SetPenceresi({ ana, kartlar, kayit, esik, kapat }: {
  ana: KatalogKarti; kartlar: readonly KatalogKarti[]; kayit: AlternatifSeti | null; esik: number; kapat: () => void;
}) {
  const kaydet = useSetKaydet();
  const kaldir = useSetKaldir();
  const { bildir } = useBildirim();
  const secenekler = useMemo(() => katalogDegerleri(kartlar), [kartlar]);
  const ilk = (n: SetNiteligi) => kayit?.nitelikler.find((x) => x.nitelik === n) ?? null;
  const [ad, adYaz] = useState(kayit?.ad ?? '');
  const [notu, notuYaz] = useState(kayit?.notu ?? '');
  const [tur, turYaz] = useState<MuadilTuru>(kayit?.tur ?? 'tam');
  const [yerler, yerlerYaz] = useState<KullanimYeri[]>(kayit?.kullanimYerleri ?? [...YERLER]);
  const [liste, listeYaz] = useState<Record<ListeAlani, string[]>>(() => Object.fromEntries(LISTE_ALANLARI.map(({ alan }) => [alan, ilk(alan)?.degerler ?? []])) as Record<ListeAlani, string[]>);
  const [olcu, olcuYaz] = useState<Record<string, { alt: string; ust: string }>>(() => Object.fromEntries(
    (kayit?.nitelikler ?? []).filter((x) => x.degerler === null).map((x) => [x.nitelik, { alt: metin(x.alt), ust: metin(x.ust) }])));
  const [elle, elleYaz] = useState('');
  const [genis, genisYaz] = useState(kayit?.genisOnay ?? false);
  const [hepsi, hepsiYaz] = useState(false);
  const [sor, sorYaz] = useState(false);
  const [hata, hataYaz] = useState<Record<string, string>>({});
  const anaForm = ana.kayit.form;
  const olculer = olcuAlanlari(liste.form, anaForm);

  const nitelikler: SetNiteligiYazimi[] = [
    ...LISTE_ALANLARI.flatMap(({ alan }) => (liste[alan].length > 0 ? [{ nitelik: alan, degerler: liste[alan], alt: null, ust: null }] : [])),
    ...olculer.flatMap((a) => {
      const x = olcu[a];
      const alt = x ? sayiOku(x.alt) : null, ust = x ? sayiOku(x.ust) : null;
      return alt === null && ust === null ? [] : [{ nitelik: a, degerler: null, alt, ust }];
    }),
  ];
  const yerelHata = (a: string): string | undefined => {
    const x = olcu[a];
    if (!x) return undefined;
    const alt = sayiOku(x.alt), ust = sayiOku(x.ust);
    if ((alt !== null && !Number.isFinite(alt)) || (ust !== null && !Number.isFinite(ust))) return 'Sayı girin.';
    if (alt !== null && ust !== null && alt > ust) return 'En az en çoktan büyük olamaz.';
    return undefined;
  };
  const olcuHatasi = (a: string) => yerelHata(a) ?? hata[`nitelikler.${a}`];
  const gecerli = olculer.every((a) => yerelHata(a) === undefined);
  const onizleme = useSetOnizleme(ana.no, nitelikler, gecerli);
  const sayi = nitelikler.length === 0 ? null : onizleme.data?.uyanSayisi ?? null;
  const sartli = onizleme.data?.sartli === true && nitelikler.length > 0;
  useEffect(() => { if (sartli) turYaz('sartli'); }, [sartli]);

  const degistir = (alan: ListeAlani, deger: string) => listeYaz((l) => ({ ...l, [alan]: l[alan].includes(deger) ? l[alan].filter((x) => x !== deger) : [...l[alan], deger] }));
  const gonder = () => {
    const h: Record<string, string> = {};
    if (ad.trim() === '') h.ad = 'Setin adını yazın.';
    if (nitelikler.length === 0) h.nitelikler = 'En az bir alanı doldurun.';
    if (yerler.length === 0) h.kullanimYerleri = 'En az bir yer seçin.';
    if (sayi !== null && sayi > esik && !genis) h.genisOnay = 'Geniş set için işaret gerekir.';
    hataYaz(h);
    if (Object.keys(h).length > 0 || !gecerli) return;
    kaydet.mutate({
      anaNo: ana.no, ...(kayit ? { id: kayit.id, surum: kayit.surum } : {}), ad: ad.trim(), tur, kullanimYerleri: yerler,
      notu: notu.trim() === '' ? null : notu.trim(), nitelikler, genisOnay: genis,
    }, {
      onSuccess: (c) => { bildir('tamam', `Set kaydedildi · ${String(c.uyanSayisi)} kart uyuyor`); kapat(); },
      onError: (e) => {
        const alan = e instanceof ApiHatasi ? e.govde.alan : undefined;
        if (alan) hataYaz({ [alan]: hataIletisi(e, 'Set kaydedilemedi') });
        bildir('hata', hataIletisi(e, 'Set kaydedilemedi'));
      },
    });
  };
  const sil = () => {
    if (!kayit) return;
    kaldir.mutate({ id: kayit.id, surum: kayit.surum }, {
      onSuccess: () => { bildir('tamam', 'Set kaldırıldı'); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Set kaldırılamadı')),
      onSettled: () => sorYaz(false),
    });
  };
  const uyanlar = onizleme.data?.uyanlar ?? [];
  return (
    <Pencere
      acik
      genis
      kapat={kapat}
      baslik={kayit ? 'Alternatif seti düzenle' : 'Alternatif seti ekle'}
      alt={(
        <div className="tc-mk-pencere-alt">
          {kayit && <Dugme simge="trash" onClick={() => sorYaz(true)}>Seti kaldır</Dugme>}
          <span className="tc-kalt-sag">
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" yukleniyor={kaydet.isPending} onClick={gonder}>Kaydet</Dugme>
          </span>
        </div>
      )}
    >
      <div className="tc-alt-form">
        <Girdi etiket="Ad" maxLength={80} value={ad} hata={hata.ad} onChange={(e) => adYaz(e.target.value)} placeholder="ör. Kalın çubuk" />
        <p className="tc-alt-not">Bir alanda birden çok değer işaretliyse biri yeter; dolu alanların hepsi tutmalı. Seçili değer yoksa alan serbesttir (hepsi).</p>
        {hata.nitelikler && <p className="tc-kalt-hata" role="alert">{hata.nitelikler}</p>}
        {LISTE_ALANLARI.slice(0, 1).map(({ alan, ad: baslik }) => (
          <CipAlani key={alan} baslik={baslik} degerler={secenekler[alan]} secili={liste[alan]} ad={formAdi} degistir={(d) => degistir(alan, d)} />
        ))}
        {olculer.map((a) => (
          <div key={a} className="tc-kalt-bagla tc-kalt-aralik">
            <Girdi etiket={`${a} en az (mm)`} inputMode="decimal" placeholder="sınırsız" value={olcu[a]?.alt ?? ''} hata={olcuHatasi(a)}
              onChange={(e) => olcuYaz((o) => ({ ...o, [a]: { alt: e.target.value, ust: o[a]?.ust ?? '' } }))} />
            <Girdi etiket={`${a} en çok (mm)`} inputMode="decimal" placeholder="sınırsız" value={olcu[a]?.ust ?? ''}
              onChange={(e) => olcuYaz((o) => ({ ...o, [a]: { alt: o[a]?.alt ?? '', ust: e.target.value } }))} />
          </div>
        ))}
        {LISTE_ALANLARI.slice(1).map(({ alan, ad: baslik }) => (
          <CipAlani key={alan} baslik={baslik} degerler={[...new Set([...secenekler[alan], ...liste[alan]])]} secili={liste[alan]} degistir={(d) => degistir(alan, d)} />
        ))}
        <div className="tc-kalt-bagla">
          <Girdi etiket="Katalogda olmayan kaliteyi elle yaz" maxLength={60} value={elle} onChange={(e) => elleYaz(e.target.value)} />
          <Dugme simge="plus" disabled={!elle.trim() || liste.kalite.includes(elle.trim())} onClick={() => { degistir('kalite', elle.trim()); elleYaz(''); }}>Ekle</Dugme>
        </div>
        <fieldset className="tc-kalt-cipler">
          <legend>Tür</legend>
          {(['tam', 'ust', 'sartli'] as const).map((t) => (
            <button key={t} type="button" className="tc-kalt-cip" aria-pressed={tur === t} disabled={sartli && t !== 'sartli'} onClick={() => turYaz(t)}>{TUR_ADI[t]}</button>
          ))}
        </fieldset>
        {sartli && <p className="tc-alt-kapali" role="note">Şartlı muadil bir değer işaretli: set Şartlı kaydedilir.</p>}
        <fieldset className="tc-kalt-cipler">
          <legend>Nerede geçerli</legend>
          {YERLER.map((y) => (
            <button key={y} type="button" className="tc-kalt-cip" aria-pressed={yerler.includes(y)}
              onClick={() => yerlerYaz((l) => (l.includes(y) ? l.filter((x) => x !== y) : [...l, y]))}>{YER_ADI[y]}</button>
          ))}
          {hata.kullanimYerleri && <span className="tc-kalt-hata" role="alert">{hata.kullanimYerleri}</span>}
        </fieldset>
        <CokSatir etiket="Not" maxLength={300} rows={2} value={notu} onChange={(e) => notuYaz(e.target.value)} />
        <section className="tc-alt-bolum tc-kalt-uyan" aria-label="Bu sete uyan kartlar" aria-live="polite">
          <h4 className="tc-alt-alt-baslik">
            {sayi === null ? 'Bu sete uyan kartlar: alan doldurun' : `Bu sete uyan: ${String(sayi)}`}
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
          {sayi === 0 && <p className="tc-alt-kapali" role="note">Hiç kart uymuyor; yine de kaydedilebilir. Sonradan açılan uyan kart kendiliğinden girer.</p>}
          {sayi !== null && sayi > esik && (
            <div className="tc-alt-kapali" role="note">
              <span>{`Bu set ${String(sayi)} kartı kabul eder ve sonradan açılan uyan kartlar da girer.`}</span>
              <IsaretKutusu etiket="Bu kadar geniş olduğunu biliyorum" checked={genis} onChange={(e) => genisYaz(e.target.checked)} />
              {hata.genisOnay && <span className="tc-kalt-hata" role="alert">{hata.genisOnay}</span>}
            </div>
          )}
        </section>
      </div>
      <OnayPenceresi acik={sor} baslik="Set kaldırılsın mı?" onayMetni="Kaldır" tehlikeli yukleniyor={kaldir.isPending} onayla={sil} vazgec={() => sorYaz(false)}>
        <p>Set bu kartın alternatiflerinden çıkar; Geçmiş'e yazılır. Açık talep, sipariş ve emirdeki seçimler değişmez.</p>
      </OnayPenceresi>
    </Pencere>
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
      {secili.length === 0 && degerler.length > 0 && <span className="tc-alt-soluk">seçili yok = hepsi</span>}
    </fieldset>
  );
}
