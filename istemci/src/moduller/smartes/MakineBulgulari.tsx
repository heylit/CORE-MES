import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { MakineBulgulariCevabi, MakineBulguTuru } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YOK } from './gosterim.ts';
import { MakineGrafikleri } from './MakineGrafikleri.tsx';
import './smartes.css';

type BulguTuru = MakineBulguTuru;
type Ton = MakineBulgulariCevabi['kutular'][number]['ton'];

// Her kullanımın adı, nasıl hesaplandığı ve çalışandan ne istediği ekranda yazar: sayı tek başına güven vermez.
const TUR: Record<BulguTuru, { ad: string; kisa: string; simge: SimgeAdi; hesap: string; calisan: string; veri: string; yol?: string; yolAdi?: string }> = {
  durum: { ad: 'Canlı durum', kisa: 'Durum', simge: 'cpu', hesap: 'Hesap yok; SmartES’ten son okunan durum, mod ve alarm gösterilir.', calisan: 'Hiçbir şey.', veri: 'Okunuyor (dakikada bir).', yol: '/smartes/makineler', yolAdi: 'Makineler canlı' },
  durus: { ad: 'Nedensiz duruş', kisa: 'Duruş', simge: 'pause', hesap: 'Makine 3 dakikadan uzun çalışmadıysa duruş sayılır; süre = çalışmamanın bitişi − başlangıcı. O aralıkta duruş nedeni girilmediyse burada görünür.', calisan: 'Yalnız neden; süreyi makine verir.', veri: 'Durum değişimleri okunuyor; okuma dakikada bir olduğu için 1-2 dakikadan kısa duruş görünmez.', yol: '/smartes/duruslar', yolAdi: 'Duruşlar' },
  sayim: { ad: 'Sayım farkı', kisa: 'Sayım', simge: 'box', hesap: 'Fark = SmartES’in makineden saydığı adet − operatörün SmartES’e girdiği (sağlam + red). Fark 2 adedi ya da %2’yi geçerse uyarı.', calisan: 'Sağlam ve red adedi.', veri: 'SmartES üretim sayılarından; programda sayacı artıran komut yoksa yanlış uyarı verir. Grafik makine sayacının dakikalık okumasından.' },
  program: { ad: 'Yanlış program', kisa: 'Program', simge: 'grid', hesap: 'Makinede çalışan program numarası, emrin operasyonuna tanımlı program numarasıyla aynı mı?', calisan: 'Hangi işi başlattığı.', veri: 'Makinedeki program okunuyor; operasyona program numarası bugün CORE’da tanımlanamıyor, yeni alan gelir. Alanı boş operasyonda uyarı çıkmaz.' },
  cevrim: { ad: 'Çevrim sapması', kisa: 'Çevrim', simge: 'clock', hesap: 'Gerçek çevrim = çalışma süresi ÷ üretilen adet. Sapma = (gerçek − rotadaki) ÷ rotadaki. %10’u geçerse rota süresi için düzeltme önerilir; rota kendiliğinden değişmez.', calisan: 'Hiçbir şey.', veri: 'Sayaç artışlarından; SmartES’in kendi ölçümü ayrıca gelir.' },
  bitis: { ad: 'Termin riski', kisa: 'Bitiş', simge: 'flag', hesap: 'SmartES’in tahmini bitişi, emrin teslim gününü geçiyorsa uyarı.', calisan: 'Hiçbir şey.', veri: 'Bugün SmartES’in tahmini; CORE’un kendi hesabı çevrim ölçümü gelince eklenir.' },
  oee: { ad: 'OEE (bugün)', kisa: 'OEE', simge: 'chart', hesap: 'Kullanılabilirlik = çalışma ÷ planlı süre. Performans = (adet × ideal çevrim) ÷ çalışma süresi. Kalite = sağlam ÷ toplam. OEE = üçünün çarpımı.', calisan: 'Fire adedi ve duruş nedeni; planlı süre vardiya takviminden.', veri: 'CORE’un hesabı; SmartES’in OEE’si ayrı adla SmartES hesapları’nda.' },
  oran: { ad: 'Düşük ilerleme', kisa: 'Oran', simge: 'gauge', hesap: 'İş boyunca ilerleme oranının zaman ağırlıklı ortalaması ve %100’ün altında geçen sürenin payı. Pay %30’u geçerse görünür.', calisan: 'Hiçbir şey.', veri: 'Bugün yalnız son değer okunuyor; geçmişi saklamak için yeni kayıt gerekir.' },
  yuk: { ad: 'Takım yükü', kisa: 'Yük', simge: 'wrench', hesap: 'Aynı parça ve takım cebi için ortalama iş mili yükü, takım yeniyken ölçülen değerle karşılaştırılır. Artış %25’i geçerse takım değişimi önerilir.', calisan: 'Takım değişimini bildirmesi (karşılaştırma sıfırlanır).', veri: 'Bugün yalnız son değer okunuyor; dakikada bir ölçüm yük eğrisi için kabadır.' },
  alarm: { ad: 'Tekrar eden alarm', kisa: 'Alarm', simge: 'alert', hesap: 'Makine ve alarm numarası başına sayım; aynı alarm 7 günde 3 kez ya da daha çok geldiyse bakım için görünür.', calisan: 'Hiçbir şey.', veri: 'Okunuyor (Alarmlar listesi).', yol: '/smartes/alarmlar', yolAdi: 'Alarmlar' },
};
type Bulgu = MakineBulgulariCevabi['bulgular'][number];
// Bulgu kayıt değiştirmez; tek eylem kullanıcıyı işi yapacağı ekrana götürür.
function eylem(b: Bulgu): { metin: string; simge: SimgeAdi; yol: string } {
  const emir = b.emirNo === null ? null : `/uretim-emirleri?no=${encodeURIComponent(b.emirNo)}`;
  const makine = `/smartes/makineler?makine=${encodeURIComponent(b.makineKodu)}`;
  if (b.tur === 'durus') return emir === null ? { metin: 'Makineyi aç', simge: 'cpu', yol: makine } : { metin: 'Duruş nedeni gir', simge: 'pause', yol: emir };
  if (b.tur === 'alarm') return { metin: 'Alarmları aç', simge: 'alert', yol: `/smartes/alarmlar?makine=${encodeURIComponent(b.makineKodu)}` };
  if (b.tur === 'oee' || b.tur === 'durum' || emir === null) return { metin: 'Makineyi aç', simge: 'cpu', yol: makine };
  return { metin: 'Emri aç', simge: 'clipboard-check', yol: emir };
}
const SIRA: readonly BulguTuru[] = ['durum', 'durus', 'sayim', 'program', 'cevrim', 'bitis', 'oee', 'oran', 'yuk', 'alarm'];
const ROZET: Record<Ton, RozetTonu> = { tamam: 'tamam', uyari: 'uyari', hata: 'hata', pasif: 'pasif' };
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

