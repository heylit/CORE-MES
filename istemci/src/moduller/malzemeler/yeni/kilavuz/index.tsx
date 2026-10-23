import type { ReactNode } from 'react';
import { SayfaBasligi, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { KatalogSimgesi } from '../ortak/KatalogSimgesi.tsx';
import { OPT_ICON, ROLLER, TURLER, TUR_ICON, YETKI, YETKI_AD } from '../sabitler/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useM4Baglami } from '../sablonlar/baglam.ts';
import {
  ADIMLAR, ARAMA_IPUCLARI, IYI_GEREKCE, KARARLAR, KOTU_GEREKCE, QR_ADIMLARI, SIK_HATALAR, TUR_ACIKLAMALARI, ornekSatirlari, type OrnekSatiri,
} from './icerik.ts';
import './kilavuz.css';

const simge = (k: string): string | undefined => OPT_ICON[k] ?? OPT_ICON['wrench'];

// Prototipin Kılavuz görünümü (renderKilavuz): kart açma akışı, tür seçimi, kod yapısı, arama örnekleri, karar tablosu, roller ve QR.
export function Kilavuz(o: EkranOzellikleri) {
  const b = useM4Baglami(o);
  const ornekler = ornekSatirlari(b);
  const benimRolum = o.yetki.rol !== null ? ROLLER[o.yetki.rol] : undefined;

  return (
    <div className="tc-ml">
      <SayfaBasligi baslik="Kılavuz" simge="eye" />

      <section className="tc-ml-giris">
        <h3>Kart nasıl açılır?</h3>
        <p>Her malzemenin tek bir kartı olur. Önce ara, yoksa aç; açtığın kart onaylandıktan sonra herkes aynı kartı kullanır.</p>
        <Adimlar adimlar={ADIMLAR} />
      </section>

      <Bolum baslik="Akış şeması">
        <div className="tc-ml-akis">
          <Kutu simge="magnifier" baslik="Malzemeyi yaz" alt={'"316L 2B 3x1250x2500"'} tur="bas" />
          <Ok />
          <Kutu baslik="Katalogda var mı?" alt="Uygulama kalite, form ve ölçüye göre arar" tur="karar" />
          <div className="tc-ml-dal">
            <div className="tc-ml-kol">
              <span className="tc-ml-et" data-yon="evet">Evet</span>
              <Ok />
              <Kutu simge="shield" baslik="Mevcut kartı kullan" alt="Yeni kart açılmaz" tur="iyi" />
            </div>
            <div className="tc-ml-kol">
              <span className="tc-ml-et" data-yon="hayir">Hayır</span>
              <Ok />
              <Kutu simge="wrench" baslik="Yeni kart aç" alt="Bilgiler aramadan dolu gelir" />
              <Ok />
              <Kutu baslik="Adımları kontrol et" alt="Durum, yüzey, ticari bilgiler" />
              <Ok />
              <Kutu baslik="Aynısı var mı?" alt="Kayıtta yeniden kontrol edilir" tur="karar" />
              <Ok metin="yok" />
              <Kutu simge="eye" baslik="Kaydet → onaya gider" alt="Kod otomatik verilir" />
              <Ok />
              <Kutu simge="shield" baslik="Sorumlu onaylar" alt="Dört göz: gönderen onaylayamaz" />
              <Ok />
              <Kutu baslik="Aktif kart" alt="Stokta kullanılabilir" tur="son" />
            </div>
          </div>
          <div className="tc-ml-yan">
            <Kutu
              simge="chart" baslik="Sonradan değişiklik mi gerekti?" tur="talep"
              alt={<>Düzenle → <b>değişiklik talebi</b> gider; onaylanana kadar kart eski hâliyle kullanılır. Onaylanınca güncellenir ve revizyon geçmişine yazılır.</>}
            />
          </div>
        </div>
      </Bolum>

      <Bolum baslik="Hangi türü seçmeliyim?">
        <ul className="tc-ml-turler">
          {TUR_ACIKLAMALARI.map((t) => (
            <li key={t.tur} className="tc-ml-tur" data-tur={t.tur}>
              <span className="tc-ml-tur-simge"><KatalogSimgesi yol={TUR_ICON[t.tur]} boyut="b" /></span>
              <b>{TURLER[t.tur]?.ad ?? t.tur}</b>
              <span>{t.acik}</span>
              <small>Örnek: {t.ornek}</small>
            </li>
          ))}
        </ul>
      </Bolum>

      <Bolum baslik="Kod nasıl oluşur?">
        <div className="tc-ml-kod" aria-label="Kod yapısı: tür, grup, sıra no">
          <KodParcasi kod="HM" ad="Tür" alt="HM, YM, MM, SF, DB" />
          <span aria-hidden="true">-</span>
          <KodParcasi kod="PAS" ad="Grup" alt="sınıf ya da kategori" />
          <span aria-hidden="true">-</span>
          <KodParcasi kod="00042" ad="Sıra no" alt="grup içinde artar" />
        </div>
        <p className="tc-ml-yardim">
          Kod yalnızca sınıflandırma taşır ve hiç değişmez. Kalite ve ölçü <b>teknik kodda</b> (ör. MET-PAS-316L-LV-3x1250x2500) ve <b>Açıklama 1-2-3</b>'te
          yer alır. Mevcut ERP kodu varsa "Eski / ERP kodu" alanına yazılır; aynı ERP kodlu ikinci kart açılamaz.
        </p>
      </Bolum>

      <Bolum baslik="Arama kutusuna nasıl yazmalıyım?">
        <p className="tc-ml-yardim">İstediğin sırayla, kısaltmalarla yazabilirsin. Uygulamanın bu örnekleri nasıl anladığı (yıldızlı ölçüler varsayılan, kontrol et):</p>
        <Tablo<OrnekSatiri> etiket="Arama örnekleri" sutunlar={ORNEK_SUTUNLARI} satirlar={ornekler} satirAnahtari={(s) => s.metin} />
        <ul className="tc-ml-ipucu">{ARAMA_IPUCLARI.map((x) => <li key={x}>{x}</li>)}</ul>
      </Bolum>

      <Bolum baslik="Yeni kart mı, değişiklik mi?">
        <Tablo etiket="Yeni kart mı, değişiklik mi" sutunlar={KARAR_SUTUNLARI} satirlar={KARARLAR} satirAnahtari={(s) => s.durum} />
      </Bolum>

      <Bolum baslik="Mükerrer gerekçesi nasıl yazılır?">
        <p className="tc-ml-yardim">Aynı görünen bir kart varken yeni kart açmak ancak gerekçeyle mümkün. Gerekçe, kartların neden ayrı tutulduğunu bir sonraki kişiye anlatmalı.</p>
        <div className="tc-ml-ikili">
          <div className="tc-ml-iyi"><b>✓ İyi</b><ul>{IYI_GEREKCE.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div className="tc-ml-kotu"><b>✕ Kötü</b><ul>{KOTU_GEREKCE.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
      </Bolum>

      <Bolum baslik="Roller">
        <Tablo etiket="Roller ve yetkiler" sutunlar={ROL_SUTUNLARI} satirlar={ROL_ISLERI} satirAnahtari={(s) => s} />
        <p className="tc-ml-yardim">
          {benimRolum && <>Senin rolün: <b>{benimRolum.ad}</b>. </>}
          Roller TMI yetkilerinden gelir.
        </p>
      </Bolum>

      <Bolum baslik="Sahada QR ile kart açma">
        <Adimlar adimlar={QR_ADIMLARI} />
        <p className="tc-ml-yardim">
          Etiketler Katalog'dan ya da kart detayından yazdırılır. QR içeriği Ayarlar'dan kart koduna ya da stok uygulamanın bağlantısına ayarlanır. Kamera
          açılamazsa fotoğraf çekerek ya da kodu yazarak da açılır.
        </p>
      </Bolum>

      <Bolum baslik="Sık yapılan hatalar">
        <ul className="tc-ml-hatalar">
          {SIK_HATALAR.map((h) => (
            <li key={h.hata}><b aria-hidden="true">✕</b> {h.hata} <span>→ {h.dogru}</span></li>
          ))}
        </ul>
      </Bolum>
    </div>
  );
}

function Bolum({ baslik, children }: { baslik: string; children: ReactNode }) {
  return (
    <section className="tc-ml-bolum">
      <h3>{baslik}</h3>
      {children}
    </section>
  );
}

function Adimlar({ adimlar }: { adimlar: readonly { simge: string; ad: string; alt: string }[] }) {
  return (
    <ol className="tc-ml-adimlar">
      {adimlar.map((a) => (
        <li key={a.ad} className="tc-ml-adim">
          <span className="tc-ml-adim-simge"><KatalogSimgesi yol={simge(a.simge)} /></span>
          <b>{a.ad}</b>
          <small>{a.alt}</small>
        </li>
      ))}
    </ol>
  );
}

function Kutu({ simge: s, baslik, alt, tur }: { simge?: string; baslik: string; alt?: ReactNode; tur?: 'bas' | 'karar' | 'iyi' | 'son' | 'talep' }) {
  return (
    <div className="tc-ml-kutu" data-kutu={tur}>
      {s && <span className="tc-ml-kutu-simge"><KatalogSimgesi yol={simge(s)} /></span>}
      <div><b>{baslik}</b>{alt && <small>{alt}</small>}</div>
    </div>
  );
}

function Ok({ metin }: { metin?: string }) {
  return <div className="tc-ml-ok" aria-hidden="true">↓{metin ? ` ${metin}` : ''}</div>;
}

function KodParcasi({ kod, ad, alt }: { kod: string; ad: string; alt: string }) {
  return <div className="tc-ml-kk"><b>{kod}</b><small>{ad}<br />{alt}</small></div>;
}

const ORNEK_SUTUNLARI: readonly Sutun<OrnekSatiri>[] = [
  { anahtar: 'metin', baslik: 'Yazdığın', mono: true, hucre: (s) => s.metin },
  {
    anahtar: 'anlasilan', baslik: 'Anlaşılan', csv: false,
    hucre: (s) => (
      <span className="tc-ml-parcalar">
        {s.parcalar.map((p) => <span key={`${p.ad}:${p.deger}`} className="tc-ml-parca"><small>{p.ad}</small><b>{p.deger}</b></span>)}
      </span>
    ),
  },
];

const KARAR_SUTUNLARI: readonly Sutun<(typeof KARARLAR)[number]>[] = [
  { anahtar: 'durum', baslik: 'Durum', hucre: (s) => s.durum },
  { anahtar: 'yap', baslik: 'Ne yapılır', hucre: (s) => <span className="tc-ml-karar" data-karar={s.tur}>{s.yap}</span> },
  { anahtar: 'neden', baslik: 'Neden', hucre: (s) => s.neden },
];

// Prototip rolTablosuHTML: değişiklik talebini herkes gönderir; öteki işler YETKI tablosundaki rollere açıktır.
const ROL_ISLERI = ['kart', 'talepGonder', 'onay', 'birlestir', 'sil', 'ayar', 'rol'] as const;
type RolIsi = (typeof ROL_ISLERI)[number];

const ROL_SUTUNLARI: readonly Sutun<RolIsi>[] = [
  { anahtar: 'is', baslik: 'Yapılabilecekler', hucre: (e) => YETKI_AD[e] ?? e },
  ...Object.entries(ROLLER).map(([r, x]): Sutun<RolIsi> => ({
    anahtar: r, baslik: x.ad, hizala: 'sag',
    hucre: (e) => (e === 'talepGonder' || (YETKI[e] ?? []).includes(r)
      ? <span className="tc-ml-var" aria-label="Var">✓</span>
      : <span className="tc-ml-yok" aria-label="Yok">—</span>),
  })),
];
