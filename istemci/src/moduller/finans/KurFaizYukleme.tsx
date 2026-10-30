import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { KurFaizAraligi } from '#paylasilan/sozlesme/finans.ts';
import { Dugme, Rozet, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { csvIndir } from '../../ortak/veri/csv.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import {
  GUNLUK_FAIZ, SABLON_BASLIKLARI, SABLON_SATIRLARI, gonderilecekler, kayitliylaKarsilastir, okumaAraligi, sablonuOku, type OkunanDosya, type OnizlemeSatiri, type SatirDurumu,
} from './kur-faiz-csv.ts';

// FileReader: Blob.text() her tarayıcıda (ve test ortamında) yok.
const dosyaMetni = (f: Blob): Promise<string> => new Promise((coz, red) => {
  const r = new FileReader();
  r.onload = () => coz(String(r.result ?? ''));
  r.onerror = () => red(r.error ?? new Error('Dosya okunamadı.'));
  r.readAsText(f);
});

const DURUM: Record<SatirDurumu, { ton: RozetTonu; ad: string }> = {
  yeni: { ton: 'tamam', ad: 'Yeni' }, ayni: { ton: 'pasif', ad: 'Aynı' }, farkli: { ton: 'uyari', ad: 'Farklı' }, hata: { ton: 'hata', ad: 'Hata' },
};
const gunMetni = (t: string | null) => (t ? t.split('-').reverse().join('.') : '-');
const oranMetni = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 6 });
const degerMetni = (s: OnizlemeSatiri) => {
  if (s.deger === null) return '-';
  if (s.tur === GUNLUK_FAIZ) return `%${oranMetni(s.deger)}/gün${s.aylik === null ? '' : ` (aylık %${oranMetni(s.aylik)})`}`;
  return `${s.tur === 'faiz' ? '%' : ''}${oranMetni(s.deger)}`;
};
const SUTUNLAR: Sutun<OnizlemeSatiri>[] = [
  { anahtar: 'no', baslik: 'Satır', hizala: 'sag', mono: true, hucre: (s) => s.no },
  { anahtar: 'tur', baslik: 'Tür', hucre: (s) => s.tur || '-' },
  { anahtar: 'pb', baslik: 'Para birimi', mono: true, hucre: (s) => s.paraBirimi || '-' },
  { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, mono: true, hucre: (s) => gunMetni(s.tarih) },
  { anahtar: 'deger', baslik: 'Değer', hizala: 'sag', mono: true, hucre: degerMetni },
  {
    anahtar: 'durum', baslik: 'Durum', csv: (s) => s.neden ?? DURUM[s.durum].ad,
    hucre: (s) => <span className="tc-kfy-durum"><Rozet ton={DURUM[s.durum].ton}>{DURUM[s.durum].ad}</Rozet>{s.neden && <span className="tc-kfs-not">{s.neden}</span>}</span>,
  },
];

