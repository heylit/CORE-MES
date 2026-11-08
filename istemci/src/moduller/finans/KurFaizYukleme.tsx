import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OranAraligi } from '#paylasilan/sozlesme/finans.ts';
import { Dugme, Girdi, Rozet, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { csvIndir } from '../../ortak/veri/csv.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import {
  ORAN_ADI, SABLON_BASLIKLARI, SABLON_SATIRLARI, gonderilecekler, kayitliylaKarsilastir, okumaAraligi, sablonuOku, type OkunanDosya, type OnizlemeSatiri, type SatirDurumu,
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
  if (s.tur === 'kur') return s.alis === null || s.satis === null ? '-' : `${oranMetni(s.alis)} / ${oranMetni(s.satis)}`;
  return s.yuzde === null ? '-' : `%${oranMetni(s.yuzde)} yıllık`;
};
const SUTUNLAR: Sutun<OnizlemeSatiri>[] = [
  { anahtar: 'no', baslik: 'Dosya satırı', hizala: 'sag', mono: true, hucre: (s) => s.no },
  { anahtar: 'tur', baslik: 'Oran', hucre: (s) => ORAN_ADI[s.tur] },
  { anahtar: 'pb', baslik: 'Para birimi', mono: true, hucre: (s) => s.paraBirimi || '-' },
  { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, mono: true, hucre: (s) => gunMetni(s.tarih) },
  { anahtar: 'deger', baslik: 'Değer', hizala: 'sag', mono: true, hucre: degerMetni },
  {
    anahtar: 'durum', baslik: 'Durum', csv: (s) => s.neden ?? DURUM[s.durum].ad,
    hucre: (s) => <span className="tc-kfy-durum"><Rozet ton={DURUM[s.durum].ton}>{DURUM[s.durum].ad}</Rozet>{s.neden && <span className="tc-kfs-not">{s.neden}</span>}</span>,
  },
];

// Kur ve faiz matrisi toplu yükleme (1083 a, kart 2238): Finans Ayarlar'ın Kurlar ve faiz sekmesinde ve şeridin panelinde aynı
// parçadır. Önizleme kayıtlı değerleri okur; kaydetmede atlama kararını sunucu yeniden verir, satırlar birlikte yazılır ya da hiçbiri.
// Dosyada Tarih sütunu yoksa (kullanıcının kendi matrisi gibi) bütün değerler seçilen güne yazılır.
export function KurFaizYukleme({ bugun }: { bugun: string }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const dosya = useRef<HTMLInputElement>(null);
  const [okunan, okunanYaz] = useState<(OkunanDosya & { ad: string; metin: string }) | null>(null);
  const [gun, gunYaz] = useState(bugun);
  const [istekKimligi, istekYaz] = useState(yeniIstekKimligi);
  const [mesgul, mesgulYaz] = useState(false);
  const aralik = okunan ? okumaAraligi(okunan.satirlar) : null;
  const kayitli = useQuery({
    queryKey: ['finans', 'oran-araligi', aralik?.baslangic, aralik?.bitis],
    queryFn: () => api.get<OranAraligi>(`/finans/oran-araligi?baslangic=${aralik!.baslangic}&bitis=${aralik!.bitis}`),
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
    const metin = await dosyaMetni(f);
    okunanYaz({ ...sablonuOku(metin, bugun, gun), ad: f.name, metin });
    istekYaz(yeniIstekKimligi());
  };
  // Tarih sütunsuz dosyada gün değişince dosya yeniden okunur.
  const gunSec = (yeni: string) => {
    gunYaz(yeni);
    if (okunan && !okunan.tarihSutunuVar && yeni) { okunanYaz({ ...sablonuOku(okunan.metin, bugun, yeni), ad: okunan.ad, metin: okunan.metin }); istekYaz(yeniIstekKimligi()); }
  };
  const kaydet = async () => {
    if (!hazir) return;
    mesgulYaz(true);
    try {
      const govde = { satirlar: gonderilecekler(satirlar) };
      const c = await tekrarKorumaliGonder(
        (d) => api.post<{ eklenen: number; ayni: number; farkli: number }>('/finans/oranlar/toplu-yukle', govde,
          { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }),
        { istekKimligi },
      );
      bildir('tamam', `${c.eklenen} değer kaydedildi${c.ayni + c.farkli > 0 ? `, ${c.ayni + c.farkli} değer atlandı` : ''}.`);
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
        Matris biçimi: satırlar Kur alış, Kur satış, Kredi, Mevduat (stopaj sonrası) ve Politika faizi; sütunlar para birimi (TRY, USD...),
        Tarih (kurun günü ya da faizin başlangıcı) ve isteğe bağlı Not. Kur 1 birim kaç TL, faiz yıllık %. Alış ve satış birlikte girilir.
        Boş ya da "—" hücre atlanır; kullanım sütunları yok sayılır. Noktalı virgül ve ondalık virgül; tarih GG.AA.YYYY. Kayıtlı güne gelen
        değer atlanır, o gün elle düzeltilir.
      </p>
      <div className="tc-kfy-eylem">
        <Dugme simge="download" onClick={() => csvIndir('kur-faiz-sablon', SABLON_BASLIKLARI, SABLON_SATIRLARI)}>Şablonu indir</Dugme>
        <label className="tc-kfy-dosya">
          <Simge ad="upload" boyut="k" /><span>Dosya seç (.csv)</span>
          <input ref={dosya} type="file" accept=".csv,text/csv" onChange={(e) => { void sec(e); }} aria-label="Kur ve faiz dosyası" />
        </label>
        {okunan && <span className="tc-kfs-not">{okunan.ad}</span>}
      </div>
      {okunan && !okunan.dosyaHatasi && !okunan.tarihSutunuVar && (
        <div className="tc-kfy-eylem">
          <Girdi etiket="Dosyada tarih yok; değerlerin günü" type="date" max={bugun} value={gun} onChange={(e) => gunSec(e.target.value)} />
        </div>
      )}
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
          <Tablo etiket="Yükleme önizlemesi" sutunlar={SUTUNLAR} satirlar={satirlar} satirAnahtari={(s) => s.sira} bosMesaj="Dosyada satır yok." />
          <div className="tc-kfy-eylem">
            <Dugme tur="birincil" simge="check" disabled={!hazir} yukleniyor={mesgul} onClick={() => { void kaydet(); }}>{say('yeni')} değeri kaydet</Dugme>
            <Dugme simge="x" onClick={temizle}>Vazgeç</Dugme>
            <span className="tc-kfs-not">
              {hatali > 0 ? 'Hatalı değer varken hiçbiri kaydedilmez; dosyayı düzeltip yeniden seçin.' : 'Değerler birlikte kaydedilir ya da hiçbiri; her biri sizin adınızla ve saatle yazılır.'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
