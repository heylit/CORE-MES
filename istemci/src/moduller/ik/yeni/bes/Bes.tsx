import { useMemo, useState } from 'react';
import {
  CokSatir, DurumKutusu, Dugme, FormPenceresi, Girdi, IsaretKutusu, OnayPenceresi, Rozet, SayiKarti, Secim, Simge, Tablo, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { adSoyad, tarih, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import {
  BES_CIKIS_TURLERI, BES_GIRIS_TURLERI, BES_TUR_ADI, besGirdisiDenetle, besOzeti, besSatiri, besSatirlari, caymaYaklasanlar, girisMi,
  otomatikKapsamda, type BesGirdisi, type BesHareketi, type BesSatiri, type BesSuzgeci, type BesTuru,
} from './kurallar.ts';
import { useBes, useBesKomutu } from './veri.ts';
import './bes.css';

const DURUM_ADI = { bes: "BES'te", cikti: "BES'ten çıktı", hic: 'Hiç girmedi' } as const;
const DURUM_TONU = { bes: 'tamam', cikti: 'pasif', hic: 'bilgi' } as const;
const oranMetni = (v: number | null): string => (v === null ? YOK : `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`);

// BES takibi (kart 1939): kim BES'te, kim çıktı, giriş ve çıkış tarihleri. Durum hareketlerden çıkar; hareket silinmez, iptal edilir.
export function BesSayfasi(o: IkEkranOzellikleri) {
  const { depo, yetki, git } = o;
  const gun = tesisGunu(Date.now());
  const okuma = useBes();
  const [suzgec, suzgecYaz] = useState<BesSuzgeci>({ ara: '', durum: '', ayrilanlar: false });
  const [form, formYaz] = useState<{ personel: string; tur: BesTuru | '' } | null>(null);
  const [secili, seciliYaz] = useState<string | null>(null);
  const yazabilir = yetki.ucretYaz;
  const personeller = depo.tur('emp');
  const hareketler = okuma.data?.hareketler ?? [];
  const satirlar = useMemo(() => besSatirlari(personeller, hareketler, suzgec, gun), [personeller, hareketler, suzgec, gun]);
  const tumu = useMemo(() => besSatirlari(personeller, hareketler, { ara: '', durum: '', ayrilanlar: false }, gun), [personeller, hareketler, gun]);
  const ozet = besOzeti(tumu);
  const yaklasan = caymaYaklasanlar(tumu, gun);

  useSayfaKomutlari('ik-bes', yazabilir ? [{
    anahtar: 'ekle', baslik: 'BES hareketi gir', simge: 'plus', aciklama: null, sozcukler: ['bes', 'emeklilik', 'cayma'], calistir: () => { formYaz({ personel: '', tur: '' }); },
  }] : null);

  const sutunlar: Sutun<BesSatiri>[] = [
    { anahtar: 'ad', baslik: 'Personel', hucre: (r) => (
      <span className="tc-ikbes-iki-satir"><b>{adSoyad(r.personel)}</b><small>{r.personel.sicilNo ?? ''}</small></span>
    ), csv: (r) => adSoyad(r.personel) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (r) => <Rozet ton={DURUM_TONU[r.durum]}>{DURUM_ADI[r.durum]}</Rozet>, csv: (r) => DURUM_ADI[r.durum] },
    { anahtar: 'giris', baslik: 'Giriş tarihi', hucre: (r) => tarih(r.giris?.tarih), csv: (r) => r.giris?.tarih ?? '' },
    { anahtar: 'katilim', baslik: 'Katılım', hucre: (r) => (r.giris ? BES_TUR_ADI[r.giris.tur] : YOK) },
    { anahtar: 'cikis', baslik: 'Çıkış tarihi', hucre: (r) => tarih(r.cikis?.tarih), csv: (r) => r.cikis?.tarih ?? '' },
    { anahtar: 'cikisTuru', baslik: 'Çıkış türü', hucre: (r) => (r.cikis ? BES_TUR_ADI[r.cikis.tur] : YOK) },
    { anahtar: 'oran', baslik: 'Katkı oranı', hizala: 'sag', hucre: (r) => oranMetni(r.giris?.oran ?? null) },
    { anahtar: 'cayma', baslik: 'Cayma son gün', hucre: (r) => (r.caymaSonu === null ? YOK : r.caymaSonu < gun ? tarih(r.caymaSonu) : <Rozet ton="uyari">{tarih(r.caymaSonu)}</Rozet>) },
  ];

  const seciliSatir = secili ? tumu.find((r) => r.personel.id === secili) ?? null : null;

  return (
    <div className="tc-ikbes">
      <header className="tc-ikbes-baslik">
        <div className="tc-ikbes-baslik-bas">
          <h2 className="tc-ikbes-baslik-ad"><Simge ad="lira" /><span>BES</span></h2>
          <div className="tc-ikbes-soluk">Bireysel Emeklilik Sistemi: BES'te olanlar, çıkanlar, giriş ve çıkış tarihleri.</div>
        </div>
        {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { formYaz({ personel: '', tur: '' }); }}>BES hareketi gir</Dugme>}
      </header>
      {okuma.isError ? <DurumKutusu durum="hata" mesaj="BES kayıtları alınamadı." /> : (
        <>
          <div className="tc-ikbes-sayilar">
            <SayiKarti baslik="BES'te" simge="check" sayi={okuma.isPending ? undefined : ozet.bes} />
            <SayiKarti baslik="BES'ten çıkan" simge="logout" sayi={okuma.isPending ? undefined : ozet.cikti} />
            <SayiKarti baslik="Hiç girmeyen" simge="user" sayi={okuma.isPending ? undefined : ozet.hic} />
            <SayiKarti baslik="Cayma süresi 15 gün içinde dolan" simge="clock" ton="uyari" sayi={okuma.isPending ? undefined : yaklasan.length} />
          </div>
          <Tablo<BesSatiri>
            etiket="BES durumu" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(r) => r.personel.id} mesgul={okuma.isPending}
            bosMesaj="Bu süzgece uyan personel yok." satirSec={(r) => { seciliYaz(r.personel.id); }}
            arac={{
              arama: { deger: suzgec.ara, degistir: (ara) => { suzgecYaz({ ...suzgec, ara }); }, etiket: 'Personel ara', yerTutucu: 'Ad, soyad ya da sicil' },
              suzgec: {
                etiket: 'Durum', secili: suzgec.durum, sec: (d) => { suzgecYaz({ ...suzgec, durum: d as BesSuzgeci['durum'] }); },
                secenekler: [{ deger: '', baslik: 'Tümü' }, { deger: 'bes', baslik: "BES'te olanlar" }, { deger: 'cikti', baslik: "BES'ten çıkanlar" }, { deger: 'hic', baslik: 'Hiç girmeyenler' }],
              },
              csv: { ad: 'bes-durumu', satirlar },
              sag: <IsaretKutusu etiket="İşten ayrılanlar da" checked={suzgec.ayrilanlar} onChange={(e) => { suzgecYaz({ ...suzgec, ayrilanlar: e.target.checked }); }} />,
            }}
          />
          <p className="tc-ikbes-soluk tc-ikbes-not">
            Otomatik katılımda cayma süresi katılımdan sonra 2 aydır; süre dolduktan sonraki çıkış Ayrılma olarak girilir. Kesinti bordroda personel kartındaki BES işaretinden yapılır.
          </p>
        </>
      )}
      {seciliSatir && (
        <KisiHareketleri
          satir={seciliSatir} hareketler={hareketler} gun={gun} yazabilir={yazabilir}
          kapat={() => { seciliYaz(null); }} calisan={() => { git('calisan', seciliSatir.personel.id); }}
          yeni={(tur) => { formYaz({ personel: seciliSatir.personel.id, tur }); }}
        />
      )}
      {form && (
        <BesFormu
          o={o} ilk={form} hareketler={hareketler} gun={gun} kapat={() => { formYaz(null); }}
        />
      )}
    </div>
  );
}

