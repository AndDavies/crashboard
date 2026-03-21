/** Placeholder site content — replace with your details. */
export const siteConfig = {
  publicName: "Andrew Davies",
  title: "Product designer & frontend engineer",
  shortBio:
    "I design and build clear, credible digital products — from discovery through shipped UI — with a focus on usability, performance, and maintainable systems.",
  email: "hello@example.com",
  location: "Remote · Available for select projects",
  social: {
    github: "https://github.com",
    linkedin: "https://linkedin.com",
  },
  brandWordmark: "Crashboard",
} as const;

export type ProjectItem = {
  title: string;
  description: string;
  stack: string[];
  href?: string;
  label?: string;
};

export const featuredProjects: ProjectItem[] = [
  {
    title: "Design systems at scale",
    description:
      "Component libraries, tokens, and documentation that help teams ship consistently without slowing down.",
    stack: ["React", "TypeScript", "Figma"],
    href: "#",
    label: "Case study",
  },
  {
    title: "Data-heavy dashboards",
    description:
      "Complex information made legible: hierarchy, tables, filtering, and performance for power users.",
    stack: ["Next.js", "Postgres", "Tailwind"],
    href: "#",
    label: "View project",
  },
  {
    title: "Auth & onboarding flows",
    description:
      "Trust-building signup, login, and recovery paths with careful states, errors, and accessibility.",
    stack: ["Supabase", "Next.js"],
    href: "#",
    label: "Details",
  },
];

export const capabilityBlocks = [
  {
    title: "Product & UX",
    body: "Problem framing, flows, and UI specs that align stakeholders and reduce rework before build.",
  },
  {
    title: "Frontend engineering",
    body: "Accessible, responsive interfaces in React/Next.js with attention to performance and design fidelity.",
  },
  {
    title: "Systems thinking",
    body: "Patterns, constraints, and documentation so products stay coherent as they grow.",
  },
  {
    title: "Collaboration",
    body: "Clear async communication, tight loops with design and backend, and pragmatic tradeoffs.",
  },
];
