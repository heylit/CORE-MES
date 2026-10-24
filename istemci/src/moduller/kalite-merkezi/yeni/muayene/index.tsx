import { useEffect, useState } from 'react';
import {
  Dugme, OnayPenceresi, Rozet, SayfaBasligi, useBildirim, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { trd, YOK } from '../bicim.ts';
import { KayitListesi } from '../KayitListesi.tsx';
import { useOnizleme } from '../Onizleme.tsx';
import { INSP_TUR } from '../sabitler.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { Muayene } from '../tipler.ts';
import { useKmKomutu } from '../veri.ts';
import { CubukGrafigi } from '../spc/Grafik.tsx';
import { FaiPaketi, faiIcerigi } from './FaiPaketi.tsx';
import { kayitCsvIndir, type CsvSutunlari } from './csv.ts';
import { ilkGecis, muayeneAranan, muayeneSirasi, retNcrOnDegeri, sonucTonu, type MuayeneDegeri } from './hesap.ts';
import { KILIT_YASAK, KilitPenceresi, kilitKarari } from './Kilit.tsx';
import { MuayeneBelgesi } from './MuayeneBelgesi.tsx';
import { MuayeneFormu } from './MuayeneFormu.tsx';
import './muayene.css';

// Uygulamadaki CSV sütunları (CSV_COLS.insp).
// Uygulamanın ikinci menüsünde muayene sayacı yoktur (navCounts).
export const MuayenelerSayaci: KmSayaci = null;

export const MUAYENE_CSV: CsvSutunlari = [
  ['no', 'Muayene no'], ['tur', 'Tür'], ['tarih', 'Tarih'], ['parcaNo', 'Parça no'], ['rev', 'Rev'], ['lot', 'Lot'],
  ['numune', 'Numune'], ['muayeneci', 'Muayeneci'], ['sonuc', 'Sonuç'],
];

type Form = { kayit: Muayene | null; on?: Partial<Muayene> } | null;

export function Muayeneler({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const onizle = useOnizleme();
  const [form, formYaz] = useState<Form>(null);
  const [kilit, kilitYaz] = useState<Muayene | null>(null);
  const [ret, retYaz] = useState<MuayeneDegeri | null>(null);
  const [silinecek, silinecekYaz] = useState<Muayene | null>(null);

  // Kilitli (sonuçlu) muayene düzenlenmeden önce gerekçe sorulur; yetkisi olmayana ileti verilir.
  const duzenle = (i: Muayene) => {
    const k = kilitKarari('insp', i, yetki);
    if (k === 'yasak') { bildir('hata', KILIT_YASAK); return; }
    if (k === 'sor') { kilitYaz(i); return; }
    formYaz({ kayit: i });
  };

  useEffect(() => {
    if (!gecis) return;
    gecisTamam();
    if (gecis.ac === 'yeni') { if (yetki.yaz) formYaz({ kayit: null, on: gecis.on as Partial<Muayene> | undefined }); return; }
    const i = gecis.ac ? veri.insp.find((x) => x._id === gecis.ac) : undefined;
    if (i && yetki.yaz) duzenle(i);
  }, [gecis]);

  const rapor = (i: Muayene) => { onizle(`${i.no ?? ''} raporu`, `Muayene_${i.no ?? ''}`, <MuayeneBelgesi veri={veri} i={i} />); };
  const fai = (i: Muayene) => {
    onizle(`FAI paketi: ${i.no ?? ''}`, `FAI_paketi_${i.no ?? ''}`, <FaiPaketi veri={veri} icerik={faiIcerigi(veri, i)} komut={komut} />);
    void komut.izYaz({ islem: 'FAI paketi oluşturma', col: 'insp', id: i._id, no: i.no });
  };

  const sutunlar: Sutun<Muayene>[] = [
    { anahtar: 'no', baslik: 'Muayene', hucre: (i) => <><span className="tc-km2-kod">{i.no}</span><span className="tc-km2-iki">{trd(i.tarih)}</span></>, kirilmaz: true },
    { anahtar: 'tur', baslik: 'Tür', hucre: (i) => <>{i.tur}{i.tur === 'FAI' && i.faiNeden && <span className="tc-km2-iki">{i.faiNeden}</span>}</> },
    { anahtar: 'parca', baslik: 'Parça', hucre: (i) => <>{`${i.parcaNo ?? ''} rev ${i.rev || YOK}`}<span className="tc-km2-iki">{i.parcaAdi}</span></> },
    { anahtar: 'lot', baslik: 'Lot', hucre: (i) => i.lot ?? '' },
    { anahtar: 'numune', baslik: 'Numune', hucre: (i) => i.numune ?? YOK, hizala: 'sag', mono: true },
    { anahtar: 'muayeneci', baslik: 'Muayeneci', hucre: (i) => i.muayeneci ?? '' },
    {
      anahtar: 'kar', baslik: 'Karakteristik', hucre: (i) => {
        const ch = i.chars ?? [];
        const nok = ch.filter((c) => c.sonuc === 'NOK').length;
        return <>{`${ch.length} ölçüm`}{nok > 0 && <>, <b className="tc-km2-ret">{`${nok} ret`}</b></>}</>;
      },
    },
    { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (i) => <Rozet ton={sonucTonu(i.sonuc)}>{i.sonuc ?? YOK}</Rozet> },
    {
      anahtar: 'islem', baslik: '', hucre: (i) => (
        // Satır tıklaması kaydı açar; satırdaki düğme yalnız kendi işini yapsın.
        <span className="tc-km2-eylemler" onClick={(e) => { e.stopPropagation(); }}>
          {i.adimli && i.sonuc === 'Devam ediyor' && !!i.cizimId && yetki.yaz && (
            <Dugme simge="ruler" onClick={() => { git('resimler'); }}>Ölçüme devam</Dugme>
          )}
          {i.tur === 'FAI' && i.sonuc !== 'Devam ediyor' && <Dugme simge="file" onClick={() => { fai(i); }}>FAI paketi</Dugme>}
          {yetki.yaz && <Dugme simge="edit" onClick={() => { duzenle(i); }}>Düzenle</Dugme>}
          <Dugme simge="printer" onClick={() => { rapor(i); }}>Rapor</Dugme>
          {yetki.silebilir('insp') && <Dugme tur="tehlike" simge="trash" onClick={() => { silinecekYaz(i); }}>Sil</Dugme>}
        </span>
      ),
    },
  ];

  const fpy = ilkGecis(veri.insp);

  return (
    <div className="tc-km2-muayene">
      <SayfaBasligi
        baslik="Muayene ve FAI" simge="clipboard-check"
        alt="Giriş, proses, final ve AS9102 ilk parça muayeneleri; karakteristik bazlı ölçüm, cihaz ve revizyon izlenebilirliğiyle."
        birincil={yetki.yaz ? { etiket: 'Muayene kaydet', simge: 'plus', yap: () => { formYaz({ kayit: null }); } } : undefined}
        eylemler={yetki.yaz ? [{ anahtar: 'fai', baslik: 'FAI kaydet', simge: 'file', sec: () => { formYaz({ kayit: null, on: { tur: 'FAI' } }); } }] : []}
      />
      <KayitListesi<Muayene>
        etiket="Muayeneler"
        satirlar={muayeneSirasi(veri.insp)}
        sutunlar={sutunlar}
        arsivli
        ara={muayeneAranan}
        aramaYeri="Muayene, parça, lot veya muayeneci ara"
        suzgec={{ etiket: 'Tür', ilk: '', uyar: (i, t) => i.tur === t, secenekler: [{ deger: '', baslik: 'Tüm türler' }, ...INSP_TUR.map((t) => ({ deger: t, baslik: t }))] }}
        sag={<Dugme tur="ikincil" simge="download" onClick={() => { kayitCsvIndir('insp', veri.insp, MUAYENE_CSV); }}>CSV</Dugme>}
        ac={yetki.yaz ? duzenle : rapor}
        bos="Henüz muayene kaydı yok. Karakteristik bazlı ilk muayeneyi kaydedin; ret çıkarsa sistem NCR açmayı önerir."
      />
      <section className="tc-km2-panel">
        <h3 className="tc-km2-bolum">Kapı bazında ilk geçiş oranı</h3>
        <p className="tc-km2-kucuk">Tüm kayıtlar; kabul / toplam</p>
        {veri.insp.length ? (
          <CubukGrafigi
            etiket="Kapı bazında ilk geçiş oranı" yatay enCok={100} bicim={(v) => `%${v}`}
            kategoriler={fpy.map((x) => x.tur)}
            seriler={[{ ad: 'İlk geçiş %', degerler: fpy.map((x) => x.oran ?? 0), renk: (i) => { const v = fpy[i]?.oran ?? 0; return v >= 95 ? 'tamam' : v >= 85 ? 'uyari' : 'hata'; } }]}
          />
        ) : <p className="tc-km2-kucuk">Henüz veri yok</p>}
      </section>
      {form && (
        <MuayeneFormu
          veri={veri} yetki={yetki} kayit={form.kayit} on={form.on} kapat={() => { formYaz(null); }}
          retOldu={retYaz}
        />
      )}
      {kilit && (
        <KilitPenceresi
          yetki={yetki} kol="insp" kimlik={kilit._id} no={kilit.no ?? ''}
          devam={() => { const k = kilit; kilitYaz(null); formYaz({ kayit: k }); }} vazgec={() => { kilitYaz(null); }}
        />
      )}
      <OnayPenceresi
        acik={ret !== null} baslik="Muayene ret" onayMetni="NCR aç"
        onayla={() => { const d = ret; retYaz(null); if (d) git('uygunsuzluklar', { ac: 'yeni', on: retNcrOnDegeri(d) }); }}
        vazgec={() => { retYaz(null); }}
      >
        <p>Muayene <b>Ret</b> olarak kaydedildi. Uygun olmayan ürün için NCR açılsın mı?</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={silinecek !== null} baslik="Kaydı sil" onayMetni="Sil" tehlikeli
        onayla={() => {
          const r = silinecek; silinecekYaz(null);
          if (r) void komut.sil('insp', r._id).then(() => { bildir('tamam', 'Kayıt silindi'); }, () => { bildir('hata', 'Kayıt silinemedi.'); });
        }}
        vazgec={() => { silinecekYaz(null); }}
      >
        {silinecek && <p><b>{silinecek.no}</b> kalıcı olarak silinecek. Bağlı kayıtlardaki referanslar kalır.</p>}
      </OnayPenceresi>
    </div>
  );
}
