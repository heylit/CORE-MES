import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { DurusNedenleriCevabi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type {
  PlanliDurus, PlanliDurusCevabi, PlanliDurusGovdesi, PlanliDurusKapsami, PlanliDurusListeCevabi, PlanliDurusTekrari, TakvimCevabi,
} from '#paylasilan/sozlesme/vardiya.ts';
import {
  CokSatir, DurumKutusu, Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Rozet, Secim, Tablo, useBildirim, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { IstasyonSecimi } from '../istasyonlar/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DurusSeridi } from './DurusSeridi.tsx';
import { GUNLER, tarihMetni, yerelGun } from './gosterim.ts';
import { ZamanGirdisi } from './ZamanAlani.tsx';
import './vardiya.css';

// Planlı duruş takvimi (kart #519). Alanlar ve akış Arkon Planlama > Planlı duruşlar formundan: başlık, neden, kapsam ve hedef,
// başlangıç ve bitiş, tekrar (yok, her gün, haftalık günler), not. Aynı kayıtları Arkon da okur ve yazar.
const SAYFA_BOYU = 50;
const KAPSAMLAR: readonly { deger: PlanliDurusKapsami; baslik: string }[] = [
  { deger: 'istasyon', baslik: 'İstasyon' }, { deger: 'is-merkezi', baslik: 'İş merkezi' }, { deger: 'tesis', baslik: 'Bütün tesis' },
];
const TEKRARLAR: readonly { deger: PlanliDurusTekrari; baslik: string }[] = [
  { deger: 'yok', baslik: 'Tekrar yok' }, { deger: 'gunluk', baslik: 'Her gün' }, { deger: 'haftalik', baslik: 'Haftalık' },
];

interface Form {
  id: number | null; surum: number; baslik: string; durusNedeniId: string; kapsam: PlanliDurusKapsami; isMerkeziId: string; istasyonId: number | null;
  baslangic: string; bitis: string; tekrar: PlanliDurusTekrari; gunler: number[]; tekrarBitis: string; aciklama: string; aktif: boolean;
}

const iki = (n: number) => String(n).padStart(2, '0');
// datetime-local alanı yerel saattir; sunucuya saat dilimli an gider.
const yerelGirdi = (an: string): string => {
  const t = new Date(an);
  return `${yerelGun(an)}T${iki(t.getHours())}:${iki(t.getMinutes())}`;
};
const anOf = (yerel: string): string => new Date(yerel).toISOString();
const saatMetni = (an: string) => new Date(an).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

function yeniForm(): Form {
  const yarin = new Date(Date.now() + 86_400_000);
  yarin.setHours(8, 0, 0, 0);
  const bas = yarin.toISOString();
  return {
    id: null, surum: 0, baslik: '', durusNedeniId: '', kapsam: 'istasyon', isMerkeziId: '', istasyonId: null,
    baslangic: yerelGirdi(bas), bitis: yerelGirdi(new Date(yarin.getTime() + 2 * 3_600_000).toISOString()),
    tekrar: 'yok', gunler: [1, 2, 3, 4, 5], tekrarBitis: '', aciklama: '', aktif: true,
  };
}

const formdan = (d: PlanliDurus): Form => ({
  id: d.id, surum: d.surum, baslik: d.baslik, durusNedeniId: d.durusNedeniId === null ? '' : String(d.durusNedeniId), kapsam: d.kapsam,
  isMerkeziId: d.isMerkeziId === null ? '' : String(d.isMerkeziId), istasyonId: d.istasyonId, baslangic: yerelGirdi(d.baslangic),
  bitis: yerelGirdi(d.bitis), tekrar: d.tekrar, gunler: d.tekrar === 'haftalik' ? d.gunler : [1, 2, 3, 4, 5],
  tekrarBitis: d.tekrarBitis === null ? '' : yerelGirdi(d.tekrarBitis), aciklama: d.aciklama ?? '', aktif: d.aktif,
});

function govdeOf(f: Form): PlanliDurusGovdesi {
  return {
    baslik: f.baslik, durusNedeniId: f.durusNedeniId === '' ? null : Number(f.durusNedeniId), kapsam: f.kapsam,
    isMerkeziId: f.kapsam === 'is-merkezi' && f.isMerkeziId !== '' ? Number(f.isMerkeziId) : null,
    istasyonId: f.kapsam === 'istasyon' ? f.istasyonId : null,
    baslangic: anOf(f.baslangic), bitis: anOf(f.bitis), tekrar: f.tekrar, gunler: f.tekrar === 'haftalik' ? f.gunler : [],
    tekrarBitis: f.tekrar !== 'yok' && f.tekrarBitis !== '' ? anOf(f.tekrarBitis) : null, aciklama: f.aciklama, aktif: f.aktif,
  };
}

function useDurusYaz(kapat: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: (f: Form) => (f.id === null
      ? tekrarKorumaliGonder((d) => api.post<PlanliDurusCevabi>('/planli-duruslar', govdeOf(f), {
        istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}),
      }))
      : api.post<PlanliDurusCevabi>(`/planli-duruslar/${String(f.id)}/guncelle`, { ...govdeOf(f), surum: f.surum })),
    onSuccess: async () => {
      kapat();
      bildir('tamam', 'Planlı duruş kaydedildi.');
      await istemci.invalidateQueries({ queryKey: ['vardiya'] });
    },
    onError: async (e) => {
      if (e instanceof ApiHatasi && eskiSurumMu(e.govde)) {
        kapat();
        await istemci.invalidateQueries({ queryKey: anahtarlar.planliDuruslar() });
        bildir('bilgi', 'Planlı duruş başka biri tarafından değiştirildi; güncel hali yüklendi.');
        return;
      }
      bildir('hata', hataIletisi(e, 'Kaydedilemedi.'));
    },
  });
}

