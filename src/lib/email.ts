// Email Service Module
// Handles sending notification and confirmation emails for reservations

import nodemailer from 'nodemailer';
import type { Booking } from '@/types/booking';

const RESTAURANT_EMAIL = 'lunagroupreservation@gmail.com';
const RESTAURANT_NAME = 'Restaurant Coréen Luna';
const ADMIN_URL = process.env.NEXT_PUBLIC_BASE_URL 
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/admin` 
  : 'http://localhost:3000/admin';

// Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Format time from HH:MM:SS to readable format
 */
function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format date to readable format (Korean - for manager notification)
 */
function formatDateKo(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

/**
 * Format date in English
 */
function formatDateEn(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date in French
 */
function formatDateFr(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('fr-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Send new reservation notification to restaurant manager (in Korean)
 * Sent when customer submits a new reservation (pending status)
 */
export async function sendNewReservationNotification(booking: Booking): Promise<void> {
  const subject = `🔔 새 단체 예약 요청 - ${formatDateKo(booking.booking_date)}`;
  
  const text = `
═════════════════════════════════
       새 예약 요청
═════════════════════════════════

예약 정보:
- 성함: ${booking.first_name} ${booking.last_name}
- 이메일: ${booking.email}
- 전화번호: ${booking.phone}
- 날짜: ${formatDateKo(booking.booking_date)}
- 시간: ${formatTime(booking.slot_start)} - ${formatTime(booking.slot_end)}
- 인원수: ${booking.party_size}명
- 알러지: ${booking.allergy_info || '없음'}

────────────────────────────────

Admin 대시보드에서 예약을 확인/거절해주세요.
${ADMIN_URL}

