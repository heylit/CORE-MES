import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  KontrolKosulu, Sablon, SablonDayanagi, SablonEkleGovdesi, SablonGuncelleGovdesi, SablonKalemi, SablonKalemiGovdesi, SablonListesiCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Tablo, type Secenek, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AtamaSecimi, atamaCoz, atamaDegeri, useAtamaSecenekleri } from './Atama.tsx';
import { useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import { HAZIRLIK_METNI, SABLON_ISLEMI, atamaMetni } from './gosterim.ts';
import { bosIseNull, useIslemVar, useIstekKimligi } from './komut.ts';
import './projeler.css';

const DAYANAK_SECENEKLERI: Secenek[] = [{ deger: 'baslangic', baslik: 'Proje başlangıcından' }, { deger: 'termin', baslik: 'Proje bitişinden (termin)' }];
const KOSUL_SECENEKLERI: Secenek[] = [{ deger: 'her-zaman', baslik: 'Her zaman' }, { deger: 'yeni-revize', baslik: 'Yalnız yeni ya da revize olunca' }];
// 3396 a: seçenekler sunucudaki madde listesidir (açık maddeler, özel dahil); liste okunamazsa kod adları.
function useHazirlikSecenekleri(secili: readonly string[]): Secenek[] {
  const l = useHazirlikMaddeleri().data?.maddeler;
  if (l === undefined) return Object.entries(HAZIRLIK_METNI).map(([m, ad]) => ({ deger: m, baslik: `${ad} (iş emri başına)` }));
  return l.filter((m) => m.acik || secili.includes(m.kod))
    .map((m) => ({ deger: m.kod, baslik: `${m.ad}${m.acik ? '' : ' (kapalı)'} (${m.isEmriDuzeyi ? 'iş emri' : 'emir'} başına)` }));
}

const baslangicMetni = (k: Pick<SablonKalemi, 'dayanak' | 'gun'>): string =>
  `${k.dayanak === 'termin' ? 'Termin' : 'Başlangıç'} ${k.gun >= 0 ? '+' : '−'}${Math.abs(k.gun)} gün`;

// 3269 a: görev şablonları (Projeler > Ayarlar). Şablon proje açılınca uygulanır; değişen şablon açık projelerin görevlerini değiştirmez.
export function GorevSablonlari() {
  const yazabilir = useIslemVar(SABLON_ISLEMI);
  const [form, formYaz] = useState<Sablon | 'yeni' | null>(null);
  const l = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonListesiCevabi>('/projeler/sablonlar/liste'), enabled: yazabilir });
  const sutunlar: Sutun<Sablon>[] = [
    { anahtar: 'ad', baslik: 'Şablon', hucre: (s) => s.ad },
    { anahtar: 'gorev', baslik: 'Proje görevi', hizala: 'sag', mono: true, hucre: (s) => s.kalemler.filter((k) => k.hazirlikMaddesi === null).length },
    { anahtar: 'hazirlik', baslik: 'Hazırlık görevi', hizala: 'sag', mono: true, hucre: (s) => s.kalemler.filter((k) => k.hazirlikMaddesi !== null).length },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => (
      <span className="tc-prj-bag">
        {s.varsayilan && <Rozet ton="tamam">Varsayılan</Rozet>}
        {!s.etkin && <Rozet ton="pasif">Kapalı</Rozet>}
        <span className="tc-prj-soluk">Sürüm {s.surum}</span>
      </span>
    ), csv: (s) => (s.varsayilan ? 'Varsayılan' : s.etkin ? 'Etkin' : 'Kapalı') },
  ];
  if (!yazabilir) return <DurumKutusu durum="hata" mesaj="Görev şablonlarını yalnız şablon yazma yetkisi olan görür." />;
  return (
    <Kart
      baslik="Görev şablonları"
      simge="layers"
      sag={<Dugme tur="birincil" simge="plus" onClick={() => { formYaz('yeni'); }}>Şablon ekle</Dugme>}
    >
      <div className="tc-prj-icerik">
        {l.isError
          ? <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Şablonlar alınamadı')} yenile={() => { void l.refetch(); }} />
          : (
            <Tablo
              etiket="Görev şablonları"
              sutunlar={sutunlar}
              satirlar={l.data?.sablonlar ?? []}
              satirAnahtari={(s) => s.id}
              satirSec={(s) => { formYaz(s); }}
              yukleniyor={l.isPending}
              bosMesaj="Henüz görev şablonu yok"
            />
          )}
        <p className="tc-prj-soluk">
          Varsayılan şablon elle ve siparişten açılan her projeye uygulanır. Şablon değişince açık projelerin görevleri değişmez.
        </p>
      </div>
      {form !== null && <SablonFormu sablon={form === 'yeni' ? null : form} kapat={() => { formYaz(null); }} />}
    </Kart>
  );
}

