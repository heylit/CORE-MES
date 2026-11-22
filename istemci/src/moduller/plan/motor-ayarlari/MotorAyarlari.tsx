import { Navigate } from 'react-router-dom';

// Motor ayarları artık Planlama ayarları sayfasının Motor bölümüdür (3561); eski adres ve ona giden bağlantılar oraya yönlenir.
export const MOTOR_AYARLARI_YOLU = '/plan/motor-ayarlari';
export const MOTOR_BOLUMU_ADRESI = '/plan/ayarlar?bolum=motor';

export function MotorAyarlariYonlendirme() {
  return <Navigate to={MOTOR_BOLUMU_ADRESI} replace />;
}
