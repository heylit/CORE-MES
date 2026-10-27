import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  Gorev, GorevDurumu, GorevEkleGovdesi, GorevGuncelleGovdesi, KisiSecenekleriCevabi, ProjeYonetimiCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, Girdi, Kart, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GOREV_DURUMLARI, GOREV_DURUM_METNI, GOREV_DURUM_TONU, GOREV_ISLEMI, bugun, gunFarki, sapmaMetni, tarihMetni } from './gosterim.ts';
import { bosIseNull, sayiYaDaNull, useIslemVar, useYonetimKomutu } from './komut.ts';

// Bitiş sapması: biten görevde gerçek bitiş, açık görevde bugün plan bitişini geçtiyse bugün; iptal edilen görevde yoktur.
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

type Gorunum = 'tablo' | 'pano';

export function ProjeGorevleri({ projeId, yonetim, acik }: { projeId: number; yonetim: ProjeYonetimiCevabi; acik: boolean }) {
  const yazabilir = useIslemVar(GOREV_ISLEMI) && acik;
  const [gorunum, gorunumYaz] = useState<Gorunum>('tablo');
  const [form, formYaz] = useState<Gorev | 'yeni' | null>(null);
  const gun = bugun();
  const taslar = new Map(yonetim.kilometreTaslari.map((t) => [t.id, t.ad]));
  const sec = yazabilir ? (g: Gorev) => { formYaz(g); } : undefined;

  const sutunlar: Sutun<Gorev>[] = [
    { anahtar: 'ad', baslik: 'Görev', hucre: (g) => (
      <span>{g.ad}{g.kilometreTasiId !== null && <span className="tc-prj-soluk"> · {taslar.get(g.kilometreTasiId) ?? '—'}</span>}</span>
    ) },
    { anahtar: 'sorumlu', baslik: 'Sorumlu', hucre: (g) => g.sorumluAd ?? '—' },
    { anahtar: 'plan', baslik: 'Plan', mono: true, kirilmaz: true, hucre: (g) => `${tarihMetni(g.planBaslangic)} – ${tarihMetni(g.planBitis)}` },
    { anahtar: 'gercek', baslik: 'Gerçekleşen', mono: true, kirilmaz: true, hucre: (g) => (
      g.gercekBaslangic === null ? '—' : `${tarihMetni(g.gercekBaslangic)} – ${tarihMetni(g.gercekBitis)}`
    ) },
    { anahtar: 'sapma', baslik: 'Sapma', mono: true, kirilmaz: true, hizala: 'sag', hucre: (g) => {
      const s = gorevSapmasi(g, gun);
      return <span className={s !== null && s > 0 ? 'tc-prj-gec' : undefined}>{sapmaMetni(s)}</span>;
    } },
    { anahtar: 'ilerleme', baslik: 'İlerleme', hucre: (g) => <Ilerleme deger={g.ilerleme} /> },
    { anahtar: 'durum', baslik: 'Durum', hucre: (g) => <Rozet ton={GOREV_DURUM_TONU[g.durum]}>{GOREV_DURUM_METNI[g.durum]}</Rozet> },
  ];

  return (
    <Kart
      baslik="Görevler"
      simge="list"
      sag={(
        <div className="tc-prj-gorunum">
          <Dugme simge="list" aria-pressed={gorunum === 'tablo'} onClick={() => { gorunumYaz('tablo'); }}>Tablo</Dugme>
          <Dugme simge="gantt" aria-pressed={gorunum === 'pano'} onClick={() => { gorunumYaz('pano'); }}>Pano</Dugme>
          {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { formYaz('yeni'); }}>Görev ekle</Dugme>}
        </div>
      )}
    >
      {gorunum === 'tablo'
        ? (
          <Tablo
            etiket="Projenin görevleri"
            sutunlar={sutunlar}
            satirlar={yonetim.gorevler}
            satirAnahtari={(g) => g.id}
            {...(sec ? { satirSec: sec } : {})}
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

function GorevPanosu({ gorevler, gun, sec }: { gorevler: readonly Gorev[]; gun: string; sec: ((g: Gorev) => void) | undefined }) {
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
                  <span className="tc-prj-soluk">{g.sorumluAd ?? 'Sorumlu yok'} · {tarihMetni(g.planBitis)}</span>
                  {gorevGecikiyor(g, gun) && <span className="tc-prj-gec">Gecikiyor</span>}
                  <Ilerleme deger={g.ilerleme} />
                </>
              );
              return sec
                ? <button key={g.id} type="button" className="tc-prj-pano-kart" onClick={() => { sec(g); }}>{icerik}</button>
                : <div key={g.id} className="tc-prj-pano-kart">{icerik}</div>;
            })}
          </section>
        );
      })}
    </div>
  );
}