// Kalem formda yerel anahtarla tutulur: sıra değişince "önceki görev" bağı anahtardan yeniden sıra numarasına çevrilir.
interface KalemTaslagi {
  anahtar: number; ad: string; aciklama: string; asama: string; dayanak: SablonDayanagi; gun: string; sureGun: string;
  yapan: string; kontrol: string; yedek: string; onceki: number | null; hazirlik: string; kosul: KontrolKosulu;
  adlar: { yapan: string | null; kontrol: string | null; yedek: string | null };
}

function taslaklar(sablon: Sablon | null, yeniAnahtar: () => number): KalemTaslagi[] {
  const kalemler = sablon?.kalemler ?? [];
  const anahtarlar = kalemler.map(() => yeniAnahtar());
  return kalemler.map((k, i) => ({
    anahtar: anahtarlar[i] ?? 0, ad: k.ad, aciklama: k.aciklama ?? '', asama: k.asama ?? '', dayanak: k.dayanak, gun: String(k.gun), sureGun: String(k.sureGun),
    yapan: atamaDegeri({ kisiId: k.yapanKisiId, rolId: k.yapanRolId }),
    kontrol: atamaDegeri({ kisiId: k.kontrolKisiId, rolId: k.kontrolRolId }),
    yedek: atamaDegeri({ kisiId: k.yedekKontrolKisiId, rolId: k.yedekKontrolRolId }),
    onceki: k.oncekiSira === null ? null : anahtarlar[k.oncekiSira] ?? null,
    hazirlik: k.hazirlikMaddesi ?? '', kosul: k.kontrolKosulu,
    adlar: {
      yapan: atamaMetni(k.yapanKisiAd, k.yapanRolAd), kontrol: atamaMetni(k.kontrolKisiAd, k.kontrolRolAd),
      yedek: atamaMetni(k.yedekKontrolKisiAd, k.yedekKontrolRolAd),
    },
  }));
}

function govdeKalemi(k: KalemTaslagi, sira: Map<number, number>): SablonKalemiGovdesi {
  const y = atamaCoz(k.yapan);
  const c = atamaCoz(k.kontrol);
  const yd = c.kisiId === null && c.rolId === null ? atamaCoz('') : atamaCoz(k.yedek);
  return {
    ad: k.ad.trim(), aciklama: bosIseNull(k.aciklama), asama: bosIseNull(k.asama), dayanak: k.dayanak, gun: Number(k.gun), sureGun: Number(k.sureGun),
    yapanKisiId: y.kisiId, yapanRolId: y.rolId, kontrolKisiId: c.kisiId, kontrolRolId: c.rolId, yedekKontrolKisiId: yd.kisiId, yedekKontrolRolId: yd.rolId,
    oncekiSira: k.onceki === null ? null : sira.get(k.onceki) ?? null,
    hazirlikMaddesi: k.hazirlik === '' ? null : k.hazirlik as SablonKalemiGovdesi['hazirlikMaddesi'],
    kontrolKosulu: k.kosul,
  };
}

