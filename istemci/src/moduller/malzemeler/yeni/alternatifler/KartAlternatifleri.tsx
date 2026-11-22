import { useState } from 'react';
import type {
  AlternatifSeti, AlternatifZarfi, KabulSiniri, KartAlternatifleriCevabi, MuadilTuru, SeciliAlternatif, SinirDegeri, SinirNiteligi, ZarfKarti,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { KatalogKarti } from '../tipler.ts';
import type { MalzemeYetkisi } from '../yetki.ts';
import { kaynakMetni } from './index.tsx';
import { SetPenceresi } from './SetPenceresi.tsx';
import { KartEklePenceresi, OnerilmesinPenceresi } from './secili-pencereler.tsx';
import { TUR_ADI, setOzeti, siraDegisimi, tabloSatirlari, yerMetni, type TabloSatiri } from './tablo.ts';
import { useEsdegerIslemi, useKartAlternatifleri, useKartZarfi, useSeciliIslemi, useSinirKaldir, useSinirKaydet, useSiraKaydet } from './veri.ts';

// 3463 C, 3572 a: kartın föyünde Ana set (bugünkü kabul sınırları) ve tek Alternatifler tablosu: alternatif setleri, elle eklenen
// kartlar, kuraldan gelenler, önerilmeyenler ve eşdeğerler. Ekran yalnız gösterir ve yazanda düzenler; öncelik, set eşlemesi ve
// denetim sunucudadır.
// Kalite kodunda harf büyüklüğü anlam taşır: kod rozetin dışında düz yazılır, rozet yalnız muadil türünü söyler.
const TUR_ACIK: Record<MuadilTuru, string> = { tam: 'tam muadil', ust: 'üst muadil', sartli: 'şartlı muadil' };
const TUR_TONU: Record<MuadilTuru, RozetTonu> = { tam: 'tamam', ust: 'bilgi', sartli: 'uyari' };
const TURLER = (['tam', 'ust', 'sartli'] as const).map((t) => ({ deger: t, baslik: TUR_ADI[t] }));
const NITELIK_ADI: Record<string, string> = { kalite: 'Kalite', durum: 'Durum', yuzey: 'Yüzey', l: 'Boy l (mm)' };
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
  if (bolum.isPending || (hammadde && zarf.isPending)) return null;
  if (bolum.isError) return <Kart baslik="Alternatifler" simge="target"><DurumKutusu durum="hata" yenile={() => { void bolum.refetch(); }} /></Kart>;
  const z = zarf.data?.zarf ?? null;
  const kartSiniri = (n: SinirNiteligi) => bolum.data.siniri.find((x) => x.nitelik === n && x.kapsamTuru === 'kart') ?? null;
  return (
    <Kart baslik="Alternatifler" simge="target">
      <div className="tc-alt tc-kalt">
        {hammadde && (z === null ? <p className="tc-alt-not">Kartta kalite yok; kabul sınırı hesaplanmaz.</p> : (
          <section className="tc-alt-bolum" aria-label="Ana set">
            <h4 className="tc-alt-alt-baslik">Ana set <span className="tc-alt-soluk">(bugünkü kabul sınırları; kurallardan ve kartın sınırından)</span></h4>
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
          </section>
        ))}
        <AlternatifTablosu kart={kart} kartlar={kartlar} bolum={bolum.data} kuraldan={zarf.data?.kartlar ?? []} yaz={yetki.tanimYaz} ac={ac} />
        {yetki.tanimYaz && <EsdegerBagla kart={kart} kartlar={kartlar} esdegerVar={bolum.data.esdegerler.length > 0} />}
      </div>
      {duzenlenen && (
        <SinirPenceresi kartNo={kart.no} satir={duzenlenen} kayit={kartSiniri(duzenlenen.nitelik)} kapat={() => duzenlenenYaz(null)} />
      )}
    </Kart>
  );
}