═════════════════════════════════
`;

  try {
    await transporter.sendMail({
      from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
      to: RESTAURANT_EMAIL,
      subject,
      text,
    });
    console.log('New reservation notification sent successfully');
  } catch (error) {
    console.error('Failed to send new reservation notification:', error);
    // Don't throw - email failure shouldn't block booking
  }
}

/**
 * Send confirmation email to customer (English OR French based on preference)
 * Sent when admin confirms the reservation
 */
export async function sendConfirmationEmail(booking: Booking): Promise<void> {
  const lang = booking.email_language || 'en';
  
  const subject = lang === 'en'
    ? `Reservation Confirmation – ${RESTAURANT_NAME}`
    : `Confirmation de votre réservation – ${RESTAURANT_NAME}`;
  
  const html = lang === 'en' 
    ? generateEnglishEmail(booking)
    : generateFrenchEmail(booking);

  try {
    await transporter.sendMail({
      from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
      to: booking.email,
      subject,
      html,
    });
    console.log('Confirmation email sent successfully to:', booking.email, '(language:', lang, ')');
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    // Don't throw - email failure shouldn't block confirmation
  }
}

/**
 * Generate English confirmation email
 */
function generateEnglishEmail(booking: Booking): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #d4af37; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 25px; background: #f8f9fa; border: 1px solid #e9ecef; }
    .intro { margin-bottom: 20px; }
    .details-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d4af37; }
    .details-box p { margin: 8px 0; }
    .section { margin: 25px 0; }
    .section-title { font-weight: bold; color: #1a1a2e; margin-bottom: 10px; border-bottom: 2px solid #d4af37; padding-bottom: 5px; }
    .policy-box { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .info-box { background: #e8f4fd; padding: 15px; border-radius: 8px; margin: 15px 0; }
    ul { margin: 10px 0; padding-left: 20px; }
    li { margin: 5px 0; }
    .footer { text-align: center; padding: 20px; background: #1a1a2e; color: #d4af37; border-radius: 0 0 10px 10px; }
    .contact { margin-top: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px; }
    a { color: #d4af37; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Reservation Confirmed</h1>
  </div>
  
  <div class="content">
    <div class="intro">
      <p>Dear ${booking.first_name},</p>
      <p>We are pleased to confirm your reservation at <strong>${RESTAURANT_NAME}</strong>.</p>
      <p>Your credit card information has been securely stored in the Luna reservation system. No charges have been processed in advance.</p>
    </div>
    
    <div class="details-box">
      <div class="section-title">📋 Reservation Details</div>
      <p>📅 <strong>Date:</strong> ${formatDateEn(booking.booking_date)}</p>
      <p>⏰ <strong>Time:</strong> ${formatTime(booking.slot_start)} - ${formatTime(booking.slot_end)}</p>
      <p>👥 <strong>Number of Guests:</strong> ${booking.party_size}</p>
      <p>📍 <strong>Address:</strong> 917 Rue Rachel E, Montreal, QC H2J 2J2</p>
    </div>

    <div class="section">
      <div class="section-title">⚠️ No-Show Policy</div>
      <p>The no-show fee is not a deposit. Your credit card information is kept solely as a reservation guarantee.</p>
      <p>A fee of $20 per person will apply if:</p>
      <ul>
        <li>The reservation is cancelled less than one week before the reservation date</li>
        <li>Changes to the number of guests are not communicated at least 12 hours in advance</li>
        <li>The party does not arrive by the scheduled reservation time</li>
      </ul>
    </div>

    <div class="section">
      <div class="section-title">📝 Cancellation & Guest Confirmation</div>
      <ul>
        <li>Cancellations must be made at least 7 days prior to the reservation date</li>
        <li>The final guest count must be confirmed within 12 hours of the reservation time</li>
        <li>A reduction of up to two (2) guests is permitted without penalty</li>
        <li>Failure to confirm may result in a $20 per person no-show fee</li>
      </ul>
    </div>

    <div class="info-box">
      <div class="section-title">🚗 Parking Information</div>
      <p>Parking in the area may be limited; we recommend arriving early.</p>
      <p>Residential parking permit information is available at:<br/>
      🔗 <a href="https://www.agencemobilitedurable.ca/fr/infos-pratiques/permis-journalier">https://www.agencemobilitedurable.ca/fr/infos-pratiques/permis-journalier</a></p>
    </div>

    <div class="section">
      <div class="section-title">ℹ️ Important Information</div>
      <ul>
        <li><strong>Permitted Alcohol:</strong> wine, sparkling wine, beer, and rice wine (maximum 20% ABV)</li>
        <li><strong>Allergies:</strong> our meats are marinated with soy sauce (gluten) and fish sauce. Adjustments are possible only with advance notice. We cannot guarantee a peanut-free environment</li>
        <li><strong>Service Charge:</strong> 18%</li>
        <li><strong>Children Policy:</strong> children under 10 years old may order one à la carte main dish; otherwise, they are considered adults</li>
        <li><strong>Outside Desserts:</strong> not permitted</li>
        <li><strong>Entertainment & Decorations:</strong> DJs, live bands, special music, and table decorations are not permitted, out of respect for other guests</li>
      </ul>
    </div>

    <div class="contact">
      <p>For questions or changes, please contact our Group Reservations Representative or reply directly through Libro.</p>
      <p>📞 514-834-8710 (French)<br/>📞 514-224-8710 (English)</p>
    </div>

    <p style="margin-top: 20px;">We look forward to welcoming you and providing an excellent dining experience.</p>
    <p><em>– ${RESTAURANT_NAME}</em></p>
  </div>
  
  <div class="footer">
    <strong>${RESTAURANT_NAME}</strong>
  </div>
</body>
</html>
`;
}

/**
 * Generate French confirmation email
 */