const DURUM_SECENEKLERI = GOREV_DURUMLARI.map((d) => ({ deger: d, baslik: GOREV_DURUM_METNI[d] }));

function GorevFormu({ projeId, yonetim, gorev, kapat }: {
  projeId: number; yonetim: ProjeYonetimiCevabi; gorev: Gorev | null; kapat: () => void;
}) {
  const kimlik = useId();
  const [ad, adYaz] = useState(gorev?.ad ?? '');
  const [tasId, tasYaz] = useState(gorev?.kilometreTasiId == null ? '' : String(gorev.kilometreTasiId));
  const [sorumluId, sorumluYaz] = useState(gorev?.sorumluKisiId == null ? '' : String(gorev.sorumluKisiId));
  const [planBaslangic, planBaslangicYaz] = useState(gorev?.planBaslangic ?? '');
  const [planBitis, planBitisYaz] = useState(gorev?.planBitis ?? '');
  const [oncekiId, oncekiYaz] = useState(gorev?.oncekiGorevId == null ? '' : String(gorev.oncekiGorevId));
  const [aciklama, aciklamaYaz] = useState(gorev?.aciklama ?? '');
  const [gercekBaslangic, gercekBaslangicYaz] = useState(gorev?.gercekBaslangic ?? '');
  const [gercekBitis, gercekBitisYaz] = useState(gorev?.gercekBitis ?? '');
  const [ilerleme, ilerlemeYaz] = useState(gorev === null ? '0' : String(gorev.ilerleme));
  const [durum, durumYaz] = useState<GorevDurumu>(gorev?.durum ?? 'yapilacak');
  const sorumlular = useQuery({
    queryKey: anahtarlar.sorumlular,
    queryFn: () => api.get<KisiSecenekleriCevabi>('/projeler/sorumlu-secenekleri'),
  });
  const sorumluSecenekleri = (sorumlular.data?.kisiler ?? []).map((k) => ({ deger: String(k.id), baslik: k.ad }));
  if (gorev?.sorumluKisiId != null && !sorumluSecenekleri.some((s) => s.deger === sorumluId)) {
    sorumluSecenekleri.unshift({ deger: String(gorev.sorumluKisiId), baslik: gorev.sorumluAd ?? `Kişi ${gorev.sorumluKisiId}` });
  }
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
    const plan = {
      kilometreTasiId: sayiYaDaNull(tasId),
      ad,
      aciklama: bosIseNull(aciklama),
      sorumluKisiId: sayiYaDaNull(sorumluId),
      planBaslangic,
      planBitis,
      oncekiGorevId: sayiYaDaNull(oncekiId),
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
        <Secim
          etiket="Sorumlu" value={sorumluId} bosSecenek="Atanmadı" secenekler={sorumluSecenekleri}
          hata={sorumlular.isError ? hataIletisi(sorumlular.error, 'Kişiler alınamadı') : undefined}
          onChange={(e) => { sorumluYaz(e.target.value); }}
        />
        <Girdi etiket="Plan başlangıç" type="date" required value={planBaslangic} onChange={(e) => { planBaslangicYaz(e.target.value); }} />
        <Girdi etiket="Plan bitiş" type="date" required value={planBitis} onChange={(e) => { planBitisYaz(e.target.value); }} />
        <Secim
          etiket="Önceki görev" value={oncekiId} bosSecenek="Yok" secenekler={oncekiSecenekleri}
          ipucu="Bu görev hangi görevin ardından başlar."
          onChange={(e) => { oncekiYaz(e.target.value); }}
        />
        {gorev !== null && (
          <>
            <Secim etiket="Durum" required value={durum} secenekler={DURUM_SECENEKLERI} onChange={(e) => { durumYaz(e.target.value as GorevDurumu); }} />
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
