// Stok kontrol (3398, surum 4 a): satın alma ve planlamanın ortak sayfası. Ölçüyle arama aynı form ve kalitede, istenenden küçük
// olmayan ve seçilen fazla pay içindeki stoğu ve artık parçaları en az fireden sıralar; kesimden kalan parça burada kaydedilir.
// Talepler sekmesi teklif öncesi satın alma kalemlerini stokla karşılaştırır; "Stoktan karşıla" depoya ayırma isteği açar (3398-2 a).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ARTIK_HURDA_ESIGI_MM, FORM_ADLARI, FORM_OLCULERI, OLCU_ETIKETLERI, OLCULU_FORMLAR, VARSAYILAN_KESME_MM, type OlculuForm } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';
import type {
  ArtikParcaCevabi, ArtikParcaGovdesi, ArtikParcalarCevabi, ArtikParcaSatiri, AyirmaCevabi, AyirmaDurumu, AyirmaIstegiSatiri, AyirmaIstekleriCevabi, IhtiyacDurumu,
  IhtiyaclarCevabi, IhtiyacSatiri, OlcuAdayi, OlcuAramaCevabi, StoktanKarsilaGovdesi,
} from '#paylasilan/sozlesme/stok-kontrol.ts';
import {
  Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, MalzemeSecici, OnayPenceresi, Pencere, Rozet, Secim, Sekmeler, Tablo, useBildirim, type SeciliKayit, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni } from './gorunum.ts';
import { KonumSecici, type KonumSecimi } from './KonumSecici.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem } from './ortak.tsx';
import './stok.css';

type Sekme = 'ihtiyac' | 'ayirma' | 'ara' | 'artik';

// Fazla pay seçenekleri (surum 4 madde 11); değer sorgu parametresidir.
const PAYLAR = [
  { deger: 'yuzde-15', baslik: '+%15 (en az 3 mm)', sorgu: { pay: 'yuzde', payDeger: '15', payEnAzMm: '3' } },
  { deger: 'tam', baslik: 'Yalnız tam ölçü', sorgu: { pay: 'tam' } },
  { deger: 'mm-5', baslik: '+5 mm', sorgu: { pay: 'mm', payDeger: '5' } },
  { deger: 'mm-10', baslik: '+10 mm', sorgu: { pay: 'mm', payDeger: '10' } },
  { deger: 'yuzde-25', baslik: '+%25 (en az 3 mm)', sorgu: { pay: 'yuzde', payDeger: '25', payEnAzMm: '3' } },
  { deger: 'elle', baslik: 'Elle (mm)', sorgu: { pay: 'mm' } },
] as const;
const KESMELER = ['0', '3', '5'] as const;

const CAPLI = new Set<OlculuForm>(['cubuk', 'boru', 'disk']);
export function olcuMetni(form: string | null, olcu: Readonly<Record<string, number>>): string {
  const f = form !== null && (OLCULU_FORMLAR as readonly string[]).includes(form) ? FORM_OLCULERI[form as OlculuForm] : null;
  const sira = f === null ? Object.keys(olcu) : [...f.kesit, ...(f.en === null ? [] : [f.en]), ...(f.boy === null ? [] : [f.boy])];
  const parca = sira.flatMap((k) => (olcu[k] === undefined ? [] : [miktarMetni(String(olcu[k]))]));
  if (parca.length === 0) return '—';
  return `${f !== null && CAPLI.has(form as OlculuForm) ? 'Ø' : ''}${parca.join(' × ')} mm`;
}

function durumRozeti(a: OlcuAdayi) {
  if (a.durum === 'tam') return <Rozet ton="tamam">Tam ölçü</Rozet>;
  const fazla = Object.values(a.fazla).filter((x) => x > 0);
  const metin = fazla.length === 0 ? '' : `+${miktarMetni(String(Math.max(...fazla)))} mm`;
  return a.durum === 'yakin' ? <Rozet ton="uyari">{`Yakın ${metin}`.trim()}</Rozet> : <Rozet ton="pasif">{`Pay dışı ${metin}`.trim()}</Rozet>;
}

interface AramaFormu { form: OlculuForm; kalite: string; olcu: Record<string, string>; parcaBoyu: string; parcaEni: string; adet: string; pay: string; payElle: string; kesme: string; artik: boolean }
const BOS_FORM: AramaFormu = { form: 'cubuk', kalite: '', olcu: {}, parcaBoyu: '', parcaEni: '', adet: '', pay: 'yuzde-15', payElle: '', kesme: String(VARSAYILAN_KESME_MM), artik: true };

