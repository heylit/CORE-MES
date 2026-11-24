import { useState } from 'react';
import type { PlanHesapTuruDurumu, SuAnCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { Dugme, DurumKutusu, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { PLAN_TURU_ADI, kisaSure, suAnKutulari } from './izleme-yorumu.ts';
import { useSuAn } from './izleme-sorgusu.ts';
import { Kompakt } from './Kompakt.tsx';
import { KutuSirasi } from './KutuSirasi.tsx';
import { sureMetni } from './sure.ts';

type SurenIstek = SuAnCevabi['surenIstekler'][number];
type Kilit = SuAnCevabi['kilitler'][number];

const ISTEK_SUTUNLARI: readonly Sutun<SurenIstek>[] = [
  { anahtar: 'adres', baslik: 'İstek', hucre: (i) => `${i.yontem} ${i.adres}`, mono: true },
  { anahtar: 'kisi', baslik: 'Kişi no', hucre: (i) => i.kisiId ?? '—', hizala: 'sag' },
  { anahtar: 'sure', baslik: 'Süre', hucre: (i) => sureMetni(i.sureSn), hizala: 'sag', kirilmaz: true },
];
const PLAN_SUTUNLARI: readonly Sutun<PlanHesapTuruDurumu>[] = [
  { anahtar: 'tur', baslik: 'Hesap', hucre: (p) => PLAN_TURU_ADI[p.tur] },
  { anahtar: 'calisan', baslik: 'Çalışan', hucre: (p) => p.calisan, hizala: 'sag' },
  { anahtar: 'biten', baslik: 'Biten', hucre: (p) => p.biten, hizala: 'sag' },
  { anahtar: 'zamanAsimi', baslik: 'Zaman aşımı', hucre: (p) => p.zamanAsimi, hizala: 'sag' },
  { anahtar: 'bellekAsimi', baslik: 'Bellek aşımı', hucre: (p) => p.bellekAsimi, hizala: 'sag' },
  { anahtar: 'hata', baslik: 'Hata', hucre: (p) => p.hata, hizala: 'sag' },
  { anahtar: 'son', baslik: 'Son süre', hucre: (p) => (p.sonSureMs === null ? '—' : kisaSure(p.sonSureMs)), hizala: 'sag', kirilmaz: true },
];
const KILIT_SUTUNLARI: readonly Sutun<Kilit>[] = [
  { anahtar: 'sorgu', baslik: 'Bekleyen sorgu', hucre: (k) => k.sorgu, mono: true },
  { anahtar: 'bekleten', baslik: 'Bekleten işlem no', hucre: (k) => k.bekletenIslem, hizala: 'sag' },
  { anahtar: 'sure', baslik: 'Bekleme', hucre: (k) => sureMetni(k.beklemeSn), hizala: 'sag', kirilmaz: true },
];

const saatMetni = (iso: string): string => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function SuAnSekmesi() {
  const [duraklat, duraklatYaz] = useState(false);
  const s = useSuAn(!duraklat);
  if (s.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (s.isError) return <DurumKutusu durum="hata" hata={s.error} yenile={() => { void s.refetch(); }} />;
  const d = s.data;
  const planCalisan = d.planHesaplari.filter((p) => p.calisan > 0);
  return (
    <div className="tc-izleme-bolumler">
      <div className="tc-izleme-arac">
        <p className="tc-sistem-soluk" role="status">{duraklat ? 'Yenileme durdu' : '5 saniyede bir yenilenir'} · Son okuma {saatMetni(d.an)}</p>
        <Dugme tur="ikincil" simge={duraklat ? 'play' : 'pause'} onClick={() => { duraklatYaz(!duraklat); }}>{duraklat ? 'Sürdür' : 'Duraklat'}</Dugme>
      </div>
      <KutuSirasi etiket="Şu anki durum" kutular={suAnKutulari(d)} />
      <section aria-labelledby="tc-izleme-suren">
        <h3 id="tc-izleme-suren" className="tc-sistem-baslik">Süren istekler</h3>
        {d.surenIstekler.length === 0 ? <p className="tc-sistem-soluk">Şu an işlenen istek yok.</p>
          : <Tablo etiket="Süren istekler" sutunlar={ISTEK_SUTUNLARI} satirlar={d.surenIstekler} satirAnahtari={(i) => `${i.yontem} ${i.adres} ${String(i.kisiId)} ${String(i.sureSn)}`} />}
      </section>
      <section aria-labelledby="tc-izleme-plan">
        <h3 id="tc-izleme-plan" className="tc-sistem-baslik">Plan hesapları</h3>
        {planCalisan.length === 0 && <p className="tc-sistem-soluk">Şu an çalışan plan hesabı yok.</p>}
        <div className="tc-izleme-genis"><Tablo etiket="Plan hesapları" sutunlar={PLAN_SUTUNLARI} satirlar={d.planHesaplari} satirAnahtari={(p) => p.tur} /></div>
        <div className="tc-izleme-dar">
          <Kompakt etiket="Plan hesapları" satirlar={d.planHesaplari.map((p) => ({
            anahtar: p.tur, baslik: PLAN_TURU_ADI[p.tur], ozet: [['Çalışan', p.calisan], ['Biten', p.biten], ['Son süre', p.sonSureMs === null ? '—' : kisaSure(p.sonSureMs)]],
            not: p.zamanAsimi + p.bellekAsimi + p.hata === 0 ? 'Sorun yok' : `${String(p.zamanAsimi)} zaman aşımı · ${String(p.bellekAsimi)} bellek aşımı · ${String(p.hata)} hata`,
          }))} />
        </div>
        <p className="tc-sistem-soluk">Sunucu sayacından gelir (bellekte tutulur, sunucu yeniden açılınca sıfırlanır); tür başına toplamdır, hesap tek tek, kişisiyle ve belleğiyle izlenmez.</p>
      </section>
      <section aria-labelledby="tc-izleme-kilit">
        <h3 id="tc-izleme-kilit" className="tc-sistem-baslik">Kilit bekleyenler</h3>
        {d.kilitler.length === 0 ? <p className="tc-sistem-soluk">Kilit bekleyen işlem yok.</p>
          : <Tablo etiket="Kilit bekleyenler" sutunlar={KILIT_SUTUNLARI} satirlar={d.kilitler} satirAnahtari={(k) => `${String(k.bekletenIslem)} ${k.sorgu}`} />}
      </section>
    </div>
  );
}