const KAYNAK: Record<TabloSatiri['tur'], { ad: string; ton: RozetTonu }> = {
  set: { ad: 'Set', ton: 'bilgi' }, elle: { ad: 'Elle', ton: 'bilgi' }, kural: { ad: 'Kuraldan', ton: 'pasif' },
  onerilmez: { ad: 'Önerilmiyor', ton: 'hata' }, esdeger: { ad: 'Eşdeğer', ton: 'tamam' },
};
const SONUC_ADI = { ayni: 'Aynı nitelik', icinde: 'Sınır içinde', sartli: 'Şartlı' } as const;
const SONUC_TONU = { ayni: 'tamam', icinde: 'bilgi', sartli: 'uyari' } as const;
const kartKodu = (k: { no: number; kod: string | null }) => k.kod ?? `#${String(k.no)}`;
type Pencereler =
  | { tur: 'set'; kayit: AlternatifSeti | null }
  | { tur: 'kart'; kayit: SeciliAlternatif | null }
  | { tur: 'onerilmesin'; kart: { no: number; kod: string | null }; kayit: SeciliAlternatif | null }
  | { tur: 'kaldir'; secili: SeciliAlternatif }
  | { tur: 'esdeger'; kart: { no: number; kod: string | null } };

function AlternatifTablosu({ kart, kartlar, bolum, kuraldan, yaz, ac }: {
  kart: KatalogKarti; kartlar: readonly KatalogKarti[]; bolum: KartAlternatifleriCevabi; kuraldan: readonly ZarfKarti[]; yaz: boolean; ac: (kimlik: string) => void;
}) {
  const hammadde = kart.kayit.tur === 'hammadde';
  const [pencere, pencereYaz] = useState<Pencereler | null>(null);
  const [acikSet, acikSetYaz] = useState<number | null>(null);
  const sira = useSiraKaydet();
  const secili = useSeciliIslemi();
  const esdeger = useEsdegerIslemi();
  const { bildir } = useBildirim();
  const satirlar = tabloSatirlari(bolum, kuraldan);
  const setAdi = new Map(bolum.setler.map((t) => [t.id, t.ad]));
  const kimlikNodan = (no: number) => kartlar.find((k) => k.no === no)?.kimlik;
  const kodBagi = (k: { no: number; kod: string | null }, cizili = false) => {
    const kimlik = kimlikNodan(k.no);
    const sinif = `mono${cizili ? ' tc-kalt-cizili' : ''}`;
    return kimlik ? <button type="button" className={`tc-mk-bag ${sinif}`} onClick={() => ac(kimlik)}>{kartKodu(k)}</button> : <span className={sinif}>{kartKodu(k)}</span>;
  };
  const tasi = (anahtar: string, yon: -1 | 1) => {
    const ogeler = siraDegisimi(satirlar, anahtar, yon);
    if (ogeler) sira.mutate({ anaNo: kart.no, ogeler }, { onError: (e) => bildir('hata', hataIletisi(e, 'Sıra değiştirilemedi')) });
  };
  const kaldir = (x: SeciliAlternatif, ileti: string) => secili.mutate({ islem: 'kaldir', anaNo: kart.no, alternatifNo: x.alternatifNo, surum: x.surum }, {
    onSuccess: () => bildir('tamam', ileti), onError: (e) => bildir('hata', hataIletisi(e, 'Değiştirilemedi')), onSettled: () => pencereYaz(null),
  });
  const sutunlar: Sutun<TabloSatiri>[] = [
    {
      anahtar: 'sira', baslik: 'Sıra', hucre: (s) => {
        if (s.tur !== 'set' && s.tur !== 'elle') return <span className="tc-alt-soluk">{s.tur === 'kural' ? 'kural' : '—'}</span>;
        if (!yaz) return null;
        const ad = s.tur === 'set' ? s.set.ad : kartKodu({ no: s.secili.alternatifNo, kod: s.secili.kod });
        return (
          <span className="tc-kalt-sira">
            <button type="button" className="tc-kalt-kalem" aria-label={`${ad} yukarı`} disabled={sira.isPending} onClick={() => tasi(s.anahtar, -1)}><Simge ad="up" boyut="k" /></button>
            <button type="button" className="tc-kalt-kalem" aria-label={`${ad} aşağı`} disabled={sira.isPending} onClick={() => tasi(s.anahtar, 1)}><Simge ad="down" boyut="k" /></button>
          </span>
        );
      },
    },
    {
      anahtar: 'alternatif', baslik: 'Alternatif', kartTamSatir: true, hucre: (s) => {
        switch (s.tur) {
          case 'set': {
            const yeni = s.set.uyanlar.filter((u) => u.yeni).length;
            return (
              <div className="tc-kalt-hucre">
                <b>{s.set.ad}</b>
                <span className="tc-alt-soluk">{setOzeti(s.set.nitelikler)}</span>
                <button type="button" className="tc-mk-bag" aria-expanded={acikSet === s.set.id} onClick={() => acikSetYaz(acikSet === s.set.id ? null : s.set.id)}>
                  {`${String(s.set.uyanSayisi)} kart uyuyor${yeni > 0 ? ` · ${String(yeni)} yeni` : ''}`}
                </button>
                {acikSet === s.set.id && (
                  <ul className="tc-kalt-liste">
                    {s.set.uyanlar.map((u) => (
                      <li key={u.no} className="tc-kalt-satir">
                        {kodBagi(u, u.durum === 'onerilmez')}
                        <span className="tc-kalt-ad-metin">{u.neden}</span>
                        {u.yeni && <Rozet ton="bilgi">yeni</Rozet>}
                        {u.durum === 'tekil' && <Rozet ton="pasif">tekil satır geçer</Rozet>}
                        {u.durum === 'onerilmez' && <Rozet ton="hata">Önerilmiyor</Rozet>}
                      </li>
                    ))}
                    {s.set.uyanSayisi > s.set.uyanlar.length && <li className="tc-alt-soluk">{`İlk ${String(s.set.uyanlar.length)} kart gösterilir.`}</li>}
                  </ul>
                )}
              </div>
            );
          }
          case 'elle':
          case 'onerilmez': {
            const x = s.secili;
            return (
              <div className="tc-kalt-hucre">
                <span>{kodBagi({ no: x.alternatifNo, kod: x.kod }, s.tur === 'onerilmez')} {x.iptal && <Rozet ton="pasif">Aktif değil</Rozet>}</span>
                <span className="tc-alt-soluk">{x.ad ?? ''}</span>
                {s.tur === 'elle' && x.setler.length > 0 && (
                  <span className="tc-alt-soluk">{`${x.setler.map((id) => setAdi.get(id) ?? 'Set').join(', ')} setine de uyar; bu satır geçer`}</span>
                )}
              </div>
            );
          }
          case 'kural':
          case 'esdeger':
            return <div className="tc-kalt-hucre">{kodBagi(s.kart)}<span className="tc-alt-soluk">{s.kart.ad ?? ''}</span></div>;
        }
      },
    },
    { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (s) => <Rozet ton={KAYNAK[s.tur].ton}>{KAYNAK[s.tur].ad}</Rozet> },
    {
      anahtar: 'tur', baslik: 'Tür', hucre: (s) => {
        if (s.tur === 'set') return <Rozet ton={TUR_TONU[s.set.tur]}>{TUR_ADI[s.set.tur]}</Rozet>;
        if (s.tur === 'elle' && s.secili.tur) return <Rozet ton={TUR_TONU[s.secili.tur]}>{TUR_ADI[s.secili.tur]}</Rozet>;
        if (s.tur === 'kural') return <Rozet ton={SONUC_TONU[s.kart.sonuc === 'disi' ? 'sartli' : s.kart.sonuc]}>{s.kart.sonuc === 'disi' ? 'Dışı' : SONUC_ADI[s.kart.sonuc]}</Rozet>;
        if (s.tur === 'esdeger') return <Rozet ton="tamam">Aynı malzeme</Rozet>;
        return <span className="tc-alt-soluk">—</span>;
      },
    },
    {
      anahtar: 'nerede', baslik: 'Nerede', hucre: (s) => (s.tur === 'set' ? yerMetni(s.set.kullanimYerleri) : s.tur === 'elle' ? yerMetni(s.secili.kullanimYerleri)
        : s.tur === 'onerilmez' ? 'Hiçbir yerde' : 'Hepsi'),
    },
    {
      anahtar: 'not', baslik: 'Not', hucre: (s) => {
        const m = s.tur === 'set' ? s.set.notu : s.tur === 'elle' ? s.secili.notu : s.tur === 'onerilmez' ? `Neden: ${s.secili.notu ?? ''}`
          : s.tur === 'kural' ? (s.kart.nedenler.join(' · ') || null) : null;
        return m === null ? <span className="tc-alt-soluk">—</span> : <span className="tc-kalt-not">{m}</span>;
      },
    },
  ];
  if (yaz) {
    sutunlar.push({
      anahtar: 'islem', baslik: 'İşlem', csv: false, hucre: (s) => {
        switch (s.tur) {
          case 'set': return <Dugme simge="edit" onClick={() => pencereYaz({ tur: 'set', kayit: s.set })}>Düzenle</Dugme>;
          case 'elle': return (
            <span className="tc-kalt-eylem">
              <Dugme simge="edit" onClick={() => pencereYaz({ tur: 'kart', kayit: s.secili })} aria-label={`${kartKodu({ no: s.secili.alternatifNo, kod: s.secili.kod })} düzenle`}>Düzenle</Dugme>
              <Dugme simge="x" onClick={() => pencereYaz({ tur: 'kaldir', secili: s.secili })}>Listeden kaldır</Dugme>
            </span>
          );
          case 'kural': return <Dugme simge="x" onClick={() => pencereYaz({ tur: 'onerilmesin', kart: s.kart, kayit: null })}>Önerilmesin</Dugme>;
          case 'onerilmez': return (
            <Dugme simge="rotate" yukleniyor={secili.isPending} onClick={() => kaldir(s.secili, `${kartKodu({ no: s.secili.alternatifNo, kod: s.secili.kod })} yeniden önerilir`)}>Geri al</Dugme>
          );
          case 'esdeger': return <Dugme simge="x" onClick={() => pencereYaz({ tur: 'esdeger', kart: s.kart })}>Gruptan çıkar</Dugme>;
        }
      },
    });
  }
  const disarida = new Set([...bolum.secili.map((x) => x.alternatifNo), ...bolum.esdegerler.map((e) => e.no)]);
  return (
    <section className="tc-alt-bolum" aria-label="Alternatifler tablosu">
      <div className="tc-kalt-baslik">
        <h4 className="tc-alt-alt-baslik">{`Alternatifler (${String(satirlar.length)})`}</h4>
        {yaz && (
          <span className="tc-kalt-sag">
            <span title={hammadde ? undefined : 'Bu kart türünde set tanımlanamaz; alternatifi Kart ekle ile seçin.'}>
              <Dugme simge="plus" tur="birincil" disabled={!hammadde} onClick={() => pencereYaz({ tur: 'set', kayit: null })}>Set ekle</Dugme>
            </span>
            <Dugme simge="plus" onClick={() => pencereYaz({ tur: 'kart', kayit: null })}>Kart ekle</Dugme>
          </span>
        )}
      </div>
      {yaz && !hammadde && <p className="tc-alt-soluk">Bu kart türünde ölçü, kalite, durum ve standart alanı yok; set kurulamaz. Alternatifi Kart ekle ile seçin.</p>}
      <Tablo
        etiket="Alternatifler"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(s) => s.anahtar}
        bosMesaj={hammadde ? 'Bu kartın alternatifi yok. Kabul sınırına uyan kart da yok.' : 'Bu kartın alternatifi yok.'}
        {...(yaz ? { bosEylem: <Dugme simge="plus" onClick={() => pencereYaz({ tur: 'kart', kayit: null })}>Kart ekle</Dugme> } : {})}
      />
      {satirlar.length > 0 && (
        <p className="tc-alt-soluk">
          Öncelik: &quot;Önerilmesin&quot; her şeyden ağırdır; tekil kart satırı, uyduğu setin türünü ve yerini ezer; set, kuraldan geleni ezer.
          Sette dolu alanların hepsi tutmalı, setler arasında herhangi biri yeter. Sıra, talepte ve üretimde listenin sırasıdır.
        </p>
      )}
      {pencere?.tur === 'set' && <SetPenceresi ana={kart} kartlar={kartlar} kayit={pencere.kayit} esik={bolum.genisEsik} kapat={() => pencereYaz(null)} />}
      {pencere?.tur === 'kart' && (
        <KartEklePenceresi ana={kart} kartlar={kartlar} kuraldan={kuraldan} disarida={disarida} kayit={pencere.kayit} kapat={() => pencereYaz(null)} />
      )}
      {pencere?.tur === 'onerilmesin' && <OnerilmesinPenceresi anaNo={kart.no} kart={pencere.kart} kayit={pencere.kayit} kapat={() => pencereYaz(null)} />}
      <OnayPenceresi
        acik={pencere?.tur === 'kaldir'}
        baslik="Listeden kaldırılsın mı?"
        onayMetni="Kaldır"
        yukleniyor={secili.isPending}
        onayla={() => { if (pencere?.tur === 'kaldir') kaldir(pencere.secili, 'Kart alternatif listesinden kaldırıldı'); }}
        vazgec={() => pencereYaz(null)}
      >
        <p>Kart elle eklenen alternatiflerden çıkar; kural sınırına ya da bir sete uyuyorsa oradan gelmeye devam eder. Açık talep, sipariş ve emirdeki seçimler değişmez.</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={pencere?.tur === 'esdeger'}
        baslik="Gruptan çıkarılsın mı?"
        onayMetni="Çıkar"
        yukleniyor={esdeger.isPending}
        onayla={() => {
          if (pencere?.tur !== 'esdeger') return;
          esdeger.mutate({ islem: 'kaldir', kartNo: pencere.kart.no }, {
            onSuccess: () => bildir('tamam', 'Kart eşdeğer grubundan çıkarıldı'), onError: (e) => bildir('hata', hataIletisi(e, 'Eşdeğer bağı değiştirilemedi')),
            onSettled: () => pencereYaz(null),
          });
        }}
        vazgec={() => pencereYaz(null)}
      >
        <p>{`${pencere?.tur === 'esdeger' ? kartKodu(pencere.kart) : ''} bu kartın yerine artık kabul edilmez. Açık siparişler kendi kartlarıyla kalır; değişiklik denetim kaydına yazılır.`}</p>
      </OnayPenceresi>
    </section>
  );
}

// Eşdeğer satırları tablodadır; burada yalnız yeni bağ kurulur.
function EsdegerBagla({ kart, kartlar, esdegerVar }: { kart: KatalogKarti; kartlar: readonly KatalogKarti[]; esdegerVar: boolean }) {
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
      <div className="tc-kalt-bagla">
        <Girdi etiket="Eşdeğer kartın kodu (aynı malzeme, farklı kart)" list="tc-kalt-adaylar" autoComplete="off" value={kod} onChange={(e) => kodYaz(e.target.value)} />
        <datalist id="tc-kalt-adaylar">{adaylar.slice(0, 200).map((k) => <option key={k.kimlik} value={k.kayit.com.kod}>{k.kayit.com.ad}</option>)}</datalist>
        <Dugme simge="plus" disabled={!secilen} onClick={() => { if (secilen) sorYaz({ tur: 'bagla', no: secilen.no, kod: secilen.kayit.com.kod }); }}>Kart bağla</Dugme>
        {esdegerVar && <Dugme simge="x" onClick={() => sorYaz({ tur: 'kaldir' })}>Bu kartı gruptan çıkar</Dugme>}
      </div>
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
