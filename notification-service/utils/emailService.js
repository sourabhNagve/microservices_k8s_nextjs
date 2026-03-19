import { Resend } from 'resend';

let resend = null;

const getResend = () => {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not defined. Check your .env file.');
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const FROM_NAME  = process.env.FROM_NAME  || 'MicroStore';

// ─── Order confirmed email ────────────────────────────────────────────────────
export const sendOrderConfirmedEmail = async ({ to, orderNumber, items, shippingInfo, totals }) => {
  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
        <strong>${item.productName}</strong><br/>
        <span style="color: #6b7280; font-size: 14px;">Qty: ${item.quantity}</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: right;">
        $${Number(item.totalPrice).toFixed(2)}
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmed</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 40px 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">MicroStore</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 16px;">Order Confirmed! 🎉</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px;">
          <h2 style="color: #111827; font-size: 20px; margin: 0 0 8px;">
            Thank you, ${shippingInfo.firstName}!
          </h2>
          <p style="color: #6b7280; margin: 0 0 24px;">
            Your order <strong style="color: #111827;">#${orderNumber}</strong> has been confirmed and is being processed.
          </p>

          <!-- Order items -->
          <div style="background: #f9fafb; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f3f4f6;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Item</th>
                  <th style="padding: 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- Totals -->
          <div style="border-top: 2px solid #f3f4f6; padding-top: 16px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280;">Subtotal</span>
              <span style="color: #111827; font-weight: 500;">$${Number(totals?.subtotal ?? 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280;">Shipping</span>
              <span style="color: #111827; font-weight: 500;">$${Number(totals?.shippingCost ?? 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280;">Tax</span>
              <span style="color: #111827; font-weight: 500;">$${Number(totals?.taxAmount ?? 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid #f3f4f6;">
              <span style="color: #111827; font-weight: 700; font-size: 16px;">Total</span>
              <span style="color: #2563eb; font-weight: 700; font-size: 16px;">$${Number(totals?.totalAmount ?? 0).toFixed(2)}</span>
            </div>
          </div>

          <!-- Shipping address -->
          <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <h3 style="color: #111827; font-size: 14px; font-weight: 600; margin: 0 0 8px;">Shipping To</h3>
            <p style="color: #6b7280; margin: 0; font-size: 14px; line-height: 1.6;">
              ${shippingInfo.firstName} ${shippingInfo.lastName}<br/>
              ${shippingInfo.addressLine1}<br/>
              ${shippingInfo.addressLine2 ? shippingInfo.addressLine2 + '<br/>' : ''}
              ${shippingInfo.city}, ${shippingInfo.state} ${shippingInfo.postalCode}<br/>
              ${shippingInfo.country}
            </p>
          </div>

          <!-- CTA -->
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders"
               style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">
              View My Orders
            </a>
          </div>

          <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0;">
            Questions? Reply to this email or contact our support team.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #f3f4f6;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} MicroStore. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await getResend().emails.send({
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      to:      [to],
      subject: `Order Confirmed — #${orderNumber}`,
      html,
    });
    console.log(`✅ Order confirmation email sent to ${to}:`, result.data?.id ?? result);
    return result;
  } catch (error) {
    console.error('❌ Failed to send order confirmation email:', error);
    throw error;
  }
};