function aramaSorgusu(f: AramaFormu): string {
  const p = new URLSearchParams({ form: f.form, kesmeMm: f.kesme, artik: f.artik ? 'evet' : 'hayir' });
  for (const [k, v] of Object.entries(PAYLAR.find((x) => x.deger === f.pay)?.sorgu ?? {})) p.set(k, v);
  if (f.pay === 'elle') p.set('payDeger', f.payElle.trim().replace(',', '.') || '0');
  if (f.kalite !== '') p.set('kalite', f.kalite);
  for (const k of FORM_OLCULERI[f.form].kesit) if ((f.olcu[k] ?? '').trim() !== '') p.set(k, f.olcu[k]!.trim().replace(',', '.'));
  if (f.parcaBoyu.trim() !== '') p.set('parcaBoyu', f.parcaBoyu.trim().replace(',', '.'));
  if (f.parcaEni.trim() !== '') p.set('parcaEni', f.parcaEni.trim().replace(',', '.'));
  if (f.adet.trim() !== '') p.set('adet', f.adet.trim());
  return p.toString();
}

function OlcuyleAra() {
  const [form, formYaz] = useState<AramaFormu>(BOS_FORM);
  const [sorgu, sorguYaz] = useState<string | null>(null);
  const kaliteler = useQuery({
    queryKey: anahtarlar.liste('olcu-kaliteleri', { form: form.form }),
    // Kalite listesi formun kartlarındandır; kesit vermeden sorulamadığı için 1 mm ile sorulur, adaylar kullanılmaz.
    queryFn: () => api.get<OlcuAramaCevabi>(`/stok/olcu-arama?form=${form.form}&${FORM_OLCULERI[form.form].kesit[0]}=1&artik=hayir`),
  });
  const sonuc = useQuery({
    queryKey: anahtarlar.liste('olcu-arama', { sorgu }),
    queryFn: () => api.get<OlcuAramaCevabi>(`/stok/olcu-arama?${sorgu}`),
    enabled: sorgu !== null,
  });
  const f = FORM_OLCULERI[form.form];
  const kesitVar = f.kesit.some((k) => (form.olcu[k] ?? '').trim() !== '');
  const gonder = (e: FormEvent) => { e.preventDefault(); if (kesitVar) sorguYaz(aramaSorgusu(form)); };
  const yaz = (p: Partial<AramaFormu>) => formYaz((o) => ({ ...o, ...p }));
  const sutunlar: Sutun<OlcuAdayi>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', hucre: (a) => <Link to={`/stok/malzemeler/${a.malzemeNo}`}>{a.kod}</Link>, csv: (a) => a.kod },
    { anahtar: 'olcu', baslik: 'Ölçü', hucre: (a) => olcuMetni(a.form, a.olcu) },
    { anahtar: 'durum', baslik: 'Uygunluk', hucre: durumRozeti, csv: (a) => a.durum },
    { anahtar: 'parca', baslik: 'Parça', hizala: 'sag', hucre: (a) => (a.parcaSayisi === null ? '—' : String(a.parcaSayisi)) },
    { anahtar: 'fire', baslik: 'Fire', hizala: 'sag', hucre: (a) => (a.fireYuzde === null ? '—' : `%${a.fireYuzde}`) },
    { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (a) => (a.kaynak === 'artik' ? <Rozet ton="bilgi">Artık</Rozet> : 'Stok'), csv: (a) => (a.kaynak === 'artik' ? 'Artık' : 'Stok') },
    { anahtar: 'kalite', baslik: 'Kalite', hucre: (a) => a.kalite ?? '—' },
    { anahtar: 'miktar', baslik: 'Stokta', hizala: 'sag', hucre: (a) => `${miktarMetni(a.miktar)} ${a.birim ?? ''}`.trim() },
    { anahtar: 'konum', baslik: 'Konum', kes: true, hucre: (a) => (a.konumlar.length === 0 ? '—' : a.konumlar.join(', ')) },
  ];
  const s = sonuc.data;
  return (
    <>
      <Kart baslik="Ölçüyle ara" simge="ruler">
        <form className="tc-stok-form" onSubmit={gonder} aria-label="Ölçüyle ara">
          <div className="tc-stok-iki">
            <Secim etiket="Form" value={form.form} secenekler={OLCULU_FORMLAR.map((x) => ({ deger: x, baslik: FORM_ADLARI[x] }))}
              onChange={(e) => yaz({ form: e.target.value as OlculuForm, olcu: {}, kalite: '' })} />
            <Secim etiket="Kalite" value={form.kalite} bosSecenek="Bütün kaliteler"
              secenekler={(kaliteler.data?.kaliteler ?? []).map((k) => ({ deger: k, baslik: k }))} onChange={(e) => yaz({ kalite: e.target.value })} />
            {f.kesit.map((k) => (
              <Girdi key={k} etiket={`${OLCU_ETIKETLERI[form.form][k] ?? k} (mm)`} inputMode="decimal" value={form.olcu[k] ?? ''}
                onChange={(e) => yaz({ olcu: { ...form.olcu, [k]: e.target.value } })} />
            ))}
            {f.boy !== null && <Girdi etiket="Parça boyu (mm)" inputMode="decimal" value={form.parcaBoyu} onChange={(e) => yaz({ parcaBoyu: e.target.value })} />}
            {f.en !== null && <Girdi etiket="Parça eni (mm)" inputMode="decimal" value={form.parcaEni} onChange={(e) => yaz({ parcaEni: e.target.value })} />}
            <Girdi etiket="Adet" inputMode="numeric" value={form.adet} onChange={(e) => yaz({ adet: e.target.value })} />
            <Secim etiket="Fazla pay" value={form.pay} secenekler={PAYLAR.map((p) => ({ deger: p.deger, baslik: p.baslik }))} onChange={(e) => yaz({ pay: e.target.value })} />
            {form.pay === 'elle' && <Girdi etiket="Fazla pay (mm)" inputMode="decimal" value={form.payElle} onChange={(e) => yaz({ payElle: e.target.value })} />}
            {f.boy !== null && (
              <Secim etiket="Kesme payı" value={form.kesme} secenekler={KESMELER.map((k) => ({ deger: k, baslik: `${k} mm` }))} onChange={(e) => yaz({ kesme: e.target.value })} />
            )}
          </div>
          <IsaretKutusu etiket="Artık parçaları dahil et" checked={form.artik} onChange={(e) => yaz({ artik: e.target.checked })} />
          <div><Dugme tur="birincil" type="submit" simge="search" disabled={!kesitVar}>Ara</Dugme></div>
        </form>
      </Kart>
      {sorgu !== null && (
        sonuc.isPending ? <DurumKutusu durum="yukleniyor" />
          : sonuc.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(sonuc.error)} yenile={() => void sonuc.refetch()} />
            : s && (
              <Kart baslik={s.gereken === null ? `${s.adaylar.filter((a) => a.durum !== 'pay-disi').length} uygun stok`
                : s.karsilanan === null ? `Gereken ${s.gereken} parça; parça sayısı hesaplanamadı`
                  : `Stokta karşılanan ${s.karsilanan} / ${s.gereken} parça`}>
                <div className="tc-stok-form">
                  {s.gereken !== null && s.karsilanan !== null && (
                    <div><Rozet ton={s.karsilanan >= s.gereken ? 'tamam' : s.karsilanan > 0 ? 'uyari' : 'hata'}>{s.karsilanan >= s.gereken ? 'Stoktan karşılanır' : `${s.gereken - s.karsilanan} parça eksik`}</Rozet></div>
                  )}
                  {s.olcusuzKart > 0 && <p role="note">{`Bu formda ölçüsü girilmemiş ${s.olcusuzKart} kart aranamadı; Malzemeler'de ölçüsünü tamamlayın.`}</p>}
                  <Tablo etiket="Uygun stok" kip="kaydir" sutunlar={sutunlar} satirlar={s.adaylar}
                    satirAnahtari={(a) => `${a.kaynak}-${a.malzemeNo}-${a.artikId ?? 0}`} bosMesaj="Bu ölçü ve kalitede pay içinde stok yok." />
                </div>
              </Kart>
            )
      )}
    </>
  );
}

