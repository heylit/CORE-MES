import { useState, type ReactNode } from 'react';
import { CokSatir, Girdi, IsaretKutusu } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { DurumKutusu } from '../../../../ortak/arayuz/DurumKutusu.tsx';
import { Rozet } from '../../../../ortak/arayuz/Rozet.tsx';
import { Simge } from '../../../../ortak/arayuz/Simge.tsx';
import { Tablo } from '../../../../ortak/arayuz/Tablo.tsx';
import { para, paraKisa, tarih, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { PozisyonFormu } from '../isealim/index.tsx';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Devam, Egitim, Performans, Personel } from '../tipler.ts';
import { useIkKomutu, useKisiVardiyasi } from '../veri.ts';
import {
  BordroTahmini, DevamFormu, IzinFormu, IzinTablosu, KisiPuantajTakvimi, PerformansFormu, TazminatDokumu, TazminatHesabi,
} from './baska-parcalar.tsx';
import { alanEtiketi, PERSONEL_ALANLARI, type FormAlani, type PersonelBolumu } from './alanlar.ts';
import { CalismaBelgesi } from './CalismaBelgesi.tsx';
import type { CalisanSekmesi } from './Calisan.tsx';
import {
  adSoyadMetni, aktifMi, belgeIsaretle, belgeListesi, bugun, CIKIS_ADIMLARI, cikisAdimi, cikisIlerlemesi, ibanBicimi, kidemMetni, notEkle,
  notSil, performansEtiketi, performansOrtalamasi, sayi, siraliNotlar, sonrakiZam, tamamlananEgitimSaati, ucretDegisimi, ucretGecmisi,
  ucretSil, ucretTarihte, uzunTarih, yerinePozisyonTaslagi, yillikFazlaMesai, zamanCizelgesi, type OlayTuru, type UcretSatiri,
} from './kurallar.ts';
import { ayar, kisiselPrim } from './motor-yuzu.ts';
import { Bolum, Not, Tanimlar, type Tanim } from './parcalar.tsx';
import { UcretPenceresi } from './UcretPenceresi.tsx';
import { useYazma } from './yazma.ts';

export interface SekmeOzellikleri extends IkEkranOzellikleri {
  p: Personel;
  duzenle: (b: PersonelBolumu) => void;
  sekmeAc: (s: CalisanSekmesi) => void;
}

const sayiMetni = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const MOTOR_YOK = <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />;

function KisiBaglantisi({ id, o }: { id: string | undefined; o: IkEkranOzellikleri }) {
  const k = id ? o.depo.tur('emp').find((x) => x.id === id) : undefined;
  if (!k) return null;
  return <button type="button" className="tc-ikp-baglanti" onClick={() => { o.git('calisan', k.id); }}>{adSoyadMetni(k)}</button>;
}

// Alanın görünen değeri; boşsa null ("Girilmedi").
function deger(f: FormAlani, p: Personel, o: IkEkranOzellikleri): ReactNode {
  const v = (p as unknown as Record<string, unknown>)[f.k];
  if (v === '' || v === undefined || v === null) return null;
  switch (f.tur) {
    case 'tarih': return uzunTarih(String(v));
    case 'para': return para(sayi(v));
    case 'personel': return <KisiBaglantisi id={String(v)} o={o} />;
    case 'departman': return o.depo.tur('dept').find((d) => d.id === v)?.ad ?? YOK;
    case 'iban': return ibanBicimi(String(v));
    case 'ismerkezi': { const m = o.depo.ben.secenekler.isMerkezleri.find((x) => x.id === Number(v)); return m ? m.ad : `İş merkezi ${String(v)}`; }
    case 'tmikisi': { const k = o.depo.ben.secenekler.kisiler.find((x) => x.id === Number(v)); return k ? k.ad + (k.sicilNo ? ` (${k.sicilNo})` : '') : `Kullanıcı ${String(v)}`; }
    case 'isaret': return v ? <Rozet ton="tamam">Evet</Rozet> : 'Hayır';
    case 'tesvik': return o.motor?.tesvikById(String(v))?.ad ?? null;
    case 'primler': return null;
    case 'cok': case 'eposta': case 'metin': case 'sayi': case 'secim': case 'tckn': case 'tel': case undefined:
    default: return String(v);
  }
}

const bolumSatirlari = (bolum: PersonelBolumu, p: Personel, o: IkEkranOzellikleri, anahtarlar?: readonly string[]): Tanim[] => PERSONEL_ALANLARI
  .filter((f) => f.bolum === bolum && (!anahtarlar || anahtarlar.includes(f.k)))
  .map((f) => ({ etiket: f.l, deger: deger(f, p, o), genis: f.tur === 'cok' }));

const duzenleDugmesi = (s: SekmeOzellikleri, b: PersonelBolumu, izin: boolean) => (izin
  ? <Dugme simge="edit" onClick={() => { s.duzenle(b); }}>Düzenle</Dugme>
  : null);

