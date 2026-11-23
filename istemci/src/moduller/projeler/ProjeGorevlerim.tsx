import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { GorevlerimCevabi, GorevlerimSatiri, GorevlerimTuru } from '#paylasilan/sozlesme/projeler.ts';
import { DurumKutusu, KademeRozeti, Kart, Rozet, SayiKarti, Sekmeler, Tablo, kademeMetni, type Sekme, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GOREV_DURUM_TONU, atamaMetni, bugun, gorevDurumMetni, hazirlikEmriNo, tarihMetni } from './gosterim.ts';
import { useTopluIptal } from './GorevIptalPenceresi.tsx';
import { GorevIlerlemesi, YapanMetni, gorevGecikiyor } from './ProjeGorevleri.tsx';
import { useIslemVar } from './komut.ts';
import { GOREV_ISLEMI } from './gosterim.ts';
import './projeler.css';

const GRUP_ANAHTARI = 'tmi.gorevlerim.emre-grupla';
const grupTercihi = (): boolean => {
  try { return window.localStorage.getItem(GRUP_ANAHTARI) !== '0'; } catch { return true; }
};
const grupTercihiYaz = (acik: boolean): void => {
  try { window.localStorage.setItem(GRUP_ANAHTARI, acik ? '1' : '0'); } catch { /* saklanamazsa seçim bu oturumda kalır */ }
};

type Suzgec = 'hepsi' | 'geciken' | GorevlerimTuru;

const TUR_METNI: Record<GorevlerimTuru, string> = {
  bana: 'Bana atanan', rolume: 'Rolüme açık', kontrolumde: 'Kontrolümde', yaptim: 'Kontrol bekleyen işim',
};
// Kontrol bekleyen iş önce gelir: başkasının işi onu bekler.
const SIRA: Record<GorevlerimTuru, number> = { kontrolumde: 0, bana: 1, rolume: 2, yaptim: 3 };

