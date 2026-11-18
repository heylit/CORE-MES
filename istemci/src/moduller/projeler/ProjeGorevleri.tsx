import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  Gorev, GorevDurumu, GorevEkleGovdesi, GorevGuncelleGovdesi, ProjeYonetimiCevabi, SablonSecenekleriCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, Girdi, Kart, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  GOREV_DURUMLARI, GOREV_DURUM_METNI, GOREV_DURUM_TONU, GOREV_ISLEMI, atamaMetni, bugun, gorevDurumMetni, gunFarki, sapmaMetni, tarihMetni,
} from './gosterim.ts';
import { AtamaSecimi, GorevPaneli, atamaCoz, atamaDegeri, useAtamaSecenekleri } from './GorevPaneli.tsx';
import { bosIseNull, sayiYaDaNull, useIslemVar, useYonetimKomutu } from './komut.ts';
import { HazirlikGorevleriAc, ProjeHazirlik } from './ProjeHazirlik.tsx';

// Bitiş sapması: biten görevde gerçek bitiş, açık görevde bugün plan bitişini geçtiyse bugün; iptal edilen görevde yoktur.
// CSV'de tür ayrı sütun değil, adın önekidir: ekrandaki rozetle aynı ayrım.
export const gorevCsvAdi = (g: Gorev): string => `${g.hazirlikMaddesi === null ? 'Proje' : 'Hazırlık'}: ${g.ad}`;

export function gorevSapmasi(g: Gorev, bugunTarihi: string): number | null {
  if (g.durum === 'iptal') return null;
  if (g.gercekBitis !== null) return gunFarki(g.planBitis, g.gercekBitis);
  return bugunTarihi > g.planBitis ? gunFarki(g.planBitis, bugunTarihi) : null;
}
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

