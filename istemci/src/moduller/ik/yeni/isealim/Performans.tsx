import { useMemo, useState } from 'react';
import { Rozet, Secim, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Performans as PerformansKaydi } from '../tipler.ts';
import { PerformansFormu } from './formlar.tsx';
import { donemler, performansOzeti, performansSonucu, performanslariSuz, puanMetni, puanOrtalamasi } from './kurallar.ts';
import { Baslik, Bolum, Cubuklar, performansKriterleri, Puan } from './parcalar.tsx';

// Performans: dönemsel yetkinlik değerlendirmeleri; liste, sonuç dağılımı, departman ve yetkinlik ortalamaları.
export function PerformansSayfasi(o: IkEkranOzellikleri) {
  const { depo, yetki, motor } = o;
  const [suzgec, suzgecYaz] = useState({ ara: '', donem: '', departman: '' });
  const [form, formYaz] = useState<{ kayit: PerformansKaydi | null } | null>(null);
  const tumu = depo.tur('perf');
  const kisi = (id: string | undefined) => depo.tur('emp').find((p) => p.id === id);
  const ad = (id: string | undefined) => { const p = kisi(id); return p ? adSoyad(p) : ''; };
  const departmanAdi = (empId: string | undefined) => depo.tur('dept').find((d) => d.id === kisi(empId)?.departmanId)?.ad ?? 'Departmansız';
  const liste = useMemo(() => performanslariSuz(tumu, suzgec, kisi, ad), [tumu, suzgec]);
  const ozet = useMemo(() => performansOzeti(liste, performansKriterleri(depo, motor), departmanAdi), [liste, motor]);

  useSayfaKomutlari('ik-performans', yetki.performansYaz ? [{
    anahtar: 'ekle', baslik: 'Değerlendirme ekle', simge: 'plus', aciklama: null, sozcukler: ['performans', 'değerlendirme'], calistir: () => { formYaz({ kayit: null }); },
  }] : null);

  const sutunlar: Sutun<PerformansKaydi>[] = [
    { anahtar: 'kisi', baslik: 'Çalışan', hucre: (x) => <KisiHucresi personel={kisi(x.empId) ?? null} /> },
    { anahtar: 'donem', baslik: 'Dönem', hucre: (x) => x.donem ?? '—' },
    { anahtar: 'deg', baslik: 'Değerlendiren', hucre: (x) => (x.degerlendirenId ? ad(x.degerlendirenId) || '—' : '—') },
    { anahtar: 'ort', baslik: 'Ortalama', kirilmaz: true, hucre: (x) => <Puan deger={puanOrtalamasi(x.skorlar)} /> },
    { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (x) => { const s = performansSonucu(puanOrtalamasi(x.skorlar)); return <Rozet ton={s.ton}>{s.etiket}</Rozet>; } },
    { anahtar: 'tarih', baslik: 'Tarih', hucre: (x) => tarih(x.tarih) },
  ];

  return (
    <div className="tc-ika">
      <Baslik
        baslik="Performans" simge="target"
        alt="Dönemsel yetkinlik değerlendirmeleri, hedefler ve gelişim planları. Kriterleri Ayarlar sayfasından değiştirebilirsiniz."
        dugmeler={yetki.performansYaz ? [{ anahtar: 'ekle', etiket: 'Değerlendirme ekle', simge: 'plus', birincil: true, yap: () => { formYaz({ kayit: null }); } }] : []}
      />
      <Tablo<PerformansKaydi>
        etiket="Performans değerlendirmeleri" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(x) => x.id} bosMesaj="Değerlendirme yok."
        satirSec={yetki.performansYaz ? (x) => { formYaz({ kayit: x }); } : undefined}
        arac={{
          arama: { deger: suzgec.ara, degistir: (ara) => { suzgecYaz({ ...suzgec, ara }); }, etiket: 'Çalışan ara', yerTutucu: 'Çalışan ara' },
          sag: (
            <span className="tc-ika-suzgecler">
              <Secim etiket="Dönem" value={suzgec.donem} bosSecenek="Tüm dönemler" secenekler={donemler(tumu).map((d) => ({ deger: d, baslik: d }))} onChange={(e) => { suzgecYaz({ ...suzgec, donem: e.target.value }); }} />
              <Secim etiket="Departman" value={suzgec.departman} bosSecenek="Tüm departmanlar" secenekler={depo.tur('dept').map((d) => ({ deger: d.id, baslik: d.ad ?? '' }))} onChange={(e) => { suzgecYaz({ ...suzgec, departman: e.target.value }); }} />
            </span>
          ),
        }}
      />
      {liste.length > 0 && (
        <div className="tc-ika-uclu">
          <Bolum baslik="Sonuç dağılımı"><Cubuklar satirlar={ozet.dagilim.map((x) => ({ etiket: x.etiket, deger: x.sayi }))} /></Bolum>
          <Bolum baslik="Departman ortalamaları"><Cubuklar enCok={5} satirlar={ozet.departman.map((x) => ({ etiket: x.etiket, deger: x.deger, metin: puanMetni(x.deger) }))} /></Bolum>
          <Bolum baslik="Yetkinlik ortalamaları"><Cubuklar enCok={5} satirlar={ozet.yetkinlik.map((x) => ({ etiket: x.etiket, deger: x.deger, metin: puanMetni(x.deger) }))} /></Bolum>
        </div>
      )}
      {form && <PerformansFormu o={o} acik kayit={form.kayit} onDolu={{}} kapat={() => { formYaz(null); }} />}
    </div>
  );
}
