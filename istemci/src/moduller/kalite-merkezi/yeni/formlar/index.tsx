import { useEffect, useMemo, useState } from 'react';
import { CokSatir, Girdi, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { IkiSeriKarti } from '../../../../ortak/arayuz/PanoGrafikleri.tsx';
import { Rozet } from '../../../../ortak/arayuz/Rozet.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import type { Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { trd } from '../bicim.ts';
import { Damga, KayitListesi } from '../KayitListesi.tsx';
import { useOnizleme } from '../Onizleme.tsx';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { YENI_KAYIT, type FormKaydi } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import { sonucTonu } from './dsl.ts';
import { BosDslFormu, BosModulFormu, EtiketMerkezindeBas, FormKaydiBelgesi } from './FormBelgesi.tsx';
import { FormDoldur, type DoldurulanSablon } from './FormDoldur.tsx';
import { FormTasarla } from './FormTasarla.tsx';
import { FORM_KATEGORILERI, formBul, formListesi, type ListedekiForm } from './sablonlar.ts';
import '../ncr/ncr.css';
import './formlar.css';

const ONAYLANDI = 'Onaylandı';
const ONAY_BEKLIYOR = 'Onay bekliyor';
const TASLAK = 'Taslak';
const ONAY_DURUMLARI = [TASLAK, ONAY_BEKLIYOR, ONAYLANDI];
const SONUC_TONU = { hata: 'kotu', tamam: 'iyi', uyari: 'uyari' } as const;
// Modül formlarının kayıt sayısı: muayene formları türüne göre.
const MUAYENE_TURU: Record<string, readonly string[]> = { 'KF-03': ['Giriş'], 'KF-04': ['FAI'], 'KF-05': ['Proses', 'Final'] };

const durumOf = (r: FormKaydi) => r.durum || ONAYLANDI;

function kayitSayisi(veri: KmVerisi, f: ListedekiForm): number {
  if (!f.bagli) return veri.frm.filter((r) => r.kod === f.kod).length;
  if (f.bagli.kol === 'insp') return veri.insp.filter((i) => (MUAYENE_TURU[f.kod] ?? []).includes(i.tur ?? '')).length;
  if (f.bagli.kol === 'lot') return veri.lot.filter((l) => l.tip !== 'reset').length;
  return veri[f.bagli.kol].length;
}

// Doldurulacak şablon: düzenlenen kayıt kendi tasarım metnini taşır (doldurulduğu revizyon), yeni kayıt listedeki güncel formu.
function doldurulan(f: ListedekiForm | undefined, rec: FormKaydi | null): DoldurulanSablon | null {
  if (rec && typeof rec.dsl === 'string' && rec.dsl) {
    return { kod: rec.kod ?? '', ad: rec.ad ?? '', rev: rec.rev ?? '00', std: typeof rec.std === 'string' ? rec.std : '', dsl: rec.dsl, etiket: rec.etiket === true, yurur: f?.yurur };
  }
  if (!f || f.tip !== 'dsl') return null;
  return { kod: f.kod, ad: f.ad, rev: f.rev, std: f.std, dsl: f.dsl, etiket: f.etiket, yurur: f.yurur };
}

type Pencereler =
  | { tur: 'doldur'; sablon: DoldurulanSablon; rec: FormKaydi | null }
  | { tur: 'tasarla'; form: ListedekiForm | undefined }
  | { tur: 'onayla'; rec: FormKaydi }
  | { tur: 'geri-al'; rec: FormKaydi }
  | { tur: 'sil'; rec: FormKaydi }
  | { tur: 'varsayilan'; form: ListedekiForm };

export function Formlar({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const onizle = useOnizleme();
  const [pencere, pencereYaz] = useState<Pencereler | null>(null);
  const [ara, araYaz] = useState('');
  const [kategori, kategoriYaz] = useState('');
  const [kayitFormu, kayitFormuYaz] = useState('');
  const [onayDurumu, onayDurumuYaz] = useState('');
  const [karar, kararYaz] = useState('Onayla');
  const [onayNot, onayNotYaz] = useState('');
  const [mesgul, mesgulYaz] = useState(false);

  const liste = useMemo(() => formListesi(veri.tpl, veri.ayarlar), [veri.tpl, veri.ayarlar]);
  const kapat = () => pencereYaz(null);

  const doldur = (f: ListedekiForm) => {
    if (f.bagli) { git(f.bagli.gorunum as Parameters<typeof git>[0], { ac: YENI_KAYIT, ...(f.bagli.on ? { on: f.bagli.on } : {}) }); return; }
    const s = doldurulan(f, null);
    if (s) pencereYaz({ tur: 'doldur', sablon: s, rec: null });
  };
  const bosForm = (f: ListedekiForm) => onizle(`${f.kod} boş form`, `${f.kod}_bos`,
    f.bagli ? <BosModulFormu veri={veri} form={f} /> : <BosDslFormu veri={veri} form={f} />);
  const goruntule = (r: FormKaydi) => onizle(`${r.kod ?? ''} ${trd(r.tarih)}`, `${r.kod ?? ''}_${r.tarih ?? ''}`,
    <FormKaydiBelgesi veri={veri} r={r} yurur={formBul(liste, r.kod ?? '')?.yurur} />);
  const duzenle = (r: FormKaydi) => {
    const s = doldurulan(formBul(liste, r.kod ?? ''), r);
    if (s) pencereYaz({ tur: 'doldur', sablon: s, rec: r });
  };

  useEffect(() => {
    if (!gecis?.ac) return;
    if (gecis.ac === YENI_KAYIT) {
      const f = typeof gecis.on?.kod === 'string' ? formBul(liste, gecis.on.kod) : undefined;
      if (f && yetki.yaz) doldur(f);
    } else {
      const r = veri.frm.find((x) => x._id === gecis.ac);
      if (r) goruntule(r);
    }
    gecisTamam();
  // Geçiş bir kez işlenir.
  }, [gecis]);

  const yap = async (is: () => Promise<unknown>, tamam: string, hata: string) => {
    mesgulYaz(true);
    try {
      await is();
      bildir('tamam', tamam);
      kapat();
    } catch (e) {
      bildir('hata', hataIletisi(e, hata));
    } finally {
      mesgulYaz(false);
    }
  };

  const onayaGonder = async (r: FormKaydi) => {
    const yanitlar = Object.values((r.liste ?? {}) as Record<string, string>);
    if (yanitlar.some((a) => !a)) { bildir('hata', 'Tüm kontrol maddeleri yanıtlanmamış; önce düzenleyin.'); return; }
    try {
      await komut.kaydet('frm', { ...r, durum: ONAY_BEKLIYOR });
      bildir('tamam', 'Onaya gönderildi');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Form onaya gönderilemedi.'));
    }
  };

  // Onaylayan ve onay günü sunucuda oturumdaki kişi ve tesisin günüdür; istemci göndermez.
  const onayla = (r: FormKaydi) => {
    const { onaylayan: _o, onayTarih: _t, ...govde } = r;
    void yap(() => komut.kaydet('frm', { ...govde, onayNot, durum: karar === 'Onayla' ? ONAYLANDI : TASLAK }),
      karar === 'Onayla' ? 'Form onaylandı' : 'Form düzeltme için iade edildi', 'Form onaylanamadı.');
  };

  const filtreli = liste.filter((f) => (!kategori || f.kat === kategori) && (!ara || [f.kod, f.ad, f.std, f.ne].join(' ').toLocaleLowerCase('tr').includes(ara.toLocaleLowerCase('tr'))));
  const gruplar = [...FORM_KATEGORILERI.map((k) => [k, filtreli.filter((f) => f.kat === k)] as const), ['Diğer', filtreli.filter((f) => !(FORM_KATEGORILERI as readonly string[]).includes(f.kat))] as const]
    .filter(([, l]) => l.length > 0);

  const kayitlar = useMemo(() => {
    let R = [...veri.frm].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
    if (kayitFormu) R = R.filter((r) => r.kod === kayitFormu);
    if (onayDurumu) R = R.filter((r) => durumOf(r) === onayDurumu);
    return R;
  }, [veri.frm, kayitFormu, onayDurumu]);
  const bekleyen = veri.frm.filter((r) => r.durum === ONAY_BEKLIYOR).length;

  const grafik = useMemo(() => {
    const m = new Map<string, { birinci: number; ikinci: number }>();
    for (const r of veri.frm) {
      const k = r.kod ?? '';
      const o = m.get(k) ?? { birinci: 0, ikinci: 0 };
      if (sonucTonu(r.sonuc) === 'hata') o.ikinci++; else o.birinci++;
      m.set(k, o);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'tr', { numeric: true })).map(([etiket, o]) => ({ etiket, ...o }));
  }, [veri.frm]);

  const sutunlar: Sutun<FormKaydi>[] = [
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (r) => trd(r.tarih) },
    { anahtar: 'kod', baslik: 'Form', hucre: (r) => <><span className="mono">{r.kod}</span> <span className="tc-km-soluk">rev {r.rev || '00'}</span><span className="tc-km-iki">{r.ad ?? ''}</span></> },
    { anahtar: 'dolduran', baslik: 'Dolduran', hucre: (r) => r.dolduran ?? '' },
    { anahtar: 'bolum', baslik: 'Alan', hucre: (r) => (typeof r.bolum === 'string' ? r.bolum : '') },
    { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (r) => { const s = typeof r.sonuc === 'string' && r.sonuc ? r.sonuc : '—'; return <Damga ton={SONUC_TONU[sonucTonu(s)]}>{s}</Damga>; } },
    { anahtar: 'durum', baslik: 'Onay', hucre: (r) => {
      const d = durumOf(r);
      return <><Damga ton={d === ONAYLANDI ? 'iyi' : d === ONAY_BEKLIYOR ? 'uyari' : ''}>{d}</Damga>{r.onaylayan && d === ONAYLANDI && <span className="tc-km-iki">{r.onaylayan}</span>}</>;
    } },
    { anahtar: 'islem', baslik: 'İşlem', csv: false, hucre: (r) => {
      const d = durumOf(r);
      return (
        <span className="tc-km3-eylemler" onClick={(o) => o.stopPropagation()} onKeyDown={(o) => o.stopPropagation()}>
          <Dugme simge="eye" onClick={() => goruntule(r)}>Görüntüle</Dugme>
          <EtiketMerkezindeBas r={r} />
          {d !== ONAYLANDI && yetki.yaz && <Dugme simge="edit" onClick={() => duzenle(r)}>Düzenle</Dugme>}
          {d === ONAY_BEKLIYOR && yetki.kapat && <Dugme simge="check" onClick={() => { kararYaz('Onayla'); onayNotYaz(''); pencereYaz({ tur: 'onayla', rec: r }); }}>Onayla</Dugme>}
          {d === TASLAK && yetki.yaz && <Dugme simge="next" onClick={() => void onayaGonder(r)}>Onaya gönder</Dugme>}
          {d === ONAYLANDI && yetki.onayla && <Dugme simge="back" onClick={() => pencereYaz({ tur: 'geri-al', rec: r })}>Onayı geri al</Dugme>}
          {yetki.silebilir('frm') && <Dugme tur="tehlike" simge="trash" onClick={() => pencereYaz({ tur: 'sil', rec: r })}>Sil</Dugme>}
        </span>
      );
    } },
  ];

  return (
    <div className="tc-km3">
      <SayfaBasligi
        baslik="Formlar ve kontrol listeleri" simge="clipboard-check"
        alt="Muayene, kabul, uygunsuzluk ve tedarikçi kalitesi formları. Doldurun, boş olarak yazdırın, kendi kontrol listenizi tasarlayın."
        birincil={yetki.kaynak('tpl') ? { etiket: 'Yeni form tasarla', simge: 'plus', yap: () => pencereYaz({ tur: 'tasarla', form: undefined }) } : undefined}
        eylemler={yetki.ayar ? [{ anahtar: 'ayarlar', baslik: 'Ayarlar', simge: 'gear', sec: () => git('ayarlar') }] : []}
      />
      {!veri.ayarlar.firma && (
        <div className="tc-km-not">
          <span>Form başlıklarında firma adınızın görünmesi için Ayarlar bölümünden firma bilgilerini girin.</span>
          {yetki.ayar && <Dugme simge="gear" onClick={() => git('ayarlar')}>Ayarlar</Dugme>}
        </div>
      )}
      <div className="tc-km3-arac">
        <Girdi etiket="Ara" type="search" placeholder="Form, kod veya standart ara" value={ara} onChange={(o) => araYaz(o.target.value)} />
        <Secim etiket="Kategori" value={kategori} onChange={(o) => kategoriYaz(o.target.value)} bosSecenek="Tüm kategoriler"
          secenekler={FORM_KATEGORILERI.map((k) => ({ deger: k, baslik: k }))} />
        <span className="tc-km-soluk">{filtreli.length} form</span>
      </div>
      {gruplar.length === 0 && <p className="tc-km-soluk">Aramaya uyan form yok</p>}
      {gruplar.map(([k, L]) => (
        <section key={k} className="tc-km3-grup" aria-label={k}>
          <h3 className="tc-km3-grup-baslik">{k}</h3>
          <div className="tc-km3-kartlar">
            {L.map((f) => (
              <article key={f.kod} className="tc-km3-kart">
                <div className="tc-km3-kart-ust">
                  <span className="mono">{f.kod}</span>
                  <span className="tc-km-soluk">rev {f.rev || '00'}</span>
                  {f.tip === 'bagli' ? <Rozet ton="pasif">modül</Rozet> : f.ozel === 'degistirildi' ? <Rozet ton="uyari">özelleştirildi</Rozet> : f.ozel === 'kullanici' ? <Rozet ton="bilgi">özel</Rozet> : null}
                  <span className="tc-km3-kart-sayi" title="Kayıt sayısı">{kayitSayisi(veri, f)} kayıt</span>
                </div>
                <h4 className="tc-km3-kart-ad">
                  {yetki.yaz ? <button type="button" className="tc-km3-kart-dugme" onClick={() => doldur(f)}>{f.ad}</button> : f.ad}
                </h4>
                {f.ne && <p className="tc-km3-kart-metin">{f.ne}</p>}
                {f.std && <p className="tc-km-soluk tc-km-kucuk">{f.std}</p>}
                <div className="tc-km3-eylemler">
                  {yetki.yaz && <Dugme tur="birincil" simge="edit" onClick={() => doldur(f)}>Doldur</Dugme>}
                  <Dugme simge="printer" onClick={() => bosForm(f)}>Boş form</Dugme>
                  {f.tip === 'dsl' && yetki.kaynak('tpl') && <Dugme simge="tool" onClick={() => pencereYaz({ tur: 'tasarla', form: f })}>Düzenle</Dugme>}
                  {f.kayit && yetki.silebilir('tpl') && (
                    <Dugme tur="tehlike" simge={f.ozel === 'degistirildi' ? 'rotate' : 'trash'} onClick={() => pencereYaz({ tur: 'varsayilan', form: f })}>
                      {f.ozel === 'degistirildi' ? 'Varsayılana dön' : 'Sil'}
                    </Dugme>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="tc-km3-kayit-ust">
        <h3 className="tc-km3-grup-baslik">Doldurulmuş formlar</h3>
        {bekleyen > 0 && <Rozet ton="uyari">{bekleyen} onay bekliyor</Rozet>}
      </div>
      <KayitListesi<FormKaydi>
        etiket="Doldurulmuş formlar"
        satirlar={kayitlar}
        sutunlar={sutunlar}
        arsivli
        ac={goruntule}
        bos={veri.frm.length ? 'Filtreye uyan kayıt yok.' : 'Henüz doldurulmuş form yok. Listeden bir formu "Doldur" ile açın; taslak kaydedip daha sonra onaya gönderebilirsiniz.'}
        sag={(
          <>
            <div className="tc-km3-secim">
              <Secim etiket="Form" value={kayitFormu} onChange={(o) => kayitFormuYaz(o.target.value)} bosSecenek="Tüm formlar"
                secenekler={liste.filter((f) => f.tip === 'dsl').map((f) => ({ deger: f.kod, baslik: `${f.kod} ${f.ad}` }))} />
            </div>
            <div className="tc-km3-secim">
              <Secim etiket="Onay durumu" value={onayDurumu} onChange={(o) => onayDurumuYaz(o.target.value)} bosSecenek="Tüm durumlar"
                secenekler={ONAY_DURUMLARI.map((d) => ({ deger: d, baslik: d }))} />
            </div>
          </>
        )}
      />
      {kayitlar.length > 0 && (
        <IkiSeriKarti baslik="Form bazında kayıt ve uygunsuzluk" simge="chart" seriAdlari={['Uygun / tamamlandı', 'Uygunsuzluk / ret']}
          altMetin={'Kontrol listelerinde "Hayır" yanıtı veya ret kararı içeren kayıtlar ikinci seride'} noktalar={grafik} />
      )}

      {pencere?.tur === 'doldur' && <FormDoldur veri={veri} yetki={yetki} sablon={pencere.sablon} rec={pencere.rec} kapat={kapat} />}
      {pencere?.tur === 'tasarla' && <FormTasarla veri={veri} yetki={yetki} form={pencere.form} kapat={kapat} />}
      <OnayPenceresi acik={pencere?.tur === 'onayla'} baslik={`${pencere?.tur === 'onayla' ? pencere.rec.kod ?? '' : ''} onayı`} onayMetni="Kaydet" yukleniyor={mesgul}
        onayla={() => { if (pencere?.tur === 'onayla') onayla(pencere.rec); }} vazgec={kapat}>
        <div className="tc-km-form">
          <Secim etiket="Karar" value={karar} onChange={(o) => kararYaz(o.target.value)}
            secenekler={['Onayla', 'Düzeltme için iade et'].map((k) => ({ deger: k, baslik: k }))} />
          <CokSatir etiket="Not" rows={2} value={onayNot} onChange={(o) => onayNotYaz(o.target.value)} />
        </div>
      </OnayPenceresi>
      <OnayPenceresi acik={pencere?.tur === 'geri-al'} baslik={`${pencere?.tur === 'geri-al' ? pencere.rec.kod ?? '' : ''} onayını geri al`} onayMetni="Onayı geri al"
        yukleniyor={mesgul} vazgec={kapat}
        onayla={() => { if (pencere?.tur === 'geri-al') { const id = pencere.rec._id; void yap(() => komut.onayGeriAl(id), 'Onay geri alındı; form taslağa döndü', 'Onay geri alınamadı.'); } }}>
        <p>Form taslağa döner ve yeniden düzenlenebilir. Onayı geri alan kişi ve saat kayda yazılır.</p>
      </OnayPenceresi>
      <OnayPenceresi acik={pencere?.tur === 'sil'} baslik="Kaydı sil" tehlikeli onayMetni="Sil" yukleniyor={mesgul} vazgec={kapat}
        onayla={() => { if (pencere?.tur === 'sil') { const id = pencere.rec._id; void yap(() => komut.sil('frm', id), 'Kayıt silindi', 'Kayıt silinemedi.'); } }}>
        <p><b>{pencere?.tur === 'sil' ? pencere.rec.kod ?? '' : ''}</b> kalıcı olarak silinecek. Bağlı kayıtlardaki referanslar boş kalır.</p>
      </OnayPenceresi>
      <OnayPenceresi acik={pencere?.tur === 'varsayilan'} tehlikeli onayMetni="Onayla" yukleniyor={mesgul} vazgec={kapat}
        baslik={pencere?.tur === 'varsayilan' && pencere.form.ozel === 'degistirildi' ? 'Varsayılana dön' : 'Formu sil'}
        onayla={() => {
          if (pencere?.tur !== 'varsayilan' || !pencere.form.kayit) return;
          const id = pencere.form.kayit._id;
          void yap(() => komut.sil('tpl', id), 'Form şablonu silindi', 'Form şablonu silinemedi.');
        }}>
        <p>{pencere?.tur === 'varsayilan' ? pencere.form.kod : ''} için yaptığınız özelleştirme silinecek. Mevcut kayıtlar doldurulduğu revizyonla saklanmaya devam eder.</p>
      </OnayPenceresi>
    </div>
  );
}

export const FormlarSayaci: KmSayaci = (veri) => ({ n: veri.frm.filter((r) => r.durum === ONAY_BEKLIYOR).length, kotu: false });