/* ---------------- Özet ---------------- */

export function OzetSekmesi(s: SekmeOzellikleri) {
  const { p, depo, motor } = s;
  const gun = bugun();
  const b = motor?.leaveBalance(p, new Date());
  const son = depo.tur('perf').filter((x) => x.empId === p.id).sort((a, c) => (c.tarih ?? '').localeCompare(a.tarih ?? ''))[0];
  const ort = son ? performansOrtalamasi(son) : null;
  const ekip = depo.tur('emp').filter((x) => aktifMi(x, gun) && x.yoneticiId === p.id).sort((a, c) => adSoyadMetni(a).localeCompare(adSoyadMetni(c), 'tr'));
  const brut = ucretTarihte(p, gun);
  const zam = sonrakiZam(p, gun);
  const eksik = motor?.missingDocs(p);
  const deneme = p.denemeBitis && p.denemeBitis >= gun;
  const kalanGun = deneme ? Math.round(((new Date(`${p.denemeBitis}T00:00:00`)).getTime() - (new Date(`${gun}T00:00:00`)).getTime()) / 864e5) : 0;
  return (
    <>
      <Bolum baslik="Genel bakış">
        <Tanimlar satirlar={[
          { etiket: 'Kıdem', deger: kidemMetni(p, gun) },
          { etiket: 'İşe giriş', deger: p.iseGiris ? uzunTarih(p.iseGiris) : null },
          { etiket: 'Bağlı olduğu yönetici', deger: <KisiBaglantisi id={p.yoneticiId} o={s} /> },
          { etiket: 'Sözleşme', deger: p.sozlesmeTuru ? p.sozlesmeTuru + (p.sozlesmeBitis ? `, bitiş ${uzunTarih(p.sozlesmeBitis)}` : '') : null },
          { etiket: 'Çalışma şekli', deger: p.calismaSekli || null },
          {
            etiket: 'Deneme süresi bitişi',
            deger: p.denemeBitis ? <>{uzunTarih(p.denemeBitis)}{deneme && <> <Rozet ton="uyari">{kalanGun === 0 ? 'Bugün' : kalanGun === 1 ? 'Yarın' : `${kalanGun} gün sonra`}</Rozet></>}</> : null,
          },
          { etiket: 'Kalan yıllık izin', deger: b ? `${sayiMetni(b.kalan)} gün` : MOTOR_HAZIRLANIYOR },
          { etiket: 'Sonraki izin hak edişi', deger: b?.next ? `${uzunTarih(isoGun(b.next))}, ${b.nextDays} gün` : null },
          { etiket: 'Aylık brüt ücret', deger: brut ? <>{para(brut)}{zam && <> <Rozet ton="bilgi">{`${tarih(zam.tarih)}: ${paraKisa(sayi(zam.brut))}`}</Rozet></>}</> : null },
          { etiket: 'Son performans', deger: son ? `${son.donem ?? ''}: ${ort === null ? YOK : sayiMetni(Math.round(ort * 100) / 100)} / 5` : null },
          { etiket: 'Bu yıl fazla mesai', deger: `${sayiMetni(yillikFazlaMesai(p.id, depo.tur('att'), gun.slice(0, 4)))} saat` },
          { etiket: 'Eksik özlük belgeleri', deger: eksik === undefined ? MOTOR_HAZIRLANIYOR : eksik.length ? <Rozet ton="uyari">{`${eksik.length} belge`}</Rozet> : <Rozet ton="tamam">Tamam</Rozet> },
          Boolean(p.cikisTarihi) && { etiket: 'İşten çıkış', deger: <>{uzunTarih(p.cikisTarihi)}{p.cikisKodu && <small className="tc-ikp-alt">{p.cikisKodu.replace(/^\d+\s/, '')}</small>}</> },
          Boolean(p.cikisTarihi) && {
            etiket: 'Çıkış kontrol listesi',
            deger: <>{`${cikisIlerlemesi(p)}/${CIKIS_ADIMLARI.length} adım `}<button type="button" className="tc-ikp-baglanti" onClick={() => { s.sekmeAc('ayrilis'); }}>Aç</button></>,
          },
          { etiket: 'Telefon', deger: p.telefon || null },
          { etiket: 'İş e-postası', deger: p.eposta ? <a href={`mailto:${p.eposta}`}>{p.eposta}</a> : null },
        ]}
        />
      </Bolum>
      {ekip.length > 0 && (
        <Bolum baslik={`Ekibi (${ekip.length})`}>
          <ul className="tc-ikp-liste">
            {ekip.map((x) => (
              <li key={x.id}>
                <button type="button" className="tc-ikp-baglanti" onClick={() => { s.git('calisan', x.id); }}><KisiHucresi personel={x} /></button>
                <small className="tc-ikp-alt">{x.pozisyon ?? ''}</small>
              </li>
            ))}
          </ul>
        </Bolum>
      )}
    </>
  );
}