function KisiHareketleri({ satir, hareketler, gun, yazabilir, kapat, calisan, yeni }: {
  satir: BesSatiri; hareketler: readonly BesHareketi[]; gun: string; yazabilir: boolean; kapat: () => void; calisan: () => void; yeni: (tur: BesTuru) => void;
}) {
  const { iptal, calisiyor } = useBesKomutu();
  const [soru, soruYaz] = useState<BesHareketi | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const liste = hareketler.filter((h) => h.personel === satir.personel.id).sort((a, b) => (a.tarih === b.tarih ? b.id - a.id : a.tarih < b.tarih ? 1 : -1));
  const kapsam = otomatikKapsamda(satir.personel, gun);
  return (
    <section className="tc-ikbes-kutu" aria-label={`${adSoyad(satir.personel)} BES hareketleri`}>
      <div className="tc-ikbes-kutu-bas">
        <h3>{adSoyad(satir.personel)}</h3>
        <span className="tc-ikbes-eylemler">
          <Dugme simge="user" onClick={calisan}>Çalışan sayfası</Dugme>
          {yazabilir && <Dugme simge="plus" onClick={() => { yeni(satir.durum === 'bes' ? 'ayrilma' : 'otomatik_katilim'); }}>{satir.durum === 'bes' ? 'Çıkış gir' : 'Giriş gir'}</Dugme>}
          <Dugme simge="x" onClick={kapat}>Kapat</Dugme>
        </span>
      </div>
      {satir.durum === 'hic' && kapsam !== null && (
        <p className="tc-ikbes-soluk">{kapsam ? '45 yaşını doldurmamış: otomatik katılım kapsamında.' : '45 yaşını doldurmuş: yalnız gönüllü katılım.'}</p>
      )}
      {hata && <p role="alert" className="tc-ikbes-hata">{hata}</p>}
      {liste.length === 0 ? <p className="tc-ikbes-soluk">BES hareketi yok.</p> : (
        <ul className="tc-ikbes-liste">
          {liste.map((h) => (
            <li key={h.id} className="tc-ikbes-satir" data-iptal={h.iptal ? '' : undefined}>
              <span className="tc-ikbes-iki-satir">
                <b>{tarih(h.tarih)} · {BES_TUR_ADI[h.tur]}{h.iptal ? ' (iptal)' : ''}</b>
                <small>{[girisMi(h.tur) ? oranMetni(h.oran) : null, h.sirket, h.aciklama, h.yazan].filter(Boolean).join(' · ')}</small>
              </span>
              {yazabilir && !h.iptal && <Dugme simge="trash" tur="tehlike" disabled={calisiyor} onClick={() => { soruYaz(h); }}>İptal et</Dugme>}
            </li>
          ))}
        </ul>
      )}
      <OnayPenceresi
        acik={soru !== null} baslik="BES hareketini iptal et" onayMetni="İptal et" tehlikeli
        vazgec={() => { soruYaz(null); }}
        onayla={() => {
          const h = soru;
          soruYaz(null);
          if (!h) return;
          hataYaz(null);
          iptal(h).catch((e: unknown) => { hataYaz(e instanceof Error ? e.message : 'Hareket iptal edilemedi.'); });
        }}
      >
        <p>Hareket silinmez; iptal edilmiş olarak listede kalır ve durum hesabına girmez.</p>
      </OnayPenceresi>
    </section>
  );
}

