// Tedarikçi karnesi (1259 c, 1260 a): kayan 12 aylık puan, hizmet puanı ve yıllık karne. Puanı sunucu hesaplar; ekran yalnız gösterir.
// Sınıf Kalite Merkezi onayını değiştirmez, onay sahibine öneridir (236 a).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  HizmetPuani, HizmetPuaniGovdesi, KarneCevabi, KarneOzeti, KarneSinifi, YillikKarne, YillikKarneGovdesi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Dugme, Girdi, Rozet, Secim, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { tarihMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FormPenceresi } from './FormPenceresi.tsx';
import { useKorumaliEkleme } from './yazma.ts';

// paylasilan/sozlesme/musteri-tedarikci.ts karne sabitlerinin ekran kopyası: istemci sözleşmeyi değer olarak ithal etmez (zod pakete
// girer). Yalnız açıklama metni içindir; puanı ve sınıfı sunucu hesaplar.
const KARNE_EKRAN_SABITLERI = {
  agirliklar: { teslim: 40, kalite: 40, hizmet: 20 },
  toleransGunu: 2,
  enAzTeslim: 3,
  enAzLot: 3,
  siniflar: ['A', 'B', 'C', 'D'] as const satisfies readonly KarneSinifi[],
  sinifAltSinirlari: { A: 90, B: 75, C: 60, D: 0 } as const satisfies Record<KarneSinifi, number>,
  hizmetEnAz: 1,
  hizmetEnCok: 5,
};
const {
  agirliklar: KARNE_AGIRLIKLARI, toleransGunu: TESLIM_TOLERANS_GUNU, enAzTeslim: KARNE_EN_AZ_TESLIM, enAzLot: KARNE_EN_AZ_LOT,
  siniflar: KARNE_SINIFLARI, sinifAltSinirlari: KARNE_SINIF_ALT_SINIRLARI, hizmetEnAz: HIZMET_PUANI_EN_AZ, hizmetEnCok: HIZMET_PUANI_EN_COK,
} = KARNE_EKRAN_SABITLERI;

const SINIF_TONU: Record<KarneSinifi, RozetTonu> = { A: 'tamam', B: 'tamam', C: 'uyari', D: 'hata' };
const SINIF_ANLAMI: Record<KarneSinifi, string> = { A: 'tercih edilen', B: 'onaylı, izlenir', C: 'iyileştirme ister (DÖF)', D: 'yeni siparişten önce kalite kararı' };
const SINIF_ONERISI: Record<KarneSinifi, string> = { A: 'Onaylı', B: 'Onaylı', C: 'Şartlı onaylı', D: 'Askıda' };
const sayi = (n: number | null): string => (n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const katki = (deger: number | null, agirlik: number): string => (deger === null ? '—' : sayi(Math.round(deger * agirlik) / 100));

function SinifRozeti({ sinif }: { sinif: KarneSinifi | null }) {
  return sinif === null ? <span className="tc-mt-yok">sınıf yok</span> : <Rozet ton={SINIF_TONU[sinif]}>{sinif}</Rozet>;
}

interface OlcutSatiri { olcut: string; hesap: string; deger: number | null; agirlik: number }
function olcutler(k: KarneOzeti): OlcutSatiri[] {
  // Hizmet puanı girilmemişse ağırlığı teslim ve kaliteye yarı yarıya dağılır (sunucu kuralı MT-16).
  const hizmetsiz = k.hizmet.puan === null;
  const { teslim, kalite, hizmet } = KARNE_AGIRLIKLARI;
  return [
    { olcut: 'Zamanında teslim', hesap: `${k.teslim.toplam} satırın ${k.teslim.zamaninda}'i termin + ${TESLIM_TOLERANS_GUNU} gün içinde tam`, deger: k.teslim.oran, agirlik: hizmetsiz ? 50 : teslim },
    { olcut: 'Kalite', hesap: `${k.kalite.lot} lot kararı`, deger: k.kalite.puan, agirlik: hizmetsiz ? 50 : kalite },
    { olcut: 'Hizmet', hesap: hizmetsiz ? 'Değerlendirme yok' : `${k.hizmet.sayi} değerlendirmenin ortalaması`, deger: k.hizmet.puan, agirlik: hizmetsiz ? 0 : hizmet },
  ];
}

const OLCUT_SUTUNLARI: Sutun<OlcutSatiri>[] = [
  { anahtar: 'olcut', baslik: 'Ölçüt', hucre: (s) => s.olcut },
  { anahtar: 'hesap', baslik: 'Hesap', hucre: (s) => s.hesap },
  { anahtar: 'deger', baslik: 'Değer', hizala: 'sag', mono: true, hucre: (s) => sayi(s.deger) },
  { anahtar: 'agirlik', baslik: 'Ağırlık', hizala: 'sag', mono: true, hucre: (s) => `%${s.agirlik}` },
  { anahtar: 'katki', baslik: 'Katkı', hizala: 'sag', mono: true, hucre: (s) => katki(s.deger, s.agirlik) },
];
const SINIF_SUTUNLARI: Sutun<KarneSinifi>[] = [
  { anahtar: 'sinif', baslik: 'Sınıf', hucre: (s) => <SinifRozeti sinif={s} /> },
  { anahtar: 'aralik', baslik: 'Puan', mono: true, hucre: (s) => {
    const i = KARNE_SINIFLARI.indexOf(s);
    const ust = i === 0 ? 100 : KARNE_SINIF_ALT_SINIRLARI[KARNE_SINIFLARI[i - 1]!] - 1;
    return `${KARNE_SINIF_ALT_SINIRLARI[s]}-${ust}`;
  } },
  { anahtar: 'anlam', baslik: 'Anlamı', hucre: (s) => SINIF_ANLAMI[s] },
  { anahtar: 'oneri', baslik: 'KM onayına öneri', hucre: (s) => SINIF_ONERISI[s] },
];
const YILLIK_SUTUNLARI: Sutun<YillikKarne>[] = [
  { anahtar: 'yil', baslik: 'Yıl', mono: true, hucre: (y) => String(y.yil) },
  { anahtar: 'puan', baslik: 'Puan', hizala: 'sag', mono: true, hucre: (y) => sayi(y.puan) },
  { anahtar: 'sinif', baslik: 'Sınıf', hucre: (y) => <SinifRozeti sinif={y.sinif} /> },
  { anahtar: 'degerlendiren', baslik: 'Değerlendiren', hucre: (y) => y.degerlendiren },
  { anahtar: 'not', baslik: 'Not', hucre: (y) => y.not },
];
const HIZMET_SUTUNLARI: Sutun<HizmetPuani>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', mono: true, hucre: (h) => zamanMetni(h.olusturma) },
  { anahtar: 'puan', baslik: 'Puan', hizala: 'sag', mono: true, hucre: (h) => `${h.puan} / ${HIZMET_PUANI_EN_COK}` },
  { anahtar: 'giren', baslik: 'Giren', hucre: (h) => h.giren },
  { anahtar: 'not', baslik: 'Not', hucre: (h) => h.not },
];