function ArtikKaydiPenceresi({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  const qc = useQueryClient();
  const { bildir } = useBildirim();
  const [malzeme, malzemeYaz] = useState<SeciliKayit | null>(null);
  const [konum, konumYaz] = useState<KonumSecimi | null>(null);
  const [boy, boyYaz] = useState('');
  const [en, enYaz] = useState('');
  const [adet, adetYaz] = useState('1');
  const [aciklama, aciklamaYaz] = useState('');
  const kaydet = useMutation({
    mutationFn: (g: ArtikParcaGovdesi) => korumaliPost<ArtikParcaCevabi>('/stok/artik-parcalar', g),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: anahtarlar.hepsi }); bildir('tamam', 'Artık parça kaydedildi.'); kapat(); },
  });
  const boySayi = Number(boy.replace(',', '.'));
  const kisa = Number.isFinite(boySayi) && boySayi > 0 && boySayi < ARTIK_HURDA_ESIGI_MM;
  const hazir = malzeme !== null && konum !== null && Number.isFinite(boySayi) && boySayi > 0;
  return (
    <Pencere acik={acik} kapat={kapat} baslik="Kesimden kalan parça"
      alt={<><Dugme onClick={kapat}>Vazgeç</Dugme><Dugme tur="birincil" simge="check" disabled={!hazir} yukleniyor={kaydet.isPending}
        onClick={() => {
          if (!hazir) return;
          kaydet.mutate({
            malzemeNo: malzeme.id, konumId: konum.id, boy: boySayi, en: en.trim() === '' ? null : Number(en.replace(',', '.')),
            adet: Number(adet) || 1, aciklama: aciklama.trim() === '' ? null : aciklama.trim(),
          });
        }}>Artık olarak sakla</Dugme></>}>
      <div className="tc-stok-form">
        <MalzemeSecici etiket="Malzeme kartı" tur="hammadde" deger={malzeme} sec={(k) => malzemeYaz(k === null ? null : { id: k.id, kod: k.kod, ad: k.ad })} />
        <KonumSecici etiket="Konum" deger={konum} degistir={konumYaz} zorunlu />
        <div className="tc-stok-iki">
          <Girdi etiket="Kalan boy (mm)" inputMode="decimal" value={boy} onChange={(e) => boyYaz(e.target.value)} required
            ipucu={kisa ? `${ARTIK_HURDA_ESIGI_MM} mm altı genelde hurdadır.` : undefined} />
          <Girdi etiket="Kalan en (mm)" inputMode="decimal" value={en} onChange={(e) => enYaz(e.target.value)} ipucu="Yalnız levhada." />
          <Girdi etiket="Adet" inputMode="numeric" value={adet} onChange={(e) => adetYaz(e.target.value)} />
        </div>
        <Girdi etiket="Açıklama" value={aciklama} maxLength={200} onChange={(e) => aciklamaYaz(e.target.value)} />
        {kaydet.isError && <p role="alert">{hataMetni(kaydet.error)}</p>}
      </div>
    </Pencere>
  );
}