function DurusFormu({ form, kapat, nedenler, merkezler }: {
  form: Form; kapat: () => void; nedenler: readonly { id: number; kod: string; ad: string }[]; merkezler: TakvimCevabi['isMerkezleri'];
}) {
  const [f, fYaz] = useState(form);
  const yaz = useDurusYaz(kapat);
  const alan = <K extends keyof Form>(k: K, v: Form[K]) => fYaz({ ...f, [k]: v });
  const gunDegistir = (gun: number, secili: boolean) => alan('gunler', secili ? [...f.gunler, gun].sort((a, b) => a - b) : f.gunler.filter((g) => g !== gun));
  return (
    <Pencere acik kapat={kapat} baslik={f.id === null ? 'Planlı duruş ekle' : 'Planlı duruşu düzenle'} tur="yan" alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" yukleniyor={yaz.isPending} onClick={() => yaz.mutate(f)}>Kaydet</Dugme>
      </>
    )}>
      <div className="tc-vr-form">
        <Girdi etiket="Başlık" required maxLength={80} value={f.baslik} onChange={(e) => alan('baslik', e.target.value)} ipucu="Bakım, toplantı, eğitim, sayım…" />
        <Secim etiket="Neden" value={f.durusNedeniId} bosSecenek="Seçilmedi" secenekler={nedenler.map((n) => ({ deger: String(n.id), baslik: `${n.kod} ${n.ad}` }))}
          onChange={(e) => alan('durusNedeniId', e.target.value)} ipucu="Planlı kategorideki duruş nedenleri" />
        <Secim etiket="Kapsam" value={f.kapsam} secenekler={KAPSAMLAR} onChange={(e) => alan('kapsam', e.target.value as PlanliDurusKapsami)} />
        {f.kapsam === 'is-merkezi' && (
          <Secim etiket="İş merkezi" required value={f.isMerkeziId} bosSecenek="Seçiniz"
            secenekler={merkezler.filter((m) => m.aktif || String(m.id) === f.isMerkeziId).map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}` }))}
            onChange={(e) => alan('isMerkeziId', e.target.value)} />
        )}
        {f.kapsam === 'istasyon' && <IstasyonSecimi deger={f.istasyonId} degistir={(id) => alan('istasyonId', id)} />}
        <div className="tc-vr-satir">
          <ZamanGirdisi etiket="Başlangıç" required deger={f.baslangic} degistir={(v) => alan('baslangic', v)} />
          <ZamanGirdisi etiket="Bitiş" required deger={f.bitis} degistir={(v) => alan('bitis', v)} />
        </div>
        <Secim etiket="Tekrar" value={f.tekrar} secenekler={TEKRARLAR} onChange={(e) => alan('tekrar', e.target.value as PlanliDurusTekrari)}
          ipucu={f.tekrar === 'yok' ? undefined : 'Her tekrar başlangıçtaki saatte başlar; süre bir günden kısa olmalı.'} />
        {f.tekrar === 'haftalik' && (
          <fieldset className="tc-vr-gun-secimi">
            <legend>Günler</legend>
            {GUNLER.map((g, i) => <IsaretKutusu key={g} etiket={g} checked={f.gunler.includes(i + 1)} onChange={(e) => gunDegistir(i + 1, e.target.checked)} />)}
          </fieldset>
        )}
        {f.tekrar !== 'yok' && (
          <ZamanGirdisi etiket="Tekrar bitişi" bosOlabilir deger={f.tekrarBitis} degistir={(v) => alan('tekrarBitis', v)} ipucu="Boş bırakılırsa süresiz" />
        )}
        <CokSatir etiket="Not" maxLength={300} value={f.aciklama} onChange={(e) => alan('aciklama', e.target.value)} />
        <IsaretKutusu etiket="Aktif (takvimden düşülür)" checked={f.aktif} onChange={(e) => alan('aktif', e.target.checked)} />
      </div>
    </Pencere>
  );
}

export function PlanliDuruslarEkrani() {
  const [sayfa, sayfaYaz] = useState(1);
  const [form, formYaz] = useState<Form | null>(null);
  const [silinecek, silinecekYaz] = useState<PlanliDurus | null>(null);
  const yazabilir = useOturum().data?.islemler.includes('vardiya.durus-yaz') ?? false;
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({
    queryKey: anahtarlar.planliDuruslar(sayfa),
    queryFn: () => api.get<PlanliDurusListeCevabi>(`/planli-duruslar?sayfa=${String(sayfa)}&sayfaBoyu=${String(SAYFA_BOYU)}`),
    placeholderData: (onceki) => onceki,
  });
  const takvim = useQuery({ queryKey: anahtarlar.takvim, queryFn: () => api.get<TakvimCevabi>('/vardiya-takvimi') });
  // Neden listesi okunamazsa (yetki ya da hata) neden adı yerine kimlik yazılır; neden seçimi boş kalır.
  const nedenler = useQuery({ queryKey: anahtarlar.durusNedenleri, queryFn: () => api.get<DurusNedenleriCevabi>('/durus-nedenleri'), retry: false });
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonSecimi, queryFn: () => api.get<{ gruplar: { istasyonlar: { id: number; kod: string; ad: string }[] }[] }>('/istasyonlar/secim'), retry: false });
  const sil = useMutation({
    mutationFn: (d: PlanliDurus) => api.post(`/planli-duruslar/${String(d.id)}/kaldir`, { surum: d.surum }),
    onSuccess: async () => {
      silinecekYaz(null);
      bildir('tamam', 'Planlı duruş silindi.');
      await istemci.invalidateQueries({ queryKey: ['vardiya'] });
    },
    onError: async (e) => {
      silinecekYaz(null);
      if (e instanceof ApiHatasi && eskiSurumMu(e.govde)) await istemci.invalidateQueries({ queryKey: anahtarlar.planliDuruslar() });
      bildir('hata', hataIletisi(e, 'Silinemedi.'));
    },
  });

  if (liste.isPending || takvim.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError || takvim.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); void takvim.refetch(); }} />;

  const planliNedenler = (nedenler.data?.nedenler ?? []).filter((n) => n.kategori === 'planli' && n.aktif);
  const nedenAdi = (id: number | null) => {
    if (id === null) return '–';
    const n = nedenler.data?.nedenler.find((x) => x.id === id);
    return n ? `${n.kod} ${n.ad}` : `Neden ${String(id)}`;
  };
  const istasyon = new Map((istasyonlar.data?.gruplar ?? []).flatMap((g) => g.istasyonlar.map((i) => [i.id, `${i.kod} ${i.ad}`] as const)));
  const merkez = new Map(takvim.data.isMerkezleri.map((m) => [m.id, `${m.kod} ${m.ad}`]));
  const hedef = (d: PlanliDurus) => (d.kapsam === 'tesis' ? 'Bütün tesis'
    : d.kapsam === 'is-merkezi' ? `İş merkezi · ${merkez.get(d.isMerkeziId ?? 0) ?? String(d.isMerkeziId)}`
      : `İstasyon · ${istasyon.get(d.istasyonId ?? 0) ?? String(d.istasyonId)}`);
  const zaman = (d: PlanliDurus) => {
    const gun = yerelGun(d.baslangic);
    const bitisGunu = yerelGun(d.bitis);
    return `${tarihMetni(gun)} ${saatMetni(d.baslangic)}–${bitisGunu === gun ? '' : `${tarihMetni(bitisGunu)} `}${saatMetni(d.bitis)}`;
  };
  const tekrar = (d: PlanliDurus) => (d.tekrar === 'yok' ? 'Yok'
    : `${d.tekrar === 'gunluk' ? 'Her gün' : d.gunler.map((g) => GUNLER[g - 1]).join(', ')}${d.tekrarBitis ? ` · ${tarihMetni(yerelGun(d.tekrarBitis))} dek` : ''}`);

  const sutunlar: readonly Sutun<PlanliDurus>[] = [
    { anahtar: 'baslik', baslik: 'Başlık', hucre: (d) => d.baslik },
    { anahtar: 'neden', baslik: 'Neden', hucre: (d) => nedenAdi(d.durusNedeniId) },
    { anahtar: 'hedef', baslik: 'Kapsam', hucre: hedef },
    { anahtar: 'zaman', baslik: 'Zaman', hucre: zaman, kirilmaz: true },
    { anahtar: 'tekrar', baslik: 'Tekrar', hucre: tekrar },
    { anahtar: 'durum', baslik: 'Durum', hucre: (d) => (d.aktif ? <Rozet ton="tamam">Aktif</Rozet> : <Rozet ton="pasif">Pasif</Rozet>) },
    ...(yazabilir ? [{
      anahtar: 'islem', baslik: 'İşlem', hucre: (d: PlanliDurus) => (
        <span className="tc-vr-islemler">
          <Dugme simge="edit" aria-label={`${d.baslik} düzenle`} onClick={() => formYaz(formdan(d))}>Düzenle</Dugme>
          <Dugme tur="tehlike" simge="trash" aria-label={`${d.baslik} sil`} onClick={() => silinecekYaz(d)}>Sil</Dugme>
        </span>
      ),
    }] : []),
  ];

  return (
    <div className="tc-vr-sayfa">
      <section className="tc-vr-panel" aria-label="Planlı duruşlar">
        <div className="tc-vr-baslik-satiri">
          <h3>Planlı duruşlar</h3>
          {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => formYaz(yeniForm())}>Planlı duruş ekle</Dugme>}
        </div>
        <p className="tc-vr-ipucu">Aktif planlı duruş çalışma takviminden ve günlük kapasiteden düşülür; plan ve Üretim Terminali aynı kayıtları okur. İstasyon duruşu kişinin takvimini etkilemez.</p>
        {liste.data.satirlar.length > 0 && <DurusSeridi duruslar={liste.data.satirlar} hedef={hedef} />}
        <Tablo etiket="Planlı duruşlar" sutunlar={sutunlar} satirlar={liste.data.satirlar} satirAnahtari={(d) => d.id} bosMesaj="Planlı duruş yok"
          mesgul={liste.isFetching} sayfalama={{ sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: sayfaYaz }} />
      </section>
      {form !== null && <DurusFormu form={form} kapat={() => formYaz(null)} nedenler={planliNedenler} merkezler={takvim.data.isMerkezleri} />}
      <OnayPenceresi acik={silinecek !== null} baslik="Planlı duruş silinsin mi?" onayMetni="Sil" tehlikeli yukleniyor={sil.isPending}
        onayla={() => { if (silinecek) sil.mutate(silinecek); }} vazgec={() => silinecekYaz(null)}>
        {silinecek?.baslik}
      </OnayPenceresi>
    </div>
  );
}