const iki = (n: number) => String(n).padStart(2, '0');
const isoGun = (d: Date) => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;

/* ---------------- Kimlik, İletişim, İş ---------------- */

export function BolumSekmesi(s: SekmeOzellikleri & { bolum: PersonelBolumu; baslik: string }) {
  return (
    <Bolum baslik={s.baslik} eylem={duzenleDugmesi(s, s.bolum, s.yetki.personelYaz)}>
      <Tanimlar satirlar={bolumSatirlari(s.bolum, s.p, s)} />
    </Bolum>
  );
}

/* ---------------- Ücret ---------------- */

export function UcretSekmesi(s: SekmeOzellikleri) {
  const { p, motor, yetki } = s;
  const komut = useIkKomutu();
  const yaz = useYazma();
  const [zamAcik, zamAcikYaz] = useState(false);
  const gun = bugun();
  const h = ucretGecmisi(p);
  const yanHak = (k: 'yemek' | 'yol') => {
    if (!motor) return null;
    const c = motor.benefitCfg(p, k);
    const genel = c.kisisel ? '' : ' (genel ayar)';
    if (!c.yontem || c.yontem === 'Yok') return `Yok${genel}`;
    if (['İşyerinde yemek', 'Servis'].includes(c.yontem)) return c.yontem + genel;
    const v = c.hesap === 'Brüt ücretin yüzdesi' ? `brütün %${sayiMetni(c.deger)}’i` : c.hesap === 'Aylık sabit tutar' ? `${paraKisa(c.deger)} / ay` : `${para(c.deger)} / gün`;
    return `${c.yontem}, ${v}${genel}`;
  };
  const tesvik = motor?.tesvikOf(p) ?? null;
  const primler = motor?.empPrims(p) ?? [];
  const tanimlar: Tanim[] = [
    ...bolumSatirlari('Ücret', p, s, ['brutMaas', 'banka', 'iban', 'besKatilim', 'oncekiKullanim', 'yanHakTutar', 'yanHaklar']),
    ...(motor ? [
      { etiket: 'Yemek yardımı', deger: yanHak('yemek') },
      { etiket: 'Yol yardımı', deger: yanHak('yol') },
      { etiket: 'SGK teşviki', deger: tesvik ? tesvik.ad + (p.tesvikId ? '' : ' (genel ayar)') : 'Teşvik yok' },
      {
        etiket: 'Prim ve ikramiyeler', genis: true,
        deger: primler.length ? <ul className="tc-ikp-duz">{primler.map((x) => <li key={x.p.id}>{`${x.p.ad} (${motor.primDesc(kisiselPrim(x.p, x.v))})`}</li>)}</ul> : 'Yok',
      },
      { etiket: 'Kıdeme esas giydirilmiş ücret (aylık)', genis: true, deger: para(motor.curBrut(p) + sayi(p.yanHakTutar) + motor.benefitMonthly(p) + motor.primMonthlyKidem(p)) },
    ] : []),
  ];
  const planliSil = (t: string) => yaz(komut.kaydet(ucretSil(p, t, gun)), 'Planlı ücret değişikliği silindi.');
  const satirlar = h.map((x, i) => ({ x, i })).reverse();
  return (
    <>
      <Bolum baslik="Ücret ve banka bilgileri" eylem={duzenleDugmesi(s, 'Ücret', yetki.ucretYaz)}>
        <Tanimlar satirlar={tanimlar} />
        {!motor && MOTOR_YOK}
      </Bolum>
      <Bolum baslik="Ücret geçmişi" eylem={yetki.ucretYaz ? <Dugme tur="birincil" simge="lira" onClick={() => { zamAcikYaz(true); }}>Ücret değişikliği</Dugme> : null}>
        {h.length ? (
          <Tablo<{ x: UcretSatiri; i: number }>
            etiket="Ücret geçmişi" satirlar={satirlar} satirAnahtari={(r) => r.x.tarih}
            sutunlar={[
              {
                anahtar: 'tarih', baslik: 'Yürürlük', kirilmaz: true,
                hucre: ({ x, i }) => {
                  const gecerli = x.tarih <= gun && (!h[i + 1] || (h[i + 1]?.tarih ?? '') > gun);
                  return <>{uzunTarih(x.tarih)} {x.tarih > gun ? <Rozet ton="bilgi">planlı</Rozet> : gecerli ? <Rozet ton="tamam">geçerli</Rozet> : null}</>;
                },
              },
              { anahtar: 'brut', baslik: 'Aylık brüt', hizala: 'sag', hucre: ({ x }) => para(sayi(x.brut)) },
              { anahtar: 'fark', baslik: 'Değişim', hizala: 'sag', hucre: ({ i }) => { const f = ucretDegisimi(h, i); return f === null ? YOK : `${f >= 0 ? '+' : ''}${sayiMetni(f)}%`; } },
              { anahtar: 'neden', baslik: 'Neden', hucre: ({ x }) => <>{x.neden ?? ''}{x.not && <small className="tc-ikp-alt">{x.not}</small>}</> },
              {
                anahtar: 'sil', baslik: 'İşlem', csv: false,
                hucre: ({ x }) => (yetki.ucretYaz && x.tarih > gun ? <Dugme simge="trash" onClick={() => { void planliSil(x.tarih); }}>Sil</Dugme> : null),
              },
            ]}
          />
        ) : <p className="tc-ikp-ipucu">{`Ücret geçmişi yok. İlk değişiklikte mevcut ücret (${para(ucretTarihte(p, gun))}) işe giriş tarihiyle başlangıç kaydı olarak eklenir.`}</p>}
        <Not>Bordro her ay, o ayın ilk günü geçerli olan ücretle hesaplanır. Geçmiş tarihli değişiklikler kesinleşmiş bordroları değiştirmez; fark ödemesi gerekiyorsa ilgili ayın bordrosuna ek ödeme olarak girin.</Not>
      </Bolum>
      <BordroTahmini o={s} personel={p} ay={gun.slice(0, 7)} />
      {yetki.ucretYaz && <UcretPenceresi acik={zamAcik} kapat={() => { zamAcikYaz(false); }} p={p} o={s} />}
    </>
  );
}

