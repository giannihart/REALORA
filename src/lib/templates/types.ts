export type TemplateKind =
  | "listing-agreement"
  | "agency-disclosure"
  | "property-condition-disclosure"
  | "lead-paint-disclosure"
  | "dual-agency-consent"
  | "seller-loi";

export type TemplateField = {
  label: string;
  value: string;
};

export type TemplateSection = {
  heading: string;
  paragraphs: string[];
};

export type TemplateDoc = {
  kind: TemplateKind;
  version: number;
  title: string;
  subtitle?: string;
  notice?: string;
  paragraphs: string[];
  sections?: TemplateSection[];
  fields: TemplateField[];
  signers: { role: string; name: string }[];
};
