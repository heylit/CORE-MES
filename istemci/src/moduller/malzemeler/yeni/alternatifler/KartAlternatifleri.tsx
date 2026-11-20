import { useState } from 'react';
import type {
  AlternatifZarfi, KabulSiniri, MuadilTuru, SinirDegeri, SinirNiteligi,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Simge, useBildirim, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { KatalogKarti } from '../tipler.ts';
import type { MalzemeYetkisi } from '../yetki.ts';
import { kaynakMetni } from './index.tsx';
import { useEsdegerIslemi, useKartAlternatifleri, useKartZarfi, useSinirKaldir, useSinirKaydet } from './veri.ts';

// 3463 C (dilim 1): kartın föyünde kabul sınırları (izinli değer ya da alt-üst ölçü), sınıra uyan kartlar ve aynı malzemenin öteki
// kartları. Ekran yalnız gösterir ve yazanda düzenler; zarfı ve bağ denetimini sunucu yapar.
const TUR_ADI: Record<MuadilTuru, string> = { tam: 'Tam', ust: 'Üst', sartli: 'Şartlı' };
// Kalite kodunda harf büyüklüğü anlam taşır: kod rozetin dışında düz yazılır, rozet yalnız muadil türünü söyler.
const TUR_ACIK: Record<MuadilTuru, string> = { tam: 'tam muadil', ust: 'üst muadil', sartli: 'şartlı muadil' };
const TUR_TONU: Record<MuadilTuru, RozetTonu> = { tam: 'tamam', ust: 'bilgi', sartli: 'uyari' };
const TURLER = (['tam', 'ust', 'sartli'] as const).map((t) => ({ deger: t, baslik: TUR_ADI[t] }));
const NITELIK_ADI: Record<string, string> = { kalite: 'Kalite', durum: 'Durum', yuzey: 'Yüzey', l: 'Boy l (mm)' };
const ILK_GOSTERILEN = 4;
const sayi = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 3 });

type Satir =
  | { tur: 'liste'; nitelik: 'kalite' | 'durum' | 'yuzey'; istenen: string | null; secenekler: AlternatifZarfi['kalite']['secenekler']; kaynak: string; acik: boolean }
  | { tur: 'olcu'; nitelik: SinirNiteligi; istenen: number | null; enAz: number | null; enCok: number | null; kaynak: string };

function satirlar(z: AlternatifZarfi): Satir[] {
  const liste = (n: 'kalite' | 'durum', x: AlternatifZarfi['kalite']): Satir => ({
    tur: 'liste', nitelik: n, istenen: x.istenen, secenekler: x.acik ? x.secenekler : [], acik: x.acik, kaynak: kaynakMetni(x.kaynak),
  });
  const s: Satir[] = [liste('kalite', z.kalite), liste('durum', z.durum)];
  for (const o of z.olcu) s.push({ tur: 'olcu', nitelik: o.anahtar as SinirNiteligi, istenen: o.istenen, enAz: o.enAz, enCok: o.enCok, kaynak: kaynakMetni(o.sinirKaynak ?? z.pay.kaynak) });
  if (z.boy) s.push({ tur: 'olcu', nitelik: z.boy.anahtar as SinirNiteligi, istenen: z.boy.istenen, enAz: z.boy.enAz, enCok: z.boy.enCok, kaynak: kaynakMetni(z.boy.sinirKaynak ?? z.boy.kaynak) });
  s.push({ tur: 'liste', nitelik: 'yuzey', istenen: z.yuzey.istenen, secenekler: z.yuzey.secenekler, acik: z.yuzey.sinir, kaynak: kaynakMetni(z.yuzey.kaynak) });
  return s;
}
const nitelikAdi = (n: string) => NITELIK_ADI[n] ?? `${n} (mm)`;

