import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AZAMI_HAZIRLIK_EMRI as SINIR, AdimliEmirOzeti, AdimliListeCevabi, HazirlikCevabi, HazirlikMaddesi, HazirlikOzetiCevabi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DurumKutusu, Girdi, Kart, Rozet, Secim, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { EMIR_DURUMU, HAZIRLIK_MADDE_BILGISI, hazirlikHucreHali } from '../uretim-emirleri/disari.ts';
import { baslamaDurumu, type BaslamaDurumu } from './yeni/operator/HazirlikListesi.tsx';
import './hazirlik-matrisi.css';

// 2227e: bütün açık emirlerin hazırlığı tek tabloda; satır üretim emri × operasyon (iş emri), sütun hazırlık maddesi. Veri emir
// ayrıntısındaki matrisle aynı uçlardan gelir (açık emir listesi ve toplu hazırlık okuması); bu sayfa yalnız gösterir, yazmaz.
// Maddenin hâlini sahibi modül verir; hücre sorumlusunu adıyla söyler, ayrıntı ve muafiyet emir ayrıntısındadır.

const AZAMI_HAZIRLIK_EMRI: typeof SINIR = 100;
const ACIK = new Set(['taslak', 'planli', 'basladi']);

type Hal = HazirlikCevabi['maddeler'][number]['durum'];
type Durum = BaslamaDurumu;
export interface MatrisSatiri {
  anahtar: string;
  emir: AdimliEmirOzeti;
  // İş emri olmayan (rotasız) emirde satır emrin kendisidir.
  isEmri: { isEmriId: number; opNo: number; ad: string } | null;
  hal: ReadonlyMap<HazirlikMaddesi, Hal>;
  durum: Durum;
}

const HUCRE: Record<Hal, { ton: RozetTonu; ad: string }> = {
  tamam: { ton: 'tamam', ad: 'Tamam' }, eksik: { ton: 'hata', ad: 'Eksik' }, muaf: { ton: 'uyari', ad: 'Muaf' },
  gerekmez: { ton: 'pasif', ad: '—' }, bilinmiyor: { ton: 'pasif', ad: '?' },
};
const hucre = (m: HazirlikMaddesi, h: Hal) => (h === 'eksik' && HAZIRLIK_MADDE_BILGISI[m].uyarir ? { ton: 'uyari' as const, ad: 'Uyarı' } : HUCRE[h]);
const DURUM: Record<Durum, { ton: RozetTonu; ad: string }> = { durur: { ton: 'hata', ad: 'Durur' }, uyari: { ton: 'uyari', ad: 'Uyarıyla başlar' }, hazir: { ton: 'tamam', ad: 'Hazır' } };
// Sayısı sıfır olan özet rozeti çizilmez: "0 durur" kırmızı rozeti yanlış alarm verir.
const OZET: readonly { durum: Durum; ek: string }[] = [{ durum: 'durur', ek: 'durur' }, { durum: 'uyari', ek: 'uyarıyla başlar' }, { durum: 'hazir', ek: 'hazır' }];

// Bitmiş iş emri sorulmaz (emir ayrıntısında görünür); durduran madde eksikse satır durur, yalnız uyaran eksikse uyarıyla başlar.
export function matrisSatirlari(emirler: readonly AdimliEmirOzeti[], hazirlik: ReadonlyMap<number, HazirlikCevabi>): MatrisSatiri[] {
  const satirlar: MatrisSatiri[] = [];
  for (const emir of emirler) {
    const v = hazirlik.get(emir.id);
    if (v === undefined) continue;
    const acik = v.isEmirleri.filter((i) => !i.bitti);
    const kaynak = v.isEmirleri.length === 0 ? [null] : acik;
    for (const i of kaynak) {
      const hal = new Map(v.maddeler.map((m) => [m.madde, m.isEmriDuzeyi && i !== null ? hazirlikHucreHali(v, { madde: m.madde, isEmriId: i.isEmriId }) : m.durum] as const));
      const durum: Durum = baslamaDurumu([...hal].map(([m, h]) => ({ hal: h, uyarir: HAZIRLIK_MADDE_BILGISI[m].uyarir })));
      satirlar.push({ anahtar: `${String(emir.id)}-${String(i?.isEmriId ?? 0)}`, emir, isEmri: i && { isEmriId: i.isEmriId, opNo: i.opNo, ad: i.ad }, hal, durum });
    }
  }
  return satirlar;
}

async function hazirliklariOku(idler: readonly number[]): Promise<Map<number, HazirlikCevabi>> {
  const parcalar: number[][] = [];
  for (let i = 0; i < idler.length; i += AZAMI_HAZIRLIK_EMRI) parcalar.push(idler.slice(i, i + AZAMI_HAZIRLIK_EMRI));
  const l = await Promise.all(parcalar.map((p) => api.get<HazirlikOzetiCevabi>(`/adimli-emirler/hazirlik-ozeti?emirler=${p.join(',')}`)));
  return new Map(l.flatMap((c) => c.emirler.map((e) => [e.emirId, e.hazirlik] as const)));
}

