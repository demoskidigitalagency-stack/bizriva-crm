import { createFileRoute } from "@tanstack/react-router";
import { ContactsTable } from "@/components/app/ContactsTable";

export const Route = createFileRoute("/crm/customers")({
  head: () => ({ meta: [{ title: "Customers · Bizriva CRM" }] }),
  component: () => (
    <ContactsTable
      title="Customers"
      description="Contacts who have bought, including repeat, VIP, at-risk and dormant customers. Same records as Contacts, filtered."
      lifecycles={["customer", "repeat_customer", "vip", "at_risk", "dormant", "reactivated"]}
    />
  ),
});