// 3269 a: kişinin bütün açık proje görevleri tek listede. Projeyi okuyamayan kişi de kendi görevini ve projenin kodunu görür.
export function ProjeGorevlerim() {
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [emreGore, emreGoreYaz] = useState(grupTercihi);
  const yonlendir = useNavigate();
  const l = useQuery({ queryKey: anahtarlar.gorevlerim, queryFn: () => api.get<GorevlerimCevabi>('/projeler/gorevlerim/liste') });
  const gun = bugun();
  const yazar = useIslemVar(GOREV_ISLEMI);
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
  const { toplu, pencere: iptalPenceresi } = useTopluIptal(
    hepsi,
    (g) => ({ id: g.id, ad: g.ad, durum: g.durum, surum: g.surum, projeKod: g.projeKod, hazirlik: g.hazirlikMaddesi !== null }),
    yazar,
  );
  // 3611: hazırlık görevleri emre göre tek başlık altında toplanır; seçim yalnız birden çok emir varken sorulur.
  const emirler = new Set(hepsi.flatMap((g) => hazirlikEmriNo(g) ?? []));
  const grupluMu = emreGore || emirler.size < 2;
  // Sütun kümesi liste içeriğine göre oynamaz: gruplu görünümde en az bir hazırlık görevi varsa sade düzen açıktır; hazırlık dışı görevde proje kodu
  // Görev hücresinde soluk metindir.
  const sade = grupluMu && satirlar.some((g) => hazirlikEmriNo(g) !== null);
  const sutunlar: Sutun<GorevlerimSatiri>[] = [
    { anahtar: 'ad', baslik: 'Görev', hucre: (g) => (
      <span>{g.ad}{sade && hazirlikEmriNo(g) === null && <span className="tc-prj-soluk"> · {g.projeKod}</span>}<span className="tc-prj-soluk"> · {TUR_METNI[g.tur]}</span></span>
    ), csv: (g) => g.ad },
    // Emre göre gruplu hazırlık listesinde proje başlıkta, yapan ve kontrol tek sütundadır: dar ekranda kart kısalır.
    ...(sade ? [] : [{ anahtar: 'proje', baslik: 'Proje', mono: true, kirilmaz: true, hucre: (g: GorevlerimSatiri) => <Link to={`/projeler/${g.projeId}`}>{g.projeKod}</Link>, csv: (g: GorevlerimSatiri) => g.projeKod } satisfies Sutun<GorevlerimSatiri>]),
    ...(sade
      ? [{ anahtar: 'yapan', baslik: 'Yapan · kontrol', hucre: (g: GorevlerimSatiri) => (
        <span><YapanMetni g={g} />{(g.kontrolKisiAd !== null || g.kontrolRolAd !== null) && <span className="tc-prj-soluk"> · kontrol {atamaMetni(g.kontrolKisiAd, g.kontrolRolAd)}</span>}</span>
      ), csv: (g: GorevlerimSatiri) => atamaMetni(g.sorumluAd, g.yapanRolAd) } satisfies Sutun<GorevlerimSatiri>]
      : [
        { anahtar: 'yapan', baslik: 'Yapan', hucre: (g: GorevlerimSatiri) => <YapanMetni g={g} />, csv: (g: GorevlerimSatiri) => atamaMetni(g.sorumluAd, g.yapanRolAd) } satisfies Sutun<GorevlerimSatiri>,
        { anahtar: 'kontrol', baslik: 'Kontrol eden', kirilmaz: true, hucre: (g: GorevlerimSatiri) => atamaMetni(g.kontrolKisiAd, g.kontrolRolAd, 'Yok') } satisfies Sutun<GorevlerimSatiri>,
      ]),
    { anahtar: 'bitis', baslik: 'Bitiş', mono: true, kirilmaz: true, hucre: (g) => (
      <span className={gorevGecikiyor(g, gun) ? 'tc-prj-gec' : undefined}>{tarihMetni(g.planBitis)}</span>
    ), csv: (g) => g.planBitis },
    { anahtar: 'ilerleme', baslik: 'İlerleme', hucre: (g) => <GorevIlerlemesi g={g} />, csv: (g) => String(g.ilerleme) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (g) => (g.adimToplam > 0 && g.adimYapilan === g.adimToplam && (g.durum === 'yapilacak' || g.durum === 'suruyor')
      ? <Rozet ton="bilgi">Adımlar tamam</Rozet>
      : <Rozet ton={GOREV_DURUM_TONU[g.durum]}>{gorevDurumMetni(g)}</Rozet>), csv: gorevDurumMetni },
    ...(hepsi.some((g) => g.kademe !== null) ? [{
      anahtar: 'kademe', baslik: 'Kademe', kirilmaz: true,
      hucre: (g: GorevlerimSatiri) => (g.kademe === null ? null : <KademeRozeti kademe={g.kademe} />),
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
          {emirler.size > 1 && (
            <label className="tc-prj-grup-secim">
              <input type="checkbox" checked={emreGore} onChange={(e) => { emreGoreYaz(e.target.checked); grupTercihiYaz(e.target.checked); }} /> Emre göre grupla
            </label>
          )}
          {l.isError
            ? <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Görevler alınamadı')} yenile={() => { void l.refetch(); }} />
            : (
              <div className="tc-prj-gruplu"><Tablo
                etiket="Görevlerim"
                sutunlar={sutunlar}
                satirlar={satirlar}
                satirAnahtari={(g) => g.id}
                satirSec={(g) => { void yonlendir(`/proje-gorevlerim/${String(g.id)}`); }}
                {...(grupluMu ? { grup: {
                  yol: (g: GorevlerimSatiri) => { const no = hazirlikEmriNo(g); return no === null ? [] : [no]; },
                  baslik: (yol: readonly string[]) => {
                    const ic = satirlar.filter((g) => hazirlikEmriNo(g) === yol[0]);
                    const gec = ic.filter((g) => g.tur !== 'yaptim' && gorevGecikiyor(g, gun)).length;
                    const bekleyen = ic.filter((g) => g.durum === 'kontrolde').length;
                    const isEmri = Math.max(0, ...ic.map((g) => g.adimToplam));
                    return (
                      <span>{yol[0]} <span className="tc-prj-soluk">· {ic[0]?.projeKod} · {ic.length} görev{isEmri > 1 ? ` · ${String(isEmri)} iş emri` : ''}{gec > 0 ? ` · ${String(gec)} geciken` : ''}{bekleyen > 0 ? ` · ${String(bekleyen)} kontrol bekliyor` : ''}</span></span>
                    );
                  },
                } } : {})}
                yukleniyor={l.isPending}
                {...(toplu === undefined ? {} : { toplu })}
                bosMesaj="Sana düşen açık proje görevi yok"
              /></div>
            )}
          <p className="tc-prj-soluk">Görev sana ya da rolüne atanınca ve kontrolüne düşünce bildirim gelir.</p>
          {iptalPenceresi}
        </div>
      </Kart>
    </div>
  );
}
