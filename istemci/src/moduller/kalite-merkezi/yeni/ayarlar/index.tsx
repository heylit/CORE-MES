import { useRef, useState } from 'react';
import { Girdi, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { DurumKutusu } from '../../../../ortak/arayuz/DurumKutusu.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { AQL_DEGERLERI, aqlMetni, SEVIYELER, YUZDE_YUZ } from '../aql.ts';
import { trd } from '../bicim.ts';
import { bugun } from '../kurallar.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { KmAyarlari } from '../tipler.ts';
import { useKmKomutu } from '../veri.ts';
import { resimDosyalari, SON_YEDEK_ANAHTARI, YEDEK_BICIMI, yedekBelgeleri, yedekOku, type YedekDosyasi } from './yedek.ts';
import '../gostergeler/k4.css';

type Form = Required<Pick<KmAyarlari, 'firma' | 'adres' | 'onaylayan' | 'yururluk' | 'rev' | 'seviye' | 'kritik' | 'major' | 'minor'>>;
const ilk = (g: KmAyarlari): Form => ({
  firma: g.firma ?? '', adres: g.adres ?? '', onaylayan: g.onaylayan ?? '', yururluk: g.yururluk ?? '', rev: g.rev ?? '00',
  seviye: g.seviye ?? 'II', kritik: g.kritik ?? YUZDE_YUZ, major: g.major ?? '1.0', minor: g.minor ?? '2.5',
});
const aqlSecenekleri = (yuzde: boolean) => [...(yuzde ? [YUZDE_YUZ] : []), ...AQL_DEGERLERI].map((a) => ({ deger: a, baslik: aqlMetni(a) }));

function blobBase64(b: Blob): Promise<string> {
  return new Promise((ok, ret) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => ret(fr.error ?? new Error('Dosya okunamadı.'));
    fr.readAsDataURL(b);
  });
}