// Kur ve faiz toplu yükleme (1083 a): Finans Ayarlar'ın Kurlar ve faiz sekmesinde ve şeridin panelinde aynı parçadır. Önizleme
// kayıtlı değerleri okur; kaydetmede atlama kararını sunucu yeniden verir, satırlar birlikte yazılır ya da hiçbiri.
export function KurFaizYukleme({ bugun }: { bugun: string }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const dosya = useRef<HTMLInputElement>(null);
  const [okunan, okunanYaz] = useState<(OkunanDosya & { ad: string }) | null>(null);
  const [istekKimligi, istekYaz] = useState(yeniIstekKimligi);
  const [mesgul, mesgulYaz] = useState(false);
  const aralik = okunan ? okumaAraligi(okunan.satirlar) : null;
  const kayitli = useQuery({
    queryKey: ['finans', 'kur-faiz-araligi', aralik?.baslangic, aralik?.bitis],
    queryFn: () => api.get<KurFaizAraligi>(`/finans/kur-faiz-araligi?baslangic=${aralik!.baslangic}&bitis=${aralik!.bitis}`),
    enabled: aralik !== null,
  });
  const satirlar = okunan && kayitli.data ? kayitliylaKarsilastir(okunan.satirlar, kayitli.data) : okunan?.satirlar ?? [];
  const say = (d: SatirDurumu) => satirlar.filter((s) => s.durum === d).length;
  const hatali = say('hata');
  const genisAralik = okunan !== null && okunan.dosyaHatasi === null && hatali < satirlar.length && aralik === null;
  const hazir = okunan !== null && okunan.dosyaHatasi === null && hatali === 0 && !genisAralik && kayitli.isSuccess && say('yeni') > 0;

  const temizle = () => { okunanYaz(null); istekYaz(yeniIstekKimligi()); if (dosya.current) dosya.current.value = ''; };
  const sec = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    okunanYaz({ ...sablonuOku(await dosyaMetni(f), bugun), ad: f.name });
    istekYaz(yeniIstekKimligi());
  };
  const kaydet = async () => {
    if (!hazir) return;
    mesgulYaz(true);
    try {
      const govde = { satirlar: gonderilecekler(satirlar) };
      const c = await tekrarKorumaliGonder(
        (d) => api.post<{ eklenen: number; ayni: number; farkli: number }>('/finans/kur-faiz/toplu-yukle', govde,
          { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }),
        { istekKimligi },
      );
      bildir('tamam', `${c.eklenen} satır kaydedildi${c.ayni + c.farkli > 0 ? `, ${c.ayni + c.farkli} satır atlandı` : ''}.`);
      temizle();
      await istemci.invalidateQueries();
    } catch (h) {
      if (!yenidenDenenebilirMi(h)) istekYaz(yeniIstekKimligi());
      bildir('hata', hataIletisi(h, 'Kur ve faiz yüklenemedi.'));
    } finally {
      mesgulYaz(false);
    }
  };

  return (
    <div className="tc-kfy">
      <p className="tc-kfs-not">
        Sütunlar: Tür (kur, faiz ya da günlük faiz), Para birimi, Tarih (kurun günü ya da faizin başlangıcı), Değer (kur: 1 birim kaç TL;
        faiz: aylık %; günlük faiz: günlük %, aylığa çevrilip kaydedilir). Plan ve proje maliyeti finansmanı TL faizinden hesaplar.
        Noktalı virgül ve ondalık virgül; tarih GG.AA.YYYY. Kayıtlı güne gelen satır atlanır, o gün elle düzeltilir.
      </p>
      <div className="tc-kfy-eylem">
        <Dugme simge="download" onClick={() => csvIndir('kur-faiz-sablon', SABLON_BASLIKLARI, SABLON_SATIRLARI)}>Şablonu indir</Dugme>
        <label className="tc-kfy-dosya">
          <Simge ad="upload" boyut="k" /><span>Dosya seç (.csv)</span>
          <input ref={dosya} type="file" accept=".csv,text/csv" onChange={(e) => { void sec(e); }} aria-label="Kur ve faiz dosyası" />
        </label>
        {okunan && <span className="tc-kfs-not">{okunan.ad}</span>}
      </div>
      {okunan?.dosyaHatasi && <p className="tc-kfs-hata" role="alert">{okunan.dosyaHatasi}</p>}
      {okunan && !okunan.dosyaHatasi && (
        <>
          <div className="tc-kfy-sayilar" aria-label="Önizleme özeti">
            <span><b className="mono">{say('yeni')}</b> eklenecek</span>
            <span><b className="mono">{say('ayni')}</b> aynı, atlanır</span>
            <span><b className="mono">{say('farkli')}</b> farklı, atlanır</span>
            <span><b className="mono">{hatali}</b> hatalı</span>
          </div>
          {kayitli.isError && <p className="tc-kfs-hata" role="alert">{hataIletisi(kayitli.error, 'Kayıtlı kurlar okunamadı; önizleme tamamlanmadı.')}</p>}
          {genisAralik && <p className="tc-kfs-hata" role="alert">Dosyadaki tarihler beş yıldan geniş; dosyayı bölüp yükleyin.</p>}
          <Tablo etiket="Yükleme önizlemesi" sutunlar={SUTUNLAR} satirlar={satirlar} satirAnahtari={(s) => s.no} bosMesaj="Dosyada satır yok." />
          <div className="tc-kfy-eylem">
            <Dugme tur="birincil" simge="check" disabled={!hazir} yukleniyor={mesgul} onClick={() => { void kaydet(); }}>{say('yeni')} satırı kaydet</Dugme>
            <Dugme simge="x" onClick={temizle}>Vazgeç</Dugme>
            <span className="tc-kfs-not">
              {hatali > 0 ? 'Hatalı satır varken hiçbir satır kaydedilmez; dosyayı düzeltip yeniden seçin.' : 'Satırlar birlikte kaydedilir ya da hiçbiri; her satır sizin adınızla ve saatle yazılır.'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