function ArtikParcalar() {
  const qc = useQueryClient();
  const { bildir } = useBildirim();
  const yazabilir = useIslem('stok.cikis');
  const [pencere, pencereYaz] = useState(false);
  const [kapatilan, kapatilanYaz] = useState<{ s: ArtikParcaSatiri; durum: 'kullanildi' | 'hurda' } | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.liste('artik-parcalar', {}), queryFn: () => api.get<ArtikParcalarCevabi>('/stok/artik-parcalar') });
  const kapat = useMutation({
    mutationFn: ({ s, durum }: { s: ArtikParcaSatiri; durum: 'kullanildi' | 'hurda' }) => korumaliPost<ArtikParcaCevabi>(`/stok/artik-parcalar/${s.id}/kapat`, { durum, surum: s.surum }),
    onSuccess: (_c, d) => { kapatilanYaz(null); void qc.invalidateQueries({ queryKey: anahtarlar.hepsi }); bildir('tamam', d.durum === 'hurda' ? 'Artık hurdaya ayrıldı.' : 'Artık kullanıldı.'); },
    onError: (h) => bildir('hata', hataMetni(h)),
  });
  const sutunlar: Sutun<ArtikParcaSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', hucre: (s) => <Link to={`/stok/malzemeler/${s.malzemeNo}`}>{s.kod}</Link>, csv: (s) => s.kod },
    { anahtar: 'ad', baslik: 'Ad', kes: true, hucre: (s) => s.ad ?? '—' },
    { anahtar: 'olcu', baslik: 'Ölçü', hucre: (s) => olcuMetni(s.form, s.olcu) },
    { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (s) => String(s.adet) },
    { anahtar: 'konum', baslik: 'Konum', hucre: (s) => s.konumKod },
    { anahtar: 'kaydeden', baslik: 'Kaydeden', kes: true, hucre: (s) => s.kaydeden ?? '—' },
    ...(yazabilir ? [{
      anahtar: 'eylem', baslik: 'İşlem', hucre: (s: ArtikParcaSatiri) => (
        <span className="tc-stok-kontrol-eylem">
          <Dugme simge="check" disabled={kapat.isPending} onClick={() => kapatilanYaz({ s, durum: 'kullanildi' })}>Kullanıldı</Dugme>
          <Dugme simge="trash" disabled={kapat.isPending} onClick={() => kapatilanYaz({ s, durum: 'hurda' })}>Hurda</Dugme>
        </span>
      ), csv: () => '',
    } satisfies Sutun<ArtikParcaSatiri>] : []),
  ];
  return (
    <Kart baslik="Artık parçalar" simge="box" sag={yazabilir ? <Dugme tur="birincil" simge="plus" onClick={() => pencereYaz(true)}>Kalan parça kaydet</Dugme> : undefined}>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} />
          : <Tablo etiket="Artık parçalar" kip="kaydir" sutunlar={sutunlar} satirlar={liste.data.satirlar} satirAnahtari={(s) => s.id}
              bosMesaj="Kayıtlı artık parça yok. Boy keserken kalan parçayı buradan kaydedin." />}
      {yazabilir && <ArtikKaydiPenceresi acik={pencere} kapat={() => pencereYaz(false)} />}
      <OnayPenceresi acik={kapatilan !== null} baslik={kapatilan?.durum === 'hurda' ? 'Artığı hurdaya ayır' : 'Artık kullanıldı'}
        onayMetni={kapatilan?.durum === 'hurda' ? 'Hurdaya ayır' : 'Kullanıldı'} tehlikeli={kapatilan?.durum === 'hurda'} yukleniyor={kapat.isPending}
        onayla={() => { if (kapatilan !== null) kapat.mutate(kapatilan); }} vazgec={() => kapatilanYaz(null)}>
        <p>{kapatilan === null ? '' : `${kapatilan.s.kod} · ${olcuMetni(kapatilan.s.form, kapatilan.s.olcu)} · ${kapatilan.s.konumKod}. Artık listeden ve aramadan düşer; bu işlem geri alınamaz.`}</p>
      </OnayPenceresi>
    </Kart>
  );
}