function SablonFormu({ sablon, kapat }: { sablon: Sablon | null; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const istek = useIstekKimligi();
  const sayac = useRef(0);
  const yeniAnahtar = () => (sayac.current += 1);
  const [ad, adYaz] = useState(sablon?.ad ?? '');
  const [varsayilan, varsayilanYaz] = useState(sablon?.varsayilan ?? false);
  const [etkin, etkinYaz] = useState(sablon?.etkin ?? true);
  const [kalemler, kalemlerYaz] = useState<KalemTaslagi[]>(() => taslaklar(sablon, yeniAnahtar));
  const [hata, hataYaz] = useState<string | null>(null);
  const atamalar = useAtamaSecenekleri();
  const hazirlikSecenekleri = useHazirlikSecenekleri(kalemler.map((k) => k.hazirlik));

  const komut = useMutation({
    mutationFn: (govde: SablonEkleGovdesi) => (sablon === null
      ? api.post<SablonListesiCevabi>('/projeler/sablonlar', govde, { istekKimligi: istek.al() })
      : api.post<SablonListesiCevabi>(`/projeler/sablonlar/${sablon.id}/guncelle`, { ...govde, surum: sablon.surum } satisfies SablonGuncelleGovdesi)),
    onSuccess: async (cevap) => {
      istemci.setQueryData(anahtarlar.sablonlar, cevap);
      await istemci.invalidateQueries({ queryKey: anahtarlar.sablonSecenekleri });
      kapat();
    },
    onError: istek.hataSonrasi,
  });

  const degistir = (anahtar: number, d: Partial<KalemTaslagi>) => { kalemlerYaz((l) => l.map((k) => (k.anahtar === anahtar ? { ...k, ...d } : k))); };
  const tasi = (i: number, yon: -1 | 1) => {
    kalemlerYaz((l) => {
      const j = i + yon;
      const a = l[i];
      const b = l[j];
      if (a === undefined || b === undefined) return l;
      const yeni = [...l];
      yeni[i] = b;
      yeni[j] = a;
      return yeni;
    });
  };
  const kaldir = (anahtar: number) => {
    kalemlerYaz((l) => l.filter((k) => k.anahtar !== anahtar).map((k) => (k.onceki === anahtar ? { ...k, onceki: null } : k)));
  };
  const ekle = () => {
    kalemlerYaz((l) => [...l, {
      anahtar: yeniAnahtar(), ad: '', aciklama: '', asama: '', dayanak: 'baslangic', gun: '0', sureGun: '1', yapan: '', kontrol: '', yedek: '',
      onceki: null, hazirlik: '', kosul: 'her-zaman', adlar: { yapan: null, kontrol: null, yedek: null },
    }]);
  };
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    const sira = new Map(kalemler.map((k, i) => [k.anahtar, i]));
    const geri = kalemler.findIndex((k, i) => k.onceki !== null && (sira.get(k.onceki) ?? i) >= i);
    if (geri >= 0) { hataYaz(`${geri + 1}. görev: önceki görev listede bu görevden önce olmalı.`); return; }
    hataYaz(null);
    komut.mutate({ ad: ad.trim(), varsayilan, etkin: varsayilan || etkin, kalemler: kalemler.map((k) => govdeKalemi(k, sira)) });
  };

  return (
    <Pencere
      acik
      kapat={kapat}
      tur="yan"
      genis
      baslik={sablon === null ? 'Yeni görev şablonu' : `Şablon: ${sablon.ad}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Girdi etiket="Şablon adı" required value={ad} maxLength={120} onChange={(e) => { adYaz(e.target.value); }} />
        </div>
        <IsaretKutusu
          etiket="Varsayılan: her yeni projeye uygulanır" checked={varsayilan}
          onChange={(e) => { varsayilanYaz(e.target.checked); }}
        />
        <IsaretKutusu etiket="Etkin (seçilebilir)" checked={varsayilan || etkin} disabled={varsayilan} onChange={(e) => { etkinYaz(e.target.checked); }} />
        {kalemler.map((k, i) => (
          <fieldset key={k.anahtar} className="tc-form-tam tc-prj-kalem">
            <legend>{i + 1}. görev{k.hazirlik !== '' && ' · iş emri başına'}</legend>
            <div className="tc-form">
              <Girdi etiket="Görev adı" required value={k.ad} maxLength={200} onChange={(e) => { degistir(k.anahtar, { ad: e.target.value }); }} />
              <Girdi etiket="Aşama" value={k.asama} maxLength={80} onChange={(e) => { degistir(k.anahtar, { asama: e.target.value }); }} />
              <Secim
                etiket="Başlangıç" value={k.dayanak} secenekler={DAYANAK_SECENEKLERI}
                onChange={(e) => { degistir(k.anahtar, { dayanak: e.target.value as SablonDayanagi }); }}
              />
              <Girdi
                etiket="Gün farkı" type="number" inputMode="numeric" min={-365} max={365} step={1} value={k.gun}
                ipucu={`Örnek: ${baslangicMetni({ dayanak: k.dayanak, gun: Number(k.gun) || 0 })}`}
                onChange={(e) => { degistir(k.anahtar, { gun: e.target.value }); }}
              />
              <Girdi
                etiket="Süre (gün)" type="number" inputMode="numeric" min={1} max={365} step={1} value={k.sureGun}
                onChange={(e) => { degistir(k.anahtar, { sureGun: e.target.value }); }}
              />
              <Secim
                etiket="Hazırlık görevi olsun" value={k.hazirlik} bosSecenek="Hayır, proje başına bir kez" secenekler={hazirlikSecenekleri}
                onChange={(e) => { degistir(k.anahtar, { hazirlik: e.target.value }); }}
              />
              <AtamaSecimi
                etiket="Yapan" deger={k.yapan} ad={k.adlar.yapan} secenekler={atamalar.secenekler} hata={atamalar.hata} bos="Atanmadı"
                degistir={(d) => { degistir(k.anahtar, { yapan: d }); }}
              />
              <AtamaSecimi
                etiket="Kontrol eden" deger={k.kontrol} ad={k.adlar.kontrol} secenekler={atamalar.secenekler} hata={atamalar.hata} bos="Yok"
                degistir={(d) => { degistir(k.anahtar, { kontrol: d }); }}
              />
              {k.kontrol !== '' && (
                <AtamaSecimi
                  etiket="Yedek kontrol eden" deger={k.yedek} ad={k.adlar.yedek} secenekler={atamalar.secenekler} hata={atamalar.hata} bos="Yok"
                  degistir={(d) => { degistir(k.anahtar, { yedek: d }); }}
                />
              )}
              {k.kontrol !== '' && k.hazirlik !== '' && (
                <Secim
                  etiket="Kontrol ne zaman" value={k.kosul} secenekler={KOSUL_SECENEKLERI}
                  onChange={(e) => { degistir(k.anahtar, { kosul: e.target.value as KontrolKosulu }); }}
                />
              )}
              <Secim
                etiket="Önceki görev" value={k.onceki === null ? '' : String(k.onceki)} bosSecenek="Yok"
                secenekler={kalemler.slice(0, i).map((o, j) => ({ deger: String(o.anahtar), baslik: `${j + 1}. ${o.ad || 'Adsız görev'}` }))}
                onChange={(e) => { degistir(k.anahtar, { onceki: e.target.value === '' ? null : Number(e.target.value) }); }}
              />
            </div>
            <div className="tc-prj-gorunum">
              <Dugme simge="up" disabled={i === 0} onClick={() => { tasi(i, -1); }}>Yukarı</Dugme>
              <Dugme simge="down" disabled={i === kalemler.length - 1} onClick={() => { tasi(i, 1); }}>Aşağı</Dugme>
              <Dugme simge="trash" onClick={() => { kaldir(k.anahtar); }}>Kaldır</Dugme>
            </div>
          </fieldset>
        ))}
        <div className="tc-form-tam tc-prj-gorunum">
          <Dugme simge="plus" onClick={ekle}>Görev ekle</Dugme>
        </div>
        {(hata !== null || komut.isError) && (
          <p className="tc-form-tam tc-prj-hata" role="alert">{hata ?? hataIletisi(komut.error, 'Şablon kaydedilemedi')}</p>
        )}
      </form>
    </Pencere>
  );
}
