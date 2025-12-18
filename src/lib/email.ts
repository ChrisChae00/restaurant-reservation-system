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
 * Send confirmation email to customer (English + French)
 * Sent when admin confirms the reservation
 */
export async function sendConfirmationEmail(booking: Booking): Promise<void> {
  const subject = `✅ Reservation Confirmed / Réservation Confirmée - ${RESTAURANT_NAME}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { 
      font-family: Arial, sans-serif; 
      color: #333; 
      max-width: 600px; 
      margin: 0 auto; 
      padding: 20px;
    }
    .header { 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); 
      color: #d4af37; 
      padding: 30px; 
      text-align: center; 
      border-radius: 10px 10px 0 0;
    }
    .header h1 { margin: 0; font-size: 28px; }
    .content { 
      padding: 30px; 
      background: #f8f9fa; 
      border: 1px solid #e9ecef;
    }
    .details { 
      background: white; 
      padding: 20px; 
      border-radius: 8px; 
      margin: 20px 0;
      border-left: 4px solid #d4af37;
    }
    .details p { margin: 8px 0; }
    .details strong { color: #1a1a2e; }
    .reminders { 
      background: #fff3cd; 
      padding: 15px; 
      border-radius: 8px; 
      margin: 15px 0;
    }
    .reminders ul { margin: 10px 0; padding-left: 20px; }
    .divider { 
      border-top: 2px dashed #d4af37; 
      margin: 30px 0; 
    }
    .french { color: #555; }
    .footer { 
      text-align: center; 
      padding: 20px;
      background: #1a1a2e;
      color: #aaa;
      font-size: 12px;
      border-radius: 0 0 10px 10px;
    }
    .footer a { color: #d4af37; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Reservation Confirmed!</h1>
  </div>
  
  <div class="content">
    <p>Dear ${booking.first_name},</p>
    <p>Great news! Your group reservation at <strong>${RESTAURANT_NAME}</strong> has been confirmed.</p>
    
    <div class="details">
      <h3 style="margin-top: 0; color: #d4af37;">Reservation Details</h3>
      <p><strong>Confirmation #:</strong> ${booking.id.slice(0, 8).toUpperCase()}</p>
      <p><strong>Date:</strong> ${formatDateEn(booking.booking_date)}</p>
      <p><strong>Time:</strong> ${formatTime(booking.slot_start)} - ${formatTime(booking.slot_end)}</p>
      <p><strong>Party Size:</strong> ${booking.party_size} guests</p>
    </div>
    
    <div class="reminders">
      <strong>⚠️ Important Reminders:</strong>
      <ul>
        <li>Please arrive on time</li>
        <li>If your party size changes, please notify us at least 48 hours before your reservation</li>
        <li>Cancellations made less than 48 hours before your reservation: $20 CAD per person fee applies</li>
      </ul>
    </div>
    
    <p>We look forward to welcoming you!</p>
    <p><em>- ${RESTAURANT_NAME} Team</em></p>
    
    <div class="divider"></div>
    
    <div class="french">
      <h2>🎉 Réservation Confirmée!</h2>
      <p>Cher(e) ${booking.first_name},</p>
      <p>Bonne nouvelle! Votre réservation de groupe au <strong>${RESTAURANT_NAME}</strong> a été confirmée.</p>
      
      <div class="details">
        <h3 style="margin-top: 0; color: #d4af37;">Détails de la Réservation</h3>
        <p><strong>Numéro de confirmation:</strong> ${booking.id.slice(0, 8).toUpperCase()}</p>
        <p><strong>Date:</strong> ${formatDateFr(booking.booking_date)}</p>
        <p><strong>Heure:</strong> ${formatTime(booking.slot_start)} - ${formatTime(booking.slot_end)}</p>
        <p><strong>Nombre de personnes:</strong> ${booking.party_size}</p>
      </div>
      
      <div class="reminders">
        <strong>⚠️ Rappels Importants:</strong>
        <ul>
          <li>Arrivez à l'heure svp</li>
          <li>Si le nombre de personnes change, veuillez nous aviser au moins 48 heures avant votre réservation</li>
          <li>Annulation moins de 48 heures avant votre réservation: frais de 20 $ CAD par personne</li>
        </ul>
      </div>
      
      <p>Au plaisir de vous accueillir!</p>
      <p><em>- L'équipe ${RESTAURANT_NAME}</em></p>
    </div>
  </div>
  
  <div class="footer">
    <p><strong>${RESTAURANT_NAME}</strong> | Montreal</p>
    <p>Questions? Contact us at <a href="mailto:${RESTAURANT_EMAIL}">${RESTAURANT_EMAIL}</a></p>
  </div>
</body>
</html>
`;

  try {
    await transporter.sendMail({
      from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
      to: booking.email,
      subject,
      html,
    });
    console.log('Confirmation email sent successfully to:', booking.email);
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    // Don't throw - email failure shouldn't block confirmation
  }
}
