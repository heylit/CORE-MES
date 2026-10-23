import { useMemo, useState } from 'react';
import { CubukListesiKarti, SayfaBasligi, Secim, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { kisaTarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Performans as PerformansKaydi, Personel } from '../tipler.ts';
import { KayitFormu } from './formlar.tsx';
import {
  departmanOrtalamalari, donemler, kriterOrtalamalari, performansSonucu, performansSuz, puanMetni, puanOrtalamasi, sonucDagilimi,
} from './kurallar.ts';
import { MotorlaCiz, Puan, TonluRozet, type Hazirlik } from './ortak.tsx';

type Form = { kayit: PerformansKaydi | null } | null;

export function PerformansEkrani(o: IkEkranOzellikleri) {
  return <MotorlaCiz motor={o.motor}>{(h) => <Govde o={o} h={h} />}</MotorlaCiz>;
}

function Govde({ o, h }: { o: IkEkranOzellikleri; h: Hazirlik }) {
  const { depo, yetki } = o;
  const [suzgec, suzgecYaz] = useState({ donem: '', departman: '', arama: '' });
  const [form, formYaz] = useState<Form>(null);
  const tumu = depo.tur('perf');
  const personel = (id: string | undefined) => (depo.al(id)?.kind === 'emp' ? (depo.al(id) as Personel) : null);
  const liste = useMemo(
    () => performansSuz(tumu, suzgec, (e) => personel(e)?.departmanId, (e) => h.m.adi(e)),
    [tumu, suzgec, h.m],
  );
  const departmanAdi = (e: string | undefined) => {
    const d = depo.al(personel(e)?.departmanId);
    return typeof d?.['ad'] === 'string' ? d['ad'] : '—';
  };

  useSayfaKomutlari('ik-performans', [
    ...(yetki.performansYaz ? [{ anahtar: 'yeni', baslik: 'Değerlendirme ekle', simge: 'plus' as const, aciklama: null, sozcukler: ['performans', 'değerlendirme', 'yeni'], calistir: () => { formYaz({ kayit: null }); } }] : []),
    ...(yetki.performansYaz ? tumu : []).slice(0, 200).map((p) => ({
      anahtar: p.id, baslik: `${h.m.adi(p.empId)}: ${p.donem ?? ''}`, simge: 'chart' as const, aciklama: 'Performans değerlendirmesi',
      sozcukler: [h.m.adi(p.empId), p.donem ?? ''], calistir: () => { formYaz({ kayit: p }); },
    })),
  ]);

  const sutunlar: Sutun<PerformansKaydi>[] = [
    { anahtar: 'calisan', baslik: 'Çalışan', hucre: (p) => <KisiHucresi personel={personel(p.empId)} />, csv: (p) => h.m.adi(p.empId) },
    { anahtar: 'donem', baslik: 'Dönem', hucre: (p) => p.donem ?? '—' },
    { anahtar: 'degerlendiren', baslik: 'Değerlendiren', hucre: (p) => (p.degerlendirenId ? h.m.adi(p.degerlendirenId) : '—') },
    { anahtar: 'ortalama', baslik: 'Ortalama', hizala: 'sag', hucre: (p) => <Puan deger={puanOrtalamasi(p)} />, csv: (p) => puanMetni(puanOrtalamasi(p)) },
    {
      anahtar: 'sonuc', baslik: 'Sonuç', hucre: (p) => { const r = performansSonucu(puanOrtalamasi(p)); return <TonluRozet ton={r.ton}>{r.etiket}</TonluRozet>; },
      csv: (p) => performansSonucu(puanOrtalamasi(p)).etiket,
    },
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (p) => kisaTarih(p.tarih), csv: (p) => p.tarih ?? null },
  ];

  return (
    <div className="tc-ika">
      <SayfaBasligi
        baslik="Performans" simge="chart"
        alt="Dönemsel yetkinlik değerlendirmeleri, hedefler ve gelişim planları. Kriterleri Ayarlar sayfasından değiştirebilirsiniz."
        {...(yetki.performansYaz ? { birincil: { etiket: 'Değerlendirme ekle', simge: 'plus' as const, yap: () => { formYaz({ kayit: null }); } } } : {})}
      />
      <Tablo
        etiket="Performans değerlendirmeleri" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(p) => p.id}
        {...(yetki.performansYaz ? { satirSec: (p: PerformansKaydi) => { formYaz({ kayit: p }); } } : {})} bosMesaj="Değerlendirme yok."
        arac={{
          arama: { deger: suzgec.arama, degistir: (v) => { suzgecYaz({ ...suzgec, arama: v }); }, etiket: 'Çalışan ara', yerTutucu: 'Çalışan ara' },
          csv: { ad: 'performans' },
          sag: (
            <span className="tc-ika-suzgecler">
              <Secim etiket="Dönem" value={suzgec.donem} bosSecenek="Tüm dönemler" secenekler={donemler(tumu).map((d) => ({ deger: d, baslik: d }))} onChange={(e) => { suzgecYaz({ ...suzgec, donem: e.target.value }); }} />
              <Secim etiket="Departman" value={suzgec.departman} bosSecenek="Tüm departmanlar" secenekler={h.m.departmanlar().map((d) => ({ deger: d.id, baslik: d.ad ?? '—' }))} onChange={(e) => { suzgecYaz({ ...suzgec, departman: e.target.value }); }} />
            </span>
          ),
        }}
      />
      {liste.length > 0 && (
        <div className="tc-ika-uclu">
          <CubukListesiKarti baslik="Sonuç dağılımı" simge="chart" satirlar={sonucDagilimi(liste)} />
          <CubukListesiKarti baslik="Departman ortalamaları" simge="building" enUst={5} satirlar={departmanOrtalamalari(liste, departmanAdi).map((d) => ({ etiket: d.etiket, deger: Math.round(d.deger * 100) / 100 }))} />
          <CubukListesiKarti baslik="Yetkinlik ortalamaları" simge="target" enUst={5} satirlar={kriterOrtalamalari(liste, h.m.performansKriterleri()).map((d) => ({ etiket: d.etiket, deger: d.deger === null ? 0 : Math.round(d.deger * 100) / 100 }))} />
        </div>
      )}
      <KayitFormu
        acik={form !== null} kapat={() => { formYaz(null); }} tur="perf" kayit={form?.kayit ?? null}
        baslik={form?.kayit ? `${h.m.adi(form.kayit.empId)}: değerlendirme` : 'Değerlendirme ekle'}
        depo={depo} m={h.m} s={h.s}
      />
    </div>
  );
}