const IHTIYAC_ROZETI: Record<IhtiyacDurumu, { ton: 'tamam' | 'uyari' | 'hata' | 'pasif'; metin: string }> = {
  karsilanir: { ton: 'tamam', metin: 'Stoktan karşılanır' }, kismen: { ton: 'uyari', metin: 'Kısmen' }, yok: { ton: 'hata', metin: 'Stokta yok' },
  bilinmiyor: { ton: 'pasif', metin: 'Hesaplanamadı' },
};

// 3398-2 a: miktar karşılanabilenden fazla olamaz; talep kalemi bu kadar azalır, depo ayırır.
function KarsilaPenceresi({ satir, kapat }: { satir: IhtiyacSatiri | null; kapat: () => void }) {
  const qc = useQueryClient();
  const { bildir } = useBildirim();
  const [miktar, miktarYaz] = useState('');
  const [acilan, acilanYaz] = useState<IhtiyacSatiri | null>(null);
  if (satir !== acilan) {
    acilanYaz(satir);
    miktarYaz(satir === null || satir.karsilanan === null ? '' : String(Math.min(satir.karsilanan, Number(satir.miktar))).replace('.', ','));
  }
  const gonder = useMutation({
    mutationFn: (g: StoktanKarsilaGovdesi) => korumaliPost<AyirmaCevabi>('/stok/kontrol-ihtiyaclari/karsila', g),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: anahtarlar.hepsi }); bildir('tamam', 'Depoya ayırma isteği gitti; talep miktarı azaldı.'); kapat(); },
  });
  const sayi = Number(miktar.replace(',', '.'));
  const ust = satir?.karsilanan ?? 0;
  const hazir = satir !== null && Number.isFinite(sayi) && sayi > 0 && sayi <= ust + 1e-9;
  return (
    <Pencere acik={satir !== null} kapat={kapat} baslik="Stoktan karşıla"
      alt={<><Dugme onClick={kapat}>Vazgeç</Dugme><Dugme tur="birincil" simge="cart" disabled={!hazir} yukleniyor={gonder.isPending}
        onClick={() => { if (hazir) gonder.mutate({ talepId: satir.talepId, kalemId: satir.kalemId, miktar: String(sayi) }); }}>Depodan iste</Dugme></>}>
      {satir !== null && (
        <div className="tc-stok-form">
          <p>{`${satir.talepNo} · ${satir.kod} · istenen ${miktarMetni(satir.miktar)} ${satir.birim}, stoktan en çok ${miktarMetni(String(ust))} ${satir.birim}.`}</p>
          {satir.enIyi !== null && <p>{`En uygun: ${satir.enIyi.kaynak === 'artik' ? 'Artık · ' : ''}${satir.enIyi.kod} · ${olcuMetni(satir.enIyi.form, satir.enIyi.olcu)} · ${satir.enIyi.konumlar.join(', ')} `}
            {durumRozeti(satir.enIyi)}{satir.enIyi.fireYuzde !== null && satir.enIyi.fireYuzde > 0 && <> <Rozet ton="pasif">{`Fire %${satir.enIyi.fireYuzde}`}</Rozet></>}</p>}
          <Girdi etiket={`Stoktan karşılanacak (${satir.birim})`} inputMode="decimal" value={miktar} onChange={(e) => miktarYaz(e.target.value)} required
            ipucu="Talep kalemi bu kadar azalır; tamamı karşılanırsa kalem teklife gitmez. İptalde miktar geri gelir." />
          {gonder.isError && <p role="alert">{hataMetni(gonder.error)}</p>}
        </div>
      )}
    </Pencere>
  );
}

