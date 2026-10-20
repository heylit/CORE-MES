import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type {
  FazlaMesai, FazlaMesaiCevabi, FazlaMesaiGovdesi, FazlaMesaiKapsami, FazlaMesaiListeCevabi, TakvimCevabi, VardiyaPersoneliCevabi,
} from '#paylasilan/sozlesme/vardiya.ts';
import {
  CokSatir, DurumKutusu, Dugme, IsaretKutusu, OnayPenceresi, Pencere, Rozet, Secim, Tablo, useBildirim, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { IstasyonSecimi } from '../istasyonlar/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { haftaGunuAdi, saat, tarihEkle, tarihMetni } from './gosterim.ts';
import { aramaUyar, degistir, hepsiniDegistir, reddedilenler } from './secim.ts';
import { usePersonel, useTakvim, useYazabilir } from './veri.ts';
import { SaatGirdisi, TarihGirdisi } from './ZamanAlani.tsx';
import './vardiya.css';

// Fazla mesai planı (kart #1324): bir gün için vardiya dışı çalışma. Kapsamdaki istasyon ya da iş merkezinin takvimine eklenir,
// kişi takvimine yalnız listedeki kişilere; plan kapasitesi bu takvimden okur.
const KAPSAMLAR: readonly { deger: FazlaMesaiKapsami; baslik: string }[] = [
  { deger: 'istasyon', baslik: 'İstasyon' }, { deger: 'is-merkezi', baslik: 'İş merkezi' },
];

type Personel = VardiyaPersoneliCevabi['personel'][number];

interface Form {
  id: number | null; surum: number; tarih: string; baslangic: string; bitis: string; kapsam: FazlaMesaiKapsami;
  isMerkeziId: string; istasyonId: number | null; kisiIdleri: ReadonlySet<number>; aciklama: string;
}

// ISO hafta pazartesiden başlar.
export const haftaBasi = (tarih: string): string => tarihEkle(tarih, -((new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7));

const yeniForm = (tarih: string): Form => ({
  id: null, surum: 0, tarih, baslangic: '17:00', bitis: '20:00', kapsam: 'istasyon', isMerkeziId: '', istasyonId: null, kisiIdleri: new Set(), aciklama: '',
});

const formdan = (f: FazlaMesai): Form => ({
  id: f.id, surum: f.surum, tarih: f.tarih, baslangic: f.baslangic, bitis: f.bitis, kapsam: f.kapsam,
  isMerkeziId: f.isMerkeziId === null ? '' : String(f.isMerkeziId), istasyonId: f.istasyonId, kisiIdleri: new Set(f.kisiIdleri), aciklama: f.aciklama ?? '',
});

// Seçim listede kalan kişilerle sınırlıdır: bu arada istasyon ataması kalkan kişi komuta gitmez.
const govdeOf = (f: Form, personel: readonly Personel[]): FazlaMesaiGovdesi => ({
  tarih: f.tarih, baslangic: f.baslangic, bitis: f.bitis, kapsam: f.kapsam,
  isMerkeziId: f.kapsam === 'is-merkezi' && f.isMerkeziId !== '' ? Number(f.isMerkeziId) : null,
  istasyonId: f.kapsam === 'istasyon' ? f.istasyonId : null,
  kisiIdleri: personel.filter((p) => f.kisiIdleri.has(p.kisiId)).map((p) => p.kisiId),
  aciklama: f.aciklama.trim() || null,
});

function Alanli({ etiket, children }: { etiket: string; children: (kimlik: string) => ReactNode }) {
  const kimlik = useId();
  return (
    <div className="tc-alan">
      <label className="tc-alan-etiket" htmlFor={kimlik}>{etiket}</label>
      {children(kimlik)}
    </div>
  );
}

function useMesaiYaz(kapat: () => void, reddedildi: (idler: number[]) => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: ({ f, govde }: { f: Form; govde: FazlaMesaiGovdesi }) => (f.id === null
      ? tekrarKorumaliGonder((d) => api.post<FazlaMesaiCevabi>('/fazla-mesai', govde, {
        istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}),
      }))
      : api.post<FazlaMesaiCevabi>(`/fazla-mesai/${String(f.id)}/guncelle`, { ...govde, surum: f.surum })),
    onSuccess: async () => {
      kapat();
      bildir('tamam', 'Fazla mesai kaydedildi.');
      await istemci.invalidateQueries({ queryKey: ['vardiya'] });
    },
    onError: async (e) => {
      if (e instanceof ApiHatasi && eskiSurumMu(e.govde)) {
        kapat();
        await istemci.invalidateQueries({ queryKey: anahtarlar.fazlaMesai() });
        bildir('bilgi', 'Fazla mesai başka biri tarafından değiştirildi; güncel hali yüklendi.');
        return;
      }
      reddedildi(reddedilenler(e, 'kisiIdleri'));
      bildir('hata', hataIletisi(e, 'Kaydedilemedi.'));
    },
  });
}