/* ---------------- İzinler ---------------- */

export function IzinSekmesi(s: SekmeOzellikleri) {
  const { p, motor, depo, yetki } = s;
  const [izinAcik, izinAcikYaz] = useState(false);
  const b = motor?.leaveBalance(p, new Date());
  const satirlar = b?.rows ?? [];
  const izinler = depo.tur('leave').filter((l) => l.empId === p.id).sort((a, c) => (c.baslangic ?? '').localeCompare(a.baslangic ?? ''));
  const gunTarih = (d: Date | string | null) => (d === null ? null : uzunTarih(d instanceof Date ? isoGun(d) : d));
  return (
    <>
      <Bolum baslik="Yıllık izin bakiyesi">
        {b ? (
          <>
            <Tanimlar satirlar={[
              { etiket: 'Hak edilen', deger: `${b.hak} gün` },
              { etiket: 'Sistem öncesi kullanılan', deger: `${sayiMetni(b.onceki)} gün` },
              { etiket: 'Kullanılan', deger: `${sayiMetni(b.used)} gün` },
              { etiket: 'Onay bekleyen', deger: `${sayiMetni(b.pending)} gün` },
              { etiket: 'Kalan', deger: b.kalan < 0 ? <Rozet ton="hata">{`${sayiMetni(b.kalan)} gün`}</Rozet> : `${sayiMetni(b.kalan)} gün` },
              { etiket: 'Sonraki hak ediş', deger: b.next ? `${gunTarih(b.next) ?? ''}, ${b.nextDays} gün` : null },
            ]}
            />
            {satirlar.length > 0 && (
              <details className="tc-ikp-ayrinti">
                <summary>Hizmet yılına göre hak ediş</summary>
                <Tablo
                  etiket="Hizmet yılına göre hak ediş" satirlar={satirlar} satirAnahtari={(r) => r.k}
                  sutunlar={[
                    { anahtar: 'k', baslik: 'Hizmet yılı', hucre: (r) => `${r.k}. yıl` },
                    { anahtar: 'ann', baslik: 'Hak ediş tarihi', hucre: (r) => gunTarih(r.ann) },
                    { anahtar: 'd', baslik: 'Gün', hizala: 'sag', hucre: (r) => r.d },
                    { anahtar: 'note', baslik: 'Not', hucre: (r) => r.note || '' },
                  ]}
                />
              </details>
            )}
          </>
        ) : MOTOR_YOK}
        <Not>4857 sayılı İş Kanunu'na göre 1–5 yıl için 14, 5–15 yıl için 20, 15 yıl ve üzeri için 26 gün; 18 yaş altı ve 50 yaş üstü çalışanlara en az 20 gün.</Not>
      </Bolum>
      <Bolum baslik="İzin kayıtları" eylem={yetki.izinYaz || yetki.izinTalep ? <Dugme simge="plus" onClick={() => { izinAcikYaz(true); }}>İzin ekle</Dugme> : null}>
        <IzinTablosu o={s} izinler={izinler} kisiSutunu={false} />
      </Bolum>
      {(yetki.izinYaz || yetki.izinTalep) && <IzinFormu o={s} acik={izinAcik} kayit={null} onDolu={{ empId: p.id }} kapat={() => { izinAcikYaz(false); }} />}
    </>
  );
}

/* ---------------- Devam ve mesai ---------------- */

