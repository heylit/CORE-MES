import { useEffect, useId, useState, type FormEvent } from 'react';
import type {
  Gorev, GorevDurumu, GorevEkleGovdesi, GorevGuncelleGovdesi, ProjeYonetimiCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { useNavigate } from 'react-router-dom';
import { CokSatir, Dugme, Girdi, IsaretKutusu, Kart, Menu, Pencere, Rozet, Secim, Tablo, type MenuOgesi, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import {
  GOREV_DURUMLARI, GOREV_DURUM_METNI, GOREV_DURUM_TONU, GOREV_ISLEMI, atamaMetni, bugun, gorevDurumMetni, gunFarki, sapmaMetni, tarihMetni,
} from './gosterim.ts';
import { AtamaSecimi, YAPAN_IPUCU, atamaCoz, atamaDegeri, useAtamaSecenekleri } from './Atama.tsx';
import { bosIseNull, sayiYaDaNull, useIslemVar, useYonetimKomutu } from './komut.ts';
import { ProjeHazirlik } from './ProjeHazirlik.tsx';

// Bitiş sapması: biten görevde gerçek bitiş, açık görevde bugün plan bitişini geçtiyse bugün; iptal edilen görevde yoktur.
// CSV'de tür ayrı sütun değil, adın önekidir: ekrandaki rozetle aynı ayrım.
export const gorevCsvAdi = (g: Gorev): string => g.hazirlikMaddesi === null ? g.ad : `Emir görevi: ${g.ad}`;

export function gorevSapmasi(g: Gorev, bugunTarihi: string): number | null {
  if (g.durum === 'iptal') return null;
  if (g.gercekBitis !== null) return gunFarki(g.planBitis, g.gercekBitis);
  return bugunTarihi > g.planBitis ? gunFarki(g.planBitis, bugunTarihi) : null;
}
// 3444 a: tablo kayan sütunlara sığsın diye bu yılın tarihi yılsız yazılır; CSV tam tarihi taşır.
const kisaTarih = (t: string | null, yil: string): string => (t !== null && t.startsWith(yil) ? tarihMetni(t).slice(0, 5) : tarihMetni(t));
export const gorevGecikiyor = (g: Gorev, bugunTarihi: string): boolean =>
  g.durum !== 'bitti' && g.durum !== 'iptal' && bugunTarihi > g.planBitis;

export function Ilerleme({ deger }: { deger: number | null }) {
  if (deger === null) return <span className="tc-prj-soluk">—</span>;
  return (
    <span className="tc-prj-ilerleme">
      <progress max={100} value={deger} aria-hidden="true" />
      <span>%{deger}</span>
    </span>
  );
}

type Gorunum = 'tablo' | 'matris' | 'pano';

// 3444 a: geniş ekranda Görevler sayfasının sol listesi tabloyu daraltır; orada tablo kart kipine dönmez, kendi kabında kayar.
// Dar ekranda (tablet, telefon) satır kartları kalır. Eşik projeler.css'teki sol liste eşiğiyle aynıdır.
const GENIS = '(min-width: 1024px)';
function useGenisEkran(): boolean {
  const sor = () => (typeof window.matchMedia === 'function' ? window.matchMedia(GENIS) : null);
  const [genis, genisYaz] = useState(() => sor()?.matches ?? false);
  useEffect(() => {
    const medya = sor();
    if (!medya) return undefined;
    const degisti = () => { genisYaz(medya.matches); };
    medya.addEventListener('change', degisti);
    return () => { medya.removeEventListener('change', degisti); };
  }, []);
  return genis;
}

// Tek görev şablonu: şablon satırı ya proje başına bir kez ya da her üretim emri için (maddeye bağlı) açılır; ikincisi listede
// "Emir görevi" rozetiyle ayrılır. "Emir × madde" görünümü onları emir ve madde tablosunda, maddenin sistemdeki hâliyle gösterir.
export function ProjeGorevleri({ projeId, yonetim, acik, emirleriGorur }: {
  projeId: number; yonetim: ProjeYonetimiCevabi; acik: boolean; emirleriGorur: boolean;
}) {
  const yazabilir = useIslemVar(GOREV_ISLEMI) && acik;
  const [secilenGorunum, gorunumYaz] = useState<Gorunum>('tablo');
  const gorunum = secilenGorunum === 'matris' && !emirleriGorur ? 'tablo' : secilenGorunum;
  const [form, formYaz] = useState<Gorev | 'yeni' | null>(null);
  const yonlendir = useNavigate();
  // Görevsiz projede şerit dağıt düğmesini taşır; araç çubuğunda ikincisi çıkmaz.
  const seritVar = yazabilir && yonetim.gorevler.length === 0;
  const dagitaGit = () => { void yonlendir(`/projeler/${String(projeId)}/gorev-dagit`); };
  // 3444: dar ekranda yalnız "Görev ekle" açıkta; öteki işlem bu menüde.
  const digerleri: MenuOgesi[] = [
    ...(yazabilir && !seritVar ? [{ anahtar: 'dagit', baslik: 'Görevleri dağıt', simge: 'users', sec: dagitaGit } satisfies MenuOgesi] : []),
  ];
  const gun = bugun();
  const genis = useGenisEkran();
  const yil = gun.slice(0, 4);
  const taslar = new Map(yonetim.kilometreTaslari.map((t) => [t.id, t.ad]));
  // 3458 (1 b): satır görevin kendi sayfasını açar (içerik, akış düğmeleri, düzenleme ve geçmiş orada).
  const sec = (g: Gorev) => { void yonlendir(`/proje-gorevlerim/${String(g.id)}`); };

  const sutunlar: Sutun<Gorev>[] = [
    { anahtar: 'ad', baslik: 'Görev', hucre: (g) => (
      <span>
        {g.hazirlikMaddesi !== null && <><Rozet ton="bilgi">Emir görevi</Rozet>{' '}</>}
        {g.ad}
        {g.kilometreTasiId !== null && <span className="tc-prj-soluk"> · {taslar.get(g.kilometreTasiId) ?? '—'}</span>}
        {g.asama !== null && <span className="tc-prj-soluk"> · {g.asama}</span>}
      </span>
    ), csv: gorevCsvAdi },
    { anahtar: 'yapan', baslik: 'Yapan', hucre: (g) => <YapanMetni g={g} />, csv: (g) => atamaMetni(g.sorumluAd, g.yapanRolAd) },
    { anahtar: 'kontrol', baslik: 'Kontrol eden', hucre: (g) => atamaMetni(g.kontrolKisiAd, g.kontrolRolAd, 'Yok') },
    { anahtar: 'plan', baslik: 'Plan', mono: true, hucre: (g) => `${kisaTarih(g.planBaslangic, yil)} – ${kisaTarih(g.planBitis, yil)}`, csv: (g) => `${tarihMetni(g.planBaslangic)} – ${tarihMetni(g.planBitis)}` },
    { anahtar: 'gercek', baslik: 'Gerçekleşen', mono: true, hucre: (g) => (
      g.gercekBaslangic === null ? '—' : `${kisaTarih(g.gercekBaslangic, yil)} – ${kisaTarih(g.gercekBitis, yil)}`
    ), csv: (g) => (g.gercekBaslangic === null ? '—' : `${tarihMetni(g.gercekBaslangic)} – ${tarihMetni(g.gercekBitis)}`) },
    { anahtar: 'sapma', baslik: 'Sapma', mono: true, kirilmaz: true, hizala: 'sag', hucre: (g) => {
      const s = gorevSapmasi(g, gun);
      return <span className={s !== null && s > 0 ? 'tc-prj-gec' : undefined}>{sapmaMetni(s)}</span>;
    } },
    { anahtar: 'ilerleme', baslik: 'İlerleme', hucre: (g) => <GorevIlerlemesi g={g} />, csv: (g) => String(g.ilerleme) },
    { anahtar: 'durum', baslik: 'Durum', sabit: 'sag', hucre: (g) => <Rozet ton={GOREV_DURUM_TONU[g.durum]}>{gorevDurumMetni(g)}</Rozet>, csv: gorevDurumMetni },
  ];

  return (
    <Kart baslik="Görevler" simge="list">
      {seritVar && (
        <div className="tc-prj-dagit-serit" role="note">
          <span>Bu projeye henüz görev dağıtılmadı. Şablonu seç, yapan ve kontrol edeni ata, bu işe özel görev ekle.</span>
          <Dugme tur="birincil" simge="users" onClick={dagitaGit}>Görevleri dağıt</Dugme>
        </div>
      )}
      <div className="tc-prj-gorunum">
        <div className="tc-prj-secici" role="group" aria-label="Görünüm">
          <Dugme simge="list" aria-pressed={gorunum === 'tablo'} onClick={() => { gorunumYaz('tablo'); }}>Liste</Dugme>
          {emirleriGorur && <Dugme simge="grid" aria-pressed={gorunum === 'matris'} onClick={() => { gorunumYaz('matris'); }}>Emir × madde</Dugme>}
          <Dugme simge="gantt" aria-pressed={gorunum === 'pano'} onClick={() => { gorunumYaz('pano'); }}>Pano</Dugme>
        </div>
        <div className="tc-prj-eylemler">
          {yazabilir && !seritVar && <span className="tc-prj-genis"><Dugme simge="users" onClick={dagitaGit}>Görevleri dağıt</Dugme></span>}
          {digerleri.length > 0 && <span className="tc-prj-dar"><Menu etiket="Diğer görev işlemleri" metin="Diğer" ogeler={digerleri} /></span>}
          {yazabilir && <Dugme simge="plus" onClick={() => { formYaz('yeni'); }}>Görev ekle</Dugme>}
        </div>
      </div>
      {gorunum === 'matris' && <ProjeHazirlik projeId={projeId} />}
      {gorunum === 'matris' ? null : gorunum === 'tablo'
        ? (
          <Tablo
            etiket="Projenin görevleri"
            {...(genis ? { kip: 'kaydir' as const } : {})}
            sutunlar={sutunlar}
            satirlar={yonetim.gorevler}
            satirAnahtari={(g) => g.id}
            satirSec={sec}
            bosMesaj="Bu projede görev yok"
          />
        )
        : <GorevPanosu gorevler={yonetim.gorevler} gun={gun} sec={sec} />}
      {form !== null && (
        <GorevFormu projeId={projeId} yonetim={yonetim} gorev={form === 'yeni' ? null : form} kapat={() => { formYaz(null); }} />
      )}
    </Kart>
  );
}

function GorevPanosu({ gorevler, gun, sec }: { gorevler: readonly Gorev[]; gun: string; sec: (g: Gorev) => void }) {
  if (gorevler.length === 0) return <p className="tc-prj-soluk">Bu projede görev yok</p>;
  return (
    <div className="tc-prj-pano">
      {GOREV_DURUMLARI.map((d) => {
        const sutun = gorevler.filter((g) => g.durum === d);
        return (
          <section key={d} className="tc-prj-pano-sutun" aria-label={GOREV_DURUM_METNI[d]}>
            <h3>{GOREV_DURUM_METNI[d]} ({sutun.length})</h3>
            {sutun.map((g) => {
              const icerik = (
                <>
                  <strong>{g.ad}</strong>
                  {g.hazirlikMaddesi !== null && <Rozet ton="bilgi">Emir görevi</Rozet>}
                  <span className="tc-prj-soluk">{atamaMetni(g.sorumluAd, g.yapanRolAd, 'Atanmadı')} · {tarihMetni(g.planBitis)}</span>
                  {g.onaylandi && <span className="tc-prj-soluk">Onaylandı</span>}
                  {gorevGecikiyor(g, gun) && <span className="tc-prj-gec">Gecikiyor</span>}
                  <Ilerleme deger={g.ilerleme} />
                </>
              );
              return <button key={g.id} type="button" className="tc-prj-pano-kart" onClick={() => { sec(g); }}>{icerik}</button>;
            })}
          </section>
        );
      })}
    </div>
  );
}

// "Kontrolde" yalnız akışla gelinir (yapan "Bitti" der); düzenlemede seçenek olarak yalnız görev zaten kontroldeyse durur.
const KONTROLDE_IPUCU = 'Kontrol bekliyor: önce onaylanmalı ya da geri gönderilmeli.';
const durumSecenekleri = (mevcut: GorevDurumu | undefined) => GOREV_DURUMLARI
  .filter((d) => d !== 'kontrolde' || mevcut === 'kontrolde')
  .map((d) => ({ deger: d, baslik: GOREV_DURUM_METNI[d] }));

// 3458: rol görevinde kimin üstlendiği listede de görünür; adımı olan görevde ilerlemenin yanında adım sayısı ve kanıt zorunluluğu.
export function YapanMetni({ g }: { g: Pick<Gorev, 'sorumluAd' | 'yapanRolAd'> }) {
  if (g.yapanRolAd === null) return <>{atamaMetni(g.sorumluAd, null)}</>;
  return <span>{atamaMetni(null, g.yapanRolAd)} <span className="tc-prj-soluk">· {g.sorumluAd === null ? 'üstlenen yok' : `üstlenen ${g.sorumluAd}`}</span></span>;
}
export function GorevIlerlemesi({ g }: { g: Pick<Gorev, 'ilerleme' | 'adimToplam' | 'adimYapilan' | 'kanitZorunlu'> }) {
  return (
    <span className="tc-prj-ilerleme-hucre">
      <Ilerleme deger={g.ilerleme} />
      {(g.adimToplam > 0 || g.kanitZorunlu) && (
        <span className="tc-prj-soluk">
          {[g.adimToplam > 0 ? `${String(g.adimYapilan)}/${String(g.adimToplam)} adım` : null, g.kanitZorunlu ? 'kanıt ister' : null].filter(Boolean).join(' · ')}
        </span>
      )}
    </span>
  );
}

export function GorevFormu({ projeId, yonetim, gorev, kapat }: {
  projeId: number; yonetim: ProjeYonetimiCevabi; gorev: Gorev | null; kapat: () => void;
}) {
  const kimlik = useId();
  const [ad, adYaz] = useState(gorev?.ad ?? '');
  const [tasId, tasYaz] = useState(gorev?.kilometreTasiId == null ? '' : String(gorev.kilometreTasiId));
  const [yapan, yapanYaz] = useState(gorev === null ? '' : atamaDegeri({ kisiId: gorev.sorumluKisiId, rolId: gorev.yapanRolId }));
  const [kontrol, kontrolYaz] = useState(gorev === null ? '' : atamaDegeri({ kisiId: gorev.kontrolKisiId, rolId: gorev.kontrolRolId }));
  const [yedek, yedekYaz] = useState(gorev === null ? '' : atamaDegeri({ kisiId: gorev.yedekKontrolKisiId, rolId: gorev.yedekKontrolRolId }));
  const [asama, asamaYaz] = useState(gorev?.asama ?? '');
  const [planBaslangic, planBaslangicYaz] = useState(gorev?.planBaslangic ?? '');
  const [planBitis, planBitisYaz] = useState(gorev?.planBitis ?? '');
  const [oncekiId, oncekiYaz] = useState(gorev?.oncekiGorevId == null ? '' : String(gorev.oncekiGorevId));
  const [aciklama, aciklamaYaz] = useState(gorev?.aciklama ?? '');
  const [gercekBaslangic, gercekBaslangicYaz] = useState(gorev?.gercekBaslangic ?? '');
  const [gercekBitis, gercekBitisYaz] = useState(gorev?.gercekBitis ?? '');
  const [ilerleme, ilerlemeYaz] = useState(gorev === null ? '0' : String(gorev.ilerleme));
  const [durum, durumYaz] = useState<GorevDurumu>(gorev?.durum ?? 'yapilacak');
  const [kanitZorunlu, kanitZorunluYaz] = useState(gorev?.kanitZorunlu ?? false);
  // Sunucu da reddeder (409): kontrolde bekleyen görevin kontrol edeni iş bittikten sonra seçilmez.
  const kontrolKilitli = gorev?.durum === 'kontrolde';
  const atamalar = useAtamaSecenekleri();
  const tasSecenekleri = yonetim.kilometreTaslari
    .filter((t) => t.etkin || t.id === gorev?.kilometreTasiId)
    .map((t) => ({ deger: String(t.id), baslik: t.ad }));
  const oncekiSecenekleri = yonetim.gorevler.filter((g) => g.id !== gorev?.id).map((g) => ({ deger: String(g.id), baslik: g.ad }));

  const komut = useYonetimKomutu<GorevEkleGovdesi | GorevGuncelleGovdesi>(
    projeId,
    (govde, istekKimligi) => (gorev === null
      ? api.post(`/projeler/${projeId}/gorevler`, govde, { istekKimligi })
      : api.post(`/projeler/gorevler/${gorev.id}/guncelle`, govde)),
    kapat,
  );
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    const y = atamaCoz(yapan);
    const k = atamaCoz(kontrol);
    const yd = k.kisiId === null && k.rolId === null ? atamaCoz('') : atamaCoz(yedek);
    const plan = {
      kilometreTasiId: sayiYaDaNull(tasId),
      ad,
      aciklama: bosIseNull(aciklama),
      sorumluKisiId: y.kisiId,
      planBaslangic,
      planBitis,
      oncekiGorevId: sayiYaDaNull(oncekiId),
      asama: bosIseNull(asama),
      yapanRolId: y.rolId,
      kontrolKisiId: k.kisiId,
      kontrolRolId: k.rolId,
      yedekKontrolKisiId: yd.kisiId,
      yedekKontrolRolId: yd.rolId,
      kanitZorunlu,
    };
    komut.mutate(gorev === null ? plan satisfies GorevEkleGovdesi : {
      ...plan,
      gercekBaslangic: gercekBaslangic === '' ? null : gercekBaslangic,
      gercekBitis: gercekBitis === '' ? null : gercekBitis,
      ilerleme: durum === 'bitti' ? 100 : Number(ilerleme),
      durum,
      surum: gorev.surum,
    } satisfies GorevGuncelleGovdesi);
  };

  return (
    <Pencere
      acik
      kapat={kapat}
      tur="yan"
      baslik={gorev === null ? 'Yeni görev' : `Görev: ${gorev.ad}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Girdi etiket="Görev adı" required value={ad} maxLength={200} onChange={(e) => { adYaz(e.target.value); }} />
        </div>
        <Secim etiket="Kilometre taşı" value={tasId} bosSecenek="Bağlı değil" secenekler={tasSecenekleri} onChange={(e) => { tasYaz(e.target.value); }} />
        <Girdi etiket="Aşama" value={asama} maxLength={80} ipucu="Görevler listede aşamaya göre okunur." onChange={(e) => { asamaYaz(e.target.value); }} />
        <AtamaSecimi
          etiket="Yapan" deger={yapan} ad={gorev === null ? null : atamaMetni(gorev.sorumluAd, gorev.yapanRolAd)} secenekler={atamalar.secenekler}
          hata={atamalar.hata} bos="Atanmadı" ipucu={YAPAN_IPUCU} degistir={yapanYaz}
        />
        <AtamaSecimi
          etiket="Kontrol eden" deger={kontrol} ad={gorev === null ? null : atamaMetni(gorev.kontrolKisiAd, gorev.kontrolRolAd)}
          secenekler={atamalar.secenekler} hata={atamalar.hata} bos="Yok" kilitli={kontrolKilitli}
          ipucu={kontrolKilitli ? KONTROLDE_IPUCU : 'Seçilirse görev onayla biter; yapan kendi işini onaylayamaz.'} degistir={kontrolYaz}
        />
        {kontrol !== '' && (
          <AtamaSecimi
            etiket="Yedek kontrol eden" deger={yedek} ad={gorev === null ? null : atamaMetni(gorev.yedekKontrolKisiAd, gorev.yedekKontrolRolAd)}
            secenekler={atamalar.secenekler} hata={atamalar.hata} bos="Yok" kilitli={kontrolKilitli}
            ipucu={kontrolKilitli ? KONTROLDE_IPUCU : 'Kontrol 2 gün bekler ya da kontrol eden işi yapan kişiyse yedek onaylar.'} degistir={yedekYaz}
          />
        )}
        <Girdi etiket="Plan başlangıç" type="date" required value={planBaslangic} onChange={(e) => { planBaslangicYaz(e.target.value); }} />
        <Girdi etiket="Plan bitiş" type="date" required value={planBitis} onChange={(e) => { planBitisYaz(e.target.value); }} />
        <IsaretKutusu etiket="Bitirmek için kanıt zorunlu" checked={kanitZorunlu} onChange={(e) => { kanitZorunluYaz(e.target.checked); }} />
        <Secim
          etiket="Önceki görev" value={oncekiId} bosSecenek="Yok" secenekler={oncekiSecenekleri}
          ipucu="Bu görev hangi görevin ardından başlar."
          onChange={(e) => { oncekiYaz(e.target.value); }}
        />
        {gorev !== null && (
          <>
            <Secim
              etiket="Durum" required value={durum} secenekler={durumSecenekleri(gorev.durum)}
              ipucu={kontrol !== '' ? 'Kontrol edeni olan görev düzenlemeyle bitmez; yapan "Bitti" der, kontrol eden onaylar.' : undefined}
              onChange={(e) => { durumYaz(e.target.value as GorevDurumu); }}
            />
            <Girdi etiket="Gerçek başlangıç" type="date" value={gercekBaslangic} onChange={(e) => { gercekBaslangicYaz(e.target.value); }} />
            <Girdi
              etiket="Gerçek bitiş" type="date" value={gercekBitis}
              ipucu={durum === 'bitti' ? 'Biten görevde zorunlu.' : undefined}
              onChange={(e) => { gercekBitisYaz(e.target.value); }}
            />
            <Girdi
              etiket="İlerleme (%)" type="number" inputMode="numeric" min={0} max={100} step={1} value={durum === 'bitti' ? '100' : ilerleme}
              disabled={durum === 'bitti'} ipucu={durum === 'bitti' ? 'Biten görev %100 sayılır.' : undefined}
              onChange={(e) => { ilerlemeYaz(e.target.value); }}
            />
          </>
        )}
        <div className="tc-form-tam">
          <CokSatir etiket="Açıklama" value={aciklama} maxLength={1000} onChange={(e) => { aciklamaYaz(e.target.value); }} />
        </div>
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Görev kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
