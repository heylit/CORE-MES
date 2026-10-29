import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KmHataliBekleyenCevabi, KmHataliKararCevabi, KmHataliKararGovdesi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { CokSatir, Dugme, OnayPenceresi, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { siradakiNo, yeniKimlik } from '../veri.ts';

type Kayit = KmHataliBekleyenCevabi['kayitlar'][number];
type Karar = KmHataliKararGovdesi['karar'];
type Ciddiyet = KmHataliKararGovdesi['ciddiyet'];

export const HATALI_ANAHTARI = ['kalite-merkezi', 'hatali', 'bekleyenler'] as const;
const YOKLAMA_MS = 15_000;
const KARARLAR: { deger: Karar; baslik: string }[] = [
  { deger: 'rework', baslik: 'Rework (yeniden işle)' }, { deger: 'kabul', baslik: 'Kabul (olduğu gibi)' }, { deger: 'sartli_kabul', baslik: 'Şartlı kabul' },
  { deger: 'hurda', baslik: 'Hurda' }, { deger: 'red', baslik: 'Red (MRB sonra)' },
];
// Sözleşmedeki KM_CIDDIYETLER ile aynı sıra; istemci paylaşılanı yalnız tip olarak ithal eder (zod istemci paketine girmesin).
const CIDDIYETLER: readonly Ciddiyet[] = ['Kritik', 'Majör', 'Minör'];
const KARAR_ADI: Record<Karar, string> = {
  rework: 'reworke gönderildi', kabul: 'kabul edildi', sartli_kabul: 'şartlı kabul edildi', hurda: 'hurdaya ayrıldı', red: 'reddedildi',
};
const saat = (zaman: string): string => new Date(zaman).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// 1034, 1038 a: terminalde "Hatalı" ile ayrılan parça kalite kararını bekler. Karar aynı işlemde NCR açar (numarası NCR formundaki gibi
// sıradaki numara); rework planlamaya düşer, hurda ve red kolu kapatır, kabul ve şartlı kabul parçayı ana partiye katar (1211; şartlı
// kabulde şart notu zorunludur, stok şartlı olur). Liste yalnız onaylayabilen kişide istenir ve görünür.
export function HataliKarari({ ncrler }: { ncrler: readonly { no?: unknown }[] }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secili, seciliYaz] = useState<Kayit | null>(null);
  const [karar, kararYaz] = useState<Karar>('rework');
  const [ciddiyet, ciddiyetYaz] = useState<Ciddiyet>('Majör');
  const [not, notYaz] = useState('');
  const liste = useQuery({
    queryKey: HATALI_ANAHTARI,
    queryFn: () => api.get<KmHataliBekleyenCevabi>('/kalite-merkezi/hatali/bekleyenler'),
    refetchInterval: YOKLAMA_MS,
  });
  const gonder = useMutation({
    // Karar bir kezdir ve tekrar korumalıdır: cevabı kaybolan gönderim aynı kimlik ve aynı NCR kimliğiyle yinelenir.
    mutationFn: ({ kayit, govde }: { kayit: Kayit; govde: KmHataliKararGovdesi }) => tekrarKorumaliGonder((d) => api.post<KmHataliKararCevabi>(
      `/kalite-merkezi/hatali/${String(kayit.id)}/karar`, govde,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSuccess: (cevap, { kayit, govde }) => {
      seciliYaz(null);
      bildir('tamam', `${kayit.uretimEmri.emirNo}: ${String(kayit.adet)} adet ${KARAR_ADI[govde.karar]}, ${govde.ncrNo} açıldı${cevap.uyari ? `. ${cevap.uyari}` : ''}`);
      istemci.setQueryData<KmHataliBekleyenCevabi>(HATALI_ANAHTARI, (o) => o && { kayitlar: o.kayitlar.filter((k) => k.id !== kayit.id) });
      void istemci.invalidateQueries({ queryKey: HATALI_ANAHTARI });
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Karar verilemedi.')); },
  });

  const kayitlar = liste.data?.kayitlar ?? [];
  if (kayitlar.length === 0) return null;
  const ac = (k: Kayit) => { kararYaz('rework'); ciddiyetYaz('Majör'); notYaz(''); seciliYaz(k); };
  const onayla = () => {
    if (secili === null) return;
    gonder.mutate({
      kayit: secili,
      govde: { karar, ciddiyet, not: not.trim() || null, ncrKimlik: yeniKimlik('ncr'), ncrNo: siradakiNo(ncrler, 'NCR') },
    });
  };

  return (
    <section className="tc-km1-grup" aria-label="Hatalı parça kararı">
      <h3 className="tc-km1-grup-baslik">
        <Simge ad="alert" /> Hatalı parça kararı <span className="tc-km1-soluk">{kayitlar.length}</span>
      </h3>
      <ul className="tc-km1-liste">
        {kayitlar.map((k) => (
          <li key={k.id} className="tc-km1-gorev" data-oncelik="1">
            <div className="tc-km1-gorev-metin">
              <b>{k.uretimEmri.emirNo} | Op {k.isEmri.opNo} | {k.uretimEmri.parcaNo}</b>
              <small>
                {k.hurdaNedeni.ad} | {k.adet} adet | {k.kisi.ad ?? `#${String(k.kisi.id)}`}, {saat(k.zaman)}{k.aciklama ? ` | ${k.aciklama}` : ''}
              </small>
            </div>
            <span className="tc-km1-gorev-eylem">
              <Dugme tur="birincil" disabled={gonder.isPending} onClick={() => { ac(k); }}>Karar ver</Dugme>
            </span>
          </li>
        ))}
      </ul>
      <OnayPenceresi
        acik={secili !== null} baslik="Hatalı parça kararı" onayMetni="Kararı yaz" tehlikeli={karar === 'hurda' || karar === 'red'} yukleniyor={gonder.isPending}
        onayla={onayla} vazgec={() => { seciliYaz(null); }}
      >
        {secili && (
          <>
            <p>{secili.uretimEmri.emirNo} Op {secili.isEmri.opNo} ({secili.isEmri.ad}): {secili.adet} adet, {secili.hurdaNedeni.ad}. Karar geri alınamaz; aynı işlemde NCR açılır.</p>
            <Secim etiket="Karar" value={karar} onChange={(o) => { kararYaz(o.target.value as Karar); }} secenekler={KARARLAR} />
            <Secim
              etiket="Ciddiyet" value={ciddiyet} onChange={(o) => { ciddiyetYaz(o.target.value as Ciddiyet); }}
              secenekler={CIDDIYETLER.map((c) => ({ deger: c, baslik: c }))}
            />
            <CokSatir
              etiket={karar === 'sartli_kabul' ? 'Şart' : 'Gerekçe'} value={not} maxLength={500} required={karar === 'sartli_kabul'}
              onChange={(o) => { notYaz(o.target.value); }}
            />
          </>
        )}
      </OnayPenceresi>
    </section>
  );
}
