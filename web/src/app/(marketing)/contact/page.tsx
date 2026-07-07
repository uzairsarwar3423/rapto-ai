import type { Metadata } from "next";
import { ContactClientPage } from "./ContactClientPage";

export const metadata: Metadata = {
  title: "Contact Our Team & Request a Demo — Rapto",
  description:
    "Get in touch with the Rapto team. Talk to sales about custom team billing, request help with integrations, submit technical support tickets, or learn more about our AI capabilities.",
};

export default function ContactPage() {
  return <ContactClientPage />;
}