function generateFrenchEmail(booking: Booking): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #d4af37; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 25px; background: #f8f9fa; border: 1px solid #e9ecef; }
    .intro { margin-bottom: 20px; }
    .details-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d4af37; }
    .details-box p { margin: 8px 0; }
    .section { margin: 25px 0; }
    .section-title { font-weight: bold; color: #1a1a2e; margin-bottom: 10px; border-bottom: 2px solid #d4af37; padding-bottom: 5px; }
    .policy-box { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .info-box { background: #e8f4fd; padding: 15px; border-radius: 8px; margin: 15px 0; }
    ul { margin: 10px 0; padding-left: 20px; }
    li { margin: 5px 0; }
    .footer { text-align: center; padding: 20px; background: #1a1a2e; color: #d4af37; border-radius: 0 0 10px 10px; }
    .contact { margin-top: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px; }
    a { color: #d4af37; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Réservation Confirmée</h1>
  </div>
  
  <div class="content">
    <div class="intro">
      <p>Cher/Chère ${booking.first_name},</p>
      <p>Nous confirmons votre réservation au <strong>${RESTAURANT_NAME}</strong>.</p>
      <p>Les informations de votre carte de crédit ont été enregistrées de façon sécurisée dans le système de réservation Luna. Aucun montant n'a été facturé à l'avance.</p>
    </div>
    
    <div class="details-box">
      <div class="section-title">📋 Détails de la réservation</div>
      <p>📅 <strong>Date :</strong> ${formatDateFr(booking.booking_date)}</p>
      <p>⏰ <strong>Heure :</strong> ${formatTime(booking.slot_start)} - ${formatTime(booking.slot_end)}</p>
      <p>👥 <strong>Nombre de convives :</strong> ${booking.party_size}</p>
      <p>📍 <strong>Adresse :</strong> 917 rue Rachel E, Montréal (QC) H2J 2J2</p>
    </div>

    <div class="section">
      <div class="section-title">⚠️ Politique de non-présentation</div>
      <p>Les frais de non-présentation ne constituent pas un dépôt. Les informations de votre carte de crédit sont conservées uniquement à titre de garantie.</p>
      <p>Des frais de 20 $ par personne seront appliqués si :</p>
      <ul>
        <li>L'annulation est effectuée moins d'une semaine avant la date de réservation</li>
        <li>Les changements au nombre de convives ne sont pas communiqués au moins 12 heures à l'avance</li>
        <li>Le groupe ne se présente pas ou arrive après l'heure prévue</li>
      </ul>
    </div>

    <div class="section">
      <div class="section-title">📝 Annulation et confirmation</div>
      <ul>
        <li>L'annulation doit être effectuée au moins 7 jours avant la réservation</li>
        <li>Le nombre final de convives doit être confirmé 12 heures avant l'heure de réservation</li>
        <li>Une réduction maximale de deux (2) convives est permise sans frais</li>
        <li>À défaut de confirmation, des frais de 20 $ par personne pourraient s'appliquer</li>
      </ul>
    </div>

    <div class="info-box">
      <div class="section-title">🚗 Stationnement</div>
      <p>Le stationnement dans le secteur peut être limité. Nous recommandons d'arriver à l'avance.</p>
      <p>Informations sur les permis de stationnement résidentiels :<br/>
      🔗 <a href="https://www.agencemobilitedurable.ca/fr/infos-pratiques/permis-journalier">https://www.agencemobilitedurable.ca/fr/infos-pratiques/permis-journalier</a></p>
    </div>

    <div class="section">
      <div class="section-title">ℹ️ Informations importantes</div>
      <ul>
        <li><strong>Alcool permis :</strong> vin, vin mousseux, bière et vin de riz (maximum 20 % d'alcool)</li>
        <li><strong>Allergies :</strong> nos viandes sont marinées avec de la sauce soya (gluten) et de la sauce de poisson. Des ajustements sont possibles uniquement avec préavis. Nous ne pouvons garantir un environnement sans arachides</li>
        <li><strong>Frais de service :</strong> 18 %</li>
        <li><strong>Enfants :</strong> les enfants de moins de 10 ans peuvent commander un plat principal à la carte; autrement, ils sont considérés comme des adultes</li>
        <li><strong>Desserts extérieurs :</strong> non permis</li>
        <li><strong>Animation et décorations :</strong> DJ, musique live, musique spéciale et décorations de table ne sont pas autorisés, par respect pour les autres clients</li>
      </ul>
    </div>

    <div class="contact">
      <p>Pour toute question ou modification, veuillez communiquer avec notre responsable des réservations de groupe ou répondre directement via Libro.</p>
      <p>📞 514-834-8710 (Français)<br/>📞 514-224-8710 (English)</p>
    </div>

    <p style="margin-top: 20px;">Au plaisir de vous accueillir prochainement,</p>
    <p><em>– ${RESTAURANT_NAME}</em></p>
  </div>
  
  <div class="footer">
    <strong>${RESTAURANT_NAME}</strong>
  </div>
</body>
</html>
`;
}
