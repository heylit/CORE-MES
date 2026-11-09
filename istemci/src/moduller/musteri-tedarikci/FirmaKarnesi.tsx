// Tedarikçi karnesi (1259 c, 1260 a; hesap sürümü 2, 2456): kayan 12 aylık puan, ölçüt dökümü, elle değerlendirmeler ve yıllık karne. Puanı sunucu hesaplar; ekran yalnız gösterir.
// Sınıf Kalite Merkezi onayını değiştirmez, onay sahibine öneridir (236 a).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EllePuanTuru, HizmetPuani, HizmetPuaniGovdesi, KarneBileseni, KarneBilesenSatiri, KarneCevabi, KarneOzeti, KarneSinifi, LotKarari, YillikKarne,
  YillikKarneGovdesi,
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
// girer). Yalnız açıklama metni içindir; puanı, sınıfı ve ağırlıkları sunucu verir.
const KARNE_EKRAN_SABITLERI = {
  toleransGunu: 2,
  enAzTeslim: 3,
  enAzLot: 3,
  siniflar: ['A', 'B', 'C', 'D'] as const satisfies readonly KarneSinifi[],
  sinifAltSinirlari: { A: 90, B: 75, C: 60, D: 0 } as const satisfies Record<KarneSinifi, number>,
  hizmetEnAz: 1,
  hizmetEnCok: 5,
};
const {
  toleransGunu: TESLIM_TOLERANS_GUNU, enAzTeslim: KARNE_EN_AZ_TESLIM, enAzLot: KARNE_EN_AZ_LOT,
  siniflar: KARNE_SINIFLARI, sinifAltSinirlari: KARNE_SINIF_ALT_SINIRLARI, hizmetEnAz: HIZMET_PUANI_EN_AZ, hizmetEnCok: HIZMET_PUANI_EN_COK,
} = KARNE_EKRAN_SABITLERI;

