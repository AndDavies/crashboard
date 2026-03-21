import { MarketingHero } from "@/components/marketing/hero";
import { AboutSection } from "@/components/marketing/about-section";
import { ProjectsSection } from "@/components/marketing/projects-section";
import { SkillsSection } from "@/components/marketing/skills-section";
import { WritingSection } from "@/components/marketing/writing-section";
import { ContactSection } from "@/components/marketing/contact-section";

export default function Home() {
  return (
    <>
      <MarketingHero />
      <AboutSection />
      <ProjectsSection />
      <SkillsSection />
      <WritingSection />
      <ContactSection />
    </>
  );
}
