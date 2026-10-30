import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KmGirisBekleyenCevabi, KmGirisCevabi, KmGirisGkkGovdesi, KmGirisKararGovdesi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { CokSatir, Dugme, Girdi, OnayPenceresi, Rozet, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { siradakiNo, yeniKimlik } from '../veri.ts';

type Kayit = KmGirisBekleyenCevabi['kayitlar'][number];
type Karar = KmGirisKararGovdesi['karar'];
type Ciddiyet = KmGirisKararGovdesi['ciddiyet'];
type Islem = { tur: 'gkk'; kayit: Kayit } | { tur: 'karar'; kayit: Kayit };

export const GIRIS_ANAHTARI = ['kalite-merkezi', 'giris', 'bekleyenler'] as const;
const YOKLAMA_MS = 15_000;
const KARARLAR: { deger: Karar; baslik: string }[] = [
  { deger: 'red', baslik: 'Red (tedarikçiye iade)' }, { deger: 'kabul', baslik: 'Kabul (olduğu gibi)' }, { deger: 'sartli_kabul', baslik: 'Şartlı kabul' },
];
const KARAR_ADI: Record<Karar, string> = { kabul: 'kabul edildi', sartli_kabul: 'şartlı kabul edildi', red: 'tedarikçiye iade edildi' };
// Sözleşmedeki KM_CIDDIYETLER ile aynı sıra; istemci paylaşılanı yalnız tip olarak ithal eder (zod istemci paketine girmesin).
const CIDDIYETLER: readonly Ciddiyet[] = ['Kritik', 'Majör', 'Minör'];
const MIKTAR = /^\d+(?:[.,]\d{1,3})?$/;
const sade = (m: string): string => m.trim().replace(',', '.');
const sayi = (m: string | null): string => (m === null ? '' : String(Number(m)));

// 1246 (1251 a, 1252, 1253 a): kartı GKK isteyen satın alma lotu karantinada bekler. GKK kabul ve hatalı miktarı verir (toplamı lotun
// miktarı); kabul serbest olup mal kabul alanına geçer, hatalı karantinada red kalır. Hatalının kararı NCR açar: kabul, şartlı kabul
// (şart zorunlu) ya da red; red tedarikçiye iade çıkışı yazar. Liste yalnız onaylayabilen kişide istenir ve görünür.
export function GirisKarari({ ncrler }: { ncrler: readonly { no?: unknown }[] }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [islem, islemYaz] = useState<Islem | null>(null);
  const [kabul, kabulYaz] = useState('');
  const [hatali, hataliYaz] = useState('');
  const [karar, kararYaz] = useState<Karar>('red');
  const [ciddiyet, ciddiyetYaz] = useState<Ciddiyet>('Majör');
  const [not, notYaz] = useState('');
  const liste = useQuery({
    queryKey: GIRIS_ANAHTARI,
    queryFn: () => api.get<KmGirisBekleyenCevabi>('/kalite-merkezi/giris/bekleyenler'),
    refetchInterval: YOKLAMA_MS,
  });
  const yenile = () => { void istemci.invalidateQueries({ queryKey: GIRIS_ANAHTARI }); };
  // GKK ve karar birer kezdir ve tekrar korumalıdır: cevabı kaybolan gönderim aynı kimlikle yinelenir.
  const gkk = useMutation({
    mutationFn: ({ kayit, govde }: { kayit: Kayit; govde: KmGirisGkkGovdesi }) => tekrarKorumaliGonder((d) => api.post<KmGirisCevabi>(
      `/kalite-merkezi/giris/${String(kayit.malKabulSatirId)}/gkk`, govde,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSuccess: ({ kayit }) => {
      islemYaz(null);
      bildir('tamam', `${kayit.malKabulNo}: ${sayi(kayit.kabulMiktar)} kabul, ${sayi(kayit.hataliMiktar)} hatalı`);
      yenile();
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Giriş kontrolü yazılamadı.')); },
  });
  const kararVer = useMutation({
    mutationFn: ({ kayit, govde }: { kayit: Kayit; govde: KmGirisKararGovdesi }) => tekrarKorumaliGonder((d) => api.post<KmGirisCevabi>(
      `/kalite-merkezi/giris/${String(kayit.malKabulSatirId)}/karar`, govde,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSuccess: (_c, { kayit, govde }) => {
      islemYaz(null);
      bildir('tamam', `${kayit.malKabulNo}: ${sayi(kayit.hataliMiktar)} hatalı ${KARAR_ADI[govde.karar]}, ${govde.ncrNo} açıldı`);
      istemci.setQueryData<KmGirisBekleyenCevabi>(GIRIS_ANAHTARI, (o) => o && { kayitlar: o.kayitlar.filter((k) => k.malKabulSatirId !== kayit.malKabulSatirId) });
      yenile();
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Karar verilemedi.')); },
  });

  const kayitlar = liste.data?.kayitlar ?? [];
  if (kayitlar.length === 0) return null;
  const bekliyor = gkk.isPending || kararVer.isPending;
  const ac = (i: Islem) => {
    kabulYaz(sayi(i.kayit.miktar)); hataliYaz('0'); kararYaz('red'); ciddiyetYaz('Majör'); notYaz(''); islemYaz(i);
  };
  const miktarlarGecerli = MIKTAR.test(kabul.trim()) && MIKTAR.test(hatali.trim());
  const onayla = () => {
    if (islem === null) return;
    const n = not.trim() || null;
    if (islem.tur === 'gkk') {
      if (!miktarlarGecerli) { bildir('hata', 'Kabul ve hatalı miktarı sayı olmalı.'); return; }
      gkk.mutate({ kayit: islem.kayit, govde: { kabul: sade(kabul), hatali: sade(hatali), not: n } });
    } else {
      kararVer.mutate({ kayit: islem.kayit, govde: { karar, ciddiyet, not: n, ncrKimlik: yeniKimlik('ncr'), ncrNo: siradakiNo(ncrler, 'NCR') } });
    }
  };
  const k = islem?.kayit;

  return (
    <section className="tc-km1-grup" aria-label="Giriş kontrolü">
      <h3 className="tc-km1-grup-baslik">
        <Simge ad="box" /> Giriş kontrolü <span className="tc-km1-soluk">{kayitlar.length}</span>
      </h3>
      <ul className="tc-km1-liste">
        {kayitlar.map((x) => (
          <li key={x.malKabulSatirId} className="tc-km1-gorev" data-oncelik={x.durum === 'karar_bekliyor' ? '1' : '2'}>
            <div className="tc-km1-gorev-metin">
              <b>{x.malKabulNo} | {x.malzemeKod ?? `#${String(x.malzemeId)}`} {x.malzemeAd ?? ''}</b>
              <small>
                Lot {x.partiEtiketi ?? '-'} | {sayi(x.miktar)} {x.birim ?? ''}{x.tedarikciAdi ? ` | ${x.tedarikciAdi}` : ''}{x.siparisNo ? ` | ${x.siparisNo}` : ''}
                {x.durum === 'karar_bekliyor' ? ` | ${sayi(x.hataliMiktar)} hatalı` : ''}
              </small>
            </div>
            <span className="tc-km1-gorev-eylem">
              {!x.sertifikaVar && <Rozet ton="uyari">Sertifika yok</Rozet>}
              {x.durum === 'gkk_bekliyor'
                ? <Dugme tur="birincil" disabled={bekliyor} onClick={() => { ac({ tur: 'gkk', kayit: x }); }}>GKK</Dugme>
                : <Dugme tur="birincil" disabled={bekliyor} onClick={() => { ac({ tur: 'karar', kayit: x }); }}>Karar ver</Dugme>}
            </span>
          </li>
        ))}
      </ul>
      <OnayPenceresi
        acik={islem !== null} baslik={islem?.tur === 'karar' ? 'Hatalı giriş kararı' : 'Giriş kalite kontrolü'}
        onayMetni={islem?.tur === 'karar' ? 'Kararı yaz' : 'GKK yaz'} tehlikeli={islem?.tur === 'karar' && karar === 'red'} yukleniyor={bekliyor}
        onayla={onayla} vazgec={() => { islemYaz(null); }}
      >
        {k && islem?.tur === 'gkk' && (
          <>
            <p>{k.malKabulNo}, lot {k.partiEtiketi ?? '-'}: {sayi(k.miktar)} {k.birim ?? ''}. Kabul ve hatalı toplamı lotun miktarıdır; GKK geri alınamaz.</p>
            <Girdi etiket="Kabul" inputMode="decimal" value={kabul} onChange={(e) => { kabulYaz(e.target.value); }} />
            <Girdi etiket="Hatalı" inputMode="decimal" value={hatali} onChange={(e) => { hataliYaz(e.target.value); }} />
            <CokSatir etiket="Not" value={not} maxLength={500} onChange={(e) => { notYaz(e.target.value); }} />
          </>
        )}
        {k && islem?.tur === 'karar' && (
          <>
            <p>{k.malKabulNo}, lot {k.partiEtiketi ?? '-'}: {sayi(k.hataliMiktar)} {k.birim ?? ''} hatalı. Karar geri alınamaz; aynı işlemde NCR açılır.</p>
            <Secim etiket="Karar" value={karar} onChange={(e) => { kararYaz(e.target.value as Karar); }} secenekler={KARARLAR} />
            <Secim
              etiket="Ciddiyet" value={ciddiyet} onChange={(e) => { ciddiyetYaz(e.target.value as Ciddiyet); }}
              secenekler={CIDDIYETLER.map((c) => ({ deger: c, baslik: c }))}
            />
            <CokSatir
              etiket={karar === 'sartli_kabul' ? 'Şart' : 'Gerekçe'} value={not} maxLength={500} required={karar === 'sartli_kabul'}
              onChange={(e) => { notYaz(e.target.value); }}
            />
          </>
        )}
      </OnayPenceresi>
    </section>
  );
}
