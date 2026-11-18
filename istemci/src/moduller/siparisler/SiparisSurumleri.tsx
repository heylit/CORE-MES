import { useQuery } from '@tanstack/react-query';
import type { SiparisAyrintisi, SiparisRevizyonDegisikligi, SiparisRevizyonlariCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { DurumKutusu, Kart, Rozet } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { fiyatMetni, miktarMetni, tarihMetni, zamanMetni } from './gorunum.ts';

const ALAN_ADI: Readonly<Record<string, string>> = {
  musteriSiparisNo: 'Müşteri sipariş no', termin: 'Termin', kdvOrani: 'KDV oranı', odemeKosulu: 'Ödeme koşulu', aciklama: 'Açıklama',
  cezaOraniGun: 'Gecikme cezası', cezaTavaniOrani: 'Ceza tavanı', odemeVadesiGun: 'Ödeme vadesi', birimFiyat: 'Birim fiyat',
};

function deger(d: SiparisRevizyonDegisikligi, v: string | null, s: SiparisAyrintisi): string {
  if (v === null) return d.alan === 'termin' && d.kalemSira !== null ? 'Sipariş termini' : '—';
  if (d.alan === 'termin') return tarihMetni(v);
  if (d.alan === 'birimFiyat') return fiyatMetni(v, s.paraBirimi);
  if (d.alan === 'kdvOrani' || d.alan === 'cezaTavaniOrani') return `%${miktarMetni(v)}`;
  if (d.alan === 'cezaOraniGun') return `%${miktarMetni(v)} / gün`;
  if (d.alan === 'odemeVadesiGun') return `${v} gün`;
  return v;
}

// Fiyatı görmeyene fiyat değişikliğinin yalnız varlığı görünür (sunucu değeri boş döner).
function degisiklikMetni(d: SiparisRevizyonDegisikligi, s: SiparisAyrintisi): string {
  const ad = `${d.kalemSira === null ? '' : `Kalem ${d.kalemSira} `}${(ALAN_ADI[d.alan] ?? d.alan).toLocaleLowerCase('tr')}`.replace(/^./, (h) => h.toLocaleUpperCase('tr'));
  if (d.fiyat && d.eski === null && d.yeni === null) return `${ad} değişti`;
  return `${ad}: ${deger(d, d.eski, s)} → ${deger(d, d.yeni, s)}`;
}

// SIP-40 (3427-4 a): onaylı siparişin sürümleri yeniden eskiye; Rev 0 onaydaki hâldir, ilk değişiklikte görünür.
export function SiparisSurumleri({ siparis }: { siparis: SiparisAyrintisi }) {
  const surumler = useQuery({
    queryKey: anahtarlar.siparisSurumleri(siparis.id),
    queryFn: () => api.get<SiparisRevizyonlariCevabi>(`/siparisler/${siparis.id}/surumler`),
    enabled: siparis.durum !== 'taslak',
  });
  if (siparis.durum === 'taslak') return null;
  if (surumler.isPending) return null;
  if (surumler.isError) return <Kart baslik="Sürüm geçmişi"><DurumKutusu durum="hata" mesaj={hataIletisi(surumler.error, 'Sürüm geçmişi alınamadı')} yenile={() => { void surumler.refetch(); }} /></Kart>;
  const liste = surumler.data.revizyonlar;
  if (liste.length === 0) return null;
  return (
    <Kart baslik="Sürüm geçmişi" sag={<Rozet ton="bilgi">{`Rev ${liste[0]?.revNo ?? 0}`}</Rozet>}>
      <ol className="tc-sp-revler">
        {liste.map((r) => (
          <li key={r.revNo} className="tc-sp-rev" aria-label={`Rev ${r.revNo}`}>
            <div className="tc-sp-rev-ust">
              <strong>{`Rev ${r.revNo}`}</strong>
              <span className="tc-sp-soluk">{`${r.kisi ?? '—'} · ${zamanMetni(r.an)}`}</span>
              {r.logoGitmisti && <Rozet ton="uyari" gorunum="cizgi">Logo'da elle güncellenmeli</Rozet>}
            </div>
            <p className="tc-sp-rev-neden">{r.gerekce}</p>
            <ul className="tc-sp-rev-degisiklik">
              {r.degisiklikler.map((d, i) => <li key={i}>{degisiklikMetni(d, siparis)}</li>)}
            </ul>
          </li>
        ))}
        <li className="tc-sp-rev" aria-label="Rev 0">
          <div className="tc-sp-rev-ust">
            <strong>Rev 0</strong>
            <span className="tc-sp-soluk">{`Onay · ${zamanMetni(siparis.onayZamani)}`}</span>
          </div>
        </li>
      </ol>
    </Kart>
  );
}
