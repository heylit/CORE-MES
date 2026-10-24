import { useEffect, useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { GrafikKarti } from '../../../../ortak/arayuz/GrafikKarti.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { CubukListesiKarti } from '../../../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import type { Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { trd } from '../bicim.ts';
import { Damga, KayitListesi } from '../KayitListesi.tsx';
import { bugun, kilitliMi } from '../kurallar.ts';
import { KILIT_ILETISI } from '../ncr/ncr-kurallari.ts';
import { useOnizleme } from '../Onizleme.tsx';
import { D8, KAPALI } from '../sabitler.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { YENI_KAYIT, type Dof as DofKaydi } from '../tipler.ts';
import { useKmKomutu } from '../veri.ts';
import { DofBelgesi } from './DofBelgesi.tsx';
import { DofFormu } from './DofFormu.tsx';
import { adimDagilimi, adimDegistir, adimSayisi, dofSayisi, durumTonu, etkinlikTonu, gecikti, terminMetni, yaslandirma } from './dof-kurallari.ts';
import '../ncr/ncr.css';
import './dof.css';

// Uygulamanın CSV_COLS.capa'sı.
const CSV_SUTUNLARI: readonly (readonly [string, string])[] = [
  ['no', 'DÖF no'], ['baslik', 'Başlık'], ['sorumlu', 'Sorumlu'], ['acilis', 'Açılış'], ['termin', 'Termin'], ['adim', '8D adımı'], ['kokNeden', 'Kök neden'],
  ['aksiyon', 'Aksiyon'], ['etkinlik', 'Etkinlik'], ['durum', 'Durum'],
];

const DURUM_SUZGECI = [{ deger: 'Açık', baslik: 'Açık' }, { deger: KAPALI, baslik: KAPALI }, { deger: '', baslik: 'Tümü' }];

type Form = { rec: DofKaydi | null; on?: Record<string, unknown> };

export function Dof({ veri, yetki, gecis, gecisTamam }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const onizle = useOnizleme();
  const [form, formYaz] = useState<Form | null>(null);
  const [silinecek, silinecekYaz] = useState<DofKaydi | null>(null);
  const simdi = bugun();

  const ac = (c: DofKaydi) => {
    if (kilitliMi('capa', c)) { bildir('hata', KILIT_ILETISI); return; }
    formYaz({ rec: c });
  };
  const rapor = (c: DofKaydi) => onizle(`8D raporu ${c.no ?? ''}`, `8D_${c.no ?? ''}`, <DofBelgesi veri={veri} c={c} />);

  useEffect(() => {
    if (!gecis?.ac) return;
    if (gecis.ac === YENI_KAYIT) { if (yetki.yaz) formYaz({ rec: null, on: gecis.on }); }
    else {
      const c = veri.capa.find((x) => x._id === gecis.ac);
      if (c) { if (yetki.yaz) ac(c); else rapor(c); }
    }
    gecisTamam();
  // Geçiş bir kez işlenir.
  }, [gecis]);

  const adimIsaretle = async (c: DofKaydi, i: number) => {
    const adim = adimDegistir(c, i);
    if (adim === null) return;
    try {
      await komut.kaydet('capa', { ...c, adim });
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Adım kaydedilemedi.'));
    }
  };

  const sil = async (c: DofKaydi) => {
    silinecekYaz(null);
    try {
      await komut.sil('capa', c._id);
      bildir('tamam', 'Kayıt silindi');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Kayıt silinemedi.'));
    }
  };

  const csv = () => csvIndir('capa', CSV_SUTUNLARI.map(([, b]) => b), veri.capa.map((r) => CSV_SUTUNLARI.map(([k]) => {
    const v = r[k];
    return typeof v === 'number' || typeof v === 'string' ? v : null;
  })));

  const sutunlar: Sutun<DofKaydi>[] = [
    { anahtar: 'no', baslik: 'DÖF', kirilmaz: true, csv: false, hucre: (c) => <><span className="mono">{c.no}</span><span className="tc-km-iki">{c.tur ?? ''}</span></> },
    { anahtar: 'baslik', baslik: 'Problem', csv: false, hucre: (c) => (
      <>{c.baslik}<span className="tc-km-iki">{c.ncrRef ? veri.ncr.find((n) => n._id === c.ncrRef)?.no ?? '' : ''}</span></>
    ) },
    { anahtar: 'sorumlu', baslik: 'Sorumlu', csv: false, hucre: (c) => c.sorumlu ?? '' },
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, csv: false, hucre: (c) => (
      <>{trd(c.termin)}<span className={`tc-km-iki${gecikti(c, simdi) ? ' tc-km3-gecikme' : ''}`}>{terminMetni(c, simdi, trd)}</span></>
    ) },
    { anahtar: 'adim', baslik: '8D ilerleme', csv: false, hucre: (c) => {
      const adim = adimSayisi(c);
      const degisir = yetki.yaz && c.durum !== KAPALI;
      return (
        <span className="tc-km3-d8" role="group" aria-label="8D adımları" onClick={(o) => o.stopPropagation()} onKeyDown={(o) => o.stopPropagation()}>
          {D8.map((d, i) => (
            <button key={d} type="button" title={`D${i + 1}: ${d}`} aria-pressed={adim > i} disabled={!degisir}
              onClick={() => void adimIsaretle(c, i + 1)}>D{i + 1}</button>
          ))}
        </span>
      );
    } },
    { anahtar: 'etkinlik', baslik: 'Etkinlik', csv: false, hucre: (c) => <Damga ton={etkinlikTonu(c.etkinlik)}>{c.etkinlik || 'Doğrulanmadı'}</Damga> },
    { anahtar: 'durum', baslik: 'Durum', csv: false, hucre: (c) => <Damga ton={durumTonu(c, simdi)}>{c.durum ?? ''}</Damga> },
    { anahtar: 'islem', baslik: 'İşlem', csv: false, hucre: (c) => (
      <span className="tc-km3-eylemler" onClick={(o) => o.stopPropagation()} onKeyDown={(o) => o.stopPropagation()}>
        {yetki.yaz && !kilitliMi('capa', c) && <Dugme simge="edit" onClick={() => ac(c)}>Düzenle</Dugme>}
        <Dugme simge="printer" onClick={() => rapor(c)}>Rapor</Dugme>
        {yetki.silebilir('capa') && <Dugme tur="tehlike" simge="trash" onClick={() => silinecekYaz(c)}>Sil</Dugme>}
      </span>
    ) },
  ];

  const satirlar = [...veri.capa].sort((a, b) => (a.termin ?? '').localeCompare(b.termin ?? ''));

  return (
    <div className="tc-km3">
      <SayfaBasligi
        baslik="DÖF / 8D" simge="wrench"
        alt="Düzeltici faaliyetler: kök neden, kalıcı aksiyon ve etkinlik doğrulaması. 8D kutucuklarına tıklayarak adımı işaretleyin."
        birincil={yetki.yaz ? { etiket: 'DÖF aç', simge: 'plus', yap: () => formYaz({ rec: null }) } : undefined}
      />
      <KayitListesi<DofKaydi>
        etiket="DÖF / 8D"
        satirlar={satirlar}
        sutunlar={sutunlar}
        suzgec={{ etiket: 'Durum', secenekler: DURUM_SUZGECI, ilk: 'Açık', uyar: (c, d) => c.durum === d }}
        arsivli
        ac={(c) => (yetki.yaz ? ac(c) : rapor(c))}
        bos={veri.capa.length ? 'Bu filtrede DÖF yok. Filtreyi "Tümü" yapın.' : 'Henüz DÖF yok. Uygunsuzluklar listesinden "DÖF aç" ile ya da doğrudan başlatabilirsiniz.'}
        sag={<Dugme simge="download" disabled={veri.capa.length === 0} onClick={csv}>CSV indir</Dugme>}
      />
      <p className="tc-km3-d8-aciklama">{D8.map((d, i) => <span key={d}><b>D{i + 1}</b> {d}</span>)}</p>
      <div className="tc-km3-grafikler">
        <CubukListesiKarti baslik="Açık DÖF yaşlandırma" simge="clock" altMetin="Açılıştan bu yana geçen gün"
          satirlar={veri.capa.length ? yaslandirma(veri.capa, simdi) : null} birim="adet" />
        <GrafikKarti baslik="Adım dağılımı" simge="chart" tur="cubuk"
          altMetin="Açık DÖF'lerin bulunduğu 8D adımı. D4'te yığılma, kök neden analizinin tıkandığını gösterir."
          noktalar={veri.capa.length ? adimDagilimi(veri.capa) : null} birim="adet" />
      </div>
      {form && <DofFormu veri={veri} yetki={yetki} rec={form.rec} on={form.on} kapat={() => formYaz(null)} />}
      <OnayPenceresi acik={silinecek !== null} baslik="Kaydı sil" tehlikeli onayMetni="Sil"
        onayla={() => { if (silinecek) void sil(silinecek); }} vazgec={() => silinecekYaz(null)}>
        <p><b>{silinecek?.no ?? ''}</b> kalıcı olarak silinecek. Bağlı kayıtlardaki referanslar boş kalır.</p>
      </OnayPenceresi>
    </div>
  );
}

export const DofSayaci: KmSayaci = (veri) => dofSayisi(veri.capa, bugun());
