import { createFileRoute } from "@tanstack/react-router";
import { ContactsTable } from "@/components/app/ContactsTable";

export const Route = createFileRoute("/crm/contacts/")({
  head: () => ({ meta: [{ title: "Contacts · Bizriva CRM" }] }),
  component: () => (
    <ContactsTable title="Contacts" description="Everyone you've captured, one record per person across every channel." />
  ),
});