function VardiyaBolumu({ p }: { p: Personel }) {
  const v = useKisiVardiyasi(p.id);
  const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  let icerik: ReactNode;
  if (v.isLoading) icerik = <DurumKutusu durum="yukleniyor" />;
  else if (v.isError || !v.data) icerik = <DurumKutusu durum="hata" mesaj="Vardiya bilgisi alınamadı." />;
  else if (!v.data.vardiya) icerik = <p className="tc-ikp-ipucu">Vardiya planında bu kişi bir iş merkezine bağlı değil.</p>;
  else {
    const w = v.data.vardiya;
    icerik = (
      <>
        <Tanimlar satirlar={[
          { etiket: 'İş merkezi', deger: `${w.isMerkezi.kod} ${w.isMerkezi.ad}` },
          { etiket: 'Vardiya', deger: w.secili ?? 'Seçili vardiya yok: iş merkezinin bütün vardiyalarında' },
        ]}
        />
        <Tablo
          etiket="Haftalık vardiya" satirlar={w.hafta} satirAnahtari={(h) => h.gun}
          sutunlar={[
            { anahtar: 'gun', baslik: 'Gün', hucre: (h) => GUNLER[h.gun - 1] ?? '' },
            { anahtar: 'v', baslik: 'Vardiya', hucre: (h) => (h.vardiyalar.length ? h.vardiyalar.map((x) => `${x.ad} ${x.baslangic}–${x.bitis}`).join(', ') : 'Çalışma yok') },
          ]}
        />
        <Not>Vardiya ve atama Vardiya ekranından değişir.</Not>
      </>
    );
  }
  return <Bolum baslik="Vardiya">{icerik}</Bolum>;
}

export function DevamSekmesi(s: SekmeOzellikleri) {
  const { p, depo, motor, yetki } = s;
  const [form, formYaz] = useState<{ kayit: Devam | null } | null>(null);
  const gun = bugun();
  const yil = gun.slice(0, 4);
  const sinir = sayi(motor ? ayar(motor, 'yillikMesaiLimit') : depo.ayarlar['yillikMesaiLimit']) || 270;
  const kayitlar = depo.tur('att').filter((a) => a.empId === p.id).sort((a, c) => (c.tarih ?? '').localeCompare(a.tarih ?? ''));
  const fm = yillikFazlaMesai(p.id, kayitlar, yil);
  const ton = fm > sinir ? 'hata' : fm > sinir * 0.85 ? 'uyari' : 'tamam';
  return (
    <>
      <VardiyaBolumu p={p} />
      <Bolum baslik="Puantaj takvimi"><KisiPuantajTakvimi o={s} personel={p.id} ay={gun.slice(0, 7)} /></Bolum>
      <Bolum baslik={`${yil} fazla mesai`}>
        <div className={`tc-ikp-olcer tc-ikp-olcer-${ton}`}>
          <span>Kullanılan</span>
          <progress max={sinir} value={Math.min(fm, sinir)} aria-label={`Kullanılan fazla mesai ${sayiMetni(fm)} / ${sinir} saat`} />
          <b>{`${sayiMetni(fm)} / ${sinir} sa`}</b>
        </div>
        <Not>İş Kanunu'na göre yıllık fazla çalışma 270 saati geçemez.</Not>
      </Bolum>
      <Bolum baslik="Devam ve mesai kayıtları" eylem={yetki.devamYaz ? <Dugme simge="plus" onClick={() => { formYaz({ kayit: null }); }}>Kayıt ekle</Dugme> : null}>
        <Tablo<Devam>
          etiket="Devam ve mesai kayıtları" satirlar={kayitlar} satirAnahtari={(a) => a.id} bosMesaj="Kayıt yok."
          satirSec={yetki.devamYaz ? (a) => { formYaz({ kayit: a }); } : undefined}
          sutunlar={[
            { anahtar: 'tarih', baslik: 'Tarih', hucre: (a) => tarih(a.tarih), kirilmaz: true },
            { anahtar: 'tur', baslik: 'Tür', hucre: (a) => a.tur ?? '' },
            { anahtar: 'saat', baslik: 'Saat', hizala: 'sag', hucre: (a) => (a.saat !== undefined ? sayiMetni(sayi(a.saat)) : YOK) },
            { anahtar: 'onay', baslik: 'Onay', hucre: (a) => (a.onay === 'Beklemede' ? <Rozet ton="uyari">Beklemede</Rozet> : <Rozet ton="tamam">Onaylandı</Rozet>) },
            { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (a) => a.aciklama ?? '' },
          ]}
        />
      </Bolum>
      {yetki.devamYaz && <DevamFormu o={s} acik={form !== null} kayit={form?.kayit ?? null} onDolu={{ empId: p.id }} kapat={() => { formYaz(null); }} />}
    </>
  );
}

/* ---------------- Özlük belgeleri ---------------- */

