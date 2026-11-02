import { useQuery } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { MakineDurumlariCevabi, MakinelerCevabi, PanoOzetiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import { MakineDurumuKarti, type MakineKutusu } from '../../ortak/arayuz/grafik/grafikler.tsx';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Rol panosu kaynakları (kart 1585): pano kartlarıyla aynı uç (#483).
const usePanoOzeti = () => useQuery({ queryKey: anahtarlar.panoOzeti, queryFn: () => api.get<PanoOzetiCevabi>('/istasyonlar/pano-ozeti') });

// Makine sayfasını açamayan bakımcı arızayı Arkon'da açar; ikisini de açamayana (operatör) satır bağlantısız kalmasın diye terminal.
export function duranKalemi(m: PanoOzetiCevabi['makine'], yol: string): IsKalemi[] {
  const n = m.ariza + m.bakim;
  if (n === 0) return [];
  return [{
    anahtar: 'duran', baslik: `${n.toLocaleString('tr-TR')} makine duruyor`, ayrinti: `${m.ariza.toLocaleString('tr-TR')} arıza, ${m.bakim.toLocaleString('tr-TR')} bakım`,
    aciliyet: m.ariza > 0 ? 'gecikmis' : 'bekliyor', sonTarih: null, yol, eylem: 'Makinelere bak', neden: 'Duran makine planlı işi geciktirir.',
  }];
}

export function makineOlcusu(m: PanoOzetiCevabi['makine']): GidisatOlcusu[] {
  return [{ anahtar: 'calisan-makine', ad: 'Çalışan makine', deger: m.calisir, birim: 'makine', kiyas: null, plan: m.toplam, seri: [], dagilim: [] }];
}

const YOLLAR: readonly [Islem, string][] = [['sayfa.istasyonlar', '/istasyonlar/makineler'], ['arkon.bakim', '/arkon/bakim'], ['sayfa.uretim-terminali', '/uretim-terminali']];

function Duran() {
  const s = usePanoOzeti();
  const islemler = useOturum().data?.islemler ?? [];
  const yol = YOLLAR.find(([i]) => islemler.includes(i))?.[1] ?? '/istasyonlar/makineler';
  useKaynakBildir(s.isError ? null : s.data === undefined ? undefined : duranKalemi(s.data.makine, yol));
  return null;
}
function Calisan() {
  const s = usePanoOzeti();
  useKaynakBildir(s.isError ? null : s.data === undefined ? undefined : makineOlcusu(s.data.makine));
  return null;
}

// Makineler, şu an (kart 1773): aktif makine başına bir kutu. Durumu yazılmamış makine "durum yok"tur, çalışıyor sayılmaz.
const TON: Readonly<Record<MakineDurumlariCevabi['durumlar'][number]['durum'], MakineKutusu['ton']>> = { calisir: 'calisiyor', ariza: 'ariza', bakim: 'bakim' };
const TON_SIRASI: Readonly<Record<MakineKutusu['ton'], number>> = { ariza: 0, bakim: 1, bilinmiyor: 2, calisiyor: 3 };

export function makineKutulari(makineler: MakinelerCevabi['makineler'], durumlar: MakineDurumlariCevabi['durumlar']): MakineKutusu[] {
  const durum = new Map(durumlar.map((d) => [d.makineId, d]));
  return makineler.filter((m) => m.aktif).map((m): MakineKutusu => {
    const d = durum.get(m.id);
    return { anahtar: String(m.id), kod: m.kod, ad: m.ad, ton: d === undefined ? 'bilinmiyor' : TON[d.durum], aciklama: d?.aciklama ?? null, yol: '/istasyonlar/makineler' };
  }).sort((a, b) => TON_SIRASI[a.ton] - TON_SIRASI[b.ton] || a.kod.localeCompare(b.kod, 'tr'));
}

function MakineGrafigi() {
  const m = useQuery({ queryKey: [...anahtarlar.makineler, 'pano'], queryFn: () => api.get<MakinelerCevabi>('/makineler') });
  const d = useQuery({ queryKey: anahtarlar.makineDurumlari, queryFn: () => api.get<MakineDurumlariCevabi>('/makine-durumlari') });
  const yuklendi = m.data !== undefined && d.data !== undefined;
  return (
    <MakineDurumuKarti baslik="Makineler, şu an" alt="Önce arızalı ve bakımdakiler; durum simge ve yazıyla" simge="cpu" yol="/istasyonlar/makineler"
      hata={m.isError || d.isError} yuklendi={yuklendi} makineler={yuklendi ? makineKutulari(m.data.makineler, d.data.durumlar) : []} />
  );
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'istasyonlar-duran-is', tur: 'is', baslik: 'Makine', simge: 'stop', sira: 50, islem: 'sayfa.istasyonlar', veya: ['sayfa.terminal', 'arkon.bakim'], yolunda: 'Duran makine yok', kaynak: Duran },
  { anahtar: 'istasyonlar-makine-olcu', tur: 'gidisat', baslik: 'Makine', simge: 'cpu', sira: 300, islem: 'sayfa.istasyonlar', kaynak: Calisan },
  // Liste ve durum uçlarının ikisini de geçen işlemler (LISTE_OKUMA ve DURUM_OKUMA kesişimi).
  { anahtar: 'istasyonlar-makine-grafik', tur: 'grafik', baslik: 'Makineler', simge: 'cpu', sira: 100, bolum: 'makine', anaSayfada: true, islem: 'sayfa.istasyonlar', veya: ['istasyonlar.yaz'], kaynak: MakineGrafigi },
];