const PUAN_SECENEKLERI = Array.from({ length: HIZMET_PUANI_EN_COK - HIZMET_PUANI_EN_AZ + 1 }, (_, i) => {
  const p = String(HIZMET_PUANI_EN_COK - i);
  return { deger: p, baslik: p };
});

interface PencereOzellikleri { firmaId: number; kapat: () => void }

function HizmetPuaniFormu({ firmaId, kapat }: PencereOzellikleri) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliEkleme();
  const form = useForm<{ puan: string; not: string }, KarneCevabi>({
    ilk: { puan: '4', not: '' },
    hataIletisi: 'Hizmet puanı kaydedilemedi.',
    kaydet: (d) => ekle<KarneCevabi>(`/musteri-tedarikci/firmalar/${firmaId}/hizmet-puani/ekle`,
      { puan: Number(d.puan), not: d.not.trim() || null } satisfies HizmetPuaniGovdesi),
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.karne(firmaId), cevap);
      bildir('tamam', 'Hizmet puanı kaydedildi.');
      kapat();
    },
  });
  return (
    <FormPenceresi baslik="Hizmet puanı ver" kimlik="tc-mt-hizmet-form" kapat={kapat} form={form}>
      <Secim etiket="Puan (5 en iyi)" secenekler={PUAN_SECENEKLERI} value={form.degerler.puan} onChange={(o) => form.degistir({ puan: o.target.value })} />
      <Girdi etiket="Not" autoComplete="off" maxLength={500} {...form.alan('not')} />
    </FormPenceresi>
  );
}