const SINIF_TONU: Record<KarneSinifi, RozetTonu> = { A: 'tamam', B: 'tamam', C: 'uyari', D: 'hata' };
const SINIF_ANLAMI: Record<KarneSinifi, string> = { A: 'tercih edilen', B: 'onaylı, izlenir', C: 'iyileştirme ister (DÖF)', D: 'yeni siparişten önce kalite kararı' };
const SINIF_ONERISI: Record<KarneSinifi, string> = { A: 'Onaylı', B: 'Onaylı', C: 'Şartlı onaylı', D: 'Askıda' };
const sayi = (n: number | null): string => (n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const katki = (deger: number | null, etkin: number | null): string => (deger === null || etkin === null ? '—' : sayi(Math.round(deger * etkin) / 100));

export function SinifRozeti({ sinif, azVeri = false }: { sinif: KarneSinifi | null; azVeri?: boolean }) {
  if (azVeri) return <Rozet ton="pasif">Az veri</Rozet>;
  return sinif === null ? <span className="tc-mt-yok">sınıf yok</span> : <Rozet ton={SINIF_TONU[sinif]}>{sinif}</Rozet>;
}

export const BILESEN_ADI: Record<KarneBileseni, string> = {
  lot: 'Lot kabul', ppm: 'PPM', zamaninda: 'Zamanında teslim', tam: 'Tam teslim', teklif: 'Teklife yanıt',
  satinAlma: 'Satın alma değerlendirmesi', kalite: 'Kalite değerlendirmesi',
};
export const BILESEN_GRUBU: Record<KarneBileseni, 'kalite' | 'teslim' | 'elle'> = {
  lot: 'kalite', ppm: 'kalite', zamaninda: 'teslim', tam: 'teslim', teklif: 'teslim', satinAlma: 'elle', kalite: 'elle',
};
export const GRUP_ADI = { kalite: 'Kalite · otomatik', teslim: 'Satın alma ve teslim · otomatik', elle: 'Elle verilen' } as const;
const KARAR_ADI: Record<LotKarari, string> = { kabul: 'kabul', sartli_kabul: 'şartlı', hatali_kabul: 'hatalı kabul', red: 'ret', iade: 'iade' };

// Bileşenin ölçüsü: sayılar karneden gelir; PPM ve teklife yanıt olayı henüz gelmediği için "henüz ölçülmüyor" yazar.
function olcu(k: KarneOzeti, b: KarneBileseni): string {
  const elle = (e: { sayi: number; ortalama: number | null }) => (e.sayi === 0 ? 'Değerlendirme yok' : `${e.sayi} değerlendirme, ortalama ${sayi(e.ortalama)} / ${HIZMET_PUANI_EN_COK}`);
  switch (b) {
    case 'lot': {
      if (k.kalite.lot === 0) return 'Giriş kontrolü kararı yok';
      const kararlar = Object.entries(k.kalite.kararlar).map(([karar, n]) => `${n} ${KARAR_ADI[karar as LotKarari]}`);
      return `${k.kalite.lot} lot: ${kararlar.join(', ')}`;
    }
    case 'zamaninda': return k.teslim.toplam === 0 ? 'Teslim yok' : `${k.teslim.toplam} teslimin ${k.teslim.zamaninda}'i termin + ${TESLIM_TOLERANS_GUNU} gün içinde`;
    case 'tam': return k.teslim.toplam === 0 ? 'Teslim yok' : `${k.teslim.toplam} teslimin ${k.teslim.tam}'i tam`;
    case 'satinAlma': return elle(k.hizmet);
    case 'kalite': return elle(k.kaliteDegerlendirmesi);
    case 'ppm': case 'teklif': return 'Henüz ölçülmüyor';
  }
}

interface OlcutSatiri extends KarneBilesenSatiri { olcu: string }
const OLCUT_SUTUNLARI: Sutun<OlcutSatiri>[] = [
  { anahtar: 'olcut', baslik: 'Ölçüt', hucre: (s) => <>{BILESEN_ADI[s.anahtar]} <span className="tc-mt-etiket">{BILESEN_GRUBU[s.anahtar] === 'elle' ? 'elle' : 'otomatik'}</span></> },
  { anahtar: 'hesap', baslik: 'Hesap', hucre: (s) => s.olcu },
  { anahtar: 'deger', baslik: 'Değer', hizala: 'sag', mono: true, hucre: (s) => sayi(s.deger) },
  { anahtar: 'agirlik', baslik: 'Ağırlık', hizala: 'sag', mono: true, hucre: (s) => `%${s.agirlik}` },
  { anahtar: 'etkin', baslik: 'Bu firmada', hizala: 'sag', mono: true, hucre: (s) => (s.etkinAgirlik === null ? '—' : `%${sayi(s.etkinAgirlik)}`) },
  { anahtar: 'katki', baslik: 'Katkı', hizala: 'sag', mono: true, hucre: (s) => katki(s.deger, s.etkinAgirlik) },
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
  { anahtar: 'surum', baslik: 'Hesap', mono: true, hucre: (y) => `sürüm ${y.hesapSurumu ?? 1}` },
  { anahtar: 'degerlendiren', baslik: 'Değerlendiren', hucre: (y) => y.degerlendiren },
  { anahtar: 'not', baslik: 'Not', hucre: (y) => y.not },
];
const TUR_ADI: Record<EllePuanTuru, string> = { 'satin-alma': 'Satın alma', kalite: 'Kalite' };
const HIZMET_SUTUNLARI: Sutun<HizmetPuani>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', mono: true, hucre: (h) => zamanMetni(h.olusturma) },
  { anahtar: 'tur', baslik: 'Değerlendirme', hucre: (h) => TUR_ADI[h.tur] },
  { anahtar: 'puan', baslik: 'Puan', hizala: 'sag', mono: true, hucre: (h) => `${h.puan} / ${HIZMET_PUANI_EN_COK}` },
  { anahtar: 'giren', baslik: 'Değerlendiren', hucre: (h) => h.giren },
  { anahtar: 'not', baslik: 'Not', hucre: (h) => h.not },
];

const PUAN_SECENEKLERI = Array.from({ length: HIZMET_PUANI_EN_COK - HIZMET_PUANI_EN_AZ + 1 }, (_, i) => {
  const p = String(HIZMET_PUANI_EN_COK - i);
  return { deger: p, baslik: p };
});

interface PencereOzellikleri { firmaId: number; kapat: () => void }

