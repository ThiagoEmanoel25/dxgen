import {
  FAQSection,
  FeaturesSection,
  FooterSection,
  HeroSection,
  HowItWorks,
  LandingLayout,
  PricingSection,
  ProblemSolutionSection,
  Testimonials,
} from "@/components/sections";

export default function LandingPage() {
  return (
    <LandingLayout>
      <HeroSection />
      <ProblemSolutionSection listVariant="simple" />
      <HowItWorks />
      <FeaturesSection />
      <Testimonials />
      <PricingSection />
      <FAQSection />
      <FooterSection />
    </LandingLayout>
  );
}
