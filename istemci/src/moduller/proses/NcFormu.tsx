import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  NcDurumu, NcKontrolu, NcProgramEkleGovdesi, NcProgramKaydetGovdesi, NcProgramYazmaCevabi, ProsesNcProgrami, ProsesRevizyonu,
} from '#paylasilan/sozlesme/proses.ts';
import {
  CokSatir, Dugme, FormPenceresi, Girdi, MakineSecici, MalzemeSecici, Secim, useBildirim, type SeciliKayit,
} from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useForm } from '../../ortak/veri/form.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { NC_DURUM, NC_KONTROL, TUM_REVIZYONLAR } from './nc.ts';

interface TakimSatiri { tNo: string; kart: SeciliKayit | null; tutucu: string; cikintiMm: string; islem: string }
interface AparatSatiri { kart: SeciliKayit | null; aciklama: string }

interface Degerler {
  revizyonKodu: string;
  ad: string;
  kontrol: string;
  makine: SeciliKayit | null;
  camYazilimi: string;
  camDosyasi: string;
  sifirNoktasi: string;
  cevrimSuresiDk: string;
  durum: NcDurumu;
  aciklama: string;
  takimlar: TakimSatiri[];
  aparatlar: AparatSatiri[];
}

const metin = (x: string | null): string => x ?? '';
const ondalik = (x: string | null): string => (x === null ? '' : String(Number(x)).replace('.', ','));
const kartSecimi = (k: { id: number; kod: string; ad: string | null }): SeciliKayit => ({ id: k.id, kod: k.kod, ad: k.ad ?? '' });

function ilkDegerler(p: ProsesNcProgrami | null, revizyon: string | null): Degerler {
  if (p === null) {
    return {
      revizyonKodu: revizyon ?? '', ad: '', kontrol: '', makine: null, camYazilimi: '', camDosyasi: '', sifirNoktasi: '', cevrimSuresiDk: '',
      durum: 'taslak', aciklama: '', takimlar: [], aparatlar: [],
    };
  }
  return {
    revizyonKodu: metin(p.revizyonKodu), ad: p.ad, kontrol: metin(p.kontrol),
    makine: p.makine === null ? null : { id: p.makine.id, kod: p.makine.kod, ad: '' },
    camYazilimi: metin(p.camYazilimi), camDosyasi: metin(p.camDosyasi), sifirNoktasi: metin(p.sifirNoktasi),
    cevrimSuresiDk: ondalik(p.cevrimSuresiDk), durum: p.durum, aciklama: metin(p.aciklama),
    takimlar: p.takimlar.map((t) => ({ tNo: t.tNo, kart: kartSecimi(t.kart), tutucu: metin(t.tutucu), cikintiMm: ondalik(t.cikintiMm), islem: metin(t.islem) })),
    aparatlar: p.aparatlar.map((a) => ({ kart: kartSecimi(a.kart), aciklama: metin(a.aciklama) })),
  };
}

const sayiYaz = (x: string): number | null => (x.trim() === '' ? null : Number(x.replace(',', '.')));
const sayiGecersiz = (x: string): boolean => x.trim() !== '' && !(Number(x.replace(',', '.')) > 0);

function dogrula(d: Degerler): Record<string, string> {
  const h: Record<string, string> = {};
  if (d.ad.trim() === '') h['ad'] = 'Program adı boş olamaz.';
  if (sayiGecersiz(d.cevrimSuresiDk)) h['cevrimSuresiDk'] = 'Çevrim süresi sıfırdan büyük bir sayı olmalı.';
  d.takimlar.forEach((t, i) => {
    if (!/^T?[0-9]{1,4}$/i.test(t.tNo.trim())) h[`takimlar.${String(i)}.tNo`] = 'T ve en çok dört rakam (T12).';
    if (t.kart === null) h[`takimlar.${String(i)}.malzemeId`] = 'Takım kartı seçin.';
    if (sayiGecersiz(t.cikintiMm)) h[`takimlar.${String(i)}.cikintiMm`] = 'Sıfırdan büyük sayı.';
  });
  d.aparatlar.forEach((a, i) => { if (a.kart === null) h[`aparatlar.${String(i)}.malzemeId`] = 'Aparat kartı seçin.'; });
  return h;
}

