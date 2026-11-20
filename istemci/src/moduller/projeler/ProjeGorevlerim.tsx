import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { GorevlerimCevabi, GorevlerimSatiri, GorevlerimTuru } from '#paylasilan/sozlesme/projeler.ts';
import { DurumKutusu, Kart, Rozet, SayiKarti, Sekmeler, Tablo, type Sekme, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GOREV_DURUM_TONU, KADEME_TONU, atamaMetni, bugun, gorevDurumMetni, kademeMetni, tarihMetni } from './gosterim.ts';
import { GorevIlerlemesi, YapanMetni, gorevGecikiyor } from './ProjeGorevleri.tsx';
import './projeler.css';

type Suzgec = 'hepsi' | 'geciken' | GorevlerimTuru;

const TUR_METNI: Record<GorevlerimTuru, string> = {
  bana: 'Bana atanan', rolume: 'Rolüme açık', kontrolumde: 'Kontrolümde', yaptim: 'Kontrol bekleyen işim',
};
// Kontrol bekleyen iş önce gelir: başkasının işi onu bekler.
const SIRA: Record<GorevlerimTuru, number> = { kontrolumde: 0, bana: 1, rolume: 2, yaptim: 3 };

// 3269 a: kişinin bütün açık proje görevleri tek listede. Projeyi okuyamayan kişi de kendi görevini ve projenin kodunu görür.
export function ProjeGorevlerim() {
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const yonlendir = useNavigate();
  const l = useQuery({ queryKey: anahtarlar.gorevlerim, queryFn: () => api.get<GorevlerimCevabi>('/projeler/gorevlerim/liste') });
  const gun = bugun();
  const hepsi = [...(l.data?.gorevler ?? [])].sort((a, b) => SIRA[a.tur] - SIRA[b.tur] || a.planBitis.localeCompare(b.planBitis));
  const say = (t: GorevlerimTuru): number | undefined => (l.data === undefined ? undefined : hepsi.filter((g) => g.tur === t).length);
  // Kutular sekmelerin alt kümesidir: her kutunun aynı adlı sekmesi var.
  const gecikenler = hepsi.filter((g) => g.tur !== 'yaptim' && gorevGecikiyor(g, gun));
  const geciken = l.data === undefined ? undefined : gecikenler.length;
  const satirlar = suzgec === 'hepsi' ? hepsi : suzgec === 'geciken' ? gecikenler : hepsi.filter((g) => g.tur === suzgec);
  const sekmeler: Sekme<Suzgec>[] = [
    { anahtar: 'hepsi', baslik: 'Hepsi' },
    ...(['bana', 'rolume', 'kontrolumde', 'yaptim'] as const).map((t) => ({ anahtar: t, baslik: TUR_METNI[t], sayi: say(t) ?? 0 })),
    { anahtar: 'geciken', baslik: 'Geciken', sayi: geciken ?? 0 },
  ];
  const sutunlar: Sutun<GorevlerimSatiri>[] = [
    { anahtar: 'ad', baslik: 'Görev', hucre: (g) => (
      <span>{g.ad}<span className="tc-prj-soluk"> · {TUR_METNI[g.tur]}</span></span>
    ), csv: (g) => g.ad },
    { anahtar: 'proje', baslik: 'Proje', mono: true, kirilmaz: true, hucre: (g) => <Link to={`/projeler/${g.projeId}`}>{g.projeKod}</Link>, csv: (g) => g.projeKod },
    { anahtar: 'yapan', baslik: 'Yapan', hucre: (g) => <YapanMetni g={g} />, csv: (g) => atamaMetni(g.sorumluAd, g.yapanRolAd) },
    { anahtar: 'kontrol', baslik: 'Kontrol eden', kirilmaz: true, hucre: (g) => atamaMetni(g.kontrolKisiAd, g.kontrolRolAd, 'Yok') },
    { anahtar: 'bitis', baslik: 'Bitiş', mono: true, kirilmaz: true, hucre: (g) => (
      <span className={gorevGecikiyor(g, gun) ? 'tc-prj-gec' : undefined}>{tarihMetni(g.planBitis)}</span>
    ), csv: (g) => g.planBitis },
    { anahtar: 'ilerleme', baslik: 'İlerleme', hucre: (g) => <GorevIlerlemesi g={g} />, csv: (g) => String(g.ilerleme) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (g) => <Rozet ton={GOREV_DURUM_TONU[g.durum]}>{gorevDurumMetni(g)}</Rozet>, csv: gorevDurumMetni },
    ...(hepsi.some((g) => g.kademe !== null) ? [{
      anahtar: 'kademe', baslik: 'Kademe', kirilmaz: true,
      hucre: (g: GorevlerimSatiri) => (g.kademe === null ? null : <Rozet ton={KADEME_TONU[g.kademe] ?? 'bilgi'}>{kademeMetni(g.kademe)}</Rozet>),
      csv: (g: GorevlerimSatiri) => kademeMetni(g.kademe),
    } satisfies Sutun<GorevlerimSatiri>] : []),
  ];

  return (
    <div className="tc-prj-icerik">
      <div className="tc-prj-ozet tc-prj-ozet-dort">
        <SayiKarti baslik="Bana atanan" simge="clipboard-check" sayi={say('bana')} hata={l.isError} />
        <SayiKarti baslik="Rolüme açık" simge="users" sayi={say('rolume')} hata={l.isError} />
        <SayiKarti baslik="Kontrolümde" simge="eye" sayi={say('kontrolumde')} ton="uyari" hata={l.isError} />
        <SayiKarti baslik="Geciken" simge="clock" sayi={geciken} ton="hata" hata={l.isError} />
      </div>
      <Kart baslik="Görevlerim" simge="clipboard-check">
        <div className="tc-prj-icerik">
          <Sekmeler etiket="Görev türü" sekmeler={sekmeler} secili={suzgec} sec={suzgecYaz} />
          {l.isError
            ? <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Görevler alınamadı')} yenile={() => { void l.refetch(); }} />
            : (
              <Tablo
                etiket="Görevlerim"
                sutunlar={sutunlar}
                satirlar={satirlar}
                satirAnahtari={(g) => g.id}
                satirSec={(g) => { void yonlendir(`/proje-gorevlerim/${String(g.id)}`); }}
                yukleniyor={l.isPending}
                bosMesaj="Sana düşen açık proje görevi yok"
              />
            )}
          <p className="tc-prj-soluk">Görev sana ya da rolüne atanınca ve kontrolüne düşünce bildirim gelir.</p>
        </div>
      </Kart>
    </div>
  );
}