function MesaiFormu({ form, kapat, takvim, personel }: { form: Form; kapat: () => void; takvim: TakvimCevabi; personel: readonly Personel[] }) {
  const [f, fYaz] = useState(form);
  const [arama, aramaYaz] = useState('');
  const [hepsi, hepsiYaz] = useState(false);
  const [reddedilen, reddedilenYaz] = useState<ReadonlySet<number>>(new Set());
  const yaz = useMesaiYaz(kapat, (idler) => reddedilenYaz(new Set(idler)));
  const alan = <K extends keyof Form>(k: K, v: Form[K]) => fYaz({ ...f, [k]: v });
  const merkezAdi = (id: number | null) => { const m = takvim.isMerkezleri.find((x) => x.id === id); return m ? `${m.kod} ${m.ad}` : ''; };
  // Varsayılan liste hedefin personelidir (kişinin ana istasyonu ya da iş merkezi); başka yerden çalışan da istenirse hepsi açılır.
  const hedefte = (p: Personel) => (f.kapsam === 'istasyon' ? f.istasyonId !== null && p.istasyonId === f.istasyonId : f.isMerkeziId !== '' && p.isMerkeziId === Number(f.isMerkeziId));
  const gorunen = personel.filter((p) => (hepsi || hedefte(p) || f.kisiIdleri.has(p.kisiId)) && aramaUyar(arama, p.ad, merkezAdi(p.isMerkeziId)));
  const gorunenIdler = gorunen.map((p) => p.kisiId);
  const hepsiSecili = gorunen.length > 0 && gorunen.every((p) => f.kisiIdleri.has(p.kisiId));
  const seciliSayi = personel.filter((p) => f.kisiIdleri.has(p.kisiId)).length;
  return (
    <Pencere acik kapat={kapat} baslik={f.id === null ? 'Fazla mesai ekle' : 'Fazla mesaiyi düzenle'} tur="yan" alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" yukleniyor={yaz.isPending} onClick={() => yaz.mutate({ f, govde: govdeOf(f, personel) })}>Kaydet</Dugme>
      </>
    )}>
      <div className="tc-vr-form">
        <Alanli etiket="Tarih">{(id) => <TarihGirdisi id={id} required deger={f.tarih} degistir={(v) => alan('tarih', v)} />}</Alanli>
        <div className="tc-vr-satir">
          <Alanli etiket="Başlangıç">{(id) => <SaatGirdisi id={id} required deger={f.baslangic} degistir={(v) => alan('baslangic', v)} />}</Alanli>
          <Alanli etiket="Bitiş">{(id) => <SaatGirdisi id={id} required deger={f.bitis} degistir={(v) => alan('bitis', v)} />}</Alanli>
        </div>
        <p className="tc-vr-ipucu">Bitiş başlangıçtan önceyse çalışma gece yarısını geçer ve ertesi sabaha uzanır.</p>
        <Secim etiket="Kapsam" value={f.kapsam} secenekler={KAPSAMLAR} onChange={(e) => alan('kapsam', e.target.value as FazlaMesaiKapsami)} />
        {f.kapsam === 'is-merkezi' && (
          <Secim etiket="İş merkezi" required value={f.isMerkeziId} bosSecenek="Seçiniz"
            secenekler={takvim.isMerkezleri.filter((m) => m.aktif || String(m.id) === f.isMerkeziId).map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}` }))}
            onChange={(e) => alan('isMerkeziId', e.target.value)} />
        )}
        {f.kapsam === 'istasyon' && <IstasyonSecimi deger={f.istasyonId} degistir={(id) => alan('istasyonId', id)} />}
        <fieldset className="tc-vr-gun-secimi tc-vr-mesai-kisiler">
          <legend>Çalışacak personel ({seciliSayi.toLocaleString('tr-TR')} seçili)</legend>
          <div className="tc-vr-satir">
            <input className="tc-alan-kutu" type="search" aria-label="Personel ara" placeholder="Ad ya da iş merkezi ara" value={arama} onChange={(e) => aramaYaz(e.target.value)} />
            <IsaretKutusu etiket="Başka istasyondakileri de göster" checked={hepsi} onChange={(e) => hepsiYaz(e.target.checked)} />
          </div>
          {gorunen.length === 0
            ? <p className="tc-vr-ipucu">{hepsi || arama !== '' ? 'Aramaya uyan personel yok.' : 'Hedefte personel yok; başka istasyondakileri göstererek seçebilirsin.'}</p>
            : (
              <>
                <IsaretKutusu etiket={`Görünenlerin hepsi (${gorunen.length.toLocaleString('tr-TR')})`} checked={hepsiSecili}
                  onChange={() => alan('kisiIdleri', hepsiniDegistir(f.kisiIdleri, gorunenIdler))} />
                <ul className="tc-vr-mesai-liste">
                  {gorunen.map((p) => (
                    <li key={p.kisiId}>
                      <IsaretKutusu etiket={`${p.ad}${merkezAdi(p.isMerkeziId) ? ` · ${merkezAdi(p.isMerkeziId)}` : ''}`} checked={f.kisiIdleri.has(p.kisiId)}
                        onChange={() => alan('kisiIdleri', degistir(f.kisiIdleri, p.kisiId))} />
                      {reddedilen.has(p.kisiId) && <Rozet ton="hata">Yetkin yok</Rozet>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          <p className="tc-vr-ipucu">Seçilen kişinin takvimine eklenir; onaylı izindeki kişi o gün çalışmaz. Kimse seçilmezse yalnız makine ve istasyon kapasitesi artar.</p>
        </fieldset>
        <CokSatir etiket="Not" maxLength={300} value={f.aciklama} onChange={(e) => alan('aciklama', e.target.value)} />
      </div>
    </Pencere>
  );
}

export function FazlaMesaiEkrani() {
  const takvim = useTakvim();
  const personel = usePersonel();
  const yazabilir = useYazabilir();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [hafta, haftaYaz] = useState<string | null>(null);
  const [form, formYaz] = useState<Form | null>(null);
  const [iptalEdilecek, iptalEdilecekYaz] = useState<FazlaMesai | null>(null);
  const bas = hafta ?? (takvim.data ? haftaBasi(takvim.data.bugun) : null);
  const bit = bas === null ? null : tarihEkle(bas, 6);
  const liste = useQuery({
    queryKey: anahtarlar.fazlaMesai(bas ?? '', bit ?? ''),
    queryFn: () => api.get<FazlaMesaiListeCevabi>(`/fazla-mesai?baslangic=${bas ?? ''}&bitis=${bit ?? ''}`),
    enabled: bas !== null,
    placeholderData: (onceki) => onceki,
  });
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonSecimi, queryFn: () => api.get<{ gruplar: { istasyonlar: { id: number; kod: string; ad: string }[] }[] }>('/istasyonlar/secim'), retry: false });
  const iptal = useMutation({
    mutationFn: (f: FazlaMesai) => api.post<FazlaMesaiCevabi>(`/fazla-mesai/${String(f.id)}/iptal`, { surum: f.surum }),
    onSuccess: async () => {
      iptalEdilecekYaz(null);
      bildir('tamam', 'Fazla mesai iptal edildi.');
      await istemci.invalidateQueries({ queryKey: ['vardiya'] });
    },
    onError: async (e) => {
      iptalEdilecekYaz(null);
      if (e instanceof ApiHatasi && eskiSurumMu(e.govde)) await istemci.invalidateQueries({ queryKey: anahtarlar.fazlaMesai() });
      bildir('hata', hataIletisi(e, 'İptal edilemedi.'));
    },
  });

  if (takvim.isPending || personel.isPending || liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takvim.isError || personel.isError || liste.isError || bas === null || bit === null) {
    return <DurumKutusu durum="hata" yenile={() => { void takvim.refetch(); void personel.refetch(); void liste.refetch(); }} />;
  }

  const kisiAdi = new Map(personel.data.personel.map((p) => [p.kisiId, p.ad]));
  const istasyon = new Map((istasyonlar.data?.gruplar ?? []).flatMap((g) => g.istasyonlar.map((i) => [i.id, `${i.kod} ${i.ad}`] as const)));
  const merkez = new Map(takvim.data.isMerkezleri.map((m) => [m.id, `${m.kod} ${m.ad}`]));
  const hedef = (f: FazlaMesai) => (f.kapsam === 'is-merkezi'
    ? `İş merkezi · ${merkez.get(f.isMerkeziId ?? 0) ?? String(f.isMerkeziId)}`
    : `İstasyon · ${istasyon.get(f.istasyonId ?? 0) ?? String(f.istasyonId)}`);
  // İlk üç ad yazılır, kalanı sayıyla.
  const kisiler = (f: FazlaMesai) => {
    if (f.kisiIdleri.length === 0) return '–';
    const adlar = f.kisiIdleri.slice(0, 3).map((k) => kisiAdi.get(k) ?? `Kişi ${String(k)}`).join(', ');
    const kalan = f.kisiIdleri.length - 3;
    return `${f.kisiIdleri.length.toLocaleString('tr-TR')} kişi: ${adlar}${kalan > 0 ? ` ve ${kalan.toLocaleString('tr-TR')} kişi daha` : ''}`;
  };
  const aktifToplam = liste.data.fazlaMesailer.filter((f) => !f.iptal).reduce((t, f) => t + f.dakika, 0);

  const sutunlar: readonly Sutun<FazlaMesai>[] = [
    { anahtar: 'tarih', baslik: 'Tarih', hucre: (f) => `${haftaGunuAdi(f.tarih)} ${tarihMetni(f.tarih)}`, kirilmaz: true },
    { anahtar: 'saat', baslik: 'Saat', hucre: (f) => `${f.baslangic}–${f.bitis} (${saat(f.dakika)} sa)`, kirilmaz: true },
    { anahtar: 'hedef', baslik: 'Kapsam', hucre: hedef },
    { anahtar: 'kisiler', baslik: 'Personel', hucre: kisiler },
    { anahtar: 'not', baslik: 'Not', hucre: (f) => f.aciklama ?? '–' },
    { anahtar: 'durum', baslik: 'Durum', hucre: (f) => (f.iptal ? <Rozet ton="pasif">İptal</Rozet> : <Rozet ton="tamam">Planlı</Rozet>) },
    ...(yazabilir ? [{
      anahtar: 'islem', baslik: 'İşlem', hucre: (f: FazlaMesai) => (f.iptal ? null : (
        <span className="tc-vr-islemler">
          <Dugme simge="edit" aria-label={`${tarihMetni(f.tarih)} ${f.baslangic} düzenle`} onClick={() => formYaz(formdan(f))}>Düzenle</Dugme>
          <Dugme tur="tehlike" simge="x" aria-label={`${tarihMetni(f.tarih)} ${f.baslangic} iptal et`} onClick={() => iptalEdilecekYaz(f)}>İptal et</Dugme>
        </span>
      )),
    }] : []),
  ];

  return (
    <div className="tc-vr-sayfa">
      <section className="tc-vr-panel" aria-label="Fazla mesai">
        <div className="tc-vr-baslik-satiri">
          <h3>Fazla mesai</h3>
          {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => formYaz(yeniForm(takvim.data.bugun < bas ? bas : takvim.data.bugun))}>Fazla mesai ekle</Dugme>}
        </div>
        <div className="tc-vr-satir" role="group" aria-label="Hafta">
          <Dugme simge="chev-left" aria-label="Önceki hafta" onClick={() => haftaYaz(tarihEkle(bas, -7))} />
          <strong>{tarihMetni(bas)} – {tarihMetni(bit)}</strong>
          <Dugme simge="chev-right" aria-label="Sonraki hafta" onClick={() => haftaYaz(tarihEkle(bas, 7))} />
          {hafta !== null && <Dugme onClick={() => haftaYaz(null)}>Bu hafta</Dugme>}
          <span className="tc-vr-ipucu">Planlı toplam {saat(aktifToplam)} saat</span>
        </div>
        <p className="tc-vr-ipucu">
          Fazla mesai kapsamdaki istasyonun ya da iş merkezinin takvimine eklenir; tatil ve kapalı günde de geçerlidir. Kişinin takvimine yalnız listedeyse girer.
          Plan kapasitesi bu takvimden okur. İptal edilen kayıt listede kalır, takvime girmez.
        </p>
        <Tablo etiket="Fazla mesailer" sutunlar={sutunlar} satirlar={liste.data.fazlaMesailer} satirAnahtari={(f) => f.id} bosMesaj="Bu hafta fazla mesai yok"
          mesgul={liste.isFetching} />
      </section>
      {form !== null && <MesaiFormu form={form} kapat={() => formYaz(null)} takvim={takvim.data} personel={personel.data.personel} />}
      <OnayPenceresi acik={iptalEdilecek !== null} baslik="Fazla mesai iptal edilsin mi?" onayMetni="İptal et" tehlikeli yukleniyor={iptal.isPending}
        onayla={() => { if (iptalEdilecek) iptal.mutate(iptalEdilecek); }} vazgec={() => iptalEdilecekYaz(null)}>
        {iptalEdilecek ? `${tarihMetni(iptalEdilecek.tarih)} ${iptalEdilecek.baslangic}–${iptalEdilecek.bitis} · ${hedef(iptalEdilecek)}` : null}
      </OnayPenceresi>
    </div>
  );
}