export function BelgeSekmesi(s: SekmeOzellikleri) {
  const { p, motor, depo, yetki } = s;
  const komut = useIkKomutu();
  const yaz = useYazma();
  const gun = bugun();
  const liste = motor ? motor.docList() : belgeListesi(typeof depo.ayarlar['belgeler'] === 'string' ? depo.ayarlar['belgeler'] : undefined);
  const bl = p.belgeler ?? {};
  const tamam = liste.filter((d) => bl[d]?.ok).length;
  if (!motor && liste.length === 0) return <Bolum baslik="Özlük dosyası belgeleri">{MOTOR_YOK}</Bolum>;
  return (
    <Bolum baslik={`Özlük dosyası belgeleri (${tamam}/${liste.length})`}>
      <ul className="tc-ikp-kontrol">
        {liste.map((d) => (
          <li key={d}>
            <IsaretKutusu
              etiket={d} checked={Boolean(bl[d]?.ok)} disabled={!yetki.personelYaz}
              onChange={(e) => { void yaz(komut.kaydet(belgeIsaretle(p, d, e.target.checked, gun)), null); }}
            />
            <small className="tc-ikp-alt">{bl[d]?.ok && bl[d]?.tarih ? tarih(bl[d]?.tarih) : ''}</small>
          </li>
        ))}
      </ul>
      <Not>Belge listesini Ayarlar sayfasından şirketinize göre düzenleyebilirsiniz.</Not>
    </Bolum>
  );
}

/* ---------------- Performans ve eğitim ---------------- */

