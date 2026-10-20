import type { PaymentMethodKey } from "@/lib/payment-method-options";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/payment-method-options";

type PaymentMethodLogoProps = {
  id: PaymentMethodKey;
  size?: number;
  className?: string;
};

export function PaymentMethodLogo({ id, size = 44, className = "" }: PaymentMethodLogoProps) {
  const option = PAYMENT_METHOD_OPTIONS.find((m) => m.id === id);
  if (!option) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-white shadow-sm ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={option.logo}
        alt={`${option.label} logo`}
        width={size}
        height={size}
        className="w-full h-full object-contain p-1.5"
        loading="lazy"
      />
    </div>
  );
}
