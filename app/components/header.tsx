import SafeImage, { SafeImg } from "./SafeImage";

export default function Header() {
  return (
    <header
      role="banner"
      /* Force Poppins for this component regardless of global config */
      style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
      className="bg-[#891F1A] text-white text-sm font-normal px-4 sm:px-6 lg:px-24 py-3 flex flex-nowrap justify-between items-center gap-2 sm:gap-4 md:flex"
    >
      {/* Contact Info */}
      <div className="flex gap-2 sm:gap-4 items-center">
        <div className="flex gap-2 items-center">
          <SafeImg
            src="https://img.icons8.com/?size=100&id=b7F1F6mHPgxh&format=png&color=FFFFFF"
            alt="Phone Icon"
            width={20}
            height={20}
            loading="lazy"
            className="hidden lg:block w-5 h-5"
          />
          {/* a (links) → Regular (400) */}
          <a
            href="tel:+971123456789"
            className="font-normal not-italic"
            aria-label="Call us at +971-123-456-789"
          >
            +971-123-456-789
          </a>
        </div>

        <div className="w-1 h-4 bg-white hidden sm:block" aria-hidden="true" />

        <div className="flex gap-2 items-center">
          <SafeImg
            src="https://img.icons8.com/?size=100&id=eNVlnrYsecPX&format=png&color=FFFFFF"
            alt="Email Icon"
            width={20}
            height={20}
            loading="lazy"
            className="hidden lg:block w-5 h-5"
          />
          {/* a (links) → Regular (400) */}
          <a
            href="mailto:hi@printshop.com"
            className="font-normal not-italic"
            aria-label="Email us at hi@printshop.com"
          >
            hi@printshop.com
          </a>
        </div>
      </div>

      {/* Promo Banner */}
      <div className="flex gap-2 items-center mt-2 sm:mt-0">
        {/* small → Light (300) */}
        <small className="hidden lg:block font-light not-italic">
          Bulk order and Get Free Shipping
        </small>
        <SafeImg
          src="https://img.icons8.com/?size=100&id=AqxR8HVzKNDb&format=png&color=FFFFFF"
          alt="Shipping Icon"
          width={20}
          height={20}
          loading="lazy"
          className="w-5 h-5"
        />
      </div>
    </header>
  );
}
