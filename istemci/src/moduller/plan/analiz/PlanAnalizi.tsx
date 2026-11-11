import { useQuery } from '@tanstack/react-query';
import type { PlanAnaliziCevabi } from '#paylasilan/sozlesme/plan-analiz.ts';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { SayiKarti } from '../../../ortak/arayuz/SayiKarti.tsx';
import { CizgiGrafikKarti } from '../../../ortak/arayuz/grafik/grafikler.tsx';
import { api } from '../../../ortak/veri/api.ts';
import { DAR_ESIK, darbogazMetni, doluluk, egilimMetni, haftaEtiketi, hucreAciklamasi, olcumEtiketi, saatMetni, yuzdeMetni } from './kurallar.ts';
import './analiz.css';

// Planlama analizi (2151, 2151-1 b): tezgâh yükü ve plan güvenilirliğinin eğilimi. Yalnız okur; her kart neyi ölçtüğünü yazar.
export const PLAN_ANALIZI_YOLU = '/plan/analiz';

export function PlanAnalizi() {
  const q = useQuery({ queryKey: ['plan', 'analiz'], queryFn: () => api.get<PlanAnaliziCevabi>(PLAN_ANALIZI_YOLU) });
  const yenile = () => { void q.refetch(); };
  return (
    <div>
      <SayfaBasligi baslik="Planlama analizi" simge="chart" alt="Canlı plan: tezgâh doluluğu 8 hafta gerçek, 8 hafta plan; plan güvenilirliğinin eğilimi. Atölyedeki taslak plan canlıya alınınca burada görünür."
        birincil={{ etiket: 'Yenile', simge: 'rotate', yap: yenile, yukleniyor: q.isFetching }} />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" mesaj="Planlama analizi alınamadı" hata={q.error} yenile={yenile} />
          : <Rapor c={q.data} />}
    </div>
  );
}

function Rapor({ c }: { c: PlanAnaliziCevabi }) {
  const z = c.zamaninda;
  return (
    <>
      <div className="tc-pano-izgara">
        <SayiKarti baslik="Darboğaz" simge="alert" ton={c.darbogaz !== null && c.darbogaz.oran >= DAR_ESIK ? 'uyari' : 'bilgi'}
          metin={c.darbogaz?.ad ?? 'Yok'}
          altMetin={darbogazMetni(c)} />
        <SayiKarti baslik="Kişiye planlı iş" simge="users" metin={saatMetni(c.kisiYukuDk)}
          altMetin="Önümüzdeki 8 hafta, tezgâhsız (el işi) adımlar. Tezgâh doluluğuna katılmaz." />
        <CizgiGrafikKarti baslik="Zamanında biten emir" simge="flag" yuklendi
          etiketler={z.noktalar.map((n) => olcumEtiketi(n.zaman))}
          seriler={[{ ad: 'Ölçüm', degerler: z.noktalar.map((n) => n.yuzde) }, { ad: 'Düzeltilmiş (EWMA)', degerler: z.noktalar.map((n) => n.ewma) }]}
          bicim={(n) => yuzdeMetni(n)} tavan={100} alt={egilimMetni(z)} />
      </div>
      <Kart baslik="Tezgâh doluluğu" simge="grid">
        <div className="pa-isi-kap">
          <table className="pa-isi">
            <caption className="tc-gizli-etiket">İstasyon ve haftaya göre doluluk yüzdesi</caption>
            <thead>
              <tr>
                <th scope="col">İstasyon</th>
                {c.haftalar.map((h, i) => (
                  <th key={h.baslangic} scope="col" className={h.ileri && !c.haftalar[i - 1]?.ileri ? 'pa-ileri' : undefined}
                    title={`${h.baslangic} - ${h.bitis}${h.ileri ? ' (plan)' : ' (gerçek)'}`}>{haftaEtiketi(h.baslangic)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.istasyonlar.length === 0 && <tr><td colSpan={c.haftalar.length + 1}>İstasyona bağlı aktif tezgâh yok.</td></tr>}
              {c.istasyonlar.map((s) => (
                <tr key={s.istasyonId}>
                  <th scope="row">{s.ad}{s.takvimsizMakine > 0 ? ` (${String(s.takvimsizMakine)}/${String(s.makine)} takvimsiz)` : ''}</th>
                  {s.hucreler.map((h, i) => {
                    const hafta = c.haftalar[i]!;
                    return (
                      <td key={hafta.baslangic} data-doluluk={doluluk(h)} title={hucreAciklamasi(h, hafta.ileri)}
                        className={hafta.ileri && !c.haftalar[i - 1]?.ileri ? 'pa-ileri' : undefined}>
                        {h.oran === null ? '-' : yuzdeMetni(h.oran)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pa-aciklama">
          İlk 8 hafta gerçek makine kullanımı (vardiya dışı çalışma dahil, %100'ü geçebilir), sonraki 8 hafta canlı planın çalışma saatine düşen kısmı;
          bu hafta yalnız şimdiden sonrası. %{DAR_ESIK} ve üstü dar, %100 üstü taşmış. Takvimi olmayan tezgâh sayılmaz.
        </p>
      </Kart>
    </>
  );
}