function YillikKarneFormu({ firmaId, kapat }: PencereOzellikleri) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliEkleme();
  const form = useForm<{ yil: string; not: string }, KarneCevabi>({
    ilk: { yil: tesisGunu(Date.now()).slice(0, 4), not: '' },
    dogrula: (d): AlanHatalari => (/^\d{4}$/.test(d.yil) ? {} : { yil: 'Yıl dört rakamdır.' }),
    hataIletisi: 'Yıllık karne kaydedilemedi.',
    kaydet: (d) => ekle<KarneCevabi>(`/musteri-tedarikci/firmalar/${firmaId}/yillik-karne/ekle`,
      { yil: Number(d.yil), not: d.not.trim() || null } satisfies YillikKarneGovdesi),
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.karne(firmaId), cevap);
      bildir('tamam', 'Yıllık karne kaydedildi.');
      kapat();
    },
  });
  return (
    <FormPenceresi baslik="Yıllık karneyi kaydet" kimlik="tc-mt-yillik-form" kapat={kapat} form={form}>
      <p className="tc-mt-yok">Bugünkü kayan 12 aylık puan ve sınıf bu yılın karnesi olarak kaydedilir; firma ve yıl başına bir kayıt.</p>
      <Girdi etiket="Yıl" required inputMode="numeric" maxLength={4} {...form.alan('yil')} />
      <Girdi etiket="Not" autoComplete="off" maxLength={1000} {...form.alan('not')} />
    </FormPenceresi>
  );
}

export function FirmaKarnesi({ firmaId }: { firmaId: number }) {
  const islemler = useOturum().data?.islemler ?? [];
  const [acik, acikYaz] = useState<'hizmet' | 'yillik' | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.karne(firmaId),
    queryFn: () => api.get<KarneCevabi>(`/musteri-tedarikci/firmalar/${firmaId}/karne`),
  });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Karne alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  const { karne, yillikKarneler, hizmetPuanlari } = sorgu.data;
  const kapat = () => acikYaz(null);
  return (
    <div className="tc-mt-ayrinti">
      <section aria-label="Karne">
        <div className="tc-mt-bolum-ust">
          <h3 className="tc-mt-bolum-baslik">Karne · {tarihMetni(karne.donemBasi)} - {tarihMetni(karne.donemSonu)}</h3>
          <span className="tc-mt-karne-toplam">
            {karne.yetersizVeri
              ? <Rozet ton="pasif">Yetersiz veri</Rozet>
              : <><span className="tc-mt-karne-puan">{sayi(karne.puan)}</span><SinifRozeti sinif={karne.sinif} /></>}
          </span>
        </div>
        <Tablo etiket="Karne ölçütleri" sutunlar={OLCUT_SUTUNLARI} satirlar={olcutler(karne)} satirAnahtari={(s) => s.olcut} bosMesaj="" />
        {karne.yetersizVeri && (
          <p className="tc-mt-yok">12 ayda en az {KARNE_EN_AZ_TESLIM} teslim satırı ve {KARNE_EN_AZ_LOT} lot olmadan puan ve sınıf verilmez.</p>
        )}
      </section>
      <section aria-label="Sınıflar">
        <h3 className="tc-mt-bolum-baslik">Sınıflar</h3>
        <Tablo etiket="Sınıflar" sutunlar={SINIF_SUTUNLARI} satirlar={[...KARNE_SINIFLARI]} satirAnahtari={(s) => s} bosMesaj="" />
        <p className="tc-mt-yok">Sınıf onayı değiştirmez; Kalite Merkezi onay sahibine öneridir. C ve D çeyrek sonunda yeniden gözden geçirilir.</p>
      </section>
      <section aria-label="Kayıtlı karneler">
        <div className="tc-mt-bolum-ust">
          <h3 className="tc-mt-bolum-baslik">Kayıtlı karneler</h3>
          {islemler.includes('kalite-merkezi.onayla') && <Dugme simge="check" onClick={() => acikYaz('yillik')}>Yıllık karneyi kaydet</Dugme>}
        </div>
        <Tablo etiket="Kayıtlı karneler" sutunlar={YILLIK_SUTUNLARI} satirlar={yillikKarneler} satirAnahtari={(y) => y.id} bosMesaj="Kayıtlı yıllık karne yok." />
      </section>
      <section aria-label="Hizmet puanları">
        <div className="tc-mt-bolum-ust">
          <h3 className="tc-mt-bolum-baslik">Hizmet puanları</h3>
          {islemler.includes('satin-alma.yaz') && <Dugme simge="plus" onClick={() => acikYaz('hizmet')}>Hizmet puanı ver</Dugme>}
        </div>
        <Tablo etiket="Hizmet puanları" sutunlar={HIZMET_SUTUNLARI} satirlar={hizmetPuanlari} satirAnahtari={(h) => h.id} bosMesaj="Hizmet puanı girilmemiş." />
      </section>
      {acik === 'hizmet' && <HizmetPuaniFormu firmaId={firmaId} kapat={kapat} />}
      {acik === 'yillik' && <YillikKarneFormu firmaId={firmaId} kapat={kapat} />}
    </div>
  );
}