const SUZGECLER = [
  { deger: 'hepsi', baslik: 'Hepsi' }, { deger: 'durur', baslik: 'Duranlar' }, { deger: 'uyari', baslik: 'Uyarıyla başlayanlar' }, { deger: 'hazir', baslik: 'Hazır' },
] as const;
const kucuk = (s: string) => s.toLocaleLowerCase('tr-TR');

export function HazirlikMatrisi() {
  const emirAcar = useOturum().data?.islemler.includes('sayfa.uretim-emirleri') ?? false;
  const veri = useQuery({
    queryKey: ['arkon', 'hazirlik-matrisi'],
    queryFn: async () => {
      const emirler = (await api.get<AdimliListeCevabi>('/adimli-emirler')).emirler
        .filter((e) => !e.arsiv && ACIK.has(e.durum))
        .sort((a, b) => (a.teslim ?? '9999').localeCompare(b.teslim ?? '9999') || a.id - b.id);
      return { emirler, hazirlik: await hazirliklariOku(emirler.map((e) => e.id)) };
    },
  });
  const [suzgec, suzgecYaz] = useState<string>('hepsi');
  // Hazırlık takip tablosu (3111) rozetten emrin numarasıyla açar.
  const [arama] = useSearchParams();
  const [ara, araYaz] = useState(() => arama.get('ara') ?? '');
  const tum = useMemo(() => (veri.data ? matrisSatirlari(veri.data.emirler, veri.data.hazirlik) : []), [veri.data]);
  const maddeler = useMemo(() => {
    const ilk = veri.data ? [...veri.data.hazirlik.values()][0] : undefined;
    return ilk ? ilk.maddeler.map((m) => m.madde) : [];
  }, [veri.data]);
  const satirlar = tum.filter((s) => (suzgec === 'hepsi' || s.durum === suzgec)
    && (ara.trim() === '' || [s.emir.emirNo, s.emir.urun.kod, s.emir.urun.ad, s.isEmri?.ad ?? ''].some((x) => kucuk(x).includes(kucuk(ara.trim())))));
  const sayi = (d: Durum) => tum.filter((s) => s.durum === d).length;

  return (
    <Kart baslik="Hazırlık matrisi" simge="clipboard-check">
      <div className="tc-hzm">
        <p className="tc-hzm-not">
          Açık emirlerin her operasyonu için hazırlık maddeleri. Maddeyi sahibi modül verir; ayrıntı, muafiyet ve bağlantılar emir ayrıntısındadır.
        </p>
        {veri.data ? (
          <ul className="tc-hzm-ozet" aria-label="Hazırlık özeti">
            {OZET.filter((o) => sayi(o.durum) > 0).map((o) => (
              <li key={o.durum}><Rozet ton={DURUM[o.durum].ton}>{`${String(sayi(o.durum))} ${o.ek}`}</Rozet></li>
            ))}
          </ul>
        ) : null}
        {veri.isPending ? <DurumKutusu durum="yukleniyor" /> : null}
        {veri.isError ? <DurumKutusu durum="hata" hata={veri.error} yenile={() => { void veri.refetch(); }} /> : null}
        {veri.data ? (
          <div className="tc-hzm-arac">
            <Girdi etiket="Ara" type="search" value={ara} placeholder="Emir no, parça ya da operasyon" onChange={(e) => araYaz(e.target.value)} />
            <Secim etiket="Hazırlık" secenekler={SUZGECLER} value={suzgec} onChange={(e) => suzgecYaz(e.target.value)} />
          </div>
        ) : null}
        {veri.data && satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj={tum.length === 0 ? 'Açık emir yok' : 'Süzgece uyan satır yok'} /> : null}
        {veri.data && satirlar.length > 0 ? (
          <div className="tc-hzm-sarmal">
            <table className="tc-hzm-tablo" aria-busy={veri.isFetching}>
              <caption className="tc-gizli-etiket">Hazırlık matrisi</caption>
              <thead>
                <tr>
                  <th scope="col">Emir · operasyon</th>
                  <th scope="col">Teslim</th>
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
                        <small>{s.isEmri ? `OP ${String(s.isEmri.opNo)} · ${s.isEmri.ad}` : 'Emir geneli'} · {s.emir.urun.ad} · {EMIR_DURUMU[s.emir.durum].etiket}</small>
                      </span>
                    </th>
                    <td>{s.emir.teslim === null ? '—' : new Date(`${s.emir.teslim}T00:00:00`).toLocaleDateString('tr-TR')}</td>
                    <td><Rozet ton={DURUM[s.durum].ton}>{DURUM[s.durum].ad}</Rozet></td>
                    {maddeler.map((m) => {
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
      </div>
    </Kart>
  );
}
