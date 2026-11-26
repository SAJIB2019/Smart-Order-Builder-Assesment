import type { PricingBreakdown } from '../domain/types/pricing'
import { formatBdt } from '../utils/formatters'

interface PricingSummaryProps {
  readonly pricing: PricingBreakdown
  readonly title?: string
}

export function PricingSummary({
  pricing,
  title = 'Pricing breakdown',
}: PricingSummaryProps) {
  const unitDiscounts = pricing.lines.flatMap((line) =>
    line.unitDiscounts.map((discount) => ({
      ...discount,
      key: `${line.cartItemId}-${discount.promotionId}`,
      totalAmount: discount.amount * line.quantity,
    })),
  )

  return (
    <div className="pricing-summary">
      <div className="section-heading compact-heading">
        <div>
          <p className="section-kicker">Live estimate</p>
          <h3>{title}</h3>
        </div>
        <span className="live-dot">Current</span>
      </div>
      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatBdt(pricing.subtotal)}</dd>
        </div>
        {unitDiscounts.map((discount) => (
          <div className="discount-row" key={discount.key}>
            <dt>{discount.name}</dt>
            <dd>−{formatBdt(discount.totalAmount)}</dd>
          </div>
        ))}
        {pricing.cartDiscountCandidates.map((discount) => (
          <div
            className={
              pricing.cartDiscount?.promotionId === discount.promotionId
                ? 'discount-row'
                : 'muted-row'
            }
            key={discount.promotionId}
          >
            <dt>
              {discount.name}
              {pricing.cartDiscount?.promotionId !== discount.promotionId
                ? ' (not selected)'
                : ''}
            </dt>
            <dd>−{formatBdt(discount.amount)}</dd>
          </div>
        ))}
        {pricing.coupon.attemptedCode ? (
          <div className="coupon-status-row">
            <dt>Coupon {pricing.coupon.attemptedCode}</dt>
            <dd>{formatCouponStatus(pricing.coupon.status)}</dd>
          </div>
        ) : null}
        <div>
          <dt>After discounts</dt>
          <dd>{formatBdt(pricing.discountedSubtotal)}</dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>{formatBdt(pricing.vat)}</dd>
        </div>
        <div className="payable-row">
          <dt>Final payable</dt>
          <dd>{formatBdt(pricing.payable)}</dd>
        </div>
      </dl>
    </div>
  )
}

function formatCouponStatus(
  status: PricingBreakdown['coupon']['status'],
): string {
  const labels: Record<PricingBreakdown['coupon']['status'], string> = {
    notAttempted: 'Not entered',
    unknownCode: 'Unknown code',
    unavailable: 'Not available',
    outsideTimeWindow: 'Outside time window',
    eligibleNotApplied: 'Eligible; larger discount used',
    applied: 'Applied',
  }
  return labels[status]
}
