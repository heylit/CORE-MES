import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { HazirlikCevabi, HazirlikMaddesi, HazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { EMIR_DURUMU, HAZIRLIK_MADDE_BILGISI, hazirlikHucreHali } from '../uretim-emirleri/disari.ts';
import './hazirlik-matrisi.css';

// Hazırlık matrisi (2227e, 2748): açık emirlerin hazırlığı ve üretim ilerlemesi tek sayfada. İki görünüm: operasyonlar (satır emir x
// iş emri, sütun hazırlık maddesi) ve emirler (emir başına tek satır). Veri tek uçtan gelir; operatör de okur (2748-2 a), sayfa yazmaz.
// Maddenin hâlini sahibi modül verir; ayrıntı, muafiyet ve bağlantılar emir ayrıntısındadır. Adreste `emir` varsa yalnız o emir.

type Emir = HazirlikMatrisiCevabi['emirler'][number];
type IsEmri = Emir['isEmirleri'][number];
type Hal = HazirlikCevabi['maddeler'][number]['durum'];
type Durum = 'durur' | 'uyari' | 'hazir' | 'bitti';
export interface MatrisSatiri {
  anahtar: string;
  emir: Emir;
  // İş emri olmayan (rotasız) emirde satır emrin kendisidir.
  isEmri: IsEmri | null;
  hal: ReadonlyMap<HazirlikMaddesi, Hal>;
  durum: Durum;
}

const HUCRE: Record<Hal, { ton: RozetTonu; ad: string }> = {
  tamam: { ton: 'tamam', ad: 'Tamam' }, eksik: { ton: 'hata', ad: 'Eksik' }, muaf: { ton: 'uyari', ad: 'Muaf' },
  gerekmez: { ton: 'pasif', ad: '—' }, bilinmiyor: { ton: 'pasif', ad: '?' },
};
const hucre = (m: HazirlikMaddesi, h: Hal) => (h === 'eksik' && HAZIRLIK_MADDE_BILGISI[m].uyarir ? { ton: 'uyari' as const, ad: 'Uyarı' } : HUCRE[h]);
const DURUM: Record<Durum, { ton: RozetTonu; ad: string }> = {
  durur: { ton: 'hata', ad: 'Durur' }, uyari: { ton: 'uyari', ad: 'Uyarıyla başlar' }, hazir: { ton: 'tamam', ad: 'Hazır' }, bitti: { ton: 'pasif', ad: 'Bitti' },
};
// Sayısı sıfır olan özet rozeti çizilmez: "0 durur" kırmızı rozeti yanlış alarm verir. Biten operasyonun hazırlığı sayılmaz.
const HAZIRLIK_OZETI: readonly { durum: Durum; ek: string }[] = [{ durum: 'durur', ek: 'durur' }, { durum: 'uyari', ek: 'uyarıyla başlar' }, { durum: 'hazir', ek: 'hazır' }];
type Uretim = 'calisiyor' | 'fasonda' | 'bekliyor' | 'tamam';
const URETIM: Record<Uretim, { ton: RozetTonu; ad: string; ek: string }> = {
  calisiyor: { ton: 'uyari', ad: 'Çalışıyor', ek: 'çalışıyor' }, fasonda: { ton: 'bilgi', ad: 'Fasonda', ek: 'fasonda' },
  bekliyor: { ton: 'pasif', ad: 'Bekliyor', ek: 'bekliyor' }, tamam: { ton: 'tamam', ad: 'Bitti', ek: 'bitti' },
};
export const uretimHali = (i: IsEmri): Uretim => (i.durum !== 'tamam' && i.fasonda > 0 ? 'fasonda' : i.durum);

const durumu = (hal: ReadonlyMap<HazirlikMaddesi, Hal>): Durum => {
  const eksik = [...hal].filter(([, h]) => h === 'eksik').map(([m]) => m);
  return eksik.some((m) => !HAZIRLIK_MADDE_BILGISI[m].uyarir) ? 'durur' : eksik.length > 0 ? 'uyari' : 'hazir';
};

// Biten iş emrinde hazırlık sorulmaz (satır ilerleme için kalır); durduran madde eksikse satır durur, yalnız uyaran eksikse uyarıyla başlar.
export function matrisSatirlari(emirler: readonly Emir[]): MatrisSatiri[] {
  const satirlar: MatrisSatiri[] = [];
  for (const emir of emirler) {
    // Dar uç muafiyet listesi vermez (operatör de okur); hücre hâli madde durumundan gelir.
    const v = emir.hazirlik === null ? null : { ...emir.hazirlik, muafiyetler: [] };
    const kaynak: (IsEmri | null)[] = emir.isEmirleri.length === 0 ? [null] : emir.isEmirleri;
    for (const i of kaynak) {
      const hal = new Map<HazirlikMaddesi, Hal>(v === null ? [] : v.maddeler.map((m) => [
        m.madde, m.isEmriDuzeyi && i !== null ? hazirlikHucreHali(v, { madde: m.madde, isEmriId: i.isEmriId }) : m.durum,
      ] as const));
      const durum: Durum = i?.durum === 'tamam' ? 'bitti' : durumu(hal);
      satirlar.push({ anahtar: `${String(emir.id)}-${String(i?.isEmriId ?? 0)}`, emir, isEmri: i, hal, durum });
    }
  }
  return satirlar;
}

// Emir satırı: en kötü açık operasyonun hazırlığı, bitmiş operasyon sayısı ve şu anki (ilk bitmemiş) operasyon.
export function emirOzeti(satirlar: readonly MatrisSatiri[]): { durum: Durum; biten: number; toplam: number; simdiki: IsEmri | null } {
  const acik = satirlar.filter((s) => s.durum !== 'bitti');
  const durum: Durum = acik.length === 0 ? 'bitti' : (['durur', 'uyari', 'hazir'] as const).find((d) => acik.some((s) => s.durum === d)) ?? 'hazir';
  const isler = satirlar.flatMap((s) => (s.isEmri ? [s.isEmri] : []));
  return { durum, biten: isler.filter((i) => i.durum === 'tamam').length, toplam: isler.length, simdiki: isler.find((i) => i.durum !== 'tamam') ?? null };
}

const SUZGECLER = [
  { deger: 'hepsi', baslik: 'Hepsi' }, { deger: 'durur', baslik: 'Duranlar' }, { deger: 'uyari', baslik: 'Uyarıyla başlayanlar' },
  { deger: 'hazir', baslik: 'Hazır' }, { deger: 'bitti', baslik: 'Bitenler' },
] as const;
// Terminal çipi bu adla açar (Operator.tsx).
const HAZIRLIK_EMRI = 'hazirlik-emri';
const GORUNUMLER = [{ deger: 'operasyon', baslik: 'Operasyonlar' }, { deger: 'emir', baslik: 'Emirler' }] as const;
const kucuk = (s: string) => s.toLocaleLowerCase('tr-TR');
const tarih = (t: string | null) => (t === null ? '—' : new Date(`${t}T00:00:00`).toLocaleDateString('tr-TR'));
const adet = (i: IsEmri) => `${String(i.saglam)} / ${String(i.hedef)}`;

function UretimHucresi({ i }: { i: IsEmri | null }) {
  if (i === null) return <span className="tc-hzm-soluk">—</span>;
  const u = URETIM[uretimHali(i)];
  return (
    <span className="tc-hzm-uretim">
      <Rozet ton={u.ton}>{u.ad}</Rozet>
      <small title="Sağlam / hedef">{adet(i)}{i.hurda > 0 ? ` · ${String(i.hurda)} hurda` : ''}{i.fasonda > 0 ? ` · ${String(i.fasonda)} fasonda` : ''}</small>
    </span>
  );
}

// Öncül adım bu adımdan fazla saydıysa giren eksi çıkar (647 a); operatöre eksi sayı yerine 0 ve neden gösterilir.
function HazirAdet({ adet }: { adet: number }) {
  if (adet >= 0) return <>{String(adet)}</>;
  return (
    <span className="tc-hzm-tek" title={`Bu adım öncülünden ${String(-adet)} fazla saydı; sayımı amir ya da kalite düzeltir.`}>
      0 <Rozet ton="uyari" gorunum="cizgi">fazla sayım</Rozet>
    </span>
  );
}

export function HazirlikMatrisi() {
  const emirAcar = useOturum().data?.islemler.includes('sayfa.uretim-emirleri') ?? false;
  const [adres, adresYaz] = useSearchParams();
  // 'emir' parametresini Üretim Terminali okur ve siler (iş açma, baglanti.ts EMIR_PARAMETRESI); bu sayfa ayrı adla süzer.
  const emirSuzgeci = Number(adres.get(HAZIRLIK_EMRI)) || null;
  const veri = useQuery({
    queryKey: ['arkon', 'hazirlik-matrisi', emirSuzgeci],
    queryFn: () => api.get<HazirlikMatrisiCevabi>(`/adimli-emirler/hazirlik-matrisi${emirSuzgeci === null ? '' : `?emirler=${String(emirSuzgeci)}`}`),
  });
  const [gorunum, gorunumYaz] = useState<string>('operasyon');
  const [suzgec, suzgecYaz] = useState<string>('hepsi');
  const [ara, araYaz] = useState('');
  const tum = useMemo(() => (veri.data ? matrisSatirlari(veri.data.emirler) : []), [veri.data]);
  const maddeler = useMemo(() => veri.data?.emirler.find((e) => e.hazirlik !== null)?.hazirlik?.maddeler.map((m) => m.madde) ?? [], [veri.data]);
  const uyar = (s: MatrisSatiri) => ara.trim() === '' || [s.emir.emirNo, s.emir.urun.kod, s.emir.urun.ad, s.isEmri?.ad ?? '', s.isEmri?.istasyon ?? '']
    .some((x) => kucuk(x).includes(kucuk(ara.trim())));
  const satirlar = tum.filter((s) => (suzgec === 'hepsi' || s.durum === suzgec) && uyar(s));
  const emirSatirlari = useMemo(() => {
    const l = new Map<number, MatrisSatiri[]>();
    for (const s of tum) l.set(s.emir.id, [...(l.get(s.emir.id) ?? []), s]);
    return [...l.values()].map((s) => ({ emir: s[0]!.emir, satirlar: s, ozet: emirOzeti(s) }));
  }, [tum]);
  const emirler = emirSatirlari.filter((e) => (suzgec === 'hepsi' || e.ozet.durum === suzgec) && e.satirlar.some(uyar));
  const hazirlikSayisi = (d: Durum) => tum.filter((s) => s.durum === d).length;
  const uretimSayisi = (u: Uretim) => tum.filter((s) => s.isEmri !== null && uretimHali(s.isEmri) === u).length;
  const bos = gorunum === 'emir' ? emirler.length === 0 : satirlar.length === 0;

  return (
    <Kart baslik="Hazırlık matrisi" simge="clipboard-check">
      <div className="tc-hzm">
        <p className="tc-hzm-not">
          Açık emirlerin her operasyonu için hazırlık ve üretim durumu. Maddeyi sahibi modül verir; ayrıntı, muafiyet ve bağlantılar emir ayrıntısındadır.
        </p>
        {emirSuzgeci !== null ? (
          <div className="tc-hzm-tek">
            <span className="tc-hzm-not">Yalnız bir emir gösteriliyor.</span>
            <Dugme tur="ikincil" simge="list" onClick={() => adresYaz({})}>Bütün emirleri göster</Dugme>
          </div>
        ) : null}
        {veri.data ? (
          <div className="tc-hzm-ozetler">
            <ul className="tc-hzm-ozet" aria-label="Hazırlık özeti">
              {HAZIRLIK_OZETI.filter((o) => hazirlikSayisi(o.durum) > 0).map((o) => (
                <li key={o.durum}><Rozet ton={DURUM[o.durum].ton}>{`${String(hazirlikSayisi(o.durum))} ${o.ek}`}</Rozet></li>
              ))}
            </ul>
            <ul className="tc-hzm-ozet" aria-label="Üretim özeti">
              <li><Rozet ton="pasif">{`${String(veri.data.emirler.length)} emir`}</Rozet></li>
              {(Object.keys(URETIM) as Uretim[]).filter((u) => uretimSayisi(u) > 0).map((u) => (
                <li key={u}><Rozet ton={URETIM[u].ton}>{`${String(uretimSayisi(u))} operasyon ${URETIM[u].ek}`}</Rozet></li>
              ))}
            </ul>
          </div>
        ) : null}
        {veri.isPending ? <DurumKutusu durum="yukleniyor" /> : null}
        {veri.isError ? <DurumKutusu durum="hata" hata={veri.error} yenile={() => { void veri.refetch(); }} /> : null}
        {veri.data ? (
          <div className="tc-hzm-arac">
            <Secim etiket="Görünüm" secenekler={GORUNUMLER} value={gorunum} onChange={(e) => gorunumYaz(e.target.value)} />
            <Girdi etiket="Ara" type="search" value={ara} placeholder="Emir no, parça, operasyon ya da istasyon" onChange={(e) => araYaz(e.target.value)} />
            <Secim etiket="Hazırlık" secenekler={SUZGECLER} value={suzgec} onChange={(e) => suzgecYaz(e.target.value)} />
          </div>
        ) : null}
        {veri.data && bos ? <DurumKutusu durum="bos" mesaj={tum.length === 0 ? 'Açık emir yok' : 'Süzgece uyan satır yok'} /> : null}
        {veri.data && !bos && gorunum === 'operasyon' ? (
          <div className="tc-hzm-sarmal">
            <table className="tc-hzm-tablo" aria-busy={veri.isFetching}>
              <caption className="tc-gizli-etiket">Hazırlık matrisi</caption>
              <thead>
                <tr>
                  <th scope="col">Emir · operasyon</th>
                  <th scope="col">Teslim</th>
                  <th scope="col">Üretim</th>
                  <th scope="col" title="Adıma girmiş, henüz işlenmemiş adet">Hazır adet</th>
                  <th scope="col">Hazırlık</th>
                  {maddeler.map((m) => (
                    <th key={m} scope="col" title={`${HAZIRLIK_MADDE_BILGISI[m].ad} · ${HAZIRLIK_MADDE_BILGISI[m].sahip}`}>
                      {HAZIRLIK_MADDE_BILGISI[m].kisa}<small>{HAZIRLIK_MADDE_BILGISI[m].uyarir ? 'uyarır' : 'durdurur'}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => (
                  <tr key={s.anahtar} data-durum={s.durum}>
                    <th scope="row">
                      <span className="tc-hzm-emir">
                        {emirAcar ? <Link to={`/uretim-emirleri/${String(s.emir.id)}`}>{s.emir.emirNo}</Link> : <b>{s.emir.emirNo}</b>}
                        <small>
                          {s.isEmri ? `OP ${String(s.isEmri.opNo)} · ${s.isEmri.ad}` : 'Emir geneli'} · {s.emir.urun.ad}
                          {s.isEmri?.istasyon ? ` · ${s.isEmri.istasyon}` : ''}
                        </small>
                      </span>
                    </th>
                    <td>{tarih(s.emir.teslim)}</td>
                    <td><UretimHucresi i={s.isEmri} /></td>
                    <td>{s.isEmri === null || s.isEmri.durum === 'tamam' ? '—' : <HazirAdet adet={s.isEmri.hazir} />}</td>
                    <td><Rozet ton={DURUM[s.durum].ton}>{DURUM[s.durum].ad}</Rozet></td>
                    {maddeler.map((m) => {
                      if (s.durum === 'bitti') return <td key={m}><span className="tc-hzm-soluk">—</span></td>;
                      const h = hucre(m, s.hal.get(m) ?? 'bilinmiyor');
                      return (
                        <td key={m} title={`${HAZIRLIK_MADDE_BILGISI[m].ad}: ${h.ad} · sorumlu ${HAZIRLIK_MADDE_BILGISI[m].sahip}`}>
                          <Rozet ton={h.ton}>{h.ad}</Rozet>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {veri.data && !bos && gorunum === 'emir' ? (
          <div className="tc-hzm-sarmal">
            <table className="tc-hzm-tablo" aria-busy={veri.isFetching}>
              <caption className="tc-gizli-etiket">Emirlerin hazırlık ve üretim durumu</caption>
              <thead>
                <tr>
                  <th scope="col">Emir</th>
                  <th scope="col">Teslim</th>
                  <th scope="col">Adet</th>
                  <th scope="col">Emir durumu</th>
                  <th scope="col">Biten operasyon</th>
                  <th scope="col">Şu anki operasyon</th>
                  <th scope="col">Hazırlık</th>
                </tr>
              </thead>
              <tbody>
                {emirler.map(({ emir, ozet }) => (
                  <tr key={emir.id} data-durum={ozet.durum}>
                    <th scope="row">
                      <span className="tc-hzm-emir">
                        {emirAcar ? <Link to={`/uretim-emirleri/${String(emir.id)}`}>{emir.emirNo}</Link> : <b>{emir.emirNo}</b>}
                        <small>{emir.urun.kod} · {emir.urun.ad}</small>
                      </span>
                    </th>
                    <td>{tarih(emir.teslim)}</td>
                    <td>{String(emir.adet)}</td>
                    <td><Rozet ton={EMIR_DURUMU[emir.durum].ton}>{EMIR_DURUMU[emir.durum].etiket}</Rozet></td>
                    <td>{ozet.toplam === 0 ? '—' : `${String(ozet.biten)} / ${String(ozet.toplam)}`}</td>
                    <td>
                      {ozet.simdiki === null ? <span className="tc-hzm-soluk">—</span> : (
                        <span className="tc-hzm-uretim">
                          <span>{`OP ${String(ozet.simdiki.opNo)} · ${ozet.simdiki.ad}`}</span>
                          <UretimHucresi i={ozet.simdiki} />
                        </span>
                      )}
                    </td>
                    <td><Rozet ton={DURUM[ozet.durum].ton}>{DURUM[ozet.durum].ad}</Rozet></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Kart>
  );
}