// 3430 a: proje görevleri ve hazırlık görevleri tek sekmede. Hazırlık görevi maddeye ve emre bağlı proje görevidir; listede rozetle ayrılır,
// "Emir × madde" görünümü hazırlık görevlerini emir ve madde tablosunda, maddenin sistemdeki hâliyle gösterir (emri okuyamayana yok).
export function ProjeGorevleri({ projeId, yonetim, acik, emirleriGorur }: {
  projeId: number; yonetim: ProjeYonetimiCevabi; acik: boolean; emirleriGorur: boolean;
}) {
  const yazabilir = useIslemVar(GOREV_ISLEMI) && acik;
  const [secilenGorunum, gorunumYaz] = useState<Gorunum>('tablo');
  const gorunum = secilenGorunum === 'matris' && !emirleriGorur ? 'tablo' : secilenGorunum;
  const [form, formYaz] = useState<Gorev | 'yeni' | null>(null);
  const [panel, panelYaz] = useState<number | null>(null);
  const [sablondan, sablondanYaz] = useState(false);
  const gun = bugun();
  const taslar = new Map(yonetim.kilometreTaslari.map((t) => [t.id, t.ad]));
  // 3269 a: satır görevin yan panelini açar (akış düğmeleri ve geçmiş); düzenleme panelden.
  const sec = (g: Gorev) => { panelYaz(g.id); };
  const paneldeki = yonetim.gorevler.find((g) => g.id === panel);

  const sutunlar: Sutun<Gorev>[] = [
    { anahtar: 'ad', baslik: 'Görev', hucre: (g) => (
      <span>
        {g.hazirlikMaddesi === null ? <Rozet ton="pasif">Proje</Rozet> : <Rozet ton="bilgi">Hazırlık</Rozet>}{' '}
        {g.ad}
        {g.kilometreTasiId !== null && <span className="tc-prj-soluk"> · {taslar.get(g.kilometreTasiId) ?? '—'}</span>}
        {g.asama !== null && <span className="tc-prj-soluk"> · {g.asama}</span>}
      </span>
    ), csv: gorevCsvAdi },
    { anahtar: 'yapan', baslik: 'Yapan', hucre: (g) => atamaMetni(g.sorumluAd, g.yapanRolAd) },
    { anahtar: 'kontrol', baslik: 'Kontrol eden', hucre: (g) => atamaMetni(g.kontrolKisiAd, g.kontrolRolAd, 'Yok') },
    { anahtar: 'plan', baslik: 'Plan', mono: true, hucre: (g) => `${tarihMetni(g.planBaslangic)} – ${tarihMetni(g.planBitis)}` },
    { anahtar: 'gercek', baslik: 'Gerçekleşen', mono: true, hucre: (g) => (
      g.gercekBaslangic === null ? '—' : `${tarihMetni(g.gercekBaslangic)} – ${tarihMetni(g.gercekBitis)}`
    ) },
    { anahtar: 'sapma', baslik: 'Sapma', mono: true, kirilmaz: true, hizala: 'sag', hucre: (g) => {
      const s = gorevSapmasi(g, gun);
      return <span className={s !== null && s > 0 ? 'tc-prj-gec' : undefined}>{sapmaMetni(s)}</span>;
    } },
    { anahtar: 'ilerleme', baslik: 'İlerleme', hucre: (g) => <Ilerleme deger={g.ilerleme} /> },
    { anahtar: 'durum', baslik: 'Durum', hucre: (g) => <Rozet ton={GOREV_DURUM_TONU[g.durum]}>{gorevDurumMetni(g)}</Rozet>, csv: gorevDurumMetni },
  ];

  return (
    <Kart baslik="Görevler" simge="list">
      <div className="tc-prj-gorunum">
        <div className="tc-prj-secici" role="group" aria-label="Görünüm">
          <Dugme simge="list" aria-pressed={gorunum === 'tablo'} onClick={() => { gorunumYaz('tablo'); }}>Liste</Dugme>
          {emirleriGorur && <Dugme simge="grid" aria-pressed={gorunum === 'matris'} onClick={() => { gorunumYaz('matris'); }}>Emir × madde</Dugme>}
          <Dugme simge="gantt" aria-pressed={gorunum === 'pano'} onClick={() => { gorunumYaz('pano'); }}>Pano</Dugme>
        </div>
        <div className="tc-prj-eylemler">
          {yazabilir && <Dugme simge="layers" onClick={() => { sablondanYaz(true); }}>Şablondan ekle</Dugme>}
          {yazabilir && <Dugme simge="plus" onClick={() => { formYaz('yeni'); }}>Görev ekle</Dugme>}
          {emirleriGorur && <HazirlikGorevleriAc projeId={projeId} />}
        </div>
      </div>
      {gorunum === 'matris' && <ProjeHazirlik projeId={projeId} />}
      {gorunum === 'matris' ? null : gorunum === 'tablo'
        ? (
          <Tablo
            etiket="Projenin görevleri"
            sutunlar={sutunlar}
            satirlar={yonetim.gorevler}
            satirAnahtari={(g) => g.id}
            satirSec={sec}
            bosMesaj="Bu projede görev yok"
          />
        )
        : <GorevPanosu gorevler={yonetim.gorevler} gun={gun} sec={sec} />}
      {panel !== null && form === null && (
        <GorevPaneli
          gorevId={panel} kapat={() => { panelYaz(null); }}
          duzenle={yazabilir && paneldeki !== undefined ? () => { formYaz(paneldeki); } : undefined}
          iptalEdebilir={yazabilir}
        />
      )}
      {form !== null && (
        <GorevFormu projeId={projeId} yonetim={yonetim} gorev={form === 'yeni' ? null : form} kapat={() => { formYaz(null); panelYaz(null); }} />
      )}
      {sablondan && <SablondanEkle projeId={projeId} kapat={() => { sablondanYaz(false); }} />}
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
                  {g.hazirlikMaddesi !== null && <Rozet ton="bilgi">Hazırlık</Rozet>}
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

// 3269: seçilen şablonun görevleri (hazırlık maddesine bağlı olmayanlar) projeye eklenir; tarihler projenin başlangıç ve bitişinden.
function SablondanEkle({ projeId, kapat }: { projeId: number; kapat: () => void }) {
  const kimlik = useId();
  const [sablonId, sablonYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>(undefined);
  const sablonlar = useQuery({ queryKey: anahtarlar.sablonSecenekleri, queryFn: () => api.get<SablonSecenekleriCevabi>('/projeler/sablon-secenekleri') });
  const secenekler = (sablonlar.data?.sablonlar ?? []).map((x) => ({
    deger: String(x.id), baslik: `${x.ad} · ${x.gorevSayisi} görev${x.varsayilan ? ' (varsayılan)' : ''}`,
  }));
  const komut = useYonetimKomutu<{ sablonId: number }>(
    projeId, (govde, istekKimligi) => api.post(`/projeler/${projeId}/sablondan-ekle`, govde, { istekKimligi }), kapat,
  );
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    if (sablonId === '') { hataYaz('Şablon seçin.'); return; }
    komut.mutate({ sablonId: Number(sablonId) });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Şablondan görev ekle"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Ekle</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Secim
            etiket="Şablon" required value={sablonId} bosSecenek="Şablon seçin" secenekler={secenekler}
            ipucu="Hazırlık maddesine bağlı görevler üretim emri açılınca doğar."
            hata={hata ?? (sablonlar.isError ? hataIletisi(sablonlar.error, 'Şablonlar alınamadı') : undefined)}
            onChange={(e) => { sablonYaz(e.target.value); hataYaz(undefined); }}
          />
        </div>
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Şablon eklenemedi')}</p>}
      </form>
    </Pencere>
  );
}

function GorevFormu({ projeId, yonetim, gorev, kapat }: {
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
          hata={atamalar.hata} bos="Atanmadı" ipucu="Role atanan görevi roldeki biri üstlenir." degistir={yapanYaz}
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