export function GelisimSekmesi(s: SekmeOzellikleri) {
  const { p, depo, yetki } = s;
  const [form, formYaz] = useState<{ kayit: Performans | null } | null>(null);
  const gun = bugun();
  const perf = depo.tur('perf').filter((x) => x.empId === p.id).sort((a, c) => (c.tarih ?? '').localeCompare(a.tarih ?? ''));
  const egitim = depo.tur('train').filter((t) => (t.katilimcilar ?? []).includes(p.id)).sort((a, c) => (c.tarih ?? '').localeCompare(a.tarih ?? ''));
  const adi = (id: string | undefined) => adSoyadMetni(depo.tur('emp').find((x) => x.id === id)) || YOK;
  const sertifika = (t: Egitim) => {
    if (!t.gecerlilik) return YOK;
    if (t.gecerlilik < gun) return <Rozet ton="hata">Süresi doldu</Rozet>;
    const kalan = Math.round((new Date(`${t.gecerlilik}T00:00:00`).getTime() - new Date(`${gun}T00:00:00`).getTime()) / 864e5);
    return kalan <= 30 ? <Rozet ton="uyari">{tarih(t.gecerlilik)}</Rozet> : tarih(t.gecerlilik);
  };
  return (
    <>
      <Bolum baslik="Performans değerlendirmeleri" eylem={yetki.performansYaz ? <Dugme simge="plus" onClick={() => { formYaz({ kayit: null }); }}>Değerlendirme ekle</Dugme> : null}>
        <Tablo<Performans>
          etiket="Performans değerlendirmeleri" satirlar={perf} satirAnahtari={(x) => x.id} bosMesaj="Değerlendirme yok."
          satirSec={yetki.performansYaz ? (x) => { formYaz({ kayit: x }); } : undefined}
          sutunlar={[
            { anahtar: 'donem', baslik: 'Dönem', hucre: (x) => x.donem ?? '' },
            { anahtar: 'deg', baslik: 'Değerlendiren', hucre: (x) => (x.degerlendirenId ? adi(x.degerlendirenId) : YOK) },
            { anahtar: 'ort', baslik: 'Ortalama', hizala: 'sag', hucre: (x) => { const o = performansOrtalamasi(x); return o === null ? YOK : sayiMetni(Math.round(o * 100) / 100); } },
            { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (x) => { const [l, t] = performansEtiketi(performansOrtalamasi(x)); return <Rozet ton={t}>{l}</Rozet>; } },
            { anahtar: 'tarih', baslik: 'Tarih', hucre: (x) => tarih(x.tarih), kirilmaz: true },
          ]}
        />
      </Bolum>
      <Bolum baslik={`Eğitimler (tamamlanan ${sayiMetni(tamamlananEgitimSaati(egitim))} saat)`}>
        <Tablo<Egitim>
          etiket="Eğitimler" satirlar={egitim} satirAnahtari={(t) => t.id} bosMesaj="Eğitim kaydı yok."
          sutunlar={[
            { anahtar: 'ad', baslik: 'Eğitim', hucre: (t) => <>{t.ad ?? ''}{t.kurum && <small className="tc-ikp-alt">{t.kurum}</small>}</> },
            { anahtar: 'tur', baslik: 'Tür', hucre: (t) => t.tur ?? '' },
            { anahtar: 'tarih', baslik: 'Tarih', hucre: (t) => tarih(t.tarih), kirilmaz: true },
            { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', hucre: (t) => (t.sure ? `${sayiMetni(sayi(t.sure))} sa` : YOK) },
            { anahtar: 'sertifika', baslik: 'Sertifika', hucre: sertifika },
            { anahtar: 'durum', baslik: 'Durum', hucre: (t) => <Rozet ton={t.durum === 'Tamamlandı' ? 'tamam' : t.durum === 'İptal' ? 'pasif' : 'bilgi'}>{t.durum ?? ''}</Rozet> },
          ]}
        />
      </Bolum>
      {yetki.performansYaz && <PerformansFormu o={s} acik={form !== null} kayit={form?.kayit ?? null} onDolu={{ empId: p.id }} kapat={() => { formYaz(null); }} />}
    </>
  );
}

/* ---------------- Ayrılış ---------------- */

export function AyrilisSekmesi(s: SekmeOzellikleri) {
  const { p, depo, yetki, git } = s;
  const komut = useIkKomutu();
  const yaz = useYazma();
  const gun = bugun();
  const [varsayim, varsayimYaz] = useState(gun);
  const [belge, belgeYaz] = useState<'calisma' | 'tazminat' | null>(null);
  const [pozisyonAcik, pozisyonAcikYaz] = useState(false);
  const yerine = depo.tur('job').find((x) => x.yerineId === p.id);
  const cikis = p.cikisTarihi || varsayim || gun;
  const brut = ucretTarihte(p, gun);
  const ck = p.cikisListesi ?? {};
  return (
    <>
      {p.cikisTarihi && (
        <Bolum
          baslik="Çıkış kontrol listesi"
          eylem={(
            <>
              <Dugme simge="printer" onClick={() => { belgeYaz('calisma'); }}>Çalışma belgesi</Dugme>
              {!yerine && yetki.iseAlimYaz && <Dugme simge="user-plus" onClick={() => { pozisyonAcikYaz(true); }}>Yerine pozisyon aç</Dugme>}
            </>
          )}
        >
          <ul className="tc-ikp-kontrol">
            {CIKIS_ADIMLARI.map(([k, l, ipucu]) => (
              <li key={k}>
                <IsaretKutusu
                  etiket={l} checked={Boolean(ck[k])} disabled={!yetki.personelYaz}
                  onChange={(e) => { void yaz(komut.kaydet(cikisAdimi(p, k, e.target.checked, gun)), null); }}
                />
                {ipucu && <small className="tc-ikp-ipucu">{ipucu}</small>}
                <small className="tc-ikp-alt">{ck[k] ? tarih(ck[k]) : ''}</small>
              </li>
            ))}
          </ul>
          <Not>{`${cikisIlerlemesi(p)}/${CIKIS_ADIMLARI.length} adım tamamlandı.`}</Not>
          <Not>
            {yerine
              ? <>Yerine açılan pozisyon: <button type="button" className="tc-ikp-baglanti" onClick={() => { git('pozisyon', yerine.id); }}>{yerine.baslik ?? ''}</button>{` (${yerine.durum ?? ''})`}</>
              : 'Yerine eleman alınacaksa pozisyonu buradan bilgileri doldurulmuş olarak açabilirsiniz.'}
          </Not>
        </Bolum>
      )}
      <Bolum baslik="Ayrılış bilgileri" eylem={duzenleDugmesi(s, 'Ayrılış', yetki.personelYaz)}>
        <Tanimlar satirlar={bolumSatirlari('Ayrılış', p, s)} />
      </Bolum>
      <Bolum
        baslik="Kıdem, ihbar ve kullanılmayan izin ücreti"
        eylem={brut ? (
          <>
            <Dugme simge="ruler" onClick={() => { git('hesap'); }}>Farklı senaryo</Dugme>
            <Dugme simge="printer" onClick={() => { belgeYaz('tazminat'); }}>Hesap dökümü</Dugme>
          </>
        ) : null}
      >
        {!p.cikisTarihi && (
          <div className="tc-ikp-satir">
            <Girdi etiket="Varsayımsal çıkış tarihi" type="date" value={varsayim} onChange={(e) => { varsayimYaz(e.target.value); }} />
            <p className="tc-ikp-ipucu">Çıkış nedeni seçilmediği için ihbar tazminatı toplama dahil edildi.</p>
          </div>
        )}
        {brut ? <TazminatHesabi o={s} personel={p} cikis={cikis} /> : <p className="tc-ikp-ipucu">Hesaplama için işe giriş tarihi ve brüt ücret gerekli.</p>}
        <Not>Yıl içi vergi matrahı bordrodan, kullanılmayan izin gün sayısı izin bakiyesinden alınır. Bu hesap tahminidir; kesin tutar için mali müşavir veya hukuk danışmanınıza başvurun.</Not>
      </Bolum>
      {belge === 'calisma' && <CalismaBelgesi o={s} personel={p} kapat={() => { belgeYaz(null); }} />}
      {belge === 'tazminat' && <TazminatDokumu o={s} personel={p} cikis={cikis} kapat={() => { belgeYaz(null); }} />}
      {yetki.iseAlimYaz && (
        <PozisyonFormu
          acik={pozisyonAcik} onDolu={yerinePozisyonTaslagi(p, brut, gun)} kapat={() => { pozisyonAcikYaz(false); }}
          kaydedildi={(j) => { git('pozisyon', j.id); }}
        />
      )}
    </>
  );
}

/* ---------------- Zaman çizelgesi ---------------- */

const OLAY_TURLERI: readonly (readonly [OlayTuru | '', string])[] = [['', 'Tümü'], ['ucret', 'Ücret'], ['hareket', 'Görev'], ['izin', 'İzin'], ['perf', 'Performans'], ['egitim', 'Eğitim'], ['kayit', 'Kayıt değişiklikleri']];
const OLAY_SIMGE = { kayit: 'eye', giris: 'user', ucret: 'lira', hareket: 'layers', izin: 'flag', perf: 'target', egitim: 'lab', not: 'edit', cikis: 'logout' } as const;

export function CizelgeSekmesi(s: SekmeOzellikleri) {
  const { p, depo } = s;
  const [tur, turYaz] = useState<OlayTuru | ''>('');
  const gun = bugun();
  const olaylar = zamanCizelgesi(p, {
    gun, izinler: depo.tur('leave'), performanslar: depo.tur('perf'), egitimler: depo.tur('train'), gecmis: depo.gecmis,
    departmanAdi: (id) => depo.tur('dept').find((d) => d.id === id)?.ad ?? '', alanAdi: alanEtiketi, para: (v) => paraKisa(v), kisaTarih: tarih,
  }).filter((x) => !tur || x.tur === tur);
  return (
    <Bolum baslik="Zaman çizelgesi">
      <div className="tc-ikp-cipler" role="group" aria-label="Olay türü">
        {OLAY_TURLERI.map(([k, l]) => <Dugme key={k} aria-pressed={tur === k} onClick={() => { turYaz(k); }}>{l}</Dugme>)}
      </div>
      {olaylar.length ? (
        <ol className="tc-ikp-cizelge">
          {olaylar.map((x, i) => (
            <li key={`${x.tarih}-${x.tur}-${i}`} data-ton={x.ton || undefined}>
              <span className="tc-ikp-cizelge-simge" aria-hidden="true"><Simge ad={OLAY_SIMGE[x.tur]} boyut="k" /></span>
              <span className="tc-ikp-cizelge-tarih">{uzunTarih(x.tarih)}{x.tarih > gun && <> <Rozet ton="bilgi">planlı</Rozet></>}</span>
              <b>{x.baslik}</b>
              {x.alt && <small className="tc-ikp-alt">{x.alt}</small>}
            </li>
          ))}
        </ol>
      ) : <p className="tc-ikp-ipucu">Bu türde kayıt yok.</p>}
      <Not>Pozisyon, departman, yönetici, sözleşme ve çalışma şekli değişiklikleri personel kartı her düzenlendiğinde otomatik kaydedilir.</Not>
    </Bolum>
  );
}

/* ---------------- Notlar ---------------- */

export function NotSekmesi(s: SekmeOzellikleri) {
  const { p, yetki } = s;
  const komut = useIkKomutu();
  const yaz = useYazma();
  const { bildir } = useBildirim();
  const [metin, metinYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>();
  const notlar = siraliNotlar(p);
  const ekle = async () => {
    const m = metin.trim();
    if (!m) { hataYaz('Not boş olamaz.'); return; }
    if (!await yaz(komut.kaydet(notEkle(p, m, new Date().toISOString())), 'Not eklendi.')) return;
    metinYaz('');
    hataYaz(undefined);
  };
  const sil = async (t: string) => {
    const once = { ...p };
    if (!await yaz(komut.kaydet(notSil(p, t)), null)) return;
    bildir('tamam', 'Not silindi.', { eylem: { etiket: 'Geri al', yap: () => { void yaz(komut.kaydet(once), 'Not geri getirildi.'); } } });
  };
  return (
    <Bolum baslik="Notlar">
      {yetki.personelYaz && (
        <div className="tc-ikp-not-yaz">
          <CokSatir etiket="Yeni not" value={metin} hata={hata} placeholder="Görüşme, uyarı, teşekkür veya hatırlatma" onChange={(e) => { metinYaz(e.target.value); }} />
          <Dugme tur="birincil" onClick={() => { void ekle(); }} yukleniyor={komut.calisiyor}>Notu ekle</Dugme>
        </div>
      )}
      {notlar.length ? (
        <ul className="tc-ikp-notlar">
          {notlar.map((n) => (
            <li key={n.t}>
              <small className="tc-ikp-alt">{new Date(n.t).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })}</small>
              {yetki.personelYaz && <Dugme simge="trash" aria-label="Notu sil" onClick={() => { void sil(n.t); }}>Sil</Dugme>}
              <p>{n.m}</p>
            </li>
          ))}
        </ul>
      ) : <p className="tc-ikp-ipucu">Henüz not yok.</p>}
    </Bolum>
  );
}
