import { Resend } from "resend";

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set in environment variables");
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "Galleon <notifications@galleon.ai>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://galleon.ai";

export async function sendWelcomeEmail(email: string, name?: string): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Welcome to Galleon - Private Credit Intelligence",
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    .features { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .features li { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Galleon</h1>
      <p>Private Credit Intelligence, Powered by AI</p>
    </div>
    <div class="content">
      <p>Hi ${name || "there"},</p>
      <p>Thank you for joining Galleon! You now have access to AI-powered private credit intelligence tools that help you research deals, analyze documents, and make better investment decisions.</p>
      <div class="features">
        <h3>What you can do with your account:</h3>
        <ul>
          <li>Create and track private credit deals</li>
          <li>Upload and analyze documents (term sheets, credit memos, financials)</li>
          <li>Launch AI-powered research missions</li>
          <li>Get verified intelligence findings with source attribution</li>
        </ul>
      </div>
      <p>Ready to get started? Create your first deal:</p>
      <a href="${APP_URL}/deals/new" class="button">Create a Deal</a>
      <p>Want full AI agent access? Upgrade to Professional for autonomous research, audit verification, and the Command Center.</p>
      <a href="${APP_URL}/pricing" class="button" style="background: #059669;">View Plans</a>
    </div>
    <div class="footer">
      <p>&copy; Galleon - Private Credit Intelligence</p>
      <p>You received this email because you signed up for Galleon.</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendPaymentConfirmationEmail(
  email: string,
  name: string | undefined,
  tier: string,
  amount: number,
  nextBillingDate: Date
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Payment Confirmed - Galleon Subscription",
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .receipt { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Confirmed</h1>
      <p>Thank you for your subscription!</p>
    </div>
    <div class="content">
      <p>Hi ${name || "there"},</p>
      <p>Your payment has been processed successfully.</p>
      <div class="receipt">
        <div style="display: flex; justify-content: space-between; margin: 10px 0;">
          <span><strong>Plan:</strong></span>
          <span>${tier}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 10px 0;">
          <span><strong>Amount:</strong></span>
          <span>$${(amount / 100).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 10px 0;">
          <span><strong>Next billing date:</strong></span>
          <span>${nextBillingDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      </div>
      <a href="${APP_URL}/dashboard" class="button">Go to Dashboard</a>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        Need to manage your subscription? Visit your <a href="${APP_URL}/account">account settings</a>.
      </p>
    </div>
    <div class="footer">
      <p>&copy; Galleon - Private Credit Intelligence</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendPaymentFailedEmail(
  email: string,
  name: string | undefined,
  retryDate: Date
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Action Required: Payment Failed - Galleon",
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .alert { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Failed</h1>
      <p>Action required to maintain access</p>
    </div>
    <div class="content">
      <p>Hi ${name || "there"},</p>
      <div class="alert">
        <p><strong>Your recent payment could not be processed.</strong></p>
        <p>We'll automatically retry on ${retryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</p>
      </div>
      <p>To avoid any interruption to your Galleon access, please update your payment method:</p>
      <a href="${APP_URL}/account" class="button">Update Payment Method</a>
    </div>
    <div class="footer">
      <p>&copy; Galleon - Private Credit Intelligence</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendMissionCompleteEmail(
  email: string,
  name: string | undefined,
  missionTitle: string,
  findingsCount: number,
  missionId: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Mission Complete: ${missionTitle} - Galleon`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    .stats { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Mission Complete</h1>
      <p>${missionTitle}</p>
    </div>
    <div class="content">
      <p>Hi ${name || "there"},</p>
      <p>Your intelligence mission has been completed successfully.</p>
      <div class="stats">
        <h3 style="margin: 0;">${findingsCount}</h3>
        <p style="color: #6b7280; margin: 5px 0 0;">Intelligence Findings</p>
      </div>
      <p>View the full report and findings in your dashboard:</p>
      <a href="${APP_URL}/missions/${missionId}" class="button">View Report</a>
    </div>
    <div class="footer">
      <p>&copy; Galleon - Private Credit Intelligence</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendMissionFailedEmail(
  email: string,
  name: string | undefined,
  missionTitle: string,
  errorMessage: string,
  missionId: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Mission Failed: ${missionTitle} - Galleon`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .alert { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Mission Failed</h1>
      <p>${missionTitle}</p>
    </div>
    <div class="content">
      <p>Hi ${name || "there"},</p>
      <div class="alert">
        <p><strong>Your mission encountered an error:</strong></p>
        <p>${errorMessage}</p>
      </div>
      <p>You can review partial results or retry the mission:</p>
      <a href="${APP_URL}/missions/${missionId}" class="button">View Mission</a>
    </div>
    <div class="footer">
      <p>&copy; Galleon - Private Credit Intelligence</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}