// Kişi ve zaman sunucudan; değerlendiren alanı yoktur. Uç türü belirler (satın alma: satin-alma.yaz, Kalite: kalite-merkezi.onayla).
const ELLE_FORMU: Record<EllePuanTuru, { baslik: string; yol: string; kimlik: string }> = {
  'satin-alma': { baslik: 'Satın alma değerlendirmesi ver', yol: 'hizmet-puani', kimlik: 'tc-mt-hizmet-form' },
  kalite: { baslik: 'Kalite değerlendirmesi ver', yol: 'kalite-degerlendirmesi', kimlik: 'tc-mt-kalite-form' },
};
function EllePuanFormu({ firmaId, kapat, tur }: PencereOzellikleri & { tur: EllePuanTuru }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliEkleme();
  const f = ELLE_FORMU[tur];
  const form = useForm<{ puan: string; not: string }, KarneCevabi>({
    ilk: { puan: '4', not: '' },
    hataIletisi: 'Değerlendirme kaydedilemedi.',
    kaydet: (d) => ekle<KarneCevabi>(`/musteri-tedarikci/firmalar/${firmaId}/${f.yol}/ekle`,
      { puan: Number(d.puan), not: d.not.trim() || null } satisfies HizmetPuaniGovdesi),
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.karne(firmaId), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.degerlendirme() });
      bildir('tamam', 'Değerlendirme kaydedildi.');
      kapat();
    },
  });
  return (
    <FormPenceresi baslik={f.baslik} kimlik={f.kimlik} kapat={kapat} form={form}>
      <Secim etiket="Puan (5 en iyi)" secenekler={PUAN_SECENEKLERI} value={form.degerler.puan} onChange={(o) => form.degistir({ puan: o.target.value })} />
      <Girdi etiket="Not" autoComplete="off" maxLength={500} {...form.alan('not')} />
      <p className="tc-mt-yok">Değerlendiren ve zaman oturumdan yazılır.</p>
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
  const [acik, acikYaz] = useState<EllePuanTuru | 'yillik' | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.karne(firmaId),
    queryFn: () => api.get<KarneCevabi>(`/musteri-tedarikci/firmalar/${firmaId}/karne`),
  });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Karne alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  const { karne, yillikKarneler, hizmetPuanlari } = sorgu.data;
  const kapat = () => acikYaz(null);
  const satirlar: OlcutSatiri[] = karne.bilesenler.map((b) => ({ ...b, olcu: olcu(karne, b.anahtar) }));
  return (
    <div className="tc-mt-ayrinti">
      <section aria-label="Karne">
        <div className="tc-mt-bolum-ust">
          <h3 className="tc-mt-bolum-baslik">Karne · {tarihMetni(karne.donemBasi)} - {tarihMetni(karne.donemSonu)}</h3>
          <span className="tc-mt-karne-toplam">
            <span className={karne.yetersizVeri ? 'tc-mt-karne-puan tc-mt-yok' : 'tc-mt-karne-puan'}>{sayi(karne.puan)}</span>
            <SinifRozeti sinif={karne.sinif} azVeri={karne.yetersizVeri} />
          </span>
        </div>
        <Tablo etiket="Karne ölçütleri" sutunlar={OLCUT_SUTUNLARI} satirlar={satirlar} satirAnahtari={(s) => s.anahtar} bosMesaj="" />
        <p className="tc-mt-yok">
          Hesap sürümü {karne.hesapSurumu}. Verisi olmayan ölçüt “—” yazar ve sıfır sayılmaz; ağırlığı öteki ölçütlere oranla dağılır.
          {karne.yetersizVeri && ` 12 ayda en az ${KARNE_EN_AZ_TESLIM} teslim ve ${KARNE_EN_AZ_LOT} lot olmadan sınıf verilmez.`}
        </p>
      </section>
      <section aria-label="Sınıflar">
        <h3 className="tc-mt-bolum-baslik">Sınıflar</h3>
        <Tablo etiket="Sınıflar" sutunlar={SINIF_SUTUNLARI} satirlar={[...KARNE_SINIFLARI]} satirAnahtari={(s) => s} bosMesaj="" />
        <p className="tc-mt-yok">Sınıf onayı değiştirmez; Kalite Merkezi onay sahibine öneridir. C ve D çeyrek sonunda yeniden gözden geçirilir.</p>
      </section>
      <section aria-label="Değerlendirmeler">
        <div className="tc-mt-bolum-ust">
          <h3 className="tc-mt-bolum-baslik">Değerlendirmeler</h3>
          <span className="tc-mt-karne-toplam">
            {islemler.includes('satin-alma.yaz') && <Dugme simge="cart" onClick={() => acikYaz('satin-alma')}>Satın alma değerlendirmesi ver</Dugme>}
            {islemler.includes('kalite-merkezi.onayla') && <Dugme simge="clipboard-check" onClick={() => acikYaz('kalite')}>Kalite değerlendirmesi ver</Dugme>}
          </span>
        </div>
        <Tablo etiket="Değerlendirmeler" sutunlar={HIZMET_SUTUNLARI} satirlar={hizmetPuanlari} satirAnahtari={(h) => h.id} bosMesaj="Değerlendirme girilmemiş." />
      </section>
      <section aria-label="Kayıtlı karneler">
        <div className="tc-mt-bolum-ust">
          <h3 className="tc-mt-bolum-baslik">Kayıtlı karneler</h3>
          {islemler.includes('kalite-merkezi.onayla') && <Dugme simge="check" onClick={() => acikYaz('yillik')}>Yıllık karneyi kaydet</Dugme>}
        </div>
        <Tablo etiket="Kayıtlı karneler" sutunlar={YILLIK_SUTUNLARI} satirlar={yillikKarneler} satirAnahtari={(y) => y.id} bosMesaj="Kayıtlı yıllık karne yok." />
      </section>
      {(acik === 'satin-alma' || acik === 'kalite') && <EllePuanFormu firmaId={firmaId} kapat={kapat} tur={acik} />}
      {acik === 'yillik' && <YillikKarneFormu firmaId={firmaId} kapat={kapat} />}
    </div>
  );
}