export function KartAlternatifleri({ kart, kartlar, yetki, ac }: {
  kart: KatalogKarti; kartlar: readonly KatalogKarti[]; yetki: MalzemeYetkisi; ac: (kimlik: string) => void;
}) {
  const hammadde = kart.kayit.tur === 'hammadde';
  const zarf = useKartZarfi(hammadde ? kart.no : null);
  const bolum = useKartAlternatifleri(kart.no);
  const [duzenlenen, duzenlenenYaz] = useState<Satir | null>(null);
  const [hepsi, hepsiYaz] = useState(false);
  if (bolum.isPending || (hammadde && zarf.isPending)) return null;
  if (bolum.isError) return <Kart baslik="Alternatifler" simge="target"><DurumKutusu durum="hata" yenile={() => { void bolum.refetch(); }} /></Kart>;
  const z = zarf.data?.zarf ?? null;
  // Eşdeğer kart kendi listesinde durur; uyan kartlarda tekrar gösterilmez.
  const esdegerNo = new Set(bolum.data.esdegerler.map((e) => e.no));
  const uyan = (zarf.data?.kartlar ?? []).filter((k) => !esdegerNo.has(k.no));
  const kimlikNodan = (no: number) => kartlar.find((k) => k.no === no)?.kimlik;
  const kartSiniri = (n: SinirNiteligi) => bolum.data.siniri.find((x) => x.nitelik === n && x.kapsamTuru === 'kart') ?? null;
  return (
    <Kart baslik="Alternatifler" simge="target">
      <div className="tc-alt tc-kalt">
        {hammadde && (z === null ? <p className="tc-alt-not">Kartta kalite yok; kabul sınırı hesaplanmaz.</p> : (
          <section className="tc-alt-bolum" aria-label="Kabul sınırları">
            <h4 className="tc-alt-alt-baslik">Kabul sınırları</h4>
            {z.kapali && <p className="tc-alt-kapali" role="note">Alternatif kapalı: yalnız aynı nitelikte malzeme kabul edilir. {z.gerekce}</p>}
            <ul className="tc-kalt-liste">
              {satirlar(z).map((s) => (
                <li key={s.nitelik} className="tc-kalt-satir">
                  <span className="tc-kalt-ad">{nitelikAdi(s.nitelik)}</span>
                  <span className="tc-kalt-deger">
                    {s.tur === 'liste' ? (
                      <>
                        {s.istenen !== null && <span className="tc-kalt-oge"><span className="mono">{s.istenen}</span><span className="tc-alt-soluk">istenen</span></span>}
                        {s.secenekler.map((x) => (
                          <span key={x.deger} className="tc-kalt-oge"><span className="mono">{x.deger}</span><Rozet ton={TUR_TONU[x.tur]}>{TUR_ACIK[x.tur]}</Rozet></span>
                        ))}
                        {s.secenekler.length === 0 && <span className="tc-alt-soluk">yalnız aynısı</span>}
                      </>
                    ) : (
                      <span className="mono">{s.enAz === null && s.enCok === null ? `${s.istenen === null ? '—' : sayi(s.istenen)}` : `${s.enAz === null ? '…' : sayi(s.enAz)} – ${s.enCok === null ? '…' : sayi(s.enCok)}`}</span>
                    )}
                  </span>
                  <span className="tc-alt-kaynak">{s.kaynak}</span>
                  {yetki.tanimYaz && (
                    <button type="button" className="tc-kalt-kalem" onClick={() => duzenlenenYaz(s)} aria-label={`${nitelikAdi(s.nitelik)} sınırını düzenle`} title="Sınırı düzenle">
                      <Simge ad="edit" boyut="k" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <h4 className="tc-alt-alt-baslik">{`Uyan kartlar (${uyan.length})`}</h4>
            {uyan.length === 0 ? <p className="tc-alt-bos">Sınıra uyan başka aktif kart yok.</p> : (
              <ul className="tc-kalt-liste">
                {(hepsi ? uyan : uyan.slice(0, ILK_GOSTERILEN)).map((k) => {
                  const kimlik = kimlikNodan(k.no);
                  return (
                    <li key={k.no} className="tc-kalt-satir">
                      {kimlik ? <button type="button" className="tc-mk-bag mono" onClick={() => ac(kimlik)}>{k.kod ?? `#${k.no}`}</button> : <span className="mono">{k.kod ?? `#${k.no}`}</span>}
                      <span className="tc-kalt-ad-metin">{k.ad ?? ''}</span>
                      <span className="tc-kalt-fark">{k.sonuc === 'ayni' ? 'Aynı nitelik' : k.nedenler.join(' · ')}</span>
                      {k.sonuc === 'sartli' && <Rozet ton="uyari">Şartlı</Rozet>}
                    </li>
                  );
                })}
              </ul>
            )}
            {uyan.length > ILK_GOSTERILEN && (
              <Dugme onClick={() => hepsiYaz(!hepsi)}>{hepsi ? 'Daha az göster' : `İlk ${ILK_GOSTERILEN} · Hepsini göster (${uyan.length})`}</Dugme>
            )}
          </section>
        ))}
        <Esdegerler kart={kart} kartlar={kartlar} esdegerler={bolum.data.esdegerler} yaz={yetki.tanimYaz} ac={ac} />
      </div>
      {duzenlenen && (
        <SinirPenceresi kartNo={kart.no} satir={duzenlenen} kayit={kartSiniri(duzenlenen.nitelik)} kapat={() => duzenlenenYaz(null)} />
      )}
    </Kart>
  );
}

function Esdegerler({ kart, kartlar, esdegerler, yaz, ac }: {
  kart: KatalogKarti; kartlar: readonly KatalogKarti[]; esdegerler: readonly { no: number; kod: string | null; ad: string | null }[]; yaz: boolean; ac: (kimlik: string) => void;
}) {
  const islem = useEsdegerIslemi();
  const { bildir } = useBildirim();
  const [kod, kodYaz] = useState('');
  const [sor, sorYaz] = useState<{ tur: 'bagla'; no: number; kod: string } | { tur: 'kaldir' } | null>(null);
  const adaylar = kartlar.filter((k) => k.no !== kart.no && k.kayit.tur === kart.kayit.tur && k.kayit.com.kod);
  const secilen = adaylar.find((k) => k.kayit.com.kod === kod.trim());
  const calistir = () => {
    if (!sor) return;
    const g = sor.tur === 'bagla' ? { islem: 'bagla' as const, kartNo: kart.no, esdegerNo: sor.no } : { islem: 'kaldir' as const, kartNo: kart.no };
    islem.mutate(g, {
      onSuccess: () => { bildir('tamam', sor.tur === 'bagla' ? `${sor.kod} eşdeğer olarak bağlandı` : 'Kart eşdeğer grubundan çıkarıldı'); kodYaz(''); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Eşdeğer bağı değiştirilemedi')),
      onSettled: () => sorYaz(null),
    });
  };
  return (
    <section className="tc-alt-bolum" aria-label="Aynı malzeme, farklı kart">
      <h4 className="tc-alt-alt-baslik">Aynı malzeme, farklı kart</h4>
      {esdegerler.length === 0 ? <p className="tc-alt-bos">Eşdeğer kart bağlı değil.</p> : (
        <ul className="tc-kalt-liste">
          {esdegerler.map((e) => {
            const kimlik = kartlar.find((k) => k.no === e.no)?.kimlik;
            return (
              <li key={e.no} className="tc-kalt-satir">
                {kimlik ? <button type="button" className="tc-mk-bag mono" onClick={() => ac(kimlik)}>{e.kod ?? `#${e.no}`}</button> : <span className="mono">{e.kod ?? `#${e.no}`}</span>}
                <span className="tc-kalt-ad-metin">{e.ad ?? ''}</span>
                <Rozet ton="tamam">Eşdeğer</Rozet>
              </li>
            );
          })}
        </ul>
      )}
      {yaz && (
        <div className="tc-kalt-bagla">
          <Girdi etiket="Eşdeğer kartın kodu" list="tc-kalt-adaylar" autoComplete="off" value={kod} onChange={(e) => kodYaz(e.target.value)} />
          <datalist id="tc-kalt-adaylar">{adaylar.slice(0, 200).map((k) => <option key={k.kimlik} value={k.kayit.com.kod}>{k.kayit.com.ad}</option>)}</datalist>
          <Dugme simge="plus" disabled={!secilen} onClick={() => { if (secilen) sorYaz({ tur: 'bagla', no: secilen.no, kod: secilen.kayit.com.kod }); }}>Kart bağla</Dugme>
          {esdegerler.length > 0 && <Dugme simge="x" onClick={() => sorYaz({ tur: 'kaldir' })}>Bu kartı gruptan çıkar</Dugme>}
        </div>
      )}
      <OnayPenceresi
        acik={sor !== null}
        baslik={sor?.tur === 'bagla' ? 'Eşdeğer olarak bağlansın mı?' : 'Gruptan çıkarılsın mı?'}
        onayMetni={sor?.tur === 'bagla' ? 'Bağla' : 'Çıkar'}
        yukleniyor={islem.isPending}
        onayla={calistir}
        vazgec={() => sorYaz(null)}
      >
        <p>{sor?.tur === 'bagla'
          ? `${sor.kod} bu kartla aynı malzeme sayılır: talep ve satın almada birbirinin yerine sınırsız kabul edilir. Bağ tür, form, ölçü alanları ve stok birimi aynıysa kurulur; denetim kaydına yazılır.`
          : 'Bu kart grubun öteki kartlarının yerine artık kabul edilmez. Açık siparişler kendi kartlarıyla kalır; değişiklik denetim kaydına yazılır.'}</p>
      </OnayPenceresi>
    </section>
  );
}

function SinirPenceresi({ kartNo, satir, kayit, kapat }: { kartNo: number; satir: Satir; kayit: KabulSiniri | null; kapat: () => void }) {
  const kaydet = useSinirKaydet();
  const kaldir = useSinirKaldir();
  const { bildir } = useBildirim();
  const [degerler, degerlerYaz] = useState<SinirDegeri[]>(() => (satir.tur === 'liste'
    ? [...(satir.istenen ? [{ deger: satir.istenen, tur: 'tam' as const }] : []), ...satir.secenekler.map((x) => ({ deger: x.deger, tur: x.tur }))]
    : []));
  const [yeni, yeniYaz] = useState('');
  const [alt, altYaz] = useState(satir.tur === 'olcu' ? String(satir.enAz ?? satir.istenen ?? '') : '');
  const [ust, ustYaz] = useState(satir.tur === 'olcu' ? String(satir.enCok ?? '') : '');
  const sayiOku = (x: string): number | null => (x.trim() === '' ? null : Number(x.replace(',', '.')));
  const gonder = () => {
    const govde = satir.tur === 'liste'
      ? { kapsamTuru: 'kart' as const, kapsam: String(kartNo), nitelik: satir.nitelik, degerler, alt: null, ust: null }
      : { kapsamTuru: 'kart' as const, kapsam: String(kartNo), nitelik: satir.nitelik, degerler: null, alt: sayiOku(alt), ust: sayiOku(ust) };
    kaydet.mutate({ ...govde, ...(kayit ? { surum: kayit.surum } : {}) }, {
      onSuccess: () => { bildir('tamam', 'Sınır kaydedildi'); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Sınır kaydedilemedi')),
    });
  };
  const sil = () => {
    if (!kayit) return;
    kaldir.mutate({ id: kayit.id, surum: kayit.surum }, {
      onSuccess: () => { bildir('tamam', 'Kartın sınırı kaldırıldı; üst kapsam geçerli'); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Sınır kaldırılamadı')),
    });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${nitelikAdi(satir.nitelik)} sınırı`}
      alt={(
        <div className="tc-mk-pencere-alt">
          {kayit && <Dugme simge="trash" yukleniyor={kaldir.isPending} onClick={sil}>Kartın sınırını kaldır</Dugme>}
          <span className="tc-kalt-sag">
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" yukleniyor={kaydet.isPending} onClick={gonder}>Kaydet</Dugme>
          </span>
        </div>
      )}
    >
      <div className="tc-alt-form">
        <p className="tc-alt-not">Bu kartın sınırı grup ve kalite kuralını ezer. Kaldırılırsa üst kapsam geçerli olur.</p>
        {satir.tur === 'liste' ? (
          <>
            <ul className="tc-kalt-liste">
              {degerler.map((d, i) => (
                <li key={d.deger} className="tc-kalt-satir">
                  <span className="mono">{d.deger}</span>
                  <Secim etiket="Tür" secenekler={TURLER} value={d.tur} disabled={d.deger === satir.istenen}
                    onChange={(e) => degerlerYaz(degerler.map((x, j) => (j === i ? { ...x, tur: e.target.value as MuadilTuru } : x)))} />
                  {d.deger !== satir.istenen && <Dugme simge="x" onClick={() => degerlerYaz(degerler.filter((_, j) => j !== i))} aria-label={`${d.deger} kaldır`}>Kaldır</Dugme>}
                </li>
              ))}
            </ul>
            <div className="tc-kalt-bagla">
              <Girdi etiket="İzinli değer ekle" maxLength={60} value={yeni} onChange={(e) => yeniYaz(e.target.value)} />
              <Dugme simge="plus" disabled={!yeni.trim() || degerler.some((d) => d.deger === yeni.trim())}
                onClick={() => { degerlerYaz([...degerler, { deger: yeni.trim(), tur: 'ust' }]); yeniYaz(''); }}>Ekle</Dugme>
            </div>
          </>
        ) : (
          <div className="tc-kalt-bagla tc-kalt-aralik">
            <Girdi etiket="En az (mm)" inputMode="decimal" value={alt} onChange={(e) => altYaz(e.target.value)} />
            <Girdi etiket="En çok (mm)" inputMode="decimal" value={ust} onChange={(e) => ustYaz(e.target.value)} />
          </div>
        )}
      </div>
    </Pencere>
  );
}
