
import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gold mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground">Effective Date: December 21, 2025</p>
        </div>

        <div className="bg-secondary/30 p-6 rounded-lg border border-gold/20 space-y-6">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gold-light">1. Introduction</h2>
            <p className="text-sm leading-relaxed">
              Restaurant Coréen Luna ("we," "us," or "our") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our reservation system, in compliance with Quebec's <em>Act respecting the protection of personal information in the private sector</em> (Law 25) and other applicable Canadian laws.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gold-light">2. Information We Collect</h2>
            <p className="text-sm leading-relaxed">
              We collect personal information that you voluntarily provide to us when making a reservation, including:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground pl-4 space-y-2">
              <li>Full Name</li>
              <li>Email Address</li>
              <li>Phone Number</li>
              <li>Credit Card Information (processed securely via Stripe; we do not store full card numbers)</li>
              <li>Dietary restrictions or allergy information</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gold-light">3. How We Use Your Information</h2>
            <p className="text-sm leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground pl-4 space-y-2">
              <li>Process and confirm your reservations.</li>
              <li>Communicate with you regarding your booking (confirmations, cancellations, updates).</li>
              <li>Process no-show fees or penalties in accordance with our cancellation policy.</li>
              <li>Comply with legal obligations.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gold-light">4. Data Protection Officer (DPO)</h2>
            <p className="text-sm leading-relaxed">
              Before the law, the person responsible for the protection of personal information within our organization is:
            </p>
            <div className="bg-secondary p-4 rounded border border-gold/10">
              <p className="font-medium">Restaurant Manager</p>
              <p className="text-sm">Email: lunagroupreservation@gmail.com</p>
              <p className="text-sm">Address: 917 Rue Rachel E, Montreal, QC H2J 2J2</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gold-light">5. Your Rights</h2>
            <p className="text-sm leading-relaxed">
              Under Quebec Law 25, you have the right to:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground pl-4 space-y-2">
              <li>Access your personal information held by us.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Withdraw your consent to the use or communication of your information.</li>
              <li>Request the deletion of your personal information (subject to legal retention requirements).</li>
            </ul>
            <p className="text-sm mt-2">
              To exercise these rights, please contact our Data Protection Officer at the email address provided above.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gold-light">6. Data Security</h2>
            <p className="text-sm leading-relaxed">
              We implement reasonable administrative, technical, and physical security measures to protect your personal information against unauthorized access, disclosure, or misuse. Payment information is securely processed by Stripe, a PCI-DSS compliant payment processor.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gold-light">7. Changes to This Policy</h2>
            <p className="text-sm leading-relaxed">
              We may update this Privacy Policy from time to time. The updated version will be indicated by an updated "Effective Date" at the top of this policy.
            </p>
          </section>
        </div>

        <div className="text-center">
          <Link href="/" className="text-gold hover:underline hover:text-gold-light">
            ← Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
