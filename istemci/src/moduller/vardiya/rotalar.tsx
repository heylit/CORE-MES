import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { FazlaMesaiEkrani } from './FazlaMesai.tsx';
import { GunlukMesaiEkrani } from './GunlukMesai.tsx';
import { PlanliDuruslarEkrani } from './PlanliDuruslar.tsx';
import { IK_VARDIYA_YOLU, PersonelEkrani, TakvimEkrani, VardiyaEkrani } from './Vardiya.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/vardiya', ekran: VardiyaEkrani },
  { yol: '/vardiya/personel', ekran: PersonelEkrani },
  { yol: '/vardiya/takvim', ekran: TakvimEkrani },
  { yol: '/vardiya/planli-duruslar', ekran: PlanliDuruslarEkrani },
  { yol: '/vardiya/fazla-mesai', ekran: FazlaMesaiEkrani },
  { yol: '/vardiya/mesai', ekran: GunlukMesaiEkrani },
  { yol: '/mesai', ekran: GunlukMesaiEkrani },
  // İstasyonlar ikinci menüsünün "Vardiyalar" maddesi aynı düzeni açar (kullanıcı kararı, kart #1109). Rota burada durur:
  // istasyonlar bu ekranı ithal etseydi modüller döngüye girerdi (vardiya istasyon seçimini istasyonlardan alır).
  { yol: '/istasyonlar/vardiyalar', ekran: VardiyaEkrani },
  // 1934 a: İK menüsünün "Vardiyalar ve tatiller" maddesi; yazma yalnız bu adreste açıktır. Sabit yol İK'nın '/ik/:gorunum' yolundan önce eşleşir.
  { yol: IK_VARDIYA_YOLU, ekran: VardiyaEkrani },
];
