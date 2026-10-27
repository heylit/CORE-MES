import { useQuery } from '@tanstack/react-query';
import type { ProjePlaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import { DurumKutusu, Kart, Rozet, SayiKarti, Tablo, type RozetTonu, type Sutun } from '../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { tarihSaatMetni, zamanMetni } from '../../../ortak/veri/zaman-metni.ts';
import './proje-plani.css';

type Is = ProjePlaniCevabi['isler'][number];

const DURUM: Record<Is['durum'], { metin: string; ton: RozetTonu }> = {
  bekliyor: { metin: 'Bekliyor', ton: 'pasif' },
  calisiyor: { metin: 'Çalışıyor', ton: 'uyari' },
  tamam: { metin: 'Bitti', ton: 'tamam' },
};

// Net çalışma dakikası; artı geç.
export function kaymaMetni(dk: number | null): string {
  if (dk === null) return '—';
  const m = Math.round(Math.abs(dk));
  const govde = m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa${m % 60 === 0 ? '' : ` ${m % 60} dk`}`;
  return m === 0 ? '0 dk' : `${dk > 0 ? '+' : '-'}${govde}`;
}

const gunMetni = (g: number | null): string => (g === null ? '—' : g === 0 ? 'Tabanla aynı gün' : `${g > 0 ? '+' : ''}${g} gün`);

const SUTUNLAR: Sutun<Is>[] = [
  { anahtar: 'emir', baslik: 'Emir / op', mono: true, kirilmaz: true, hucre: (i) => `${i.emirNo} · ${i.opNo}`, csv: (i) => `${i.emirNo} ${i.opNo}` },
  { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (i) => i.istasyonAd ?? '—' },
  { anahtar: 'durum', baslik: 'Durum', hucre: (i) => <Rozet ton={DURUM[i.durum].ton}>{DURUM[i.durum].metin}</Rozet>, csv: (i) => DURUM[i.durum].metin },
  { anahtar: 'taban', baslik: 'Taban bitiş', mono: true, kirilmaz: true, hucre: (i) => zamanMetni(i.taban?.bitis ?? null) },
  { anahtar: 'canli', baslik: 'Plan bitiş', mono: true, kirilmaz: true, hucre: (i) => zamanMetni(i.canli?.bitis ?? null) },
  {
    anahtar: 'gercek', baslik: 'Gerçek / tahmini bitiş', mono: true, kirilmaz: true,
    hucre: (i) => (i.gercekBitis !== null ? zamanMetni(i.gercekBitis) : i.tahminiBitis !== null ? `~${zamanMetni(i.tahminiBitis)}` : '—'),
  },
  { anahtar: 'kayma', baslik: 'Kayma (plana göre)', hizala: 'sag', mono: true, kirilmaz: true, hucre: (i) => kaymaMetni(i.bitisKaymasiDk) },
  { anahtar: 'tabanKayma', baslik: 'Kayma (tabana göre)', hizala: 'sag', mono: true, kirilmaz: true, hucre: (i) => kaymaMetni(i.tabanBitisKaymasiDk) },
];

// 933 a: projenin plan ve gerçekleşeni, salt okunur. Projeler ekranı bu bileşeni sekme olarak gösterir; veriyi plan modülünün ucundan okur.
export function ProjePlani({ projeId }: { projeId: number }) {
  const sorgu = useQuery({
    queryKey: ['plan', 'proje', projeId],
    queryFn: () => api.get<ProjePlaniCevabi>(`/plan/projeler/${projeId}/plan-gerceklesen`),
  });
  if (sorgu.isError) {
    return (
      <Kart baslik="Plan ve gerçekleşen">
        <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Plan alınamadı')} yenile={() => { void sorgu.refetch(); }} />
      </Kart>
    );
  }
  const o = sorgu.data?.ozet;
  return (
    <Kart baslik="Plan ve gerçekleşen" simge="clock">
      <div className="tc-pp">
        {o && o.isSayisi > 0 && (
          <div className="tc-pp-kartlar">
            <SayiKarti baslik="Taban bitiş" simge="flag" metin={tarihSaatMetni(o.tabanBitis)} altMetin="İlk canlıya almadaki plan" />
            <SayiKarti baslik="Plan bitiş" simge="clock" metin={tarihSaatMetni(o.canliBitis)} altMetin="Bugünkü canlı plan" />
            <SayiKarti
              baslik="Beklenen bitiş" simge="gauge" metin={tarihSaatMetni(o.beklenenBitis)}
              altMetin={o.beklenenBitis === null ? 'Bir işin bitişi bilinmiyor' : gunMetni(o.beklenenKaymaGun)}
              ton={o.beklenenKaymaGun !== null && o.beklenenKaymaGun > 0 ? 'uyari' : 'bilgi'}
            />
            <SayiKarti
              baslik="İşler" simge="check" metin={`${o.bitenSayisi} / ${o.isSayisi}`}
              altMetin={o.plansizSayisi === 0 ? 'Biten / toplam' : `${o.plansizSayisi} iş planda yok`}
              ton={o.plansizSayisi > 0 ? 'uyari' : 'bilgi'}
            />
          </div>
        )}
        <Tablo
          etiket="Projenin iş emirleri: plan ve gerçekleşen"
          sutunlar={SUTUNLAR}
          satirlar={sorgu.data?.isler ?? []}
          satirAnahtari={(i) => i.isEmriId}
          mesgul={sorgu.isPending}
          bosMesaj="Bu projeye bağlı iş emri yok"
        />
        <p className="tc-pp-not">Kaymalar net çalışma süresidir (kapalı saatler sayılmaz); ~ işaretli bitiş çalışan işin tahminidir. Plan Planlama ekranında değişir.</p>
      </div>
    </Kart>
  );
}