// Uygulamanın "Ayarlar ve veri" penceresi: firma ve belge başlığı, varsayılan AQL, yedek. Pencere yalnız yöneticide açılır (229 a),
// kapanınca Bugün'e dönülür; geri yükleme geri-yükle işlemiyle. "Tüm verileri sil" yok (210.7), örnek veri yok.
export function Ayarlar({ veri, yetki, git }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [f, fYaz] = useState<Form>(() => ilk(veri.ayarlar));
  const [kaydediliyor, kaydediliyorYaz] = useState(false);
  const [yedekleniyor, yedekleniyorYaz] = useState(false);
  const [okunan, okunanYaz] = useState<{ yedek: YedekDosyasi; kayit: number; dosya: number } | null>(null);
  const dosya = useRef<HTMLInputElement>(null);
  const yazar = yetki.ayar;
  const alan = (k: keyof Form) => ({ value: f[k], onChange: (o: { target: { value: string } }) => fYaz({ ...f, [k]: o.target.value }) });

  const kaydet = async () => {
    if (!f.firma.trim()) {
      bildir('hata', 'Firma adı zorunlu.');
      return;
    }
    kaydediliyorYaz(true);
    try {
      await komut.ayarKaydet({ ...f, firma: f.firma.trim() });
      bildir('tamam', 'Ayarlar kaydedildi');
      git('bugun');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Ayarlar kaydedilemedi.'));
    } finally {
      kaydediliyorYaz(false);
    }
  };

  const yedekIndir = async () => {
    yedekleniyorYaz(true);
    bildir('bilgi', 'Yedek hazırlanıyor…');
    try {
      const files: NonNullable<YedekDosyasi['files']> = {};
      for (const id of resimDosyalari(veri)) {
        try {
          const c = await fetch(komut.dosyaAdresi(id), { credentials: 'same-origin' });
          if (c.ok) { const b = await c.blob(); files[id] = { type: b.type, b64: await blobBase64(b) }; }
        } catch {
          /* okunamayan dosya yedeğe girmez (uygulamada da) */
        }
      }
      const yedek: YedekDosyasi = { format: YEDEK_BICIMI, surum: 1, tarih: new Date().toISOString(), docs: yedekBelgeleri(veri), files };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(yedek)], { type: 'application/json' }));
      a.download = `KaliteMerkezi_yedek_${bugun()}.json`;
      a.click();
      const birak = URL.revokeObjectURL.bind(URL);
      setTimeout(() => birak(a.href), 1000);
      try { localStorage.setItem(SON_YEDEK_ANAHTARI, bugun()); } catch { /* tercih tutulamazsa yedek yine iner */ }
      bildir('tamam', 'Yedek indirildi. Güvenli bir yerde saklayın.');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Yedek alınamadı.'));
    } finally {
      yedekleniyorYaz(false);
    }
  };

  const dosyaSecildi = async (d: File) => {
    const r = yedekOku(await d.text());
    if ('hata' in r) bildir('hata', r.hata);
    else okunanYaz(r);
  };
  const geriYukle = async (y: YedekDosyasi) => {
    okunanYaz(null);
    bildir('bilgi', 'Geri yükleniyor…');
    try {
      await komut.geriYukle(y);
      bildir('tamam', 'Yedek geri yüklendi');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Geri yükleme başarısız.'));
    }
  };

  if (!yazar) return <DurumKutusu durum="bos" mesaj="Bu işlem için yetkiniz yok (ayarları değiştirme). Kalite yöneticisi yapabilir." />;

  return (
    <>
      <Pencere acik kapat={() => git('bugun')} baslik="Ayarlar ve veri" tur="yan"
        alt={(
          <>
            <Dugme tur="ikincil" onClick={() => git('bugun')}>Vazgeç</Dugme>
            <Dugme yukleniyor={kaydediliyor} onClick={() => void kaydet()}>Kaydet</Dugme>
          </>
        )}>
        <div className="tc-km4-form">
          <Girdi etiket="Firma adı" required {...alan('firma')} />
          <Girdi etiket="Adres / alt bilgi" {...alan('adres')} />
          <Girdi etiket="Varsayılan onaylayan (kalite)" {...alan('onaylayan')} />
          <Girdi etiket="Standart formların yürürlük tarihi" type="date" {...alan('yururluk')} />
          <Girdi etiket="Modül formları revizyonu" {...alan('rev')} />
          <Secim etiket="Varsayılan muayene seviyesi" secenekler={SEVIYELER.map((x) => ({ deger: x, baslik: x }))} {...alan('seviye')} />
          <Secim etiket="Kritik" secenekler={aqlSecenekleri(true)} {...alan('kritik')} />
          <Secim etiket="Majör AQL" secenekler={aqlSecenekleri(false)} {...alan('major')} />
          <Secim etiket="Minör AQL" secenekler={aqlSecenekleri(false)} {...alan('minor')} />
        </div>
        <h3 className="tc-km4-panel-baslik">Veri ve yedek</h3>
        <p className="tc-km-soluk">Veriler yerel sunucudaki <b>veri</b> klasöründe tutuluyor; ağdaki herkes aynı verileri görür.</p>
        <div className="tc-km4-satir">
          <Dugme tur="ikincil" simge="download" yukleniyor={yedekleniyor} onClick={() => void yedekIndir()}>Yedek indir</Dugme>
          {yetki.geriYukle && <Dugme tur="ikincil" simge="upload" onClick={() => dosya.current?.click()}>Yedekten geri yükle</Dugme>}
        </div>
        <input ref={dosya} type="file" accept="application/json,.json" hidden aria-label="Yedek dosyası"
          onChange={(o) => { const d = o.target.files?.[0]; o.target.value = ''; if (d) void dosyaSecildi(d); }} />
      </Pencere>
      <OnayPenceresi acik={okunan !== null} baslik="Yedekten geri yükle" tehlikeli onayMetni="Geri yükle"
        onayla={() => { if (okunan) void geriYukle(okunan.yedek); }} vazgec={() => okunanYaz(null)}>
        {okunan && <>{trd(String(okunan.yedek.tarih).slice(0, 10))} tarihli yedekte <b>{okunan.kayit} kayıt</b> ve {okunan.dosya} dosya var. <b>Mevcut tüm veriler silinip</b> yedektekilerle değiştirilecek.</>}
      </OnayPenceresi>
    </>
  );
}

export const AyarlarSayaci: KmSayaci = null;