function govdeKur(d: Degerler): Omit<NcProgramKaydetGovdesi, 'surum'> {
  return {
    revizyonKodu: d.revizyonKodu === '' ? null : d.revizyonKodu, ad: d.ad,
    kontrol: d.kontrol === '' ? null : (d.kontrol as NcKontrolu), makineId: d.makine?.id ?? null,
    camYazilimi: d.camYazilimi, camDosyasi: d.camDosyasi, sifirNoktasi: d.sifirNoktasi, cevrimSuresiDk: sayiYaz(d.cevrimSuresiDk),
    durum: d.durum, aciklama: d.aciklama,
    takimlar: d.takimlar.map((t) => ({ tNo: t.tNo, malzemeId: t.kart?.id ?? 0, tutucu: t.tutucu, cikintiMm: sayiYaz(t.cikintiMm), islem: t.islem })),
    aparatlar: d.aparatlar.map((a) => ({ malzemeId: a.kart?.id ?? 0, aciklama: a.aciklama })),
  };
}

interface Ozellikler {
  malzemeNo: number;
  opNo: number;
  opAdi: string;
  // Düzenlenen program; null yeni program.
  program: ProsesNcProgrami | null;
  revizyonlar: readonly ProsesRevizyonu[];
  seciliRevizyon: string | null;
  kapat: () => void;
}