const turSecenekleri = (turler: readonly BesTuru[]) => turler.map((t) => ({ deger: t, baslik: BES_TUR_ADI[t] }));

function BesFormu({ o, ilk, hareketler, gun, kapat }: {
  o: IkEkranOzellikleri; ilk: { personel: string; tur: BesTuru | '' }; hareketler: readonly BesHareketi[]; gun: string; kapat: () => void;
}) {
  const { ekle } = useBesKomutu();
  const personeller = o.depo.tur('emp').filter((p) => !p.cikisTarihi || p.cikisTarihi >= gun || p.id === ilk.personel)
    .sort((a, b) => adSoyad(a).localeCompare(adSoyad(b), 'tr'));
  const durumu = (id: string): BesSatiri | null => {
    const p = personeller.find((x) => x.id === id);
    return p ? besSatiri(p, hareketler) : null;
  };
  const form = useForm<BesGirdisi>({
    ilk: { personel: ilk.personel, tur: ilk.tur, tarih: gun, oran: '3', sirket: '', aciklama: '' },
    dogrula: (d) => besGirdisiDenetle(d, durumu(d.personel), gun),
    kaydet: (d) => ekle({
      personel: d.personel, tur: d.tur as BesTuru, tarih: d.tarih,
      oran: d.tur && girisMi(d.tur) && d.oran.trim() !== '' ? Number(d.oran.replace(',', '.')) : null,
      sirket: d.tur && girisMi(d.tur) && d.sirket.trim() !== '' ? d.sirket.trim() : null,
      aciklama: d.aciklama.trim() === '' ? null : d.aciklama.trim(),
    }),
    basarili: kapat,
    hataIletisi: 'BES hareketi kaydedilemedi.',
  });
  const d = form.degerler;
  const durum = d.personel ? durumu(d.personel) : null;
  const turler = durum?.durum === 'bes' ? BES_CIKIS_TURLERI : BES_GIRIS_TURLERI;
  const giris = d.tur !== '' && girisMi(d.tur);
  return (
    <FormPenceresi acik kapat={kapat} baslik="BES hareketi gir" form={form}>
      <Secim
        etiket="Personel" required bosSecenek="Seçiniz" {...form.alan('personel')}
        secenekler={personeller.map((p) => ({ deger: p.id, baslik: adSoyad(p) + (p.sicilNo ? ` (${p.sicilNo})` : '') }))}
        onChange={(e) => { form.degistir({ personel: e.target.value, tur: '' }); }}
      />
      {durum && <p className="tc-ikbes-soluk">Bugünkü durum: {DURUM_ADI[durum.durum]}{durum.giris ? `, giriş ${tarih(durum.giris.tarih)}` : ''}</p>}
      <Secim
        etiket="Hareket" required bosSecenek="Seçiniz" value={d.tur} hata={form.hata('tur')} secenekler={turSecenekleri(turler)}
        onChange={(e) => { form.degistir({ tur: e.target.value as BesTuru | '' }); }}
      />
      <Girdi etiket="Tarih" type="date" required max={gun} {...form.alan('tarih')} />
      {giris && <Girdi etiket="Katkı oranı (%)" inputMode="decimal" {...form.alan('oran')} />}
      {giris && <Girdi etiket="Emeklilik şirketi" {...form.alan('sirket')} />}
      <CokSatir etiket="Açıklama" {...form.alan('aciklama')} />
    </FormPenceresi>
  );
}