const ENGEL_METNI: Record<NonNullable<IhtiyacSatiri['engel']>, string> = {
  logo: "Logo'ya bağlı", 'is-emri': 'İş emrine bağlı', kalip: 'Kalıba bağlı', teklif: 'Teklifte',
};

function Ihtiyaclar() {
  const karsilayabilir = useIslem('satin-alma.yaz');
  const [secili, seciliYaz] = useState<IhtiyacSatiri | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.liste('kontrol-ihtiyaclari', {}), queryFn: () => api.get<IhtiyaclarCevabi>('/stok/kontrol-ihtiyaclari') });
  const sutunlar: Sutun<IhtiyacSatiri>[] = [
    { anahtar: 'talep', baslik: 'Talep', sabit: 'sol', hucre: (x) => x.talepNo },
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (x) => <><Link to={`/stok/malzemeler/${x.malzemeNo}`}>{x.kod}</Link><span className="tc-stok-goz-alt tc-stok-blok">{olcuMetni(x.form, x.olcu)}</span></>,
      csv: (x) => `${x.kod} ${olcuMetni(x.form, x.olcu)}` },
    { anahtar: 'miktar', baslik: 'Stoktan / istenen', hizala: 'sag', kirilmaz: true,
      hucre: (x) => `${x.karsilanan === null ? '—' : miktarMetni(String(x.karsilanan))} / ${miktarMetni(x.miktar)} ${x.birim}` },
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <Rozet ton={IHTIYAC_ROZETI[x.durum].ton}>{IHTIYAC_ROZETI[x.durum].metin}</Rozet>, csv: (x) => x.durum },
    { anahtar: 'aday', baslik: 'En uygun', hucre: (x) => (x.enIyi === null ? '—' : <>{`${x.enIyi.kaynak === 'artik' ? 'Artık · ' : ''}${x.enIyi.kod} `}{durumRozeti(x.enIyi)}</>),
      csv: (x) => x.enIyi?.kod ?? '' },
    { anahtar: 'tarih', baslik: 'İhtiyaç', kirilmaz: true, hucre: (x) => x.ihtiyacTarihi ?? '—' },
    ...(karsilayabilir ? [{
      anahtar: 'eylem', baslik: 'İşlem', sabit: 'sag', csv: false, hucre: (x: IhtiyacSatiri) => (x.engel !== null ? <span className="tc-stok-goz-alt">{ENGEL_METNI[x.engel]}</span>
        : x.karsilanan !== null && x.karsilanan > 0 ? <Dugme simge="cart" onClick={() => seciliYaz(x)}>Stoktan karşıla</Dugme> : '—'),
    } satisfies Sutun<IhtiyacSatiri>] : []),
  ];
  return (
    <Kart baslik="Teklif öncesi talepler" simge="list">
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} />
          : <Tablo etiket="Teklif öncesi talepler" kip="kaydir" sutunlar={sutunlar} satirlar={liste.data.satirlar} satirAnahtari={(x) => `${x.talepId}-${x.kalemId}`}
              bosMesaj="Teklif istenmemiş talep kalemi yok." />}
      {karsilayabilir && <KarsilaPenceresi satir={secili} kapat={() => seciliYaz(null)} />}
    </Kart>
  );
}

