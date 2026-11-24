/**
 * The user guide. One source for the in-app Help centre (staff), the portal help
 * (clients) and docs/USER_GUIDE.md (scripts/export-guide.ts).
 *
 * Body format (kept deliberately small):
 *   blank line      new paragraph
 *   "- "            bullet
 *   "1. "           numbered step
 *   "> "            tip
 *   **bold**, `code`
 */

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  audience: "staff" | "client";
  body: string;
}

export const GUIDE: GuideSection[] = [
  // ------------------------------------------------------------------ staff
  {
    id: "getting-started",
    audience: "staff",
    title: "Getting started",
    summary: "Sign in, two-step login, and the first three things to set up.",
    body: `Analiva Automation Hub reads your clients' invoices from your inbox, keeps each client's books, and gives clients their own portal. Everything you do is recorded in the activity log.

**Signing in.** Use the one-time link you were sent to choose a password of at least 12 characters. The first time you sign in you set up two-step login: scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password) and enter the six-digit code. Each later sign-in asks for a fresh code.

**First setup**
1. **Settings, Practice and profile:** add the practice name, VAT and CIPC numbers, email and address.
2. **Settings, Email accounts:** connect the mailbox invoices arrive in. Press **Detect settings**, enter the password, then **Test connection**.
3. **Clients:** add your clients with their tax profile (VAT category, PAYE, year-end, incorporation date) so the deadline calendar fills itself.

> Press **Ctrl K** (or Cmd K on a Mac) anywhere to search or jump to a page.`,
  },
  {
    id: "records",
    audience: "staff",
    title: "Records and search",
    summary: "The CRM: every client, contact, invoice and document in live tables.",
    body: `**Records** shows four live tables: Clients, Contacts, Invoices and Documents. Each opens fully populated. Start typing and the rows narrow instantly; add filters to narrow further. Click a column heading to sort, and click any row to open it.

The search box understands more than names:
- **Amounts:** \`4500\`, \`R 4 500,00\` or \`4,500.00\` find invoices with that total, subtotal or VAT.
- **Dates:** \`2024-03-14\`, \`14/03/2024\`, \`Mar 2024\` or \`2023\` find invoices in that day, month or year.
- **Numbers:** invoice numbers, phone numbers (any format), VAT numbers and CIPC registration numbers.

The Invoices and Documents tabs load the newest records first. When you search, older matches from every year are fetched automatically.

> Press **/** to jump to the search box. The search stays in the address bar, so you can share or bookmark a filtered view.`,
  },
  {
    id: "clients",
    audience: "staff",
    title: "Clients",
    summary: "Client records, tax profiles, review settings, mandates and portal access.",
    body: `Each client has a code (CL-0001), contacts, services and a **tax profile**. The tax profile drives VAT treatment in the books and the deadline calendar:
- **VAT registered** and **VAT category** (A, B or C) set VAT201 periods. A client that isn't VAT registered has VAT included in its costs.
- **PAYE registered** adds EMP201 and EMP501.
- **Financial year end** sets provisional tax and ITR14 dates.
- **Incorporation date** sets the CIPC annual return date.

**Inbox capture** (owner only) decides how much of this client's mail skips review:
- **Always review:** every invoice waits for a person.
- **Auto-file when confident:** filed automatically at or above the confidence threshold you choose (90% by default).
- **Never review:** filed as soon as the client, total, invoice number and date are read. Suspected duplicates still wait, so the books are never double-counted.

**Email domains** on the client (for example \`mokoena.co.za\`) let inbound mail match automatically.`,
  },
  {
    id: "inbox",
    audience: "staff",
    title: "Inbox capture",
    summary: "How email attachments are read, classified and stored.",
    body: `Connected mailboxes are checked every five minutes. Use **Check inbox now** on the Review queue or Inbox page to check straight away. Emails stay unread in your mailbox.

1. The Hub stores the original email and accepted document attachments up to 20 MB each.
2. It reads text from PDFs, modern Office and OpenDocument files, and CSV or plain text. It attempts OCR on up to two supported images per email.
3. It classifies each attachment separately. Examples include purchase orders, receipts, bank statements, business plans, proposals, quotes, contracts and invoices.
4. If the rules are uncertain, an AI classifier can suggest a category when configured. Anything still unclear appears under **Documents → Needs classification**, where staff can choose a category.
5. The Hub matches the email to a client using the sender, previous assignments, client contacts and document text. Only invoice captures enter the invoice workflow.

Use the category filter in **Documents** to find stored originals. Image-only PDFs and older Office formats can be stored and may need manual classification.`,
  },
  {
    id: "review",
    audience: "staff",
    title: "Review queue",
    summary: "Confirm, correct and teach the reader.",
    body: `Items wait here when the client wasn't identified, the reading wasn't confident enough, or a check flagged something. Each item shows the original document beside the fields that were read, with a confidence and where each value was found.

1. Choose the client if it isn't set. Leave **Remember** ticked so mail from that sender goes to the same client next time.
2. Check the fields and correct anything wrong.
3. Press **Confirm and file invoice**.

**It learns.** When you correct a value, the hub finds the label printed beside it on the invoice (for example "Doc Ref" or "Amount payable") and remembers it for that supplier. The supplier's next invoice reads with high confidence and, for clients set to auto-file, files itself.

- **Dismiss** removes items that aren't invoices.
- **Re-read document** reads the stored text again with everything learned since.`,
  },
  {
    id: "invoices",
    audience: "staff",
    title: "Invoices and checks",
    summary: "Manual capture, validation, re-coding and payment reminders.",
    body: `Every invoice, whether read from email or captured by hand, goes through the same checks:
- Subtotal plus VAT equals the total, and VAT is 15% of the subtotal.
- The supplier's VAT number is a valid SA number (10 digits starting with 4).
- **Suspected duplicate:** the same number from the same supplier is already on record.
- **Unusual amount:** more than three times, or less than a third of, that supplier's average.

Flagged invoices show **Needs review**. On an invoice you can approve, reject (its journal is reversed), remove with a reason, **re-code** it to another expense account (the supplier remembers the choice), and send a **payment reminder**.

Invoices are kept for at least five years. Removing one is a soft delete: it disappears from lists and the books but stays on record.`,
  },
  {
    id: "books",
    audience: "staff",
    title: "Books and bank",
    summary: "Double-entry books that keep themselves.",
    body: `Each client gets a standard South African chart of accounts the first time their books are opened. Add accounts under **Chart of accounts**.

**Invoices post themselves.** A supplier bill debits the expense account and VAT input, and credits trade creditors. A sales invoice debits trade debtors and credits sales and VAT output. The expense account comes from the supplier's learned account, or a suggestion from the supplier's name (Vodacom goes to telephone, Engen to fuel).

**Bank statements**
1. Download a CSV statement from the bank (FNB, ABSA, Standard Bank, Nedbank, Capitec and most others work).
2. Open the client's **Books**, then **Bank**, and import it. Re-importing an overlapping period is safe; lines already imported are skipped.
3. Payments are matched to captured invoices by amount and invoice number or name, and marked paid.
4. Your coding rules code recurring lines (bank fees, fuel, salaries).
5. Code what's left: choose the account, tick VAT if it applies, and choose **Always** to create a rule.

**Undo** on any coded line reverses its journal. **Journals** shows every entry and lets you post manual journals for depreciation, accruals and opening balances. Books are never edited: corrections are reversing entries, so the audit trail stays complete.`,
  },
  {
    id: "reports",
    audience: "staff",
    title: "Reports and exports",
    summary: "Statements, ratios, VAT201, ageing and exports.",
    body: `Under a client's **Books, Reports**:
- **Income statement, balance sheet, cash flow** for any period (this or last financial year, this or last month, last 12 months, or custom dates). Figures use the same definitions as Analiva.
- **Trial balance** as at a date, and the **general ledger** for any account with a running balance.
- **VAT201** for each VAT period, with field numbers. Check it against source documents before submitting on eFiling.
- **Aged creditors and debtors** in 30-day buckets.

The overview shows financial health ratios: current and quick ratio, working capital, debt to equity, margins, cash conversion, runway, and debtor and creditor days.

**Exports:** the **Excel pack** has every statement, ratios, trial balance and the full general ledger. **Analiva ledger** is a CSV laid out for Analiva's ledger import. **Print / PDF** prints the statement on screen.`,
  },
  {
    id: "deadlines",
    audience: "staff",
    title: "Deadlines",
    summary: "SARS and CIPC dates, worked out per client.",
    body: `**Deadlines** lists every client's VAT201, EMP201, EMP501, provisional tax, ITR14 and CIPC annual return dates, grouped by month with overdue items first. Dates come from each client's tax profile.

Press **Mark filed** once a return is submitted. Clients see their deadlines in their portal, including which have been filed.

> These are the usual statutory dates. SARS sometimes moves them during filing season, so confirm on eFiling.`,
  },
  {
    id: "portal",
    audience: "staff",
    title: "Client portal and enquiries",
    summary: "What clients see, and answering their questions.",
    body: `Give a client access under **Team**: create a login with the role **Client** and choose the business. They sign in with their own password and two-step login, and only ever see their own business.

In the portal clients see their figures and charts, statements, invoices and what's outstanding, their documents (and can upload more), deadlines, and their enquiries. The owner can hide the books for a client: on the client's page, under **Acting on their behalf**, untick **Show books in the client portal**.

**Enquiries** arrive in the Enquiries inbox, oldest waiting first. Reply in the thread, or tick **Internal note** for a note the client never sees. The client is emailed when you reply, and you're emailed when they write.`,
  },
  {
    id: "sending",
    audience: "staff",
    title: "Sending on a client's behalf",
    summary: "Reminders and messages in the practice's name or the client's.",
    body: `Use **Send reminder** on an invoice, or **Email** on a client. Every send has a **Send as** switch:
- **The practice:** from your mailbox, in the practice's name.
- **The client:** in the client's name and brand colour, with replies going to the client. The footer says it was sent on their behalf by the practice.

Sending as the client needs a signed **mandate**. Record it on the client's page under **Acting on their behalf**: who signed, when, when it expires, and what it covers. Until there's a valid mandate, the client option is greyed out with the reason.

Email always leaves through the practice's mailbox. Pretending to send from the client's own address would be blocked as spam, so their address goes in the reply-to instead. Every email is logged on the client's page and in the activity log.`,
  },
  {
    id: "settings",
    audience: "staff",
    title: "Settings and team",
    summary: "Practice details, mailboxes, people and roles.",
    body: `- **Practice and profile:** practice details, and your own name.
- **Email accounts:** mailboxes for reading invoices and sending. Passwords are encrypted and never shown again. Use **Test connection** after any change.
- **Team** (owner only): create logins and copy the one-time link to send to the person.

Roles:
- **Owner:** everything, including team, email accounts, review settings, mandates and portal sharing.
- **Staff:** all client work.
- **Client** and **Client staff:** their own business in the portal.`,
  },
  {
    id: "security",
    audience: "staff",
    title: "Security and POPIA",
    summary: "How client data is kept apart and protected.",
    body: `- Everyone signs in with a password and an authenticator code.
- Every record belongs to the practice, and client records to one client. Every database query is limited to what the signed-in person may see, and client logins can never see another client.
- Original documents are stored privately and opened through links that expire after a minute.
- Mailbox passwords are encrypted.
- The **activity log** records every capture, change, download, export, email and sign-in. It can't be edited or deleted.
- Data is stored in the EU (Ireland). Record this in your POPIA register as a cross-border transfer to a jurisdiction with adequate protection.`,
  },

  // ------------------------------------------------------------------ clients
  {
    id: "portal-start",
    audience: "client",
    title: "Your portal",
    summary: "What you can do here.",
    body: `Your accountant keeps your books in this portal. Here you can:
- See your income, expenses, profit and bank balance, with charts and health measures.
- Read your income statement, balance sheet and cash flow, and print them.
- See invoices from suppliers and to customers, and what's still outstanding.
- Upload invoices and paperwork for your accountant.
- Ask your accountant questions and follow the replies.
- See your SARS and CIPC deadlines and which have been filed.

You sign in with your password and a code from your authenticator app. You only ever see your own business.`,
  },
  {
    id: "portal-figures",
    audience: "client",
    title: "Your figures",
    summary: "Reading your overview and reports.",
    body: `**Overview** shows this financial year so far. **Reports** has your income statement, balance sheet and cash flow for this year, last year, this month, last month or the last 12 months.

Figures update as your accountant processes invoices and bank statements, so recent weeks may still be filling in. If something looks wrong, open an enquiry and your accountant will check it.`,
  },
  {
    id: "portal-documents",
    audience: "client",
    title: "Sending documents",
    summary: "Uploading invoices and paperwork.",
    body: `1. Open **Documents**.
2. Choose the type (invoice, statement, payroll, tax and so on).
3. Choose the files and press **Upload**. You can upload several at once, up to 50 MB each.

You can also email invoices to your accountant as usual. They arrive here once they're processed.`,
  },
  {
    id: "portal-enquiries",
    audience: "client",
    title: "Asking your accountant",
    summary: "Enquiries and replies.",
    body: `1. Open **Enquiries** and press **New enquiry**.
2. Give it a short subject, choose what it's about, and write your message.
3. Your accountant is notified and replies in the same thread. You'll get an email when they do.

Mark an enquiry **Resolved** when you're happy, or reopen it if you need more help.`,
  },
];

export function sectionsFor(audience: "staff" | "client"): GuideSection[] {
  return GUIDE.filter((s) => s.audience === audience);
}