// NC/CAM programı formu (3800): program, takım listesi ve aparatlar tek kayıtta. Takım ve aparat kartı Malzemeler'den seçilir
// (Takımhane kütüphanesinin kartları); kopya kütüphane yoktur.
export function NcFormu({ malzemeNo, opNo, opAdi, program, revizyonlar, seciliRevizyon, kapat }: Ozellikler) {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const [istekKimligi] = useState(yeniIstekKimligi);
  const form = useForm<Degerler, NcProgramYazmaCevabi>({
    ilk: ilkDegerler(program, seciliRevizyon),
    hataIletisi: 'NC programı kaydedilemedi.',
    dogrula,
    kaydet: async (d) => {
      const govde = govdeKur(d);
      const cevap = await tekrarKorumaliGonder((deneme) => {
        const secenek = { istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}) };
        return program === null
          ? api.post<NcProgramYazmaCevabi>('/proses/nc-programlari/ekle', { malzemeNo, opNo, ...govde } satisfies NcProgramEkleGovdesi, secenek)
          : api.post<NcProgramYazmaCevabi>(`/proses/nc-programlari/${String(program.id)}/kaydet`, { surum: program.surum, ...govde } satisfies NcProgramKaydetGovdesi, secenek);
      }, { istekKimligi });
      await istemci.invalidateQueries({ queryKey: ['proses', 'parca', malzemeNo] });
      return cevap;
    },
    basarili: () => { bildirim.bildir('tamam', 'NC programı kaydedildi.'); kapat(); },
  });
  const d = form.degerler;
  const takimYaz = (i: number, yama: Partial<TakimSatiri>) => { form.degistir({ takimlar: d.takimlar.map((t, j) => (j === i ? { ...t, ...yama } : t)) }); };
  const aparatYaz = (i: number, yama: Partial<AparatSatiri>) => { form.degistir({ aparatlar: d.aparatlar.map((a, j) => (j === i ? { ...a, ...yama } : a)) }); };
  const sonrakiT = (): string => `T${String(Math.max(0, ...d.takimlar.map((t) => Number(t.tNo.replace(/\D/g, '')) || 0)) + 1)}`;

  return (
    <FormPenceresi acik kapat={kapat} baslik={program === null ? `OP ${String(opNo)} için NC programı` : `${program.ad} · OP ${String(opNo)}`} form={form}>
      <p className="tc-proses-not">OP {opNo} · {opAdi}</p>
      <div className="tc-proses-form-iki">
        <Girdi etiket="Program adı" ipucu="Tezgâhtaki dosya adı" required {...form.alan('ad')} />
        <Secim etiket="Teknik resim revizyonu" {...form.alan('revizyonKodu')}
          secenekler={[{ deger: '', baslik: TUM_REVIZYONLAR }, ...revizyonlar.map((r) => ({ deger: r.kod, baslik: `Rev ${r.kod}` }))]} />
        <Secim etiket="Durum" value={d.durum} onChange={(o) => { form.degistir({ durum: o.target.value as NcDurumu }); }}
          secenekler={(Object.keys(NC_DURUM) as NcDurumu[]).map((k) => ({ deger: k, baslik: NC_DURUM[k].metin }))} />
        <Secim etiket="Kontrol" {...form.alan('kontrol')} bosSecenek="Seçilmedi"
          secenekler={(Object.keys(NC_KONTROL) as NcKontrolu[]).map((k) => ({ deger: k, baslik: NC_KONTROL[k] }))} />
        <MakineSecici etiket="Tezgâh" deger={d.makine} bosaltilabilir sec={(k) => { form.degistir({ makine: k === null ? null : { id: k.id, kod: k.kod, ad: k.ad } }); }} />
        <Girdi etiket="CAM çevrim süresi (dk)" inputMode="decimal" {...form.alan('cevrimSuresiDk')} />
        <Girdi etiket="CAM yazılımı" {...form.alan('camYazilimi')} />
        <Girdi etiket="CAM dosya adı" ipucu="Dosyanın kendisi yüklenmez" {...form.alan('camDosyasi')} />
      </div>
      <Girdi etiket="Sıfır noktası" ipucu="Örnek: G54, üst yüzey merkezi (3B prob)" {...form.alan('sifirNoktasi')} />

      <fieldset className="tc-proses-form-liste">
        <legend>Takım listesi</legend>
        {d.takimlar.map((t, i) => (
          <div key={i} className="tc-proses-form-satir" role="group" aria-label={`Takım ${t.tNo || String(i + 1)}`}>
            <Girdi etiket="T no" value={t.tNo} onChange={(o) => { takimYaz(i, { tNo: o.target.value }); }} hata={form.hata(`takimlar.${String(i)}.tNo`)} />
            <MalzemeSecici etiket="Takım kartı" deger={t.kart} sec={(k) => { takimYaz(i, { kart: k === null ? null : { id: k.id, kod: k.kod, ad: k.ad } }); }} />
            <Girdi etiket="Tutucu" value={t.tutucu} onChange={(o) => { takimYaz(i, { tutucu: o.target.value }); }} />
            <Girdi etiket="Çıkıntı (mm)" inputMode="decimal" value={t.cikintiMm} onChange={(o) => { takimYaz(i, { cikintiMm: o.target.value }); }} hata={form.hata(`takimlar.${String(i)}.cikintiMm`)} />
            <Girdi etiket="İşlem" value={t.islem} onChange={(o) => { takimYaz(i, { islem: o.target.value }); }} />
            <Dugme simge="trash" aria-label={`${t.tNo || 'Takım'} satırını sil`} onClick={() => { form.degistir({ takimlar: d.takimlar.filter((_, j) => j !== i) }); }} />
            {form.hata(`takimlar.${String(i)}.malzemeId`) !== undefined && <p className="tc-proses-form-hata" role="alert">{form.hata(`takimlar.${String(i)}.malzemeId`)}</p>}
          </div>
        ))}
        {form.hata('takimlar') !== undefined && <p className="tc-proses-form-hata" role="alert">{form.hata('takimlar')}</p>}
        <Dugme simge="plus" onClick={() => { form.degistir({ takimlar: [...d.takimlar, { tNo: sonrakiT(), kart: null, tutucu: '', cikintiMm: '', islem: '' }] }); }}>Takım ekle</Dugme>
      </fieldset>

      <fieldset className="tc-proses-form-liste">
        <legend>Bağlama ve aparat</legend>
        {d.aparatlar.map((a, i) => (
          <div key={i} className="tc-proses-form-satir" role="group" aria-label={`Aparat ${String(i + 1)}`}>
            <MalzemeSecici etiket="Aparat kartı" tur="demirbas" deger={a.kart} sec={(k) => { aparatYaz(i, { kart: k === null ? null : { id: k.id, kod: k.kod, ad: k.ad } }); }} />
            <Girdi etiket="Bağlama notu" value={a.aciklama} onChange={(o) => { aparatYaz(i, { aciklama: o.target.value }); }} />
            <Dugme simge="trash" aria-label={`Aparat ${String(i + 1)} satırını sil`} onClick={() => { form.degistir({ aparatlar: d.aparatlar.filter((_, j) => j !== i) }); }} />
            {form.hata(`aparatlar.${String(i)}.malzemeId`) !== undefined && <p className="tc-proses-form-hata" role="alert">{form.hata(`aparatlar.${String(i)}.malzemeId`)}</p>}
          </div>
        ))}
        {form.hata('aparatlar') !== undefined && <p className="tc-proses-form-hata" role="alert">{form.hata('aparatlar')}</p>}
        <Dugme simge="plus" onClick={() => { form.degistir({ aparatlar: [...d.aparatlar, { kart: null, aciklama: '' }] }); }}>Aparat ekle</Dugme>
      </fieldset>
      <CokSatir etiket="Not" {...form.alan('aciklama')} />
    </FormPenceresi>
  );
}

// "Eski olarak işaretle" bütün kaydı aynı alanlarla, yalnız durumu değiştirerek yazar (kaydet tam kayıt ister).
export function eskiGovdesi(p: ProsesNcProgrami): NcProgramKaydetGovdesi {
  return { surum: p.surum, ...govdeKur(ilkDegerler(p, null)), durum: 'eski' };
}
