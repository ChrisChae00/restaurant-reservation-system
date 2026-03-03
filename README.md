# Restaurant Reservation System

![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-008CDD?style=for-the-badge&logo=stripe&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

A modern, full-stack restaurant reservation system built with Next.js, featuring real-time availability, secure payments, automated email notifications, and an administrative dashboard.

## 🌟 Features

- **Multi-step Booking Flow**: A seamless and intuitive reservation experience with dynamic availability checking.
- **Secure Deposit Payments**: Integrated with Stripe for taking deposits and holding booking guarantees securely.
- **Automated Email Notifications**: Booking confirmations, updates, and reminders sent out via Gmail SMTP.
- **Administrative Dashboard**: Manage reservations, view schedules, and handle customer requests securely backed by custom JWT authentication.
- **Internationalization (i18n)**: Out-of-the-box multi-language support leveraging `next-intl`.
- **Responsive Design**: Mobile-friendly UI crafted with Tailwind CSS v4 and Radix UI primitives.
- **Robust Validation**: Both client-side and server-side validation using React Hook Form and Zod.

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Styling & UI**: Tailwind CSS v4, Radix UI, Lucide React
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL Database & Auth)
- **Payments**: Stripe
- **Email Delivery**: Nodemailer (via Gmail SMTP integration)
- **Forms & Validation**: React Hook Form, Zod
- **i18n**: next-intl

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ installed
- A [Supabase](https://supabase.com/) project
- A [Stripe](https://stripe.com/) account
- A Gmail account (with App Password enabled)

### Installation

1. Clone the repository and install the dependencies:

```bash
npm install
```

2. Copy the environment variables template and fill in your credentials:

```bash
cp .env.local.example .env.local
```

3. Configure your `.env.local` file with the required keys:

- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` & `STRIPE_SECRET_KEY`
- `GMAIL_USER` & `GMAIL_APP_PASSWORD`
- `JWT_SECRET`, `ADMIN_USERNAME`, & `ADMIN_PASSWORD`

### Database Setup

Apply the Supabase migrations to set up your database schema. You can execute the SQL scripts found in the `supabase/migrations/` directory directly within your Supabase SQL Editor, or use the CLI:

```bash
npx supabase migration up
```

### Development

Run the development server locally:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📁 Project Structure

- `src/app/` - Next.js App Router pages including Frontend interface and Admin Panel
- `src/app/api/` - Backend API routes for interacting with the database, auth, emails, and Stripe webhooks
- `src/components/` - Reusable UI elements, `booking/` components, and layout blocks
- `src/lib/` - Core logic blocks including `auth.ts`, `stripe.ts`, `email.ts`, `supabase/` client, and validations
- `supabase/migrations/` - PostgreSQL Database schema files and migration definitions
