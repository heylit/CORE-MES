import { useMemo, useState, type ReactNode } from 'react';
import { DurumKutusu, Dugme, Kart, SayiKarti } from '../../../../ortak/arayuz/index.ts';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { paraKisa, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { ALAN_ADLARI, PERSONEL_SUTUNLARI } from './alanlar.ts';
import { analizMotoru, analizVerisi, bugunGece } from './baglam.ts';
import { Cubuklar, YakaBolunmesi, YakaGostergesi } from './grafikler.tsx';
import { izinCsv, personelCsv, rapor, sayiYaz, sureMetni, type YakaOzeti } from './kurallar.ts';
import './analiz.css';

const POZISYON_SINIRI = 12;
const ondalik = (x: number) => sayiYaz(Math.round(x * 10) / 10);

function YakaKarti({ baslik, tur, o }: { baslik: string; tur: 'beyaz' | 'mavi'; o: YakaOzeti }) {
  return (
    <div className="tc-ikr-yaka-ozet">
      <h4><i className={`tc-ikr-gosterge-${tur}`} aria-hidden="true" />{baslik}</h4>
      <dl>
        <dt>Çalışan</dt><dd>{o.calisan}</dd>
        <dt>Ortalama brüt ücret</dt><dd>{o.ortalamaBrut === null ? YOK : paraKisa(o.ortalamaBrut)}</dd>
        <dt>Aylık brüt ücret toplamı</dt><dd>{paraKisa(o.toplamBrut)}</dd>
        <dt>Kadın çalışan oranı</dt><dd>%{o.kadinOrani}</dd>
        <dt>Yaş ortalaması</dt><dd>{o.yasOrtalamasi === null ? YOK : ondalik(o.yasOrtalamasi)}</dd>
        <dt>Ortalama kıdem</dt><dd>{o.ortalamaKidem === null ? YOK : `${ondalik(o.ortalamaKidem)} yıl`}</dd>
      </dl>
    </div>
  );
}

const Panel = ({ baslik, children }: { baslik: string; children: ReactNode }) => <Kart baslik={baslik}>{children}</Kart>;

export function Raporlar(o: IkEkranOzellikleri) {
  const { depo, motor } = o;
  const bugun = useMemo(bugunGece, []);
  const sabit = ikSabitleri();
  const m = useMemo(() => (motor && sabit ? analizMotoru(motor, sabit, bugun) : null), [motor, sabit, bugun]);
  const v = useMemo(() => analizVerisi(depo), [depo]);
  const r = useMemo(() => (m ? rapor(v, m, bugun, paraKisa) : null), [v, m, bugun]);
  const [tumPozisyonlar, setTum] = useState(false);

  const indir = (ne: 'personel' | 'izin') => {
    if (ne === 'izin') { const c = izinCsv(v); csvIndir('izin-kayitlari', c.basliklar, c.satirlar); return; }
    if (!m) return;
    const c = personelCsv(v, m, PERSONEL_SUTUNLARI, ALAN_ADLARI['emp'] ?? {}, bugun, sureMetni);
    csvIndir('personel-listesi', c.basliklar, c.satirlar);
  };
  useSayfaKomutlari('ik-rapor', [
    ...(m ? [{ anahtar: 'personel', baslik: 'Personel listesini indir', simge: 'download' as const, aciklama: 'Aktif ve ayrılmış çalışanlar, CSV.', sozcukler: ['personel', 'liste', 'csv', 'excel'], calistir: () => { indir('personel'); } }] : []),
    { anahtar: 'izin', baslik: 'İzin kayıtlarını indir', simge: 'download', aciklama: 'Bütün izin kayıtları, CSV.', sozcukler: ['izin', 'csv', 'excel'], calistir: () => { indir('izin'); } },
  ]);
  const baslik = (
    <SayfaBasligi
      baslik="Raporlar" simge="chart"
      alt="Aktif çalışanların yaka, kademe ve pozisyon dağılımı, profil, ücret yapısı, giriş-çıkış hareketi ve izin kullanımı."
      eylemler={[
        { anahtar: 'personel', baslik: 'Personel listesi', simge: 'download', sec: () => { indir('personel'); }, ...(m ? {} : { pasif: true, pasifNedeni: MOTOR_HAZIRLANIYOR }) },
        { anahtar: 'izin', baslik: 'İzin kayıtları', simge: 'download', sec: () => { indir('izin'); } },
      ]}
    />
  );
  if (!depo.tur('emp').length) return <div className="tc-ikr">{baslik}<DurumKutusu durum="bos" mesaj="Rapor için veri yok. Personel ekledikçe dağılımlar burada oluşur." /></div>;
  if (!r) return <div className="tc-ikr">{baslik}<DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} /></div>;

  const pozisyonlar = tumPozisyonlar ? r.pozisyonlar : r.pozisyonlar.slice(0, POZISYON_SINIRI);
  const enCokPozisyon = r.pozisyonlar[0]?.toplam ?? 1;
  const enCokKademe = Math.max(1, ...r.kademeler.map((k) => k.toplam));

  return (
    <div className="tc-ikr">
      {baslik}
      <div className="tc-ikr-sayilar">
        <SayiKarti baslik="Aktif çalışan" simge="users" sayi={r.aktif} />
        <SayiKarti baslik="Kadın çalışan oranı" simge="user" metin={`%${r.kadinOrani}`} />
        <SayiKarti baslik="Yaş ortalaması" simge="chart" metin={r.yasOrtalamasi === null ? YOK : ondalik(r.yasOrtalamasi)} />
        <SayiKarti baslik="Ortalama kıdem" simge="clock" metin={r.ortalamaKidem === null ? YOK : `${ondalik(r.ortalamaKidem)} yıl`} />
        <SayiKarti baslik="Aylık brüt ücret yükü" simge="lira" metin={paraKisa(r.brutYuku)} />
        <SayiKarti
          baslik={`Engelli çalışan${r.engelliGerek ? ' (zorunlu)' : ''}`} simge="user-plus" ton="uyari"
          {...(r.engelliGerek && r.engelli < r.engelliGerek ? { sayi: r.engelliGerek - r.engelli, altMetin: `${r.engelli} / ${r.engelliGerek}` } : { metin: r.engelliGerek ? `${r.engelli} / ${r.engelliGerek}` : String(r.engelli) })}
        />
      </div>
      {r.aktif > 0 && (
        <>
          <Kart baslik="Yaka dağılımı">
            <YakaBolunmesi beyaz={r.yaka.beyaz} mavi={r.yaka.mavi} />
            <YakaGostergesi beyaz={r.yaka.beyaz} mavi={r.yaka.mavi} />
            <div className="tc-ikr-yaka-ozetler">
              <YakaKarti baslik="Beyaz yaka" tur="beyaz" o={r.yaka.beyazOzet} />
              <YakaKarti baslik="Mavi yaka" tur="mavi" o={r.yaka.maviOzet} />
            </div>
          </Kart>
          <div className="tc-ikr-izgara">
            <Kart baslik="Departmanlara göre yaka dağılımı">
              <div className="tc-ikr-cubuklar">
                {r.departmanYaka.map((d) => (
                  <div key={d.ad} className="tc-ikr-cubuk-satir">
                    <span className="tc-ikr-cubuk-ad" title={d.ad}>{d.ad}</span>
                    <YakaBolunmesi beyaz={d.beyaz} mavi={d.mavi} kucuk etiket={`${d.ad}: ${d.beyaz} beyaz, ${d.mavi} mavi yaka`} />
                    <span className="tc-ikr-cubuk-deger">{d.beyaz} / {d.mavi}</span>
                  </div>
                ))}
              </div>
              <YakaGostergesi sayili={false} />
              <p className="tc-ikr-not">Sağdaki sayılar: beyaz / mavi</p>
            </Kart>
            <Kart baslik="Rol kademesi dağılımı">
              <div className="tc-ikr-cubuklar">
                {r.kademeler.map((k) => (
                  <div key={k.ad} className="tc-ikr-cubuk-satir">
                    <span className="tc-ikr-cubuk-ad" title={k.ad}>{k.ad}</span>
                    <svg className="tc-ikr-cubuk" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`${k.ad}: ${k.toplam} kişi`}>
                      <rect className="tc-ikr-yaka-beyaz" x="0" y="0" width={(k.beyaz / enCokKademe) * 100} height="10" />
                      <rect className="tc-ikr-yaka-mavi" x={(k.beyaz / enCokKademe) * 100} y="0" width={((k.toplam - k.beyaz) / enCokKademe) * 100} height="10" />
                    </svg>
                    <span className="tc-ikr-cubuk-deger">{k.toplam}</span>
                  </div>
                ))}
              </div>
              <p className="tc-ikr-not">Kademeler üstten alta organizasyon hiyerarşisini gösterir; çubuk renkleri o kademedeki beyaz ve mavi yaka oranıdır.</p>
            </Kart>
          </div>
          <Kart
            baslik="Pozisyonlara göre çalışan sayısı"
            sag={r.pozisyonlar.length > POZISYON_SINIRI
              ? <Dugme onClick={() => { setTum(!tumPozisyonlar); }}>{tumPozisyonlar ? 'İlk 12 pozisyon' : `Tüm pozisyonlar (${r.pozisyonlar.length})`}</Dugme>
              : undefined}
          >
            <div className="tc-ikr-cubuklar">
              {pozisyonlar.map((p) => (
                <div key={p.ad} className="tc-ikr-cubuk-satir">
                  <span className="tc-ikr-cubuk-ad" title={p.ad}>{p.ad}</span>
                  <svg className={`tc-ikr-cubuk tc-ikr-cubuk-${p.mavi > p.toplam / 2 ? 'mavi' : 'beyaz'}`} viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`${p.ad}: ${p.toplam} kişi`}>
                    <rect className="tc-ikr-cubuk-zemin" x="0" y="0" width="100" height="10" rx="2" />
                    <rect className="tc-ikr-cubuk-dolu" x="0" y="0" width={(p.toplam / enCokPozisyon) * 100} height="10" rx="2" />
                  </svg>
                  <span className="tc-ikr-cubuk-deger">{p.toplam}</span>
                </div>
              ))}
            </div>
            <div className="tc-ikr-gosterge">
              <span><i className="tc-ikr-gosterge-beyaz" />Beyaz yaka pozisyon</span>
              <span><i className="tc-ikr-gosterge-mavi" />Mavi yaka pozisyon</span>
            </div>
            {r.tahminEdilen > 0 && <p className="tc-ikr-not">{r.tahminEdilen} çalışanın yaka tipi veya kademesi girilmemiş; bunlar pozisyon adından tahmin edildi. Personel kartındaki İş bilgileri bölümünden kesinleştirebilirsiniz.</p>}
          </Kart>
        </>
      )}
      <div className="tc-ikr-izgara tc-ikr-izgara-esit">
        <Panel baslik="Departmana göre çalışan"><Cubuklar satirlar={r.departman} /></Panel>
        <Panel baslik="Departmana göre ortalama brüt ücret"><Cubuklar satirlar={r.departmanBrut} tur="ikinci" /></Panel>
        <Panel baslik="Yaş dağılımı"><Cubuklar satirlar={r.yas} /></Panel>
        <Panel baslik="Kıdem dağılımı"><Cubuklar satirlar={r.kidem} /></Panel>
        <Panel baslik="Cinsiyet"><Cubuklar satirlar={r.cinsiyet} /></Panel>
        <Panel baslik="Eğitim düzeyi"><Cubuklar satirlar={r.egitim} /></Panel>
        <Panel baslik="Sözleşme türü"><Cubuklar satirlar={r.sozlesme} /></Panel>
        <Panel baslik="Çalışma şekli"><Cubuklar satirlar={r.calismaSekli} /></Panel>
        <Panel baslik={`${r.izinYili} izin kullanımı (gün)`}><Cubuklar satirlar={r.izinKullanimi} /></Panel>
        <Panel baslik="Çıkış nedenleri (tüm zamanlar)"><Cubuklar satirlar={r.cikisNedenleri} /></Panel>
        <Panel baslik="Aday kaynakları"><Cubuklar satirlar={r.adayKaynaklari} /></Panel>
      </div>
      <Kart baslik="Son 12 ay işe giriş ve çıkış">
        <div className="tc-ikr-tablo-kap">
          <table className="tc-ikr-akis">
            <thead><tr><th scope="col">Ay</th>{r.girisCikis.map((f) => <th key={f.ay} scope="col">{f.ay}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">İşe giriş</th>{r.girisCikis.map((f) => <td key={f.ay}>{f.giris || '·'}</td>)}</tr>
              <tr><th scope="row">İşten çıkış</th>{r.girisCikis.map((f) => <td key={f.ay}>{f.cikis || '·'}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </Kart>
    </div>
  );
}
