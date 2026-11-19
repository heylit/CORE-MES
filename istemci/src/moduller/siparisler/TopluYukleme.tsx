import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  TopluSiparisDenetleCevabi, TopluSiparisSatirDenetimi, TopluSiparisSatiri, TopluSiparisYukleCevabi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { Dugme, IsaretKutusu, Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { DosyaReddi, dosyaIndir, dosyaOku, sablonYaz } from '../../ortak/excel/kitap.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { ALAN_BASLIGI, TOPLU_SAYFA, TOPLU_TANIM, satirlariCevir, siparisAnahtari } from './toplu-yukleme.ts';
import './siparisler.css';

// 3455-3: Excel'den toplu satış siparişi. Önce denetlenir (yazmaz); hatalı satır varken kaydedilmez (hepsi ya da hiçbiri).
// Siparişler taslak açılır (3455-S4 a). "Logo'ya bağlanacak" gönderim değil işarettir (3455-logo c). İşlem yalnız yöneticide (3455-S2 a).
export const TOPLU_YETKISI = 'siparisler.toplu-yukle';

interface Satir { girdi: TopluSiparisSatiri; denetim: TopluSiparisSatirDenetimi | undefined }
const ISO_GUN = /^\d{4}-\d{2}-\d{2}$/;

export function TopluYukleme() {
  const yukleyebilir = ((useOturum().data?.islemler ?? []) as readonly string[]).includes(TOPLU_YETKISI);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const dosya = useRef<HTMLInputElement>(null);
  const [dosyaAdi, dosyaAdiYaz] = useState<string | null>(null);
  const [satirlar, satirlarYaz] = useState<TopluSiparisSatiri[]>([]);
  const [denetim, denetimYaz] = useState<TopluSiparisDenetleCevabi | null>(null);
  const [yalnizHatali, yalnizHataliYaz] = useState(false);
  const [okumaHatasi, okumaHatasiYaz] = useState<string | null>(null);
  const [acilan, acilanYaz] = useState<NonNullable<TopluSiparisYukleCevabi['siparisler']> | null>(null);

  const denetle = useMutation({
    mutationFn: (s: TopluSiparisSatiri[]) =>
      api.post<TopluSiparisDenetleCevabi>('/siparisler/toplu-yukleme/denetle', { satirlar: s }, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: (c) => { denetimYaz(c); yalnizHataliYaz(c.hataliSatir > 0); },
  });
  const yukle = useMutation({
    mutationFn: () => api.post<TopluSiparisYukleCevabi>('/siparisler/toplu-yukleme', { dosyaAdi: dosyaAdi ?? 'siparisler.xlsx', satirlar }, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: async (c) => {
      if (c.siparisler === null) {
        denetimYaz(c.denetim);
        yalnizHataliYaz(true);
        bildir('hata', 'Bu arada değişen kayıtlar var; hiçbir sipariş yazılmadı. Hatalı satırları düzeltip yeniden yükleyin.');
        return;
      }
      acilanYaz(c.siparisler);
      bildir('tamam', `${String(c.siparisler.length)} sipariş taslak olarak açıldı.`);
      await istemci.invalidateQueries({ queryKey: anahtarlar.siparisListeleri });
    },
  });

  const sifirla = () => {
    dosyaAdiYaz(null); satirlarYaz([]); denetimYaz(null); okumaHatasiYaz(null); acilanYaz(null); yalnizHataliYaz(false);
    denetle.reset(); yukle.reset();
    if (dosya.current) dosya.current.value = '';
  };
  const oku = async (f: File) => {
    sifirla();
    try {
      const s = satirlariCevir((await dosyaOku(TOPLU_TANIM, f))[TOPLU_SAYFA] ?? []);
      if (s.length === 0) { okumaHatasiYaz(`"${TOPLU_SAYFA}" sayfasında dolu satır yok.`); return; }
      dosyaAdiYaz(f.name);
      satirlarYaz(s);
      denetle.mutate(s);
    } catch (e) {
      okumaHatasiYaz(e instanceof DosyaReddi ? e.message : 'Dosya okunamadı.');
    }
  };
  const sablonIndir = async () => { dosyaIndir('satis-siparisi-sablonu.xlsx', await sablonYaz(TOPLU_TANIM)); };
  const logoYaz = (satir: TopluSiparisSatiri | null, deger: boolean) => {
    const anahtar = satir === null ? null : siparisAnahtari(satir);
    satirlarYaz((s) => s.map((r) => (anahtar === null || siparisAnahtari(r) === anahtar ? { ...r, logo: deger } : r)));
  };

  if (!yukleyebilir) {
    return (
      <section className="tc-sp">
        <SayfaBasligi baslik="Toplu sipariş yükleme" geriYol="/siparisler" geriMetni="Satış siparişleri" />
        <p className="tc-sp-ipucu">Toplu yükleme yalnız yöneticiye açıktır.</p>
      </section>
    );
  }

  const denetimi = new Map((denetim?.satirlar ?? []).map((d) => [d.sira, d]));
  const tumu: Satir[] = satirlar.map((g) => ({ girdi: g, denetim: denetimi.get(g.sira) }));
  const gorunen = yalnizHatali ? tumu.filter((s) => (s.denetim?.hatalar.length ?? 0) > 0) : tumu;
  const hatali = denetim?.hataliSatir ?? 0;
  const hazir = denetim !== null && hatali === 0 && !denetle.isPending;
  const hepsiLogo = satirlar.length > 0 && satirlar.every((s) => s.logo);

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'sira', baslik: 'Satır', hizala: 'sag', kirilmaz: true, hucre: (s) => s.girdi.sira },
    {
      anahtar: 'durum', baslik: 'Durum', kartTamSatir: true,
      hucre: (s) => {
        if (s.denetim === undefined) return <Rozet ton="pasif">Denetleniyor</Rozet>;
        if (s.denetim.hatalar.length === 0) return <Rozet ton="tamam">Hazır</Rozet>;
        return (
          <span className="tc-sp-ad">
            <Rozet ton="hata">Hatalı</Rozet>
            {s.denetim.hatalar.map((h) => <span key={`${h.alan}-${h.ileti}`} className="tc-sp-hata-satir">{ALAN_BASLIGI[h.alan]}: {h.ileti}</span>)}
          </span>
        );
      },
      csv: (s) => (s.denetim?.hatalar ?? []).map((h) => `${ALAN_BASLIGI[h.alan]}: ${h.ileti}`).join('; ') || 'Hazır',
    },
    {
      anahtar: 'siparis', baslik: 'Müşteri sipariş no',
      hucre: (s) => (
        <span className="tc-sp-ad">
          <strong>{s.girdi.siparisNo ?? '—'}</strong>
          <span className="tc-sp-soluk">{s.denetim?.firma ? `${s.denetim.firma.kod} · ${s.denetim.firma.ad}` : (s.girdi.firma ?? '—')}</span>
        </span>
      ),
    },
    {
      anahtar: 'malzeme', baslik: 'Malzeme',
      hucre: (s) => (
        <span className="tc-sp-ad">
          <strong className="mono">{s.denetim?.malzeme?.kod ?? s.girdi.malzeme ?? '—'}</strong>
          {s.denetim?.malzeme && <span className="tc-sp-soluk">{s.denetim.malzeme.ad}</span>}
        </span>
      ),
    },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (s) => s.girdi.miktar ?? '—' },
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (s) => (s.girdi.termin !== null && ISO_GUN.test(s.girdi.termin) ? tarihMetni(s.girdi.termin) : (s.girdi.termin ?? '—')) },
    {
      anahtar: 'logo', baslik: "Logo'ya bağlanacak", csv: (s) => (s.girdi.logo ? 'Evet' : 'Hayır'),
      hucre: (s) => (
        <input type="checkbox" aria-label={`Satır ${String(s.girdi.sira)} Logo'ya bağlanacak`} checked={s.girdi.logo}
          onChange={(e) => { logoYaz(s.girdi, e.target.checked); }} />
      ),
    },
  ];

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik="Toplu sipariş yükleme" alt="Excel'deki satış siparişlerini taslak olarak açar." geriYol="/siparisler" geriMetni="Satış siparişleri"
        islemler={(
          <>
            <Dugme simge="download" onClick={() => { void sablonIndir(); }}>Şablonu indir</Dugme>
            <Dugme tur="birincil" simge="upload" yukleniyor={denetle.isPending} onClick={() => dosya.current?.click()}>Dosya seç</Dugme>
            <input ref={dosya} type="file" hidden aria-label="Sipariş dosyası" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void oku(f); }} />
          </>
        )}
      />
      {okumaHatasi && <p className="tc-sp-hata" role="alert">{okumaHatasi}</p>}
      {denetle.isError && <p className="tc-sp-hata" role="alert">{hataIletisi(denetle.error, 'Dosya denetlenemedi.')}</p>}
      {satirlar.length === 0 && !okumaHatasi && (
        <Kart baslik="Nasıl yüklenir">
          <ol className="tc-sp-adimlar">
            <li>Şablonu indirip "{TOPLU_SAYFA}" sayfasını doldurun; her satır bir kalemdir.</li>
            <li>Aynı müşteri kodu ve müşteri sipariş no taşıyan satırlar tek sipariş olur.</li>
            <li>Dosyayı seçin; satırlar denetlenir, hata satırına ve sütununa yazılır.</li>
            <li>Hatalı satır yoksa siparişler taslak açılır; onay ve iş emri olağan akışla gelir. Logo'ya gönderilmez.</li>
          </ol>
        </Kart>
      )}
      {acilan !== null && (
        <Kart baslik="Açılan taslak siparişler" sag={<Dugme simge="upload" onClick={sifirla}>Yeni dosya</Dugme>}>
          <ul className="tc-sp-acilan">
            {acilan.map((a) => <li key={a.id}><Link to={`/siparisler/${String(a.id)}`} className="mono">{a.no}</Link> <span className="tc-sp-soluk">Müşteri no {a.musteriSiparisNo}</span></li>)}
          </ul>
        </Kart>
      )}
      {satirlar.length > 0 && acilan === null && (
        <Kart baslik={dosyaAdi ?? 'Dosya'}>
          <p className="tc-sp-toplu-ozet" role="status">
            {`${String(satirlar.length)} satır · `}
            {denetim === null ? 'denetleniyor' : `${String(denetim.siparisSayisi)} sipariş · `}
            {denetim !== null && <b className={hatali > 0 ? 'tc-sp-hata-satir' : undefined}>{`${String(hatali)} hatalı`}</b>}
          </p>
          <div className="tc-sp-toplu-arac">
            <IsaretKutusu etiket="Yalnız hatalı satırlar" checked={yalnizHatali} disabled={hatali === 0} onChange={(e) => { yalnizHataliYaz(e.target.checked); }} />
            <IsaretKutusu etiket="Hepsi Logo'ya bağlanacak" checked={hepsiLogo} onChange={(e) => { logoYaz(null, e.target.checked); }} />
          </div>
          <Tablo<Satir> etiket="Yüklenecek satırlar" sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(s) => s.girdi.sira} bosMesaj="Gösterilecek satır yok" />
          <p className="tc-sp-ipucu">
            {"Logo'ya bağlanacak yalnız işarettir: gönderim yapmaz ve bugün Logo bağlama listesinde görünmez."}
          </p>
          {yukle.isError && <p className="tc-sp-hata" role="alert">{hataIletisi(yukle.error, 'Siparişler kaydedilemedi.')}</p>}
          <div className="tc-sp-alt-cubuk">
            <Dugme onClick={sifirla} disabled={yukle.isPending}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" disabled={!hazir} yukleniyor={yukle.isPending} onClick={() => { yukle.mutate(); }}>
              {`${String(denetim?.siparisSayisi ?? 0)} siparişi taslak olarak kaydet`}
            </Dugme>
          </div>
          {denetim !== null && hatali > 0 && (
            <p className="tc-sp-hata" role="status">{`${String(hatali)} satır hatalı; hepsi düzelene kadar hiçbir sipariş kaydedilmez. Dosyayı düzeltip yeniden seçin.`}</p>
          )}
        </Kart>
      )}
    </section>
  );
}
