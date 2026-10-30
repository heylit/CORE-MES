import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Vector3 } from 'three';
import type {
  AlanGovdesi, MarkalamaTanimi, OnizlemeCevabi, SayacKapsami, TanimEkleGovdesi, TanimKaydetGovdesi, TanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import type { MalzemeAraCevabi } from '#paylasilan/sozlesme/rota.ts';
import {
  Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Rozet, Secim, Tablo, useBildirim, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import {
  AZAMI_ALAN, ICERIK_ADLARI, ICERIKLER, KAPSAM_ADLARI, KOD_TURLERI, KOD_TURU_ADLARI, SABLON_ACIKLAMALARI, SABLON_PARCALARI, SAYAC_KAPSAMLARI, YAZI_TIPI_ADLARI,
  YAZI_TIPLERI, YONTEM_ADLARI, YONTEMLER,
} from './adlar.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ModelPaneli } from './ModelPaneli.tsx';
import { yerOlustur } from './sahne.ts';
import { olcuMetni, sayi, taslakHatasi } from './taslak.ts';
import './markalama.css';

interface Taslak {
  id: number | null;
  surum: number | null;
  malzemeId: number | null;
  malzemeKodu: string | null;
  opNo: string;
  seriSablonu: string;
  sayacKapsami: SayacKapsami;
  baslangicSirasi: string;
  dogrulama: boolean;
  model: MarkalamaTanimi['model'];
  alanlar: AlanGovdesi[];
}

const yeniAlan = (sira: number): AlanGovdesi => ({
  ad: sira === 0 ? 'Seri no' : `Marka ${sira + 1}`, icerik: sira === 0 ? 'seri' : 'sabit', sabitMetin: null, kodTuru: 'yok', yontem: 'lazer',
  yaziYuksekligiMm: null, yaziDerinligiMm: null, yaziTipi: null, program: null, yuzey: null, yer: null,
});

const YENI: Taslak = {
  id: null, surum: null, malzemeId: null, malzemeKodu: null, opNo: '', seriSablonu: '{PARCA}-{YY}{WW}-{SEQ:5}', sayacKapsami: 'malzeme',
  baslangicSirasi: '1', dogrulama: true, model: null, alanlar: [yeniAlan(0)],
};

const taslakYap = (t: MarkalamaTanimi): Taslak => ({
  id: t.id, surum: t.surum, malzemeId: t.malzemeId, malzemeKodu: t.malzemeKodu, opNo: String(t.opNo), seriSablonu: t.seriSablonu,
  sayacKapsami: t.sayacKapsami, baslangicSirasi: String(t.baslangicSirasi), dogrulama: t.dogrulama, model: t.model,
  alanlar: t.alanlar.map(({ sira: _sira, ...a }) => a),
});

const bosOlur = (metin: string): string | null => (metin.trim() === '' ? null : metin);

const secenekler = <T extends string>(degerler: readonly T[], adlar: Readonly<Record<T, string>>) => degerler.map((deger) => ({ deger, baslik: adlar[deger] }));

const SUTUNLAR: readonly Sutun<MarkalamaTanimi>[] = [
  { anahtar: 'malzeme', baslik: 'Malzeme', mono: true, hucre: (t) => t.malzemeKodu ?? `#${t.malzemeId}` },
  { anahtar: 'op', baslik: 'Op', mono: true, hucre: (t) => t.opNo },
  { anahtar: 'sablon', baslik: 'Seri şablonu', mono: true, hucre: (t) => t.seriSablonu },
  { anahtar: 'marka', baslik: 'Marka', hucre: (t) => t.alanlar.length },
  { anahtar: 'model', baslik: '3B', hucre: (t) => (t.model ? <Rozet ton="tamam">Rev {t.model.revizyon}</Rozet> : <Rozet ton="pasif">Yok</Rozet>) },
];

function MalzemeSecici({ sec }: { sec: (id: number, kod: string) => void }) {
  const [metin, metinYaz] = useState('');
  const aranan = metin.trim();
  const sonuc = useQuery({
    queryKey: anahtarlar.malzemeAra(aranan),
    queryFn: () => api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?metin=${encodeURIComponent(aranan)}`),
    enabled: aranan.length >= 2,
  });
  const satirlar = sonuc.data?.satirlar ?? [];
  return (
    <div className="tc-mrk-satir">
      <Girdi etiket="Malzeme ara" ipucu="Stok kodu ya da adından en az iki harf" value={metin} onChange={(o) => metinYaz(o.target.value)} />
      <Secim
        etiket="Malzeme"
        secenekler={satirlar.map((s) => ({ deger: String(s.id), baslik: `${s.stokKodu ?? '—'} · ${s.ad}` }))}
        bosSecenek={aranan.length < 2 ? 'Önce arayın' : sonuc.isPending ? 'Aranıyor' : `${satirlar.length} sonuç`}
        value=""
        onChange={(o) => {
          const s = satirlar.find((x) => String(x.id) === o.target.value);
          if (s) sec(s.id, s.stokKodu ?? s.ad);
        }}
      />
    </div>
  );
}

// Kutu yazılan metni tutar: "0," ya da "0,0" yazılırken değer 0'dır ve metin değerden yeniden yazılsaydı ondalık girilemezdi.
// Değer dışarıdan değişirse (yer yeniden işaretlendi) metin değerden yazılır. Boş ya da sayı olmayan metin `bos` değerini verir.
function OlcuGirdi({ etiket, ipucu, deger, degistir, bos = null }: {
  etiket: string; ipucu?: string; deger: number | null; degistir: (d: number | null) => void; bos?: number | null;
}) {
  const [durum, durumYaz] = useState({ metin: olcuMetni(deger), deger });
  if (durum.deger !== deger) durumYaz({ metin: olcuMetni(deger), deger });
  return (
    <Girdi
      etiket={etiket}
      ipucu={ipucu}
      inputMode="decimal"
      value={durum.deger === deger ? durum.metin : olcuMetni(deger)}
      onChange={(o) => {
        const d = sayi(o.target.value) ?? bos;
        durumYaz({ metin: o.target.value, deger: d });
        degistir(d);
      }}
    />
  );
}

function AlanFormu({ alan, degistir, yerKaldir }: { alan: AlanGovdesi; degistir: (a: Partial<AlanGovdesi>) => void; yerKaldir: () => void }) {
  const yer = alan.yer;
  return (
    <div className="tc-mrk-alan-formu">
      <div className="tc-mrk-satir">
        <Girdi etiket="Marka adı" value={alan.ad} maxLength={60} onChange={(o) => degistir({ ad: o.target.value })} />
        <Secim
          etiket="İçerik"
          secenekler={secenekler(ICERIKLER, ICERIK_ADLARI)}
          value={alan.icerik}
          onChange={(o) => {
            const icerik = o.target.value as AlanGovdesi['icerik'];
            degistir({ icerik, sabitMetin: icerik === 'sabit' ? alan.sabitMetin ?? '' : null });
          }}
        />
        {alan.icerik === 'sabit' && (
          <Girdi etiket="Sabit metin" value={alan.sabitMetin ?? ''} maxLength={40} onChange={(o) => degistir({ sabitMetin: o.target.value })} />
        )}
      </div>
      <div className="tc-mrk-yontemler" role="radiogroup" aria-label="Markalama yöntemi">
        {YONTEMLER.map((y) => (
          <button
            key={y}
            type="button"
            role="radio"
            aria-checked={alan.yontem === y}
            className={`tc-mrk-yontem${alan.yontem === y ? ' tc-mrk-yontem-secili' : ''}`}
            onClick={() => degistir({ yontem: y })}
          >
            {YONTEM_ADLARI[y]}
          </button>
        ))}
      </div>
      <div className="tc-mrk-satir">
        <Secim etiket="Kod" secenekler={secenekler(KOD_TURLERI, KOD_TURU_ADLARI)} value={alan.kodTuru} onChange={(o) => degistir({ kodTuru: o.target.value as AlanGovdesi['kodTuru'] })} />
        <Secim
          etiket="Yazı tipi"
          secenekler={secenekler(YAZI_TIPLERI, YAZI_TIPI_ADLARI)}
          bosSecenek="Makinenin varsayılanı"
          value={alan.yaziTipi ?? ''}
          onChange={(o) => degistir({ yaziTipi: o.target.value === '' ? null : o.target.value as NonNullable<AlanGovdesi['yaziTipi']> })}
        />
        <Girdi etiket="Program / şablon dosyası" value={alan.program ?? ''} maxLength={40} onChange={(o) => degistir({ program: bosOlur(o.target.value) })} />
      </div>
      <div className="tc-mrk-satir">
        <OlcuGirdi etiket="Yazı yüksekliği (mm)" ipucu="Boş bırakılabilir" deger={alan.yaziYuksekligiMm} degistir={(d) => degistir({ yaziYuksekligiMm: d })} />
        <OlcuGirdi etiket="Yazı derinliği (mm)" ipucu="Boş bırakılabilir; ör. 0,05" deger={alan.yaziDerinligiMm} degistir={(d) => degistir({ yaziDerinligiMm: d })} />
      </div>
      <Girdi etiket="Yüzey tarifi" ipucu="Operatörün okuyacağı kısa tarif" value={alan.yuzey ?? ''} maxLength={120} onChange={(o) => degistir({ yuzey: bosOlur(o.target.value) })} />
      {yer === null ? (
        <p className="tc-mrk-ipucu">Yer seçilmedi: modelin yüzeyine dokunarak işaretleyin.</p>
      ) : (
        <div className="tc-mrk-satir">
          <OlcuGirdi etiket="En (mm)" bos={0} deger={yer.enMm} degistir={(d) => degistir({ yer: { ...yer, enMm: d ?? 0 } })} />
          <OlcuGirdi etiket="Boy (mm)" bos={0} deger={yer.boyMm} degistir={(d) => degistir({ yer: { ...yer, boyMm: d ?? 0 } })} />
          <OlcuGirdi etiket="Açı (°)" bos={0} deger={yer.aciDerece} degistir={(d) => degistir({ yer: { ...yer, aciDerece: d ?? 0 } })} />
          <Dugme simge="x" onClick={yerKaldir}>Yeri kaldır</Dugme>
        </div>
      )}
    </div>
  );
}

function Onizleme({ tanimId }: { tanimId: number }) {
  const q = useQuery({ queryKey: anahtarlar.onizleme(tanimId, null), queryFn: () => api.get<OnizlemeCevabi>(`/markalama/tanimlar/${tanimId}/onizleme`) });
  if (q.isPending) return null;
  if (q.isError) return <p className="tc-mrk-ipucu">{hataIletisi(q.error, 'Önizleme alınamadı.')}</p>;
  return (
    <div className="tc-mrk-onizleme" aria-label="Sıradaki seri numaraları">
      {q.data.numaralar.map((n) => <span key={n} className="mono">{n}</span>)}
    </div>
  );
}

function Duzenleyici({ ilk, yazabilir, kaydedildi }: { ilk: Taslak; yazabilir: boolean; kaydedildi: (id: number) => void }) {
  const [t, tYaz] = useState<Taslak>(ilk);
  const [secili, seciliYaz] = useState(0);
  const [denetim, denetimYaz] = useState<string | null>(null);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const degistir = (d: Partial<Taslak>) => tYaz((o) => ({ ...o, ...d }));
  const alanDegistir = (i: number, d: Partial<AlanGovdesi>) => tYaz((o) => ({ ...o, alanlar: o.alanlar.map((a, j) => (j === i ? { ...a, ...d } : a)) }));
  const kaydet = useMutation({
    mutationFn: () => {
      const ortak = {
        seriSablonu: t.seriSablonu, sayacKapsami: t.sayacKapsami, baslangicSirasi: sayi(t.baslangicSirasi) ?? 0, dogrulama: t.dogrulama, model: t.model,
        alanlar: t.alanlar,
      };
      if (t.id === null) {
        const govde: TanimEkleGovdesi = { ...ortak, malzemeId: t.malzemeId ?? 0, opNo: sayi(t.opNo) ?? 0 };
        return api.post<MarkalamaTanimi>('/markalama/tanimlar/ekle', govde);
      }
      const govde: TanimKaydetGovdesi = { ...ortak, surum: t.surum ?? 0 };
      return api.post<MarkalamaTanimi>(`/markalama/tanimlar/${t.id}/kaydet`, govde);
    },
    onSuccess: async (kayit) => {
      tYaz(taslakYap(kayit));
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', 'Markalama tanımı kaydedildi');
      kaydedildi(kayit.id);
    },
  });
  const sahneMarkalari = t.alanlar.flatMap((a, i) => (a.yer === null ? [] : [{
    sira: i, yer: a.yer, metin: a.icerik === 'sabit' ? a.sabitMetin ?? '' : t.seriSablonu,
  }]));
  const yerSec = yazabilir && t.alanlar[secili]
    ? (nokta: Vector3, normal: Vector3) => {
      const onceki = t.alanlar[secili]?.yer;
      alanDegistir(secili, { yer: yerOlustur(nokta, normal, onceki?.enMm, onceki?.boyMm, onceki?.aciDerece) });
    }
    : undefined;

  return (
    <div className="tc-mrk-duzen">
      <Kart baslik={t.id === null ? 'Yeni markalama tanımı' : `${t.malzemeKodu ?? `#${t.malzemeId}`} · Op ${t.opNo}`} simge="tag">
        <fieldset className="tc-mrk-form" disabled={!yazabilir}>
          {t.id === null && (
            <>
              {t.malzemeId === null
                ? <MalzemeSecici sec={(id, kod) => degistir({ malzemeId: id, malzemeKodu: kod })} />
                : <p className="tc-mrk-ipucu">Malzeme: <b className="mono">{t.malzemeKodu}</b> <Dugme simge="x" onClick={() => degistir({ malzemeId: null, malzemeKodu: null, model: null })}>Değiştir</Dugme></p>}
              <Girdi etiket="Rota operasyon no" ipucu="Markalamanın yapıldığı rota adımı (ör. 40)" inputMode="numeric" value={t.opNo} onChange={(o) => degistir({ opNo: o.target.value })} />
            </>
          )}
          <h3 className="tc-mrk-bolum">Seri numarası</h3>
          <Girdi etiket="Şablon" className="mono" value={t.seriSablonu} maxLength={60} onChange={(o) => degistir({ seriSablonu: o.target.value })} />
          <div className="tc-mrk-parcalar" aria-label="Şablon parçaları">
            {SABLON_PARCALARI.map((p) => (
              <button key={p} type="button" className="tc-mrk-parca" title={SABLON_ACIKLAMALARI[p]} onClick={() => degistir({ seriSablonu: t.seriSablonu + p })}>
                <span className="mono">{p}</span> {SABLON_ACIKLAMALARI[p]}
              </button>
            ))}
          </div>
          <div className="tc-mrk-satir">
            <Secim etiket="Sayaç" secenekler={secenekler(SAYAC_KAPSAMLARI, KAPSAM_ADLARI)} value={t.sayacKapsami} onChange={(o) => degistir({ sayacKapsami: o.target.value as SayacKapsami })} />
            <Girdi etiket="Başlangıç sırası" inputMode="numeric" value={t.baslangicSirasi} onChange={(o) => degistir({ baslangicSirasi: o.target.value })} />
          </div>
          {t.id !== null && <Onizleme key={t.surum} tanimId={t.id} />}
          <IsaretKutusu etiket="Markadan sonra okutup doğrula" checked={t.dogrulama} onChange={(o) => degistir({ dogrulama: o.target.checked })} />

          <h3 className="tc-mrk-bolum">Markalar ve sırası</h3>
          <ol className="tc-mrk-markalar">
            {t.alanlar.map((a, i) => (
              <li key={i} className={i === secili ? 'tc-mrk-marka tc-mrk-marka-secili' : 'tc-mrk-marka'}>
                <button type="button" className="tc-mrk-marka-sec" onClick={() => seciliYaz(i)} aria-pressed={i === secili}>
                  <span className="tc-mrk-sira">{i + 1}</span>
                  <span>{a.ad || 'Adsız'}</span>
                  <span className="tc-mrk-ipucu">{YONTEM_ADLARI[a.yontem]}{a.yer === null ? ' · yer yok' : ''}</span>
                </button>
                {yazabilir && (
                  <span className="tc-mrk-marka-arac">
                    <Dugme simge="up" aria-label="Yukarı al" disabled={i === 0} onClick={() => { tYaz((o) => { const l = [...o.alanlar]; [l[i - 1], l[i]] = [l[i]!, l[i - 1]!]; return { ...o, alanlar: l }; }); seciliYaz(i - 1); }} />
                    <Dugme simge="trash" aria-label="Markayı sil" disabled={t.alanlar.length === 1} onClick={() => { tYaz((o) => ({ ...o, alanlar: o.alanlar.filter((_, j) => j !== i) })); seciliYaz(0); }} />
                  </span>
                )}
              </li>
            ))}
          </ol>
          {yazabilir && t.alanlar.length < AZAMI_ALAN && (
            <Dugme simge="plus" onClick={() => { tYaz((o) => ({ ...o, alanlar: [...o.alanlar, yeniAlan(o.alanlar.length)] })); seciliYaz(t.alanlar.length); }}>Marka ekle</Dugme>
          )}
          {t.alanlar[secili] && (
            <AlanFormu key={secili} alan={t.alanlar[secili]} degistir={(d) => alanDegistir(secili, d)} yerKaldir={() => alanDegistir(secili, { yer: null })} />
          )}
          {denetim !== null && <p className="tc-mrk-hata" role="alert">{denetim}</p>}
          {denetim === null && kaydet.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(kaydet.error, 'Tanım kaydedilemedi')}</p>}
        </fieldset>
        {yazabilir && (
          <div className="tc-mrk-arac">
            <Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} disabled={t.malzemeId === null} onClick={() => {
              const hata = taslakHatasi({ yeni: t.id === null, opNo: t.opNo, baslangicSirasi: t.baslangicSirasi, alanlar: t.alanlar });
              denetimYaz(hata);
              if (hata === null) kaydet.mutate();
            }}
            >
              Kaydet
            </Dugme>
          </div>
        )}
      </Kart>
      <Kart baslik="3B önizleme" simge="cube">
        {t.malzemeId === null
          ? <DurumKutusu durum="bos" mesaj="Önce malzemeyi seçin." />
          : (
            <ModelPaneli
              malzemeId={t.malzemeId}
              model={t.model}
              {...(yazabilir ? { modelSec: (m: Taslak['model']) => degistir({ model: m }) } : {})}
              markalar={sahneMarkalari}
              secili={secili}
              {...(yerSec ? { yerSec } : {})}
            />
          )}
      </Kart>
    </div>
  );
}

export function Tanimlar() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('markalama.tanim-yaz') === true;
  const [secim, secimYaz] = useState<number | 'yeni' | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.tanimlar, queryFn: () => api.get<TanimlarCevabi>('/markalama/tanimlar') });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const secili = typeof secim === 'number' ? liste.data.tanimlar.find((t) => t.id === secim) : undefined;
  return (
    <div className="tc-mrk-sayfa">
      <Kart
        baslik="Markalama tanımları"
        simge="target"
        sag={yazabilir ? <Dugme tur="birincil" simge="plus" onClick={() => secimYaz('yeni')}>Yeni tanım</Dugme> : undefined}
      >
        <Tablo
          etiket="Markalama tanımları"
          sutunlar={SUTUNLAR}
          satirlar={liste.data.tanimlar}
          satirAnahtari={(t) => t.id}
          satirSec={(t) => secimYaz(t.id)}
          bosMesaj="Henüz markalama tanımı yok"
        />
      </Kart>
      {secim === 'yeni' && <Duzenleyici key="yeni" ilk={YENI} yazabilir={yazabilir} kaydedildi={secimYaz} />}
      {secili && <Duzenleyici key={secili.id} ilk={taslakYap(secili)} yazabilir={yazabilir} kaydedildi={secimYaz} />}
    </div>
  );
}