const AYIRMA_ROZETI: Record<AyirmaDurumu, { ton: 'bilgi' | 'tamam' | 'uyari' | 'pasif'; metin: string }> = {
  bekliyor: { ton: 'uyari', metin: 'Depoda bekliyor' }, ayrildi: { ton: 'bilgi', metin: 'Ayrıldı' }, teslim: { ton: 'tamam', metin: 'Teslim edildi' },
  iptal: { ton: 'pasif', metin: 'İptal' },
};
const kaynakMetni = (s: AyirmaIstegiSatiri) => s.kaynaklar.map((k) => `${k.artikId === null ? '' : 'Artık · '}${k.kod} · ${k.konumlar.join(', ')}`).join('; ');

// Depo bekleyeni ayırır, ayrılanı teslim eder; satın alma ve depo iptal eder (miktar talebe geri eklenir).
function AyirmaIstekleri() {
  const qc = useQueryClient();
  const { bildir } = useBildirim();
  const depo = useIslem('stok.cikis');
  const iptalEdebilir = useIslem('satin-alma.yaz') || depo;
  const [kapali, kapaliYaz] = useState(false);
  const [iptalEdilen, iptalEdilenYaz] = useState<AyirmaIstegiSatiri | null>(null);
  const [neden, nedenYaz] = useState('');
  const liste = useQuery({ queryKey: anahtarlar.liste('ayirma-istekleri', { kapali }),
    queryFn: () => api.get<AyirmaIstekleriCevabi>(`/stok/ayirma-istekleri?durum=${kapali ? 'kapali' : 'acik'}`) });
  const yenile = () => void qc.invalidateQueries({ queryKey: anahtarlar.hepsi });
  const ilerlet = useMutation({
    mutationFn: ({ s, durum }: { s: AyirmaIstegiSatiri; durum: 'ayrildi' | 'teslim' }) => korumaliPost<AyirmaCevabi>(`/stok/ayirma-istekleri/${s.id}/ilerlet`, { durum, surum: s.surum }),
    onSuccess: (_c, d) => { yenile(); bildir('tamam', d.durum === 'ayrildi' ? 'Stok ayrıldı.' : 'Teslim edildi.'); },
    onError: (h) => bildir('hata', hataMetni(h)),
  });
  const iptal = useMutation({
    mutationFn: (s: AyirmaIstegiSatiri) => korumaliPost<AyirmaCevabi>(`/stok/ayirma-istekleri/${s.id}/iptal`, { neden: neden.trim(), surum: s.surum }),
    onSuccess: (c) => {
      iptalEdilenYaz(null); nedenYaz(''); yenile();
      bildir(c.geriEklendi === true ? 'tamam' : 'bilgi', c.geriEklendi === true ? 'İstek iptal edildi; miktar talebe geri eklendi.' : 'İstek iptal edildi; talep teklif aşamasında olduğundan miktar geri eklenmedi.');
    },
    onError: (h) => bildir('hata', hataMetni(h)),
  });
  const sutunlar: Sutun<AyirmaIstegiSatiri>[] = [
    { anahtar: 'talep', baslik: 'Talep', sabit: 'sol', hucre: (s) => <>{s.talepNo}<span className="tc-stok-goz-alt tc-stok-blok">{s.kalemAd}</span></>,
      csv: (s) => `${s.talepNo} ${s.kalemAd}` },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (s) => `${miktarMetni(s.miktar)} ${s.birim}` },
    { anahtar: 'kaynak', baslik: 'Stoktan', kes: true, hucre: kaynakMetni },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={AYIRMA_ROZETI[s.durum].ton}>{AYIRMA_ROZETI[s.durum].metin}</Rozet>, csv: (s) => s.durum },
    { anahtar: 'isteyen', baslik: 'İsteyen', kes: true, hucre: (s) => s.isteyen ?? '—' },
    ...(!kapali && (depo || iptalEdebilir) ? [{
      anahtar: 'eylem', baslik: 'İşlem', sabit: 'sag', hucre: (s: AyirmaIstegiSatiri) => (
        <span className="tc-stok-kontrol-eylem">
          {depo && s.durum === 'bekliyor' && <Dugme simge="check" disabled={ilerlet.isPending} onClick={() => ilerlet.mutate({ s, durum: 'ayrildi' })}>Ayrıldı</Dugme>}
          {depo && s.durum === 'ayrildi' && <Dugme simge="truck" disabled={ilerlet.isPending} onClick={() => ilerlet.mutate({ s, durum: 'teslim' })}>Teslim edildi</Dugme>}
          {iptalEdebilir && <Dugme simge="x" disabled={iptal.isPending} onClick={() => iptalEdilenYaz(s)}>İptal</Dugme>}
        </span>
      ), csv: () => '',
    } satisfies Sutun<AyirmaIstegiSatiri>] : []),
  ];
  return (
    <Kart baslik="Ayırma istekleri" simge="pallet" sag={<IsaretKutusu etiket="Kapananları göster" checked={kapali} onChange={(e) => kapaliYaz(e.target.checked)} />}>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} />
          : <Tablo etiket="Ayırma istekleri" kip="kaydir" sutunlar={sutunlar} satirlar={liste.data.satirlar} satirAnahtari={(s) => s.id}
              bosMesaj={kapali ? 'Kapanmış ayırma isteği yok.' : 'Açık ayırma isteği yok. Talepler sekmesinde "Stoktan karşıla" ile açılır.'} />}
      <OnayPenceresi acik={iptalEdilen !== null} baslik="Ayırma isteğini iptal et" onayMetni="İptal et" tehlikeli yukleniyor={iptal.isPending}
        onayla={() => { if (iptalEdilen !== null && neden.trim() !== '') iptal.mutate(iptalEdilen); }} vazgec={() => { iptalEdilenYaz(null); nedenYaz(''); }}>
        <div className="tc-stok-form">
          <p>{iptalEdilen === null ? '' : `${iptalEdilen.talepNo} · ${miktarMetni(iptalEdilen.miktar)} ${iptalEdilen.birim}. Ayrılan stok serbest kalır; talep henüz teklif aşamasında değilse miktar talebe geri eklenir.`}</p>
          <Girdi etiket="İptal nedeni" value={neden} maxLength={200} onChange={(e) => nedenYaz(e.target.value)} required />
        </div>
      </OnayPenceresi>
    </Kart>
  );
}