export function MakineBulgulari() {
  const git = useNavigate();
  const [suzgec, suzgecYaz] = useState<BulguTuru | null>(null);
  const [acik, acikYaz] = useState<string | null>(null);
  // Telefonda karne kapalı gelir: on kutu ve liste önce görünür.
  const [genis, genisYaz] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const liste = useQuery({ queryKey: anahtarlar.makineBulgulari, queryFn: () => api.get<MakineBulgulariCevabi>('/smartes/makine-bulgulari'), refetchInterval: 60_000 });
  const v = liste.data;
  const bulgular = (v?.bulgular ?? []).filter((b) => suzgec === null || b.tur === suzgec);
  const secili = suzgec === null ? null : TUR[suzgec];

  return (
    <Kart
      baslik="Makine bulguları"
      sag={(
        <span className="tc-sm-sag">
          {v?.sonOkuma != null && <span className="tc-sm-not">Son okuma {SAAT.format(new Date(v.sonOkuma))}</span>}
          <Dugme simge="rotate" aria-label="Yenile" yukleniyor={liste.isFetching} onClick={() => { void liste.refetch(); }} />
        </span>
      )}
    >
      <div className="tc-smartes">
        <p className="tc-smartes-aciklama">Makineden gelen veriyle çalışanın girdiği bilgi karşılaştırılır; tutmayan ve girilmemiş olan burada görünür. Bulgu yalnız gösterir, kayıt değiştirmez.</p>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Makine bulguları alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {v && !v.okumaAcik && (
          <p role="status" className="tc-smartes-aciklama">Canlı makine okuması kapalı. Sistem Ayarları’nda “SmartES canlı makine okuması” açılınca bulgular dakikada bir yenilenir.</p>
        )}
        {v && v.okumaAcik && (
          <>
            <div className="tc-mb-kutular" role="group" aria-label="Bulgu türüne göre süz">
              {SIRA.map((t) => {
                const k = v.kutular.find((x) => x.tur === t);
                return (
                  <button key={t} type="button" className="tc-mb-kutu" data-ton={k?.ton ?? 'pasif'} aria-pressed={suzgec === t} onClick={() => suzgecYaz(suzgec === t ? null : t)}>
                    <span className="tc-mb-kutu-ad"><Simge ad={TUR[t].simge} />{TUR[t].ad}</span>
                    <b className="tc-mb-kutu-deger">{k?.deger ?? YOK}</b>
                    <span className="tc-mb-kutu-alt">{k?.alt ?? 'Veri yok'}</span>
                  </button>
                );
              })}
            </div>
            {secili && suzgec && (
              <dl className="tc-mb-nasil" aria-label={`${secili.ad}: nasıl hesaplanır`}>
                <dt>Nasıl hesaplanır</dt><dd>{secili.hesap}</dd>
                <dt>Çalışandan</dt><dd>{secili.calisan}</dd>
                <dt>Veri</dt><dd>{secili.veri}</dd>
                {secili.yol !== undefined && (<><dt>Ayrıntı</dt><dd><Dugme simge="list" onClick={() => { void git(secili.yol!); }}>{secili.yolAdi}</Dugme></dd></>)}
              </dl>
            )}
            {v.grafikler !== null && <MakineGrafikleri v={v.grafikler} suzgec={suzgec} makineAc={(kod) => { void git(`/smartes/makineler?makine=${encodeURIComponent(kod)}`); }} />}
            <section className="tc-sm-grup" aria-label="Dikkat isteyenler">
              <h3 className="tc-smartes-baslik">
                Dikkat isteyenler <span className="tc-sm-not">{bulgular.length}{suzgec !== null && ` · ${TUR[suzgec].ad}`}</span>
                {suzgec !== null && <Dugme simge="x" onClick={() => suzgecYaz(null)}>Tümünü göster</Dugme>}
              </h3>
              {bulgular.length === 0 && <p className="tc-smartes-aciklama">Bu türde dikkat isteyen bulgu yok.</p>}
              <ul className="tc-mb-liste">
                {bulgular.map((b) => (
                  <li key={b.id} className="tc-mb-bulgu" data-ton={b.ton}>
                    <button type="button" className="tc-mb-bulgu-ust" aria-expanded={acik === b.id} onClick={() => acikYaz(acik === b.id ? null : b.id)}>
                      <span className="tc-mb-bulgu-simge"><Simge ad={TUR[b.tur].simge} /></span>
                      <span className="tc-mb-bulgu-govde">
                        <span className="tc-mb-bulgu-baslik"><span className="tc-sm-kod">{b.makineKodu}</span> {b.baslik}</span>
                        <span className="tc-sm-not">{TUR[b.tur].ad}{b.emirNo !== null && ` · ${b.emirNo}`}{b.opNo !== null && ` · Op ${b.opNo}`} · {SAAT.format(new Date(b.zaman))}</span>
                      </span>
                      <span className="tc-mb-bulgu-rozet"><Rozet ton={ROZET[b.ton]}>{b.ton === 'hata' ? 'Önemli' : 'Bakın'}</Rozet></span>
                    </button>
                    {acik === b.id && (
                      <dl className="tc-mb-nasil">
                        <dt>Hesap</dt><dd className="tc-sm-mono">{b.hesap}</dd>
                        <dt>Ne yapılır</dt><dd>{b.ne}</dd>
                        <dt className="tc-mb-gizli">Eylem</dt>
                        <dd className="tc-mb-eylem">{(() => { const e = eylem(b); return <Dugme simge={e.simge} onClick={() => { void git(e.yol); }}>{e.metin}</Dugme>; })()}</dd>
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <details className="tc-sm-grup tc-mb-karne-ac" open={genis} onToggle={(o) => { genisYaz((o.target as HTMLDetailsElement).open); }} aria-label="Makine karnesi">
              <summary className="tc-smartes-baslik">Makine karnesi <span className="tc-sm-not">bugün, {v.karne.length} makine, on gösterge</span></summary>
              <div className="tc-mb-karne-kap">
                <table className="tc-mb-karne">
                  <thead>
                    <tr><th scope="col">Makine</th>{SIRA.map((t) => <th key={t} scope="col" data-secili={suzgec === t || undefined}>{TUR[t].kisa}</th>)}</tr>
                  </thead>
                  <tbody>
                    {v.karne.map((m) => (
                      <tr key={m.makineKodu}>
                        <th scope="row"><span className="tc-sm-kod">{m.makineKodu}</span><span className="tc-sm-not">{m.makineAdi ?? ''}</span></th>
                        {SIRA.map((t) => (
                          <td key={t} data-baslik={TUR[t].kisa} data-tur={t} data-ton={m.hucreler[t].ton} data-secili={suzgec === t || undefined}>{m.hucreler[t].metin ?? YOK}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tc-sm-not">Duruş: bugünkü toplam; kırmızı ve turuncu, nedeni girilmemiş duruş var demektir. Sayım: makine / operatör. Çevrim: gerçek / rotadaki (sn). Alarm: son 7 günde tekrar eden. Eşikler örnektir; ayardan değişir.</p>
            </details>
          </>
        )}
      </div>
    </Kart>
  );
}
