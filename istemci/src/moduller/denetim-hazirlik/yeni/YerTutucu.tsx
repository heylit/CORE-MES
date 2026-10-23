import { DurumKutusu } from '../../../ortak/arayuz/index.ts';

export const YER_TUTUCU_ILETISI = 'Bu bölüm hazırlanıyor';
export const YerTutucu = () => <DurumKutusu durum="bos" mesaj={YER_TUTUCU_ILETISI} />;
