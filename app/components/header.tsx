import { SafeImg } from "./SafeImage";

export default function Header() {
  return (
    <header
      role="banner"
      // Force Poppins for this component regardless of global config
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      className="bg-[#891F1A] text-white text-sm font-normal px-4 sm:px-6 lg:px-24 py-3 flex flex-nowrap justify-between items-center gap-2 sm:gap-4 md:flex"
      aria-label="Top utility header"
    >
      {/* Contact Info */}
      <address
        className="not-italic flex gap-2 sm:gap-4 items-center"
        itemScope
        itemType="https://schema.org/Organization"
        aria-label="Contact information"
      >
        <div className="flex gap-2 items-center">
          {/* Decorative icon → empty alt for screen readers */}
          <SafeImg
            src="https://img.icons8.com/?size=100&id=b7F1F6mHPgxh&format=png&color=FFFFFF"
            alt=""
            width={20}
            height={20}
            loading="lazy"
            decoding="async"
            className="hidden lg:block w-5 h-5"
            aria-hidden="true"
          />
          <a
            href="tel:+971123456789"
            className="font-normal"
            aria-label="Call us at plus nine seven one, one two three, four five six, seven eight nine"
            itemProp="telephone"
          >
            +971-123-456-789
          </a>
        </div>

        <span className="w-1 h-4 bg-white hidden sm:block" aria-hidden="true" />

        <div className="flex gap-2 items-center">
          {/* Decorative icon → empty alt for screen readers */}
          <SafeImg
            src="https://img.icons8.com/?size=100&id=eNVlnrYsecPX&format=png&color=FFFFFF"
            alt=""
            width={20}
            height={20}
            loading="lazy"
            decoding="async"
            className="hidden lg:block w-5 h-5"
            aria-hidden="true"
          />
          <a
            href="mailto:hi@printshop.com"
            className="font-normal"
            aria-label="Email us at hi at printshop dot com"
            itemProp="email"
          >
            hi@printshop.com
          </a>
        </div>
      </address>

      {/* Promo Banner */}
      <div className="flex gap-2 items-center mt-2 sm:mt-0" aria-label="Promotion">
        <small className="hidden lg:block font-light">
          Bulk order and Get Free Shipping
        </small>
        {/* Decorative icon → empty alt for SR; keep visible for sighted users */}
        <SafeImg
          src="https://img.icons8.com/?size=100&id=AqxR8HVzKNDb&format=png&color=FFFFFF"
          alt=""
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          className="w-5 h-5"
          aria-hidden="true"
        />
      </div>
    </header>
  );
}
