import { footerConfig } from "@/config/landing-page.config";
import { Footer } from "./footer";

export function FooterSection() {
  return (
    <Footer
      logo={footerConfig.logo}
      brandName={footerConfig.brandName}
      socialLinks={footerConfig.socialLinks}
      mainLinks={footerConfig.mainLinks}
      legalLinks={footerConfig.legalLinks}
      copyright={footerConfig.copyright}
    />
  );
}