export function StokKontrol() {
  // Depo (satın alma yazmayan, stok çıkışı yapan) ayırma isteklerinden başlar.
  const stokCikis = useIslem('stok.cikis');
  const satinAlma = useIslem('satin-alma.yaz');
  const depo = stokCikis && !satinAlma;
  const [secilen, sekmeYaz] = useState<Sekme | null>(null);
  // Oturum geç gelir: seçilmemişse varsayılan yetkiden her çizimde bulunur.
  const sekme: Sekme = secilen ?? (depo ? 'ayirma' : 'ihtiyac');
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Stok kontrol" aciklama="Teklif istenmemiş talepleri stokla karşılaştırır, karşılananı depodan ayırır; ölçüyle aramada aynı form ve kalitede, fazla pay içindeki çubuk, levha ve artık parçaları en az fireden sıralar." />
      <Sekmeler etiket="Stok kontrol" secili={sekme} sec={sekmeYaz}
        sekmeler={[{ anahtar: 'ihtiyac', baslik: 'Talepler', simge: 'list' }, { anahtar: 'ayirma', baslik: 'Ayırma istekleri', simge: 'pallet' }, { anahtar: 'ara', baslik: 'Ölçüyle ara', simge: 'search' }, { anahtar: 'artik', baslik: 'Artık parçalar', simge: 'box' }]} />
      {sekme === 'ihtiyac' ? <Ihtiyaclar /> : sekme === 'ayirma' ? <AyirmaIstekleri /> : sekme === 'ara' ? <OlcuyleAra /> : <ArtikParcalar />}
    </section>
  );
}
