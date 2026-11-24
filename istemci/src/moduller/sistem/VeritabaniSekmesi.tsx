import type { VtSorguSatiri, VtTabloSatiri } from '#paylasilan/sozlesme/saglik.ts';
import { DurumKutusu, Rozet, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { Kompakt } from './Kompakt.tsx';
import { useVeritabani } from './izleme-sorgusu.ts';
import { sureMetni } from './sure.ts';

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

const SORGU_SUTUNLARI: readonly Sutun<VtSorguSatiri>[] = [
  { anahtar: 'sorgu', baslik: 'Sorgu', hucre: (s) => s.sorgu, mono: true },
  { anahtar: 'cagri', baslik: 'Çağrı', hucre: (s) => SAYI.format(s.cagri), hizala: 'sag' },
  { anahtar: 'toplam', baslik: 'Toplam', hucre: (s) => sureMetni(s.toplamMs / 1000), hizala: 'sag', kirilmaz: true },
  { anahtar: 'ort', baslik: 'Ort.', hucre: (s) => `${SAYI.format(s.ortMs)} ms`, hizala: 'sag', kirilmaz: true },
  { anahtar: 'satir', baslik: 'Satır', hucre: (s) => SAYI.format(s.satir), hizala: 'sag' },
];
const TABLO_SUTUNLARI: readonly Sutun<VtTabloSatiri>[] = [
  { anahtar: 'ad', baslik: 'Tablo', hucre: (t) => t.ad, mono: true },
  { anahtar: 'okunan', baslik: 'Okunan satır', hucre: (t) => SAYI.format(t.okunanSatir), hizala: 'sag', kirilmaz: true },
  { anahtar: 'tam', baslik: 'Tam tarama', hucre: (t) => SAYI.format(t.tamTarama), hizala: 'sag', kirilmaz: true },
  { anahtar: 'dizin', baslik: 'Dizin taraması', hucre: (t) => (t.dizinTaramasi === null ? '—' : SAYI.format(t.dizinTaramasi)), hizala: 'sag', kirilmaz: true },
  { anahtar: 'yazma', baslik: 'Yazma', hucre: (t) => SAYI.format(t.yazma), hizala: 'sag' },
  { anahtar: 'isaret', baslik: 'İşaret', kartTamSatir: true, hucre: (t) => (t.dizinEksikOlabilir ? <Rozet ton="uyari"><Simge ad="alert" boyut="k" /> Dizin eksik olabilir</Rozet> : '—') },
];

const EKLENTI_MESAJI = {
  yok: 'pg_stat_statements eklentisi kurulu değil. Kurulana kadar bu liste gösterilmez (kurulum/yavas-sorgular.md).',
  yetkisiz: 'Yetki eksik: eklenti kurulu ama uygulama hesabı sorgu metinlerini okuyamıyor (pg_read_all_stats gerekir). Kurulum notu: kurulum/yavas-sorgular.md.',
} as const;

export function VeritabaniSekmesi() {
  const q = useVeritabani();
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" hata={q.error} yenile={() => { void q.refetch(); }} />;
  const d = q.data;
  return (
    <div className="tc-izleme-bolumler">
      <section aria-labelledby="tc-izleme-vt-sorgu">
        <h3 id="tc-izleme-vt-sorgu" className="tc-sistem-baslik">En pahalı sorgular <span className="tc-sistem-soluk">toplam süreye göre, ilk {d.enCok}</span></h3>
        {d.eklenti !== 'var' ? <p className="tc-izleme-uyari" role="status"><Simge ad="alert" boyut="k" /> {EKLENTI_MESAJI[d.eklenti]}</p>
          : d.sorgular.length === 0 ? <p>Henüz ölçülen sorgu yok.</p>
            : <><div className="tc-izleme-genis"><Tablo etiket="En pahalı sorgular" sutunlar={SORGU_SUTUNLARI} satirlar={d.sorgular} satirAnahtari={(s) => s.sorgu} /></div>
              <div className="tc-izleme-dar"><Kompakt etiket="En pahalı sorgular" satirlar={d.sorgular.map((s) => ({
                anahtar: s.sorgu, baslik: <span className="mono">{s.sorgu}</span>, ozet: [['Çağrı', SAYI.format(s.cagri)], ['Toplam', sureMetni(s.toplamMs / 1000)], ['Ort.', `${SAYI.format(s.ortMs)} ms`]],
              }))} /></div>
              <p className="tc-sistem-soluk">Sorgu metinleri parametresizdir; değerler maskelenir ve kısaltılır.</p></>}
      </section>
      <section aria-labelledby="tc-izleme-vt-tablo">
        <h3 id="tc-izleme-vt-tablo" className="tc-sistem-baslik">Tablolar <span className="tc-sistem-soluk">okuma, yazma ve tam tarama, ilk {d.enCok}</span></h3>
        {d.tablolar.length === 0 ? <p>Tablo ölçüsü yok.</p>
          : <>
            <div className="tc-izleme-genis"><Tablo etiket="Tablolar" sutunlar={TABLO_SUTUNLARI} satirlar={d.tablolar} satirAnahtari={(t) => t.ad} /></div>
            <div className="tc-izleme-dar"><Kompakt etiket="Tablolar" satirlar={d.tablolar.map((t) => ({
              anahtar: t.ad, baslik: <span className="mono">{t.ad}</span>,
              ozet: [['Okunan', SAYI.format(t.okunanSatir)], ['Tam tarama', SAYI.format(t.tamTarama)], ['Dizin', t.dizinTaramasi === null ? '—' : SAYI.format(t.dizinTaramasi)], ['Yazma', SAYI.format(t.yazma)]],
              ...(t.dizinEksikOlabilir ? { not: <Rozet ton="uyari"><Simge ad="alert" boyut="k" /> Dizin eksik olabilir</Rozet> } : {}),
            }))} /></div>
          </>}
        <p className="tc-sistem-soluk">"Dizin eksik olabilir": tam tarama dizin taramasından çok fazla (en az 1.000 satır ve 100 tarama). Kesin hüküm değildir.</p>
      </section>
    </div>
  );
}
